/**
 * One-off backfill: neutralise inverted polarity on INVALIDATION-type signals.
 *
 * Bug (fixed forward in src/lib/intelligence/relateResearch.ts assessSignal):
 * several writers derived a THESIS-CENTRIC `assessment` from the signal *type* (or used a
 * signal-centric convention), so for invalidation-type signals the polarity is inverted:
 * thesis-supportive evidence that makes an invalidation LESS likely ("risk receding",
 * "capex accelerating") was stored as `weakening`, and invalidation-advancing evidence as
 * `strengthening`. The /thesis-review health pass + signal-trend UI read `assessment`
 * thesis-centrically (thesisHealthRules.isWeakening, daily-scores DELTA_MAP), so these tags
 * mislead them.
 *
 * These rows' direction cannot be recovered reliably row-by-row (the value was a function of
 * signal type / a signal-centric convention, not a thesis-centric read), so we ABSTAIN:
 * set the directional value to `neutral`. The evidence_summary text + claim↔signal links are
 * untouched (provenance preserved); a reader/health-agent still sees the evidence and judges
 * it. Thesis direction now lives in claim_thesis_mappings.mapping_type (supports/refutes).
 *
 * Scope: assessment IN ('weakening','strengthening') on signals.type='invalidation'.
 * Terminal verdicts ('confirmed'/'invalidated') are left alone (none in the candidate set,
 * and they may be genuine). Confirmation/completion signals are untouched (their polarity is
 * unaffected by the bug).
 *
 * Usage:
 *   npx tsx scripts/ops/backfill-invalidation-polarity.ts                 # dry-run, all 4 sources
 *   npx tsx scripts/ops/backfill-invalidation-polarity.ts --apply         # execute
 *   npx tsx scripts/ops/backfill-invalidation-polarity.ts --sources research_routing,thesis_monitor --apply
 *   npx tsx scripts/ops/backfill-invalidation-polarity.ts --active-only --apply
 */

import { sql } from 'drizzle-orm';
import { db, closeDb } from '../lib/db.js';

const DEFAULT_SOURCES = ['intelligence_routing', 'research_routing', 'thesis_monitor', 'daily_synthesis'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const activeOnly = process.argv.includes('--active-only');
  const sources = (arg('sources')?.split(',').map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_SOURCES;

  console.log(`Backfill: neutralise inverted polarity on invalidation signals`);
  console.log(`  sources:     ${sources.join(', ')}`);
  console.log(`  active-only: ${activeOnly}`);
  console.log(`  mode:        ${apply ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`);
  console.log('');

  const activeClause = activeOnly ? sql`AND s.status = 'active'` : sql``;

  // Preview: how many snapshot rows match, by source.
  const preview = await db.execute(sql`
    SELECT sds.data_source, sds.assessment, count(*)::int AS n
    FROM signal_data_snapshots sds
    JOIN signals s ON s.id = sds.signal_id
    WHERE s.type = 'invalidation'
      AND sds.assessment IN ('weakening', 'strengthening')
      AND sds.data_source IN (${sql.join(sources.map((s) => sql`${s}`), sql`, `)})
      ${activeClause}
    GROUP BY sds.data_source, sds.assessment
    ORDER BY sds.data_source, sds.assessment
  `);
  const previewRows = (preview as unknown as { rows?: unknown[] }).rows ?? (preview as unknown[]);
  let snapTotal = 0;
  for (const r of previewRows as { data_source: string; assessment: string; n: number }[]) {
    console.log(`  snapshot  ${r.data_source.padEnd(22)} ${r.assessment.padEnd(14)} ${r.n}`);
    snapTotal += Number(r.n);
  }
  console.log(`  → signal_data_snapshots rows to neutralise: ${snapTotal}`);

  // claim_signal_evidences mirror (research_routing path only — these are the relate-research links).
  const cseEligible = sources.includes('research_routing');
  let cseTotal = 0;
  if (cseEligible) {
    const cse = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM claim_signal_evidences cse
      JOIN signals s ON s.id = cse.signal_id
      WHERE s.type = 'invalidation'
        AND cse.assessment IN ('weakening', 'strengthening')
        ${activeClause}
    `);
    const cseRows = (cse as unknown as { rows?: unknown[] }).rows ?? (cse as unknown[]);
    cseTotal = Number((cseRows[0] as { n: number })?.n ?? 0);
    console.log(`  → claim_signal_evidences rows to neutralise: ${cseTotal}`);
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    await closeDb();
    process.exit(0);
  }

  // Apply.
  const upd = await db.execute(sql`
    UPDATE signal_data_snapshots sds
    SET assessment = 'neutral'
    FROM signals s
    WHERE sds.signal_id = s.id
      AND s.type = 'invalidation'
      AND sds.assessment IN ('weakening', 'strengthening')
      AND sds.data_source IN (${sql.join(sources.map((s) => sql`${s}`), sql`, `)})
      ${activeClause}
  `);
  const snapUpdated = (upd as unknown as { rowCount?: number }).rowCount ?? snapTotal;
  console.log(`\nUpdated ${snapUpdated} signal_data_snapshots row(s) → neutral.`);

  if (cseEligible) {
    const cseUpd = await db.execute(sql`
      UPDATE claim_signal_evidences cse
      SET assessment = 'neutral'
      FROM signals s
      WHERE cse.signal_id = s.id
        AND s.type = 'invalidation'
        AND cse.assessment IN ('weakening', 'strengthening')
        ${activeClause}
    `);
    const cseUpdated = (cseUpd as unknown as { rowCount?: number }).rowCount ?? cseTotal;
    console.log(`Updated ${cseUpdated} claim_signal_evidences row(s) → neutral.`);
  }

  console.log('\nDone.');
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
