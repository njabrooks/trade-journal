/**
 * FIFO Matching Engine
 *
 * This is the most critical calculation in the system - errors directly impact tax reporting.
 *
 * LONG POSITION CLOSING (SELL):
 * 1. Find all open LONG lots for the same asset/owner/account
 * 2. Order lots by acquisition date (oldest first = FIFO)
 * 3. Consume lots until the disposal quantity is satisfied
 * 4. Record each consumption with realized gain/loss = proceeds - cost basis
 *
 * SHORT POSITION CLOSING (BUY to cover):
 * 1. Find all open SHORT lots for the same asset/owner/account
 * 2. Order lots by acquisition date (oldest first = FIFO)
 * 3. Consume lots until the acquisition quantity is satisfied
 * 4. Record each consumption with realized gain/loss = short sale proceeds - cover cost
 *
 * CRITICAL INVARIANTS:
 * - Sum of consumption quantities must equal disposal/acquisition quantity
 * - No lot can go negative
 * - All lots for a match must be in the same scope (asset/owner/account)
 * - Lots can only be consumed by events AFTER their creation date
 */

import { db } from "@/db";
import { events, eventCalculations, taxLots, lotConsumptions } from "@/db/schema";
import { eq, and, gt, lt, lte, isNull, inArray, asc, sql } from "drizzle-orm";
import type {
  CalcContext,
  CalcResult,
  CalcError,
  FifoMatchResult,
  FifoMatchingResult,
  LotConsumptionRecord,
} from "./types";
import { DISPOSAL_EVENT_TYPES, ACQUISITION_EVENT_TYPES, isAcquisition, isDisposal } from "./types";
import { upsertEventCalculation, type UpsertEventCalculationData } from "./event-calculations-helper";

// ============================================================================
// Constants
// ============================================================================

/** Tiny epsilon for floating point comparisons */
const EPSILON = 0.00000001;

/** Days in a year for long-term capital gains determination */
const LONG_TERM_DAYS = 365;

// ============================================================================
// Types
// ============================================================================

type LotType = "long" | "short";

interface MatchableEvent {
  id: string;
  userId: string;
  assetId: string;
  owner: string;
  account: string;
  timestamp: Date;
  eventType: string;
  quantity: string;
  totalValue: string;
  price: string | null;
  runningQuantity: string | null; // From event_calculations table
}

interface OpenLot {
  id: string;
  acquisitionDate: Date;
  originalQuantity: string;
  consumedQuantity: string;
  remainingQuantity: string;
  costBasisPerUnit: string;
  lotType: LotType;
}

// ============================================================================
// Main Calculation Function
// ============================================================================

/**
 * Run FIFO matching for all events that need lot matching
 *
 * This handles:
 * - SELL events: Match to LONG lots (closing long position)
 * - BUY events: Match to SHORT lots (covering short position)
 *
 * This function is idempotent - it only matches events that
 * don't already have lot consumptions.
 */
export async function runFifoMatching(ctx: CalcContext): Promise<FifoMatchingResult> {
  const startTime = Date.now();
  let eventsMatched = 0;
  let incompleteMatches = 0;
  let totalRealizedGains = 0;
  let totalRealizedLosses = 0;
  const errors: CalcError[] = [];

  console.log(
    `[FifoMatching] Starting FIFO matching for user ${ctx.userId}, incremental: ${ctx.incremental}`
  );

  // Find events that haven't been matched yet
  const matchableEvents = await findUnmatchedEvents(ctx);

  if (matchableEvents.length === 0) {
    console.log(`[FifoMatching] No unmatched events`);
    return {
      success: true,
      recordsProcessed: 0,
      disposalsMatched: 0,
      incompleteMatches: 0,
      totalRealizedGains: 0,
      totalRealizedLosses: 0,
      duration: Date.now() - startTime,
      errors: [],
    };
  }

  console.log(
    `[FifoMatching] Found ${matchableEvents.length} events to match`
  );

  // Process each event
  console.log(`[FifoMatching] Starting to process events...`);

  for (let i = 0; i < matchableEvents.length; i++) {
    const event = matchableEvents[i];

    // Log first few events for debugging
    if (i < 5) {
      console.log(`[FifoMatching] Processing event ${i + 1}: event=${event.id}, type=${event.eventType}, asset=${event.assetId}, qty=${event.quantity}`);
    }

    try {
      const result = await matchEventToLots(event);

      if (result === null) {
        // Event doesn't need matching (e.g., BUY that doesn't cover short)
        continue;
      }

      if (!result.isComplete) {
        incompleteMatches++;
        errors.push({
          eventId: event.id,
          assetId: event.assetId,
          message: `Incomplete FIFO match: needed ${event.quantity}, only matched ${result.totalQuantityMatched.toFixed(8)}. Shortfall: ${result.shortfall?.toFixed(8)}`,
          severity: "warning", // Changed to warning - some shortfalls are expected for edge cases
          context: {
            owner: event.owner,
            account: event.account,
            timestamp: event.timestamp.toISOString(),
          },
        });
      }

      // Track realized gains/losses
      if (result.totalRealizedGain > 0) {
        totalRealizedGains += result.totalRealizedGain;
      } else {
        totalRealizedLosses += Math.abs(result.totalRealizedGain);
      }

      eventsMatched++;

      // Report progress
      if ((i + 1) % 50 === 0 || i === matchableEvents.length - 1) {
        console.log(
          `[FifoMatching] Progress: ${i + 1}/${matchableEvents.length} events processed, ${eventsMatched} matched, ${incompleteMatches} incomplete`
        );
        await ctx.stateMachine.setCalcPhase(ctx.batchId, "cost_basis", {
          subPhase: "fifo_matching",
          processed: i + 1,
          total: matchableEvents.length,
        });
      }
    } catch (error) {
      errors.push({
        eventId: event.id,
        assetId: event.assetId,
        message: `FIFO matching failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      });
    }
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[FifoMatching] Completed. Matched: ${eventsMatched}, Incomplete: ${incompleteMatches}, ` +
      `Gains: $${totalRealizedGains.toFixed(2)}, Losses: $${totalRealizedLosses.toFixed(2)}, ` +
      `Duration: ${duration}ms`
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed: eventsMatched,
    disposalsMatched: eventsMatched,
    incompleteMatches,
    totalRealizedGains,
    totalRealizedLosses,
    duration,
    errors,
  };
}

// ============================================================================
// Core FIFO Matching Logic
// ============================================================================

/**
 * Match a single event to available lots using FIFO
 *
 * Returns null if the event doesn't need matching (e.g., BUY that opens long, SELL that opens short)
 * Returns FifoMatchResult if matching was attempted
 */
async function matchEventToLots(event: MatchableEvent): Promise<FifoMatchResult | null> {
  const quantity = parseFloat(event.quantity);
  const totalValue = parseFloat(event.totalValue);

  // Get running quantity from event_calculations to determine position type
  if (event.runningQuantity === null || event.runningQuantity === undefined) {
    throw new Error(`No runningQuantity in event_calculations for event ${event.id}`);
  }
  const runningQtyAfter = parseFloat(event.runningQuantity);

  // Calculate running quantity BEFORE this event
  const isAcq = isAcquisition(event.eventType);
  const runningQtyBefore = isAcq
    ? runningQtyAfter - quantity
    : runningQtyAfter + quantity;

  // Determine what type of matching to do
  if (isDisposal(event.eventType)) {
    // SELL/SEND/FEE event - might close long position
    // Only match if we had a long position before
    if (runningQtyBefore <= 0) {
      // Was already short or zero - this SELL opens/adds to short, no matching needed
      return null;
    }

    // Calculate how much is closing long vs opening short
    const longCloseQty = Math.min(quantity, runningQtyBefore);
    const longCloseProceeds = (longCloseQty / quantity) * totalValue;

    if (longCloseQty <= EPSILON) {
      return null;
    }

    return await matchToLots(event, longCloseQty, longCloseProceeds, "long");

  } else if (isAcq) {
    // BUY/RECEIVE event - might cover short position
    // Only match if we had a short position before
    if (runningQtyBefore >= 0) {
      // Was already long or zero - this BUY opens/adds to long, no matching needed
      return null;
    }

    // Calculate how much is covering short vs opening long
    const shortCoverQty = Math.min(quantity, Math.abs(runningQtyBefore));
    const shortCoverCost = (shortCoverQty / quantity) * totalValue;

    if (shortCoverQty <= EPSILON) {
      return null;
    }

    return await matchToLots(event, shortCoverQty, shortCoverCost, "short");
  }

  return null;
}

/**
 * Match an event to lots of the specified type
 *
 * @param event The event consuming lots
 * @param qtyToMatch How much quantity to match
 * @param valueForMatch The value (proceeds for sell, cost for buy) for the matched portion
 * @param lotType Which type of lots to match against
 */
async function matchToLots(
  event: MatchableEvent,
  qtyToMatch: number,
  valueForMatch: number,
  lotType: LotType
): Promise<FifoMatchResult> {
  const matchStart = Date.now();

  return await db.transaction(async (tx) => {
    // Find open lots of the specified type in FIFO order
    const queryStart = Date.now();
    const availableLots = await tx
      .select({
        id: taxLots.id,
        acquisitionDate: taxLots.acquisitionDate,
        originalQuantity: taxLots.originalQuantity,
        consumedQuantity: taxLots.consumedQuantity,
        remainingQuantity: taxLots.remainingQuantity,
        costBasisPerUnit: taxLots.costBasisPerUnit,
        lotType: taxLots.lotType,
      })
      .from(taxLots)
      .where(
        and(
          eq(taxLots.userId, event.userId),
          eq(taxLots.assetId, event.assetId),
          eq(taxLots.owner, event.owner),
          eq(taxLots.account, event.account),
          eq(taxLots.lotType, lotType),
          inArray(taxLots.status, ["open", "partial"]),
          lte(taxLots.acquisitionDate, event.timestamp)
        )
      )
      .orderBy(asc(taxLots.acquisitionDate), asc(taxLots.id));

    const queryDuration = Date.now() - queryStart;
    console.log(`[FifoMatching] Query took ${queryDuration}ms, found ${availableLots.length} ${lotType} lots for event ${event.id.slice(0, 8)}`);

    let remainingToMatch = qtyToMatch;
    let totalCostBasis = 0;
    let totalRealizedGain = 0;
    const consumptions: LotConsumptionRecord[] = [];

    // Debug logging
    if (availableLots.length > 0) {
      console.log(`[FifoMatching] ${lotType.toUpperCase()} qty to match: ${qtyToMatch}, value: ${valueForMatch}`);
      for (let j = 0; j < Math.min(3, availableLots.length); j++) {
        const l = availableLots[j];
        console.log(`[FifoMatching]   Lot ${j}: remaining=${l.remainingQuantity}, costPerUnit=${l.costBasisPerUnit}`);
      }
    }

    for (const lot of availableLots) {
      if (remainingToMatch <= EPSILON) break;

      const lotRemaining = parseFloat(lot.remainingQuantity);
      const lotCostPerUnit = parseFloat(lot.costBasisPerUnit);

      // How much to take from this lot
      const consumeQty = Math.min(remainingToMatch, lotRemaining);

      // Skip if nothing to consume
      if (consumeQty <= EPSILON) {
        continue;
      }

      // Calculate cost basis and realized gain
      const consumeCostBasis = consumeQty * lotCostPerUnit;
      const consumeProceeds = (consumeQty / qtyToMatch) * valueForMatch;

      // Realized gain calculation depends on lot type:
      // - LONG lot: gain = proceeds - cost basis (selling higher than bought)
      // - SHORT lot: gain = short sale proceeds (lot cost) - cover cost (event value)
      //   For short: lot stores the short sale proceeds, event provides cover cost
      const consumeGain = lotType === "long"
        ? consumeProceeds - consumeCostBasis  // SELL: proceeds - what we paid
        : consumeCostBasis - consumeProceeds; // BUY to cover: what we sold for - what we paid to cover

      // Calculate holding period
      const holdingDays = calculateHoldingDays(lot.acquisitionDate, event.timestamp);
      const isLongTerm = holdingDays > LONG_TERM_DAYS;

      // Record consumption
      console.log(`[FifoMatching] Creating consumption: lot=${lot.id.slice(0, 8)}, qty=${consumeQty.toFixed(4)}, costBasis=${consumeCostBasis.toFixed(2)}, gain=${consumeGain.toFixed(2)}`);
      await tx.insert(lotConsumptions).values({
        lotId: lot.id,
        disposalEventId: event.id,
        quantity: consumeQty.toFixed(8),
        costBasis: consumeCostBasis.toFixed(2),
        proceeds: consumeProceeds.toFixed(2),
        realizedGain: consumeGain.toFixed(2),
        holdingDays,
        isLongTerm,
      });

      // Update lot quantities
      const newConsumed = parseFloat(lot.consumedQuantity) + consumeQty;
      const newRemaining = parseFloat(lot.originalQuantity) - newConsumed;
      const isClosed = newRemaining <= EPSILON;
      // When closing, snap to exact values to satisfy quantity_balance constraint
      const finalConsumed = isClosed ? parseFloat(lot.originalQuantity) : newConsumed;
      const finalRemaining = isClosed ? 0 : Math.max(0, newRemaining);
      const newRemainingCostBasis = Math.max(0, finalRemaining * lotCostPerUnit);

      await tx
        .update(taxLots)
        .set({
          consumedQuantity: finalConsumed.toFixed(8),
          remainingQuantity: finalRemaining.toFixed(8),
          remainingCostBasis: newRemainingCostBasis.toFixed(2),
          status: isClosed ? "closed" : "partial",
          updatedAt: new Date(),
        })
        .where(eq(taxLots.id, lot.id));

      // Track totals
      remainingToMatch -= consumeQty;
      totalCostBasis += consumeCostBasis;
      totalRealizedGain += consumeGain;

      consumptions.push({
        lotId: lot.id,
        quantity: consumeQty,
        costBasis: consumeCostBasis,
        proceeds: consumeProceeds,
        realizedGain: consumeGain,
        holdingDays,
        isLongTerm,
      });
    }

    // Write cost basis and realized gain to event_calculations (not events table)
    await upsertEventCalculation(
      {
        eventId: event.id,
        userId: event.userId,
        costBasis: totalCostBasis.toFixed(2),
        costBasisMethod: "fifo",
        realizedGain: totalRealizedGain.toFixed(2),
        fifoMatched: true,
        lotConsumptionsCount: consumptions.length,
        lotType: lotType,
      },
      tx
    );

    const result = {
      disposalEventId: event.id,
      totalQuantityMatched: qtyToMatch - remainingToMatch,
      totalCostBasis,
      totalProceeds: valueForMatch,
      totalRealizedGain,
      consumptions,
      isComplete: remainingToMatch <= EPSILON,
      shortfall: remainingToMatch > EPSILON ? remainingToMatch : undefined,
    };

    const totalDuration = Date.now() - matchStart;
    if (totalDuration > 1000) {
      console.log(`[FifoMatching] Slow match for event ${event.id.slice(0, 8)}: ${totalDuration}ms, ${consumptions.length} consumptions`);
    }

    return result;
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find events that haven't been matched to lots yet
 *
 * Includes both disposals (for long closing) and acquisitions (for short covering)
 */
async function findUnmatchedEvents(ctx: CalcContext): Promise<MatchableEvent[]> {
  // Build query conditions - include both disposals and acquisitions
  const allEventTypes = [...DISPOSAL_EVENT_TYPES, ...ACQUISITION_EVENT_TYPES];

  const conditions = [
    eq(events.userId, ctx.userId),
    isNull(events.deletedAt),
    inArray(events.eventType, allEventTypes),
  ];

  if (ctx.incremental && ctx.startDate) {
    conditions.push(gt(events.timestamp, ctx.startDate));
  }

  // Add end date filter if specified
  if (ctx.endDate) {
    conditions.push(lt(events.timestamp, ctx.endDate));
  }

  // Find events without matching lot consumptions, joining event_calculations for runningQuantity
  const results = await db
    .select({
      id: events.id,
      userId: events.userId,
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      timestamp: events.timestamp,
      eventType: events.eventType,
      quantity: events.quantity,
      totalValue: events.totalValue,
      price: events.price,
      runningQuantity: eventCalculations.runningQuantity,
      existingConsumption: lotConsumptions.id,
    })
    .from(events)
    .leftJoin(
      lotConsumptions,
      eq(events.id, lotConsumptions.disposalEventId)
    )
    .leftJoin(
      eventCalculations,
      eq(events.id, eventCalculations.eventId)
    )
    .where(and(...conditions, isNull(lotConsumptions.id)))
    .orderBy(asc(events.timestamp), asc(events.id));

  return results.map((r) => ({
    id: r.id,
    userId: r.userId,
    assetId: r.assetId,
    owner: r.owner,
    account: r.account,
    timestamp: r.timestamp,
    eventType: r.eventType,
    quantity: r.quantity,
    totalValue: r.totalValue,
    price: r.price,
    runningQuantity: r.runningQuantity,
  }));
}

/**
 * Calculate holding days between acquisition and disposal
 */
function calculateHoldingDays(acquisitionDate: Date, disposalDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(
    (disposalDate.getTime() - acquisitionDate.getTime()) / msPerDay
  );
}

// ============================================================================
// Utility Functions for External Use
// ============================================================================

/**
 * Get all lot consumptions for a disposal event
 */
export async function getConsumptionsForDisposal(
  disposalEventId: string
): Promise<typeof lotConsumptions.$inferSelect[]> {
  return db
    .select()
    .from(lotConsumptions)
    .where(eq(lotConsumptions.disposalEventId, disposalEventId))
    .orderBy(asc(lotConsumptions.createdAt));
}

/**
 * Get all lot consumptions for a lot
 */
export async function getConsumptionsForLot(
  lotId: string
): Promise<typeof lotConsumptions.$inferSelect[]> {
  return db
    .select()
    .from(lotConsumptions)
    .where(eq(lotConsumptions.lotId, lotId))
    .orderBy(asc(lotConsumptions.createdAt));
}

/**
 * Calculate total realized gain/loss for a user in a date range
 */
export async function getTotalRealizedGainLoss(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  shortTermGain: number;
  shortTermLoss: number;
  longTermGain: number;
  longTermLoss: number;
  total: number;
}> {
  const conditions = [eq(events.userId, userId), isNull(events.deletedAt)];

  if (startDate) {
    conditions.push(sql`${events.timestamp} >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(sql`${events.timestamp} < ${endDate}`);
  }

  const results = await db
    .select({
      isLongTerm: lotConsumptions.isLongTerm,
      realizedGain: lotConsumptions.realizedGain,
    })
    .from(lotConsumptions)
    .innerJoin(events, eq(lotConsumptions.disposalEventId, events.id))
    .where(and(...conditions));

  let shortTermGain = 0;
  let shortTermLoss = 0;
  let longTermGain = 0;
  let longTermLoss = 0;

  for (const row of results) {
    const gain = parseFloat(row.realizedGain);
    if (row.isLongTerm) {
      if (gain > 0) longTermGain += gain;
      else longTermLoss += Math.abs(gain);
    } else {
      if (gain > 0) shortTermGain += gain;
      else shortTermLoss += Math.abs(gain);
    }
  }

  return {
    shortTermGain,
    shortTermLoss,
    longTermGain,
    longTermLoss,
    total: shortTermGain - shortTermLoss + longTermGain - longTermLoss,
  };
}

/**
 * Validate FIFO matching consistency for a user
 */
export async function validateFifoConsistency(
  userId: string
): Promise<CalcError[]> {
  const errors: CalcError[] = [];

  // Check 1: Lot quantity balance
  const imbalancedLots = await db.execute(sql`
    SELECT id, original_quantity, consumed_quantity, remaining_quantity
    FROM tax_lots
    WHERE user_id = ${userId}
      AND ABS(remaining_quantity::numeric - (original_quantity::numeric - consumed_quantity::numeric)) > 0.00000001
  `);

  for (const lot of imbalancedLots as any[]) {
    errors.push({
      lotId: lot.id,
      message: `Lot quantity imbalance: original=${lot.original_quantity}, consumed=${lot.consumed_quantity}, remaining=${lot.remaining_quantity}`,
      severity: "error",
    });
  }

  // Check 2: Negative remaining quantities
  const negativeLots = await db.execute(sql`
    SELECT id, remaining_quantity
    FROM tax_lots
    WHERE user_id = ${userId}
      AND remaining_quantity::numeric < -0.00000001
  `);

  for (const lot of negativeLots as any[]) {
    errors.push({
      lotId: lot.id,
      message: `Lot has negative remaining quantity: ${lot.remaining_quantity}`,
      severity: "error",
    });
  }

  return errors;
}

// ============================================================================
// Optimized In-Memory FIFO Matching
// ============================================================================

/**
 * In-memory lot representation for fast FIFO matching.
 * Mutable — consumed/remaining fields are updated during matching.
 */
interface InMemoryLot {
  id: string;
  acquisitionDate: Date;
  originalQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  costBasisPerUnit: number;
  lotType: LotType;
}

/** Pending lot consumption to be batch-written */
interface PendingConsumption {
  lotId: string;
  disposalEventId: string;
  quantity: string;
  costBasis: string;
  proceeds: string;
  realizedGain: string;
  holdingDays: number;
  isLongTerm: boolean;
}

/** Pending lot update to be batch-written */
interface PendingLotUpdate {
  lotId: string;
  consumedQuantity: string;
  remainingQuantity: string;
  remainingCostBasis: string;
  status: "open" | "partial" | "closed";
}

/**
 * Optimized FIFO matching that loads all data into memory, processes matches,
 * and batch-writes results. ~100x faster than per-event DB queries for remote DBs.
 *
 * Algorithm:
 * 1. Load all lots into memory (Map by scope key)
 * 2. Load all events with running quantities
 * 3. Process events chronologically, matching against in-memory lots
 * 4. Batch-write consumptions, lot updates, and event_calculations
 */
export async function runFifoMatchingOptimized(ctx: CalcContext): Promise<FifoMatchingResult> {
  const startTime = Date.now();
  let eventsMatched = 0;
  let incompleteMatches = 0;
  let totalRealizedGains = 0;
  let totalRealizedLosses = 0;
  const errors: CalcError[] = [];

  console.log(`[FifoMatching] Starting OPTIMIZED in-memory FIFO matching for user ${ctx.userId}`);

  // Step 1: Load all lots into memory
  console.log(`[FifoMatching] Loading lots into memory...`);
  const allLots = await db
    .select({
      id: taxLots.id,
      assetId: taxLots.assetId,
      owner: taxLots.owner,
      account: taxLots.account,
      acquisitionDate: taxLots.acquisitionDate,
      originalQuantity: taxLots.originalQuantity,
      consumedQuantity: taxLots.consumedQuantity,
      remainingQuantity: taxLots.remainingQuantity,
      costBasisPerUnit: taxLots.costBasisPerUnit,
      lotType: taxLots.lotType,
      status: taxLots.status,
    })
    .from(taxLots)
    .where(eq(taxLots.userId, ctx.userId))
    .orderBy(asc(taxLots.acquisitionDate), asc(taxLots.id));

  // Build lots map: scopeKey → InMemoryLot[] (only open/partial lots)
  const lotsMap = new Map<string, InMemoryLot[]>();
  let totalOpenLots = 0;
  for (const lot of allLots) {
    if (lot.status === "closed") continue;
    const key = `${lot.assetId}:${lot.owner}:${lot.account}:${lot.lotType}`;
    if (!lotsMap.has(key)) lotsMap.set(key, []);
    lotsMap.get(key)!.push({
      id: lot.id,
      acquisitionDate: lot.acquisitionDate,
      originalQuantity: parseFloat(lot.originalQuantity),
      consumedQuantity: parseFloat(lot.consumedQuantity),
      remainingQuantity: parseFloat(lot.remainingQuantity),
      costBasisPerUnit: parseFloat(lot.costBasisPerUnit),
      lotType: lot.lotType as LotType,
    });
    totalOpenLots++;
  }
  console.log(`[FifoMatching] Loaded ${allLots.length} total lots, ${totalOpenLots} open/partial across ${lotsMap.size} scopes`);

  // Step 2: Load all matchable events with running quantities
  console.log(`[FifoMatching] Loading events...`);
  const allEventTypes = [...DISPOSAL_EVENT_TYPES, ...ACQUISITION_EVENT_TYPES];
  const conditions = [
    eq(events.userId, ctx.userId),
    isNull(events.deletedAt),
    inArray(events.eventType, allEventTypes),
  ];
  if (ctx.incremental && ctx.startDate) {
    conditions.push(gt(events.timestamp, ctx.startDate));
  }
  if (ctx.endDate) {
    conditions.push(lt(events.timestamp, ctx.endDate));
  }

  const matchableEvents = await db
    .select({
      id: events.id,
      userId: events.userId,
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      timestamp: events.timestamp,
      eventType: events.eventType,
      quantity: events.quantity,
      totalValue: events.totalValue,
      price: events.price,
      runningQuantity: eventCalculations.runningQuantity,
      existingFifoMatched: eventCalculations.fifoMatched,
    })
    .from(events)
    .leftJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .where(and(...conditions))
    .orderBy(asc(events.timestamp), asc(events.id));

  // Filter to unmatched events only
  const unmatchedEvents = matchableEvents.filter(e => !e.existingFifoMatched);
  console.log(`[FifoMatching] Loaded ${matchableEvents.length} events, ${unmatchedEvents.length} unmatched`);

  // Step 3: Process events in memory
  const pendingConsumptions: PendingConsumption[] = [];
  const pendingLotUpdates = new Map<string, PendingLotUpdate>();
  const pendingCalcUpdates: UpsertEventCalculationData[] = [];

  for (let i = 0; i < unmatchedEvents.length; i++) {
    const event = unmatchedEvents[i];
    const quantity = parseFloat(event.quantity);
    const totalValue = parseFloat(event.totalValue);

    if (event.runningQuantity === null || event.runningQuantity === undefined) continue;

    const runningQtyAfter = parseFloat(event.runningQuantity);
    const isAcq = isAcquisition(event.eventType);
    const runningQtyBefore = isAcq ? runningQtyAfter - quantity : runningQtyAfter + quantity;

    let lotType: LotType;
    let qtyToMatch: number;
    let valueForMatch: number;

    if (isDisposal(event.eventType)) {
      if (runningQtyBefore <= 0) continue;
      lotType = "long";
      qtyToMatch = Math.min(quantity, runningQtyBefore);
      valueForMatch = (qtyToMatch / quantity) * totalValue;
    } else if (isAcq) {
      if (runningQtyBefore >= 0) continue;
      lotType = "short";
      qtyToMatch = Math.min(quantity, Math.abs(runningQtyBefore));
      valueForMatch = (qtyToMatch / quantity) * totalValue;
    } else {
      continue;
    }

    if (qtyToMatch <= EPSILON) continue;

    // Find lots in memory
    const scopeKey = `${event.assetId}:${event.owner}:${event.account}:${lotType}`;
    const scopeLots = lotsMap.get(scopeKey);
    if (!scopeLots || scopeLots.length === 0) {
      incompleteMatches++;
      errors.push({
        eventId: event.id,
        assetId: event.assetId,
        message: `No ${lotType} lots available for matching. Needed: ${qtyToMatch.toFixed(8)}`,
        severity: "warning",
      });
      continue;
    }

    // Match against lots in FIFO order (in-memory)
    let remainingToMatch = qtyToMatch;
    let totalCostBasis = 0;
    let totalRealizedGain = 0;
    const eventConsumptions: PendingConsumption[] = [];

    for (const lot of scopeLots) {
      if (remainingToMatch <= EPSILON) break;
      if (lot.remainingQuantity <= EPSILON) continue;
      if (lot.acquisitionDate > event.timestamp) continue;

      const consumeQty = Math.min(remainingToMatch, lot.remainingQuantity);
      if (consumeQty <= EPSILON) continue;

      const consumeCostBasis = consumeQty * lot.costBasisPerUnit;
      const consumeProceeds = (consumeQty / qtyToMatch) * valueForMatch;
      const consumeGain = lotType === "long"
        ? consumeProceeds - consumeCostBasis
        : consumeCostBasis - consumeProceeds;

      const holdingDays = calculateHoldingDays(lot.acquisitionDate, event.timestamp);
      const isLongTerm = holdingDays > LONG_TERM_DAYS;

      // Update lot in memory
      lot.consumedQuantity += consumeQty;
      lot.remainingQuantity -= consumeQty;

      // Record pending writes
      eventConsumptions.push({
        lotId: lot.id,
        disposalEventId: event.id,
        quantity: consumeQty.toFixed(8),
        costBasis: consumeCostBasis.toFixed(2),
        proceeds: consumeProceeds.toFixed(2),
        realizedGain: consumeGain.toFixed(2),
        holdingDays,
        isLongTerm,
      });

      // Track lot update (latest state wins)
      const newRemaining = Math.max(0, lot.remainingQuantity);
      const isClosed = newRemaining <= EPSILON;
      // When closing, snap to exact values to satisfy quantity_balance constraint
      // (avoids float precision drift on large quantities like 329M KIN)
      const finalConsumed = isClosed ? lot.originalQuantity : lot.consumedQuantity;
      const finalRemaining = isClosed ? 0 : newRemaining;
      const newRemainingCostBasis = Math.max(0, finalRemaining * lot.costBasisPerUnit);
      pendingLotUpdates.set(lot.id, {
        lotId: lot.id,
        consumedQuantity: finalConsumed.toFixed(8),
        remainingQuantity: finalRemaining.toFixed(8),
        remainingCostBasis: newRemainingCostBasis.toFixed(2),
        status: isClosed ? "closed" : "partial",
      });

      remainingToMatch -= consumeQty;
      totalCostBasis += consumeCostBasis;
      totalRealizedGain += consumeGain;
    }

    if (remainingToMatch > EPSILON) {
      incompleteMatches++;
      errors.push({
        eventId: event.id,
        assetId: event.assetId,
        message: `Incomplete FIFO match: needed ${qtyToMatch.toFixed(8)}, matched ${(qtyToMatch - remainingToMatch).toFixed(8)}. Shortfall: ${remainingToMatch.toFixed(8)}`,
        severity: "warning",
      });
    }

    pendingConsumptions.push(...eventConsumptions);

    // Track event calculation update
    pendingCalcUpdates.push({
      eventId: event.id,
      userId: event.userId,
      costBasis: totalCostBasis.toFixed(2),
      costBasisMethod: "fifo",
      realizedGain: totalRealizedGain.toFixed(2),
      fifoMatched: true,
      lotConsumptionsCount: eventConsumptions.length,
      lotType: lotType,
    });

    if (totalRealizedGain > 0) {
      totalRealizedGains += totalRealizedGain;
    } else {
      totalRealizedLosses += Math.abs(totalRealizedGain);
    }
    eventsMatched++;

    if ((i + 1) % 2000 === 0) {
      console.log(`[FifoMatching] Progress: ${i + 1}/${unmatchedEvents.length} events, ${eventsMatched} matched, ${pendingConsumptions.length} consumptions`);
    }
  }

  console.log(`[FifoMatching] In-memory matching complete. Writing ${pendingConsumptions.length} consumptions, ${pendingLotUpdates.size} lot updates, ${pendingCalcUpdates.length} calc updates`);

  // Step 4: Batch-write consumptions
  if (pendingConsumptions.length > 0) {
    console.log(`[FifoMatching] Writing consumptions...`);
    const CHUNK_SIZE = 100;
    for (let i = 0; i < pendingConsumptions.length; i += CHUNK_SIZE) {
      const chunk = pendingConsumptions.slice(i, i + CHUNK_SIZE);
      await db.insert(lotConsumptions).values(chunk);
      if ((i + CHUNK_SIZE) % 1000 === 0 || i + CHUNK_SIZE >= pendingConsumptions.length) {
        console.log(`[FifoMatching]   Consumptions written: ${Math.min(i + CHUNK_SIZE, pendingConsumptions.length)}/${pendingConsumptions.length}`);
      }
    }
  }

  // Step 5: Batch-write lot updates
  if (pendingLotUpdates.size > 0) {
    console.log(`[FifoMatching] Writing lot updates...`);
    const updates = Array.from(pendingLotUpdates.values());
    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50);
      for (const update of chunk) {
        await db
          .update(taxLots)
          .set({
            consumedQuantity: update.consumedQuantity,
            remainingQuantity: update.remainingQuantity,
            remainingCostBasis: update.remainingCostBasis,
            status: update.status,
            updatedAt: new Date(),
          })
          .where(eq(taxLots.id, update.lotId));
      }
      if ((i + 50) % 500 === 0 || i + 50 >= updates.length) {
        console.log(`[FifoMatching]   Lot updates written: ${Math.min(i + 50, updates.length)}/${updates.length}`);
      }
    }
  }

  // Step 6: Batch-write event calculations
  if (pendingCalcUpdates.length > 0) {
    console.log(`[FifoMatching] Writing event calculations...`);
    for (let i = 0; i < pendingCalcUpdates.length; i += 100) {
      const chunk = pendingCalcUpdates.slice(i, i + 100);
      for (const update of chunk) {
        await upsertEventCalculation(update);
      }
      if ((i + 100) % 1000 === 0 || i + 100 >= pendingCalcUpdates.length) {
        console.log(`[FifoMatching]   Calc updates written: ${Math.min(i + 100, pendingCalcUpdates.length)}/${pendingCalcUpdates.length}`);
      }
    }
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[FifoMatching] OPTIMIZED complete. Matched: ${eventsMatched}, Incomplete: ${incompleteMatches}, ` +
      `Gains: $${totalRealizedGains.toFixed(2)}, Losses: $${totalRealizedLosses.toFixed(2)}, ` +
      `Duration: ${duration}ms`
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed: eventsMatched,
    disposalsMatched: eventsMatched,
    incompleteMatches,
    totalRealizedGains,
    totalRealizedLosses,
    duration,
    errors,
  };
}
