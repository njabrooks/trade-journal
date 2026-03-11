#!/usr/bin/env tsx

/**
 * Triage cleanup & maintenance script
 *
 * Performs P0 cleanup tasks:
 *   1. Deletes legacy PROVIDE_STRATEGY_METADATA records (dead action type)
 *   2. Fixes null severity on QUANTITY_CHANGE records (sets to 'info')
 *   3. Audits CONFIRM_STRATEGY coverage (finds strategies missing confirmation triage)
 *   4. Archives old done records (configurable retention)
 *
 * Usage:
 *   npx tsx scripts/ops/triage-cleanup.ts [--retention-days 30] [--dry-run]
 */

import { db, closeDb } from '../lib/db.js';
import { sql } from 'drizzle-orm';

// postgres-js driver returns results as arrays, not { rows: [...] }
type CountRow = { count: string };
type StrategyRow = { id: string; strategy_key: string; created_at: string };

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
      // Handle flags without values (like --dry-run)
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = argv[i + 1];
        i++;
      }
    }
  }
  return args;
}

function getCount(result: unknown): number {
  const rows = result as CountRow[];
  return parseInt(rows[0]?.count || '0', 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const retentionDays = parseInt(args.retention_days || '30', 10);
  const dryRun = 'dry_run' in args;

  console.log(`Triage cleanup${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Retention: ${retentionDays} days\n`);

  try {
    // 1. Count & delete PROVIDE_STRATEGY_METADATA (legacy dead action)
    const legacyCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM triage_records WHERE recommended_action = 'PROVIDE_STRATEGY_METADATA'`
    );
    const legacyTotal = getCount(legacyCount);
    console.log(`[P0.1] PROVIDE_STRATEGY_METADATA records: ${legacyTotal}`);

    if (legacyTotal > 0 && !dryRun) {
      await db.execute(
        sql`DELETE FROM triage_records WHERE recommended_action = 'PROVIDE_STRATEGY_METADATA'`
      );
      console.log(`  → Deleted ${legacyTotal} legacy records`);
    }

    // 2. Fix null severity on QUANTITY_CHANGE records
    const nullSeverityCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM triage_records WHERE severity IS NULL AND recommended_action = 'QUANTITY_CHANGE'`
    );
    const nullTotal = getCount(nullSeverityCount);
    console.log(`\n[P0.2] QUANTITY_CHANGE records with null severity: ${nullTotal}`);

    if (nullTotal > 0 && !dryRun) {
      await db.execute(
        sql`UPDATE triage_records SET severity = 'info', updated_at = NOW() WHERE severity IS NULL AND recommended_action = 'QUANTITY_CHANGE'`
      );
      console.log(`  → Fixed ${nullTotal} records (set severity to 'info')`);
    }

    // 3. Audit CONFIRM_STRATEGY coverage
    const missingConfirm = await db.execute(
      sql`
        SELECT s.id, s.strategy_key, s.created_at::text
        FROM strategies s
        WHERE s.is_auto = true
          AND s.confirmed_at IS NULL
          AND s.status NOT IN ('rejected', 'complete')
          AND NOT EXISTS (
            SELECT 1 FROM triage_records tr
            WHERE tr.strategy_id = s.id
              AND tr.recommended_action = 'CONFIRM_STRATEGY'
          )
        ORDER BY s.created_at DESC
      `
    );
    const missingRows = missingConfirm as unknown as StrategyRow[];
    console.log(`\n[P0.3] Unconfirmed auto-strategies WITHOUT CONFIRM_STRATEGY triage: ${missingRows.length}`);
    for (const row of missingRows) {
      console.log(`  - ${row.strategy_key} (${row.id}) created ${row.created_at}`);
    }

    // 4. Archive old done records
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString();

    const oldDoneCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM triage_records WHERE status = 'done' AND updated_at < ${cutoffStr}::timestamptz`
    );
    const oldDoneTotal = getCount(oldDoneCount);
    console.log(`\n[P1.3] Done records older than ${retentionDays} days: ${oldDoneTotal}`);

    if (oldDoneTotal > 0 && !dryRun) {
      await db.execute(
        sql`DELETE FROM triage_records WHERE status = 'done' AND updated_at < ${cutoffStr}::timestamptz`
      );
      console.log(`  → Archived (deleted) ${oldDoneTotal} old done records`);
    }

    // Summary
    const totalCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM triage_records`
    );
    const inboxCount = await db.execute(
      sql`SELECT COUNT(*) as count FROM triage_records WHERE status = 'inbox'`
    );
    console.log(`\n--- Summary ---`);
    console.log(`Total triage records remaining: ${getCount(totalCount)}`);
    console.log(`Inbox records: ${getCount(inboxCount)}`);

    if (dryRun) {
      console.log(`\nDry run complete. Re-run without --dry-run to apply changes.`);
    }

    console.log(JSON.stringify({
      success: true,
      legacyDeleted: dryRun ? 0 : legacyTotal,
      nullSeverityFixed: dryRun ? 0 : nullTotal,
      missingConfirmStrategy: missingRows.length,
      oldDoneArchived: dryRun ? 0 : oldDoneTotal,
    }));
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
