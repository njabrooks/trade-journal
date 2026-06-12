import { db } from '@/db';
import {
  strategies,
  strategyMetricsSnapshots,
  assetTheses,
  assetThesisRelatedMacroTheses,
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
