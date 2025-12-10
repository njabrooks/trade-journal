import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positions, underlyings } from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { toNumber } from '@/lib/numbers';
import { navSnapshots } from '@/db/schema';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const positionId = searchParams.get('positionId');
    const strategyId = searchParams.get('strategyId');

    if (positionId) {
      // Fetch single position with underlying ticker and all required fields
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
          spot: positions.spot,
          absNotional: positions.absNotional,
          avgPrice: positions.avgPrice,
          multiplier: positions.multiplier,
          unrealizedPnl: positions.unrealizedPnl,
          accountId: positions.accountId,
        })
        .from(positions)
        .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
        .where(eq(positions.id, positionId))
        .limit(1);

      if (positionRows.length === 0) {
        return NextResponse.json({ error: 'Position not found' }, { status: 404 });
      }

      const position = positionRows[0];
      
      // Fetch NAV for snapshot date
      let nav = null;
      if (position.accountId && position.snapshotDate) {
        const navResult = await db
          .select({ total: navSnapshots.total })
          .from(navSnapshots)
          .where(
            and(
              eq(navSnapshots.accountId, position.accountId),
              eq(navSnapshots.reportDate, position.snapshotDate)
            )
          )
          .limit(1);
        nav = navResult[0]?.total ?? null;
      }

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
        spot: toNumber(position.spot),
        absNotional: toNumber(position.absNotional),
        avgPrice: toNumber(position.avgPrice),
        multiplier: toNumber(position.multiplier),
        unrealizedPnl: toNumber(position.unrealizedPnl),
        nav: nav ? Number(nav) : null,
      });
    }

    if (strategyId) {
      // Fetch latest snapshot date for strategy
      const latestSnapshotResult = await db
        .select({
          snapshotDate: positions.snapshotDate,
          accountId: positions.accountId,
        })
        .from(positions)
        .where(eq(positions.strategyId, strategyId))
        .orderBy(desc(positions.snapshotDate))
        .limit(1);

      const latestSnapshotDate = latestSnapshotResult[0]?.snapshotDate ?? null;
      const accountId = latestSnapshotResult[0]?.accountId ?? null;

      if (!latestSnapshotDate) {
        return NextResponse.json([]);
      }

      // Fetch all open positions for strategy with underlying ticker and all required fields
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
          spot: positions.spot,
          absNotional: positions.absNotional,
          avgPrice: positions.avgPrice,
          multiplier: positions.multiplier,
          unrealizedPnl: positions.unrealizedPnl,
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

      // Fetch NAV for snapshot date
      let nav = null;
      if (accountId && latestSnapshotDate) {
        const navResult = await db
          .select({ total: navSnapshots.total })
          .from(navSnapshots)
          .where(
            and(
              eq(navSnapshots.accountId, accountId),
              eq(navSnapshots.reportDate, latestSnapshotDate)
            )
          )
          .limit(1);
        nav = navResult[0]?.total ?? null;
      }

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
        spot: toNumber(row.spot),
        absNotional: toNumber(row.absNotional),
        avgPrice: toNumber(row.avgPrice),
        multiplier: toNumber(row.multiplier),
        unrealizedPnl: toNumber(row.unrealizedPnl),
        nav: nav ? Number(nav) : null,
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

