/**
 * Signal-quality diagnostics — DB layer (docs/v2/15 §5–§6). Imports @/db; the pure
 * classifiers live in signalQualityRules.ts (unit-tested, no DB).
 *
 * computeSignalQualityDiagnostics() walks the active monitoring set and, per thesis,
 * computes:
 *   - chronic-neutral per signal (asset + macro), over TRACKING snapshots only
 *     (the trap fix — docs/v2/15 §2/§4.2);
 *   - price coverage-gaps (ASSET only) from underlyings_iv_history; macro price-
 *     surprise is deferred to P2's news path (open decision #4 — a macro's "move" is
 *     a news/basket phenomenon, and its constituents are often unpriced).
 * Both fold into `reunderwriteTrigger`, surfaced as a `re_underwrite_due` decision by
 * the worklist CLI / maintenance (docs/v2/15 §6).
 */
import { db } from '@/db';
import { signalDataSnapshots, underlyingsIvHistory } from '@/db/schema';
import { and, inArray, gte, sql } from 'drizzle-orm';
import { isCollectorTracked } from './signalClassification';
import {
  classifySignalChronicNeutral,
  detectPriceCoverageGap,
  isChronicFlag,
  DIAG_WINDOW_DAYS,
  SURPRISE_WINDOW_DAYS,
  TRACKING_SOURCES,
  NON_NEUTRAL,
  type ChronicVerdict,
  type CoverageGap,
  type PricePoint,
  type SnapshotLite,
} from './signalQualityRules';

const DAY_MS = 86_400_000;

export interface SignalDiagnostic {
  signalId: string;
  statement: string;
  type: string; // confirmation | invalidation | completion
  collectorTracked: boolean;
  observedCount: number;
  nonNeutralCount: number;
  neutralRate: number | null;
  verdict: ChronicVerdict;
}

export interface ThesisSignalQuality {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  ticker: string | null;
  signals: SignalDiagnostic[];
  chronicNeutralSignals: SignalDiagnostic[];
  coverageGaps: CoverageGap[];
  reunderwriteTrigger: boolean;
  reason: string;
}

interface ThesisRow {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  ticker: string | null;
  underlyingId: string | null;
  rv20: number | null;
}

/** Monitoring asset + macro theses that have ≥1 active signal (the assessable set). */
async function activeMonitoringTheses(): Promise<ThesisRow[]> {
  const assets = await db.execute<{ id: string; title: string; underlying_id: string; ticker: string; rv20: string | null }>(sql`
    SELECT at.id, at.title, u.id AS underlying_id, u.ticker, u.rv20
    FROM asset_theses at
    JOIN underlyings u ON at.underlying_id = u.id
    WHERE at.status = 'monitoring'
      AND EXISTS (
        SELECT 1 FROM signal_entity_links sel JOIN signals s ON s.id = sel.signal_id
        WHERE sel.thesis_id = at.id AND sel.thesis_type = 'asset'
          AND sel.entity_type = 'thesis' AND s.status = 'active')
  `);
  const macros = await db.execute<{ id: string; title: string }>(sql`
    SELECT mt.id, mt.title
    FROM macro_theses mt
    WHERE mt.status = 'monitoring'
      AND EXISTS (
        SELECT 1 FROM signal_entity_links sel JOIN signals s ON s.id = sel.signal_id
        WHERE sel.thesis_id = mt.id AND sel.thesis_type = 'macro'
          AND sel.entity_type = 'thesis' AND s.status = 'active')
  `);
  return [
    ...assets.map((a): ThesisRow => ({
      thesisId: a.id, thesisType: 'asset', title: a.title, ticker: a.ticker,
      underlyingId: a.underlying_id, rv20: a.rv20 != null ? Number(a.rv20) : null,
    })),
    ...macros.map((m): ThesisRow => ({
      thesisId: m.id, thesisType: 'macro', title: m.title, ticker: null, underlyingId: null, rv20: null,
    })),
  ];
}

interface SignalRow {
  signalId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  statement: string;
  type: string;
  category: string | null;
  explicitDetails: unknown;
}

/** All active thesis-linked signals (filtered to our set in JS — the active set is small). */
async function activeThesisSignals(): Promise<SignalRow[]> {
  const rows = await db.execute<{
    signal_id: string; thesis_id: string; thesis_type: string; statement: string;
    type: string; category: string | null; explicit_details: unknown;
  }>(sql`
    SELECT s.id AS signal_id, sel.thesis_id, sel.thesis_type, s.statement, s.type, s.category, s.explicit_details
    FROM signals s
    JOIN signal_entity_links sel ON sel.signal_id = s.id
    WHERE s.status = 'active' AND sel.entity_type = 'thesis' AND sel.thesis_id IS NOT NULL
  `);
  return rows.map((r) => ({
    signalId: r.signal_id, thesisId: r.thesis_id, thesisType: r.thesis_type as 'macro' | 'asset',
    statement: r.statement, type: r.type, category: r.category, explicitDetails: r.explicit_details,
  }));
}

/** Tracking snapshots (observe + monitor) for the given signals within the chronic-neutral window. */
async function trackingSnapshots(signalIds: string[], since: Date): Promise<Map<string, SnapshotLite[]>> {
  const out = new Map<string, SnapshotLite[]>();
  if (signalIds.length === 0) return out;
  const rows = await db
    .select({
      signalId: signalDataSnapshots.signalId,
      assessment: signalDataSnapshots.assessment,
      dataSource: signalDataSnapshots.dataSource,
      snapshotDate: signalDataSnapshots.snapshotDate,
    })
    .from(signalDataSnapshots)
    .where(and(
      inArray(signalDataSnapshots.signalId, signalIds),
      inArray(signalDataSnapshots.dataSource, [...TRACKING_SOURCES]),
      gte(signalDataSnapshots.snapshotDate, since),
    ));
  for (const r of rows) {
    if (!r.signalId) continue;
    const arr = out.get(r.signalId) ?? [];
    arr.push({ assessment: r.assessment, dataSource: r.dataSource, snapshotDate: new Date(r.snapshotDate as unknown as string) });
    out.set(r.signalId, arr);
  }
  return out;
}

/** Daily spot series per underlying from underlyings_iv_history within the surprise window (+buffer). */
async function priceSeries(underlyingIds: string[], sinceDate: string): Promise<Map<string, PricePoint[]>> {
  const out = new Map<string, PricePoint[]>();
  if (underlyingIds.length === 0) return out;
  const rows = await db
    .select({
      underlyingId: underlyingsIvHistory.underlyingId,
      asOfDate: underlyingsIvHistory.asOfDate,
      spot: underlyingsIvHistory.spot,
    })
    .from(underlyingsIvHistory)
    .where(and(
      inArray(underlyingsIvHistory.underlyingId, underlyingIds),
      gte(underlyingsIvHistory.asOfDate, sinceDate),
    ));
  for (const r of rows) {
    if (!r.underlyingId || r.spot == null) continue;
    const arr = out.get(r.underlyingId) ?? [];
    arr.push({ date: new Date(r.asOfDate as unknown as string), spot: Number(r.spot) });
    out.set(r.underlyingId, arr);
  }
  return out;
}

function buildReason(chronic: SignalDiagnostic[], gaps: CoverageGap[]): string {
  const parts: string[] = [];
  if (chronic.length) parts.push(`${chronic.length} chronic-neutral signal${chronic.length === 1 ? '' : 's'}`);
  for (const g of gaps) parts.push(g.detail);
  return parts.join('; ');
}

/** Compute signal-quality diagnostics for every assessable monitoring thesis. */
export async function computeSignalQualityDiagnostics(opts: { asOf?: Date } = {}): Promise<ThesisSignalQuality[]> {
  const now = opts.asOf ?? new Date();
  const snapSince = new Date(now.getTime() - DIAG_WINDOW_DAYS * DAY_MS);
  const priceSince = new Date(now.getTime() - (SURPRISE_WINDOW_DAYS + 5) * DAY_MS).toISOString().slice(0, 10);

  const theses = await activeMonitoringTheses();
  if (theses.length === 0) return [];
  const thesisKeys = new Set(theses.map((t) => `${t.thesisType}:${t.thesisId}`));

  const allSignals = (await activeThesisSignals()).filter((s) => thesisKeys.has(`${s.thesisType}:${s.thesisId}`));
  const signalsByThesis = new Map<string, SignalRow[]>();
  for (const s of allSignals) {
    const k = `${s.thesisType}:${s.thesisId}`;
    if (!signalsByThesis.has(k)) signalsByThesis.set(k, []);
    signalsByThesis.get(k)!.push(s);
  }

  const snapsBySignal = await trackingSnapshots(allSignals.map((s) => s.signalId), snapSince);
  const seriesByUnderlying = await priceSeries(
    theses.filter((t) => t.underlyingId).map((t) => t.underlyingId!),
    priceSince,
  );

  const results: ThesisSignalQuality[] = [];
  for (const t of theses) {
    const sigs = signalsByThesis.get(`${t.thesisType}:${t.thesisId}`) ?? [];

    // Per-signal chronic-neutral (collector-tracked signals are excluded — measured by their sensor).
    const diagnostics: SignalDiagnostic[] = sigs.map((s) => {
      const collectorTracked = isCollectorTracked({ explicitDetails: s.explicitDetails, category: s.category });
      if (collectorTracked) {
        return { signalId: s.signalId, statement: s.statement, type: s.type, collectorTracked: true, observedCount: 0, nonNeutralCount: 0, neutralRate: null, verdict: 'excluded_collector' };
      }
      const c = classifySignalChronicNeutral(snapsBySignal.get(s.signalId) ?? [], now);
      return { signalId: s.signalId, statement: s.statement, type: s.type, collectorTracked: false, ...c };
    });
    const chronicNeutralSignals = diagnostics.filter((d) => isChronicFlag(d.verdict));

    // Price coverage-gap (ASSET only). flagDates = the thesis's non-neutral tracking-snapshot dates.
    const coverageGaps: CoverageGap[] = [];
    if (t.thesisType === 'asset' && t.underlyingId) {
      const series = seriesByUnderlying.get(t.underlyingId) ?? [];
      const flagDates: Date[] = sigs
        .flatMap((s) => snapsBySignal.get(s.signalId) ?? [])
        .filter((snap) => snap.assessment != null && NON_NEUTRAL.has(snap.assessment))
        .map((snap) => snap.snapshotDate);
      const gap = detectPriceCoverageGap(series, now, t.rv20, flagDates, t.ticker ?? 'underlying');
      if (gap) coverageGaps.push(gap);
    }

    const reunderwriteTrigger = chronicNeutralSignals.length > 0 || coverageGaps.length > 0;
    results.push({
      thesisId: t.thesisId, thesisType: t.thesisType, title: t.title, ticker: t.ticker,
      signals: diagnostics, chronicNeutralSignals, coverageGaps, reunderwriteTrigger,
      reason: buildReason(chronicNeutralSignals, coverageGaps),
    });
  }

  // Triggers first; among them, gaps + most chronic signals on top.
  results.sort((a, b) =>
    Number(b.reunderwriteTrigger) - Number(a.reunderwriteTrigger) ||
    b.coverageGaps.length - a.coverageGaps.length ||
    b.chronicNeutralSignals.length - a.chronicNeutralSignals.length);
  return results;
}

/** Single-thesis detail for the `--context` path (CLI / `/thesis` re-underwrite). */
export async function gatherSignalQualityContext(
  thesisId: string,
  thesisType: 'macro' | 'asset',
): Promise<ThesisSignalQuality | null> {
  const all = await computeSignalQualityDiagnostics();
  return all.find((t) => t.thesisId === thesisId && t.thesisType === thesisType) ?? null;
}
