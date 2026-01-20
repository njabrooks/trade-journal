import { db } from '@/db';
import {
  positions,
  strategyMetricsSnapshots,
  strategies,
  strategyTemplates,
  underlyingsIvHistory,
  triageRecords,
  trades,
  journalEntries,
  NewTriageRecord,
} from '@/db/schema';
import { and, eq, sql, isNotNull, lte, gte, inArray, or, isNull, desc, ne } from 'drizzle-orm';
import { logToJournal, logTriageToJournalWithDedup } from '@/lib/workflow';

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
 * Severity override cache entry
 * Now stored directly on triage_records instead of blotter_actions
 */
interface SeverityOverride {
  positionId: string | null;
  strategyId: string | null;
  recommendedAction: string;
  severity: string;
  overrideSource: string;
  overrideExpiresDate: string | null;
  overrideAt: Date | null;
}

/**
 * Pre-fetches ALL active severity overrides from existing triage_records.
 * This batches what would otherwise be N individual queries into 1.
 *
 * Overrides are stored directly on triage_records via override_source field.
 * Returns a cache that can be queried synchronously via lookupSeverityOverride().
 */
async function prefetchSeverityOverrides(snapshotDate: string): Promise<SeverityOverride[]> {
  const overrides = await db
    .select({
      positionId: triageRecords.positionId,
      strategyId: triageRecords.strategyId,
      recommendedAction: triageRecords.recommendedAction,
      severity: triageRecords.severity,
      overrideSource: triageRecords.overrideSource,
      overrideExpiresDate: triageRecords.overrideExpiresDate,
      overrideAt: triageRecords.overrideAt,
    })
    .from(triageRecords)
    .where(
      and(
        isNotNull(triageRecords.overrideSource),
        isNotNull(triageRecords.recommendedAction),
        or(
          isNull(triageRecords.overrideExpiresDate),
          gte(triageRecords.overrideExpiresDate, snapshotDate)
        )
      )
    )
    .orderBy(desc(triageRecords.overrideAt));

  return overrides.filter((o): o is SeverityOverride =>
    o.severity !== null && o.recommendedAction !== null && o.overrideSource !== null
  );
}

/**
 * Synchronously looks up a severity override from the pre-fetched cache.
 *
 * Override matches if:
 * - recommendedAction matches (rule-specific)
 * - positionId matches (for position-level) OR strategyId matches (for strategy-level)
 *
 * Returns the full override info (severity + override fields) or null if none found.
 */
function lookupSeverityOverride(
  cache: SeverityOverride[],
  positionId: string | null,
  strategyId: string | null,
  recommendedAction: string
): SeverityOverride | null {
  if (!positionId && !strategyId) return null;

  // Find matching override (cache is already sorted by overrideAt desc)
  const match = cache.find((o) => {
    // Must match the recommended action
    if (o.recommendedAction !== recommendedAction) return false;

    // Match either positionId or strategyId
    if (positionId && o.positionId === positionId) return true;
    if (strategyId && o.strategyId === strategyId) return true;

    return false;
  });

  return match ?? null;
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

  // Batch fetch strategy directions for positions with strategyId
  const strategyIds = Array.from(
    new Set(
      optionPositions
        .map((p) => p.strategyId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const strategyDirectionMap = new Map<string, string | null>();
  if (strategyIds.length > 0) {
    const strategyRows = await db
      .select({
        id: strategies.id,
        direction: strategies.direction,
      })
      .from(strategies)
      .where(inArray(strategies.id, strategyIds));

    for (const row of strategyRows) {
      strategyDirectionMap.set(row.id, row.direction);
    }
  }

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
    // Use priority-based data fetching: IBKR > Massive > Option Strategist > Yahoo > Manual
    const { getIvDataBatchWithPriority } = await import('@/lib/services/ibkr/data-priority');
    const priorityData = await getIvDataBatchWithPriority(underlyingIds, snapshotDate);

    for (const [underlyingId, data] of priorityData.entries()) {
      ivDataMap.set(underlyingId, data.iv30);
      underlyingSpotMap.set(underlyingId, data.spot);
    }
  }

  // Pre-fetch all severity overrides for this date (batched to avoid N+1 queries)
  const severityOverrideCache = await prefetchSeverityOverrides(snapshotDate);

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

    // Check for active severity override from previous actions (sync lookup from batched cache)
    let override: SeverityOverride | null = null;
    if (recommendedAction) {
      override = lookupSeverityOverride(
        severityOverrideCache,
        position.id,
        position.strategyId,
        recommendedAction
      );
    }

    // Apply override if found, otherwise use computed severity
    const finalSeverity = override?.severity || severity;

    // Get direction from parent strategy (null if no strategy linked)
    const strategyDirection = position.strategyId
      ? strategyDirectionMap.get(position.strategyId) ?? null
      : null;

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
      direction: strategyDirection,
      recommendedAction,
      ruleSet: TRIAGE_RULES_V1.ruleSet,
      // Preserve override fields if they exist
      overrideSource: override?.overrideSource ?? null,
      overrideExpiresDate: override?.overrideExpiresDate ?? null,
      overrideAt: override?.overrideAt ?? null,
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
          assetThesisId: strategies.assetThesisId,
          status: strategies.status,
          direction: strategies.direction,
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

  // Pre-fetch all severity overrides for this date (batched to avoid N+1 queries)
  const severityOverrideCache = await prefetchSeverityOverrides(snapshotDate);

  for (const metric of strategyMetrics) {
    if (!metric.strategyId) continue;

    const strategyRow = strategyRows.find((s) => s.id === metric.strategyId);
    const strategyKey = strategyKeyMap.get(metric.strategyId) ?? `STRATEGY-${metric.strategyId}`;

    // Skip rejected strategies - they're abandoned and shouldn't generate triage records
    if (strategyRow?.status === 'rejected') continue;

    // 1. CONFIRM_STRATEGY - Unconfirmed auto-derived strategies need confirmation
    // This covers: label, strategyType, direction, and optionally thesis linkage
    if (strategyRow?.isAuto && !strategyRow.confirmedAt) {
      const computedSeverity = 'urgent';
      const recommendedAction = 'CONFIRM_STRATEGY';

      // Check for active override (sync lookup from batched cache)
      const override = lookupSeverityOverride(
        severityOverrideCache,
        null,
        metric.strategyId,
        recommendedAction
      );

      records.push({
        snapshotDate,
        accountId: metric.accountId,
        contextLevel: 'strategy',
        strategyId: metric.strategyId,
        absNotional: metric.totalAbsNotional,
        unrealizedPnl: metric.totalUnrealizedPnl,
        severity: override?.severity || computedSeverity,
        direction: strategyRow?.direction ?? null,
        recommendedAction,
        notes: 'Strategy needs confirmation: set label, type, direction, and optionally link to asset thesis',
        ruleSet: 'strategy_workflow',
        symbol: strategyKey,
        overrideSource: override?.overrideSource ?? null,
        overrideExpiresDate: override?.overrideExpiresDate ?? null,
        overrideAt: override?.overrideAt ?? null,
      });
    }
    // 2. LINK_STRATEGY_TO_THESIS - Confirmed but missing asset thesis link (optional follow-up)
    else if (strategyRow?.confirmedAt && !strategyRow.assetThesisId) {
      const computedSeverity = 'info';
      const recommendedAction = 'LINK_STRATEGY_TO_THESIS';

      // Check for active override (sync lookup from batched cache)
      const override = lookupSeverityOverride(
        severityOverrideCache,
        null,
        metric.strategyId,
        recommendedAction
      );

      records.push({
        snapshotDate,
        accountId: metric.accountId,
        contextLevel: 'strategy',
        strategyId: metric.strategyId,
        absNotional: metric.totalAbsNotional,
        unrealizedPnl: metric.totalUnrealizedPnl,
        severity: override?.severity || computedSeverity,
        direction: strategyRow?.direction ?? null,
        recommendedAction,
        notes: 'Strategy confirmed but not yet linked to an asset thesis',
        ruleSet: 'strategy_workflow',
        symbol: strategyKey,
        overrideSource: override?.overrideSource ?? null,
        overrideExpiresDate: override?.overrideExpiresDate ?? null,
        overrideAt: override?.overrideAt ?? null,
      });
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
        // Check for active override (sync lookup from batched cache)
        const override = lookupSeverityOverride(
          severityOverrideCache,
          null,
          metric.strategyId,
          recommendedAction
        );

        records.push({
          snapshotDate,
          accountId: metric.accountId,
          contextLevel: 'strategy',
          strategyId: metric.strategyId,
          absNotional: metric.totalAbsNotional,
          unrealizedPnl: metric.totalUnrealizedPnl,
          pctNavAbsNotional: metric.pctNavAbsNotional,
          severity: override?.severity || computedSeverity,
          direction: strategyRow?.direction ?? null,
          recommendedAction,
          notes,
          ruleSet: TRIAGE_RULES_V1.strategySizeRuleSet,
          symbol: strategyKey,
          overrideSource: override?.overrideSource ?? null,
          overrideExpiresDate: override?.overrideExpiresDate ?? null,
          overrideAt: override?.overrideAt ?? null,
        });
      }
    }

    // 4. Complexity check
    if (metric.numOpenPositions && metric.numOpenPositions > TRIAGE_RULES_V1.complexityThreshold) {
      const computedSeverity = 'info';
      const recommendedAction = 'REVIEW_COMPLEXITY';

      // Check for active override (sync lookup from batched cache)
      const override = lookupSeverityOverride(
        severityOverrideCache,
        null,
        metric.strategyId,
        recommendedAction
      );

      records.push({
        snapshotDate,
        accountId: metric.accountId,
        contextLevel: 'strategy',
        strategyId: metric.strategyId,
        absNotional: metric.totalAbsNotional,
        unrealizedPnl: metric.totalUnrealizedPnl,
        severity: override?.severity || computedSeverity,
        direction: strategyRow?.direction ?? null,
        recommendedAction,
        notes: `Strategy has ${metric.numOpenPositions} open positions`,
        ruleSet: TRIAGE_RULES_V1.strategyComplexityRuleSet,
        symbol: strategyKey,
        overrideSource: override?.overrideSource ?? null,
        overrideExpiresDate: override?.overrideExpiresDate ?? null,
        overrideAt: override?.overrideAt ?? null,
      });
    }

    // 5. STATE_CODE_CHANGE - DEPRECATED (replaced by strategy signals)
    // State code detection removed - signals now handle tactical workflow triggers
  }

  return records;
}

/**
 * Checks if new severity is more severe than old severity
 * Used to detect escalations for journal logging
 */
function isMoreSevere(newSeverity: string | null, oldSeverity: string | null): boolean {
  const severityOrder = ['info', 'attention', 'urgent'];
  const newIndex = severityOrder.indexOf(newSeverity || '');
  const oldIndex = severityOrder.indexOf(oldSeverity || '');
  return newIndex > oldIndex && newIndex >= 0 && oldIndex >= 0;
}

/**
 * Logs new triage detections to the journal with deduplication.
 *
 * For triage_detected: Updates existing active entries instead of creating duplicates.
 * For triage_escalated: Creates new entry and marks previous as superseded.
 *
 * This prevents journal spam when the same condition persists across multiple days/runs.
 */
async function logNewTriageDetections(
  records: NewTriageRecord[],
  previousRecordsMap: Map<string, { severity: string | null; recommendedAction: string | null }>
): Promise<void> {
  for (const rec of records) {
    // Skip records where user has already taken action (done/in_progress status or monitor severity override)
    if (rec.status === 'done' || rec.status === 'in_progress' || rec.severity === 'monitor') {
      continue;
    }

    // Skip quantity_change_v1 records - they are logged separately in computeQuantityChangeTriageForDate
    // with the quantity_change action type which includes trade IDs
    if (rec.ruleSet === 'quantity_change_v1') {
      continue;
    }

    const entityId = rec.contextLevel === 'strategy' ? rec.strategyId : rec.positionId;
    if (!entityId) continue;

    const key = `${rec.contextLevel}:${entityId}:${rec.recommendedAction}`;
    const previousRec = previousRecordsMap.get(key);

    // Determine if this is an escalation (severity increased)
    const isEscalation = previousRec && isMoreSevere(rec.severity ?? null, previousRec.severity);

    try {
      if (isEscalation) {
        // Escalation: Create new entry (escalations are always logged as new events)
        await logToJournal({
          objectType: rec.contextLevel === 'strategy' ? 'strategy' : 'position',
          objectId: entityId,
          objectTitle: rec.symbol || 'Unknown',
          actionType: 'triage_escalated',
          actionDescription: `Trigger ${rec.recommendedAction} escalated from ${previousRec?.severity} to ${rec.severity}`,
          previousState: { severity: previousRec?.severity, recommendedAction: previousRec?.recommendedAction },
          newState: {
            severity: rec.severity,
            recommendedAction: rec.recommendedAction,
            contextLevel: rec.contextLevel,
          },
          source: 'automation',
          metadata: {
            trigger: rec.recommendedAction,
            snapshotDate: rec.snapshotDate,
            ruleSet: rec.ruleSet,
            ...(rec.dte !== undefined && rec.dte !== null && { dte: rec.dte }),
            ...(rec.sigmaToStrike && { sigmaToStrike: rec.sigmaToStrike }),
            ...(rec.isItm !== null && { isItm: rec.isItm }),
            ...(rec.flagAssignment && { flagAssignment: rec.flagAssignment }),
          },
        });
      } else {
        // Detection: Only log on FIRST detection, not on subsequent runs
        // This prevents journal pollution from ongoing triage monitoring
        // Note: Use objectTitle (symbol) for dedup, not objectId, because position UUIDs
        // can change across ingestion runs while the symbol remains stable
        const existingEntry = await db
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.objectTitle, rec.symbol || 'Unknown'),
              eq(journalEntries.actionType, 'triage_detected'),
              eq(journalEntries.status, 'active'),
              sql`${journalEntries.metadata}->>'trigger' = ${rec.recommendedAction || 'unknown'}`
            )
          )
          .limit(1);

        // Only create journal entry if this is the first detection
        if (existingEntry.length === 0) {
          await logToJournal({
            objectType: rec.contextLevel === 'strategy' ? 'strategy' : 'position',
            objectId: entityId,
            objectTitle: rec.symbol || 'Unknown',
            actionType: 'triage_detected',
            actionDescription: `System detected ${rec.recommendedAction}${rec.notes ? `: ${rec.notes}` : ''}`,
            previousState: previousRec
              ? { severity: previousRec.severity, recommendedAction: previousRec.recommendedAction }
              : {},
            newState: {
              severity: rec.severity,
              recommendedAction: rec.recommendedAction,
              contextLevel: rec.contextLevel,
            },
            source: 'automation',
            metadata: {
              trigger: rec.recommendedAction || 'unknown',
              snapshotDate: rec.snapshotDate,
              ruleSet: rec.ruleSet,
              ...(rec.dte !== undefined && rec.dte !== null && { dte: rec.dte }),
              ...(rec.sigmaToStrike && { sigmaToStrike: rec.sigmaToStrike }),
              ...(rec.isItm !== null && { isItm: rec.isItm }),
              ...(rec.flagAssignment && { flagAssignment: rec.flagAssignment }),
            },
          });
        }
      }
    } catch (error) {
      // Log error but don't fail the entire operation
      console.error(`[Triage] Failed to log journal entry for ${rec.recommendedAction}:`, error);
    }
  }
}

/**
 * Upserts triage records into the database
 * Batches operations for better performance
 * Also logs new detections and escalations to the journal
 */
export async function upsertTriageRecords(records: NewTriageRecord[]): Promise<void> {
  if (records.length === 0) return;

  // Get snapshot date from records (all records should have same date)
  const snapshotDate = records[0].snapshotDate;

  // Get previous snapshot date for comparison (to detect new vs continued triggers)
  const previousDateResult = await db
    .selectDistinct({ snapshotDate: triageRecords.snapshotDate })
    .from(triageRecords)
    .where(sql`${triageRecords.snapshotDate} < ${snapshotDate}`)
    .orderBy(desc(triageRecords.snapshotDate))
    .limit(1);

  const previousDate = previousDateResult[0]?.snapshotDate ?? null;

  // Build map of previous day's records for comparison
  const previousRecordsMap = new Map<string, { severity: string | null; recommendedAction: string | null }>();
  if (previousDate) {
    const previousRecords = await db
      .select({
        contextLevel: triageRecords.contextLevel,
        positionId: triageRecords.positionId,
        strategyId: triageRecords.strategyId,
        severity: triageRecords.severity,
        recommendedAction: triageRecords.recommendedAction,
      })
      .from(triageRecords)
      .where(eq(triageRecords.snapshotDate, previousDate));

    for (const rec of previousRecords) {
      const entityId = rec.contextLevel === 'strategy' ? rec.strategyId : rec.positionId;
      const key = `${rec.contextLevel}:${entityId}:${rec.recommendedAction}`;
      previousRecordsMap.set(key, { severity: rec.severity, recommendedAction: rec.recommendedAction });
    }
  }

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
  // IMPORTANT: Preserve records where user has already taken action (done/in_progress status)
  // This prevents recomputation from resurrecting triage items the user already processed
  if (strategyRecords.length > 0) {
    const strategyDeleteConditions = strategyRecords.map((record) =>
      and(
        eq(triageRecords.contextLevel, 'strategy'),
        eq(triageRecords.strategyId, record.strategyId!),
        eq(triageRecords.snapshotDate, record.snapshotDate),
        eq(triageRecords.ruleSet, record.ruleSet!),
        // Only delete inbox records - preserve done/in_progress
        eq(triageRecords.status, 'inbox')
      )
    );

    if (strategyDeleteConditions.length > 0) {
      await db
        .delete(triageRecords)
        .where(or(...strategyDeleteConditions));
    }

    // Check for existing done/in_progress records to avoid creating duplicates
    const existingProcessedRecords = await db
      .select({
        strategyId: triageRecords.strategyId,
        snapshotDate: triageRecords.snapshotDate,
        ruleSet: triageRecords.ruleSet,
      })
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.contextLevel, 'strategy'),
          inArray(triageRecords.strategyId, strategyRecords.map(r => r.strategyId!)),
          inArray(triageRecords.status, ['done', 'in_progress'])
        )
      );

    const processedKeys = new Set(
      existingProcessedRecords.map(r => `${r.strategyId}:${r.snapshotDate}:${r.ruleSet}`)
    );

    // Filter out records that already have a done/in_progress counterpart
    const strategyRecordsToInsert = strategyRecords.filter(
      r => !processedKeys.has(`${r.strategyId}:${r.snapshotDate}:${r.ruleSet}`)
    );

    // Batch insert strategy records (only those without existing processed records)
    if (strategyRecordsToInsert.length > 0) {
      await db.insert(triageRecords).values(strategyRecordsToInsert);
    }
  }

  // Batch delete position records
  if (positionRecords.length > 0) {
    // Filter out invalid records with null position_id (should never happen, but defensive)
    const validPositionRecords = positionRecords.filter(r => r.positionId != null);

    if (validPositionRecords.length < positionRecords.length) {
      console.warn(`[Triage] Filtered out ${positionRecords.length - validPositionRecords.length} position records with null position_id`);
    }

    const positionDeleteConditions = validPositionRecords.map((record) =>
          and(
            eq(triageRecords.contextLevel, 'position'),
        eq(triageRecords.positionId, record.positionId!),
        eq(triageRecords.strategyId, record.strategyId!),
        eq(triageRecords.snapshotDate, record.snapshotDate),
        eq(triageRecords.ruleSet, record.ruleSet!),
        // Only delete inbox records - preserve done/in_progress
        eq(triageRecords.status, 'inbox')
          )
        );

    if (positionDeleteConditions.length > 0) {
      await db
        .delete(triageRecords)
        .where(or(...positionDeleteConditions));
    }

    // Check for existing done/in_progress records to avoid creating duplicates
    const existingProcessedPositionRecords = await db
      .select({
        positionId: triageRecords.positionId,
        strategyId: triageRecords.strategyId,
        snapshotDate: triageRecords.snapshotDate,
        ruleSet: triageRecords.ruleSet,
      })
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.contextLevel, 'position'),
          inArray(triageRecords.positionId, validPositionRecords.map(r => r.positionId!)),
          inArray(triageRecords.status, ['done', 'in_progress'])
        )
      );

    const processedPositionKeys = new Set(
      existingProcessedPositionRecords.map(r => `${r.positionId}:${r.strategyId}:${r.snapshotDate}:${r.ruleSet}`)
    );

    // Filter out records that already have a done/in_progress counterpart
    const positionRecordsToInsert = validPositionRecords.filter(
      r => !processedPositionKeys.has(`${r.positionId}:${r.strategyId}:${r.snapshotDate}:${r.ruleSet}`)
    );

    // Batch insert position records (only those without existing processed records)
    if (positionRecordsToInsert.length > 0) {
      await db.insert(triageRecords).values(positionRecordsToInsert);
    }
  }

  // Log new detections and escalations to journal (after successful upsert)
  await logNewTriageDetections([...strategyRecords, ...positionRecords], previousRecordsMap);
}

// NOTE (2026-01-16): reconcilePendingTradeActions removed as part of blotter-to-journal migration.
// The journal system now handles trade ingestion → triage action linkage directly.
// See: docs/CLEANUP_PLAN.md - Blotter-to-Journal Migration

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
): Promise<number> {
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

  // Create a set of current conids for efficient lookup
  const currentConids = new Set<number>();
  for (const currentPos of currentPositions) {
    if (currentPos.conid) {
      currentConids.add(currentPos.conid);
    }
  }

  // First pass: Process current positions (existing or changed)
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

  // Second pass: Detect positions that existed on previous date but don't exist on current date
  // These are positions that closed/expired (no position record on current date)
  for (const [conid, previousPos] of previousByConid.entries()) {
    // Skip if this position exists in current positions (already processed above)
    if (currentConids.has(conid)) {
      continue;
    }

    // This position existed before but doesn't exist now - it closed/expired
    const previousQty = Number(previousPos.quantity) || 0;
    
    // Only create QUANTITY_CHANGE if previous quantity was non-zero
    if (previousQty !== 0 && previousPos.accountId && previousPos.strategyId) {
      // Group by strategy
      if (!changesByStrategy.has(previousPos.strategyId)) {
        changesByStrategy.set(previousPos.strategyId, {
          accountId: previousPos.accountId,
          positions: [],
        });
      }
      changesByStrategy.get(previousPos.strategyId)!.positions.push({
        positionId: previousPos.id,
        symbol: previousPos.symbol,
        previousQty,
        currentQty: 0, // Position no longer exists
        tradeStage: 'close', // Position closed/expired
      });
    }
  }

  // Create triage records and log to journal for quantity changes
  const triageRecordsToCreate: NewTriageRecord[] = [];

  // Process strategy-level quantity changes
  for (const [strategyId, data] of changesByStrategy.entries()) {
    // Skip strategies that already have a trade_ingestion_v1 triage record for this date
    // Trade ingestion records are created during trade CSV processing with full trade details
    // QUANTITY_CHANGE is only for position changes without corresponding trades (e.g., corporate actions)
    const existingTradeIngestion = await db
      .select({ id: triageRecords.id })
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.snapshotDate, snapshotDate),
          eq(triageRecords.ruleSet, 'trade_ingestion_v1')
        )
      )
      .limit(1);

    if (existingTradeIngestion.length > 0) {
      // Strategy already has trade ingestion triage - skip QUANTITY_CHANGE to avoid duplicates
      continue;
    }

    // Get strategy info including template label and underlying ticker
    const [strategyInfo] = await db
      .select({
        strategyKey: strategies.strategyKey,
        templateLabel: strategyTemplates.label,
      })
      .from(strategies)
      .innerJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (!strategyInfo) continue;

    // Extract underlying symbol from strategyKey (e.g., "GLXY-STK" -> "GLXY")
    const symbol = strategyInfo.strategyKey.split('-')[0] || 'UNKNOWN';
    const title = strategyInfo.templateLabel || strategyInfo.strategyKey;

    // Query trades for this strategy and snapshot date to get trade IDs
    // This populates unmatchedTradeExecutions so the UI can display trade details
    const tradesForStrategy = await db
      .select({
        id: trades.id,
        symbol: trades.symbol,
        conid: trades.conid,
        side: trades.side,
        quantity: trades.quantity,
      })
      .from(trades)
      .where(
        and(
          eq(trades.strategyId, strategyId),
          eq(sql`date(${trades.tradeDate})`, snapshotDate)
        )
      );

    // Group trades by conid/symbol and build unmatchedTradeExecutions
    const tradesByPosition = new Map<string, { conid: number | null; ticker: string; tradeIds: string[]; qtyChange: number }>();
    for (const trade of tradesForStrategy) {
      const key = trade.conid ? `conid:${trade.conid}` : `symbol:${trade.symbol}`;
      if (!tradesByPosition.has(key)) {
        tradesByPosition.set(key, {
          conid: trade.conid,
          ticker: trade.symbol,
          tradeIds: [],
          qtyChange: 0,
        });
      }
      const entry = tradesByPosition.get(key)!;
      entry.tradeIds.push(trade.id);
      const qty = trade.side === 'BUY' ? Math.abs(Number(trade.quantity)) : -Math.abs(Number(trade.quantity));
      entry.qtyChange += qty;
    }

    const unmatchedTradeExecutions = Array.from(tradesByPosition.values());

    // Aggregate trade stages for the strategy
    const stages = new Set(data.positions.map(p => p.tradeStage).filter(Boolean));
    const stageStr = Array.from(stages).join('/');

    // Summarize quantity changes
    const changeSummary = data.positions.map(p => {
      const delta = p.currentQty - p.previousQty;
      const sign = delta > 0 ? '+' : '';
      return `${p.symbol}: ${sign}${delta}`;
    }).join(', ');

    // Determine severity based on trade stage
    // Both 'open' (new positions) and 'close' (closed positions) need user attention
    // to capture trade metadata (rationale, context, etc.)
    let severity: 'urgent' | 'attention' | 'monitor' | 'info' = 'info';
    if (stages.has('close') || stages.has('open')) {
      severity = 'attention'; // Position activity needs user attention for metadata capture
    }

    // Create strategy-level triage record for quantity change
    // Use QUANTITY_CHANGE constant for recommendedAction (like TRADE_INGESTION) for UI compatibility
    // Store descriptive details in notes
    const triageRecord: NewTriageRecord = {
      snapshotDate,
      accountId: data.accountId,
      strategyId,
      positionId: null,
      contextLevel: 'strategy',
      ruleSet: 'quantity_change_v1',
      symbol,
      severity,
      status: 'inbox',
      recommendedAction: 'QUANTITY_CHANGE',
      notes: JSON.stringify({
        description: `Review ${stageStr} activity: ${changeSummary}`,
        tradeStages: Array.from(stages),
        positions: data.positions.map(p => ({
          symbol: p.symbol,
          previousQty: p.previousQty,
          currentQty: p.currentQty,
          delta: p.currentQty - p.previousQty,
          tradeStage: p.tradeStage,
        })),
      }),
      // Include trade IDs so the UI can display trade details for metadata capture
      unmatchedTradeExecutions: unmatchedTradeExecutions.length > 0 ? unmatchedTradeExecutions : null,
    };

    triageRecordsToCreate.push(triageRecord);

    // Log to journal with dedup (use strategyId + snapshotDate as trigger key for dedup)
    await logTriageToJournalWithDedup({
      objectType: 'strategy',
      objectId: strategyId,
      objectTitle: title,
      actionType: 'quantity_change',
      actionDescription: `${stageStr}: ${changeSummary}`,
      triggerKey: `qty_change:${strategyId}:${snapshotDate}`,
      source: 'automation',
      metadata: {
        snapshotDate,
        tradeStages: Array.from(stages),
        positions: data.positions,
        tradeIds: unmatchedTradeExecutions.flatMap(e => e.tradeIds),
      },
    });
  }

  // Process unlinked position-level changes
  for (const change of unlinkedChanges) {
    const delta = change.currentQty - change.previousQty;
    const sign = delta > 0 ? '+' : '';

    // Both 'open' and 'close' need attention (consistent with strategy-level triggers)
    const severity = (change.tradeStage === 'close' || change.tradeStage === 'open') ? 'attention' : 'info';

    const triageRecord: NewTriageRecord = {
      snapshotDate,
      accountId: change.accountId,
      strategyId: null,
      positionId: change.positionId,
      contextLevel: 'position',
      ruleSet: 'quantity_change_v1',
      symbol: change.symbol,
      severity,
      status: 'inbox',
      recommendedAction: 'QUANTITY_CHANGE',
      notes: JSON.stringify({
        description: `Review ${change.tradeStage}: ${change.symbol} ${sign}${delta}`,
        previousQty: change.previousQty,
        currentQty: change.currentQty,
        delta,
        tradeStage: change.tradeStage,
      }),
    };

    triageRecordsToCreate.push(triageRecord);

    // Log to journal with dedup
    await logTriageToJournalWithDedup({
      objectType: 'position',
      objectId: change.positionId,
      objectTitle: change.symbol,
      actionType: 'quantity_change',
      actionDescription: `${change.tradeStage}: ${sign}${delta}`,
      triggerKey: `qty_change:${change.positionId}:${snapshotDate}`,
      source: 'automation',
      metadata: {
        snapshotDate,
        previousQty: change.previousQty,
        currentQty: change.currentQty,
        delta,
        tradeStage: change.tradeStage,
      },
    });
  }

  // Upsert triage records
  if (triageRecordsToCreate.length > 0) {
    await upsertTriageRecords(triageRecordsToCreate);
  }

  return triageRecordsToCreate.length;
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
  
  // Compute quantity change triage records (compares positions between snapshots)
  const quantityChangeCount = await computeQuantityChangeTriageForDate(snapshotDate, accountId, strategyId);

  await upsertTriageRecords([...positionRecords, ...strategyRecords]);

  return {
    position: positionRecords.length,
    strategy: strategyRecords.length,
    quantityChange: quantityChangeCount,
  };
}

