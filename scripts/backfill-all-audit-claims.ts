#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from project root
config({ path: resolve(__dirname, '../.env.local') });

import { db } from '../src/db';
import { researchInsights } from '../src/db/schema';
import { isNotNull } from 'drizzle-orm';
import { autoPromoteAuditClaims } from '../src/db/queries/research';

/**
 * Backfill all existing audit claims to main_claims table
 *
 * This script:
 * 1. Finds all research_insights with claims_structure JSONB
 * 2. Runs auto-promotion for each insight
 * 3. Handles duplicates automatically (updates instead of creating)
 *
 * Usage:
 *   npx tsx scripts/backfill-all-audit-claims.ts
 */

async function main() {
  try {
    console.log('🔍 Finding all research insights with claims_structure...\n');

    // Find all insights with claims_structure
    const insights = await db
      .select({
        id: researchInsights.id,
        artifactId: researchInsights.researchArtifactId,
      })
      .from(researchInsights)
      .where(isNotNull(researchInsights.claimsStructure));

    console.log(`Found ${insights.length} research insights with claims\n`);

    if (insights.length === 0) {
      console.log('✅ No insights to process');
      process.exit(0);
    }

    let totalPromoted = 0;
    let totalUpdated = 0;
    let errors = 0;

    for (let i = 0; i < insights.length; i++) {
      const insight = insights[i];
      try {
        console.log(`[${i + 1}/${insights.length}] Processing insight ${insight.id}...`);

        const promotedCount = await autoPromoteAuditClaims(insight.id);

        if (promotedCount > 0) {
          totalPromoted += promotedCount;
          console.log(`  ✅ Promoted ${promotedCount} new claims`);
        } else {
          totalUpdated++;
          console.log(`  ℹ️  No new claims (already promoted or updated existing)`);
        }
      } catch (error) {
        errors++;
        console.error(`  ❌ Error processing insight ${insight.id}:`, error);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Backfill Summary:');
    console.log('='.repeat(60));
    console.log(`Total insights processed: ${insights.length}`);
    console.log(`New claims promoted: ${totalPromoted}`);
    console.log(`Insights already processed: ${totalUpdated}`);
    console.log(`Errors: ${errors}`);
    console.log('='.repeat(60));
    console.log('\n✅ Backfill complete!');
    console.log('\n→ View all claims at: /research/claims');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

main();
