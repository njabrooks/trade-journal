#!/usr/bin/env tsx
/**
 * Maintenance status — the belief-maintenance routine's single dashboard (C6 — docs/v2/09 §10).
 *
 * Aggregates every worklist + the relate-research cursor so the routine (the /maintenance
 * skill, run on demand or — user-go — on a billed cloud schedule) sees what needs doing in
 * one place. Read-only unless --advance-relate-research is passed.
 *
 * NOTE: scripts/lib/db pools a single connection, so the loaders run SEQUENTIALLY
 * (Promise.all would deadlock — same constraint as the W7 advisor).
 *
 * Usage:
 *   npx tsx scripts/ops/maintenance-status.ts                                  # summary
 *   npx tsx scripts/ops/maintenance-status.ts --json
 *   npx tsx scripts/ops/maintenance-status.ts --advance-relate-research <ISO>  # set the cursor after a relate-research run
 */
import { closeDb, db, schema } from '../lib/db.js';
import { sql, gt } from 'drizzle-orm';
import { getCursor, setCursor, RELATE_RESEARCH_CURSOR } from '../lib/automationCursor.js';
import { findThesesNeedingDigestRefresh } from '@/lib/derived/digestSynthesis';
import { findMonitoringThesesNeedingSignals } from '@/lib/derived/signalDerivation';
import { findMonitoringThesesDueForHealthCheck } from '@/lib/derived/thesisHealth';
import { findResearchGaps } from '@/lib/derived/researchGap';
import { findThesesNeedingRetrospective } from '@/lib/derived/retrospective';
import { findThesesNeedingFraming } from '@/lib/derived/framing';
import { findUnclassifiedExposures } from '@/lib/derived/exposureClassification';
import { findThesesDueForReunderwrite } from '@/lib/derived/reunderwriteDue';
import { computeSignalQualityDiagnostics } from '@/lib/derived/signalQualityDiagnostics';

const { researchInsights } = schema;

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

async function newInsightsSince(cursor: string | null): Promise<number> {
  const q = db.select({ n: sql<number>`count(*)::int` }).from(researchInsights);
  const rows = cursor ? await q.where(gt(researchInsights.createdAt, new Date(cursor))) : await q;
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['advance-relate-research']) {
    const iso = String(args['advance-relate-research']);
    if (Number.isNaN(Date.parse(iso))) { console.error('--advance-relate-research needs an ISO date'); process.exit(1); }
    await setCursor(RELATE_RESEARCH_CURSOR, iso, { advancedAt: new Date().toISOString() });
    console.log(JSON.stringify({ advanced: RELATE_RESEARCH_CURSOR, to: iso }, null, 2));
    await closeDb();
    process.exit(0);
  }

  // Sequential — single-connection pool.
  const cursor = await getCursor(RELATE_RESEARCH_CURSOR);
  const newInsights = await newInsightsSince(cursor);
  const digest = (await findThesesNeedingDigestRefresh()).length;
  const sig = await findMonitoringThesesNeedingSignals();
  const health = (await findMonitoringThesesDueForHealthCheck()).length;
  const gaps = (await findResearchGaps()).length;
  const retro = (await findThesesNeedingRetrospective()).length;
  const framing = (await findThesesNeedingFraming()).length;
  const exposure = (await findUnclassifiedExposures()).length;
  // Re-underwrite-due = union of the two triggers (claim-delta + signal-quality), deduped
  // per thesis — the set raise-reunderwrite-decisions.ts would surface (docs/v2/15 §6).
  const claimReunderwrite = await findThesesDueForReunderwrite();
  const sqReunderwrite = (await computeSignalQualityDiagnostics()).filter((t) => t.reunderwriteTrigger);
  const reunderwriteDue = new Set([
    ...claimReunderwrite.map((d) => `${d.thesisType}:${d.thesisId}`),
    ...sqReunderwrite.map((t) => `${t.thesisType}:${t.thesisId}`),
  ]).size;

  const relateResearch = { cursor: cursor ?? null, newInsights };
  const worklists = {
    digestRefresh: digest,
    signalDerivation: sig.ready.length,
    signalThin: sig.thin.length, // research-gap candidates (overlaps researchGap)
    healthDue: health,
    researchGap: gaps,
    retrospective: retro,
    framing,
    classifyExposure: exposure,
    reunderwriteDue,
  };
  // Maintenance work total (signalThin omitted — it overlaps researchGap).
  // Keep `actionable` for backward compatibility with skills/scripts, but present it
  // to humans as agent-run maintenance work, not already-raised user decisions.
  const maintenanceWorkItems = digest + sig.ready.length + health + gaps + retro + framing + exposure + reunderwriteDue;
  const actionable = maintenanceWorkItems;

  if (args.json) {
    console.log(JSON.stringify({ relateResearch, worklists, actionable, maintenanceWorkItems }, null, 2));
    await closeDb();
    process.exit(0);
  }

  console.log(`\n=== Belief-maintenance status (docs/v2/09 §10) ===`);
  console.log(`relate-research cursor : ${cursor ?? 'unset'}`);
  console.log(`  new insights since   : ${newInsights}${cursor ? '' : ' (no cursor — first run processes the chosen window)'}`);
  console.log(`thesis-review worklists:`);
  console.log(`  digest refresh (developing)   : ${digest}`);
  console.log(`  signal derivation (monitoring): ${sig.ready.length} ready  (+${sig.thin.length} thin → research-gap)`);
  console.log(`  health pass due (monitoring)  : ${health}`);
  console.log(`  research-gap bridge           : ${gaps}`);
  console.log(`  retrospective (resolved)      : ${retro}`);
  console.log(`  re-underwrite due (claim+signal): ${reunderwriteDue}`);
  console.log(`decision detectors:`);
  console.log(`  framing (asset w/o macro)     : ${framing}`);
  console.log(`  classify_exposure (placeholders): ${exposure}`);
  console.log(`\nmaintenance work items: ${maintenanceWorkItems}`);
  console.log(`Run the /maintenance skill to drain incrementally (token-aware), or each worklist's find-*/mode directly.`);

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
