/**
 * Signal Evaluation Module
 *
 * Evaluates position-metric signals (DTE, sigma, PnL%) during data ingestion.
 * This replaces the deprecated state code system with user-configurable signals.
 *
 * Price-based signals are handled separately by TradingView webhooks.
 * See: /supabase/functions/tv-webhook/index.ts
 */

import { db } from '@/db';
import {
  signals,
  strategies,
  strategyMetricsSnapshots,
  triageRecords,
  journalEntries,
  Signal,
} from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

// Condition types that can be evaluated from position data
// Price conditions (price_above, price_below) are handled by TradingView webhooks
type PositionConditionType =
  | 'dte_lte'
  | 'dte_gte'
  | 'sigma_to_strike_lte'
  | 'sigma_to_strike_gte'
  | 'pnl_pct_gte'
  | 'pnl_pct_lte'
  | 'iv_rank_gte'
  | 'iv_rank_lte';

const POSITION_CONDITION_TYPES: Set<string> = new Set([
  'dte_lte',
  'dte_gte',
  'sigma_to_strike_lte',
  'sigma_to_strike_gte',
  'pnl_pct_gte',
  'pnl_pct_lte',
  'iv_rank_gte',
  'iv_rank_lte',
]);

interface SignalCondition {
  type: string;
  value: number;
  ticker?: string;
}

interface SignalConfig {
  logic: 'all' | 'any';
  conditions: SignalCondition[];
  recommendedAction: string;
  actionNotes?: string;
  tvAlertName?: string;
}

interface PositionMetrics {
  maxDte: number | null;
  minDte: number | null;
  worstSigmaToStrike: number | null;
  pnlPct: number | null;
  ivRank: number | null;
}

interface EvaluationResult {
  signalId: string;
  triggered: boolean;
  conditionsMet: string[];
  metrics: PositionMetrics;
}

/**
 * Evaluates a single condition against position metrics.
 * Returns true if the condition is met.
 */
function evaluateCondition(
  condition: SignalCondition,
  metrics: PositionMetrics
): { met: boolean; description: string } {
  const { type, value } = condition;

  switch (type) {
    case 'dte_lte':
      // DTE less than or equal - use minDte (most urgent option)
      if (metrics.minDte === null) {
        return { met: false, description: `DTE ≤ ${value} (no DTE data)` };
      }
      return {
        met: metrics.minDte <= value,
        description: `DTE ≤ ${value} (actual: ${metrics.minDte})`,
      };

    case 'dte_gte':
      // DTE greater than or equal - use maxDte
      if (metrics.maxDte === null) {
        return { met: false, description: `DTE ≥ ${value} (no DTE data)` };
      }
      return {
        met: metrics.maxDte >= value,
        description: `DTE ≥ ${value} (actual: ${metrics.maxDte})`,
      };

    case 'sigma_to_strike_lte':
      if (metrics.worstSigmaToStrike === null) {
        return { met: false, description: `Sigma ≤ ${value}σ (no sigma data)` };
      }
      return {
        met: metrics.worstSigmaToStrike <= value,
        description: `Sigma ≤ ${value}σ (actual: ${metrics.worstSigmaToStrike.toFixed(2)}σ)`,
      };

    case 'sigma_to_strike_gte':
      if (metrics.worstSigmaToStrike === null) {
        return { met: false, description: `Sigma ≥ ${value}σ (no sigma data)` };
      }
      return {
        met: metrics.worstSigmaToStrike >= value,
        description: `Sigma ≥ ${value}σ (actual: ${metrics.worstSigmaToStrike.toFixed(2)}σ)`,
      };

    case 'pnl_pct_gte':
      if (metrics.pnlPct === null) {
        return { met: false, description: `PnL% ≥ ${value}% (no PnL data)` };
      }
      return {
        met: metrics.pnlPct >= value,
        description: `PnL% ≥ ${value}% (actual: ${metrics.pnlPct.toFixed(1)}%)`,
      };

    case 'pnl_pct_lte':
      if (metrics.pnlPct === null) {
        return { met: false, description: `PnL% ≤ ${value}% (no PnL data)` };
      }
      return {
        met: metrics.pnlPct <= value,
        description: `PnL% ≤ ${value}% (actual: ${metrics.pnlPct.toFixed(1)}%)`,
      };

    case 'iv_rank_gte':
      if (metrics.ivRank === null) {
        return { met: false, description: `IV Rank ≥ ${value}% (no IV data)` };
      }
      return {
        met: metrics.ivRank >= value,
        description: `IV Rank ≥ ${value}% (actual: ${metrics.ivRank.toFixed(1)}%)`,
      };

    case 'iv_rank_lte':
      if (metrics.ivRank === null) {
        return { met: false, description: `IV Rank ≤ ${value}% (no IV data)` };
      }
      return {
        met: metrics.ivRank <= value,
        description: `IV Rank ≤ ${value}% (actual: ${metrics.ivRank.toFixed(1)}%)`,
      };

    default:
      // Skip price conditions and unknown types
      return { met: false, description: `Unknown condition: ${type}` };
  }
}

/**
 * Gets position metrics for a strategy from the strategy_metrics_snapshots table.
 * Also computes PnL% if entry_notional is available on the strategy.
 */
async function getPositionMetrics(
  strategyId: string,
  snapshotDate: string
): Promise<PositionMetrics> {
  // Get strategy metrics
  const metricsResult = await db
    .select()
    .from(strategyMetricsSnapshots)
    .where(
      and(
        eq(strategyMetricsSnapshots.strategyId, strategyId),
        eq(strategyMetricsSnapshots.snapshotDate, snapshotDate)
      )
    )
    .limit(1);

  const metrics = metricsResult[0];

  // Get strategy for entry_notional
  const strategyResult = await db
    .select({
      entryNotional: strategies.entryNotional,
    })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  const strategy = strategyResult[0];

  // Compute PnL%
  let pnlPct: number | null = null;
  if (
    metrics?.totalUnrealizedPnl &&
    strategy?.entryNotional &&
    parseFloat(strategy.entryNotional) !== 0
  ) {
    pnlPct =
      (parseFloat(metrics.totalUnrealizedPnl) / parseFloat(strategy.entryNotional)) * 100;
  }

  // NOTE: IV rank evaluation is not implemented yet
  // IV rank is a calculated metric (from ivMetrics.ts), not stored in DB
  // To enable IV rank signals, we would need to either:
  // 1. Store calculated IV rank in underlyings_iv_history, or
  // 2. Call computeIvMetrics() here (expensive)
  // For now, IV rank conditions will return "no data available"
  const ivRank: number | null = null;

  // TODO: Get worstSigmaToStrike from triage computation
  // For now, this needs to be passed in or computed separately
  // The triage computation already calculates this for position-level triggers
  const worstSigmaToStrike: number | null = null;

  return {
    maxDte: metrics?.maxDte ?? null,
    minDte: metrics?.minDte ?? null,
    worstSigmaToStrike,
    pnlPct,
    ivRank,
  };
}

/**
 * Evaluates all position-metric conditions for a signal.
 * Skips price conditions (handled by TradingView webhook).
 */
function evaluateSignalConditions(
  config: SignalConfig,
  metrics: PositionMetrics
): { triggered: boolean; conditionsMet: string[]; conditionsNotMet: string[] } {
  const positionConditions = config.conditions.filter((c) =>
    POSITION_CONDITION_TYPES.has(c.type)
  );

  // If no position conditions, signal cannot be triggered by ingestion
  if (positionConditions.length === 0) {
    return { triggered: false, conditionsMet: [], conditionsNotMet: [] };
  }

  const results = positionConditions.map((condition) => ({
    condition,
    result: evaluateCondition(condition, metrics),
  }));

  const conditionsMet = results
    .filter((r) => r.result.met)
    .map((r) => r.result.description);

  const conditionsNotMet = results
    .filter((r) => !r.result.met)
    .map((r) => r.result.description);

  // Evaluate based on logic
  let triggered: boolean;
  if (config.logic === 'all') {
    // ALL conditions must be met
    triggered = results.every((r) => r.result.met);
  } else {
    // ANY condition being met is sufficient
    triggered = results.some((r) => r.result.met);
  }

  return { triggered, conditionsMet, conditionsNotMet };
}

/**
 * Triggers a signal: updates status, creates triage record, logs to journal.
 */
async function triggerSignal(
  signal: Signal,
  strategy: { id: string; strategyKey: string; autoDerivedLabel: string | null },
  snapshotDate: string,
  conditionsMet: string[],
  metrics: PositionMetrics,
  accountId: string
): Promise<void> {
  const config = signal.explicitDetails as SignalConfig | null;
  const recommendedAction = config?.recommendedAction || 'REVIEW_SIGNAL';

  // 1. Update signal status to 'triggered'
  await db
    .update(signals)
    .set({
      status: 'triggered',
      updatedAt: new Date(),
    })
    .where(eq(signals.id, signal.id));

  // 2. Create triage record
  // Use strategyKey as symbol (typically contains underlying, e.g., "SPY 2025-01-17 P600")
  const triageRecord = {
    snapshotDate,
    accountId,
    symbol: strategy.strategyKey,
    strategyId: strategy.id,
    contextLevel: 'strategy' as const,
    severity:
      signal.importance === 'critical'
        ? 'urgent'
        : signal.importance === 'significant'
          ? 'attention'
          : ('info' as const),
    recommendedAction,
    notes: [
      `Signal triggered: ${signal.statement}`,
      `Conditions met: ${conditionsMet.join(', ')}`,
      config?.actionNotes ? `Notes: ${config.actionNotes}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  };

  const newTriage = await db
    .insert(triageRecords)
    .values(triageRecord)
    .returning({ id: triageRecords.id });

  // 3. Log to journal
  const journalEntry = {
    objectType: 'strategy' as const,
    objectId: strategy.id,
    objectTitle: strategy.autoDerivedLabel || strategy.strategyKey,
    actionType: 'signal_triggered' as const,
    actionDescription: `Position metrics triggered signal: ${signal.statement}`,
    previousState: { status: 'not_triggered' },
    newState: {
      status: 'triggered',
      triggeredAt: new Date().toISOString(),
      triageRecordId: newTriage[0]?.id,
      metrics: {
        minDte: metrics.minDte,
        maxDte: metrics.maxDte,
        pnlPct: metrics.pnlPct,
        ivRank: metrics.ivRank,
      },
    },
    source: 'automation' as const,
    metadata: {
      signalId: signal.id,
      snapshotDate,
      conditionsMet,
      triggerSource: 'ingestion',
    },
  };

  await db.insert(journalEntries).values(journalEntry);

  console.log(
    `[Signal Triggered] ${signal.statement} for strategy ${strategy.strategyKey} on ${snapshotDate}`
  );
}

/**
 * Main function: Evaluates all strategy signals for a given account and snapshot date.
 * Called after triage computation during ingestion.
 */
export async function evaluateStrategySignalsForDate(
  accountId: string,
  snapshotDate: string
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  // Get all strategies for this account that have signals
  // Note: underlyingTicker is not stored on strategies table
  // The strategyKey typically contains underlying info (e.g., "SPY 2025-01-17 P600")
  const strategiesWithSignals = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      autoDerivedLabel: strategies.autoDerivedLabel,
    })
    .from(strategies)
    .where(eq(strategies.accountId, accountId));

  if (strategiesWithSignals.length === 0) {
    return results;
  }

  const strategyIds = strategiesWithSignals.map((s) => s.id);

  // Get all non-triggered signals for these strategies
  const activeSignals = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.entityType, 'strategy'),
        inArray(signals.strategyId, strategyIds),
        inArray(signals.status, ['not_triggered', 'monitoring'])
      )
    );

  if (activeSignals.length === 0) {
    return results;
  }

  // Group signals by strategy
  const signalsByStrategy = new Map<string, Signal[]>();
  for (const signal of activeSignals) {
    if (!signal.strategyId) continue;
    const existing = signalsByStrategy.get(signal.strategyId) || [];
    existing.push(signal);
    signalsByStrategy.set(signal.strategyId, existing);
  }

  // Evaluate signals for each strategy
  for (const strategy of strategiesWithSignals) {
    const strategySignals = signalsByStrategy.get(strategy.id);
    if (!strategySignals || strategySignals.length === 0) continue;

    // Get position metrics once per strategy
    const metrics = await getPositionMetrics(strategy.id, snapshotDate);

    for (const signal of strategySignals) {
      const config = signal.explicitDetails as SignalConfig | null;
      if (!config?.conditions || config.conditions.length === 0) {
        continue;
      }

      // Evaluate conditions
      const { triggered, conditionsMet, conditionsNotMet } = evaluateSignalConditions(
        config,
        metrics
      );

      results.push({
        signalId: signal.id,
        triggered,
        conditionsMet,
        metrics,
      });

      // Trigger signal if conditions are met
      if (triggered) {
        try {
          await triggerSignal(
            signal,
            strategy,
            snapshotDate,
            conditionsMet,
            metrics,
            accountId
          );
        } catch (error) {
          console.error(`Failed to trigger signal ${signal.id}:`, error);
        }
      }
    }
  }

  return results;
}
