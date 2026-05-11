/**
 * Daily OHLC aggregates from Massive.
 *
 * Used to compute rv20 (realized vol from close-to-close log returns) and
 * atr20 (average true range from OHLC) for every ticker, both in:
 *   - the daily incremental ingest (next day's bar)
 *   - the one-shot backfill script (full historical series)
 */

import { buildMassiveUrl, fetchMassive } from './client';

export interface MassiveDailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MassiveAggsResponse {
  status: string;
  resultsCount?: number;
  results?: Array<{
    t: number; // ms epoch
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
}

/**
 * Fetch daily OHLC bars for a ticker between `from` and `to` (YYYY-MM-DD inclusive).
 * Returns chronologically ascending bars.
 *
 * Uses the free aggregates endpoint: /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
 */
export async function fetchDailyAggs(
  ticker: string,
  from: string,
  to: string,
  opts: { adjusted?: boolean; limit?: number } = {}
): Promise<MassiveDailyBar[]> {
  const adjusted = opts.adjusted ?? true;
  const limit = opts.limit ?? 5000; // Massive's max
  const url = buildMassiveUrl(
    `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
    { adjusted: adjusted ? 'true' : 'false', sort: 'asc', limit }
  );
  const data = await fetchMassive<MassiveAggsResponse>(url);
  if (!data.results || data.results.length === 0) return [];
  return data.results.map((r) => ({
    date: new Date(r.t).toISOString().split('T')[0]!,
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
  }));
}

/**
 * Compute annualized realized volatility (RV) over a window from a series of
 * close prices. Window = number of returns to use (NOT closes).
 * Returns null if insufficient data.
 */
export function computeRv(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const slice = closes.slice(-(window + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyStdev = Math.sqrt(variance);
  return dailyStdev * Math.sqrt(252);
}

/**
 * Compute Average True Range over a window from OHLC bars.
 * Window = number of true ranges to average (NOT bars).
 * Returns null if insufficient data.
 */
export function computeAtr(bars: MassiveDailyBar[], window: number): number | null {
  if (bars.length < window + 1) return null;
  const slice = bars.slice(-(window + 1));
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i];
    const prev = slice[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  if (trs.length === 0) return null;
  return trs.reduce((s, t) => s + t, 0) / trs.length;
}
