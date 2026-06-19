#!/usr/bin/env tsx
/**
 * The classify_exposure worklist (C5b — docs/v2/09 §7).
 *
 * Auto-created placeholder theses, above a size bar, not yet classified — each a
 * "belief to develop or tactical hedge?" question. Deterministic detect-and-raise:
 * no agent judgment is needed to ASK (the judgment is the user's answer), so this
 * script raises the decision directly with --apply.
 *
 * Usage:
 *   npx tsx scripts/ops/find-unclassified-exposures.ts                 # worklist (dry)
 *   npx tsx scripts/ops/find-unclassified-exposures.ts --json
 *   npx tsx scripts/ops/find-unclassified-exposures.ts --apply         # raise the decisions
 *   npx tsx scripts/ops/find-unclassified-exposures.ts --min-notional 5000 [--apply]
 */
import { closeDb } from '../lib/db.js';
import { findUnclassifiedExposures, raiseExposureDecision, DEFAULT_EXPOSURE_BAR_USD } from '@/lib/derived/exposureClassification';

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
  const minNotional = args['min-notional'] ? Number(args['min-notional']) : DEFAULT_EXPOSURE_BAR_USD;
  const apply = !!args.apply;

  const items = await findUnclassifiedExposures(minNotional);

  if (apply) {
    let raised = 0, exists = 0;
    for (const it of items) {
      const r = await raiseExposureDecision(it);
      if (r === 'raised') raised++; else if (r === 'exists') exists++;
    }
    console.log(JSON.stringify({ applied: true, minNotional, candidates: items.length, raised, exists }, null, 2));
    await closeDb();
    process.exit(0);
  }

  if (args.json) {
    console.log(JSON.stringify({ count: items.length, minNotional, items }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== classify_exposure worklist (placeholder theses ≥ $${minNotional.toLocaleString('en-US')}, unclassified) ===`);
  console.log(`${items.length} live exposures need a belief-vs-tactical decision\n`);
  for (const it of items) {
    const tk = it.ticker ? ` (${it.ticker})` : '';
    console.log(`  ${it.title}${tk}  ~$${Math.round(Math.abs(it.notionalUsd)).toLocaleString('en-US')}\n      thesis=${it.thesisId} strategy=${it.strategyKey ?? '—'}`);
  }
  if (items.length > 0) console.log(`\nRaise the decisions with --apply (deduped per thesis).`);

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
