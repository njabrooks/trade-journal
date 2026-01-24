import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { strategies, strategyTemplates, underlyings, positions, accounts } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';

/**
 * GET /api/strategies/related?underlyingTicker=XXX&excludeId=YYY
 *
 * Returns strategies that share the same underlying ticker, excluding the specified strategy.
 * Used for merge candidate selection in the strategy confirmation dialog.
 *
 * Returns account information derived from positions (not strategy-level accountId)
 * since strategies can span multiple accounts after merges.
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
    // Account info is derived from positions (strategies can span multiple accounts)
    // Order by createdAt (oldest first) so merge defaults to preserving thesis links
    const relatedStrategies = await db
      .select({
        id: strategies.id,
        strategyKey: strategies.strategyKey,
        label: sql<string | null>`COALESCE(${strategyTemplates.label}, ${strategies.autoDerivedLabel})`,
        status: strategies.status,
        createdAt: strategies.createdAt,
        assetThesisId: strategies.assetThesisId,
        // Count open positions for this strategy
        openPositionsCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${positions}
          WHERE ${positions.strategyId} = ${strategies.id}
          AND ${positions.isOpen} = true
        )`,
        // Get all distinct broker account IDs from positions (strategy can span multiple accounts)
        accountIds: sql<string[]>`(
          SELECT COALESCE(array_agg(DISTINCT a.broker_account_id), ARRAY[]::text[])
          FROM ${positions} p
          JOIN ${accounts} a ON p.account_id = a.id
          WHERE p.strategy_id = ${strategies.id}
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
      .orderBy(strategies.createdAt);

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
