import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { strategies, triageRecords } from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface TriageQueueFilters {
  severity?: string;
  contextLevel?: string;
}

export interface TriageQueueRecord {
  id: string;
  severity: string | null;
  contextLevel: string;
  symbol: string;
  recommendedAction: string | null;
  notes: string | null;
  pctNavAbsNotional: number | null;
  absNotional: number | null;
  unrealizedPnl: number | null;
  snapshotDate: string;
  dte: number | null;
  strategyId: string | null;
  strategyKey: string | null;
  positionId: string | null;
}

export interface TriageQueueResult {
  snapshotDate: string | null;
  records: TriageQueueRecord[];
}

export async function getTriageQueue(
  accountId: string,
  filters: TriageQueueFilters = {}
): Promise<TriageQueueResult> {
  const latestDateRow = await db
    .select({ snapshotDate: triageRecords.snapshotDate })
    .from(triageRecords)
    .where(eq(triageRecords.accountId, accountId))
    .orderBy(desc(triageRecords.snapshotDate))
    .limit(1);

  const snapshotDate = latestDateRow[0]?.snapshotDate ?? null;

  if (!snapshotDate) {
    return { snapshotDate: null, records: [] };
  }

  const conditions = [
    eq(triageRecords.accountId, accountId),
    eq(triageRecords.snapshotDate, snapshotDate),
  ];

  if (filters.severity && filters.severity !== "all") {
    conditions.push(eq(triageRecords.severity, filters.severity));
  }

  if (filters.contextLevel && filters.contextLevel !== "all") {
    conditions.push(eq(triageRecords.contextLevel, filters.contextLevel));
  }

  const severityOrder = sql<number>`CASE
    WHEN ${triageRecords.severity} = 'urgent' THEN 4
    WHEN ${triageRecords.severity} = 'attention' THEN 3
    WHEN ${triageRecords.severity} = 'watch' THEN 2
    ELSE 1
  END`;

  const rows = await db
    .select({
      id: triageRecords.id,
      severity: triageRecords.severity,
      contextLevel: triageRecords.contextLevel,
      symbol: triageRecords.symbol,
      recommendedAction: triageRecords.recommendedAction,
      notes: triageRecords.notes,
      pctNavAbsNotional: triageRecords.pctNavAbsNotional,
      absNotional: triageRecords.absNotional,
      unrealizedPnl: triageRecords.unrealizedPnl,
      snapshotDate: triageRecords.snapshotDate,
      dte: triageRecords.dte,
      strategyId: triageRecords.strategyId,
      positionId: triageRecords.positionId,
      strategyKey: strategies.strategyKey,
    })
    .from(triageRecords)
    .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .where(and(...conditions))
    .orderBy(desc(severityOrder), desc(triageRecords.pctNavAbsNotional))
    .limit(100);

  const records: TriageQueueRecord[] = rows.map((row) => ({
    id: row.id,
    severity: row.severity,
    contextLevel: row.contextLevel,
    symbol: row.symbol,
    recommendedAction: row.recommendedAction,
    notes: row.notes,
    pctNavAbsNotional: toNumber(row.pctNavAbsNotional),
    absNotional: toNumber(row.absNotional),
    unrealizedPnl: toNumber(row.unrealizedPnl),
    snapshotDate: row.snapshotDate,
    dte: row.dte,
    strategyId: row.strategyId,
    positionId: row.positionId,
    strategyKey: row.strategyKey,
  }));

  return {
    snapshotDate,
    records,
  };
}

