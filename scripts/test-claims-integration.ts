/**
 * Week 4: Integration Testing Script
 * Tests the complete claims workflow from audit upload to thesis/view conversion
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from '@/db';
import { researchArtifacts, researchInsights, macroTheses, assetViews, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ClaimsStructure, MainClaim } from '@/types/claims';
import { isValidClaimsStructure, getUnconvertedClaims, getConvertedClaims } from '@/types/claims';

interface TestResults {
  passed: number;
  failed: number;
  tests: Array<{ name: string; status: 'PASS' | 'FAIL'; message?: string }>;
}

const results: TestResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function test(name: string, condition: boolean, message?: string) {
  if (condition) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`✓ ${name}`);
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', message });
    console.log(`✗ ${name}`);
    if (message) console.log(`  → ${message}`);
  }
}

async function runTests() {
  console.log('\n🧪 Week 4: Integration Testing\n');
  console.log('================================================\n');

  try {
    // Test 1: Verify insight exists (from Week 2 upload)
    console.log('📋 Test Suite 1: Data Upload Verification\n');

    const UPLOADED_INSIGHT_ID = 'e20e61f5-d63b-4cf3-b3af-c47b2321614d';

    const insights = await db
      .select()
      .from(researchInsights)
      .where(eq(researchInsights.id, UPLOADED_INSIGHT_ID))
      .limit(1);

    test(
      '1.1: Insight exists from Week 2 upload',
      insights.length === 1,
      `Expected 1 insight, found ${insights.length}`
    );

    if (insights.length === 0) {
      console.log('\n❌ Cannot continue tests - insight not found\n');
      console.log('   Run: npx tsx --env-file=.env.local scripts/upload-audit-apps-to-agents.ts\n');
      return;
    }

    const insight = insights[0];

    // Get the linked artifact
    const artifacts = await db
      .select()
      .from(researchArtifacts)
      .where(eq(researchArtifacts.id, insight.researchArtifactId!))
      .limit(1);

    test(
      '1.2: Artifact exists',
      artifacts.length === 1,
      `Expected 1 artifact, found ${artifacts.length}`
    );

    const artifact = artifacts[0];
    test('1.3: Artifact has correct source type', artifact.sourceType === 'transcript');
    test('1.4: Artifact status is "structured"', artifact.status === 'structured');
    test('1.5: Artifact has source URL', !!artifact.sourceUrl);

    // Test 2: Verify insight with claims structure
    console.log('\n📋 Test Suite 2: Claims Structure Verification\n');

    test('2.1: Insight linked to artifact', insight.researchArtifactId === artifact.id);
    test('2.2: Insight has claims_structure', !!insight.claimsStructure);
    test('2.3: Claims structure is valid', isValidClaimsStructure(insight.claimsStructure));
    test('2.4: Insight has structured_by set to "ai"', insight.structuredBy === 'ai');

    const claimsStructure = insight.claimsStructure as ClaimsStructure;

    test('2.5: Main claims exist', claimsStructure.main_claims.length > 0);
    test('2.6: Evidence claims exist', claimsStructure.evidence_claims.length > 0);
    test('2.7: Metadata has extraction_date', !!claimsStructure.metadata.extraction_date);
    test('2.8: Metadata has source_skill', !!claimsStructure.metadata.source_skill);

    // Test 3: Verify claim structure details
    console.log('\n📋 Test Suite 3: Toulmin Structure Verification\n');

    const firstMainClaim = claimsStructure.main_claims[0];

    test('3.1: Main claim has id', !!firstMainClaim.id);
    test('3.2: Main claim has level="main"', firstMainClaim.level === 'main');
    test(
      '3.3: Main claim has valid type',
      firstMainClaim.type === 'thesis_candidate' || firstMainClaim.type === 'view_candidate'
    );
    test(
      '3.4: Main claim has valid category',
      firstMainClaim.category === 'macro' || firstMainClaim.category === 'asset_specific'
    );

    // Toulmin framework fields
    test('3.5: Main claim has "claim" text', !!firstMainClaim.claim);
    test('3.6: Main claim has "grounds" (evidence)', !!firstMainClaim.grounds);
    test('3.7: Main claim has "warrant" (reasoning)', !!firstMainClaim.warrant);
    test('3.8: Main claim has "backing"', !!firstMainClaim.backing);
    test(
      '3.9: Main claim has valid "qualifier"',
      ['high', 'medium', 'low', 'exploratory'].includes(firstMainClaim.qualifier)
    );
    test('3.10: Main claim has "rebuttal"', !!firstMainClaim.rebuttal);

    // Hierarchical references
    test(
      '3.11: Main claim has supporting_evidence_claims array',
      Array.isArray(firstMainClaim.supporting_evidence_claims)
    );
    test(
      '3.12: Main claim has rebutting_evidence_claims array',
      Array.isArray(firstMainClaim.rebutting_evidence_claims)
    );

    // Conversion tracking
    test('3.13: Main claim has converted_to field', firstMainClaim.hasOwnProperty('converted_to'));
    test('3.14: Main claim initially unconverted', firstMainClaim.converted_to === null);

    // Test 4: Evidence claim structure
    console.log('\n📋 Test Suite 4: Evidence Claims Verification\n');

    const firstEvidenceClaim = claimsStructure.evidence_claims[0];

    test('4.1: Evidence claim has id', !!firstEvidenceClaim.id);
    test('4.2: Evidence claim has level="evidence"', firstEvidenceClaim.level === 'evidence');
    test(
      '4.3: Evidence claim has valid type',
      firstEvidenceClaim.type === 'supporting' || firstEvidenceClaim.type === 'rebutting'
    );
    test('4.4: Evidence claim has claim text', !!firstEvidenceClaim.claim);
    test(
      '4.5: Evidence claim has valid confidence',
      ['high', 'medium', 'low'].includes(firstEvidenceClaim.confidence)
    );
    test(
      '4.6: Evidence claim has supports_main_claims array',
      Array.isArray(firstEvidenceClaim.supports_main_claims)
    );

    // Test 5: Helper functions
    console.log('\n📋 Test Suite 5: Helper Functions\n');

    const unconvertedClaims = getUnconvertedClaims(claimsStructure);
    const convertedClaims = getConvertedClaims(claimsStructure);

    test('5.1: getUnconvertedClaims returns claims', unconvertedClaims.length > 0);
    test('5.2: getConvertedClaims initially returns empty', convertedClaims.length === 0);
    test(
      '5.3: All claims are unconverted',
      unconvertedClaims.length === claimsStructure.main_claims.length
    );

    // Test 6: Simulated conversion (without actually creating thesis)
    console.log('\n📋 Test Suite 6: Conversion Simulation\n');

    // Simulate what the API does
    const testClaim: MainClaim = {
      ...firstMainClaim,
      converted_to: {
        type: 'macro_thesis',
        id: 'test-thesis-id',
        converted_at: new Date().toISOString(),
      },
    };

    test('6.1: Claim can be marked as converted', !!testClaim.converted_to);
    test('6.2: Converted claim has type', testClaim.converted_to?.type === 'macro_thesis');
    test('6.3: Converted claim has id', !!testClaim.converted_to?.id);
    test('6.4: Converted claim has timestamp', !!testClaim.converted_to?.converted_at);

    // Verify update logic
    const simulatedUpdate: ClaimsStructure = {
      ...claimsStructure,
      main_claims: [testClaim, ...claimsStructure.main_claims.slice(1)],
    };

    const unconvertedAfter = getUnconvertedClaims(simulatedUpdate);
    const convertedAfter = getConvertedClaims(simulatedUpdate);

    test(
      '6.5: After conversion, unconverted count decreases',
      unconvertedAfter.length === claimsStructure.main_claims.length - 1
    );
    test('6.6: After conversion, converted count increases', convertedAfter.length === 1);

    // Test 7: Database integrity
    console.log('\n📋 Test Suite 7: Database Integrity\n');

    test('7.1: Artifact and insight are linked', artifact.id === insight.researchArtifactId);
    test('7.2: Insight has summary', !!insight.summary);
    test('7.3: Insight has key themes', (insight.keyThemes?.length ?? 0) > 0);
    test('7.4: Insight has relevant tickers', (insight.relevantTickers?.length ?? 0) > 0);
    test(
      '7.5: Insight has time horizon',
      !!insight.timeHorizon && ['long_term', 'medium_term', 'short_term'].includes(insight.timeHorizon)
    );
    test(
      '7.6: Insight has confidence level',
      !!insight.confidenceLevel &&
        ['high', 'medium', 'low', 'exploratory'].includes(insight.confidenceLevel)
    );

    // Summary
    console.log('\n================================================');
    console.log('Test Results Summary');
    console.log('================================================\n');

    console.log(`Total Tests:  ${results.passed + results.failed}`);
    console.log(`✓ Passed:     ${results.passed}`);
    console.log(`✗ Failed:     ${results.failed}`);
    console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

    if (results.failed > 0) {
      console.log('\n⚠️  Failed Tests:\n');
      results.tests
        .filter((t) => t.status === 'FAIL')
        .forEach((t) => {
          console.log(`  ✗ ${t.name}`);
          if (t.message) console.log(`    ${t.message}`);
        });
    }

    console.log('\n================================================\n');

    if (results.failed === 0) {
      console.log('✅ All integration tests passed!\n');
      console.log('Next steps:');
      console.log('1. Test claim conversion in UI at:');
      console.log(`   http://localhost:3000/research/${insight.id}`);
      console.log('2. Convert a claim to a macro thesis');
      console.log('3. Convert a claim to an asset view');
      console.log('4. Verify provenance chain\n');
    } else {
      console.log('❌ Some tests failed. Review and fix before proceeding.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
    process.exit(1);
  }
}

runTests();
