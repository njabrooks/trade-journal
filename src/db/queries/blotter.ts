import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { blotterActions, strategies } from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface BlotterFilters {
  actionClass?: string;
  followUp?: "all" | "pending" | "completed";
}

export interface BlotterEntry {
  id: string;
  actionDate: string;
  createdAt: Date | null;
  strategyId: string | null;
  strategyKey: string | null;
  actionClass: string | null;
  actionDetail: string | null;
  reasonCode: string | null;
  legScope: string | null;
  qtyChange: number | null;
  premiumChange: number | null;
  realizedPnl: number | null;
  followUpRequired: boolean | null;
  followUpDate: string | null;
  completed: boolean | null;
  source: string | null;
  tradeCount: number | null;
  tradeIds: string[] | null;
  conid: number | null;
  linkedBlotterActionId: string | null;
}

export async function getBlotterEntries(
  accountId: string | null,
  filters: BlotterFilters = {},
  limit = 100
): Promise<BlotterEntry[]> {
  const conditions = [];

  if (accountId) {
    conditions.push(eq(strategies.accountId, accountId));
  }

  if (filters.actionClass && filters.actionClass !== "all") {
    conditions.push(eq(blotterActions.actionClass, filters.actionClass));
  }

  if (filters.followUp && filters.followUp !== "all") {
    if (filters.followUp === "pending") {
      conditions.push(eq(blotterActions.followUpRequired, true));
      conditions.push(eq(blotterActions.completed, false));
    } else if (filters.followUp === "completed") {
      conditions.push(eq(blotterActions.completed, true));
    }
  }

  const baseQuery = db
    .select({
      id: blotterActions.id,
      actionDate: blotterActions.actionDate,
      createdAt: blotterActions.createdAt,
      strategyId: blotterActions.strategyId,
      strategyKey: strategies.strategyKey,
      actionClass: blotterActions.actionClass,
      actionDetail: blotterActions.actionDetail,
      reasonCode: blotterActions.reasonCode,
      legScope: blotterActions.legScope,
      qtyChange: blotterActions.qtyChange,
      premiumChange: blotterActions.premiumChange,
      realizedPnl: blotterActions.realizedPnl,
      followUpRequired: blotterActions.followUpRequired,
      followUpDate: blotterActions.followUpDate,
      completed: blotterActions.completed,
      source: blotterActions.source,
      tradeCount: blotterActions.tradeCount,
      tradeIds: blotterActions.tradeIds,
      conid: sql<number | null>`${blotterActions.conid}::bigint`.as('conid'),
      linkedBlotterActionId: blotterActions.linkedBlotterActionId,
    })
    .from(blotterActions)
    .leftJoin(strategies, eq(blotterActions.strategyId, strategies.id));

  const filteredQuery =
    conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

  const rows = await filteredQuery
    .orderBy(desc(blotterActions.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    actionDate: row.actionDate,
    createdAt: row.createdAt,
    strategyId: row.strategyId,
    strategyKey: row.strategyKey,
    actionClass: row.actionClass,
    actionDetail: row.actionDetail,
    reasonCode: row.reasonCode,
    legScope: row.legScope,
    qtyChange: toNumber(row.qtyChange),
    premiumChange: toNumber(row.premiumChange),
    realizedPnl: toNumber(row.realizedPnl),
    followUpRequired: row.followUpRequired ?? null,
    followUpDate: row.followUpDate ?? null,
    completed: row.completed ?? null,
    source: row.source ?? 'triage_action',
    tradeCount: row.tradeCount ?? null,
    tradeIds: (row.tradeIds as string[] | null) ?? null,
    conid: row.conid ?? null,
    linkedBlotterActionId: row.linkedBlotterActionId ?? null,
  }));
}

