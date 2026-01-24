import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  navSnapshots,
  portfolioSnapshots,
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

