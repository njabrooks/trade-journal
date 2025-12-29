#!/usr/bin/env tsx
/**
 * Regenerate Claim Titles from Source Insights
 *
 * Finds all main claims where title is just the first 200 chars of the claim text
 * and regenerates the proper title from the source insight's claims_structure.
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/regenerate-claim-titles.ts
 */

import { db } from '@/db';
import { mainClaims, researchInsights } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ClaimsStructure } from '@/types/claims';
import { isValidClaimsStructure } from '@/types/claims';

async function regenerateClaimTitles() {
  console.log('Finding main claims with truncated titles...\n');

  // Get all main claims with their source insights
  const claims = await db
    .select({
      claim: mainClaims,
      insight: researchInsights,
    })
    .from(mainClaims)
    .leftJoin(
      researchInsights,
      eq(mainClaims.sourceInsightId, researchInsights.id)
    );

  console.log(`Found ${claims.length} total claims`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const { claim, insight } of claims) {
    // Skip if no source insight
    if (!insight || !insight.claimsStructure) {
      console.log(`  ⊘ Skipping ${claim.title} - no source insight`);
      skippedCount++;
      continue;
    }

    const claimsStructure = insight.claimsStructure as ClaimsStructure;
    if (!isValidClaimsStructure(claimsStructure)) {
      console.log(`  ⊘ Skipping ${claim.title} - invalid claims structure`);
      skippedCount++;
      continue;
    }

    // Find the corresponding audit claim
    const auditClaim = claimsStructure.main_claims.find(
      ac => ac.id === claim.sourceClaimId
    );

    if (!auditClaim) {
      console.log(`  ⊘ Skipping ${claim.title} - audit claim not found`);
      skippedCount++;
      continue;
    }

    // Check if title needs updating (if it's just truncated claim text)
    const truncatedClaim = claim.claim.substring(0, 200);
    const needsUpdate = claim.title === truncatedClaim || claim.title === claim.claim;

    if (!needsUpdate) {
      // Title already looks good
      skippedCount++;
      continue;
    }

    // Update with the proper title from audit
    try {
      await db
        .update(mainClaims)
        .set({
          title: auditClaim.title,
          updatedAt: new Date(),
        })
        .where(eq(mainClaims.id, claim.id));

      console.log(`  ✓ Updated: "${claim.title.substring(0, 50)}..." → "${auditClaim.title}"`);
      updatedCount++;
    } catch (error) {
      console.error(`  ✗ Error updating claim ${claim.id}:`, error);
      errorCount++;
    }
  }

  console.log(`\n✅ Summary:`);
  console.log(`   Updated: ${updatedCount} claims`);
  console.log(`   Skipped: ${skippedCount} claims (already had proper titles or no source)`);
  console.log(`   Errors: ${errorCount} claims`);
}

regenerateClaimTitles()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
