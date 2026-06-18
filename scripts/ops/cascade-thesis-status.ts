#!/usr/bin/env tsx
/**
 * Run the W8 thesis-lifecycle cascade (docs/v2/07 §3) on demand.
 *
 * Expression-driven monitoring: derives asset/macro thesis status from strategy
 * status. This is the same `cascadeThesisStatuses` the post-ingestion recompute
 * calls (gated behind THESIS_CASCADE_ENABLED) — this script invokes it directly,
 * bypassing the env gate, for the supervised B3 first re-status and any later
 * manual spot-runs.
 *
 * Dry-run by DEFAULT — prints the full transition plan and writes nothing.
 * Pass --apply to actually write the status changes + journal entries.
 *
 * Usage:
 *   npx tsx scripts/ops/cascade-thesis-status.ts           # dry-run (default, safe)
 *   npx tsx scripts/ops/cascade-thesis-status.ts --apply   # apply the transitions
 *   npx tsx scripts/ops/cascade-thesis-status.ts --json    # machine-readable plan
 */
import { closeDb } from '../lib/db.js';
import { cascadeThesisStatuses, type CascadeTransition } from '@/lib/derived/thesisCascade';

function groupKey(t: CascadeTransition): string {
  return `${t.level}: ${t.from} → ${t.to}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');

  const res = await cascadeThesisStatuses({ dryRun: !apply, source: 'automation' });

  if (json) {
    console.log(JSON.stringify(res, null, 2));
    await closeDb();
    process.exit(0);
  }

  const mode = apply ? 'APPLY (writing changes)' : 'DRY-RUN (no changes written)';
  console.log(`\n=== Thesis lifecycle cascade — ${mode} ===`);
  console.log(`Examined: ${res.assetCount} cascade-eligible asset theses, ${res.macroCount} macro theses`);
  console.log(`Transitions: ${res.transitions.length}\n`);

  // Group by transition type, list every affected thesis under each group.
  const groups = new Map<string, CascadeTransition[]>();
  for (const t of res.transitions) {
    const k = groupKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  for (const [k, items] of [...groups.entries()].sort()) {
    console.log(`${k}  (${items.length})  — ${items[0].reason}`);
    for (const t of items.sort((a, b) => a.title.localeCompare(b.title))) {
      console.log(`    • ${t.title}`);
    }
    console.log('');
  }

  if (!apply && res.transitions.length > 0) {
    console.log('Re-run with --apply to write these transitions (status changes + journal entries).');
  }
  if (apply) {
    console.log(`✓ Applied ${res.transitions.length} transitions (logged to journal_entries, source=automation).`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
