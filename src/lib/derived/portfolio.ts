import { db } from '@/db';
import {
  positions,
  navSnapshots,
  cashBalances,
  portfolioSnapshots,
  NewPortfolioSnapshot,
} from '@/db/schema';
import { and, eq, sql, isNotNull, gte, lte } from 'drizzle-orm';

interface NotionalSums {
  totalAbsNotional: string | null;
  totalUnrealizedPnl: string | null;
  absStockNotional: string | null;
  absOptionNotional: string | null;
  absCryptoSpotNotional: string | null;
  absPerpNotional: string | null;
}

/**
 * Computes notional sums by asset class from a set of positions.
 * Splits into 4 segments: STK, OPT, CRYPTO, PERP.
 */
function computeNotionalSums(
  positionRows: { absNotional: string | null; spot: string | null; multiplier: string | null; quantity: string | null; unrealizedPnl: string | null; assetClass: string | null }[]
): NotionalSums {
  let totalNotionalSum = 0;
  let totalPnlSum = 0;
  let stockNotionalSum = 0;
  let optionNotionalSum = 0;
  let cryptoSpotNotionalSum = 0;
  let perpNotionalSum = 0;

  for (const pos of positionRows) {
    // Policy: Absolute notional is always positive
    let notional = 0;
    if (pos.absNotional) {
      const val = parseFloat(pos.absNotional);
      if (!isNaN(val)) {
        notional = Math.abs(val);
      }
    }
    // Fallback: compute from quantity * spot * multiplier if absNotional is missing
    if (notional === 0 && pos.spot && pos.multiplier && pos.quantity) {
      const qty = parseFloat(pos.quantity);
      const spot = parseFloat(pos.spot);
      const mult = parseFloat(pos.multiplier);
      if (!isNaN(qty) && !isNaN(spot) && !isNaN(mult)) {
        notional = Math.abs(qty * spot * mult);
      }
    }
    const pnl = pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0;

    totalNotionalSum += notional;
    totalPnlSum += pnl;

    if (pos.assetClass === 'STK') {
      stockNotionalSum += notional;
    } else if (pos.assetClass === 'OPT') {
      optionNotionalSum += notional;
    } else if (pos.assetClass === 'CRYPTO') {
      cryptoSpotNotionalSum += notional;
    } else if (pos.assetClass === 'PERP') {
      perpNotionalSum += notional;
    }
  }

  return {
    totalAbsNotional: totalNotionalSum > 0 ? totalNotionalSum.toString() : null,
    totalUnrealizedPnl: totalPnlSum !== 0 ? totalPnlSum.toString() : null,
    absStockNotional: stockNotionalSum > 0 ? stockNotionalSum.toString() : null,
    absOptionNotional: optionNotionalSum > 0 ? optionNotionalSum.toString() : null,
    absCryptoSpotNotional: cryptoSpotNotionalSum > 0 ? cryptoSpotNotionalSum.toString() : null,
    absPerpNotional: perpNotionalSum > 0 ? perpNotionalSum.toString() : null,
  };
}

export interface PortfolioSnapshotInput {
  accountId: string;
  snapshotDate: string; // 'YYYY-MM-DD'
  level: 'account' | 'underlying';
  underlyingId?: string;
}

/**
 * Computes account-level portfolio snapshot
 */
async function computeAccountLevelSnapshot(
  accountId: string,
  snapshotDate: string
): Promise<NewPortfolioSnapshot> {
  // Collect all positions for this account/date
  const accountPositions = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.snapshotDate, snapshotDate),
        sql`${positions.quantity} != 0`
      )
    );

  // Get NAV
  const navResult = await db
    .select()
    .from(navSnapshots)
    .where(and(eq(navSnapshots.accountId, accountId), eq(navSnapshots.reportDate, snapshotDate)))
    .limit(1);

  const navRow = navResult[0] ?? null;
  const authoritativeNav = navRow?.total ?? null;

  // Compute aggregates
  const sums = computeNotionalSums(accountPositions);

  // Query total cash (USD equivalent) from cash_balances
  const cashResult = await db
    .select({
      totalCashUsd: sql<string>`COALESCE(SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC)), 0)`,
    })
    .from(cashBalances)
    .where(
      and(
        eq(cashBalances.accountId, accountId),
        eq(cashBalances.snapshotDate, snapshotDate)
      )
    );
  const totalCashUsd = parseFloat(cashResult[0]?.totalCashUsd ?? '0');

  // Determine effective NAV:
  // - If nav_snapshots has a row (IBKR, HyperLiquid) → use authoritative NAV
  // - Otherwise (Coinbase, Kraken, Deribit, Solana) → NAV = positions + cash
  let effectiveNav: number | null = null;
  if (authoritativeNav) {
    effectiveNav = parseFloat(authoritativeNav);
  } else {
    const positionValue = sums.totalAbsNotional ? parseFloat(sums.totalAbsNotional) : 0;
    if (positionValue > 0 || totalCashUsd !== 0) {
      effectiveNav = positionValue + totalCashUsd;
    }
  }

  const navAtSnapshot = effectiveNav?.toString() ?? null;

  // Compute pct_nav_abs_notional
  let pctNavAbsNotional: string | null = null;
  if (effectiveNav && effectiveNav > 0 && sums.totalAbsNotional) {
    const pct = (parseFloat(sums.totalAbsNotional) / effectiveNav) * 100;
    pctNavAbsNotional = pct.toString();
  }

  // Compute leverage ratio (gross exposure / NAV)
  let leverageRatio: string | null = null;
  if (effectiveNav && effectiveNav > 0 && sums.totalAbsNotional) {
    leverageRatio = (parseFloat(sums.totalAbsNotional) / effectiveNav).toString();
  }

  return {
    accountId,
    snapshotDate,
    level: 'account',
    underlyingId: null,
    ...sums,
    navAtSnapshot,
    pctNavAbsNotional,
    totalCashUsd: totalCashUsd !== 0 ? totalCashUsd.toString() : null,
    leverageRatio,
  };
}

/**
 * Computes underlying-level portfolio snapshot
 */
async function computeUnderlyingLevelSnapshot(
  accountId: string,
  snapshotDate: string,
  underlyingId: string
): Promise<NewPortfolioSnapshot> {
  // Collect positions for this account/date/underlying
  const underlyingPositions = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.snapshotDate, snapshotDate),
        eq(positions.underlyingId, underlyingId),
        sql`${positions.quantity} != 0`
      )
    );

  // Get NAV (same as account-level)
  const navResult = await db
    .select()
    .from(navSnapshots)
    .where(and(eq(navSnapshots.accountId, accountId), eq(navSnapshots.reportDate, snapshotDate)))
    .limit(1);

  const navAtSnapshot = navResult[0]?.total ?? null;

  // Compute aggregates
  const sums = computeNotionalSums(underlyingPositions);

  // Compute pct_nav_abs_notional
  let pctNavAbsNotional: string | null = null;
  if (navAtSnapshot && parseFloat(navAtSnapshot) > 0 && sums.totalAbsNotional) {
    const pct = (parseFloat(sums.totalAbsNotional) / parseFloat(navAtSnapshot)) * 100;
    pctNavAbsNotional = pct.toString();
  }

  return {
    accountId,
    snapshotDate,
    level: 'underlying',
    underlyingId,
    ...sums,
    navAtSnapshot,
    pctNavAbsNotional,
  };
}

/**
 * Computes portfolio snapshot for given input
 */
export async function computePortfolioSnapshot(
  input: PortfolioSnapshotInput
): Promise<NewPortfolioSnapshot> {
  if (input.level === 'account') {
    return computeAccountLevelSnapshot(input.accountId, input.snapshotDate);
  } else {
    if (!input.underlyingId) {
      throw new Error('underlyingId is required for underlying-level snapshots');
    }
    return computeUnderlyingLevelSnapshot(
      input.accountId,
      input.snapshotDate,
      input.underlyingId
    );
  }
}

/**
 * Upserts portfolio snapshot into the database
 */
export async function upsertPortfolioSnapshot(
  snapshot: NewPortfolioSnapshot
): Promise<void> {
  if (snapshot.level === 'account') {
    await db
      .delete(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.accountId, snapshot.accountId),
          eq(portfolioSnapshots.snapshotDate, snapshot.snapshotDate),
          eq(portfolioSnapshots.level, 'account')
        )
      );
  } else if (snapshot.underlyingId) {
    await db
      .delete(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.accountId, snapshot.accountId),
          eq(portfolioSnapshots.snapshotDate, snapshot.snapshotDate),
          eq(portfolioSnapshots.level, 'underlying'),
          eq(portfolioSnapshots.underlyingId, snapshot.underlyingId)
        )
      );
  }

  await db.insert(portfolioSnapshots).values(snapshot);
}

/**
 * Computes portfolio snapshots for a date range
 * Optionally includes underlying-level snapshots (only for latest date by default)
 */
export async function computePortfolioSnapshotsForDateRange(
  accountId: string,
  startDate: string,
  endDate: string,
  includeUnderlyings: boolean = false,
  onlyLatestForUnderlyings: boolean = true
): Promise<{ account: number; underlying: number }> {
  // Get all unique snapshot dates in range from positions
  const dateResults = await db
    .selectDistinct({ snapshotDate: positions.snapshotDate })
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        isNotNull(positions.snapshotDate),
        gte(positions.snapshotDate, startDate),
        lte(positions.snapshotDate, endDate),
        sql`${positions.quantity} != 0`
      )
    );

  let accountCount = 0;
  let underlyingCount = 0;

  // Determine which dates to process for underlying-level
  const underlyingDates = onlyLatestForUnderlyings
    ? [dateResults[dateResults.length - 1]?.snapshotDate].filter(Boolean)
    : dateResults.map((d) => d.snapshotDate).filter(Boolean);

  for (const { snapshotDate } of dateResults) {
    if (!snapshotDate) continue;

    // Account-level snapshot
    const accountSnapshot = await computePortfolioSnapshot({
      accountId,
      snapshotDate,
      level: 'account',
    });
    await upsertPortfolioSnapshot(accountSnapshot);
    accountCount++;

    // Underlying-level snapshots (if requested and for appropriate dates)
    if (includeUnderlyings && underlyingDates.includes(snapshotDate)) {
      // Get all unique underlyings for this date
      const underlyingResults = await db
        .selectDistinct({ underlyingId: positions.underlyingId })
        .from(positions)
        .where(
          and(
            eq(positions.accountId, accountId),
            eq(positions.snapshotDate, snapshotDate),
            isNotNull(positions.underlyingId),
            sql`${positions.quantity} != 0`
          )
        );

      for (const { underlyingId } of underlyingResults) {
        if (!underlyingId) continue;
        const underlyingSnapshot = await computePortfolioSnapshot({
          accountId,
          snapshotDate,
          level: 'underlying',
          underlyingId,
        });
        await upsertPortfolioSnapshot(underlyingSnapshot);
        underlyingCount++;
      }
    }
  }

  return { account: accountCount, underlying: underlyingCount };
}

