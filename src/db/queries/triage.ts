import { and, desc, eq, sql, ne, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { strategies, triageRecords } from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface TriageQueueFilters {
  severity?: string | string[]; // Array for multi-select
  contextLevel?: string | string[]; // Array for multi-select
  recommendedAction?: string[]; // Array for multi-select
  strategyKey?: string[]; // Array for multi-select
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
  // Get latest snapshot date for display purposes
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

  // Categorize triggers:
  // - Historical record-keeping: Should persist until resolved (QUANTITY_CHANGE, CONFIRM_STRATEGIES)
  //   These are created once on a specific date and represent events that need documentation
  // - Time-bound: Should only show for latest date (everything else, including PROVIDE_STRATEGY_METADATA)
  //   These are recalculated daily and would create duplicates if persisted across dates
  const historicalTriggers = ['QUANTITY_CHANGE', 'CONFIRM_STRATEGIES'];
  
  const conditions = [
    eq(triageRecords.accountId, accountId),
    // Exclude 'complete' records - only show unresolved items
    or(
      ne(triageRecords.severity, 'complete'),
      isNull(triageRecords.severity)
    ),
    // For historical triggers, show across all dates. For time-bound triggers, only show latest date
    or(
      inArray(triageRecords.recommendedAction, historicalTriggers),
      eq(triageRecords.snapshotDate, snapshotDate)
    ),
  ];

  if (filters.severity) {
    const severityArray = Array.isArray(filters.severity) 
      ? filters.severity 
      : filters.severity !== "all" 
      ? [filters.severity] 
      : [];
    if (severityArray.length > 0) {
      conditions.push(inArray(triageRecords.severity, severityArray));
    }
  }

  if (filters.contextLevel) {
    const contextArray = Array.isArray(filters.contextLevel)
      ? filters.contextLevel
      : filters.contextLevel !== "all"
      ? [filters.contextLevel]
      : [];
    if (contextArray.length > 0) {
      conditions.push(inArray(triageRecords.contextLevel, contextArray));
    }
  }

  if (filters.recommendedAction && filters.recommendedAction.length > 0) {
    conditions.push(inArray(triageRecords.recommendedAction, filters.recommendedAction));
  }

  if (filters.strategyKey && filters.strategyKey.length > 0) {
    conditions.push(inArray(strategies.strategyKey, filters.strategyKey));
  }

  const severityOrder = sql<number>`CASE
    WHEN ${triageRecords.severity} = 'urgent' THEN 5
    WHEN ${triageRecords.severity} = 'attention' THEN 4
    WHEN ${triageRecords.severity} = 'monitor' THEN 3
    WHEN ${triageRecords.severity} = 'info' THEN 2
    WHEN ${triageRecords.severity} = 'pending' THEN 1
    WHEN ${triageRecords.severity} = 'complete' THEN 0
    ELSE 0
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
    .orderBy(desc(triageRecords.snapshotDate), desc(severityOrder))
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

export async function getTriageQueueForStrategy(
  strategyId: string,
  filters: TriageQueueFilters = {}
): Promise<TriageQueueResult> {
  const latestDateRow = await db
    .select({ snapshotDate: triageRecords.snapshotDate })
    .from(triageRecords)
    .where(eq(triageRecords.strategyId, strategyId))
    .orderBy(desc(triageRecords.snapshotDate))
    .limit(1);

  const snapshotDate = latestDateRow[0]?.snapshotDate ?? null;

  if (!snapshotDate) {
    return { snapshotDate: null, records: [] };
  }

  // Categorize triggers: Historical vs time-bound (same as account-level queue)
  // Historical: Created once, persist until resolved. Time-bound: Recalculated daily, only show latest.
  const historicalTriggers = ['QUANTITY_CHANGE', 'CONFIRM_STRATEGIES'];
  
  const conditions = [
    eq(triageRecords.strategyId, strategyId),
    // Exclude 'complete' records - only show unresolved items
    or(
      ne(triageRecords.severity, 'complete'),
      isNull(triageRecords.severity)
    ),
    // For historical triggers, show across all dates. For time-bound triggers, only show latest date
    or(
      inArray(triageRecords.recommendedAction, historicalTriggers),
      eq(triageRecords.snapshotDate, snapshotDate)
    ),
  ];

  if (filters.severity) {
    const severityArray = Array.isArray(filters.severity) 
      ? filters.severity 
      : filters.severity !== "all" 
      ? [filters.severity] 
      : [];
    if (severityArray.length > 0) {
      conditions.push(inArray(triageRecords.severity, severityArray));
    }
  }

  if (filters.contextLevel) {
    const contextArray = Array.isArray(filters.contextLevel)
      ? filters.contextLevel
      : filters.contextLevel !== "all"
      ? [filters.contextLevel]
      : [];
    if (contextArray.length > 0) {
      conditions.push(inArray(triageRecords.contextLevel, contextArray));
    }
  }

  if (filters.recommendedAction && filters.recommendedAction.length > 0) {
    conditions.push(inArray(triageRecords.recommendedAction, filters.recommendedAction));
  }

  if (filters.strategyKey && filters.strategyKey.length > 0) {
    conditions.push(inArray(strategies.strategyKey, filters.strategyKey));
  }

  const severityOrder = sql<number>`CASE
    WHEN ${triageRecords.severity} = 'urgent' THEN 5
    WHEN ${triageRecords.severity} = 'attention' THEN 4
    WHEN ${triageRecords.severity} = 'monitor' THEN 3
    WHEN ${triageRecords.severity} = 'info' THEN 2
    WHEN ${triageRecords.severity} = 'pending' THEN 1
    WHEN ${triageRecords.severity} = 'complete' THEN 0
    ELSE 0
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
    .orderBy(desc(triageRecords.snapshotDate), desc(severityOrder))
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

