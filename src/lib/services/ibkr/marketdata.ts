/**
 * IBKR Market Data Service
 * 
 * Handles fetching market data snapshots and historical data
 */

import { get } from './client';
import { MARKET_DATA_FIELDS } from './types';
import type {
  MarketDataSnapshotResponse,
  HistoricalDataResponse,
  MarketDataSnapshot,
} from './types';

/**
 * Get market data snapshot for one or more contracts
 * 
 * @param conids Contract IDs (conids)
 * @param fields Field IDs to request (default: last, bid, ask, IV30)
 * @returns Array of market data snapshots
 */
export async function getSnapshot(
  conids: number[],
  fields: string[] = [MARKET_DATA_FIELDS.LAST, MARKET_DATA_FIELDS.BID, MARKET_DATA_FIELDS.ASK, MARKET_DATA_FIELDS.IV30]
): Promise<MarketDataSnapshot[]> {
  if (conids.length === 0) {
    return [];
  }

  // IBKR API supports up to 100 conids per request
  const MAX_CONIDS = 100;
  const results: MarketDataSnapshot[] = [];

  // Process in batches
  for (let i = 0; i < conids.length; i += MAX_CONIDS) {
    const batch = conids.slice(i, i + MAX_CONIDS);
    const conidsParam = batch.join(',');
    const fieldsParam = fields.join(',');

    try {
      const response = await get<MarketDataSnapshotResponse>(
        `/v1/api/iserver/marketdata/snapshot?conids=${conidsParam}&fields=${fieldsParam}`
      );

      if (Array.isArray(response)) {
        results.push(...response);
      }
    } catch (error) {
      console.error(`Error fetching snapshot for batch:`, error);
      // Continue with other batches
    }
  }

  return results;
}

/**
 * Get historical data for a contract
 * 
 * @param conid Contract ID
 * @param period Time period (e.g., '1d', '1w', '1m', '1y')
 * @param bar Bar size (e.g., '1d', '1h', '5m')
 * @returns Historical data response
 */
export async function getHistorical(
  conid: number,
  period: string = '1w',
  bar: string = '1d'
): Promise<HistoricalDataResponse> {
  return get<HistoricalDataResponse>(
    `/v1/api/iserver/marketdata/history?conid=${conid}&period=${period}&bar=${bar}`
  );
}

/**
 * Extract spot price from market data snapshot
 * Uses field 31 (Last Price)
 */
export function extractSpot(snapshot: MarketDataSnapshot): number | null {
  const lastPrice = snapshot[MARKET_DATA_FIELDS.LAST];
  if (!lastPrice) {
    return null;
  }

  const price = parseFloat(String(lastPrice));
  return isNaN(price) || price <= 0 ? null : price;
}

/**
 * Extract IV30 from market data snapshot
 * Uses field 7283 (Option Implied Vol % - 30-day forward)
 * Converts percentage string (e.g., "47.700%") to decimal (0.477)
 */
export function extractIv30(snapshot: MarketDataSnapshot): number | null {
  const ivString = snapshot[MARKET_DATA_FIELDS.IV30];
  if (!ivString) {
    return null;
  }

  // Remove % sign and parse
  const ivPercent = parseFloat(String(ivString).replace('%', ''));
  if (isNaN(ivPercent) || ivPercent <= 0) {
    return null;
  }

  // Convert percentage to decimal (47.7% -> 0.477)
  return ivPercent / 100;
}

/**
 * Extract bid/ask from market data snapshot
 */
export function extractBidAsk(snapshot: MarketDataSnapshot): {
  bid: number | null;
  ask: number | null;
} {
  const bidStr = snapshot[MARKET_DATA_FIELDS.BID];
  const askStr = snapshot[MARKET_DATA_FIELDS.ASK];

  const bid = bidStr ? parseFloat(String(bidStr)) : null;
  const ask = askStr ? parseFloat(String(askStr)) : null;

  return {
    bid: bid && !isNaN(bid) && bid > 0 ? bid : null,
    ask: ask && !isNaN(ask) && ask > 0 ? ask : null,
  };
}

