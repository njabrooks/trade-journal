import { NextRequest, NextResponse } from 'next/server';
import {
  computeStrategyMetrics,
  upsertStrategyMetrics,
  computeStrategyMetricsForDateRange,
} from '@/lib/derived/strategyMetrics';
import { db } from '@/db';
import { strategies } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, strategyId, snapshotDate, startDate, endDate } = body;

    // Single date computation
    if (snapshotDate) {
      if (!accountId || !strategyId) {
        return NextResponse.json(
          { error: 'accountId and strategyId are required for single date computation' },
          { status: 400 }
        );
      }

      // Verify strategy exists
      const strategy = await db
        .select()
        .from(strategies)
        .where(eq(strategies.id, strategyId))
        .limit(1);

      if (strategy.length === 0) {
        return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
      }

      const metrics = await computeStrategyMetrics({
        accountId,
        strategyId,
        snapshotDate,
      });
      await upsertStrategyMetrics(metrics);

      return NextResponse.json({
        success: true,
        message: 'Strategy metrics computed and saved',
        metrics,
      });
    }

    // Date range computation
    if (startDate && endDate) {
      if (!accountId || !strategyId) {
        return NextResponse.json(
          { error: 'accountId and strategyId are required for date range computation' },
          { status: 400 }
        );
      }

      const count = await computeStrategyMetricsForDateRange(
        accountId,
        strategyId,
        startDate,
        endDate
      );

      return NextResponse.json({
        success: true,
        message: `Computed metrics for ${count} snapshot dates`,
        count,
      });
    }

    // Batch compute for all strategies (optional)
    if (body.all === true && accountId && startDate && endDate) {
      const allStrategies = await db
        .select({ id: strategies.id })
        .from(strategies)
        .where(eq(strategies.accountId, accountId));

      let totalCount = 0;
      for (const strategy of allStrategies) {
        const count = await computeStrategyMetricsForDateRange(
          accountId,
          strategy.id,
          startDate,
          endDate
        );
        totalCount += count;
      }

      return NextResponse.json({
        success: true,
        message: `Computed metrics for ${totalCount} strategy-date combinations`,
        count: totalCount,
        strategiesProcessed: allStrategies.length,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid request. Provide either snapshotDate or (startDate and endDate)',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Strategy metrics computation error:', error);
    return NextResponse.json(
      {
        error: 'Computation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

