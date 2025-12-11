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
        message: `Computed ${counts.position} position-level, ${counts.strategy} strategy-level, and ${counts.quantityChange} quantity change triage records`,
        counts,
      });
    }

    // Date range computation
    if (startDate && endDate) {
      // Get all unique snapshot dates in range from positions
      // Include dates where positions exist (quantity != 0) AND dates immediately after positions existed
      // (to catch expired positions that disappear from the positions table)
      const { db } = await import('@/db');
      const { positions } = await import('@/db/schema');
      const { and, eq, sql, isNotNull, gte, lte, or } = await import('drizzle-orm');

      // Get dates where positions exist (quantity != 0)
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

      // Also get dates immediately after positions existed (to catch expirations)
      // For each position, find its max date and add the next day (when it might expire)
      const positionMaxDatesQuery = accountId
        ? await db
            .select({
              conid: positions.conid,
              maxDate: sql<string>`MAX(${positions.snapshotDate})`.as('maxDate'),
            })
            .from(positions)
            .where(
              and(
                isNotNull(positions.snapshotDate),
                gte(positions.snapshotDate, startDate),
                lte(positions.snapshotDate, endDate),
                eq(positions.accountId, accountId)
              )
            )
            .groupBy(positions.conid)
        : await db
            .select({
              conid: positions.conid,
              maxDate: sql<string>`MAX(${positions.snapshotDate})`.as('maxDate'),
            })
            .from(positions)
            .where(
              and(
                isNotNull(positions.snapshotDate),
                gte(positions.snapshotDate, startDate),
                lte(positions.snapshotDate, endDate)
              )
            )
            .groupBy(positions.conid);

      // Add next day after each max date (positions might expire on the next day)
      const expirationDates = new Set<string>();
      for (const row of positionMaxDatesQuery) {
        if (row.maxDate) {
          const maxDate = typeof row.maxDate === 'string' ? row.maxDate : row.maxDate.toISOString().split('T')[0];
          const nextDay = new Date(maxDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const nextDayStr = nextDay.toISOString().split('T')[0];
          if (nextDayStr >= startDate && nextDayStr <= endDate) {
            expirationDates.add(nextDayStr);
          }
        }
      }

      // Combine both sets of dates
      const allDates = new Set<string>();
      dateResults.forEach((d) => {
        if (d.snapshotDate) allDates.add(d.snapshotDate);
      });
      expirationDates.forEach((d) => allDates.add(d));

      let totalPosition = 0;
      let totalStrategy = 0;
      let totalQuantityChange = 0;

      const sortedDates = Array.from(allDates).sort();

      for (const snapshotDate of sortedDates) {
        if (!snapshotDate) continue;
        const counts = await computeTriageForDate(snapshotDate, accountId);
        totalPosition += counts.position;
        totalStrategy += counts.strategy;
        totalQuantityChange += counts.quantityChange;
      }

      return NextResponse.json({
        success: true,
        message: `Computed triage for ${sortedDates.length} snapshot dates`,
        counts: {
          position: totalPosition,
          strategy: totalStrategy,
          quantityChange: totalQuantityChange,
        },
        datesProcessed: sortedDates.length,
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

