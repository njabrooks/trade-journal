/**
 * Tax Lot Creation
 *
 * Creates tax lots for all events that create new positions.
 *
 * LONG LOTS:
 * - Created from BUY/RECEIVE events when they increase a long position
 * - Consumed by SELL events when closing a long position
 *
 * SHORT LOTS:
 * - Created from SELL events when they open/increase a short position (running_qty goes negative)
 * - Consumed by BUY events when covering a short position
 *
 * The key is the running quantity:
 * - running_qty >= 0: Long position
 * - running_qty < 0: Short position
 *
 * CRITICAL: This must be idempotent - re-running should not create duplicates.
 * We use ON CONFLICT DO NOTHING with the unique acquisitionEventId constraint.
 */

import { db } from "@/db";
import { events, eventCalculations, taxLots } from "@/db/schema";
import { eq, and, gt, lt, isNull, inArray, asc, sql, or } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError, LotCreationResult } from "./types";
import { ACQUISITION_EVENT_TYPES, DISPOSAL_EVENT_TYPES, isAcquisition, isDisposal } from "./types";

// ============================================================================
// Types
// ============================================================================

type LotType = "long" | "short";

interface LotCreationEvent {
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

interface LotInsertData {
  userId: string;
  assetId: string;
  owner: string;
  account: string;
  acquisitionEventId: string;
  acquisitionDate: Date;
  originalQuantity: string;
  consumedQuantity: string;
  remainingQuantity: string;
  costBasisPerUnit: string;
  totalCostBasis: string;
  remainingCostBasis: string;
  status: "open" | "closed" | "partial";
  lotType: LotType;
}

// ============================================================================
// Main Calculation Function
// ============================================================================

/**
 * Create tax lots for events that establish new positions.
 *
 * This handles both:
 * - Long lots: From BUY/RECEIVE when increasing long position
 * - Short lots: From SELL when opening/increasing short position
 *
 * The function is idempotent - it only creates lots for events that
 * don't already have an associated lot.
 */
export async function createTaxLots(ctx: CalcContext): Promise<LotCreationResult> {
  const startTime = Date.now();
  let lotsCreated = 0;
  let longLotsCreated = 0;
  let shortLotsCreated = 0;
  const errors: CalcError[] = [];

  console.log(
    `[LotCreation] Starting lot creation for user ${ctx.userId}, incremental: ${ctx.incremental}`
  );

  // Find events that might need lots (both acquisitions and disposals)
  const eventsWithoutLots = await findEventsWithoutLots(ctx);

  if (eventsWithoutLots.length === 0) {
    console.log(`[LotCreation] No new events need lots`);
    return {
      success: true,
      recordsProcessed: 0,
      lotsCreated: 0,
      duration: Date.now() - startTime,
      errors: [],
    };
  }

  console.log(
    `[LotCreation] Found ${eventsWithoutLots.length} events to evaluate for lot creation`
  );

  // Process events one by one (order matters for running quantity context)
  let processed = 0;
  const lotsToInsert: LotInsertData[] = [];

  for (const event of eventsWithoutLots) {
    try {
      const lotData = createLotDataFromEvent(event);
      if (lotData) {
        lotsToInsert.push(lotData);
        if (lotData.lotType === "long") {
          longLotsCreated++;
        } else {
          shortLotsCreated++;
        }
      }
    } catch (error) {
      errors.push({
        eventId: event.id,
        assetId: event.assetId,
        message: `Failed to create lot data: ${error instanceof Error ? error.message : String(error)}`,
        severity: "warning", // Changed to warning - some events legitimately don't create lots
      });
    }
    processed++;

    // Insert in batches of 100
    if (lotsToInsert.length >= 100) {
      const insertCount = await insertLotsBatch(lotsToInsert, errors);
      lotsCreated += insertCount;
      lotsToInsert.length = 0;
    }

    // Report progress
    if (processed % 500 === 0 || processed === eventsWithoutLots.length) {
      console.log(
        `[LotCreation] Progress: ${processed}/${eventsWithoutLots.length} events processed, ${lotsCreated} lots created (${longLotsCreated} long, ${shortLotsCreated} short)`
      );
      await ctx.stateMachine.setCalcPhase(ctx.batchId, "cost_basis", {
        subPhase: "lot_creation",
        processed,
        total: eventsWithoutLots.length,
      });
    }
  }

  // Insert remaining lots
  if (lotsToInsert.length > 0) {
    const insertCount = await insertLotsBatch(lotsToInsert, errors);
    lotsCreated += insertCount;
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[LotCreation] Completed. Lots created: ${lotsCreated} (${longLotsCreated} long, ${shortLotsCreated} short), Errors: ${fatalErrors.length}, Duration: ${duration}ms`
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed: processed,
    lotsCreated,
    duration,
    errors,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find events that might need lots (don't already have one)
 *
 * We look at both acquisition AND disposal events because:
 * - Acquisitions (BUY, RECEIVE) can create LONG lots
 * - Disposals (SELL) can create SHORT lots (when going negative)
 */
async function findEventsWithoutLots(
  ctx: CalcContext
): Promise<LotCreationEvent[]> {
  // Build query conditions - include both acquisitions and disposals
  const allEventTypes = [...ACQUISITION_EVENT_TYPES, ...DISPOSAL_EVENT_TYPES];

  const conditions = [
    eq(events.userId, ctx.userId),
    inArray(events.eventType, allEventTypes),
  ];

  if (ctx.incremental && ctx.startDate) {
    conditions.push(gt(events.timestamp, ctx.startDate));
  }

  // Add end date filter if specified (for year-by-year processing)
  if (ctx.endDate) {
    conditions.push(lt(events.timestamp, ctx.endDate));
  }

  // Query events that don't have lots yet, joining event_calculations for runningQuantity
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
      existingLotId: taxLots.id,
    })
    .from(events)
    .leftJoin(taxLots, eq(events.id, taxLots.acquisitionEventId))
    .leftJoin(
      eventCalculations,
      eq(events.id, eventCalculations.eventId)
    )
    .where(and(...conditions, isNull(taxLots.id)))
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
 * Determine if an event should create a lot, and if so, what kind.
 *
 * Uses running quantity to determine:
 * - BUY: Creates long lot for portion that increases long position (not covering short)
 * - SELL: Creates short lot for portion that opens/increases short position
 *
 * Returns null if the event doesn't create a lot (e.g., SELL just closes long, BUY just covers short)
 */
function createLotDataFromEvent(event: LotCreationEvent): LotInsertData | null {
  const quantity = parseFloat(event.quantity);
  const totalValue = parseFloat(event.totalValue);

  // Get running quantity from event_calculations (set by running_quantity phase)
  if (event.runningQuantity === null || event.runningQuantity === undefined) {
    throw new Error(`No runningQuantity in event_calculations for event ${event.id}`);
  }
  const runningQtyAfter = parseFloat(event.runningQuantity);

  // Calculate running quantity BEFORE this event
  // For acquisition: runningQty_before = runningQty_after - quantity
  // For disposal: runningQty_before = runningQty_after + quantity
  const isAcq = isAcquisition(event.eventType);
  const runningQtyBefore = isAcq
    ? runningQtyAfter - quantity
    : runningQtyAfter + quantity;

  // Determine what type of lot to create (if any)
  if (isAcq) {
    // BUY/RECEIVE event
    // Creates long lot for portion that increases long position
    // If running_qty_before < 0, some of this BUY is covering a short (no lot for that portion)

    const longPortionQty = runningQtyBefore >= 0
      ? quantity  // All goes to long lot
      : Math.max(0, runningQtyAfter); // Only the part above 0 is new long position

    if (longPortionQty <= 0) {
      // This BUY entirely covers a short position - no lot created
      // The FIFO matching will handle consuming short lots
      return null;
    }

    // Calculate proportional cost basis for the long portion
    const proportionLong = longPortionQty / quantity;
    const longCostBasis = totalValue * proportionLong;

    return createLotData(event, longPortionQty, longCostBasis, "long");

  } else if (isDisposal(event.eventType) && event.eventType === "SELL") {
    // SELL event - might create short lot
    // Creates short lot for portion that opens/increases short position
    // If running_qty_before > 0, some of this SELL is closing a long (no lot for that portion)

    const shortPortionQty = runningQtyBefore <= 0
      ? quantity // Already short, all of this adds to short
      : runningQtyAfter < 0
        ? Math.abs(runningQtyAfter) // Only the part below 0 is new short position
        : 0; // Still long after, no short lot

    if (shortPortionQty <= 0) {
      // This SELL entirely closes a long position - no lot created
      // The FIFO matching will handle consuming long lots
      return null;
    }

    // Calculate proportional cost basis (proceeds from short sale)
    const proportionShort = shortPortionQty / quantity;
    const shortProceeds = totalValue * proportionShort;

    return createLotData(event, shortPortionQty, shortProceeds, "short");

  } else {
    // SEND, FEE, etc. - don't create lots (they only close positions)
    // Exception: Could extend to handle SEND creating short if needed
    return null;
  }
}

/**
 * Create lot insert data
 */
function createLotData(
  event: LotCreationEvent,
  quantity: number,
  costBasis: number,
  lotType: LotType
): LotInsertData {
  // Calculate cost basis per unit
  const costBasisPerUnit = quantity > 0 ? costBasis / quantity : 0;

  // Validate quantity
  if (quantity <= 0) {
    throw new Error(`Invalid quantity ${quantity} for lot creation`);
  }

  // Format numbers with proper precision
  const quantityStr = formatQuantity(quantity);
  const costPerUnitStr = formatCurrency(costBasisPerUnit);
  const totalCostStr = formatCurrency(costBasis);

  return {
    userId: event.userId,
    assetId: event.assetId,
    owner: event.owner,
    account: event.account,
    acquisitionEventId: event.id,
    acquisitionDate: event.timestamp,
    originalQuantity: quantityStr,
    consumedQuantity: "0",
    remainingQuantity: quantityStr,
    costBasisPerUnit: costPerUnitStr,
    totalCostBasis: totalCostStr,
    remainingCostBasis: totalCostStr,
    status: "open",
    lotType,
  };
}

/**
 * Insert lots batch with error handling
 */
async function insertLotsBatch(
  lotsToInsert: LotInsertData[],
  errors: CalcError[]
): Promise<number> {
  if (lotsToInsert.length === 0) return 0;

  try {
    const result = await db
      .insert(taxLots)
      .values(lotsToInsert)
      .onConflictDoNothing({ target: taxLots.acquisitionEventId })
      .returning({ id: taxLots.id });

    return result.length;
  } catch (error) {
    errors.push({
      message: `Batch insert failed: ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
      context: {
        batchSize: lotsToInsert.length,
      },
    });
    return 0;
  }
}

/**
 * Format quantity with high precision for crypto
 */
function formatQuantity(value: number): string {
  // Use up to 8 decimal places for crypto, trim trailing zeros
  return value.toFixed(8).replace(/\.?0+$/, "") || "0";
}

/**
 * Format currency values with 2 decimal places
 */
function formatCurrency(value: number): string {
  return value.toFixed(2);
}

// ============================================================================
// Utility Functions for External Use
// ============================================================================

/**
 * Get all open lots for a specific scope (asset/owner/account)
 * Returns lots in FIFO order (oldest first)
 */
export async function getOpenLots(
  userId: string,
  assetId: string,
  owner: string,
  account: string,
  lotType?: LotType
): Promise<typeof taxLots.$inferSelect[]> {
  const conditions = [
    eq(taxLots.userId, userId),
    eq(taxLots.assetId, assetId),
    eq(taxLots.owner, owner),
    eq(taxLots.account, account),
    inArray(taxLots.status, ["open", "partial"]),
  ];

  if (lotType) {
    conditions.push(eq(taxLots.lotType, lotType));
  }

  return db
    .select()
    .from(taxLots)
    .where(and(...conditions))
    .orderBy(asc(taxLots.acquisitionDate), asc(taxLots.id));
}

/**
 * Get total open quantity for a specific scope
 */
export async function getOpenQuantity(
  userId: string,
  assetId: string,
  owner: string,
  account: string,
  lotType?: LotType
): Promise<number> {
  const conditions = [
    eq(taxLots.userId, userId),
    eq(taxLots.assetId, assetId),
    eq(taxLots.owner, owner),
    eq(taxLots.account, account),
    inArray(taxLots.status, ["open", "partial"]),
  ];

  if (lotType) {
    conditions.push(eq(taxLots.lotType, lotType));
  }

  const result = await db
    .select({
      total: sql<string>`SUM(${taxLots.remainingQuantity})`,
    })
    .from(taxLots)
    .where(and(...conditions));

  return parseFloat(result[0]?.total ?? "0");
}

/**
 * Count lots for a user
 */
export async function countLots(userId: string): Promise<{
  total: number;
  open: number;
  partial: number;
  closed: number;
  long: number;
  short: number;
}> {
  const results = await db
    .select({
      status: taxLots.status,
      lotType: taxLots.lotType,
      count: sql<number>`COUNT(*)`,
    })
    .from(taxLots)
    .where(eq(taxLots.userId, userId))
    .groupBy(taxLots.status, taxLots.lotType);

  const counts = { total: 0, open: 0, partial: 0, closed: 0, long: 0, short: 0 };

  for (const row of results) {
    const count = Number(row.count);
    counts.total += count;
    if (row.status === "open") counts.open += count;
    else if (row.status === "partial") counts.partial += count;
    else if (row.status === "closed") counts.closed += count;
    if (row.lotType === "long") counts.long += count;
    else if (row.lotType === "short") counts.short += count;
  }

  return counts;
}
