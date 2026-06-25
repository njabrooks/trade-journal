/**
 * Retrospective-on-close — DB layer (W8 — docs/v2/07 §4d, B7).
 *
 *   1. findThesesNeedingRetrospective — resolved theses (closed/complete/rejected)
 *      that don't yet have a retrospective journal entry.
 *   2. gatherRetrospectiveContext — the inputs for "was I right, did it pay": final
 *      P&L (W4 engine via thesisPerformance), duration, the belief (latest digest),
 *      the final signal tally, and the journal-trail size.
 *
 * The narrative is the thesis-review skill (retrospective mode); it writes via
 * scripts/record-retrospective.ts, which appends the journal entry, sets
 * outcome/outcome_notes (surfaced by the W5 RetrospectiveCard), and supersedes any
 * still-active signals (monitoring is over).
 */
import { db } from '@/db';
import { macroTheses, assetTheses, underlyings, thesisArticulations, signals as signalsTable, signalEntityLinks, journalEntries } from '@/db/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { needsRetrospective, RETROSPECTIVE_STATUSES } from '@/lib/derived/retrospectiveRules';
import { getAssetThesisPerformance, getMacroThesisPerformance } from '@/db/queries/thesisPerformance';
import { computeExcursion, type Excursion } from '@/lib/derived/retrospectiveExcursion';
import { assembleRetrospectiveEvents, type RetrospectiveEvent } from '@/db/queries/retrospectiveView';

export { needsRetrospective, RETROSPECTIVE_STATUSES } from '@/lib/derived/retrospectiveRules';

export interface RetrospectiveItem {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  status: string;
  ticker: string | null;
}

/** Thesis ids that already have a retrospective journal entry. */
async function thesesWithRetrospective(): Promise<Set<string>> {
  const rows = await db
    .select({ objectId: journalEntries.objectId })
    .from(journalEntries)
    .where(eq(journalEntries.actionType, 'retrospective'));
  return new Set(rows.map((r) => r.objectId).filter(Boolean) as string[]);
}

export async function findThesesNeedingRetrospective(): Promise<RetrospectiveItem[]> {
  const done = await thesesWithRetrospective();
  const macroRows = await db
    .select({ thesisId: macroTheses.id, title: macroTheses.title, status: macroTheses.status })
    .from(macroTheses)
    .where(inArray(macroTheses.status, RETROSPECTIVE_STATUSES));
  const assetRows = await db
    .select({ thesisId: assetTheses.id, title: assetTheses.title, status: assetTheses.status, ticker: underlyings.ticker })
    .from(assetTheses)
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(inArray(assetTheses.status, RETROSPECTIVE_STATUSES));

  const items: RetrospectiveItem[] = [];
  for (const r of [
    ...macroRows.map((m) => ({ ...m, thesisType: 'macro' as const, ticker: null as string | null })),
    ...assetRows.map((a) => ({ ...a, thesisType: 'asset' as const })),
  ]) {
    if (needsRetrospective({ status: r.status, hasRetrospective: done.has(r.thesisId) })) {
      items.push({ thesisId: r.thesisId, thesisType: r.thesisType, title: r.title, status: r.status, ticker: r.ticker });
    }
  }
  return items;
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
    openedAt: string | null;
    closedAt: string | null;
    durationDays: number | null;
  };
  performance: { latestCumulative: number; latestRealized: number; latestUnrealized: number; confidence: string };
  /** Execution axis — favorable/adverse excursion over the hold (MFE/MAE/capture). */
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
  const excursion = computeExcursion(perf.combined);

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

  // Prefer the P&L series for open/close (when the position was actually held) over
  // createdAt/updatedAt — actual_outcome_date is often unset on these closed theses,
  // and updatedAt is "now", which would massively overstate duration.
  const firstPerfDate = perf.combined.length > 0 ? perf.combined[0].date : null;
  const lastPerfDate = perf.combined.length > 0 ? perf.combined[perf.combined.length - 1].date : null;
  const openedAt = firstPerfDate
    ? new Date(firstPerfDate).toISOString()
    : base.createdAt
      ? new Date(base.createdAt).toISOString()
      : null;
  const closedAt = base.actualOutcomeDate
    ? new Date(base.actualOutcomeDate).toISOString()
    : lastPerfDate
      ? new Date(lastPerfDate).toISOString()
      : base.updatedAt
        ? new Date(base.updatedAt).toISOString()
        : null;
  const durationDays =
    openedAt && closedAt ? Math.max(0, Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 86_400_000)) : null;

  const events = await assembleRetrospectiveEvents(
    thesisId,
    thesisType,
    { open: openedAt ? openedAt.slice(0, 10) : null, close: closedAt ? closedAt.slice(0, 10) : null },
    perf.combined
  );

  return {
    thesis: {
      id: thesisId,
      thesisType,
      title: base.title,
      direction: base.direction,
      status: base.status,
      ticker: base.ticker,
      outcome: base.outcome,
      openedAt,
      closedAt,
      durationDays,
    },
    performance: {
      latestCumulative: perf.totals.latestCumulative,
      latestRealized: perf.totals.latestRealized,
      latestUnrealized: perf.totals.latestUnrealized,
      confidence: perf.totals.confidence,
    },
    excursion,
    events,
    coreArgument: digest?.coreArgument ?? null,
    signalsByStatus,
    journalEntryCount: jc ? Number(jc.n) : 0,
  };
}
