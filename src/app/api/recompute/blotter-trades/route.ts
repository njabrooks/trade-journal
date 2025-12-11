import { NextRequest, NextResponse } from 'next/server';
import {
  computeTradeBlotterEntriesForDate,
  computeTradeBlotterEntriesForDateRange,
  backfillTriageActionMatching,
  backfillUnmatchedTradeEntries,
} from '@/lib/derived/blotter';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, startDate, endDate, snapshotDate, backfill } = body;

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

    // Backfill mode: fix existing triage actions missing ticker/conid and link them
    if (backfill) {
      const result = await backfillTriageActionMatching(accountId || undefined);

      // Also fix blotter entries pointing to merged strategies
      const { fixMergedStrategyBlotterEntries } = await import('@/lib/derived/blotter');
      const mergedFixResult = await fixMergedStrategyBlotterEntries(accountId || undefined);

      // Also backfill unmatched trade entries (find trades that should link to QUANTITY_CHANGE records)
      const tradeBackfillResult = await backfillUnmatchedTradeEntries(accountId || undefined);

      return NextResponse.json({
        success: true,
        message: `Backfilled ${result.updated} triage actions, linked ${result.linked} to trade entries. Fixed ${mergedFixResult.updated} blotter entries pointing to merged strategies. Matched ${tradeBackfillResult.linked} unmatched trade entries.`,
        ...result,
        mergedStrategyFix: mergedFixResult,
        tradeBackfill: tradeBackfillResult,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid request. Provide either snapshotDate, (startDate and endDate), or backfill=true',
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
