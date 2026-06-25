/**
 * Retrospective view — the data behind the two-axis retrospective (docs/v2/07 §4d).
 *
 * The retrospective fuses the P&L **excursion** (MFE/MAE/capture — execution quality)
 * with the **process artefacts** that document the trade's life, aligned on the same
 * timeline so the story reads: "right call, but the invalidation signal flagged
 * weakening 3 days after the peak, a covered-call harvest was offered and not taken,
 * and you held 8 weeks giving back 86%."
 *
 * Four overlays (all pre-existing data, joined to the thesis + clipped to the hold):
 *   - signal_verdict — signal_data_snapshots material assessments (≠ neutral)
 *   - advisor_rec    — advisor_recommendations for the underlying(s) + acted/dismissed
 *   - reunderwrite   — thesis_articulations versions + conviction deltas
 *   - decision       — decision_required journal entries + their resolution
 *
 * Numbers are computed LIVE from the (frozen, post-close) series via computeExcursion,
 * so this works for every resolved thesis with no backfill.
 */
import { db } from '@/db';
import {
  assetTheses,
  macroTheses,
  underlyings,
  signals,
  signalEntityLinks,
  signalDataSnapshots,
  advisorRecommendations,
  journalEntries,
  assetThesisRelatedMacroTheses,
  thesisExpressionEpisodes,
} from '@/db/schema';
import { and, eq, ne, inArray, isNotNull, asc, desc, sql } from 'drizzle-orm';
import {
  getAssetThesisPerformance,
  getMacroThesisPerformance,
  type ThesisPerformance,
} from '@/db/queries/thesisPerformance';
import { getArticulationHistory } from '@/db/queries/thesisSynthesis';
import { computeExcursion, windowCombined, type Excursion, type RetrospectiveMetrics } from '@/lib/derived/retrospectiveExcursion';

export type RetrospectiveEventKind =
  | 'open'
  | 'close'
  | 'mfe'
  | 'mae'
  | 'signal_verdict'
  | 'advisor_rec'
  | 'reunderwrite'
  | 'decision';

export type EventSeverity = 'positive' | 'neutral' | 'warning' | 'negative';

export interface RetrospectiveEvent {
  /** event's own date, YYYY-MM-DD */
  date: string;
  kind: RetrospectiveEventKind;
  label: string;
  detail?: string;
  severity: EventSeverity;
  /** nearest combined snapshot date ≤ event date — the x to pin a marker on the chart */
  chartDate: string | null;
  /** cumulative P&L at chartDate — the y to pin a marker */
  cumulativeAtDate: number | null;
}

export interface RetrospectiveWindow {
  open: string | null;
  close: string | null;
}

const CONF_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, very_high: 3 };

function day(d: Date | string | null): string | null {
  if (!d) return null;
  return (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
}

function effectiveEpisodeOpenDay(
  episodeNo: number | null | undefined,
  episodeOpenDay: string | null,
  seriesOpenDay: string | null,
): string | null {
  // Backfilled or late-linked strategies can predate the first lifecycle cascade
  // transition. For episode 1, include that already-linked performance history so
  // the resolved thesis page does not hide most of the real holding period.
  if (episodeNo === 1 && episodeOpenDay && seriesOpenDay && seriesOpenDay < episodeOpenDay) {
    return seriesOpenDay;
  }
  return episodeOpenDay;
}

function effectiveEpisodeCloseDay(
  episodeCloseDay: string | null,
  seriesCloseDay: string | null,
): string | null {
  // The lifecycle cascade can notice a closed expression after the final
  // strategy snapshot/trade date. Stop the retrospective window at the final
  // performance point so charts and duration describe the actual hold.
  if (episodeCloseDay && seriesCloseDay && seriesCloseDay < episodeCloseDay) {
    return seriesCloseDay;
  }
  return episodeCloseDay;
}

/** Snap an event date onto the combined series: nearest point with date ≤ event date (else the first). */
function snapToSeries(
  eventDay: string,
  combined: ThesisPerformance['combined']
): { chartDate: string | null; cumulativeAtDate: number | null } {
  if (combined.length === 0) return { chartDate: null, cumulativeAtDate: null };
  let chosen = combined[0];
  for (const p of combined) {
    if (p.date <= eventDay) chosen = p;
    else break;
  }
  return { chartDate: chosen.date, cumulativeAtDate: chosen.cumulative };
}

/** `col >= open AND col < close + 1 day` — inclusive of the full close day. */
function inWindow(col: unknown, open: string, close: string) {
  return sql`${col} >= ${open}::timestamptz AND ${col} < ((${close}::date) + interval '1 day')`;
}

const SIGNAL_VERDICT_SEVERITY: Record<string, EventSeverity> = {
  strengthening: 'positive',
  confirmed: 'positive',
  weakening: 'warning',
  invalidated: 'negative',
};

const ADVISOR_SCENARIO_LABEL: Record<string, string> = {
  hedge: 'Hedge',
  income: 'Covered-call / income',
  put_entry: 'Put entry',
  opportunistic: 'Opportunistic',
};

/**
 * Build the timeline of process events for a thesis over the hold window, each snapped
 * onto the excursion curve. Shared by getRetrospectiveView (UI) and
 * gatherRetrospectiveContext (the skill narrative).
 */
export async function assembleRetrospectiveEvents(
  thesisId: string,
  thesisType: 'macro' | 'asset',
  window: RetrospectiveWindow,
  combined: ThesisPerformance['combined']
): Promise<RetrospectiveEvent[]> {
  const events: RetrospectiveEvent[] = [];
  const { open, close } = window;

  // --- Excursion anchors (open / close / MFE / MAE) ---
  if (combined.length > 0) {
    const excursion = computeExcursion(combined);
    const first = combined[0];
    const last = combined[combined.length - 1];
    events.push({
      date: first.date,
      kind: 'open',
      label: 'Opened',
      detail: 'first strategy snapshot',
      severity: 'neutral',
      chartDate: first.date,
      cumulativeAtDate: first.cumulative,
    });
    if (excursion.maeDate) {
      events.push({
        date: excursion.maeDate,
        kind: 'mae',
        label: `Max drawdown ${fmtSigned(excursion.mae)}`,
        detail: 'maximum adverse excursion',
        severity: excursion.mae < 0 ? 'negative' : 'neutral',
        chartDate: excursion.maeDate,
        cumulativeAtDate: excursion.mae,
      });
    }
    if (excursion.mfeDate) {
      events.push({
        date: excursion.mfeDate,
        kind: 'mfe',
        label: `Peak ${fmtSigned(excursion.mfe)}`,
        detail: 'maximum favorable excursion',
        severity: excursion.mfe > 0 ? 'positive' : 'neutral',
        chartDate: excursion.mfeDate,
        cumulativeAtDate: excursion.mfe,
      });
    }
    events.push({
      date: last.date,
      kind: 'close',
      label: `Closed ${fmtSigned(last.cumulative)}`,
      detail:
        excursion.giveBackFromPeak && excursion.giveBackFromPeak > 0
          ? `gave back ${fmtSigned(-excursion.giveBackFromPeak)} from the peak`
          : undefined,
      severity: 'neutral',
      chartDate: last.date,
      cumulativeAtDate: last.cumulative,
    });
  }

  if (!open || !close) {
    return events.sort(byDate);
  }

  // --- Signal verdict flips (material assessments) ---
  // A signal that stays 'strengthening' for weeks should be ONE event (when it first
  // flipped), not one per daily snapshot. Collapse to per-signal verdict TRANSITIONS,
  // then dedupe identical (date, type, assessment, statement) tuples — guards against
  // duplicate signal rows (a thesis can carry several signals with the same statement).
  const verdictRows = await db
    .select({
      signalId: signalDataSnapshots.signalId,
      snapshotDate: signalDataSnapshots.snapshotDate,
      assessment: signalDataSnapshots.assessment,
      evidenceSummary: signalDataSnapshots.evidenceSummary,
      signalType: signals.type,
      statement: signals.statement,
    })
    .from(signalDataSnapshots)
    .innerJoin(signals, eq(signals.id, signalDataSnapshots.signalId))
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signals.id))
    .where(
      and(
        eq(signalEntityLinks.thesisId, thesisId),
        eq(signalEntityLinks.thesisType, thesisType),
        isNotNull(signalDataSnapshots.assessment),
        ne(signalDataSnapshots.assessment, 'neutral'),
        inWindow(signalDataSnapshots.snapshotDate, open, close)
      )
    )
    .orderBy(signalDataSnapshots.signalId, signalDataSnapshots.snapshotDate);
  const prevBySignal = new Map<string, string>();
  const seenVerdict = new Set<string>();
  for (const r of verdictRows) {
    const a = r.assessment ?? '';
    if (prevBySignal.get(r.signalId) === a) continue; // no change for this signal
    prevBySignal.set(r.signalId, a);
    const d = day(r.snapshotDate)!;
    const key = `${d}|${r.signalType}|${a}|${r.statement ?? ''}`;
    if (seenVerdict.has(key)) continue;
    seenVerdict.add(key);
    events.push({
      date: d,
      kind: 'signal_verdict',
      label: `${r.signalType ?? 'signal'} signal → ${a}`,
      detail: r.statement ?? r.evidenceSummary ?? undefined,
      severity: SIGNAL_VERDICT_SEVERITY[a] ?? 'neutral',
      ...snapToSeries(d, combined),
    });
  }

  // --- Advisor recommendations for the underlying(s) ---
  const underlyingIds = await resolveUnderlyingIds(thesisId, thesisType);
  if (underlyingIds.length > 0) {
    const recRows = await db
      .select({
        createdAt: advisorRecommendations.createdAt,
        scenario: advisorRecommendations.scenario,
        status: advisorRecommendations.status,
        ticker: advisorRecommendations.ticker,
      })
      .from(advisorRecommendations)
      .where(
        and(
          inArray(advisorRecommendations.underlyingId, underlyingIds),
          inWindow(advisorRecommendations.createdAt, open, close)
        )
      )
      .orderBy(advisorRecommendations.createdAt);
    for (const r of recRows) {
      const d = day(r.createdAt)!;
      const scenarioLabel = ADVISOR_SCENARIO_LABEL[r.scenario] ?? r.scenario;
      const unactionedProtection =
        (r.scenario === 'hedge' || r.scenario === 'income') &&
        ['dismissed', 'expired', 'superseded'].includes(r.status);
      events.push({
        date: d,
        kind: 'advisor_rec',
        label: `${scenarioLabel} suggested`,
        detail: r.status === 'acted' ? 'acted on' : `${r.status}${unactionedProtection ? ' — not taken' : ''}`,
        severity: r.status === 'acted' ? 'positive' : unactionedProtection ? 'warning' : 'neutral',
        ...snapToSeries(d, combined),
      });
    }
  }

  // --- Conviction trajectory (articulation re-underwrites) ---
  const articulations = (await getArticulationHistory(thesisId, thesisType))
    .slice()
    .sort((a, b) => a.version - b.version);
  let prevConf: string | null = null;
  for (const a of articulations) {
    const d = day(a.createdAt)!;
    if (d < open || d > close) {
      prevConf = a.confidenceLevel;
      continue;
    }
    let dir = '';
    if (prevConf && a.confidenceLevel) {
      const delta = (CONF_RANK[a.confidenceLevel] ?? 0) - (CONF_RANK[prevConf] ?? 0);
      dir = delta > 0 ? ` (raised from ${prevConf})` : delta < 0 ? ` (cut from ${prevConf})` : '';
    }
    events.push({
      date: d,
      kind: 'reunderwrite',
      label: `Re-underwritten — conviction ${a.confidenceLevel ?? 'n/a'} (v${a.version})`,
      detail: dir || undefined,
      severity: 'neutral',
      ...snapToSeries(d, combined),
    });
    prevConf = a.confidenceLevel;
  }

  // --- Raised decisions + resolution ---
  const decisionRows = await db
    .select({
      timestamp: journalEntries.timestamp,
      actionDescription: journalEntries.actionDescription,
      status: journalEntries.status,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.objectId, thesisId),
        eq(journalEntries.actionType, 'decision_required'),
        inWindow(journalEntries.timestamp, open, close)
      )
    )
    .orderBy(journalEntries.timestamp);
  for (const r of decisionRows) {
    const d = day(r.timestamp)!;
    events.push({
      date: d,
      kind: 'decision',
      label: `Decision: ${r.actionDescription}`,
      detail: r.status ? `${r.status}` : undefined,
      severity: r.status === 'dismissed' ? 'warning' : r.status === 'resolved' ? 'positive' : 'neutral',
      ...snapToSeries(d, combined),
    });
  }

  return events.sort(byDate);
}

/**
 * Who carried the P&L — the attribution breakdown. For an asset thesis these are its
 * strategies; for a macro (two layers removed from execution) they are its linked asset
 * theses, each carrying the full P&L of its own strategies (D8 exposure view).
 */
export interface RetrospectiveContributor {
  label: string;
  ticker: string | null;
  /** final cumulative P&L attributed to this contributor */
  finalCumulative: number;
  /** share of the total gross movement (|contribution| / Σ|contributions|), 0–100 */
  pctOfGross: number;
  kind: 'strategy' | 'asset_thesis';
}

/** A prior (non-latest) closed episode — the collapsible history under the primary retrospective. */
export interface RetrospectiveEpisodeSummary {
  episodeNo: number;
  openedAt: string | null;
  closedAt: string | null;
  closingStatus: string | null;
  outcome: string | null;
  executionQuality: string | null;
  /** frozen excursion metrics for the mini display (from the episode's retrospective_metrics) */
  metrics: RetrospectiveMetrics | null;
  retrospectiveAt: string | null;
}

export interface RetrospectiveView {
  thesis: {
    id: string;
    thesisType: 'macro' | 'asset';
    title: string;
    ticker: string | null;
    status: string;
    direction: string | null;
    outcome: string | null;
  };
  excursion: Excursion;
  /** the daily cumulative series, for the annotated chart */
  combined: ThesisPerformance['combined'];
  events: RetrospectiveEvent[];
  /** attribution: which strategies (asset) / asset theses (macro) carried the result */
  contributors: RetrospectiveContributor[];
  executionQuality: string | null;
  /** retrospective narrative — the journal entry rationale, falling back to outcome_notes */
  narrative: string | null;
  headline: string | null;
  retrospectiveAt: string | null;
  window: RetrospectiveWindow;
  /** which expression episode the primary view is scoped to (null = legacy whole-life / no episodes) */
  episodeNo: number | null;
  /** prior closed episodes (episodeNo < primary), most-recent first — the collapsible history */
  priorEpisodes: RetrospectiveEpisodeSummary[];
}

/** Everything the per-thesis RetrospectivePanel needs. Returns null if the thesis isn't found. */
export async function getRetrospectiveView(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<RetrospectiveView | null> {
  const base = await loadThesisBase(thesisId, thesisType);
  if (!base) return null;

  // Per-thesis perf + the attribution legs. Asset → per-strategy; macro →
  // per-linked-asset-thesis (full-credit exposure view, D8).
  let perf: ThesisPerformance;
  let lifetimeContributors: Array<{ label: string; ticker: string | null; finalCumulative: number; kind: 'strategy' | 'asset_thesis' }>;
  if (thesisType === 'macro') {
    const mp = await getMacroThesisPerformance(thesisId);
    perf = mp;
    lifetimeContributors = mp.assetTheses.map((a) => ({
      label: a.title ?? a.ticker ?? 'asset thesis',
      ticker: a.ticker,
      finalCumulative: a.latestCumulative,
      kind: 'asset_thesis' as const,
    }));
  } else {
    perf = await getAssetThesisPerformance(thesisId);
    lifetimeContributors = perf.strategies.map((s) => ({
      label: s.strategyKey ?? s.strategyId.slice(0, 8),
      ticker: null,
      finalCumulative: s.latest?.cumulative ?? 0,
      kind: 'strategy' as const,
    }));
  }

  // Expression episodes: the primary retrospective is the LATEST episode; earlier closed
  // episodes become the collapsible history. A thesis with no cascade trail (legacy) has no
  // episodes → fall back to the whole-life view (docs/v2/13 §2).
  const episodeRows = await db
    .select({
      episodeNo: thesisExpressionEpisodes.episodeNo,
      openedAt: thesisExpressionEpisodes.openedAt,
      closedAt: thesisExpressionEpisodes.closedAt,
      closingStatus: thesisExpressionEpisodes.closingStatus,
      outcome: thesisExpressionEpisodes.outcome,
      outcomeNotes: thesisExpressionEpisodes.outcomeNotes,
      executionQuality: thesisExpressionEpisodes.executionQuality,
      retrospectiveMetrics: thesisExpressionEpisodes.retrospectiveMetrics,
      retrospectiveAt: thesisExpressionEpisodes.retrospectiveAt,
    })
    .from(thesisExpressionEpisodes)
    .where(and(eq(thesisExpressionEpisodes.thesisId, thesisId), eq(thesisExpressionEpisodes.thesisType, thesisType)))
    .orderBy(asc(thesisExpressionEpisodes.episodeNo));
  const primary = episodeRows.length > 0 ? episodeRows[episodeRows.length - 1] : null;

  // Window (+ rebase) the series to the primary episode; else the whole hold (legacy).
  const seriesOpen = perf.combined.length > 0 ? perf.combined[0].date : null;
  const seriesClose = perf.combined.length > 0 ? perf.combined[perf.combined.length - 1].date : null;
  const open = primary
    ? effectiveEpisodeOpenDay(primary.episodeNo, day(primary.openedAt), seriesOpen)
    : seriesOpen ?? day(base.createdAt);
  const close = primary
    ? effectiveEpisodeCloseDay(primary.closedAt ? day(primary.closedAt) : null, seriesClose)
    : perf.combined.length > 0
      ? seriesClose
      : base.actualOutcomeDate ?? day(base.updatedAt);
  const combined = primary && open ? windowCombined(perf.combined, open, close) : perf.combined;
  const window: RetrospectiveWindow = { open, close };

  const excursion = computeExcursion(combined);

  // Contributors — windowed per-strategy for an asset episode (each leg's own rebased
  // contribution); lifetime otherwise (macro exposure view / legacy no-episode).
  let rawContributors = lifetimeContributors;
  if (primary && open && thesisType === 'asset') {
    rawContributors = perf.strategies.map((s) => {
      const pts = s.points
        .filter((p) => p.cumulative != null)
        .map((p) => ({ date: p.date, cumulative: p.cumulative as number }));
      const w = windowCombined(pts, open, close);
      return {
        label: s.strategyKey ?? s.strategyId.slice(0, 8),
        ticker: null as string | null,
        finalCumulative: w.length > 0 ? w[w.length - 1].cumulative : 0,
        kind: 'strategy' as const,
      };
    });
  }
  const gross = rawContributors.reduce((sum, c) => sum + Math.abs(c.finalCumulative), 0);
  const contributors: RetrospectiveContributor[] = rawContributors
    .map((c) => ({ ...c, pctOfGross: gross > 0 ? Math.round((100 * Math.abs(c.finalCumulative)) / gross) : 0 }))
    .sort((a, b) => Math.abs(b.finalCumulative) - Math.abs(a.finalCumulative));

  const events = await assembleRetrospectiveEvents(thesisId, thesisType, window, combined);

  // Verdict + narrative: from the primary episode when present; else thesis-level + the latest
  // retrospective journal entry (legacy / no-episode). The journal carries the headline.
  const [retro] = await db
    .select({
      headline: journalEntries.actionDescription,
      rationale: journalEntries.rationale,
      timestamp: journalEntries.timestamp,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.objectId, thesisId), eq(journalEntries.actionType, 'retrospective')))
    .orderBy(desc(journalEntries.timestamp))
    .limit(1);

  const metrics = (primary ? primary.retrospectiveMetrics : base.retrospectiveMetrics) as RetrospectiveMetrics | null;
  const outcome = primary?.outcome ?? base.outcome;
  const executionQuality = (primary?.executionQuality ?? metrics?.executionQuality) ?? null;
  const narrative = primary?.outcomeNotes ?? retro?.rationale ?? base.outcomeNotes ?? null;
  const retrospectiveAt = primary?.retrospectiveAt ? day(primary.retrospectiveAt) : retro ? day(retro.timestamp) : null;

  const priorEpisodes: RetrospectiveEpisodeSummary[] = primary
    ? episodeRows
        .filter((e) => e.episodeNo !== primary.episodeNo && e.closedAt != null)
        .sort((a, b) => b.episodeNo - a.episodeNo)
        .map((e) => ({
          episodeNo: e.episodeNo,
          openedAt: day(e.openedAt),
          closedAt: day(e.closedAt),
          closingStatus: e.closingStatus,
          outcome: e.outcome,
          executionQuality: e.executionQuality,
          metrics: (e.retrospectiveMetrics as RetrospectiveMetrics | null) ?? null,
          retrospectiveAt: e.retrospectiveAt ? day(e.retrospectiveAt) : null,
        }))
    : [];

  return {
    thesis: {
      id: thesisId,
      thesisType,
      title: base.title,
      ticker: base.ticker,
      status: base.status,
      direction: base.direction,
      outcome,
    },
    excursion,
    combined,
    events,
    contributors,
    executionQuality,
    narrative,
    headline: retro?.headline ?? null,
    retrospectiveAt,
    window,
    episodeNo: primary?.episodeNo ?? null,
    priorEpisodes,
  };
}

// --- helpers ---

function byDate(a: RetrospectiveEvent, b: RetrospectiveEvent): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function fmtSigned(v: number): string {
  const abs = Math.abs(v);
  const compact = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  return (v < 0 ? '−' : '+') + compact;
}

interface ThesisBase {
  title: string;
  ticker: string | null;
  status: string;
  direction: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
  retrospectiveMetrics: unknown;
  createdAt: Date;
  updatedAt: Date;
  actualOutcomeDate: string | null;
}

async function loadThesisBase(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<ThesisBase | null> {
  if (thesisType === 'macro') {
    const [m] = await db
      .select({
        title: macroTheses.title,
        status: macroTheses.status,
        direction: macroTheses.direction,
        outcome: macroTheses.outcome,
        outcomeNotes: macroTheses.outcomeNotes,
        retrospectiveMetrics: macroTheses.retrospectiveMetrics,
        createdAt: macroTheses.createdAt,
        updatedAt: macroTheses.updatedAt,
        actualOutcomeDate: macroTheses.actualOutcomeDate,
      })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);
    return m ? { ...m, ticker: null } : null;
  }
  const [a] = await db
    .select({
      title: assetTheses.title,
      status: assetTheses.status,
      direction: assetTheses.direction,
      outcome: assetTheses.outcome,
      outcomeNotes: assetTheses.outcomeNotes,
      retrospectiveMetrics: assetTheses.retrospectiveMetrics,
      createdAt: assetTheses.createdAt,
      updatedAt: assetTheses.updatedAt,
      actualOutcomeDate: assetTheses.actualOutcomeDate,
      ticker: underlyings.ticker,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(eq(assetTheses.id, thesisId))
    .limit(1);
  return a ?? null;
}

/** Underlying ids whose advisor recs are relevant: the asset's own, or a macro's linked assets'. */
async function resolveUnderlyingIds(
  thesisId: string,
  thesisType: 'macro' | 'asset'
): Promise<string[]> {
  if (thesisType === 'asset') {
    const [a] = await db
      .select({ underlyingId: assetTheses.underlyingId })
      .from(assetTheses)
      .where(eq(assetTheses.id, thesisId))
      .limit(1);
    return a?.underlyingId ? [a.underlyingId] : [];
  }
  const rows = await db
    .select({ underlyingId: assetTheses.underlyingId })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, thesisId));
  return [...new Set(rows.map((r) => r.underlyingId).filter(Boolean) as string[])];
}
