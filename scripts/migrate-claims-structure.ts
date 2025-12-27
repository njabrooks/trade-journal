/**
 * Migration Script: Transform existing research_insights to hierarchical claims structure
 *
 * Purpose:
 * - Transform old flat JSONB structure (key_claims, supporting_evidence, counter_evidence)
 * - To new hierarchical Toulmin structure (claims_structure)
 * - Preserves existing data in old columns for rollback safety
 *
 * Usage:
 *   npx tsx scripts/migrate-claims-structure.ts [--dry-run] [--limit=N]
 *
 * Options:
 *   --dry-run: Preview changes without writing to database
 *   --limit=N: Only process first N insights (for testing)
 *   --force: Skip confirmation prompt
 */

// Load .env.local BEFORE any imports
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Now import database modules
import { db } from '@/db';
import { researchInsights } from '@/db/schema';
import { eq, isNull } from 'drizzle-orm';

// ============================================================================
// Type Definitions
// ============================================================================

interface MainClaim {
  id: string;
  level: 'main';
  type: 'thesis_candidate' | 'view_candidate';
  category: 'macro' | 'asset_specific';
  claim: string;
  grounds: string;
  warrant: string;
  backing: string;
  qualifier: 'high' | 'medium' | 'low' | 'exploratory';
  rebuttal: string;
  time_horizon?: 'long_term' | 'medium_term' | 'short_term';
  relevant_tickers?: string[];
  supporting_evidence_claims: string[];
  rebutting_evidence_claims: string[];
  converted_to: null | {
    type: 'macro_thesis' | 'asset_view';
    id: string;
    converted_at: string;
  };
}

interface EvidenceClaim {
  id: string;
  level: 'evidence';
  type: 'supporting' | 'rebutting';
  claim: string;
  grounds?: string;
  confidence: 'high' | 'medium' | 'low';
  supports_main_claims: string[];
}

interface ClaimsStructure {
  main_claims: MainClaim[];
  evidence_claims: EvidenceClaim[];
  metadata: {
    extraction_date: string;
    source_skill: string;
    toulmin_version: string;
  };
}

// ============================================================================
// Transformation Logic
// ============================================================================

function transformToClaimsStructure(
  oldClaims: any,
  oldSupporting: any,
  oldCounter: any,
  insight: any
): ClaimsStructure {
  const mainClaims: MainClaim[] = [];
  const evidenceClaims: EvidenceClaim[] = [];

  // Transform main claims from key_claims
  const claimsArray = Array.isArray(oldClaims) ? oldClaims : oldClaims?.claims || [];

  claimsArray.forEach((c: any, idx: number) => {
    const claimId = `claim-${idx + 1}`;

    mainClaims.push({
      id: claimId,
      level: 'main',
      type: inferClaimType(c, insight),
      category: inferCategory(c, insight),
      claim: c.claim || c.text || '',
      grounds: c.evidence || c.grounds || '',
      warrant: c.reasoning || c.warrant || '',
      backing: c.backing || '',
      qualifier: normalizeConfidence(c.confidence),
      rebuttal: c.rebuttal || '',
      time_horizon: c.time_horizon || insight.timeHorizon || undefined,
      relevant_tickers: c.tickers || extractTickers(c, insight),
      supporting_evidence_claims: [], // Cannot infer from flat structure
      rebutting_evidence_claims: [], // Cannot infer from flat structure
      converted_to: null,
    });
  });

  // Transform supporting evidence
  const supportingArray = Array.isArray(oldSupporting) ? oldSupporting : [];
  supportingArray.forEach((e: any, idx: number) => {
    evidenceClaims.push({
      id: `evidence-s-${idx + 1}`,
      level: 'evidence',
      type: 'supporting',
      claim: e.evidence || e.claim || e.text || '',
      grounds: e.details || e.grounds || undefined,
      confidence: normalizeConfidence(e.confidence),
      supports_main_claims: [], // Cannot infer without explicit links
    });
  });

  // Transform counter evidence
  const counterArray = Array.isArray(oldCounter) ? oldCounter : [];
  counterArray.forEach((e: any, idx: number) => {
    evidenceClaims.push({
      id: `evidence-r-${idx + 1}`,
      level: 'evidence',
      type: 'rebutting',
      claim: e.evidence || e.claim || e.text || '',
      grounds: e.details || e.grounds || undefined,
      confidence: normalizeConfidence(e.confidence),
      supports_main_claims: [], // Cannot infer without explicit links
    });
  });

  return {
    main_claims: mainClaims,
    evidence_claims: evidenceClaims,
    metadata: {
      extraction_date: insight.createdAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      source_skill: 'migration',
      toulmin_version: '1.0',
    },
  };
}

// Helper: Infer claim type (thesis vs view)
function inferClaimType(claim: any, insight: any): 'thesis_candidate' | 'view_candidate' {
  // If claim has tickers or insight has tickers, likely a view
  const hasTickers = claim.tickers?.length > 0 || insight.relevantTickers?.length > 0;

  // If claim text mentions specific ticker symbols (1-5 uppercase letters)
  const tickerPattern = /\b[A-Z]{1,5}\b/g;
  const mentionsTickers = (claim.claim || '').match(tickerPattern)?.length > 0;

  return (hasTickers || mentionsTickers) ? 'view_candidate' : 'thesis_candidate';
}

// Helper: Infer category (macro vs asset_specific)
function inferCategory(claim: any, insight: any): 'macro' | 'asset_specific' {
  const type = inferClaimType(claim, insight);
  return type === 'view_candidate' ? 'asset_specific' : 'macro';
}

// Helper: Extract tickers from claim or insight
function extractTickers(claim: any, insight: any): string[] | undefined {
  const tickers = claim.tickers || insight.relevantTickers;
  return tickers && tickers.length > 0 ? tickers : undefined;
}

// Helper: Normalize confidence levels
function normalizeConfidence(conf: any): 'high' | 'medium' | 'low' | 'exploratory' {
  if (!conf) return 'medium';

  const normalized = String(conf).toLowerCase();

  if (normalized.includes('high') || normalized === 'strong') return 'high';
  if (normalized.includes('low') || normalized === 'weak') return 'low';
  if (normalized.includes('exploratory') || normalized === 'speculative') return 'exploratory';

  return 'medium';
}

// ============================================================================
// Migration Execution
// ============================================================================

interface MigrationStats {
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ insightId: string; error: string }>;
}

async function runMigration(options: {
  dryRun: boolean;
  limit?: number;
  force: boolean;
}): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  console.log('\n🔄 Research Insights Claims Structure Migration');
  console.log('================================================\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be written to database\n');
  }

  // Fetch insights that need migration (claims_structure is NULL)
  console.log('📊 Fetching insights to migrate...');

  let query = db
    .select()
    .from(researchInsights)
    .where(isNull(researchInsights.claimsStructure));

  if (options.limit) {
    query = query.limit(options.limit) as any;
  }

  const insights = await query;
  stats.total = insights.length;

  console.log(`Found ${stats.total} insight(s) to migrate\n`);

  if (stats.total === 0) {
    console.log('✅ All insights already migrated!');
    return stats;
  }

  // Confirmation prompt (unless --force)
  if (!options.force && !options.dryRun) {
    console.log('⚠️  This will modify the database.');
    console.log('   Press Ctrl+C to cancel, or continue in 3 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Process each insight
  console.log('Processing insights:\n');

  for (const insight of insights) {
    stats.processed++;

    try {
      const oldClaims = insight.keyClaims as any;
      const oldSupporting = insight.supportingEvidence as any;
      const oldCounter = insight.counterEvidence as any;

      // Skip if no claims to migrate
      if (!oldClaims && !oldSupporting && !oldCounter) {
        console.log(`⊘ [${stats.processed}/${stats.total}] ${insight.id} - No claims data, skipping`);
        stats.skipped++;
        continue;
      }

      // Transform to new structure
      const newStructure = transformToClaimsStructure(
        oldClaims,
        oldSupporting,
        oldCounter,
        insight
      );

      const mainCount = newStructure.main_claims.length;
      const evidenceCount = newStructure.evidence_claims.length;

      if (options.dryRun) {
        console.log(
          `✓ [${stats.processed}/${stats.total}] ${insight.id} - Would migrate ` +
          `${mainCount} main claim(s), ${evidenceCount} evidence claim(s)`
        );
        stats.migrated++;
      } else {
        // Write to database
        await db
          .update(researchInsights)
          .set({ claimsStructure: newStructure as any })
          .where(eq(researchInsights.id, insight.id));

        console.log(
          `✓ [${stats.processed}/${stats.total}] ${insight.id} - Migrated ` +
          `${mainCount} main claim(s), ${evidenceCount} evidence claim(s)`
        );
        stats.migrated++;
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `✗ [${stats.processed}/${stats.total}] ${insight.id} - Failed: ${errorMsg}`
      );
      stats.failed++;
      stats.errors.push({
        insightId: insight.id,
        error: errorMsg,
      });
    }
  }

  return stats;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    limit: undefined as number | undefined,
  };

  // Parse --limit=N
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  if (limitArg) {
    options.limit = parseInt(limitArg.split('=')[1], 10);
    if (isNaN(options.limit)) {
      console.error('❌ Invalid --limit value');
      process.exit(1);
    }
  }

  try {
    const stats = await runMigration(options);

    // Print summary
    console.log('\n================================================');
    console.log('Migration Summary');
    console.log('================================================\n');
    console.log(`Total insights:     ${stats.total}`);
    console.log(`Processed:          ${stats.processed}`);
    console.log(`Migrated:           ${stats.migrated}`);
    console.log(`Skipped (no data):  ${stats.skipped}`);
    console.log(`Failed:             ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach(({ insightId, error }) => {
        console.log(`   ${insightId}: ${error}`);
      });
    }

    if (options.dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made');
      console.log('   Run without --dry-run to apply migration');
    } else if (stats.migrated > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Verify migrated data in database');
      console.log('2. Test upload workflow with new structure');
      console.log('3. Update UI components to use claims_structure');
    }

    process.exit(stats.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { transformToClaimsStructure, runMigration };
