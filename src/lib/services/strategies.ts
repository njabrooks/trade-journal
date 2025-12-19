import { db } from '@/db';
import {
  strategies,
  strategyTemplates,
  underlyings,
  accounts,
  positions,
  trades,
  strategyMetricsSnapshots,
  triageRecords,
  blotterActions,
  underlyingsIvHistory,
  NewStrategy,
  NewStrategyTemplate,
} from '@/db/schema';
import { eq, and, sql, inArray, isNotNull, desc, gte, lte, or } from 'drizzle-orm';
import { toNumber } from '@/lib/utils';
import { computeStrategyMetricsForDateRange } from '@/lib/derived/strategyMetrics';
import { computeTriageForDate } from '@/lib/derived/triage';
import { backfillTradeBlotterForStrategy } from '@/lib/derived/blotter';
import { startProcess, completeProcess, failProcess } from '@/lib/services/processTracking';

export interface CreateStrategyInput {
  strategyKey: string;
  strategyTemplateId?: string;
  accountId?: string;
  brokerAccountId?: string;
  underlyingId?: string;
  underlyingTicker?: string;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  status?: string;
  label?: string;
  strategyType?: string;
  entrySpot?: number;
  entryIv30?: number;
  netPremium?: number;
  entryNotional?: number;
  timeHorizon?: string;
  thesis?: string;
  entryContext?: string;
  profitRules?: string;
  defenseRules?: string;
  timeRules?: string;
  exitCriteria?: string;
  isAuto?: boolean;
  autoSource?: string;
}

/**
 * Resolves or creates strategy template
 */
async function resolveOrCreateTemplate(
  strategyKey: string,
  label: string | undefined,
  underlyingId: string | null
): Promise<string> {
  // Check if template exists
  const existing = await db
    .select()
    .from(strategyTemplates)
    .where(eq(strategyTemplates.strategyKey, strategyKey))
    .limit(1);

  if (existing.length > 0) {
    if (label && existing[0].label !== label) {
      await db
        .update(strategyTemplates)
        .set({
          label,
          updatedAt: new Date(),
        })
        .where(eq(strategyTemplates.id, existing[0].id));
    }
    return existing[0].id;
  }

  // Create new template
  if (!underlyingId) {
    throw new Error('underlyingId is required when creating a new template');
  }

  const [newTemplate] = await db
    .insert(strategyTemplates)
    .values({
      strategyKey,
      label: label || strategyKey,
      underlyingId,
    })
    .returning();

  return newTemplate.id;
}

/**
 * Resolves account ID from broker account ID if needed
 */
async function resolveAccountId(
  accountId?: string,
  brokerAccountId?: string
): Promise<string | null> {
  if (accountId) return accountId;
  if (!brokerAccountId) return null;

  const { resolveAccountId: resolveAccount } = await import('@/lib/ingestion/flex/account');
  try {
    return await resolveAccount(brokerAccountId);
  } catch {
    return null;
  }
}

/**
 * Resolves underlying ID from ticker if needed
 */
async function resolveUnderlyingId(
  underlyingId?: string,
  ticker?: string
): Promise<string | null> {
  if (underlyingId) return underlyingId;
  if (!ticker) return null;

  const result = await db
    .select()
    .from(underlyings)
    .where(eq(underlyings.ticker, ticker))
    .limit(1);

  return result[0]?.id ?? null;
}

/**
 * Creates a new strategy
 */
export async function createStrategy(input: CreateStrategyInput): Promise<string> {
  // Resolve account
  const accountId = await resolveAccountId(input.accountId, input.brokerAccountId);

  // Resolve underlying
  const underlyingId = await resolveUnderlyingId(input.underlyingId, input.underlyingTicker);
  if (!underlyingId) {
    throw new Error('Unable to resolve underlying. Provide either underlyingId or underlyingTicker.');
  }

  // Resolve or create template
  const templateId = input.strategyTemplateId
    ? input.strategyTemplateId
    : await resolveOrCreateTemplate(
        input.strategyKey,
        input.label || input.strategyKey,
        underlyingId
      );

  // Parse dates
  const openedAt = input.openedAt instanceof Date ? input.openedAt : new Date(input.openedAt);
  const closedAt = input.closedAt
    ? input.closedAt instanceof Date
      ? input.closedAt
      : new Date(input.closedAt)
    : null;

  // Create strategy
  const [newStrategy] = await db
    .insert(strategies)
    .values({
      strategyTemplateId: templateId,
      strategyKey: input.strategyKey,
      accountId,
      openedAt,
      closedAt,
      status: input.status || 'open',
      entrySpot: input.entrySpot?.toString() ?? null,
      entryIv30: input.entryIv30?.toString() ?? null,
      netPremium: input.netPremium?.toString() ?? null,
      entryNotional: input.entryNotional?.toString() ?? null,
      timeHorizon: input.timeHorizon ?? null,
      thesis: input.thesis ?? null,
      entryContext: input.entryContext ?? null,
      profitRules: input.profitRules ?? null,
      defenseRules: input.defenseRules ?? null,
      timeRules: input.timeRules ?? null,
      exitCriteria: input.exitCriteria ?? null,
      isAuto: input.isAuto ?? false,
      autoSource: input.autoSource ?? null,
      autoDerivedLabel: input.label ?? null,
      strategyType: input.strategyType ?? null,
      confirmedAt: input.isAuto ? null : new Date(),
    })
    .returning();

  return newStrategy.id;
}

/**
 * Updates a strategy
 */
export async function updateStrategy(
  strategyId: string,
  updates: Partial<CreateStrategyInput> & { confirm?: boolean }
): Promise<void> {
  const updateData: any = {};
  let strategyRow:
    | {
        strategyTemplateId: string | null;
      }
    | null = null;

  if (updates.strategyKey !== undefined || updates.label !== undefined) {
    const existing = await db
      .select({ strategyTemplateId: strategies.strategyTemplateId })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);
    strategyRow = existing[0] ?? null;
  }

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.closedAt !== undefined) {
    updateData.closedAt = updates.closedAt
      ? updates.closedAt instanceof Date
        ? updates.closedAt
        : new Date(updates.closedAt)
      : null;
  }
  if (updates.thesis !== undefined) updateData.thesis = updates.thesis;
  if (updates.entryContext !== undefined) updateData.entryContext = updates.entryContext;
  if (updates.profitRules !== undefined) updateData.profitRules = updates.profitRules;
  if (updates.defenseRules !== undefined) updateData.defenseRules = updates.defenseRules;
  if (updates.timeRules !== undefined) updateData.timeRules = updates.timeRules;
  if (updates.exitCriteria !== undefined) updateData.exitCriteria = updates.exitCriteria;
  if (updates.entrySpot !== undefined) updateData.entrySpot = updates.entrySpot?.toString() ?? null;
  if (updates.entryIv30 !== undefined) updateData.entryIv30 = updates.entryIv30?.toString() ?? null;
  if (updates.netPremium !== undefined)
    updateData.netPremium = updates.netPremium?.toString() ?? null;
  if (updates.entryNotional !== undefined)
    updateData.entryNotional = updates.entryNotional?.toString() ?? null;
  if (updates.timeHorizon !== undefined) updateData.timeHorizon = updates.timeHorizon ?? null;
  if (updates.strategyKey !== undefined) updateData.strategyKey = updates.strategyKey;
  if (updates.label !== undefined) updateData.autoDerivedLabel = updates.label;

  // Check if strategyType is being changed (for state code recomputation) - do this BEFORE update
  let strategyTypeChanged = false;
  if (updates.strategyType !== undefined) {
    const strategyBefore = await db
      .select({ strategyType: strategies.strategyType })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);
    const previousStrategyType = strategyBefore[0]?.strategyType;
    strategyTypeChanged = previousStrategyType !== updates.strategyType;
  }

  if (updates.confirm) {
    updateData.isAuto = false;
    updateData.confirmedAt = new Date();
    
    // When confirming, determine status based on positions using the global latest snapshot date
    // Use the recomputeStrategyStatus function to ensure consistency
    const computedStatus = await recomputeStrategyStatus(strategyId);
    updateData.status = computedStatus;
  }

  if (updates.strategyType !== undefined) {
    updateData.strategyType = updates.strategyType ?? null;
  }
  if (updates.thesis !== undefined) {
    updateData.thesis = updates.thesis ?? null;
  }
  if (updates.profitRules !== undefined) {
    updateData.profitRules = updates.profitRules ?? null;
  }
  if (updates.defenseRules !== undefined) {
    updateData.defenseRules = updates.defenseRules ?? null;
  }
  if (updates.timeRules !== undefined) {
    updateData.timeRules = updates.timeRules ?? null;
  }

  updateData.updatedAt = new Date();

  await db.update(strategies).set(updateData).where(eq(strategies.id, strategyId));

  // If strategy was confirmed, resolve all CONFIRM_STRATEGIES triage records
  if (updates.confirm) {
    // Resolve all CONFIRM_STRATEGIES triage records for this strategy to "complete"
    await db
      .update(triageRecords)
      .set({
        severity: 'complete',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.recommendedAction, 'CONFIRM_STRATEGIES')
        )
      );

    // Backfill trade blotter entries and create QUANTITY_CHANGE records for unmatched trades
    // This ensures that when a strategy is confirmed, any unmatched trades get QUANTITY_CHANGE triage records
    backfillTradeBlotterForStrategy(strategyId).catch((error) => {
      console.error(`Failed to backfill trade blotter for strategy ${strategyId} after confirmation:`, error);
    });

    // Populate entry context fields when strategy is confirmed
    populateStrategyEntryContext(strategyId).catch((error) => {
      console.error(`Failed to populate entry context for strategy ${strategyId} after confirmation:`, error);
    });
  }

  // If strategy was confirmed with a strategyType, or strategyType was changed, compute state code
  if ((updates.confirm && updates.strategyType) || (strategyTypeChanged && updates.strategyType)) {
    const { recomputeStateCodeForStrategy } = await import('@/lib/services/strategyStateCode');
    recomputeStateCodeForStrategy(strategyId).catch((error) => {
      console.error(`Failed to recompute state code for strategy ${strategyId}:`, error);
    });
  }

  if (
    strategyRow?.strategyTemplateId &&
    (updates.strategyKey !== undefined || updates.label !== undefined)
  ) {
    const templateUpdates: any = {};
    if (updates.strategyKey !== undefined) templateUpdates.strategyKey = updates.strategyKey;
    if (updates.label !== undefined) templateUpdates.label = updates.label;
    templateUpdates.updatedAt = new Date();

    await db
      .update(strategyTemplates)
      .set(templateUpdates)
      .where(eq(strategyTemplates.id, strategyRow.strategyTemplateId));
  }
}

/**
 * Populates strategy entry context fields from positions and IV history
 * - entrySpot: Most recent avg_price (CostBasisPrice) to reflect current average cost basis after adjustments
 * - netPremium: Sum of cost_basis_money from earliest snapshot (signed, can be negative)
 * - entryNotional: Sum of abs(cost_basis_money) from earliest snapshot (always positive)
 * - entryIv30: IV30 from underlyings_iv_history at opened_at date (or closest)
 */
export async function populateStrategyEntryContext(strategyId: string): Promise<void> {
  // Get strategy info
  const strategy = await db
    .select({
      id: strategies.id,
      openedAt: strategies.openedAt,
      underlyingId: strategyTemplates.underlyingId,
      accountId: strategies.accountId,
    })
    .from(strategies)
    .innerJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (strategy.length === 0) {
    throw new Error(`Strategy ${strategyId} not found`);
  }

  const strategyData = strategy[0];
  const openedAt = strategyData.openedAt;
  const openedAtDate = openedAt.toISOString().split('T')[0]!; // YYYY-MM-DD

  const updateData: {
    entrySpot?: string | null;
    netPremium?: string | null;
    entryNotional?: string | null;
    entryIv30?: string | null;
  } = {};

  // 1. Get entrySpot from most recent position (to reflect current average cost basis after adjustments)
  const mostRecentPosition = await db
    .select({
      avgPrice: positions.avgPrice,
      assetClass: positions.assetClass,
      underlyingId: positions.underlyingId,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyId, strategyId),
        isNotNull(positions.avgPrice),
        sql`${positions.quantity} != 0`
      )
    )
    .orderBy(desc(positions.snapshotDate))
    .limit(1);

  if (mostRecentPosition.length > 0 && mostRecentPosition[0].avgPrice) {
    // For stocks, use avg_price directly (it's the entry price)
    // For options, we could use underlying spot, but avg_price is also useful
    // Using avg_price for both to keep it simple and reflect current cost basis
    updateData.entrySpot = mostRecentPosition[0].avgPrice;
  }

  // 2. Get netPremium and entryNotional from most recent snapshot
  // This reflects the current adjusted cost basis after all position adjustments
  // Find most recent snapshot date for this strategy
  const mostRecentSnapshot = await db
    .select({
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyId, strategyId),
        isNotNull(positions.snapshotDate),
        sql`${positions.quantity} != 0`
      )
    )
    .orderBy(desc(positions.snapshotDate))
    .limit(1);

  if (mostRecentSnapshot.length > 0) {
    const mostRecentDate = mostRecentSnapshot[0].snapshotDate;
    
    // Get all positions at most recent snapshot date
    const mostRecentPositions = await db
      .select({
        costBasisMoney: positions.costBasisMoney,
      })
      .from(positions)
      .where(
        and(
          eq(positions.strategyId, strategyId),
          eq(positions.snapshotDate, mostRecentDate!),
          sql`${positions.quantity} != 0`
        )
      );

    // Calculate netPremium (signed sum) and entryNotional (absolute sum)
    let netPremium = 0;
    let entryNotional = 0;

    for (const pos of mostRecentPositions) {
      if (pos.costBasisMoney) {
        const value = toNumber(pos.costBasisMoney);
        if (value !== null) {
          netPremium += value; // Signed sum (can be negative for credit spreads)
          entryNotional += Math.abs(value); // Absolute sum (always positive)
        }
      }
    }

    if (netPremium !== 0) {
      updateData.netPremium = netPremium.toString();
    }
    if (entryNotional !== 0) {
      updateData.entryNotional = entryNotional.toString();
    }
  }

  // 3. Get entryIv30 from underlyings_iv_history at opened_at date
  // Use priority-based fetching: IBKR > Massive > Option Strategist > Yahoo > Manual
  if (strategyData.underlyingId) {
    // Try exact date first with priority
    const { getIvDataWithPriority } = await import('@/lib/services/ibkr/data-priority');
    let ivData = await getIvDataWithPriority(strategyData.underlyingId, openedAtDate);

    // If not found, find closest date (within 7 days before or after)
    if (!ivData || !ivData.iv30) {
      const dateObj = new Date(openedAtDate);
      const beforeDate = new Date(dateObj);
      beforeDate.setDate(beforeDate.getDate() - 7);
      const afterDate = new Date(dateObj);
      afterDate.setDate(afterDate.getDate() + 7);

      // Get all records in date range and find closest
      const allRecords = await db
        .select({
          iv30: underlyingsIvHistory.iv30,
          asOfDate: underlyingsIvHistory.asOfDate,
          source: underlyingsIvHistory.source,
        })
        .from(underlyingsIvHistory)
        .where(
          and(
            eq(underlyingsIvHistory.underlyingId, strategyData.underlyingId),
            gte(underlyingsIvHistory.asOfDate, beforeDate.toISOString().split('T')[0]!),
            lte(underlyingsIvHistory.asOfDate, afterDate.toISOString().split('T')[0]!)
          )
        );

      if (allRecords.length > 0) {
        // Sort by date proximity, then by source priority
        const SOURCE_PRIORITY = ['ibkr', 'massive', 'opt_strat', 'yahoo_finance', 'manual'];
        const sorted = allRecords.sort((a, b) => {
          const aDateDiff = Math.abs(new Date(a.asOfDate).getTime() - dateObj.getTime());
          const bDateDiff = Math.abs(new Date(b.asOfDate).getTime() - dateObj.getTime());
          if (aDateDiff !== bDateDiff) {
            return aDateDiff - bDateDiff; // Closer date first
          }
          // If same date distance, prioritize by source
          const aPriority = SOURCE_PRIORITY.indexOf(a.source || '') === -1 ? 999 : SOURCE_PRIORITY.indexOf(a.source || '');
          const bPriority = SOURCE_PRIORITY.indexOf(b.source || '') === -1 ? 999 : SOURCE_PRIORITY.indexOf(b.source || '');
          return aPriority - bPriority;
        });

        const bestRecord = sorted[0];
        if (bestRecord && bestRecord.iv30) {
          ivData = {
            iv30: bestRecord.iv30,
            spot: null,
            source: bestRecord.source,
          };
        }
      }
    }

    if (ivData && ivData.iv30) {
      const iv30 = toNumber(ivData.iv30);
      if (iv30 !== null && iv30 > 0) {
        updateData.entryIv30 = iv30.toString();
      }
    }
  }

  // Update strategy with populated fields (only if we have data)
  if (Object.keys(updateData).length > 0) {
    await db
      .update(strategies)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(strategies.id, strategyId));
  }
}

export interface MergeStrategiesInput {
  targetId: string;
  sourceIds: string[];
}

export async function mergeStrategies(input: MergeStrategiesInput): Promise<{
  positionsUpdated: number;
  tradesUpdated: number;
  sourcesMerged: number;
}> {
  const { targetId } = input;
  const sourceIds = Array.from(new Set(input.sourceIds.filter((id) => id !== targetId)));

  if (!targetId || sourceIds.length === 0) {
    throw new Error('Provide a target strategy and at least one source strategy to merge.');
  }

  const strategiesToFetch = [targetId, ...sourceIds];
  const rows = await db
    .select()
    .from(strategies)
    .where(inArray(strategies.id, strategiesToFetch));

  if (!rows.find((row) => row.id === targetId)) {
    throw new Error('Target strategy not found.');
  }

  const now = new Date();

  const updatedPositions = await db
    .update(positions)
    .set({ strategyId: targetId, updatedAt: now })
    .where(inArray(positions.strategyId, sourceIds))
    .returning({ id: positions.id });

  const updatedTrades = await db
    .update(trades)
    .set({ strategyId: targetId })
    .where(inArray(trades.strategyId, sourceIds))
    .returning({ id: trades.id });

  // Update blotter entries that point to merged strategies
  // This ensures trade blotter entries are updated immediately (not just in background recompute)
  await db
    .update(blotterActions)
    .set({ strategyId: targetId, updatedAt: now })
    .where(inArray(blotterActions.strategyId, sourceIds));

  await db
    .delete(strategyMetricsSnapshots)
    .where(inArray(strategyMetricsSnapshots.strategyId, sourceIds));

  await db.delete(triageRecords).where(inArray(triageRecords.strategyId, sourceIds));

  await db
    .update(strategies)
    .set({
      status: 'merged',
      isAuto: false,
      updatedAt: now,
    })
    .where(inArray(strategies.id, sourceIds));

  // Recompute target strategy status based on positions (may have changed after merge)
  const targetStatus = await recomputeStrategyStatus(targetId);
  await db
    .update(strategies)
    .set({
      status: targetStatus,
      updatedAt: now,
    })
    .where(eq(strategies.id, targetId));

  // Auto-trigger recompute: Find all snapshot dates where target strategy has positions
  const targetStrategy = rows.find((row) => row.id === targetId);
  if (targetStrategy?.accountId) {
    const snapshotDates = await db
      .selectDistinct({ snapshotDate: positions.snapshotDate })
      .from(positions)
      .where(
        and(
          eq(positions.strategyId, targetId),
          eq(positions.accountId, targetStrategy.accountId),
          isNotNull(positions.snapshotDate),
          sql`${positions.quantity} != 0`
        )
      )
      .orderBy(positions.snapshotDate);

    if (snapshotDates.length > 0) {
      const dates = snapshotDates.map((d) => d.snapshotDate).filter(Boolean) as string[];
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      if (minDate && maxDate) {
        // Fire off recompute operations in the background (don't await)
        // This allows the merge to complete immediately while recompute happens asynchronously
        // Track this background process so it's visible in the Process Monitor
        (async () => {
          let backgroundProcessId: string | null = null;
          try {
            // Start tracking the background recompute
            backgroundProcessId = await startProcess(
              'recompute_strategy_metrics',
              'auto',
              {
                accountId: targetStrategy.accountId,
                targetId,
                sourceIds,
                startDate: minDate,
                endDate: maxDate,
                dates: dates.length,
                reason: 'post_merge_recompute',
              }
            );

            // Backfill trade blotter entries for target strategy (includes trades from merged strategies)
            await backfillTradeBlotterForStrategy(targetId);
            
            // Recompute strategy metrics for all dates where target strategy has positions
            await computeStrategyMetricsForDateRange(
              targetStrategy.accountId,
              targetId,
              minDate,
              maxDate
            );

            // Trigger targeted triage recompute for target strategy on affected dates
            // Clean first to ensure stale records are removed (e.g., if underlying data changed)
            let triageCount = 0;
            for (const date of dates) {
              if (date) {
                try {
                  await computeTriageForDate(date, targetStrategy.accountId, targetId, true);
                  triageCount++;
                } catch (error) {
                  console.error(
                    `Failed to auto-recompute triage after merge for strategy ${targetId} on ${date}:`,
                    error
                  );
                  // Continue with other dates
                }
              }
            }
            
            // Complete the background process tracking
            if (backgroundProcessId) {
              await completeProcess(backgroundProcessId, {
                success: true,
                datesProcessed: dates.length,
                triageRecordsCreated: triageCount,
                message: `Background recompute completed for merged strategy ${targetId}`,
              });
            }
            
            console.log(
              `Background recompute completed for merged strategy ${targetId} (${dates.length} dates)`
            );
            
            // Show browser notification when recompute completes
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('Recompute Complete', {
                body: `Strategy metrics and triage recomputed for ${dates.length} date(s)`,
                icon: '/favicon.ico',
                tag: `recompute-${targetId}`,
              });
            } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
              // Request permission for future notifications
              Notification.requestPermission();
            }
          } catch (error) {
            console.error(
              `Failed to auto-recompute after merging strategies into ${targetId}:`,
              error
            );
            // Mark background process as failed
            if (backgroundProcessId) {
              await failProcess(
                backgroundProcessId,
                error instanceof Error ? error.message : 'Background recompute failed'
              );
            }
            // Don't fail the merge if recompute fails
          }
        })();
      }
    }
  }

  return {
    positionsUpdated: updatedPositions.length,
    tradesUpdated: updatedTrades.length,
    sourcesMerged: sourceIds.length,
  };
}

/**
 * Gets strategy by ID
 */
export async function getStrategyById(strategyId: string) {
  const result = await db
    .select()
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Recomputes the status for a strategy based on latest snapshot date positions
 * - "open" if has positions with quantity != 0 on the GLOBAL latest snapshot date
 * - "closed" if had positions before but none on the global latest snapshot
 * - "draft" if never had any positions
 * 
 * Uses the global latest snapshot date (not strategy-specific) to determine if strategy is currently open
 */
export async function recomputeStrategyStatus(strategyId: string): Promise<'open' | 'closed' | 'draft'> {
  // Get the GLOBAL latest snapshot date (where any strategy has positions with quantity != 0)
  const globalLatestSnapshotResult = await db
    .select({
      snapshotDate: positions.snapshotDate,
    })
    .from(positions)
    .where(sql`${positions.quantity} != 0`)
    .orderBy(desc(positions.snapshotDate))
    .limit(1);
  
  const globalLatestSnapshotDate = globalLatestSnapshotResult[0]?.snapshotDate ?? null;
  
  if (globalLatestSnapshotDate) {
    // Check if THIS strategy has positions with quantity != 0 on the global latest snapshot date
    const hasOpenPositions = await db
      .select({ count: sql<number>`count(*)` })
      .from(positions)
      .where(
        and(
          eq(positions.strategyId, strategyId),
          eq(positions.snapshotDate, globalLatestSnapshotDate),
          sql`${positions.quantity} != 0`
        )
      )
      .limit(1);
    
    const openPositionCount = Number(hasOpenPositions[0]?.count ?? 0);
    if (openPositionCount > 0) {
      return 'open';
    } else {
      // Strategy doesn't have positions on latest snapshot, but check if it ever had positions
      const everHadPositions = await db
        .select({ count: sql<number>`count(*)` })
        .from(positions)
        .where(eq(positions.strategyId, strategyId))
        .limit(1);
      
      const hadPositionsCount = Number(everHadPositions[0]?.count ?? 0);
      if (hadPositionsCount > 0) {
        return 'closed'; // Had positions before but not on latest snapshot
      } else {
        return 'draft'; // Never had any positions
      }
    }
  } else {
    // No global latest snapshot date - check if strategy ever had positions
    const everHadPositions = await db
      .select({ count: sql<number>`count(*)` })
      .from(positions)
      .where(eq(positions.strategyId, strategyId))
      .limit(1);
    
    const hadPositionsCount = Number(everHadPositions[0]?.count ?? 0);
    if (hadPositionsCount > 0) {
      return 'closed';
    } else {
      return 'draft';
    }
  }
}

/**
 * Restores merged strategies that may have been incorrectly changed
 * A strategy should be 'merged' if it has no positions (they were moved to target during merge)
 * and there are other strategies with the same strategyKey that have positions
 */
export async function restoreMergedStrategies(): Promise<{
  restored: number;
  results: Array<{ strategyId: string; strategyKey: string }>;
}> {
  const results: Array<{ strategyId: string; strategyKey: string }> = [];
  let restored = 0;

  // Find strategies that:
  // 1. Don't have status 'merged' but should be (no positions, and other strategies with same key exist)
  // 2. Or have positions but status is 'merged' (shouldn't happen, but fix it)
  
  // First, find all strategies that have no positions
  const allStrategies = await db.select().from(strategies);
  
  for (const strategy of allStrategies) {
    // Check if this strategy has any positions
    const hasPositions = await db
      .select({ count: sql<number>`count(*)` })
      .from(positions)
      .where(eq(positions.strategyId, strategy.id))
      .limit(1);
    
    const positionCount = Number(hasPositions[0]?.count ?? 0);
    
    if (positionCount === 0 && strategy.status !== 'merged') {
      // Strategy has no positions - check if there are other strategies with same key that have positions
      // If so, this one was likely merged
      const otherStrategiesWithSameKey = await db
        .select()
        .from(strategies)
        .where(
          and(
            eq(strategies.strategyKey, strategy.strategyKey),
            sql`${strategies.id} != ${strategy.id}`
          )
        );
      
      // Check if any of these other strategies have positions
      let shouldBeMerged = false;
      for (const other of otherStrategiesWithSameKey) {
        const otherHasPositions = await db
          .select({ count: sql<number>`count(*)` })
          .from(positions)
          .where(eq(positions.strategyId, other.id))
          .limit(1);
        
        if (Number(otherHasPositions[0]?.count ?? 0) > 0) {
          shouldBeMerged = true;
          break;
        }
      }
      
      if (shouldBeMerged) {
        await db
          .update(strategies)
          .set({
            status: 'merged',
            updatedAt: new Date(),
          })
          .where(eq(strategies.id, strategy.id));
        
        results.push({
          strategyId: strategy.id,
          strategyKey: strategy.strategyKey,
        });
        restored++;
      }
    } else if (positionCount > 0 && strategy.status === 'merged') {
      // Strategy has positions but status is 'merged' - this shouldn't happen, restore it
      const newStatus = await recomputeStrategyStatus(strategy.id);
      await db
        .update(strategies)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(strategies.id, strategy.id));
      
      results.push({
        strategyId: strategy.id,
        strategyKey: strategy.strategyKey,
      });
      restored++;
    }
  }

  return { restored, results };
}

/**
 * Recomputes and updates status for all strategies (or optionally a specific strategy)
 * Returns count of strategies updated
 * 
 * Note: Skips strategies with status 'merged' - merged strategies should always remain 'merged'
 */
export async function recomputeAllStrategyStatuses(strategyId?: string): Promise<{
  updated: number;
  results: Array<{ strategyId: string; oldStatus: string; newStatus: string }>;
}> {
  const results: Array<{ strategyId: string; oldStatus: string; newStatus: string }> = [];
  let updated = 0;

  // Get strategies to update (exclude merged strategies)
  const strategiesToUpdate = strategyId
    ? await db.select().from(strategies).where(eq(strategies.id, strategyId))
    : await db.select().from(strategies).where(sql`${strategies.status} != 'merged'`);

  for (const strategy of strategiesToUpdate) {
    // Skip merged strategies - they should always remain 'merged'
    if (strategy.status === 'merged') {
      continue;
    }

    const newStatus = await recomputeStrategyStatus(strategy.id);
    
    // Only update if status changed
    if (strategy.status !== newStatus) {
      await db
        .update(strategies)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(strategies.id, strategy.id));
      
      results.push({
        strategyId: strategy.id,
        oldStatus: strategy.status,
        newStatus,
      });
      updated++;
    }
  }

  return { updated, results };
}

/**
 * Gets strategies with filters
 */
export async function getStrategies(filters: {
  accountId?: string;
  status?: string;
  strategyKey?: string;
}) {
  const conditions = [];
  if (filters.accountId) {
    conditions.push(eq(strategies.accountId, filters.accountId));
  }
  if (filters.status) {
    conditions.push(eq(strategies.status, filters.status));
  }
  if (filters.strategyKey) {
    conditions.push(eq(strategies.strategyKey, filters.strategyKey));
  }

  return await db
    .select()
    .from(strategies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(strategies.openedAt);
}

