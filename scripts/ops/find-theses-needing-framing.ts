#!/usr/bin/env tsx
/**
 * The asset→macro framing worklist (C5a — docs/v2/09 §7; 08 outstanding #4).
 *
 * Live asset theses with NO macro link — candidates for framing. The thesis-review
 * skill (framing mode) judges which macro genuinely frames each (if any): a
 * high-confidence `related` auto-links via link-asset-macro; `gated_by` or an
 * uncertain match raises a classify_macro_link decision.
 *
 * Usage:
 *   npx tsx scripts/ops/find-theses-needing-framing.ts                 # worklist
 *   npx tsx scripts/ops/find-theses-needing-framing.ts --json
 *   npx tsx scripts/ops/find-theses-needing-framing.ts --context <assetThesisId>
 *                                                                       # asset + macro catalog to judge against
 */
import { closeDb } from '../lib/db.js';
import { findThesesNeedingFraming, gatherFramingContext } from '@/lib/derived/framing';

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
    const ctx = await gatherFramingContext(args.context as string);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const items = await findThesesNeedingFraming();

  if (args.json) {
    console.log(JSON.stringify({ count: items.length, items }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Framing worklist (live asset theses with no macro link) ===`);
  console.log(`${items.length} asset theses to consider framing\n`);
  for (const it of items) {
    const tk = it.ticker ? ` (${it.ticker})` : '';
    console.log(`  ${it.title}${tk}  [${it.status}, ${it.direction ?? '—'}]\n      id=${it.thesisId}`);
  }
  if (items.length > 0) {
    console.log(`\nJudge each via thesis-review (framing mode); context with --context <assetThesisId>.`);
    console.log(`An asset thesis may legitimately stand alone — only frame genuine matches.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
