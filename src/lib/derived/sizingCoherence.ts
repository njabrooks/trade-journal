/**
 * Sizing-coherence engine (docs/v2/20 §A1) — conviction↔allocation mismatch detection.
 *
 * The owner's explicit pain: historically crypto-heavy on long-term conviction, leaving
 * other theses under-expressed. This engine compares each active thesis's conviction
 * (`confidence_level`) against its actual expression (Σ `market_value_usd` of open
 * positions via `strategies.asset_thesis_id`, as % of NAV) and emits **findings, not
 * scores** — only material mismatches, plus one concentration line.
 *
 * Expression is *market value %* — options at market value, no delta adjustment (a
 * delta-dollar refinement is a later iteration; the label stays honest). Macro theses
 * get a full-credit exposure view over their linked asset theses (same labelling rule
 * as the W5 performance pages: an exposure view, not additive attribution).
 *
 * Pure (no DB) — the loader lives in the consumer (scripts/morning-brief-data.ts).
 * NOT a decision-raiser: findings appear in the morning brief; a real rebalance
 * question goes to /thesis.
 */

/** Below this % of NAV, a high-conviction thesis is under-expressed. */
export const UNDER_PCT = 2;
/** Above this % of NAV, a low/exploratory-conviction thesis is over-expressed. */
export const OVER_PCT = 8;
/**
 * Conviction ladder — the weight a thesis "deserves" in the concentration view.
 * Unknown/missing confidence gets no ladder entry and is skipped by the mismatch rules.
 */
export const CONVICTION_SCORES: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  exploratory: 0.5,
};

export type SizingFindingKind = 'under_expressed' | 'over_expressed' | 'concentration';

export interface SizingFinding {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  ticker: string | null;
  kind: SizingFindingKind;
  convictionLevel: string | null;
  /** |net market value| as % of NAV — "market value %", not delta-adjusted. */
  expressionPct: number;
  /** Net Σ market_value_usd (signed) — full-credit sum of |asset nets| for macros. */
  expressionUsd: number;
  navUsd: number;
  note: string;
}

export interface AssetThesisExposureInput {
  thesisId: string;
  title: string;
  ticker: string | null;
  confidenceLevel: string | null;
  direction: string | null; // 'bullish' | 'bearish' | 'neutral' | null
  /** Net Σ market_value_usd of open positions via strategies.asset_thesis_id. */
  expressionUsd: number;
}

export interface MacroThesisExposureInput {
  thesisId: string;
  title: string;
  confidenceLevel: string | null;
  direction: string | null;
  /** Linked asset thesis ids (asset_thesis_related_macro_theses junction). */
  linkedAssetThesisIds: string[];
}

export interface SizingInputs {
  /** Latest total NAV in USD (Σ account navAtSnapshotUsd). */
  navUsd: number;
  /** Active (developing/monitoring) asset theses with their net expression. */
  assetTheses: AssetThesisExposureInput[];
  /** Active (developing/monitoring) macro theses with their asset links. */
  macroTheses: MacroThesisExposureInput[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M` : abs >= 1_000 ? `$${(abs / 1_000).toFixed(1)}K` : `$${abs.toFixed(0)}`;
  return v < 0 ? `-${s}` : s;
}

/**
 * Direction-aligned expression: positive when the net market value points the way the
 * thesis leans (bearish thesis + net short = positive alignment). Neutral/unknown
 * direction falls back to magnitude — no wrong-way reading is possible.
 */
function alignedExpression(expressionUsd: number, direction: string | null): number {
  if (direction === 'bearish') return -expressionUsd;
  if (direction === 'bullish') return expressionUsd;
  return Math.abs(expressionUsd);
}

interface ExposureView {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  title: string;
  ticker: string | null;
  convictionLevel: string | null;
  direction: string | null;
  expressionUsd: number;
  /** Magnitude for % of NAV (macros: full-credit Σ of |asset nets|). */
  magnitudeUsd: number;
  viewLabel: string;
}

function mismatchFindings(view: ExposureView, navUsd: number): SizingFinding[] {
  const conviction = view.convictionLevel;
  if (!conviction || !(conviction in CONVICTION_SCORES)) return [];

  const expressionPct = round2((view.magnitudeUsd / navUsd) * 100);
  const alignedPct = (alignedExpression(view.expressionUsd, view.direction) / navUsd) * 100;
  const base = {
    thesisId: view.thesisId,
    thesisType: view.thesisType,
    thesisTitle: view.title,
    ticker: view.ticker,
    convictionLevel: conviction,
    expressionPct,
    expressionUsd: round2(view.expressionUsd),
    navUsd: round2(navUsd),
  };

  // Wrong-way expression on a directional thesis is a stronger under-expression than
  // a small position — the aligned % goes negative and trips the same threshold.
  if (conviction === 'high' && alignedPct < UNDER_PCT) {
    const wrongWay = alignedPct < 0 && Math.abs(view.expressionUsd) > 0;
    return [{
      ...base,
      kind: 'under_expressed',
      note: wrongWay
        ? `High conviction but net expression (${fmtUsd(view.expressionUsd)}) points AGAINST the ${view.direction} direction (${view.viewLabel}).`
        : `High conviction expressed at only ${expressionPct}% of NAV (< ${UNDER_PCT}% threshold; ${view.viewLabel}).`,
    }];
  }

  if ((conviction === 'low' || conviction === 'exploratory') && expressionPct > OVER_PCT) {
    return [{
      ...base,
      kind: 'over_expressed',
      note: `${conviction} conviction but expressed at ${expressionPct}% of NAV (> ${OVER_PCT}% threshold; ${view.viewLabel}).`,
    }];
  }

  return [];
}

/**
 * The concentration line (always emitted when computable): top thesis-cluster % of the
 * expressed book vs the conviction-weighted share it "deserves". Clusters are macro
 * theses (full-credit over linked assets) plus each unclustered asset thesis as its
 * own cluster — the crypto case reads as one macro cluster dwarfing its deserved share.
 */
function concentrationFinding(views: ExposureView[], navUsd: number): SizingFinding | null {
  const clusters = views.filter((v) => v.magnitudeUsd > 0);
  if (clusters.length < 2) return null;

  const totalExpressed = clusters.reduce((s, c) => s + c.magnitudeUsd, 0);
  const totalWeight = clusters.reduce((s, c) => s + (CONVICTION_SCORES[c.convictionLevel ?? ''] ?? 1), 0);
  if (totalExpressed <= 0 || totalWeight <= 0) return null;

  const top = clusters.reduce((a, b) => (b.magnitudeUsd > a.magnitudeUsd ? b : a));
  const actualSharePct = round2((top.magnitudeUsd / totalExpressed) * 100);
  const deservedSharePct = round2(((CONVICTION_SCORES[top.convictionLevel ?? ''] ?? 1) / totalWeight) * 100);
  const navPct = round2((top.magnitudeUsd / navUsd) * 100);

  return {
    thesisId: top.thesisId,
    thesisType: top.thesisType,
    thesisTitle: top.title,
    ticker: top.ticker,
    kind: 'concentration',
    convictionLevel: top.convictionLevel,
    expressionPct: navPct,
    expressionUsd: round2(top.expressionUsd),
    navUsd: round2(navUsd),
    note: `Top cluster "${top.title}" holds ${actualSharePct}% of the expressed book (${navPct}% of NAV) vs a conviction-weighted ${deservedSharePct}% share across ${clusters.length} clusters (${top.viewLabel}).`,
  };
}

/**
 * Emit sizing-coherence findings for the active thesis set. Deterministic; returns []
 * when NAV is unusable. Ordering: under_expressed, over_expressed, then the single
 * concentration line.
 */
export function computeSizingFindings(inputs: SizingInputs): SizingFinding[] {
  const { navUsd, assetTheses, macroTheses } = inputs;
  if (!Number.isFinite(navUsd) || navUsd <= 0) return [];

  const assetById = new Map(assetTheses.map((a) => [a.thesisId, a]));

  const assetViews: ExposureView[] = assetTheses.map((a) => ({
    thesisId: a.thesisId,
    thesisType: 'asset',
    title: a.title,
    ticker: a.ticker,
    convictionLevel: a.confidenceLevel,
    direction: a.direction,
    expressionUsd: a.expressionUsd,
    magnitudeUsd: Math.abs(a.expressionUsd),
    viewLabel: 'market value %',
  }));

  const clusteredAssetIds = new Set<string>();
  const macroViews: ExposureView[] = macroTheses.map((m) => {
    const linked = m.linkedAssetThesisIds
      .map((id) => assetById.get(id))
      .filter((a): a is AssetThesisExposureInput => a !== undefined);
    linked.forEach((a) => clusteredAssetIds.add(a.thesisId));
    const magnitude = linked.reduce((s, a) => s + Math.abs(a.expressionUsd), 0);
    const net = linked.reduce((s, a) => s + a.expressionUsd, 0);
    return {
      thesisId: m.thesisId,
      thesisType: 'macro',
      title: m.title,
      ticker: null,
      convictionLevel: m.confidenceLevel,
      direction: m.direction,
      expressionUsd: net,
      magnitudeUsd: magnitude,
      viewLabel: 'full-credit exposure view',
    };
  });

  const under: SizingFinding[] = [];
  const over: SizingFinding[] = [];
  for (const view of [...assetViews, ...macroViews]) {
    for (const f of mismatchFindings(view, navUsd)) {
      (f.kind === 'under_expressed' ? under : over).push(f);
    }
  }

  // Concentration clusters: macros (full credit) + asset theses not under any macro.
  const clusterViews = [
    ...macroViews,
    ...assetViews.filter((v) => !clusteredAssetIds.has(v.thesisId)),
  ];
  const concentration = concentrationFinding(clusterViews, navUsd);

  return [...under, ...over, ...(concentration ? [concentration] : [])];
}
