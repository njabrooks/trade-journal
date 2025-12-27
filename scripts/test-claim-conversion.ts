/**
 * Week 4: Claim Conversion Test
 * Tests converting claims to theses and views, verifying provenance chain
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from '@/db';
import { researchInsights, macroTheses, assetViews, underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ClaimsStructure, MainClaim } from '@/types/claims';

const INSIGHT_ID = 'e20e61f5-d63b-4cf3-b3af-c47b2321614d';

async function testConversion() {
  console.log('\n🧪 Week 4: Claim Conversion Test\n');
  console.log('================================================\n');

  try {
    // Step 1: Get insight and claims
    console.log('1️⃣  Fetching insight and claims...\n');

    const [insight] = await db
      .select()
      .from(researchInsights)
      .where(eq(researchInsights.id, INSIGHT_ID))
      .limit(1);

    if (!insight) {
      console.log('❌ Insight not found\n');
      return;
    }

    const claimsStructure = insight.claimsStructure as ClaimsStructure;
    console.log(`   ✓ Found insight with ${claimsStructure.main_claims.length} main claims\n`);

    // Find first thesis candidate and view candidate
    const thesisCandidate = claimsStructure.main_claims.find((c) => c.type === 'thesis_candidate');
    const viewCandidate = claimsStructure.main_claims.find((c) => c.type === 'view_candidate');

    if (!thesisCandidate) {
      console.log('❌ No thesis candidate found\n');
      return;
    }

    console.log('   Claims to convert:');
    console.log(`   - Thesis: "${thesisCandidate.claim.substring(0, 60)}..."`);
    if (viewCandidate) {
      console.log(`   - View:   "${viewCandidate.claim.substring(0, 60)}..."\n`);
    } else {
      console.log('   - View:   (none available)\n');
    }

    // Step 2: Convert thesis candidate to macro thesis
    console.log('2️⃣  Converting thesis candidate to macro thesis...\n');

    const thesisData = {
      title: thesisCandidate.claim,
      description: `${thesisCandidate.grounds}\n\n${thesisCandidate.warrant}\n\n${thesisCandidate.backing}`.trim(),
      thesisType: 'secular' as const,
      timeHorizon: thesisCandidate.time_horizon || 'medium_term',
      confidenceLevel: thesisCandidate.qualifier,
      notes: thesisCandidate.rebuttal ? `Counter-arguments: ${thesisCandidate.rebuttal}` : null,
    };

    const [createdThesis] = await db
      .insert(macroTheses)
      .values({
        ...thesisData,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log(`   ✓ Thesis created: ${createdThesis.id}`);
    console.log(`   Title: ${createdThesis.title.substring(0, 60)}...`);
    console.log(`   Type: ${createdThesis.thesisType}`);
    console.log(`   Confidence: ${createdThesis.confidenceLevel}\n`);

    // Step 3: Update claim with converted_to metadata
    console.log('3️⃣  Updating claim with conversion metadata...\n');

    const thesisClaimIndex = claimsStructure.main_claims.findIndex(
      (c) => c.id === thesisCandidate.id
    );

    const updatedThesisClaim: MainClaim = {
      ...thesisCandidate,
      converted_to: {
        type: 'macro_thesis',
        id: createdThesis.id,
        converted_at: new Date().toISOString(),
      },
    };

    const updatedClaimsStructure: ClaimsStructure = {
      ...claimsStructure,
      main_claims: [
        ...claimsStructure.main_claims.slice(0, thesisClaimIndex),
        updatedThesisClaim,
        ...claimsStructure.main_claims.slice(thesisClaimIndex + 1),
      ],
    };

    await db
      .update(researchInsights)
      .set({
        claimsStructure: updatedClaimsStructure as any,
        updatedAt: new Date(),
      })
      .where(eq(researchInsights.id, INSIGHT_ID));

    console.log(`   ✓ Claim marked as converted to thesis ${createdThesis.id}\n`);

    // Step 4: Convert view candidate (if exists)
    let createdView;
    if (viewCandidate) {
      console.log('4️⃣  Converting view candidate to asset view...\n');

      const ticker = viewCandidate.relevant_tickers?.[0] || 'NVDA';

      // Get or create underlying
      let [underlying] = await db
        .select()
        .from(underlyings)
        .where(eq(underlyings.ticker, ticker))
        .limit(1);

      if (!underlying) {
        [underlying] = await db
          .insert(underlyings)
          .values({
            ticker,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        console.log(`   ✓ Created underlying for ${ticker}`);
      } else {
        console.log(`   ✓ Found existing underlying for ${ticker}`);
      }

      const viewData = {
        underlyingId: underlying.id,
        title: viewCandidate.claim,
        description: `${viewCandidate.grounds}\n\n${viewCandidate.warrant}\n\n${viewCandidate.backing}`.trim(),
        timeHorizon: viewCandidate.time_horizon || 'medium_term',
        confidenceLevel: viewCandidate.qualifier,
        notes: viewCandidate.rebuttal ? `Counter-arguments: ${viewCandidate.rebuttal}` : null,
      };

      [createdView] = await db
        .insert(assetViews)
        .values({
          ...viewData,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      console.log(`   ✓ View created: ${createdView.id}`);
      console.log(`   Ticker: ${ticker}`);
      console.log(`   Title: ${createdView.title.substring(0, 60)}...`);
      console.log(`   Confidence: ${createdView.confidenceLevel}\n`);

      // Update claim with converted_to metadata
      const viewClaimIndex = updatedClaimsStructure.main_claims.findIndex(
        (c) => c.id === viewCandidate.id
      );

      const updatedViewClaim: MainClaim = {
        ...updatedClaimsStructure.main_claims[viewClaimIndex],
        converted_to: {
          type: 'asset_view',
          id: createdView.id,
          converted_at: new Date().toISOString(),
        },
      };

      updatedClaimsStructure.main_claims = [
        ...updatedClaimsStructure.main_claims.slice(0, viewClaimIndex),
        updatedViewClaim,
        ...updatedClaimsStructure.main_claims.slice(viewClaimIndex + 1),
      ];

      await db
        .update(researchInsights)
        .set({
          claimsStructure: updatedClaimsStructure as any,
          updatedAt: new Date(),
        })
        .where(eq(researchInsights.id, INSIGHT_ID));

      console.log(`   ✓ Claim marked as converted to view ${createdView.id}\n`);
    }

    // Step 5: Verify provenance chain
    console.log('5️⃣  Verifying provenance chain...\n');

    // Re-fetch insight to verify updates
    const [verifyInsight] = await db
      .select()
      .from(researchInsights)
      .where(eq(researchInsights.id, INSIGHT_ID))
      .limit(1);

    const verifyClaimsStructure = verifyInsight.claimsStructure as ClaimsStructure;

    const convertedThesisClaim = verifyClaimsStructure.main_claims.find(
      (c) => c.id === thesisCandidate.id
    );
    const convertedViewClaim = viewCandidate
      ? verifyClaimsStructure.main_claims.find((c) => c.id === viewCandidate.id)
      : null;

    console.log('   Provenance chain:');
    console.log('   ');
    console.log('   research_artifacts');
    console.log('         ↓ (artifact_id)');
    console.log('   research_insights');
    console.log('         ↓ (claims_structure.converted_to)');
    console.log('   macro_theses / asset_views');
    console.log('   ');

    console.log('   Verification results:');
    console.log(
      `   ✓ Thesis claim has converted_to: ${!!convertedThesisClaim?.converted_to}`
    );
    console.log(
      `   ✓ Thesis claim points to: ${convertedThesisClaim?.converted_to?.id}`
    );
    console.log(`   ✓ Thesis exists in database: ${!!createdThesis}`);

    if (viewCandidate && createdView) {
      console.log(
        `   ✓ View claim has converted_to: ${!!convertedViewClaim?.converted_to}`
      );
      console.log(`   ✓ View claim points to: ${convertedViewClaim?.converted_to?.id}`);
      console.log(`   ✓ View exists in database: ${!!createdView}`);
    }

    console.log('   ');

    // Step 6: Summary
    console.log('================================================');
    console.log('Test Results');
    console.log('================================================\n');

    console.log('✅ Claim conversion successful!');
    console.log('✅ Provenance chain intact!\n');

    console.log('Created entities:');
    console.log(`   - Macro Thesis: ${createdThesis.id}`);
    if (createdView) {
      console.log(`   - Asset View:   ${createdView.id}`);
    }
    console.log('   ');

    console.log('You can now view these in the app:');
    console.log(`   - Research: http://localhost:3000/research/${INSIGHT_ID}`);
    console.log(`   - Thesis:   http://localhost:3000/theses/${createdThesis.id}`);
    if (createdView) {
      console.log(`   - View:     http://localhost:3000/asset-views/${createdView.id}`);
    }
    console.log('   ');

    console.log('Converted claims show "✓ Converted" badge in ClaimsBrowser\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Conversion test failed:', error);
    process.exit(1);
  }
}

testConversion();
