/**
 * IV Rank and IV Percentile Calculations
 * 
 * Uses historical options chain snapshots to calculate:
 * - IV Rank: (Current IV - Min IV) / (Max IV - Min IV) * 100
 * - IV Percentile: % of days where IV was lower than current IV
 * 
 * Typically calculated over 52 weeks (1 year) of historical data
 */

import { db } from '@/db';
import { optionsChainSnapshots } from '@/db/schema';
import { eq, and, gte, lte, isNotNull, sql, desc } from 'drizzle-orm';
import { toNumber } from '@/lib/utils';

export interface IvMetricsResult {
  currentIv: number | null;
  ivRank: number | null; // 0-100
  ivPercentile: number | null; // 0-100
  minIv: number | null;
  maxIv: number | null;
  avgIv: number | null;
  periodDays: number;
  sampleSize: number;
}

/**
 * Calculate IV Rank and IV Percentile for a ticker on a specific date
 * 
 * @param ticker - Underlying ticker symbol
 * @param snapshotDate - Date to calculate metrics for (YYYY-MM-DD)
 * @param lookbackDays - Number of days to look back (default: 365 for 1 year)
 * @param dteRange - DTE range to filter options (default: 20-40 days for ~30 DTE)
 * @param strikeRange - Strike range as percentage from spot (default: 0.95-1.05 for ATM ±5%)
 */
export async function calculateIvMetrics(
  ticker: string,
  snapshotDate: string,
  options?: {
    lookbackDays?: number;
    dteRange?: { min: number; max: number };
    strikeRange?: { min: number; max: number }; // As percentage (0.95 = 95% of spot)
  }
): Promise<IvMetricsResult> {
  const lookbackDays = options?.lookbackDays ?? 365;
  const dteRange = options?.dteRange ?? { min: 20, max: 40 };
  const strikeRange = options?.strikeRange ?? { min: 0.95, max: 1.05 };

  // Calculate date range
  const endDate = new Date(snapshotDate + 'T00:00:00Z');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - lookbackDays);
  const startDateStr = startDate.toISOString().split('T')[0]!;

  // Get current IV (from snapshot date)
  const currentSnapshot = await db
    .select({
      underlyingSpot: optionsChainSnapshots.underlyingSpot,
      impliedVolatility: optionsChainSnapshots.impliedVolatility,
      strike: optionsChainSnapshots.strike,
      dte: optionsChainSnapshots.dte,
    })
    .from(optionsChainSnapshots)
    .where(
      and(
        eq(optionsChainSnapshots.ticker, ticker.toUpperCase()),
        eq(optionsChainSnapshots.snapshotDate, snapshotDate),
        isNotNull(optionsChainSnapshots.impliedVolatility),
        isNotNull(optionsChainSnapshots.underlyingSpot),
        gte(optionsChainSnapshots.dte, dteRange.min),
        lte(optionsChainSnapshots.dte, dteRange.max)
      )
    )
    .orderBy(desc(optionsChainSnapshots.snapshotDate))
    .limit(100); // Get multiple options to find ATM

  if (currentSnapshot.length === 0) {
    return {
      currentIv: null,
      ivRank: null,
      ivPercentile: null,
      minIv: null,
      maxIv: null,
      avgIv: null,
      periodDays: lookbackDays,
      sampleSize: 0,
    };
  }

  // Find ATM option (closest to spot)
  const currentSpot = toNumber(currentSnapshot[0].underlyingSpot);
  if (!currentSpot) {
    return {
      currentIv: null,
      ivRank: null,
      ivPercentile: null,
      minIv: null,
      maxIv: null,
      avgIv: null,
      periodDays: lookbackDays,
      sampleSize: 0,
    };
  }

  // Filter for ATM options (within strike range)
  const atmOptions = currentSnapshot.filter((opt) => {
    const strike = toNumber(opt.strike);
    if (!strike) return false;
    const strikePct = strike / currentSpot;
    return strikePct >= strikeRange.min && strikePct <= strikeRange.max;
  });

  // Use first ATM option's IV, or average if multiple
  const currentIvValues = atmOptions
    .map((opt) => toNumber(opt.impliedVolatility))
    .filter((iv): iv is number => iv !== null && iv > 0);

  if (currentIvValues.length === 0) {
    return {
      currentIv: null,
      ivRank: null,
      ivPercentile: null,
      minIv: null,
      maxIv: null,
      avgIv: null,
      periodDays: lookbackDays,
      sampleSize: 0,
    };
  }

  const currentIv = currentIvValues.reduce((sum, iv) => sum + iv, 0) / currentIvValues.length;

  // Get historical IV data for the same DTE and strike range
  const historicalData = await db
    .select({
      impliedVolatility: optionsChainSnapshots.impliedVolatility,
      underlyingSpot: optionsChainSnapshots.underlyingSpot,
      strike: optionsChainSnapshots.strike,
      snapshotDate: optionsChainSnapshots.snapshotDate,
    })
    .from(optionsChainSnapshots)
    .where(
      and(
        eq(optionsChainSnapshots.ticker, ticker.toUpperCase()),
        gte(optionsChainSnapshots.snapshotDate, startDateStr),
        lte(optionsChainSnapshots.snapshotDate, snapshotDate),
        isNotNull(optionsChainSnapshots.impliedVolatility),
        isNotNull(optionsChainSnapshots.underlyingSpot),
        gte(optionsChainSnapshots.dte, dteRange.min),
        lte(optionsChainSnapshots.dte, dteRange.max)
      )
    );

  // Filter for ATM options in historical data
  const historicalIvValues: number[] = [];
  const uniqueDates = new Set<string>();

  for (const record of historicalData) {
    const spot = toNumber(record.underlyingSpot);
    const strike = toNumber(record.strike);
    const iv = toNumber(record.impliedVolatility);

    if (!spot || !strike || !iv || iv <= 0) continue;

    const strikePct = strike / spot;
    if (strikePct >= strikeRange.min && strikePct <= strikeRange.max) {
      historicalIvValues.push(iv);
      uniqueDates.add(record.snapshotDate);
    }
  }

  if (historicalIvValues.length === 0) {
    return {
      currentIv,
      ivRank: null,
      ivPercentile: null,
      minIv: null,
      maxIv: null,
      avgIv: null,
      periodDays: lookbackDays,
      sampleSize: 0,
    };
  }

  // Calculate metrics
  const minIv = Math.min(...historicalIvValues);
  const maxIv = Math.max(...historicalIvValues);
  const avgIv = historicalIvValues.reduce((sum, iv) => sum + iv, 0) / historicalIvValues.length;

  // IV Rank = (Current IV - Min IV) / (Max IV - Min IV) * 100
  const ivRank =
    maxIv > minIv ? ((currentIv - minIv) / (maxIv - minIv)) * 100 : null;

  // IV Percentile = % of days where IV was lower than current IV
  const lowerCount = historicalIvValues.filter((iv) => iv < currentIv).length;
  const ivPercentile = (lowerCount / historicalIvValues.length) * 100;

  return {
    currentIv,
    ivRank: ivRank !== null ? Math.max(0, Math.min(100, ivRank)) : null, // Clamp to 0-100
    ivPercentile: Math.max(0, Math.min(100, ivPercentile)), // Clamp to 0-100
    minIv,
    maxIv,
    avgIv,
    periodDays: lookbackDays,
    sampleSize: uniqueDates.size,
  };
}

/**
 * Get IV metrics for multiple tickers
 */
export async function calculateIvMetricsForTickers(
  tickers: string[],
  snapshotDate: string,
  options?: Parameters<typeof calculateIvMetrics>[2]
): Promise<Map<string, IvMetricsResult>> {
  const results = new Map<string, IvMetricsResult>();

  for (const ticker of tickers) {
    const metrics = await calculateIvMetrics(ticker, snapshotDate, options);
    results.set(ticker.toUpperCase(), metrics);
  }

  return results;
}

