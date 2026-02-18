/**
 * Average Cost Basis Calculation
 *
 * Implements the Average Cost Basis method for cost basis calculation.
 * Used when accounts.cost_basis_method = 'average_cost'.
 *
 * Key differences from FIFO:
 * - Maintains a single running average per (asset, owner, account)
 * - New purchases update the average: (old_cost + new_cost) / (old_qty + new_qty)
 * - All disposals use the current average cost per unit
 * - Simpler but less tax optimization flexibility
 *
 * Formula on acquisition:
 *   new_avg = (old_total_cost + acquisition_cost) / (old_qty + acquisition_qty)
 *
 * Formula on disposal:
 *   cost_basis = disposal_qty × average_cost_per_unit
 *   (average cost per unit stays the same)
 */

import { db } from "@/db";
import { events, accounts, averageCostPositions } from "@/db/schema";
import { eq, and, gt, asc, sql, inArray } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError, AverageCostState } from "./types";
import { isAcquisition, isDisposal, ACQUISITION_EVENT_TYPES, DISPOSAL_EVENT_TYPES } from "./types";
import { upsertEventCalculation, type UpsertEventCalculationData } from "./event-calculations-helper";

// ============================================================================
// Constants
// ============================================================================

const EPSILON = 0.00000001;
const LONG_TERM_DAYS = 365;

// ============================================================================
// Types
// ============================================================================

interface EventForAverageCost {
  id: string;
  userId: string;
  assetId: string;
  owner: string;
  account: string;
  eventType: string;
  timestamp: Date;
  quantity: string;
  totalValue: string;
  assetTicker: string;        // Fix #2: Need ticker to identify currencies
  costBasis: string | null;   // Fix #1: Commission-adjusted cost from adapter
  source: string | null;       // Fix #3: Distinguish trade vs SOF events (from events.source column)
  metadata: unknown;           // Fix #1, #3, #4: Commission, ibkrAssetClass, activityCode
}

// Helper types for metadata parsing
interface EventMetadata {
  commission?: number;
  ibkrAssetClass?: string;
  activityCode?: string;
  source?: string;
  isFuturesCashSettlement?: boolean;
  isFuturesFee?: boolean;
  tag?: string;
  koinlyType?: string;
}

/**
 * Parse event metadata with safe defaults
 */
function parseEventMetadata(metadata: unknown): EventMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const m = metadata as Record<string, unknown>;
  return {
    commission: typeof m.commission === 'number' ? m.commission : undefined,
    ibkrAssetClass: typeof m.ibkrAssetClass === 'string' ? m.ibkrAssetClass : undefined,
    activityCode: typeof m.activityCode === 'string' ? m.activityCode : undefined,
    source: typeof m.source === 'string' ? m.source : undefined,
    isFuturesCashSettlement: m.isFuturesCashSettlement === true,
    isFuturesFee: m.isFuturesFee === true,
    tag: typeof m.tag === 'string' ? m.tag : undefined,
    koinlyType: typeof m.koinlyType === 'string' ? m.koinlyType : undefined,
  };
}

/**
 * Fix #4: Check if event is an adjustment-type SOF event
 */
function isAdjustmentType(meta: EventMetadata): boolean {
  return meta.activityCode === 'ADJ';
}

/**
 * Fix #9: Check if event is a futures cash settlement from ibkr_trade
 * These USD events represent trade-day MTM (trade price → settlement price)
 * and should have realizedGain = totalValue
 */
function isFuturesCashSettlement(meta: EventMetadata): boolean {
  return meta.isFuturesCashSettlement === true;
}

/**
 * Fix #9: Check if event is a futures fee from ibkr_trade
 * These USD events represent futures trading commissions
 * and should have realizedGain = -totalValue (fees are losses)
 */
function isFuturesFeeEvent(meta: EventMetadata): boolean {
  return meta.isFuturesFee === true;
}

/**
 * Fix #3: Check if event is a futures trade event (not SOF settlement)
 *
 * IMPORTANT: Only applies to actual futures TRADE events (BUY/SELL from ibkr_trade).
 * SOF events (like ADJ settlements) should NOT be treated as futures trades even if
 * they originated from a futures position - they are cash settlements and should
 * update the USD position normally.
 */
function isFuturesTradeEvent(meta: EventMetadata, source: string | null): boolean {
  // Only apply to ibkr_trade events, not SOF events
  // SOF ADJ events have ibkrAssetClass='FUT' to track the source contract,
  // but they are cash settlements, not futures trades
  if (source === 'ibkr_sof') {
    return false;
  }
  // Futures trades should have zero cost/proceeds
  // Actual realized gains come from SOF settlement events (handled by Fix #4)
  return meta.ibkrAssetClass === 'FUT';
}

/**
 * Fix #10: Check if event is a Koinly "Realized gain" tagged event
 *
 * Koinly tags USD settlements from crypto derivatives (FTX futures, perps,
 * MOVE contracts) with tag="Realized gain". The entire USD amount IS the
 * realized P&L — there's no cost basis to deduct because Koinly has already
 * computed the net gain/loss from the derivative position.
 *
 * RECEIVE events → positive gain (derivative closed at profit)
 * SEND events → negative gain (derivative closed at loss)
 */
function isKoinlyRealizedGain(meta: EventMetadata): boolean {
  return meta.tag === 'Realized gain';
}

/**
 * Fix #11: Check if event is a Koinly wallet-to-wallet transfer
 *
 * Koinly "transfer" type records represent LP token movements between wallets
 * (e.g., "To pool" / "From pool" for liquidity pool operations).
 * These have totalValue=$0 in the CSV.
 *
 * V1 correctly assigns $0 gain to all transfer transactions.
 * Without this fix, V2's average cost engine computes:
 *   SEND: realizedGain = $0 - (qty × avgCost) = large phantom loss
 *   RECEIVE: adds qty at $0 cost, diluting average cost
 *
 * Fix: Transfer SENDs get realizedGain=0. Transfer RECEIVEs carry the
 * current average cost forward (eventCost = avgCost × qty) to preserve
 * the position's cost basis through the transfer.
 */
function isKoinlyTransfer(meta: EventMetadata): boolean {
  return meta.koinlyType === 'transfer';
}

// ============================================================================
// Main Calculation Function
// ============================================================================

/**
 * Compute average cost basis for all accounts that use the average cost method
 *
 * This processes events in chronological order and updates the average cost
 * position for each (asset, owner, account) scope.
 */
export async function computeAverageCostBasis(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  const errors: CalcError[] = [];

  console.log(
    `[AvgCost] Starting average cost calculation for user ${ctx.userId}, incremental: ${ctx.incremental}`
  );

  // Find accounts that use average cost method
  const avgCostAccounts = await findAverageCostAccounts(ctx.userId);

  if (avgCostAccounts.length === 0) {
    console.log(`[AvgCost] No accounts use average cost method`);
    return {
      success: true,
      recordsProcessed: 0,
      duration: Date.now() - startTime,
      errors: [],
    };
  }

  console.log(
    `[AvgCost] Found ${avgCostAccounts.length} accounts using average cost method`
  );

  // Get events for these accounts
  const fetchedEvents = await fetchEventsForAverageCost(ctx, avgCostAccounts);

  if (fetchedEvents.length === 0) {
    console.log(`[AvgCost] No events to process`);
    return {
      success: true,
      recordsProcessed: 0,
      duration: Date.now() - startTime,
      errors: [],
    };
  }

  console.log(`[AvgCost] Processing ${fetchedEvents.length} events`);

  // Group events by (asset, owner, account) and process in chronological order
  const groups = groupEventsByScope(fetchedEvents);

  for (const [scopeKey, scopeEvents] of groups) {
    // Get or create position for this scope
    const [assetId, owner, account] = scopeKey.split(":");
    let position = await getOrCreatePosition(ctx.userId, assetId, owner, account);

    // Process events in chronological order
    for (const event of scopeEvents) {
      try {
        if (isAcquisition(event.eventType)) {
          position = await processAcquisition(position, event);
        } else if (isDisposal(event.eventType)) {
          const result = await processDisposal(position, event);
          position = result.position;
        }
        recordsProcessed++;
      } catch (error) {
        errors.push({
          eventId: event.id,
          assetId: event.assetId,
          message: `Average cost processing failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: "error",
        });
      }
    }

    // Report progress
    if (recordsProcessed % 500 === 0) {
      console.log(`[AvgCost] Progress: ${recordsProcessed} events processed`);
      await ctx.stateMachine.setCalcPhase(ctx.batchId, "average_cost_basis", {
        processed: recordsProcessed,
        total: fetchedEvents.length,
      });
    }
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[AvgCost] Completed. Processed: ${recordsProcessed}, Errors: ${fatalErrors.length}, Duration: ${duration}ms`
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed,
    duration,
    errors,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find accounts that use the average cost method
 */
async function findAverageCostAccounts(userId: string): Promise<string[]> {
  // TJ accounts don't have userId directly — filter by costBasisMethod only.
  // The engine already filters events by userId, so this is safe.
  const fetchedAccounts = await db
    .select({ account: accounts.brokerAccountId })
    .from(accounts)
    .where(
      eq(accounts.costBasisMethod, "average_cost")
    );

  return fetchedAccounts.map((a) => a.account);
}

/**
 * Fetch events for accounts using average cost method
 */
async function fetchEventsForAverageCost(
  ctx: CalcContext,
  accountNames: string[]
): Promise<EventForAverageCost[]> {
  const conditions = [
    eq(events.userId, ctx.userId),
    inArray(events.account, accountNames),
    // Only process acquisition and disposal events
    sql`${events.eventType} IN (${sql.join(
      [...ACQUISITION_EVENT_TYPES, ...DISPOSAL_EVENT_TYPES].map((t) => sql`${t}`),
      sql`, `
    )})`,
  ];

  if (ctx.incremental && ctx.startDate) {
    conditions.push(gt(events.timestamp, ctx.startDate));
  }

  return db
    .select({
      id: events.id,
      userId: events.userId,
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      eventType: events.eventType,
      timestamp: events.timestamp,
      quantity: events.quantity,
      totalValue: events.totalValue,
      assetTicker: sql<string>`(SELECT ticker FROM assets WHERE id = ${events.assetId})`,
      costBasis: events.costBasis,
      source: events.source,
      metadata: events.metadata,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.timestamp), asc(events.id));
}

/**
 * Group events by (asset, owner, account) scope
 */
function groupEventsByScope(
  eventList: EventForAverageCost[]
): Map<string, EventForAverageCost[]> {
  const groups = new Map<string, EventForAverageCost[]>();

  for (const event of eventList) {
    const key = `${event.assetId}:${event.owner}:${event.account}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return groups;
}

/**
 * Get or create an average cost position
 */
async function getOrCreatePosition(
  userId: string,
  assetId: string,
  owner: string,
  account: string
): Promise<AverageCostState> {
  // Try to find existing position
  const existing = await db
    .select()
    .from(averageCostPositions)
    .where(
      and(
        eq(averageCostPositions.userId, userId),
        eq(averageCostPositions.assetId, assetId),
        eq(averageCostPositions.owner, owner),
        eq(averageCostPositions.account, account)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      positionId: existing[0].id,
      totalQuantity: parseFloat(existing[0].totalQuantity),
      totalCostBasis: parseFloat(existing[0].totalCostBasis),
      averageCostPerUnit: parseFloat(existing[0].averageCostPerUnit),
      firstAcquisitionDate: existing[0].firstAcquisitionDate ?? undefined,
    };
  }

  // Create new position
  const [newPosition] = await db
    .insert(averageCostPositions)
    .values({
      userId,
      assetId,
      owner,
      account,
      totalQuantity: "0",
      totalCostBasis: "0",
      averageCostPerUnit: "0",
    })
    .returning();

  return {
    positionId: newPosition.id,
    totalQuantity: 0,
    totalCostBasis: 0,
    averageCostPerUnit: 0,
    firstAcquisitionDate: undefined,
  };
}

/**
 * Process an acquisition event using average cost method
 *
 * New Average = (Old Total Cost + New Cost) / (Old Qty + New Qty)
 *
 * V1 Parity Fixes:
 * - Fix #1: Uses costBasis (includes commission) when available
 * - Fix #3: FUT trade events use zero cost (gains from SOF settlements)
 * - Fix #4: Adjustment-type events use special gainLoss formula
 * - Fix #6: Short covers write realized gain
 * - Fix #10: Koinly "Realized gain" tagged events pass through gain directly
 * - Fix #11: Koinly transfers carry average cost forward (not $0 from CSV)
 *
 * Note: Fix #5 (USD special case) was REMOVED - Action 1.
 * With raw currency quantities in the trade adapter, USD transactions
 * naturally produce zero gains for transfers (avgCost=1.0), while
 * ADJ events produce real gains via Fix #4.
 */
async function processAcquisition(
  position: AverageCostState,
  event: EventForAverageCost
): Promise<AverageCostState> {
  const meta = parseEventMetadata(event.metadata);
  const eventQty = parseFloat(event.quantity);
  const rawTotalValue = parseFloat(event.totalValue);

  // Fix #3: FUT trade events have zero cost (gains come from SOF settlements)
  const isFut = isFuturesTradeEvent(meta, event.source);

  // Fix #11: Koinly transfers carry cost forward (not $0 from CSV)
  // Transfer RECEIVE events have totalValue=$0 in Koinly CSV, which would
  // dilute the average cost. Instead, use the current average cost per unit
  // to preserve the position's cost basis through the transfer.
  const isTransfer = isKoinlyTransfer(meta);

  // Fix #1: Compute cost from totalValue + commission (not event.costBasis, which
  // the FIFO engine may have overwritten with lot cost basis for short-cover BUYs)
  // Fix #8: Avoid reading event.costBasis which FIFO matching overwrites
  const commission = meta.commission ?? 0;
  const eventCost = isFut ? 0
    : isTransfer ? (position.averageCostPerUnit * eventQty)
    : (rawTotalValue + commission);

  let newTotalQty: number;
  let newTotalCost: number;
  let newAvgCost: number;
  let shortCoverGain = 0;

  if (position.totalQuantity < -EPSILON) {
    // Position is short - this acquisition covers the short
    const shortQty = Math.abs(position.totalQuantity);
    const coverQty = Math.min(eventQty, shortQty);
    const remainingBuyQty = eventQty - coverQty;

    // Fix #6: Calculate realized gain for short covers
    // V1: gainLoss = costBasis - coverValue
    //   costBasis = avgShortCost × coverQty (what we sold at)
    //   coverValue = value × (coverQty / quantity) (what we pay to cover)
    const coverCost = eventCost * (coverQty / eventQty);
    const avgShortCost = Math.abs(position.averageCostPerUnit);
    const shortCostBasis = avgShortCost * coverQty;
    shortCoverGain = shortCostBasis - coverCost;

    if (remainingBuyQty > EPSILON) {
      // Fully covered short + opening new long position
      const remainingCost = eventCost * (remainingBuyQty / eventQty);
      newTotalQty = remainingBuyQty;
      newTotalCost = remainingCost;
      newAvgCost = newTotalQty > EPSILON ? newTotalCost / newTotalQty : 0;
    } else {
      // Partially covered short
      newTotalQty = position.totalQuantity + eventQty;
      newTotalCost = newTotalQty * position.averageCostPerUnit;
      newAvgCost = position.averageCostPerUnit; // Short avg stays same
    }
  } else {
    // Normal acquisition into long position
    newTotalQty = position.totalQuantity + eventQty;
    newTotalCost = position.totalCostBasis + eventCost;
    newAvgCost = newTotalQty > EPSILON ? newTotalCost / newTotalQty : 0;
  }

  // Determine realized gain
  let realizedGain: number | undefined;
  if (isKoinlyRealizedGain(meta)) {
    // Fix #10: Koinly "Realized gain" tagged USD events (FTX derivatives settlements)
    // The entire RECEIVE amount is the realized gain from closing the derivative position
    realizedGain = rawTotalValue;
  } else if (isFuturesCashSettlement(meta)) {
    // Fix #9: Futures cash settlement from ibkr_trade - RECEIVE means positive gain
    // This is trade-day MTM (trade price → settlement price difference)
    realizedGain = rawTotalValue;
  } else if (isAdjustmentType(meta)) {
    // Fix #4: V1 special adjustment gainLoss
    // V1 accumulates costBasis from short cover + long opening, then:
    // gainLoss = max(|accumulatedCostBasis|, |actualNetValue|)
    let accumulatedCostBasis: number;

    if (position.totalQuantity < -EPSILON) {
      // Original position was short - calculate V1's accumulated costBasis
      const shortQty = Math.abs(position.totalQuantity);
      const coverQty = Math.min(eventQty, shortQty);
      const avgShortCost = Math.abs(position.averageCostPerUnit);
      accumulatedCostBasis = avgShortCost * coverQty;

      const remainingBuyQty = eventQty - coverQty;
      if (remainingBuyQty > EPSILON) {
        accumulatedCostBasis += eventCost * (remainingBuyQty / eventQty);
      }
    } else {
      accumulatedCostBasis = eventCost;
    }

    realizedGain = Math.abs(accumulatedCostBasis) > Math.abs(rawTotalValue)
      ? accumulatedCostBasis : rawTotalValue;
  } else if (Math.abs(shortCoverGain) > EPSILON) {
    // Fix #6: Regular short cover gain
    realizedGain = shortCoverGain;
  }

  // FIFO metadata leak fix: Futures trade events must explicitly set realizedGain
  // to 0 so the jsonb merge overwrites any stale FIFO realizedGain value.
  // Without this, the FIFO engine's realizedGain (written for BUY events covering
  // shorts) persists because jsonb || only adds/overwrites keys in the right operand.
  if (isFut && realizedGain === undefined) {
    realizedGain = 0;
  }

  // Update first acquisition date if this is the first purchase
  const firstDate = position.firstAcquisitionDate ?? event.timestamp;

  // Update position in database
  await db
    .update(averageCostPositions)
    .set({
      totalQuantity: newTotalQty.toFixed(8),
      totalCostBasis: newTotalCost.toFixed(2),
      averageCostPerUnit: newAvgCost.toFixed(8),
      firstAcquisitionDate: firstDate,
      lastUpdatedEventId: event.id,
      updatedAt: new Date(),
    })
    .where(eq(averageCostPositions.id, position.positionId));

  // Write cost basis to event_calculations (not events table)
  await upsertEventCalculation({
    eventId: event.id,
    userId: event.userId,
    costBasis: eventCost.toFixed(2),
    costBasisMethod: "average_cost",
    newAverageCost: newAvgCost.toFixed(8),
    ...(realizedGain !== undefined
      ? { realizedGain: realizedGain.toFixed(2) }
      : {}),
  });

  return {
    positionId: position.positionId,
    totalQuantity: newTotalQty,
    totalCostBasis: newTotalCost,
    averageCostPerUnit: newAvgCost,
    firstAcquisitionDate: firstDate,
  };
}

/**
 * Process a disposal event using average cost method
 *
 * Cost basis = quantity sold × current average cost per unit
 *
 * V1 Parity Fixes:
 * - Fix #1: Subtracts commission from proceeds (net proceeds)
 * - Fix #3: FUT trade events use zero proceeds
 * - Fix #4: Adjustment-type events use special gainLoss formula
 * - Fix #7: Weighted average when extending short positions
 * - Fix #10: Koinly "Realized gain" tagged events pass through gain directly
 * - Fix #11: Koinly transfers force realizedGain=0 (cost-neutral)
 *
 * Note: Fix #5 (USD special case) was REMOVED - Action 1.
 * With raw currency quantities in the trade adapter, USD transactions
 * naturally produce zero gains for transfers (avgCost=1.0), while
 * ADJ events produce real gains via Fix #4.
 */
async function processDisposal(
  position: AverageCostState,
  event: EventForAverageCost
): Promise<{ position: AverageCostState; costBasis: number; realizedGain: number }> {
  const meta = parseEventMetadata(event.metadata);
  const eventQty = parseFloat(event.quantity);
  const rawTotalValue = parseFloat(event.totalValue);

  // Fix #3: FUT trade events have zero proceeds (gains come from SOF settlements)
  const isFut = isFuturesTradeEvent(meta, event.source);

  // Fix #1: Subtract commission from proceeds for net proceeds (matching V1's netValue)
  const commission = meta.commission ?? 0;
  const proceeds = isFut ? 0 : (rawTotalValue - commission);

  const isAdj = isAdjustmentType(meta);

  let costBasis: number;
  let realizedGain: number;
  let newAvgCost = position.averageCostPerUnit;

  // Fix #10: Koinly "Realized gain" tagged SEND events (FTX derivative losses)
  // Fix #14: V1 uses Path 2B logic for "Realized gain" disposals — gainLoss = costBasis (negative),
  // ignoring proceeds entirely. This treats disposals as if proceeds = $0, recognizing full cost
  // basis as loss. V1's calculation engine (transactions-running-cost-gl.ts line 469) sets
  // gainLoss = costBasis for tradeType = "Realized gain", NOT proceeds - cost.
  // Fix #9: Futures cash settlement (SEND) or futures fee
  if (isKoinlyRealizedGain(meta) || isFuturesCashSettlement(meta) || isFuturesFeeEvent(meta)) {
    // For Koinly "Realized gain" SEND: V1 Path 2B logic (ignores proceeds, uses cost basis)
    // For SEND with isFuturesCashSettlement: this is trade-day MTM (negative = loss)
    // For FEE with isFuturesFee: this is futures commission (always a loss)
    costBasis = eventQty * position.averageCostPerUnit;
    realizedGain = -costBasis; // Fix #14: Use cost basis, NOT totalValue (matches V1 Path 2B)

    // Update position normally (USD balance changes)
    const newTotalQty = position.totalQuantity - eventQty;
    const newTotalCost = newTotalQty * newAvgCost;

    await db
      .update(averageCostPositions)
      .set({
        totalQuantity: newTotalQty.toFixed(8),
        totalCostBasis: newTotalCost.toFixed(2),
        averageCostPerUnit: newAvgCost.toFixed(8),
        lastUpdatedEventId: event.id,
        updatedAt: new Date(),
      })
      .where(eq(averageCostPositions.id, position.positionId));

    // Write cost basis to event_calculations (not events table)
    await upsertEventCalculation({
      eventId: event.id,
      userId: event.userId,
      costBasis: costBasis.toFixed(2),
      costBasisMethod: "average_cost",
      realizedGain: realizedGain.toFixed(2),
      holdingDays: 0,
      isLongTerm: false,
      averageCostUsed: position.averageCostPerUnit.toFixed(8),
    });

    return {
      position: {
        positionId: position.positionId,
        totalQuantity: newTotalQty,
        totalCostBasis: newTotalCost,
        averageCostPerUnit: newAvgCost,
        firstAcquisitionDate: position.firstAcquisitionDate,
      },
      costBasis,
      realizedGain,
    };
  }

  // Fix #11: Koinly transfers are cost-neutral (no realized gain)
  // Transfer SEND events have totalValue=$0 in Koinly CSV, which would produce
  // phantom losses of -(qty × avgCost). V1 correctly assigns $0 gain to transfers.
  // Reduce position quantity and proportional cost, but no gain.
  if (isKoinlyTransfer(meta)) {
    costBasis = eventQty * position.averageCostPerUnit;
    realizedGain = 0;

    const newTotalQty = position.totalQuantity - eventQty;
    const newTotalCost = newTotalQty * newAvgCost;

    await db
      .update(averageCostPositions)
      .set({
        totalQuantity: newTotalQty.toFixed(8),
        totalCostBasis: newTotalCost.toFixed(2),
        averageCostPerUnit: newAvgCost.toFixed(8),
        lastUpdatedEventId: event.id,
        updatedAt: new Date(),
      })
      .where(eq(averageCostPositions.id, position.positionId));

    // Write cost basis to event_calculations (not events table)
    await upsertEventCalculation({
      eventId: event.id,
      userId: event.userId,
      costBasis: costBasis.toFixed(2),
      costBasisMethod: "average_cost",
      realizedGain: "0",
      holdingDays: 0,
      isLongTerm: false,
      averageCostUsed: position.averageCostPerUnit.toFixed(8),
    });

    return {
      position: {
        positionId: position.positionId,
        totalQuantity: newTotalQty,
        totalCostBasis: newTotalCost,
        averageCostPerUnit: newAvgCost,
        firstAcquisitionDate: position.firstAcquisitionDate,
      },
      costBasis,
      realizedGain,
    };
  }

  if (position.totalQuantity < eventQty - EPSILON) {
    // Short sale or insufficient quantity - close remaining long then open short
    const longCloseQty = Math.max(0, position.totalQuantity);
    const shortOpenQty = eventQty - longCloseQty;

    // Cost basis for closing long portion
    const longCostBasis = longCloseQty * position.averageCostPerUnit;
    const longProceeds = longCloseQty > EPSILON ? proceeds * (longCloseQty / eventQty) : 0;

    // Short opening: cost basis is the proceeds
    const shortProceeds = shortOpenQty > EPSILON ? proceeds * (shortOpenQty / eventQty) : 0;
    const shortCostPerUnit = shortOpenQty > EPSILON ? shortProceeds / shortOpenQty : 0;

    costBasis = longCostBasis;

    if (isAdj) {
      // Fix #4: Adjustment disposal - V1 gainLoss = -(longCost + shortValue)
      realizedGain = -(longCostBasis + shortProceeds);
    } else {
      const longGain = longProceeds - longCostBasis;
      realizedGain = longGain;
    }

    // Fix #7: When extending an existing short position, compute weighted average
    // of existing short cost and new short cost. When flipping from long/zero to short,
    // just use the new sell's cost per unit.
    if (position.totalQuantity < -EPSILON) {
      // Already short - weighted average with existing short position
      const existingShortCost = Math.abs(position.totalCostBasis);
      const existingShortQty = Math.abs(position.totalQuantity);
      const totalShortCost = existingShortCost + shortProceeds;
      const totalShortQty = existingShortQty + shortOpenQty;
      newAvgCost = totalShortQty > EPSILON ? totalShortCost / totalShortQty : 0;
    } else {
      // Flipping from long/zero to short - use new sell's price
      newAvgCost = shortCostPerUnit;
    }
  } else {
    // Normal disposal from long position
    costBasis = eventQty * position.averageCostPerUnit;

    if (isAdj) {
      // Fix #4: Adjustment disposal - V1 gainLoss = -(avgCost × closeQty)
      realizedGain = -costBasis;
    } else {
      realizedGain = proceeds - costBasis;
    }
  }

  // Calculate holding period using first acquisition date (conservative)
  const holdingDays = position.firstAcquisitionDate
    ? Math.floor(
        (event.timestamp.getTime() - position.firstAcquisitionDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;
  const isLongTerm = holdingDays > LONG_TERM_DAYS;

  // Allow negative positions (short selling)
  const newTotalQty = position.totalQuantity - eventQty;
  const newTotalCost = newTotalQty * newAvgCost;

  await db
    .update(averageCostPositions)
    .set({
      totalQuantity: newTotalQty.toFixed(8),
      totalCostBasis: newTotalCost.toFixed(2),
      averageCostPerUnit: newAvgCost.toFixed(8),
      lastUpdatedEventId: event.id,
      updatedAt: new Date(),
    })
    .where(eq(averageCostPositions.id, position.positionId));

  // Write cost basis to event_calculations (not events table)
  await upsertEventCalculation({
    eventId: event.id,
    userId: event.userId,
    costBasis: costBasis.toFixed(2),
    costBasisMethod: "average_cost",
    realizedGain: realizedGain.toFixed(2),
    holdingDays,
    isLongTerm,
    averageCostUsed: position.averageCostPerUnit.toFixed(8),
  });

  return {
    position: {
      positionId: position.positionId,
      totalQuantity: newTotalQty,
      totalCostBasis: newTotalCost,
      averageCostPerUnit: newAvgCost,
      firstAcquisitionDate: position.firstAcquisitionDate,
    },
    costBasis,
    realizedGain,
  };
}

// ============================================================================
// Utility Functions for External Use
// ============================================================================

/**
 * Get the current average cost position for a specific scope
 */
export async function getAverageCostPosition(
  userId: string,
  assetId: string,
  owner: string,
  account: string
): Promise<AverageCostState | null> {
  const result = await db
    .select()
    .from(averageCostPositions)
    .where(
      and(
        eq(averageCostPositions.userId, userId),
        eq(averageCostPositions.assetId, assetId),
        eq(averageCostPositions.owner, owner),
        eq(averageCostPositions.account, account)
      )
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return {
    positionId: result[0].id,
    totalQuantity: parseFloat(result[0].totalQuantity),
    totalCostBasis: parseFloat(result[0].totalCostBasis),
    averageCostPerUnit: parseFloat(result[0].averageCostPerUnit),
    firstAcquisitionDate: result[0].firstAcquisitionDate ?? undefined,
  };
}

/**
 * Get all average cost positions for a user
 */
export async function getAllAverageCostPositions(
  userId: string
): Promise<AverageCostState[]> {
  const results = await db
    .select()
    .from(averageCostPositions)
    .where(eq(averageCostPositions.userId, userId));

  return results.map((r) => ({
    positionId: r.id,
    totalQuantity: parseFloat(r.totalQuantity),
    totalCostBasis: parseFloat(r.totalCostBasis),
    averageCostPerUnit: parseFloat(r.averageCostPerUnit),
    firstAcquisitionDate: r.firstAcquisitionDate ?? undefined,
  }));
}

/**
 * Recalculate average cost for a specific scope from scratch
 * Used when method changes or data needs to be rebuilt
 */
export async function recalculateAverageCost(
  userId: string,
  assetId: string,
  owner: string,
  account: string
): Promise<AverageCostState> {
  // Delete existing position
  await db
    .delete(averageCostPositions)
    .where(
      and(
        eq(averageCostPositions.userId, userId),
        eq(averageCostPositions.assetId, assetId),
        eq(averageCostPositions.owner, owner),
        eq(averageCostPositions.account, account)
      )
    );

  // Fetch all events for this scope in order
  const fetchedEvents = await db
    .select({
      id: events.id,
      userId: events.userId,
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      eventType: events.eventType,
      timestamp: events.timestamp,
      quantity: events.quantity,
      totalValue: events.totalValue,
      assetTicker: sql<string>`(SELECT ticker FROM assets WHERE id = ${events.assetId})`,
      costBasis: events.costBasis,
      source: events.source,
      metadata: events.metadata,
    })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.assetId, assetId),
        eq(events.owner, owner),
        eq(events.account, account),
        sql`${events.eventType} IN (${sql.join(
          [...ACQUISITION_EVENT_TYPES, ...DISPOSAL_EVENT_TYPES].map((t) => sql`${t}`),
          sql`, `
        )})`
      )
    )
    .orderBy(asc(events.timestamp), asc(events.id));

  // Create new position and process all events
  let position = await getOrCreatePosition(userId, assetId, owner, account);

  for (const event of fetchedEvents) {
    if (isAcquisition(event.eventType)) {
      position = await processAcquisition(position, event);
    } else if (isDisposal(event.eventType)) {
      const result = await processDisposal(position, event);
      position = result.position;
    }
  }

  return position;
}

// ============================================================================
// Optimized Batched Average Cost Calculation
// ============================================================================

/**
 * Result of pure (in-memory) event computation.
 * Contains the new position state and the event_calculation data to persist.
 */
interface AvgCostComputeResult {
  newPosition: AverageCostState;
  eventCalcData: UpsertEventCalculationData;
}

/**
 * Pure computation for acquisition events — no DB writes.
 * Replicates all the logic from processAcquisition but returns data instead of writing.
 */
function computeAcquisitionPure(
  position: AverageCostState,
  event: EventForAverageCost
): AvgCostComputeResult {
  const meta = parseEventMetadata(event.metadata);
  const eventQty = parseFloat(event.quantity);
  const rawTotalValue = parseFloat(event.totalValue);

  const isFut = isFuturesTradeEvent(meta, event.source);
  const isTransfer = isKoinlyTransfer(meta);

  const commission = meta.commission ?? 0;
  const eventCost = isFut ? 0
    : isTransfer ? (position.averageCostPerUnit * eventQty)
    : (rawTotalValue + commission);

  let newTotalQty: number;
  let newTotalCost: number;
  let newAvgCost: number;
  let shortCoverGain = 0;

  if (position.totalQuantity < -EPSILON) {
    const shortQty = Math.abs(position.totalQuantity);
    const coverQty = Math.min(eventQty, shortQty);
    const remainingBuyQty = eventQty - coverQty;

    const coverCost = eventCost * (coverQty / eventQty);
    const avgShortCost = Math.abs(position.averageCostPerUnit);
    const shortCostBasis = avgShortCost * coverQty;
    shortCoverGain = shortCostBasis - coverCost;

    if (remainingBuyQty > EPSILON) {
      const remainingCost = eventCost * (remainingBuyQty / eventQty);
      newTotalQty = remainingBuyQty;
      newTotalCost = remainingCost;
      newAvgCost = newTotalQty > EPSILON ? newTotalCost / newTotalQty : 0;
    } else {
      newTotalQty = position.totalQuantity + eventQty;
      newTotalCost = newTotalQty * position.averageCostPerUnit;
      newAvgCost = position.averageCostPerUnit;
    }
  } else {
    newTotalQty = position.totalQuantity + eventQty;
    newTotalCost = position.totalCostBasis + eventCost;
    newAvgCost = newTotalQty > EPSILON ? newTotalCost / newTotalQty : 0;
  }

  let realizedGain: number | undefined;
  if (isKoinlyRealizedGain(meta)) {
    realizedGain = rawTotalValue;
  } else if (isFuturesCashSettlement(meta)) {
    realizedGain = rawTotalValue;
  } else if (isAdjustmentType(meta)) {
    let accumulatedCostBasis: number;
    if (position.totalQuantity < -EPSILON) {
      const shortQty = Math.abs(position.totalQuantity);
      const coverQty = Math.min(eventQty, shortQty);
      const avgShortCost = Math.abs(position.averageCostPerUnit);
      accumulatedCostBasis = avgShortCost * coverQty;
      const remainingBuyQty = eventQty - coverQty;
      if (remainingBuyQty > EPSILON) {
        accumulatedCostBasis += eventCost * (remainingBuyQty / eventQty);
      }
    } else {
      accumulatedCostBasis = eventCost;
    }
    realizedGain = Math.abs(accumulatedCostBasis) > Math.abs(rawTotalValue)
      ? accumulatedCostBasis : rawTotalValue;
  } else if (Math.abs(shortCoverGain) > EPSILON) {
    realizedGain = shortCoverGain;
  }

  if (isFut && realizedGain === undefined) {
    realizedGain = 0;
  }

  const firstDate = position.firstAcquisitionDate ?? event.timestamp;

  const newPosition: AverageCostState = {
    positionId: position.positionId,
    totalQuantity: newTotalQty,
    totalCostBasis: newTotalCost,
    averageCostPerUnit: newAvgCost,
    firstAcquisitionDate: firstDate,
  };

  const eventCalcData: UpsertEventCalculationData = {
    eventId: event.id,
    userId: event.userId,
    costBasis: eventCost.toFixed(2),
    costBasisMethod: "average_cost",
    newAverageCost: newAvgCost.toFixed(8),
    ...(realizedGain !== undefined
      ? { realizedGain: realizedGain.toFixed(2) }
      : {}),
  };

  return { newPosition, eventCalcData };
}

/**
 * Pure computation for disposal events — no DB writes.
 * Replicates all the logic from processDisposal but returns data instead of writing.
 */
function computeDisposalPure(
  position: AverageCostState,
  event: EventForAverageCost
): AvgCostComputeResult {
  const meta = parseEventMetadata(event.metadata);
  const eventQty = parseFloat(event.quantity);
  const rawTotalValue = parseFloat(event.totalValue);

  const isFut = isFuturesTradeEvent(meta, event.source);
  const commission = meta.commission ?? 0;
  const proceeds = isFut ? 0 : (rawTotalValue - commission);
  const isAdj = isAdjustmentType(meta);

  let costBasis: number;
  let realizedGain: number;
  let newAvgCost = position.averageCostPerUnit;
  let holdingDays = 0;
  let isLongTerm = false;

  // Fix #10/#9: Koinly realized gain, futures cash settlement, futures fee
  if (isKoinlyRealizedGain(meta) || isFuturesCashSettlement(meta) || isFuturesFeeEvent(meta)) {
    costBasis = eventQty * position.averageCostPerUnit;
    realizedGain = -costBasis;

    const newTotalQty = position.totalQuantity - eventQty;
    const newTotalCost = newTotalQty * newAvgCost;

    return {
      newPosition: {
        positionId: position.positionId,
        totalQuantity: newTotalQty,
        totalCostBasis: newTotalCost,
        averageCostPerUnit: newAvgCost,
        firstAcquisitionDate: position.firstAcquisitionDate,
      },
      eventCalcData: {
        eventId: event.id,
        userId: event.userId,
        costBasis: costBasis.toFixed(2),
        costBasisMethod: "average_cost",
        realizedGain: realizedGain.toFixed(2),
        holdingDays: 0,
        isLongTerm: false,
        averageCostUsed: position.averageCostPerUnit.toFixed(8),
      },
    };
  }

  // Fix #11: Koinly transfers are cost-neutral
  if (isKoinlyTransfer(meta)) {
    costBasis = eventQty * position.averageCostPerUnit;
    realizedGain = 0;

    const newTotalQty = position.totalQuantity - eventQty;
    const newTotalCost = newTotalQty * newAvgCost;

    return {
      newPosition: {
        positionId: position.positionId,
        totalQuantity: newTotalQty,
        totalCostBasis: newTotalCost,
        averageCostPerUnit: newAvgCost,
        firstAcquisitionDate: position.firstAcquisitionDate,
      },
      eventCalcData: {
        eventId: event.id,
        userId: event.userId,
        costBasis: costBasis.toFixed(2),
        costBasisMethod: "average_cost",
        realizedGain: "0",
        holdingDays: 0,
        isLongTerm: false,
        averageCostUsed: position.averageCostPerUnit.toFixed(8),
      },
    };
  }

  if (position.totalQuantity < eventQty - EPSILON) {
    // Short sale or insufficient quantity
    const longCloseQty = Math.max(0, position.totalQuantity);
    const shortOpenQty = eventQty - longCloseQty;

    const longCostBasis = longCloseQty * position.averageCostPerUnit;
    const longProceeds = longCloseQty > EPSILON ? proceeds * (longCloseQty / eventQty) : 0;
    const shortProceeds = shortOpenQty > EPSILON ? proceeds * (shortOpenQty / eventQty) : 0;
    const shortCostPerUnit = shortOpenQty > EPSILON ? shortProceeds / shortOpenQty : 0;

    costBasis = longCostBasis;

    if (isAdj) {
      realizedGain = -(longCostBasis + shortProceeds);
    } else {
      realizedGain = longProceeds - longCostBasis;
    }

    if (position.totalQuantity < -EPSILON) {
      const existingShortCost = Math.abs(position.totalCostBasis);
      const existingShortQty = Math.abs(position.totalQuantity);
      const totalShortCost = existingShortCost + shortProceeds;
      const totalShortQty = existingShortQty + shortOpenQty;
      newAvgCost = totalShortQty > EPSILON ? totalShortCost / totalShortQty : 0;
    } else {
      newAvgCost = shortCostPerUnit;
    }
  } else {
    // Normal disposal from long position
    costBasis = eventQty * position.averageCostPerUnit;

    if (isAdj) {
      realizedGain = -costBasis;
    } else {
      realizedGain = proceeds - costBasis;
    }
  }

  // Calculate holding period
  if (position.firstAcquisitionDate) {
    holdingDays = Math.floor(
      (event.timestamp.getTime() - position.firstAcquisitionDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    isLongTerm = holdingDays > LONG_TERM_DAYS;
  }

  const newTotalQty = position.totalQuantity - eventQty;
  const newTotalCost = newTotalQty * newAvgCost;

  return {
    newPosition: {
      positionId: position.positionId,
      totalQuantity: newTotalQty,
      totalCostBasis: newTotalCost,
      averageCostPerUnit: newAvgCost,
      firstAcquisitionDate: position.firstAcquisitionDate,
    },
    eventCalcData: {
      eventId: event.id,
      userId: event.userId,
      costBasis: costBasis.toFixed(2),
      costBasisMethod: "average_cost",
      realizedGain: realizedGain.toFixed(2),
      holdingDays,
      isLongTerm,
      averageCostUsed: position.averageCostPerUnit.toFixed(8),
    },
  };
}

/**
 * Optimized average cost calculation that processes all events in memory
 * and batch-writes results. ~40x faster than the per-event version for remote DBs.
 *
 * Algorithm:
 * 1. Load all events for average cost accounts
 * 2. Group by scope (asset:owner:account)
 * 3. For each scope, process events in memory using pure computation
 * 4. Batch-write position updates and event_calculations
 */
export async function computeAverageCostBasisOptimized(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  const errors: CalcError[] = [];

  console.log(
    `[AvgCost] Starting OPTIMIZED average cost calculation for user ${ctx.userId}, incremental: ${ctx.incremental}`
  );

  // Find accounts that use average cost method
  const avgCostAccounts = await findAverageCostAccounts(ctx.userId);

  if (avgCostAccounts.length === 0) {
    console.log(`[AvgCost] No accounts use average cost method`);
    return { success: true, recordsProcessed: 0, duration: Date.now() - startTime, errors: [] };
  }

  console.log(`[AvgCost] Found ${avgCostAccounts.length} accounts: ${avgCostAccounts.join(", ")}`);

  // Get events for these accounts
  const fetchedEvents = await fetchEventsForAverageCost(ctx, avgCostAccounts);

  if (fetchedEvents.length === 0) {
    console.log(`[AvgCost] No events to process`);
    return { success: true, recordsProcessed: 0, duration: Date.now() - startTime, errors: [] };
  }

  console.log(`[AvgCost] Processing ${fetchedEvents.length} events in memory`);

  // Group events by scope
  const groups = groupEventsByScope(fetchedEvents);
  console.log(`[AvgCost] ${groups.size} scopes to process`);

  // Collect all pending writes
  const pendingCalcUpdates: UpsertEventCalculationData[] = [];
  const pendingPositionUpdates: Array<{
    positionId: string;
    totalQuantity: string;
    totalCostBasis: string;
    averageCostPerUnit: string;
    firstAcquisitionDate: Date | undefined;
    lastUpdatedEventId: string;
  }> = [];

  // Step 1: Create all positions upfront
  console.log(`[AvgCost] Creating positions for ${groups.size} scopes...`);
  const positionMap = new Map<string, AverageCostState>();
  const scopeKeys = [...groups.keys()];

  for (const scopeKey of scopeKeys) {
    const [assetId, owner, account] = scopeKey.split(":");
    const position = await getOrCreatePosition(ctx.userId, assetId, owner, account);
    positionMap.set(scopeKey, position);
  }
  console.log(`[AvgCost] Created ${positionMap.size} positions`);

  // Step 2: Process all events in memory (no DB writes)
  let scopeIndex = 0;
  for (const [scopeKey, scopeEvents] of groups) {
    let position = positionMap.get(scopeKey)!;
    let lastEventId = "";

    for (const event of scopeEvents) {
      try {
        let result: AvgCostComputeResult;
        if (isAcquisition(event.eventType)) {
          result = computeAcquisitionPure(position, event);
        } else if (isDisposal(event.eventType)) {
          result = computeDisposalPure(position, event);
        } else {
          continue;
        }

        position = result.newPosition;
        pendingCalcUpdates.push(result.eventCalcData);
        lastEventId = event.id;
        recordsProcessed++;
      } catch (error) {
        errors.push({
          eventId: event.id,
          assetId: event.assetId,
          message: `Average cost processing failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: "error",
        });
      }
    }

    // Record final position state for this scope
    if (lastEventId) {
      pendingPositionUpdates.push({
        positionId: position.positionId,
        totalQuantity: position.totalQuantity.toFixed(8),
        totalCostBasis: position.totalCostBasis.toFixed(2),
        averageCostPerUnit: position.averageCostPerUnit.toFixed(8),
        firstAcquisitionDate: position.firstAcquisitionDate,
        lastUpdatedEventId: lastEventId,
      });
    }

    scopeIndex++;
    if (scopeIndex % 100 === 0 || scopeIndex === groups.size) {
      console.log(
        `[AvgCost] Scopes processed: ${scopeIndex}/${groups.size}, events: ${recordsProcessed}/${fetchedEvents.length}`
      );
    }
  }

  console.log(
    `[AvgCost] In-memory processing complete. Writing ${pendingCalcUpdates.length} calc updates, ${pendingPositionUpdates.length} position updates`
  );

  // Step 3: Batch-write position updates
  console.log(`[AvgCost] Writing position updates...`);
  for (let i = 0; i < pendingPositionUpdates.length; i += 50) {
    const chunk = pendingPositionUpdates.slice(i, i + 50);
    for (const update of chunk) {
      await db
        .update(averageCostPositions)
        .set({
          totalQuantity: update.totalQuantity,
          totalCostBasis: update.totalCostBasis,
          averageCostPerUnit: update.averageCostPerUnit,
          firstAcquisitionDate: update.firstAcquisitionDate ?? null,
          lastUpdatedEventId: update.lastUpdatedEventId,
          updatedAt: new Date(),
        })
        .where(eq(averageCostPositions.id, update.positionId));
    }
    if ((i + 50) % 500 === 0 || i + 50 >= pendingPositionUpdates.length) {
      console.log(
        `[AvgCost]   Position updates: ${Math.min(i + 50, pendingPositionUpdates.length)}/${pendingPositionUpdates.length}`
      );
    }
  }

  // Step 4: Batch-write event calculations
  console.log(`[AvgCost] Writing event calculations...`);
  for (let i = 0; i < pendingCalcUpdates.length; i += 100) {
    const chunk = pendingCalcUpdates.slice(i, i + 100);
    for (const update of chunk) {
      await upsertEventCalculation(update);
    }
    if ((i + 100) % 2000 === 0 || i + 100 >= pendingCalcUpdates.length) {
      console.log(
        `[AvgCost]   Calc updates: ${Math.min(i + 100, pendingCalcUpdates.length)}/${pendingCalcUpdates.length}`
      );
    }
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[AvgCost] OPTIMIZED complete. Processed: ${recordsProcessed}, Errors: ${fatalErrors.length}, Duration: ${duration}ms`
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed,
    duration,
    errors,
  };
}
