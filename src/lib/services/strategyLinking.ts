import { db } from '@/db';
import { positions, trades, strategies } from '@/db/schema';
import { eq, and, isNull, sql, isNotNull } from 'drizzle-orm';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
// REMOVED: blotter imports - blotter system deprecated, replaced by journal

/**
 * Links positions to strategies by strategy_key
 * Updates positions that have a matching strategy_key in their symbol or other fields
 * For now, we'll link based on strategy_key matching in positions data
 */
export async function linkPositionsToStrategies(
  accountId?: string,
  strategyKey?: string
): Promise<{ linked: number; skipped: number }> {
  // Get all strategies
  const strategyConditions = [];
  if (accountId) {
    strategyConditions.push(eq(strategies.accountId, accountId));
  }
  if (strategyKey) {
    strategyConditions.push(eq(strategies.strategyKey, strategyKey));
  }

  const allStrategies = await db
    .select()
    .from(strategies)
    .where(strategyConditions.length > 0 ? and(...strategyConditions) : undefined);

  let linked = 0;
  let skipped = 0;

  for (const strategy of allStrategies) {
    // Find positions that should be linked to this strategy
    // This is a simplified approach - in practice, you might need more sophisticated matching
    // For now, we'll link positions that don't have a strategy_id yet
    // and could be matched by other criteria (e.g., symbol patterns, time windows, etc.)

    // In a real implementation, you'd match based on:
    // - Symbol patterns
    // - Time windows (positions opened around strategy.opened_at)
    // - Account matching
    // - Manual tagging in the data

    // For v0.1, we'll provide a simple function that can be extended
    const positionConditions = [
      isNull(positions.strategyId),
      eq(positions.accountId, strategy.accountId!),
    ];

    const unlinkedPositions = await db
      .select()
      .from(positions)
      .where(and(...positionConditions))
      .limit(1000); // Batch processing

    // Update positions - in practice, you'd add more sophisticated matching logic here
    // For now, this is a placeholder that can be extended
    for (const position of unlinkedPositions) {
      // Simple heuristic: link if position was created around strategy opened_at
      // This is a basic example - extend as needed
      if (strategy.openedAt && position.openDate) {
        const strategyDate = new Date(strategy.openedAt);
        const positionDate = new Date(position.openDate);
        const daysDiff = Math.abs(
          (strategyDate.getTime() - positionDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Link if within 30 days (adjust as needed)
        if (daysDiff <= 30) {
          await db
            .update(positions)
            .set({ strategyId: strategy.id })
            .where(eq(positions.id, position.id));
          linked++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }
  }

  return { linked, skipped };
}

/**
 * Links trades to strategies by strategy_key or manual assignment
 */
export async function linkTradesToStrategies(
  accountId?: string,
  strategyId?: string
): Promise<{ linked: number; skipped: number }> {
  const tradeConditions = [isNull(trades.strategyId)];
  if (accountId) {
    tradeConditions.push(eq(trades.accountId, accountId));
  }

  const unlinkedTrades = await db
    .select()
    .from(trades)
    .where(and(...tradeConditions))
    .limit(1000);

  if (strategyId) {
    // Link specific trades to a specific strategy
    // In practice, you'd match based on symbol, date ranges, etc.
    const strategy = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (strategy.length === 0) {
      return { linked: 0, skipped: unlinkedTrades.length };
    }

    let linked = 0;
    let skipped = 0;

    for (const trade of unlinkedTrades) {
      // Simple heuristic: link if trade date is around strategy opened_at
      if (strategy[0].openedAt) {
        const strategyDate = new Date(strategy[0].openedAt);
        const tradeDate = new Date(trade.tradeDate);
        const daysDiff = Math.abs(
          (strategyDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 30) {
          await db
            .update(trades)
            .set({ strategyId: strategy[0].id })
            .where(eq(trades.id, trade.id));
          linked++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    return { linked, skipped };
  }

  // Link all unlinked trades to strategies based on heuristics
  const allStrategies = await db
    .select()
    .from(strategies)
    .where(accountId ? eq(strategies.accountId, accountId) : undefined);

  let totalLinked = 0;
  let totalSkipped = 0;

  for (const strategy of allStrategies) {
    const result = await linkTradesToStrategies(accountId, strategy.id);
    totalLinked += result.linked;
    totalSkipped += result.skipped;
  }

  return { linked: totalLinked, skipped: totalSkipped };
}

/**
 * Manually links a position to a strategy
 * Auto-triggers recompute for affected strategy and snapshot dates
 */
export async function linkPositionToStrategy(
  positionId: string,
  strategyId: string
): Promise<void> {
  // Get position to find accountId and snapshot dates
  const position = await db
    .select({
      accountId: positions.accountId,
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  if (position.length === 0) {
    throw new Error('Position not found');
  }

  const accountId = position[0].accountId;
  if (!accountId) {
    throw new Error('Position missing accountId');
  }

  // Update position
  await db
    .update(positions)
    .set({ strategyId })
    .where(eq(positions.id, positionId));

  // Auto-trigger recompute: Find all snapshot dates where this position exists
  const snapshotDates = await db
    .selectDistinct({ snapshotDate: positions.snapshotDate })
    .from(positions)
    .where(
      and(
        eq(positions.id, positionId),
        isNotNull(positions.snapshotDate),
        sql`${positions.quantity} != 0`
      )
    );

  // REMOVED: Trade blotter recompute - blotter system deprecated, replaced by journal

  // Recompute strategy metrics for affected dates
  for (const { snapshotDate } of snapshotDates) {
    if (!snapshotDate) continue;
    
    try {
      await computeStrategyMetricsForDateRange(
        accountId,
        strategyId,
        snapshotDate,
        snapshotDate
      );
    } catch (error) {
      console.error(
        `Failed to auto-recompute after linking position ${positionId} to strategy ${strategyId} on ${snapshotDate}:`,
        error
      );
      // Continue with other dates even if one fails
    }
  }
}

/**
 * Manually links a trade to a strategy
 * Auto-triggers recompute for affected strategy
 * Note: Trades don't have snapshot dates, so we recompute for the trade date and nearby dates
 */
export async function linkTradeToStrategy(tradeId: string, strategyId: string): Promise<void> {
  // Get trade to find accountId and trade date
  const trade = await db
    .select({
      accountId: trades.accountId,
      tradeDate: trades.tradeDate,
    })
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);

  if (trade.length === 0) {
    throw new Error('Trade not found');
  }

  const accountId = trade[0].accountId;
  if (!accountId) {
    throw new Error('Trade missing accountId');
  }

  // Update trade
  await db
    .update(trades)
    .set({ strategyId })
    .where(eq(trades.id, tradeId));

  // Auto-trigger recompute: Find snapshot dates where strategy has positions around trade date
  // Use trade date as snapshot date (trades typically align with position snapshots)
  const tradeDate = trade[0].tradeDate;
  if (tradeDate) {
    const snapshotDate = new Date(tradeDate).toISOString().split('T')[0];

    try {
      // REMOVED: computeTradeBlotterEntriesForDate - blotter system deprecated, replaced by journal

      // Recompute strategy metrics for this date
      await computeStrategyMetricsForDateRange(
        accountId,
        strategyId,
        snapshotDate,
        snapshotDate
      );
    } catch (error) {
      console.error(
        `Failed to auto-recompute after linking trade ${tradeId} to strategy ${strategyId} on ${snapshotDate}:`,
        error
      );
    }
  }
}

