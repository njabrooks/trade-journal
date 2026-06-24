#!/usr/bin/env tsx
/**
 * Backtest the chronic-neutral classifier over the legacy `thesis_monitor` history
 * (docs/v2/15 §9.2). This is the "does it work" gate while live observe history is
 * still thin: 1,101 real tracking snapshots (2026-03-17 → 2026-04-06, 33 signals) are
 * an ideal corpus AND a negative control.
 *
 * Two scenarios:
 *   A. ACTIVE PERIOD (asOf 2026-04-06, the monitor's last day) — proves the classifier
 *      WORKS: over real `thesis_monitor` snapshots it separates chronic-neutral signals
 *      from the ones that discriminated, and the invariant holds (no signal with a real
 *      non-neutral is ever `chronic_neutral`).
 *   B. BLIND PERIOD (asOf 2026-06-01, deep in the ~2.5-month outage) — proves the GATE +
 *      exclusion (§2/§4.2): real tracking sources are silent (the monitor was dead) so
 *      everything is `insufficient_data` (correctly NOT flagged), whereas `daily_synthesis`
 *      gap-fill relabeled as tracking would flag a pile of false chronic-neutrals. That
 *      gap is exactly the trap the source-exclusion prevents.
 *
 * Read-only. Usage: npx tsx scripts/ops/backtest-signal-quality.ts
 */
import { db, closeDb } from '../lib/db.js';
import { sql } from 'drizzle-orm';
import { classifySignalChronicNeutral, type SnapshotLite, type ChronicVerdict } from '@/lib/derived/signalQualityRules';

interface Row { signal_id: string; assessment: string | null; snapshot_date: string }

/** Snapshots from `source` in the 60d before asOf, relabeled as tracking so the pure classifier counts them. */
async function snapshotsFor(source: string, asOf: Date): Promise<Map<string, SnapshotLite[]>> {
  const rows = await db.execute<Row>(sql`
    SELECT signal_id, assessment, snapshot_date
    FROM signal_data_snapshots
    WHERE data_source = ${source}
      AND snapshot_date <= ${asOf.toISOString()}
      AND snapshot_date >= ${new Date(asOf.getTime() - 60 * 86_400_000).toISOString()}
  `);
  const map = new Map<string, SnapshotLite[]>();
  for (const r of rows) {
    const arr = map.get(r.signal_id) ?? [];
    arr.push({ assessment: r.assessment, dataSource: 'thesis_monitor', snapshotDate: new Date(r.snapshot_date) });
    map.set(r.signal_id, arr);
  }
  return map;
}

function distribution(map: Map<string, SnapshotLite[]>, asOf: Date) {
  const dist: Record<ChronicVerdict, number> = {
    insufficient_data: 0, chronic_neutral: 0, low_information: 0, discriminating: 0, excluded_collector: 0,
  };
  let invariantViolations = 0;
  for (const [, snaps] of map) {
    const r = classifySignalChronicNeutral(snaps, asOf);
    dist[r.verdict]++;
    if (r.verdict === 'chronic_neutral' && r.nonNeutralCount > 0) invariantViolations++;
  }
  const flagged = dist.chronic_neutral + dist.low_information;
  return { dist, signals: map.size, invariantViolations, flagged };
}

async function main() {
  // ── Scenario A: active period — does it detect? ──
  const asOfA = new Date('2026-04-06T23:59:59Z');
  const real = distribution(await snapshotsFor('thesis_monitor', asOfA), asOfA);
  console.log(`\n=== A. ACTIVE PERIOD (asOf ${asOfA.toISOString().slice(0, 10)}) — does the classifier detect? ===`);
  console.log(`  thesis_monitor: ${real.signals} signals → ${JSON.stringify(real.dist)}`);
  console.log(`  → ${real.flagged} flagged chronic/low-info, ${real.dist.discriminating} discriminating; invariant violations: ${real.invariantViolations}`);
  console.log(`  ${real.flagged > 0 && real.dist.discriminating > 0 && real.invariantViolations === 0 ? 'PASS ✓ — detects chronic-neutral, spares discriminating signals, invariant holds' : 'CHECK ✗'}`);

  // ── Scenario B: blind period — does the gate/exclusion hold? ──
  const asOfB = new Date('2026-06-01T23:59:59Z');
  const blindReal = distribution(await snapshotsFor('thesis_monitor', asOfB), asOfB);
  const blindGapfill = distribution(await snapshotsFor('daily_synthesis', asOfB), asOfB);
  console.log(`\n=== B. BLIND PERIOD (asOf ${asOfB.toISOString().slice(0, 10)}) — does the gate + exclusion hold? ===`);
  console.log(`  REAL tracking (thesis_monitor, dead since 04-06): ${blindReal.signals} signals → ${blindReal.flagged} flagged (expect 0 — correctly silent)`);
  console.log(`  TRAP (daily_synthesis gap-fill counted as tracking): ${blindGapfill.signals} signals → ${blindGapfill.flagged} would be falsely flagged`);
  console.log(`  ${blindReal.flagged === 0 && blindGapfill.flagged > blindReal.flagged ? `PASS ✓ — exclusion is load-bearing: it suppresses ${blindGapfill.flagged} false chronic-neutrals an outage would otherwise produce` : 'CHECK ✗'}`);
  console.log('');

  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
