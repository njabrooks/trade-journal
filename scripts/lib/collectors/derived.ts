/**
 * Derived metrics collector for signal tracking.
 *
 * Handles computed metrics that require multiple data sources:
 * - BTC-NASDAQ correlation (30d and 90d rolling)
 * - GLXY implied valuation per MW
 *
 * For correlation signals, this collector reports current correlation
 * and SPX drawdown status. Full time-series correlation requires
 * historical price data which will be accumulated over time from
 * the daily snapshots.
 *
 * For now, this collector focuses on what's immediately available
 * and builds toward richer derived metrics as data accumulates.
 */

import { fetchPrices } from './tradingview.js';
import { db, schema } from '../db.js';
import { eq, and, gte } from 'drizzle-orm';

export interface DerivedSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

/**
 * Collect derived metrics based on signal explicit_details.
 */
export async function collectDerived(
  explicitDetails: Record<string, unknown>
): Promise<DerivedSnapshot | null> {
  const calculation = explicitDetails.calculation as string | undefined;

  if (!calculation) return null;

  // Correlation signals — report current prices and note that correlation
  // will be computable once we have enough daily price snapshots
  if (calculation.includes('correlation')) {
    return collectCorrelationProxy(explicitDetails);
  }

  // HYPE P/E ratio (market cap / annualised revenue)
  if (calculation === 'market_cap / annualized_revenue') {
    return collectPERatio(explicitDetails);
  }

  // GLXY valuation per MW
  if (calculation === 'market_cap / helios_capacity_mw') {
    return collectValuationPerMW(explicitDetails);
  }

  return null;
}

/**
 * Compute BTC-NASDAQ correlation using price_history as primary source.
 * Falls back to Yahoo Finance API if price_history has insufficient data.
 *
 * Reads daily closes for BTC, ^IXIC (NASDAQ), and ^GSPC (S&P 500) from
 * the price_history table, aligns on common trading days, and computes
 * Pearson correlation on daily returns.
 */
async function collectCorrelationProxy(
  details: Record<string, unknown>
): Promise<DerivedSnapshot | null> {
  const threshold = (details.threshold as number) ?? 0;
  const metric = details.metric as string || '';
  const window = metric.includes('90') ? 90 : 30;

  // Try price_history first (need ~window + buffer days)
  const minDays = window + 10;
  const [btcData, ndxData, spxData] = await Promise.all([
    fetchPriceHistoryByTicker('BTC', minDays),
    fetchPriceHistoryByTicker('^IXIC', minDays),
    fetchPriceHistoryByTicker('^GSPC', minDays),
  ]);

  const dbSource = btcData.length >= 20 && ndxData.length >= 20;

  // Fallback to Yahoo Finance if price_history has insufficient data
  let btcFinal = btcData;
  let ndxFinal = ndxData;
  let spxFinal = spxData;

  if (!dbSource) {
    console.log('  [derived] Insufficient price_history data, falling back to Yahoo Finance');
    const [btcYahoo, ndxYahoo, spxYahoo] = await Promise.all([
      fetchYahooPrices('BTC-USD'),
      fetchYahooPrices('^IXIC'),
      fetchYahooPrices('^GSPC'),
    ]);
    btcFinal = btcYahoo.length > btcData.length ? btcYahoo : btcData;
    ndxFinal = ndxYahoo.length > ndxData.length ? ndxYahoo : ndxData;
    spxFinal = spxYahoo.length > spxData.length ? spxYahoo : spxData;
  }

  if (btcFinal.length < 20 || ndxFinal.length < 20) {
    return null;
  }

  // Align on common dates
  const btcMap = Object.fromEntries(btcFinal.map(p => [p.date, p.close]));
  const ndxMap = Object.fromEntries(ndxFinal.map(p => [p.date, p.close]));
  const spxMap = Object.fromEntries(spxFinal.map(p => [p.date, p.close]));

  const btcDates = new Set(btcFinal.map(p => p.date));
  const ndxDates = new Set(ndxFinal.map(p => p.date));
  const commonDates = [...btcDates].filter(d => ndxDates.has(d)).sort();

  const useWindow = Math.min(window, commonDates.length);
  const recentDates = commonDates.slice(-useWindow);

  const btcPrices = recentDates.map(d => btcMap[d]);
  const ndxPrices = recentDates.map(d => ndxMap[d]);
  const spxPrices = recentDates.filter(d => spxMap[d]).map(d => spxMap[d]);

  const corr = pearsonCorrelation(btcPrices, ndxPrices);

  // SPX drawdown
  const spxPeak = Math.max(...spxPrices);
  const spxCurrent = spxPrices[spxPrices.length - 1] || 0;
  const spxDrawdown = spxPeak > 0 ? ((spxPeak - spxCurrent) / spxPeak) * 100 : 0;

  const pct = threshold > 0 ? (corr / threshold) * 100 : 0;
  const source = dbSource ? 'price_history' : 'yahoo_fallback';

  const summary = [
    `${useWindow}d BTC-NASDAQ correlation: ${corr.toFixed(4)}`,
    `SPX drawdown: ${spxDrawdown.toFixed(1)}% from ${useWindow}d high`,
    `BTC: $${btcPrices[btcPrices.length - 1]?.toLocaleString()}`,
    `(src: ${source})`,
  ].join(' | ');

  return {
    observedValue: corr,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: 'correlation',
    evidenceSummary: summary,
  };
}

interface DailyPrice { date: string; close: number; }

/**
 * Read daily closes from price_history for a given asset ticker.
 * Returns the most recent `minDays` entries, ordered by date ascending.
 */
async function fetchPriceHistoryByTicker(ticker: string, minDays: number): Promise<DailyPrice[]> {
  try {
    // Look up asset by ticker
    const [asset] = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(eq(schema.assets.ticker, ticker))
      .limit(1);

    if (!asset) return [];

    // Fetch recent prices, ordered ascending by date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (minDays * 2)); // 2x buffer for weekends/holidays
    const cutoff = cutoffDate.toISOString().split('T')[0];

    const rows = await db
      .select({
        priceDate: schema.priceHistory.priceDate,
        priceClose: schema.priceHistory.priceClose,
      })
      .from(schema.priceHistory)
      .where(
        and(
          eq(schema.priceHistory.assetId, asset.id),
          gte(schema.priceHistory.priceDate, cutoff),
        )
      )
      .orderBy(schema.priceHistory.priceDate);

    return rows.map(r => ({
      date: typeof r.priceDate === 'string'
        ? r.priceDate.split('T')[0]
        : new Date(r.priceDate).toISOString().split('T')[0],
      close: Number(r.priceClose),
    }));
  } catch (err) {
    console.warn(`  [derived] Failed to read price_history for ${ticker}:`, err);
    return [];
  }
}

/**
 * Fetch daily closes from Yahoo Finance (fallback).
 */
async function fetchYahooPrices(ticker: string): Promise<DailyPrice[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return [];

    const data = await res.json() as Record<string, unknown>;
    const chart = data.chart as Record<string, unknown>;
    const results = (chart?.result as Array<Record<string, unknown>>) || [];
    if (results.length === 0) return [];

    const result = results[0];
    const timestamps = result.timestamp as number[];
    const quote = ((result.indicators as Record<string, unknown>)?.quote as Array<Record<string, unknown>>)?.[0];
    const closes = quote?.close as (number | null)[];
    if (!timestamps || !closes) return [];

    return timestamps
      .map((ts, i) => closes[i] != null ? { date: new Date(ts * 1000).toISOString().split('T')[0], close: closes[i]! } : null)
      .filter((p): p is DailyPrice => p !== null);
  } catch (err) {
    console.warn(`  [derived] Yahoo Finance fallback failed for ${ticker}:`, err);
    return [];
  }
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  // Correlate daily returns, not raw prices
  const xr: number[] = [], yr: number[] = [];
  for (let i = 1; i < n; i++) {
    xr.push((x[i] - x[i - 1]) / x[i - 1]);
    yr.push((y[i] - y[i - 1]) / y[i - 1]);
  }

  const mx = xr.reduce((a, b) => a + b, 0) / xr.length;
  const my = yr.reduce((a, b) => a + b, 0) / yr.length;

  let sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < xr.length; i++) {
    const dx = xr[i] - mx, dy = yr[i] - my;
    sxy += dx * dy;
    sx2 += dx * dx;
    sy2 += dy * dy;
  }

  const d = Math.sqrt(sx2 * sy2);
  return d === 0 ? 0 : sxy / d;
}

/**
 * GLXY implied valuation per MW = market_cap / helios_capacity_mw
 */
async function collectValuationPerMW(
  details: Record<string, unknown>
): Promise<DerivedSnapshot | null> {
  const manualInputs = details.manualInputs as Record<string, Record<string, unknown>> | undefined;
  const currentMW = manualInputs?.helios_capacity_mw?.current as number;
  const threshold = details.threshold as number;

  // Can't compute without capacity data
  if (!currentMW || currentMW === 0) {
    // Fetch GLXY market cap anyway to track it
    const prices = await fetchPrices(['GLXY']);
    const glxyData = prices['GLXY'];

    return {
      observedValue: 0,
      thresholdValue: threshold,
      pctToThreshold: 0,
      unit: (details.thresholdUnit as string) || 'USD/MW',
      evidenceSummary: glxyData
        ? `GLXY market cap: $${(glxyData.marketCap! / 1e9).toFixed(1)}B | Helios capacity: 0 MW (Phase 1 pending H1 2026)`
        : 'Unable to fetch GLXY market cap',
    };
  }

  const prices = await fetchPrices(['GLXY']);
  const glxyData = prices['GLXY'];
  if (!glxyData?.marketCap) return null;

  const valuationPerMW = glxyData.marketCap / currentMW;
  const pct = threshold > 0 ? (valuationPerMW / threshold) * 100 : 0;

  return {
    observedValue: valuationPerMW,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (details.thresholdUnit as string) || 'USD/MW',
    evidenceSummary: `GLXY market cap: $${(glxyData.marketCap / 1e9).toFixed(1)}B / ${currentMW} MW = $${(valuationPerMW / 1e6).toFixed(1)}MM/MW`,
  };
}
