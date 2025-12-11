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
import { and, eq, sql, isNotNull, lte, gte, inArray, or, isNull, desc, ne } from 'drizzle-orm';
import { detectStateCodeChangeFromStored } from '@/lib/derived/stateCode';

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
 * @param strategyId - Optional: filter to positions for a specific strategy (for targeted recompute)
 */
export async function computePositionTriageForDate(
  snapshotDate: string,
  accountId?: string,
  strategyId?: string
): Promise<NewTriageRecord[]> {
  // Get all positions for this date (optionally filtered by account and strategy)
  // Use SQL cast to handle string quantities properly
  const whereConditions = [
    eq(positions.snapshotDate, snapshotDate),
    sql`CAST(${positions.quantity} AS DECIMAL) != 0`,
    eq(positions.assetClass, 'OPT'),
    isNotNull(positions.expiry),
  ];

  if (accountId) {
    whereConditions.push(eq(positions.accountId, accountId));
  }

  if (strategyId) {
    whereConditions.push(eq(positions.strategyId, strategyId));
  }

  const optionPositions = await db
    .select()
    .from(positions)
    .where(and(...whereConditions));

  const records: NewTriageRecord[] = [];

  // Batch fetch IV data for all underlyingIds to avoid N+1 queries
  const underlyingIds = Array.from(
    new Set(
      optionPositions
        .map((p) => p.underlyingId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const ivDataMap = new Map<string, string | null>();
  const underlyingSpotMap = new Map<string, string | null>();
  if (underlyingIds.length > 0) {
    const ivResults = await db
      .select({
        underlyingId: underlyingsIvHistory.underlyingId,
        iv30: underlyingsIvHistory.iv30,
        spot: underlyingsIvHistory.spot,
      })
      .from(underlyingsIvHistory)
      .where(
        and(
          inArray(underlyingsIvHistory.underlyingId, underlyingIds),
          eq(underlyingsIvHistory.asOfDate, snapshotDate)
        )
      );

    for (const iv of ivResults) {
      if (iv.underlyingId) {
        ivDataMap.set(iv.underlyingId, iv.iv30 ?? null);
        underlyingSpotMap.set(iv.underlyingId, iv.spot ?? null);
      }
    }
  }

  for (const position of optionPositions) {
    if (!position.expiry || !position.accountId) continue;

    const dte = computeDte(position.expiry, snapshotDate);
    // Don't skip positions with DTE > 30 if they're ITM or have sigma flags
    // We'll check DTE in the severity logic instead

    const dteBucket = getDteBucket(dte);
    
    // Get underlying spot price for ITM calculation (not option mark price)
    // For options, position.spot is the option's mark price, not the underlying's spot
    const underlyingSpot = position.underlyingId 
      ? underlyingSpotMap.get(position.underlyingId) ?? null 
      : null;

    // Use underlying spot for ITM calculation, fallback to position.spot if unavailable
    // (position.spot might be underlying spot for stocks, but for options it's option mark price)
    // For options, we MUST have underlying spot data - cannot use position.spot (which is option mark price)
    const spotForItm = position.assetClass === 'OPT' 
      ? underlyingSpot  // For options, only use underlying spot, never position.spot
      : (underlyingSpot ?? position.spot);  // For stocks, prefer underlying spot but fallback to position.spot
    const isItm = computeIsItm(position.optionRight, spotForItm, position.strike);
    
    // Safety check: Don't create ITM flags for options without underlying spot data
    // This prevents false positives when underlying data is missing
    if (position.assetClass === 'OPT' && !underlyingSpot && isItm !== null) {
      // This shouldn't happen, but log a warning if it does
      console.warn(`ITM calculation attempted for option ${position.symbol} without underlying spot data on ${snapshotDate}`);
    }

    // Get IV for underlying from pre-fetched map
    const iv30 = position.underlyingId ? ivDataMap.get(position.underlyingId) ?? null : null;

    // Use underlying spot for sigma calculation (same as ITM - need underlying spot, not option mark price)
    // For options, we MUST have underlying spot data - cannot use position.spot (which is option mark price)
    const spotForSigma = position.assetClass === 'OPT'
      ? underlyingSpot  // For options, only use underlying spot, never position.spot
      : (underlyingSpot ?? position.spot);  // For stocks, prefer underlying spot but fallback to position.spot
    const sigmaToStrike = computeSigmaToStrike(
      spotForSigma,
      position.strike,
      iv30,
      dte
    );

    const flagSigma05 = sigmaToStrike !== null && sigmaToStrike <= 0.5;
    const flagSigma10 = sigmaToStrike !== null && sigmaToStrike > 0.5 && sigmaToStrike <= 1.0;

    // For options, all triggers that depend on spot/ITM/sigma require underlying spot data
    // This prevents false positives when underlying data is missing
    // For stocks, we can use position.spot as fallback
    const hasRequiredSpotData = position.assetClass === 'OPT' 
      ? underlyingSpot !== null  // Options require underlying spot
      : true;  // Stocks can use position.spot as fallback

    // Assignment risk: short, ITM, DTE thresholds
    // Only evaluate if we have required underlying spot data (assignment risk depends on ITM)
    const flagAssignmentUrgent =
      hasRequiredSpotData &&
      position.side === 'SHORT' &&
      isItm === true &&
      dte !== null &&
      dte <= 14;
    
    const flagAssignmentAttention =
      hasRequiredSpotData &&
      position.side === 'SHORT' &&
      isItm === true &&
      dte !== null &&
      dte <= 30 &&
      dte > 14;

    // Determine if we should create a triage record
    // Create record if: DTE <= 30, or sigma flags, or ITM (any DTE), or assignment risk
    // For options, all spot-dependent triggers require underlying spot data to prevent false positives
    
    const shouldCreate =
      (dte !== null && dte <= TRIAGE_RULES_V1.dteThreshold) ||
      (hasRequiredSpotData && flagSigma10) ||
      (hasRequiredSpotData && flagSigma05) ||
      (hasRequiredSpotData && isItm === true) || // Only create ITM flags if we have underlying spot data
      (hasRequiredSpotData && flagAssignmentUrgent) ||
      (hasRequiredSpotData && flagAssignmentAttention);

    if (!shouldCreate) continue;

    // Determine severity based on priority (most severe first)
    let severity: 'info' | 'attention' | 'urgent' | null = null;
    let recommendedAction: string | null = null;

    // 1. Assignment risk (highest priority)
    // Only evaluate if we have required underlying spot data
    if (hasRequiredSpotData && flagAssignmentUrgent) {
      severity = 'urgent';
      recommendedAction = 'ASSIGNMENT_RISK≤14_DTE';
    } else if (hasRequiredSpotData && flagAssignmentAttention) {
      severity = 'attention';
      recommendedAction = 'ASSIGNMENT_RISK≤30_DTE';
    } else if (hasRequiredSpotData && isItm === true) {
      // ITM but not short assignment risk - differentiate by long vs short
      // Only create ITM flags if we have underlying spot data (required for accurate ITM calculation)
      severity = 'info';
      if (position.side === 'SHORT') {
        recommendedAction = 'ITM_SHORT';
      } else {
        recommendedAction = 'ITM_LONG';
      }
    }
    // 2. Sigma flags (check after assignment risk)
    // Only evaluate if we have required underlying spot data
    else if (hasRequiredSpotData && flagSigma05 && position.side === 'SHORT') {
      severity = 'urgent';
      recommendedAction = 'SIGMA_0.5_SHORT';
    } else if (hasRequiredSpotData && flagSigma05) {
      severity = 'attention';
      recommendedAction = 'SIGMA_0.5_LONG';
    } else if (hasRequiredSpotData && flagSigma10) {
      severity = 'info';
      recommendedAction = 'SIGMA_1.0';
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
 * @param strategyId - Optional: filter to a specific strategy (for targeted recompute)
 */
export async function computeStrategyTriageForDate(
  snapshotDate: string,
  accountId?: string,
  strategyId?: string
): Promise<NewTriageRecord[]> {
  const whereConditions = [eq(strategyMetricsSnapshots.snapshotDate, snapshotDate)];

  if (accountId) {
    whereConditions.push(eq(strategyMetricsSnapshots.accountId, accountId));
  }

  if (strategyId) {
    whereConditions.push(eq(strategyMetricsSnapshots.strategyId, strategyId));
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
          status: strategies.status,
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

    // Skip merged strategies - they're no longer active and shouldn't generate triage records
    if (strategyRow?.status === 'merged') continue;

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
        absNotional: metric.totalAbsNotional,
        unrealizedPnl: metric.totalUnrealizedPnl,
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
          absNotional: metric.totalAbsNotional,
          unrealizedPnl: metric.totalUnrealizedPnl,
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
          absNotional: metric.totalAbsNotional,
          unrealizedPnl: metric.totalUnrealizedPnl,
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
        absNotional: metric.totalAbsNotional,
        unrealizedPnl: metric.totalUnrealizedPnl,
        severity: overrideSeverity || computedSeverity,
        recommendedAction,
        notes: `Strategy has ${metric.numOpenPositions} open positions`,
        ruleSet: TRIAGE_RULES_V1.strategyComplexityRuleSet,
        symbol: strategyKey,
      });
    }

    // 5. STATE_CODE_CHANGE - State code change detection
    // Only check if strategy has a strategyType and previous date exists
    if (strategyRow?.strategyType && previousDate) {
      // Fast detection: read stored state codes instead of recomputing
      // State codes are already computed and stored in strategy_metrics_snapshots during metrics computation
      const stateCodeChange = await detectStateCodeChangeFromStored(
        metric.strategyId,
        previousDate,
        snapshotDate
      );

      if (stateCodeChange.changed) {
        const computedSeverity = 'urgent';
        const recommendedAction = 'STATE_CODE_CHANGE';
        
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
          absNotional: metric.totalAbsNotional,
          unrealizedPnl: metric.totalUnrealizedPnl,
          severity: overrideSeverity || computedSeverity,
          recommendedAction,
          notes: `State code changed from ${stateCodeChange.previous ?? 'null'} to ${stateCodeChange.current ?? 'null'}`,
          ruleSet: 'strategy_workflow',
          symbol: strategyKey,
        });
      }
    }
  }

  return records;
}

/**
 * Upserts triage records into the database
 * Batches operations for better performance
 */
export async function upsertTriageRecords(records: NewTriageRecord[]): Promise<void> {
  if (records.length === 0) return;

  // Separate strategy and position records for batch processing
  const strategyRecords: NewTriageRecord[] = [];
  const positionRecords: NewTriageRecord[] = [];

  for (const record of records) {
    if (record.contextLevel === 'strategy') {
      const { strategyId, ruleSet } = record;
      if (!strategyId || !ruleSet) {
        throw new Error('Strategy triage record missing strategyId or ruleSet');
      }
      strategyRecords.push(record);
    } else {
      const { positionId, strategyId, ruleSet } = record;
      if (!positionId || !strategyId || !ruleSet) {
        throw new Error('Position triage record missing ids or ruleSet');
      }
      positionRecords.push(record);
    }
  }

  // Batch delete strategy records
  if (strategyRecords.length > 0) {
    const strategyDeleteConditions = strategyRecords.map((record) =>
      and(
        eq(triageRecords.contextLevel, 'strategy'),
        eq(triageRecords.strategyId, record.strategyId!),
        eq(triageRecords.snapshotDate, record.snapshotDate),
        eq(triageRecords.ruleSet, record.ruleSet!)
      )
    );

    if (strategyDeleteConditions.length > 0) {
      await db
        .delete(triageRecords)
        .where(or(...strategyDeleteConditions));
    }

    // Batch insert strategy records
    await db.insert(triageRecords).values(strategyRecords);
  }

  // Batch delete position records
  if (positionRecords.length > 0) {
    const positionDeleteConditions = positionRecords.map((record) =>
          and(
            eq(triageRecords.contextLevel, 'position'),
        eq(triageRecords.positionId, record.positionId!),
        eq(triageRecords.strategyId, record.strategyId!),
        eq(triageRecords.snapshotDate, record.snapshotDate),
        eq(triageRecords.ruleSet, record.ruleSet!)
          )
        );

    if (positionDeleteConditions.length > 0) {
      await db
        .delete(triageRecords)
        .where(or(...positionDeleteConditions));
    }

    // Batch insert position records
    await db.insert(triageRecords).values(positionRecords);
  }
}

/**
 * Reconciles pending TRADE actions with detected quantity changes
 * When a quantity change is detected, check if there's a pending TRADE action
 * for the same position/strategy and mark it as complete
 * 
 * @returns true if a pending TRADE action was found and reconciled, false otherwise
 */
async function reconcilePendingTradeActions(
  positionId: string | null,
  strategyId: string | null,
  snapshotDate: string
): Promise<boolean> {
  // Find pending TRADE actions for this position/strategy
  const whereConditions = [
    eq(blotterActions.actionDetail, 'TRADE'),
    eq(blotterActions.severityOverride, 'pending'),
  ];

  if (positionId) {
    whereConditions.push(eq(blotterActions.positionId, positionId));
  } else if (strategyId) {
    whereConditions.push(eq(blotterActions.strategyId, strategyId));
  } else {
    return false; // Need at least one identifier
  }

  const pendingActions = await db
    .select()
    .from(blotterActions)
    .where(and(...whereConditions))
    .orderBy(desc(blotterActions.createdAt))
    .limit(10); // Get recent pending actions

  // If no pending actions found, return false
  if (pendingActions.length === 0) {
    return false;
  }

  // Update each pending action to 'complete'
  for (const action of pendingActions) {
    // Update blotter action
    await db
      .update(blotterActions)
      .set({
        severityOverride: 'complete',
        completed: true,
      })
      .where(eq(blotterActions.id, action.id));

      // Find and update associated triage record if it exists
      // Match by positionId/strategyId and severity = 'pending'
      const triageWhereConditions = [
        eq(triageRecords.severity, 'pending'),
      ];

      if (positionId) {
        triageWhereConditions.push(eq(triageRecords.positionId, positionId));
      } else if (strategyId) {
        triageWhereConditions.push(eq(triageRecords.strategyId, strategyId));
      }

      // Optionally match by recommendedAction if available
      if (action.triageFlagAtAction) {
        triageWhereConditions.push(eq(triageRecords.recommendedAction, action.triageFlagAtAction));
      }

      // Get the most recent pending triage record
      const pendingTriage = await db
        .select()
        .from(triageRecords)
        .where(and(...triageWhereConditions))
        .orderBy(desc(triageRecords.createdAt))
        .limit(1);

      if (pendingTriage.length > 0) {
        await db
          .update(triageRecords)
          .set({
            severity: 'complete',
            updatedAt: new Date(),
          })
          .where(eq(triageRecords.id, pendingTriage[0].id));
      }
  }

  // Return true to indicate reconciliation occurred
  return true;
}

/**
 * Detects quantity changes by comparing positions across snapshot dates
 * Returns triage records for positions/strategies with quantity changes
 * Also reconciles any pending TRADE actions when quantity changes are detected
 * @param strategyId - Optional: filter to a specific strategy (for targeted recompute)
 */
export async function computeQuantityChangeTriageForDate(
  snapshotDate: string,
  accountId?: string,
  strategyId?: string
): Promise<NewTriageRecord[]> {
  // Build conditions for previous date query
  const previousDateConditions = [sql`${positions.snapshotDate} < ${snapshotDate}`];
  if (accountId) {
    previousDateConditions.push(eq(positions.accountId, accountId));
  }
  if (strategyId) {
    previousDateConditions.push(eq(positions.strategyId, strategyId));
  }

  // Get previous snapshot date
  const previousDateResult = await db
    .selectDistinct({ snapshotDate: positions.snapshotDate })
    .from(positions)
    .where(and(...previousDateConditions))
    .orderBy(sql`${positions.snapshotDate} DESC`)
    .limit(1);

  const previousDate = previousDateResult[0]?.snapshotDate ?? null;

  // If no previous snapshot, check if there are trades for this date
  // If so, we can still create QUANTITY_CHANGE records (treating as new positions)
  const isFirstDay = !previousDate;

  // Get current positions
  const currentWhereConditions = [eq(positions.snapshotDate, snapshotDate)];
  if (accountId) {
    currentWhereConditions.push(eq(positions.accountId, accountId));
  }
  if (strategyId) {
    currentWhereConditions.push(eq(positions.strategyId, strategyId));
  }

  const currentPositions = await db
    .select()
    .from(positions)
    .where(and(...currentWhereConditions));

  // Get previous positions (by conid for matching)
  // If first day, previousPositions will be empty (no previous snapshot)
  const previousPositions = previousDate
    ? await db
        .select()
        .from(positions)
        .where(
          and(
            eq(positions.snapshotDate, previousDate),
            ...(accountId ? [eq(positions.accountId, accountId)] : []),
            ...(strategyId ? [eq(positions.strategyId, strategyId)] : [])
          )
        )
    : [];

  // Create maps for efficient lookup
  const previousByConid = new Map<number, typeof previousPositions[0]>();
  previousPositions.forEach((pos) => {
    if (pos.conid) {
      previousByConid.set(pos.conid, pos);
    }
  });

  const records: NewTriageRecord[] = [];
  
  // First pass: Collect all positions with quantity changes, grouped by strategy
  // This allows us to aggregate at the strategy level per day
  const changesByStrategy = new Map<string, {
    accountId: string;
    positions: Array<{
      positionId: string | null;
      symbol: string;
      previousQty: number;
      currentQty: number;
      tradeStage: string | null;
    }>;
  }>();
  
  const unlinkedChanges: Array<{
    accountId: string;
    positionId: string;
    symbol: string;
    previousQty: number;
    currentQty: number;
    tradeStage: string | null;
  }> = [];

  for (const currentPos of currentPositions) {
    if (!currentPos.conid || !currentPos.accountId) continue;

    const previousPos = previousByConid.get(currentPos.conid);
    const currentQty = Number(currentPos.quantity) || 0;
    const previousQty = previousPos ? Number(previousPos.quantity) || 0 : 0;

    // Detect quantity change
    // On first day (no previous snapshot), treat all positions with quantity > 0 as new positions
    const qtyChanged = isFirstDay ? currentQty !== 0 : currentQty !== previousQty;
    
    if (!qtyChanged && !isFirstDay && previousPos) {
      continue; // No change, skip (only if not first day)
    }

    // Skip new positions with quantity 0 (not a real position)
    // On first day, we still want to process positions with quantity > 0
    if (!isFirstDay && !previousPos && currentQty === 0) {
      continue;
    }
    
    // On first day, skip if quantity is 0 (no real position)
    if (isFirstDay && currentQty === 0) {
      continue;
    }

    // Auto-detect trade stage
    let tradeStage: string | null = null;
    if (!previousPos) {
      tradeStage = 'open';
    } else if (currentQty === 0) {
      tradeStage = 'close';
    } else if (currentQty > previousQty) {
      tradeStage = 'add';
    } else if (currentQty < previousQty) {
      tradeStage = 'reduce';
    }

    // Group by strategy (prefer strategy-level aggregation)
    if (currentPos.strategyId) {
      if (!changesByStrategy.has(currentPos.strategyId)) {
        changesByStrategy.set(currentPos.strategyId, {
          accountId: currentPos.accountId,
          positions: [],
        });
      }
      changesByStrategy.get(currentPos.strategyId)!.positions.push({
        positionId: currentPos.id,
        symbol: currentPos.symbol,
        previousQty,
        currentQty,
        tradeStage,
      });
    } else if (currentPos.id) {
      // Position not linked to strategy - keep for position-level record
      unlinkedChanges.push({
        accountId: currentPos.accountId,
        positionId: currentPos.id,
        symbol: currentPos.symbol,
        previousQty,
        currentQty,
        tradeStage,
      });
    }
  }

  // Second pass: Create strategy-level records (one per strategy per day)
  for (const [strategyId, changeData] of changesByStrategy.entries()) {
    // Reconcile any pending TRADE actions for this strategy
    const wasReconciled = await reconcilePendingTradeActions(null, strategyId, snapshotDate);

    // Only create QUANTITY_CHANGE triage record if no pending TRADE action was reconciled
    if (!wasReconciled) {
      const recommendedAction = 'QUANTITY_CHANGE';
      const computedSeverity = 'urgent';

      // Check for active override
      const overrideSeverity = await checkSeverityOverride(
        null,
        strategyId,
        recommendedAction,
        snapshotDate
      );

      // Get strategy key and metrics for symbol and financial data
      const strategyResult = await db
        .select({ 
          strategyKey: strategies.strategyKey,
          totalAbsNotional: strategyMetricsSnapshots.totalAbsNotional,
          totalUnrealizedPnl: strategyMetricsSnapshots.totalUnrealizedPnl,
        })
        .from(strategies)
        .leftJoin(
          strategyMetricsSnapshots,
          and(
            eq(strategyMetricsSnapshots.strategyId, strategies.id),
            eq(strategyMetricsSnapshots.snapshotDate, snapshotDate)
          )
        )
        .where(eq(strategies.id, strategyId))
        .limit(1);

      const strategyKey = strategyResult[0]?.strategyKey || `STRATEGY-${strategyId}`;

      // Aggregate notes: summarize all changes in the strategy
      const changeCount = changeData.positions.length;
      const changeSummary = changeData.positions
        .map((p) => `${p.symbol}: ${p.previousQty} → ${p.currentQty} (${p.tradeStage || 'unknown'})`)
        .join('; ');

      records.push({
        snapshotDate,
        accountId: changeData.accountId,
        contextLevel: 'strategy',
        strategyId,
        absNotional: strategyResult[0]?.totalAbsNotional ?? null,
        unrealizedPnl: strategyResult[0]?.totalUnrealizedPnl ?? null,
        symbol: strategyKey,
        severity: overrideSeverity || computedSeverity,
        recommendedAction,
        notes: `${changeCount} position(s) changed: ${changeSummary}`,
        ruleSet: 'quantity_change',
      });
    }
  }

  // Third pass: Create position-level records only for unlinked positions
  for (const change of unlinkedChanges) {
    // Reconcile any pending TRADE actions for this position
    const wasReconciled = await reconcilePendingTradeActions(change.positionId, null, snapshotDate);

    if (!wasReconciled) {
      const recommendedAction = 'QUANTITY_CHANGE';
      const computedSeverity = 'urgent';

      // Check for active override
      const overrideSeverity = await checkSeverityOverride(
        change.positionId,
        null,
        recommendedAction,
        snapshotDate
      );

      // Find the position to get full details
      const position = currentPositions.find((p) => p.id === change.positionId);
      if (position) {
        records.push({
          snapshotDate,
          accountId: change.accountId,
          contextLevel: 'position',
          positionId: change.positionId,
          strategyId: position.strategyId,
          underlyingId: position.underlyingId,
          symbol: change.symbol,
          assetClass: position.assetClass,
          severity: overrideSeverity || computedSeverity,
          recommendedAction,
          notes: `Quantity changed from ${change.previousQty} to ${change.currentQty}. Trade stage: ${change.tradeStage || 'unknown'}`,
          ruleSet: 'quantity_change',
        });
      }
    }
  }

  return records;
}


/**
 * Deletes all triage records for a snapshot date (or date range)
 * Useful for clean recomputation when logic changes
 * @param accountId - Optional: filter to specific account
 * @param strategyId - Optional: filter to specific strategy
 */
export async function deleteTriageRecordsForDate(
  snapshotDate: string,
  accountId?: string,
  strategyId?: string
): Promise<void> {
  const conditions = [eq(triageRecords.snapshotDate, snapshotDate)];

  if (accountId) {
    conditions.push(eq(triageRecords.accountId, accountId));
  }

  if (strategyId) {
    conditions.push(eq(triageRecords.strategyId, strategyId));
  }

  await db.delete(triageRecords).where(and(...conditions));
}

/**
 * Deletes all triage records for a date range
 * Useful for clean recomputation when logic changes
 */
export async function deleteTriageRecordsForDateRange(
  startDate: string,
  endDate: string,
  accountId?: string
): Promise<void> {
  const conditions = [
    gte(triageRecords.snapshotDate, startDate),
    lte(triageRecords.snapshotDate, endDate),
  ];

  if (accountId) {
    conditions.push(eq(triageRecords.accountId, accountId));
  }

  await db.delete(triageRecords).where(and(...conditions));
}

/**
 * Computes all triage records for a snapshot date
 * @param strategyId - Optional: filter to a specific strategy (for targeted recompute)
 *                     When provided, only recomputes triage for that strategy, significantly faster
 * @param cleanFirst - If true, deletes all existing triage records for this date before recomputing
 *                     Useful when logic changes to ensure stale records are removed
 */
export async function computeTriageForDate(
  snapshotDate: string,
  accountId?: string,
  strategyId?: string,
  cleanFirst: boolean = false
): Promise<{ position: number; strategy: number; quantityChange: number }> {
  // Clean existing records first if requested (ensures stale records are removed)
  if (cleanFirst) {
    await deleteTriageRecordsForDate(snapshotDate, accountId, strategyId);
  }

  const positionRecords = await computePositionTriageForDate(snapshotDate, accountId, strategyId);
  const strategyRecords = await computeStrategyTriageForDate(snapshotDate, accountId, strategyId);
  const quantityChangeRecords = await computeQuantityChangeTriageForDate(snapshotDate, accountId, strategyId);

  await upsertTriageRecords([...positionRecords, ...strategyRecords, ...quantityChangeRecords]);

  return {
    position: positionRecords.length,
    strategy: strategyRecords.length,
    quantityChange: quantityChangeRecords.length,
  };
}

