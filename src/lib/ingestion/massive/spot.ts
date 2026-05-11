/**
 * Spot price helpers.
 *
 * Primary source: Yahoo Finance (free, EOD available ~20:30 UTC after US close).
 * Fallback: Massive Daily Grouped Summary (paid tier).
 */

import { fetchYahooFinanceSpot } from '../underlyingsIvHistory';
import { buildMassiveUrl, fetchMassive } from './client';
import type { MassiveDailyGroupedResponse } from './client';

/**
 * Fetch EOD close prices for a list of tickers from Yahoo Finance.
 * Returns a Map keyed by UPPERCASE ticker. Missing tickers are omitted silently.
 */
export async function getSpotPricesFromYahooFinance(
  date: string,
  tickers: string[]
): Promise<Map<string, number>> {
  const spotMap = new Map<string, number>();
  console.log(`[Yahoo Finance] Fetching spot for ${tickers.length} tickers...`);
  for (const ticker of tickers) {
    try {
      const spot = await fetchYahooFinanceSpot(ticker, date);
      if (spot !== null && spot > 0) {
        spotMap.set(ticker.toUpperCase(), spot);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.warn(
        `[Yahoo Finance] ${ticker} failed:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  console.log(`[Yahoo Finance] Retrieved ${spotMap.size}/${tickers.length} spot prices`);
  return spotMap;
}

/**
 * Fetch EOD close prices via the Massive Daily Grouped endpoint.
 * One call returns all US stocks for the date; we filter to the requested tickers.
 * Useful as a backfill fallback when Yahoo is unavailable.
 */
export async function getSpotPricesFromDailySummary(
  date: string,
  tickers: string[]
): Promise<Map<string, number>> {
  const spotMap = new Map<string, number>();
  const url = buildMassiveUrl(`/v2/aggs/grouped/locale/us/market/stocks/${date}`);
  const data = await fetchMassive<MassiveDailyGroupedResponse>(url);

  if (data.status !== 'OK' || !Array.isArray(data.results)) {
    console.log(
      `[Daily Summary] Unexpected response: status=${data.status} count=${data.resultsCount ?? 'n/a'}`
    );
    return spotMap;
  }

  const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
  for (const row of data.results) {
    const ticker = row.T?.toUpperCase();
    if (ticker && tickerSet.has(ticker) && typeof row.c === 'number' && row.c > 0) {
      spotMap.set(ticker, row.c);
    }
  }
  console.log(
    `[Daily Summary] Matched ${spotMap.size}/${tickers.length} tickers from ${
      data.resultsCount ?? data.results.length
    } total stocks`
  );
  return spotMap;
}
