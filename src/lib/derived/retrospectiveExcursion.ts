/**
 * Excursion analysis for thesis retrospectives (docs/v2/07 §4d — execution-quality axis).
 *
 * The retrospective has two axes: *was the belief right?* (handled by the existing
 * outcome/narrative) and *did we capture the P&L that was available?* This module
 * answers the second from the daily cumulative-P&L series already loaded by
 * gatherRetrospectiveContext (`perf.combined`):
 *
 *   - MFE (maximum favorable excursion) = the PEAK cumulative P&L during the hold.
 *   - MAE (maximum adverse excursion)   = the worst (trough) cumulative P&L.
 *   - capture ratio = final / MFE — how much of the best-case gain was realized.
 *
 * A thesis that closed at +$3k having peaked at +$22k was a correct call poorly
 * harvested — an execution lesson distinct from whether the belief was right.
 *
 * Pure (no DB): `cumulative` is the running total (realized-to-date + unrealized),
 * so peak = max, trough = min. The series is frozen once a thesis closes, so this is
 * stable to compute live wherever excursion is shown.
 */
import type { RealizedConfidence } from '@/db/queries/thesisPerformance';

/** Minimal per-date input — a subset of `ThesisPerformance['combined']`. */
export interface ExcursionPoint {
  date: string;
  cumulative: number;
  /** weakest contributing realized_confidence on this date (optional; defaults to 'full') */
  confidence?: RealizedConfidence;
}

export interface Excursion {
  /** cumulative P&L at close (the last point) */
  finalCumulative: number;
  /** maximum favorable excursion — peak cumulative P&L during the hold */
  mfe: number;
  /** date the peak was first reached */
  mfeDate: string | null;
  /** maximum adverse excursion — trough cumulative P&L during the hold */
  mae: number;
  /** date the trough was first reached */
  maeDate: string | null;
  /** final / mfe — fraction of the favorable excursion captured. Null when never in profit (mfe ≤ 0). */
  captureRatio: number | null;
  /** mfe − final — P&L given back from the peak. Null when never in profit. (Always ≥ 0 otherwise — final ≤ mfe.) */
  giveBackFromPeak: number | null;
  /** the position was never in profit (peak ≤ 0) */
  neverInProfit: boolean;
  /** the position was never underwater (trough ≥ 0) */
  neverUnderwater: boolean;
  /** weakest realized_confidence across the series — MFE/MAE inherit the W4/W5 caveat */
  confidence: RealizedConfidence;
  /** number of points scanned (sanity / empty-series guard) */
  pointCount: number;
}

/** What's frozen into `retrospective_metrics` at close: the excursion + the judgment. */
export interface RetrospectiveMetrics extends Excursion {
  /** 'excellent' | 'good' | 'fair' | 'poor' — the skill's execution-quality verdict (null until scored) */
  executionQuality: string | null;
}

/** Execution-quality verdicts, best → worst (the skill judges into these). */
export const EXECUTION_QUALITIES = ['excellent', 'good', 'fair', 'poor'] as const;
export type ExecutionQuality = (typeof EXECUTION_QUALITIES)[number];

const CONFIDENCE_RANK: Record<RealizedConfidence, number> = {
  full: 0,
  partial_history: 1,
  no_trades: 2,
};

function weaker(a: RealizedConfidence, b: RealizedConfidence): RealizedConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Compute the favorable/adverse excursion of a daily cumulative-P&L series.
 * Pass `perf.combined` (or any ascending-by-date subset with `cumulative`).
 */
export function computeExcursion(series: ExcursionPoint[]): Excursion {
  if (series.length === 0) {
    return {
      finalCumulative: 0,
      mfe: 0,
      mfeDate: null,
      mae: 0,
      maeDate: null,
      captureRatio: null,
      giveBackFromPeak: null,
      neverInProfit: true,
      neverUnderwater: true,
      confidence: 'no_trades',
      pointCount: 0,
    };
  }

  let mfe = -Infinity;
  let mfeDate: string | null = null;
  let mae = Infinity;
  let maeDate: string | null = null;
  let confidence: RealizedConfidence = 'full';

  for (const p of series) {
    const c = p.cumulative;
    // First occurrence wins for the date (strict >/< so a later equal value
    // doesn't overwrite the date the extremum was first reached).
    if (c > mfe) {
      mfe = c;
      mfeDate = p.date;
    }
    if (c < mae) {
      mae = c;
      maeDate = p.date;
    }
    confidence = weaker(confidence, p.confidence ?? 'full');
  }

  const finalCumulative = series[series.length - 1].cumulative;
  mfe = round2(mfe);
  mae = round2(mae);

  const inProfit = mfe > 0;
  const captureRatio = inProfit ? round2((finalCumulative / mfe) * 1000) / 1000 : null;
  const giveBackFromPeak = inProfit ? round2(mfe - finalCumulative) : null;

  return {
    finalCumulative: round2(finalCumulative),
    mfe,
    mfeDate,
    mae,
    maeDate,
    captureRatio,
    giveBackFromPeak,
    neverInProfit: !inProfit,
    neverUnderwater: mae >= 0,
    confidence,
    pointCount: series.length,
  };
}
