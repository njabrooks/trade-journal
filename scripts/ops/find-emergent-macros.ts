#!/usr/bin/env tsx
/**
 * The macro-emergence pool (docs/v2/13 §1, structure-driven). The complement to framing:
 * active asset theses with NO macro link, plus the macro catalog to dedup against. When
 * SEVERAL of these share a genuine macro-level theme and no existing macro covers it, that
 * cluster is a candidate for a NEW macro thesis.
 *
 * The clustering JUDGMENT is the thesis-review skill (macro-emergence mode); this just
 * assembles the pool. Creating a belief is always a decision — the skill raises a
 * `cluster_claims_to_thesis` packet, never auto-creates.
 *
 * Usage:
 *   npx tsx scripts/ops/find-emergent-macros.ts            # pool summary
 *   npx tsx scripts/ops/find-emergent-macros.ts --json     # full context (the skill consumes this)
 */
import { closeDb } from '../lib/db.js';
import { gatherEmergenceContext } from '@/lib/derived/macroEmergence';

async function main() {
  const json = process.argv.slice(2).includes('--json');
  const ctx = await gatherEmergenceContext();

  if (json) {
    console.log(JSON.stringify({ unframedCount: ctx.unframedAssets.length, macroCatalogCount: ctx.macroCatalog.length, ...ctx }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Macro-emergence pool (active asset theses with no macro link) ===`);
  console.log(`${ctx.unframedAssets.length} unframed assets · ${ctx.macroCatalog.length} active macros (dedup catalog)\n`);
  for (const a of ctx.unframedAssets) {
    const tk = a.ticker ? ` (${a.ticker})` : '';
    const claims = a.claimTitles.length ? `  ·  ${a.claimTitles.length} claim${a.claimTitles.length > 1 ? 's' : ''}` : '';
    console.log(`  ${a.title}${tk}  [${a.status}, ${a.direction ?? '—'}]${claims}\n      id=${a.thesisId}`);
  }
  if (ctx.unframedAssets.length < 2) {
    console.log(`\nNeed ≥2 unframed assets to form a cluster — nothing to propose.`);
  } else {
    console.log(`\nJudge clusters via thesis-review (macro-emergence mode): a cluster of ≥2 sharing a genuine`);
    console.log(`macro theme with NO existing-macro match → propose one. Most assets stand alone — be sparing.`);
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
