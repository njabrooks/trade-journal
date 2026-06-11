import { NextRequest, NextResponse } from 'next/server';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computePortfolioSnapshotsForDateRange } from '@/lib/derived/portfolio';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '@/lib/derived/strategyAuto';
// REMOVED: blotter imports - blotter system deprecated, replaced by journal
import { db } from '@/db';
import { positions, ingestionRuns } from '@/db/schema';
import { recomputeStrategyStatus } from '@/lib/services/strategies';
import { and, eq, ne, isNotNull, gte, lte, sql, desc, inArray, gt } from 'drizzle-orm';
import { trackProcess } from '@/lib/services/processTracking';

// Ingestion job types that produce new data requiring recompute
const INGESTION_JOB_TYPES = [
  'trade_ingestion',
  'position_ingestion',
  'flex_trades',
  'flex_positions',
  'flex_nav',
  'flex_mtm',
  'massive_iv',
];

/**
 * Check if recompute is needed by comparing last successful recompute
 * with last successful ingestion.
 *
 * Returns: { needed: boolean, reason: string, lastRecompute?: Date, lastIngestion?: Date }
 */
async function checkRecomputeNeeded(accountId?: string): Promise<{
  needed: boolean;
  reason: string;
  lastRecompute?: Date;
  lastIngestion?: Date;
}> {
  // Find last successful recompute_all run
  const lastRecomputeQuery = db
    .select({ finishedAt: ingestionRuns.finishedAt })
    .from(ingestionRuns)
    .where(
      and(
        eq(ingestionRuns.jobType, 'recompute_all'),
        eq(ingestionRuns.status, 'completed'),
        isNotNull(ingestionRuns.finishedAt),
        accountId ? eq(ingestionRuns.accountId, accountId) : sql`true`
      )
    )
    .orderBy(desc(ingestionRuns.finishedAt))
    .limit(1);

  const [lastRecompute] = await lastRecomputeQuery;

  // If no previous recompute, definitely need one
  if (!lastRecompute?.finishedAt) {
    return { needed: true, reason: 'No previous recompute found' };
  }

  // Find any successful ingestion since last recompute
  const newIngestionQuery = db
    .select({ id: ingestionRuns.id, jobType: ingestionRuns.jobType, finishedAt: ingestionRuns.finishedAt })
    .from(ingestionRuns)
    .where(
      and(
        inArray(ingestionRuns.jobType, INGESTION_JOB_TYPES),
        eq(ingestionRuns.status, 'completed'),
        isNotNull(ingestionRuns.finishedAt),
        gt(ingestionRuns.finishedAt, lastRecompute.finishedAt),
        accountId ? eq(ingestionRuns.accountId, accountId) : sql`true`
      )
    )
    .orderBy(desc(ingestionRuns.finishedAt))
    .limit(1);

  const [lastIngestion] = await newIngestionQuery;

  if (lastIngestion?.finishedAt) {
    return {
      needed: true,
      reason: `New ${lastIngestion.jobType} since last recompute`,
      lastRecompute: lastRecompute.finishedAt,
      lastIngestion: lastIngestion.finishedAt,
    };
  }

  return {
    needed: false,
    reason: 'No new ingestions since last recompute',
    lastRecompute: lastRecompute.finishedAt,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, startDate, endDate, snapshotDate, includeUnderlyings, force } = body;

    // Gating check: skip if no new data (unless force=true)
    if (!force) {
      const gateCheck = await checkRecomputeNeeded(accountId);
      if (!gateCheck.needed) {
        return NextResponse.json({
          skipped: true,
          reason: gateCheck.reason,
          lastRecompute: gateCheck.lastRecompute,
          message: 'No new data to process. Use force=true to override.',
        });
      }
    }

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
          .select({ id: strategies.id, status: strategies.status })
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

        // Recompute strategy statuses (detects active→complete transitions)
        let statusUpdates = 0;
        for (const strategy of accountStrategies) {
          const newStatus = await recomputeStrategyStatus(strategy.id);
          if (newStatus !== strategy.status) {
            await db
              .update(strategies)
              .set({ status: newStatus, updatedAt: new Date() })
              .where(eq(strategies.id, strategy.id));
            statusUpdates++;
          }
        }
        if (statusUpdates > 0) {
          (results as any).strategyStatusUpdates = statusUpdates;
        }
      } catch (error) {
        results.strategyMetrics = { error: error instanceof Error ? error.message : 'Failed' };
      }

          // REMOVED: Trade blotter entries - blotter system deprecated, replaced by journal

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
        // REMOVED: blotter - deprecated, replaced by journal
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
        // Exclude merged/rejected strategies - they're no longer active
        const accountStrategies = await db
          .select({ id: strategies.id, status: strategies.status })
          .from(strategies)
          .where(
            and(
              eq(strategies.accountId, accountId),
              ne(strategies.status, 'rejected'),
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

        // Recompute strategy statuses (detects active→complete transitions)
        let statusUpdates = 0;
        for (const strategy of accountStrategies) {
          const newStatus = await recomputeStrategyStatus(strategy.id);
          if (newStatus !== strategy.status) {
            await db
              .update(strategies)
              .set({ status: newStatus, updatedAt: new Date() })
              .where(eq(strategies.id, strategy.id));
            statusUpdates++;
          }
        }
        if (statusUpdates > 0) {
          (results as any).strategyStatusUpdates = statusUpdates;
        }
      } catch (error) {
        results.strategyMetrics = { error: error instanceof Error ? error.message : 'Failed' };
      }

          // REMOVED: Trade blotter entries - blotter system deprecated, replaced by journal

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
