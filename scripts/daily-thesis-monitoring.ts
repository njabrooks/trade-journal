/**
 * Daily Thesis Monitoring Script
 *
 * Checks thesis monitoring configs against current data:
 * - Price/IV thresholds for asset theses (from underlyings_iv_history)
 * - FRED thresholds for macro theses (via direct FRED API)
 * - News/developments via Perplexity Search API (dual-query batching)
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --news-only
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --verbose
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --save-results
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/daily-thesis-monitoring.ts --analyze
 *
 * Flags:
 *   --dry-run      Don't update database timestamps or create triage records
 *   --news-only    Skip threshold checks, only run news monitoring
 *   --verbose      Show detailed API request/response info
 *   --save-results Save full results to JSON file for manual review
 *   --analyze      Run Claude analysis pipeline to match results to validation points
 *
 * Dual-Query Strategy (Option B):
 *   - Run BOTH wide (simple) and narrow (keyword-rich) queries per thesis
 *   - Wide queries catch general news (M&A, regulatory, earnings)
 *   - Narrow queries catch thesis-specific developments
 *   - Batch up to 5 queries per API call ($5/1K requests, no token cost)
 *   - Track coverage stats to optimize query strategy over time
 *
 * Cost estimate: 20 theses × 2 queries ÷ 5 per batch = 8 requests/day = ~$1.20/month
 * Results: Up to 20 results per query (40 per thesis), same API cost
 *
 * Spec: docs/features/thesis-synthesis-monitoring.md Section 3.4
 */

import { db, closeDb, schema, logToJournal } from './lib/db.js';
import { eq, sql, inArray } from 'drizzle-orm';
import type {
  ExplicitThreshold,
  ThesisMonitoringSources,
  ThesisSearchConfig,
  TriageContentSummary,
  TriageAIAnalysis,
  TriageMatchedResult,
} from '../src/db/schema.js';
import Anthropic from '@anthropic-ai/sdk';

const { thesisMonitoringConfigs, underlyingsIvHistory, macroTheses, assetTheses, validationPoints, validationStatusHistory, thesisTriageRecords, thesisArticulations, thesisNewsItems } = schema;

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
  wideQuery: string;    // Simple discovery query
  narrowQuery: string;  // Keyword-rich targeted query
  keywords: string[];   // For result matching
  validationPointStatements: string[];  // For relevance scoring
}

interface MatchedResult extends PerplexitySearchResult {
  matchedThesisId: string;
  matchScore: number;
  matchedKeywords: string[];
  isRecent: boolean;
  queryType: 'wide' | 'narrow';  // Track which query found this result
}

interface NewsCheckResult {
  configId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  ticker?: string;
  wideQuery: string;      // Simple discovery query
  narrowQuery: string;    // Keyword-rich targeted query
  matchedResults: MatchedResult[];
  hasRelevantNews: boolean;
  summary: string;
  // Coverage stats for analysis
  coverage: {
    wideOnlyCount: number;    // Results found ONLY by wide query
    narrowOnlyCount: number;  // Results found ONLY by narrow query
    overlapCount: number;     // Results found by BOTH queries
    totalUnique: number;      // Total unique results
  };
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
 * Build BOTH wide and narrow search queries for Perplexity Search API
 *
 * Query Design Principles (Updated based on empirical testing):
 *
 * DUAL-QUERY APPROACH (Option B):
 *   - Run BOTH wide (simple) and narrow (keyword-rich) queries
 *   - Wide catches general company news (M&A, regulatory, earnings)
 *   - Narrow catches thesis-specific developments
 *   - Overlap analysis helps refine future query strategy
 *
 * Testing showed (test-perplexity-query-styles.ts):
 *   - "Corning Inc GLW news" and "Corning Inc GLW optical display glass hemlock solar news"
 *     both return 10 results but with only 4 overlapping articles
 *   - Running both ensures we don't miss important news either way
 *
 * Cost impact: 2x queries per thesis, still ~$6/month for 20 theses
 */
function buildSearchQueries(context: {
  ticker?: string;
  companyName?: string;
  keywords: string[];
  thesisType: 'macro' | 'asset';
}): { wide: string; narrow: string } {
  const { ticker, companyName, keywords, thesisType } = context;

  if (thesisType === 'asset' && ticker) {
    const entity = companyName || ticker;

    // WIDE: Simple discovery query
    const wide = `${entity} ${ticker} news`;

    // NARROW: Add thesis-specific keywords
    const filteredKeywords = keywords.filter(k =>
      k && k.trim().length > 2 &&
      k.toLowerCase() !== ticker.toLowerCase() &&
      k.toLowerCase() !== (companyName?.toLowerCase() || '')
    );
    const topKeywords = filteredKeywords.slice(0, 4).join(' ');
    const narrow = topKeywords
      ? `${entity} ${ticker} ${topKeywords} news`
      : wide;  // Fall back to wide if no keywords

    return { wide, narrow };
  }

  if (thesisType === 'macro') {
    // Macro thesis: Both queries need keywords, but narrow has more
    const filteredKeywords = keywords.filter(k => k && k.trim().length > 0);

    // WIDE: Top 2 keywords only
    const wideKeywords = filteredKeywords.slice(0, 2).join(' ') || 'economic market';
    const wide = `${wideKeywords} news`;

    // NARROW: Top 5 keywords
    const narrowKeywords = filteredKeywords.slice(0, 5).join(' ') || 'economic Fed policy market rates';
    const narrow = `${narrowKeywords} news`;

    return { wide, narrow };
  }

  return { wide: 'financial markets news', narrow: 'financial markets news' };
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
 * Match search results to theses with query type tracking
 *
 * Since multi-query returns a flat array, we score each result
 * against each thesis and assign to the best match.
 */
function matchResultsToTheses(
  results: PerplexitySearchResult[],
  contexts: ThesisSearchContext[],
  queryType: 'wide' | 'narrow'
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
        queryType,  // Track which query found this
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
 * Process news monitoring for a batch of theses using DUAL-QUERY approach
 *
 * Runs both WIDE (simple) and NARROW (keyword-rich) queries for each thesis
 * to maximize coverage. Tracks which results came from which query type
 * for analysis and optimization.
 *
 * Cost impact: 2x API calls, but still ~$6/month for 20 theses
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

  // Build search contexts with BOTH wide and narrow queries
  const contexts: ThesisSearchContext[] = newsConfigs.map(config => {
    const thesisTitle = thesisTitles.get(config.thesisId) || 'Unknown';
    const keywords = extractKeywords(config, thesisTitle);

    const { wide, narrow } = buildSearchQueries({
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
      wideQuery: wide,
      narrowQuery: narrow,
      keywords,
      validationPointStatements: [],  // TODO: Load from validation_points table
    };
  });

  // Track results by thesis and query type
  const wideResultsByThesis = new Map<string, MatchedResult[]>();
  const narrowResultsByThesis = new Map<string, MatchedResult[]>();

  for (const ctx of contexts) {
    wideResultsByThesis.set(ctx.thesisId, []);
    narrowResultsByThesis.set(ctx.thesisId, []);
  }

  // Batch into groups of 5 queries each
  const BATCH_SIZE = 5;

  // =========================================================================
  // Phase A: Run WIDE queries
  // =========================================================================
  console.log(`\n  🌐 Running WIDE queries (discovery-focused):`);

  for (let i = 0; i < contexts.length; i += BATCH_SIZE) {
    const batch = contexts.slice(i, i + BATCH_SIZE);
    const queries = batch.map(ctx => ctx.wideQuery);

    console.log(`\n  📡 Wide Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${queries.length} queries`);
    for (const ctx of batch) {
      console.log(`     - ${ctx.thesisTitle}: "${ctx.wideQuery}"`);
    }

    const response = await searchPerplexityBatch(queries, {
      maxResultsPerQuery: 20,  // Max 20 per query, same API cost
      recencyFilter: 'day',
      maxTokensPerPage: 2048,
    });
    apiCalls++;

    if (response) {
      console.log(`     ✓ ${response.results.length} total results`);
      const matches = matchResultsToTheses(response.results, batch, 'wide');
      for (const [thesisId, results] of matches) {
        wideResultsByThesis.set(thesisId, results);
      }
    } else {
      console.log(`     ❌ API call failed`);
    }

    // Rate limit delay
    await new Promise(r => setTimeout(r, 300));
  }

  // =========================================================================
  // Phase B: Run NARROW queries
  // =========================================================================
  console.log(`\n  🎯 Running NARROW queries (thesis-specific):`);

  for (let i = 0; i < contexts.length; i += BATCH_SIZE) {
    const batch = contexts.slice(i, i + BATCH_SIZE);
    const queries = batch.map(ctx => ctx.narrowQuery);

    console.log(`\n  📡 Narrow Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${queries.length} queries`);
    for (const ctx of batch) {
      console.log(`     - ${ctx.thesisTitle}: "${ctx.narrowQuery}"`);
    }

    const response = await searchPerplexityBatch(queries, {
      maxResultsPerQuery: 20,  // Max 20 per query, same API cost
      recencyFilter: 'day',
      maxTokensPerPage: 2048,
    });
    apiCalls++;

    if (response) {
      console.log(`     ✓ ${response.results.length} total results`);
      const matches = matchResultsToTheses(response.results, batch, 'narrow');
      for (const [thesisId, results] of matches) {
        narrowResultsByThesis.set(thesisId, results);
      }
    } else {
      console.log(`     ❌ API call failed`);
    }

    // Rate limit delay
    if (i + BATCH_SIZE < contexts.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // =========================================================================
  // Phase C: Merge and deduplicate results, compute coverage stats
  // =========================================================================
  console.log(`\n  📊 Computing coverage statistics...`);

  for (const ctx of contexts) {
    const wideResults = wideResultsByThesis.get(ctx.thesisId) || [];
    const narrowResults = narrowResultsByThesis.get(ctx.thesisId) || [];

    // Deduplicate by URL
    const urlToResult = new Map<string, MatchedResult>();
    const wideUrls = new Set<string>();
    const narrowUrls = new Set<string>();

    for (const r of wideResults) {
      urlToResult.set(r.url, r);
      wideUrls.add(r.url);
    }

    for (const r of narrowResults) {
      if (!urlToResult.has(r.url)) {
        urlToResult.set(r.url, r);
      }
      narrowUrls.add(r.url);
    }

    // Compute coverage stats
    const overlap = [...wideUrls].filter(u => narrowUrls.has(u));
    const wideOnly = [...wideUrls].filter(u => !narrowUrls.has(u));
    const narrowOnly = [...narrowUrls].filter(u => !wideUrls.has(u));

    const coverage = {
      wideOnlyCount: wideOnly.length,
      narrowOnlyCount: narrowOnly.length,
      overlapCount: overlap.length,
      totalUnique: urlToResult.size,
    };

    // Merge all results sorted by score
    const allResults = [...urlToResult.values()].sort((a, b) => b.matchScore - a.matchScore);
    const recentMatches = allResults.filter(m => m.isRecent);
    const hasRelevantNews = recentMatches.length > 0 || allResults.length >= 2;

    let summary = 'No relevant results';
    if (allResults.length > 0) {
      summary = allResults.slice(0, 2).map(m => m.title).join(' | ');
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
      wideQuery: ctx.wideQuery,
      narrowQuery: ctx.narrowQuery,
      matchedResults: allResults,
      hasRelevantNews,
      summary,
      coverage,
    });

    if (VERBOSE && allResults.length > 0) {
      console.log(`\n     [${ctx.thesisTitle}] Coverage: ${coverage.totalUnique} unique (W:${coverage.wideOnlyCount} N:${coverage.narrowOnlyCount} O:${coverage.overlapCount})`);
      for (const m of allResults.slice(0, 3)) {
        console.log(`       📄 [${m.queryType.toUpperCase()}] ${m.title}`);
        console.log(`          Score: ${m.matchScore} | Keywords: ${m.matchedKeywords.join(', ')}`);
      }
    }
  }

  return { results: newsResults, apiCalls };
}

// ============================================================================
// News Archive Persistence
// ============================================================================

/**
 * Persist news items to thesis_news_items table for historical archive.
 * Uses ON CONFLICT to update existing items (by thesis + URL).
 */
async function persistNewsItems(
  newsResults: NewsCheckResult[],
  triageRecordIds: Map<string, string>  // thesisId -> triageRecordId
): Promise<{ inserted: number; updated: number; errors: number }> {
  const stats = { inserted: 0, updated: 0, errors: 0 };

  for (const newsResult of newsResults) {
    const triageRecordId = triageRecordIds.get(newsResult.thesisId) || null;

    for (const result of newsResult.matchedResults) {
      try {
        // Extract source domain from URL
        let sourceDomain: string | null = null;
        try {
          sourceDomain = new URL(result.url).hostname;
        } catch {
          // Invalid URL, skip domain extraction
        }

        // Parse published date if available
        let publishedDate: string | null = null;
        if (result.date) {
          try {
            const parsed = new Date(result.date);
            if (!isNaN(parsed.getTime())) {
              publishedDate = parsed.toISOString().split('T')[0];
            }
          } catch {
            // Invalid date, skip
          }
        }

        // Use ON CONFLICT to upsert (insert or update)
        await db
          .insert(thesisNewsItems)
          .values({
            thesisId: newsResult.thesisId,
            thesisType: newsResult.thesisType,
            url: result.url,
            title: result.title,
            snippet: result.snippet?.substring(0, 2000) || null,
            sourceDomain,
            publishedDate,
            matchScore: result.matchScore,
            matchedKeywords: result.matchedKeywords,
            queryType: result.queryType,
            triageRecordId,
          })
          .onConflictDoUpdate({
            target: [thesisNewsItems.thesisId, thesisNewsItems.thesisType, thesisNewsItems.url],
            set: {
              title: result.title,
              snippet: result.snippet?.substring(0, 2000) || null,
              matchScore: result.matchScore,
              matchedKeywords: result.matchedKeywords,
              queryType: result.queryType,
              triageRecordId,
              updatedAt: new Date(),
            },
          });

        stats.inserted++;
      } catch (error) {
        console.error(`Error persisting news item ${result.url}:`, error);
        stats.errors++;
      }
    }
  }

  return stats;
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
  const allConfigs = await db
    .select()
    .from(thesisMonitoringConfigs)
    .where(eq(thesisMonitoringConfigs.enabled, true));

  console.log(`\nFound ${allConfigs.length} enabled monitoring configs`);

  if (allConfigs.length === 0) {
    console.log('No configs to process');
    return result;
  }

  // Filter to only theses with articulations (monitoring only makes sense after articulation)
  const thesesWithArticulations = await db
    .selectDistinct({ thesisId: thesisArticulations.thesisId, thesisType: thesisArticulations.thesisType })
    .from(thesisArticulations);

  const articulatedThesisKeys = new Set(
    thesesWithArticulations.map(t => `${t.thesisType}:${t.thesisId}`)
  );

  const configs = allConfigs.filter(c =>
    articulatedThesisKeys.has(`${c.thesisType}:${c.thesisId}`)
  );

  const skippedCount = allConfigs.length - configs.length;
  if (skippedCount > 0) {
    console.log(`  Skipping ${skippedCount} theses without articulations (monitoring requires articulation first)`);
  }
  console.log(`  Processing ${configs.length} theses with articulations`);
  result.configsChecked = configs.length;

  if (configs.length === 0) {
    console.log('No articulated theses to monitor');
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

    // Create REVIEW_DATA triage records for breaches
    if (result.breaches.length > 0) {
      console.log(`\n  📝 Creating REVIEW_DATA triage records for ${result.breaches.length} breaches...`);
      let triageCreated = 0;
      for (const breach of result.breaches) {
        const triageId = await createDataTriageRecord(breach, dryRun);
        if (triageId) {
          triageCreated++;
          console.log(`     ✅ Created triage for ${breach.thesisTitle}: ${triageId.substring(0, 8)}...`);
        }
      }
      console.log(`  Created ${triageCreated} REVIEW_DATA triage records`);
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
      console.log(`    Wide Query: "${news.wideQuery}"`);
      console.log(`    Narrow Query: "${news.narrowQuery}"`);
      console.log(`    Coverage: ${news.coverage.totalUnique} unique (Wide-only: ${news.coverage.wideOnlyCount}, Narrow-only: ${news.coverage.narrowOnlyCount}, Overlap: ${news.coverage.overlapCount})`);
      if (news.matchedResults.length > 0) {
        for (const r of news.matchedResults.slice(0, 3)) {
          console.log(`    - [${r.queryType.toUpperCase()}] ${r.title}`);
          console.log(`      ${r.url}`);
          console.log(`      Score: ${r.matchScore} | Keywords: ${r.matchedKeywords.join(', ')}`);
        }
      }
    }
  }

  // Coverage analysis across all theses
  const totalWideOnly = result.newsResults.reduce((sum, n) => sum + n.coverage.wideOnlyCount, 0);
  const totalNarrowOnly = result.newsResults.reduce((sum, n) => sum + n.coverage.narrowOnlyCount, 0);
  const totalOverlap = result.newsResults.reduce((sum, n) => sum + n.coverage.overlapCount, 0);
  const totalUnique = result.newsResults.reduce((sum, n) => sum + n.coverage.totalUnique, 0);

  console.log('\n📈 COVERAGE ANALYSIS:');
  console.log(`  Total unique results: ${totalUnique}`);
  console.log(`  Wide-only results: ${totalWideOnly} (${totalUnique > 0 ? ((totalWideOnly/totalUnique)*100).toFixed(1) : 0}%)`);
  console.log(`  Narrow-only results: ${totalNarrowOnly} (${totalUnique > 0 ? ((totalNarrowOnly/totalUnique)*100).toFixed(1) : 0}%)`);
  console.log(`  Overlap: ${totalOverlap} (${totalUnique > 0 ? ((totalOverlap/totalUnique)*100).toFixed(1) : 0}%)`);

  if (totalWideOnly > totalNarrowOnly * 2) {
    console.log(`\n  💡 Wide queries are finding significantly more unique results.`);
    console.log(`     Consider simplifying narrow queries or reviewing wide-only results.`);
  } else if (totalNarrowOnly > totalWideOnly * 2) {
    console.log(`\n  💡 Narrow queries are finding significantly more unique results.`);
    console.log(`     Thesis-specific keywords are highly effective.`);
  }

  return result;
}

// ============================================================================
// Analysis Pipeline: Claude Relevance Scoring & VP Matching
// ============================================================================

interface ValidationPointInfo {
  id: string;
  statement: string;
  type: 'validation' | 'invalidation';
  importance: string;
  timeframe?: string;
}

interface AnalysisResult {
  thesisId: string;
  thesisTitle: string;
  ticker?: string;
  validationPoints: ValidationPointInfo[];
  relevantResults: MatchedResult[];
  aiAnalysis: TriageAIAnalysis;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient';
}

/**
 * Load validation points for a thesis
 */
async function loadValidationPoints(thesisId: string, thesisType: 'macro' | 'asset'): Promise<ValidationPointInfo[]> {
  const points = await db
    .select({
      id: validationPoints.id,
      statement: validationPoints.statement,
      type: validationPoints.type,
      importance: validationPoints.importance,
      timeframe: validationPoints.timeframe,
    })
    .from(validationPoints)
    .where(eq(validationPoints.thesisId, thesisId));

  return points.map(p => ({
    id: p.id,
    statement: p.statement,
    type: p.type as 'validation' | 'invalidation',
    importance: p.importance || 'significant',
    timeframe: p.timeframe || undefined,
  }));
}

/**
 * Use Claude to analyze matched results against validation points
 *
 * Returns structured analysis with:
 * - Summary of findings
 * - Which validation points are affected
 * - Key findings and recommended next steps
 */
async function analyzeResultsWithClaude(
  thesisTitle: string,
  ticker: string | undefined,
  validationPoints: ValidationPointInfo[],
  results: MatchedResult[]
): Promise<TriageAIAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, skipping Claude analysis');
    return createFallbackAnalysis(results);
  }

  if (results.length === 0) {
    return {
      summary: 'No relevant news found for this thesis.',
      validationPointsAffected: [],
      keyFindings: [],
      suggestedNextSteps: [],
    };
  }

  const anthropic = new Anthropic({ apiKey });

  // Build the prompt
  const vpList = validationPoints.map((vp, i) =>
    `VP-${i + 1} [${vp.type.toUpperCase()}] (${vp.importance}): ${vp.statement}`
  ).join('\n');

  const resultsList = results.slice(0, 10).map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\nDate: ${r.date || 'unknown'}\nSnippet: ${r.snippet.substring(0, 500)}...`
  ).join('\n\n');

  const prompt = `You are analyzing news results for investment thesis monitoring.

THESIS: ${thesisTitle}${ticker ? ` (${ticker})` : ''}

VALIDATION POINTS TO CHECK:
${vpList || 'No validation points defined yet.'}

NEWS RESULTS TO ANALYZE:
${resultsList}

TASK: Analyze these news results and determine:
1. A 2-3 sentence executive summary of what's happening
2. Which validation points (if any) have relevant evidence
3. Key findings (bullet points)
4. Suggested next steps for the user

For each affected validation point, classify the evidence as:
- strong_validation: Clear evidence supporting the validation point
- weak_validation: Some evidence that may support validation
- neutral: Mentioned but no clear directional evidence
- weak_invalidation: Some evidence that may challenge the thesis
- strong_invalidation: Clear evidence that challenges the thesis

Respond in JSON format:
{
  "summary": "Executive summary here",
  "validationPointsAffected": [
    {
      "pointIndex": 1,
      "evidenceType": "weak_validation",
      "confidence": "medium",
      "recommendedAction": "Monitor for confirmation"
    }
  ],
  "keyFindings": ["Finding 1", "Finding 2"],
  "suggestedNextSteps": ["Step 1", "Step 2"]
}

If no validation points are affected, return an empty array for validationPointsAffected.
Only include validation points that have actual relevant evidence in the news results.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return createFallbackAnalysis(results);
    }

    // Parse JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return createFallbackAnalysis(results);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Map point indices back to actual point IDs
    const affected = (parsed.validationPointsAffected || []).map((vpa: {
      pointIndex: number;
      evidenceType: string;
      confidence: string;
      recommendedAction: string;
    }) => {
      const vp = validationPoints[vpa.pointIndex - 1];
      if (!vp) return null;
      return {
        pointId: vp.id,
        pointStatement: vp.statement,
        evidenceType: vpa.evidenceType as TriageAIAnalysis['validationPointsAffected'][0]['evidenceType'],
        confidence: vpa.confidence as 'high' | 'medium' | 'low',
        recommendedAction: vpa.recommendedAction,
      };
    }).filter(Boolean);

    return {
      summary: parsed.summary || 'Analysis complete.',
      validationPointsAffected: affected,
      keyFindings: parsed.keyFindings || [],
      suggestedNextSteps: parsed.suggestedNextSteps || [],
    };
  } catch (error) {
    console.error('Claude analysis error:', error);
    return createFallbackAnalysis(results);
  }
}

/**
 * Create fallback analysis when Claude is unavailable
 */
function createFallbackAnalysis(results: MatchedResult[]): TriageAIAnalysis {
  return {
    summary: `Found ${results.length} potentially relevant news items. Manual review recommended.`,
    validationPointsAffected: [],
    keyFindings: results.slice(0, 3).map(r => r.title),
    suggestedNextSteps: ['Review news items manually', 'Check if any validation points are affected'],
  };
}

/**
 * Determine severity and urgency based on analysis
 */
function classifyTriage(
  analysis: TriageAIAnalysis,
  validationPoints: ValidationPointInfo[]
): { severity: AnalysisResult['severity']; urgency: AnalysisResult['urgency'] } {
  // Default to info/when_convenient
  let severity: AnalysisResult['severity'] = 'info';
  let urgency: AnalysisResult['urgency'] = 'when_convenient';

  for (const affected of analysis.validationPointsAffected) {
    const vp = validationPoints.find(p => p.id === affected.pointId);
    const importance = vp?.importance || 'supporting';

    // Classification based on evidence type and importance
    if (affected.evidenceType === 'strong_invalidation') {
      if (importance === 'critical') {
        severity = 'critical';
        urgency = 'immediate';
        break;  // Can't get worse
      } else {
        severity = severity === 'critical' ? 'critical' : 'high';
        urgency = urgency === 'immediate' ? 'immediate' : 'today';
      }
    } else if (affected.evidenceType === 'strong_validation' && importance === 'critical') {
      severity = severity === 'critical' ? 'critical' : 'high';
      urgency = urgency === 'immediate' ? 'immediate' : 'today';
    } else if (affected.evidenceType === 'weak_invalidation' && importance === 'critical') {
      severity = ['critical', 'high'].includes(severity) ? severity : 'high';
      urgency = ['immediate', 'today'].includes(urgency) ? urgency : 'this_week';
    } else if (['weak_validation', 'weak_invalidation'].includes(affected.evidenceType)) {
      severity = ['critical', 'high', 'medium'].includes(severity) ? severity : 'medium';
      urgency = ['immediate', 'today', 'this_week'].includes(urgency) ? urgency : 'this_week';
    } else {
      severity = severity === 'info' ? 'low' : severity;
    }
  }

  // If we have results but no VP matches, still flag as low priority
  if (analysis.validationPointsAffected.length === 0 && analysis.keyFindings.length > 0) {
    severity = 'low';
    urgency = 'when_convenient';
  }

  return { severity, urgency };
}

/**
 * Create REVIEW_DATA triage record for threshold breach
 */
async function createDataTriageRecord(
  breach: ThresholdCheckResult,
  dryRun: boolean
): Promise<string | null> {
  if (dryRun) {
    console.log(`     [DRY-RUN] Would create REVIEW_DATA triage for ${breach.thesisTitle}`);
    return null;
  }

  // Build content summary for data breach
  const contentSummary: TriageContentSummary = {
    totalItemsScanned: 1,
    relevantItemsFound: 1,
    sources: [breach.threshold.source === 'fred' ? 'FRED' : 'IBKR/Massive'],
    dateRange: {
      from: new Date().toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
    },
  };

  // Build AI analysis summary for the breach
  const aiAnalysis: TriageAIAnalysis = {
    summary: `Threshold breach detected: ${breach.threshold.description}. Current value: ${breach.currentValue.toFixed(2)}`,
    validationPointsAffected: [],
    keyFindings: [
      `${breach.threshold.metric} ${breach.threshold.operator} ${breach.threshold.value} threshold breached`,
      `Current value: ${breach.currentValue.toFixed(2)}`,
      breach.threshold.linkedValidationPointId
        ? 'Linked to a validation point - may indicate thesis invalidation/validation'
        : 'Review against thesis assumptions',
    ],
    suggestedNextSteps: [
      'Review the threshold breach against thesis assumptions',
      'Check if this changes your confidence in the thesis',
      'Consider updating the thesis or adjusting positions',
    ],
  };

  // Determine severity based on threshold type
  // Uses position/strategy severity values: urgent, attention, monitor, info, pending, complete
  let severity: 'urgent' | 'attention' | 'monitor' | 'info' | 'pending' | 'complete' = 'attention';
  let urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient' = 'today';

  // If linked to a critical validation point, escalate
  if (breach.threshold.linkedValidationPointId) {
    severity = 'urgent';
    urgency = 'immediate';
  }

  try {
    const [record] = await db.insert(thesisTriageRecords).values({
      thesisId: breach.thesisId,
      thesisType: breach.thesisType,
      thesisTitle: breach.thesisTitle,
      triggerType: 'scheduled_monitoring',
      triggerSource: 'daily_threshold_check',
      triageRule: 'REVIEW_DATA',
      contentSummary,
      aiAnalysis,
      matchedResults: [{
        url: breach.threshold.source === 'fred'
          ? `https://fred.stlouisfed.org/series/${breach.threshold.metric}`
          : '#',
        title: `${breach.threshold.metric}: ${breach.currentValue.toFixed(2)}`,
        snippet: breach.message,
        date: new Date().toISOString(),
        queryType: 'threshold_check' as 'wide',
        matchScore: 100,
        matchedKeywords: [breach.threshold.metric],
      }],
      severity,
      urgency,
      status: severity,  // Aligned with lifecycle triggers: status = severity
      lifecycleStage: 'monitoring',
      suggestedSkill: '/deep-dive',
      actionRequired: `Review threshold breach: ${breach.threshold.description}`,
    }).returning({ id: thesisTriageRecords.id });

    // Log to journal
    await logToJournal({
      objectType: breach.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: breach.thesisId,
      objectTitle: breach.thesisTitle,
      actionType: 'monitoring_triage_created',
      actionDescription: `Monitoring triage created: REVIEW_DATA - ${breach.threshold.description}`,
      triageRecordId: record.id,
      newState: {
        triageRule: 'REVIEW_DATA',
        triggerSource: 'daily_threshold_check',
        severity,
        urgency,
        metric: breach.threshold.metric,
        currentValue: breach.currentValue,
        thresholdValue: breach.threshold.value,
        operator: breach.threshold.operator,
      },
      source: 'automation',
      metadata: {
        configId: breach.configId,
        dataSource: breach.threshold.source,
        linkedValidationPointId: breach.threshold.linkedValidationPointId,
      },
    });

    // Phase 2.4: Auto-update V&I status if threshold has linkedValidationPointId
    if (breach.threshold.linkedValidationPointId) {
      await autoTriggerValidationPoint(breach, record.id);
    }

    return record.id;
  } catch (error) {
    console.error(`Error creating REVIEW_DATA triage record for ${breach.thesisTitle}:`, error);
    return null;
  }
}

/**
 * Phase 2.4: Auto-trigger validation point status update
 * When a threshold with linkedValidationPointId is breached, automatically:
 * 1. Update the validation point status to 'triggered'
 * 2. Create validation_status_history entry
 * 3. Log to journal with vi_auto_triggered action type
 */
async function autoTriggerValidationPoint(
  breach: ThresholdCheckResult,
  triageRecordId: string
): Promise<void> {
  const validationPointId = breach.threshold.linkedValidationPointId;
  if (!validationPointId) return;

  try {
    // 1. Fetch current validation point
    const [currentPoint] = await db
      .select()
      .from(validationPoints)
      .where(eq(validationPoints.id, validationPointId))
      .limit(1);

    if (!currentPoint) {
      console.warn(`     ⚠ Validation point ${validationPointId} not found, skipping auto-trigger`);
      return;
    }

    // Skip if already triggered
    if (currentPoint.status === 'triggered') {
      console.log(`     ℹ️ V&I point already triggered, skipping`);
      return;
    }

    const previousStatus = currentPoint.status;

    // 2. Create validation_status_history entry
    await db.insert(validationStatusHistory).values({
      validationPointId,
      previousStatus,
      newStatus: 'triggered',
      evidence: {
        source: breach.threshold.source === 'fred' ? 'FRED' : 'IBKR/Massive',
        summary: `Automated threshold breach: ${breach.threshold.description}. Current value: ${breach.currentValue.toFixed(2)}`,
        link: breach.threshold.source === 'fred'
          ? `https://fred.stlouisfed.org/series/${breach.threshold.metric}`
          : null,
      },
      confidence: 'high', // Auto-triggered from reliable data source
      assessedBy: 'claude',
      userActionRequired: true,
      userActionTaken: null,
      userActionTimestamp: null,
    });

    // 3. Update validation_points.status
    await db
      .update(validationPoints)
      .set({
        status: 'triggered',
        updatedAt: new Date(),
      })
      .where(eq(validationPoints.id, validationPointId));

    // 4. Log to journal with vi_auto_triggered
    const statementPreview = currentPoint.statement.length > 50
      ? `${currentPoint.statement.slice(0, 50)}...`
      : currentPoint.statement;

    await logToJournal({
      objectType: breach.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: breach.thesisId,
      objectTitle: breach.thesisTitle,
      actionType: 'vi_auto_triggered',
      actionDescription: `V&I point auto-triggered: "${statementPreview}" (${breach.threshold.description})`,
      triageRecordId,
      previousState: {
        status: previousStatus,
        validationPointId,
        validationType: currentPoint.type,
      },
      newState: {
        status: 'triggered',
        confidence: 'high',
        evidenceSource: breach.threshold.source === 'fred' ? 'FRED' : 'IBKR/Massive',
        currentValue: breach.currentValue,
        thresholdValue: breach.threshold.value,
        operator: breach.threshold.operator,
      },
      source: 'automation',
      metadata: {
        validationPointId,
        validationType: currentPoint.type,
        importance: currentPoint.importance,
        metric: breach.threshold.metric,
        dataSource: breach.threshold.source,
        configId: breach.configId,
      },
    });

    console.log(`     🎯 Auto-triggered V&I point: ${statementPreview}`);
  } catch (error) {
    console.error(`     ❌ Error auto-triggering V&I point ${validationPointId}:`, error);
  }
}

/**
 * Create triage record in database
 */
async function createTriageRecord(
  newsResult: NewsCheckResult,
  validationPointsList: ValidationPointInfo[],
  analysis: TriageAIAnalysis,
  severity: AnalysisResult['severity'],
  urgency: AnalysisResult['urgency']
): Promise<string | null> {
  const contentSummary: TriageContentSummary = {
    totalItemsScanned: newsResult.coverage.totalUnique,
    relevantItemsFound: newsResult.matchedResults.length,
    sources: [...new Set(newsResult.matchedResults.map(r => new URL(r.url).hostname))],
    dateRange: {
      from: new Date().toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
    },
  };

  const matchedResults: TriageMatchedResult[] = newsResult.matchedResults.map(r => ({
    url: r.url,
    title: r.title,
    snippet: r.snippet.substring(0, 500),
    date: r.date,
    queryType: r.queryType,
    matchScore: r.matchScore,
    matchedKeywords: r.matchedKeywords,
  }));

  try {
    const [record] = await db.insert(thesisTriageRecords).values({
      thesisId: newsResult.thesisId,
      thesisType: newsResult.thesisType,
      thesisTitle: newsResult.thesisTitle,
      triggerType: 'scheduled_monitoring',
      triggerSource: 'daily_news_scan',
      triageRule: 'REVIEW_CONTENT',
      contentSummary,
      aiAnalysis: analysis,
      matchedResults,
      severity,
      urgency,
      status: 'attention',
      lifecycleStage: 'monitoring',
      suggestedSkill: '/assess-validation-evidence',
      actionRequired: 'Review news findings and assess impact on thesis validation points',
    }).returning({ id: thesisTriageRecords.id });

    // Log to journal
    await logToJournal({
      objectType: newsResult.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
      objectId: newsResult.thesisId,
      objectTitle: newsResult.thesisTitle,
      actionType: 'monitoring_triage_created',
      actionDescription: `Monitoring triage created: REVIEW_CONTENT - ${newsResult.matchedResults.length} news items found`,
      triageRecordId: record.id,
      newState: {
        triageRule: 'REVIEW_CONTENT',
        triggerSource: 'daily_news_scan',
        severity,
        urgency,
        matchedResultsCount: newsResult.matchedResults.length,
        validationPointsAffected: analysis.validationPointsAffected.length,
      },
      source: 'automation',
      metadata: {
        configId: newsResult.configId,
        ticker: newsResult.ticker,
        wideQuery: newsResult.wideQuery,
        narrowQuery: newsResult.narrowQuery,
        coverage: newsResult.coverage,
        aiSummary: analysis.summary,
      },
    });

    return record.id;
  } catch (error) {
    console.error('Error creating triage record:', error);
    return null;
  }
}

/**
 * Run analysis pipeline for news results
 *
 * For each thesis with relevant news:
 * 1. Load validation points
 * 2. Run Claude analysis
 * 3. Classify severity/urgency
 * 4. Create triage record
 */
async function runAnalysisPipeline(
  newsResults: NewsCheckResult[],
  dryRun: boolean
): Promise<{ analyzed: number; triageCreated: number; errors: string[]; triageRecordIds: Map<string, string> }> {
  const stats = { analyzed: 0, triageCreated: 0, errors: [] as string[], triageRecordIds: new Map<string, string>() };

  // Filter to theses with relevant news
  const relevantResults = newsResults.filter(nr => nr.hasRelevantNews && nr.matchedResults.length > 0);

  if (relevantResults.length === 0) {
    console.log('\n  No relevant news to analyze');
    return stats;
  }

  console.log(`\n  🔬 Analyzing ${relevantResults.length} theses with relevant news...`);

  for (const newsResult of relevantResults) {
    try {
      console.log(`\n     [${newsResult.thesisTitle}]`);

      // Load validation points
      const vps = await loadValidationPoints(newsResult.thesisId, newsResult.thesisType);
      console.log(`     Validation points: ${vps.length}`);

      // Run Claude analysis
      console.log(`     Running Claude analysis...`);
      const analysis = await analyzeResultsWithClaude(
        newsResult.thesisTitle,
        newsResult.ticker,
        vps,
        newsResult.matchedResults
      );
      stats.analyzed++;

      // Classify severity/urgency
      const { severity, urgency } = classifyTriage(analysis, vps);
      console.log(`     Classification: ${severity}/${urgency}`);
      console.log(`     Summary: ${analysis.summary.substring(0, 100)}...`);

      if (analysis.validationPointsAffected.length > 0) {
        console.log(`     Affected VPs: ${analysis.validationPointsAffected.length}`);
        for (const vpa of analysis.validationPointsAffected.slice(0, 3)) {
          console.log(`       - [${vpa.evidenceType}] ${vpa.pointStatement.substring(0, 60)}...`);
        }
      }

      // Create triage record
      if (!dryRun) {
        const triageId = await createTriageRecord(newsResult, vps, analysis, severity, urgency);
        if (triageId) {
          stats.triageCreated++;
          stats.triageRecordIds.set(newsResult.thesisId, triageId);
          console.log(`     ✅ Created triage record: ${triageId.substring(0, 8)}...`);
        }
      } else {
        console.log(`     [DRY-RUN] Would create triage record`);
      }

      // Rate limit for Claude API
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      const errMsg = `Analysis error for ${newsResult.thesisTitle}: ${error}`;
      console.error(`     ❌ ${errMsg}`);
      stats.errors.push(errMsg);
    }
  }

  return stats;
}

// ============================================================================
// Result Storage for Manual Review
// ============================================================================

interface SavedMonitoringResult {
  timestamp: string;
  configsChecked: number;
  apiCallsMade: number;
  coverageAnalysis: {
    totalUnique: number;
    wideOnly: number;
    narrowOnly: number;
    overlap: number;
  };
  theses: Array<{
    thesisId: string;
    thesisTitle: string;
    ticker?: string;
    thesisType: string;
    wideQuery: string;
    narrowQuery: string;
    coverage: {
      wideOnlyCount: number;
      narrowOnlyCount: number;
      overlapCount: number;
      totalUnique: number;
    };
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      date?: string;
      queryType: string;
      matchScore: number;
      matchedKeywords: string[];
    }>;
  }>;
}

async function saveResultsToJson(result: MonitoringRunResult): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `monitoring-results-${timestamp}.json`;
  const outputPath = path.join(process.cwd(), 'scripts', filename);

  const savedResult: SavedMonitoringResult = {
    timestamp: new Date().toISOString(),
    configsChecked: result.configsChecked,
    apiCallsMade: result.apiCallsMade,
    coverageAnalysis: {
      totalUnique: result.newsResults.reduce((sum, n) => sum + n.coverage.totalUnique, 0),
      wideOnly: result.newsResults.reduce((sum, n) => sum + n.coverage.wideOnlyCount, 0),
      narrowOnly: result.newsResults.reduce((sum, n) => sum + n.coverage.narrowOnlyCount, 0),
      overlap: result.newsResults.reduce((sum, n) => sum + n.coverage.overlapCount, 0),
    },
    theses: result.newsResults.map(news => ({
      thesisId: news.thesisId,
      thesisTitle: news.thesisTitle,
      ticker: news.ticker,
      thesisType: news.thesisType,
      wideQuery: news.wideQuery,
      narrowQuery: news.narrowQuery,
      coverage: news.coverage,
      results: news.matchedResults.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        date: r.date,
        queryType: r.queryType,
        matchScore: r.matchScore,
        matchedKeywords: r.matchedKeywords,
      })),
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(savedResult, null, 2));
  return outputPath;
}

// ============================================================================
// Main Entry Point
// ============================================================================

let VERBOSE = false;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const newsOnly = process.argv.includes('--news-only');
  const saveResults = process.argv.includes('--save-results');
  const runAnalysis = process.argv.includes('--analyze');
  VERBOSE = process.argv.includes('--verbose');

  try {
    const result = await runMonitoring(dryRun, newsOnly);

    // Save results to JSON if requested
    if (saveResults && result.newsResults.length > 0) {
      const outputPath = await saveResultsToJson(result);
      console.log(`\n💾 Results saved to: ${outputPath}`);
    }

    // Run analysis pipeline if requested
    let triageRecordIds = new Map<string, string>();
    if (runAnalysis && result.newsResults.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('🔬 ANALYSIS PIPELINE');
      console.log('='.repeat(60));

      const analysisStats = await runAnalysisPipeline(result.newsResults, dryRun);
      triageRecordIds = analysisStats.triageRecordIds;

      console.log('\n📊 ANALYSIS SUMMARY:');
      console.log(`  Theses analyzed: ${analysisStats.analyzed}`);
      console.log(`  Triage records created: ${analysisStats.triageCreated}`);
      if (analysisStats.errors.length > 0) {
        console.log(`  Analysis errors: ${analysisStats.errors.length}`);
        result.errors.push(...analysisStats.errors);
      }
    }

    // Persist news items to archive (always, regardless of analysis)
    if (result.newsResults.length > 0 && !dryRun) {
      console.log('\n📰 Persisting news items to archive...');
      const archiveStats = await persistNewsItems(result.newsResults, triageRecordIds);
      console.log(`  News items saved: ${archiveStats.inserted}`);
      if (archiveStats.errors > 0) {
        console.log(`  Archive errors: ${archiveStats.errors}`);
      }
    }

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
