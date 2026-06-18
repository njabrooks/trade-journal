#!/usr/bin/env tsx
/**
 * The delta-triggered digest worklist (W8 — docs/v2/07 §4a, B4).
 *
 * Lists developing theses whose supporting digest should be (re)synthesized
 * because they've accumulated ≥ K new linked claims since the last articulation.
 * This is the queue the thesis-review skill (digest mode) processes.
 *
 * Usage:
 *   npx tsx scripts/ops/find-stale-digests.ts                       # worklist (K=3)
 *   npx tsx scripts/ops/find-stale-digests.ts --k 2                 # custom threshold
 *   npx tsx scripts/ops/find-stale-digests.ts --json                # machine-readable worklist
 *   npx tsx scripts/ops/find-stale-digests.ts --context <id> --type asset|macro
 *                                                                    # dump one thesis's synthesis bundle (JSON)
 */
import { closeDb } from '../lib/db.js';
import {
  findThesesNeedingDigestRefresh,
  gatherDigestContext,
  DIGEST_REFRESH_DELTA_K,
} from '@/lib/derived/digestSynthesis';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --context mode: dump the synthesis bundle for one thesis.
  if (args.context) {
    const thesisType = (args.type as string) === 'macro' ? 'macro' : 'asset';
    const ctx = await gatherDigestContext(args.context as string, thesisType);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const k = args.k ? Number(args.k) : DIGEST_REFRESH_DELTA_K;
  const worklist = await findThesesNeedingDigestRefresh(k);

  if (args.json) {
    console.log(JSON.stringify({ k, count: worklist.length, worklist }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Digest refresh worklist (K=${k}) ===`);
  console.log(`${worklist.length} developing theses need a (re)synthesized digest\n`);
  for (const t of worklist) {
    const kind = t.hasArticulation ? `refresh v${t.latestVersion}→v${(t.latestVersion ?? 0) + 1}` : 'first digest';
    console.log(
      `  [${t.thesisType}] ${t.title}\n` +
        `      claims ${t.currentClaimCount} (last digest @ ${t.claimsCountAtLastArticulation}, +${t.delta} new) — ${kind}\n` +
        `      id=${t.thesisId}`,
    );
  }
  if (worklist.length > 0) {
    console.log(`\nSynthesize each via the thesis-review skill; dump a bundle with --context <id> --type <asset|macro>.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
