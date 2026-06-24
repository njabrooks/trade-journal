/**
 * The signal SENSOR object model (docs/v2/14 §9, P3 / docs/v2/16 §3 task 2). Pure — no DB.
 *
 * The clean model the loose-agent world wants is:
 *
 *     one signal = one iteratively-improved STATEMENT  +  an optional attached SENSOR
 *
 * The statement is the natural-language understanding (`signals.statement`, owned by
 * build-core-argument and sharpened by re-underwriting). The sensor is an OPTIONAL precise
 * measurement (`signals.explicit_details` → a collect-signal-data collector) bolted onto a
 * statement whose condition happens to have a clean decision-grade number.
 *
 * Today `explicit_details` is an untyped jsonb blob written by three historical paths
 * (the retired /configure-signal form, the price-ladder builder, and an old hybrid
 * news-keyword config). This module gives that blob ONE typed reading so the rest of the
 * system can ask "does this statement have a real sensor, and what kind?" instead of
 * re-sniffing jsonb everywhere. It backs:
 *   - sensor triage (scripts/ops/triage-sensors.ts) — keep decision-grade, drop laggy proxies;
 *   - sensor carry-forward (scripts/insert-thesis-articulation.ts) — a real sensor survives
 *     statement iteration via signals.supersedes_signal_id instead of being orphaned.
 *
 * The hard call (faithful-vs-proxy) stays a judgment — this module only exposes the
 * OBSERVABLE facts (kind, metrics, thresholds, source class) the triage report reasons over.
 */

/** The three real sensor shapes found in production, plus 'none' for statement-only. */
export type SensorKind =
  | 'price_ladder' // strategy_price_ladder: targets[] of price crossings (decision-grade by construction)
  | 'threshold' // a quantitative collector: metric(s) + threshold(s) against a data source
  | 'dependency' // internal_db status_or_confidence — a thesis-graph edge, not a metric sensor
  | 'none'; // no real sensor: statement-only, or vestigial/qualitative explicit_details

/** Source-class HINT for the faithful-vs-proxy judgment — transparency, NOT a verdict. */
export type SensorSourceClass =
  | 'market_price' // direct price/level — measures the actual thing (faithful by construction)
  | 'onchain' // defillama / chain metrics — usually faithful, cheap
  | 'reserve_flow' // imf_cofer / worldbank reserve & macro-allocation series
  | 'macro_aggregate' // fred broad aggregates (construction spend, M2) — often laggy proxies
  | 'filing' // sec_edgar / company filings — quarterly, laggy, frequently a proxy
  | 'revenue' // company/sector revenue feeds (tsmc_revenue) — leading-ish, can be faithful
  | 'derived' // internally-computed metric (implied valuation etc.) — real, but a judgment call
  | 'internal' // internal_db thesis-graph edges
  | 'qualitative' // news_qualitative — not a quantitative sensor at all
  | 'unknown';

export interface Sensor {
  kind: SensorKind;
  /** Top-level / per-condition data source ('fred' | 'imf_cofer' | 'price_feed' | …), or null. */
  dataSource: string | null;
  sourceClass: SensorSourceClass;
  /** Metric names across conditions (e.g. ['yoy_growth'] or ['usd_share_pct']). */
  metrics: string[];
  /** Numeric thresholds across conditions/targets (price levels for a ladder). */
  thresholds: number[];
  /** A crossing of a concrete threshold would flip an action (the decision-grade core of §9.1). */
  hasThreshold: boolean;
  /** The original explicit_details, untouched (for carry-forward + display). */
  raw: unknown;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Map a raw data-source token to its source class (for the faithful-vs-proxy hint). */
export function classifySensorSource(dataSource: string | null): SensorSourceClass {
  if (!dataSource) return 'unknown';
  const d = dataSource.toLowerCase();
  if (d === 'news_qualitative') return 'qualitative';
  if (d === 'internal_db') return 'internal';
  if (d === 'price_feed' || d === 'iv_data' || d === 'tradingview_cdp' || d.startsWith('price')) return 'market_price';
  if (d === 'imf_cofer' || d === 'worldbank') return 'reserve_flow';
  if (d === 'defillama' || d === 'defillama_stablecoins' || d.includes('coingecko') || d.includes('hypeflows')) return 'onchain';
  if (d.includes('revenue')) return 'revenue';
  if (d.startsWith('sec_edgar') || d === 'sec' || d.includes('edgar')) return 'filing';
  if (d === 'fred' || d.startsWith('fred:')) return 'macro_aggregate';
  if (d === 'derived') return 'derived';
  return 'unknown';
}

/**
 * Parse a signal's explicit_details (+ category) into one typed Sensor reading.
 * Always returns a Sensor; `kind: 'none'` means statement-only (no real sensor) — including
 * the vestigial `news_qualitative` blobs that carry no metric/threshold (those are qualitative
 * signals that should re-enter the observe loop, NOT collectors).
 */
export function parseSensor(explicitDetails: unknown, category?: string | null): Sensor {
  const none = (raw: unknown, dataSource: string | null = null): Sensor => ({
    kind: 'none', dataSource, sourceClass: classifySensorSource(dataSource),
    metrics: [], thresholds: [], hasThreshold: false, raw,
  });

  if (!isObj(explicitDetails)) {
    // No blob. category='data_driven' with no details is a declared-but-unconfigured sensor → still none.
    return none(explicitDetails ?? null);
  }
  const ed = explicitDetails;
  const topSource = str(ed.dataSource);

  // 1. Price ladder — strategy_price_ladder / targets[] of price crossings.
  const targets = asArr(ed.targets);
  if (str(ed.signalKind) === 'strategy_price_ladder' || targets.length > 0) {
    const prices = targets.map((t) => (isObj(t) ? num(t.price) : null)).filter((x): x is number => x !== null);
    const ticker = str(ed.ticker);
    return {
      kind: 'price_ladder',
      dataSource: topSource ?? 'price_feed',
      sourceClass: 'market_price',
      metrics: ticker ? [`${ticker} price`] : ['price'],
      thresholds: prices,
      hasThreshold: prices.length > 0,
      raw: ed,
    };
  }

  // 2. Dependency edge — internal_db status_or_confidence (parent-thesis invalidation).
  if (topSource === 'internal_db' || str(ed.metric) === 'status_or_confidence') {
    return { kind: 'dependency', dataSource: topSource ?? 'internal_db', sourceClass: 'internal', metrics: ['status_or_confidence'], thresholds: [], hasThreshold: false, raw: ed };
  }

  // 3. Threshold collector — conditions[] {metric, threshold, dataSource} or a flat metric+threshold.
  const conditions = asArr(ed.conditions).filter(isObj);
  const condMetrics: string[] = [];
  const condThresholds: number[] = [];
  let condSource: string | null = topSource;
  for (const c of conditions) {
    const m = str(c.metric);
    if (m) condMetrics.push(m);
    const th = num(c.threshold);
    if (th !== null) condThresholds.push(th);
    condSource = condSource ?? str(c.dataSource);
  }
  const flatMetric = str(ed.metric);
  const flatThreshold = num(ed.threshold) ?? num(ed.value);
  const metrics = condMetrics.length ? condMetrics : flatMetric ? [flatMetric] : [];
  const thresholds = condThresholds.length ? condThresholds : flatThreshold !== null ? [flatThreshold] : [];

  // A real threshold sensor needs a concrete METRIC and a source that isn't purely
  // qualitative. A 'derived'/'unknown'-source metric still counts (e.g. an internally-computed
  // implied valuation with a numeric threshold) — only news_qualitative keyword config (no
  // metric) is excluded as a non-sensor.
  const sourceClass = classifySensorSource(condSource);
  if (metrics.length > 0 && sourceClass !== 'qualitative') {
    return { kind: 'threshold', dataSource: condSource, sourceClass, metrics, thresholds, hasThreshold: thresholds.length > 0, raw: ed };
  }

  // Anything else (news_qualitative keyword config, or declared data_driven with no usable metric) → not a sensor.
  void category;
  return none(ed, condSource);
}

/** True iff the signal carries a genuine, attached sensor (price ladder, threshold collector, or dependency edge). */
export function hasSensor(explicitDetails: unknown, category?: string | null): boolean {
  return parseSensor(explicitDetails, category).kind !== 'none';
}

/**
 * True iff explicit_details is PRESENT but parses to no real sensor — the vestigial
 * `news_qualitative` / keyword blobs. These wrongly read as collector-tracked
 * (isCollectorTracked → explicit_details != null) and so get excluded from the
 * chronic-neutral diagnostic despite being qualitative. Triage clears them to statement-only.
 */
export function isVestigialExplicitDetails(explicitDetails: unknown, category?: string | null): boolean {
  return explicitDetails != null && parseSensor(explicitDetails, category).kind === 'none';
}

/** Decision-grade (§9.1): a concrete threshold crossing that would flip an action. */
export function isDecisionGradeSensor(sensor: Sensor): boolean {
  if (sensor.kind === 'price_ladder') return sensor.hasThreshold; // a take-profit ladder IS the action
  if (sensor.kind === 'threshold') return sensor.hasThreshold;
  return false; // dependency edges/none are not threshold-decision-grade in this sense
}

/** One-line human description of the sensor (for triage + journals). */
export function describeSensor(sensor: Sensor): string {
  switch (sensor.kind) {
    case 'price_ladder':
      return `price ladder (${sensor.metrics[0] ?? 'price'} @ ${sensor.thresholds.map((t) => t.toLocaleString()).join(' / ') || 'no levels'})`;
    case 'threshold':
      return `${sensor.dataSource ?? 'collector'} threshold (${sensor.metrics.join(', ') || 'metric'}${sensor.thresholds.length ? ` @ ${sensor.thresholds.join(' / ')}` : ''})`;
    case 'dependency':
      return `dependency edge (parent-thesis status via ${sensor.dataSource ?? 'internal_db'})`;
    case 'none':
      return sensor.raw != null ? `no real sensor (vestigial ${sensor.dataSource ?? 'config'})` : 'statement-only (no sensor)';
  }
}

/**
 * What sensor to carry onto a re-underwritten statement that continues `prior`.
 * Returns the explicit_details + category to copy, or null when the prior had no REAL
 * sensor — so vestigial qualitative blobs are dropped (the statement re-enters the observe
 * loop) while genuine decision-grade sensors persist across statement iteration. Pure: the
 * caller fetches the prior signal and writes the result.
 */
export function resolveSensorCarryForward(
  prior: { explicitDetails: unknown; category?: string | null } | null,
): { explicitDetails: unknown; category: 'data_driven' } | null {
  if (!prior) return null;
  const sensor = parseSensor(prior.explicitDetails, prior.category);
  if (sensor.kind === 'none') return null;
  return { explicitDetails: prior.explicitDetails, category: 'data_driven' };
}
