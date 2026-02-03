/**
 * Cleanup script for triage bugs (2026-02-03)
 *
 * Identifies and fixes data artifacts from:
 * 1. Triage records for rejected strategies
 * 2. Duplicate draft strategies (crypto positions creating new strategies instead of linking)
 * 3. Orphaned CONFIRM_STRATEGY triggers for already-confirmed strategies
 *
 * Usage:
 *   npx tsx scripts/cleanup-triage-bugs.ts --dry-run    # Preview changes
 *   npx tsx scripts/cleanup-triage-bugs.ts --execute    # Apply changes
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, inArray, sql, isNull, ne, isNotNull } from 'drizzle-orm';

const { strategies, positions, triageRecords, trades } = schema;

interface DuplicateStrategy {
  draftId: string;
  draftKey: string;
  draftPositionCount: number;
  confirmedId: string;
  confirmedKey: string;
  confirmedPositionCount: number;
  symbol: string;
  assetClass: string;
}

async function findTriageRecordsForRejectedStrategies(): Promise<{
  count: number;
  records: { id: string; strategyId: string; ruleSet: string; snapshotDate: string }[];
}> {
  console.log('\n=== 1. Triage Records for Rejected Strategies ===\n');

  const rejectedStrategyIds = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(eq(strategies.status, 'rejected'));

  if (rejectedStrategyIds.length === 0) {
    console.log('No rejected strategies found.');
    return { count: 0, records: [] };
  }

  const ids = rejectedStrategyIds.map(s => s.id);

  const orphanedRecords = await db
    .select({
      id: triageRecords.id,
      strategyId: triageRecords.strategyId,
      ruleSet: triageRecords.ruleSet,
      snapshotDate: triageRecords.snapshotDate,
    })
    .from(triageRecords)
    .where(
      and(
        inArray(triageRecords.strategyId, ids),
        inArray(triageRecords.ruleSet, ['quantity_change_v1', 'trade_ingestion_v1', 'strategy_workflow'])
      )
    );

  console.log(`Found ${orphanedRecords.length} triage records for ${rejectedStrategyIds.length} rejected strategies`);

  if (orphanedRecords.length > 0) {
    console.log('\nSample records:');
    orphanedRecords.slice(0, 5).forEach(r => {
      console.log(`  - ${r.ruleSet} for strategy ${r.strategyId?.slice(0, 8)}... on ${r.snapshotDate}`);
    });
    if (orphanedRecords.length > 5) {
      console.log(`  ... and ${orphanedRecords.length - 5} more`);
    }
  }

  return { count: orphanedRecords.length, records: orphanedRecords as { id: string; strategyId: string; ruleSet: string; snapshotDate: string }[] };
}

async function findDuplicateCryptoStrategies(): Promise<DuplicateStrategy[]> {
  console.log('\n=== 2. Duplicate Crypto/Perp Strategies ===\n');

  // Find all crypto/perp strategies with their position counts
  // Use raw SQL for the LIKE clause to avoid template issues
  const cryptoStrategies = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      status: strategies.status,
      isAuto: strategies.isAuto,
      confirmedAt: strategies.confirmedAt,
      accountId: strategies.accountId,
      createdAt: strategies.createdAt,
    })
    .from(strategies)
    .where(
      and(
        sql`(${strategies.strategyKey} LIKE '%-CRYPTO' OR ${strategies.strategyKey} LIKE '%-PERP')`,
        ne(strategies.status, 'merged'),
        ne(strategies.status, 'rejected')
      )
    )
    .orderBy(strategies.strategyKey, strategies.createdAt);

  console.log(`Found ${cryptoStrategies.length} crypto/perp strategies (excluding merged/rejected)`);

  // Group by accountId + symbol (extract from strategyKey)
  const byAccountSymbol = new Map<string, typeof cryptoStrategies>();

  for (const s of cryptoStrategies) {
    const symbol = s.strategyKey.replace(/-CRYPTO$/, '').replace(/-PERP$/, '');
    const assetClass = s.strategyKey.endsWith('-CRYPTO') ? 'CRYPTO' : 'PERP';
    const key = `${s.accountId}:${symbol}:${assetClass}`;

    if (!byAccountSymbol.has(key)) {
      byAccountSymbol.set(key, []);
    }
    byAccountSymbol.get(key)!.push(s);
  }

  // Find duplicates: groups with BOTH (confirmed OR active) AND draft strategies
  const duplicates: DuplicateStrategy[] = [];

  for (const [key, group] of byAccountSymbol.entries()) {
    // "Confirmed" means either confirmedAt is set OR status is active/complete (user has acted on it)
    const confirmed = group.filter(s =>
      s.confirmedAt != null || s.status === 'active' || s.status === 'complete'
    );
    // "Draft" means auto-derived, not confirmed, status is draft
    const drafts = group.filter(s =>
      s.isAuto && s.confirmedAt == null && s.status === 'draft'
    );

    if (confirmed.length > 0 && drafts.length > 0) {
      // Get position counts
      for (const draft of drafts) {
        const [draftPositions] = await db
          .select({ count: sql<number>`count(*)` })
          .from(positions)
          .where(eq(positions.strategyId, draft.id));

        // Link to the first confirmed strategy (prefer active over complete)
        const targetConfirmed = confirmed.sort((a, b) => {
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (b.status === 'active' && a.status !== 'active') return 1;
          return 0;
        })[0];

        const [confPositions] = await db
          .select({ count: sql<number>`count(*)` })
          .from(positions)
          .where(eq(positions.strategyId, targetConfirmed.id));

        const [, symbol, assetClass] = key.split(':');

        duplicates.push({
          draftId: draft.id,
          draftKey: draft.strategyKey,
          draftPositionCount: Number(draftPositions.count),
          confirmedId: targetConfirmed.id,
          confirmedKey: targetConfirmed.strategyKey,
          confirmedPositionCount: Number(confPositions.count),
          symbol,
          assetClass,
        });
      }
    }
  }

  console.log(`Found ${duplicates.length} duplicate strategy pairs (draft alongside confirmed/active)`);

  if (duplicates.length > 0) {
    console.log('\nDuplicate pairs to merge:');
    duplicates.forEach(d => {
      console.log(`  ${d.symbol} (${d.assetClass}):`);
      console.log(`    Draft:     ${d.draftKey} (${d.draftPositionCount} positions) - ${d.draftId.slice(0, 8)}...`);
      console.log(`    Target:    ${d.confirmedKey} (${d.confirmedPositionCount} positions) - ${d.confirmedId.slice(0, 8)}...`);
    });
  }

  return duplicates;
}

async function findOrphanedConfirmStrategyTriggers(): Promise<{
  count: number;
  records: { id: string; strategyId: string; strategyKey: string; snapshotDate: string }[];
}> {
  console.log('\n=== 3. CONFIRM_STRATEGY Triggers for Already-Confirmed Strategies ===\n');

  // Find CONFIRM_STRATEGY triggers where the strategy is already confirmed
  const orphanedTriggers = await db
    .select({
      id: triageRecords.id,
      strategyId: triageRecords.strategyId,
      strategyKey: strategies.strategyKey,
      snapshotDate: triageRecords.snapshotDate,
      confirmedAt: strategies.confirmedAt,
    })
    .from(triageRecords)
    .innerJoin(strategies, eq(triageRecords.strategyId, strategies.id))
    .where(
      and(
        eq(triageRecords.recommendedAction, 'CONFIRM_STRATEGY'),
        eq(triageRecords.status, 'inbox'),
        isNotNull(strategies.confirmedAt)
      )
    );

  console.log(`Found ${orphanedTriggers.length} CONFIRM_STRATEGY triggers for already-confirmed strategies`);

  if (orphanedTriggers.length > 0) {
    console.log('\nOrphaned triggers:');
    orphanedTriggers.slice(0, 10).forEach(t => {
      console.log(`  - ${t.strategyKey} on ${t.snapshotDate} (confirmed at ${t.confirmedAt})`);
    });
    if (orphanedTriggers.length > 10) {
      console.log(`  ... and ${orphanedTriggers.length - 10} more`);
    }
  }

  return {
    count: orphanedTriggers.length,
    records: orphanedTriggers.map(t => ({
      id: t.id,
      strategyId: t.strategyId!,
      strategyKey: t.strategyKey,
      snapshotDate: t.snapshotDate,
    }))
  };
}

async function executeCleanup(
  rejectedStrategyTriage: { id: string }[],
  duplicates: DuplicateStrategy[],
  orphanedConfirmTriggers: { id: string }[]
): Promise<void> {
  console.log('\n=== Executing Cleanup ===\n');

  // 1. Delete triage records for rejected strategies
  if (rejectedStrategyTriage.length > 0) {
    const ids = rejectedStrategyTriage.map(r => r.id);
    await db.delete(triageRecords).where(inArray(triageRecords.id, ids));
    console.log(`✓ Deleted ${ids.length} triage records for rejected strategies`);
  }

  // 2. Merge duplicate strategies (re-link positions and trades from draft to confirmed)
  for (const dup of duplicates) {
    // Re-link positions from draft to confirmed
    const positionResult = await db
      .update(positions)
      .set({ strategyId: dup.confirmedId })
      .where(eq(positions.strategyId, dup.draftId));

    // Re-link trades from draft to confirmed
    const tradeResult = await db
      .update(trades)
      .set({ strategyId: dup.confirmedId })
      .where(eq(trades.strategyId, dup.draftId));

    // Mark draft strategy as merged
    await db
      .update(strategies)
      .set({
        status: 'merged',
        updatedAt: new Date(),
      })
      .where(eq(strategies.id, dup.draftId));

    // Delete triage records for the draft strategy
    await db
      .delete(triageRecords)
      .where(eq(triageRecords.strategyId, dup.draftId));

    console.log(`✓ Merged ${dup.symbol} draft → confirmed (re-linked positions/trades, marked draft as merged)`);
  }

  // 3. Delete orphaned CONFIRM_STRATEGY triggers
  if (orphanedConfirmTriggers.length > 0) {
    const ids = orphanedConfirmTriggers.map(r => r.id);
    await db.delete(triageRecords).where(inArray(triageRecords.id, ids));
    console.log(`✓ Deleted ${ids.length} orphaned CONFIRM_STRATEGY triggers`);
  }

  console.log('\n✓ Cleanup complete!');
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isExecute = args.includes('--execute');

  if (!isDryRun && !isExecute) {
    console.log('Usage:');
    console.log('  npx tsx scripts/cleanup-triage-bugs.ts --dry-run    # Preview changes');
    console.log('  npx tsx scripts/cleanup-triage-bugs.ts --execute    # Apply changes');
    await closeDb();
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(isDryRun ? 'DRY RUN - No changes will be made' : 'EXECUTE MODE - Changes will be applied');
  console.log('='.repeat(60));

  try {
    // 1. Find triage records for rejected strategies
    const rejectedTriage = await findTriageRecordsForRejectedStrategies();

    // 2. Find duplicate crypto strategies
    const duplicates = await findDuplicateCryptoStrategies();

    // 3. Find orphaned CONFIRM_STRATEGY triggers
    const orphanedTriggers = await findOrphanedConfirmStrategyTriggers();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nIssues found:`);
    console.log(`  1. Triage records for rejected strategies: ${rejectedTriage.count}`);
    console.log(`  2. Duplicate crypto/perp strategy pairs: ${duplicates.length}`);
    console.log(`  3. Orphaned CONFIRM_STRATEGY triggers: ${orphanedTriggers.count}`);

    const totalIssues = rejectedTriage.count + duplicates.length + orphanedTriggers.count;

    if (totalIssues === 0) {
      console.log('\n✓ No issues found! Database is clean.');
    } else if (isDryRun) {
      console.log(`\nRun with --execute to fix ${totalIssues} issues.`);
    } else {
      // Execute cleanup
      await executeCleanup(
        rejectedTriage.records,
        duplicates,
        orphanedTriggers.records
      );
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
