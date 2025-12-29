#!/usr/bin/env tsx
/**
 * Reset Orphaned Confirmed Claims
 *
 * Finds all claims with status='confirmed' that have no linked theses or views
 * and resets them to status='unconfirmed' for reprocessing by the user.
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/reset-orphaned-confirmed-claims.ts
 */

import { db } from '@/db';
import { mainClaims, claimThesisMappings } from '@/db/schema';
import { eq, notInArray, and } from 'drizzle-orm';

async function resetOrphanedConfirmedClaims() {
  console.log('Finding confirmed claims without thesis/view links...\n');

  // Get all confirmed claims
  const confirmedClaims = await db
    .select()
    .from(mainClaims)
    .where(eq(mainClaims.status, 'confirmed'));

  console.log(`Found ${confirmedClaims.length} confirmed claims total`);

  if (confirmedClaims.length === 0) {
    console.log('No confirmed claims found. Exiting.');
    return;
  }

  // Get all claim IDs that have thesis/view mappings
  const linkedClaimIds = await db
    .selectDistinct({ claimId: claimThesisMappings.mainClaimId })
    .from(claimThesisMappings);

  const linkedIds = new Set(linkedClaimIds.map(row => row.claimId));

  // Find orphaned claims (confirmed but not linked)
  const orphanedClaims = confirmedClaims.filter(claim => !linkedIds.has(claim.id));

  console.log(`Found ${orphanedClaims.length} orphaned confirmed claims (no thesis/view links)\n`);

  if (orphanedClaims.length === 0) {
    console.log('All confirmed claims have proper links. No action needed.');
    return;
  }

  console.log('Orphaned claims:');
  orphanedClaims.forEach((claim, index) => {
    console.log(`  ${index + 1}. ${claim.title}`);
  });

  console.log(`\nResetting ${orphanedClaims.length} claims to 'unconfirmed' status...`);

  // Reset each orphaned claim
  for (const claim of orphanedClaims) {
    await db
      .update(mainClaims)
      .set({
        status: 'unconfirmed',
        updatedAt: new Date(),
      })
      .where(eq(mainClaims.id, claim.id));
  }

  console.log(`\n✅ Successfully reset ${orphanedClaims.length} orphaned claims to 'unconfirmed'`);
  console.log('These claims can now be reprocessed by users via the claims browser.');
}

resetOrphanedConfirmedClaims()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
