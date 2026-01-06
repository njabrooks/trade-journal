/**
 * Daily Thesis Monitoring Script
 *
 * Checks thesis monitoring configs against current data:
 * - Price/IV thresholds for asset theses (from underlyings_iv_history)
 * - FRED thresholds for macro theses (via OpenBB/direct API)
 * - News/developments via Perplexity Search API (primary discovery layer)
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --news-only
 *
 * Spec: docs/features/thesis-synthesis-monitoring.md Section 3.1, 3.4
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import type { ExplicitThreshold, ThesisMonitoringSources, ThesisSearchConfig } from '../src/db/schema.js';

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
  newsResults: NewsCheckResult[];
  errors: string[];
}

// ============================================================================
// Perplexity News Integration
// ============================================================================

interface PerplexitySearchResult {
  content: string;
  citations: string[];
  model: string;
}

interface NewsCheckResult {
  configId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  ticker?: string;
  query: string;
  content: string;
  citations: string[];
  hasRelevantNews: boolean;
  summary: string;
}

/**
 * Search Perplexity for news related to a thesis
 */
async function searchPerplexity(query: string): Promise<PerplexitySearchResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('PERPLEXITY_API_KEY not set, skipping news monitoring');
    return null;
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',  // Search-optimized model
        messages: [{ role: 'user', content: query }],
        return_citations: true,
      }),
    });

    if (!response.ok) {
      console.error(`Perplexity API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Response: ${errorText}`);
      return null;
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      citations: data.citations || [],
      model: data.model || 'unknown',
    };
  } catch (error) {
    console.error('Error calling Perplexity API:', error);
    return null;
  }
}

/**
 * Build a thesis-specific query for Perplexity
 */
function buildThesisQuery(
  ticker: string | null,
  companyName: string | null,
  searchConfig: ThesisSearchConfig,
  thesisType: 'macro' | 'asset'
): string {
  const keywords = [
    ...searchConfig.derivedKeywords,
    ...searchConfig.additionalKeywords,
  ].filter(k => k && k.trim().length > 0);

  const exclusions = searchConfig.exclusions.filter(e => e && e.trim().length > 0);

  // For asset theses with a ticker
  if (ticker && thesisType === 'asset') {
    const entityName = companyName || ticker;
    const keywordStr = keywords.length > 0 ? keywords.join(', ') : 'earnings, SEC filings, analyst ratings, material events';
    const exclusionStr = exclusions.length > 0 ? `\nExclude: ${exclusions.join(', ')}.` : '';

    return `What are the latest news and developments for ${entityName} (${ticker}) in the last 24 hours?

Focus on: ${keywordStr}, SEC filings, earnings, analyst ratings, regulatory news, material events.
${exclusionStr}
Provide specific facts with sources. Include any SEC filings (8-K, 10-Q, 10-K, Form 4) if found.
If there is no significant news in the last 24 hours, say "No significant developments found."`;
  }

  // For macro theses (no ticker)
  if (thesisType === 'macro') {
    const keywordStr = keywords.length > 0 ? keywords.join(', ') : 'economic data, Fed policy, employment, inflation';
    const exclusionStr = exclusions.length > 0 ? `\nExclude: ${exclusions.join(', ')}.` : '';

    return `What are the latest developments in the last 24 hours related to: ${keywordStr}?
${exclusionStr}
Focus on: economic data releases, Fed announcements, policy changes, significant market movements.
Provide specific facts with sources.
If there are no significant developments, say "No significant developments found."`;
  }

  // Fallback
  return `What are the latest financial news developments in the last 24 hours?`;
}

/**
 * Check news for a thesis using Perplexity
 */
async function checkNewsForThesis(
  config: typeof thesisMonitoringConfigs.$inferSelect,
  thesisTitle: string
): Promise<NewsCheckResult | null> {
  const sources = config.sources as ThesisMonitoringSources;

  // Check if news monitoring is enabled
  if (!sources?.news?.enabled) {
    return null;
  }

  // Check if Perplexity is in the providers list (or if list is empty, default to Perplexity)
  const providers = sources.news.providers || [];
  if (providers.length > 0 && !providers.includes('perplexity')) {
    return null;
  }

  const searchConfig = (config.searchConfig as ThesisSearchConfig) || {
    derivedKeywords: [],
    additionalKeywords: [],
    exclusions: [],
  };

  const query = buildThesisQuery(
    config.ticker,
    config.companyName,
    searchConfig,
    config.thesisType as 'macro' | 'asset'
  );

  console.log(`    🔍 Searching Perplexity...`);

  const result = await searchPerplexity(query);
  if (!result) {
    return null;
  }

  // Simple relevance check: does the content contain meaningful news?
  const content = result.content.toLowerCase();
  const noNewsIndicators = [
    'no significant developments',
    'no major news',
    'no notable developments',
    'no significant news',
    'could not find',
    'no recent news',
  ];

  const hasRelevantNews = !noNewsIndicators.some(indicator => content.includes(indicator))
    && result.content.length > 100
    && result.citations.length > 0;

  // Create a brief summary (first 200 chars or first sentence)
  let summary = result.content;
  if (summary.length > 200) {
    const firstSentenceEnd = summary.indexOf('. ');
    if (firstSentenceEnd > 50 && firstSentenceEnd < 300) {
      summary = summary.substring(0, firstSentenceEnd + 1);
    } else {
      summary = summary.substring(0, 200) + '...';
    }
  }

  return {
    configId: config.id,
    thesisId: config.thesisId,
    thesisType: config.thesisType as 'macro' | 'asset',
    thesisTitle,
    ticker: config.ticker ?? undefined,
    query,
    content: result.content,
    citations: result.citations,
    hasRelevantNews,
    summary,
  };
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

async function runMonitoring(dryRun: boolean = false, newsOnly: boolean = false): Promise<MonitoringRunResult> {
  const result: MonitoringRunResult = {
    configsChecked: 0,
    thresholdsEvaluated: 0,
    breaches: [],
    newsResults: [],
    errors: [],
  };

  console.log('\n📊 Starting Daily Thesis Monitoring...\n');
  if (newsOnly) {
    console.log('📰 Running in NEWS-ONLY mode (skipping threshold checks)\n');
  }

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
      // Check price/IV thresholds (for asset theses) - skip if newsOnly
      if (!newsOnly) {
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
      }

      // Check news via Perplexity
      const newsResult = await checkNewsForThesis(config, thesisTitle);
      if (newsResult) {
        result.newsResults.push(newsResult);
        if (newsResult.hasRelevantNews) {
          console.log(`    📰 NEWS FOUND: ${newsResult.summary}`);
          console.log(`    📎 Sources: ${newsResult.citations.length} citations`);
        } else {
          console.log(`    ✓ No significant news in last 24 hours`);
        }
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
  console.log(`  News checks: ${result.newsResults.length}`);
  const newsWithContent = result.newsResults.filter(n => n.hasRelevantNews);
  console.log(`  News with content: ${newsWithContent.length}`);
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

  if (newsWithContent.length > 0) {
    console.log('\n📰 NEWS HIGHLIGHTS:');
    for (const news of newsWithContent) {
      console.log(`\n  • ${news.thesisTitle}${news.ticker ? ` (${news.ticker})` : ''}`);
      console.log(`    ${news.summary}`);
      if (news.citations.length > 0) {
        console.log(`    Sources:`);
        for (const citation of news.citations.slice(0, 3)) {
          console.log(`      - ${citation}`);
        }
        if (news.citations.length > 3) {
          console.log(`      ... and ${news.citations.length - 3} more`);
        }
      }
    }
  }

  if (dryRun) {
    console.log('\n[DRY RUN - no timestamps updated]');
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const newsOnly = process.argv.includes('--news-only');

  try {
    const result = await runMonitoring(dryRun, newsOnly);

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
