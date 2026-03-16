import { and, desc, asc, eq, sql, ne, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { strategies, strategyTemplates, triageRecords, thesisTriageRecords, macroTheses, assetTheses, underlyings } from "@/db/schema";
import { toNumber } from "@/lib/numbers";

export interface TriageQueueFilters {
  status?: string | string[]; // Workflow state: 'inbox' | 'in_progress' | 'done'
  severity?: string | string[]; // Importance: 'urgent' | 'attention' | 'monitor' | 'info'
  contextLevel?: string | string[]; // Array for multi-select
  recommendedAction?: string[]; // Array for multi-select
  strategyKey?: string[]; // Array for multi-select
  sort?: string; // Column to sort by
  direction?: "asc" | "desc"; // Sort direction
}

export interface TriageQueueRecord {
  id: string;
  status: string | null; // Workflow state: 'inbox' | 'in_progress' | 'done'
  severity: string | null; // Importance: 'urgent' | 'attention' | 'monitor' | 'info'
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
  strategyLabel: string | null; // Human-readable label for the strategy
  positionId: string | null;
  accountId: string;
  direction: string | null; // 'bullish' | 'bearish' | 'neutral'
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

  // All triage records persist until dismissed — no snapshot date filtering.
  // Dedup in computePositionTriageForDate prevents duplicates across dates.
  const conditions = [
    eq(triageRecords.accountId, accountId),
  ];

  // Handle status filtering (workflow state)
  if (filters.status) {
    const statusArray = Array.isArray(filters.status)
      ? filters.status
      : filters.status !== "all"
      ? [filters.status]
      : [];
    if (statusArray.length > 0) {
      conditions.push(inArray(triageRecords.status, statusArray));
    }
  } else {
    // Exclude completed records by default (when no status filter is set)
    // This prevents showing historical CONFIRM_STRATEGIES records that are already done
    conditions.push(ne(triageRecords.status, 'done'));
  }

  // Handle severity filtering (importance level)
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

  // Severity order for sorting by importance (urgent > attention > monitor > info)
  const severityOrder = sql<number>`CASE
    WHEN ${triageRecords.severity} = 'urgent' THEN 4
    WHEN ${triageRecords.severity} = 'attention' THEN 3
    WHEN ${triageRecords.severity} = 'monitor' THEN 2
    WHEN ${triageRecords.severity} = 'info' THEN 1
    ELSE 0
  END`;

  // Status order for sorting by workflow state (inbox > in_progress > done)
  const statusOrder = sql<number>`CASE
    WHEN ${triageRecords.status} = 'inbox' THEN 3
    WHEN ${triageRecords.status} = 'in_progress' THEN 2
    WHEN ${triageRecords.status} = 'done' THEN 1
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

  // Exclude triage records for rejected (abandoned) strategies
  conditions.push(
    or(
      isNull(strategies.status),
      ne(strategies.status, 'rejected')
    )!
  );

  const rows = await db
    .select({
      id: triageRecords.id,
      status: triageRecords.status,
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
      strategyLabel: strategyTemplates.label,
      direction: triageRecords.direction,
    })
    .from(triageRecords)
    .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .where(and(...conditions))
    .orderBy(...orderByClauses);

  let records: TriageQueueRecord[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
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
    strategyLabel: row.strategyLabel,
    direction: row.direction,
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

/**
 * Get triage queue across ALL accounts (no account filtering)
 * Used by the main triage page which shows records from all accounts
 */
export async function getTriageQueueAllAccounts(
  filters: TriageQueueFilters = {}
): Promise<TriageQueueResult> {
  // Get latest snapshot date across all accounts (for display purposes only)
  const latestDateRow = await db
    .select({ snapshotDate: triageRecords.snapshotDate })
    .from(triageRecords)
    .orderBy(desc(triageRecords.snapshotDate))
    .limit(1);

  const snapshotDate = latestDateRow[0]?.snapshotDate ?? null;

  if (!snapshotDate) {
    return { snapshotDate: null, records: [] };
  }

  // All triage records persist until dismissed — no snapshot date filtering.
  // Dedup in computePositionTriageForDate prevents duplicates across dates.
  const conditions: any[] = [];

  // Handle status filtering (workflow state)
  if (filters.status) {
    const statusArray = Array.isArray(filters.status)
      ? filters.status
      : filters.status !== "all"
      ? [filters.status]
      : [];
    if (statusArray.length > 0) {
      conditions.push(inArray(triageRecords.status, statusArray));
    }
  } else {
    // Exclude completed records by default
    conditions.push(ne(triageRecords.status, 'done'));
  }

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

  // Severity order for sorting
  const severityOrder = sql<number>`CASE
    WHEN ${triageRecords.severity} = 'urgent' THEN 4
    WHEN ${triageRecords.severity} = 'attention' THEN 3
    WHEN ${triageRecords.severity} = 'monitor' THEN 2
    WHEN ${triageRecords.severity} = 'info' THEN 1
    ELSE 0
  END`;

  // Build orderBy clause
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
      case "snapshotDate":
        orderByClauses.push(direction(triageRecords.snapshotDate));
        break;
      default:
        orderByClauses.push(desc(triageRecords.snapshotDate), desc(severityOrder));
    }
  } else {
    orderByClauses.push(desc(triageRecords.snapshotDate), desc(severityOrder));
  }

  // Exclude triage records for rejected strategies
  conditions.push(
    or(
      isNull(strategies.status),
      ne(strategies.status, 'rejected')
    )!
  );

  const rows = await db
    .select({
      id: triageRecords.id,
      status: triageRecords.status,
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
      strategyLabel: strategyTemplates.label,
      direction: triageRecords.direction,
    })
    .from(triageRecords)
    .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .where(and(...conditions))
    .orderBy(...orderByClauses);

  let records: TriageQueueRecord[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
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
    strategyLabel: row.strategyLabel,
    direction: row.direction,
  }));

  // Deduplicate CONFIRM_STRATEGIES records
  const confirmStrategiesRecords = records.filter(r => r.recommendedAction === 'CONFIRM_STRATEGIES');
  const otherRecords = records.filter(r => r.recommendedAction !== 'CONFIRM_STRATEGIES');

  if (confirmStrategiesRecords.length > 0) {
    const latestByStrategy = new Map<string, TriageQueueRecord>();
    for (const record of confirmStrategiesRecords) {
      if (!record.strategyId) {
        latestByStrategy.set(record.id, record);
        continue;
      }

      const existing = latestByStrategy.get(record.strategyId);
      if (!existing || record.snapshotDate > existing.snapshotDate) {
        latestByStrategy.set(record.strategyId, record);
      }
    }

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

  // All triage records persist until dismissed — no snapshot date filtering.
  const conditions = [
    eq(triageRecords.strategyId, strategyId),
  ];

  // Handle status filtering (workflow state)
  if (filters.status) {
    const statusArray = Array.isArray(filters.status)
      ? filters.status
      : filters.status !== "all"
      ? [filters.status]
      : [];
    if (statusArray.length > 0) {
      conditions.push(inArray(triageRecords.status, statusArray));
    }
  } else {
    // Exclude completed records by default (when no status filter is set)
    // This prevents showing historical CONFIRM_STRATEGIES records that are already done
    conditions.push(ne(triageRecords.status, 'done'));
  }

  // Handle severity filtering (importance level)
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

  // Severity order for sorting by importance (urgent > attention > monitor > info)
  const severityOrder = sql<number>`CASE
    WHEN ${triageRecords.severity} = 'urgent' THEN 4
    WHEN ${triageRecords.severity} = 'attention' THEN 3
    WHEN ${triageRecords.severity} = 'monitor' THEN 2
    WHEN ${triageRecords.severity} = 'info' THEN 1
    ELSE 0
  END`;

  // Status order for sorting by workflow state (inbox > in_progress > done)
  const statusOrder = sql<number>`CASE
    WHEN ${triageRecords.status} = 'inbox' THEN 3
    WHEN ${triageRecords.status} = 'in_progress' THEN 2
    WHEN ${triageRecords.status} = 'done' THEN 1
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

  // Exclude triage records for rejected (abandoned) strategies
  conditions.push(
    or(
      isNull(strategies.status),
      ne(strategies.status, 'rejected')
    )!
  );

  const rows = await db
    .select({
      id: triageRecords.id,
      status: triageRecords.status,
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
      strategyLabel: strategyTemplates.label,
      direction: triageRecords.direction,
    })
    .from(triageRecords)
    .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .where(and(...conditions))
    .orderBy(...orderByClauses);

  let records: TriageQueueRecord[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
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
    strategyLabel: row.strategyLabel,
    direction: row.direction,
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
  status: Record<string, number>;
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
      status: {},
      severity: {},
      contextLevel: {},
      recommendedAction: {},
      strategyKey: {},
    };
  }

  // All triage records persist until dismissed — no snapshot date filtering.
  const baseConditions = [
    eq(triageRecords.accountId, accountId),
    ne(triageRecords.status, 'done'), // Exclude done by default
    or(
      isNull(strategies.status),
      ne(strategies.status, 'rejected') // Exclude rejected (abandoned) strategies
    )!,
  ];

  // Get counts for each dimension using SQL GROUP BY
  const [statusRows, severityRows, contextRows, actionRows, strategyRows] = await Promise.all([
    // Status counts
    db
      .select({
        value: triageRecords.status,
        count: sql<number>`count(*)::int`,
      })
      .from(triageRecords)
      .leftJoin(strategies, eq(triageRecords.strategyId, strategies.id))
      .where(and(...baseConditions))
      .groupBy(triageRecords.status),

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
    status: Object.fromEntries(
      statusRows.map((row) => [row.value ?? '', row.count])
    ),
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

// ============================================================================
// Thesis Triage Records (for macro/asset theses workflow orchestration)
// ============================================================================

export interface ThesisTriageFilters {
  status?: string[];  // 'inbox' | 'in_progress' | 'done'
  severity?: string[];  // 'urgent' | 'attention' | 'monitor' | 'info'
  thesisType?: string[];  // 'macro' | 'asset'
  lifecycleStage?: string[];  // 'created' | 'claims_linked' | 'synthesized' | 'validated' | 'monitoring'
  includeAll?: boolean;  // If true, include done records (for "All Triage" view)
  thesisId?: string;  // Filter to specific thesis
}

// Base record without display fields (from simple query)
export interface ThesisTriageQueueRecord {
  id: string;
  createdAt: Date;
  thesisId: string;
  thesisType: string;
  thesisTitle: string;
  triggerType: string;
  triggerSource: string;
  triageRule: string | null;  // NEEDS_RESEARCH | PRODUCE_CORE_ARGUMENT | UPDATE_CORE_ARGUMENT | REVIEW_CONTENT | REVIEW_DATA
  severity: string;
  status: string;
  lifecycleStage: string | null;
  suggestedSkill: string | null;
  actionRequired: string | null;
  userNotes: string | null;
  completedAt: Date | null;
}

// Full record with display fields (from joined query) and JSONB fields
export interface ThesisTriageQueueRecordFull extends ThesisTriageQueueRecord {
  // Display fields (joined from thesis tables)
  ticker: string | null;        // For asset theses: underlying ticker (e.g., "GLW")
  direction: string | null;     // 'bullish' | 'bearish' | 'neutral'
  displayTitle: string;         // Ticker for asset theses, stripped title for macro theses
  // JSONB fields
  contentSummary: unknown;
  aiAnalysis: unknown;
  matchedResults: unknown;
}

/**
 * Get thesis triage queue with optional filters
 */
export async function getThesisTriageQueue(
  filters: ThesisTriageFilters = {}
): Promise<ThesisTriageQueueRecord[]> {
  const conditions = [];

  // By default, only show non-completed records
  if (!filters.status || filters.status.length === 0) {
    conditions.push(ne(thesisTriageRecords.status, 'done'));
  } else {
    conditions.push(inArray(thesisTriageRecords.status, filters.status));
  }

  if (filters.severity && filters.severity.length > 0) {
    conditions.push(inArray(thesisTriageRecords.severity, filters.severity));
  }

  if (filters.thesisType && filters.thesisType.length > 0) {
    conditions.push(inArray(thesisTriageRecords.thesisType, filters.thesisType));
  }

  if (filters.lifecycleStage && filters.lifecycleStage.length > 0) {
    conditions.push(inArray(thesisTriageRecords.lifecycleStage, filters.lifecycleStage));
  }

  const rows = await db
    .select({
      id: thesisTriageRecords.id,
      createdAt: thesisTriageRecords.createdAt,
      thesisId: thesisTriageRecords.thesisId,
      thesisType: thesisTriageRecords.thesisType,
      thesisTitle: thesisTriageRecords.thesisTitle,
      triggerType: thesisTriageRecords.triggerType,
      triggerSource: thesisTriageRecords.triggerSource,
      triageRule: thesisTriageRecords.triageRule,
      severity: thesisTriageRecords.severity,
      status: thesisTriageRecords.status,
      lifecycleStage: thesisTriageRecords.lifecycleStage,
      suggestedSkill: thesisTriageRecords.suggestedSkill,
      actionRequired: thesisTriageRecords.actionRequired,
      userNotes: thesisTriageRecords.userNotes,
      completedAt: thesisTriageRecords.completedAt,
    })
    .from(thesisTriageRecords)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      // Sort by severity (urgent first), then status, then creation date
      sql`CASE ${thesisTriageRecords.severity}
        WHEN 'urgent' THEN 4
        WHEN 'attention' THEN 3
        WHEN 'monitor' THEN 2
        WHEN 'info' THEN 1
        ELSE 0
      END DESC`,
      sql`CASE ${thesisTriageRecords.status}
        WHEN 'inbox' THEN 3
        WHEN 'in_progress' THEN 2
        WHEN 'done' THEN 1
        ELSE 0
      END DESC`,
      desc(thesisTriageRecords.createdAt)
    );

  return rows;
}

/**
 * Get thesis triage queue with JSONB fields (contentSummary, aiAnalysis, matchedResults)
 * Also includes ticker and direction from joined thesis tables for display
 */
export async function getThesisTriageQueueFull(
  filters: ThesisTriageFilters = {}
): Promise<ThesisTriageQueueRecordFull[]> {
  const conditions = [];

  // By default, only show non-completed records (using new status values)
  // Unless includeAll is true (for "All Triage" view)
  if (filters.includeAll) {
    // Include all records - no status exclusion
    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(thesisTriageRecords.status, filters.status));
    }
  } else if (!filters.status || filters.status.length === 0) {
    // Exclude 'done' status by default (new standardized pattern)
    conditions.push(ne(thesisTriageRecords.status, 'done'));
  } else {
    conditions.push(inArray(thesisTriageRecords.status, filters.status));
  }

  if (filters.severity && filters.severity.length > 0) {
    conditions.push(inArray(thesisTriageRecords.severity, filters.severity));
  }

  if (filters.thesisType && filters.thesisType.length > 0) {
    conditions.push(inArray(thesisTriageRecords.thesisType, filters.thesisType));
  }

  if (filters.lifecycleStage && filters.lifecycleStage.length > 0) {
    conditions.push(inArray(thesisTriageRecords.lifecycleStage, filters.lifecycleStage));
  }

  if (filters.thesisId) {
    conditions.push(eq(thesisTriageRecords.thesisId, filters.thesisId));
  }

  // Join to thesis tables to get ticker and direction
  const rows = await db
    .select({
      id: thesisTriageRecords.id,
      createdAt: thesisTriageRecords.createdAt,
      thesisId: thesisTriageRecords.thesisId,
      thesisType: thesisTriageRecords.thesisType,
      thesisTitle: thesisTriageRecords.thesisTitle,
      triggerType: thesisTriageRecords.triggerType,
      triggerSource: thesisTriageRecords.triggerSource,
      triageRule: thesisTriageRecords.triageRule,
      severity: thesisTriageRecords.severity,
      status: thesisTriageRecords.status,
      lifecycleStage: thesisTriageRecords.lifecycleStage,
      suggestedSkill: thesisTriageRecords.suggestedSkill,
      actionRequired: thesisTriageRecords.actionRequired,
      userNotes: thesisTriageRecords.userNotes,
      completedAt: thesisTriageRecords.completedAt,
      contentSummary: thesisTriageRecords.contentSummary,
      aiAnalysis: thesisTriageRecords.aiAnalysis,
      matchedResults: thesisTriageRecords.matchedResults,
      // Joined fields for display
      ticker: underlyings.ticker,
      assetDirection: assetTheses.direction,
      macroDirection: macroTheses.direction,
    })
    .from(thesisTriageRecords)
    // Left join to asset_theses and underlyings for asset thesis records
    .leftJoin(
      assetTheses,
      and(
        eq(thesisTriageRecords.thesisId, assetTheses.id),
        eq(thesisTriageRecords.thesisType, 'asset')
      )
    )
    .leftJoin(
      underlyings,
      eq(assetTheses.underlyingId, underlyings.id)
    )
    // Left join to macro_theses for macro thesis records
    .leftJoin(
      macroTheses,
      and(
        eq(thesisTriageRecords.thesisId, macroTheses.id),
        eq(thesisTriageRecords.thesisType, 'macro')
      )
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      // Sort by severity priority (importance level)
      sql`CASE ${thesisTriageRecords.severity}
        WHEN 'urgent' THEN 1
        WHEN 'attention' THEN 2
        WHEN 'monitor' THEN 3
        WHEN 'info' THEN 4
        ELSE 5
      END`,
      // Then by status priority (workflow state)
      sql`CASE ${thesisTriageRecords.status}
        WHEN 'inbox' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'done' THEN 3
        ELSE 4
      END`,
      desc(thesisTriageRecords.createdAt)
    );

  // Transform rows to include computed display fields
  return rows.map(row => {
    const direction = row.thesisType === 'asset' ? row.assetDirection : row.macroDirection;

    // Compute displayTitle: ticker for asset, stripped title for macro
    let displayTitle: string;
    if (row.thesisType === 'asset' && row.ticker) {
      displayTitle = row.ticker;
    } else {
      // Strip "Bullish " or "Bearish " prefix from title
      displayTitle = row.thesisTitle
        .replace(/^Bullish\s+/i, '')
        .replace(/^Bearish\s+/i, '')
        .replace(/^Neutral\s+/i, '');
    }

    return {
      id: row.id,
      createdAt: row.createdAt,
      thesisId: row.thesisId,
      thesisType: row.thesisType,
      thesisTitle: row.thesisTitle,
      triggerType: row.triggerType,
      triggerSource: row.triggerSource,
      triageRule: row.triageRule,
      severity: row.severity,
      status: row.status,
      lifecycleStage: row.lifecycleStage,
      suggestedSkill: row.suggestedSkill,
      actionRequired: row.actionRequired,
      userNotes: row.userNotes,
      completedAt: row.completedAt,
      contentSummary: row.contentSummary,
      aiAnalysis: row.aiAnalysis,
      matchedResults: row.matchedResults,
      // Display fields
      ticker: row.ticker,
      direction: direction,
      displayTitle,
    };
  });
}

/**
 * Get counts for thesis triage filtering
 */
export async function getThesisTriageQueueCounts(): Promise<{
  status: Record<string, number>;
  severity: Record<string, number>;
  thesisType: Record<string, number>;
  lifecycleStage: Record<string, number>;
  total: number;
}> {
  // Base condition: exclude 'done' records for counts (new standardized pattern)
  const baseConditions = [
    ne(thesisTriageRecords.status, 'done'),
  ];

  const [statusRows, severityRows, typeRows, lifecycleRows, totalRow] = await Promise.all([
    // Status counts (including all statuses for transparency)
    db
      .select({
        value: thesisTriageRecords.status,
        count: sql<number>`count(*)::int`,
      })
      .from(thesisTriageRecords)
      .groupBy(thesisTriageRecords.status),

    // Severity counts
    db
      .select({
        value: thesisTriageRecords.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(thesisTriageRecords)
      .where(and(...baseConditions))
      .groupBy(thesisTriageRecords.severity),

    // Thesis type counts
    db
      .select({
        value: thesisTriageRecords.thesisType,
        count: sql<number>`count(*)::int`,
      })
      .from(thesisTriageRecords)
      .where(and(...baseConditions))
      .groupBy(thesisTriageRecords.thesisType),

    // Lifecycle stage counts
    db
      .select({
        value: thesisTriageRecords.lifecycleStage,
        count: sql<number>`count(*)::int`,
      })
      .from(thesisTriageRecords)
      .where(and(...baseConditions))
      .groupBy(thesisTriageRecords.lifecycleStage),

    // Total count (excluding 'done')
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(thesisTriageRecords)
      .where(and(...baseConditions)),
  ]);

  return {
    status: Object.fromEntries(
      statusRows.map((row) => [row.value ?? '', row.count])
    ),
    severity: Object.fromEntries(
      severityRows.map((row) => [row.value ?? '', row.count])
    ),
    thesisType: Object.fromEntries(
      typeRows.map((row) => [row.value ?? '', row.count])
    ),
    lifecycleStage: Object.fromEntries(
      lifecycleRows.map((row) => [row.value ?? '', row.count])
    ),
    total: totalRow[0]?.count ?? 0,
  };
}

/**
 * Get a single thesis triage record by ID
 */
export async function getThesisTriageById(id: string) {
  const [record] = await db
    .select()
    .from(thesisTriageRecords)
    .where(eq(thesisTriageRecords.id, id))
    .limit(1);

  return record ?? null;
}

/**
 * Update thesis triage record status
 */
export async function updateThesisTriageStatus(
  id: string,
  update: {
    status?: string;
    userNotes?: string;
    completedBy?: string;
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (update.status) {
    updateData.status = update.status;
    // Set completion timestamp when status moves to 'done'
    if (update.status === 'done') {
      updateData.completedAt = new Date();
      updateData.completedBy = update.completedBy || 'user';
    }
  }

  if (update.userNotes !== undefined) {
    updateData.userNotes = update.userNotes;
  }

  await db
    .update(thesisTriageRecords)
    .set(updateData)
    .where(eq(thesisTriageRecords.id, id));
}

// ============================================================================
// Unified Triage Queue (combines position/strategy + thesis triage)
// ============================================================================

import {
  UnifiedTriageRecord,
  UnifiedTriageFilters,
  UnifiedTriageResult,
  UnifiedTriageFilterCounts,
  TriageObjectType,
  mapPositionTriageToUnified,
  mapThesisTriageToUnified,
} from "@/types/triage";

/**
 * Get unified triage queue combining position/strategy and thesis triage records
 *
 * @param filters - Optional filters for the query
 * @param filters.accountId - Optional account ID. If not provided, fetches from all accounts.
 */
export async function getUnifiedTriageQueue(
  filters: UnifiedTriageFilters = {}
): Promise<UnifiedTriageResult> {
  // Determine which sources to query based on objectType filter
  const queryPositions = !filters.objectType ||
    filters.objectType.includes("position") ||
    filters.objectType.includes("strategy");
  const queryTheses = !filters.objectType ||
    filters.objectType.includes("asset_thesis") ||
    filters.objectType.includes("macro_thesis");

  const results: UnifiedTriageRecord[] = [];

  // Query position/strategy triage
  // Skip if filtering by thesisId (thesis-specific view doesn't include position/strategy triage)
  if (queryPositions && !filters.thesisId) {
    const positionFilters: TriageQueueFilters = {};

    // Map status filter to severity (position/strategy uses "severity")
    if (filters.status && filters.status.length > 0) {
      positionFilters.severity = filters.status;
    }

    // Map trigger filter to recommendedAction
    if (filters.trigger && filters.trigger.length > 0) {
      positionFilters.recommendedAction = filters.trigger;
    }

    // Use strategy-specific query when filtering by strategyId, otherwise fetch all accounts
    const positionResult = filters.strategyId
      ? await getTriageQueueForStrategy(filters.strategyId, positionFilters)
      : await getTriageQueueAllAccounts(positionFilters);

    // Map and filter by object type if specified
    for (const record of positionResult.records) {
      const unified = mapPositionTriageToUnified(record);

      // Apply objectType filter
      if (filters.objectType && filters.objectType.length > 0) {
        if (!filters.objectType.includes(unified.objectType)) {
          continue;
        }
      }

      results.push(unified);
    }
  }

  // Query thesis triage
  // Skip if filtering by strategyId (strategy-specific view doesn't include thesis triage)
  if (queryTheses && !filters.strategyId) {
    const thesisFilters: ThesisTriageFilters = {};

    // Pass through includeAll flag for "All Triage" view
    if (filters.includeAll) {
      thesisFilters.includeAll = true;
    }

    // Map status filter
    if (filters.status && filters.status.length > 0) {
      thesisFilters.status = filters.status;
    }

    // Map objectType filter to thesisType
    if (filters.objectType && filters.objectType.length > 0) {
      const thesisTypes: string[] = [];
      if (filters.objectType.includes("macro_thesis")) {
        thesisTypes.push("macro");
      }
      if (filters.objectType.includes("asset_thesis")) {
        thesisTypes.push("asset");
      }
      if (thesisTypes.length > 0) {
        thesisFilters.thesisType = thesisTypes;
      }
    }

    // Pass through thesisId filter for entity-specific views
    if (filters.thesisId) {
      thesisFilters.thesisId = filters.thesisId;
    }

    const thesisRecords = await getThesisTriageQueueFull(thesisFilters);

    for (const record of thesisRecords) {
      const unified = mapThesisTriageToUnified(record);

      // Apply trigger filter (thesis uses triageRule/triggerType as trigger)
      if (filters.trigger && filters.trigger.length > 0) {
        if (!filters.trigger.includes(unified.trigger)) {
          continue;
        }
      }

      results.push(unified);
    }
  }

  // Sort by date (newest first) by default
  const sortColumn = filters.sort ?? "date";
  const sortDirection = filters.direction ?? "desc";

  results.sort((a, b) => {
    let aVal: string | number | Date;
    let bVal: string | number | Date;

    switch (sortColumn) {
      case "title":
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case "trigger":
        aVal = a.trigger.toLowerCase();
        bVal = b.trigger.toLowerCase();
        break;
      case "status":
        aVal = a.status.toLowerCase();
        bVal = b.status.toLowerCase();
        break;
      case "objectType":
        aVal = a.objectType;
        bVal = b.objectType;
        break;
      case "date":
      default:
        aVal = a.date.getTime();
        bVal = b.date.getTime();
        break;
    }

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Compute filter counts
  const counts = computeUnifiedFilterCounts(results);

  return {
    records: results,
    counts,
    totalCount: results.length,
  };
}

/**
 * Compute filter counts from unified records
 */
function computeUnifiedFilterCounts(
  records: UnifiedTriageRecord[]
): UnifiedTriageFilterCounts {
  const objectType: Record<TriageObjectType, number> = {
    position: 0,
    strategy: 0,
    asset_thesis: 0,
    macro_thesis: 0,
  };
  const status: Record<string, number> = {};
  const trigger: Record<string, number> = {};

  for (const record of records) {
    // Object type counts
    objectType[record.objectType]++;

    // Status counts
    if (record.status) {
      status[record.status] = (status[record.status] ?? 0) + 1;
    }

    // Trigger counts
    if (record.trigger) {
      trigger[record.trigger] = (trigger[record.trigger] ?? 0) + 1;
    }
  }

  return { objectType, status, trigger };
}
