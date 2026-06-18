#!/usr/bin/env tsx
/**
 * The research-gap worklist (W8 — docs/v2/07 §4e, B6).
 *
 * Monitoring (live) theses that aren't adequately researched — the position→backfill
 * inversion. The queue the thesis-review skill (research-gap mode) bridges by pulling
 * Tana first and, if still thin, surfacing a DecisionStrip "develop this thesis" item.
 *
 * Usage:
 *   npx tsx scripts/ops/find-research-gaps.ts                       # worklist
 *   npx tsx scripts/ops/find-research-gaps.ts --json
 *   npx tsx scripts/ops/find-research-gaps.ts --context <id> --type asset|macro
 *                                                                    # bridge context (thesis + theme + existing research)
 */
import { closeDb } from '../lib/db.js';
import { findResearchGaps, gatherGapContext } from '@/lib/derived/researchGap';

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
    const ctx = await gatherGapContext(args.context as string, thesisType);
    console.log(JSON.stringify(ctx, null, 2));
    await closeDb();
    process.exit(0);
  }

  const gaps = await findResearchGaps();

  if (args.json) {
    console.log(JSON.stringify({ count: gaps.length, gaps }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Research-gap worklist (monitoring theses, under-researched) ===`);
  console.log(`${gaps.length} live theses need belief backfill\n`);
  for (const g of gaps) {
    const tk = g.ticker ? ` (${g.ticker})` : '';
    console.log(`  [${g.band.toUpperCase()}] ${g.title}${tk}  score=${g.score}  — ${g.reasons.join(', ')}\n      id=${g.thesisId} (${g.thesisType})`);
  }
  if (gaps.length > 0) {
    console.log(`\nBridge each via the thesis-review skill (research-gap mode); context with --context <id> --type <asset|macro>.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
