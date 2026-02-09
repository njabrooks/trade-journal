#!/usr/bin/env tsx

/**
 * List unlinked claims that need thesis linkage suggestions.
 *
 * This script identifies claims that have no thesis links and no pending suggestions,
 * grouped by research insight. Use the output to guide Claude Code's inline analysis.
 *
 * Usage:
 *   npx tsx scripts/backfill-claim-suggestions.ts          # unlinked claims without suggestions
 *   npx tsx scripts/backfill-claim-suggestions.ts --all     # all claims without suggestions (even linked ones)
 *   npx tsx scripts/backfill-claim-suggestions.ts --dry-run # same as default (list only)
 */

// Load env vars BEFORE any @/db imports
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = dirname(__filename2);
config({ path: join(__dirname2, '..', '.env.local') });

async function main() {
  // Dynamic imports — env vars must be loaded before these
  const { db } = await import('../src/db');
  const {
    mainClaims,
    claimThesisMappings,
    researchHierarchyRecommendations,
  } = await import('../src/db/schema');
  const { eq, and, sql } = await import('drizzle-orm');

  const args = process.argv.slice(2);
  const includeLinked = args.includes('--all');

  try {
    // Subquery: claims that already have thesis links
    const linkedClaimIds = db
      .selectDistinct({ id: claimThesisMappings.mainClaimId })
      .from(claimThesisMappings);

    // Subquery: claims that already have pending suggestions
    const suggestedClaimIds = db
      .selectDistinct({ id: researchHierarchyRecommendations.mainClaimId })
      .from(researchHierarchyRecommendations)
      .where(eq(researchHierarchyRecommendations.status, 'pending'));

    let candidateClaims;
    if (includeLinked) {
      candidateClaims = await db
        .select({
          id: mainClaims.id,
          sourceInsightId: mainClaims.sourceInsightId,
          title: mainClaims.title,
          status: mainClaims.status,
          category: mainClaims.category,
          qualifier: mainClaims.qualifier,
        })
        .from(mainClaims)
        .where(
          and(
            sql`${mainClaims.sourceInsightId} IS NOT NULL`,
            sql`${mainClaims.id} NOT IN (${suggestedClaimIds})`,
            sql`${mainClaims.status} IN ('draft', 'active')`
          )
        );
    } else {
      candidateClaims = await db
        .select({
          id: mainClaims.id,
          sourceInsightId: mainClaims.sourceInsightId,
          title: mainClaims.title,
          status: mainClaims.status,
          category: mainClaims.category,
          qualifier: mainClaims.qualifier,
        })
        .from(mainClaims)
        .where(
          and(
            sql`${mainClaims.sourceInsightId} IS NOT NULL`,
            sql`${mainClaims.id} NOT IN (${linkedClaimIds})`,
            sql`${mainClaims.id} NOT IN (${suggestedClaimIds})`,
            sql`${mainClaims.status} IN ('draft', 'active')`
          )
        );
    }

    if (candidateClaims.length === 0) {
      console.log('No claims need suggestion generation.');
      process.exit(0);
    }

    // Group by sourceInsightId
    const claimsByInsight = new Map<string, typeof candidateClaims>();
    for (const claim of candidateClaims) {
      const insightId = claim.sourceInsightId!;
      if (!claimsByInsight.has(insightId)) {
        claimsByInsight.set(insightId, []);
      }
      claimsByInsight.get(insightId)!.push(claim);
    }

    console.log(`Found ${candidateClaims.length} claims across ${claimsByInsight.size} research insights`);
    console.log(`Mode: ${includeLinked ? 'all claims' : 'unlinked only'}\n`);

    for (const [insightId, claims] of claimsByInsight) {
      console.log(`Insight ${insightId} (${claims.length} claims):`);
      for (const c of claims) {
        console.log(`  - [${c.category}/${c.qualifier}] ${c.title} (${c.status})`);
      }
      console.log();
    }

    console.log('To generate suggestions, ask Claude Code to analyze these claims against active theses.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
