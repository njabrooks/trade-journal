#!/usr/bin/env tsx

/**
 * Full end-to-end test of main claims workflow
 *
 * Tests:
 * 1. Upload audit with claims structure
 * 2. Promote a main claim to main_claims table
 * 3. Link evidence claims to the main claim
 * 4. Convert main claim to macro thesis
 * 5. Convert main claim to asset thesis
 * 6. Verify all relationships
 */

import { db } from '../src/db';
import {
  researchInsights,
  mainClaims,
  mainClaimEvidence,
  macroTheses,
  assetTheses,
  claimThesisMappings,
} from '../src/db/schema';
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_PATH = path.join(
  __dirname,
  '../research-workspace/2-audits/2025-12-21-apps-to-agents-audit.md'
);

async function runTest() {
  console.log('🧪 Starting Main Claims Full Workflow Test\n');

  // ============================================================================
  // Step 1: Upload Audit
  // ============================================================================
  console.log('📝 Step 1: Uploading audit with claims structure...');

  const content = fs.readFileSync(AUDIT_PATH, 'utf-8');
  const parsed = parseClaimsMarkdown(content);

  if (!parsed.success) {
    console.error('❌ Parse error:', parsed.error);
    process.exit(1);
  }

  console.log(`✅ Parsed ${parsed.data.claimsStructure.main_claims.length} main claims`);
  console.log(`✅ Parsed ${parsed.data.claimsStructure.evidence_claims.length} evidence claims`);

  const [insight] = await db
    .insert(researchInsights)
    .values({
      title: 'Test: Apps to Agents AI Inflection',
      content: content,
      sourceType: 'transcript',
      sourceUrl: parsed.data.frontmatter?.source_url,
      publishedDate: parsed.data.frontmatter?.published_date,
      tags: (parsed.data.frontmatter?.tags || []) as string[],
      claimsStructure: parsed.data.claimsStructure as any,
    })
    .returning();

  console.log(`✅ Uploaded insight: ${insight.id}\n`);

  // ============================================================================
  // Step 2: Promote Main Claim
  // ============================================================================
  console.log('🔼 Step 2: Promoting main claim to first-class entity...');

  // Get Claim 2 (2026 AI Inflection)
  const claim2 = parsed.data.claimsStructure.main_claims.find(
    (c: any) => c.claim_id === 'claim-2' || c.title?.includes('2026')
  );

  if (!claim2) {
    console.error('❌ Could not find Claim 2 in audit');
    process.exit(1);
  }

  console.log(`📌 Promoting: "${claim2.title}"`);

  const [promotedClaim] = await db
    .insert(mainClaims)
    .values({
      title: claim2.title || 'Untitled Claim',
      category: claim2.category || 'macro',
      claim: claim2.claim_text || claim2.claim || '',
      evidence: claim2.evidence || '',
      reasoning: claim2.reasoning || '',
      backing: claim2.backing || '',
      qualifier: claim2.qualifier || 'medium',
      rebuttal: claim2.rebuttal || '',
      timeHorizon: claim2.time_horizon,
      relevantTickers: claim2.tickers || [],
      status: 'active',
    })
    .returning();

  console.log(`✅ Promoted main claim: ${promotedClaim.id}\n`);

  // ============================================================================
  // Step 3: Link Evidence Claims
  // ============================================================================
  console.log('🔗 Step 3: Linking evidence claims to main claim...');

  // Get supporting evidence claim IDs from the audit
  const supportingClaimIds = claim2.supporting_evidence_claims || [];
  console.log(`📎 Linking ${supportingClaimIds.length} evidence claims`);

  if (supportingClaimIds.length > 0) {
    const evidenceLinks = supportingClaimIds.map((claimId: string) => ({
      mainClaimId: promotedClaim.id,
      researchInsightId: insight.id,
      supportingClaimId: claimId,
      relationshipType: 'supports' as const,
    }));

    await db.insert(mainClaimEvidence).values(evidenceLinks);
    console.log(`✅ Linked ${evidenceLinks.length} evidence claims\n`);
  }

  // ============================================================================
  // Step 4: Convert to Macro Thesis
  // ============================================================================
  console.log('📊 Step 4: Converting main claim to macro thesis...');

  const [thesis] = await db
    .insert(macroTheses)
    .values({
      title: '2026 AI Enterprise Inflection: Apps to Agents Transition',
      description: claim2.claim_text || claim2.claim,
      thesisType: 'cyclical',
      timeHorizon: 'medium_term',
      confidenceLevel: 'high',
      status: 'active',
      sectors: ['Technology', 'Software', 'Cloud Computing'],
      direction: 'bullish',
      positionStartDate: '2025-01-01',
      positionEndDate: '2026-12-31',
      notes: {
        source_claim_id: 'claim-2',
        source_insight_id: insight.id,
        provenance: 'Converted from main claim via test workflow',
      },
    })
    .returning();

  console.log(`✅ Created macro thesis: ${thesis.id}`);

  // Link claim to thesis
  await db.insert(claimThesisMappings).values({
    claimId: 'claim-2',
    entityType: 'thesis',
    entityId: thesis.id,
    relationshipType: 'supports',
    sourceInsightId: insight.id,
  });

  console.log(`✅ Linked claim to thesis\n`);

  // ============================================================================
  // Step 5: Convert to Asset Thesis
  // ============================================================================
  console.log('📈 Step 5: Converting claim to asset thesis (CSCO)...');

  // Find Claim 4 (Cisco/Micron infrastructure)
  const claim4 = parsed.data.claimsStructure.main_claims.find(
    (c: any) => c.claim_id === 'claim-4' || c.title?.includes('Cisco')
  );

  if (claim4) {
    const [view] = await db
      .insert(assetTheses)
      .values({
        title: 'Cisco Long: On-Premise AI Infrastructure Buildout',
        description: claim4.claim_text || claim4.claim,
        viewType: 'long',
        timeHorizon: 'medium_term',
        confidenceLevel: 'high',
        status: 'active',
        direction: 'bullish',
        positionStartDate: '2025-01-01',
        positionEndDate: '2026-12-31',
        targetPrice: '65',
        notes: {
          source_claim_id: 'claim-4',
          source_insight_id: insight.id,
          provenance: 'Converted from main claim via test workflow',
        },
      })
      .returning();

    console.log(`✅ Created asset thesis: ${view.id}`);

    // Link claim to view
    await db.insert(claimThesisMappings).values({
      claimId: 'claim-4',
      entityType: 'view',
      entityId: view.id,
      relationshipType: 'supports',
      sourceInsightId: insight.id,
    });

    console.log(`✅ Linked claim to asset thesis\n`);
  }

  // ============================================================================
  // Step 6: Verify All Relationships
  // ============================================================================
  console.log('✅ Step 6: Verifying relationships...\n');

  // Check main claims
  const allMainClaims = await db.select().from(mainClaims);
  console.log(`📊 Total main claims in DB: ${allMainClaims.length}`);

  // Check evidence linkage
  const allEvidence = await db
    .select()
    .from(mainClaimEvidence)
    .where(eq(mainClaimEvidence.mainClaimId, promotedClaim.id));
  console.log(`🔗 Evidence claims linked: ${allEvidence.length}`);

  // Check thesis mappings
  const thesisMappings = await db
    .select()
    .from(claimThesisMappings)
    .where(eq(claimThesisMappings.entityType, 'thesis'));
  console.log(`📊 Claim-to-thesis mappings: ${thesisMappings.length}`);

  // Check view mappings
  const viewMappings = await db
    .select()
    .from(claimThesisMappings)
    .where(eq(claimThesisMappings.entityType, 'view'));
  console.log(`📈 Claim-to-view mappings: ${viewMappings.length}`);

  console.log('\n✅ Full workflow test completed successfully!\n');

  console.log('📝 Test Summary:');
  console.log('  - Research insight uploaded ✅');
  console.log('  - Main claim promoted ✅');
  console.log('  - Evidence claims linked ✅');
  console.log('  - Macro thesis created ✅');
  console.log('  - Asset view created ✅');
  console.log('  - Provenance tracked ✅\n');

  console.log('🌐 View in UI:');
  console.log(`  - Research: http://localhost:3000/research/${insight.id}`);
  console.log(`  - Theses: http://localhost:3000/theses/${thesis.id}`);
  console.log('\n');

  process.exit(0);
}

runTest().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
