/**
 * IBKR IV Data Service
 * 
 * High-level service for fetching IV and spot data
 * Compatible with existing ingestion system
 */

import { getConidsBatch } from './contracts';
import { getSnapshot, extractSpot, extractIv30 } from './marketdata';
import type { IvSnapshot } from './types';
import type { RawIvSnapshot } from '@/lib/ingestion/underlyingsIvHistory';

/**
 * Fetch IV snapshot for a single ticker
 * Returns data compatible with existing ingestion system
 */
export async function fetchIvSnapshot(
  ticker: string,
  date?: string
): Promise<RawIvSnapshot | null> {
  try {
    // Get conid for ticker
    const conids = await getConidsBatch([ticker]);
    const conid = conids.get(ticker.toUpperCase());

    if (!conid) {
      console.warn(`Contract not found for ${ticker}`);
      return null;
    }

    // Fetch market data snapshot
    const snapshots = await getSnapshot([conid]);
    if (snapshots.length === 0) {
      console.warn(`No market data for ${ticker}`);
      return null;
    }

    const snapshot = snapshots[0]!;
    const spot = extractSpot(snapshot);
    const iv30 = extractIv30(snapshot);

    // If both are null, return null
    if (spot === null && iv30 === null) {
      return null;
    }

    const targetDate = date || new Date().toISOString().split('T')[0]!;

    return {
      date: targetDate,
      ticker: ticker.toUpperCase(),
      spot: spot ? Math.round(spot * 100) / 100 : null, // Round to 2 decimals
      iv30: iv30 || null,
      source: 'ibkr',
    };
  } catch (error) {
    console.error(`Error fetching IV snapshot for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch IV snapshots for multiple tickers
 * Returns array compatible with existing ingestion system
 * 
 * @param tickers - Array of tickers to fetch
 * @param date - Optional date (defaults to today)
 * @param conidMap - Optional map of ticker -> conid (for faster lookup, avoids API search)
 */
export async function fetchIvSnapshots(
  tickers: string[],
  date?: string,
  conidMap?: Map<string, number>
): Promise<RawIvSnapshot[]> {
  const uniqueTickers = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const results: RawIvSnapshot[] = [];

  // Get conids - use provided map if available, otherwise search
  const conids = new Map<string, number>();
  
  if (conidMap) {
    // Use provided CONIDs
    for (const ticker of uniqueTickers) {
      const conid = conidMap.get(ticker);
      if (conid) {
        conids.set(ticker, conid);
      }
    }
  }

  // For tickers without CONID, search for them
  const tickersToSearch = uniqueTickers.filter(t => !conids.has(t));
  if (tickersToSearch.length > 0) {
    const searchedConids = await getConidsBatch(tickersToSearch);
    for (const [ticker, conid] of searchedConids.entries()) {
      conids.set(ticker, conid);
    }
  }

  if (conids.size === 0) {
    console.warn('No contracts found for any ticker');
    return [];
  }

  // Fetch market data for all contracts at once (batch)
  const conidArray = Array.from(conids.values());
  const snapshots = await getSnapshot(conidArray);

  // Create a map of conid -> ticker for lookup
  const conidToTicker = new Map<number, string>();
  for (const [ticker, conid] of conids.entries()) {
    conidToTicker.set(conid, ticker);
  }

  // Process results
  const targetDate = date || new Date().toISOString().split('T')[0]!;

  for (const snapshot of snapshots) {
    const ticker = conidToTicker.get(snapshot.conid);
    if (!ticker) {
      continue; // Skip if we can't map back to ticker
    }

    const spot = extractSpot(snapshot);
    const iv30 = extractIv30(snapshot);

    // Only include if we have at least spot or IV30
    if (spot !== null || iv30 !== null) {
      results.push({
        date: targetDate,
        ticker,
        spot: spot ? Math.round(spot * 100) / 100 : null,
        iv30: iv30 || null,
        source: 'ibkr',
      });
    }
  }

  return results;
}

