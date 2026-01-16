import { db } from '@/db';
import {
  positions,
  navSnapshots,
  strategyMetricsSnapshots,
  NewStrategyMetricsSnapshot,
} from '@/db/schema';
import { and, eq, sql, isNotNull, gte, lte } from 'drizzle-orm';

export interface StrategyMetricsInput {
  accountId: string;
  strategyId: string;
  snapshotDate: string; // 'YYYY-MM-DD'
}

/**
 * Computes strategy metrics for a given account, strategy, and snapshot date.
 * Aggregates from positions and nav_snapshots.
 */
export async function computeStrategyMetrics(
  input: StrategyMetricsInput
): Promise<NewStrategyMetricsSnapshot> {
  const { accountId, strategyId, snapshotDate } = input;

  // 1. Collect positions for this strategy/account/date
  const strategyPositions = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.strategyId, strategyId),
        eq(positions.snapshotDate, snapshotDate),
        sql`${positions.quantity} != 0`
      )
    );

  // 2. Get NAV for this account/date
  const navResult = await db
    .select()
    .from(navSnapshots)
    .where(and(eq(navSnapshots.accountId, accountId), eq(navSnapshots.reportDate, snapshotDate)))
    .limit(1);

  const navAtSnapshot = navResult[0]?.total ?? null;

  // 3. Compute total_abs_notional
  // Policy: Absolute notional is always positive - sum of absolute values of each position's notional
  let totalAbsNotional: string | null = null;
  if (strategyPositions.length > 0) {
  const absNotionalSum = strategyPositions.reduce((sum, pos) => {
      // First try: use stored absNotional (take absolute value in case it's negative)
    if (pos.absNotional) {
        const val = parseFloat(pos.absNotional);
        if (!isNaN(val)) {
          return sum + Math.abs(val);
        }
    }
      // Fallback: compute from quantity * spot * multiplier (always positive)
    if (pos.spot && pos.multiplier && pos.quantity) {
      const qty = parseFloat(pos.quantity);
      const spot = parseFloat(pos.spot);
      const mult = parseFloat(pos.multiplier);
        if (!isNaN(qty) && !isNaN(spot) && !isNaN(mult)) {
      return sum + Math.abs(qty * spot * mult);
        }
    }
    return sum;
  }, 0);
    // Always set a value if we have positions (even if sum is 0, that's valid)
    totalAbsNotional = absNotionalSum.toString();
  }

  // 4. Compute total_unrealized_pnl
  let totalUnrealizedPnl: string | null = null;
  const pnlSum = strategyPositions.reduce((sum, pos) => {
    if (pos.unrealizedPnl) {
      return sum + parseFloat(pos.unrealizedPnl);
    }
    return sum;
  }, 0);
  totalUnrealizedPnl = pnlSum !== 0 ? pnlSum.toString() : null;

  // 5. Compute pct_nav_abs_notional
  let pctNavAbsNotional: string | null = null;
  if (navAtSnapshot && parseFloat(navAtSnapshot) > 0 && totalAbsNotional) {
    const pct = (parseFloat(totalAbsNotional) / parseFloat(navAtSnapshot)) * 100;
    pctNavAbsNotional = pct.toString();
  }

  // 6. Count open positions (distinct by symbol/expiry/strike/option_right)
  const positionKeys = new Set<string>();
  strategyPositions.forEach((pos) => {
    if (parseFloat(pos.quantity) !== 0) {
      const key = `${pos.symbol}|${pos.expiry ?? ''}|${pos.strike ?? ''}|${pos.optionRight ?? ''}`;
      positionKeys.add(key);
    }
  });
  const numOpenPositions = positionKeys.size;

  // 7. Compute min_dte / max_dte for options
  let minDte: number | null = null;
  let maxDte: number | null = null;
  const snapshotDateObj = new Date(snapshotDate + 'T00:00:00Z');

  const optionPositions = strategyPositions.filter(
    (pos) => pos.assetClass === 'OPT' && pos.expiry && parseFloat(pos.quantity) !== 0
  );

  if (optionPositions.length > 0) {
    const dteValues: number[] = [];
    optionPositions.forEach((pos) => {
      if (pos.expiry) {
        const expiryDate = new Date(pos.expiry + 'T00:00:00Z');
        const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) {
          dteValues.push(diffDays);
        }
      }
    });

    if (dteValues.length > 0) {
      minDte = Math.min(...dteValues);
      maxDte = Math.max(...dteValues);
    }
  }

  // DEPRECATED fields (kept in schema for backwards compatibility, always null):
  // - realizedPnlToDate: Requires complex closing trade logic, never implemented
  // - stateCode: Replaced by strategy signals system

  return {
    accountId,
    strategyId,
    snapshotDate,
    totalAbsNotional,
    totalUnrealizedPnl,
    navAtSnapshot,
    pctNavAbsNotional,
    numOpenPositions: numOpenPositions > 0 ? numOpenPositions : null,
    minDte,
    maxDte,
    realizedPnlToDate: null,
    stateCode: null,
  };
}

/**
 * Upserts strategy metrics snapshot into the database
 */
export async function upsertStrategyMetrics(
  metrics: NewStrategyMetricsSnapshot
): Promise<void> {
  await db
    .insert(strategyMetricsSnapshots)
    .values(metrics)
    .onConflictDoUpdate({
      target: [
        strategyMetricsSnapshots.accountId,
        strategyMetricsSnapshots.strategyId,
        strategyMetricsSnapshots.snapshotDate,
      ],
      set: {
        totalAbsNotional: metrics.totalAbsNotional,
        totalUnrealizedPnl: metrics.totalUnrealizedPnl,
        navAtSnapshot: metrics.navAtSnapshot,
        pctNavAbsNotional: metrics.pctNavAbsNotional,
        numOpenPositions: metrics.numOpenPositions,
        minDte: metrics.minDte,
        maxDte: metrics.maxDte,
        realizedPnlToDate: metrics.realizedPnlToDate,
        stateCode: metrics.stateCode,
        updatedAt: new Date(),
      },
    });
}

/**
 * Computes and upserts strategy metrics for a date range
 */
export async function computeStrategyMetricsForDateRange(
  accountId: string,
  strategyId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  // Get all unique snapshot dates in range from positions
  const dateResults = await db
    .selectDistinct({ snapshotDate: positions.snapshotDate })
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.strategyId, strategyId),
        isNotNull(positions.snapshotDate),
        gte(positions.snapshotDate, startDate),
        lte(positions.snapshotDate, endDate),
        sql`${positions.quantity} != 0`
      )
    );

  let count = 0;
  for (const { snapshotDate } of dateResults) {
    if (!snapshotDate) continue;
    const metrics = await computeStrategyMetrics({
      accountId,
      strategyId,
      snapshotDate,
    });
    await upsertStrategyMetrics(metrics);
    count++;
  }

  return count;
}

