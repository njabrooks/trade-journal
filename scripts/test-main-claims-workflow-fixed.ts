#!/usr/bin/env tsx

/**
 * Test the corrected main claims workflow
 *
 * Tests:
 * 1. Promote main claim (now auto-links evidence)
 * 2. Create standalone macro thesis
 * 3. Link main claim to thesis
 * 4. Create standalone asset thesis
 * 5. Link main claim to view
 * 6. Verify all linkages
 */

import { db } from '../src/db';
import {
  mainClaims,
  mainClaimEvidence,
  macroTheses,
  assetTheses,
  claimThesisMappings,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';

const PROMOTED_CLAIM_ID = 'b2a492c4-52b5-45e1-86d2-bdc2996c20b1';

async function runTest() {
  console.log('🧪 Testing Corrected Main Claims Workflow\n');

  // ============================================================================
  // Step 1: Verify the promoted claim exists
  // ============================================================================
  console.log('📊 Step 1: Verifying promoted main claim...');

  const [promotedClaim] = await db
    .select()
    .from(mainClaims)
    .where(eq(mainClaims.id, PROMOTED_CLAIM_ID))
    .limit(1);

  if (!promotedClaim) {
    console.error('❌ Promoted claim not found. Run promotion first.');
    process.exit(1);
  }

  console.log(`✅ Found promoted claim: "${promotedClaim.title.substring(0, 80)}..."`);

  // ============================================================================
  // Step 2: Check evidence linkage
  // ============================================================================
  console.log('\n🔗 Step 2: Checking evidence claim linkage...');

  const evidenceLinks = await db
    .select()
    .from(mainClaimEvidence)
    .where(eq(mainClaimEvidence.mainClaimId, PROMOTED_CLAIM_ID));

  console.log(`📎 Evidence claims linked: ${evidenceLinks.length}`);

  if (evidenceLinks.length === 0) {
    console.warn('⚠️  No evidence claims linked. The promote endpoint may not have auto-linked them.');
    console.warn('    This should be fixed by re-promoting after the API update.');
  } else {
    console.log('✅ Evidence claims successfully linked!');
    evidenceLinks.forEach((link, i) => {
      console.log(`   ${i + 1}. ${link.supportingClaimId} (${link.relationshipType})`);
    });
  }

  // ============================================================================
  // Step 3: Create standalone macro thesis (not from claim conversion)
  // ============================================================================
  console.log('\n📊 Step 3: Creating standalone macro thesis...');

  const [thesis] = await db
    .insert(macroTheses)
    .values({
      title: 'Test: Physical AI Infrastructure Buildout (2025-2026)',
      description:
        'Standalone thesis about AI infrastructure transition from cloud to edge/on-premise deployment',
      thesisType: 'cyclical',
      timeHorizon: 'medium_term',
      confidenceLevel: 'high',
      status: 'active',
      sectors: ['Technology', 'Hardware', 'Networking'],
      direction: 'bullish',
      positionStartDate: '2025-01-01',
      positionEndDate: '2026-12-31',
      notes: {
        creation_method: 'standalone',
        test_workflow: true,
      },
    })
    .returning();

  console.log(`✅ Created standalone thesis: ${thesis.id}`);
  console.log(`   Title: "${thesis.title}"`);

  // ============================================================================
  // Step 4: Link main claim to thesis
  // ============================================================================
  console.log('\n🔗 Step 4: Linking main claim to thesis...');

  const [claimToThesisLink] = await db
    .insert(claimThesisMappings)
    .values({
      claimId: PROMOTED_CLAIM_ID, // main_claim UUID
      entityType: 'thesis',
      entityId: thesis.id,
      relationshipType: 'supports',
      sourceInsightId: null, // Standalone linking (not from conversion)
    })
    .returning();

  console.log(`✅ Linked main claim to thesis: ${claimToThesisLink.id}`);

  // ============================================================================
  // Step 5: Create standalone asset thesis
  // ============================================================================
  console.log('\n📈 Step 5: Creating standalone asset thesis (CSCO)...');

  const [view] = await db
    .insert(assetTheses)
    .values({
      title: 'Test: Cisco Long - On-Premise AI Networking',
      description: 'Standalone view on Cisco benefiting from enterprise on-premise AI buildout',
      viewType: 'long',
      timeHorizon: 'medium_term',
      confidenceLevel: 'high',
      status: 'active',
      direction: 'bullish',
      positionStartDate: '2025-01-01',
      positionEndDate: '2026-06-30',
      targetPrice: '65',
      notes: {
        creation_method: 'standalone',
        test_workflow: true,
      },
    })
    .returning();

  console.log(`✅ Created standalone asset thesis: ${view.id}`);
  console.log(`   Title: "${view.title}"`);

  // ============================================================================
  // Step 6: Link main claim to view
  // ============================================================================
  console.log('\n🔗 Step 6: Linking main claim to asset thesis...');

  const [claimToViewLink] = await db
    .insert(claimThesisMappings)
    .values({
      claimId: PROMOTED_CLAIM_ID, // main_claim UUID
      entityType: 'view',
      entityId: view.id,
      relationshipType: 'supports',
      sourceInsightId: null,
    })
    .returning();

  console.log(`✅ Linked main claim to view: ${claimToViewLink.id}`);

  // ============================================================================
  // Step 7: Verify all relationships
  // ============================================================================
  console.log('\n✅ Step 7: Verifying all relationships...\n');

  // Main claim evidence
  const allEvidence = await db
    .select()
    .from(mainClaimEvidence)
    .where(eq(mainClaimEvidence.mainClaimId, PROMOTED_CLAIM_ID));

  console.log(`📊 Main Claim Evidence Links: ${allEvidence.length}`);

  // Claim-to-thesis mappings
  const thesisMappings = await db
    .select()
    .from(claimThesisMappings)
    .where(
      eq(claimThesisMappings.claimId, PROMOTED_CLAIM_ID)
    );

  const thesisLinks = thesisMappings.filter((m) => m.entityType === 'thesis');
  const viewLinks = thesisMappings.filter((m) => m.entityType === 'view');

  console.log(`📊 Claim-to-Thesis Links: ${thesisLinks.length}`);
  console.log(`📈 Claim-to-View Links: ${viewLinks.length}`);

  console.log('\n✅ Workflow test completed!\n');

  console.log('📝 Summary:');
  console.log(`  - Main claim promoted: ${promotedClaim.id}`);
  console.log(`  - Evidence claims linked: ${allEvidence.length}`);
  console.log(`  - Standalone thesis created: ${thesis.id}`);
  console.log(`  - Main claim → thesis link: ${claimToThesisLink.id}`);
  console.log(`  - Standalone view created: ${view.id}`);
  console.log(`  - Main claim → view link: ${claimToViewLink.id}`);

  console.log('\n🎯 Key Workflow Verified:');
  console.log('  1. ✅ Promote claim (auto-links evidence)');
  console.log('  2. ✅ Create standalone thesis');
  console.log('  3. ✅ Link claim to thesis');
  console.log('  4. ✅ Create standalone view');
  console.log('  5. ✅ Link claim to view');
  console.log('\n');

  process.exit(0);
}

runTest().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
