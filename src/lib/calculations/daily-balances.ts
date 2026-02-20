/**
 * Daily Balance Calculation
 *
 * Computes end-of-day balances for each (asset, owner, account) combination.
 * These balances are used for:
 * - Market value calculation
 * - Portfolio reporting
 * - Performance tracking
 *
 * The calculation:
 * 1. Identifies all unique (asset, owner, account) scopes
 * 2. For each scope, determines the date range (first event to today/endDate)
 * 3. Computes end-of-day quantity for each date
 * 4. Upserts records to portfolio_daily_balances table
 *
 * CRITICAL: This uses the running quantity from event_calculations,
 * so running_quantity calculation MUST run before this.
 */

import { db } from "@/db";
import { events, eventCalculations, portfolioDailyBalances, assets } from "@/db/schema";
import { eq, and, gt, sql, asc, lte } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError } from "./types";

// ============================================================================
// Types
// ============================================================================

interface ScopeInfo {
  assetId: string;
  owner: string;
  account: string;
  assetClass?: string | null;
  firstEventDate: Date;
  lastEventDate: Date;
}

interface DayBalance {
  date: string; // YYYY-MM-DD
  quantity: number;
}

interface AcbEntry {
  date: string; // YYYY-MM-DD
  acb: number;  // average cost per unit as of this date
}

interface BalanceInsert {
  userId: string;
  date: string;
  asset: string;
  accountType: string;
  owner: string;
  assetClass: string | null;
  quantity: string;
  bookValue: string | null;
}

// ============================================================================
// Main Calculation Function
// ============================================================================

/**
 * Compute daily balances for all (asset, owner, account) combinations
 */
export async function computeDailyBalances(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  const errors: CalcError[] = [];

  console.log(
    `[DailyBalances] Starting calculation for user ${ctx.userId}, incremental: ${ctx.incremental}`
  );

  // Get all unique scopes with their date ranges
  const scopes = await getUniqueScopes(ctx);

  if (scopes.length === 0) {
    console.log(`[DailyBalances] No scopes to process`);
    return {
      success: true,
      recordsProcessed: 0,
      duration: Date.now() - startTime,
      errors: [],
    };
  }

  console.log(`[DailyBalances] Found ${scopes.length} unique (asset, owner, account) scopes`);

  // Determine the calculation date range
  const endDate = ctx.endDate ?? new Date();
  const endDateStr = formatDate(endDate);

  // Process each scope
  for (const scope of scopes) {
    try {
      const scopeRecords = await processScope(ctx, scope, endDateStr);
      recordsProcessed += scopeRecords;
    } catch (error) {
      errors.push({
        assetId: scope.assetId,
        message: `Failed to process scope ${scope.assetId}/${scope.owner}/${scope.account}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        severity: "error",
        context: { scope },
      });
    }
  }

  // Report progress
  await ctx.stateMachine.setCalcPhase(ctx.batchId, "daily_balances", {
    processed: scopes.length,
    total: scopes.length,
  });

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[DailyBalances] Completed. Scopes: ${scopes.length}, Records: ${recordsProcessed}, Errors: ${fatalErrors.length}, Duration: ${duration}ms`
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
 * Get all unique (asset, owner, account) scopes that need processing
 */
async function getUniqueScopes(ctx: CalcContext): Promise<ScopeInfo[]> {
  // Build base conditions
  const conditions = [eq(events.userId, ctx.userId)];

  if (ctx.incremental && ctx.startDate) {
    conditions.push(gt(events.timestamp, ctx.startDate));
  }

  // Query distinct scopes with their date ranges
  const results = await db
    .select({
      assetId: events.assetId,
      owner: events.owner,
      account: events.account,
      firstEventDate: sql<Date>`MIN(${events.timestamp})`,
      lastEventDate: sql<Date>`MAX(${events.timestamp})`,
    })
    .from(events)
    .where(and(...conditions))
    .groupBy(events.assetId, events.owner, events.account);

  // Get asset class for each scope
  const scopesWithAssetClass: ScopeInfo[] = [];

  for (const result of results) {
    // Look up asset class
    const asset = await db
      .select({ assetClass: assets.assetClass })
      .from(assets)
      .where(eq(assets.id, result.assetId))
      .limit(1);

    scopesWithAssetClass.push({
      assetId: result.assetId,
      owner: result.owner,
      account: result.account,
      assetClass: asset[0]?.assetClass ?? null,
      firstEventDate: result.firstEventDate instanceof Date ? result.firstEventDate : new Date(result.firstEventDate),
      lastEventDate: result.lastEventDate instanceof Date ? result.lastEventDate : new Date(result.lastEventDate),
    });
  }

  return scopesWithAssetClass;
}

/**
 * Process a single scope - compute daily balances for all dates
 */
async function processScope(
  ctx: CalcContext,
  scope: ScopeInfo,
  endDateStr: string
): Promise<number> {
  // Determine start date for this scope
  let startDateStr: string;
  if (ctx.incremental && ctx.startDate) {
    // For incremental, start from the day after the last calculated date
    startDateStr = formatDate(ctx.startDate);
  } else {
    // For full recalc, start from first event
    startDateStr = formatDate(scope.firstEventDate);
  }

  // Get all events for this scope in chronological order, joining event_calculations
  // for runningQuantity and newAverageCost.
  //
  // CRITICAL: Must use the same tie-breaking sort order as running-quantity.ts
  // (disposals before acquisitions when timestamps are equal) so the "last event
  // of the day" picks up the correct final running quantity. Without this,
  // same-timestamp SELL+RECEIVE pairs (e.g. CBBTC wrap/unwrap) can produce
  // incorrect end-of-day balances.
  const scopeEvents = await db
    .select({
      timestamp: events.timestamp,
      runningQuantity: eventCalculations.runningQuantity,
      newAverageCost: eventCalculations.newAverageCost,
    })
    .from(events)
    .leftJoin(
      eventCalculations,
      eq(events.id, eventCalculations.eventId)
    )
    .where(
      and(
        eq(events.userId, ctx.userId),
        eq(events.assetId, scope.assetId),
        eq(events.owner, scope.owner),
        eq(events.account, scope.account)
      )
    )
    .orderBy(
      asc(events.timestamp),
      sql`CASE
        WHEN ${events.eventType} IN ('SELL', 'SEND', 'FEE', 'GIFT_OUT', 'LOST', 'EXPENSE') THEN 1
        WHEN ${events.eventType} IN ('BUY', 'RECEIVE', 'DIVIDEND', 'STAKING_REWARD', 'AIRDROP', 'GIFT_IN') THEN 2
        ELSE 3
      END`,
      asc(events.id)
    );

  if (scopeEvents.length === 0) {
    return 0;
  }

  // Build day-by-day balances
  // We use the last event of each day to get the end-of-day quantity
  const dayBalances = computeDayBalances(scopeEvents, startDateStr, endDateStr);

  if (dayBalances.length === 0) {
    return 0;
  }

  // Build ACB timeline from event_calculations.new_average_cost
  // For each date with ACB events, take the last event's ACB (end-of-day ACB)
  const acbTimeline = buildAcbTimeline(scopeEvents);

  // Prepare inserts — use historical ACB as-of each date for book_value
  const inserts: BalanceInsert[] = dayBalances.map((day) => {
    const qty = day.quantity.toFixed(8).replace(/\.?0+$/, "") || "0";
    const acbAsOfDate = findAcbAsOfDate(acbTimeline, day.date);
    const bookValue = acbAsOfDate !== null
      ? (day.quantity * acbAsOfDate).toFixed(2)
      : null;
    return {
      userId: ctx.userId,
      date: day.date,
      asset: scope.assetId,
      accountType: scope.account,
      owner: scope.owner,
      assetClass: scope.assetClass ?? null,
      quantity: qty,
      bookValue,
    };
  });

  // Upsert in batches
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);

    await db
      .insert(portfolioDailyBalances)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          portfolioDailyBalances.userId,
          portfolioDailyBalances.date,
          portfolioDailyBalances.asset,
          portfolioDailyBalances.accountType,
          portfolioDailyBalances.owner,
        ],
        set: {
          quantity: sql`EXCLUDED.quantity`,
          assetClass: sql`EXCLUDED.asset_class`,
          bookValue: sql`EXCLUDED.book_value`,
          updatedAt: sql`NOW()`,
        },
      });

    inserted += batch.length;
  }

  return inserted;
}

/**
 * Compute end-of-day balances from events
 *
 * For each day in the range:
 * - If events occurred on that day, use the last event's running quantity
 * - If no events, carry forward the previous day's quantity
 */
function computeDayBalances(
  eventRows: { timestamp: Date; runningQuantity: string | null }[],
  startDateStr: string,
  endDateStr: string
): DayBalance[] {
  // Build a map of date -> last running quantity for that day
  const dayQuantities = new Map<string, number>();

  for (const event of eventRows) {
    const dateStr = formatDate(event.timestamp);
    const runningQty = event.runningQuantity
      ? parseFloat(event.runningQuantity)
      : 0;

    // Always use the last event's quantity for each day
    dayQuantities.set(dateStr, runningQty);
  }

  // Generate daily balances for the date range
  const balances: DayBalance[] = [];
  let currentDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  let lastKnownQuantity = 0;

  // Get quantity before start date if incremental
  if (eventRows.length > 0) {
    const firstEventDate = formatDate(eventRows[0].timestamp);
    if (firstEventDate < startDateStr) {
      // Find the last event before start date
      for (const event of eventRows) {
        const dateStr = formatDate(event.timestamp);
        if (dateStr >= startDateStr) break;

        lastKnownQuantity = event.runningQuantity
          ? parseFloat(event.runningQuantity)
          : 0;
      }
    }
  }

  // Track whether the position has been open (non-zero) so we can record
  // the closing zero when quantity drops to 0, then stop emitting zeros
  let positionWasOpen = lastKnownQuantity > 0.00000001;

  while (currentDate <= endDate) {
    const dateStr = formatDate(currentDate);

    // Use day's quantity if we have events, otherwise carry forward
    if (dayQuantities.has(dateStr)) {
      lastKnownQuantity = dayQuantities.get(dateStr)!;
    }

    if (Math.abs(lastKnownQuantity) > 0.00000001) {
      // Non-zero balance — record it
      balances.push({ date: dateStr, quantity: lastKnownQuantity });
      positionWasOpen = true;
    } else if (positionWasOpen) {
      // Quantity just dropped to zero — record the closing balance
      // so downstream queries see qty=0 instead of stale non-zero
      balances.push({ date: dateStr, quantity: 0 });
      positionWasOpen = false;
    }
    // If positionWasOpen is false and qty is still 0, skip (no bloat)

    // Move to next day (use UTC to avoid DST/timezone drift with toISOString formatting)
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return balances;
}

/**
 * Build a chronological ACB timeline from events.
 * For each date with ACB-changing events, stores the end-of-day ACB.
 * Events are already sorted by (timestamp ASC, id ASC).
 */
function buildAcbTimeline(
  eventRows: { timestamp: Date; newAverageCost: string | null }[]
): AcbEntry[] {
  const dayAcb = new Map<string, number>();

  for (const event of eventRows) {
    if (event.newAverageCost == null) continue;
    const dateStr = formatDate(event.timestamp);
    // Last event of the day wins (events are in chronological order)
    dayAcb.set(dateStr, parseFloat(event.newAverageCost));
  }

  // Convert to sorted array for binary search
  const timeline: AcbEntry[] = [];
  dayAcb.forEach((acb, date) => {
    timeline.push({ date, acb });
  });
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  return timeline;
}

/**
 * Find the ACB as-of a given date using binary search on the timeline.
 * Returns the most recent ACB entry on or before the given date,
 * or null if no ACB entry exists before this date.
 */
function findAcbAsOfDate(timeline: AcbEntry[], date: string): number | null {
  if (timeline.length === 0) return null;

  // Binary search for the last entry with date <= target
  let lo = 0;
  let hi = timeline.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (timeline[mid].date <= date) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result >= 0 ? timeline[result].acb : null;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ============================================================================
// Utility Functions for External Use
// ============================================================================

/**
 * Get daily balance for a specific date and scope
 */
export async function getDailyBalance(
  userId: string,
  date: string,
  assetId: string,
  owner: string,
  account: string
): Promise<typeof portfolioDailyBalances.$inferSelect | null> {
  const result = await db
    .select()
    .from(portfolioDailyBalances)
    .where(
      and(
        eq(portfolioDailyBalances.userId, userId),
        eq(portfolioDailyBalances.date, date),
        eq(portfolioDailyBalances.asset, assetId),
        eq(portfolioDailyBalances.owner, owner),
        eq(portfolioDailyBalances.accountType, account)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get all balances for a user on a specific date
 */
export async function getBalancesForDate(
  userId: string,
  date: string
): Promise<typeof portfolioDailyBalances.$inferSelect[]> {
  return db
    .select()
    .from(portfolioDailyBalances)
    .where(
      and(
        eq(portfolioDailyBalances.userId, userId),
        eq(portfolioDailyBalances.date, date)
      )
    )
    .orderBy(
      asc(portfolioDailyBalances.asset),
      asc(portfolioDailyBalances.owner),
      asc(portfolioDailyBalances.accountType)
    );
}

/**
 * Get balance history for a specific scope
 */
export async function getBalanceHistory(
  userId: string,
  assetId: string,
  owner: string,
  account: string,
  startDate?: string,
  endDate?: string
): Promise<typeof portfolioDailyBalances.$inferSelect[]> {
  const conditions = [
    eq(portfolioDailyBalances.userId, userId),
    eq(portfolioDailyBalances.asset, assetId),
    eq(portfolioDailyBalances.owner, owner),
    eq(portfolioDailyBalances.accountType, account),
  ];

  if (startDate) {
    conditions.push(sql`${portfolioDailyBalances.date} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(lte(portfolioDailyBalances.date, endDate));
  }

  return db
    .select()
    .from(portfolioDailyBalances)
    .where(and(...conditions))
    .orderBy(asc(portfolioDailyBalances.date));
}

/**
 * Delete daily balances for a user (for full recalculation)
 */
export async function clearDailyBalances(
  userId: string,
  startDate?: string
): Promise<number> {
  const conditions = [eq(portfolioDailyBalances.userId, userId)];

  if (startDate) {
    conditions.push(sql`${portfolioDailyBalances.date} >= ${startDate}`);
  }

  const result = await db
    .delete(portfolioDailyBalances)
    .where(and(...conditions))
    .returning({ id: portfolioDailyBalances.id });

  return result.length;
}
