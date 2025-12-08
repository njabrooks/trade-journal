import { NextRequest, NextResponse } from 'next/server';
import {
  scrapeOptionStrategist,
  upsertIvSnapshots,
  getTickersToUpdate,
  backfillSpotPrices,
} from '@/lib/ingestion/underlyingsIvHistory';
import { db } from '@/db';
import { positions, underlyings } from '@/db/schema';
import { sql, and, isNotNull, gte, lte, eq, inArray } from 'drizzle-orm';

/**
 * Manual trigger endpoint for IV history ingestion and spot price backfilling
 * Can be called via UI or scheduled job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers, onlyRecent, recentDays, backfillSpot, startDate, endDate, accountId } = body;

    // Get tickers to update
    let tickersToUpdate: string[];

    if (Array.isArray(tickers) && tickers.length > 0) {
      // Use provided tickers
      tickersToUpdate = tickers.map((t: string) => t.trim().toUpperCase()).filter(Boolean);
    } else {
      // Get tickers from database
      tickersToUpdate = await getTickersToUpdate({
        onlyRecent: onlyRecent === true,
        recentDays: recentDays || 90,
      });
    }

    if (tickersToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tickers to update',
        summary: {
          tickersProcessed: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
        },
      });
    }

    // Handle spot price backfilling
    if (backfillSpot === true) {
      let backfillStartDate = startDate;
      let backfillEndDate = endDate;

      // If dates not provided, find date range from positions
      if (!backfillStartDate || !backfillEndDate) {
        // First get underlying IDs for the tickers
        const underlyingRows = await db
          .select({ id: underlyings.id })
          .from(underlyings)
          .where(inArray(underlyings.ticker, tickersToUpdate));
        
        const underlyingIds = underlyingRows.map((r) => r.id);

        const whereConditions = [
          isNotNull(positions.snapshotDate),
          sql`${positions.quantity} != 0`,
        ];

        if (underlyingIds.length > 0) {
          whereConditions.push(inArray(positions.underlyingId, underlyingIds));
        }

        if (accountId) {
          whereConditions.push(eq(positions.accountId, accountId));
        }

        const dateResults = await db
          .selectDistinct({ snapshotDate: positions.snapshotDate })
          .from(positions)
          .where(and(...whereConditions))
          .orderBy(positions.snapshotDate);

        if (dateResults.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No snapshot dates found for backfilling',
            summary: {
              tickersProcessed: tickersToUpdate.length,
              processed: 0,
              updated: 0,
            },
          });
        }

        const dates = dateResults.map((d) => d.snapshotDate).filter(Boolean) as string[];
        backfillStartDate = dates[0]!;
        backfillEndDate = dates[dates.length - 1]!;
      }

      // Backfill spot prices using Yahoo Finance
      const backfillResult = await backfillSpotPrices(
        tickersToUpdate,
        backfillStartDate,
        backfillEndDate
      );

      return NextResponse.json({
        success: true,
        message: `Backfilled spot prices for ${tickersToUpdate.length} tickers from ${backfillStartDate} to ${backfillEndDate}`,
        summary: {
          tickersProcessed: tickersToUpdate.length,
          dateRange: { start: backfillStartDate, end: backfillEndDate },
          processed: backfillResult.processed,
          updated: backfillResult.updated,
          errors: backfillResult.errors.length > 0 ? backfillResult.errors : undefined,
        },
      });
    }

    // Default: Scrape Option Strategist for IV data
    const snapshots = await scrapeOptionStrategist(tickersToUpdate);

    if (snapshots.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No IV data found for provided tickers',
        summary: {
          tickersProcessed: tickersToUpdate.length,
          inserted: 0,
          updated: 0,
          skipped: tickersToUpdate.length,
        },
      });
    }

    // Upsert snapshots
    const result = await upsertIvSnapshots(snapshots);

    return NextResponse.json({
      success: true,
      message: `Processed ${tickersToUpdate.length} tickers, inserted ${result.inserted}, updated ${result.updated}`,
      summary: {
        tickersProcessed: tickersToUpdate.length,
        tickersFound: snapshots.length,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    });
  } catch (error) {
    console.error('IV history ingestion error:', error);
    return NextResponse.json(
      {
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check status or list available tickers
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const onlyRecent = searchParams.get('onlyRecent') === 'true';
    const recentDays = parseInt(searchParams.get('recentDays') || '90', 10);

    const tickers = await getTickersToUpdate({
      onlyRecent,
      recentDays,
    });

    return NextResponse.json({
      success: true,
      tickers,
      count: tickers.length,
    });
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch tickers',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
