#!/usr/bin/env tsx
/**
 * Sensor triage (docs/v2/14 §9, P3 / docs/v2/16 §3 task 3).
 *
 * Walks every active signal that carries a SENSOR (`explicit_details`) and judges whether
 * the precise measurement is worth its maintenance, against §9's four criteria:
 *   1. decision-grade   — a threshold crossing would actually change the action;
 *   2. faithful, not a proxy — measures the real thesis condition, not a stand-in;
 *   3. cheap & reliable — the collector is actually producing data (not silently dead);
 *   4. easily missed by judgment — a crossing WebSearch wouldn't reliably catch.
 *
 * The point (§9): shrink the sensor layer to the decision-grade triggers, drop the laggy
 * proxies to statement-only, and let the loop — not fiat — select what stays. So this report
 * EXPOSES the observable facts (kind, source class, threshold, collector reliability from the
 * snapshot history) and recommends keep / clear-vestigial / review; the faithful-vs-proxy call
 * stays a judgment, actioned with the explicit write modes.
 *
 * It also surfaces a latent bug: signals whose `explicit_details` is a vestigial qualitative
 * blob (news_qualitative keyword config — NOT a real collector) read as collector-tracked and
 * so get wrongly EXCLUDED from the chronic-neutral diagnostic (docs/v2/15 §4.3). Clearing them
 * to statement-only fixes that and returns them to the observe loop.
 *
 * Dropping a sensor is ADDITIVE/non-destructive: explicit_details → null, category → judgment.
 * The STATEMENT and the signal survive; only the measurement is removed.
 *
 * Modes (read-only report by default; writes need --apply):
 *   (no args)                          human report
 *   --json                             machine report
 *   --clear-vestigial [--apply]        clear ALL vestigial (no-real-sensor) explicit_details
 *   --drop <signalId> [--apply]        drop one sensor → statement-only
 *
 * Import order: ../lib/db.js loads dotenv before @/db resolves.
 */
import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { parseSensor, describeSensor, isDecisionGradeSensor, type Sensor } from '@/lib/derived/signalSensor';

const { signals: signalsTable } = schema;

const DAY_MS = 86_400_000;
const STALE_COLLECTOR_DAYS = 45; // no quantitative snapshot in this long ⇒ collector likely dead/fragile

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2).replace(/-/g, '_');
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { a[k] = n; i++; } else { a[k] = true; }
    }
  }
  return a;
}

type Recommendation = 'keep' | 'clear_vestigial' | 'review';
type ReviewHint = 'likely_proxy' | 'stale_collector' | 'dependency_edge' | 'keep_candidate' | 'none';

interface Reliability {
  quantSnapshots: number;
  lastSnapshotDate: string | null;
  daysSinceLastSnapshot: number | null;
  maxPctToThreshold: number | null;
  latestPctToThreshold: number | null;
  producing: boolean;
}

interface SensorRow {
  signalId: string;
  statement: string;
  type: string;
  category: string | null;
  thesisTitle: string | null;
  thesisType: string | null;
  sensor: Pick<Sensor, 'kind' | 'sourceClass' | 'dataSource' | 'metrics' | 'thresholds'> & { decisionGrade: boolean; describe: string };
  reliability: Reliability;
  recommendation: Recommendation;
  hint: ReviewHint;
  rationale: string;
}

/** FAITHFUL-LIKELY source classes (the metric tends to measure the real thing). */
const FAITHFUL_CLASSES = new Set(['market_price', 'onchain', 'reserve_flow', 'revenue']);
/** PROXY-LIKELY source classes (broad aggregates / laggy filings). */
const PROXY_CLASSES = new Set(['macro_aggregate', 'filing']);

/** Snapshot reliability per signal (quantitative collector snapshots only). */
async function reliabilityFor(signalIds: string[], now: Date): Promise<Map<string, Reliability>> {
  const out = new Map<string, Reliability>();
  if (signalIds.length === 0) return out;
  const rows = await db.execute<{
    signal_id: string; quant_snaps: number; last_snap: string | null; max_pct: string | null; latest_pct: string | null;
  }>(sql`
    SELECT signal_id,
           count(*) FILTER (WHERE observed_value IS NOT NULL)::int AS quant_snaps,
           max(snapshot_date) FILTER (WHERE observed_value IS NOT NULL) AS last_snap,
           max(pct_to_threshold) FILTER (WHERE observed_value IS NOT NULL) AS max_pct,
           (array_agg(pct_to_threshold ORDER BY snapshot_date DESC) FILTER (WHERE observed_value IS NOT NULL))[1] AS latest_pct
    FROM signal_data_snapshots
    WHERE signal_id IN (${sql.join(signalIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY signal_id
  `);
  for (const r of rows) {
    const last = r.last_snap ? new Date(r.last_snap) : null;
    const days = last ? Math.round((now.getTime() - last.getTime()) / DAY_MS) : null;
    out.set(r.signal_id, {
      quantSnapshots: Number(r.quant_snaps ?? 0),
      lastSnapshotDate: last ? last.toISOString().slice(0, 10) : null,
      daysSinceLastSnapshot: days,
      maxPctToThreshold: r.max_pct != null ? Number(r.max_pct) : null,
      latestPctToThreshold: r.latest_pct != null ? Number(r.latest_pct) : null,
      producing: !!last && days != null && days <= STALE_COLLECTOR_DAYS,
    });
  }
  return out;
}

/** §9 recommendation from the observable facts. Keeps the faithful-vs-proxy CALL human. */
function recommend(sensor: Sensor, decisionGrade: boolean, rel: Reliability): { recommendation: Recommendation; hint: ReviewHint; rationale: string } {
  // Vestigial: explicit_details present but no real sensor → safe mechanical clear.
  if (sensor.kind === 'none') {
    return { recommendation: 'clear_vestigial', hint: 'none',
      rationale: `explicit_details present (${sensor.dataSource ?? 'config'}) but no real sensor — qualitative/keyword config wrongly reads as collector-tracked and excludes the signal from chronic-neutral. Clear to statement-only.` };
  }
  // Dependency edge: cheap, faithful, internal — keep, but it is a graph edge not a metric.
  if (sensor.kind === 'dependency') {
    return { recommendation: 'keep', hint: 'dependency_edge', rationale: 'Internal thesis-graph edge (parent-status) — cheap, faithful, decision-relevant. Keep.' };
  }
  // Price ladder: decision-grade by construction, faithful (actual price), cheap. Keep.
  if (sensor.kind === 'price_ladder') {
    return { recommendation: 'keep', hint: 'none', rationale: 'Price ladder — decision-grade by construction (take-profit levels), faithful, cheap. Keep.' };
  }
  // Threshold collectors: judge by faithfulness hint + reliability.
  if (!rel.producing) {
    return { recommendation: 'review', hint: 'stale_collector',
      rationale: `Collector not producing (${rel.lastSnapshotDate ? `last quant snapshot ${rel.daysSinceLastSnapshot}d ago` : 'no quant snapshots'}) — §9 criterion 3 (cheap & reliable) at risk. Fix the collector or drop to statement-only.` };
  }
  if (PROXY_CLASSES.has(sensor.sourceClass)) {
    return { recommendation: 'review', hint: 'likely_proxy',
      rationale: `${sensor.sourceClass} source (${sensor.dataSource}) — likely a laggy proxy (§9 criterion 2: faithful-not-proxy). Decision-grade=${decisionGrade}; max approach to threshold ${rel.maxPctToThreshold != null ? `${rel.maxPctToThreshold}%` : 'n/a'}. Judge keep-vs-statement-only.` };
  }
  if (decisionGrade && FAITHFUL_CLASSES.has(sensor.sourceClass)) {
    return { recommendation: 'keep', hint: 'keep_candidate',
      rationale: `Decision-grade + ${sensor.sourceClass} (likely faithful) + producing — the kind §9 keeps. Keep.` };
  }
  return { recommendation: 'review', hint: 'none',
    rationale: `Producing, decision-grade=${decisionGrade}, source=${sensor.sourceClass}. Judge against the four §9 criteria.` };
}

/** Load every active signal that carries explicit_details, with its thesis + sensor reading + reliability. */
async function loadSensors(now: Date): Promise<SensorRow[]> {
  const rows = await db
    .select({
      id: signalsTable.id, statement: signalsTable.statement, type: signalsTable.type,
      category: signalsTable.category, explicitDetails: signalsTable.explicitDetails,
    })
    .from(signalsTable)
    .where(and(eq(signalsTable.status, 'active'), isNotNull(signalsTable.explicitDetails)));

  const ids = rows.map((r) => r.id);
  // Thesis label per signal (best-effort; strategy-linked ladders have no thesis).
  const links = ids.length
    ? await db.execute<{ signal_id: string; thesis_type: string | null; title: string | null }>(sql`
        SELECT sel.signal_id, sel.thesis_type,
               COALESCE(at.title, mt.title) AS title
        FROM signal_entity_links sel
        LEFT JOIN asset_theses at ON sel.thesis_id = at.id AND sel.thesis_type = 'asset'
        LEFT JOIN macro_theses mt ON sel.thesis_id = mt.id AND sel.thesis_type = 'macro'
        WHERE sel.signal_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) AND sel.entity_type = 'thesis'
      `)
    : [];
  const labelBySignal = new Map<string, { thesisType: string | null; title: string | null }>();
  for (const l of links) if (!labelBySignal.has(l.signal_id)) labelBySignal.set(l.signal_id, { thesisType: l.thesis_type, title: l.title });

  const rel = await reliabilityFor(ids, now);

  return rows.map((r) => {
    const sensor = parseSensor(r.explicitDetails, r.category);
    const decisionGrade = isDecisionGradeSensor(sensor);
    const reliability = rel.get(r.id) ?? { quantSnapshots: 0, lastSnapshotDate: null, daysSinceLastSnapshot: null, maxPctToThreshold: null, latestPctToThreshold: null, producing: false };
    const { recommendation, hint, rationale } = recommend(sensor, decisionGrade, reliability);
    const label = labelBySignal.get(r.id);
    return {
      signalId: r.id, statement: r.statement, type: r.type, category: r.category,
      thesisTitle: label?.title ?? null, thesisType: label?.thesisType ?? null,
      sensor: { kind: sensor.kind, sourceClass: sensor.sourceClass, dataSource: sensor.dataSource, metrics: sensor.metrics, thresholds: sensor.thresholds, decisionGrade, describe: describeSensor(sensor) },
      reliability, recommendation, hint, rationale,
    };
  });
}

/** Drop a sensor → statement-only (explicit_details=null, category=judgment). Additive: statement survives. */
async function dropSensor(signalId: string, apply: boolean) {
  const [sig] = await db.select({ id: signalsTable.id, statement: signalsTable.statement, explicitDetails: signalsTable.explicitDetails }).from(signalsTable).where(eq(signalsTable.id, signalId)).limit(1);
  if (!sig) { console.error(`No signal ${signalId}`); process.exit(1); }
  if (sig.explicitDetails == null) { console.log(JSON.stringify({ signalId, changed: false, note: 'already statement-only' }, null, 2)); return; }
  const describe = describeSensor(parseSensor(sig.explicitDetails));
  if (!apply) { console.log(JSON.stringify({ dryRun: true, signalId, wouldDrop: describe, statement: sig.statement.slice(0, 80) }, null, 2)); return; }
  await db.update(signalsTable).set({ explicitDetails: null, category: 'judgment', updatedAt: new Date() }).where(eq(signalsTable.id, signalId));
  await logToJournal({ objectType: 'signal', objectId: signalId, objectTitle: sig.statement, actionType: 'sensor_dropped', actionDescription: `Sensor dropped → statement-only (${describe}); statement retained (sensor-triage §9)`, source: 'skill', skillInvoked: '/triage-sensors' });
  console.log(JSON.stringify({ signalId, changed: true, dropped: describe }, null, 2));
}

/** Batch-clear all vestigial explicit_details (present but no real sensor). Safe — they are not collectors. */
async function clearVestigial(rows: SensorRow[], apply: boolean) {
  const vestigial = rows.filter((r) => r.recommendation === 'clear_vestigial');
  if (vestigial.length === 0) { console.log(JSON.stringify({ vestigial: 0, note: 'none found' }, null, 2)); return; }
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, vestigial: vestigial.length, signals: vestigial.map((v) => ({ signalId: v.signalId, source: v.sensor.dataSource, statement: v.statement.slice(0, 70) })) }, null, 2));
    return;
  }
  const ids = vestigial.map((v) => v.signalId);
  await db.update(signalsTable).set({ explicitDetails: null, category: 'judgment', updatedAt: new Date() }).where(inArray(signalsTable.id, ids));
  for (const v of vestigial) {
    await logToJournal({ objectType: 'signal', objectId: v.signalId, objectTitle: v.statement, actionType: 'sensor_dropped', actionDescription: `Vestigial explicit_details cleared → statement-only (was ${v.sensor.dataSource ?? 'config'}, no real sensor); re-enters chronic-neutral tracking`, source: 'skill', skillInvoked: '/triage-sensors' });
  }
  console.log(JSON.stringify({ cleared: ids.length, signalIds: ids }, null, 2));
}

function printHuman(rows: SensorRow[]) {
  const order: Recommendation[] = ['keep', 'review', 'clear_vestigial'];
  const byRec = (rec: Recommendation) => rows.filter((r) => r.recommendation === rec);
  console.log(`\nSensor triage — ${rows.length} active signal(s) carry a sensor (docs/v2/14 §9)\n`);
  for (const rec of order) {
    const group = byRec(rec);
    if (group.length === 0) continue;
    console.log(`${rec.toUpperCase()} (${group.length}):`);
    for (const r of group) {
      const where = r.thesisTitle ? `${r.thesisType}:${r.thesisTitle}` : 'strategy/unlinked';
      const prod = r.sensor.kind === 'price_ladder' || r.sensor.kind === 'dependency' ? '' : r.reliability.producing ? ' · producing' : ' · NOT producing';
      console.log(`  · [${where}] ${r.sensor.describe}${prod}${r.hint !== 'none' ? ` (${r.hint})` : ''}`);
      console.log(`      ${r.statement.slice(0, 86)}`);
      console.log(`      → ${r.rationale}`);
    }
    console.log('');
  }
  const reviewable = byRec('review');
  const vestigial = byRec('clear_vestigial');
  console.log('Actions:');
  if (vestigial.length) console.log(`  --clear-vestigial --apply   clear ${vestigial.length} vestigial blob(s) → statement-only (safe; fixes chronic-neutral exclusion)`);
  if (reviewable.length) console.log(`  --drop <signalId> --apply   drop a reviewed proxy/stale sensor → statement-only (your call, per signal)`);
  if (!vestigial.length && !reviewable.length) console.log('  (none — the sensor set is already lean)');
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();

  if (args.drop) {
    await dropSensor(args.drop === true ? (args.id as string) : (args.drop as string), !!args.apply);
    await closeDb(); process.exit(0);
  }

  const rows = await loadSensors(now);

  if (args.clear_vestigial) {
    await clearVestigial(rows, !!args.apply);
    await closeDb(); process.exit(0);
  }

  if (args.json) {
    const counts = rows.reduce<Record<string, number>>((m, r) => { m[r.recommendation] = (m[r.recommendation] ?? 0) + 1; return m; }, {});
    console.log(JSON.stringify({ generatedAt: now.toISOString(), sensorCount: rows.length, counts, sensors: rows }, null, 2));
    await closeDb(); process.exit(0);
  }

  printHuman(rows);
  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
