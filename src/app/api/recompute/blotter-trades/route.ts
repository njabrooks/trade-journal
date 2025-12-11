import { NextRequest, NextResponse } from 'next/server';
import {
  computeTradeBlotterEntriesForDate,
  computeTradeBlotterEntriesForDateRange,
} from '@/lib/derived/blotter';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, startDate, endDate, snapshotDate } = body;

    // Single date computation
    if (snapshotDate) {
      if (!accountId) {
        return NextResponse.json(
          { error: 'accountId is required for single date computation' },
          { status: 400 }
        );
      }

      const count = await computeTradeBlotterEntriesForDate(snapshotDate, accountId);

      return NextResponse.json({
        success: true,
        message: `Computed ${count} trade blotter entries for ${snapshotDate}`,
        count,
      });
    }

    // Date range computation
    if (startDate && endDate) {
      if (!accountId) {
        return NextResponse.json(
          { error: 'accountId is required for date range computation' },
          { status: 400 }
        );
      }

      const count = await computeTradeBlotterEntriesForDateRange(startDate, endDate, accountId);

      return NextResponse.json({
        success: true,
        message: `Computed ${count} trade blotter entries for date range ${startDate} to ${endDate}`,
        count,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid request. Provide either snapshotDate or (startDate and endDate)',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Trade blotter recompute error:', error);
    return NextResponse.json(
      {
        error: 'Recompute failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
