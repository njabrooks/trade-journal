import { and, desc, asc, eq, sql, ne, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { strategies, triageRecords } from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface TriageQueueFilters {
  severity?: string | string[]; // Array for multi-select
  contextLevel?: string | string[]; // Array for multi-select
  recommendedAction?: string[]; // Array for multi-select
  strategyKey?: string[]; // Array for multi-select
  sort?: string; // Column to sort by
  direction?: "asc" | "desc"; // Sort direction
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
  accountId: string;
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
    // For historical triggers, show across all dates. For time-bound triggers, only show latest date
    or(
      inArray(triageRecords.recommendedAction, historicalTriggers),
      eq(triageRecords.snapshotDate, snapshotDate)
    ),
  ];

  // Handle severity filtering
  if (filters.severity) {
    const severityArray = Array.isArray(filters.severity) 
      ? filters.severity 
      : filters.severity !== "all" 
      ? [filters.severity] 
      : [];
    if (severityArray.length > 0) {
      conditions.push(inArray(triageRecords.severity, severityArray));
    }
  } else {
    // Exclude completed records by default (when no severity filter is set)
    // This prevents showing historical CONFIRM_STRATEGIES records that are already complete
    conditions.push(ne(triageRecords.severity, 'complete'));
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

  // Build orderBy clause based on sort parameter
  const orderByClauses = [];
  if (filters.sort) {
    const direction = filters.direction === "asc" ? asc : desc;
    switch (filters.sort) {
      case "symbol":
        orderByClauses.push(direction(triageRecords.symbol));
        break;
      case "recommendedAction":
        orderByClauses.push(direction(triageRecords.recommendedAction));
        break;
      case "severity":
        orderByClauses.push(direction(severityOrder));
        break;
      case "contextLevel":
        orderByClauses.push(direction(triageRecords.contextLevel));
        break;
      case "snapshotDate":
        orderByClauses.push(direction(triageRecords.snapshotDate));
        break;
      case "dte":
        orderByClauses.push(direction(triageRecords.dte));
        break;
      case "strategyKey":
        orderByClauses.push(direction(strategies.strategyKey));
        break;
      default:
        // Default sort
        orderByClauses.push(desc(triageRecords.snapshotDate), desc(severityOrder));
    }
  } else {
    // Default sort
    orderByClauses.push(desc(triageRecords.snapshotDate), desc(severityOrder));
  }

  // Exclude triage records for merged strategies
  conditions.push(
    or(
      isNull(strategies.status),
      ne(strategies.status, 'merged')
    )
  );

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
      accountId: triageRecords.accountId,
      strategyKey: strategies.strategyKey,
    })
    .from(triageRecords)
    .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .where(and(...conditions))
    .orderBy(...orderByClauses);

  let records: TriageQueueRecord[] = rows.map((row) => ({
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
    accountId: row.accountId,
    strategyKey: row.strategyKey,
  }));

  // Deduplicate CONFIRM_STRATEGIES records: keep only the most recent one per strategy
  // This prevents showing hundreds of duplicate records for unconfirmed strategies
  const confirmStrategiesRecords = records.filter(r => r.recommendedAction === 'CONFIRM_STRATEGIES');
  const otherRecords = records.filter(r => r.recommendedAction !== 'CONFIRM_STRATEGIES');
  
  if (confirmStrategiesRecords.length > 0) {
    // Group by strategyId and keep only the most recent (by snapshotDate)
    const latestByStrategy = new Map<string, TriageQueueRecord>();
    for (const record of confirmStrategiesRecords) {
      if (!record.strategyId) {
        // Keep records without strategyId (shouldn't happen, but handle gracefully)
        latestByStrategy.set(record.id, record);
        continue;
      }
      
      const existing = latestByStrategy.get(record.strategyId);
      if (!existing || record.snapshotDate > existing.snapshotDate) {
        latestByStrategy.set(record.strategyId, record);
      }
    }
    
    // Combine deduplicated CONFIRM_STRATEGIES with other records
    records = [...Array.from(latestByStrategy.values()), ...otherRecords];
  }

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
    // For historical triggers, show across all dates. For time-bound triggers, only show latest date
    or(
      inArray(triageRecords.recommendedAction, historicalTriggers),
      eq(triageRecords.snapshotDate, snapshotDate)
    ),
  ];

  // Handle severity filtering
  if (filters.severity) {
    const severityArray = Array.isArray(filters.severity) 
      ? filters.severity 
      : filters.severity !== "all" 
      ? [filters.severity] 
      : [];
    if (severityArray.length > 0) {
      conditions.push(inArray(triageRecords.severity, severityArray));
    }
  } else {
    // Exclude completed records by default (when no severity filter is set)
    // This prevents showing historical CONFIRM_STRATEGIES records that are already complete
    conditions.push(ne(triageRecords.severity, 'complete'));
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

  // Build orderBy clause based on sort parameter
  const orderByClauses = [];
  if (filters.sort) {
    const direction = filters.direction === "asc" ? asc : desc;
    switch (filters.sort) {
      case "symbol":
        orderByClauses.push(direction(triageRecords.symbol));
        break;
      case "recommendedAction":
        orderByClauses.push(direction(triageRecords.recommendedAction));
        break;
      case "severity":
        orderByClauses.push(direction(severityOrder));
        break;
      case "contextLevel":
        orderByClauses.push(direction(triageRecords.contextLevel));
        break;
      case "snapshotDate":
        orderByClauses.push(direction(triageRecords.snapshotDate));
        break;
      case "dte":
        orderByClauses.push(direction(triageRecords.dte));
        break;
      default:
        // Default sort
        orderByClauses.push(desc(triageRecords.snapshotDate), desc(severityOrder));
    }
  } else {
    // Default sort
    orderByClauses.push(desc(triageRecords.snapshotDate), desc(severityOrder));
  }

  // Exclude triage records for merged strategies
  conditions.push(
    or(
      isNull(strategies.status),
      ne(strategies.status, 'merged')
    )
  );

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
      accountId: triageRecords.accountId,
      strategyKey: strategies.strategyKey,
    })
    .from(triageRecords)
    .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .where(and(...conditions))
    .orderBy(...orderByClauses);

  let records: TriageQueueRecord[] = rows.map((row) => ({
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
    accountId: row.accountId,
    strategyKey: row.strategyKey,
  }));

  // Deduplicate CONFIRM_STRATEGIES records: keep only the most recent one per strategy
  // This prevents showing hundreds of duplicate records for unconfirmed strategies
  const confirmStrategiesRecords = records.filter(r => r.recommendedAction === 'CONFIRM_STRATEGIES');
  const otherRecords = records.filter(r => r.recommendedAction !== 'CONFIRM_STRATEGIES');
  
  if (confirmStrategiesRecords.length > 0) {
    // Group by strategyId and keep only the most recent (by snapshotDate)
    const latestByStrategy = new Map<string, TriageQueueRecord>();
    for (const record of confirmStrategiesRecords) {
      if (!record.strategyId) {
        // Keep records without strategyId (shouldn't happen, but handle gracefully)
        latestByStrategy.set(record.id, record);
        continue;
      }
      
      const existing = latestByStrategy.get(record.strategyId);
      if (!existing || record.snapshotDate > existing.snapshotDate) {
        latestByStrategy.set(record.strategyId, record);
      }
    }
    
    // Combine deduplicated CONFIRM_STRATEGIES with other records
    records = [...Array.from(latestByStrategy.values()), ...otherRecords];
  }

  return {
    snapshotDate,
    records,
  };
}

export interface TriageQueueCounts {
  severity: Record<string, number>;
  contextLevel: Record<string, number>;
  recommendedAction: Record<string, number>;
  strategyKey: Record<string, number>;
}

/**
 * Get counts for all triage filter options using SQL aggregation
 * This replaces the pattern of fetching ALL records just to count them
 */
export async function getTriageQueueCounts(
  accountId: string
): Promise<TriageQueueCounts> {
  // Get latest snapshot date
  const latestDateRow = await db
    .select({ snapshotDate: triageRecords.snapshotDate })
    .from(triageRecords)
    .where(eq(triageRecords.accountId, accountId))
    .orderBy(desc(triageRecords.snapshotDate))
    .limit(1);

  const snapshotDate = latestDateRow[0]?.snapshotDate ?? null;

  if (!snapshotDate) {
    return {
      severity: {},
      contextLevel: {},
      recommendedAction: {},
      strategyKey: {},
    };
  }

  // Same logic as getTriageQueue for which records to include
  const historicalTriggers = ['QUANTITY_CHANGE', 'CONFIRM_STRATEGIES'];

  const baseConditions = [
    eq(triageRecords.accountId, accountId),
    or(
      inArray(triageRecords.recommendedAction, historicalTriggers),
      eq(triageRecords.snapshotDate, snapshotDate)
    ),
    ne(triageRecords.severity, 'complete'), // Exclude completed by default
    or(
      isNull(strategies.status),
      ne(strategies.status, 'merged')
    ),
  ];

  // Get counts for each dimension using SQL GROUP BY
  const [severityRows, contextRows, actionRows, strategyRows] = await Promise.all([
    // Severity counts
    db
      .select({
        value: triageRecords.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(triageRecords)
      .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
      .where(and(...baseConditions))
      .groupBy(triageRecords.severity),

    // Context level counts
    db
      .select({
        value: triageRecords.contextLevel,
        count: sql<number>`count(*)::int`,
      })
      .from(triageRecords)
      .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
      .where(and(...baseConditions))
      .groupBy(triageRecords.contextLevel),

    // Recommended action counts
    db
      .select({
        value: triageRecords.recommendedAction,
        count: sql<number>`count(*)::int`,
      })
      .from(triageRecords)
      .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
      .where(and(...baseConditions))
      .groupBy(triageRecords.recommendedAction),

    // Strategy key counts
    db
      .select({
        value: strategies.strategyKey,
        count: sql<number>`count(*)::int`,
      })
      .from(triageRecords)
      .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
      .where(and(...baseConditions, sql`${strategies.strategyKey} IS NOT NULL`))
      .groupBy(strategies.strategyKey),
  ]);

  return {
    severity: Object.fromEntries(
      severityRows.map((row) => [row.value ?? '', row.count])
    ),
    contextLevel: Object.fromEntries(
      contextRows.map((row) => [row.value ?? '', row.count])
    ),
    recommendedAction: Object.fromEntries(
      actionRows.map((row) => [row.value ?? '', row.count])
    ),
    strategyKey: Object.fromEntries(
      strategyRows.map((row) => [row.value ?? '', row.count])
    ),
  };
}
