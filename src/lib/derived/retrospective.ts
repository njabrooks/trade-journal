/**
 * Retrospective-on-close — DB layer (W8 — docs/v2/07 §4d, B7; episodic — docs/v2/13 §2).
 *
 *   1. findThesesNeedingRetrospective — CLOSED expression episodes (a contiguous monitoring
 *      span that has ended) without a retrospective recorded yet. A thesis that closes and
 *      re-expresses gets one retrospective PER holding period, not one across its whole life.
 *   2. gatherRetrospectiveContext — the inputs for "was I right, did it pay" over a single
 *      episode window: final P&L (W4 engine via thesisPerformance), duration, the belief
 *      (latest digest), the final signal tally, the journal-trail size — with excursion and
 *      the event timeline windowed (and rebased) to the episode.
 *
 * The narrative is the thesis-review skill (retrospective mode); it writes via
 * scripts/record-retrospective.ts, which records the per-episode retrospective on the episode
 * row, appends the journal entry, mirrors outcome/notes to the thesis, and supersedes any
 * still-active signals (monitoring for that episode is over).
 */
import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  underlyings,
  thesisArticulations,
  signals as signalsTable,
  signalEntityLinks,
  journalEntries,
  thesisExpressionEpisodes,
} from '@/db/schema';
import { eq, and, sql, desc, asc, isNull, isNotNull } from 'drizzle-orm';
import { getAssetThesisPerformance, getMacroThesisPerformance } from '@/db/queries/thesisPerformance';
import { computeExcursion, windowCombined, type Excursion } from '@/lib/derived/retrospectiveExcursion';
import { assembleRetrospectiveEvents, type RetrospectiveEvent } from '@/db/queries/retrospectiveView';

export { needsRetrospective, RETROSPECTIVE_STATUSES } from '@/lib/derived/retrospectiveRules';

const r2 = (v: number): number => Math.round(v * 100) / 100;

function day(d: Date | string | null): string | null {
  if (!d) return null;
  return (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
}

function effectiveEpisodeOpenDay(
  episode: RetrospectiveEpisode | undefined,
  episodeOpenDay: string | null,
  seriesOpenDay: string | null,
): string | null {
  // Backfilled or late-linked strategies can predate the first lifecycle cascade
  // transition. For episode 1, include that already-linked performance history so a
  // retrospective does not collapse to the day the cascade first noticed the expression.
  if (episode?.episodeNo === 1 && episodeOpenDay && seriesOpenDay && seriesOpenDay < episodeOpenDay) {
    return seriesOpenDay;
  }
  return episodeOpenDay;
}

function effectiveEpisodeCloseDay(
  episodeCloseDay: string | null,
  seriesCloseDay: string | null,
): string | null {
  // The lifecycle cascade can notice a closed expression after the final
  // strategy snapshot/trade date. Retrospective windows should stop at the
  // final performance point so duration and event overlays describe the hold,
  // not the later bookkeeping transition.
  if (episodeCloseDay && seriesCloseDay && seriesCloseDay < episodeCloseDay) {
    return seriesCloseDay;
  }
  return episodeCloseDay;
}

export interface RetrospectiveItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  /** which expression episode (1-based) this retrospective is for */
  episodeNo: number;
  title: string;
  status: string;
  ticker: string | null;
  /** the episode window (YYYY-MM-DD) */
  openedAt: string | null;
  closedAt: string | null;
}

/** Closed expression episodes without a retrospective recorded yet — the retrospective worklist. */
export async function findThesesNeedingRetrospective(): Promise<RetrospectiveItem[]> {
  const macroRows = await db
    .select({
      thesisId: thesisExpressionEpisodes.thesisId,
      episodeNo: thesisExpressionEpisodes.episodeNo,
      openedAt: thesisExpressionEpisodes.openedAt,
      closedAt: thesisExpressionEpisodes.closedAt,
      title: macroTheses.title,
      status: macroTheses.status,
    })
    .from(thesisExpressionEpisodes)
    .innerJoin(macroTheses, eq(macroTheses.id, thesisExpressionEpisodes.thesisId))
    .where(
      and(
        eq(thesisExpressionEpisodes.thesisType, 'macro'),
        isNotNull(thesisExpressionEpisodes.closedAt),
        isNull(thesisExpressionEpisodes.retrospectiveAt),
      ),
    )
    .orderBy(asc(thesisExpressionEpisodes.closedAt));
  const assetRows = await db
    .select({
      thesisId: thesisExpressionEpisodes.thesisId,
      episodeNo: thesisExpressionEpisodes.episodeNo,
      openedAt: thesisExpressionEpisodes.openedAt,
      closedAt: thesisExpressionEpisodes.closedAt,
      title: assetTheses.title,
      status: assetTheses.status,
      ticker: underlyings.ticker,
    })
    .from(thesisExpressionEpisodes)
    .innerJoin(assetTheses, eq(assetTheses.id, thesisExpressionEpisodes.thesisId))
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(
      and(
        eq(thesisExpressionEpisodes.thesisType, 'asset'),
        isNotNull(thesisExpressionEpisodes.closedAt),
        isNull(thesisExpressionEpisodes.retrospectiveAt),
      ),
    )
    .orderBy(asc(thesisExpressionEpisodes.closedAt));

  const items: RetrospectiveItem[] = [];
  for (const m of macroRows) {
    items.push({ thesisId: m.thesisId, thesisType: 'macro', episodeNo: m.episodeNo, title: m.title, status: m.status, ticker: null, openedAt: day(m.openedAt), closedAt: day(m.closedAt) });
  }
  for (const a of assetRows) {
    items.push({ thesisId: a.thesisId, thesisType: 'asset', episodeNo: a.episodeNo, title: a.title, status: a.status, ticker: a.ticker, openedAt: day(a.openedAt), closedAt: day(a.closedAt) });
  }
  return items;
}

/** A single expression episode to scope the retrospective to. */
export interface RetrospectiveEpisode {
  episodeNo: number;
  /** monitoring-span boundaries (YYYY-MM-DD or ISO); closedAt null = still open */
  openedAt: string;
  closedAt: string | null;
}

/** Load one episode's window (for the skill's --context call). */
export async function loadEpisode(
  thesisId: string,
  thesisType: 'macro' | 'asset',
  episodeNo: number,
): Promise<RetrospectiveEpisode | null> {
  const [ep] = await db
    .select({ episodeNo: thesisExpressionEpisodes.episodeNo, openedAt: thesisExpressionEpisodes.openedAt, closedAt: thesisExpressionEpisodes.closedAt })
    .from(thesisExpressionEpisodes)
    .where(and(eq(thesisExpressionEpisodes.thesisId, thesisId), eq(thesisExpressionEpisodes.thesisType, thesisType), eq(thesisExpressionEpisodes.episodeNo, episodeNo)))
    .limit(1);
  return ep ? { episodeNo: ep.episodeNo, openedAt: ep.openedAt.toISOString(), closedAt: ep.closedAt ? ep.closedAt.toISOString() : null } : null;
}

export interface RetrospectiveContext {
  thesis: {
    id: string;
    thesisType: 'macro' | 'asset';
    title: string;
    direction: string | null;
    status: string;
    ticker: string | null;
    outcome: string | null;
    /** the episode this context is scoped to (null = whole-life fallback) */
    episodeNo: number | null;
    openedAt: string | null;
    closedAt: string | null;
    durationDays: number | null;
  };
  performance: { latestCumulative: number; latestRealized: number; latestUnrealized: number; confidence: string };
  /** Execution axis — favorable/adverse excursion over the episode (MFE/MAE/capture), rebased to the episode start. */
  excursion: Excursion;
  /** Process-artefact timeline aligned to the excursion (signals, advisor recs, re-underwrites, decisions). */
  events: RetrospectiveEvent[];
  /** The belief at the end — latest digest core argument. */
  coreArgument: string | null;
  /** Final signal tally by status (what the monitoring criteria looked like at close). */
  signalsByStatus: Record<string, number>;
  /** How much activity the thesis accumulated. */
  journalEntryCount: number;
}

export async function gatherRetrospectiveContext(
  thesisId: string,
  thesisType: 'macro' | 'asset',
  episode?: RetrospectiveEpisode,
): Promise<RetrospectiveContext | null> {
  let base: { title: string; direction: string | null; status: string; ticker: string | null; outcome: string | null; createdAt: Date; actualOutcomeDate: string | null; updatedAt: Date } | null = null;
  if (thesisType === 'macro') {
    const [m] = await db
      .select({ title: macroTheses.title, direction: macroTheses.direction, status: macroTheses.status, outcome: macroTheses.outcome, createdAt: macroTheses.createdAt, actualOutcomeDate: macroTheses.actualOutcomeDate, updatedAt: macroTheses.updatedAt })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);
    if (m) base = { ...m, ticker: null };
  } else {
    const [a] = await db
      .select({ title: assetTheses.title, direction: assetTheses.direction, status: assetTheses.status, outcome: assetTheses.outcome, createdAt: assetTheses.createdAt, actualOutcomeDate: assetTheses.actualOutcomeDate, updatedAt: assetTheses.updatedAt, ticker: underlyings.ticker })
      .from(assetTheses)
      .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
      .where(eq(assetTheses.id, thesisId))
      .limit(1);
    if (a) base = a;
  }
  if (!base) return null;

  const perf = thesisType === 'asset' ? await getAssetThesisPerformance(thesisId) : await getMacroThesisPerformance(thesisId);

  // Window (+ rebase) the P&L series to the episode when given; else the whole hold (legacy/no-episode).
  const seriesOpenDay = perf.combined.length > 0 ? perf.combined[0].date : null;
  const seriesCloseDay = perf.combined.length > 0 ? perf.combined[perf.combined.length - 1].date : null;
  const episodeOpenDay = episode ? day(episode.openedAt) : null;
  const openDay = episode
    ? effectiveEpisodeOpenDay(episode, episodeOpenDay, seriesOpenDay)
    : seriesOpenDay;
  const episodeCloseDay = episode?.closedAt ? day(episode.closedAt) : null;
  const closeDay = episode
    ? effectiveEpisodeCloseDay(episodeCloseDay, seriesCloseDay)
    : seriesCloseDay;
  const windowed = episode && openDay ? windowCombined(perf.combined, openDay, closeDay) : perf.combined;
  const excursion = computeExcursion(windowed);

  // Episode-scoped P&L summary — rebased like the excursion so an episode-2 retrospective
  // reports the episode's OWN P&L, not the lifetime total. realized carry-in is the realized
  // P&L banked before the episode opened (≈ the rebase baseline, since the thesis is flat between episodes).
  let perfSummary = { latestCumulative: perf.totals.latestCumulative, latestRealized: perf.totals.latestRealized, latestUnrealized: perf.totals.latestUnrealized, confidence: perf.totals.confidence as string };
  if (episode && windowed.length > 0 && openDay) {
    let realizedBaseline = 0;
    for (const c of perf.combined) {
      if (c.date < openDay) realizedBaseline = c.realizedToDate;
      else break;
    }
    const lastW = windowed[windowed.length - 1];
    const epRealized = r2(lastW.realizedToDate - realizedBaseline);
    const epUnreal = r2(lastW.unrealized);
    // latestCumulative tracks the (rebased) excursion final so the headline P&L never contradicts
    // the excursion; realized/unrealized are the best-effort rebased split (can be thin for a
    // sparse series whose snapshot carries cumulative but not its realized/unrealized components).
    perfSummary = { latestCumulative: excursion.finalCumulative, latestRealized: epRealized, latestUnrealized: epUnreal, confidence: excursion.confidence };
  }

  const [digest] = await db
    .select({ coreArgument: thesisArticulations.coreArgument })
    .from(thesisArticulations)
    .where(and(eq(thesisArticulations.thesisId, thesisId), eq(thesisArticulations.thesisType, thesisType)))
    .orderBy(desc(thesisArticulations.version))
    .limit(1);

  const sigRows = await db
    .select({ status: signalsTable.status, n: sql<number>`count(*)::int` })
    .from(signalsTable)
    .innerJoin(signalEntityLinks, eq(signalEntityLinks.signalId, signalsTable.id))
    .where(and(eq(signalEntityLinks.thesisId, thesisId), eq(signalEntityLinks.thesisType, thesisType)))
    .groupBy(signalsTable.status);
  const signalsByStatus: Record<string, number> = {};
  for (const r of sigRows) signalsByStatus[r.status] = Number(r.n);

  const [jc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(eq(journalEntries.objectId, thesisId));

  // Open/close for the context: the episode window, falling back to thesis lifecycle dates
  // (when never expressed / legacy) — never "now", which would overstate duration.
  const openedAt = openDay
    ? new Date(openDay).toISOString()
    : base.createdAt
      ? new Date(base.createdAt).toISOString()
      : null;
  const closedAt = closeDay
    ? new Date(closeDay).toISOString()
    : base.actualOutcomeDate
      ? new Date(base.actualOutcomeDate).toISOString()
      : base.updatedAt
        ? new Date(base.updatedAt).toISOString()
        : null;
  const durationDays =
    openedAt && closedAt ? Math.max(0, Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 86_400_000)) : null;

  const events = await assembleRetrospectiveEvents(thesisId, thesisType, { open: openDay, close: closeDay }, windowed);

  return {
    thesis: {
      id: thesisId,
      thesisType,
      title: base.title,
      direction: base.direction,
      status: base.status,
      ticker: base.ticker,
      outcome: base.outcome,
      episodeNo: episode?.episodeNo ?? null,
      openedAt,
      closedAt,
      durationDays,
    },
    performance: perfSummary,
    excursion,
    events,
    coreArgument: digest?.coreArgument ?? null,
    signalsByStatus,
    journalEntryCount: jc ? Number(jc.n) : 0,
  };
}
