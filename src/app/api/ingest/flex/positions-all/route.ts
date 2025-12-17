/**
 * Unified Positions Query Ingestion
 * 
 * Processes all three sections (POST, EQUT, MTMP) from a single Positions Query file.
 * This is more convenient than uploading the same file three times with different names.
 */

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { db } from '@/db';
import { positions, navSnapshots, mtmSnapshots, ingestionRuns } from '@/db/schema';
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
import { resolveAccountId } from '@/lib/ingestion/flex/account';
import { and, eq, ne, sql, lt, isNotNull } from 'drizzle-orm';
import { computeTriageForDate } from '@/lib/derived/triage';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computePortfolioSnapshotsForDateRange } from '@/lib/derived/portfolio';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '@/lib/derived/strategyAuto';
import { computeTradeBlotterEntriesForDate, createQuantityChangeTriageForUnmatchedTrades } from '@/lib/derived/blotter';
import { strategies } from '@/db/schema';
import { trackProcess, startProcess, completeProcess, failProcess } from '@/lib/services/processTracking';

const SECTION_CODES = {
  POST: 'POST',
  EQUT: 'EQUT',
  MTMP: 'MTMP',
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

function buildRecord<T extends Record<string, string>>(
  fieldNames: string[],
  row: string[]
): T {
  const record: Record<string, string> = {};
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

function extractClientAccountId(row: Record<string, string>): string | undefined {
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

export async function POST(request: NextRequest) {
  // Start tracking immediately - before any processing
  let processRunId: string | null = null;
  
  const results = {
    post: { inserted: 0, errors: [] as ErrorDetail[] },
    equt: { inserted: 0, errors: [] as ErrorDetail[] },
    mtmp: { inserted: 0, errors: [] as ErrorDetail[] },
  };

  const allSnapshotDates = new Set<string>();
  let accountId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    // Start process tracking immediately (before file processing)
    processRunId = await startProcess('position_ingestion', 'api', {
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

    // Process POST section
    const postHeader = rows.find(
      (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.POST
    );

    if (postHeader) {
      const fieldNames = postHeader.slice(2);
      const postDataRows: RecordWithMeta<FlexPositionRow>[] = rows
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => row[0] === 'DATA' && row[1] === SECTION_CODES.POST)
        .map(({ row }, dataIdx) => ({
          record: buildRecord<FlexPositionRow>(fieldNames, row),
          rowNumber: dataIdx + 1,
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
                const needsUnrealizedPnl = !entry.data.unrealizedPnl || entry.data.unrealizedPnl === '0' || parseFloat(entry.data.unrealizedPnl || '0') === 0;
                
                // Backfill avg_price from previous day if missing or zero
                if (needsAvgPrice && prev.avgPrice && parseFloat(prev.avgPrice) !== 0) {
                  entry.data.avgPrice = prev.avgPrice;
                  console.log(`Backfilled avg_price for ${entry.data.symbol}: ${prev.avgPrice} from ${prev.snapshotDate}`);
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

          // Insert positions
          for (const { data } of normalizedRows) {
            try {
              await db.insert(positions).values(data);
              results.post.inserted++;
            } catch (error) {
              results.post.errors.push({
                row: 0,
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
        .map(({ row }, dataIdx) => ({
          record: buildRecord<FlexNavRow>(fieldNames, row),
          rowNumber: dataIdx + 1,
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
          for (const { data } of normalizedRows) {
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
                row: 0,
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
        .map(({ row }, dataIdx) => ({
          record: buildRecord<FlexMtmRow>(fieldNames, row),
          rowNumber: dataIdx + 1,
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

          // Insert MTM snapshots
          for (const { data } of normalizedRows) {
            try {
              await db.insert(mtmSnapshots).values(data).onConflictDoNothing();
              results.mtmp.inserted++;
            } catch (error) {
              // Ignore duplicate errors
            }
          }
        }
      }
    }

    // Trigger recompute for all affected snapshot dates
    if (accountId && allSnapshotDates.size > 0) {
      const snapshotDates = Array.from(allSnapshotDates).sort();
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

        // If strategies were created or positions were linked, also link trades and create trade blotter entries
        // This ensures that when positions are ingested first, trades get linked and QUANTITY_CHANGE records are created
        if (autoLinkResult.strategiesCreated > 0 || autoLinkResult.positionsLinked > 0) {
          try {
            // Link any unlinked trades to strategies (may create more strategies)
            await autoLinkTradesToStrategies(accountId, {
              startDate: minDate,
              endDate: maxDate,
            });
          } catch (error) {
            console.error(`Failed to link trades after positions ingestion:`, error);
            // Don't fail ingestion if trade linking fails
          }
          }

        // Compute triage for each snapshot date
        // Process each date individually to avoid stopping on errors
        for (const date of snapshotDates) {
          try {
            await computeTriageForDate(date, accountId);
            
            // Create trade blotter entries and QUANTITY_CHANGE records for each date
            // This ensures that when positions are ingested first, trades get processed
            try {
              await computeTradeBlotterEntriesForDate(date, accountId);
            } catch (error) {
              console.error(`Failed to create trade blotter entries for ${accountId} on ${date}:`, error);
              // Don't fail ingestion if blotter creation fails
            }
            
            // Create QUANTITY_CHANGE triage records for unmatched trades (after matching completes)
            try {
              const qcCount = await createQuantityChangeTriageForUnmatchedTrades(date, accountId);
              if (qcCount > 0) {
                console.log(`Created ${qcCount} QUANTITY_CHANGE triage records for ${accountId} on ${date} after positions ingestion`);
              }
            } catch (error) {
              console.error(`Failed to create QUANTITY_CHANGE triage records for ${accountId} on ${date}:`, error);
              // Don't fail ingestion if QUANTITY_CHANGE creation fails
            }
          } catch (error) {
            console.error(`Failed to compute triage for ${date}:`, error);
            // Continue processing other dates even if one fails
          }
        }
      } catch (error) {
        console.error('Recompute error:', error);
        // Don't fail the upload if recompute fails
      }
    }

    const totalInserted = results.post.inserted + results.equt.inserted + results.mtmp.inserted;
    const totalErrors =
      results.post.errors.length + results.equt.errors.length + results.mtmp.errors.length;

    // Update process tracking with accountId and run recompute operations
    if (processRunId && accountId) {
      // Update payload with account info
      await db
        .update(ingestionRuns)
        .set({
          accountId,
          payload: {
            accountId,
            startDate: allSnapshotDates.size > 0 ? Array.from(allSnapshotDates).sort()[0] : null,
            endDate: allSnapshotDates.size > 0 ? Array.from(allSnapshotDates).sort().slice(-1)[0] : null,
            inserted: totalInserted,
            errors: totalErrors,
            hasPositions: allSnapshotDates.size > 0,
          },
        })
        .where(eq(ingestionRuns.id, processRunId));
    }

    // Run recompute operations if we have positions
    if (accountId && allSnapshotDates.size > 0) {
      const snapshotDates = Array.from(allSnapshotDates).sort();
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

        // Compute triage for each snapshot date
        // Process each date individually to avoid stopping on errors
        for (const date of snapshotDates) {
          try {
            await computeTriageForDate(date, accountId);
          } catch (error) {
            console.error(`Failed to compute triage for ${date}:`, error);
            // Continue processing other dates even if one fails
          }
        }
      } catch (error) {
        console.error('Recompute error:', error);
        // Don't fail the upload if recompute fails
      }
    }

    // Complete process tracking
    if (processRunId) {
      await completeProcess(processRunId, {
        success: totalErrors === 0,
        summary: {
          post: {
            inserted: results.post.inserted,
            errors: results.post.errors.length,
          },
          equt: {
            inserted: results.equt.inserted,
            errors: results.equt.errors.length,
          },
          mtmp: {
            inserted: results.mtmp.inserted,
            errors: results.mtmp.errors.length,
          },
          totalInserted,
          totalErrors,
        },
      });
    }

    // Return response
    return NextResponse.json({
      success: totalErrors === 0,
      processRunId,
      summary: {
        post: {
          inserted: results.post.inserted,
          errors: results.post.errors.length,
        },
        equt: {
          inserted: results.equt.inserted,
          errors: results.equt.errors.length,
        },
        mtmp: {
          inserted: results.mtmp.inserted,
          errors: results.mtmp.errors.length,
        },
        totalInserted,
        totalErrors,
      },
      errors: {
        post: results.post.errors,
        equt: results.equt.errors,
        mtmp: results.mtmp.errors,
      },
    });
  } catch (error) {
    console.error('Positions-all ingestion error:', error);
    
    // Mark process as failed if tracking was started
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

