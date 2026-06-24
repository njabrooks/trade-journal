/**
 * Signal-quality diagnostics — PURE rules (docs/v2/15 §5). No DB; unit-testable.
 *
 * Two diagnostics over a signal's snapshot history, both feeding a re-underwrite-due
 * trigger (docs/v2/15 §3):
 *
 *   chronic-neutral (per signal) — observed enough times over a trailing window and
 *     NEVER discriminated ⇒ the statement is untestable/irrelevant ⇒ flag.
 *   surprise / coverage-gap (per thesis) — a vol-scaled material price move that no
 *     signal flagged within a proximity window ⇒ a coverage hole ⇒ flag.
 *
 * THE CORRECTNESS RULE (docs/v2/15 §2, §4.2): chronic-neutral counts ONLY real
 * tracking observations (`thesis_observe` / `thesis_monitor`). The nightly
 * `daily_synthesis` aggregator writes neutral-by-default rows that mean "nobody
 * looked", not "looked and saw nothing" — counting them would misread a producer
 * outage as a thesis-layer weakness. The DB layer must hand this module ONLY
 * tracking snapshots, but we re-filter here by source as a belt-and-braces guard.
 */

const DAY_MS = 86_400_000;

// ── Tunable constants (docs/v2/15 §5; calibrate off the backtest §9.2) ──
/** Trailing window for chronic-neutral. */
export const DIAG_WINDOW_DAYS = 45;
/** The data gate — below this many tracking observations a signal is `insufficient_data`. */
export const MIN_TRACKING_OBSERVATIONS = 8;
/** Soft-flag threshold: ≥ this share neutral (with ≥1 stray flip) ⇒ `low_information`. */
export const LOW_INFO_NEUTRAL_RATE = 0.9;
/** Window over which a thesis-level price move is measured for surprise. */
export const SURPRISE_WINDOW_DAYS = 30;
/** Absolute floor: a move below this is never material (binds for low-vol names). */
export const SURPRISE_MOVE_PCT_FLOOR = 0.15;
/** Vol band: material if the move clears this many window-scaled rv20 σ (binds for high-vol names). */
export const SURPRISE_MOVE_SIGMA = 2.0;
/** A flag must sit within ±this many days of the move's extreme to count as "caught". */
export const FLAG_PROXIMITY_DAYS = 7;

/** Snapshot data_sources that constitute a real tracking OBSERVATION (the only valid denominator). */
export const TRACKING_SOURCES = ['thesis_observe', 'thesis_monitor'] as const;
/** Qualitative assessments that count as the signal having discriminated. */
export const NON_NEUTRAL = new Set(['strengthening', 'weakening', 'confirmed', 'invalidated']);

export type ChronicVerdict =
  | 'insufficient_data'
  | 'chronic_neutral'
  | 'low_information'
  | 'discriminating'
  | 'excluded_collector';

export interface SnapshotLite {
  assessment: string | null;
  dataSource: string;
  snapshotDate: Date;
}

export interface ChronicNeutralResult {
  observedCount: number;
  nonNeutralCount: number;
  /** neutral / observed, or null when observedCount === 0. */
  neutralRate: number | null;
  verdict: ChronicVerdict;
}

export interface PricePoint {
  date: Date;
  spot: number;
}

export interface MaterialMove {
  /** Max absolute in-window displacement from the window-start price. */
  magnitudePct: number;
  /** Signed displacement extreme/first − 1 (negative = down). */
  changePct: number;
  /** Date of the most-displaced in-window point — the move + proximity anchor. */
  moveDate: Date;
  /** Days elapsed window-start → moveDate. */
  spanDays: number;
  /** The threshold it cleared (for transparency). */
  threshold: number;
}

export interface CoverageGap {
  kind: 'price' | 'price_macro';
  /** Human detail, e.g. "NVDA −22% over 18d, no signal flagged". */
  detail: string;
  magnitudePct: number;
  changePct: number;
  /** ISO date of the move extreme. */
  moveDate: string;
  /** Always false when emitted (a gap is by definition unflagged); kept explicit for the packet. */
  flaggedWithin: boolean;
}

/**
 * Chronic-neutral verdict for one signal over its TRACKING snapshots.
 * `now` is injectable so the backtest can evaluate historically (docs/v2/15 §9.2).
 * Collector-tracked exclusion is the caller's job (it needs the signal record, not
 * the snapshots) — pass only non-collector signals here.
 */
export function classifySignalChronicNeutral(snaps: SnapshotLite[], now: Date): ChronicNeutralResult {
  const since = new Date(now.getTime() - DIAG_WINDOW_DAYS * DAY_MS);
  const obs = snaps.filter(
    (s) => (TRACKING_SOURCES as readonly string[]).includes(s.dataSource) && s.snapshotDate >= since && s.snapshotDate <= now,
  );
  const observedCount = obs.length;
  const nonNeutralCount = obs.filter((s) => s.assessment != null && NON_NEUTRAL.has(s.assessment)).length;

  if (observedCount < MIN_TRACKING_OBSERVATIONS) {
    return { observedCount, nonNeutralCount, neutralRate: null, verdict: 'insufficient_data' };
  }
  const neutralRate = (observedCount - nonNeutralCount) / observedCount;
  const verdict: ChronicVerdict =
    nonNeutralCount === 0 ? 'chronic_neutral' : neutralRate >= LOW_INFO_NEUTRAL_RATE ? 'low_information' : 'discriminating';
  return { observedCount, nonNeutralCount, neutralRate, verdict };
}

/** True iff the chronic verdict should contribute to a re-underwrite trigger. */
export function isChronicFlag(v: ChronicVerdict): boolean {
  return v === 'chronic_neutral' || v === 'low_information';
}

/**
 * The largest in-window displacement from the window-start price, material vs a
 * vol-scaled threshold. Returns null when the series is too sparse (unpriced names →
 * no surprise) or the move is immaterial. rv20 is annualised realised vol (fraction);
 * window σ = rv20·sqrt(N/252), and a move is material if |displacement| ≥
 * max(floor, sigma·windowσ).
 *
 * We anchor on the EXTREME (not net point-to-point): a silent 22% drawdown that
 * partially recovers is still a coverage gap the signal set missed (docs/v2/15 §5.2).
 * Everything reported — magnitude, sign, date, span — refers to that one extreme
 * point, so the detail string is internally consistent.
 */
export function isMaterialMove(series: PricePoint[], now: Date, rv20: number | null): MaterialMove | null {
  const since = new Date(now.getTime() - SURPRISE_WINDOW_DAYS * DAY_MS);
  const win = series
    .filter((p) => p.date >= since && p.date <= now && p.spot > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (win.length < 2) return null;

  const first = win[0];
  const extreme = win.reduce((m, p) =>
    Math.abs(p.spot / first.spot - 1) > Math.abs(m.spot / first.spot - 1) ? p : m, win[0]);
  const changePct = extreme.spot / first.spot - 1;
  const magnitudePct = Math.abs(changePct);

  const windowSigma = rv20 != null && rv20 > 0 ? rv20 * Math.sqrt(SURPRISE_WINDOW_DAYS / 252) : null;
  const threshold = Math.max(SURPRISE_MOVE_PCT_FLOOR, windowSigma != null ? SURPRISE_MOVE_SIGMA * windowSigma : 0);
  if (magnitudePct < threshold) return null;

  const spanDays = Math.max(0, Math.round((extreme.date.getTime() - first.date.getTime()) / DAY_MS));
  return { magnitudePct, changePct, moveDate: extreme.date, spanDays, threshold };
}

/** Any non-neutral tracking-flag date within ±FLAG_PROXIMITY_DAYS of the move's extreme. */
export function hasFlagWithin(flagDates: Date[], moveDate: Date): boolean {
  const w = FLAG_PROXIMITY_DAYS * DAY_MS;
  return flagDates.some((d) => Math.abs(d.getTime() - moveDate.getTime()) <= w);
}

function signedPct(x: number): string {
  return `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}%`;
}

/**
 * Compose move-detection + flag-proximity into a coverage gap. Returns null when the
 * move is immaterial OR a signal DID flag it within the proximity window (the system
 * worked). `flagDates` are this thesis's non-neutral tracking-snapshot dates.
 */
export function detectPriceCoverageGap(
  series: PricePoint[],
  now: Date,
  rv20: number | null,
  flagDates: Date[],
  label: string,
  kind: 'price' | 'price_macro' = 'price',
): CoverageGap | null {
  const move = isMaterialMove(series, now, rv20);
  if (!move) return null;
  if (hasFlagWithin(flagDates, move.moveDate)) return null;
  return {
    kind,
    detail: `${label} ${signedPct(move.changePct)} over ${move.spanDays}d, no signal flagged`,
    magnitudePct: move.magnitudePct,
    changePct: move.changePct,
    moveDate: move.moveDate.toISOString().slice(0, 10),
    flaggedWithin: false,
  };
}
