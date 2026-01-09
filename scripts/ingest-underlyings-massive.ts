#!/usr/bin/env tsx
/**
 * Ingest underlying spot prices and IV30 from Massive.com API
 *
 * This script:
 * 1. Gets list of all active underlyings from database
 * 2. Fetches latest spot price from Yahoo Finance (primary) or Massive (fallback)
 * 3. Fetches options chain from Massive for IV30 calculation
 * 4. Upserts into underlyings_iv_history and options_chain_snapshots tables
 *
 * Scheduled to run daily at 21:30 UTC (4:30 PM ET, after market close)
 *
 * Trading Day Logic:
 * - If no date specified, automatically determines the last trading day
 * - Before 21:00 UTC: uses previous calendar day (market not closed yet)
 * - After 21:00 UTC: uses today (market closed, EOD data available)
 * - Weekends: automatically adjusts to Friday
 * - Holidays: not auto-detected; specify date manually if needed
 *
 * Environment variables required:
 * - MASSIVE_API_KEY: Your Massive.com API key
 * - DATABASE_URL_POOLER: Database connection string
 *
 * Usage:
 *   npx tsx scripts/ingest-underlyings-massive.ts           # Auto-detect trading day
 *   npx tsx scripts/ingest-underlyings-massive.ts 2025-12-17              # Specific date
 *   npx tsx scripts/ingest-underlyings-massive.ts 2025-12-17 TSLA AAPL    # Specific date + tickers
 */

// Load environment variables from .env.local BEFORE any other imports
// This ensures env vars are available when db/index.ts is loaded
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// Load .env.local explicitly using script directory (works in launchd)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '..', '.env.local') });

import { db } from '../src/db';
import { underlyings, optionsChainSnapshots } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { upsertIvSnapshots, fetchYahooFinanceSpot } from '../src/lib/ingestion/underlyingsIvHistory';
import type { NewOptionsChainSnapshot } from '../src/db/schema';

// Check environment
function checkEnvironment() {
  const required = ['MASSIVE_API_KEY', 'DATABASE_URL_POOLER'];
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }
}

checkEnvironment();

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY!;
// Massive.com API base URL
// Note: Check Massive.com API docs for correct base URL - might be different
const MASSIVE_BASE_URL = process.env.MASSIVE_API_BASE_URL || 'https://api.massive.com/v2';

interface MassiveAggResponse {
  status: string;
  results?: Array<{
    v: number; // volume
    vw: number; // volume weighted average price
    o: number; // open
    c: number; // close
    h: number; // high
    l: number; // low
    t: number; // timestamp (ms)
    n?: number; // number of transactions
  }>;
  resultsCount?: number;
}

/**
 * Get spot prices for multiple tickers from Yahoo Finance
 * Uses Yahoo Finance API (free, no API key required)
 * Data available by 11:00 AM ET the following day
 * 
 * Note: Yahoo Finance may have rate limits, so we add small delays between requests
 */
async function getSpotPricesFromYahooFinance(
  date: string,
  tickers: string[]
): Promise<Map<string, number>> {
  const spotMap = new Map<string, number>();
  
  console.log(`[Yahoo Finance] Fetching spot prices for ${tickers.length} tickers...`);
  
  for (const ticker of tickers) {
    try {
      const spot = await fetchYahooFinanceSpot(ticker, date);
      if (spot !== null && spot > 0) {
        spotMap.set(ticker.toUpperCase(), spot);
      }
      
      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Continue with other tickers if one fails
      console.warn(`[Yahoo Finance] Failed to get spot for ${ticker}:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log(`[Yahoo Finance] Retrieved ${spotMap.size} of ${tickers.length} spot prices`);
  return spotMap;
}

/**
 * Get spot prices for multiple tickers from Massive Daily Market Summary
 * Uses free EOD endpoint: /v2/aggs/grouped/locale/us/market/stocks/{date}
 * This is more efficient - one call gets all stocks for a date
 * 
 * Reference: https://massive.com/docs/rest/stocks/aggregates/daily-market-summary
 */
async function getSpotPricesFromDailySummary(
  date: string,
  tickers: string[]
): Promise<Map<string, number>> {
  const spotMap = new Map<string, number>();
  
  try {
    // Use the free grouped daily summary endpoint
    // Reference: https://massive.com/docs/rest/stocks/aggregates/daily-market-summary
    // This returns EOD prices for all US stocks on a given date (normal close, not after-hours)
    // Try different authentication methods
    const urlsToTry = [
      `https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${date}?apiKey=${MASSIVE_API_KEY}`,
      `https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${date}`,
    ];
    
    let response: Response | null = null;
    let lastError: Error | null = null;
    
    for (const url of urlsToTry) {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (!url.includes('apiKey=')) {
        headers['Authorization'] = `Bearer ${MASSIVE_API_KEY}`;
      }
      
      response = await fetch(url, { headers });
      
      if (response.ok) {
        break; // Found working URL
      } else {
        const errorText = await response.text();
        lastError = new Error(`Status ${response.status}: ${errorText.substring(0, 200)}`);
        if (response.status === 401) {
          throw new Error('Massive API key invalid or expired');
        }
        // Continue to next URL attempt
      }
    }
    
    if (!response || !response.ok) {
      throw lastError || new Error('All authentication methods failed');
    }

    const data = await response.json();
    
    if (data.status === 'OK' && data.results && Array.isArray(data.results)) {
      // Create a map of ticker -> close price
      // Note: T is the exchange symbol (ticker), c is close price
      const tickerSet = new Set(tickers.map(t => t.toUpperCase()));
      
      for (const result of data.results) {
        const ticker = result.T?.toUpperCase(); // T is the exchange symbol
        if (ticker && tickerSet.has(ticker) && result.c !== undefined && result.c !== null) {
          const closePrice = parseFloat(String(result.c));
          if (!isNaN(closePrice) && closePrice > 0) {
            spotMap.set(ticker, closePrice);
          }
        }
      }
      
      console.log(`[Daily Summary] Found spot prices for ${spotMap.size} of ${tickers.length} tickers from ${data.resultsCount ?? data.results.length} total stocks`);
    } else {
      console.log(`[Daily Summary] Unexpected response format:`, data.status, data.resultsCount);
    }
    
    return spotMap;
  } catch (error) {
    console.error(`Failed to get spot prices from daily summary:`, error);
    throw error; // Re-throw so caller can handle gracefully
  }
}

/**
 * Options Chain Snapshot response structure from Massive
 * Based on actual API documentation: https://massive.com/docs/rest/options/snapshots/option-chain-snapshot
 */
interface OptionsChainSnapshot {
  status: string;
  request_id?: string;
  next_url?: string;
  results?: Array<{
    break_even_price?: number;
    day?: {
      change?: number;
      change_percent?: number;
      close?: number;
      open?: number;
      high?: number;
      low?: number;
      volume?: number;
      previous_close?: number;
      vwap?: number;
      last_updated?: number;
      [key: string]: any;
    };
    details?: {
      contract_type?: 'call' | 'put';
      strike_price?: number;
      expiration_date?: string; // YYYY-MM-DD
      ticker?: string;
      shares_per_contract?: number;
      exercise_style?: string;
      [key: string]: any;
    };
    greeks?: {
      delta?: number;
      gamma?: number;
      theta?: number;
      vega?: number;
      // Note: implied_volatility is NOT in greeks, it's at the top level of each result
      [key: string]: any;
    };
    implied_volatility?: number; // Top-level field! Decimal (0.05 for 5%, needs conversion)
    last_quote?: {
      bid?: number;
      ask?: number;
      bid_size?: number;
      ask_size?: number;
      midpoint?: number;
      last_updated?: number;
      timeframe?: string;
      [key: string]: any;
    };
    last_trade?: {
      price?: number;
      size?: number;
      exchange?: number;
      conditions?: number[];
      sip_timestamp?: number;
      timeframe?: string;
      [key: string]: any;
    };
    open_interest?: number;
    underlying_asset?: {
      price?: number; // Spot price - nested in each result!
      ticker?: string;
      change_to_break_even?: number;
      last_updated?: number;
      timeframe?: string;
      [key: string]: any;
    };
    fmv?: number; // Fair Market Value (Business plans only)
    fmv_last_updated?: number;
    [key: string]: any;
  }>;
}

/**
 * Calculate DTE (Days To Expiry) from expiration date
 */
function calculateDte(expirationDate: string, currentDate: string): number | null {
  try {
    const expiry = new Date(expirationDate + 'T00:00:00Z');
    const current = new Date(currentDate + 'T00:00:00Z');
    const diffTime = expiry.getTime() - current.getTime();
    const dte = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return dte >= 0 ? dte : null;
  } catch {
    return null;
  }
}

/**
 * Get spot price and IV30 from Massive Options Chain Snapshot
 * Also stores full options chain in database for historical analysis
 * 
 * Uses: GET /v3/snapshot/options/{underlyingAsset}
 * 
 * Returns:
 * - spot: from underlying_asset.price
 * - iv30: calculated from ATM options with ~30 DTE
 * - fullChain: full options chain data (stored in database)
 */
async function getSpotAndIv30FromMassive(
  ticker: string,
  date: string,
  underlyingId: string | null,
  spotPrice?: number | null // Spot price from daily summary (if available)
): Promise<{ iv30: number | null; fullChain: OptionsChainSnapshot | null }> {
  try {
    // Use v3 snapshot endpoint for options chain
    // Strategy: Get options with ~30 DTE and reasonable strike range around current spot
    // This reduces data volume while ensuring we have good IV30 data
    
    // First, try to get a rough estimate of current spot from the first few options
    // (we'll refine this with daily summary, but need something for strike filtering)
    const dateObj = new Date(date + 'T00:00:00Z');
    const minExpiry = new Date(dateObj);
    minExpiry.setDate(minExpiry.getDate() + 20);
    const maxExpiry = new Date(dateObj);
    maxExpiry.setDate(maxExpiry.getDate() + 40);
    
    const minExpiryStr = minExpiry.toISOString().split('T')[0]!; // YYYY-MM-DD
    const maxExpiryStr = maxExpiry.toISOString().split('T')[0]!; // YYYY-MM-DD
    
    // If we have spot price, filter strikes to ±30% around spot (reasonable range)
    // Otherwise, fetch all options in the DTE range and we'll filter later
    let url = `https://api.massive.com/v3/snapshot/options/${ticker}?apiKey=${MASSIVE_API_KEY}&limit=250&expiration_date.gte=${minExpiryStr}&expiration_date.lte=${maxExpiryStr}`;
    
    // Add strike filtering if we have spot price estimate
    if (spotPrice && spotPrice > 0) {
      const strikeMin = Math.max(0.01, spotPrice * 0.7); // 30% below spot
      const strikeMax = spotPrice * 1.3; // 30% above spot
      url += `&strike_price.gte=${strikeMin}&strike_price.lte=${strikeMax}`;
    }
    
    let response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // If 404, try v2 endpoint
    if (response.status === 404) {
      url = `https://api.massive.com/v2/snapshot/options/${ticker}?apiKey=${MASSIVE_API_KEY}`;
      response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // If still 404, try with Authorization header instead
    if (response.status === 404) {
      url = `https://api.massive.com/v3/snapshot/options/${ticker}`;
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${MASSIVE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DEBUG] Options chain URL: ${url}`);
      console.error(`[DEBUG] Response status: ${response.status}`);
      console.error(`[DEBUG] Response body: ${errorText.substring(0, 500)}`);
      
      if (response.status === 401) {
        throw new Error('Massive API key invalid or expired');
      }
      if (response.status === 403) {
        throw new Error('Massive API access denied - Options Chain Snapshot may require paid tier');
      }
      throw new Error(`Massive API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data: OptionsChainSnapshot = await response.json();
    
    // Use spot price from daily summary if provided, otherwise try to get from options chain
    // Note: underlying_asset.price in options chain may not be available depending on plan tier
    let spot: number | null = spotPrice ?? null;
    if (!spot && data.results && data.results.length > 0) {
      // Fallback: try to get spot from first result's underlying_asset
      const firstResult = data.results[0];
      spot = firstResult.underlying_asset?.price 
        ? parseFloat(String(firstResult.underlying_asset.price)) 
        : null;
    }

    // Calculate IV30 from options chain
    // Strategy: Find ATM (at-the-money) options with DTE closest to 30 days
    // Can calculate even without spot - will use all options near 30 DTE
    let iv30: number | null = null;
    
    if (data.results && data.results.length > 0) {
      const optionsWithIv: Array<{
        iv: number;
        dte: number;
        strike: number;
        distance: number; // Distance from spot
      }> = [];

      for (const option of data.results) {
        // Extract data from nested structure
        const details = option.details;
        
        if (!details?.strike_price || !details?.expiration_date) {
          continue;
        }

        // IV is at top level: option.implied_volatility (not in greeks!)
        // According to API docs sample: "implied_volatility": 5 means 5% (not 0.05)
        // But we need to verify the actual format from the API response
        const ivRaw = option.implied_volatility;
        let iv: number | null = null;
        
        if (ivRaw !== undefined && ivRaw !== null) {
          const ivNum = parseFloat(String(ivRaw));
          if (!isNaN(ivNum) && ivNum > 0) {
            // Debug: Log first few raw IV values to understand format
            if (optionsWithIv.length < 3) {
              console.log(`[DEBUG] Raw IV value: ${ivNum} (type: ${typeof ivRaw})`);
            }
            
            // Based on actual API response: IV is returned as decimal (0.75 = 75%)
            // Not as percentage (75 = 75%) as the docs might suggest
            // We've confirmed this from debug output showing raw values like 0.75
            iv = ivNum; // Already in decimal format
            
            // Sanity check: IV should be reasonable (between 1% and 500%)
            // TSLA typically has IV between 30-60%
            if (iv < 0.01 || iv > 5.0) {
              console.log(`[DEBUG] Suspicious IV value for ${ticker}: raw=${ivNum}, converted=${(iv * 100).toFixed(2)}% - skipping`);
              continue;
            }
          }
        }
        
        if (iv === null || isNaN(iv) || iv <= 0) continue;

        const strike = parseFloat(String(details.strike_price));
        if (isNaN(strike) || strike <= 0) continue;

        const dte = calculateDte(details.expiration_date, date);
        if (dte === null || dte < 0) continue;

        // Calculate distance from spot (for ATM selection)
        // If spot is not available, we'll skip ATM filtering and use all options
        const distance = spot ? Math.abs(strike - spot) / spot : null; // Percentage distance

        optionsWithIv.push({
          iv,
          dte,
          strike,
          distance: distance ?? 999, // Use large number if no spot (will be filtered out in ATM check)
        });
      }

      if (optionsWithIv.length > 0) {
        // Filter for options with DTE between 20-40 days (closest to 30)
        const near30Dte = optionsWithIv.filter(o => o.dte >= 20 && o.dte <= 40);
        
        // If we have options near 30 DTE, use those
        // Otherwise, use all options and weight by DTE proximity to 30
        const candidates = near30Dte.length > 0 ? near30Dte : optionsWithIv;
        
        // Debug: Log all candidate options to see what we're working with
        if (candidates.length > 0) {
          console.log(`[${ticker}] Candidates: ${candidates.length} options with DTE 20-40`);
          const sampleCandidates = candidates.slice(0, 5);
          for (const opt of sampleCandidates) {
            console.log(`  Strike: ${opt.strike.toFixed(2)}, DTE: ${opt.dte}, IV: ${(opt.iv * 100).toFixed(2)}%, Distance: ${spot ? (opt.distance * 100).toFixed(1) + '%' : 'N/A'}`);
          }
        }
        
        // Find ATM options (within 5% of spot) - only if we have spot
        // Use 5% range for true ATM options, which have the most reliable IV
        // Also filter out very low IV options (likely deep ITM/OTM with minimal time value)
        // Minimum IV of 0.10 (10%) for TSLA-like stocks
        const minIv = 0.10; // 10% minimum IV
        const atmOptions = spot 
          ? candidates.filter(o => o.distance <= 0.05 && o.iv >= minIv) // Within 5% of spot and IV >= 10%
          : candidates.filter(o => o.iv >= minIv); // If no spot, at least filter by reasonable IV
        
        // If no ATM options found, expand to 10% range
        const expandedAtmOptions = spot && atmOptions.length === 0
          ? candidates.filter(o => o.distance <= 0.10 && o.iv >= minIv)
          : atmOptions;
        
        if (expandedAtmOptions.length > 0) {
          // Use ATM options, prefer those closest to 30 DTE
          expandedAtmOptions.sort((a, b) => {
            const dteDiffA = Math.abs(a.dte - 30);
            const dteDiffB = Math.abs(b.dte - 30);
            if (dteDiffA !== dteDiffB) {
              return dteDiffA - dteDiffB; // Closer to 30 DTE first
            }
            return a.distance - b.distance; // Then closer to ATM
          });
          
          // Average IV from top 3 closest-to-30-DTE ATM options
          const topOptions = expandedAtmOptions.slice(0, Math.min(3, expandedAtmOptions.length));
          const avgIv = topOptions.reduce((sum, o) => sum + o.iv, 0) / topOptions.length;
          iv30 = avgIv;
          
          // Debug: Log IV calculation details for ATM options
          console.log(`[${ticker}] IV30 calculated: ${(iv30 * 100).toFixed(2)}% from ${topOptions.length} ATM options`);
          console.log(`  DTE: ${topOptions.map(o => o.dte).join(', ')}`);
          console.log(`  Strikes: ${topOptions.map(o => o.strike.toFixed(2)).join(', ')}`);
          console.log(`  IVs: ${topOptions.map(o => (o.iv * 100).toFixed(2) + '%').join(', ')}`);
          if (spot) {
            console.log(`  Spot: ${spot.toFixed(2)}, Distance: ${topOptions.map(o => ((o.distance * 100).toFixed(1) + '%')).join(', ')}`);
          }
        } else {
          // No ATM options, use closest-to-30-DTE options regardless of strike
          candidates.sort((a, b) => {
            const dteDiffA = Math.abs(a.dte - 30);
            const dteDiffB = Math.abs(b.dte - 30);
            return dteDiffA - dteDiffB;
          });
          
          // Average IV from top 3 closest-to-30-DTE options
          const topOptions = candidates.slice(0, Math.min(3, candidates.length));
          if (topOptions.length > 0) {
            const avgIv = topOptions.reduce((sum, o) => sum + o.iv, 0) / topOptions.length;
            iv30 = avgIv;
            
            // Debug: Log IV calculation details with strikes
            console.log(`[${ticker}] IV30 calculated: ${(iv30 * 100).toFixed(2)}% from ${topOptions.length} options`);
            console.log(`  DTE: ${topOptions.map(o => o.dte).join(', ')}`);
            console.log(`  Strikes: ${topOptions.map(o => o.strike.toFixed(2)).join(', ')}`);
            console.log(`  IVs: ${topOptions.map(o => (o.iv * 100).toFixed(2) + '%').join(', ')}`);
            if (spot) {
              console.log(`  Spot: ${spot.toFixed(2)}, Distance: ${topOptions.map(o => ((o.distance * 100).toFixed(1) + '%')).join(', ')}`);
            }
          }
        }
      }
    }

    return { iv30, fullChain: data };
  } catch (error) {
    console.error(`Failed to get IV30 for ${ticker} from options chain:`, error);
    return { iv30: null, fullChain: null };
  }
}

/**
 * Store full options chain snapshot in database
 * This enables historical IV analysis, IV Rank, IV Percentile calculations
 */
async function storeOptionsChainSnapshot(
  ticker: string,
  date: string,
  underlyingId: string | null,
  spot: number | null,
  chainData: OptionsChainSnapshot
): Promise<{ inserted: number; errors: number }> {
  if (!chainData.results || chainData.results.length === 0) {
    return { inserted: 0, errors: 0 };
  }

  let inserted = 0;
  let errors = 0;

  // Calculate DTE for each option
  const snapshotRecords: NewOptionsChainSnapshot[] = [];

  for (const option of chainData.results) {
    const details = option.details;
    if (!details?.strike_price || !details?.expiration_date) {
      continue; // Skip invalid options
    }

    const strike = parseFloat(String(details.strike_price));
    if (isNaN(strike) || strike <= 0) continue;

    const expirationDate = details.expiration_date; // Should be YYYY-MM-DD
    const dte = calculateDte(expirationDate, date);

    // Only store options with valid DTE (non-expired)
    if (dte === null || dte < 0) continue;

    // IV is at top level: option.implied_volatility (not in greeks!)
    // IMPORTANT: API returns IV as decimal (e.g., 0.488 = 48.8%), NOT percentage
    // We confirmed this from actual API responses showing values like 0.488
    const ivRaw = option.implied_volatility;
    const iv = ivRaw !== undefined && ivRaw !== null 
      ? parseFloat(String(ivRaw))  // Already in decimal format (0.488 = 48.8%)
      : null;

    // Pricing from last_quote or day
    const bid = option.last_quote?.bid ?? null;
    const ask = option.last_quote?.ask ?? null;
    const last = option.last_quote?.last ?? option.day?.close ?? null;
    const volume = option.day?.volume ?? null;
    const openInterest = option.open_interest ?? null;

    // Store even if IV is null - we might want to analyze pricing without IV
    snapshotRecords.push({
      underlyingId: underlyingId ?? undefined,
      ticker: ticker.toUpperCase(),
      snapshotDate: date,
      underlyingSpot: spot?.toString() ?? null,
      source: 'massive',
      contractType: details.contract_type || null,
      strike: strike.toString(),
      expirationDate,
      dte,
      impliedVolatility: iv?.toString() ?? null,
      bid: bid ? parseFloat(String(bid)).toString() : null,
      ask: ask ? parseFloat(String(ask)).toString() : null,
      last: last ? parseFloat(String(last)).toString() : null,
      volume: volume ? parseInt(String(volume)) : null,
      openInterest: openInterest ? parseInt(String(openInterest)) : null,
      rawData: option as any, // Store full option data for future use
    });
  }

  // Batch insert with conflict handling
  // Use ON CONFLICT DO NOTHING to handle duplicates (idempotent)
  // Insert in batches for better performance
  const batchSize = 100;
  for (let i = 0; i < snapshotRecords.length; i += batchSize) {
    const batch = snapshotRecords.slice(i, i + batchSize);
    try {
      await db
        .insert(optionsChainSnapshots)
        .values(batch)
        .onConflictDoNothing({
          target: [
            optionsChainSnapshots.ticker,
            optionsChainSnapshots.snapshotDate,
            optionsChainSnapshots.contractType,
            optionsChainSnapshots.strike,
            optionsChainSnapshots.expirationDate,
            optionsChainSnapshots.source,
          ],
        });
      inserted += batch.length;
    } catch (error: any) {
      // If batch insert fails, try individual inserts
      for (const record of batch) {
        try {
          await db
            .insert(optionsChainSnapshots)
            .values(record)
            .onConflictDoNothing({
              target: [
                optionsChainSnapshots.ticker,
                optionsChainSnapshots.snapshotDate,
                optionsChainSnapshots.contractType,
                optionsChainSnapshots.strike,
                optionsChainSnapshots.expirationDate,
                optionsChainSnapshots.source,
              ],
            });
          inserted++;
        } catch (individualError: any) {
          // If it's a unique constraint violation, that's expected (duplicate)
          // Otherwise, it's a real error
          if (individualError?.code === '23505' || individualError?.message?.includes('unique constraint')) {
            // Duplicate - skip silently (idempotent)
            continue;
          }
          errors++;
          // Log but don't fail entire process
          if (errors <= 5) { // Only log first 5 errors to avoid spam
            console.error(`Failed to insert option contract ${ticker} ${record.strike} ${record.expirationDate}:`, individualError);
          }
        }
      }
    }
  }

  return { inserted, errors };
}

/**
 * Calculate the last US trading day
 *
 * Logic:
 * - Job is scheduled to run at 21:30 UTC (4:30 PM ET, after market close)
 * - If running before 21:00 UTC, market hasn't closed yet, so use previous trading day
 * - If running after 21:00 UTC, market has closed, so use today
 * - Skip weekends: Saturday/Sunday → use Friday
 *
 * Note: This doesn't handle NYSE holidays. For holidays, manually specify the date
 * or the script will attempt to fetch data that doesn't exist (which is handled gracefully).
 */
function getLastTradingDay(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();

  // Start with today's date
  let tradingDay = new Date(now);

  // If it's before 21:00 UTC (4 PM ET), market hasn't closed yet
  // Use the previous calendar day
  if (utcHour < 21) {
    tradingDay.setUTCDate(tradingDay.getUTCDate() - 1);
    console.log(`[Trading Day] Current time ${utcHour}:00 UTC is before market close (21:00 UTC)`);
    console.log(`[Trading Day] Using previous day as trading day`);
  } else {
    console.log(`[Trading Day] Current time ${utcHour}:00 UTC is after market close`);
    console.log(`[Trading Day] Using today as trading day`);
  }

  // Skip weekends
  const dayOfWeek = tradingDay.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0) {
    // Sunday → use Friday (go back 2 days)
    tradingDay.setUTCDate(tradingDay.getUTCDate() - 2);
    console.log(`[Trading Day] Adjusted for Sunday → Friday`);
  } else if (dayOfWeek === 6) {
    // Saturday → use Friday (go back 1 day)
    tradingDay.setUTCDate(tradingDay.getUTCDate() - 1);
    console.log(`[Trading Day] Adjusted for Saturday → Friday`);
  }

  const result = tradingDay.toISOString().split('T')[0]!;
  console.log(`[Trading Day] Calculated trading day: ${result}`);
  return result;
}

/**
 * Main ingestion function
 */
async function ingestUnderlyingsFromMassive(date?: string, tickers?: string[]): Promise<void> {
  const targetDate = date || getLastTradingDay();
  
  console.log(`🚀 Starting Massive ingestion for date: ${targetDate}\n`);

  // Get tickers to process
  let tickersToProcess: string[];
  
  if (tickers && tickers.length > 0) {
    tickersToProcess = tickers.map(t => t.trim().toUpperCase());
  } else {
    // Get all underlyings from database
    // Note: underlyings table doesn't have isActive field, so we get all
    const underlyingsList = await db
      .select({
        ticker: underlyings.ticker,
      })
      .from(underlyings);
    
    tickersToProcess = underlyingsList.map(u => u.ticker);
  }

  console.log(`📊 Processing ${tickersToProcess.length} tickers\n`);

  const snapshots: Array<{
    date: string;
    ticker: string;
    spot?: number | null;
    iv30?: number | null;
    source?: string;
  }> = [];

  let processed = 0;
  let errors = 0;

  // Get underlying IDs for all tickers (for foreign key relationships)
  const underlyingMap = new Map<string, string | null>();
  for (const ticker of tickersToProcess) {
    const underlying = await db
      .select({ id: underlyings.id })
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker.toUpperCase()))
      .limit(1);
    underlyingMap.set(ticker.toUpperCase(), underlying[0]?.id ?? null);
  }

  // Step 1: Get spot prices from Yahoo Finance (primary source)
  // Yahoo Finance has EOD data available right after market close (4 PM ET)
  // This is faster and more reliable than Massive for same-day data
  console.log(`\n📊 Step 1: Fetching spot prices from Yahoo Finance (EOD close)...`);
  let spotPrices: Map<string, number>;
  try {
    spotPrices = await getSpotPricesFromYahooFinance(targetDate, tickersToProcess);
    if (spotPrices.size > 0) {
      console.log(`✅ Retrieved ${spotPrices.size} spot prices from Yahoo Finance`);
    } else {
      console.log(`⚠️  Yahoo Finance returned no spot prices`);
      spotPrices = new Map();
    }
  } catch (error) {
    console.log(`⚠️  Yahoo Finance failed:`, error instanceof Error ? error.message : String(error));
    spotPrices = new Map();
  }
  
  // Fallback to Massive Daily Market Summary if Yahoo Finance fails
  // (Useful for historical backfill or if Yahoo Finance is down)
  if (spotPrices.size === 0) {
    console.log(`\n    Attempting Massive Daily Market Summary as fallback...`);
    try {
      spotPrices = await getSpotPricesFromDailySummary(targetDate, tickersToProcess);
      if (spotPrices.size > 0) {
        console.log(`✅ Retrieved ${spotPrices.size} spot prices from Massive Daily Market Summary`);
      } else {
        console.log(`⚠️  Massive also returned no spot prices`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('before end of day')) {
        console.log(`⚠️  Massive cannot fetch today's data before market close (free tier limitation)`);
      } else {
        console.log(`⚠️  Massive Daily Market Summary failed: ${errorMsg}`);
      }
    }
  }
  
  if (spotPrices.size === 0) {
    console.log(`\n⚠️  No spot prices available from any source`);
    console.log(`    Attempting to proceed without spot prices (IV30 will be less accurate)...`);
  }
  
  console.log(`\n📊 Step 2: Fetching options chain snapshots from Massive (will use spot prices from Step 1)...`);
  
  // Step 2: Fetch options chain and IV30 for each ticker from Massive
  // Use spot prices from Step 1 (Yahoo Finance or Massive fallback)
  // The Options Chain Snapshot may have its own underlying_asset.price, but we use our spot instead
  // This ensures spot and IV30 are from the same valuation moment (EOD close)
  for (const ticker of tickersToProcess) {
    try {
      console.log(`\n[${ticker}] Fetching options chain snapshot...`);
      
      const underlyingId = underlyingMap.get(ticker.toUpperCase()) ?? null;
      const spot = spotPrices.get(ticker.toUpperCase()) ?? null; // From Yahoo Finance (or Massive fallback)
      
      if (!spot) {
        console.log(`[${ticker}] ⚠️  No spot price available - proceeding without spot`);
        console.log(`    (IV30 will be calculated from all options near 30 DTE, not just ATM)`);
        // Continue without spot - we can still calculate IV30, just less accurately
      }
      
      // Get IV30 and full chain data from options chain snapshot
      // Pass spot to ensure IV30 is calculated using the same spot as stored
      // The options chain may have underlying_asset.price, but we use our spot instead
      const { iv30, fullChain } = await getSpotAndIv30FromMassive(ticker, targetDate, underlyingId, spot);
      
      // Store full options chain snapshot for historical analysis
      // Use our spot (not underlying_asset.price from options chain)
      if (fullChain) {
        console.log(`[${ticker}] Storing options chain snapshot...`);
        const chainResult = await storeOptionsChainSnapshot(ticker, targetDate, underlyingId, spot, fullChain);
        console.log(`[${ticker}] Stored ${chainResult.inserted} option contracts (${chainResult.errors} errors)`);
      }

      // Save snapshot with spot (from Yahoo Finance/Massive) and IV30 (from Massive options chain)
      // Both are for the same asOfDate (targetDate), representing EOD close
      if (iv30 !== null || spot !== null) {
        snapshots.push({
          date: targetDate, // Same date for both spot and IV30
          ticker,
          spot: spot, // Spot from Yahoo Finance (or Massive fallback)
          iv30,
          source: 'massive', // IV30 source is still Massive
        });
        console.log(`[${ticker}] ✅ Spot: ${spot ? spot.toFixed(2) : 'N/A'} (EOD close), IV30: ${iv30 ? (iv30 * 100).toFixed(2) + '%' : 'N/A'}`);
      } else {
        console.log(`[${ticker}] ⚠️  No IV30 data available (spot: ${spot ? spot.toFixed(2) : 'N/A'})`);
      }

      processed++;
      
      // Rate limiting - delay between requests to avoid hitting rate limits
      // Options chain endpoint may have stricter limits, so use longer delay
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      errors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${ticker}] ❌ Error: ${errorMsg}`);
      
      // If options chain fails (e.g., paid tier required), try fallback for spot
      if (errorMsg.includes('403') || errorMsg.includes('NOT_AUTHORIZED')) {
        console.log(`[${ticker}] Options chain requires paid tier, trying daily aggregates for spot...`);
        try {
          const fallbackSpot = await getSpotFromMassive(ticker, targetDate);
          if (fallbackSpot !== null) {
            snapshots.push({
              date: targetDate,
              ticker,
              spot: fallbackSpot,
              iv30: null,
              source: 'massive',
            });
            console.log(`[${ticker}] ✅ Spot: ${fallbackSpot} (IV30: requires paid tier)`);
          }
        } catch (fallbackError) {
          // Ignore fallback errors
        }
      }
    }
  }

  // Upsert all snapshots
  if (snapshots.length > 0) {
    console.log(`\n💾 Upserting ${snapshots.length} snapshots...`);
    const result = await upsertIvSnapshots(snapshots);
    console.log(`\n✅ Ingestion complete:`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.length}`);
      result.errors.forEach(e => console.log(`     - ${e.ticker}: ${e.error}`));
    }
  } else {
    console.log(`\n⚠️  No data to ingest (${errors} errors)`);
  }
}

// Run if called directly
if (require.main === module) {
  const dateArg = process.argv[2]; // Optional date argument (YYYY-MM-DD)
  const tickersArg = process.argv.slice(3); // Optional ticker list
  
  ingestUnderlyingsFromMassive(dateArg, tickersArg.length > 0 ? tickersArg : undefined)
    .then(() => {
      console.log('\n✅ Ingestion completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Ingestion failed:', error);
      process.exit(1);
    });
}

export { ingestUnderlyingsFromMassive };
