/**
 * Perplexity Coverage Validation Script
 *
 * Tests Perplexity Search API coverage for different source types
 * to determine if contingency sources (SEC EDGAR, Finnhub) are needed.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/validate-perplexity-coverage.ts
 *
 * Spec: docs/features/thesis-synthesis-monitoring.md Section 3.4
 */

interface ValidationTest {
  name: string;
  query: string;
  expectedCitations: string[];  // Domains we expect to see in citations
  threshold: number;            // 0-1, what % of runs should find these sources
}

interface PerplexitySearchResult {
  content: string;
  citations: string[];
  model: string;
}

async function searchPerplexity(query: string): Promise<PerplexitySearchResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('PERPLEXITY_API_KEY not set');
    process.exit(1);
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
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

function checkCitations(citations: string[], expectedDomains: string[]): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];

  for (const domain of expectedDomains) {
    const hasMatch = citations.some(c => c.toLowerCase().includes(domain.toLowerCase()));
    if (hasMatch) {
      found.push(domain);
    } else {
      missing.push(domain);
    }
  }

  return { found, missing };
}

async function runValidation() {
  console.log('\n🔍 Perplexity Coverage Validation\n');
  console.log('=' .repeat(60));

  // Define validation tests
  const tests: ValidationTest[] = [
    {
      name: 'SEC 8-K Filing Coverage',
      query: 'What are the most recent SEC 8-K filings from Corning Inc (GLW) in 2025? Include links to SEC.gov filings.',
      expectedCitations: ['sec.gov'],
      threshold: 0.8,
    },
    {
      name: 'Major News Coverage (Reuters/WSJ)',
      query: 'What are the latest news articles about Corning Inc (GLW) from Reuters, Wall Street Journal, or Bloomberg in the past week?',
      expectedCitations: ['reuters.com', 'wsj.com', 'bloomberg.com'],
      threshold: 0.5,  // At least one of these
    },
    {
      name: 'Analyst Ratings Coverage',
      query: 'What are the recent analyst ratings or price target changes for Corning Inc (GLW)? Include source links.',
      expectedCitations: ['tipranks', 'marketwatch', 'yahoo', 'seekingalpha'],
      threshold: 0.5,
    },
    {
      name: 'Earnings Coverage',
      query: 'When is Corning Inc (GLW) next earnings report? What were the key highlights from their most recent earnings call?',
      expectedCitations: ['sec.gov', 'yahoo', 'nasdaq', 'seeking'],
      threshold: 0.5,
    },
    {
      name: 'Crypto/Galaxy Digital Coverage',
      query: 'What are the latest news and developments for Galaxy Digital (GLXY) including any SEC filings or regulatory news?',
      expectedCitations: ['sec.gov', 'coindesk', 'reuters', 'bloomberg'],
      threshold: 0.5,
    },
  ];

  const results: { name: string; passed: boolean; found: string[]; missing: string[]; citations: string[] }[] = [];

  for (const test of tests) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`   Query: ${test.query.substring(0, 80)}...`);

    const result = await searchPerplexity(test.query);
    if (!result) {
      console.log(`   ❌ API call failed`);
      results.push({ name: test.name, passed: false, found: [], missing: test.expectedCitations, citations: [] });
      continue;
    }

    const { found, missing } = checkCitations(result.citations, test.expectedCitations);
    const foundRatio = found.length / test.expectedCitations.length;
    const passed = foundRatio >= test.threshold || found.length > 0;

    console.log(`   Citations found: ${result.citations.length}`);
    console.log(`   Expected domains found: ${found.join(', ') || 'none'}`);
    if (missing.length > 0) {
      console.log(`   Missing domains: ${missing.join(', ')}`);
    }
    console.log(`   ${passed ? '✅ PASS' : '⚠️  PARTIAL'} (${found.length}/${test.expectedCitations.length} expected sources)`);

    // Show actual citations
    if (result.citations.length > 0) {
      console.log(`   Sample citations:`);
      for (const citation of result.citations.slice(0, 5)) {
        console.log(`     - ${citation}`);
      }
    }

    results.push({
      name: test.name,
      passed,
      found,
      missing,
      citations: result.citations,
    });

    // Small delay between API calls
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));

  const passedTests = results.filter(r => r.passed).length;
  console.log(`\nTests passed: ${passedTests}/${results.length}`);

  console.log('\n📋 Results by test:');
  for (const result of results) {
    const status = result.passed ? '✅' : '⚠️';
    console.log(`  ${status} ${result.name}: ${result.found.length} sources found`);
  }

  // Contingency recommendations
  console.log('\n📌 CONTINGENCY RECOMMENDATIONS:');

  const secTest = results.find(r => r.name.includes('SEC'));
  if (secTest && !secTest.found.includes('sec.gov')) {
    console.log('  ⚠️  SEC EDGAR RSS: RECOMMENDED (Perplexity may have latency on filings)');
  } else {
    console.log('  ✅ SEC coverage: Perplexity appears adequate');
  }

  const analystTest = results.find(r => r.name.includes('Analyst'));
  if (analystTest && analystTest.found.length === 0) {
    console.log('  ⚠️  Finnhub: RECOMMENDED (for structured analyst ratings data)');
  } else {
    console.log('  ✅ Analyst coverage: Perplexity appears adequate');
  }

  console.log('\n✅ Validation complete\n');
}

runValidation().catch(console.error);
