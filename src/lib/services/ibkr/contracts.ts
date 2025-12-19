/**
 * IBKR Contract Search & Mapping
 * 
 * Handles finding contract IDs (conids) for tickers
 */

import { get } from './client';
import { IbkrContractNotFoundError } from './errors';
import type { ContractSearchResponse, ContractSearchResult } from './types';

/**
 * Search for a contract by symbol
 * Returns the first matching stock contract (STK secType)
 */
export async function searchContract(
  symbol: string,
  secType: 'STK' | 'OPT' = 'STK'
): Promise<ContractSearchResult | null> {
  const ticker = symbol.trim().toUpperCase();
  
  try {
    const results = await get<ContractSearchResponse>(
      `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(ticker)}&sectype=${secType}`
    );

    if (!results || results.length === 0) {
      return null;
    }

    // For stocks, find the primary listing (usually ARCA, NASDAQ, NYSE)
    if (secType === 'STK') {
      // Prefer contracts with "ARCA", "NASDAQ", "NYSE" in description
      // or the first result that has STK in sections
      const stockResults = results.filter((r) => {
        // Check if it has a STK section
        return r.sections?.some((s) => s.secType === 'STK');
      });

      if (stockResults.length > 0) {
        // Prefer ARCA, NASDAQ, NYSE exchanges
        const preferred = stockResults.find(
          (r) =>
            r.description?.includes('ARCA') ||
            r.description?.includes('NASDAQ') ||
            r.description?.includes('NYSE')
        );
        return preferred || stockResults[0]!;
      }

      // Fallback to first result
      return results[0]!;
    }

    // For options, return first result
    return results[0]!;
  } catch (error) {
    console.error(`Error searching contract for ${ticker}:`, error);
    return null;
  }
}

/**
 * Get contract ID (conid) for a ticker
 * Throws IbkrContractNotFoundError if not found
 */
export async function getConid(ticker: string): Promise<number> {
  const contract = await searchContract(ticker, 'STK');
  
  if (!contract) {
    throw new IbkrContractNotFoundError(ticker);
  }

  const conid = parseInt(contract.conid, 10);
  if (isNaN(conid)) {
    throw new IbkrContractNotFoundError(ticker);
  }

  return conid;
}

/**
 * Get contract ID with caching (in-memory for now)
 * Future: Could cache in database table
 */
const conidCache = new Map<string, { conid: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getConidCached(ticker: string): Promise<number> {
  const cacheKey = ticker.toUpperCase();
  const cached = conidCache.get(cacheKey);

  // Check if cache is still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.conid;
  }

  // Fetch and cache
  const conid = await getConid(ticker);
  conidCache.set(cacheKey, { conid, timestamp: Date.now() });
  
  return conid;
}

/**
 * Batch get conids for multiple tickers
 * Returns a map of ticker -> conid
 */
export async function getConidsBatch(
  tickers: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const uniqueTickers = [...new Set(tickers.map((t) => t.toUpperCase()))];

  for (const ticker of uniqueTickers) {
    try {
      const conid = await getConidCached(ticker);
      result.set(ticker, conid);
    } catch (error) {
      if (error instanceof IbkrContractNotFoundError) {
        console.warn(`Contract not found for ${ticker}`);
      } else {
        console.error(`Error getting conid for ${ticker}:`, error);
      }
      // Continue with other tickers
    }
  }

  return result;
}

