import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positions, underlyings } from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { toNumber } from '@/lib/numbers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const positionId = searchParams.get('positionId');
    const strategyId = searchParams.get('strategyId');

    if (positionId) {
      // Fetch single position with underlying ticker
      const positionRows = await db
        .select({
          id: positions.id,
          symbol: positions.symbol,
          assetClass: positions.assetClass,
          conid: positions.conid,
          expiry: positions.expiry,
          strike: positions.strike,
          optionRight: positions.optionRight,
          side: positions.side,
          quantity: positions.quantity,
          snapshotDate: positions.snapshotDate,
          underlyingTicker: underlyings.ticker,
        })
        .from(positions)
        .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
        .where(eq(positions.id, positionId))
        .limit(1);

      if (positionRows.length === 0) {
        return NextResponse.json({ error: 'Position not found' }, { status: 404 });
      }

      const position = positionRows[0];
      return NextResponse.json({
        id: position.id,
        symbol: position.symbol,
        assetClass: position.assetClass,
        conid: position.conid,
        expiry: position.expiry,
        strike: toNumber(position.strike),
        optionRight: position.optionRight,
        side: position.side,
        quantity: Number(position.quantity),
        snapshotDate: position.snapshotDate,
        underlyingTicker: position.underlyingTicker,
      });
    }

    if (strategyId) {
      // Fetch latest snapshot date for strategy
      const latestSnapshotResult = await db
        .select({
          snapshotDate: positions.snapshotDate,
        })
        .from(positions)
        .where(eq(positions.strategyId, strategyId))
        .orderBy(desc(positions.snapshotDate))
        .limit(1);

      const latestSnapshotDate = latestSnapshotResult[0]?.snapshotDate ?? null;

      if (!latestSnapshotDate) {
        return NextResponse.json([]);
      }

      // Fetch all open positions for strategy with underlying ticker
      const positionRows = await db
        .select({
          id: positions.id,
          symbol: positions.symbol,
          assetClass: positions.assetClass,
          conid: positions.conid,
          expiry: positions.expiry,
          strike: positions.strike,
          optionRight: positions.optionRight,
          side: positions.side,
          quantity: positions.quantity,
          snapshotDate: positions.snapshotDate,
          underlyingTicker: underlyings.ticker,
        })
        .from(positions)
        .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
        .where(
          and(
            eq(positions.strategyId, strategyId),
            eq(positions.snapshotDate, latestSnapshotDate),
            sql`${positions.quantity} != 0`
          )
        )
        .orderBy(desc(positions.symbol));

      const positionsList = positionRows.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        assetClass: row.assetClass,
        conid: row.conid,
        expiry: row.expiry,
        strike: toNumber(row.strike),
        optionRight: row.optionRight,
        side: row.side,
        quantity: Number(row.quantity),
        snapshotDate: row.snapshotDate,
        underlyingTicker: row.underlyingTicker,
      }));

      return NextResponse.json(positionsList);
    }

    return NextResponse.json(
      { error: 'Either positionId or strategyId must be provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch positions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

