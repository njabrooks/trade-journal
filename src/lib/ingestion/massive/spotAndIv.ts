/**
 * Massive.com API integration for spot prices and IV30
 * 
 * Uses Massive.com API to fetch:
 * - Spot prices (daily OHLC data)
 * - IV30 (if available on current tier)
 * 
 * Note: IV30 may require paid tier. Check Massive.com pricing for availability.
 */

import { db } from '@/db';
import { underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { upsertIvSnapshots } from '../underlyingsIvHistory';

// Massive API client - you'll need to install @massive-com/api or use fetch directly
// For now, this is a placeholder showing the structure

interface MassiveApiConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Get spot price for a ticker on a specific date from Massive
 * Uses get_daily_open_close_agg endpoint
 */
async function getSpotFromMassive(
  ticker: string,
  date: string,
  config: MassiveApiConfig
): Promise<number | null> {
  try {
    // Format: YYYY-MM-DD
    const url = `${config.baseUrl || 'https://api.massive.com/v2'}/aggs/ticker/${ticker}/range/1/day/${date}/${date}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Massive API key invalid or expired');
      }
      if (response.status === 403) {
        throw new Error('Massive API access denied - check your tier/permissions');
      }
      throw new Error(`Massive API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Parse response - structure depends on Massive API format
    // Typically: { results: [{ c: close, o: open, h: high, l: low, ... }] }
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      // Use close price as spot
      return result.c ? parseFloat(result.c) : null;
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to get spot price for ${ticker} from Massive:`, error);
    return null;
  }
}

/**
 * Get IV30 for a ticker on a specific date from Massive
 * Note: This may require a paid tier or may not be available
 * Alternative: Calculate from options chain if available
 */
async function getIv30FromMassive(
  ticker: string,
  date: string,
  config: MassiveApiConfig
): Promise<number | null> {
  try {
    // Check Massive API docs for IV30 endpoint
    // It might be in options data or a separate endpoint
    // For now, return null - will need to check Massive docs
    
    // Potential endpoints to check:
    // - Options chain data (might have IV per strike)
    // - Specific IV30 endpoint (if available)
    // - Calculate from ATM options
    
    console.log(`[Massive] IV30 endpoint not yet implemented for ${ticker}`);
    return null;
  } catch (error) {
    console.error(`Failed to get IV30 for ${ticker} from Massive:`, error);
    return null;
  }
}

/**
 * Ingest spot prices and IV30 for all active underlyings from Massive
 */
export async function ingestUnderlyingsFromMassive(
  date?: string,
  tickers?: string[]
): Promise<{
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ ticker: string; error: string }>;
}> {
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) {
    throw new Error('MASSIVE_API_KEY environment variable not set');
  }

  const targetDate = date || new Date().toISOString().split('T')[0]!; // Today in YYYY-MM-DD
  
  console.log(`[Massive] Starting ingestion for date: ${targetDate}`);

  // Get tickers to process
  let tickersToProcess: string[];
  
  if (tickers && tickers.length > 0) {
    tickersToProcess = tickers.map(t => t.trim().toUpperCase());
  } else {
    // Get all underlyings
    const underlyingsList = await db
      .select({
        ticker: underlyings.ticker,
      })
      .from(underlyings);
    
    tickersToProcess = underlyingsList.map(u => u.ticker);
  }

  console.log(`[Massive] Processing ${tickersToProcess.length} tickers`);

  const config: MassiveApiConfig = {
    apiKey,
    baseUrl: process.env.MASSIVE_API_BASE_URL || 'https://api.massive.com/v2',
  };

  const snapshots: Array<{
    date: string;
    ticker: string;
    spot?: number | null;
    iv30?: number | null;
    source?: string;
  }> = [];

  const errors: Array<{ ticker: string; error: string }> = [];

  // Fetch data for each ticker
  for (const ticker of tickersToProcess) {
    try {
      const spot = await getSpotFromMassive(ticker, targetDate, config);
      const iv30 = await getIv30FromMassive(ticker, targetDate, config);

      if (spot !== null || iv30 !== null) {
        snapshots.push({
          date: targetDate,
          ticker,
          spot,
          iv30,
          source: 'massive',
        });
      } else {
        errors.push({ ticker, error: 'No data available (spot and IV30 both null)' });
      }

      // Rate limiting - small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ ticker, error: errorMsg });
      console.error(`[Massive] Error processing ${ticker}:`, errorMsg);
    }
  }

  // Upsert all snapshots
  if (snapshots.length > 0) {
    const result = await upsertIvSnapshots(snapshots);
    return {
      processed: tickersToProcess.length,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped + errors.length,
      errors: [...result.errors, ...errors],
    };
  }

  return {
    processed: tickersToProcess.length,
    inserted: 0,
    updated: 0,
    skipped: tickersToProcess.length,
    errors,
  };
}

