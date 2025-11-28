/**
 * Service for computing and updating state codes for strategies
 */

import { db } from '@/db';
import { strategies, strategyMetricsSnapshots, positions } from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { computeStateCode } from '@/lib/derived/stateCode';
import { computeStrategyMetrics, upsertStrategyMetrics } from '@/lib/derived/strategyMetrics';

/**
 * Computes and updates state code for a strategy on the latest snapshot date
 * This is called after a strategy is confirmed with a strategyType
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

  // Get the latest snapshot date for this strategy
  const latestSnapshotResult = await db
    .select({
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyId, strategyId),
        eq(positions.accountId, strategyRow[0].accountId),
        sql`${positions.quantity} != 0`
      )
    )
    .orderBy(desc(positions.snapshotDate))
    .limit(1);

  const latestSnapshotDate = latestSnapshotResult[0]?.snapshotDate;
  if (!latestSnapshotDate) {
    return; // No positions yet, can't compute state code
  }

  // Recompute strategy metrics (which includes state code computation)
  const metrics = await computeStrategyMetrics({
    accountId: strategyRow[0].accountId,
    strategyId,
    snapshotDate: latestSnapshotDate,
  });

  // Upsert the metrics (which will update the state code)
  await upsertStrategyMetrics(metrics);
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

