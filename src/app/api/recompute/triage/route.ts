import { NextRequest, NextResponse } from 'next/server';
import { computeTriageForDate, computePositionTriageForDate, computeStrategyTriageForDate } from '@/lib/derived/triage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { snapshotDate, accountId, startDate, endDate } = body;

    // Single date computation
    if (snapshotDate) {
      const counts = await computeTriageForDate(snapshotDate, accountId);

      return NextResponse.json({
        success: true,
        message: `Computed ${counts.position} position-level and ${counts.strategy} strategy-level triage records`,
        counts,
      });
    }

    // Date range computation
    if (startDate && endDate) {
      // Get all unique snapshot dates in range from positions
      const { db } = await import('@/db');
      const { positions } = await import('@/db/schema');
      const { and, eq, sql, isNotNull, gte, lte } = await import('drizzle-orm');

      const whereConditions = [
        isNotNull(positions.snapshotDate),
        gte(positions.snapshotDate, startDate),
        lte(positions.snapshotDate, endDate),
        sql`${positions.quantity} != 0`,
      ];

      if (accountId) {
        whereConditions.push(eq(positions.accountId, accountId));
      }

      const dateResults = await db
        .selectDistinct({ snapshotDate: positions.snapshotDate })
        .from(positions)
        .where(and(...whereConditions));

      let totalPosition = 0;
      let totalStrategy = 0;

      for (const { snapshotDate } of dateResults) {
        if (!snapshotDate) continue;
        const counts = await computeTriageForDate(snapshotDate, accountId);
        totalPosition += counts.position;
        totalStrategy += counts.strategy;
      }

      return NextResponse.json({
        success: true,
        message: `Computed triage for ${dateResults.length} snapshot dates`,
        counts: {
          position: totalPosition,
          strategy: totalStrategy,
        },
        datesProcessed: dateResults.length,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid request. Provide either snapshotDate or (startDate and endDate)',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Triage computation error:', error);
    return NextResponse.json(
      {
        error: 'Computation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

