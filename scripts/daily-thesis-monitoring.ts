/**
 * Daily Thesis Monitoring Script
 *
 * Checks thesis monitoring configs against current data:
 * - Price/IV thresholds for asset theses (from underlyings_iv_history)
 * - FRED thresholds for macro theses (via OpenBB/direct API)
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --dry-run
 *
 * Spec: docs/features/thesis-synthesis-monitoring.md Section 3.1
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import type { ExplicitThreshold, ThesisMonitoringSources } from '../src/db/schema.js';

const { thesisMonitoringConfigs, underlyingsIvHistory, macroTheses, assetTheses, validationPoints } = schema;

interface ThresholdCheckResult {
  configId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  ticker?: string;
  threshold: ExplicitThreshold;
  currentValue: number;
  breached: boolean;
  message: string;
}

interface MonitoringRunResult {
  configsChecked: number;
  thresholdsEvaluated: number;
  breaches: ThresholdCheckResult[];
  errors: string[];
}

async function getLatestPriceIvForTicker(ticker: string): Promise<{ spot?: number; iv30?: number; asOfDate?: string } | null> {
  const result = await db
    .select({
      spot: underlyingsIvHistory.spot,
      iv30: underlyingsIvHistory.iv30,
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
    asOfDate: result[0].asOfDate,
  };
}

async function getFredSeriesLatestValue(series: string): Promise<number | null> {
  // For now, we'll use the FRED API directly
  // This could be enhanced to use OpenBB Python script or cache
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

function evaluateThreshold(
  threshold: ExplicitThreshold,
  currentValue: number
): boolean {
  const { operator, value } = threshold;
  switch (operator) {
    case '>': return currentValue > value;
    case '<': return currentValue < value;
    case '>=': return currentValue >= value;
    case '<=': return currentValue <= value;
    case '==': return currentValue === value;
    default: return false;
  }
}

async function checkPriceIvThresholds(
  config: typeof thesisMonitoringConfigs.$inferSelect,
  thesisTitle: string
): Promise<ThresholdCheckResult[]> {
  const results: ThresholdCheckResult[] = [];

  if (!config.ticker) return results;

  const sources = config.sources as ThesisMonitoringSources;
  if (!sources?.priceIv?.enabled) return results;

  const latestData = await getLatestPriceIvForTicker(config.ticker);
  if (!latestData) {
    console.warn(`No price/IV data found for ${config.ticker}`);
    return results;
  }

  const thresholds = config.explicitThresholds as ExplicitThreshold[];
  for (const threshold of thresholds) {
    if (threshold.source !== 'price_iv') continue;

    let currentValue: number | undefined;
    if (threshold.metric === 'spot') {
      currentValue = latestData.spot;
    } else if (threshold.metric === 'iv30') {
      currentValue = latestData.iv30;
    }

    if (currentValue === undefined) {
      console.warn(`No ${threshold.metric} data for ${config.ticker}`);
      continue;
    }

    const breached = evaluateThreshold(threshold, currentValue);
    results.push({
      configId: config.id,
      thesisId: config.thesisId,
      thesisType: config.thesisType as 'macro' | 'asset',
      thesisTitle,
      ticker: config.ticker,
      threshold,
      currentValue,
      breached,
      message: breached
        ? `⚠️ THRESHOLD BREACHED: ${threshold.description} (current: ${currentValue.toFixed(2)})`
        : `✓ ${threshold.metric} = ${currentValue.toFixed(2)} (threshold: ${threshold.description})`,
    });
  }

  return results;
}

async function checkFredThresholds(
  config: typeof thesisMonitoringConfigs.$inferSelect,
  thesisTitle: string
): Promise<ThresholdCheckResult[]> {
  const results: ThresholdCheckResult[] = [];

  const sources = config.sources as ThesisMonitoringSources;
  if (!sources?.fred?.enabled || !sources.fred.series.length) return results;

  const thresholds = config.explicitThresholds as ExplicitThreshold[];

  for (const threshold of thresholds) {
    if (threshold.source !== 'fred') continue;

    const currentValue = await getFredSeriesLatestValue(threshold.metric);
    if (currentValue === null) {
      console.warn(`Could not fetch FRED series ${threshold.metric}`);
      continue;
    }

    const breached = evaluateThreshold(threshold, currentValue);
    results.push({
      configId: config.id,
      thesisId: config.thesisId,
      thesisType: config.thesisType as 'macro' | 'asset',
      thesisTitle,
      threshold,
      currentValue,
      breached,
      message: breached
        ? `⚠️ THRESHOLD BREACHED: ${threshold.description} (current: ${currentValue})`
        : `✓ ${threshold.metric} = ${currentValue} (threshold: ${threshold.description})`,
    });
  }

  return results;
}

async function runMonitoring(dryRun: boolean = false): Promise<MonitoringRunResult> {
  const result: MonitoringRunResult = {
    configsChecked: 0,
    thresholdsEvaluated: 0,
    breaches: [],
    errors: [],
  };

  console.log('\n📊 Starting Daily Thesis Monitoring...\n');

  // Fetch all enabled configs
  const configs = await db
    .select()
    .from(thesisMonitoringConfigs)
    .where(eq(thesisMonitoringConfigs.enabled, true));

  console.log(`Found ${configs.length} enabled monitoring configs\n`);

  for (const config of configs) {
    result.configsChecked++;

    // Get thesis title for display
    let thesisTitle = 'Unknown Thesis';
    if (config.thesisType === 'macro') {
      const [thesis] = await db
        .select({ title: macroTheses.title })
        .from(macroTheses)
        .where(eq(macroTheses.id, config.thesisId))
        .limit(1);
      thesisTitle = thesis?.title ?? thesisTitle;
    } else if (config.thesisType === 'asset') {
      const [thesis] = await db
        .select({ title: assetTheses.title })
        .from(assetTheses)
        .where(eq(assetTheses.id, config.thesisId))
        .limit(1);
      thesisTitle = thesis?.title ?? thesisTitle;
    }

    console.log(`\n--- ${thesisTitle} (${config.thesisType}) ---`);
    if (config.ticker) console.log(`    Ticker: ${config.ticker}`);

    try {
      // Check price/IV thresholds (for asset theses)
      const priceIvResults = await checkPriceIvThresholds(config, thesisTitle);
      result.thresholdsEvaluated += priceIvResults.length;
      for (const r of priceIvResults) {
        console.log(`    ${r.message}`);
        if (r.breached) result.breaches.push(r);
      }

      // Check FRED thresholds (for macro theses)
      const fredResults = await checkFredThresholds(config, thesisTitle);
      result.thresholdsEvaluated += fredResults.length;
      for (const r of fredResults) {
        console.log(`    ${r.message}`);
        if (r.breached) result.breaches.push(r);
      }

      // Update lastChecked timestamp
      if (!dryRun) {
        await db
          .update(thesisMonitoringConfigs)
          .set({
            lastChecked: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(thesisMonitoringConfigs.id, config.id));
      }
    } catch (error) {
      const errorMsg = `Error processing config ${config.id}: ${error}`;
      console.error(`    ❌ ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 MONITORING SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Configs checked: ${result.configsChecked}`);
  console.log(`  Thresholds evaluated: ${result.thresholdsEvaluated}`);
  console.log(`  Breaches found: ${result.breaches.length}`);
  console.log(`  Errors: ${result.errors.length}`);

  if (result.breaches.length > 0) {
    console.log('\n🚨 THRESHOLD BREACHES:');
    for (const breach of result.breaches) {
      console.log(`\n  • ${breach.thesisTitle}`);
      console.log(`    Threshold: ${breach.threshold.description}`);
      console.log(`    Current value: ${breach.currentValue}`);
      console.log(`    Validation Point: ${breach.threshold.validationPointId}`);
    }
  }

  if (dryRun) {
    console.log('\n[DRY RUN - no timestamps updated]');
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    const result = await runMonitoring(dryRun);

    // Exit with error code if there were failures
    if (result.errors.length > 0) {
      console.error('\n❌ Monitoring completed with errors');
      await closeDb();
      process.exit(1);
    }

    // Exit with warning code if breaches found (for alerting)
    if (result.breaches.length > 0) {
      console.log('\n⚠️ Monitoring completed with threshold breaches');
      await closeDb();
      process.exit(2); // Special exit code for breaches
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
