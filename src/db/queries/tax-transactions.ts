import { db } from "@/db";
import { events, eventCalculations, assets } from "@/db/schema";
import { and, eq, sql, asc, desc, isNull, gte, lte } from "drizzle-orm";
import { toNumber } from "@/lib/numbers";

// Single-user system (from TTC migration)
const USER_ID = "user_2mYzScugP7zfcqv8Ox21i7q9nyW";

// --- Types ---

export type TaxCurrency = "USD" | "GBP";

export interface TaxTransactionRow {
  eventId: string;
  timestamp: string;
  ticker: string;
  assetName: string | null;
  eventType: string;
  quantity: number;
  // USD values
  totalValueUsd: number | null;
  acbCostBasisUsd: number | null;
  acbGainUsd: number | null;
  // GBP values
  totalValueGbp: number | null;
  acbCostBasisGbp: number | null;
  acbGainGbp: number | null;
  // S104 values (GBP only)
  s104CostBasisGbp: number | null;
  s104GainGbp: number | null;
  // S104 match types (aggregated)
  s104MatchTypes: string[] | null;
  // Owner / account
  owner: string;
  account: string;
}

export interface TaxTransactionsSummary {
  totalCount: number;
  disposalCount: number;
  totalProceedsUsd: number;
  totalProceedsGbp: number;
  totalAcbGainUsd: number;
  totalAcbGainGbp: number;
  totalS104GainGbp: number;
}

export interface TaxTransactionsFilters {
  owner?: string;
  taxYearStart?: string; // ISO date
  taxYearEnd?: string;   // ISO date
  assetTicker?: string;
  eventType?: "disposal" | "acquisition" | "all";
  matchType?: string;    // same_day | bed_and_breakfast | section_104_pool | all
}

export interface TaxTransactionsResult {
  rows: TaxTransactionRow[];
  summary: TaxTransactionsSummary;
  totalCount: number;
  page: number;
  pageSize: number;
}

// Disposal event types
const DISPOSAL_TYPES = ["SELL", "SEND", "FEE", "GIFT_OUT"];
const ACQUISITION_TYPES = ["BUY", "RECEIVE", "INTEREST", "STAKING_REWARD", "DIVIDEND", "INCOME"];

// --- Tax Year Helpers ---

export interface TaxYearConfig {
  label: string;
  startDate: string;
  endDate: string;
}

/**
 * Generate tax years based on owner.
 * TTC: May 1 – Apr 30 (corporate reporting period)
 * Individuals: Apr 6 – Apr 5 (UK tax year)
 */
export function getTaxYears(owner: string): TaxYearConfig[] {
  const isTTC = owner === "TTC";
  const startMonth = isTTC ? 5 : 4;
  const startDay = isTTC ? 1 : 6;
  const years: TaxYearConfig[] = [];

  for (let y = 2018; y <= 2025; y++) {
    const start = `${y}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const endYear = y + 1;
    const endMonth = isTTC ? 4 : 4;
    const endDay = isTTC ? 30 : 5;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    years.push({
      label: `${y}/${String(endYear).slice(2)}`,
      startDate: start,
      endDate: end,
    });
  }

  return years;
}

// --- Query Functions ---

export async function getTaxTransactions(
  filters: TaxTransactionsFilters,
  page = 1,
  pageSize = 50,
): Promise<TaxTransactionsResult> {
  const offset = (page - 1) * pageSize;

  // Build WHERE conditions
  const conditions = [
    eq(events.userId, USER_ID),
    isNull(events.deletedAt),
  ];

  if (filters.owner) {
    conditions.push(eq(events.owner, filters.owner));
  }
  if (filters.taxYearStart) {
    conditions.push(gte(events.timestamp, new Date(filters.taxYearStart)));
  }
  if (filters.taxYearEnd) {
    conditions.push(lte(events.timestamp, new Date(filters.taxYearEnd + "T23:59:59.999Z")));
  }
  if (filters.assetTicker) {
    conditions.push(sql`${assets.ticker} ILIKE ${filters.assetTicker}`);
  }
  if (filters.eventType === "disposal") {
    conditions.push(sql`${events.eventType} IN (${sql.join(DISPOSAL_TYPES.map(t => sql`${t}`), sql`, `)})`);
  } else if (filters.eventType === "acquisition") {
    conditions.push(sql`${events.eventType} IN (${sql.join(ACQUISITION_TYPES.map(t => sql`${t}`), sql`, `)})`);
  }

  // Match type filter requires subquery on section_104_matches
  if (filters.matchType && filters.matchType !== "all") {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM section_104_matches sm
      WHERE sm.disposal_event_id = ${events.id}
        AND sm.match_type = ${filters.matchType}
    )`);
  }

  // Main query with S104 match type aggregation
  const rows = await db
    .select({
      eventId: events.id,
      timestamp: events.timestamp,
      ticker: assets.ticker,
      assetName: assets.name,
      eventType: events.eventType,
      quantity: events.quantity,
      totalValueUsd: events.totalValue,
      acbCostBasisUsd: eventCalculations.costBasis,
      acbGainUsd: eventCalculations.realizedGain,
      totalValueGbp: eventCalculations.totalValueGbp,
      acbCostBasisGbp: eventCalculations.costBasisGbp,
      acbGainGbp: eventCalculations.realizedGainGbp,
      s104CostBasisGbp: eventCalculations.s104CostBasisGbp,
      s104GainGbp: eventCalculations.s104RealizedGainGbp,
      owner: events.owner,
      account: events.account,
      s104MatchTypes: sql<string[]>`(
        SELECT array_agg(DISTINCT sm.match_type)
        FROM section_104_matches sm
        WHERE sm.disposal_event_id = ${events.id}
      )`,
    })
    .from(events)
    .innerJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .innerJoin(assets, eq(events.assetId, assets.id))
    .where(and(...conditions))
    .orderBy(asc(events.timestamp), asc(events.id))
    .limit(pageSize)
    .offset(offset);

  // Count query
  const countResult = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(events)
    .innerJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .innerJoin(assets, eq(events.assetId, assets.id))
    .where(and(...conditions));

  const totalCount = Number(countResult[0]?.count ?? 0);

  // Summary query (aggregates over all filtered rows, not just current page)
  const summaryResult = await db
    .select({
      totalCount: sql<string>`COUNT(*)`,
      disposalCount: sql<string>`COUNT(*) FILTER (WHERE ${events.eventType} IN (${sql.join(DISPOSAL_TYPES.map(t => sql`${t}`), sql`, `)}))`,
      totalProceedsUsd: sql<string>`COALESCE(SUM(${events.totalValue}::numeric) FILTER (WHERE ${events.eventType} IN (${sql.join(DISPOSAL_TYPES.map(t => sql`${t}`), sql`, `)})), 0)`,
      totalProceedsGbp: sql<string>`COALESCE(SUM(${eventCalculations.totalValueGbp}::numeric) FILTER (WHERE ${events.eventType} IN (${sql.join(DISPOSAL_TYPES.map(t => sql`${t}`), sql`, `)})), 0)`,
      totalAcbGainUsd: sql<string>`COALESCE(SUM(${eventCalculations.realizedGain}::numeric), 0)`,
      totalAcbGainGbp: sql<string>`COALESCE(SUM(${eventCalculations.realizedGainGbp}::numeric), 0)`,
      totalS104GainGbp: sql<string>`COALESCE(SUM(${eventCalculations.s104RealizedGainGbp}::numeric), 0)`,
    })
    .from(events)
    .innerJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .innerJoin(assets, eq(events.assetId, assets.id))
    .where(and(...conditions));

  const s = summaryResult[0];

  return {
    rows: rows.map((r) => ({
      eventId: r.eventId,
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      ticker: r.ticker,
      assetName: r.assetName,
      eventType: r.eventType,
      quantity: toNumber(r.quantity) ?? 0,
      totalValueUsd: toNumber(r.totalValueUsd),
      acbCostBasisUsd: toNumber(r.acbCostBasisUsd),
      acbGainUsd: toNumber(r.acbGainUsd),
      totalValueGbp: toNumber(r.totalValueGbp),
      acbCostBasisGbp: toNumber(r.acbCostBasisGbp),
      acbGainGbp: toNumber(r.acbGainGbp),
      s104CostBasisGbp: toNumber(r.s104CostBasisGbp),
      s104GainGbp: toNumber(r.s104GainGbp),
      s104MatchTypes: r.s104MatchTypes,
      owner: r.owner,
      account: r.account,
    })),
    summary: {
      totalCount: Number(s?.totalCount ?? 0),
      disposalCount: Number(s?.disposalCount ?? 0),
      totalProceedsUsd: toNumber(s?.totalProceedsUsd) ?? 0,
      totalProceedsGbp: toNumber(s?.totalProceedsGbp) ?? 0,
      totalAcbGainUsd: toNumber(s?.totalAcbGainUsd) ?? 0,
      totalAcbGainGbp: toNumber(s?.totalAcbGainGbp) ?? 0,
      totalS104GainGbp: toNumber(s?.totalS104GainGbp) ?? 0,
    },
    totalCount,
    page,
    pageSize,
  };
}

/**
 * Get distinct asset tickers that have events (for filter dropdown).
 */
export async function getTaxTransactionTickers(owner?: string): Promise<string[]> {
  const conditions = [
    eq(events.userId, USER_ID),
    isNull(events.deletedAt),
  ];
  if (owner) {
    conditions.push(eq(events.owner, owner));
  }

  const rows = await db
    .selectDistinct({ ticker: assets.ticker })
    .from(events)
    .innerJoin(assets, eq(events.assetId, assets.id))
    .where(and(...conditions))
    .orderBy(asc(assets.ticker));

  return rows.map((r) => r.ticker);
}

/**
 * Export tax transactions as CSV rows.
 */
export async function exportTaxTransactionsCsv(
  filters: TaxTransactionsFilters,
): Promise<string> {
  // Fetch all rows (no pagination)
  const result = await getTaxTransactions(filters, 1, 100000);

  const headers = [
    "Date", "Asset", "Type", "Quantity", "Owner", "Account",
    "Proceeds (USD)", "ACB Cost (USD)", "ACB Gain (USD)",
    "Proceeds (GBP)", "ACB Cost (GBP)", "ACB Gain (GBP)",
    "S104 Cost (GBP)", "S104 Gain (GBP)", "S104 Match Types",
  ];

  const csvRows = result.rows.map((r) => [
    r.timestamp.slice(0, 10),
    r.ticker,
    r.eventType,
    r.quantity,
    r.owner,
    r.account,
    r.totalValueUsd ?? "",
    r.acbCostBasisUsd ?? "",
    r.acbGainUsd ?? "",
    r.totalValueGbp ?? "",
    r.acbCostBasisGbp ?? "",
    r.acbGainGbp ?? "",
    r.s104CostBasisGbp ?? "",
    r.s104GainGbp ?? "",
    r.s104MatchTypes?.join("+") ?? "",
  ]);

  return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
}
