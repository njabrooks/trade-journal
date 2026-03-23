/**
 * Evaluate pending intel items against the belief hierarchy.
 *
 * Lifecycle-aware routing:
 * - Monitoring theses → score against signals → write signal evidence
 * - Developing theses → flag rich content as claim candidates via triage
 * - All theses → contextual intel linking
 *
 * Usage:
 *   npx tsx scripts/evaluate-intel-items.ts                  # Process up to 100 pending items
 *   npx tsx scripts/evaluate-intel-items.ts --limit 500      # Process up to 500
 *   npx tsx scripts/evaluate-intel-items.ts --dry-run        # Preview without writing
 */

import { db, closeDb } from './lib/db.js';
import { evaluatePendingIntelItems } from '../src/lib/intelligence/evaluate.js';

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 100;
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('DRY RUN — no changes will be written');
    // For dry run, just count pending items
    const { intelItems } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const pending = await db
      .select({ id: intelItems.id })
      .from(intelItems)
      .where(eq(intelItems.processingStatus, 'pending'))
      .limit(limit);
    console.log(`Would process ${pending.length} pending intel items`);
    await closeDb();
    process.exit(0);
  }

  console.log(`Evaluating up to ${limit} pending intel items...`);
  const result = await evaluatePendingIntelItems(limit, db);

  console.log(`\nResults:`);
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Signal evidence: ${result.signalEvidence}`);
  console.log(`  Contextual: ${result.contextual}`);
  console.log(`  Claim candidates: ${result.claimCandidates}`);
  console.log(`  Skipped: ${result.skipped}`);

  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
