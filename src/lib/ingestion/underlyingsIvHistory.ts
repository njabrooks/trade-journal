/**
 * Underlyings IV History Ingestion
 * 
 * Ingests implied volatility and spot price data for underlyings.
 * Supports multiple data sources (Option Strategist, IBKR, etc.)
 * 
 * Usage:
 * - Manual: Call via `/api/admin/backfill-underlyings` POST endpoint or admin UI
 * - Automated: Schedule Edge function/cron to call the API endpoint weekly
 *   (Option Strategist updates weekly, so daily runs aren't necessary)
 * 
 * Future: IBKR API integration for daily data (see FUTURE_ENHANCEMENTS.md #10a)
 */

import { db } from '@/db';
import { underlyingsIvHistory, underlyings } from '@/db/schema';
import type { NewUnderlyingIvHistory } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureUnderlyingId } from './flex/underlyings';

export interface RawIvSnapshot {
  date: string; // 'YYYY-MM-DD'
  ticker: string;
  spot?: number | null;
  iv30?: number | null; // decimal (0.45 for 45%)
  rv20?: number | null; // Realized Volatility (20-day), decimal (0.45 for 45%) - maps to hv20 from source
  source?: string; // 'opt_strat', 'ibkr', 'manual', etc. (for tracking, not stored in DB)
}

/**
 * Upserts IV history snapshots into the database
 * Handles idempotency via unique constraint on (underlyingId, asOfDate)
 */
export async function upsertIvSnapshots(
  snapshots: RawIvSnapshot[]
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ ticker: string; error: string }>;
}> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ ticker: string; error: string }> = [];

  for (const snapshot of snapshots) {
    try {
      // Normalize ticker
      const ticker = snapshot.ticker.trim().toUpperCase();
      if (!ticker) {
        skipped++;
        errors.push({ ticker: snapshot.ticker, error: 'Empty ticker' });
        continue;
      }

      // Validate date
      const dateStr = snapshot.date;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        skipped++;
        errors.push({ ticker, error: `Invalid date format: ${dateStr}` });
        continue;
      }

      // Skip if both spot and iv30 are null
      if (snapshot.spot === null && snapshot.iv30 === null) {
        skipped++;
        errors.push({ ticker, error: 'Both spot and iv30 are null' });
        continue;
      }

      // Try to ensure underlying exists (optional - underlyingId can be null)
      const underlyingId = await ensureUnderlyingId(ticker);

      const source = snapshot.source || 'opt_strat'; // Required - default to 'opt_strat' for Option Strategist

      // Round spot price to 2 decimal places
      const roundedSpot = snapshot.spot !== null && snapshot.spot !== undefined
        ? Math.round(snapshot.spot * 100) / 100
        : null;

      const ivHistoryData: NewUnderlyingIvHistory = {
        underlyingId: underlyingId ?? undefined, // Can be null if underlying doesn't exist
        ticker, // Required - denormalized for easier querying
        asOfDate: dateStr,
        spot: roundedSpot?.toString() ?? null,
        iv30: snapshot.iv30?.toString() ?? null,
        rv20: snapshot.rv20?.toString() ?? null, // 20-day realized volatility (hv20 from source)
        source, // Required - part of unique constraint
        // Don't include atr20 in insert - use undefined so Drizzle omits it
        // ATR20 (Average True Range) is not available from Option Strategist
        atr20: undefined,
      };

      // Check if record exists using the unique constraint: (ticker, as_of_date, source)
      const existing = await db
        .select({ 
          id: underlyingsIvHistory.id,
          underlyingId: underlyingsIvHistory.underlyingId,
          atr20: underlyingsIvHistory.atr20,
          rv20: underlyingsIvHistory.rv20,
        })
        .from(underlyingsIvHistory)
        .where(
          and(
            eq(underlyingsIvHistory.ticker, ticker),
            eq(underlyingsIvHistory.asOfDate, dateStr),
            eq(underlyingsIvHistory.source, source)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        // Note: spot is already rounded in ivHistoryData
        const updateSet: any = {
          spot: ivHistoryData.spot,
          iv30: ivHistoryData.iv30,
          rv20: ivHistoryData.rv20, // Update rv20 from source data
          updatedAt: new Date(),
        };
        
        // Update underlyingId if we have one and the existing record doesn't
        if (underlyingId && !existing[0].underlyingId) {
          updateSet.underlyingId = underlyingId;
        }
        
        // Preserve atr20 if it exists (we don't get ATR20 from Option Strategist)
        if (existing[0].atr20) {
          updateSet.atr20 = existing[0].atr20;
        }

        await db
          .update(underlyingsIvHistory)
          .set(updateSet)
          .where(eq(underlyingsIvHistory.id, existing[0].id));
        
        updated++;
      } else {
        // Insert new record
        try {
          await db.insert(underlyingsIvHistory).values(ivHistoryData);
          inserted++;
        } catch (insertError) {
          // If insert fails due to duplicate (race condition), try update instead
          const isDuplicateError = insertError instanceof Error && 
            (insertError.message.includes('duplicate') || 
             insertError.message.includes('unique') ||
             (insertError.cause && typeof insertError.cause === 'object' && 
              'code' in insertError.cause && insertError.cause.code === '23505'));
          
          if (isDuplicateError) {
            // Race condition - record was inserted between our check and insert
            // Try to update it instead
            const existingAfter = await db
              .select({ 
                id: underlyingsIvHistory.id,
                underlyingId: underlyingsIvHistory.underlyingId,
                atr20: underlyingsIvHistory.atr20,
                rv20: underlyingsIvHistory.rv20,
              })
              .from(underlyingsIvHistory)
              .where(
                and(
                  eq(underlyingsIvHistory.ticker, ticker),
                  eq(underlyingsIvHistory.asOfDate, dateStr),
                  eq(underlyingsIvHistory.source, source)
                )
              )
              .limit(1);
            
            if (existingAfter.length > 0) {
              const updateSet: any = {
                spot: ivHistoryData.spot,
                iv30: ivHistoryData.iv30,
                rv20: ivHistoryData.rv20, // Update rv20 from source data
                updatedAt: new Date(),
              };
              
              // Update underlyingId if we have one and the existing record doesn't
              if (underlyingId && !existingAfter[0].underlyingId) {
                updateSet.underlyingId = underlyingId;
              }
              
              // Preserve atr20 if it exists (we don't get ATR20 from Option Strategist)
              if (existingAfter[0].atr20) {
                updateSet.atr20 = existingAfter[0].atr20;
              }
              await db
                .update(underlyingsIvHistory)
                .set(updateSet)
                .where(eq(underlyingsIvHistory.id, existingAfter[0].id));
              updated++;
            } else {
              // Still can't find it, re-throw the original error
              throw insertError;
            }
          } else {
            // Not a duplicate error, re-throw
            throw insertError;
          }
        }
      }
    } catch (error) {
      // Extract the actual database error message
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check for PostgreSQL error details
        if ('cause' in error && error.cause instanceof Error) {
          const pgError = error.cause as any;
          if (pgError.code) {
            errorMessage = `PostgreSQL ${pgError.code}: ${pgError.message || errorMessage}`;
          }
        }
      } else {
        errorMessage = String(error);
      }
      
      errors.push({
        ticker: snapshot.ticker,
        error: errorMessage,
      });
      skipped++;
      console.error(`IV history ingestion error for ${snapshot.ticker}:`, error);
    }
  }

  return { inserted, updated, skipped, errors };
}

/**
 * Scrapes Option Strategist free volatility data page
 * Returns IV snapshots for the provided tickers
 */
export async function scrapeOptionStrategist(
  tickers: string[]
): Promise<RawIvSnapshot[]> {
  const url = 'https://www.optionstrategist.com/calculators/free-volatility-data';
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TradeJournal/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Option Strategist HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Extract each <span class='vol-line'>...</span> as one line
  const lines: string[] = [];
  const re = /<span[^>]*class=['"]vol-line['"][^>]*>([\s\S]*?)<\/span>/gi;
  let match;

  while ((match = re.exec(html)) !== null) {
    let text = match[1]
      .replace(/<[^>]+>/g, ' ') // strip any nested tags
      .replace(/\s+/g, ' ') // normalize whitespace
      .trim();

    if (text) {
      lines.push(text);
    }
  }

  const snapshots: RawIvSnapshot[] = [];
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (const ticker of tickers) {
    const tickerUpper = ticker.toUpperCase();

    // Find a line that contains the ticker
    const line = lines.find((raw) => raw.toUpperCase().includes(tickerUpper));

    if (!line) {
      continue; // Ticker not found in data
    }

    const tokens = line.trim().split(/\s+/);

    if (tokens.length < 7) {
      continue; // Unexpected format
    }

    // Locate the symbol within the tokens
    const symIdx = tokens.findIndex((tok) => tok.toUpperCase() === tickerUpper);

    if (symIdx === -1) {
      continue; // Ticker not found as separate token
    }

    // Expected pattern: [sym, hv20, hv50, hv100, dateCode, curIV, ..., close]
    if (symIdx + 5 >= tokens.length) {
      continue; // Not enough tokens
    }

    const hv20 = parseFloat(tokens[symIdx + 1]); // 20-day historical volatility in percent
    const dateCode = tokens[symIdx + 4]; // e.g. "251114" (yymmdd)
    const curIV = parseFloat(tokens[symIdx + 5]); // current IV in percent

    // Find close price (last numeric token in the line)
    let close = NaN;
    for (let i = tokens.length - 1; i > symIdx + 5; i--) {
      const maybeNum = parseFloat(tokens[i]);
      if (!isNaN(maybeNum)) {
        close = maybeNum;
        break;
      }
    }

    if (isNaN(curIV) || isNaN(close)) {
      continue; // Could not parse IV or close
    }

    // Convert dateCode yymmdd -> YYYY-MM-DD (UTC)
    if (!/^\d{6}$/.test(dateCode)) {
      continue; // Invalid date code format
    }

    const yy = parseInt(dateCode.slice(0, 2), 10);
    const mm = parseInt(dateCode.slice(2, 4), 10);
    const dd = parseInt(dateCode.slice(4, 6), 10);
    const year = 2000 + yy;

    // Create date in UTC
    const dateObj = new Date(Date.UTC(year, mm - 1, dd));
    const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD

    // Convert IV and HV from percent to decimal
    const ivDecimal = curIV / 100.0;
    const rv20Decimal = !isNaN(hv20) ? hv20 / 100.0 : null; // 20-day realized volatility

    snapshots.push({
      date: dateStr,
      ticker: tickerUpper,
      spot: close,
      iv30: ivDecimal,
      rv20: rv20Decimal,
      source: 'opt_strat',
    });
  }

  return snapshots;
}

/**
 * Fetches historical spot price from Yahoo Finance
 * Uses Yahoo Finance API (free, no API key required)
 * Returns spot price for a specific date, or null if not found
 * 
 * Note: Yahoo Finance may have rate limits, so use with reasonable delays between requests
 */
export async function fetchYahooFinanceSpot(
  ticker: string,
  date: string
): Promise<number | null> {
  try {
    // Yahoo Finance API endpoint for historical data
    // Format: https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?period1={startTimestamp}&period2={endTimestamp}&interval=1d
    const dateObj = new Date(date + 'T00:00:00Z');
    const startTimestamp = Math.floor(dateObj.getTime() / 1000) - 86400; // Start 1 day before to ensure we get the date
    const endTimestamp = Math.floor(dateObj.getTime() / 1000) + 86400; // End 1 day after
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeJournal/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Ticker not found
        return null;
      }
      console.warn(`Yahoo Finance HTTP ${response.status} for ${ticker} on ${date}`);
      return null;
    }

    const data = await response.json();
    
    // Check for errors in response
    if (data?.chart?.error) {
      console.warn(`Yahoo Finance error for ${ticker}:`, data.chart.error);
      return null;
    }
    
    // Extract close price from Yahoo Finance response
    if (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
      const closes = data.chart.result[0].indicators.quote[0].close;
      const timestamps = data.chart.result[0].timestamp;
      
      if (!timestamps || timestamps.length === 0) {
        return null;
      }
      
      // Find the timestamp that matches our date (or closest trading day)
      const targetTimestamp = Math.floor(dateObj.getTime() / 1000);
      let bestMatch: { index: number; diff: number } | null = null;
      
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const tsDate = new Date(ts * 1000).toISOString().split('T')[0];
        const diff = Math.abs(ts - targetTimestamp);
        
        // Exact match
        if (tsDate === date && closes[i] !== null && closes[i] !== undefined) {
          return closes[i];
        }
        
        // Track closest match (within 3 days)
        if (diff < 3 * 86400 && closes[i] !== null && closes[i] !== undefined) {
          if (!bestMatch || diff < bestMatch.diff) {
            bestMatch = { index: i, diff };
          }
        }
      }
      
      // Return closest match if found
      if (bestMatch) {
        return closes[bestMatch.index];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching Yahoo Finance spot for ${ticker} on ${date}:`, error);
    return null;
  }
}

/**
 * Backfills spot prices for tickers and date range using Yahoo Finance
 * Only updates records where spot is null or missing
 */
export async function backfillSpotPrices(
  tickers: string[],
  startDate: string,
  endDate: string
): Promise<{
  processed: number;
  updated: number;
  errors: Array<{ ticker: string; date: string; error: string }>;
}> {
  const errors: Array<{ ticker: string; date: string; error: string }> = [];
  let processed = 0;
  let updated = 0;

  // Generate all dates in range
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const current = new Date(start);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]!);
    current.setDate(current.getDate() + 1);
  }

  // For each ticker and date, fetch spot price and update if missing
  for (const ticker of tickers) {
    const normalizedTicker = ticker.trim().toUpperCase();
    
    for (const date of dates) {
      try {
        // Check if record exists and already has spot price
        const existing = await db
          .select({ id: underlyingsIvHistory.id, spot: underlyingsIvHistory.spot })
          .from(underlyingsIvHistory)
          .where(
            and(
              eq(underlyingsIvHistory.ticker, normalizedTicker),
              eq(underlyingsIvHistory.asOfDate, date)
            )
          )
          .limit(1);

        // Skip if already has spot price
        if (existing.length > 0 && existing[0].spot) {
          continue;
        }

        // Fetch spot price from Yahoo Finance
        const spot = await fetchYahooFinanceSpot(normalizedTicker, date);
        
        if (spot === null) {
          errors.push({
            ticker: normalizedTicker,
            date,
            error: 'Spot price not found',
          });
          continue;
        }

        // Round spot price to 2 decimal places
        const roundedSpot = Math.round(spot * 100) / 100;

        // Ensure underlying exists
        const underlyingId = await ensureUnderlyingId(normalizedTicker);

        if (existing.length > 0) {
          // Update existing record with spot price
          await db
            .update(underlyingsIvHistory)
            .set({
              spot: roundedSpot.toString(),
              updatedAt: new Date(),
            })
            .where(eq(underlyingsIvHistory.id, existing[0].id));
          updated++;
        } else {
          // Create new record with spot price (no IV data)
          const ivHistoryData: NewUnderlyingIvHistory = {
            underlyingId: underlyingId ?? undefined,
            ticker: normalizedTicker,
            asOfDate: date,
            spot: roundedSpot.toString(),
            iv30: null,
            rv20: null,
            source: 'yahoo_finance',
          };

          try {
            await db.insert(underlyingsIvHistory).values(ivHistoryData);
            updated++;
          } catch (insertError) {
            // Handle race condition - record might have been created between check and insert
            const existingAfter = await db
              .select({ id: underlyingsIvHistory.id })
              .from(underlyingsIvHistory)
              .where(
                and(
                  eq(underlyingsIvHistory.ticker, normalizedTicker),
                  eq(underlyingsIvHistory.asOfDate, date)
                )
              )
              .limit(1);

            if (existingAfter.length > 0) {
              // Round spot price to 2 decimal places (spot variable is still in scope)
              const roundedSpot = Math.round(spot * 100) / 100;
              await db
                .update(underlyingsIvHistory)
                .set({
                  spot: roundedSpot.toString(),
                  updatedAt: new Date(),
                })
                .where(eq(underlyingsIvHistory.id, existingAfter[0].id));
              updated++;
            } else {
              throw insertError;
            }
          }
        }

        processed++;
        
        // Rate limiting: small delay between requests to avoid overwhelming Yahoo Finance
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errors.push({
          ticker: normalizedTicker,
          date,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`Error backfilling spot for ${normalizedTicker} on ${date}:`, error);
      }
    }
  }

  return { processed, updated, errors };
}

/**
 * Gets list of tickers to update from underlyings table
 * Optionally filters to tickers that appear in recent positions
 */
export async function getTickersToUpdate(
  options?: {
    onlyRecent?: boolean; // Only tickers in positions from last N days
    recentDays?: number; // Default 90 days
  }
): Promise<string[]> {
  if (options?.onlyRecent) {
    const { positions } = await import('@/db/schema');
    const { sql, gte } = await import('drizzle-orm');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (options.recentDays || 90));
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // Get distinct tickers from recent positions via underlyingId
    const recentUnderlyings = await db
      .selectDistinct({ ticker: underlyings.ticker })
      .from(underlyings)
      .innerJoin(positions, eq(underlyings.id, positions.underlyingId))
      .where(
        sql`${positions.snapshotDate} >= ${cutoffDateStr} AND ${positions.quantity} != 0`
      );

    return recentUnderlyings.map((u) => u.ticker).filter(Boolean);
  } else {
    // Get all tickers from underlyings table
    const allUnderlyings = await db.select({ ticker: underlyings.ticker }).from(underlyings);
    return allUnderlyings.map((u) => u.ticker).filter(Boolean);
  }
}

