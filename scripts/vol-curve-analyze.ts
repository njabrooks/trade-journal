#!/usr/bin/env tsx
/**
 * Vol Curve Position Optimizer
 *
 * Analyzes the options vol surface for a given ticker and thesis,
 * then identifies optimal strike selection for call spreads and
 * risk reversals (call spread + short OTM put).
 *
 * Based on the Campbell strike optimization framework:
 * For each strike, compute thesis-implied expected value vs market price.
 * The ratio peaks at the optimal strike — below it you overpay for delta,
 * above it the vol smile makes each additional unit of optionality too expensive.
 *
 * Usage:
 *   npx tsx scripts/vol-curve-analyze.ts \
 *     --ticker NVDA \
 *     --direction bullish \
 *     --target-base 250 \
 *     --target-high 300 \
 *     --horizon-months 6 \
 *     --horizon-range 2 \
 *     --downside-floor 160
 *
 * Data sources:
 *   - Live: fetches options chain from Massive API for the requested horizon
 *   - Fallback: uses options_chain_snapshots from DB (limited to stored expiries)
 *   - IV/RV: computed from underlyings_iv_history spot time series
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

// ===================== CLI PARSING =====================

interface CliArgs {
  ticker: string;
  direction: 'bullish' | 'bearish';
  targetBase: number;
  targetHigh: number;
  horizonMonths: number;
  horizonRange: number;
  downsideFloor: number;
  riskFreeRate: number;
  snapshotDate: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const ticker = get('--ticker');
  const direction = get('--direction') as 'bullish' | 'bearish' | undefined;
  const targetBase = get('--target-base');
  const targetHigh = get('--target-high');
  const horizonMonths = get('--horizon-months');
  const horizonRange = get('--horizon-range');
  const downsideFloor = get('--downside-floor');
  const riskFreeRate = get('--risk-free-rate');
  const snapshotDate = get('--snapshot-date') || null;

  if (!ticker || !direction || !targetBase || !targetHigh || !horizonMonths || !downsideFloor) {
    console.error(`Usage: npx tsx scripts/vol-curve-analyze.ts \\
  --ticker NVDA \\
  --direction bullish \\
  --target-base 250 \\
  --target-high 300 \\
  --horizon-months 6 \\
  --horizon-range 2 \\
  --downside-floor 160 \\
  [--risk-free-rate 0.045] \\
  [--snapshot-date 2026-04-14]`);
    process.exit(1);
  }

  return {
    ticker: ticker.toUpperCase(),
    direction,
    targetBase: parseFloat(targetBase),
    targetHigh: parseFloat(targetHigh),
    horizonMonths: parseFloat(horizonMonths),
    horizonRange: parseFloat(horizonRange || '2'),
    downsideFloor: parseFloat(downsideFloor),
    riskFreeRate: parseFloat(riskFreeRate || '0.045'),
    snapshotDate,
  };
}

// ===================== BLACK-SCHOLES MATH =====================

function normalCdf(x: number): number {
  if (x > 6) return 1;
  if (x < -6) return 0;
  const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937;
  const b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419;
  const c = 0.39894228;
  if (x >= 0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

function normalPdf(x: number): number {
  return Math.exp(-x * x / 2.0) / Math.sqrt(2.0 * Math.PI);
}

function bsD1(S: number, K: number, T: number, r: number, sigma: number): number {
  return (Math.log(S / K) + (r + sigma * sigma / 2.0) * T) / (sigma * Math.sqrt(T));
}

function bsCallPrice(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) return Math.max(S - K, 0);
  if (sigma <= 0) return Math.max(S * Math.exp(r * T) - K, 0) * Math.exp(-r * T);
  const d1 = bsD1(S, K, T, r, sigma);
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
}

function bsPutPrice(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) return Math.max(K - S, 0);
  if (sigma <= 0) return Math.max(K - S * Math.exp(r * T), 0) * Math.exp(-r * T);
  const d1 = bsD1(S, K, T, r, sigma);
  const d2 = d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1);
}

function bsDelta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  if (T <= 0 || sigma <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = bsD1(S, K, T, r, sigma);
  return type === 'call' ? normalCdf(d1) : normalCdf(d1) - 1;
}

function bsVega(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = bsD1(S, K, T, r, sigma);
  return S * normalPdf(d1) * Math.sqrt(T) / 100; // per 1% vol move
}

function bsTheta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = bsD1(S, K, T, r, sigma);
  const d2 = d1 - sigma * Math.sqrt(T);
  const term1 = -S * normalPdf(d1) * sigma / (2 * Math.sqrt(T));
  if (type === 'call') {
    return (term1 - r * K * Math.exp(-r * T) * normalCdf(d2)) / 365;
  } else {
    return (term1 + r * K * Math.exp(-r * T) * normalCdf(-d2)) / 365;
  }
}

/**
 * Thesis-implied expected value of a call option.
 *
 * Models the user's belief as a lognormal distribution where:
 *   E[S_T] = targetBase (expected terminal price)
 *   sigma_thesis = ln(targetHigh / targetBase) (uncertainty in log space)
 *
 * This is mathematically equivalent to BS pricing with forward = targetBase.
 */
function thesisCallValue(targetBase: number, thesisSigma: number, K: number): number {
  if (thesisSigma <= 0) return Math.max(targetBase - K, 0);
  const d1 = (Math.log(targetBase / K) + thesisSigma * thesisSigma / 2) / thesisSigma;
  const d2 = d1 - thesisSigma;
  return targetBase * normalCdf(d1) - K * normalCdf(d2);
}

function thesisPutValue(targetBase: number, thesisSigma: number, K: number): number {
  if (thesisSigma <= 0) return Math.max(K - targetBase, 0);
  const d1 = (Math.log(targetBase / K) + thesisSigma * thesisSigma / 2) / thesisSigma;
  const d2 = d1 - thesisSigma;
  return K * normalCdf(-d2) - targetBase * normalCdf(-d1);
}

// ===================== DATA TYPES =====================

interface OptionRow {
  strike: number;
  expirationDate: string;
  dte: number;
  contractType: 'call' | 'put';
  iv: number;
  openInterest: number;
  volume: number;
  spot: number;
}

interface ExpiryGroup {
  expiry: string;
  dte: number;
  calls: OptionRow[];
  puts: OptionRow[];
}

interface Leg {
  action: 'buy' | 'sell';
  strike: number;
  type: 'call' | 'put';
  iv: number;
  marketPrice: number;
  thesisValue: number;
  edgeRatio: number;
  delta: number;
  vega: number;
  theta: number;
  openInterest: number;
}

interface Strategy {
  rank: number;
  label: string;
  type: 'naked_call' | 'call_spread' | 'risk_reversal' | 'butterfly';
  expiry: string;
  dte: number;
  legs: Leg[];
  netDebit: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number;
  payoffAtBase: number;
  payoffAtHigh: number;
  returnOnRiskBase: number;
  returnOnRiskHigh: number;
  annualizedRorBase: number;
  annualizedRorHigh: number;
  netDelta: number;
  netVega: number;
  netTheta: number;
  avgEdgeRatio: number;
  liquidityScore: number;
}

// ===================== DATA FETCHING =====================

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY!;

interface MassiveOptionResult {
  details: {
    strike_price: number;
    contract_type: string;
    expiration_date: string;
  };
  implied_volatility: number;
  open_interest: number;
  day?: {
    close?: number;
    vwap?: number;
    volume?: number;
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  underlying_asset?: {
    price?: number;
  };
}

async function fetchLiveChain(
  ticker: string,
  minDte: number,
  maxDte: number
): Promise<{ rows: OptionRow[]; spot: number } | null> {
  if (!MASSIVE_API_KEY) return null;

  const today = new Date();
  const minExpiry = new Date(today);
  minExpiry.setDate(minExpiry.getDate() + minDte);
  const maxExpiry = new Date(today);
  maxExpiry.setDate(maxExpiry.getDate() + maxDte);

  const minStr = minExpiry.toISOString().split('T')[0];
  const maxStr = maxExpiry.toISOString().split('T')[0];

  console.error(`[Live] Fetching ${ticker} chain for ${minStr} to ${maxStr}...`);

  const rows: OptionRow[] = [];
  let spot = 0;
  let nextUrl: string | null =
    `https://api.massive.com/v3/snapshot/options/${ticker}?apiKey=${MASSIVE_API_KEY}&limit=250&expiration_date.gte=${minStr}&expiration_date.lte=${maxStr}`;

  while (nextUrl) {
    try {
      const resp = await fetch(nextUrl);
      if (!resp.ok) {
        console.error(`[Live] API error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        return null;
      }
      const data = await resp.json();

      if (data.results && Array.isArray(data.results)) {
        for (const r of data.results as MassiveOptionResult[]) {
          if (!r.details || !r.implied_volatility) continue;
          const expDate = r.details.expiration_date;
          const expMs = new Date(expDate).getTime();
          const dte = Math.round((expMs - today.getTime()) / (1000 * 60 * 60 * 24));

          if (spot === 0 && r.underlying_asset?.price) {
            spot = r.underlying_asset.price;
          }

          rows.push({
            strike: r.details.strike_price,
            expirationDate: expDate,
            dte,
            contractType: r.details.contract_type as 'call' | 'put',
            iv: r.implied_volatility,
            openInterest: r.open_interest || 0,
            volume: r.day?.volume || 0,
            spot: r.underlying_asset?.price || 0,
          });
        }
      }

      nextUrl = data.next_url
        ? `${data.next_url}&apiKey=${MASSIVE_API_KEY}`
        : null;
    } catch (err) {
      console.error(`[Live] Fetch error:`, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  console.error(`[Live] Fetched ${rows.length} contracts across ${new Set(rows.map(r => r.expirationDate)).size} expiries`);
  return rows.length > 0 ? { rows, spot } : null;
}

async function fetchDbChain(
  ticker: string,
  snapshotDate: string | null,
  minDte: number,
  maxDte: number
): Promise<{ rows: OptionRow[]; spot: number }> {
  // Get latest snapshot date if not specified
  const dateResult = snapshotDate
    ? [{ snapshot_date: snapshotDate }]
    : await db.execute(sql`
        SELECT DISTINCT snapshot_date FROM options_chain_snapshots
        WHERE ticker = ${ticker}
        ORDER BY snapshot_date DESC LIMIT 1
      `);

  const latestDate = (dateResult as any)[0]?.snapshot_date;
  if (!latestDate) {
    console.error(`[DB] No options data found for ${ticker}`);
    return { rows: [], spot: 0 };
  }

  console.error(`[DB] Loading ${ticker} chain from ${latestDate} (DTE ${minDte}-${maxDte})...`);

  const dbRows = await db.execute(sql`
    SELECT strike, expiration_date, dte, contract_type, implied_volatility,
           open_interest, volume, underlying_spot
    FROM options_chain_snapshots
    WHERE ticker = ${ticker}
      AND snapshot_date = ${latestDate}::date
      AND dte >= ${minDte}
      AND dte <= ${maxDte}
    ORDER BY dte, contract_type, strike
  `);

  const rows: OptionRow[] = (dbRows as any[]).map(r => ({
    strike: parseFloat(r.strike),
    expirationDate: r.expiration_date instanceof Date
      ? r.expiration_date.toISOString().split('T')[0]!
      : String(r.expiration_date).split('T')[0]!,
    dte: parseInt(r.dte),
    contractType: r.contract_type as 'call' | 'put',
    iv: parseFloat(r.implied_volatility),
    openInterest: parseInt(r.open_interest || '0'),
    volume: parseInt(r.volume || '0'),
    spot: parseFloat(r.underlying_spot),
  }));

  const spot = rows.length > 0 ? rows[0]!.spot : 0;
  console.error(`[DB] Loaded ${rows.length} contracts across ${new Set(rows.map(r => r.expirationDate)).size} expiries`);
  return { rows, spot };
}

async function fetchSpotFromIvHistory(ticker: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT spot FROM underlyings_iv_history
    WHERE ticker = ${ticker}
    ORDER BY as_of_date DESC LIMIT 1
  `);
  return (result as any)[0]?.spot ? parseFloat((result as any)[0].spot) : 0;
}

/**
 * Fetch spot price and recent daily closes from Massive API (for tickers not in DB)
 */
async function fetchLiveSpotAndHistory(ticker: string, lookback: number = 30): Promise<{
  spot: number;
  closes: number[];
} | null> {
  if (!MASSIVE_API_KEY) return null;

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - lookback * 1.5); // extra days for weekends/holidays
  const fromStr = from.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  try {
    const url = `https://api.massive.com/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}?apiKey=${MASSIVE_API_KEY}&limit=50&sort=desc`;
    console.error(`[Live] Fetching ${ticker} daily bars for RV calculation...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[Live] Aggregates API error ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      const closes = data.results.map((r: any) => r.c as number).filter((c: number) => c > 0);
      const spot = closes[0] || 0;
      console.error(`[Live] Got ${closes.length} daily closes, latest spot: $${spot.toFixed(2)}`);
      return { spot, closes };
    }
  } catch (err) {
    console.error(`[Live] Error fetching aggregates:`, err instanceof Error ? err.message : String(err));
  }
  return null;
}

function computeRvFromCloses(closes: number[]): number | null {
  if (closes.length < 5) return null;
  const logReturns: number[] = [];
  for (let i = 0; i < closes.length - 1; i++) {
    logReturns.push(Math.log(closes[i]! / closes[i + 1]!));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance * 252);
}

async function computeRealizedVol(ticker: string, lookback: number = 20): Promise<number | null> {
  // Try DB first
  const result = await db.execute(sql`
    SELECT spot FROM underlyings_iv_history
    WHERE ticker = ${ticker} AND spot IS NOT NULL AND spot > 0
    ORDER BY as_of_date DESC
    LIMIT ${lookback + 1}
  `);

  const spots = (result as any[]).map(r => parseFloat(r.spot)).filter(s => s > 0);
  if (spots.length >= 5) {
    return computeRvFromCloses(spots);
  }

  // Fall back to live API
  const liveData = await fetchLiveSpotAndHistory(ticker, lookback);
  if (liveData && liveData.closes.length >= 5) {
    return computeRvFromCloses(liveData.closes);
  }

  return null;
}

async function fetchIv30(ticker: string): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT iv30 FROM underlyings_iv_history
    WHERE ticker = ${ticker} AND iv30 IS NOT NULL
    ORDER BY as_of_date DESC LIMIT 1
  `);
  return (result as any)[0]?.iv30 ? parseFloat((result as any)[0].iv30) : null;
}

/**
 * Compute approximate IV30 from the options chain (ATM IV at nearest available expiry)
 */
function computeIv30FromChain(rows: OptionRow[], spot: number): number | null {
  // Find calls at any DTE, prefer closest to 30
  const calls = rows
    .filter(r => r.contractType === 'call' && r.iv > 0.01)
    .sort((a, b) => Math.abs(a.dte - 30) - Math.abs(b.dte - 30));

  if (calls.length === 0) return null;

  // Use the shortest available expiry's ATM IV
  const shortestDte = calls[0]!.dte;
  const sameExpiry = calls.filter(c => c.dte === shortestDte);

  // Find ATM (closest to spot)
  const atm = sameExpiry.reduce((best, c) =>
    Math.abs(c.strike - spot) < Math.abs(best.strike - spot) ? c : best
  );

  return atm.iv;
}

/**
 * Fetch IV and RV history for the vol-over-time chart.
 * Tries DB first (underlyings_iv_history), then falls back to computing from Massive daily bars.
 */
async function fetchVolHistory(ticker: string, days: number = 252): Promise<VolHistoryPoint[]> {
  // Try DB first
  const dbResult = await db.execute(sql`
    SELECT as_of_date, iv30, spot
    FROM underlyings_iv_history
    WHERE ticker = ${ticker} AND spot IS NOT NULL AND spot > 0
    ORDER BY as_of_date DESC
    LIMIT ${days}
  `);

  const dbRows = (dbResult as any[]);

  if (dbRows.length >= 20) {
    // Compute rolling 20-day RV for each point
    const spots = dbRows.map(r => ({ date: String(r.as_of_date).split('T')[0]!, spot: parseFloat(r.spot), iv30: r.iv30 ? parseFloat(r.iv30) : null }));
    const history: VolHistoryPoint[] = [];

    for (let i = 0; i < spots.length; i++) {
      let rv20: number | null = null;
      if (i + 20 < spots.length) {
        const window = spots.slice(i, i + 21);
        const logReturns: number[] = [];
        for (let j = 0; j < window.length - 1; j++) {
          logReturns.push(Math.log(window[j]!.spot / window[j + 1]!.spot));
        }
        const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
        rv20 = Math.sqrt(variance * 252);
      }
      history.push({
        date: spots[i]!.date,
        iv30: spots[i]!.iv30,
        rv20,
        spot: spots[i]!.spot,
      });
    }
    return history.reverse(); // chronological order
  }

  // Fallback: fetch from Massive API and compute RV only (no IV history available)
  if (!MASSIVE_API_KEY) return [];

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - days * 1.5);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  try {
    const url = `https://api.massive.com/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}?apiKey=${MASSIVE_API_KEY}&limit=500&sort=asc`;
    console.error(`[Live] Fetching ${ticker} daily bars for vol history...`);
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();

    if (!data.results || !Array.isArray(data.results)) return [];

    const bars = data.results as Array<{ c: number; t: number }>;
    const history: VolHistoryPoint[] = [];

    for (let i = 0; i < bars.length; i++) {
      const date = new Date(bars[i]!.t).toISOString().split('T')[0]!;
      let rv20: number | null = null;

      if (i >= 20) {
        const window = bars.slice(i - 20, i + 1);
        const logReturns: number[] = [];
        for (let j = 1; j < window.length; j++) {
          logReturns.push(Math.log(window[j]!.c / window[j - 1]!.c));
        }
        const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
        rv20 = Math.sqrt(variance * 252);
      }

      history.push({ date, iv30: null, rv20, spot: bars[i]!.c });
    }

    console.error(`[Live] Computed vol history: ${history.length} points, ${history.filter(h => h.rv20).length} with RV`);
    return history;
  } catch (err) {
    console.error(`[Live] Error fetching vol history:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

function computeVolRank(volHistory: VolHistoryPoint[], currentIv: number | null, currentRv: number | null): VolRankInfo {
  const ivValues = volHistory.map(h => h.iv30).filter(Boolean) as number[];
  const rvValues = volHistory.map(h => h.rv20).filter(Boolean) as number[];

  let ivRank: number | null = null;
  let ivPercentile: number | null = null;
  let iv52High: number | null = null;
  let iv52Low: number | null = null;

  if (ivValues.length >= 20 && currentIv) {
    iv52High = Math.max(...ivValues);
    iv52Low = Math.min(...ivValues);
    const range = iv52High - iv52Low;
    ivRank = range > 0 ? (currentIv - iv52Low) / range : 0.5;
    ivPercentile = ivValues.filter(v => v < currentIv).length / ivValues.length;
  }

  let rv52High: number | null = null;
  let rv52Low: number | null = null;

  if (rvValues.length >= 20) {
    rv52High = Math.max(...rvValues);
    rv52Low = Math.min(...rvValues);
  }

  return { ivRank, ivPercentile, iv52High, iv52Low, rv52High, rv52Low };
}

// ===================== ANALYSIS =====================

function groupByExpiry(rows: OptionRow[]): ExpiryGroup[] {
  const map = new Map<string, ExpiryGroup>();
  for (const row of rows) {
    if (!map.has(row.expirationDate)) {
      map.set(row.expirationDate, {
        expiry: row.expirationDate,
        dte: row.dte,
        calls: [],
        puts: [],
      });
    }
    const group = map.get(row.expirationDate)!;
    if (row.contractType === 'call') group.calls.push(row);
    else group.puts.push(row);
  }
  return Array.from(map.values()).sort((a, b) => a.dte - b.dte);
}

function computeEdgeRatios(
  options: OptionRow[],
  spot: number,
  T: number,
  r: number,
  targetBase: number,
  thesisSigma: number,
  type: 'call' | 'put'
): Array<OptionRow & { marketPrice: number; thesisValue: number; edgeRatio: number }> {
  return options
    .filter(o => o.iv > 0.01 && o.iv < 5.0) // sanity filter
    .map(o => {
      const marketPrice = type === 'call'
        ? bsCallPrice(spot, o.strike, T, r, o.iv)
        : bsPutPrice(spot, o.strike, T, r, o.iv);

      const thesisValue = type === 'call'
        ? thesisCallValue(targetBase, thesisSigma, o.strike)
        : thesisPutValue(targetBase, thesisSigma, o.strike);

      // For calls we BUY: edge = thesis/market (higher = better buy)
      // For puts we SELL: edge = market/thesis (higher = better sell)
      const edgeRatio = type === 'call'
        ? (marketPrice > 0.01 ? thesisValue / marketPrice : 0)
        : (thesisValue > 0.01 ? marketPrice / thesisValue : 0);

      return { ...o, marketPrice, thesisValue, edgeRatio };
    })
    .filter(o => o.marketPrice > 0.001);
}

function makeLeg(
  action: 'buy' | 'sell',
  opt: OptionRow & { marketPrice: number; thesisValue: number; edgeRatio: number },
  spot: number,
  T: number,
  r: number
): Leg {
  return {
    action,
    strike: opt.strike,
    type: opt.contractType,
    iv: opt.iv,
    marketPrice: opt.marketPrice,
    thesisValue: opt.thesisValue,
    edgeRatio: opt.edgeRatio,
    delta: bsDelta(spot, opt.strike, T, r, opt.iv, opt.contractType),
    vega: bsVega(spot, opt.strike, T, r, opt.iv),
    theta: bsTheta(spot, opt.strike, T, r, opt.iv, opt.contractType),
    openInterest: opt.openInterest,
  };
}

function evaluatePayoffAtPrice(legs: Leg[], priceAtExpiry: number): number {
  let pnl = 0;
  for (const leg of legs) {
    const intrinsic = leg.type === 'call'
      ? Math.max(priceAtExpiry - leg.strike, 0)
      : Math.max(leg.strike - priceAtExpiry, 0);
    if (leg.action === 'buy') {
      pnl += intrinsic - leg.marketPrice;
    } else {
      pnl += leg.marketPrice - intrinsic;
    }
  }
  return pnl;
}

function computeBreakeven(legs: Leg[], spot: number, direction: 'bullish' | 'bearish'): number {
  // Binary search for breakeven above spot (bullish) or below spot (bearish)
  let lo = direction === 'bullish' ? spot * 0.5 : 0.01;
  let hi = direction === 'bullish' ? spot * 3.0 : spot * 1.5;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const pnl = evaluatePayoffAtPrice(legs, mid);
    if (direction === 'bullish') {
      if (pnl > 0) hi = mid;
      else lo = mid;
    } else {
      if (pnl > 0) lo = mid;
      else hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function generateStrategies(
  expiry: ExpiryGroup,
  spot: number,
  args: CliArgs,
  thesisSigma: number
): Strategy[] {
  const T = expiry.dte / 365;
  const r = args.riskFreeRate;
  const strategies: Strategy[] = [];

  // Compute edge ratios for all calls and puts
  const callEdges = computeEdgeRatios(
    expiry.calls, spot, T, r, args.targetBase, thesisSigma, 'call'
  ).sort((a, b) => b.edgeRatio - a.edgeRatio);

  const putEdges = computeEdgeRatios(
    expiry.puts.filter(p => p.strike <= args.downsideFloor), spot, T, r,
    args.targetBase, thesisSigma, 'put'
  );

  if (callEdges.length === 0) return [];

  // Find optimal long call candidates (top 3 by edge ratio, above spot)
  const longCandidates = callEdges
    .filter(c => c.strike > spot)
    .slice(0, 3);

  // For short call: strikes near target high, or where IV inflects up
  // Also include wider strikes up to 2x the expected move for wide risk reversals
  const shortCallCandidates = callEdges
    .filter(c => c.strike >= args.targetBase && c.strike <= args.targetHigh * 1.5)
    .sort((a, b) => a.strike - b.strike);

  // Short put candidates: rank by PREMIUM COLLECTED (marketPrice), not edge ratio
  // A $60 put that collects $2.69 is more useful than a $15 put that collects $0.09
  // Filter to puts that collect at least 0.5% of spot in premium (meaningful funding)
  const shortPutCandidates = putEdges
    .filter(p => p.marketPrice >= spot * 0.003) // at least 0.3% of spot
    .sort((a, b) => b.marketPrice - a.marketPrice) // rank by premium, not edge
    .slice(0, 4);

  for (const longCall of longCandidates) {
    const longLeg = makeLeg('buy', longCall, spot, T, r);

    // === NAKED CALL ===
    {
      const legs = [longLeg];
      const netDebit = longLeg.marketPrice;
      const payoffBase = evaluatePayoffAtPrice(legs, args.targetBase);
      const payoffHigh = evaluatePayoffAtPrice(legs, args.targetHigh);
      const maxLoss = netDebit;

      // Max profit is technically unlimited
      const maxProfit = evaluatePayoffAtPrice(legs, spot * 3);

      const breakeven = computeBreakeven(legs, spot, args.direction);

      const rorBase = maxLoss > 0 ? payoffBase / maxLoss : 0;
      const rorHigh = maxLoss > 0 ? payoffHigh / maxLoss : 0;

      strategies.push({
        rank: 0,
        label: `${expiry.expiry.slice(0, 10)} ${longCall.strike}C`,
        type: 'naked_call',
        expiry: expiry.expiry,
        dte: expiry.dte,
        legs,
        netDebit,
        maxProfit,
        maxLoss,
        breakeven,
        payoffAtBase: payoffBase,
        payoffAtHigh: payoffHigh,
        returnOnRiskBase: rorBase,
        returnOnRiskHigh: rorHigh,
        annualizedRorBase: rorBase * (365 / expiry.dte),
        annualizedRorHigh: rorHigh * (365 / expiry.dte),
        netDelta: longLeg.delta,
        netVega: longLeg.vega,
        netTheta: longLeg.theta,
        avgEdgeRatio: longCall.edgeRatio,
        liquidityScore: Math.min(1, (longCall.openInterest + longCall.volume) / 1000),
      });
    }

    // === CALL SPREADS ===
    for (const shortCall of shortCallCandidates) {
      if (shortCall.strike <= longCall.strike) continue;

      const shortLeg = makeLeg('sell', shortCall, spot, T, r);
      const legs = [longLeg, shortLeg];

      const netDebit = longLeg.marketPrice - shortLeg.marketPrice;
      if (netDebit <= 0) continue; // Skip credit spreads (wrong direction)

      const spreadWidth = shortCall.strike - longCall.strike;
      const maxProfit = spreadWidth - netDebit;
      const maxLoss = netDebit;

      const payoffBase = evaluatePayoffAtPrice(legs, args.targetBase);
      const payoffHigh = evaluatePayoffAtPrice(legs, args.targetHigh);
      const breakeven = computeBreakeven(legs, spot, args.direction);

      const rorBase = maxLoss > 0 ? payoffBase / maxLoss : 0;
      const rorHigh = maxLoss > 0 ? payoffHigh / maxLoss : 0;

      const avgEdge = (longCall.edgeRatio + (1 / Math.max(shortCall.edgeRatio, 0.01))) / 2;
      const minOi = Math.min(longCall.openInterest, shortCall.openInterest);

      strategies.push({
        rank: 0,
        label: `${expiry.expiry.slice(0, 10)} ${longCall.strike}/${shortCall.strike}C`,
        type: 'call_spread',
        expiry: expiry.expiry,
        dte: expiry.dte,
        legs,
        netDebit,
        maxProfit,
        maxLoss,
        breakeven,
        payoffAtBase: payoffBase,
        payoffAtHigh: payoffHigh,
        returnOnRiskBase: rorBase,
        returnOnRiskHigh: rorHigh,
        annualizedRorBase: rorBase * (365 / expiry.dte),
        annualizedRorHigh: rorHigh * (365 / expiry.dte),
        netDelta: longLeg.delta + shortLeg.delta,
        netVega: longLeg.vega + shortLeg.vega,
        netTheta: longLeg.theta + shortLeg.theta,
        avgEdgeRatio: avgEdge,
        liquidityScore: Math.min(1, (minOi + Math.min(longCall.volume, shortCall.volume)) / 1000),
      });
    }

    // === RISK REVERSALS (call spread + short put) ===
    for (const shortCall of shortCallCandidates) {
      if (shortCall.strike <= longCall.strike) continue;

      for (const shortPut of shortPutCandidates) {
        const shortCallLeg = makeLeg('sell', shortCall, spot, T, r);
        const shortPutLeg = makeLeg('sell', shortPut, spot, T, r);
        const legs = [longLeg, shortCallLeg, shortPutLeg];

        const netDebit = longLeg.marketPrice - shortCallLeg.marketPrice - shortPutLeg.marketPrice;
        const spreadWidth = shortCall.strike - longCall.strike;

        // Max profit: price at short call strike
        const maxProfit = spreadWidth - Math.max(netDebit, 0);

        // Max loss: downside — if stock goes to zero, short put assignment
        const downsideLoss = shortPut.strike + Math.max(netDebit, 0);
        // Upside max loss is just the net debit (if positive)
        const maxLoss = Math.max(Math.max(netDebit, 0), downsideLoss);

        const payoffBase = evaluatePayoffAtPrice(legs, args.targetBase);
        const payoffHigh = evaluatePayoffAtPrice(legs, args.targetHigh);
        const breakeven = computeBreakeven(legs, spot, args.direction);

        // For risk reversals, capital at risk includes the short put margin requirement
        // even when net debit is near-zero — the put assignment risk IS the capital commitment
        const putMarginEstimate = shortPut.strike * 0.2; // ~20% of strike is typical reg-T margin
        const capitalAtRisk = Math.max(netDebit, putMarginEstimate);
        const rorBase = capitalAtRisk > 0 ? payoffBase / capitalAtRisk : 0;
        const rorHigh = capitalAtRisk > 0 ? payoffHigh / capitalAtRisk : 0;

        const minOi = Math.min(longCall.openInterest, shortCall.openInterest, shortPut.openInterest);

        strategies.push({
          rank: 0,
          label: netDebit > 0
            ? `${expiry.expiry.slice(0, 10)} ${longCall.strike}/${shortCall.strike}C, -${shortPut.strike}P`
            : `${expiry.expiry.slice(0, 10)} ${longCall.strike}/${shortCall.strike}C, -${shortPut.strike}P [credit]`,
          type: 'risk_reversal',
          expiry: expiry.expiry,
          dte: expiry.dte,
          legs,
          netDebit,
          maxProfit,
          maxLoss,
          breakeven,
          payoffAtBase: payoffBase,
          payoffAtHigh: payoffHigh,
          returnOnRiskBase: rorBase,
          returnOnRiskHigh: rorHigh,
          annualizedRorBase: rorBase * (365 / expiry.dte),
          annualizedRorHigh: rorHigh * (365 / expiry.dte),
          netDelta: longLeg.delta + shortCallLeg.delta + shortPutLeg.delta,
          netVega: longLeg.vega + shortCallLeg.vega + shortPutLeg.vega,
          netTheta: longLeg.theta + shortCallLeg.theta + shortPutLeg.theta,
          avgEdgeRatio: (longCall.edgeRatio + shortPut.edgeRatio) / 2,
          liquidityScore: Math.min(1, (minOi) / 500),
        });
      }
    }
  }

  // === BUTTERFLIES (independent of longCandidates loop) ===
  // Call butterfly centered near base target: buy lower, sell 2x middle, buy upper
  // Best when you have a precise price target and want max return if it lands there
  const allCallsSorted = callEdges.sort((a, b) => a.strike - b.strike);

  // Find middle strikes near the base target
  const middleCandidates = allCallsSorted
    .filter(c => Math.abs(c.strike - args.targetBase) / args.targetBase < 0.08)
    .slice(0, 3);

  for (const middle of middleCandidates) {
    // Find equidistant wings — try several widths
    const widths = [5, 10, 15, 20, 25].filter(w => {
      // Scale widths to be reasonable relative to spot (2-15% of spot)
      return w >= spot * 0.02 && w <= spot * 0.15;
    });

    // If no standard widths work (e.g. low-price stock), use proportional widths
    const effectiveWidths = widths.length > 0 ? widths : [
      Math.round(spot * 0.03),
      Math.round(spot * 0.05),
      Math.round(spot * 0.08),
    ].filter(w => w >= 1);

    for (const width of effectiveWidths) {
      const lowerStrike = middle.strike - width;
      const upperStrike = middle.strike + width;

      const lower = allCallsSorted.find(c => c.strike === lowerStrike);
      const upper = allCallsSorted.find(c => c.strike === upperStrike);
      if (!lower || !upper) continue;

      const lowerLeg = makeLeg('buy', lower, spot, T, r);
      const middleLeg1 = makeLeg('sell', middle, spot, T, r);
      const middleLeg2 = makeLeg('sell', middle, spot, T, r); // second short
      const upperLeg = makeLeg('buy', upper, spot, T, r);

      const legs = [lowerLeg, middleLeg1, middleLeg2, upperLeg];
      const netDebit = lower.marketPrice - 2 * middle.marketPrice + upper.marketPrice;
      if (netDebit <= 0) continue; // Should always be a debit for a properly structured butterfly

      const maxProfit = width - netDebit;
      const maxLoss = netDebit;

      const payoffBase = evaluatePayoffAtPrice(legs, args.targetBase);
      const payoffHigh = evaluatePayoffAtPrice(legs, args.targetHigh);
      const breakeven = computeBreakeven(legs, spot, args.direction);

      const rorBase = maxLoss > 0 ? payoffBase / maxLoss : 0;
      const rorHigh = maxLoss > 0 ? payoffHigh / maxLoss : 0;

      const minOi = Math.min(lower.openInterest, middle.openInterest, upper.openInterest);

      strategies.push({
        rank: 0,
        label: `${expiry.expiry.slice(0, 10)} ${lowerStrike}/${middle.strike}/${upperStrike}C fly`,
        type: 'butterfly',
        expiry: expiry.expiry,
        dte: expiry.dte,
        legs,
        netDebit,
        maxProfit,
        maxLoss,
        breakeven,
        payoffAtBase: payoffBase,
        payoffAtHigh: payoffHigh,
        returnOnRiskBase: rorBase,
        returnOnRiskHigh: rorHigh,
        annualizedRorBase: rorBase * (365 / expiry.dte),
        annualizedRorHigh: rorHigh * (365 / expiry.dte),
        netDelta: lowerLeg.delta + middleLeg1.delta + middleLeg2.delta + upperLeg.delta,
        netVega: lowerLeg.vega + middleLeg1.vega + middleLeg2.vega + upperLeg.vega,
        netTheta: lowerLeg.theta + middleLeg1.theta + middleLeg2.theta + upperLeg.theta,
        avgEdgeRatio: (lower.edgeRatio + middle.edgeRatio + upper.edgeRatio) / 3,
        liquidityScore: Math.min(1, minOi / 500),
      });
    }
  }

  return strategies;
}

function rankStrategies(strategies: Strategy[]): Strategy[] {
  // Composite score: edge ratio × return on risk × liquidity, penalize very short DTE
  for (const s of strategies) {
    // Filter out strategies with negative payoff at base case
    if (s.payoffAtBase <= 0) {
      s.rank = 9999;
      continue;
    }
  }

  return strategies
    .filter(s => s.payoffAtBase > 0)
    .sort((a, b) => {
      // Primary: annualized return on risk at base case
      // Secondary: edge ratio
      // Tertiary: liquidity
      const scoreA = a.annualizedRorBase * 0.6 + a.avgEdgeRatio * 0.3 + a.liquidityScore * 0.1;
      const scoreB = b.annualizedRorBase * 0.6 + b.avgEdgeRatio * 0.3 + b.liquidityScore * 0.1;
      return scoreB - scoreA;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ===================== VOL SURFACE ANALYSIS =====================

function analyzeSmile(calls: Array<{ strike: number; iv: number; spot: number }>): {
  atmIv: number;
  callSkewSlope: number; // IV change per 10% OTM
  smileDescription: string;
} {
  if (calls.length === 0) return { atmIv: 0, callSkewSlope: 0, smileDescription: 'No data' };

  const spot = calls[0]!.spot;
  // Find ATM IV (closest to spot)
  const atm = calls.reduce((best, c) =>
    Math.abs(c.strike - spot) < Math.abs(best.strike - spot) ? c : best
  );

  // Compute call skew: IV at 10% OTM vs ATM
  const otm10 = calls.find(c => c.strike >= spot * 1.08 && c.strike <= spot * 1.12);
  const otm20 = calls.find(c => c.strike >= spot * 1.18 && c.strike <= spot * 1.22);

  const callSkewSlope = otm10
    ? (otm10.iv - atm.iv) / ((otm10.strike - atm.strike) / spot)
    : 0;

  let smileDescription: string;
  if (callSkewSlope > 0.3) {
    smileDescription = 'Steep upside skew — call spreads harvest significant vol differential';
  } else if (callSkewSlope > 0.1) {
    smileDescription = 'Moderate upside skew — call spreads collect meaningful premium at upper strike';
  } else if (callSkewSlope > -0.1) {
    smileDescription = 'Flat smile — limited vol differential between strikes, naked calls may be preferable';
  } else {
    smileDescription = 'Inverted skew — OTM calls cheaper than ATM, favors wider spreads or naked calls';
  }

  return { atmIv: atm.iv, callSkewSlope, smileDescription };
}

function analyzePutSkew(puts: Array<{ strike: number; iv: number; spot: number }>): {
  putSkewRichness: number; // ratio of 25-delta put IV to ATM IV
  description: string;
} {
  if (puts.length === 0) return { putSkewRichness: 1, description: 'No put data' };

  const spot = puts[0]!.spot;
  const atm = puts.reduce((best, p) =>
    Math.abs(p.strike - spot) < Math.abs(best.strike - spot) ? p : best
  );

  // 10-15% OTM puts
  const otmPut = puts.find(p => p.strike >= spot * 0.85 && p.strike <= spot * 0.92);
  const richness = otmPut ? otmPut.iv / atm.iv : 1;

  let description: string;
  if (richness > 1.3) {
    description = 'Put skew very rich — short OTM puts collect premium well above fair vol';
  } else if (richness > 1.15) {
    description = 'Put skew moderately rich — short puts offer good funding for call spreads';
  } else {
    description = 'Put skew flat — limited premium advantage from selling puts vs ATM vol';
  }

  return { putSkewRichness: richness, description };
}

// ===================== NARRATIVE GENERATION =====================

interface NarrativeSection {
  title: string;
  body: string;
}

interface Narrative {
  volContext: string;
  structureGuidance: string;
  recommendations: NarrativeSection[];
  keyRisks: string;
}

function generateNarrative(
  strategies: Strategy[],
  context: { spot: number; iv30: number | null; rv20: number | null; ivRvRatio: number | null; ivRvAssessment: string; smileAnalysis: { callSkewSlope: number; smileDescription: string; atmIv: number }; putSkewAnalysis: { putSkewRichness: number; description: string }; thesisSigma: number },
  thesis: { targetBase: number; targetHigh: number; downsideFloor: number; direction: string },
  volRank: { ivRank: number | null; ivPercentile: number | null; iv52High: number | null; iv52Low: number | null }
): Narrative {
  const pctToBase = ((thesis.targetBase / context.spot - 1) * 100).toFixed(0);
  const pctToHigh = ((thesis.targetHigh / context.spot - 1) * 100).toFixed(0);

  // Best of each type
  const bestByType: Record<string, Strategy | undefined> = {};
  for (const s of strategies) {
    if (!bestByType[s.type] || s.annualizedRorBase > bestByType[s.type]!.annualizedRorBase) {
      bestByType[s.type] = s;
    }
  }

  // Vol context narrative
  let volContext = '';
  if (context.ivRvRatio) {
    if (context.ivRvRatio > 1.2) {
      volContext = `Implied volatility is significantly elevated at ${(context.ivRvRatio * 100 - 100).toFixed(0)}% above realized vol. Options are expensive — the market is pricing more uncertainty than has actually materialized. This strongly favors structures that sell volatility back: call spreads (selling expensive OTM calls) and risk reversals (also selling expensive OTM puts). Naked long options are paying a premium that may decay before your thesis plays out.`;
    } else if (context.ivRvRatio > 1.0) {
      volContext = `Implied volatility is moderately above realized (${(context.ivRvRatio).toFixed(2)}x ratio). Options are slightly expensive but not dramatically so. Both spreads and naked calls are viable — the spread approach recaptures some of the excess premium, while naked calls preserve open-ended upside.`;
    } else {
      volContext = `Implied volatility is at or below realized (${(context.ivRvRatio).toFixed(2)}x ratio). Options are fairly priced to cheap. This favors buying optionality — naked calls and wider spreads benefit more when you're not overpaying for vol. Selling puts adds less value when put premium isn't rich.`;
    }
  }

  if (volRank.ivRank !== null) {
    const rankPct = (volRank.ivRank * 100).toFixed(0);
    if (volRank.ivRank < 0.2) {
      volContext += ` IV rank is at the ${rankPct}th percentile of its 52-week range — vol is near historical lows. Even if IV/RV is above 1, the absolute level of vol is low. This can be a good setup for long vol positions if you expect a catalyst to reprice uncertainty.`;
    } else if (volRank.ivRank > 0.8) {
      volContext += ` IV rank is at the ${rankPct}th percentile — vol is near 52-week highs. Options are expensive in absolute terms as well as relative to realized. Structures that sell vol are doubly attractive here.`;
    }
  }

  // Structure guidance
  let structureGuidance = '';
  const slopeDesc = context.smileAnalysis.callSkewSlope;
  if (slopeDesc < -0.05) {
    structureGuidance = `The call skew is inverted — OTM calls are cheaper than ATM in implied vol terms. This is unusual and means the further out-of-the-money you go, the less vol premium you're paying per unit of optionality. This favors wider structures: naked calls benefit the most, and wider call spreads harvest more vol differential than narrow ones.`;
  } else if (slopeDesc > 0.2) {
    structureGuidance = `The call skew is steep — OTM calls get progressively more expensive in IV terms. Selling the upper leg of a call spread recaptures significant premium from the smile. Narrow spreads centered near the base target are more efficient than wide spreads where you'd be buying expensive far-OTM calls.`;
  } else {
    structureGuidance = `The call skew is relatively flat. The vol smile doesn't strongly favor one structure over another — strike selection matters more than structure type in this regime.`;
  }

  if (context.putSkewAnalysis.putSkewRichness > 1.2) {
    structureGuidance += ` Put skew is rich at ${context.putSkewAnalysis.putSkewRichness.toFixed(2)}x ATM vol — short OTM puts collect premium well above fair value, making risk reversals an attractive way to fund call spreads.`;
  } else {
    structureGuidance += ` Put skew is moderate (${context.putSkewAnalysis.putSkewRichness.toFixed(2)}x ATM). Short puts provide some funding but aren't exceptionally rich — the risk reversal structure is worth it mainly for the margin offset, not for the vol edge on the put.`;
  }

  // Recommendations
  const recommendations: NarrativeSection[] = [];

  if (bestByType['call_spread']) {
    const cs = bestByType['call_spread']!;
    recommendations.push({
      title: 'Choose a call spread if you want defined risk and capital efficiency',
      body: `Best call spread: ${cs.label} — costs $${cs.netDebit.toFixed(2)} ($${(cs.netDebit * 100).toFixed(0)}/contract), pays $${cs.payoffAtBase.toFixed(2)} at the base target for ${cs.returnOnRiskBase.toFixed(1)}x return on risk. Max loss is exactly the premium paid — no assignment risk, no margin requirement beyond the debit. The trade-off: you give up upside beyond the short strike, so if the stock overshoots your high target, you don't participate. Best for high-conviction, price-specific views where capital efficiency matters most.`,
    });
  }

  if (bestByType['risk_reversal']) {
    const rr = bestByType['risk_reversal']!;
    const putStrike = rr.legs.find(l => l.type === 'put')?.strike || 0;
    recommendations.push({
      title: 'Choose a risk reversal if you want larger position size with less upfront cost',
      body: `Best risk reversal: ${rr.label} — net cost $${rr.netDebit.toFixed(2)}, pays $${rr.payoffAtBase.toFixed(2)} at base target. The short put at $${putStrike} reduces your cost but introduces assignment risk: if the stock drops to $${putStrike}, you effectively buy 100 shares at that price. This structure works when you're genuinely willing to own the stock at the floor level AND want to size up without deploying more capital. Key risk: a sharp drawdown costs you on the put before the call pays out.`,
    });
  }

  if (bestByType['butterfly']) {
    const bf = bestByType['butterfly']!;
    recommendations.push({
      title: 'Choose a butterfly if you have a precise target and want extreme leverage',
      body: `Best butterfly: ${bf.label} — costs just $${bf.netDebit.toFixed(2)} ($${(bf.netDebit * 100).toFixed(0)}/contract), pays $${bf.payoffAtBase.toFixed(2)} if the stock lands exactly at the center strike at expiry (${bf.returnOnRiskBase.toFixed(1)}x return). Butterflies are the cheapest way to express a precise view — but they only pay if the stock is near the target at expiry. If it overshoots or undershoots significantly, the position is worth near zero. Best as a small allocation alongside a wider structure, or when you want to put a flag in the ground at a specific price with minimal capital.`,
    });
  }

  if (bestByType['naked_call']) {
    const nc = bestByType['naked_call']!;
    recommendations.push({
      title: 'Choose a naked call if the entire upside tail is underpriced',
      body: `Best naked call: ${nc.label} — costs $${nc.netDebit.toFixed(2)}, pays $${nc.payoffAtBase.toFixed(2)} at base and $${nc.payoffAtHigh.toFixed(2)} at high target. Edge ratio of ${nc.avgEdgeRatio.toFixed(1)}x means your thesis values this option at ${nc.avgEdgeRatio.toFixed(1)} times what the market charges. No cap on upside — if the stock overshoots your high case, you fully participate. The trade-off: highest premium cost, most vega exposure (a vol crush hurts), and all the time decay is yours to bear. Best when vol is cheap (IV/RV below 1) and you believe the market is fundamentally underpricing the move.`,
    });
  }

  // Key risks
  const keyRisks = `Key risks across all structures: (1) **Time decay** — all long options lose value daily. Your thesis needs to materialize within the DTE window or premium erodes. (2) **Vol crush** — a decline in implied volatility hurts all net-long-vega positions even if the stock moves in your direction. This is especially dangerous after earnings or catalysts that resolve uncertainty. (3) **Liquidity** — some strikes may have wide bid-ask spreads. Check the actual market before executing, especially for butterflies which require fills at three strikes. (4) **Assignment risk** (risk reversals only) — short puts can be exercised early on American-style options, though this is rare before expiry. (5) **Basis risk** — the analysis uses Black-Scholes pricing with listed IV. Actual execution prices will differ due to bid-ask spread and market impact.`;

  return { volContext, structureGuidance, recommendations, keyRisks };
}

// ===================== OUTPUT =====================

interface VolSurfacePoint {
  strike: number;
  callIv: number | null;
  putIv: number | null;
  callEdgeRatio: number | null;
  callThesisValue: number | null;
  callMarketPrice: number | null;
  callOi: number;
  putOi: number;
}

interface ExpiryInfo {
  expiry: string;
  dte: number;
  callCount: number;
  putCount: number;
}

interface VolHistoryPoint {
  date: string;
  iv30: number | null;
  rv20: number | null;
  spot: number | null;
}

interface VolRankInfo {
  ivRank: number | null;       // (current - 52wk low) / (52wk high - 52wk low)
  ivPercentile: number | null; // % of days in period that IV was below current
  iv52High: number | null;
  iv52Low: number | null;
  rv52High: number | null;
  rv52Low: number | null;
}

interface AnalysisOutput {
  context: {
    ticker: string;
    spot: number;
    iv30: number | null;
    rv20: number | null;
    ivRvRatio: number | null;
    ivRvAssessment: string;
    smileAnalysis: ReturnType<typeof analyzeSmile>;
    putSkewAnalysis: ReturnType<typeof analyzePutSkew>;
    thesisSigma: number;
    expiryCount: number;
    contractCount: number;
    dataSource: string;
  };
  thesis: {
    direction: string;
    targetBase: number;
    targetHigh: number;
    downsideFloor: number;
    horizonMonths: number;
    horizonRange: number;
  };
  expiries: ExpiryInfo[];
  volSurface: VolSurfacePoint[];
  volSurfaceExpiry: string;
  termStructure: Array<{
    strike: number;
    expiries: Array<{ expiry: string; dte: number; callIv: number | null; putIv: number | null; callPrice: number | null; putPrice: number | null }>;
  }>;
  volHistory: VolHistoryPoint[];
  volRank: VolRankInfo;
  narrative: Narrative;
  strategies: Strategy[];
}

function formatOutput(output: AnalysisOutput): void {
  // Output JSON to stdout for skill consumption
  console.log(JSON.stringify(output, null, 2));
}

// ===================== MAIN =====================

async function main() {
  const args = parseArgs();

  // Compute DTE range from horizon
  const minDte = Math.round((args.horizonMonths - args.horizonRange) * 30);
  const maxDte = Math.round((args.horizonMonths + args.horizonRange) * 30);

  console.error(`\n📊 Vol Curve Analyzer: ${args.ticker}`);
  console.error(`   Direction: ${args.direction}`);
  console.error(`   Target: $${args.targetBase} (base) / $${args.targetHigh} (high)`);
  console.error(`   Horizon: ${args.horizonMonths}mo ± ${args.horizonRange}mo (DTE ${minDte}-${maxDte})`);
  console.error(`   Downside floor: $${args.downsideFloor}`);

  // Fetch options chain — try live first, fall back to DB
  let chainData = await fetchLiveChain(args.ticker, minDte, maxDte);
  let dataSource = 'live';
  let spot: number;

  if (chainData && chainData.rows.length > 0) {
    spot = chainData.spot;
  } else {
    console.error(`[Live] No live data, falling back to DB...`);
    chainData = await fetchDbChain(args.ticker, args.snapshotDate, minDte, maxDte);
    dataSource = 'database';
    spot = chainData.spot;
  }

  // If spot is 0, try IV history then live API
  if (!spot || spot === 0) {
    spot = await fetchSpotFromIvHistory(args.ticker);
  }
  if (!spot || spot === 0) {
    const liveData = await fetchLiveSpotAndHistory(args.ticker);
    if (liveData) spot = liveData.spot;
  }

  if (!spot || spot === 0) {
    console.error(`❌ Could not determine spot price for ${args.ticker}`);
    await closeDb();
    process.exit(1);
  }

  if (chainData.rows.length === 0) {
    console.error(`❌ No options chain data available for ${args.ticker} in DTE range ${minDte}-${maxDte}`);
    console.error(`   Try a shorter horizon or check that Massive API key is valid`);
    await closeDb();
    process.exit(1);
  }

  // Update spot on all rows if they don't have it
  for (const row of chainData.rows) {
    if (!row.spot || row.spot === 0) row.spot = spot;
  }

  console.error(`   Spot: $${spot.toFixed(2)}`);

  // Fetch IV/RV context — try DB, then derive from chain
  let iv30 = await fetchIv30(args.ticker);
  if (!iv30) {
    iv30 = computeIv30FromChain(chainData.rows, spot);
    if (iv30) console.error(`   IV30 derived from options chain: ${(iv30 * 100).toFixed(1)}%`);
  }
  const rv20 = await computeRealizedVol(args.ticker);
  const ivRvRatio = iv30 && rv20 ? iv30 / rv20 : null;

  let ivRvAssessment: string;
  if (!ivRvRatio) {
    ivRvAssessment = 'IV/RV ratio unavailable — insufficient history to assess vol cheapness';
  } else if (ivRvRatio < 0.85) {
    ivRvAssessment = `Vol is ${((1 - ivRvRatio) * 100).toFixed(0)}% below realized — options are cheap. Favor naked calls over spreads.`;
  } else if (ivRvRatio < 1.0) {
    ivRvAssessment = `Vol roughly at realized — options fairly priced. Spreads and naked calls both viable.`;
  } else if (ivRvRatio < 1.2) {
    ivRvAssessment = `Vol is ${((ivRvRatio - 1) * 100).toFixed(0)}% above realized — moderately expensive. Favor structures that sell vol (spreads, risk reversals).`;
  } else {
    ivRvAssessment = `Vol is ${((ivRvRatio - 1) * 100).toFixed(0)}% above realized — expensive. Strongly favor call spreads and risk reversals to sell back expensive vol.`;
  }

  // Fetch vol history for IV vs HV chart
  const volHistory = await fetchVolHistory(args.ticker);
  const volRank = computeVolRank(volHistory, iv30, rv20);

  if (volRank.ivRank !== null) {
    console.error(`   IV Rank: ${(volRank.ivRank * 100).toFixed(0)}th percentile (range ${((volRank.iv52Low || 0) * 100).toFixed(0)}%-${((volRank.iv52High || 0) * 100).toFixed(0)}%)`);
  }

  // Thesis parameters
  const thesisSigma = Math.log(args.targetHigh / args.targetBase);
  console.error(`   Thesis σ: ${(thesisSigma * 100).toFixed(1)}% (log spread between base and high case)`);

  // Group by expiry and analyze
  const expiryGroups = groupByExpiry(chainData.rows);
  console.error(`\n📈 Analyzing ${expiryGroups.length} expiries...`);

  // Vol surface analysis (use the expiry closest to the horizon midpoint)
  const midDte = args.horizonMonths * 30;
  const targetGroup = expiryGroups.reduce((best, g) =>
    Math.abs(g.dte - midDte) < Math.abs(best.dte - midDte) ? g : best
  );

  const smileAnalysis = analyzeSmile(targetGroup.calls.map(c => ({ strike: c.strike, iv: c.iv, spot })));
  const putSkewAnalysis = analyzePutSkew(targetGroup.puts.map(p => ({ strike: p.strike, iv: p.iv, spot })));

  // Build vol surface data for charts (using target expiry group)
  const T_target = targetGroup.dte / 365;
  const callEdgesForChart = computeEdgeRatios(
    targetGroup.calls, spot, T_target, args.riskFreeRate, args.targetBase, thesisSigma, 'call'
  );
  const callEdgeMap = new Map(callEdgesForChart.map(c => [c.strike, c]));
  const putMap = new Map(targetGroup.puts.map(p => [p.strike, p]));

  const allStrikes = new Set([
    ...targetGroup.calls.map(c => c.strike),
    ...targetGroup.puts.map(p => p.strike),
  ]);
  const volSurface: VolSurfacePoint[] = Array.from(allStrikes)
    .sort((a, b) => a - b)
    .map(strike => {
      const call = targetGroup.calls.find(c => c.strike === strike);
      const put = putMap.get(strike);
      const callEdge = callEdgeMap.get(strike);
      return {
        strike,
        callIv: call ? call.iv : null,
        putIv: put ? put.iv : null,
        callEdgeRatio: callEdge ? callEdge.edgeRatio : null,
        callThesisValue: callEdge ? callEdge.thesisValue : null,
        callMarketPrice: callEdge ? callEdge.marketPrice : null,
        callOi: call ? call.openInterest : 0,
        putOi: put ? put.openInterest : 0,
      };
    });

  // Build term structure: IV at key strikes across ALL expiries
  const termStructure: Array<{
    strike: number;
    expiries: Array<{ expiry: string; dte: number; callIv: number | null; putIv: number | null; callPrice: number | null; putPrice: number | null }>;
  }> = [];

  // Pick representative strikes (every $5 or $10 depending on price level)
  const strikeStep = spot > 100 ? 10 : spot > 50 ? 5 : spot > 20 ? 2 : 1;
  const tsMinStrike = Math.floor((spot * 0.6) / strikeStep) * strikeStep;
  const tsMaxStrike = Math.ceil((args.targetHigh * 1.2) / strikeStep) * strikeStep;

  for (let strike = tsMinStrike; strike <= tsMaxStrike; strike += strikeStep) {
    const expiryData = expiryGroups.map(g => {
      const call = g.calls.find(c => c.strike === strike);
      const put = g.puts.find(p => p.strike === strike);
      const T_g = g.dte / 365;
      return {
        expiry: g.expiry,
        dte: g.dte,
        callIv: call ? call.iv : null,
        putIv: put ? put.iv : null,
        callPrice: call ? bsCallPrice(spot, strike, T_g, args.riskFreeRate, call.iv) : null,
        putPrice: put ? bsPutPrice(spot, strike, T_g, args.riskFreeRate, put.iv) : null,
      };
    });
    termStructure.push({ strike, expiries: expiryData });
  }

  const expiryInfos: ExpiryInfo[] = expiryGroups.map(g => ({
    expiry: g.expiry,
    dte: g.dte,
    callCount: g.calls.length,
    putCount: g.puts.length,
  }));

  // Generate and rank strategies
  const allStrategies: Strategy[] = [];
  for (const group of expiryGroups) {
    const strats = generateStrategies(group, spot, args, thesisSigma);
    allStrategies.push(...strats);
  }

  console.error(`   Generated ${allStrategies.length} candidate structures`);

  const ranked = rankStrategies(allStrategies);
  console.error(`   ${ranked.length} viable strategies after filtering\n`);

  // Ensure top strategies include best of each type for comparison
  const topN = 15;
  const selectedStrategies: Strategy[] = [];
  const typeQuota: Record<string, number> = { naked_call: 2, call_spread: 3, risk_reversal: 8, butterfly: 2 };
  const typeCounts: Record<string, number> = { naked_call: 0, call_spread: 0, risk_reversal: 0, butterfly: 0 };

  // First pass: fill from ranked list
  for (const s of ranked) {
    if (selectedStrategies.length >= topN) break;
    if (typeCounts[s.type]! < typeQuota[s.type]!) {
      selectedStrategies.push(s);
      typeCounts[s.type]!++;
    }
  }

  // Second pass: if any type has 0 entries, add the best of that type
  for (const type of ['naked_call', 'call_spread', 'risk_reversal', 'butterfly'] as const) {
    if (typeCounts[type] === 0) {
      const best = ranked.find(s => s.type === type);
      if (best) selectedStrategies.push(best);
    }
  }

  // Re-rank
  selectedStrategies.sort((a, b) => a.rank - b.rank);

  // Generate narrative
  const narrative = generateNarrative(selectedStrategies, {
    spot, iv30: iv30 ?? null, rv20: rv20 ?? null, ivRvRatio: ivRvRatio ?? null,
    ivRvAssessment, smileAnalysis, putSkewAnalysis, thesisSigma
  }, {
    targetBase: args.targetBase, targetHigh: args.targetHigh,
    downsideFloor: args.downsideFloor, direction: args.direction
  }, volRank);

  // Build output
  const output: AnalysisOutput = {
    context: {
      ticker: args.ticker,
      spot,
      iv30,
      rv20,
      ivRvRatio,
      ivRvAssessment,
      smileAnalysis,
      putSkewAnalysis,
      thesisSigma,
      expiryCount: expiryGroups.length,
      contractCount: chainData.rows.length,
      dataSource,
    },
    thesis: {
      direction: args.direction,
      targetBase: args.targetBase,
      targetHigh: args.targetHigh,
      downsideFloor: args.downsideFloor,
      horizonMonths: args.horizonMonths,
      horizonRange: args.horizonRange,
    },
    expiries: expiryInfos,
    volSurface,
    volSurfaceExpiry: targetGroup.expiry,
    termStructure,
    volHistory,
    volRank,
    narrative,
    strategies: selectedStrategies,
  };

  formatOutput(output);

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Fatal error:', err);
  await closeDb();
  process.exit(1);
});
