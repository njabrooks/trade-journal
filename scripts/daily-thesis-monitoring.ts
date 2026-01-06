/**
 * Daily Thesis Monitoring Script
 *
 * Checks thesis monitoring configs against current data:
 * - Price/IV thresholds for asset theses (from underlyings_iv_history)
 * - FRED thresholds for macro theses (via direct FRED API)
 * - News/developments via Perplexity Search API (batched multi-query)
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --news-only
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --verbose
 *
 * Optimization Strategy (Strategy B):
 *   - Batch up to 5 queries per API call ($5/1K requests, no token cost)
 *   - Use recency filter to get only recent news (day/week)
 *   - Match results back to theses via keyword matching
 *   - Analyze snippets for validation point relevance
 *
 * Cost estimate: 20 theses ÷ 5 per batch = 4 requests/day = ~$0.60/month
 *
 * Spec: docs/features/thesis-synthesis-monitoring.md Section 3.4
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, sql } from 'drizzle-orm';
import type { ExplicitThreshold, ThesisMonitoringSources, ThesisSearchConfig } from '../src/db/schema.js';

const { thesisMonitoringConfigs, underlyingsIvHistory, macroTheses, assetTheses, validationPoints } = schema;

// ============================================================================
// Types
// ============================================================================

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

interface PerplexitySearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
  lastUpdated?: string;
}

interface PerplexitySearchResponse {
  results: PerplexitySearchResult[];
  id: string;
}

interface ThesisSearchContext {
  configId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  ticker?: string;
  companyName?: string;
  query: string;
  keywords: string[];  // For result matching
  validationPointStatements: string[];  // For relevance scoring
}

interface MatchedResult extends PerplexitySearchResult {
  matchedThesisId: string;
  matchScore: number;
  matchedKeywords: string[];
  isRecent: boolean;
}

interface NewsCheckResult {
  configId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  ticker?: string;
  query: string;
  matchedResults: MatchedResult[];
  hasRelevantNews: boolean;
  summary: string;
}

interface MonitoringRunResult {
  configsChecked: number;
  thresholdsEvaluated: number;
  breaches: ThresholdCheckResult[];
  newsResults: NewsCheckResult[];
  apiCallsMade: number;
  errors: string[];
}

// ============================================================================
// Perplexity Search API - Multi-Query Batch Support
// ============================================================================

interface PerplexityBatchOptions {
  maxResultsPerQuery?: number;    // 1-20, default 5 per query in batch
  maxTokensPerPage?: number;      // Content extraction per result, default 2048
  recencyFilter?: 'day' | 'week' | 'month' | 'year';
  country?: string;
}

/**
 * Execute a batch of up to 5 queries in a single API call
 *
 * API Reference: https://docs.perplexity.ai/api-reference/search-post
 * Pricing: $5/1K requests (flat, no token cost)
 *
 * Multi-query returns a flat array of results (not grouped by query).
 * We must match results back to queries ourselves.
 */
async function searchPerplexityBatch(
  queries: string[],
  options: PerplexityBatchOptions = {}
): Promise<PerplexitySearchResponse | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('PERPLEXITY_API_KEY not set, skipping news monitoring');
    return null;
  }

  if (queries.length === 0) {
    return { results: [], id: 'empty' };
  }

  if (queries.length > 5) {
    console.warn(`Batch size ${queries.length} exceeds max of 5, truncating`);
    queries = queries.slice(0, 5);
  }

  const {
    maxResultsPerQuery = 5,
    maxTokensPerPage = 2048,
    recencyFilter = 'day',
    country = 'US',
  } = options;

  try {
    const requestBody: Record<string, unknown> = {
      query: queries.length === 1 ? queries[0] : queries,
      max_results: maxResultsPerQuery * queries.length,  // Total results across all queries
      max_tokens_per_page: maxTokensPerPage,
      search_recency_filter: recencyFilter,
      country,
    };

    if (VERBOSE) {
      console.log(`\n    [API REQUEST]`);
      console.log(`    Queries: ${queries.length}`);
      for (const q of queries) {
        console.log(`      - "${q}"`);
      }
      console.log(`    Recency: ${recencyFilter}`);
    }

    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error(`Perplexity Search API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Response: ${errorText}`);
      return null;
    }

    const data = await response.json();

    const results: PerplexitySearchResult[] = (data.results || []).map((r: Record<string, unknown>) => ({
      url: r.url as string,
      title: r.title as string,
      snippet: r.snippet as string || r.content as string || '',
      date: r.date as string | undefined,
      lastUpdated: r.last_updated as string | undefined,
    }));

    if (VERBOSE) {
      console.log(`    [API RESPONSE: ${results.length} results]`);
    }

    return {
      results,
      id: data.id || 'unknown',
    };
  } catch (error) {
    console.error('Error calling Perplexity Search API:', error);
    return null;
  }
}

// ============================================================================
// Query Building
// ============================================================================

/**
 * Build a search query optimized for Perplexity Search API
 *
 * Query Design Principles:
 * 1. SPECIFICITY: Include company name AND ticker for disambiguation
 * 2. KEYWORDS: Add 3-5 topic keywords to focus results
 * 3. RECENCY SIGNAL: Add "news" to bias toward recent content
 * 4. AVOID OVER-SPECIFICATION: Too many terms reduces recall
 *
 * Examples:
 *   Asset thesis: "Corning GLW optical fiber AI infrastructure news"
 *   Macro thesis: "Fed interest rates inflation employment news"
 */
function buildSearchQuery(context: {
  ticker?: string;
  companyName?: string;
  keywords: string[];
  thesisType: 'macro' | 'asset';
}): string {
  const { ticker, companyName, keywords, thesisType } = context;

  // Filter out ticker and company name from keywords (they'll be added separately)
  const tickerLower = ticker?.toLowerCase();
  const companyLower = companyName?.toLowerCase();
  const filteredKeywords = keywords.filter(k => {
    const kLower = k.toLowerCase();
    return kLower !== tickerLower && kLower !== companyLower;
  });

  // Take top 4 unique keywords
  const topKeywords = filteredKeywords.slice(0, 4).join(' ');

  if (thesisType === 'asset' && ticker) {
    // Asset thesis: "CompanyName TICKER keyword1 keyword2 news"
    const entity = companyName || ticker;
    return `${entity} ${ticker} ${topKeywords} news`.trim().replace(/\s+/g, ' ');
  }

  if (thesisType === 'macro') {
    // Macro thesis: "keyword1 keyword2 keyword3 news"
    const macroKeywords = topKeywords || 'economic Fed policy market';
    return `${macroKeywords} news`.trim().replace(/\s+/g, ' ');
  }

  return 'financial markets news';
}

/**
 * Extract keywords from thesis config for query building and result matching
 *
 * Keywords come from:
 * 1. derivedKeywords: Auto-generated from thesis/validation point text
 * 2. additionalKeywords: User-specified terms
 * 3. ticker/companyName: For asset theses
 */
function extractKeywords(
  config: typeof thesisMonitoringConfigs.$inferSelect,
  thesisTitle: string
): string[] {
  const searchConfig = (config.searchConfig as ThesisSearchConfig) || {
    derivedKeywords: [],
    additionalKeywords: [],
    exclusions: [],
  };

  const keywords: string[] = [
    ...searchConfig.derivedKeywords,
    ...searchConfig.additionalKeywords,
  ].filter(k => k && k.trim().length > 0);

  // Add ticker and company name as keywords for matching
  if (config.ticker) {
    keywords.unshift(config.ticker);
  }
  if (config.companyName) {
    keywords.unshift(config.companyName);
  }

  // Add key words from thesis title
  const titleWords = thesisTitle
    .split(/\s+/)
    .filter(w => w.length > 3 && !['the', 'and', 'for', 'with'].includes(w.toLowerCase()));
  keywords.push(...titleWords.slice(0, 3));

  // Deduplicate and return
  return [...new Set(keywords.map(k => k.toLowerCase()))];
}

// ============================================================================
// Result Matching
// ============================================================================

/**
 * Check if a date string represents recent content
 */
function isRecentDate(dateStr: string | undefined, maxAgeDays: number = 7): boolean {
  if (!dateStr) return false;

  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= maxAgeDays;
  } catch {
    return false;
  }
}

/**
 * Score how well a search result matches a thesis
 *
 * Matching strategy:
 * 1. Check for ticker mention (high weight)
 * 2. Check for company name mention (high weight)
 * 3. Check for keyword matches (cumulative)
 * 4. Bonus for recent date
 */
function scoreResultMatch(
  result: PerplexitySearchResult,
  context: ThesisSearchContext
): { score: number; matchedKeywords: string[] } {
  const searchText = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  const matchedKeywords: string[] = [];
  let score = 0;

  // Ticker match (weight: 10)
  if (context.ticker && searchText.includes(context.ticker.toLowerCase())) {
    score += 10;
    matchedKeywords.push(context.ticker);
  }

  // Company name match (weight: 8)
  if (context.companyName && searchText.includes(context.companyName.toLowerCase())) {
    score += 8;
    matchedKeywords.push(context.companyName);
  }

  // Keyword matches (weight: 2 each, max 10)
  for (const keyword of context.keywords) {
    if (keyword.length > 2 && searchText.includes(keyword.toLowerCase())) {
      score += 2;
      matchedKeywords.push(keyword);
      if (matchedKeywords.length >= 5) break;  // Cap keyword bonus
    }
  }

  // Recency bonus (weight: 3)
  if (isRecentDate(result.date, 3)) {
    score += 3;
  }

  return { score, matchedKeywords: [...new Set(matchedKeywords)] };
}

/**
 * Match search results to theses
 *
 * Since multi-query returns a flat array, we score each result
 * against each thesis and assign to the best match.
 */
function matchResultsToTheses(
  results: PerplexitySearchResult[],
  contexts: ThesisSearchContext[]
): Map<string, MatchedResult[]> {
  const matchesByThesis = new Map<string, MatchedResult[]>();

  // Initialize empty arrays for each thesis
  for (const ctx of contexts) {
    matchesByThesis.set(ctx.thesisId, []);
  }

  for (const result of results) {
    let bestMatch: { thesisId: string; score: number; keywords: string[] } | null = null;

    // Score against each thesis
    for (const ctx of contexts) {
      const { score, matchedKeywords } = scoreResultMatch(result, ctx);

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { thesisId: ctx.thesisId, score, keywords: matchedKeywords };
      }
    }

    // Assign to best matching thesis (if any)
    if (bestMatch && bestMatch.score >= 5) {  // Minimum threshold
      const matched: MatchedResult = {
        ...result,
        matchedThesisId: bestMatch.thesisId,
        matchScore: bestMatch.score,
        matchedKeywords: bestMatch.keywords,
        isRecent: isRecentDate(result.date, 3),
      };
      matchesByThesis.get(bestMatch.thesisId)!.push(matched);
    }
  }

  // Sort each thesis's results by score (descending)
  for (const [thesisId, matches] of matchesByThesis) {
    matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  return matchesByThesis;
}

// ============================================================================
// Batch News Checking
// ============================================================================

/**
 * Process news monitoring for a batch of theses
 *
 * This is the core optimization: batch up to 5 theses into a single API call
 */
async function checkNewsBatch(
  configs: Array<typeof thesisMonitoringConfigs.$inferSelect>,
  thesisTitles: Map<string, string>
): Promise<{ results: NewsCheckResult[]; apiCalls: number }> {
  const newsResults: NewsCheckResult[] = [];
  let apiCalls = 0;

  // Filter to configs with news monitoring enabled
  const newsConfigs = configs.filter(c => {
    const sources = c.sources as ThesisMonitoringSources;
    if (!sources?.news?.enabled) return false;
    const providers = sources.news.providers || [];
    return providers.length === 0 || providers.includes('perplexity');
  });

  if (newsConfigs.length === 0) {
    return { results: [], apiCalls: 0 };
  }

  // Build search contexts for each config
  const contexts: ThesisSearchContext[] = newsConfigs.map(config => {
    const thesisTitle = thesisTitles.get(config.thesisId) || 'Unknown';
    const keywords = extractKeywords(config, thesisTitle);

    const query = buildSearchQuery({
      ticker: config.ticker ?? undefined,
      companyName: config.companyName ?? undefined,
      keywords,
      thesisType: config.thesisType as 'macro' | 'asset',
    });

    return {
      configId: config.id,
      thesisId: config.thesisId,
      thesisType: config.thesisType as 'macro' | 'asset',
      thesisTitle,
      ticker: config.ticker ?? undefined,
      companyName: config.companyName ?? undefined,
      query,
      keywords,
      validationPointStatements: [],  // TODO: Load from validation_points table
    };
  });

  // Batch into groups of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < contexts.length; i += BATCH_SIZE) {
    const batch = contexts.slice(i, i + BATCH_SIZE);
    const queries = batch.map(ctx => ctx.query);

    console.log(`\n  📡 API Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${queries.length} queries`);
    for (const ctx of batch) {
      console.log(`     - ${ctx.thesisTitle}: "${ctx.query}"`);
    }

    // Execute batch search
    const response = await searchPerplexityBatch(queries, {
      maxResultsPerQuery: 5,
      recencyFilter: 'day',
      maxTokensPerPage: 2048,
    });
    apiCalls++;

    if (!response) {
      // API call failed, create empty results
      for (const ctx of batch) {
        newsResults.push({
          configId: ctx.configId,
          thesisId: ctx.thesisId,
          thesisType: ctx.thesisType,
          thesisTitle: ctx.thesisTitle,
          ticker: ctx.ticker,
          query: ctx.query,
          matchedResults: [],
          hasRelevantNews: false,
          summary: 'API call failed',
        });
      }
      continue;
    }

    console.log(`     ✓ ${response.results.length} total results`);

    // Match results to theses
    const matchesByThesis = matchResultsToTheses(response.results, batch);

    // Create news results for each thesis in batch
    for (const ctx of batch) {
      const matches = matchesByThesis.get(ctx.thesisId) || [];
      const recentMatches = matches.filter(m => m.isRecent);

      const hasRelevantNews = recentMatches.length > 0 || matches.length >= 2;

      let summary = 'No relevant results';
      if (matches.length > 0) {
        summary = matches.slice(0, 2).map(m => m.title).join(' | ');
        if (summary.length > 150) {
          summary = summary.substring(0, 147) + '...';
        }
      }

      newsResults.push({
        configId: ctx.configId,
        thesisId: ctx.thesisId,
        thesisType: ctx.thesisType,
        thesisTitle: ctx.thesisTitle,
        ticker: ctx.ticker,
        query: ctx.query,
        matchedResults: matches,
        hasRelevantNews,
        summary,
      });

      if (VERBOSE && matches.length > 0) {
        console.log(`\n     [${ctx.thesisTitle}] ${matches.length} matched results:`);
        for (const m of matches.slice(0, 3)) {
          console.log(`       📄 ${m.title}`);
          console.log(`          Score: ${m.matchScore} | Keywords: ${m.matchedKeywords.join(', ')}`);
          console.log(`          Date: ${m.date || 'unknown'} | Recent: ${m.isRecent}`);
        }
      }
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < contexts.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { results: newsResults, apiCalls };
}

// ============================================================================
// Price/IV and FRED Threshold Checking (unchanged)
// ============================================================================

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

function evaluateThreshold(threshold: ExplicitThreshold, currentValue: number): boolean {
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
    console.warn(`    ⚠ No price/IV data found for ${config.ticker}`);
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
      console.warn(`    ⚠ No ${threshold.metric} data for ${config.ticker}`);
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
        ? `⚠️ BREACHED: ${threshold.description} (current: ${currentValue.toFixed(2)})`
        : `✓ ${threshold.metric} = ${currentValue.toFixed(2)}`,
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
      console.warn(`    ⚠ Could not fetch FRED series ${threshold.metric}`);
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
        ? `⚠️ BREACHED: ${threshold.description} (current: ${currentValue})`
        : `✓ ${threshold.metric} = ${currentValue}`,
    });
  }

  return results;
}

// ============================================================================
// Main Monitoring Run
// ============================================================================

async function runMonitoring(dryRun: boolean = false, newsOnly: boolean = false): Promise<MonitoringRunResult> {
  const result: MonitoringRunResult = {
    configsChecked: 0,
    thresholdsEvaluated: 0,
    breaches: [],
    newsResults: [],
    apiCallsMade: 0,
    errors: [],
  };

  console.log('\n📊 Daily Thesis Monitoring');
  console.log('=' .repeat(60));
  if (newsOnly) {
    console.log('Mode: NEWS-ONLY (skipping threshold checks)');
  }
  if (dryRun) {
    console.log('Mode: DRY-RUN (no database updates)');
  }

  // Fetch all enabled configs
  const configs = await db
    .select()
    .from(thesisMonitoringConfigs)
    .where(eq(thesisMonitoringConfigs.enabled, true));

  console.log(`\nFound ${configs.length} enabled monitoring configs`);
  result.configsChecked = configs.length;

  if (configs.length === 0) {
    console.log('No configs to process');
    return result;
  }

  // Pre-fetch thesis titles for all configs
  const thesisTitles = new Map<string, string>();
  const macroIds = configs.filter(c => c.thesisType === 'macro').map(c => c.thesisId);
  const assetIds = configs.filter(c => c.thesisType === 'asset').map(c => c.thesisId);

  if (macroIds.length > 0) {
    const macros = await db
      .select({ id: macroTheses.id, title: macroTheses.title })
      .from(macroTheses);
    for (const m of macros) {
      thesisTitles.set(m.id, m.title);
    }
  }

  if (assetIds.length > 0) {
    const assets = await db
      .select({ id: assetTheses.id, title: assetTheses.title })
      .from(assetTheses);
    for (const a of assets) {
      thesisTitles.set(a.id, a.title);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 1: Threshold Checks (Price/IV, FRED)
  // -------------------------------------------------------------------------

  if (!newsOnly) {
    console.log('\n📈 Phase 1: Threshold Checks');
    console.log('-'.repeat(40));

    for (const config of configs) {
      const thesisTitle = thesisTitles.get(config.thesisId) || 'Unknown';

      try {
        // Price/IV thresholds
        const priceIvResults = await checkPriceIvThresholds(config, thesisTitle);
        result.thresholdsEvaluated += priceIvResults.length;
        for (const r of priceIvResults) {
          console.log(`  ${config.ticker || thesisTitle}: ${r.message}`);
          if (r.breached) result.breaches.push(r);
        }

        // FRED thresholds
        const fredResults = await checkFredThresholds(config, thesisTitle);
        result.thresholdsEvaluated += fredResults.length;
        for (const r of fredResults) {
          console.log(`  ${thesisTitle}: ${r.message}`);
          if (r.breached) result.breaches.push(r);
        }
      } catch (error) {
        const errorMsg = `Error checking thresholds for ${config.id}: ${error}`;
        console.error(`  ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: News Monitoring (Batched)
  // -------------------------------------------------------------------------

  console.log('\n📰 Phase 2: News Monitoring (Batched)');
  console.log('-'.repeat(40));

  try {
    const { results: newsResults, apiCalls } = await checkNewsBatch(configs, thesisTitles);
    result.newsResults = newsResults;
    result.apiCallsMade = apiCalls;

    console.log(`\n  API calls made: ${apiCalls}`);
    console.log(`  Estimated cost: $${(apiCalls * 0.005).toFixed(4)}`);
  } catch (error) {
    const errorMsg = `Error in batch news check: ${error}`;
    console.error(`  ❌ ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  // -------------------------------------------------------------------------
  // Phase 3: Update Timestamps
  // -------------------------------------------------------------------------

  if (!dryRun) {
    console.log('\n💾 Updating lastChecked timestamps...');
    for (const config of configs) {
      await db
        .update(thesisMonitoringConfigs)
        .set({
          lastChecked: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(thesisMonitoringConfigs.id, config.id));
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log('\n' + '='.repeat(60));
  console.log('📊 MONITORING SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Configs checked: ${result.configsChecked}`);
  console.log(`  Thresholds evaluated: ${result.thresholdsEvaluated}`);
  console.log(`  Breaches found: ${result.breaches.length}`);
  console.log(`  News results: ${result.newsResults.length}`);
  const newsWithContent = result.newsResults.filter(n => n.hasRelevantNews);
  console.log(`  Theses with news: ${newsWithContent.length}`);
  console.log(`  API calls: ${result.apiCallsMade}`);
  console.log(`  Errors: ${result.errors.length}`);

  if (result.breaches.length > 0) {
    console.log('\n🚨 THRESHOLD BREACHES:');
    for (const breach of result.breaches) {
      console.log(`\n  • ${breach.thesisTitle}${breach.ticker ? ` (${breach.ticker})` : ''}`);
      console.log(`    ${breach.threshold.description}`);
      console.log(`    Current: ${breach.currentValue}`);
    }
  }

  if (newsWithContent.length > 0) {
    console.log('\n📰 NEWS HIGHLIGHTS:');
    for (const news of newsWithContent) {
      console.log(`\n  • ${news.thesisTitle}${news.ticker ? ` (${news.ticker})` : ''}`);
      console.log(`    Query: "${news.query}"`);
      console.log(`    Matched: ${news.matchedResults.length} results`);
      if (news.matchedResults.length > 0) {
        for (const r of news.matchedResults.slice(0, 2)) {
          console.log(`    - ${r.title}`);
          console.log(`      ${r.url}`);
          console.log(`      Score: ${r.matchScore} | Keywords: ${r.matchedKeywords.join(', ')}`);
        }
      }
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
  const newsOnly = process.argv.includes('--news-only');
  VERBOSE = process.argv.includes('--verbose');

  try {
    const result = await runMonitoring(dryRun, newsOnly);

    if (result.errors.length > 0) {
      console.error('\n❌ Monitoring completed with errors');
      await closeDb();
      process.exit(1);
    }

    if (result.breaches.length > 0) {
      console.log('\n⚠️ Monitoring completed with threshold breaches');
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
