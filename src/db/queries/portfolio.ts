import { and, asc, desc, eq } from "drizzle-orm";
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

