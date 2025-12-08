import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positions, strategies } from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

/**
 * Debug endpoint to check what the status logic finds for a strategy
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const strategyId = searchParams.get('strategyId');
    const strategyKey = searchParams.get('strategyKey');

    if (!strategyId && !strategyKey) {
      return NextResponse.json(
        { error: 'strategyId or strategyKey is required' },
        { status: 400 }
      );
    }

    // Find strategy
    let strategy;
    if (strategyId) {
      const result = await db
        .select()
        .from(strategies)
        .where(eq(strategies.id, strategyId))
        .limit(1);
      strategy = result[0] ?? null;
    } else {
      const result = await db
        .select()
        .from(strategies)
        .where(eq(strategies.strategyKey, strategyKey!))
        .limit(1);
      strategy = result[0] ?? null;
    }

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Get latest snapshot date
    const latestSnapshotResult = await db
      .select({
        snapshotDate: positions.snapshotDate,
      })
      .from(positions)
      .where(eq(positions.strategyId, strategy.id))
      .orderBy(desc(positions.snapshotDate))
      .limit(1);

    const latestSnapshotDate = latestSnapshotResult[0]?.snapshotDate ?? null;

    // Get all positions on latest snapshot
    const allPositionsOnLatest = latestSnapshotDate
      ? await db
          .select({
            id: positions.id,
            symbol: positions.symbol,
            quantity: positions.quantity,
            snapshotDate: positions.snapshotDate,
          })
          .from(positions)
          .where(
            and(
              eq(positions.strategyId, strategy.id),
              eq(positions.snapshotDate, latestSnapshotDate)
            )
          )
      : [];

    // Get open positions (quantity != 0) on latest snapshot
    const openPositionsOnLatest = latestSnapshotDate
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(positions)
          .where(
            and(
              eq(positions.strategyId, strategy.id),
              eq(positions.snapshotDate, latestSnapshotDate),
              sql`${positions.quantity} != 0`
            )
          )
          .limit(1)
      : [];

    const openPositionCount = Number(openPositionsOnLatest[0]?.count ?? 0);

    // Determine expected status
    let expectedStatus: 'open' | 'closed' | 'draft';
    if (latestSnapshotDate) {
      expectedStatus = openPositionCount > 0 ? 'open' : 'closed';
    } else {
      expectedStatus = 'draft';
    }

    return NextResponse.json({
      strategy: {
        id: strategy.id,
        strategyKey: strategy.strategyKey,
        currentStatus: strategy.status,
        expectedStatus,
        statusMatches: strategy.status === expectedStatus,
      },
      latestSnapshotDate,
      positionsOnLatestSnapshot: {
        total: allPositionsOnLatest.length,
        withQuantityZero: allPositionsOnLatest.filter((p) => Number(p.quantity) === 0).length,
        withQuantityNonZero: openPositionCount,
        details: allPositionsOnLatest.map((p) => ({
          symbol: p.symbol,
          quantity: Number(p.quantity),
        })),
      },
    });
  } catch (error) {
    console.error('Debug strategy status error:', error);
    return NextResponse.json(
      {
        error: 'Failed to debug strategy status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

