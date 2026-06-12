import { db } from '@/db';
import {
  positions,
  portfolioSnapshots,
  strategyMetricsSnapshots,
  trades,
  NewStrategyMetricsSnapshot,
} from '@/db/schema';
import { and, eq, sql, isNotNull, gte, lte } from 'drizzle-orm';
import { computeStrategyRealizedToDate } from './realizedPnl';

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

  // 2. Get total portfolio NAV (USD) across ALL accounts for this date.
  // Strategy size as % of NAV must use total portfolio NAV, not per-account NAV,
  // because positions are spread across multiple exchange accounts and per-account
  // percentages are misleading for risk sizing.
  const totalNavResult = await db
    .select({
      totalNavUsd: sql<string>`COALESCE(SUM(CAST(${portfolioSnapshots.navAtSnapshotUsd} AS NUMERIC)), 0)`,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.snapshotDate, snapshotDate),
        eq(portfolioSnapshots.level, 'account')
      )
    );

  const navAtSnapshot = totalNavResult[0]?.totalNavUsd && parseFloat(totalNavResult[0].totalNavUsd) > 0
    ? totalNavResult[0].totalNavUsd
    : null;

  // 3. Compute total_abs_notional (prefer marketValueUsd for cross-currency consistency)
  // Policy: Absolute notional is always positive - sum of absolute values of each position's market value
  let totalAbsNotional: string | null = null;
  if (strategyPositions.length > 0) {
    const absNotionalSum = strategyPositions.reduce((sum, pos) => {
      // Primary: use marketValueUsd (always populated for live data)
      if (pos.marketValueUsd) {
        const val = parseFloat(pos.marketValueUsd);
        if (!isNaN(val)) return sum + Math.abs(val);
      }
      // Fallback: absNotionalUsd (legacy IBKR)
      if (pos.absNotionalUsd) {
        const val = parseFloat(pos.absNotionalUsd);
        if (!isNaN(val)) return sum + Math.abs(val);
      }
      // Fallback: raw absNotional
      if (pos.absNotional) {
        const val = parseFloat(pos.absNotional);
        if (!isNaN(val)) return sum + Math.abs(val);
      }
      // Last resort: compute from quantity * spot * multiplier
      if (pos.spot && pos.quantity) {
        const qty = parseFloat(pos.quantity);
        const spot = parseFloat(pos.spot);
        const mult = pos.multiplier ? parseFloat(pos.multiplier) : 1;
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

  // 8. Realized PnL through this date (W4 — flow-based average cost over
  // linked trades; see src/lib/derived/realizedPnl.ts)
  const realized = await computeStrategyRealizedToDate(accountId, strategyId, snapshotDate);
  const realizedPnlToDate =
    realized.confidence === 'no_trades' ? null : realized.realizedPnlToDate.toFixed(2);
  const cumulativePnl =
    realizedPnlToDate !== null || totalUnrealizedPnl !== null
      ? ((realizedPnlToDate ? parseFloat(realizedPnlToDate) : 0) +
          (totalUnrealizedPnl ? parseFloat(totalUnrealizedPnl) : 0)).toFixed(2)
      : null;

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
    realizedPnlToDate,
    cumulativePnl,
    realizedConfidence: realized.confidence,
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
        cumulativePnl: metrics.cumulativePnl,
        realizedConfidence: metrics.realizedConfidence,
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

  // A strategy whose positions vanished produces no dated rows above, so the
  // close-day realized PnL would never land anywhere and the series would end
  // frozen on the last unrealized mark. Write the terminal snapshot.
  count += await writeClosingSnapshotIfNeeded(accountId, strategyId);

  return count;
}

/**
 * If the strategy's positions have vanished from the account's snapshots,
 * write one terminal metrics row on the close date: unrealized 0, realized
 * through that date, cumulative = realized. Idempotent (keyed upsert).
 * Returns 1 if a closing row was written, 0 otherwise.
 */
export async function writeClosingSnapshotIfNeeded(
  accountId: string,
  strategyId: string
): Promise<number> {
  // Strategy's last day with open positions
  const lastPosResult = await db
    .select({ last: sql<string | null>`MAX(${positions.snapshotDate})` })
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.strategyId, strategyId),
        sql`${positions.quantity} != 0`
      )
    );
  const lastPosDate = lastPosResult[0]?.last;
  if (!lastPosDate) return 0; // never had positions

  // Does the account's position data extend past that day? If not, we can't
  // distinguish "closed" from "not ingested yet".
  const nextAcctSnapResult = await db
    .select({ next: sql<string | null>`MIN(${positions.snapshotDate})` })
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        sql`${positions.snapshotDate} > ${lastPosDate}`,
        sql`${positions.quantity} != 0`
      )
    );
  const nextAcctSnapDate = nextAcctSnapResult[0]?.next;
  if (!nextAcctSnapDate) return 0; // strategy still open (or account stale)

  // Close date: the closing trade's date when we have it (it post-dates the
  // last position snapshot), else the account's next snapshot day.
  const lastTradeResult = await db
    .select({ last: sql<string | null>`MAX(${trades.tradeDate}::date)::text` })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.strategyId, strategyId)));
  const lastTradeDate = lastTradeResult[0]?.last;
  const closeDate =
    lastTradeDate && lastTradeDate > lastPosDate ? lastTradeDate : nextAcctSnapDate;

  // Already terminal? (idempotency — also covers re-runs after reopen)
  const existing = await db
    .select({ id: strategyMetricsSnapshots.id })
    .from(strategyMetricsSnapshots)
    .where(
      and(
        eq(strategyMetricsSnapshots.accountId, accountId),
        eq(strategyMetricsSnapshots.strategyId, strategyId),
        eq(strategyMetricsSnapshots.snapshotDate, closeDate),
        eq(strategyMetricsSnapshots.totalUnrealizedPnl, '0')
      )
    )
    .limit(1);
  if (existing.length > 0) return 0;

  const realized = await computeStrategyRealizedToDate(accountId, strategyId, closeDate);
  const realizedPnlToDate =
    realized.confidence === 'no_trades' ? null : realized.realizedPnlToDate.toFixed(2);

  await upsertStrategyMetrics({
    accountId,
    strategyId,
    snapshotDate: closeDate,
    totalAbsNotional: '0',
    totalUnrealizedPnl: '0',
    navAtSnapshot: null,
    pctNavAbsNotional: null,
    numOpenPositions: null,
    minDte: null,
    maxDte: null,
    realizedPnlToDate,
    cumulativePnl: realizedPnlToDate,
    realizedConfidence: realized.confidence,
  });
  return 1;
}

