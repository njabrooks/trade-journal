import { NextRequest, NextResponse } from 'next/server';
import {
  computePortfolioSnapshot,
  upsertPortfolioSnapshot,
  computePortfolioSnapshotsForDateRange,
} from '@/lib/derived/portfolio';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, snapshotDate, startDate, endDate, level, underlyingId, includeUnderlyings } =
      body;

    // Single snapshot computation
    if (snapshotDate) {
      if (!accountId) {
        return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
      }

      const snapshotLevel = level || 'account';
      if (snapshotLevel === 'underlying' && !underlyingId) {
        return NextResponse.json(
          { error: 'underlyingId is required for underlying-level snapshots' },
          { status: 400 }
        );
      }

      const snapshot = await computePortfolioSnapshot({
        accountId,
        snapshotDate,
        level: snapshotLevel,
        underlyingId,
      });
      await upsertPortfolioSnapshot(snapshot);

      return NextResponse.json({
        success: true,
        message: 'Portfolio snapshot computed and saved',
        snapshot,
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

      const counts = await computePortfolioSnapshotsForDateRange(
        accountId,
        startDate,
        endDate,
        includeUnderlyings === true,
        true // only latest for underlyings by default
      );

      return NextResponse.json({
        success: true,
        message: `Computed ${counts.account} account-level and ${counts.underlying} underlying-level snapshots`,
        counts,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid request. Provide either snapshotDate or (startDate and endDate)',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Portfolio snapshot computation error:', error);
    return NextResponse.json(
      {
        error: 'Computation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

