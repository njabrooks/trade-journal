#!/usr/bin/env tsx
/**
 * Dismiss specific triage records by ID.
 * Usage: npx tsx scripts/ops/dismiss-triage-ids.ts --ids id1,id2 --reason "reason"
 */
import { db, closeDb } from '../lib/db.js';
import { sql } from 'drizzle-orm';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_');
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ids) {
    console.error('Usage: --ids id1,id2 [--reason "reason"]');
    process.exit(1);
  }
  const ids = args.ids.split(',').map(s => s.trim());
  const reason = args.reason || 'Dismissed by Investment Analyst';

  console.log(`Dismissing ${ids.length} triage record(s): ${ids.join(', ')}`);
  console.log(`Reason: ${reason}`);

  try {
    for (const id of ids) {
      const result = await db.execute(
        sql`UPDATE triage_records SET status = 'done', updated_at = NOW() WHERE id = ${id}::uuid RETURNING id, symbol, recommended_action, status`
      );
      const rows = result as unknown as Array<{ id: string; symbol: string; recommended_action: string; status: string }>;
      if (rows.length > 0) {
        console.log(`  ✓ ${rows[0].symbol} ${rows[0].recommended_action} → ${rows[0].status}`);
      } else {
        console.log(`  ✗ Not found: ${id}`);
      }
    }
    console.log(JSON.stringify({ success: true, dismissed: ids }));
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
