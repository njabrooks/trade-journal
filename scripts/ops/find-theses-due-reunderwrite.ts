#!/usr/bin/env tsx
/**
 * The re-underwrite-due worklist (W8.x — docs/v2/10).
 *
 * Already-underwritten asset OR macro theses that have accumulated material new evidence
 * since their latest articulation version (>= threshold new claims, or >= 1 new refuting
 * claim). The maintenance / thesis skills consume this and raise a `re_underwrite_due`
 * DecisionStrip item; the user resolves it with a `/thesis <X>` re-underwrite.
 *
 * Claim-delta based ⇒ covers macro theses (no ticker needed), closing the macro side of
 * the re-underwrite loop.
 *
 * Usage:
 *   npx tsx scripts/ops/find-theses-due-reunderwrite.ts                 # worklist (default threshold 5)
 *   npx tsx scripts/ops/find-theses-due-reunderwrite.ts --threshold 8
 *   npx tsx scripts/ops/find-theses-due-reunderwrite.ts --json
 */
import { closeDb } from '../lib/db.js';
import { findThesesDueForReunderwrite, DEFAULT_REUNDERWRITE_THRESHOLD } from '@/lib/derived/reunderwriteDue';

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
  const threshold = args.threshold ? parseInt(args.threshold as string, 10) : DEFAULT_REUNDERWRITE_THRESHOLD;

  const due = await findThesesDueForReunderwrite(threshold);

  if (args.json) {
    console.log(JSON.stringify({ count: due.length, threshold, due }, null, 2));
  } else {
    console.log(`Re-underwrite-due worklist (threshold ${threshold}): ${due.length} thesis(es)\n`);
    for (const d of due) {
      console.log(`  [${d.thesisType}] ${d.title} (${d.status}) — v${d.lastVersion} → ${d.reason}`);
      console.log(`        claims ${d.claimsAtLastArticulation} → ${d.currentClaims}  | new refutes: ${d.newRefutes}  | id ${d.thesisId}`);
    }
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
