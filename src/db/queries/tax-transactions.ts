import { db } from "@/db";
import { events, eventCalculations, assets } from "@/db/schema";
import { and, eq, sql, asc, isNull, gte, lte } from "drizzle-orm";
import { toNumber } from "@/lib/numbers";
import type {
  TaxTransactionRow,
  TaxTransactionsSummary,
  TaxTransactionsResult,
} from "@/lib/tax-transactions-types";

// Re-export shared types for server-side consumers
export type { TaxTransactionRow, TaxTransactionsSummary, TaxTransactionsResult };

// Single-user system (from TTC migration)
const USER_ID = "user_2mYzScugP7zfcqv8Ox21i7q9nyW";

export interface TaxTransactionsFilters {
  owner?: string;
  taxYearStart?: string; // ISO date
  taxYearEnd?: string;   // ISO date
  assetTicker?: string;
  eventType?: "disposal" | "acquisition" | "all";
  matchType?: string;    // same_day | bed_and_breakfast | section_104_pool | all
}

// Disposal event types
const DISPOSAL_TYPES = ["SELL", "SEND", "FEE", "GIFT_OUT"];
const ACQUISITION_TYPES = ["BUY", "RECEIVE", "INTEREST", "STAKING_REWARD", "DIVIDEND", "INCOME"];

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
      price: events.price,
      totalValueUsd: events.totalValue,
      acbCostBasisUsd: eventCalculations.costBasis,
      acbGainUsd: eventCalculations.realizedGain,
      totalValueGbp: eventCalculations.totalValueGbp,
      s104CostBasisGbp: eventCalculations.s104CostBasisGbp,
      s104GainGbp: eventCalculations.s104RealizedGainGbp,
      owner: events.owner,
      account: events.account,
      source: events.source,
      fxRateToGbp: eventCalculations.fxRateToGbp,
      metadata: events.metadata,
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
      totalS104GainGbp: sql<string>`COALESCE(SUM(${eventCalculations.s104RealizedGainGbp}::numeric), 0)`,
    })
    .from(events)
    .innerJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .innerJoin(assets, eq(events.assetId, assets.id))
    .where(and(...conditions));

  const s = summaryResult[0];

  return {
    rows: rows.map((r) => {
      // Extract tag from metadata: Koinly uses 'tag', IBKR uses 'activityCode'
      const meta = r.metadata as Record<string, unknown> | null;
      const tag = meta
        ? (meta.tag as string) ?? (meta.activityCode as string) ?? null
        : null;

      return {
        eventId: r.eventId,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
        ticker: r.ticker,
        assetName: r.assetName,
        eventType: r.eventType,
        tag,
        quantity: toNumber(r.quantity) ?? 0,
        price: toNumber(r.price),
        totalValueUsd: toNumber(r.totalValueUsd),
        acbCostBasisUsd: toNumber(r.acbCostBasisUsd),
        acbGainUsd: toNumber(r.acbGainUsd),
        totalValueGbp: toNumber(r.totalValueGbp),
        s104CostBasisGbp: toNumber(r.s104CostBasisGbp),
        s104GainGbp: toNumber(r.s104GainGbp),
        s104MatchTypes: r.s104MatchTypes,
        owner: r.owner,
        account: r.account,
        source: r.source,
        fxRateToGbp: toNumber(r.fxRateToGbp),
      };
    }),
    summary: {
      totalCount: Number(s?.totalCount ?? 0),
      disposalCount: Number(s?.disposalCount ?? 0),
      totalProceedsUsd: toNumber(s?.totalProceedsUsd) ?? 0,
      totalProceedsGbp: toNumber(s?.totalProceedsGbp) ?? 0,
      totalAcbGainUsd: toNumber(s?.totalAcbGainUsd) ?? 0,
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
 * CSV always includes all methods for completeness.
 */
export async function exportTaxTransactionsCsv(
  filters: TaxTransactionsFilters,
): Promise<string> {
  // Fetch all rows (no pagination)
  const result = await getTaxTransactions(filters, 1, 100000);

  const headers = [
    "Date", "Asset", "Type", "Tag", "Quantity", "Price",
    "Owner", "Account", "Source",
    "Proceeds (USD)", "ACB Cost (USD)", "ACB Gain (USD)",
    "Proceeds (GBP)", "S104 Cost (GBP)", "S104 Gain (GBP)",
    "S104 Match Types", "FX Rate (GBP)",
  ];

  const csvRows = result.rows.map((r) => [
    r.timestamp.slice(0, 10),
    r.ticker,
    r.eventType,
    r.tag ?? "",
    r.quantity,
    r.price ?? "",
    r.owner,
    r.account,
    r.source,
    r.totalValueUsd ?? "",
    r.acbCostBasisUsd ?? "",
    r.acbGainUsd ?? "",
    r.totalValueGbp ?? "",
    r.s104CostBasisGbp ?? "",
    r.s104GainGbp ?? "",
    r.s104MatchTypes?.join("+") ?? "",
    r.fxRateToGbp ?? "",
  ]);

  return [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
}
