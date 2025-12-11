import { NextRequest, NextResponse } from 'next/server';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computePortfolioSnapshotsForDateRange } from '@/lib/derived/portfolio';
import { computeTriageForDate, deleteTriageRecordsForDateRange } from '@/lib/derived/triage';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '@/lib/derived/strategyAuto';
import { computeTradeBlotterEntriesForDate, computeTradeBlotterEntriesForDateRange } from '@/lib/derived/blotter';
import { db } from '@/db';
import { positions } from '@/db/schema';
import { and, eq, ne, isNotNull, gte, lte, sql } from 'drizzle-orm';
import { trackProcess } from '@/lib/services/processTracking';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, startDate, endDate, snapshotDate, includeUnderlyings } = body;

    // Track the recompute process
    return await trackProcess(
      'recompute_all',
      'api',
      { accountId, startDate, endDate, snapshotDate, includeUnderlyings },
      async () => {
    // Single date computation
    if (snapshotDate) {
      if (!accountId) {
            return {
              error: 'accountId is required for single date computation',
            };
      }

      const results: any = {};

      // Auto-link strategies
      try {
        const tradeStats = await autoLinkTradesToStrategies(accountId, { snapshotDate });
        const positionStats = await autoLinkPositionsToStrategies(accountId, { snapshotDate });
        results.autoStrategies = {
          strategiesCreated: positionStats.strategiesCreated + tradeStats.strategiesCreated,
          positionsLinked: positionStats.positionsLinked,
          tradesLinked: tradeStats.tradesLinked,
          skipped: positionStats.skipped + tradeStats.skipped,
        };
      } catch (error) {
        results.autoStrategies = { error: error instanceof Error ? error.message : 'Failed' };
      }

      // Portfolio snapshots
      try {
        const portfolioCounts = await computePortfolioSnapshotsForDateRange(
          accountId,
          snapshotDate,
          snapshotDate,
          includeUnderlyings === true,
          false
        );
        results.portfolio = portfolioCounts;
      } catch (error) {
        results.portfolio = { error: error instanceof Error ? error.message : 'Failed' };
      }

      // Strategy metrics (get all strategies for account)
      try {
        const { strategies } = await import('@/db/schema');
        const accountStrategies = await db
          .select({ id: strategies.id })
          .from(strategies)
          .where(eq(strategies.accountId, accountId));

        let strategyMetricsCount = 0;
        for (const strategy of accountStrategies) {
          const count = await computeStrategyMetricsForDateRange(
            accountId,
            strategy.id,
            snapshotDate,
            snapshotDate
          );
          strategyMetricsCount += count;
        }
        results.strategyMetrics = { count: strategyMetricsCount };
      } catch (error) {
        results.strategyMetrics = { error: error instanceof Error ? error.message : 'Failed' };
      }

      // Triage
      // Clean all triage records for this date first to ensure stale records are removed
      try {
        const triageCounts = await computeTriageForDate(snapshotDate, accountId, undefined, true);
        results.triage = triageCounts;
      } catch (error) {
        results.triage = { error: error instanceof Error ? error.message : 'Failed' };
      }

          // Trade blotter entries
          try {
            const blotterCount = await computeTradeBlotterEntriesForDate(snapshotDate, accountId);
            results.blotter = { count: blotterCount };
          } catch (error) {
            results.blotter = { error: error instanceof Error ? error.message : 'Failed' };
          }

          return {
        success: true,
        message: 'All derived data computed for snapshot date',
        snapshotDate,
        results,
          };
    }

    // Date range computation
    if (startDate && endDate) {
      if (!accountId) {
            return {
              error: 'accountId is required for date range computation',
            };
      }

      // Get all unique snapshot dates in range
      const dateResults = await db
        .selectDistinct({ snapshotDate: positions.snapshotDate })
        .from(positions)
        .where(
          and(
            eq(positions.accountId, accountId),
            isNotNull(positions.snapshotDate),
            gte(positions.snapshotDate, startDate),
            lte(positions.snapshotDate, endDate),
            sql`${positions.quantity} != 0`
          )
        );

      const dates = dateResults.map((d) => d.snapshotDate).filter(Boolean) as string[];

      const results: any = {
        datesProcessed: dates.length,
        portfolio: { account: 0, underlying: 0 },
        strategyMetrics: { count: 0 },
            triage: { position: 0, strategy: 0, quantityChange: 0 },
            blotter: { count: 0 },
      };

      // Auto-link strategies across range
      try {
        const tradeStats = await autoLinkTradesToStrategies(accountId, { startDate, endDate });
        const positionStats = await autoLinkPositionsToStrategies(accountId, { startDate, endDate });
        results.autoStrategies = {
          strategiesCreated: positionStats.strategiesCreated + tradeStats.strategiesCreated,
          positionsLinked: positionStats.positionsLinked,
          tradesLinked: tradeStats.tradesLinked,
          skipped: positionStats.skipped + tradeStats.skipped,
        };
      } catch (error) {
        results.autoStrategies = { error: error instanceof Error ? error.message : 'Failed' };
      }

      // Portfolio snapshots
      try {
        const portfolioCounts = await computePortfolioSnapshotsForDateRange(
          accountId,
          startDate,
          endDate,
          includeUnderlyings === true,
          true // only latest for underlyings
        );
        results.portfolio = portfolioCounts;
      } catch (error) {
        results.portfolio = { error: error instanceof Error ? error.message : 'Failed' };
      }

      // Strategy metrics
      try {
        const { strategies } = await import('@/db/schema');
        // Exclude merged strategies - they're no longer active
        const accountStrategies = await db
          .select({ id: strategies.id })
          .from(strategies)
          .where(
            and(
              eq(strategies.accountId, accountId),
              ne(strategies.status, 'merged')
            )
          );

        let totalCount = 0;
        for (const strategy of accountStrategies) {
          const count = await computeStrategyMetricsForDateRange(
            accountId,
            strategy.id,
            startDate,
            endDate
          );
          totalCount += count;
        }
        results.strategyMetrics.count = totalCount;
      } catch (error) {
        results.strategyMetrics = { error: error instanceof Error ? error.message : 'Failed' };
      }

      // Triage (process each date)
      // Clean all triage records for the date range first to ensure stale records are removed
      try {
        await deleteTriageRecordsForDateRange(startDate, endDate, accountId);
        
        let totalPosition = 0;
        let totalStrategy = 0;
        let totalQuantityChange = 0;
        for (const date of dates) {
          const counts = await computeTriageForDate(date, accountId);
          totalPosition += counts.position;
          totalStrategy += counts.strategy;
          totalQuantityChange += counts.quantityChange;
        }
        results.triage = { position: totalPosition, strategy: totalStrategy, quantityChange: totalQuantityChange };
      } catch (error) {
        results.triage = { error: error instanceof Error ? error.message : 'Failed' };
      }

          // Trade blotter entries (process date range)
          try {
            const blotterCount = await computeTradeBlotterEntriesForDateRange(startDate, endDate, accountId);
            results.blotter = { count: blotterCount };
          } catch (error) {
            results.blotter = { error: error instanceof Error ? error.message : 'Failed' };
          }

          return {
        success: true,
        message: `Computed all derived data for ${dates.length} snapshot dates`,
        dateRange: { startDate, endDate },
        results,
          };
    }

        return {
        error: 'Invalid request. Provide either snapshotDate or (startDate and endDate)',
        };
      }
    ).then((result) => {
      if ('error' in result) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result);
    });
  } catch (error) {
    console.error('Batch recompute error:', error);
    return NextResponse.json(
      {
        error: 'Batch recompute failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
