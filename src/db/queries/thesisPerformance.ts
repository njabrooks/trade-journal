import { db } from '@/db';
import {
  strategies,
  strategyMetricsSnapshots,
  assetTheses,
  assetThesisRelatedMacroTheses,
  macroTheses,
  underlyings,
} from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

/**
 * W4 session 2 — thesis-level performance attribution (decision D8).
 *
 * Asset thesis: aggregates the daily strategy_metrics_snapshots of every
 * linked strategy. Macro thesis: FULL CREDIT to each linked asset thesis
 * (one asset thesis may feed several macros) — macro-level numbers are
 * EXPOSURE VIEWS and may double-count across macro theses; label them so.
 *
 * Confidence: a point inherits the weakest realized_confidence among the
 * strategies contributing to it ('full' > 'partial_history' > 'no_trades').
 * UI must badge anything not 'full' — flagged realized figures are partial
 * views, not truth (see docs/v2/05-w4-realized-pnl-design.md).
 */

export type RealizedConfidence = 'full' | 'partial_history' | 'no_trades';

export interface StrategyPerformanceSeries {
  strategyId: string;
  strategyKey: string | null;
  status: string | null;
  points: Array<{
    date: string;
    realizedToDate: number | null;
    unrealized: number | null;
    cumulative: number | null;
  }>;
  latest: {
    date: string;
    realizedToDate: number | null;
    unrealized: number | null;
    cumulative: number | null;
    confidence: RealizedConfidence | null;
  } | null;
}

export interface ThesisPerformance {
  /** per-strategy daily series, for stacked/overlaid charts */
  strategies: StrategyPerformanceSeries[];
  /** combined per-date totals across contributing strategies */
  combined: Array<{
    date: string;
    realizedToDate: number;
    unrealized: number;
    cumulative: number;
    /** weakest contributing confidence on this date */
    confidence: RealizedConfidence;
    /** strategies with a snapshot on this date */
    strategyCount: number;
  }>;
  totals: {
    latestCumulative: number;
    latestRealized: number;
    latestUnrealized: number;
    confidence: RealizedConfidence;
  };
}

const CONFIDENCE_RANK: Record<RealizedConfidence, number> = {
  full: 0,
  partial_history: 1,
  no_trades: 2,
};

function weakest(a: RealizedConfidence, b: RealizedConfidence): RealizedConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function n(v: string | null): number | null {
  if (v === null || v === undefined) return null;
  const x = parseFloat(v);
  return isNaN(x) ? null : x;
}

async function performanceForStrategyIds(strategyIds: string[]): Promise<ThesisPerformance> {
  if (strategyIds.length === 0) {
    return {
      strategies: [],
      combined: [],
      totals: { latestCumulative: 0, latestRealized: 0, latestUnrealized: 0, confidence: 'no_trades' },
    };
  }

  const stratRows = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      status: strategies.status,
    })
    .from(strategies)
    .where(inArray(strategies.id, strategyIds));

  // Snapshots are per (account, strategy, date); sum across accounts per
  // (strategy, date). Confidence per date = weakest across accounts.
  const snapRows = await db
    .select({
      strategyId: strategyMetricsSnapshots.strategyId,
      snapshotDate: strategyMetricsSnapshots.snapshotDate,
      realized: sql<string | null>`SUM(${strategyMetricsSnapshots.realizedPnlToDate})`,
      unrealized: sql<string | null>`SUM(${strategyMetricsSnapshots.totalUnrealizedPnl})`,
      cumulative: sql<string | null>`SUM(${strategyMetricsSnapshots.cumulativePnl})`,
      confidence: sql<string | null>`MAX(${strategyMetricsSnapshots.realizedConfidence})`,
    })
    .from(strategyMetricsSnapshots)
    .where(inArray(strategyMetricsSnapshots.strategyId, strategyIds))
    .groupBy(strategyMetricsSnapshots.strategyId, strategyMetricsSnapshots.snapshotDate)
    .orderBy(strategyMetricsSnapshots.snapshotDate);

  const byStrategy = new Map<string, StrategyPerformanceSeries>();
  for (const s of stratRows) {
    byStrategy.set(s.id, {
      strategyId: s.id,
      strategyKey: s.strategyKey,
      status: s.status,
      points: [],
      latest: null,
    });
  }

  // Note: SQL MAX over the confidence text happens to surface a non-'full'
  // value whenever any account-row is degraded ('partial_history' and
  // 'no_trades' both sort after 'full'), which is the property we need —
  // exact weakest-rank ordering across accounts is then applied in JS.
  const combinedByDate = new Map<
    string,
    { realized: number; unrealized: number; cumulative: number; confidence: RealizedConfidence; count: number }
  >();

  for (const row of snapRows) {
    const series = byStrategy.get(row.strategyId);
    if (!series || !row.snapshotDate) continue;
    const conf = (row.confidence as RealizedConfidence | null) ?? 'no_trades';
    const point = {
      date: row.snapshotDate,
      realizedToDate: n(row.realized),
      unrealized: n(row.unrealized),
      cumulative: n(row.cumulative),
    };
    series.points.push(point);
    series.latest = { ...point, confidence: conf };

    const agg = combinedByDate.get(row.snapshotDate) ?? {
      realized: 0,
      unrealized: 0,
      cumulative: 0,
      confidence: 'full' as RealizedConfidence,
      count: 0,
    };
    agg.realized += point.realizedToDate ?? 0;
    agg.unrealized += point.unrealized ?? 0;
    agg.cumulative += point.cumulative ?? 0;
    agg.confidence = weakest(agg.confidence, conf);
    agg.count += 1;
    combinedByDate.set(row.snapshotDate, agg);
  }

  const combined = [...combinedByDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      realizedToDate: Math.round(v.realized * 100) / 100,
      unrealized: Math.round(v.unrealized * 100) / 100,
      cumulative: Math.round(v.cumulative * 100) / 100,
      confidence: v.confidence,
      strategyCount: v.count,
    }));

  // Totals: latest cumulative per strategy summed (strategies end on
  // different dates — a closed strategy's last snapshot still counts).
  let latestCumulative = 0;
  let latestRealized = 0;
  let latestUnrealized = 0;
  let confidence: RealizedConfidence = 'full';
  let any = false;
  for (const series of byStrategy.values()) {
    if (!series.latest) continue;
    any = true;
    latestCumulative += series.latest.cumulative ?? 0;
    latestRealized += series.latest.realizedToDate ?? 0;
    latestUnrealized += series.latest.unrealized ?? 0;
    confidence = weakest(confidence, series.latest.confidence ?? 'no_trades');
  }

  return {
    strategies: [...byStrategy.values()].filter((s) => s.points.length > 0),
    combined,
    totals: {
      latestCumulative: Math.round(latestCumulative * 100) / 100,
      latestRealized: Math.round(latestRealized * 100) / 100,
      latestUnrealized: Math.round(latestUnrealized * 100) / 100,
      confidence: any ? confidence : 'no_trades',
    },
  };
}

/** Performance of all strategies linked to an asset thesis. */
export async function getAssetThesisPerformance(assetThesisId: string): Promise<ThesisPerformance> {
  const linked = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(eq(strategies.assetThesisId, assetThesisId));
  return performanceForStrategyIds(linked.map((s) => s.id));
}

export interface MacroThesisPerformance extends ThesisPerformance {
  /** per asset-thesis totals for the breakdown table */
  assetTheses: Array<{
    assetThesisId: string;
    title: string | null;
    ticker: string | null;
    latestCumulative: number;
    latestRealized: number;
    confidence: RealizedConfidence;
    strategyCount: number;
  }>;
  /** D8: full credit to each linked macro — sums can double-count across macros */
  attributionNote: 'exposure_view_full_credit';
}

/**
 * Performance of all strategies under all asset theses linked to a macro
 * thesis. Full credit (D8): every linked asset thesis contributes its whole
 * P&L; the macro number is an exposure view, not an additive portfolio share.
 */
export async function getMacroThesisPerformance(macroThesisId: string): Promise<MacroThesisPerformance> {
  const linkedTheses = await db
    .select({
      assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
      title: assetTheses.title,
      ticker: underlyings.ticker,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetTheses.id, assetThesisRelatedMacroTheses.assetThesisId))
    .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, macroThesisId));

  const perThesis = await Promise.all(
    linkedTheses.map(async (t) => ({
      meta: t,
      perf: await getAssetThesisPerformance(t.assetThesisId),
    }))
  );

  const allStrategyIds = new Set<string>();
  const assetThesisSummaries = perThesis.map(({ meta, perf }) => {
    perf.strategies.forEach((s) => allStrategyIds.add(s.strategyId));
    return {
      assetThesisId: meta.assetThesisId,
      title: meta.title,
      ticker: meta.ticker,
      latestCumulative: perf.totals.latestCumulative,
      latestRealized: perf.totals.latestRealized,
      confidence: perf.totals.confidence,
      strategyCount: perf.strategies.length,
    };
  });

  const combinedPerf = await performanceForStrategyIds([...allStrategyIds]);

  return {
    ...combinedPerf,
    assetTheses: assetThesisSummaries.sort((a, b) => b.latestCumulative - a.latestCumulative),
    attributionNote: 'exposure_view_full_credit',
  };
}

// ---------------------------------------------------------------------------
// W5 — performance section overview (one pass for the /performance page)
// ---------------------------------------------------------------------------

export interface ThesisPerformanceSummary {
  thesisId: string;
  thesisType: 'asset' | 'macro';
  title: string;
  ticker: string | null; // asset theses only
  status: string;
  direction: string | null;
  strategyCount: number;
  latestCumulative: number;
  latestRealized: number;
  latestUnrealized: number;
  confidence: RealizedConfidence;
  firstSnapshotDate: string | null;
  latestSnapshotDate: string | null;
  // retrospective fields ("was I right, did it pay")
  outcome: string | null;
  outcomeNotes: string | null;
  createdAt: string;
  actualOutcomeDate: string | null;
  updatedAt: string;
}

export interface MacroThesisPerformanceSummary extends ThesisPerformanceSummary {
  assetThesisCount: number;
}

export interface PerformanceOverview {
  /** asset theses with at least one snapshotted strategy, by cumulative desc */
  assetTheses: ThesisPerformanceSummary[];
  /** macro theses with linked performing asset theses — full-credit exposure views */
  macroTheses: MacroThesisPerformanceSummary[];
  /** completed/rejected theses (either kind), even without strategies */
  retrospectives: ThesisPerformanceSummary[];
  attributionNote: 'exposure_view_full_credit';
}

const CLOSED_STATUSES = ['complete', 'rejected'];

interface StrategyLatestTotals {
  assetThesisId: string;
  realized: number;
  unrealized: number;
  cumulative: number;
  confidence: RealizedConfidence;
  firstDate: string;
  latestDate: string;
}

/**
 * Everything the /performance page needs in four queries: latest per-strategy
 * totals (same latest-date semantics as performanceForStrategyIds), thesis
 * metadata, and the asset↔macro junction. Aggregation in JS — the tables are
 * tens of rows.
 */
export async function getPerformanceOverview(): Promise<PerformanceOverview> {
  const [latestRows, assetRows, macroRows, junctionRows] = await Promise.all([
    // Per-strategy totals at each strategy's latest snapshot date (summed
    // across accounts), plus first/latest snapshot dates for duration.
    db
      .select({
        strategyId: strategyMetricsSnapshots.strategyId,
        assetThesisId: strategies.assetThesisId,
        realized: sql<string | null>`SUM(${strategyMetricsSnapshots.realizedPnlToDate})`,
        unrealized: sql<string | null>`SUM(${strategyMetricsSnapshots.totalUnrealizedPnl})`,
        cumulative: sql<string | null>`SUM(${strategyMetricsSnapshots.cumulativePnl})`,
        confidence: sql<string | null>`MAX(${strategyMetricsSnapshots.realizedConfidence})`,
        latestDate: sql<string>`MAX(${strategyMetricsSnapshots.snapshotDate})`,
        firstDate: sql<string>`(
          SELECT MIN(s2.snapshot_date)::text
          FROM strategy_metrics_snapshots s2
          WHERE s2.strategy_id = ${strategyMetricsSnapshots.strategyId}
        )`,
      })
      .from(strategyMetricsSnapshots)
      .innerJoin(strategies, eq(strategies.id, strategyMetricsSnapshots.strategyId))
      .where(
        and(
          sql`${strategies.assetThesisId} IS NOT NULL`,
          sql`${strategyMetricsSnapshots.snapshotDate} = (
            SELECT MAX(s3.snapshot_date)
            FROM strategy_metrics_snapshots s3
            WHERE s3.strategy_id = ${strategyMetricsSnapshots.strategyId}
          )`
        )
      )
      .groupBy(strategyMetricsSnapshots.strategyId, strategies.assetThesisId),
    db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        ticker: underlyings.ticker,
        status: assetTheses.status,
        direction: assetTheses.direction,
        outcome: assetTheses.outcome,
        outcomeNotes: assetTheses.outcomeNotes,
        createdAt: assetTheses.createdAt,
        updatedAt: assetTheses.updatedAt,
        actualOutcomeDate: assetTheses.actualOutcomeDate,
      })
      .from(assetTheses)
      .leftJoin(underlyings, eq(underlyings.id, assetTheses.underlyingId)),
    db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        direction: macroTheses.direction,
        outcome: macroTheses.outcome,
        outcomeNotes: macroTheses.outcomeNotes,
        createdAt: macroTheses.createdAt,
        updatedAt: macroTheses.updatedAt,
        actualOutcomeDate: macroTheses.actualOutcomeDate,
      })
      .from(macroTheses),
    db
      .select({
        assetThesisId: assetThesisRelatedMacroTheses.assetThesisId,
        macroThesisId: assetThesisRelatedMacroTheses.macroThesisId,
      })
      .from(assetThesisRelatedMacroTheses),
  ]);

  // Latest totals per strategy, grouped by asset thesis
  const byAssetThesis = new Map<string, StrategyLatestTotals[]>();
  for (const row of latestRows) {
    if (!row.assetThesisId) continue;
    const list = byAssetThesis.get(row.assetThesisId) ?? [];
    list.push({
      assetThesisId: row.assetThesisId,
      realized: n(row.realized) ?? 0,
      unrealized: n(row.unrealized) ?? 0,
      cumulative: n(row.cumulative) ?? 0,
      confidence: (row.confidence as RealizedConfidence | null) ?? 'no_trades',
      firstDate: row.firstDate,
      latestDate: row.latestDate,
    });
    byAssetThesis.set(row.assetThesisId, list);
  }

  function summarize(strats: StrategyLatestTotals[]) {
    let realized = 0;
    let unrealized = 0;
    let cumulative = 0;
    let confidence: RealizedConfidence = 'full';
    let firstDate: string | null = null;
    let latestDate: string | null = null;
    for (const s of strats) {
      realized += s.realized;
      unrealized += s.unrealized;
      cumulative += s.cumulative;
      confidence = weakest(confidence, s.confidence);
      if (firstDate === null || s.firstDate < firstDate) firstDate = s.firstDate;
      if (latestDate === null || s.latestDate > latestDate) latestDate = s.latestDate;
    }
    return {
      strategyCount: strats.length,
      latestRealized: Math.round(realized * 100) / 100,
      latestUnrealized: Math.round(unrealized * 100) / 100,
      latestCumulative: Math.round(cumulative * 100) / 100,
      confidence: strats.length > 0 ? confidence : ('no_trades' as RealizedConfidence),
      firstSnapshotDate: firstDate,
      latestSnapshotDate: latestDate,
    };
  }

  const assetSummaries = new Map<string, ThesisPerformanceSummary>();
  for (const t of assetRows) {
    assetSummaries.set(t.id, {
      thesisId: t.id,
      thesisType: 'asset',
      title: t.title,
      ticker: t.ticker,
      status: t.status,
      direction: t.direction,
      outcome: t.outcome,
      outcomeNotes: t.outcomeNotes,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      actualOutcomeDate: t.actualOutcomeDate,
      ...summarize(byAssetThesis.get(t.id) ?? []),
    });
  }

  // Macro: full credit to each linked asset thesis (D8 exposure view)
  const assetIdsByMacro = new Map<string, string[]>();
  for (const link of junctionRows) {
    const list = assetIdsByMacro.get(link.macroThesisId) ?? [];
    list.push(link.assetThesisId);
    assetIdsByMacro.set(link.macroThesisId, list);
  }

  const macroSummaries = new Map<string, MacroThesisPerformanceSummary>();
  for (const t of macroRows) {
    const linkedAssetIds = assetIdsByMacro.get(t.id) ?? [];
    const strats = linkedAssetIds.flatMap((id) => byAssetThesis.get(id) ?? []);
    macroSummaries.set(t.id, {
      thesisId: t.id,
      thesisType: 'macro',
      title: t.title,
      ticker: null,
      status: t.status,
      direction: t.direction,
      outcome: t.outcome,
      outcomeNotes: t.outcomeNotes,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      actualOutcomeDate: t.actualOutcomeDate,
      assetThesisCount: linkedAssetIds.filter((id) => (byAssetThesis.get(id) ?? []).length > 0)
        .length,
      ...summarize(strats),
    });
  }

  const byCumulativeDesc = (a: ThesisPerformanceSummary, b: ThesisPerformanceSummary) =>
    b.latestCumulative - a.latestCumulative;

  return {
    assetTheses: [...assetSummaries.values()]
      .filter((t) => !CLOSED_STATUSES.includes(t.status) && t.strategyCount > 0)
      .sort(byCumulativeDesc),
    macroTheses: [...macroSummaries.values()]
      .filter((t) => !CLOSED_STATUSES.includes(t.status) && t.strategyCount > 0)
      .sort(byCumulativeDesc),
    retrospectives: [
      ...[...assetSummaries.values()].filter((t) => CLOSED_STATUSES.includes(t.status)),
      ...[...macroSummaries.values()].filter((t) => CLOSED_STATUSES.includes(t.status)),
    ].sort(
      (a, b) =>
        (b.actualOutcomeDate ?? b.updatedAt).localeCompare(a.actualOutcomeDate ?? a.updatedAt)
    ),
    attributionNote: 'exposure_view_full_credit',
  };
}
