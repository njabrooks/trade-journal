#!/usr/bin/env tsx
/**
 * The retrospective worklist (W8 — docs/v2/07 §4d, B7).
 *
 * Resolved theses (closed/complete/rejected) without a retrospective yet. The queue
 * the thesis-review skill (retrospective mode) writes "was I right, did it pay" for.
 *
 * Usage:
 *   npx tsx scripts/ops/find-theses-needing-retrospective.ts                 # worklist
 *   npx tsx scripts/ops/find-theses-needing-retrospective.ts --json
 *   npx tsx scripts/ops/find-theses-needing-retrospective.ts --context <id> --type asset|macro
 *                                                                              # retrospective inputs (P&L, duration, belief, signals)
 */
import { closeDb } from '../lib/db.js';
import { findThesesNeedingRetrospective, gatherRetrospectiveContext } from '@/lib/derived/retrospective';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; } else { args[key] = true; }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.context) {
    const thesisType = (args.type as string) === 'macro' ? 'macro' : 'asset';
    const ctx = await gatherRetrospectiveContext(args.context as string, thesisType);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const items = await findThesesNeedingRetrospective();

  if (args.json) {
    console.log(JSON.stringify({ count: items.length, items }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Retrospective worklist (resolved theses, no retrospective yet) ===`);
  console.log(`${items.length} theses awaiting a retrospective\n`);
  for (const t of items) {
    const tk = t.ticker ? ` (${t.ticker})` : '';
    console.log(`  [${t.status}] ${t.title}${tk}  id=${t.thesisId} (${t.thesisType})`);
  }
  if (items.length > 0) {
    console.log(`\nWrite each via the thesis-review skill (retrospective mode); inputs with --context <id> --type <asset|macro>.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
