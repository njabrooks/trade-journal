/**
 * Service for computing and updating state codes for strategies
 */

import { db } from '@/db';
import { strategies, strategyMetricsSnapshots, positions } from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { computeStateCode } from '@/lib/derived/stateCode';
import { computeStrategyMetrics, upsertStrategyMetrics } from '@/lib/derived/strategyMetrics';

/**
 * Computes and updates state code for a strategy on all snapshot dates where it has positions
 * This is called after a strategy is confirmed with a strategyType to backfill historical state codes
 */
export async function recomputeStateCodeForStrategy(strategyId: string): Promise<void> {
  // Get strategy to check if it has a strategyType
  const strategyRow = await db
    .select({
      id: strategies.id,
      accountId: strategies.accountId,
      strategyType: strategies.strategyType,
    })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (!strategyRow[0] || !strategyRow[0].strategyType || !strategyRow[0].accountId) {
    return; // No strategyType, can't compute state code
  }

  // Get ALL snapshot dates for this strategy (not just latest) to backfill historical state codes
  const snapshotDatesResult = await db
    .selectDistinct({
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyId, strategyId),
        eq(positions.accountId, strategyRow[0].accountId),
        sql`${positions.quantity} != 0`,
        sql`${positions.snapshotDate} IS NOT NULL`
      )
    )
    .orderBy(positions.snapshotDate);

  if (snapshotDatesResult.length === 0) {
    return; // No positions yet, can't compute state code
  }

  // Recompute strategy metrics (which includes state code computation) for all snapshot dates
  // This ensures historical state codes are backfilled after confirmation
  for (const { snapshotDate } of snapshotDatesResult) {
    if (!snapshotDate) continue;
    
    try {
      const metrics = await computeStrategyMetrics({
        accountId: strategyRow[0].accountId,
        strategyId,
        snapshotDate,
      });

      // Upsert the metrics (which will update the state code)
      await upsertStrategyMetrics(metrics);
    } catch (error) {
      console.error(`Failed to compute state code for strategy ${strategyId} on ${snapshotDate}:`, error);
      // Continue with other dates even if one fails
    }
  }
}

/**
 * Computes and updates state codes for multiple strategies
 */
export async function recomputeStateCodesForStrategies(strategyIds: string[]): Promise<void> {
  for (const strategyId of strategyIds) {
    try {
      await recomputeStateCodeForStrategy(strategyId);
    } catch (error) {
      console.error(`Failed to recompute state code for strategy ${strategyId}:`, error);
      // Continue with other strategies even if one fails
    }
  }
}

