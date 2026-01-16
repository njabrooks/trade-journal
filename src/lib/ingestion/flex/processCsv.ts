/**
 * Shared CSV Processing Functions
 * 
 * These functions can be called directly from automated ingestion
 * or from HTTP routes, avoiding the need for internal HTTP calls.
 */

import Papa from 'papaparse';
import { db } from '@/db';
import { positions, navSnapshots, mtmSnapshots, trades, ingestionRuns } from '@/db/schema';
import type { NewPosition, NewNavSnapshot, NewMtmSnapshot } from '@/db/schema';
import {
  FlexPositionRow,
  normalizeFlexPositionRow,
  validateFlexPositionRow,
} from '@/lib/ingestion/flex/positions';
import {
  FlexNavRow,
  normalizeFlexNavRow,
  validateFlexNavRow,
} from '@/lib/ingestion/flex/nav';
import {
  FlexMtmRow,
  normalizeFlexMtmRow,
  validateFlexMtmRow,
} from '@/lib/ingestion/flex/mtm';
import {
  FlexTradeRow,
  normalizeFlexTradeRow,
  validateFlexTradeRow,
} from '@/lib/ingestion/flex/trades';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq, ne, sql, lt, isNotNull } from 'drizzle-orm';
import { computeTriageForDate } from '@/lib/derived/triage';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computePortfolioSnapshotsForDateRange } from '@/lib/derived/portfolio';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '@/lib/derived/strategyAuto';
// REMOVED: computeTradeBlotterEntriesForDate, createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal
import { evaluateStrategySignalsForDate } from '@/lib/derived/signalEvaluation';
import { strategies } from '@/db/schema';
import { startProcess, completeProcess, failProcess } from '@/lib/services/processTracking';

const SECTION_CODES = {
  POST: 'POST',
  EQUT: 'EQUT',
  MTMP: 'MTMP',
  TRADES: 'TRNT',
  EXERCISES: 'OPTT',
  CASH: 'CTRN',
};

const SUMMARY_MARKERS = new Set(['summary', 'total', 'aggregate']);

type ErrorDetail = {
  row: number;
  errors: string[];
};

type RecordWithMeta<T> = {
  record: T;
  rowNumber: number;
};

function buildRecord<T extends Record<string, string | undefined>>(
  fieldNames: string[],
  row: string[]
): T {
  const record: Record<string, string | undefined> = {};
  fieldNames.forEach((field, idx) => {
    if (!field) return;
    const value = row[idx + 2];
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed !== '') {
      record[field] = trimmed;
    }
  });
  return record as T;
}

function extractClientAccountId(row: Record<string, string | undefined>): string | undefined {
  return (
    row['ClientAccountID'] ||
    row['Client Account ID'] ||
    row['clientAccountID']
  );
}

function isSummaryRow(row: FlexMtmRow): boolean {
  const conid =
    row['Conid'] ||
    row['conid'] ||
    row['CONID'] ||
    row['SecId'] ||
    row['secId'];
  if (conid && SUMMARY_MARKERS.has(conid.trim().toLowerCase())) {
    return true;
  }

  const levelOfDetail = row['LevelOfDetail'] || row['Level Of Detail'];
  if (levelOfDetail && SUMMARY_MARKERS.has(levelOfDetail.trim().toLowerCase())) {
    return true;
  }

  const symbol = row['Symbol'] || row['symbol'];
  if (!symbol) {
    const quantity = row['Quantity'] || row['quantity'];
    const markPrice = row['MarkPrice'] || row['markPrice'];
    const marketValue = row['MarketValue'] || row['marketValue'];
    if (!quantity && !markPrice && !marketValue) {
      return true;
    }
  }

  return false;
}

export interface ProcessPositionsResult {
  post: { inserted: number; errors: ErrorDetail[] };
  equt: { inserted: number; errors: ErrorDetail[] };
  mtmp: { inserted: number; errors: ErrorDetail[] };
  totalInserted: number;
  totalErrors: number;
  snapshotDates: string[];
  accountId: string | null;
}

/**
 * Process positions CSV (POST, EQUT, MTMP sections)
 */
export async function processPositionsCsv(csvText: string, processRunId?: string | null): Promise<ProcessPositionsResult> {
  const results = {
    post: { inserted: 0, errors: [] as ErrorDetail[] },
    equt: { inserted: 0, errors: [] as ErrorDetail[] },
    mtmp: { inserted: 0, errors: [] as ErrorDetail[] },
  };

  const allSnapshotDates = new Set<string>();
  // Track dates that actually have changes (for egress optimization)
  const datesWithChanges = new Set<string>();
  let accountId: string | null = null;

  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parsing errors: ${JSON.stringify(parsed.errors)}`);
  }

  const rows = parsed.data;

  // Process POST section
  const postHeader = rows.find(
    (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.POST
  );

  if (postHeader) {
    const fieldNames = postHeader.slice(2);
    const postDataRows: RecordWithMeta<FlexPositionRow>[] = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODES.POST)
      .map(({ row, idx }) => ({
        record: buildRecord<FlexPositionRow>(fieldNames, row),
        rowNumber: idx + 1, // Use actual CSV row index (1-based)
      }));

    if (postDataRows.length > 0) {
      const firstAccountValue = extractClientAccountId(postDataRows[0].record);
      if (firstAccountValue) {
        accountId = await resolveAccountId(firstAccountValue);

        const normalizedRows: Array<{
          data: Omit<NewPosition, 'id' | 'createdAt' | 'updatedAt'>;
          rowNumber: number;
        }> = [];
        const snapshotKeys = new Set<string>();

        for (const { record, rowNumber } of postDataRows) {
          const validation = validateFlexPositionRow(record);
          if (!validation.valid) {
            results.post.errors.push({ row: rowNumber, errors: validation.errors });
            continue;
          }

          try {
            const normalized = await normalizeFlexPositionRow(record, accountId);
            if (normalized.snapshotDate) {
              allSnapshotDates.add(normalized.snapshotDate);
              snapshotKeys.add(`${accountId}::${normalized.snapshotDate}`);
              normalizedRows.push({ data: normalized, rowNumber });
            }
          } catch (error) {
            results.post.errors.push({
              row: rowNumber,
              errors: [error instanceof Error ? error.message : 'Normalization failed'],
            });
          }
        }

        // Backfill avg_price and calculate unrealized_pnl from previous snapshots before deleting
        // This preserves values when IBKR hasn't calculated them yet (defaults to 0)
        // We use previous day's avg_price and calculate unrealized_pnl as (spot - avg_price) * quantity * multiplier
        const positionsToBackfill = normalizedRows.filter(
          (entry) => 
            !entry.data.avgPrice || entry.data.avgPrice === '0' || parseFloat(entry.data.avgPrice || '0') === 0 ||
            !entry.data.unrealizedPnl || entry.data.unrealizedPnl === '0' || parseFloat(entry.data.unrealizedPnl || '0') === 0
        );
        
        if (positionsToBackfill.length > 0) {
          console.log(`Backfilling ${positionsToBackfill.length} positions with missing/zero values`);
          
          // For each position needing backfill, find most recent previous snapshot
          for (const entry of positionsToBackfill) {
            if (!entry.data.conid && !entry.data.symbol) continue;
            
            // Find previous snapshots for this position (by conid if available, otherwise by symbol+expiry+strike)
            const whereConditions = [
              eq(positions.accountId, accountId),
              lt(positions.snapshotDate, entry.data.snapshotDate!),
            ];
            
            if (entry.data.conid) {
              whereConditions.push(eq(positions.conid, entry.data.conid));
            } else {
              whereConditions.push(eq(positions.symbol, entry.data.symbol));
              if (entry.data.expiry) {
                whereConditions.push(eq(positions.expiry, entry.data.expiry));
              }
              if (entry.data.strike) {
                whereConditions.push(eq(positions.strike, entry.data.strike));
              }
              if (entry.data.optionRight) {
                whereConditions.push(eq(positions.optionRight, entry.data.optionRight));
              }
            }
            
            const previousSnapshot = await db
              .select({
                avgPrice: positions.avgPrice,
                costBasisMoney: positions.costBasisMoney,
                unrealizedPnl: positions.unrealizedPnl,
                snapshotDate: positions.snapshotDate,
              })
              .from(positions)
              .where(and(...whereConditions))
              .orderBy(sql`${positions.snapshotDate} DESC`)
              .limit(1);
            
            if (previousSnapshot.length > 0) {
              const prev = previousSnapshot[0];
              const needsAvgPrice = !entry.data.avgPrice || entry.data.avgPrice === '0' || parseFloat(entry.data.avgPrice || '0') === 0;
              const needsCostBasisMoney = !entry.data.costBasisMoney || entry.data.costBasisMoney === '0' || parseFloat(entry.data.costBasisMoney || '0') === 0;
              const needsUnrealizedPnl = !entry.data.unrealizedPnl || entry.data.unrealizedPnl === '0' || parseFloat(entry.data.unrealizedPnl || '0') === 0;
              
              // Backfill avg_price from previous day if missing or zero
              if (needsAvgPrice && prev.avgPrice && parseFloat(prev.avgPrice) !== 0) {
                entry.data.avgPrice = prev.avgPrice;
                console.log(`Backfilled avg_price for ${entry.data.symbol}: ${prev.avgPrice} from ${prev.snapshotDate}`);
              }
              
              // Backfill cost_basis_money from previous day if missing or zero
              if (needsCostBasisMoney && prev.costBasisMoney && parseFloat(prev.costBasisMoney) !== 0) {
                entry.data.costBasisMoney = prev.costBasisMoney;
                console.log(`Backfilled cost_basis_money for ${entry.data.symbol}: ${prev.costBasisMoney} from ${prev.snapshotDate}`);
              }
              
              // Calculate unrealized_pnl if we have spot, avg_price, quantity, and multiplier
              if (needsUnrealizedPnl && entry.data.spot && entry.data.avgPrice && entry.data.quantity) {
                const spot = parseFloat(entry.data.spot);
                const avgPrice = parseFloat(entry.data.avgPrice);
                const quantity = parseFloat(entry.data.quantity);
                const multiplier = entry.data.multiplier ? parseFloat(entry.data.multiplier) : 1;
                
                if (!isNaN(spot) && !isNaN(avgPrice) && !isNaN(quantity) && !isNaN(multiplier)) {
                  const calculatedPnl = (spot - avgPrice) * quantity * multiplier;
                  entry.data.unrealizedPnl = calculatedPnl.toString();
                  console.log(`Calculated unrealized_pnl for ${entry.data.symbol}: ${calculatedPnl} = (${spot} - ${avgPrice}) * ${quantity} * ${multiplier}`);
                }
              } else if (needsUnrealizedPnl && prev.unrealizedPnl && parseFloat(prev.unrealizedPnl) !== 0) {
                // Fallback: use previous day's unrealized_pnl if we can't calculate
                entry.data.unrealizedPnl = prev.unrealizedPnl;
                console.log(`Backfilled unrealized_pnl for ${entry.data.symbol}: ${prev.unrealizedPnl} from ${prev.snapshotDate}`);
              }
            } else {
              console.log(`No previous snapshot found for ${entry.data.symbol} (conid: ${entry.data.conid})`);
            }
          }
        }

        // Delete existing positions for these snapshot dates (idempotency)
        for (const key of snapshotKeys) {
          const [acc, snapshotDate] = key.split('::');
          if (!snapshotDate) continue;
          await db
            .delete(positions)
            .where(and(eq(positions.accountId, acc), eq(positions.snapshotDate, snapshotDate)));
        }

        // Insert positions and track which dates have changes
        for (const { data, rowNumber } of normalizedRows) {
          try {
            await db.insert(positions).values(data);
            results.post.inserted++;
            // Mark this date as having changes (for egress optimization)
            if (data.snapshotDate) {
              datesWithChanges.add(data.snapshotDate);
            }
          } catch (error) {
            results.post.errors.push({
              row: rowNumber,
              errors: [error instanceof Error ? error.message : 'Insert failed'],
            });
          }
        }
      }
    }
  }

  // Process EQUT section
  const equtHeader = rows.find(
    (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.EQUT
  );

  if (equtHeader) {
    const fieldNames = equtHeader.slice(2);
    const equtDataRows: RecordWithMeta<FlexNavRow>[] = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODES.EQUT)
      .map(({ row, idx }) => ({
        record: buildRecord<FlexNavRow>(fieldNames, row),
        rowNumber: idx + 1, // Use actual CSV row index (1-based)
      }));

    if (equtDataRows.length > 0) {
      const firstAccountValue = extractClientAccountId(equtDataRows[0].record);
      if (firstAccountValue) {
        if (!accountId) {
          accountId = await resolveAccountId(firstAccountValue);
        }

        const normalizedRows: Array<{
          data: Omit<NewNavSnapshot, 'id' | 'createdAt'>;
          rowNumber: number;
        }> = [];

        for (const { record, rowNumber } of equtDataRows) {
          const validation = validateFlexNavRow(record);
          if (!validation.valid) {
            results.equt.errors.push({ row: rowNumber, errors: validation.errors });
            continue;
          }

          try {
            const normalized = normalizeFlexNavRow(record, accountId);
            const dateStr = normalized.reportDate;
            if (dateStr) {
              allSnapshotDates.add(dateStr);
              normalizedRows.push({ data: normalized, rowNumber });
            }
          } catch (error) {
            results.equt.errors.push({
              row: rowNumber,
              errors: [error instanceof Error ? error.message : 'Normalization failed'],
            });
          }
        }

        // Delete existing snapshots and insert new ones
        for (const { data, rowNumber } of normalizedRows) {
          try {
            await db
              .delete(navSnapshots)
              .where(
                and(
                  eq(navSnapshots.accountId, data.accountId),
                  eq(navSnapshots.reportDate, data.reportDate)
                )
              );
            await db.insert(navSnapshots).values(data);
            results.equt.inserted++;
          } catch (error) {
            results.equt.errors.push({
              row: rowNumber,
              errors: [error instanceof Error ? error.message : 'Insert failed'],
            });
          }
        }
      }
    }
  }

  // Process MTMP section
  const mtmpHeader = rows.find(
    (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.MTMP
  );

  if (mtmpHeader) {
    const fieldNames = mtmpHeader.slice(2);
    const mtmpDataRows: RecordWithMeta<FlexMtmRow>[] = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODES.MTMP)
      .map(({ row, idx }) => ({
        record: buildRecord<FlexMtmRow>(fieldNames, row),
        rowNumber: idx + 1, // Use actual CSV row index (1-based)
      }))
      .filter(({ record }) => !isSummaryRow(record));

    if (mtmpDataRows.length > 0) {
      const firstAccountValue = extractClientAccountId(mtmpDataRows[0].record);
      if (firstAccountValue) {
        if (!accountId) {
          accountId = await resolveAccountId(firstAccountValue);
        }

        const normalizedRows: Array<{
          data: Omit<NewMtmSnapshot, 'id' | 'createdAt'>;
          rowNumber: number;
        }> = [];

        for (const { record, rowNumber } of mtmpDataRows) {
          const validation = validateFlexMtmRow(record);
          if (!validation.valid) {
            results.mtmp.errors.push({ row: rowNumber, errors: validation.errors });
            continue;
          }

          try {
            const normalized = await normalizeFlexMtmRow(record, accountId);
            if (normalized.snapshotDate) {
              allSnapshotDates.add(normalized.snapshotDate);
              normalizedRows.push({ data: normalized, rowNumber });
            }
          } catch (error) {
            results.mtmp.errors.push({
              row: rowNumber,
              errors: [error instanceof Error ? error.message : 'Normalization failed'],
            });
          }
        }

        // Insert MTM snapshots (only count actual inserts, not conflicts)
        for (const { data } of normalizedRows) {
          try {
            const insertResult = await db
              .insert(mtmSnapshots)
              .values(data)
              .onConflictDoNothing()
              .returning({ id: mtmSnapshots.id });

            // Only count as inserted if actually inserted (not a conflict)
            if (insertResult.length > 0) {
              results.mtmp.inserted++;
              // Mark this date as having changes
              if (data.snapshotDate) {
                datesWithChanges.add(data.snapshotDate);
              }
            }
          } catch (error) {
            // Ignore duplicate errors
          }
        }
      }
    }
  }

  // Trigger recompute only for dates with actual changes (egress optimization)
  // This prevents unnecessary recomputation when IBKR returns stale/identical data
  if (accountId && datesWithChanges.size > 0) {
    const snapshotDates = Array.from(datesWithChanges).sort();
    console.log(`[Egress Optimization] Recomputing for ${snapshotDates.length} date(s) with changes: ${snapshotDates.join(', ')}`);
    if (allSnapshotDates.size > datesWithChanges.size) {
      const skippedDates = Array.from(allSnapshotDates).filter(d => !datesWithChanges.has(d));
      console.log(`[Egress Optimization] Skipping recompute for ${skippedDates.length} date(s) with no changes: ${skippedDates.join(', ')}`);
    }
    const minDate = snapshotDates[0];
    const maxDate = snapshotDates[snapshotDates.length - 1];

    try {
      // Auto-link positions to strategies (creates strategies if needed)
      const autoLinkResult = await autoLinkPositionsToStrategies(accountId, {
        startDate: minDate,
        endDate: maxDate,
      });

      // Compute portfolio snapshots
      await computePortfolioSnapshotsForDateRange(accountId, minDate, maxDate);

      // Get all strategies for this account (including newly created ones)
      // Exclude merged strategies - they're no longer active
      const accountStrategies = await db
        .select({ id: strategies.id })
        .from(strategies)
        .where(
          and(
            eq(strategies.accountId, accountId),
            ne(strategies.status, 'merged')
          )
        );

      // Compute strategy metrics for all strategies
      for (const strategy of accountStrategies) {
        await computeStrategyMetricsForDateRange(accountId, strategy.id, minDate, maxDate);
      }

      // If strategies were created or positions were linked, also link trades
      if (autoLinkResult.strategiesCreated > 0 || autoLinkResult.positionsLinked > 0) {
        try {
          await autoLinkTradesToStrategies(accountId, {
            startDate: minDate,
            endDate: maxDate,
          });
        } catch (error) {
          console.error(`Failed to link trades after positions ingestion:`, error);
        }
      }

      // Compute triage for each snapshot date
      for (const date of snapshotDates) {
        try {
          await computeTriageForDate(date, accountId);

          // REMOVED: computeTradeBlotterEntriesForDate - blotter system deprecated, replaced by journal
          // REMOVED: createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal

          // Evaluate strategy signals (DTE, sigma, PnL% conditions)
          try {
            await evaluateStrategySignalsForDate(accountId, date);
          } catch (error) {
            console.error(`Failed to evaluate strategy signals for ${accountId} on ${date}:`, error);
          }
        } catch (error) {
          console.error(`Failed to compute triage for ${date}:`, error);
        }
      }
    } catch (error) {
      console.error('Recompute error:', error);
      // Don't fail the upload if recompute fails
    }
  } else if (accountId && allSnapshotDates.size > 0) {
    // Data was processed but no actual changes detected
    console.log(`[Egress Optimization] No changes detected for ${allSnapshotDates.size} date(s), skipping recompute`);
  }

  const totalInserted = results.post.inserted + results.equt.inserted + results.mtmp.inserted;
  const totalErrors =
    results.post.errors.length + results.equt.errors.length + results.mtmp.errors.length;

  return {
    ...results,
    totalInserted,
    totalErrors,
    snapshotDates: Array.from(allSnapshotDates),
    accountId,
  };
}

export interface ProcessTradesResult {
  inserted: number;
  skipped: number;
  validationErrors: number;
  normalizationErrors: number;
  insertErrors: number;
  tradeDates: string[];
  accountIds: string[];
}

/**
 * Process trades CSV (TRNT section)
 */
export async function processTradesCsv(csvText: string, processRunId?: string | null): Promise<ProcessTradesResult> {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parsing errors: ${JSON.stringify(parsed.errors)}`);
  }

  const rows = parsed.data;
  const trntHeader = rows.find(
    (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.TRADES
  );

  if (!trntHeader) {
    throw new Error('TRNT header not found in file');
  }

  const fieldNames = trntHeader.slice(2);
  const trntDataRows = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODES.TRADES);

  const accountCache = new Map<string, string>();
  const tradeDates = new Set<string>();
  const accountIds = new Set<string>();

  let inserted = 0;
  let skipped = 0;
  let validationErrors = 0;
  let normalizationErrors = 0;
  let insertErrors = 0;
  let primaryAccountId: string | undefined;

  for (const { row: dataRow, idx } of trntDataRows) {
    const rowNumber = idx + 1; // Use actual CSV row index (1-based)
    const record = buildRecord<FlexTradeRow>(fieldNames, dataRow);

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
      accountIds.add(accountId);
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
      
      // Track trade date for recompute
      if (normalized.tradeDate) {
        // tradeDate is already a Date object, convert to YYYY-MM-DD string
        const tradeDateStr = normalized.tradeDate instanceof Date
          ? normalized.tradeDate.toISOString().split('T')[0]
          : String(normalized.tradeDate).split('T')[0];
        tradeDates.add(tradeDateStr);
      }
    } catch (error) {
      insertErrors++;
    }
  }

  // Run recompute operations if we have trades
  if (tradeDates.size > 0 && inserted > 0 && accountIds.size > 0) {
    for (const accountId of Array.from(accountIds)) {
      for (const tradeDate of Array.from(tradeDates)) {
        try {
          // Auto-link trades to strategies
          await autoLinkTradesToStrategies(accountId, { snapshotDate: tradeDate });
          
          // Strategy metrics
          const accountStrategies = await db
            .select({ id: strategies.id })
            .from(strategies)
            .where(
              and(
                eq(strategies.accountId, accountId),
                ne(strategies.status, 'merged')
              )
            );

          for (const strategy of accountStrategies) {
            await computeStrategyMetricsForDateRange(
              accountId,
              strategy.id,
              tradeDate,
              tradeDate
            );
          }

          // REMOVED: computeTradeBlotterEntriesForDate - blotter system deprecated, replaced by journal

          // Triage
          await computeTriageForDate(tradeDate, accountId);

          // REMOVED: createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal

          // Evaluate strategy signals (DTE, sigma, PnL% conditions)
          try {
            await evaluateStrategySignalsForDate(accountId, tradeDate);
          } catch (error) {
            console.error(`Failed to evaluate strategy signals for ${accountId} on ${tradeDate}:`, error);
          }
        } catch (error) {
          console.error(`Failed to auto-recompute after trades ingestion for ${accountId} on ${tradeDate}:`, error);
        }
      }
    }
  }

  return {
    inserted,
    skipped,
    validationErrors,
    normalizationErrors,
    insertErrors,
    tradeDates: Array.from(tradeDates),
    accountIds: Array.from(accountIds),
  };
}

