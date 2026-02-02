import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { positions } from '@/db/schema';
import type { NewPosition } from '@/db/schema';
import {
  FlexPositionRow,
  normalizeFlexPositionRow,
  validateFlexPositionRow,
} from '@/lib/ingestion/flex/positions';
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq, ne, sql, lt, isNotNull } from 'drizzle-orm';
import { computeTriageForDate } from '@/lib/derived/triage';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computePortfolioSnapshotsForDateRange } from '@/lib/derived/portfolio';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '@/lib/derived/strategyAuto';
// REMOVED: computeTradeBlotterEntriesForDate, createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal
import { strategies } from '@/db/schema';
import { recomputeStrategyStatus } from '@/lib/services/strategies';

const SECTION_CODE = 'POST';

type ErrorDetail = {
  row: number;
  errors: string[];
};

type RecordWithMeta = {
  record: FlexPositionRow;
  rowNumber: number;
};

function buildRecord(fieldNames: string[], row: string[]): FlexPositionRow {
  const record: FlexPositionRow = {};
  fieldNames.forEach((field, idx) => {
    if (!field) return;
    const value = row[idx + 2];
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed !== '') {
      record[field] = trimmed;
    }
  });
  return record;
}

function extractClientAccountId(row: FlexPositionRow): string | undefined {
  return (
    row['ClientAccountID'] ||
    row['Client Account ID'] ||
    row['clientAccountID']
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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
    const headerRow = rows.find(
      (row) => row[0] === 'HEADER' && row[1] === SECTION_CODE
    );

    if (!headerRow) {
      return NextResponse.json(
        { error: 'POST header not found in file' },
        { status: 400 }
      );
    }

    const fieldNames = headerRow.slice(2);
    const dataRows: RecordWithMeta[] = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODE)
      .map(({ row }, dataIdx) => ({
        record: buildRecord(fieldNames, row),
        rowNumber: dataIdx + 1,
      }));

    if (dataRows.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          totalRows: 0,
          validRows: 0,
          inserted: 0,
          deletedSnapshots: 0,
          validationErrors: 0,
          normalizationErrors: 0,
          insertErrors: 0,
        },
      });
    }

    const firstAccountValue = extractClientAccountId(dataRows[0].record);
    if (!firstAccountValue) {
      return NextResponse.json(
        { error: 'ClientAccountID missing in first POST row' },
        { status: 400 }
      );
    }

    const accountId = await resolveAccountId(firstAccountValue);

    const validationErrors: ErrorDetail[] = [];
    const normalizationErrors: ErrorDetail[] = [];
    const insertErrors: ErrorDetail[] = [];

    const normalizedRows: Array<{ data: Omit<NewPosition, 'id' | 'createdAt' | 'updatedAt'>; rowNumber: number }> = [];
    const snapshotKeys = new Set<string>();

    for (const { record, rowNumber } of dataRows) {
      const validation = validateFlexPositionRow(record);
      if (!validation.valid) {
        validationErrors.push({ row: rowNumber, errors: validation.errors });
        continue;
      }

      const rowAccountId = extractClientAccountId(record);
      if (rowAccountId && rowAccountId !== firstAccountValue) {
        validationErrors.push({
          row: rowNumber,
          errors: ['Multiple ClientAccountID values in one upload are not supported'],
        });
        continue;
      }

      try {
        const normalized = await normalizeFlexPositionRow(record, accountId);
        if (!normalized.snapshotDate) {
          normalizationErrors.push({ row: rowNumber, errors: ['Snapshot date missing'] });
          continue;
        }
        snapshotKeys.add(`${normalized.accountId}::${normalized.snapshotDate}`);
        normalizedRows.push({ data: normalized, rowNumber });
      } catch (error) {
        normalizationErrors.push({
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

    let deletedSnapshots = 0;
    for (const key of snapshotKeys) {
      const [acc, snapshotDate] = key.split('::');
      if (!snapshotDate) continue;
      await db
        .delete(positions)
        .where(and(eq(positions.accountId, acc), eq(positions.snapshotDate, snapshotDate)));
      deletedSnapshots++;
    }

    let inserted = 0;
    for (const entry of normalizedRows) {
      try {
        await db.insert(positions).values(entry.data);
        inserted++;
      } catch (error) {
        insertErrors.push({
          row: entry.rowNumber,
          errors: [error instanceof Error ? error.message : 'Insert failed'],
        });
      }
    }

    // Auto-trigger recompute for all affected snapshot dates
    const recomputeResults: any = {};
    const uniqueSnapshotDates = Array.from(snapshotKeys)
      .map((key) => {
        const parts = key.split('::');
        return parts.length === 2 ? parts[1] : null;
      })
      .filter(Boolean) as string[];
    
    if (uniqueSnapshotDates.length > 0 && inserted > 0) {
      // Get unique snapshot dates
      const snapshotDates = Array.from(new Set(uniqueSnapshotDates));
      
      for (const snapshotDate of snapshotDates) {
        if (!snapshotDate) continue;
        
        try {
          // Auto-link positions to strategies (creates strategies if needed)
          const autoLinkResult = await autoLinkPositionsToStrategies(accountId, { snapshotDate });
          
          // Portfolio snapshots
          await computePortfolioSnapshotsForDateRange(
            accountId,
            snapshotDate,
            snapshotDate,
            false, // includeUnderlyings
            false // onlyLatestForUnderlyings
          );
          
          // Strategy metrics (for all strategies in account, including newly created ones)
          // Exclude merged/rejected strategies - they're no longer active
          const accountStrategies = await db
            .select({ id: strategies.id, status: strategies.status })
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
              snapshotDate,
              snapshotDate
            );
            strategyMetricsCount += count;
          }

          // Recompute strategy statuses (detects active→complete transitions)
          for (const strategy of accountStrategies) {
            const newStatus = await recomputeStrategyStatus(strategy.id);
            if (newStatus !== strategy.status) {
              await db
                .update(strategies)
                .set({ status: newStatus, updatedAt: new Date() })
                .where(eq(strategies.id, strategy.id));
            }
          }

          // Triage
          await computeTriageForDate(snapshotDate, accountId);
          
          // If strategies were created or positions were linked, also link trades and create trade blotter entries
          // This ensures that when positions are ingested first, trades get linked and QUANTITY_CHANGE records are created
          if (autoLinkResult.strategiesCreated > 0 || autoLinkResult.positionsLinked > 0) {
            try {
              // Link any unlinked trades to strategies (may create more strategies)
              const tradeLinkResult = await autoLinkTradesToStrategies(accountId, { snapshotDate });
              
              // REMOVED: computeTradeBlotterEntriesForDate - blotter system deprecated, replaced by journal
              // REMOVED: createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal
            } catch (error) {
              console.error(`Failed to link trades and create blotter entries for ${accountId} on ${snapshotDate}:`, error);
              // Don't fail ingestion if trade linking fails
            }
          }
          
          recomputeResults[snapshotDate] = {
            autoStrategies: {
              strategiesCreated: autoLinkResult.strategiesCreated,
              positionsLinked: autoLinkResult.positionsLinked,
            },
            strategyMetrics: strategyMetricsCount,
            success: true,
          };
          
        } catch (error) {
          console.error(`Failed to auto-recompute after positions ingestion for ${snapshotDate}:`, error);
          recomputeResults[snapshotDate] = {
            error: error instanceof Error ? error.message : 'Recompute failed',
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: dataRows.length,
        validRows: normalizedRows.length,
        inserted,
        deletedSnapshots,
        validationErrors: validationErrors.length,
        normalizationErrors: normalizationErrors.length,
        insertErrors: insertErrors.length,
      },
      validationErrors: validationErrors.length ? validationErrors : undefined,
      normalizationErrors: normalizationErrors.length ? normalizationErrors : undefined,
      insertErrors: insertErrors.length ? insertErrors : undefined,
      autoRecompute: Object.keys(recomputeResults).length > 0 ? recomputeResults : undefined,
    });
  } catch (error) {
    console.error('Flex positions ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
