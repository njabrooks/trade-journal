import { db } from "@/db";
import {
  dailyPortfolioValues,
  portfolioDailyBalances,
  eventCalculations,
  assets,
} from "@/db/schema";
import { and, eq, sql, desc, gte, isNull, isNotNull } from "drizzle-orm";
import { toNumber } from "@/lib/numbers";

// Single-user system (from TTC migration)
const USER_ID = "user_2mYzScugP7zfcqv8Ox21i7q9nyW";

// --- Types ---

export interface AccountingDashboardData {
  /** NAV time series for the area chart */
  navTimeSeries: NavTimeSeriesPoint[];
  /** Latest summary metrics (grand total level) */
  summary: AccountingSummary;
  /** Owner-level breakdown from latest date */
  ownerBreakdown: OwnerBreakdownItem[];
  /** Asset class breakdown from latest date */
  assetClassBreakdown: AssetClassBreakdownItem[];
  /** Total realized P&L across all events */
  realizedPnl: number;
}

export interface NavTimeSeriesPoint {
  date: string;
  totalMarketValue: number;
  totalBookValue: number;
  unrealizedGain: number;
}

export interface AccountingSummary {
  nav: number;
  bookValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  positionCount: number;
  priceCompleteness: number;
  latestDate: string;
}

export interface OwnerBreakdownItem {
  owner: string;
  marketValue: number;
}

export interface AssetClassBreakdownItem {
  assetClass: string;
  marketValue: number;
}

export interface AccountingPositionRow {
  assetId: string;
  ticker: string;
  assetName: string | null;
  owner: string;
  account: string;
  assetClass: string | null;
  quantity: number;
  price: number | null;
  marketValue: number | null;
  bookValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
}

// --- Query functions ---

/**
 * Fetch the accounting dashboard data for a given time range.
 */
export async function getAccountingDashboard(
  daysBack: number
): Promise<AccountingDashboardData> {
  const cutoffDate =
    daysBack >= 99999
      ? "1900-01-01"
      : new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);

  // 1. NAV time series — grand total level (owner IS NULL, account IS NULL)
  const navRows = await db
    .select({
      date: dailyPortfolioValues.date,
      totalMarketValue: dailyPortfolioValues.totalMarketValue,
      totalBookValue: dailyPortfolioValues.totalBookValue,
      unrealizedGain: dailyPortfolioValues.unrealizedGain,
    })
    .from(dailyPortfolioValues)
    .where(
      and(
        eq(dailyPortfolioValues.userId, USER_ID),
        isNull(dailyPortfolioValues.owner),
        isNull(dailyPortfolioValues.account),
        gte(dailyPortfolioValues.date, cutoffDate)
      )
    )
    .orderBy(dailyPortfolioValues.date);

  const navTimeSeries: NavTimeSeriesPoint[] = navRows.map((r) => ({
    date: r.date,
    totalMarketValue: toNumber(r.totalMarketValue) ?? 0,
    totalBookValue: toNumber(r.totalBookValue) ?? 0,
    unrealizedGain: toNumber(r.unrealizedGain) ?? 0,
  }));

  // 2. Latest summary — from the most recent grand-total row
  const latestRow = await db
    .select()
    .from(dailyPortfolioValues)
    .where(
      and(
        eq(dailyPortfolioValues.userId, USER_ID),
        isNull(dailyPortfolioValues.owner),
        isNull(dailyPortfolioValues.account)
      )
    )
    .orderBy(desc(dailyPortfolioValues.date))
    .limit(1);

  const latest = latestRow[0];
  const summary: AccountingSummary = {
    nav: toNumber(latest?.totalMarketValue) ?? 0,
    bookValue: toNumber(latest?.totalBookValue) ?? 0,
    unrealizedGain: toNumber(latest?.unrealizedGain) ?? 0,
    unrealizedGainPercent: toNumber(latest?.unrealizedGainPercent) ?? 0,
    positionCount: latest?.positionCount ?? 0,
    priceCompleteness: toNumber(latest?.priceCompleteness) ?? 0,
    latestDate: latest?.date ?? "",
  };

  // 3. Owner breakdown — latest date, owner IS NOT NULL, account IS NULL
  const latestDate = latest?.date;
  let ownerBreakdown: OwnerBreakdownItem[] = [];
  if (latestDate) {
    const ownerRows = await db
      .select({
        owner: dailyPortfolioValues.owner,
        totalMarketValue: dailyPortfolioValues.totalMarketValue,
      })
      .from(dailyPortfolioValues)
      .where(
        and(
          eq(dailyPortfolioValues.userId, USER_ID),
          eq(dailyPortfolioValues.date, latestDate),
          isNotNull(dailyPortfolioValues.owner),
          isNull(dailyPortfolioValues.account)
        )
      );

    ownerBreakdown = ownerRows.map((r) => ({
      owner: r.owner!,
      marketValue: toNumber(r.totalMarketValue) ?? 0,
    }));
  }

  // 4. Asset class breakdown — latest date from portfolio_daily_balances
  let assetClassBreakdown: AssetClassBreakdownItem[] = [];
  if (latestDate) {
    const classRows = await db
      .select({
        assetClass: portfolioDailyBalances.assetClass,
        totalMv: sql<string>`SUM(${portfolioDailyBalances.marketValue}::numeric)`,
      })
      .from(portfolioDailyBalances)
      .where(
        and(
          eq(portfolioDailyBalances.userId, USER_ID),
          eq(portfolioDailyBalances.date, latestDate)
        )
      )
      .groupBy(portfolioDailyBalances.assetClass);

    assetClassBreakdown = classRows
      .map((r) => ({
        assetClass: r.assetClass ?? "Unknown",
        marketValue: toNumber(r.totalMv) ?? 0,
      }))
      .filter((r) => Math.abs(r.marketValue) > 1);
  }

  // 5. Realized P&L — sum of all realized gains from event_calculations
  const realizedResult = await db
    .select({
      total: sql<string>`COALESCE(SUM(${eventCalculations.realizedGain}::numeric), 0)`,
    })
    .from(eventCalculations)
    .where(eq(eventCalculations.userId, USER_ID));

  const realizedPnl = toNumber(realizedResult[0]?.total) ?? 0;

  return {
    navTimeSeries,
    summary,
    ownerBreakdown,
    assetClassBreakdown,
    realizedPnl,
  };
}

/**
 * Fetch the latest positions for the accounting positions table.
 * Returns per-asset rows from the latest date in portfolio_daily_balances,
 * joined with assets for ticker/name.
 */
export async function getAccountingPositions(): Promise<
  AccountingPositionRow[]
> {
  // Find the latest date
  const latestDateRow = await db
    .select({ maxDate: sql<string>`MAX(${portfolioDailyBalances.date})` })
    .from(portfolioDailyBalances)
    .where(eq(portfolioDailyBalances.userId, USER_ID));

  const latestDate = latestDateRow[0]?.maxDate;
  if (!latestDate) return [];

  const rows = await db
    .select({
      assetId: portfolioDailyBalances.asset,
      ticker: assets.ticker,
      assetName: assets.name,
      owner: portfolioDailyBalances.owner,
      account: portfolioDailyBalances.accountType,
      assetClass: portfolioDailyBalances.assetClass,
      quantity: portfolioDailyBalances.quantity,
      price: portfolioDailyBalances.price,
      marketValue: portfolioDailyBalances.marketValue,
      bookValue: portfolioDailyBalances.bookValue,
    })
    .from(portfolioDailyBalances)
    .innerJoin(
      assets,
      sql`${portfolioDailyBalances.asset} = ${assets.id}::text`
    )
    .where(
      and(
        eq(portfolioDailyBalances.userId, USER_ID),
        eq(portfolioDailyBalances.date, latestDate)
      )
    )
    .orderBy(desc(sql`ABS(${portfolioDailyBalances.marketValue}::numeric)`));

  return rows
    .map((r) => {
      const mv = toNumber(r.marketValue);
      const bv = toNumber(r.bookValue);
      const unrealizedPnl = mv != null && bv != null ? mv - bv : null;
      const unrealizedPct =
        unrealizedPnl != null && bv != null && bv !== 0
          ? (unrealizedPnl / Math.abs(bv)) * 100
          : null;

      return {
        assetId: r.assetId,
        ticker: r.ticker,
        assetName: r.assetName,
        owner: r.owner,
        account: r.account,
        assetClass: r.assetClass,
        quantity: toNumber(r.quantity) ?? 0,
        price: toNumber(r.price),
        marketValue: mv,
        bookValue: bv,
        unrealizedPnl,
        unrealizedPct,
      };
    })
    .filter(
      (r) =>
        (r.marketValue != null && Math.abs(r.marketValue) > 1) ||
        r.quantity !== 0
    );
}
