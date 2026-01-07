import { and, desc, asc, eq, sql, ne, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { strategies, triageRecords, thesisTriageRecords } from "@/db/schema";
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

// ============================================================================
// Thesis Triage Records (for macro/asset theses workflow orchestration)
// ============================================================================

export interface ThesisTriageFilters {
  status?: string[];  // 'pending' | 'in_review' | 'actioned' | 'dismissed'
  severity?: string[];  // 'critical' | 'high' | 'medium' | 'low' | 'info'
  thesisType?: string[];  // 'macro' | 'asset'
  lifecycleStage?: string[];  // 'created' | 'claims_linked' | 'synthesized' | 'validated' | 'monitoring'
}

export interface ThesisTriageQueueRecord {
  id: string;
  createdAt: Date;
  thesisId: string;
  thesisType: string;
  thesisTitle: string;
  triggerType: string;
  triggerSource: string;
  triageRule: string | null;  // thesis_needs_articulation | thesis_new_claims_available | thesis_monitoring_content | thesis_data_trigger
  severity: string;
  urgency: string;
  status: string;
  lifecycleStage: string | null;
  suggestedSkill: string | null;
  actionRequired: string | null;
  userNotes: string | null;
  completedAt: Date | null;
}

export interface ThesisTriageQueueRecordFull extends ThesisTriageQueueRecord {
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
    conditions.push(ne(thesisTriageRecords.status, 'actioned'));
    conditions.push(ne(thesisTriageRecords.status, 'dismissed'));
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
      urgency: thesisTriageRecords.urgency,
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
      // Sort by urgency (immediate first), then severity, then creation date
      sql`CASE ${thesisTriageRecords.urgency}
        WHEN 'immediate' THEN 1
        WHEN 'today' THEN 2
        WHEN 'this_week' THEN 3
        WHEN 'when_convenient' THEN 4
        ELSE 5
      END`,
      sql`CASE ${thesisTriageRecords.severity}
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        WHEN 'info' THEN 5
        ELSE 6
      END`,
      desc(thesisTriageRecords.createdAt)
    );

  return rows;
}

/**
 * Get thesis triage queue with JSONB fields (contentSummary, aiAnalysis, matchedResults)
 */
export async function getThesisTriageQueueFull(
  filters: ThesisTriageFilters = {}
): Promise<ThesisTriageQueueRecordFull[]> {
  const conditions = [];

  // By default, only show non-completed records
  if (!filters.status || filters.status.length === 0) {
    conditions.push(ne(thesisTriageRecords.status, 'actioned'));
    conditions.push(ne(thesisTriageRecords.status, 'dismissed'));
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
      urgency: thesisTriageRecords.urgency,
      status: thesisTriageRecords.status,
      lifecycleStage: thesisTriageRecords.lifecycleStage,
      suggestedSkill: thesisTriageRecords.suggestedSkill,
      actionRequired: thesisTriageRecords.actionRequired,
      userNotes: thesisTriageRecords.userNotes,
      completedAt: thesisTriageRecords.completedAt,
      contentSummary: thesisTriageRecords.contentSummary,
      aiAnalysis: thesisTriageRecords.aiAnalysis,
      matchedResults: thesisTriageRecords.matchedResults,
    })
    .from(thesisTriageRecords)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      // Sort by urgency (immediate first), then severity, then creation date
      sql`CASE ${thesisTriageRecords.urgency}
        WHEN 'immediate' THEN 1
        WHEN 'today' THEN 2
        WHEN 'this_week' THEN 3
        WHEN 'when_convenient' THEN 4
        ELSE 5
      END`,
      sql`CASE ${thesisTriageRecords.severity}
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        WHEN 'info' THEN 5
        ELSE 6
      END`,
      desc(thesisTriageRecords.createdAt)
    );

  return rows;
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
  // Base condition: exclude completed records for counts
  const baseConditions = [
    ne(thesisTriageRecords.status, 'actioned'),
    ne(thesisTriageRecords.status, 'dismissed'),
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

    // Total pending count
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
    if (update.status === 'actioned' || update.status === 'dismissed') {
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
 */
export async function getUnifiedTriageQueue(
  accountId: string,
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
  if (queryPositions) {
    const positionFilters: TriageQueueFilters = {};

    // Map status filter to severity (position/strategy uses "severity")
    if (filters.status && filters.status.length > 0) {
      positionFilters.severity = filters.status;
    }

    // Map trigger filter to recommendedAction
    if (filters.trigger && filters.trigger.length > 0) {
      positionFilters.recommendedAction = filters.trigger;
    }

    const positionResult = await getTriageQueue(accountId, positionFilters);

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
  if (queryTheses) {
    const thesisFilters: ThesisTriageFilters = {};

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
