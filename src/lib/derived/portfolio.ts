import { db } from '@/db';
import {
  positions,
  navSnapshots,
  cashBalances,
  portfolioSnapshots,
  NewPortfolioSnapshot,
} from '@/db/schema';
import { and, eq, sql, isNotNull, gte, lte } from 'drizzle-orm';
import { getFxRate } from '@/lib/fx/get-fx-rate';

interface NotionalSums {
  totalAbsNotional: string | null;
  totalAbsNotionalUsd: string | null;
  totalUnrealizedPnl: string | null;
  absStockNotional: string | null;
  absOptionNotional: string | null;
  absCryptoSpotNotional: string | null;
  absPerpNotional: string | null;
  // For NAV calculation: non-perp notional + perp unrealized PnL
  // (perp notional is exposure, not value; cash includes perp margin)
  navPositionValue: string | null;
  perpUnrealizedPnl: string | null;
}

/**
 * Computes notional sums by asset class from a set of positions.
 * Splits into 4 segments: STK, OPT, CRYPTO, PERP.
 *
 * For NAV calculation, perp positions contribute their unrealized PnL (not notional)
 * because perp notional is exposure, not equity value. The perp margin is already
 * included in the cash balance.
 */
function computeNotionalSums(
  positionRows: { marketValueUsd: string | null; absNotional: string | null; absNotionalUsd: string | null; spot: string | null; multiplier: string | null; quantity: string | null; unrealizedPnl: string | null; assetClass: string | null }[]
): NotionalSums {
  let totalNotionalSum = 0;
  let totalNotionalUsdSum = 0;
  let totalPnlSum = 0;
  let stockNotionalSum = 0;
  let optionNotionalSum = 0;
  let cryptoSpotNotionalSum = 0;
  let perpNotionalSum = 0;
  let perpPnlSum = 0;

  for (const pos of positionRows) {
    // Primary: use marketValueUsd (always populated for live data)
    let notionalUsd = 0;
    if (pos.marketValueUsd) {
      const val = parseFloat(pos.marketValueUsd);
      if (!isNaN(val)) notionalUsd = Math.abs(val);
    }
    // Fallback chain for historical data pre-backfill
    if (notionalUsd === 0 && pos.absNotionalUsd) {
      const val = parseFloat(pos.absNotionalUsd);
      if (!isNaN(val)) notionalUsd = Math.abs(val);
    }
    if (notionalUsd === 0 && pos.absNotional) {
      const val = parseFloat(pos.absNotional);
      if (!isNaN(val)) notionalUsd = Math.abs(val);
    }
    if (notionalUsd === 0 && pos.spot && pos.quantity) {
      const qty = parseFloat(pos.quantity);
      const spot = parseFloat(pos.spot);
      const mult = pos.multiplier ? parseFloat(pos.multiplier) : 1;
      if (!isNaN(qty) && !isNaN(spot) && !isNaN(mult)) {
        notionalUsd = Math.abs(qty * spot * mult);
      }
    }

    // Use unified USD value for both local and USD sums
    const notional = notionalUsd;

    const pnl = pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0;

    totalNotionalSum += notional;
    totalNotionalUsdSum += notionalUsd;
    totalPnlSum += pnl;

    if (pos.assetClass === 'PERP') {
      perpNotionalSum += notional;
      perpPnlSum += pnl;
    } else if (pos.assetClass === 'STK') {
      stockNotionalSum += notional;
    } else if (pos.assetClass === 'OPT') {
      optionNotionalSum += notional;
    } else if (pos.assetClass === 'CRYPTO') {
      cryptoSpotNotionalSum += notional;
    } else {
      // REAL_ESTATE, FIAT, BOND, ETF, etc. — count as non-perp for NAV
      stockNotionalSum += notional;
    }
  }

  // NAV position value: non-perp notional + perp unrealized PnL
  // Perp notional is exposure (for leverage calculation), not equity value
  const nonPerpNotional = stockNotionalSum + optionNotionalSum + cryptoSpotNotionalSum;
  const navPositionValue = nonPerpNotional + perpPnlSum;

  return {
    totalAbsNotional: totalNotionalSum > 0 ? totalNotionalSum.toString() : null,
    totalAbsNotionalUsd: totalNotionalUsdSum > 0 ? totalNotionalUsdSum.toString() : null,
    totalUnrealizedPnl: totalPnlSum !== 0 ? totalPnlSum.toString() : null,
    absStockNotional: stockNotionalSum > 0 ? stockNotionalSum.toString() : null,
    absOptionNotional: optionNotionalSum > 0 ? optionNotionalSum.toString() : null,
    absCryptoSpotNotional: cryptoSpotNotionalSum > 0 ? cryptoSpotNotionalSum.toString() : null,
    absPerpNotional: perpNotionalSum > 0 ? perpNotionalSum.toString() : null,
    navPositionValue: navPositionValue !== 0 ? navPositionValue.toString() : null,
    perpUnrealizedPnl: perpPnlSum !== 0 ? perpPnlSum.toString() : null,
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
  const navCurrency = navRow?.currency ?? null;

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
  // - If nav_snapshots has a row (IBKR) → use authoritative NAV (in account base currency)
  // - Otherwise → NAV = navPositionValue + cash
  //   where navPositionValue = non-perp notional + perp unrealized PnL
  //   (perp notional is exposure, not equity; perp margin is in cash)
  let effectiveNav: number | null = null;
  let effectiveNavUsd: number | null = null;

  if (authoritativeNav) {
    effectiveNav = parseFloat(authoritativeNav);
    // Convert authoritative NAV to USD using FX rate
    if (navCurrency && navCurrency !== 'USD' && effectiveNav) {
      const rate = await getFxRate(navCurrency, 'USD', snapshotDate);
      if (rate) {
        effectiveNavUsd = effectiveNav * rate;
      }
    } else {
      effectiveNavUsd = effectiveNav; // Already USD
    }
  } else {
    // Derived NAV: navPositionValue + cash (both effectively in USD for crypto)
    const positionValue = sums.navPositionValue ? parseFloat(sums.navPositionValue) : 0;
    if (positionValue !== 0 || totalCashUsd !== 0) {
      effectiveNav = positionValue + totalCashUsd;
      effectiveNavUsd = effectiveNav; // Derived NAV is already USD
    }
  }

  const navAtSnapshot = effectiveNav?.toString() ?? null;
  const navAtSnapshotUsd = effectiveNavUsd?.toString() ?? null;

  // Compute pct_nav_abs_notional and leverage from USD-normalized values
  let pctNavAbsNotional: string | null = null;
  if (effectiveNavUsd && effectiveNavUsd > 0 && sums.totalAbsNotionalUsd) {
    const pct = (parseFloat(sums.totalAbsNotionalUsd) / effectiveNavUsd) * 100;
    pctNavAbsNotional = pct.toString();
  }

  // Compute leverage ratio from USD values (gross exposure / NAV)
  let leverageRatio: string | null = null;
  if (effectiveNavUsd && effectiveNavUsd > 0 && sums.totalAbsNotionalUsd) {
    leverageRatio = (parseFloat(sums.totalAbsNotionalUsd) / effectiveNavUsd).toString();
  }

  return {
    accountId,
    snapshotDate,
    level: 'account',
    underlyingId: null,
    ...sums,
    navAtSnapshot,
    navAtSnapshotUsd,
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

  // Get account-level snapshot for NAV USD (already computed)
  const accountSnapshot = await db
    .select({
      navAtSnapshot: portfolioSnapshots.navAtSnapshot,
      navAtSnapshotUsd: portfolioSnapshots.navAtSnapshotUsd,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.accountId, accountId),
        eq(portfolioSnapshots.snapshotDate, snapshotDate),
        eq(portfolioSnapshots.level, 'account')
      )
    )
    .limit(1);

  const navAtSnapshot = accountSnapshot[0]?.navAtSnapshot ?? null;
  const navAtSnapshotUsd = accountSnapshot[0]?.navAtSnapshotUsd ?? null;

  // Compute aggregates
  const sums = computeNotionalSums(underlyingPositions);

  // Compute pct_nav_abs_notional using USD values
  let pctNavAbsNotional: string | null = null;
  const navUsd = navAtSnapshotUsd ? parseFloat(navAtSnapshotUsd) : null;
  if (navUsd && navUsd > 0 && sums.totalAbsNotionalUsd) {
    const pct = (parseFloat(sums.totalAbsNotionalUsd) / navUsd) * 100;
    pctNavAbsNotional = pct.toString();
  }

  return {
    accountId,
    snapshotDate,
    level: 'underlying',
    underlyingId,
    ...sums,
    navAtSnapshot,
    navAtSnapshotUsd,
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
  // Get all unique snapshot dates in range from positions, nav_snapshots, and cash_balances
  // (nav_snapshots covers IBKR cash-only accounts; cash_balances covers crypto exchange
  //  cash-only accounts like Maisy_Kraken or TTC_FTX that have no positions or nav_snapshots)
  const positionDates = await db
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

  const navDates = await db
    .selectDistinct({ snapshotDate: navSnapshots.reportDate })
    .from(navSnapshots)
    .where(
      and(
        eq(navSnapshots.accountId, accountId),
        gte(navSnapshots.reportDate, startDate),
        lte(navSnapshots.reportDate, endDate)
      )
    );

  const cashDates = await db
    .selectDistinct({ snapshotDate: cashBalances.snapshotDate })
    .from(cashBalances)
    .where(
      and(
        eq(cashBalances.accountId, accountId),
        gte(cashBalances.snapshotDate, startDate),
        lte(cashBalances.snapshotDate, endDate)
      )
    );

  // Merge and deduplicate dates from all three sources
  const allDates = new Set<string>();
  for (const { snapshotDate } of positionDates) {
    if (snapshotDate) allDates.add(snapshotDate);
  }
  for (const { snapshotDate } of navDates) {
    if (snapshotDate) allDates.add(snapshotDate);
  }
  for (const { snapshotDate } of cashDates) {
    if (snapshotDate) allDates.add(snapshotDate);
  }
  const dateResults = Array.from(allDates).sort().map(d => ({ snapshotDate: d }));

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

