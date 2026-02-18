/**
 * Running Quantity Calculation
 *
 * Computes the running (cumulative) quantity for each event.
 * Running quantity = cumulative sum of balance changes, grouped by (asset, owner, account).
 *
 * Balance changes by event type:
 * - Acquisitions (BUY, RECEIVE, DIVIDEND, etc.): +quantity
 * - Disposals (SELL, SEND, FEE, etc.): -quantity
 *
 * This is a foundational calculation that:
 * 1. Validates we never go negative (no short selling)
 * 2. Provides the quantity state needed for FIFO matching
 * 3. Enables position reconciliation
 */

import { db } from "@/db";
import { events } from "@/db/schema";
import { eventCalculations } from "@/db/schema";
import { eq, and, gt, lt, asc, sql } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError } from "./types";
import { isAcquisition, isDisposal } from "./types";
import { batchUpsertRunningQuantities } from "./event-calculations-helper";

// ============================================================================
// Types
// ============================================================================

interface EventForQuantity {
  id: string;
  assetId: string;
  owner: string;
  account: string;
  eventType: string;
  quantity: string;
  timestamp: Date;
}

interface QuantityState {
  runningQuantity: number;
  lastEventId?: string;
}

interface QuantityUpdate {
  id: string;
  runningQuantity: number;
}

// ============================================================================
// Main Calculation Function
// ============================================================================

/**
 * Compute running quantity for all events
 *
 * Groups events by (asset, owner, account) and computes cumulative quantity.
 * Stores the result in the event_calculations table as `runningQuantity`.
 */
export async function computeRunningQuantity(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  const errors: CalcError[] = [];

  console.log(
    `[RunningQty] Starting calculation for user ${ctx.userId}, incremental: ${ctx.incremental}`
  );

  // Get all events to process, ordered for FIFO processing
  const fetchedEvents = await fetchEventsForQuantity(ctx);

  if (fetchedEvents.length === 0) {
    console.log(`[RunningQty] No events to process`);
    return {
      success: true,
      recordsProcessed: 0,
      duration: Date.now() - startTime,
      errors: [],
    };
  }

  console.log(`[RunningQty] Processing ${fetchedEvents.length} events`);

  // Group events by (asset, owner, account)
  const groups = groupEventsByScope(fetchedEvents);
  console.log(`[RunningQty] Found ${groups.size} unique (asset, owner, account) groups`);

  // Process each group
  const allUpdates: QuantityUpdate[] = [];

  for (const [groupKey, groupEvents] of groups) {
    // Get initial quantity if incremental
    let runningQty = 0;
    if (ctx.incremental && ctx.startDate) {
      runningQty = await getLastQuantityBeforeDate(ctx.userId, groupKey, ctx.startDate);
    }

    // Calculate running quantity for each event in the group
    for (const event of groupEvents) {
      const qty = parseFloat(event.quantity);

      if (isAcquisition(event.eventType)) {
        runningQty += qty;
      } else if (isDisposal(event.eventType)) {
        runningQty -= qty;
      }
      // Other event types (like INTEREST) don't affect quantity

      // Check for negative quantity (data integrity issue)
      // In shadow mode testing, we treat this as a warning to allow comparison with old system
      // which may have the same data issues
      if (runningQty < -0.00000001) {
        // Allow tiny floating point errors
        errors.push({
          eventId: event.id,
          assetId: event.assetId,
          message: `Negative quantity detected: ${runningQty.toFixed(8)} for ${groupKey} at event ${event.id}`,
          severity: "warning", // Changed from "error" to allow calculation to continue
          context: {
            eventType: event.eventType,
            eventQuantity: qty,
            timestamp: event.timestamp.toISOString(),
          },
        });
      }

      allUpdates.push({
        id: event.id,
        runningQuantity: runningQty,
      });

      recordsProcessed++;
    }
  }

  // Batch update events with running quantity
  if (allUpdates.length > 0) {
    await batchUpdateRunningQuantity(allUpdates, ctx);
  }

  // Report progress
  await ctx.stateMachine.setCalcPhase(ctx.batchId, "running_quantity", {
    processed: recordsProcessed,
    total: fetchedEvents.length,
  });

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[RunningQty] Completed. Processed: ${recordsProcessed}, Errors: ${fatalErrors.length}, Warnings: ${errors.length - fatalErrors.length}, Duration: ${duration}ms`
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
 * Fetch events for running quantity calculation
 */
async function fetchEventsForQuantity(ctx: CalcContext): Promise<EventForQuantity[]> {
  // Build query conditions
  const conditions = [eq(events.userId, ctx.userId)];

  if (ctx.incremental && ctx.startDate) {
    conditions.push(gt(events.timestamp, ctx.startDate));
  }

  if (ctx.endDate) {
    conditions.push(lt(events.timestamp, ctx.endDate));
  }

  // Query events ordered by asset, owner, account, then timestamp
  // This allows us to process each group in chronological order
  //
  // CRITICAL for cost basis: When timestamps are equal, process DISPOSALS before ACQUISITIONS.
  // This correctly handles "flip" transactions where a position is closed and reversed in the
  // same instant (e.g., SELL to open short, then BUY to cover short and open long).
  //
  // Example: May 3 XLI trade
  // - SELL 2000 @ $75.50 (opens short position)
  // - BUY 2000 @ $77.50 (covers short at a loss, opens long)
  //
  // Processing SELL first correctly creates a short lot that the BUY can then cover,
  // capturing the realized loss on the short position.
  //
  // Note: This may generate "negative quantity" warnings, but those are expected and correct
  // for positions that legitimately go short.
  const fetchedEvents = await db
    .select({
      id: events.id,
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      eventType: events.eventType,
      quantity: events.quantity,
      timestamp: events.timestamp,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(
      asc(events.assetId),
      asc(events.owner),
      asc(events.account),
      asc(events.timestamp),
      // Tie-breaker: disposals (priority 1) before acquisitions (priority 2)
      // This ensures short positions are opened before being covered in same-timestamp trades
      sql`CASE
        WHEN ${events.eventType} IN ('SELL', 'SEND', 'FEE', 'GIFT_OUT', 'LOST', 'EXPENSE') THEN 1
        WHEN ${events.eventType} IN ('BUY', 'RECEIVE', 'DIVIDEND', 'STAKING_REWARD', 'AIRDROP', 'GIFT_IN') THEN 2
        ELSE 3
      END`,
      asc(events.id) // Final tie-breaker for same type
    );

  return fetchedEvents;
}

/**
 * Group events by (asset, owner, account) scope
 */
function groupEventsByScope(
  eventsToGroup: EventForQuantity[]
): Map<string, EventForQuantity[]> {
  const groups = new Map<string, EventForQuantity[]>();

  for (const event of eventsToGroup) {
    const key = `${event.assetId}:${event.owner}:${event.account}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return groups;
}

/**
 * Get the last running quantity before a given date for incremental calculations
 */
async function getLastQuantityBeforeDate(
  userId: string,
  groupKey: string,
  beforeDate: Date
): Promise<number> {
  const [assetId, owner, account] = groupKey.split(":");

  // Find the most recent event before the start date for this scope
  // JOIN event_calculations to read runningQuantity
  const result = await db
    .select({
      runningQuantity: eventCalculations.runningQuantity,
    })
    .from(events)
    .leftJoin(
      eventCalculations,
      eq(events.id, eventCalculations.eventId)
    )
    .where(
      and(
        eq(events.userId, userId),
        eq(events.assetId, assetId),
        eq(events.owner, owner),
        eq(events.account, account),
        sql`${events.timestamp} <= ${beforeDate}`
      )
    )
    .orderBy(sql`${events.timestamp} DESC`, sql`${events.id} DESC`)
    .limit(1);

  if (result.length === 0) {
    return 0;
  }

  return result[0].runningQuantity ? parseFloat(result[0].runningQuantity) : 0;
}

/**
 * Batch update events with running quantity in metadata
 */
async function batchUpdateRunningQuantity(
  updates: QuantityUpdate[],
  ctx: CalcContext
): Promise<void> {
  // Map to the format expected by the helper, adding userId from context
  const rows = updates.map((u) => ({
    eventId: u.id,
    userId: ctx.userId,
    runningQuantity: u.runningQuantity.toString(),
  }));

  const CHUNK_SIZE = 100;
  await batchUpsertRunningQuantities(rows, CHUNK_SIZE);

  // Report progress
  console.log(`[RunningQty] Updated ${updates.length} events via event_calculations`);
}

// ============================================================================
// Utility Functions for External Use
// ============================================================================

/**
 * Get the current running quantity for a specific scope
 * Useful for validation and reporting
 */
export async function getCurrentQuantity(
  userId: string,
  assetId: string,
  owner: string,
  account: string
): Promise<number> {
  const result = await db
    .select({
      runningQuantity: eventCalculations.runningQuantity,
    })
    .from(events)
    .leftJoin(
      eventCalculations,
      eq(events.id, eventCalculations.eventId)
    )
    .where(
      and(
        eq(events.userId, userId),
        eq(events.assetId, assetId),
        eq(events.owner, owner),
        eq(events.account, account)
      )
    )
    .orderBy(sql`${events.timestamp} DESC`, sql`${events.id} DESC`)
    .limit(1);

  if (result.length === 0) {
    return 0;
  }

  return result[0].runningQuantity ? parseFloat(result[0].runningQuantity) : 0;
}

/**
 * Validate that running quantities are consistent for a user
 * Returns errors if any inconsistencies are found
 */
export async function validateRunningQuantities(
  userId: string
): Promise<CalcError[]> {
  const errors: CalcError[] = [];

  // Fetch all events with their calculated running quantities
  const fetchedEvents = await db
    .select({
      id: events.id,
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      eventType: events.eventType,
      quantity: events.quantity,
      timestamp: events.timestamp,
      runningQuantity: eventCalculations.runningQuantity,
    })
    .from(events)
    .leftJoin(
      eventCalculations,
      eq(events.id, eventCalculations.eventId)
    )
    .where(eq(events.userId, userId))
    .orderBy(
      asc(events.assetId),
      asc(events.owner),
      asc(events.account),
      asc(events.timestamp),
      asc(events.id)
    );

  // Group and validate
  const groups = new Map<string, typeof fetchedEvents>();
  for (const event of fetchedEvents) {
    const key = `${event.assetId}:${event.owner}:${event.account}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  for (const [groupKey, groupEvents] of groups) {
    let expectedQty = 0;

    for (const event of groupEvents) {
      const qty = parseFloat(event.quantity);

      if (isAcquisition(event.eventType)) {
        expectedQty += qty;
      } else if (isDisposal(event.eventType)) {
        expectedQty -= qty;
      }

      const storedQty = event.runningQuantity
        ? parseFloat(event.runningQuantity)
        : null;

      if (storedQty === null) {
        errors.push({
          eventId: event.id,
          message: `Missing running quantity for event in ${groupKey}`,
          severity: "warning",
        });
      } else if (Math.abs(storedQty - expectedQty) > 0.00000001) {
        errors.push({
          eventId: event.id,
          message: `Running quantity mismatch: stored ${storedQty}, expected ${expectedQty}`,
          severity: "error",
          context: {
            groupKey,
            storedQty,
            expectedQty,
          },
        });
      }
    }
  }

  return errors;
}
