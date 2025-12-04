import { NextRequest, NextResponse } from 'next/server';
import {
  scrapeOptionStrategist,
  upsertIvSnapshots,
  getTickersToUpdate,
} from '@/lib/ingestion/underlyingsIvHistory';

/**
 * Manual trigger endpoint for IV history ingestion
 * Can be called via UI or scheduled job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers, onlyRecent, recentDays } = body;

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

    // Scrape Option Strategist
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
