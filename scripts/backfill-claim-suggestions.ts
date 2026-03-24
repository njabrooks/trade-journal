#!/usr/bin/env tsx

/**
 * Find and optionally generate thesis linkage suggestions for claims that lack them.
 *
 * Usage:
 *   npx tsx scripts/backfill-claim-suggestions.ts              # list unlinked claims without suggestions
 *   npx tsx scripts/backfill-claim-suggestions.ts --all        # include linked claims too
 *   npx tsx scripts/backfill-claim-suggestions.ts --execute    # actually generate suggestions via API
 */

// Load env vars BEFORE any @/db imports
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = dirname(__filename2);
config({ path: join(__dirname2, '..', '.env.local') });

async function main() {
  const { db } = await import('../src/db');
  const {
    mainClaims,
    claimThesisMappings,
    researchHierarchyRecommendations,
  } = await import('../src/db/schema');
  const { eq, and, sql, isNotNull } = await import('drizzle-orm');

  const args = process.argv.slice(2);
  const includeLinked = args.includes('--all');
  const execute = args.includes('--execute');
  const modelIdx = args.indexOf('--model');
  const modelArg = modelIdx !== -1 ? args[modelIdx + 1] : undefined;

  try {
    // Subquery: claims that already have thesis links
    const linkedClaimIds = db
      .selectDistinct({ id: claimThesisMappings.mainClaimId })
      .from(claimThesisMappings);

    // Subquery: claims that already have pending suggestions
    // Filter out NULL main_claim_id to avoid the SQL NOT IN + NULL trap
    const suggestedClaimIds = db
      .selectDistinct({ id: researchHierarchyRecommendations.mainClaimId })
      .from(researchHierarchyRecommendations)
      .where(
        and(
          eq(researchHierarchyRecommendations.status, 'pending'),
          isNotNull(researchHierarchyRecommendations.mainClaimId)
        )
      );

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
            isNotNull(mainClaims.sourceInsightId),
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
            isNotNull(mainClaims.sourceInsightId),
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
    console.log(`Mode: ${includeLinked ? 'all claims' : 'unlinked only'}${execute ? ' [EXECUTE]' : ' [DRY RUN]'}\n`);

    for (const [insightId, claims] of claimsByInsight) {
      console.log(`Insight ${insightId} (${claims.length} claims):`);
      for (const c of claims) {
        console.log(`  - [${c.category}/${c.qualifier}] ${c.title} (${c.status})`);
      }
      console.log();
    }

    if (!execute) {
      console.log(`Run with --execute to generate suggestions for these ${candidateClaims.length} claims.`);
      process.exit(0);
    }

    // Generate suggestions per insight batch
    const { generateClaimThesisSuggestions } = await import('../src/lib/services/claim-thesis-suggestions');
    const { getDefaultModel } = await import('../src/lib/services/ai-providers');
    type AIModel = Parameters<typeof generateClaimThesisSuggestions>[2];
    const model = (modelArg || getDefaultModel()) as AIModel;
    console.log(`Using model: ${model}\n`);

    let totalGenerated = 0;
    let batchIndex = 0;
    const totalBatches = claimsByInsight.size;

    for (const [insightId, claims] of claimsByInsight) {
      batchIndex++;
      const claimIds = claims.map(c => c.id);
      console.log(`[${batchIndex}/${totalBatches}] Generating suggestions for insight ${insightId} (${claimIds.length} claims)...`);

      try {
        const recommendationIds = await generateClaimThesisSuggestions(insightId, claimIds, model);
        totalGenerated += recommendationIds.length;
        console.log(`  → Created ${recommendationIds.length} suggestions`);
      } catch (error) {
        console.error(`  ✗ Failed for insight ${insightId}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`\nDone. Generated ${totalGenerated} suggestions across ${totalBatches} insights.`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
