import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  accounts,
  assetTheses,
  cashBalances,
  portfolioSnapshots,
  positions,
  strategies,
  underlyings,
} from "@/db/schema";
import { toNumber } from "@/lib/numbers";

// Alias for parent underlying self-join
const parentUnderlyings = alias(underlyings, "parent_underlyings");

export interface PortfolioTrendPoint {
  date: string;
  totalAbsNotional: number | null;
  totalUnrealizedPnl: number | null;
  pctNavAbsNotional: number | null;
  absStockNotional: number | null;
  absOptionNotional: number | null;
  absCryptoSpotNotional: number | null;
  absPerpNotional: number | null;
  navAtSnapshot: number | null;
  totalCashUsd: number | null;
  leverageRatio: number | null;
}

export interface UnderlyingBreakdownRow {
  underlyingId: string;
  ticker: string | null;
  name: string | null;
  totalAbsNotional: number | null;
  totalUnrealizedPnl: number | null;
  pctNavAbsNotional: number | null;
}

export interface NavTrendPoint {
  date: string;
  nav: number | null;
}

export interface CashBreakdownRow {
  currency: string;
  balance: number;
  balanceUsd: number | null;
  source: string;
  accountId: string;
}

export interface OwnerBreakdownRow {
  owner: string;
  nav: number;
  accountCount: number;
}

export interface OwnerNavTimeSeriesPoint {
  date: string;
  owner: string;
  nav: number;
}

export interface PortfolioDashboardData {
  navTrend: NavTrendPoint[];
  accountSnapshots: PortfolioTrendPoint[];
  latestAccountSnapshot: PortfolioTrendPoint | null;
  underlyingBreakdown: UnderlyingBreakdownRow[];
  cashBreakdown: CashBreakdownRow[];
  ownerBreakdown: OwnerBreakdownRow[];
  ownerNavTimeSeries: OwnerNavTimeSeriesPoint[];
}

export async function getPortfolioDashboardData(
  accountId: string
): Promise<PortfolioDashboardData> {
  const accountRows = await db
    .select({
      snapshotDate: portfolioSnapshots.snapshotDate,
      totalAbsNotional: sql<string>`COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional})`,
      totalUnrealizedPnl: portfolioSnapshots.totalUnrealizedPnl,
      pctNavAbsNotional: portfolioSnapshots.pctNavAbsNotional,
      absStockNotional: portfolioSnapshots.absStockNotional,
      absOptionNotional: portfolioSnapshots.absOptionNotional,
      absCryptoSpotNotional: portfolioSnapshots.absCryptoSpotNotional,
      absPerpNotional: portfolioSnapshots.absPerpNotional,
      navAtSnapshot: sql<string>`COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot})`,
      totalCashUsd: portfolioSnapshots.totalCashUsd,
      leverageRatio: portfolioSnapshots.leverageRatio,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.accountId, accountId),
        eq(portfolioSnapshots.level, "account")
      )
    )
    .orderBy(desc(portfolioSnapshots.snapshotDate))
    .limit(90);

  const accountSnapshots = accountRows
    .map<PortfolioTrendPoint>((row) => ({
      date: row.snapshotDate,
      totalAbsNotional: toNumber(row.totalAbsNotional),
      totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
      pctNavAbsNotional: toNumber(row.pctNavAbsNotional),
      absStockNotional: toNumber(row.absStockNotional),
      absOptionNotional: toNumber(row.absOptionNotional),
      absCryptoSpotNotional: toNumber(row.absCryptoSpotNotional),
      absPerpNotional: toNumber(row.absPerpNotional),
      navAtSnapshot: toNumber(row.navAtSnapshot),
      totalCashUsd: toNumber(row.totalCashUsd),
      leverageRatio: toNumber(row.leverageRatio),
    }))
    .reverse();

  const latestAccountSnapshot =
    accountSnapshots.length > 0 ? accountSnapshots[accountSnapshots.length - 1] : null;

  const latestDate = latestAccountSnapshot?.date ?? null;

  const underlyingRows = latestDate
    ? await db
        .select({
          id: portfolioSnapshots.id,
          underlyingId: portfolioSnapshots.underlyingId,
          ticker: underlyings.ticker,
          name: underlyings.name,
          totalAbsNotional: sql<string>`COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional})`,
          totalUnrealizedPnl: portfolioSnapshots.totalUnrealizedPnl,
          pctNavAbsNotional: portfolioSnapshots.pctNavAbsNotional,
        })
        .from(portfolioSnapshots)
        .leftJoin(underlyings, eq(portfolioSnapshots.underlyingId, underlyings.id))
        .where(
          and(
            eq(portfolioSnapshots.accountId, accountId),
            eq(portfolioSnapshots.level, "underlying"),
            eq(portfolioSnapshots.snapshotDate, latestDate)
          )
        )
        .orderBy(desc(sql`COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional})`))
        .limit(15)
    : [];

  const underlyingBreakdown: UnderlyingBreakdownRow[] = underlyingRows
    .filter((row) => !!row.underlyingId)
    .map((row) => ({
      underlyingId: row.underlyingId!,
      ticker: row.ticker,
      name: row.name,
      totalAbsNotional: toNumber(row.totalAbsNotional),
      totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
      pctNavAbsNotional: toNumber(row.pctNavAbsNotional),
    }));

  // NAV trend sourced from portfolio_snapshots.navAtSnapshot
  // This captures all accounts (authoritative NAV for IBKR/HL, derived for others)
  const navTrend: NavTrendPoint[] = accountSnapshots
    .filter((s) => s.navAtSnapshot !== null)
    .map((s) => ({ date: s.date, nav: s.navAtSnapshot }));

  // Cash breakdown for latest date (per account + currency + source)
  const cashRows = latestDate
    ? await db
        .select({
          currency: cashBalances.currency,
          balance: sql<string>`SUM(CAST(${cashBalances.balance} AS NUMERIC))`,
          balanceUsd: sql<string>`SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC))`,
          source: cashBalances.source,
          accountId: cashBalances.accountId,
        })
        .from(cashBalances)
        .where(
          and(
            eq(cashBalances.accountId, accountId),
            eq(cashBalances.snapshotDate, latestDate)
          )
        )
        .groupBy(cashBalances.currency, cashBalances.source, cashBalances.accountId)
        .orderBy(desc(sql`SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC))`))
    : [];

  const cashBreakdown: CashBreakdownRow[] = cashRows.map((row) => ({
    currency: row.currency,
    balance: parseFloat(row.balance) || 0,
    balanceUsd: row.balanceUsd ? parseFloat(row.balanceUsd) : null,
    source: row.source,
    accountId: row.accountId,
  }));

  // For single account, fetch owner from account record
  const accountRecord = await db
    .select({ owner: accounts.owner })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const owner = accountRecord[0]?.owner ?? "Unknown";
  const ownerBreakdown: OwnerBreakdownRow[] = latestAccountSnapshot?.navAtSnapshot
    ? [{ owner, nav: latestAccountSnapshot.navAtSnapshot, accountCount: 1 }]
    : [];

  // Owner NAV time series — for single account, derive from existing snapshots
  const ownerNavTimeSeries: OwnerNavTimeSeriesPoint[] = accountSnapshots
    .filter((s) => s.navAtSnapshot !== null)
    .map((s) => ({ date: s.date, owner, nav: s.navAtSnapshot! }));

  return {
    navTrend,
    accountSnapshots,
    latestAccountSnapshot,
    underlyingBreakdown,
    cashBreakdown,
    ownerBreakdown,
    ownerNavTimeSeries,
  };
}

/**
 * Get aggregated portfolio dashboard data across multiple accounts.
 * Sums NAV, notional, and PnL values; groups underlyings by ticker.
 */
export async function getPortfolioDashboardDataMultiAccount(
  accountIds: string[]
): Promise<PortfolioDashboardData> {
  // Return empty data if no accounts selected
  if (accountIds.length === 0) {
    return {
      navTrend: [],
      accountSnapshots: [],
      latestAccountSnapshot: null,
      underlyingBreakdown: [],
      cashBreakdown: [],
      ownerBreakdown: [],
      ownerNavTimeSeries: [],
    };
  }

  // For single account, use the simpler query
  if (accountIds.length === 1) {
    return getPortfolioDashboardData(accountIds[0]);
  }

  // --- Aggregate account-level snapshots by date ---
  // Use USD-normalized columns (with fallback to raw for backwards compat)
  const accountRows = await db
    .select({
      snapshotDate: portfolioSnapshots.snapshotDate,
      totalAbsNotional: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional}) AS NUMERIC))`,
      totalUnrealizedPnl: sql<string>`SUM(CAST(${portfolioSnapshots.totalUnrealizedPnl} AS NUMERIC))`,
      absStockNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absStockNotional} AS NUMERIC))`,
      absOptionNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absOptionNotional} AS NUMERIC))`,
      absCryptoSpotNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absCryptoSpotNotional} AS NUMERIC))`,
      absPerpNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absPerpNotional} AS NUMERIC))`,
      navAtSnapshot: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`,
      totalCashUsd: sql<string>`SUM(CAST(${portfolioSnapshots.totalCashUsd} AS NUMERIC))`,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, "account")
      )
    )
    .groupBy(portfolioSnapshots.snapshotDate)
    .orderBy(desc(portfolioSnapshots.snapshotDate))
    .limit(90);

  // Build account snapshots with leverage from navAtSnapshot
  const accountSnapshots = accountRows
    .map<PortfolioTrendPoint>((row) => {
      const totalAbsNotional = toNumber(row.totalAbsNotional);
      const nav = toNumber(row.navAtSnapshot);
      const totalCashUsd = toNumber(row.totalCashUsd);

      let pctNavAbsNotional: number | null = null;
      let leverageRatio: number | null = null;
      if (totalAbsNotional !== null && nav && nav > 0) {
        pctNavAbsNotional = (totalAbsNotional / nav) * 100;
        leverageRatio = totalAbsNotional / nav;
      }

      return {
        date: row.snapshotDate,
        totalAbsNotional,
        totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
        pctNavAbsNotional,
        absStockNotional: toNumber(row.absStockNotional),
        absOptionNotional: toNumber(row.absOptionNotional),
        absCryptoSpotNotional: toNumber(row.absCryptoSpotNotional),
        absPerpNotional: toNumber(row.absPerpNotional),
        navAtSnapshot: nav,
        totalCashUsd,
        leverageRatio,
      };
    })
    .reverse();

  // Compute latestAccountSnapshot from per-account latest dates (not a single global date).
  // This ensures all accounts contribute regardless of ingestion schedule differences.
  const latestSnapshotRows = await db
    .select({
      totalAbsNotional: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional}) AS NUMERIC))`,
      totalUnrealizedPnl: sql<string>`SUM(CAST(${portfolioSnapshots.totalUnrealizedPnl} AS NUMERIC))`,
      absStockNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absStockNotional} AS NUMERIC))`,
      absOptionNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absOptionNotional} AS NUMERIC))`,
      absCryptoSpotNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absCryptoSpotNotional} AS NUMERIC))`,
      absPerpNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absPerpNotional} AS NUMERIC))`,
      navAtSnapshot: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`,
      totalCashUsd: sql<string>`SUM(CAST(${portfolioSnapshots.totalCashUsd} AS NUMERIC))`,
      maxDate: sql<string>`MAX(${portfolioSnapshots.snapshotDate})`,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, "account"),
        sql`${portfolioSnapshots.snapshotDate} = (
          SELECT MAX(ps2.snapshot_date)
          FROM portfolio_snapshots ps2
          WHERE ps2.account_id = ${portfolioSnapshots.accountId}
            AND ps2.level = 'account'
        )`
      )
    );

  const latestRow = latestSnapshotRows[0];
  const latestTotalAbsNotional = toNumber(latestRow?.totalAbsNotional);
  const latestNav = toNumber(latestRow?.navAtSnapshot);
  const latestTotalCashUsd = toNumber(latestRow?.totalCashUsd);

  let latestPctNav: number | null = null;
  let latestLeverageRatio: number | null = null;
  if (latestTotalAbsNotional !== null && latestNav && latestNav > 0) {
    latestPctNav = (latestTotalAbsNotional / latestNav) * 100;
    latestLeverageRatio = latestTotalAbsNotional / latestNav;
  }

  const latestAccountSnapshot: PortfolioTrendPoint | null = latestRow?.maxDate
    ? {
        date: latestRow.maxDate,
        totalAbsNotional: latestTotalAbsNotional,
        totalUnrealizedPnl: toNumber(latestRow.totalUnrealizedPnl),
        pctNavAbsNotional: latestPctNav,
        absStockNotional: toNumber(latestRow.absStockNotional),
        absOptionNotional: toNumber(latestRow.absOptionNotional),
        absCryptoSpotNotional: toNumber(latestRow.absCryptoSpotNotional),
        absPerpNotional: toNumber(latestRow.absPerpNotional),
        navAtSnapshot: latestNav,
        totalCashUsd: latestTotalCashUsd,
        leverageRatio: latestLeverageRatio,
      }
    : null;

  // --- Aggregate underlying-level snapshots by ticker ---
  // Uses per-account latest dates so all exchanges contribute.
  const underlyingRows = await db
    .select({
      underlyingId: portfolioSnapshots.underlyingId,
      ticker: underlyings.ticker,
      name: underlyings.name,
      totalAbsNotional: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional}) AS NUMERIC))`,
      totalUnrealizedPnl: sql<string>`SUM(CAST(${portfolioSnapshots.totalUnrealizedPnl} AS NUMERIC))`,
    })
    .from(portfolioSnapshots)
    .leftJoin(underlyings, eq(portfolioSnapshots.underlyingId, underlyings.id))
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, "underlying"),
        sql`${portfolioSnapshots.snapshotDate} = (
          SELECT MAX(ps2.snapshot_date)
          FROM portfolio_snapshots ps2
          WHERE ps2.account_id = ${portfolioSnapshots.accountId}
            AND ps2.level = 'underlying'
        )`
      )
    )
    .groupBy(portfolioSnapshots.underlyingId, underlyings.ticker, underlyings.name)
    .orderBy(sql`SUM(CAST(COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional}) AS NUMERIC)) DESC`)
    .limit(15);

  // Calculate pctNavAbsNotional for each underlying using latest per-account NAV
  const underlyingBreakdown: UnderlyingBreakdownRow[] = underlyingRows
    .filter((row) => !!row.underlyingId)
    .map((row) => {
      const notional = toNumber(row.totalAbsNotional);
      let pctNavAbsNotional: number | null = null;
      if (notional !== null && latestNav && latestNav > 0) {
        pctNavAbsNotional = (notional / latestNav) * 100;
      }
      return {
        underlyingId: row.underlyingId!,
        ticker: row.ticker,
        name: row.name,
        totalAbsNotional: notional,
        totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
        pctNavAbsNotional,
      };
    });

  // NAV trend from portfolio_snapshots.navAtSnapshot (captures all accounts)
  const navTrend: NavTrendPoint[] = accountSnapshots
    .filter((s) => s.navAtSnapshot !== null)
    .map((s) => ({ date: s.date, nav: s.navAtSnapshot }));

  // Cash breakdown for latest date across all selected accounts (per account + currency + source)
  const latestDate = latestAccountSnapshot?.date ?? null;
  const cashRows = latestDate
    ? await db
        .select({
          currency: cashBalances.currency,
          balance: sql<string>`SUM(CAST(${cashBalances.balance} AS NUMERIC))`,
          balanceUsd: sql<string>`SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC))`,
          source: cashBalances.source,
          accountId: cashBalances.accountId,
        })
        .from(cashBalances)
        .where(
          and(
            inArray(cashBalances.accountId, accountIds),
            sql`${cashBalances.snapshotDate} = (
              SELECT MAX(cb2.snapshot_date)
              FROM cash_balances cb2
              WHERE cb2.account_id = ${cashBalances.accountId}
            )`
          )
        )
        .groupBy(cashBalances.currency, cashBalances.source, cashBalances.accountId)
        .orderBy(desc(sql`SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC))`))
    : [];

  const cashBreakdown: CashBreakdownRow[] = cashRows.map((row) => ({
    currency: row.currency,
    balance: parseFloat(row.balance) || 0,
    balanceUsd: row.balanceUsd ? parseFloat(row.balanceUsd) : null,
    source: row.source,
    accountId: row.accountId,
  }));

  // --- Owner NAV breakdown (for pie chart) ---
  // Group NAV by owner using per-account latest snapshot dates
  const ownerRows = await db
    .select({
      owner: accounts.owner,
      nav: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`,
      accountCount: sql<string>`COUNT(DISTINCT ${accounts.id})`,
    })
    .from(portfolioSnapshots)
    .innerJoin(accounts, eq(portfolioSnapshots.accountId, accounts.id))
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, "account"),
        sql`${portfolioSnapshots.snapshotDate} = (
          SELECT MAX(ps2.snapshot_date)
          FROM portfolio_snapshots ps2
          WHERE ps2.account_id = ${portfolioSnapshots.accountId}
            AND ps2.level = 'account'
        )`
      )
    )
    .groupBy(accounts.owner)
    .orderBy(desc(sql`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`));

  const ownerBreakdown: OwnerBreakdownRow[] = ownerRows.map((row) => ({
    owner: row.owner ?? "Unknown",
    nav: parseFloat(row.nav) || 0,
    accountCount: parseInt(row.accountCount) || 0,
  }));

  // --- Owner NAV time series (for stacked area chart) ---
  // Fetch per-account snapshots so we can carry forward the last known NAV
  // for accounts that haven't refreshed yet on a given date.
  const perAccountNavRows = await db
    .select({
      accountId: portfolioSnapshots.accountId,
      owner: accounts.owner,
      snapshotDate: portfolioSnapshots.snapshotDate,
      nav: sql<string>`COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot})`,
    })
    .from(portfolioSnapshots)
    .innerJoin(accounts, eq(portfolioSnapshots.accountId, accounts.id))
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, "account")
      )
    )
    .orderBy(desc(portfolioSnapshots.snapshotDate))
    .limit(90 * accountIds.length);

  // Reverse so rows are chronological (query fetches most-recent first)
  perAccountNavRows.reverse();

  // Build per-account lookup and collect all dates
  const accountDateNav = new Map<string, Map<string, number>>();
  const accountOwnerMap = new Map<string, string>();
  const dateSet = new Set<string>();

  for (const row of perAccountNavRows) {
    const nav = toNumber(row.nav);
    if (nav === null) continue;
    dateSet.add(row.snapshotDate);
    accountOwnerMap.set(row.accountId, row.owner ?? "Unknown");
    let dateMap = accountDateNav.get(row.accountId);
    if (!dateMap) {
      dateMap = new Map();
      accountDateNav.set(row.accountId, dateMap);
    }
    dateMap.set(row.snapshotDate, nav);
  }

  // Fill forward: for each date, carry each account's last known NAV,
  // then aggregate by owner
  const allDates = [...dateSet].sort();
  const lastKnownNav = new Map<string, number>();
  const ownerNavTimeSeries: OwnerNavTimeSeriesPoint[] = [];

  for (const date of allDates) {
    const ownerTotals = new Map<string, number>();

    for (const acctId of accountIds) {
      const owner = accountOwnerMap.get(acctId);
      if (!owner) continue; // account has no data at all

      const navOnDate = accountDateNav.get(acctId)?.get(date);
      if (navOnDate !== undefined) {
        lastKnownNav.set(acctId, navOnDate);
      }

      const nav = navOnDate ?? lastKnownNav.get(acctId);
      if (nav !== undefined) {
        ownerTotals.set(owner, (ownerTotals.get(owner) ?? 0) + nav);
      }
    }

    for (const [owner, totalNav] of ownerTotals) {
      ownerNavTimeSeries.push({ date, owner, nav: totalNav });
    }
  }

  return {
    navTrend,
    accountSnapshots,
    latestAccountSnapshot,
    underlyingBreakdown,
    cashBreakdown,
    ownerBreakdown,
    ownerNavTimeSeries,
  };
}

// ============================================================================
// Portfolio Positions (live position-level data for the portfolio page)
// ============================================================================

export interface PortfolioPositionRow {
  id: string;
  symbol: string;
  assetClass: string | null;
  underlyingTicker: string | null;
  underlyingId: string | null;
  parentUnderlyingTicker: string | null;
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
  side: string | null;
  quantity: number;
  avgPrice: number | null;
  costBasisMoney: number | null;
  spot: number | null;
  underlyingSpot: number | null;
  absNotional: number | null;
  absNotionalUsd: number | null;
  marketValueUsd: number | null;
  unrealizedPnl: number | null;
  multiplier: number | null;
  currency: string | null;
  snapshotDate: string | null;
  accountId: string;
  strategyId: string | null;
  nav: number | null;
}

export interface PortfolioStrategyRow {
  id: string;
  strategyKey: string;
  label: string;
  status: string;
  strategyType: string | null;
  direction: string | null;
  assetThesisId: string | null;
  assetThesisTitle: string | null;
  positions: PortfolioPositionRow[];
}

export interface PortfolioPositionsData {
  strategies: PortfolioStrategyRow[];
  unlinkedPositions: PortfolioPositionRow[];
  nav: number | null;
  totalCashUsd: number | null;
  leverageRatio: number | null;
  snapshotDate: string | null;
}

/**
 * Get all open positions grouped by strategy for the portfolio page.
 * Returns positions with IBKR-aligned fields, grouped by strategy.
 */
export async function getPortfolioPositionsData(
  accountIds: string[]
): Promise<PortfolioPositionsData> {
  if (accountIds.length === 0) {
    return { strategies: [], unlinkedPositions: [], nav: null, totalCashUsd: null, leverageRatio: null, snapshotDate: null };
  }

  // Fetch all open positions at each account's latest snapshot date.
  // Uses per-account correlated subquery because different exchanges
  // (IBKR, HyperLiquid, Coinbase, Kraken) ingest on different schedules.
  // Joins with parent underlying to get the canonical ticker for grouping
  // (e.g., HSOL -> SOL, CBBTC -> BTC).
  const positionRows = await db
    .select({
      id: positions.id,
      symbol: positions.symbol,
      assetClass: positions.assetClass,
      underlyingTicker: underlyings.ticker,
      underlyingId: positions.underlyingId,
      parentUnderlyingTicker: parentUnderlyings.ticker,
      expiry: positions.expiry,
      strike: positions.strike,
      optionRight: positions.optionRight,
      side: positions.side,
      quantity: positions.quantity,
      avgPrice: positions.avgPrice,
      costBasisMoney: positions.costBasisMoney,
      spot: positions.spot,
      underlyingSpot: underlyings.spot,
      absNotional: positions.absNotional,
      absNotionalUsd: positions.absNotionalUsd,
      marketValueUsd: positions.marketValueUsd,
      unrealizedPnl: positions.unrealizedPnl,
      multiplier: positions.multiplier,
      currency: sql<string | null>`COALESCE(${positions.currency}, ${underlyings.baseCurrency})`,
      snapshotDate: positions.snapshotDate,
      accountId: positions.accountId,
      strategyId: positions.strategyId,
    })
    .from(positions)
    .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
    .leftJoin(parentUnderlyings, eq(underlyings.parentUnderlyingId, parentUnderlyings.id))
    .where(
      and(
        inArray(positions.accountId, accountIds),
        sql`${positions.quantity} != 0`,
        sql`${positions.snapshotDate} = (
          SELECT MAX(p2.snapshot_date)
          FROM positions p2
          WHERE p2.account_id = ${positions.accountId}
        )`
      )
    )
    .orderBy(asc(positions.symbol));

  if (positionRows.length === 0) {
    return { strategies: [], unlinkedPositions: [], nav: null, totalCashUsd: null, leverageRatio: null, snapshotDate: null };
  }

  // Compute display snapshot date (max across all accounts' latest dates)
  const snapshotDate = positionRows.reduce((max, r) => {
    if (!r.snapshotDate) return max;
    return !max || r.snapshotDate > max ? r.snapshotDate : max;
  }, null as string | null);

  // Get aggregated NAV, cash, and leverage from portfolio_snapshots.
  // Uses per-account latest dates so all exchanges contribute.
  const portfolioResult = await db
    .select({
      nav: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`,
      totalCashUsd: sql<string>`SUM(CAST(${portfolioSnapshots.totalCashUsd} AS NUMERIC))`,
      totalAbsNotional: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional}) AS NUMERIC))`,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, "account"),
        sql`${portfolioSnapshots.snapshotDate} = (
          SELECT MAX(ps2.snapshot_date)
          FROM portfolio_snapshots ps2
          WHERE ps2.account_id = ${portfolioSnapshots.accountId}
            AND ps2.level = 'account'
        )`
      )
    );

  const nav = toNumber(portfolioResult[0]?.nav);
  const totalCashUsd = toNumber(portfolioResult[0]?.totalCashUsd);
  const totalAbsNotional = toNumber(portfolioResult[0]?.totalAbsNotional);
  const leverageRatio = totalAbsNotional !== null && nav && nav > 0
    ? totalAbsNotional / nav
    : null;

  const allPositions: PortfolioPositionRow[] = positionRows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    assetClass: row.assetClass,
    underlyingTicker: row.underlyingTicker,
    underlyingId: row.underlyingId,
    parentUnderlyingTicker: row.parentUnderlyingTicker,
    expiry: row.expiry,
    strike: toNumber(row.strike),
    optionRight: row.optionRight,
    side: row.side,
    quantity: Number(row.quantity),
    avgPrice: toNumber(row.avgPrice),
    costBasisMoney: toNumber(row.costBasisMoney),
    spot: toNumber(row.spot),
    underlyingSpot: toNumber(row.underlyingSpot),
    absNotional: toNumber(row.absNotional),
    absNotionalUsd: toNumber(row.absNotionalUsd),
    marketValueUsd: toNumber(row.marketValueUsd),
    unrealizedPnl: toNumber(row.unrealizedPnl),
    multiplier: toNumber(row.multiplier),
    currency: row.currency,
    snapshotDate: row.snapshotDate,
    accountId: row.accountId,
    strategyId: row.strategyId,
    nav,
  }));

  // Collect unique strategy IDs
  const strategyIds = [...new Set(
    allPositions
      .map((p) => p.strategyId)
      .filter((id): id is string => id !== null)
  )];

  // Fetch strategy metadata
  const strategyMap = new Map<string, PortfolioStrategyRow>();
  if (strategyIds.length > 0) {
    const strategyRows = await db
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        label: strategies.autoDerivedLabel,
        status: strategies.status,
        closedAt: strategies.closedAt,
        strategyType: strategies.strategyType,
        direction: strategies.direction,
        assetThesisId: strategies.assetThesisId,
        assetThesisTitle: assetTheses.title,
      })
      .from(strategies)
      .leftJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
      .where(inArray(strategies.id, strategyIds));

    for (const row of strategyRows) {
      // Only show active strategies in the portfolio grouping.
      // Positions linked to inactive strategies fall through to unlinked.
      const isActive = row.status === 'active'
        && !row.closedAt;
      if (!isActive) continue;

      strategyMap.set(row.id, {
        id: row.id,
        strategyKey: row.strategyKey,
        label: row.label ?? row.strategyKey,
        status: 'active',
        strategyType: row.strategyType,
        direction: row.direction,
        assetThesisId: row.assetThesisId,
        assetThesisTitle: row.assetThesisTitle,
        positions: [],
      });
    }
  }

  // Group positions by strategy.
  // Positions linked to inactive/merged strategies appear as unlinked —
  // if the position is open, it's real and must be visible in the portfolio.
  const unlinkedPositions: PortfolioPositionRow[] = [];
  for (const pos of allPositions) {
    if (pos.strategyId && strategyMap.has(pos.strategyId)) {
      strategyMap.get(pos.strategyId)!.positions.push(pos);
    } else {
      unlinkedPositions.push(pos);
    }
  }

  // Sort strategies by total abs notional descending
  const strategyList = [...strategyMap.values()].sort((a, b) => {
    const aNotional = a.positions.reduce((sum, p) => sum + Math.abs(p.marketValueUsd ?? p.absNotionalUsd ?? p.absNotional ?? 0), 0);
    const bNotional = b.positions.reduce((sum, p) => sum + Math.abs(p.marketValueUsd ?? p.absNotionalUsd ?? p.absNotional ?? 0), 0);
    return bNotional - aNotional;
  });

  return {
    strategies: strategyList,
    unlinkedPositions,
    nav,
    totalCashUsd,
    leverageRatio,
    snapshotDate,
  };
}
