import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { trades, strategies, ingestionRuns } from '@/db/schema';
import { normalizeFlexTradeRow, validateFlexTradeRow, FlexTradeRow } from '@/lib/ingestion/flex/trades';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq, ne } from 'drizzle-orm';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
// REMOVED: computeTradeBlotterEntriesForDate, createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal
import { autoLinkTradesToStrategies } from '@/lib/derived/strategyAuto';
import { startProcess, completeProcess, failProcess } from '@/lib/services/processTracking';

const SECTION_CODES = {
  TRADES: 'TRNT',
  EXERCISES: 'OPTT',
  CASH: 'CTRN',
};

function buildRecord(fieldNames: string[], row: string[]): FlexTradeRow {
  const record: FlexTradeRow = {};
  fieldNames.forEach((field, idx) => {
    const key = field?.trim();
    if (!key) return;
    const value = row[idx + 2];
    if (value !== undefined) {
      record[key] = value.trim();
    }
  });
  return record;
}

export async function POST(request: NextRequest) {
  // Start tracking immediately - before any processing
  let processRunId: string | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    // Start process tracking immediately (before file processing)
    processRunId = await startProcess('trade_ingestion', 'api', {
      fileName: file?.name,
      fileSize: file?.size,
    });

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvText = await file.text();
    const parsed = Papa.parse<string[]>(csvText, {
      header: false,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: 'CSV parsing errors', details: parsed.errors },
        { status: 400 }
      );
    }

    const rows = parsed.data;
    const trntHeader = rows.find(
      (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.TRADES
    );

    if (!trntHeader) {
      return NextResponse.json(
        { error: 'TRNT header not found in file' },
        { status: 400 }
      );
    }

    const fieldNames = trntHeader.slice(2);
    const trntDataRows = rows.filter(
      (row) => row[0] === 'DATA' && row[1] === SECTION_CODES.TRADES
    );
    const opttRows = rows.filter(
      (row) => row[0] === 'DATA' && row[1] === SECTION_CODES.EXERCISES
    );
    const ctrnRows = rows.filter(
      (row) => row[0] === 'DATA' && row[1] === SECTION_CODES.CASH
    );

    const accountCache = new Map<string, string>();
    const tradeDates = new Set<string>(); // Track unique trade dates for recompute

    let inserted = 0;
    let skipped = 0;
    let validationErrors = 0;
    let normalizationErrors = 0;
    let insertErrors = 0;
    let primaryAccountId: string | undefined;

    for (let i = 0; i < trntDataRows.length; i++) {
      const dataRow = trntDataRows[i];
      const record = buildRecord(fieldNames, dataRow);

      const validation = validateFlexTradeRow(record);
      if (!validation.valid) {
        validationErrors++;
        continue;
      }

      const clientAccountId =
        record['ClientAccountID'] ||
        record['Client Account ID'] ||
        record['clientAccountID'];

      if (!clientAccountId) {
        validationErrors++;
        continue;
      }

      let accountId: string;
      try {
        accountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
        if (!primaryAccountId) {
          primaryAccountId = accountId;
        }
      } catch (error) {
        validationErrors++;
        continue;
      }

      let normalized;
      try {
        normalized = normalizeFlexTradeRow(record, accountId);
      } catch (error) {
        normalizationErrors++;
        continue;
      }

      try {
        if (normalized.brokerTransactionId) {
          const existing = await db
            .select({ id: trades.id })
            .from(trades)
            .where(eq(trades.brokerTransactionId, normalized.brokerTransactionId))
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await db
          .insert(trades)
          .values(normalized)
          .onConflictDoNothing({ target: trades.brokerTransactionId });
        inserted++;
        
        // Track trade date for recompute (use trade date as snapshot date)
        if (normalized.tradeDate) {
          const tradeDateStr = new Date(normalized.tradeDate).toISOString().split('T')[0];
          tradeDates.add(tradeDateStr);
        }
      } catch (error) {
        insertErrors++;
      }
    }

    // Update process tracking with account info
    if (processRunId && primaryAccountId) {
      await db
        .update(ingestionRuns)
        .set({
          accountId: primaryAccountId,
          payload: {
            accountId: primaryAccountId,
            tradeDates: Array.from(tradeDates),
            inserted,
            skipped,
            validationErrors,
            normalizationErrors,
            insertErrors,
          },
        })
        .where(eq(ingestionRuns.id, processRunId));
    }

    // Run recompute operations if we have trades
    const recomputeResults: any = {};
    const uniqueAccountIds = Array.from(accountCache.values());
    
    if (tradeDates.size > 0 && inserted > 0 && uniqueAccountIds.length > 0) {
      for (const accountId of uniqueAccountIds) {
        for (const tradeDate of Array.from(tradeDates)) {
          try {
            // Auto-link trades to strategies (creates strategies if needed)
            const autoLinkResult = await autoLinkTradesToStrategies(accountId, { snapshotDate: tradeDate });
            
            // Strategy metrics (for all strategies in account, including newly created ones)
            // Exclude merged/rejected strategies - they're no longer active
            const accountStrategies = await db
              .select({ id: strategies.id })
              .from(strategies)
              .where(
                and(
                  eq(strategies.accountId, accountId),
                  ne(strategies.status, 'rejected'),
                  ne(strategies.status, 'merged')
                )
              );
            
            let strategyMetricsCount = 0;
            for (const strategy of accountStrategies) {
              const count = await computeStrategyMetricsForDateRange(
                accountId,
                strategy.id,
                tradeDate,
                tradeDate
              );
              strategyMetricsCount += count;
            }
            
            // REMOVED: computeTradeBlotterEntriesForDate - blotter system deprecated, replaced by journal
            // REMOVED: createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal

            recomputeResults[`${accountId}_${tradeDate}`] = {
              autoStrategies: {
                strategiesCreated: autoLinkResult.strategiesCreated,
                tradesLinked: autoLinkResult.tradesLinked,
              },
              strategyMetrics: strategyMetricsCount,
              success: true,
            };
          } catch (error) {
            console.error(`Failed to auto-recompute after trades ingestion for ${accountId} on ${tradeDate}:`, error);
            recomputeResults[`${accountId}_${tradeDate}`] = {
              error: error instanceof Error ? error.message : 'Recompute failed',
            };
          }
        }
      }
    }

    // Complete process tracking
    if (processRunId) {
      await completeProcess(processRunId, {
        success: true,
        summary: {
          trntRows: trntDataRows.length,
          opttRows: opttRows.length,
          ctrnRows: ctrnRows.length,
          inserted,
          skipped,
          validationErrors,
          normalizationErrors,
          insertErrors,
        },
        autoRecompute: Object.keys(recomputeResults).length > 0 ? recomputeResults : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      processRunId,
      summary: {
        trntRows: trntDataRows.length,
        opttRows: opttRows.length,
        ctrnRows: ctrnRows.length,
        inserted,
        skipped,
        validationErrors,
        normalizationErrors,
        insertErrors,
      },
      autoRecompute: Object.keys(recomputeResults).length > 0 ? recomputeResults : undefined,
    });
  } catch (error) {
    console.error('Flex trades ingestion error:', error);
    
    // Mark process as failed if tracking was started
    if (processRunId) {
      await failProcess(
        processRunId,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        processRunId,
      },
      { status: 500 }
    );
  }
}
