/**
 * Automated Flex Ingestion API
 * 
 * Fetches Flex query results from IBKR Flex Web Service API and processes them
 * through existing ingestion routes. Can be called by cron jobs or Edge functions.
 * 
 * Usage:
 * - POST /api/ingest/flex/automated?configId={uuid} - Run specific config
 * - POST /api/ingest/flex/automated?all=true - Run all active configs
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { flexQueryConfigs } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { fetchFlexQuery, FlexApiError } from '@/lib/ingestion/flex/api';
import { startProcess, completeProcess, failProcess } from '@/lib/services/processTracking';
import { processPositionsCsv, processTradesCsv } from '@/lib/ingestion/flex/processCsv';
import {
  classifyFlexFailure,
  getDailyFlexPositionCoverage,
  type FlexFailureDisposition,
} from '@/lib/ingestion/flex/dailyHealth';

interface IngestionResult {
  configId: string;
  queryName: string;
  queryType: string;
  success: boolean;
  disposition?: FlexFailureDisposition | 'success';
  error?: string;
  summary?: any;
}

/**
 * Processes a Flex query result directly using shared ingestion functions
 * This avoids HTTP calls and provides better error handling
 */
async function processFlexQuery(
  csv: string,
  queryType: 'positions' | 'trades',
  queryName: string
): Promise<any> {
  try {
    if (queryType === 'positions') {
      const result = await processPositionsCsv(csv);
      return {
        success: result.totalErrors === 0,
        summary: {
          post: {
            inserted: result.post.inserted,
            errors: result.post.errors.length,
          },
          equt: {
            inserted: result.equt.inserted,
            errors: result.equt.errors.length,
          },
          mtmp: {
            inserted: result.mtmp.inserted,
            errors: result.mtmp.errors.length,
          },
          totalInserted: result.totalInserted,
          totalErrors: result.totalErrors,
        },
        errors: {
          post: result.post.errors,
          equt: result.equt.errors,
          mtmp: result.mtmp.errors,
        },
      };
    } else {
      const result = await processTradesCsv(csv);
      return {
        success: true,
        summary: {
          inserted: result.inserted,
          skipped: result.skipped,
          validationErrors: result.validationErrors,
          normalizationErrors: result.normalizationErrors,
          insertErrors: result.insertErrors,
        },
      };
    }
  } catch (error) {
    // Preserve full error details
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : JSON.stringify(error);
    
    const fullError = error instanceof Error 
      ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
      : errorMessage;
    
    console.error('processFlexQuery error:', {
      queryType,
      queryName,
      error: fullError,
    });
    
    throw new Error(`Ingestion processing failed: ${errorMessage}`);
  }
}

/**
 * Runs automated ingestion for a specific Flex query config
 */
async function runIngestionForConfig(
  configId: string,
  dailyPositionCoverage: Set<string>,
): Promise<IngestionResult> {
  // Fetch config from database
  const config = await db
    .select()
    .from(flexQueryConfigs)
    .where(eq(flexQueryConfigs.id, configId))
    .limit(1);

  if (config.length === 0) {
    throw new Error(`Flex query config not found: ${configId}`);
  }

  const flexConfig = config[0];

  if (!flexConfig.isActive) {
    return {
      configId,
      queryName: flexConfig.queryName,
      queryType: flexConfig.queryType,
      success: false,
      disposition: 'failed',
      error: 'Config is not active',
    };
  }

  try {
    // Fetch Flex query result from IBKR
    // Use config values if provided, otherwise will fall back to env vars
    const result = await fetchFlexQuery({
      flexToken: flexConfig.flexToken || undefined, // Empty string becomes undefined to use env var
      queryId: flexConfig.queryId || undefined,
      queryType: flexConfig.queryType as 'positions' | 'trades',
    });

    // Process through ingestion endpoint
    const ingestionResult = await processFlexQuery(
      result.csv,
      flexConfig.queryType as 'positions' | 'trades',
      flexConfig.queryName
    );

    if (!ingestionResult.success) {
      throw new Error(`Flex ${flexConfig.queryType} processing reported errors: ${JSON.stringify(ingestionResult.summary)}`);
    }

    // Update config with success status
    await db
      .update(flexQueryConfigs)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: 'success',
        lastRunError: null,
        updatedAt: new Date(),
      })
      .where(eq(flexQueryConfigs.id, configId));

    if (flexConfig.queryType === 'positions') {
      dailyPositionCoverage.add(flexConfig.accountId);
    }

    return {
      configId,
      queryName: flexConfig.queryName,
      queryType: flexConfig.queryType,
      success: true,
      disposition: 'success',
      summary: ingestionResult,
    };
  } catch (error) {
    // Better error handling - preserve full error details
    let errorMessage = 'Unknown error';
    let errorDetails: any = null;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
      errorDetails = error;
    }

    // Log full error for debugging
    console.error('Flex ingestion error:', {
      configId,
      queryName: flexConfig.queryName,
      error: errorMessage,
      details: errorDetails,
    });

    const dailyPositionCaptured = dailyPositionCoverage.has(flexConfig.accountId);
    const disposition = classifyFlexFailure(errorMessage, dailyPositionCaptured);

    // Preserve expected polling outcomes separately from actionable failures.
    await db
      .update(flexQueryConfigs)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: disposition,
        lastRunError: disposition === 'expected' ? `Expected: ${errorMessage}` : errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(flexQueryConfigs.id, configId));

    return {
      configId,
      queryName: flexConfig.queryName,
      queryType: flexConfig.queryType,
      success: disposition === 'expected',
      disposition,
      error: errorMessage,
    };
  }
}

export async function POST(request: NextRequest) {
  let processRunId: string | null = null;

  try {
    // Optional: Check for cron secret if configured
    // This prevents unauthorized access while allowing cron jobs
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      const providedSecret = authHeader?.replace('Bearer ', '');
      
      if (providedSecret !== cronSecret) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get('configId');
    const all = searchParams.get('all') === 'true';

    // Start process tracking
    processRunId = await startProcess('flex_automated_ingestion', 'scheduled', {
      configId: configId || null,
      all: all || false,
    });

    const results: IngestionResult[] = [];

    let positionConfigAccountIds: string[] = [];
    if (all) {
      const activePositionConfigs = await db
        .select({ accountId: flexQueryConfigs.accountId })
        .from(flexQueryConfigs)
        .where(
          and(
            eq(flexQueryConfigs.isActive, true),
            eq(flexQueryConfigs.queryType, 'positions'),
          ),
        );
      positionConfigAccountIds = activePositionConfigs.map((config) => config.accountId);
    } else if (configId) {
      const selectedConfig = await db
        .select({ accountId: flexQueryConfigs.accountId })
        .from(flexQueryConfigs)
        .where(eq(flexQueryConfigs.id, configId))
        .limit(1);
      positionConfigAccountIds = selectedConfig.map((config) => config.accountId);
    }
    const dailyPositionCoverage = await getDailyFlexPositionCoverage(db, positionConfigAccountIds);

    if (all) {
      // Run all active configs
      const activeConfigs = await db
        .select()
        .from(flexQueryConfigs)
        .where(eq(flexQueryConfigs.isActive, true));

      // Capture positions before trades so a same-cycle position success also
      // makes subsequent trade-query polling failures non-actionable.
      const orderedConfigs = [...activeConfigs].sort((a, b) => {
        if (a.queryType === b.queryType) return 0;
        return a.queryType === 'positions' ? -1 : 1;
      });

      for (const config of orderedConfigs) {
        const result = await runIngestionForConfig(config.id, dailyPositionCoverage);
        results.push(result);
      }
    } else if (configId) {
      // Run specific config
      const result = await runIngestionForConfig(configId, dailyPositionCoverage);
      results.push(result);
    } else {
      return NextResponse.json(
        { error: 'Either configId or all=true parameter is required' },
        { status: 400 }
      );
    }

    const successCount = results.filter((r) => r.disposition === 'success').length;
    const expectedCount = results.filter((r) => r.disposition === 'expected').length;
    const failureCount = results.filter((r) => r.disposition === 'failed').length;

    // Complete process tracking
    if (processRunId) {
      await completeProcess(processRunId, {
        success: failureCount === 0,
        summary: {
          total: results.length,
          success: successCount,
          expected: expectedCount,
          failures: failureCount,
          results,
        },
      });
    }

    return NextResponse.json({
      success: failureCount === 0,
      summary: {
        total: results.length,
        success: successCount,
        expected: expectedCount,
        failures: failureCount,
      },
      results,
    });
  } catch (error) {
    console.error('Automated Flex ingestion error:', error);

    if (processRunId) {
      await failProcess(
        processRunId,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processRunId,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to list available Flex query configs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let query = db.select().from(flexQueryConfigs);

    if (activeOnly) {
      query = query.where(eq(flexQueryConfigs.isActive, true)) as any;
    }

    const configs = await query;

    return NextResponse.json({
      configs: configs.map((config) => ({
        id: config.id,
        accountId: config.accountId,
        queryName: config.queryName,
        queryType: config.queryType,
        isActive: config.isActive,
        scheduleCron: config.scheduleCron,
        lastRunAt: config.lastRunAt,
        lastRunStatus: config.lastRunStatus,
        lastRunError: config.lastRunError,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
