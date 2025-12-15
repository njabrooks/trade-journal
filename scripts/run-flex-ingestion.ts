#!/usr/bin/env tsx
/**
 * Standalone script to run Flex ingestion
 * Can be run locally or in CI/CD (e.g., GitHub Actions)
 * 
 * Usage:
 *   tsx scripts/run-flex-ingestion.ts
 *   tsx scripts/run-flex-ingestion.ts --config-id <uuid>
 */

import { db } from '../src/db';
import { flexQueryConfigs } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { fetchFlexQuery, FlexApiError } from '../src/lib/ingestion/flex/api';
import { processPositionsCsv, processTradesCsv } from '../src/lib/ingestion/flex/processCsv';

interface IngestionResult {
  configId: string;
  queryName: string;
  queryType: string;
  success: boolean;
  error?: string;
  summary?: any;
}

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
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : JSON.stringify(error);
    
    throw new Error(`Ingestion processing failed: ${errorMessage}`);
  }
}

async function runIngestionForConfig(configId: string): Promise<IngestionResult> {
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
      error: 'Config is not active',
    };
  }

  try {
    console.log(`[${flexConfig.queryName}] Fetching Flex query...`);
    
    const result = await fetchFlexQuery({
      flexToken: flexConfig.flexToken || undefined,
      queryId: flexConfig.queryId || undefined,
      queryType: flexConfig.queryType as 'positions' | 'trades',
    });

    console.log(`[${flexConfig.queryName}] Processing CSV...`);
    
    const ingestionResult = await processFlexQuery(
      result.csv,
      flexConfig.queryType as 'positions' | 'trades',
      flexConfig.queryName
    );

    await db
      .update(flexQueryConfigs)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: 'success',
        lastRunError: null,
        updatedAt: new Date(),
      })
      .where(eq(flexQueryConfigs.id, configId));

    console.log(`[${flexConfig.queryName}] ✅ Success`);
    
    return {
      configId,
      queryName: flexConfig.queryName,
      queryType: flexConfig.queryType,
      success: true,
      summary: ingestionResult,
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    }

    console.error(`[${flexConfig.queryName}] ❌ Error:`, errorMessage);

    await db
      .update(flexQueryConfigs)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
        lastRunError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(flexQueryConfigs.id, configId));

    return {
      configId,
      queryName: flexConfig.queryName,
      queryType: flexConfig.queryType,
      success: false,
      error: errorMessage,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const configIdIndex = args.indexOf('--config-id');
  const configId = configIdIndex >= 0 ? args[configIdIndex + 1] : null;

  console.log('🚀 Starting Flex ingestion...\n');

  try {
    const results: IngestionResult[] = [];

    if (configId) {
      console.log(`Running for config: ${configId}\n`);
      const result = await runIngestionForConfig(configId);
      results.push(result);
    } else {
      console.log('Running for all active configs...\n');
      const activeConfigs = await db
        .select()
        .from(flexQueryConfigs)
        .where(eq(flexQueryConfigs.isActive, true));

      if (activeConfigs.length === 0) {
        console.log('⚠️  No active Flex query configs found.');
        process.exit(0);
      }

      console.log(`Found ${activeConfigs.length} active config(s)\n`);

      for (const config of activeConfigs) {
        const result = await runIngestionForConfig(config.id);
        results.push(result);
        console.log(''); // Empty line between runs
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log('\n📊 Summary:');
    console.log(`  Total: ${results.length}`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed: ${failureCount}\n`);

    if (failureCount > 0) {
      console.log('Failed configs:');
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.queryName}: ${r.error}`);
        });
      console.log('');
      process.exit(1);
    }

    console.log('✅ All ingestion runs completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

