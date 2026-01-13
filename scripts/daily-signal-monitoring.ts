/**
 * Daily Signal Monitoring Script
 *
 * Checks data-driven signals against current data:
 * - Price/IV thresholds (from underlyings_iv_history)
 * - FRED thresholds (via direct FRED API)
 *
 * This script replaces the thesis-level monitoring approach with signal-level
 * monitoring, reading directly from signals.explicit_details.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-signal-monitoring.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-signal-monitoring.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-signal-monitoring.ts --verbose
 *
 * Flags:
 *   --dry-run      Don't update database or create triage records
 *   --verbose      Show detailed logging
 *
 * Migration from daily-thesis-monitoring.ts:
 * - Reads from signals.explicit_details instead of thesisMonitoringConfigs.explicitThresholds
 * - Signal IS the validation point, so auto-trigger is simplified
 * - One source of truth for threshold configuration
 */

import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
import type { ExplicitDetails } from '../src/components/signals/SignalConfigForm.js';

const {
  validationPoints,
  validationStatusHistory,
  thesisTriageRecords,
  underlyingsIvHistory,
  macroTheses,
  assetTheses,
} = schema;

// ============================================================================
// Types
// ============================================================================

interface SignalWithThesis {
  id: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  statement: string;
  type: 'confirmation' | 'warning';
  status: string;
  importance: string;
  explicitDetails: ExplicitDetails;
}

interface ThresholdCheckResult {
  signal: SignalWithThesis;
  thesisTitle: string;
  currentValue: number;
  breached: boolean;
  message: string;
}

interface MonitoringRunResult {
  signalsChecked: number;
  breachesFound: number;
  triageRecordsCreated: number;
  errors: string[];
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Get latest price/IV data for a ticker
 */
async function getLatestPriceIvForTicker(
  ticker: string
): Promise<{ spot?: number; iv30?: number; iv_rank?: number; iv_percentile?: number; rv20?: number; asOfDate?: string } | null> {
  const result = await db
    .select({
      spot: underlyingsIvHistory.spot,
      iv30: underlyingsIvHistory.iv30,
      ivRank: underlyingsIvHistory.ivRank,
      ivPercentile: underlyingsIvHistory.ivPercentile,
      rv20: underlyingsIvHistory.rv20,
      asOfDate: underlyingsIvHistory.asOfDate,
    })
    .from(underlyingsIvHistory)
    .where(eq(underlyingsIvHistory.ticker, ticker))
    .orderBy(sql`${underlyingsIvHistory.asOfDate} DESC`)
    .limit(1);

  if (result.length === 0) return null;
  return {
    spot: result[0].spot ? Number(result[0].spot) : undefined,
    iv30: result[0].iv30 ? Number(result[0].iv30) : undefined,
    iv_rank: result[0].ivRank ? Number(result[0].ivRank) : undefined,
    iv_percentile: result[0].ivPercentile ? Number(result[0].ivPercentile) : undefined,
    rv20: result[0].rv20 ? Number(result[0].rv20) : undefined,
    asOfDate: result[0].asOfDate,
  };
}

/**
 * Fetch latest value from FRED API
 */
async function getFredSeriesLatestValue(series: string): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('FRED_API_KEY not set, skipping FRED monitoring');
    return null;
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FRED API error for ${series}: ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    if (data.observations && data.observations.length > 0) {
      const value = parseFloat(data.observations[0].value);
      return isNaN(value) ? null : value;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching FRED series ${series}:`, error);
    return null;
  }
}

// ============================================================================
// Threshold Evaluation
// ============================================================================

/**
 * Map ExplicitDetails operator to comparison function
 * New format: 'gt', 'gte', 'lt', 'lte', 'eq', 'crosses_above', 'crosses_below'
 * Legacy format: '>', '>=', '<', '<=', '==' (from old manual configs)
 */
function evaluateThreshold(operator: string, threshold: number, currentValue: number): boolean {
  // Normalize operator - support both new and legacy formats
  const normalizedOp = operator.toLowerCase().trim();

  switch (normalizedOp) {
    // New format
    case 'gt':
    case '>':
      return currentValue > threshold;
    case 'gte':
    case '>=':
      return currentValue >= threshold;
    case 'lt':
    case '<':
      return currentValue < threshold;
    case 'lte':
    case '<=':
      return currentValue <= threshold;
    case 'eq':
    case '==':
    case '=':
      return currentValue === threshold;
    // Note: crosses_above/crosses_below would need historical comparison
    // For now, treat them as simple comparisons
    case 'crosses_above':
      return currentValue > threshold;
    case 'crosses_below':
      return currentValue < threshold;
    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Get the display symbol for an operator
 */
function getOperatorSymbol(operator: string): string {
  const normalizedOp = operator.toLowerCase().trim();
  const symbols: Record<string, string> = {
    gt: '>',
    '>': '>',
    gte: '≥',
    '>=': '≥',
    lt: '<',
    '<': '<',
    lte: '≤',
    '<=': '≤',
    eq: '=',
    '==': '=',
    '=': '=',
    crosses_above: '↗',
    crosses_below: '↘',
  };
  return symbols[normalizedOp] || operator;
}

/**
 * Check a single signal's threshold against current data
 */
async function checkSignalThreshold(
  signal: SignalWithThesis,
  thesisTitle: string
): Promise<ThresholdCheckResult | null> {
  const config = signal.explicitDetails;

  let currentValue: number | null = null;

  // Fetch data based on data source
  if (config.dataSource === 'fred') {
    currentValue = await getFredSeriesLatestValue(config.metric);
  } else if (config.dataSource === 'iv_data' || config.dataSource === 'price_feed') {
    if (!config.ticker) {
      console.warn(`    ⚠ Signal ${signal.id.slice(0, 8)} has IV/price source but no ticker`);
      return null;
    }

    const data = await getLatestPriceIvForTicker(config.ticker);
    if (!data) {
      console.warn(`    ⚠ No data found for ticker ${config.ticker}`);
      return null;
    }

    // Map metric to data field
    const metricMap: Record<string, keyof typeof data> = {
      spot: 'spot',
      iv30: 'iv30',
      iv_rank: 'iv_rank',
      iv_percentile: 'iv_percentile',
      rv20: 'rv20',
    };

    const field = metricMap[config.metric];
    if (field && data[field] !== undefined) {
      currentValue = data[field] as number;
    } else {
      console.warn(`    ⚠ Metric ${config.metric} not found in data for ${config.ticker}`);
      return null;
    }
  }

  if (currentValue === null) {
    return null;
  }

  const breached = evaluateThreshold(config.operator, config.threshold, currentValue);
  const opSymbol = getOperatorSymbol(config.operator);
  const unit = config.thresholdUnit || '';

  const message = breached
    ? `⚠️ TRIGGERED: ${config.metricName || config.metric} ${opSymbol} ${config.threshold}${unit} (current: ${currentValue.toFixed(2)}${unit})`
    : `✓ ${config.metricName || config.metric} = ${currentValue.toFixed(2)}${unit} (threshold: ${opSymbol} ${config.threshold}${unit})`;

  return {
    signal,
    thesisTitle,
    currentValue,
    breached,
    message,
  };
}

// ============================================================================
// Triage & Status Updates
// ============================================================================

/**
 * Auto-trigger signal status and create triage record
 */
async function triggerSignal(
  result: ThresholdCheckResult,
  dryRun: boolean
): Promise<string | null> {
  if (dryRun) {
    console.log(`     [DRY-RUN] Would trigger signal ${result.signal.id.slice(0, 8)}`);
    return null;
  }

  const signal = result.signal;
  const config = signal.explicitDetails;

  try {
    // 1. Check if already triggered
    if (signal.status === 'triggered') {
      if (VERBOSE) console.log(`     ℹ️ Signal already triggered, skipping`);
      return null;
    }

    const previousStatus = signal.status;

    // 2. Create validation_status_history entry
    await db.insert(validationStatusHistory).values({
      validationPointId: signal.id,
      previousStatus,
      newStatus: 'triggered',
      evidence: {
        source: config.dataSource === 'fred' ? 'FRED' : 'IBKR/Massive',
        summary: `Automated threshold breach: ${config.metricName || config.metric} ${getOperatorSymbol(config.operator)} ${config.threshold}. Current value: ${result.currentValue.toFixed(2)}`,
        link:
          config.dataSource === 'fred'
            ? `https://fred.stlouisfed.org/series/${config.metric}`
            : null,
      },
      confidence: 'high',
      assessedBy: 'claude',
      userActionRequired: true,
      userActionTaken: null,
      userActionTimestamp: null,
    });

    // 3. Update signal status
    await db
      .update(validationPoints)
      .set({
        status: 'triggered',
        updatedAt: new Date(),
      })
      .where(eq(validationPoints.id, signal.id));

    // 4. Create triage record
    const [triageRecord] = await db
      .insert(thesisTriageRecords)
      .values({
        thesisId: signal.thesisId,
        thesisType: signal.thesisType,
        thesisTitle: result.thesisTitle,
        triggerType: 'signal_triggered',
        triggerSource: 'daily_signal_check',
        triageRule: 'SIGNAL_TRIGGERED',
        contentSummary: {
          totalItemsScanned: 1,
          relevantItemsFound: 1,
          sources: [config.dataSource === 'fred' ? 'FRED' : 'IBKR/Massive'],
          dateRange: {
            from: new Date().toISOString().split('T')[0],
            to: new Date().toISOString().split('T')[0],
          },
        },
        aiAnalysis: {
          summary: `Signal triggered: ${signal.statement.slice(0, 100)}... Current ${config.metricName || config.metric}: ${result.currentValue.toFixed(2)}`,
          validationPointsAffected: [
            {
              pointId: signal.id,
              pointStatement: signal.statement,
              evidenceType: 'strong_validation',
              confidence: 'high',
              recommendedAction: 'Assess impact on thesis',
            },
          ],
          keyFindings: [
            `${signal.type === 'confirmation' ? 'Confirmation' : 'Warning'} signal triggered`,
            `${config.metricName || config.metric} ${getOperatorSymbol(config.operator)} ${config.threshold} (current: ${result.currentValue.toFixed(2)})`,
          ],
          suggestedNextSteps: [
            'Review the triggered signal against thesis assumptions',
            'Assess whether this changes thesis conviction',
            'Consider adjusting positions if needed',
          ],
        },
        matchedResults: [
          {
            url:
              config.dataSource === 'fred'
                ? `https://fred.stlouisfed.org/series/${config.metric}`
                : '#',
            title: `${config.metricName || config.metric}: ${result.currentValue.toFixed(2)}`,
            snippet: result.message,
            date: new Date().toISOString(),
            queryType: 'threshold_check' as const,
            matchScore: 100,
            matchedKeywords: [config.metric],
          },
        ],
        severity: signal.importance === 'critical' ? 'urgent' : 'attention',
        urgency: signal.importance === 'critical' ? 'immediate' : 'today',
        status: signal.importance === 'critical' ? 'urgent' : 'attention',
        lifecycleStage: 'monitoring',
        suggestedSkill: '/deep-dive',
        actionRequired: `${signal.type === 'confirmation' ? 'Confirmation' : 'Warning'} signal triggered: ${signal.statement.slice(0, 80)}...`,
      })
      .returning({ id: thesisTriageRecords.id });

    // 5. Log to journal
    await logToJournal({
      objectType: signal.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: signal.thesisId,
      objectTitle: result.thesisTitle,
      actionType: 'vi_auto_triggered',
      actionDescription: `Signal auto-triggered: "${signal.statement.slice(0, 50)}..." (${config.metricName || config.metric} ${getOperatorSymbol(config.operator)} ${config.threshold})`,
      triageRecordId: triageRecord.id,
      previousState: {
        status: previousStatus,
        signalId: signal.id,
        signalType: signal.type,
      },
      newState: {
        status: 'triggered',
        confidence: 'high',
        evidenceSource: config.dataSource === 'fred' ? 'FRED' : 'IBKR/Massive',
        currentValue: result.currentValue,
        thresholdValue: config.threshold,
        operator: config.operator,
      },
      source: 'automation',
      metadata: {
        signalId: signal.id,
        signalType: signal.type,
        importance: signal.importance,
        metric: config.metric,
        dataSource: config.dataSource,
      },
    });

    return triageRecord.id;
  } catch (error) {
    console.error(`     ❌ Error triggering signal ${signal.id}:`, error);
    return null;
  }
}

// ============================================================================
// Main Monitoring Run
// ============================================================================

async function runMonitoring(dryRun: boolean): Promise<MonitoringRunResult> {
  const result: MonitoringRunResult = {
    signalsChecked: 0,
    breachesFound: 0,
    triageRecordsCreated: 0,
    errors: [],
  };

  console.log('\n📊 Daily Signal Monitoring');
  console.log('='.repeat(60));
  if (dryRun) {
    console.log('Mode: DRY-RUN (no database updates)');
  }

  // 1. Fetch all data-driven signals with explicit_details configured
  console.log('\n  Fetching data-driven signals with explicit configuration...');

  const signals = await db
    .select({
      id: validationPoints.id,
      thesisId: validationPoints.thesisId,
      thesisType: validationPoints.thesisType,
      statement: validationPoints.statement,
      type: validationPoints.type,
      status: validationPoints.status,
      importance: validationPoints.importance,
      explicitDetails: validationPoints.explicitDetails,
    })
    .from(validationPoints)
    .where(
      and(
        eq(validationPoints.category, 'data_driven'),
        isNotNull(validationPoints.explicitDetails)
      )
    );

  // Filter to signals with valid explicit_details
  const validSignals = signals.filter((s) => {
    const details = s.explicitDetails as ExplicitDetails | null;
    return details && details.dataSource && details.metric && details.threshold !== undefined;
  }) as SignalWithThesis[];

  console.log(`  Found ${validSignals.length} configured data-driven signals`);

  if (validSignals.length === 0) {
    console.log('\n  No signals to check. Configure data-driven signals via the UI.');
    return result;
  }

  // 2. Pre-fetch thesis titles
  const thesisTitles = new Map<string, string>();

  const macroIds = [...new Set(validSignals.filter((s) => s.thesisType === 'macro').map((s) => s.thesisId))];
  const assetIds = [...new Set(validSignals.filter((s) => s.thesisType === 'asset').map((s) => s.thesisId))];

  if (macroIds.length > 0) {
    const macros = await db.select({ id: macroTheses.id, title: macroTheses.title }).from(macroTheses);
    for (const m of macros) {
      thesisTitles.set(m.id, m.title);
    }
  }

  if (assetIds.length > 0) {
    const assets = await db.select({ id: assetTheses.id, title: assetTheses.title }).from(assetTheses);
    for (const a of assets) {
      thesisTitles.set(a.id, a.title);
    }
  }

  // 3. Check each signal
  console.log('\n📈 Checking Signal Thresholds');
  console.log('-'.repeat(40));

  const breaches: ThresholdCheckResult[] = [];

  for (const signal of validSignals) {
    result.signalsChecked++;

    const thesisTitle = thesisTitles.get(signal.thesisId) || 'Unknown Thesis';
    const config = signal.explicitDetails;

    if (VERBOSE) {
      console.log(`\n  [${signal.id.slice(0, 8)}] ${signal.statement.slice(0, 60)}...`);
      console.log(`     Thesis: ${thesisTitle}`);
      console.log(`     Check: ${config.metric} ${getOperatorSymbol(config.operator)} ${config.threshold}`);
    }

    try {
      const checkResult = await checkSignalThreshold(signal, thesisTitle);

      if (checkResult) {
        if (!VERBOSE) {
          const prefix = signal.thesisType === 'asset' && config.ticker ? config.ticker : thesisTitle.slice(0, 20);
          console.log(`  ${prefix}: ${checkResult.message}`);
        } else {
          console.log(`     ${checkResult.message}`);
        }

        if (checkResult.breached) {
          breaches.push(checkResult);
        }
      }
    } catch (error) {
      const errorMsg = `Error checking signal ${signal.id}: ${error}`;
      console.error(`  ❌ ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  // 4. Process breaches
  if (breaches.length > 0) {
    console.log(`\n📝 Processing ${breaches.length} triggered signals...`);
    result.breachesFound = breaches.length;

    for (const breach of breaches) {
      const triageId = await triggerSignal(breach, dryRun);
      if (triageId) {
        result.triageRecordsCreated++;
        console.log(`     ✅ Triggered: ${breach.signal.statement.slice(0, 50)}... → triage ${triageId.slice(0, 8)}...`);
      }
    }
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MONITORING SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Signals checked: ${result.signalsChecked}`);
  console.log(`  Triggers found: ${result.breachesFound}`);
  console.log(`  Triage records created: ${result.triageRecordsCreated}`);
  console.log(`  Errors: ${result.errors.length}`);

  if (breaches.length > 0) {
    console.log('\n🚨 TRIGGERED SIGNALS:');
    for (const breach of breaches) {
      const config = breach.signal.explicitDetails;
      console.log(`\n  • ${breach.signal.type === 'confirmation' ? '✓' : '⚠'} ${breach.signal.statement.slice(0, 80)}...`);
      console.log(`    Thesis: ${breach.thesisTitle}`);
      console.log(`    ${config.metricName || config.metric}: ${breach.currentValue.toFixed(2)} ${getOperatorSymbol(config.operator)} ${config.threshold}`);
    }
  }

  return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

let VERBOSE = false;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  VERBOSE = process.argv.includes('--verbose');

  try {
    const result = await runMonitoring(dryRun);

    if (result.errors.length > 0) {
      console.error('\n❌ Monitoring completed with errors');
      await closeDb();
      process.exit(1);
    }

    if (result.breachesFound > 0) {
      console.log('\n⚠️ Monitoring completed with triggered signals');
      await closeDb();
      process.exit(2);
    }

    console.log('\n✅ Monitoring completed successfully');
    await closeDb();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during monitoring:', error);
    await closeDb();
    process.exit(1);
  }
}

main();
