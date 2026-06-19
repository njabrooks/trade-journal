#!/usr/bin/env tsx
/**
 * Auto-link strategies to asset theses (W8 follow-on) — supervised runner.
 *
 * Resolves each active/draft strategy with no asset_thesis_id to its canonical
 * underlying (via parent_underlying_id), then links to an existing thesis, creates a
 * placeholder thesis (direct underlyings), or flags an unresolvable proxy.
 *
 * Dry-run by default. --apply to write. --raise-decisions also surfaces flags to the
 * DecisionStrip (use with --apply for the live behaviour).
 *
 * Usage:
 *   npx tsx scripts/ops/link-strategies-to-theses.ts            # dry-run plan
 *   npx tsx scripts/ops/link-strategies-to-theses.ts --apply
 *   npx tsx scripts/ops/link-strategies-to-theses.ts --apply --raise-decisions
 */
import { closeDb } from '../lib/db.js';
import { ensureAssetThesesForStrategies } from '@/lib/derived/strategyThesisLink';

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');
  const raiseDecisions = argv.includes('--raise-decisions');

  const results = await ensureAssetThesesForStrategies({ dryRun: !apply, raiseDecisions });

  if (json) {
    console.log(JSON.stringify({ apply, count: results.length, results }, null, 2));
    await closeDb();
    process.exit(0);
  }

  const mode = apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n=== Strategy → asset-thesis auto-link (${mode}) ===`);
  console.log(`${results.length} unlinked active/draft strategies\n`);
  const by: Record<string, number> = {};
  for (const r of results) by[r.action] = (by[r.action] ?? 0) + 1;
  console.log('actions:', JSON.stringify(by), '\n');
  for (const r of results.sort((a, b) => a.action.localeCompare(b.action))) {
    const t = r.thesisTitle ? ` → "${r.thesisTitle}"${r.direction ? ` (${r.direction})` : ''}` : '';
    console.log(`  [${r.action}] ${r.strategyKey} (${r.canonicalTicker ?? '?'})${t}  — ${r.detail}`);
  }
  if (!apply && results.some((r) => r.action !== 'skip')) {
    console.log(`\nRe-run with --apply to write. 'flag' rows need judgment (map the proxy's parent_underlying_id or link manually).`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
