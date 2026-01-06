/**
 * Test Dual-Query Coverage with Multiple Tickers
 *
 * Explores:
 * - Higher max_results (10-20 per query)
 * - Week timeframe for more results
 * - Multiple tickers for comparison
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/test-dual-query-coverage.ts
 */

import 'dotenv/config';

interface PerplexitySearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
}

interface SearchResponse {
  results: PerplexitySearchResult[];
  id: string;
}

async function searchPerplexity(
  query: string,
  maxResults: number = 10,
  recency: 'day' | 'week' | 'month' = 'week'
): Promise<SearchResponse | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('PERPLEXITY_API_KEY not set');
    return null;
  }

  try {
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        max_tokens_per_page: 1024,
        search_recency_filter: recency,
        country: 'US',
      }),
    });

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Response: ${errorText}`);
      return null;
    }

    const data = await response.json();
    return {
      results: (data.results || []).map((r: Record<string, unknown>) => ({
        url: r.url as string,
        title: r.title as string,
        snippet: (r.snippet as string) || (r.content as string) || '',
        date: r.date as string | undefined,
      })),
      id: data.id || 'unknown',
    };
  } catch (error) {
    console.error('Error calling Perplexity:', error);
    return null;
  }
}

interface TickerTest {
  ticker: string;
  companyName: string;
  keywords: string[];  // Thesis-specific keywords for narrow query
}

interface CoverageResult {
  ticker: string;
  wideQuery: string;
  narrowQuery: string;
  wideResults: PerplexitySearchResult[];
  narrowResults: PerplexitySearchResult[];
  wideOnlyUrls: string[];
  narrowOnlyUrls: string[];
  overlapUrls: string[];
  totalUnique: number;
}

async function testTicker(test: TickerTest, maxResults: number): Promise<CoverageResult> {
  const { ticker, companyName, keywords } = test;

  // Build queries
  const wideQuery = `${companyName} ${ticker} news`;
  const narrowQuery = `${companyName} ${ticker} ${keywords.slice(0, 4).join(' ')} news`;

  console.log(`\n  📊 ${ticker} (${companyName})`);
  console.log(`     Wide: "${wideQuery}"`);
  console.log(`     Narrow: "${narrowQuery}"`);

  // Run wide query
  const wideResponse = await searchPerplexity(wideQuery, maxResults, 'week');
  const wideResults = wideResponse?.results || [];
  console.log(`     Wide results: ${wideResults.length}`);

  // Small delay
  await new Promise(r => setTimeout(r, 500));

  // Run narrow query
  const narrowResponse = await searchPerplexity(narrowQuery, maxResults, 'week');
  const narrowResults = narrowResponse?.results || [];
  console.log(`     Narrow results: ${narrowResults.length}`);

  // Compute coverage
  const wideUrls = new Set(wideResults.map(r => r.url));
  const narrowUrls = new Set(narrowResults.map(r => r.url));

  const overlapUrls = [...wideUrls].filter(u => narrowUrls.has(u));
  const wideOnlyUrls = [...wideUrls].filter(u => !narrowUrls.has(u));
  const narrowOnlyUrls = [...narrowUrls].filter(u => !wideUrls.has(u));

  const allUrls = new Set([...wideUrls, ...narrowUrls]);

  console.log(`     Coverage: ${allUrls.size} unique (W:${wideOnlyUrls.length} N:${narrowOnlyUrls.length} O:${overlapUrls.length})`);

  return {
    ticker,
    wideQuery,
    narrowQuery,
    wideResults,
    narrowResults,
    wideOnlyUrls,
    narrowOnlyUrls,
    overlapUrls,
    totalUnique: allUrls.size,
  };
}

async function main() {
  console.log('\n🔬 Dual-Query Coverage Test');
  console.log('=' .repeat(70));
  console.log('Settings: max_results=10, recency=week');

  const tickers: TickerTest[] = [
    {
      ticker: 'GLW',
      companyName: 'Corning Inc',
      keywords: ['optical', 'display', 'glass', 'hemlock', 'solar', 'fiber'],
    },
    {
      ticker: 'GLXY',
      companyName: 'Galaxy Digital',
      keywords: ['crypto', 'bitcoin', 'digital assets', 'blockchain', 'trading'],
    },
    {
      ticker: 'TSLA',
      companyName: 'Tesla',
      keywords: ['electric vehicle', 'EV', 'Musk', 'autopilot', 'energy'],
    },
  ];

  const MAX_RESULTS = 10;  // Test with 10 per query
  const results: CoverageResult[] = [];

  for (const test of tickers) {
    const result = await testTicker(test, MAX_RESULTS);
    results.push(result);

    // Delay between tickers
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 COVERAGE SUMMARY');
  console.log('='.repeat(70));

  console.log('\n| Ticker | Wide | Narrow | W-Only | N-Only | Overlap | Total |');
  console.log('|--------|------|--------|--------|--------|---------|-------|');

  for (const r of results) {
    console.log(`| ${r.ticker.padEnd(6)} | ${r.wideResults.length.toString().padEnd(4)} | ${r.narrowResults.length.toString().padEnd(6)} | ${r.wideOnlyUrls.length.toString().padEnd(6)} | ${r.narrowOnlyUrls.length.toString().padEnd(6)} | ${r.overlapUrls.length.toString().padEnd(7)} | ${r.totalUnique.toString().padEnd(5)} |`);
  }

  // Aggregate stats
  const totalWide = results.reduce((s, r) => s + r.wideResults.length, 0);
  const totalNarrow = results.reduce((s, r) => s + r.narrowResults.length, 0);
  const totalWideOnly = results.reduce((s, r) => s + r.wideOnlyUrls.length, 0);
  const totalNarrowOnly = results.reduce((s, r) => s + r.narrowOnlyUrls.length, 0);
  const totalOverlap = results.reduce((s, r) => s + r.overlapUrls.length, 0);
  const totalUnique = results.reduce((s, r) => s + r.totalUnique, 0);

  console.log('|--------|------|--------|--------|--------|---------|-------|');
  console.log(`| TOTAL  | ${totalWide.toString().padEnd(4)} | ${totalNarrow.toString().padEnd(6)} | ${totalWideOnly.toString().padEnd(6)} | ${totalNarrowOnly.toString().padEnd(6)} | ${totalOverlap.toString().padEnd(7)} | ${totalUnique.toString().padEnd(5)} |`);

  // Analysis
  console.log('\n📈 ANALYSIS:');
  console.log(`  API calls made: ${results.length * 2} (${results.length} tickers × 2 queries)`);
  console.log(`  Estimated cost: $${(results.length * 2 * 0.005).toFixed(4)}`);

  const overlapRate = totalUnique > 0 ? ((totalOverlap / totalUnique) * 100).toFixed(1) : '0';
  const wideOnlyRate = totalUnique > 0 ? ((totalWideOnly / totalUnique) * 100).toFixed(1) : '0';
  const narrowOnlyRate = totalUnique > 0 ? ((totalNarrowOnly / totalUnique) * 100).toFixed(1) : '0';

  console.log(`\n  Overlap rate: ${overlapRate}%`);
  console.log(`  Wide-only rate: ${wideOnlyRate}%`);
  console.log(`  Narrow-only rate: ${narrowOnlyRate}%`);

  if (parseFloat(overlapRate) < 30) {
    console.log(`\n  ✅ Low overlap confirms dual-query approach is valuable`);
    console.log(`     Running both queries catches ${100 - parseFloat(overlapRate)}% more unique results`);
  }

  // Show sample results for each ticker
  console.log('\n' + '='.repeat(70));
  console.log('📰 SAMPLE RESULTS BY TICKER');
  console.log('='.repeat(70));

  for (const r of results) {
    console.log(`\n### ${r.ticker} ###`);

    if (r.wideOnlyUrls.length > 0) {
      console.log('\n  Wide-only results (missed by narrow):');
      const wideOnly = r.wideResults.filter(res => r.wideOnlyUrls.includes(res.url));
      for (const res of wideOnly.slice(0, 3)) {
        console.log(`    📄 ${res.title}`);
        console.log(`       ${res.url}`);
        console.log(`       Date: ${res.date || 'unknown'}`);
      }
    }

    if (r.narrowOnlyUrls.length > 0) {
      console.log('\n  Narrow-only results (missed by wide):');
      const narrowOnly = r.narrowResults.filter(res => r.narrowOnlyUrls.includes(res.url));
      for (const res of narrowOnly.slice(0, 3)) {
        console.log(`    📄 ${res.title}`);
        console.log(`       ${res.url}`);
        console.log(`       Date: ${res.date || 'unknown'}`);
      }
    }

    if (r.overlapUrls.length > 0) {
      console.log('\n  Overlap results (found by both):');
      const overlap = r.wideResults.filter(res => r.overlapUrls.includes(res.url));
      for (const res of overlap.slice(0, 2)) {
        console.log(`    📄 ${res.title}`);
        console.log(`       ${res.url}`);
      }
    }
  }

  // Save full results
  const fs = await import('fs');
  const outputPath = '/Users/njb/Desktop/trade-journal/scripts/test-dual-query-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full results saved to: ${outputPath}`);

  console.log('\n✅ Test complete\n');
}

main().catch(console.error);
