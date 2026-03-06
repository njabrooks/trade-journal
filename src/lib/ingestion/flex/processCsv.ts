/**
 * Shared CSV Processing Functions
 * 
 * These functions can be called directly from automated ingestion
 * or from HTTP routes, avoiding the need for internal HTTP calls.
 */

import Papa from 'papaparse';
import { db } from '@/db';
import { positions, navSnapshots, mtmSnapshots, cashBalances, trades, ingestionRuns, fxRates as fxRatesTable } from '@/db/schema';
import type { NewPosition, NewNavSnapshot, NewMtmSnapshot, NewCashBalance } from '@/db/schema';
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
import { evaluateStrategySignalsForDate } from '@/lib/derived/signalEvaluation';
import { strategies, triageRecords, strategyTemplates } from '@/db/schema';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';
import { startProcess, completeProcess, failProcess } from '@/lib/services/processTracking';

const SECTION_CODES = {
  POST: 'POST',
  EQUT: 'EQUT',
  MTMP: 'MTMP',
  FXPO: 'FXPO',
  TRADES: 'TRNT',
  EXERCISES: 'OPTT',
  CASH: 'CTRN',
  RATE: 'RATE',
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
  cash: { inserted: number };
  fxpo: { inserted: number; errors: ErrorDetail[] };
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
    cash: { inserted: 0 },
    fxpo: { inserted: 0, errors: [] as ErrorDetail[] },
  };

  const allSnapshotDates = new Set<string>();
  // Track dates that actually have changes (for egress optimization)
  const datesWithChanges = new Set<string>();
  // Track all account IDs encountered (for multi-account queries)
  const accountIds = new Set<string>();
  const accountCache = new Map<string, string>();
  let accountId: string | null = null; // For backward compatibility in return value

  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parsing errors: ${JSON.stringify(parsed.errors)}`);
  }

  const rows = parsed.data;

  // Parse RATE section (FX rates) first — needed for converting non-USD cash to USD
  // Format: HEADER,RATE,Date/Time,FromCurrency,ToCurrency,Rate
  // For USD-based accounts: rates are FromCurrency → USD (e.g., GBP → USD = 1.3688)
  // For GBP-based accounts: rates are FromCurrency → GBP (e.g., EUR → GBP = 0.8657)
  // We normalize all rates to → USD regardless of account base currency.
  // Multi-date files have separate rates per date; we store per-date maps.
  const fxRatesByDate = new Map<string, Map<string, number>>(); // date → (currency → rateToUSD)
  const rateHeader = rows.find(
    (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.RATE
  );
  if (rateHeader) {
    const rateFieldNames = rateHeader.slice(2);
    const dateTimeIdx = rateFieldNames.indexOf('Date/Time');
    const fromCurrencyIdx = rateFieldNames.indexOf('FromCurrency');
    const toCurrencyIdx = rateFieldNames.indexOf('ToCurrency');
    const rateIdx = rateFieldNames.indexOf('Rate');

    // First pass: collect raw rates grouped by date, determine base currency
    const rawRatesByDate = new Map<string, Map<string, number>>();
    let baseCurrency = 'USD';
    for (const row of rows) {
      if (row[0] !== 'DATA' || row[1] !== SECTION_CODES.RATE) continue;
      const dateRaw = row[dateTimeIdx + 2]?.trim();
      const fromCurrency = row[fromCurrencyIdx + 2]?.trim();
      const toCurrency = row[toCurrencyIdx + 2]?.trim();
      const rateStr = row[rateIdx + 2]?.trim();
      if (!fromCurrency || !rateStr) continue;
      const rate = parseFloat(rateStr);
      if (isNaN(rate) || rate <= 0) continue;

      // Format date: YYYYMMDD → YYYY-MM-DD
      const dateKey = dateRaw && dateRaw.length === 8
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : dateRaw || 'unknown';

      if (!rawRatesByDate.has(dateKey)) {
        rawRatesByDate.set(dateKey, new Map());
      }
      rawRatesByDate.get(dateKey)!.set(fromCurrency, rate);
      if (toCurrency) baseCurrency = toCurrency;
    }

    // Normalize each date's rates to → USD
    for (const [date, rawRates] of rawRatesByDate) {
      const normalized = new Map<string, number>();
      if (baseCurrency === 'USD') {
        for (const [currency, rate] of rawRates) {
          normalized.set(currency, rate);
        }
      } else {
        // Non-USD base (e.g., GBP): rates are → baseCurrency
        const usdToBase = rawRates.get('USD');
        if (usdToBase && usdToBase > 0) {
          const baseToUsd = 1 / usdToBase;
          normalized.set(baseCurrency, baseToUsd);
          for (const [currency, rateToBase] of rawRates) {
            if (currency === 'USD') continue;
            normalized.set(currency, rateToBase * baseToUsd);
          }
        }
      }
      normalized.set('USD', 1);
      fxRatesByDate.set(date, normalized);
    }

    if (fxRatesByDate.size > 0) {
      const sampleDate = [...fxRatesByDate.keys()][0];
      const sampleRates = fxRatesByDate.get(sampleDate)!;
      console.log(`[FX Rates] Parsed rates for ${fxRatesByDate.size} date(s) (base: ${baseCurrency}, e.g., GBP→USD: ${sampleRates.get('GBP')?.toFixed(4) ?? 'N/A'}, EUR→USD: ${sampleRates.get('EUR')?.toFixed(4) ?? 'N/A'})`);
    }
  }

  // Helper: get FX rate for a specific date and currency
  function getFxRate(date: string, currency: string): number | undefined {
    return fxRatesByDate.get(date)?.get(currency);
  }

  // Helper: persist FX rates to database for all dates
  async function persistAllFxRates() {
    let totalPersisted = 0;
    for (const [date, rates] of fxRatesByDate) {
      const ratesToInsert = [];
      for (const [currency, rate] of rates) {
        if (currency === 'USD') continue;
        ratesToInsert.push({
          snapshotDate: date,
          fromCurrency: currency,
          toCurrency: 'USD' as const,
          rate: rate.toString(),
          source: 'ibkr_flex' as const,
        });
      }
      for (const rateRow of ratesToInsert) {
        await db.insert(fxRatesTable).values(rateRow).onConflictDoUpdate({
          target: [fxRatesTable.snapshotDate, fxRatesTable.fromCurrency, fxRatesTable.toCurrency],
          set: { rate: rateRow.rate, source: rateRow.source },
        });
      }
      totalPersisted += ratesToInsert.length;
    }
    if (totalPersisted > 0) {
      console.log(`[FX Rates] Persisted ${totalPersisted} rate(s) across ${fxRatesByDate.size} date(s)`);
    }
  }

  // Helper: compute absNotionalUsd from absNotional + currency using per-date FX rates
  function computeAbsNotionalUsd(absNotional: string | null, currency: string | null, snapshotDate: string): string | null {
    if (!absNotional) return null;
    const notional = parseFloat(absNotional);
    if (isNaN(notional)) return null;
    const cur = currency || 'USD';
    if (cur === 'USD') return absNotional;
    const rate = getFxRate(snapshotDate, cur);
    if (rate) return (notional * rate).toString();
    return null; // Unknown currency or date, can't convert
  }

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

        // Extract account ID per row (supports multi-account queries)
        const clientAccountId = extractClientAccountId(record);
        if (!clientAccountId) {
          results.post.errors.push({ row: rowNumber, errors: ['ClientAccountID is required'] });
          continue;
        }

        let rowAccountId: string;
        try {
          rowAccountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
          accountIds.add(rowAccountId);
          if (!accountId) accountId = rowAccountId; // Set first for backward compat
        } catch (error) {
          results.post.errors.push({
            row: rowNumber,
            errors: [error instanceof Error ? error.message : 'Account resolution failed'],
          });
          continue;
        }

        try {
          const normalized = await normalizeFlexPositionRow(record, rowAccountId);
          if (normalized.snapshotDate) {
            allSnapshotDates.add(normalized.snapshotDate);
            snapshotKeys.add(`${rowAccountId}::${normalized.snapshotDate}`);
            normalizedRows.push({ data: normalized, rowNumber });
          }
        } catch (error) {
          results.post.errors.push({
            row: rowNumber,
            errors: [error instanceof Error ? error.message : 'Normalization failed'],
          });
        }
      }

      if (normalizedRows.length > 0) {

        // === CHANGE DETECTION (Egress Optimization) ===
        // Before deleting and re-inserting, compare incoming data against existing positions
        // to determine if there are actual changes. This prevents unnecessary recompute cycles
        // when IBKR returns identical data (which happens on hourly checks between daily updates).
        //
        // We compare a fingerprint of key fields that would affect triage/metrics:
        // - quantity, spot, unrealizedPnl, avgPrice, costBasisMoney
        const datesWithActualChanges = new Set<string>();

        for (const key of snapshotKeys) {
          const [acc, snapshotDate] = key.split('::');
          if (!acc || !snapshotDate) continue;

          // Get existing positions for this account + snapshot
          const existingPositions = await db
            .select({
              conid: positions.conid,
              symbol: positions.symbol,
              expiry: positions.expiry,
              strike: positions.strike,
              optionRight: positions.optionRight,
              quantity: positions.quantity,
              spot: positions.spot,
              unrealizedPnl: positions.unrealizedPnl,
              avgPrice: positions.avgPrice,
              costBasisMoney: positions.costBasisMoney,
            })
            .from(positions)
            .where(and(eq(positions.accountId, acc), eq(positions.snapshotDate, snapshotDate)));

          // Get incoming positions for this account + snapshot
          const incomingForDate = normalizedRows.filter(
            r => r.data.accountId === acc && r.data.snapshotDate === snapshotDate
          );

          // Quick check: if count differs, there are changes
          if (existingPositions.length !== incomingForDate.length) {
            datesWithActualChanges.add(snapshotDate);
            console.log(`[Change Detection] ${snapshotDate}: Position count changed (${existingPositions.length} → ${incomingForDate.length})`);
            continue;
          }

          // If no existing positions, this is new data
          if (existingPositions.length === 0 && incomingForDate.length > 0) {
            datesWithActualChanges.add(snapshotDate);
            console.log(`[Change Detection] ${snapshotDate}: New data (no existing positions)`);
            continue;
          }

          // Build lookup map for existing positions by conid (primary) or symbol+expiry+strike+right (fallback)
          const existingMap = new Map<string, typeof existingPositions[0]>();
          for (const pos of existingPositions) {
            const key = pos.conid
              ? `conid:${pos.conid}`
              : `sym:${pos.symbol}|${pos.expiry}|${pos.strike}|${pos.optionRight}`;
            existingMap.set(key, pos);
          }

          // Compare each incoming position against existing
          let hasChanges = false;
          for (const { data } of incomingForDate) {
            const key = data.conid
              ? `conid:${data.conid}`
              : `sym:${data.symbol}|${data.expiry}|${data.strike}|${data.optionRight}`;
            const existing = existingMap.get(key);

            if (!existing) {
              // New position not in existing set
              hasChanges = true;
              console.log(`[Change Detection] ${snapshotDate}: New position ${data.symbol} (${key})`);
              break;
            }

            // Compare key fields (using string comparison to handle nulls)
            const qtyChanged = String(data.quantity || '') !== String(existing.quantity || '');
            const spotChanged = String(data.spot || '') !== String(existing.spot || '');
            const pnlChanged = String(data.unrealizedPnl || '') !== String(existing.unrealizedPnl || '');
            const avgPriceChanged = String(data.avgPrice || '') !== String(existing.avgPrice || '');
            const costBasisChanged = String(data.costBasisMoney || '') !== String(existing.costBasisMoney || '');

            if (qtyChanged || spotChanged || pnlChanged || avgPriceChanged || costBasisChanged) {
              hasChanges = true;
              const changes: string[] = [];
              if (qtyChanged) changes.push(`qty: ${existing.quantity}→${data.quantity}`);
              if (spotChanged) changes.push(`spot: ${existing.spot}→${data.spot}`);
              if (pnlChanged) changes.push(`pnl: ${existing.unrealizedPnl}→${data.unrealizedPnl}`);
              if (avgPriceChanged) changes.push(`avgPrice: ${existing.avgPrice}→${data.avgPrice}`);
              if (costBasisChanged) changes.push(`costBasis: ${existing.costBasisMoney}→${data.costBasisMoney}`);
              console.log(`[Change Detection] ${snapshotDate}: ${data.symbol} changed - ${changes.join(', ')}`);
              break;
            }
          }

          if (hasChanges) {
            datesWithActualChanges.add(snapshotDate);
          } else {
            console.log(`[Change Detection] ${snapshotDate}: No changes detected, will skip recompute`);
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
            if (!entry.data.accountId) continue;

            // Find previous snapshots for this position (by conid if available, otherwise by symbol+expiry+strike)
            const whereConditions = [
              eq(positions.accountId, entry.data.accountId),
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
            }

            // If still missing cost basis after snapshot backfill, derive from trades
            const stillNeedsAvgPrice = !entry.data.avgPrice || entry.data.avgPrice === '0' || parseFloat(entry.data.avgPrice || '0') === 0;
            if (stillNeedsAvgPrice && entry.data.accountId && entry.data.symbol) {
              const tradeRows = await db
                .select({
                  totalQty: sql<string>`SUM(ABS(CAST(${trades.quantity} AS NUMERIC)))`,
                  totalCost: sql<string>`SUM(ABS(CAST(${trades.quantity} AS NUMERIC)) * CAST(${trades.price} AS NUMERIC))`,
                })
                .from(trades)
                .where(and(
                  eq(trades.accountId, entry.data.accountId),
                  eq(trades.symbol, entry.data.symbol),
                  eq(trades.side, 'BUY'),
                ));

              const totalQty = parseFloat(tradeRows[0]?.totalQty || '0');
              const totalCost = parseFloat(tradeRows[0]?.totalCost || '0');
              if (totalQty > 0 && totalCost > 0) {
                const derivedAvgPrice = totalCost / totalQty;
                const derivedCostBasis = totalCost;
                entry.data.avgPrice = derivedAvgPrice.toString();
                entry.data.costBasisMoney = derivedCostBasis.toString();
                console.log(`Derived cost basis from trades for ${entry.data.symbol}: avgPrice=${derivedAvgPrice.toFixed(4)}, costBasis=${derivedCostBasis.toFixed(2)}`);

                // Recalculate unrealized PnL with derived cost basis
                if (entry.data.spot && entry.data.quantity) {
                  const spot = parseFloat(entry.data.spot);
                  const quantity = parseFloat(entry.data.quantity);
                  const multiplier = entry.data.multiplier ? parseFloat(entry.data.multiplier) : 1;
                  if (!isNaN(spot) && !isNaN(quantity) && !isNaN(multiplier)) {
                    const calculatedPnl = (spot - derivedAvgPrice) * quantity * multiplier;
                    entry.data.unrealizedPnl = calculatedPnl.toString();
                    console.log(`Calculated unrealized_pnl for ${entry.data.symbol}: ${calculatedPnl.toFixed(2)} = (${spot} - ${derivedAvgPrice.toFixed(4)}) * ${quantity} * ${multiplier}`);
                  }
                }
              }
            }
          }
        }

        // Preserve non-zero cost basis / PnL from existing same-date records.
        // IBKR Flex runs hourly — early ingestions may lack cost basis that later
        // ingestions include. If the incoming data has zeros but the existing record
        // already has good values (from a previous ingestion the same day, or from
        // our trades-based derivation), carry them forward so the delete-and-reinsert
        // doesn't regress the data.
        for (const entry of normalizedRows) {
          const d = entry.data;
          if (!d.accountId || !d.snapshotDate) continue;

          const incomingAvgZero = !d.avgPrice || d.avgPrice === '0' || parseFloat(d.avgPrice || '0') === 0;
          const incomingCostZero = !d.costBasisMoney || d.costBasisMoney === '0' || parseFloat(d.costBasisMoney || '0') === 0;
          const incomingPnlZero = !d.unrealizedPnl || d.unrealizedPnl === '0' || parseFloat(d.unrealizedPnl || '0') === 0;

          if (!incomingAvgZero && !incomingCostZero && !incomingPnlZero) continue; // incoming has full data

          // Build where clause matching the same position on the same date
          const matchConds = [
            eq(positions.accountId, d.accountId),
            eq(positions.snapshotDate, d.snapshotDate),
          ];
          if (d.conid) {
            matchConds.push(eq(positions.conid, d.conid));
          } else {
            matchConds.push(eq(positions.symbol, d.symbol));
            if (d.expiry) matchConds.push(eq(positions.expiry, d.expiry));
            if (d.strike) matchConds.push(eq(positions.strike, d.strike));
            if (d.optionRight) matchConds.push(eq(positions.optionRight, d.optionRight));
          }

          const existing = await db
            .select({
              avgPrice: positions.avgPrice,
              costBasisMoney: positions.costBasisMoney,
              unrealizedPnl: positions.unrealizedPnl,
            })
            .from(positions)
            .where(and(...matchConds))
            .limit(1);

          if (existing.length > 0) {
            const ex = existing[0];
            if (incomingAvgZero && ex.avgPrice && parseFloat(ex.avgPrice) !== 0) {
              d.avgPrice = ex.avgPrice;
              console.log(`[Preserve] ${d.symbol} ${d.snapshotDate}: kept existing avgPrice=${ex.avgPrice}`);
            }
            if (incomingCostZero && ex.costBasisMoney && parseFloat(ex.costBasisMoney) !== 0) {
              d.costBasisMoney = ex.costBasisMoney;
              console.log(`[Preserve] ${d.symbol} ${d.snapshotDate}: kept existing costBasis=${ex.costBasisMoney}`);
            }
            if (incomingPnlZero && ex.unrealizedPnl && parseFloat(ex.unrealizedPnl) !== 0) {
              // Only preserve PnL if we also have cost basis (to avoid keeping stale/inflated PnL)
              if (d.avgPrice && parseFloat(d.avgPrice || '0') !== 0) {
                // Recalculate PnL with current spot and preserved/derived avg price
                if (d.spot && d.quantity) {
                  const spot = parseFloat(d.spot);
                  const avgPrice = parseFloat(d.avgPrice);
                  const quantity = parseFloat(d.quantity);
                  const multiplier = d.multiplier ? parseFloat(d.multiplier) : 1;
                  if (!isNaN(spot) && !isNaN(avgPrice) && !isNaN(quantity) && !isNaN(multiplier)) {
                    d.unrealizedPnl = ((spot - avgPrice) * quantity * multiplier).toString();
                    console.log(`[Preserve] ${d.symbol} ${d.snapshotDate}: recalculated PnL=${d.unrealizedPnl}`);
                  }
                } else {
                  d.unrealizedPnl = ex.unrealizedPnl;
                  console.log(`[Preserve] ${d.symbol} ${d.snapshotDate}: kept existing PnL=${ex.unrealizedPnl}`);
                }
              }
            }
          }
        }

        // Delete existing positions for these snapshot dates (idempotency)
        for (const key of snapshotKeys) {
          const [acc, snapshotDate] = key.split('::');
          if (!acc || !snapshotDate) continue;
          await db
            .delete(positions)
            .where(and(eq(positions.accountId, acc), eq(positions.snapshotDate, snapshotDate)));
        }

        // Compute absNotionalUsd and marketValueUsd for each position using per-date FX rates
        for (const { data } of normalizedRows) {
          if (data.snapshotDate) {
            data.absNotionalUsd = computeAbsNotionalUsd(data.absNotional ?? null, data.currency ?? null, data.snapshotDate);
            data.marketValueUsd = data.absNotionalUsd; // IBKR PositionValue IS market value, just needs FX conversion
          }
        }

        // Persist FX rates for all dates in the file
        try {
          await persistAllFxRates();
        } catch (error) {
          console.error('[FX Rates] Failed to persist:', error);
        }

        // Insert positions (change detection already done above)
        for (const { data, rowNumber } of normalizedRows) {
          try {
            await db.insert(positions).values(data);
            results.post.inserted++;
          } catch (error) {
            results.post.errors.push({
              row: rowNumber,
              errors: [error instanceof Error ? error.message : 'Insert failed'],
            });
          }
        }

        // Use the pre-computed change detection results instead of marking all dates
        for (const date of datesWithActualChanges) {
          datesWithChanges.add(date);
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

        // Extract account ID per row (supports multi-account queries)
        const clientAccountId = extractClientAccountId(record);
        if (!clientAccountId) {
          results.equt.errors.push({ row: rowNumber, errors: ['ClientAccountID is required'] });
          continue;
        }

        let rowAccountId: string;
        try {
          rowAccountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
          accountIds.add(rowAccountId);
          if (!accountId) accountId = rowAccountId;
        } catch (error) {
          results.equt.errors.push({
            row: rowNumber,
            errors: [error instanceof Error ? error.message : 'Account resolution failed'],
          });
          continue;
        }

        try {
          const normalized = normalizeFlexNavRow(record, rowAccountId);
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

      // Also insert aggregate EQUT cash into cash_balances table.
      // If MTMP section has per-currency CASH rows, those will overwrite this
      // (MTMP deletes all ibkr_flex cash for account+date before inserting).
      const equtCashValues: NewCashBalance[] = [];
      for (const { data } of normalizedRows) {
        if (data.cash && parseFloat(data.cash) !== 0) {
          equtCashValues.push({
            accountId: data.accountId,
            snapshotDate: data.reportDate,
            currency: data.currency || 'USD',
            balance: data.cash,
            balanceUsd: (() => {
              const cur = data.currency || 'USD';
              if (cur === 'USD') return data.cash;
              const rate = getFxRate(data.reportDate, cur);
              if (rate) return (parseFloat(data.cash) * rate).toString();
              return null;
            })(),
            source: 'ibkr_flex',
          });
        }
      }
      if (equtCashValues.length > 0) {
        const seen = new Set<string>();
        for (const v of equtCashValues) {
          const key = `${v.accountId}::${v.snapshotDate}`;
          if (!seen.has(key)) {
            seen.add(key);
            await db
              .delete(cashBalances)
              .where(
                and(
                  eq(cashBalances.accountId, v.accountId),
                  eq(cashBalances.snapshotDate, v.snapshotDate),
                  eq(cashBalances.source, 'ibkr_flex')
                )
              );
          }
        }
        // Deduplicate before inserting (multi-date files can have duplicate EQUT rows per date)
        const dedupedCash: typeof equtCashValues = [];
        const cashSeen = new Set<string>();
        for (const v of equtCashValues) {
          const key = `${v.accountId}::${v.snapshotDate}::${v.currency}::${v.source}`;
          if (!cashSeen.has(key)) {
            cashSeen.add(key);
            dedupedCash.push(v);
          }
        }
        if (dedupedCash.length > 0) {
          await db.insert(cashBalances).values(dedupedCash);
        }
        results.cash.inserted += dedupedCash.length;
        console.log(`[EQUT Cash] Inserted ${equtCashValues.length} aggregate cash balance(s) from EQUT section`);
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
      // Separate CASH rows from regular MTM rows
      const cashRows: RecordWithMeta<FlexMtmRow>[] = [];
      const mtmRows: RecordWithMeta<FlexMtmRow>[] = [];
      for (const item of mtmpDataRows) {
        const assetClass = (
          item.record['AssetClass'] ||
          item.record['Asset Class'] ||
          item.record['assetClass'] ||
          ''
        ).toUpperCase();
        if (assetClass === 'CASH') {
          cashRows.push(item);
        } else {
          mtmRows.push(item);
        }
      }

      // Process CASH rows → cash_balances table
      if (cashRows.length > 0) {
        const cashValues: NewCashBalance[] = [];
        for (const { record } of cashRows) {
          const clientAccountId = extractClientAccountId(record);
          if (!clientAccountId) continue;

          let rowAccountId: string;
          try {
            rowAccountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
            accountIds.add(rowAccountId);
            if (!accountId) accountId = rowAccountId;
          } catch {
            continue;
          }

          const reportDateRaw = record['ReportDate'] || record['reportDate'] || record['SnapshotDate'];
          if (!reportDateRaw) continue;
          const trimmed = reportDateRaw.trim();
          let snapshotDate: string;
          if (/^\d{8}$/.test(trimmed)) {
            snapshotDate = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
          } else {
            const d = new Date(trimmed);
            if (isNaN(d.getTime())) continue;
            snapshotDate = d.toISOString().split('T')[0]!;
          }

          const symbol = record['Symbol'] || record['symbol'] || '';
          const currency = symbol.trim() || record['CurrencyPrimary'] || record['Currency'] || 'USD';
          // MTMP CASH rows use CloseQuantity (actual amount in currency), not MarketValue
          const balanceStr = record['CloseQuantity'] || record['Close Quantity'] ||
            record['MarketValue'] || record['Market Value'] || record['marketValue'];
          if (!balanceStr) continue;

          const amount = parseFloat(balanceStr);
          if (isNaN(amount) || amount === 0) continue;

          const cur = currency.trim();
          let balanceUsd: string | null = null;
          if (cur === 'USD') {
            balanceUsd = amount.toString();
          } else {
            const rate = getFxRate(snapshotDate, cur);
            if (rate) balanceUsd = (amount * rate).toString();
          }

          cashValues.push({
            accountId: rowAccountId,
            snapshotDate,
            currency: cur,
            balance: amount.toString(),
            balanceUsd,
            source: 'ibkr_flex',
          });
        }

        if (cashValues.length > 0) {
          // Delete existing IBKR cash for these accounts + dates, then insert
          const seen = new Set<string>();
          for (const v of cashValues) {
            const key = `${v.accountId}::${v.snapshotDate}`;
            if (!seen.has(key)) {
              seen.add(key);
              await db
                .delete(cashBalances)
                .where(
                  and(
                    eq(cashBalances.accountId, v.accountId),
                    eq(cashBalances.snapshotDate, v.snapshotDate),
                    eq(cashBalances.source, 'ibkr_flex')
                  )
                );
            }
          }
          await db.insert(cashBalances).values(cashValues);
          results.cash.inserted = cashValues.length;

          // Track cash dates for recompute (ensures cash-only accounts trigger portfolio snapshot computation)
          for (const v of cashValues) {
            if (v.snapshotDate) {
              allSnapshotDates.add(v.snapshotDate);
              datesWithChanges.add(v.snapshotDate);
            }
          }
        }
      }

      // Process regular MTM rows
      const normalizedRows: Array<{
        data: Omit<NewMtmSnapshot, 'id' | 'createdAt'>;
        rowNumber: number;
      }> = [];

      for (const { record, rowNumber } of mtmRows) {
        const validation = validateFlexMtmRow(record);
        if (!validation.valid) {
          results.mtmp.errors.push({ row: rowNumber, errors: validation.errors });
          continue;
        }

        // Extract account ID per row (supports multi-account queries)
        const clientAccountId = extractClientAccountId(record);
        if (!clientAccountId) {
          results.mtmp.errors.push({ row: rowNumber, errors: ['ClientAccountID is required'] });
          continue;
        }

        let rowAccountId: string;
        try {
          rowAccountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
          accountIds.add(rowAccountId);
          if (!accountId) accountId = rowAccountId;
        } catch (error) {
          results.mtmp.errors.push({
            row: rowNumber,
            errors: [error instanceof Error ? error.message : 'Account resolution failed'],
          });
          continue;
        }

        try {
          const normalized = await normalizeFlexMtmRow(record, rowAccountId);
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

  // Process FXPO section (FX Balance Positions) → cash_balances with per-currency quantities
  const fxpoHeader = rows.find(
    (row) => row[0] === 'HEADER' && row[1] === SECTION_CODES.FXPO
  );

  if (fxpoHeader) {
    const fieldNames = fxpoHeader.slice(2);
    const fxpoDataRows = rows
      .filter((row) => row[0] === 'DATA' && row[1] === SECTION_CODES.FXPO)
      .map((row) => buildRecord<Record<string, string | undefined>>(fieldNames, row));

    if (fxpoDataRows.length > 0) {
      const cashValues: NewCashBalance[] = [];

      for (const record of fxpoDataRows) {
        const clientAccountId =
          record['ClientAccountID'] ||
          record['Client Account ID'] ||
          record['clientAccountId'];
        if (!clientAccountId) continue;

        let rowAccountId: string;
        try {
          rowAccountId = await resolveAccountId(clientAccountId, 'IBKR', accountCache);
          accountIds.add(rowAccountId);
          if (!accountId) accountId = rowAccountId;
        } catch {
          continue;
        }

        const reportDateRaw = (record['ReportDate'] || record['reportDate'] || '').trim();
        if (!reportDateRaw || !/^\d{8}$/.test(reportDateRaw)) continue;
        const snapshotDate = `${reportDateRaw.slice(0, 4)}-${reportDateRaw.slice(4, 6)}-${reportDateRaw.slice(6, 8)}`;

        const currency = (record['FXCurrency'] || record['fxCurrency'] || '').trim();
        const quantityStr = (record['Quantity'] || record['quantity'] || '').trim();
        if (!currency || !quantityStr) continue;

        const amount = parseFloat(quantityStr);
        if (isNaN(amount)) continue;

        // Convert to USD using existing FX rate lookup from RATE section
        let balanceUsd: string | null = null;
        if (currency === 'USD') {
          balanceUsd = amount.toString();
        } else {
          const rate = getFxRate(snapshotDate, currency);
          if (rate) balanceUsd = (amount * rate).toString();
        }

        cashValues.push({
          accountId: rowAccountId,
          snapshotDate,
          currency,
          balance: amount.toString(),
          balanceUsd,
          source: 'ibkr_fxpo',
        });
      }

      if (cashValues.length > 0) {
        // Delete existing FXPO cash for these accounts + dates, then insert (idempotent)
        const seen = new Set<string>();
        for (const v of cashValues) {
          const key = `${v.accountId}::${v.snapshotDate}`;
          if (!seen.has(key)) {
            seen.add(key);
            await db
              .delete(cashBalances)
              .where(
                and(
                  eq(cashBalances.accountId, v.accountId),
                  eq(cashBalances.snapshotDate, v.snapshotDate),
                  eq(cashBalances.source, 'ibkr_fxpo')
                )
              );
          }
        }
        await db.insert(cashBalances).values(cashValues);
        results.fxpo.inserted = cashValues.length;
        console.log(`[FXPO] Inserted ${cashValues.length} FX balance row(s) into cash_balances`);
      }
    }
  }

  // Trigger recompute only for dates with actual changes (egress optimization)
  // This prevents unnecessary recomputation when IBKR returns stale/identical data
  if (accountIds.size > 0 && datesWithChanges.size > 0) {
    const snapshotDates = Array.from(datesWithChanges).sort();
    console.log(`[Egress Optimization] Recomputing for ${snapshotDates.length} date(s) with changes: ${snapshotDates.join(', ')}`);
    console.log(`[Multi-Account] Processing ${accountIds.size} account(s)`);
    if (allSnapshotDates.size > datesWithChanges.size) {
      const skippedDates = Array.from(allSnapshotDates).filter(d => !datesWithChanges.has(d));
      console.log(`[Egress Optimization] Skipping recompute for ${skippedDates.length} date(s) with no changes: ${skippedDates.join(', ')}`);
    }
    const minDate = snapshotDates[0];
    const maxDate = snapshotDates[snapshotDates.length - 1];

    // Process recompute for each account
    for (const recomputeAccountId of accountIds) {
      try {
        console.log(`[Recompute] Processing account ${recomputeAccountId}`);

        // Auto-link positions to strategies (creates strategies if needed)
        const autoLinkResult = await autoLinkPositionsToStrategies(recomputeAccountId, {
          startDate: minDate,
          endDate: maxDate,
        });

        // Compute portfolio snapshots
        await computePortfolioSnapshotsForDateRange(recomputeAccountId, minDate, maxDate, true);

        // Get all strategies for this account (including newly created ones)
        // Exclude merged/rejected strategies - they're no longer active
        const accountStrategies = await db
          .select({ id: strategies.id })
          .from(strategies)
          .where(
            and(
              eq(strategies.accountId, recomputeAccountId),
              ne(strategies.status, 'rejected'),
              ne(strategies.status, 'merged')
            )
          );

        // Compute strategy metrics for all strategies
        for (const strategy of accountStrategies) {
          await computeStrategyMetricsForDateRange(recomputeAccountId, strategy.id, minDate, maxDate);
        }

        // If strategies were created or positions were linked, also link trades
        if (autoLinkResult.strategiesCreated > 0 || autoLinkResult.positionsLinked > 0) {
          try {
            await autoLinkTradesToStrategies(recomputeAccountId, {
              startDate: minDate,
              endDate: maxDate,
            });
          } catch (error) {
            console.error(`Failed to link trades after positions ingestion for ${recomputeAccountId}:`, error);
          }
        }

        // Compute triage for each snapshot date
        for (const date of snapshotDates) {
          try {
            await computeTriageForDate(date, recomputeAccountId);

            // REMOVED: computeTradeBlotterEntriesForDate - blotter system deprecated, replaced by journal
            // REMOVED: createQuantityChangeTriageForUnmatchedTrades - blotter system deprecated, replaced by journal

            // Evaluate strategy signals (DTE, sigma, PnL% conditions)
            try {
              await evaluateStrategySignalsForDate(recomputeAccountId, date);
            } catch (error) {
              console.error(`Failed to evaluate strategy signals for ${recomputeAccountId} on ${date}:`, error);
            }
          } catch (error) {
            console.error(`Failed to compute triage for ${date} (account ${recomputeAccountId}):`, error);
          }
        }
      } catch (error) {
        console.error(`Recompute error for account ${recomputeAccountId}:`, error);
        // Don't fail the upload if recompute fails - continue with other accounts
      }
    }
  } else if (accountIds.size > 0 && allSnapshotDates.size > 0) {
    // Data was processed but no actual changes detected
    console.log(`[Egress Optimization] No changes detected for ${allSnapshotDates.size} date(s) across ${accountIds.size} account(s), skipping recompute`);
  }

  const totalInserted = results.post.inserted + results.equt.inserted + results.mtmp.inserted + results.cash.inserted + results.fxpo.inserted;
  const totalErrors =
    results.post.errors.length + results.equt.errors.length + results.mtmp.errors.length + results.fxpo.errors.length;

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
 * Creates journal entries and triage records for newly ingested trades.
 * Groups trades by strategy + date and creates:
 * 1. A `trade_ingested` journal entry with trade details
 * 2. A triage record for the user to capture trade metadata (stage, reason, notes)
 *
 * This function is also used by crypto ingestion scripts to create TRADE_INGESTION
 * triage records for trades that have been linked to strategies.
 */
export async function createTradeIngestionRecords(
  accountId: string,
  tradeDate: string
): Promise<void> {
  // Query trades for this account + date that are linked to strategies
  const tradesForDate = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      conid: trades.conid,
      side: trades.side,
      quantity: trades.quantity,
      netAmount: trades.netAmount,
      strategyId: trades.strategyId,
    })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        eq(sql`date(${trades.tradeDate})`, tradeDate),
        isNotNull(trades.strategyId)
      )
    );

  if (tradesForDate.length === 0) {
    return;
  }

  // Group trades by strategy
  const tradesByStrategy = new Map<string, typeof tradesForDate>();
  for (const trade of tradesForDate) {
    if (!trade.strategyId) continue;
    if (!tradesByStrategy.has(trade.strategyId)) {
      tradesByStrategy.set(trade.strategyId, []);
    }
    tradesByStrategy.get(trade.strategyId)!.push(trade);
  }

  // For each strategy, create journal entry and triage record
  for (const [strategyId, strategyTrades] of tradesByStrategy.entries()) {
    // Get strategy info including direction and status for triage display
    const [strategyInfo] = await db
      .select({
        strategyKey: strategies.strategyKey,
        templateLabel: strategyTemplates.label,
        direction: strategies.direction,
        status: strategies.status,
      })
      .from(strategies)
      .innerJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (!strategyInfo) continue;

    // Skip rejected and complete strategies - they're closed and shouldn't generate triage records
    // New activity on these underlyings should create new strategies rather than trigger on closed ones
    if (strategyInfo.status === 'rejected' || strategyInfo.status === 'complete') continue;

    // Calculate aggregates
    // Note: quantity in the trades table is already signed (negative for SELL)
    const totalQty = strategyTrades.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
    const totalPremium = strategyTrades.reduce((sum, t) => sum + (Number(t.netAmount) || 0), 0);
    const primarySymbol = strategyTrades[0]?.symbol || 'UNKNOWN';
    const primaryConid = strategyTrades[0]?.conid;
    const side = totalQty >= 0 ? 'BUY' : 'SELL';

    // Build unmatchedTradeExecutions for triage record (grouped by conid/symbol)
    const tradesByPosition = new Map<string, { conid: number | null; ticker: string; tradeIds: string[]; qtyChange: number }>();
    for (const trade of strategyTrades) {
      const key = trade.conid ? `conid:${trade.conid}` : `symbol:${trade.symbol}`;
      if (!tradesByPosition.has(key)) {
        tradesByPosition.set(key, {
          conid: trade.conid,
          ticker: trade.symbol,
          tradeIds: [],
          qtyChange: 0,
        });
      }
      const entry = tradesByPosition.get(key)!;
      entry.tradeIds.push(trade.id);
      // quantity is already signed in the database (negative for SELL)
      entry.qtyChange += Number(trade.quantity) || 0;
    }
    const unmatchedTradeExecutions = Array.from(tradesByPosition.values());

    // Check if we already have a triage record for this strategy + date + rule_set
    const existingTriage = await db
      .select({ id: triageRecords.id })
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.snapshotDate, tradeDate),
          eq(triageRecords.ruleSet, 'trade_ingestion_v1')
        )
      )
      .limit(1);

    // Build notes with trade details (similar to QUANTITY_CHANGE pattern)
    const notesData = {
      side,
      totalQty,
      totalPremium,
      tradeCount: strategyTrades.length,
      executions: unmatchedTradeExecutions,
    };

    if (existingTriage.length > 0) {
      // Update existing triage record with new trade IDs
      await db
        .update(triageRecords)
        .set({
          unmatchedTradeExecutions,
          notes: JSON.stringify(notesData),
          updatedAt: new Date(),
        })
        .where(eq(triageRecords.id, existingTriage[0].id));
      continue;
    }

    // Delete any existing quantity_change_v1 records for this strategy + date
    // This handles the race condition where positions are processed before trades,
    // creating QUANTITY_CHANGE records that should be superseded by TRADE_INGESTION
    await db
      .delete(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.snapshotDate, tradeDate),
          eq(triageRecords.ruleSet, 'quantity_change_v1')
        )
      );

    // Create triage record
    // Use TRADE_INGESTION as recommendedAction (like QUANTITY_CHANGE) for UI compatibility
    const [triageRecord] = await db
      .insert(triageRecords)
      .values({
        snapshotDate: tradeDate,
        accountId,
        strategyId,
        positionId: null,
        contextLevel: 'strategy',
        ruleSet: 'trade_ingestion_v1',
        symbol: primarySymbol,
        severity: 'urgent', // Trades require immediate attention to capture metadata
        status: 'inbox',
        direction: strategyInfo.direction,
        recommendedAction: 'TRADE_INGESTION',
        notes: JSON.stringify(notesData),
        unmatchedTradeExecutions,
      })
      .returning({ id: triageRecords.id });

    // Create journal entry
    await logToJournal({
      objectType: 'strategy',
      objectId: strategyId,
      objectTitle: strategyInfo.strategyKey,
      actionType: 'trade_ingested',
      actionDescription: `Trade ingested: ${side} ${Math.abs(totalQty)} ${primarySymbol} (${strategyTrades.length} execution${strategyTrades.length > 1 ? 's' : ''})`,
      triageRecordId: triageRecord.id,
      source: 'automation',
      newState: {
        conid: primaryConid,
        qtyChange: totalQty,
        tradeCount: strategyTrades.length,
        premiumChange: totalPremium,
      },
      metadata: {
        tradeIds: strategyTrades.map(t => t.id),
        tradeDate,
        triageRecordId: triageRecord.id,
      },
    });
  }
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

          // Create trade ingestion journal entries and triage records
          // This must happen after auto-linking so trades have strategy IDs
          await createTradeIngestionRecords(accountId, tradeDate);

          // Strategy metrics
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

