import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, strategyTemplates, underlyings, positions } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';

/**
 * GET /api/strategies/related?underlyingTicker=XXX&excludeId=YYY
 *
 * Returns strategies that share the same underlying ticker, excluding the specified strategy.
 * Used for merge candidate selection in the strategy confirmation dialog.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const underlyingTicker = searchParams.get('underlyingTicker');
    const excludeId = searchParams.get('excludeId');

    if (!underlyingTicker) {
      return NextResponse.json(
        { error: 'underlyingTicker is required' },
        { status: 400 }
      );
    }

    // Find all strategies with matching underlying ticker
    // Join through strategyTemplates → underlyings to get the ticker
    // Label comes from strategyTemplates.label or strategies.autoDerivedLabel as fallback
    const relatedStrategies = await db
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        label: sql<string | null>`COALESCE(${strategyTemplates.label}, ${strategies.autoDerivedLabel})`,
        status: strategies.status,
        // Count open positions for this strategy
        openPositionsCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${positions}
          WHERE ${positions.strategyId} = ${strategies.id}
          AND ${positions.isOpen} = true
        )`,
      })
      .from(strategies)
      .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
      .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
      .where(
        and(
          eq(sql`LOWER(${underlyings.ticker})`, underlyingTicker.toLowerCase()),
          excludeId ? ne(strategies.id, excludeId) : undefined
        )
      )
      .orderBy(strategies.openedAt);

    return NextResponse.json(relatedStrategies);
  } catch (error) {
    console.error('Error fetching related strategies:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch related strategies',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
