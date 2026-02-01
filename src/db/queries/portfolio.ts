import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assetTheses,
  navSnapshots,
  portfolioSnapshots,
  positions,
  strategies,
  underlyings,
} from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface PortfolioTrendPoint {
  date: string;
  totalAbsNotional: number | null;
  totalUnrealizedPnl: number | null;
  pctNavAbsNotional: number | null;
  absStockNotional: number | null;
  absOptionNotional: number | null;
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

export interface PortfolioDashboardData {
  navTrend: NavTrendPoint[];
  accountSnapshots: PortfolioTrendPoint[];
  latestAccountSnapshot: PortfolioTrendPoint | null;
  underlyingBreakdown: UnderlyingBreakdownRow[];
}

export async function getPortfolioDashboardData(
  accountId: string
): Promise<PortfolioDashboardData> {
  const accountRows = await db
    .select({
      snapshotDate: portfolioSnapshots.snapshotDate,
      totalAbsNotional: portfolioSnapshots.totalAbsNotional,
      totalUnrealizedPnl: portfolioSnapshots.totalUnrealizedPnl,
      pctNavAbsNotional: portfolioSnapshots.pctNavAbsNotional,
      absStockNotional: portfolioSnapshots.absStockNotional,
      absOptionNotional: portfolioSnapshots.absOptionNotional,
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
          totalAbsNotional: portfolioSnapshots.totalAbsNotional,
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
        .orderBy(desc(portfolioSnapshots.totalAbsNotional))
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

  const navRows = await db
    .select({
      date: navSnapshots.reportDate,
      nav: navSnapshots.total,
    })
    .from(navSnapshots)
    .where(eq(navSnapshots.accountId, accountId))
    .orderBy(desc(navSnapshots.reportDate))
    .limit(120);

  const navTrend: NavTrendPoint[] = navRows
    .map((row) => ({
      date: row.date,
      nav: toNumber(row.nav),
    }))
    .reverse();

  return {
    navTrend,
    accountSnapshots,
    latestAccountSnapshot,
    underlyingBreakdown,
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
    };
  }

  // For single account, use the simpler query
  if (accountIds.length === 1) {
    return getPortfolioDashboardData(accountIds[0]);
  }

  // --- Aggregate account-level snapshots by date ---
  const accountRows = await db
    .select({
      snapshotDate: portfolioSnapshots.snapshotDate,
      totalAbsNotional: sql<string>`SUM(CAST(${portfolioSnapshots.totalAbsNotional} AS NUMERIC))`,
      totalUnrealizedPnl: sql<string>`SUM(CAST(${portfolioSnapshots.totalUnrealizedPnl} AS NUMERIC))`,
      absStockNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absStockNotional} AS NUMERIC))`,
      absOptionNotional: sql<string>`SUM(CAST(${portfolioSnapshots.absOptionNotional} AS NUMERIC))`,
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

  // --- Aggregate NAV by date ---
  const navRows = await db
    .select({
      date: navSnapshots.reportDate,
      nav: sql<string>`SUM(CAST(${navSnapshots.total} AS NUMERIC))`,
    })
    .from(navSnapshots)
    .where(inArray(navSnapshots.accountId, accountIds))
    .groupBy(navSnapshots.reportDate)
    .orderBy(desc(navSnapshots.reportDate))
    .limit(120);

  // Build a map of date -> total NAV for leverage calculation
  const navByDate = new Map<string, number>();
  for (const row of navRows) {
    const nav = toNumber(row.nav);
    if (nav !== null) {
      navByDate.set(row.date, nav);
    }
  }

  // Build account snapshots with recalculated leverage
  const accountSnapshots = accountRows
    .map<PortfolioTrendPoint>((row) => {
      const totalAbsNotional = toNumber(row.totalAbsNotional);
      const nav = navByDate.get(row.snapshotDate);
      // Recalculate leverage: (totalAbsNotional / totalNAV) * 100
      let pctNavAbsNotional: number | null = null;
      if (totalAbsNotional !== null && nav && nav > 0) {
        pctNavAbsNotional = (totalAbsNotional / nav) * 100;
      }
      return {
        date: row.snapshotDate,
        totalAbsNotional,
        totalUnrealizedPnl: toNumber(row.totalUnrealizedPnl),
        pctNavAbsNotional,
        absStockNotional: toNumber(row.absStockNotional),
        absOptionNotional: toNumber(row.absOptionNotional),
      };
    })
    .reverse();

  const latestAccountSnapshot =
    accountSnapshots.length > 0 ? accountSnapshots[accountSnapshots.length - 1] : null;

  const latestDate = latestAccountSnapshot?.date ?? null;

  // --- Aggregate underlying-level snapshots by ticker ---
  const underlyingRows = latestDate
    ? await db
        .select({
          underlyingId: portfolioSnapshots.underlyingId,
          ticker: underlyings.ticker,
          name: underlyings.name,
          totalAbsNotional: sql<string>`SUM(CAST(${portfolioSnapshots.totalAbsNotional} AS NUMERIC))`,
          totalUnrealizedPnl: sql<string>`SUM(CAST(${portfolioSnapshots.totalUnrealizedPnl} AS NUMERIC))`,
        })
        .from(portfolioSnapshots)
        .leftJoin(underlyings, eq(portfolioSnapshots.underlyingId, underlyings.id))
        .where(
          and(
            inArray(portfolioSnapshots.accountId, accountIds),
            eq(portfolioSnapshots.level, "underlying"),
            eq(portfolioSnapshots.snapshotDate, latestDate)
          )
        )
        .groupBy(portfolioSnapshots.underlyingId, underlyings.ticker, underlyings.name)
        .orderBy(sql`SUM(CAST(${portfolioSnapshots.totalAbsNotional} AS NUMERIC)) DESC`)
        .limit(15)
    : [];

  // Calculate pctNavAbsNotional for each underlying using total NAV
  const totalNav = latestDate ? navByDate.get(latestDate) : null;
  const underlyingBreakdown: UnderlyingBreakdownRow[] = underlyingRows
    .filter((row) => !!row.underlyingId)
    .map((row) => {
      const notional = toNumber(row.totalAbsNotional);
      let pctNavAbsNotional: number | null = null;
      if (notional !== null && totalNav && totalNav > 0) {
        pctNavAbsNotional = (notional / totalNav) * 100;
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

  const navTrend: NavTrendPoint[] = navRows
    .map((row) => ({
      date: row.date,
      nav: toNumber(row.nav),
    }))
    .reverse();

  return {
    navTrend,
    accountSnapshots,
    latestAccountSnapshot,
    underlyingBreakdown,
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
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
  side: string | null;
  quantity: number;
  avgPrice: number | null;
  costBasisMoney: number | null;
  spot: number | null;
  absNotional: number | null;
  unrealizedPnl: number | null;
  multiplier: number | null;
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
    return { strategies: [], unlinkedPositions: [], nav: null, snapshotDate: null };
  }

  // Find the latest snapshot date across all selected accounts
  const latestDateResult = await db
    .select({ snapshotDate: positions.snapshotDate })
    .from(positions)
    .where(
      and(
        inArray(positions.accountId, accountIds),
        sql`${positions.quantity} != 0`
      )
    )
    .orderBy(desc(positions.snapshotDate))
    .limit(1);

  const snapshotDate = latestDateResult[0]?.snapshotDate ?? null;
  if (!snapshotDate) {
    return { strategies: [], unlinkedPositions: [], nav: null, snapshotDate: null };
  }

  // Get aggregated NAV across all selected accounts for the snapshot date
  const navResult = await db
    .select({
      nav: sql<string>`SUM(CAST(${navSnapshots.total} AS NUMERIC))`,
    })
    .from(navSnapshots)
    .where(
      and(
        inArray(navSnapshots.accountId, accountIds),
        eq(navSnapshots.reportDate, snapshotDate)
      )
    );

  const nav = toNumber(navResult[0]?.nav);

  // Fetch all open positions at the latest snapshot date
  const positionRows = await db
    .select({
      id: positions.id,
      symbol: positions.symbol,
      assetClass: positions.assetClass,
      underlyingTicker: underlyings.ticker,
      underlyingId: positions.underlyingId,
      expiry: positions.expiry,
      strike: positions.strike,
      optionRight: positions.optionRight,
      side: positions.side,
      quantity: positions.quantity,
      avgPrice: positions.avgPrice,
      costBasisMoney: positions.costBasisMoney,
      spot: positions.spot,
      absNotional: positions.absNotional,
      unrealizedPnl: positions.unrealizedPnl,
      multiplier: positions.multiplier,
      snapshotDate: positions.snapshotDate,
      accountId: positions.accountId,
      strategyId: positions.strategyId,
    })
    .from(positions)
    .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
    .where(
      and(
        inArray(positions.accountId, accountIds),
        eq(positions.snapshotDate, snapshotDate),
        sql`${positions.quantity} != 0`
      )
    )
    .orderBy(asc(positions.symbol));

  const allPositions: PortfolioPositionRow[] = positionRows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    assetClass: row.assetClass,
    underlyingTicker: row.underlyingTicker,
    underlyingId: row.underlyingId,
    expiry: row.expiry,
    strike: toNumber(row.strike),
    optionRight: row.optionRight,
    side: row.side,
    quantity: Number(row.quantity),
    avgPrice: toNumber(row.avgPrice),
    costBasisMoney: toNumber(row.costBasisMoney),
    spot: toNumber(row.spot),
    absNotional: toNumber(row.absNotional),
    unrealizedPnl: toNumber(row.unrealizedPnl),
    multiplier: toNumber(row.multiplier),
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
        strategyType: strategies.strategyType,
        direction: strategies.direction,
        assetThesisId: strategies.assetThesisId,
        assetThesisTitle: assetTheses.title,
      })
      .from(strategies)
      .leftJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
      .where(inArray(strategies.id, strategyIds));

    for (const row of strategyRows) {
      strategyMap.set(row.id, {
        id: row.id,
        strategyKey: row.strategyKey,
        label: row.label ?? row.strategyKey,
        status: row.status,
        strategyType: row.strategyType,
        direction: row.direction,
        assetThesisId: row.assetThesisId,
        assetThesisTitle: row.assetThesisTitle,
        positions: [],
      });
    }
  }

  // Group positions by strategy
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
    const aNotional = a.positions.reduce((sum, p) => sum + Math.abs(p.absNotional ?? 0), 0);
    const bNotional = b.positions.reduce((sum, p) => sum + Math.abs(p.absNotional ?? 0), 0);
    return bNotional - aNotional;
  });

  return {
    strategies: strategyList,
    unlinkedPositions,
    nav,
    snapshotDate,
  };
}
