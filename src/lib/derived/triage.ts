import { db } from '@/db';
import {
  positions,
  strategyMetricsSnapshots,
  strategies,
  underlyingsIvHistory,
  triageRecords,
  blotterActions,
  NewTriageRecord,
} from '@/db/schema';
import { and, eq, sql, isNotNull, lte, gte, inArray, or, isNull, desc } from 'drizzle-orm';

// Triage rule configuration
export const TRIAGE_RULES_V1 = {
  ruleSet: 'options_v1',
  strategySizeRuleSet: 'options_v1:size',
  strategyComplexityRuleSet: 'options_v1:complexity',
  dteThreshold: 30, // Create triage record if DTE <= this
  assignmentDteThreshold: 10,
  sizeAttentionThreshold: 0.15, // 15% of NAV
  sizeUrgentThreshold: 0.25, // 25% of NAV
  complexityThreshold: 10, // num_open_positions
} as const;

/**
 * Computes DTE (days to expiry) for an option position
 */
function computeDte(expiry: string | null, snapshotDate: string): number | null {
  if (!expiry) return null;
  const expiryDate = new Date(expiry + 'T00:00:00Z');
  const snapshotDateObj = new Date(snapshotDate + 'T00:00:00Z');
  const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : null;
}

/**
 * Gets DTE bucket string
 */
function getDteBucket(dte: number | null): string | null {
  if (dte === null) return null;
  if (dte <= 7) return '0-7';
  if (dte <= 30) return '8-30';
  return '>30';
}

/**
 * Computes if option is ITM
 */
function computeIsItm(
  optionRight: string | null,
  spot: string | null,
  strike: string | null
): boolean | null {
  if (!optionRight || !spot || !strike) return null;
  const spotNum = parseFloat(spot);
  const strikeNum = parseFloat(strike);
  if (optionRight === 'C') {
    return spotNum > strikeNum;
  } else if (optionRight === 'P') {
    return spotNum < strikeNum;
  }
  return null;
}

/**
 * Computes sigma-to-strike distance
 */
function computeSigmaToStrike(
  spot: string | null,
  strike: string | null,
  iv30: string | null,
  dte: number | null
): number | null {
  if (!spot || !strike || !iv30 || dte === null || dte <= 0) return null;
  const S = parseFloat(spot);
  const K = parseFloat(strike);
  const sigma = parseFloat(iv30);
  const T = dte / 365;

  if (S <= 0 || K <= 0 || sigma <= 0 || T <= 0) return null;

  const logRatio = Math.log(S / K);
  const denominator = sigma * Math.sqrt(T);
  if (denominator === 0) return null;

  return Math.abs(logRatio) / denominator;
}

/**
 * Checks for active severity override from blotter actions
 * Returns override severity if found, null otherwise
 * 
 * Override matches if:
 * - actionDetail is DISMISS or MONITOR
 * - severityOverride is not null
 * - triageFlagAtAction matches recommendedAction (rule-specific)
 * - overrideExpiresDate is null or >= snapshotDate (not expired)
 * - positionId matches (for position-level) OR strategyId matches (for strategy-level)
 */
async function checkSeverityOverride(
  positionId: string | null,
  strategyId: string | null,
  recommendedAction: string,
  snapshotDate: string
): Promise<string | null> {
  if (!positionId && !strategyId) return null;

  // Build conditions for position/strategy matching
  const entityConditions = [];
  if (positionId) {
    entityConditions.push(eq(blotterActions.positionId, positionId));
  }
  if (strategyId) {
    entityConditions.push(eq(blotterActions.strategyId, strategyId));
  }
  
  // If both exist, match either (for position-level triggers where position belongs to strategy)
  const entityMatch = entityConditions.length > 1 
    ? or(...entityConditions)
    : entityConditions[0];

  const overrideConditions = [
    or(
      eq(blotterActions.actionDetail, 'DISMISS'),
      eq(blotterActions.actionDetail, 'MONITOR')
    ),
    isNotNull(blotterActions.severityOverride),
    eq(blotterActions.triageFlagAtAction, recommendedAction),
    or(
      isNull(blotterActions.overrideExpiresDate),
      gte(blotterActions.overrideExpiresDate, snapshotDate)
    ),
    entityMatch,
  ];

  const override = await db
    .select({ severityOverride: blotterActions.severityOverride })
    .from(blotterActions)
    .where(and(...overrideConditions))
    .orderBy(desc(blotterActions.createdAt))
    .limit(1);

  return override[0]?.severityOverride ?? null;
}

/**
 * Computes position-level triage records for a snapshot date
 */
export async function computePositionTriageForDate(
  snapshotDate: string,
  accountId?: string
): Promise<NewTriageRecord[]> {
  // Get all positions for this date (optionally filtered by account)
  const whereConditions = [
    eq(positions.snapshotDate, snapshotDate),
    sql`${positions.quantity} != 0`,
    eq(positions.assetClass, 'OPT'),
    isNotNull(positions.expiry),
  ];

  if (accountId) {
    whereConditions.push(eq(positions.accountId, accountId));
  }

  const optionPositions = await db
    .select()
    .from(positions)
    .where(and(...whereConditions));

  const records: NewTriageRecord[] = [];

  for (const position of optionPositions) {
    if (!position.expiry || !position.accountId) continue;

    const dte = computeDte(position.expiry, snapshotDate);
    // Don't skip positions with DTE > 30 if they're ITM or have sigma flags
    // We'll check DTE in the severity logic instead

    const dteBucket = getDteBucket(dte);
    const isItm = computeIsItm(position.optionRight, position.spot, position.strike);

    // Get IV for underlying if available
    let iv30: string | null = null;
    if (position.underlyingId) {
      const ivResult = await db
        .select()
        .from(underlyingsIvHistory)
        .where(
          and(
            eq(underlyingsIvHistory.underlyingId, position.underlyingId),
            eq(underlyingsIvHistory.asOfDate, snapshotDate)
          )
        )
        .limit(1);
      iv30 = ivResult[0]?.iv30 ?? null;
    }

    const sigmaToStrike = computeSigmaToStrike(
      position.spot,
      position.strike,
      iv30,
      dte
    );

    const flagSigma05 = sigmaToStrike !== null && sigmaToStrike <= 0.5;
    const flagSigma10 = sigmaToStrike !== null && sigmaToStrike > 0.5 && sigmaToStrike <= 1.0;

    // Assignment risk: short, ITM, DTE thresholds
    const flagAssignmentUrgent =
      position.side === 'SHORT' &&
      isItm === true &&
      dte !== null &&
      dte <= 14;
    
    const flagAssignmentAttention =
      position.side === 'SHORT' &&
      isItm === true &&
      dte !== null &&
      dte <= 30 &&
      dte > 14;

    // Determine if we should create a triage record
    // Create record if: DTE <= 30, or sigma flags, or ITM (any DTE), or assignment risk
    const shouldCreate =
      (dte !== null && dte <= TRIAGE_RULES_V1.dteThreshold) ||
      flagSigma10 ||
      flagSigma05 ||
      (isItm === true) ||
      flagAssignmentUrgent ||
      flagAssignmentAttention;

    if (!shouldCreate) continue;

    // Determine severity based on priority (most severe first)
    let severity: 'info' | 'attention' | 'urgent' | null = null;
    let recommendedAction: string | null = null;

    // 1. Assignment risk (highest priority)
    if (flagAssignmentUrgent) {
      severity = 'urgent';
      recommendedAction = 'CLOSE_OR_ROLL';
    } else if (flagAssignmentAttention) {
      severity = 'attention';
      recommendedAction = 'CLOSE_OR_ROLL';
    } else if (isItm === true) {
      // ITM but not short assignment risk
      severity = 'info';
      recommendedAction = 'MONITOR';
    }
    // 2. Sigma flags (check after assignment risk)
    else if (flagSigma05 && position.side === 'SHORT') {
      severity = 'urgent';
      recommendedAction = 'WATCH_CLOSELY';
    } else if (flagSigma05) {
      severity = 'attention';
      recommendedAction = 'WATCH_CLOSELY';
    } else if (flagSigma10) {
      severity = 'info';
      recommendedAction = 'MONITOR';
    }
    // 3. DTE flags (check after sigma flags)
    else if (position.side === 'SHORT' && dte !== null && dte <= 21) {
      severity = 'attention';
      recommendedAction = 'REVIEW_DTE';
    } else if (position.side === 'LONG' && dte !== null && dte <= 7) {
      severity = 'attention';
      recommendedAction = 'REVIEW_DTE';
    } else if (dte !== null && dte <= 30) {
      severity = 'info';
      recommendedAction = 'REVIEW_DTE';
    }

    // Check for active severity override from previous actions
    let overrideSeverity: string | null = null;
    if (recommendedAction) {
      overrideSeverity = await checkSeverityOverride(
        position.id,
        position.strategyId,
        recommendedAction,
        snapshotDate
      );
    }

    // Apply override if found, otherwise use computed severity
    const finalSeverity = overrideSeverity || severity;

    records.push({
      snapshotDate,
      accountId: position.accountId,
      contextLevel: 'position',
      positionId: position.id,
      strategyId: position.strategyId,
      underlyingId: position.underlyingId,
      symbol: position.symbol,
      assetClass: position.assetClass,
      dte,
      dteBucket,
      flagDteShort: dte !== null && dte <= 7,
      flagDteLong: dte !== null && dte > 30,
      isItm,
      sigmaToStrike: sigmaToStrike?.toString() ?? null,
      flagSigma05,
      flagSigma10,
      flagAssignment: flagAssignmentUrgent || flagAssignmentAttention,
      unrealizedPnl: position.unrealizedPnl,
      absNotional: position.absNotional,
      severity: finalSeverity,
      recommendedAction,
      ruleSet: TRIAGE_RULES_V1.ruleSet,
    });
  }

  return records;
}

/**
 * Computes strategy-level triage records for a snapshot date
 * Includes: size/complexity checks, opening strategies, state code changes, closing strategies
 */
export async function computeStrategyTriageForDate(
  snapshotDate: string,
  accountId?: string
): Promise<NewTriageRecord[]> {
  const whereConditions = [eq(strategyMetricsSnapshots.snapshotDate, snapshotDate)];

  if (accountId) {
    whereConditions.push(eq(strategyMetricsSnapshots.accountId, accountId));
  }

  const strategyMetrics = await db
    .select()
    .from(strategyMetricsSnapshots)
    .where(and(...whereConditions));

  const strategyIds = Array.from(
    new Set(
      strategyMetrics
        .map((metric) => metric.strategyId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const strategyKeyMap = new Map<string, string>();
  const strategyRows = strategyIds.length > 0
    ? await db
        .select({
          id: strategies.id,
          key: strategies.strategyKey,
          isAuto: strategies.isAuto,
          strategyType: strategies.strategyType,
          confirmedAt: strategies.confirmedAt,
          thesis: strategies.thesis,
          profitRules: strategies.profitRules,
          defenseRules: strategies.defenseRules,
          timeRules: strategies.timeRules,
        })
      .from(strategies)
        .where(inArray(strategies.id, strategyIds))
    : [];

    strategyRows.forEach((row) => strategyKeyMap.set(row.id, row.key));

  const records: NewTriageRecord[] = [];

  // Get previous snapshot date for state code change detection
  const previousDateResult = await db
    .selectDistinct({ snapshotDate: strategyMetricsSnapshots.snapshotDate })
    .from(strategyMetricsSnapshots)
    .where(
      accountId
        ? and(
            eq(strategyMetricsSnapshots.accountId, accountId),
            sql`${strategyMetricsSnapshots.snapshotDate} < ${snapshotDate}`
          )
        : sql`${strategyMetricsSnapshots.snapshotDate} < ${snapshotDate}`
    )
    .orderBy(sql`${strategyMetricsSnapshots.snapshotDate} DESC`)
    .limit(1);

  const previousDate = previousDateResult[0]?.snapshotDate ?? null;

  for (const metric of strategyMetrics) {
    if (!metric.strategyId) continue;

    const strategyRow = strategyRows.find((s) => s.id === metric.strategyId);
    const strategyKey = strategyKeyMap.get(metric.strategyId) ?? `STRATEGY-${metric.strategyId}`;

    // 1. CONFIRM_STRATEGIES - Unconfirmed auto-derived strategies
    if (strategyRow?.isAuto && !strategyRow.confirmedAt) {
      const computedSeverity = 'urgent';
      const recommendedAction = 'CONFIRM_STRATEGIES';
      
      // Check for active override
      const overrideSeverity = await checkSeverityOverride(
        null,
        metric.strategyId,
        recommendedAction,
        snapshotDate
      );
      
      records.push({
        snapshotDate,
        accountId: metric.accountId,
        contextLevel: 'strategy',
        strategyId: metric.strategyId,
        severity: overrideSeverity || computedSeverity,
        recommendedAction,
        notes: 'Strategy needs confirmation: review and confirm strategy metadata',
        ruleSet: 'strategy_workflow',
        symbol: strategyKey,
      });
    }
    // 2. PROVIDE_STRATEGY_METADATA - Confirmed but missing required fields
    else if (strategyRow?.confirmedAt) {
      const missingFields: string[] = [];
      if (!strategyRow.strategyType) missingFields.push('strategy_type');
      if (!strategyRow.thesis) missingFields.push('thesis');
      if (!strategyRow.profitRules) missingFields.push('profit_rules');
      if (!strategyRow.defenseRules) missingFields.push('defense_rules');
      if (!strategyRow.timeRules) missingFields.push('time_rules');

      if (missingFields.length > 0) {
        const computedSeverity = 'attention';
        const recommendedAction = 'PROVIDE_STRATEGY_METADATA';
        
        // Check for active override
        const overrideSeverity = await checkSeverityOverride(
          null,
          metric.strategyId,
          recommendedAction,
          snapshotDate
        );
        
        records.push({
          snapshotDate,
          accountId: metric.accountId,
          contextLevel: 'strategy',
          strategyId: metric.strategyId,
          severity: overrideSeverity || computedSeverity,
          recommendedAction,
          notes: `Strategy confirmed but missing: ${missingFields.join(', ')}`,
          ruleSet: 'strategy_workflow',
          symbol: strategyKey,
        });
      }
    }

    // 3. REVIEW_SIZE - Size vs NAV check (merged REDUCE_SIZE and REVIEW_SIZE)
    if (metric.pctNavAbsNotional) {
      const pctNav = parseFloat(metric.pctNavAbsNotional) / 100; // Convert from percentage

      const recommendedAction = 'REVIEW_SIZE';
      let computedSeverity: 'urgent' | 'attention' | 'info' | null = null;
      let notes = '';
      
      if (pctNav >= 0.5) {
        computedSeverity = 'urgent';
        notes = `Strategy represents ${(pctNav * 100).toFixed(1)}% of NAV (>= 50%)`;
      } else if (pctNav >= 0.25) {
        computedSeverity = 'attention';
        notes = `Strategy represents ${(pctNav * 100).toFixed(1)}% of NAV (25-50%)`;
      } else if (pctNav >= 0.1) {
        computedSeverity = 'info';
        notes = `Strategy represents ${(pctNav * 100).toFixed(1)}% of NAV (10-25%)`;
      }
      
      if (computedSeverity) {
        // Check for active override
        const overrideSeverity = await checkSeverityOverride(
          null,
          metric.strategyId,
          recommendedAction,
          snapshotDate
        );
        
        records.push({
          snapshotDate,
          accountId: metric.accountId,
          contextLevel: 'strategy',
          strategyId: metric.strategyId,
          pctNavAbsNotional: metric.pctNavAbsNotional,
          severity: overrideSeverity || computedSeverity,
          recommendedAction,
          notes,
          ruleSet: TRIAGE_RULES_V1.strategySizeRuleSet,
          symbol: strategyKey,
        });
      }
    }

    // 4. Complexity check
    if (metric.numOpenPositions && metric.numOpenPositions > TRIAGE_RULES_V1.complexityThreshold) {
      const computedSeverity = 'info';
      const recommendedAction = 'REVIEW_COMPLEXITY';
      
      // Check for active override
      const overrideSeverity = await checkSeverityOverride(
        null,
        metric.strategyId,
        recommendedAction,
        snapshotDate
      );
      
      records.push({
        snapshotDate,
        accountId: metric.accountId,
        contextLevel: 'strategy',
        strategyId: metric.strategyId,
        severity: overrideSeverity || computedSeverity,
        recommendedAction,
        notes: `Strategy has ${metric.numOpenPositions} open positions`,
        ruleSet: TRIAGE_RULES_V1.strategyComplexityRuleSet,
        symbol: strategyKey,
      });
    }

    // 5. State code change detection (if strategy has a type and previous date exists)
    // Note: State code computation is complex and may be slow, so we'll skip it for now
    // and implement it as a separate background job or on-demand computation
    // TODO: Implement state code change detection when stateCode.ts is fully tested
    // When implemented, any state code change should trigger with severity = 'urgent'
  }

  return records;
}

/**
 * Upserts triage records into the database
 */
export async function upsertTriageRecords(records: NewTriageRecord[]): Promise<void> {
  if (records.length === 0) return;

  for (const record of records) {
    if (record.contextLevel === 'strategy') {
      const { strategyId, snapshotDate, ruleSet } = record;
      if (!strategyId || !ruleSet) {
        throw new Error('Strategy triage record missing strategyId or ruleSet');
      }
      await db
        .delete(triageRecords)
        .where(
          and(
            eq(triageRecords.contextLevel, 'strategy'),
            eq(triageRecords.strategyId, strategyId),
            eq(triageRecords.snapshotDate, snapshotDate),
            eq(triageRecords.ruleSet, ruleSet)
          )
        );
    } else {
      const { positionId, strategyId, snapshotDate, ruleSet } = record;
      if (!positionId || !strategyId || !ruleSet) {
        throw new Error('Position triage record missing ids or ruleSet');
      }
      await db
        .delete(triageRecords)
        .where(
          and(
            eq(triageRecords.contextLevel, 'position'),
            eq(triageRecords.positionId, positionId),
            eq(triageRecords.strategyId, strategyId),
            eq(triageRecords.snapshotDate, snapshotDate),
            eq(triageRecords.ruleSet, ruleSet)
          )
        );
    }

    await db.insert(triageRecords).values(record);
  }
}

/**
 * Computes all triage records for a snapshot date
 */
export async function computeTriageForDate(
  snapshotDate: string,
  accountId?: string
): Promise<{ position: number; strategy: number }> {
  const positionRecords = await computePositionTriageForDate(snapshotDate, accountId);
  const strategyRecords = await computeStrategyTriageForDate(snapshotDate, accountId);

  await upsertTriageRecords([...positionRecords, ...strategyRecords]);

  return {
    position: positionRecords.length,
    strategy: strategyRecords.length,
  };
}

