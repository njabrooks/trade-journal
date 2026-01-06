/**
 * Test Perplexity Search API Query Styles
 *
 * Compares results from different query formulations to determine
 * optimal query design for thesis monitoring.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/test-perplexity-query-styles.ts
 *
 * Hypothesis: Simpler queries (company + ticker + news) will return
 * MORE relevant results than over-specified queries with many keywords.
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

async function searchPerplexity(query: string): Promise<SearchResponse | null> {
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
        max_results: 10,
        max_tokens_per_page: 1024,
        search_recency_filter: 'week',  // Last week for more results
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

interface QueryTest {
  name: string;
  query: string;
  description: string;
}

async function runTests() {
  console.log('\n🔬 Perplexity Query Style Comparison Test\n');
  console.log('=' .repeat(70));

  // Define test queries - from simple to complex
  const tests: QueryTest[] = [
    {
      name: 'MINIMAL',
      query: 'Corning Inc GLW news',
      description: 'Company + ticker + news only',
    },
    {
      name: 'MODERATE',
      query: 'Corning Inc GLW optical fiber display news',
      description: 'Company + ticker + 2 key segments + news',
    },
    {
      name: 'FULL (Current)',
      query: 'Corning Inc GLW optical display glass hemlock solar news',
      description: 'Company + ticker + 4 keywords + news (current implementation)',
    },
    {
      name: 'NATURAL LANGUAGE',
      query: 'Latest news and developments for Corning Inc GLW',
      description: 'Natural language phrasing',
    },
  ];

  const results: { test: QueryTest; response: SearchResponse | null; uniqueTitles: string[] }[] = [];

  for (const test of tests) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`   Query: "${test.query}"`);
    console.log(`   Description: ${test.description}`);

    const response = await searchPerplexity(test.query);

    if (!response) {
      console.log(`   ❌ API call failed`);
      results.push({ test, response: null, uniqueTitles: [] });
      continue;
    }

    console.log(`\n   📰 Results: ${response.results.length} articles found`);
    console.log('   ' + '-'.repeat(60));

    const titles: string[] = [];
    for (const result of response.results) {
      titles.push(result.title);
      console.log(`   📄 ${result.title}`);
      console.log(`      URL: ${result.url}`);
      console.log(`      Date: ${result.date || 'unknown'}`);
      console.log(`      Snippet: ${result.snippet.substring(0, 150)}...`);
      console.log('');
    }

    results.push({ test, response, uniqueTitles: titles });

    // Delay between API calls
    console.log('   ⏳ Waiting 2s before next test...');
    await new Promise(r => setTimeout(r, 2000));
  }

  // Comparison Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPARISON SUMMARY');
  console.log('='.repeat(70));

  console.log('\n📈 Results Count by Query Style:');
  for (const r of results) {
    const count = r.response?.results.length ?? 0;
    const bar = '█'.repeat(count) + '░'.repeat(10 - count);
    console.log(`  ${r.test.name.padEnd(20)} ${bar} ${count}/10`);
  }

  // Check for unique results across queries
  console.log('\n🔍 Unique Articles Analysis:');

  const allTitles = new Set<string>();
  const titlesByQuery = new Map<string, Set<string>>();

  for (const r of results) {
    const queryTitles = new Set(r.uniqueTitles);
    titlesByQuery.set(r.test.name, queryTitles);
    r.uniqueTitles.forEach(t => allTitles.add(t));
  }

  console.log(`  Total unique articles across all queries: ${allTitles.size}`);

  // Find articles unique to minimal query
  const minimalTitles = titlesByQuery.get('MINIMAL') || new Set();
  const fullTitles = titlesByQuery.get('FULL (Current)') || new Set();

  const minimalOnly = [...minimalTitles].filter(t => !fullTitles.has(t));
  const fullOnly = [...fullTitles].filter(t => !minimalTitles.has(t));
  const overlap = [...minimalTitles].filter(t => fullTitles.has(t));

  console.log(`\n  Comparison: MINIMAL vs FULL (Current):`);
  console.log(`    Overlap: ${overlap.length} articles`);
  console.log(`    Only in MINIMAL: ${minimalOnly.length} articles`);
  console.log(`    Only in FULL: ${fullOnly.length} articles`);

  if (minimalOnly.length > 0) {
    console.log(`\n    ⚠️  Articles found by MINIMAL but missed by FULL:`);
    for (const title of minimalOnly.slice(0, 3)) {
      console.log(`      - ${title}`);
    }
  }

  // Recommendation
  console.log('\n' + '='.repeat(70));
  console.log('📌 RECOMMENDATION');
  console.log('='.repeat(70));

  const minCount = results.find(r => r.test.name === 'MINIMAL')?.response?.results.length ?? 0;
  const fullCount = results.find(r => r.test.name === 'FULL (Current)')?.response?.results.length ?? 0;

  if (minCount >= fullCount && minimalOnly.length > 0) {
    console.log('\n  ✅ MINIMAL query style recommended:');
    console.log('     - Returns same or more results');
    console.log('     - Catches articles the FULL query misses');
    console.log('     - Let result-matching (keywords) do the filtering');
    console.log('\n  Suggested query format: "[Company Name] [TICKER] news"');
  } else if (fullCount > minCount) {
    console.log('\n  ⚠️  FULL query style returns more results, but review if relevant');
    console.log('     Consider using MODERATE style as a balance');
  } else {
    console.log('\n  📊 Results inconclusive - review individual articles for relevance');
  }

  // Save raw results for analysis
  const outputPath = '/Users/njb/Desktop/trade-journal/scripts/test-output-perplexity-queries.json';
  const outputData = results.map(r => ({
    testName: r.test.name,
    query: r.test.query,
    resultsCount: r.response?.results.length ?? 0,
    results: r.response?.results ?? [],
  }));

  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\n  📁 Raw results saved to: ${outputPath}`);

  console.log('\n✅ Test complete\n');
}

runTests().catch(console.error);
