/**
 * IBKR Data Sync API
 * 
 * On-demand data fetching:
 * 1. Checks gateway authentication
 * 2. Detects missing data in database
 * 3. Fetches missing days (1 day or multiple days)
 * 4. Updates database
 * 
 * Called when user opens the app
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyGateway } from '@/lib/services/ibkr';
import { findMissingDataRanges, getMissingDataSummary } from '@/lib/services/ibkr/missing-data';
import { getHistoricalSpotsForDates } from '@/lib/services/ibkr/historical-spot';
import { upsertIvSnapshots } from '@/lib/ingestion/underlyingsIvHistory';
import type { RawIvSnapshot } from '@/lib/ingestion/underlyingsIvHistory';

export async function GET(request: NextRequest) {
  try {
    // Check gateway authentication
    const isAuthenticated = await verifyGateway();
    
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          authenticated: false,
          message: 'Gateway not authenticated. Please log in at https://localhost:5001',
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    // Get missing IBKR data summary (checks where IBKR is missing, even if other sources have data)
    const summary = await getMissingDataSummary('ibkr');

    return NextResponse.json({
      authenticated: true,
      summary,
      message: summary.totalMissingDays > 0
        ? `Missing ${summary.totalMissingDays} days of IBKR spot data for ${summary.tickersWithMissingData} tickers (IBKR spot prioritized over other sources)`
        : 'All IBKR spot data is up to date',
    });
  } catch (error) {
    console.error('Error checking IBKR sync status:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        authenticated: false,
        requiresAuth: true,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check gateway authentication
    const isAuthenticated = await verifyGateway();
    
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          authenticated: false,
          message: 'Gateway not authenticated. Please log in at https://localhost:5001',
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    // Find missing data ranges
    const missingRanges = await findMissingDataRanges('ibkr', 90); // Max 90 days back

    if (missingRanges.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All data is up to date',
        fetched: 0,
        inserted: 0,
        updated: 0,
      });
    }

    console.log(`Found ${missingRanges.length} missing data ranges across ${new Set(missingRanges.map(r => r.ticker)).size} tickers`);

    // IBKR historical endpoint provides historical spot prices
    // We fetch spot data only (no IV) - IV comes from Massive
    // Group by ticker and collect all dates that need spot data
    const tickerToDates = new Map<string, Set<string>>();
    const tickerToConid = new Map<string, number>();
    
    for (const range of missingRanges) {
      const ticker = range.ticker;
      if (!tickerToDates.has(ticker)) {
        tickerToDates.set(ticker, new Set());
      }
      
      // Generate all dates in the range
      const startDate = new Date(range.startDate + 'T00:00:00Z');
      const endDate = new Date(range.endDate + 'T00:00:00Z');
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0]!;
        tickerToDates.get(ticker)!.add(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Store CONID if available
      if (range.conid) {
        tickerToConid.set(ticker, range.conid);
      }
    }

    if (tickerToDates.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'All tickers have IBKR spot data',
        fetched: 0,
        inserted: 0,
        updated: 0,
      });
    }

    // Fetch historical spot data for each ticker
    let totalFetched = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    const errors: Array<{ date: string; ticker: string; error: string }> = [];
    const snapshots: RawIvSnapshot[] = [];
    
    // Get CONIDs for tickers that don't have them yet
    const { getConidsBatch } = await import('@/lib/services/ibkr/contracts');
    const { db } = await import('@/db');
    const { underlyings } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    
    const tickersWithoutConid = Array.from(tickerToDates.keys()).filter(t => !tickerToConid.has(t));
    
    if (tickersWithoutConid.length > 0) {
      console.log(`Looking up CONIDs for ${tickersWithoutConid.length} tickers: ${tickersWithoutConid.join(', ')}`);
      const foundConids = await getConidsBatch(tickersWithoutConid);
      
      // Update underlying records with CONIDs found via API
      for (const [ticker, conid] of foundConids.entries()) {
        tickerToConid.set(ticker, conid);
        console.log(`Found CONID for ${ticker}: ${conid}`);
        
        // Update the underlying record in the database
        try {
          await db
            .update(underlyings)
            .set({ conid, updatedAt: new Date() })
            .where(eq(underlyings.ticker, ticker.toUpperCase()));
          console.log(`Updated CONID for ${ticker} in underlyings table`);
        } catch (error) {
          console.warn(`Failed to update CONID for ${ticker}:`, error);
          // Continue even if update fails
        }
      }
    }

    for (const [ticker, dates] of tickerToDates.entries()) {
      const conid = tickerToConid.get(ticker);
      
      if (!conid) {
        // Skip if no CONID available
        console.warn(`No CONID found for ${ticker}, skipping ${dates.size} dates`);
        dates.forEach(date => {
          errors.push({
            date,
            ticker,
            error: 'CONID not found for ticker',
          });
        });
        continue;
      }

      try {
        // Fetch historical spot prices for all dates at once
        const dateArray = Array.from(dates).sort();
        console.log(`Fetching historical spot for ${ticker} (CONID: ${conid}) for ${dateArray.length} dates (${dateArray[0]} to ${dateArray[dateArray.length - 1]})`);
        const spotMap = await getHistoricalSpotsForDates(conid, dateArray);
        console.log(`Received ${spotMap.size} spot prices for ${ticker}`);
        
        // Create snapshots with spot data only (no IV)
        let tickerFetched = 0;
        for (const date of dateArray) {
          const spot = spotMap.get(date);
          if (spot !== null && spot !== undefined) {
            snapshots.push({
              date,
              ticker,
              spot: Math.round(spot * 100) / 100, // Round to 2 decimals
              iv30: null, // No IV from IBKR historical
              source: 'ibkr',
            });
            totalFetched++;
            tickerFetched++;
          } else {
            errors.push({
              date,
              ticker,
              error: 'Spot price not found in historical data',
            });
          }
        }
        console.log(`For ${ticker}: fetched ${tickerFetched} of ${dateArray.length} requested dates`);
      } catch (error) {
        console.error(`Error fetching historical spot for ${ticker}:`, error);
        dates.forEach(date => {
          errors.push({
            date,
            ticker,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }
    }

    // Upsert all snapshots to database
    if (snapshots.length > 0) {
      const result = await upsertIvSnapshots(snapshots);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      
      // Collect errors from upsert
      result.errors.forEach(err => {
        errors.push({
          date: err.ticker, // Note: RawIvSnapshot doesn't have date in error, using ticker as placeholder
          ticker: err.ticker,
          error: err.error,
        });
      });
    }

    const uniqueDates = new Set(snapshots.map(s => s.date));
    
    return NextResponse.json({
      success: true,
      message: `Fetched ${totalFetched} spot price records for ${uniqueDates.size} date(s)`,
      fetched: totalFetched,
      inserted: totalInserted,
      updated: totalUpdated,
      datesProcessed: uniqueDates.size,
      errors: errors.slice(0, 10), // Limit errors in response
      totalErrors: errors.length,
      note: 'IBKR provides historical spot prices only. IV data comes from Massive.',
    });
  } catch (error) {
    console.error('Error syncing IBKR data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

