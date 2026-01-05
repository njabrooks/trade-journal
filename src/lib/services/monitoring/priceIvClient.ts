/**
 * Price/IV monitoring client
 * Reuses existing IBKR + Massive.com infrastructure
 * Queries underlyings_iv_history table for historical data
 */

import { db } from '@/db';
import { underlyingsIvHistory, underlyings } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import type { DataSourceResult } from './types';

export interface PriceIvQueryParams {
  ticker: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  metrics: ('spot' | 'iv30' | 'iv_rank' | 'iv_percentile')[];
}

export interface PriceIvResult {
  ticker: string;
  date: string;
  spot?: number;
  spotChange?: number;
  spotChangePercent?: number;
  iv30?: number;
  iv30Change?: number;
  ivRank?: number;
  ivPercentile?: number;
}

/**
 * Query price and IV data from underlyings_iv_history
 */
export async function queryPriceIv(params: PriceIvQueryParams): Promise<DataSourceResult[]> {
  const { ticker, startDate, endDate, metrics } = params;

  try {
    // Get underlying ID
    const [underlying] = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker.toUpperCase()))
      .limit(1);

    if (!underlying) {
      throw new Error(`Ticker ${ticker} not found`);
    }

    // Query IV history
    const history = await db
      .select()
      .from(underlyingsIvHistory)
      .where(
        and(
          eq(underlyingsIvHistory.underlyingId, underlying.id),
          gte(underlyingsIvHistory.asOfDate, startDate),
          lte(underlyingsIvHistory.asOfDate, endDate)
        )
      )
      .orderBy(desc(underlyingsIvHistory.asOfDate));

    if (history.length === 0) {
      return [];
    }

    // Calculate changes and format results
    const results: DataSourceResult[] = [];

    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const previous = history[i + 1]; // Older data (desc order)

      const result: PriceIvResult = {
        ticker: ticker.toUpperCase(),
        date: current.asOfDate,
      };

      // Spot price
      if (metrics.includes('spot') && current.spot !== null) {
        result.spot = parseFloat(current.spot);
        if (previous && previous.spot !== null) {
          const prevSpot = parseFloat(previous.spot);
          result.spotChange = result.spot - prevSpot;
          result.spotChangePercent = (result.spotChange / prevSpot) * 100;
        }
      }

      // IV30 (convert from decimal to percentage: 0.77 -> 77)
      if (metrics.includes('iv30') && current.iv30 !== null) {
        result.iv30 = parseFloat(current.iv30) * 100;
        if (previous && previous.iv30 !== null) {
          const prevIv30 = parseFloat(previous.iv30) * 100;
          result.iv30Change = result.iv30 - prevIv30;
        }
      }

      // IV Rank - not in schema, skip this
      // if (metrics.includes('iv_rank') && current.ivRank !== null) {
      //   result.ivRank = parseFloat(current.ivRank);
      // }

      // IV Percentile - not in schema, skip this
      // if (metrics.includes('iv_percentile') && current.ivPercentile !== null) {
      //   result.ivPercentile = parseFloat(current.ivPercentile);
      // }

      // Create result entry
      const snippetParts: string[] = [];

      if (result.spot !== undefined) {
        const changeText =
          result.spotChange !== undefined
            ? ` (${result.spotChange > 0 ? '+' : ''}${result.spotChange.toFixed(2)}, ${
                result.spotChangePercent !== undefined
                  ? `${result.spotChangePercent > 0 ? '+' : ''}${result.spotChangePercent.toFixed(
                      2
                    )}%`
                  : ''
              })`
            : '';
        snippetParts.push(`Spot: $${result.spot.toFixed(2)}${changeText}`);
      }

      if (result.iv30 !== undefined) {
        const changeText =
          result.iv30Change !== undefined
            ? ` (${result.iv30Change > 0 ? '+' : ''}${result.iv30Change.toFixed(1)}%)`
            : '';
        snippetParts.push(`IV30: ${result.iv30.toFixed(1)}%${changeText}`);
      }

      if (result.ivRank !== undefined) {
        snippetParts.push(`IV Rank: ${result.ivRank.toFixed(0)}%`);
      }

      if (result.ivPercentile !== undefined) {
        snippetParts.push(`IV %ile: ${result.ivPercentile.toFixed(0)}%`);
      }

      results.push({
        title: `${ticker.toUpperCase()}: ${snippetParts[0] || 'Data point'}`,
        date: result.date,
        source: 'Price/IV Data',
        snippet: snippetParts.join(', '),
        link: `https://finance.yahoo.com/quote/${ticker.toUpperCase()}`,
        rawData: result,
      });
    }

    return results;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Price/IV query failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Check if we have recent data for a ticker
 */
export async function hasRecentPriceData(
  ticker: string,
  daysBack: number = 7
): Promise<boolean> {
  try {
    const [underlying] = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker.toUpperCase()))
      .limit(1);

    if (!underlying) return false;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const [recent] = await db
      .select()
      .from(underlyingsIvHistory)
      .where(
        and(
          eq(underlyingsIvHistory.underlyingId, underlying.id),
          gte(underlyingsIvHistory.asOfDate, cutoffDateStr)
        )
      )
      .limit(1);

    return !!recent;
  } catch {
    return false;
  }
}

/**
 * Get list of monitored tickers (those with recent data)
 */
export async function getMonitoredTickers(): Promise<string[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Last 30 days
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const tickers = await db
      .selectDistinct({ ticker: underlyings.ticker })
      .from(underlyings)
      .innerJoin(
        underlyingsIvHistory,
        eq(underlyings.id, underlyingsIvHistory.underlyingId)
      )
      .where(gte(underlyingsIvHistory.asOfDate, cutoffDateStr));

    return tickers.map((t) => t.ticker);
  } catch {
    return [];
  }
}
