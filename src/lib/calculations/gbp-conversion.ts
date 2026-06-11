/**
 * GBP Conversion Engine Phase
 *
 * Computes GBP equivalents for every event using historical FX rates.
 * Maintains a parallel GBP cost pool per (asset, owner, account) scope
 * that mirrors the USD average cost engine.
 *
 * This phase runs after average_cost_basis and before daily_balances.
 * The GBP values stored here feed:
 * - M5d: daily_balances bookValueGbp computation
 * - M5e: Dashboard currency toggle
 * - M6: UK Section 104 cost basis (uses totalValueGbp as input)
 *
 * Part of M5: Base Currency Support.
 */

import { db } from "@/db";
import { events, eventCalculations } from "@/db/schema";
import { eq, and, isNull, asc, sql } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError } from "./types";
import { isAcquisition, isDisposal, ACQUISITION_EVENT_TYPES, DISPOSAL_EVENT_TYPES } from "./types";
import { upsertEventCalculation, type UpsertEventCalculationData } from "./event-calculations-helper";
import { getFxRateSeries } from "@/lib/fx/get-fx-rate";

// ============================================================================
// Types
// ============================================================================

interface EventForGbpConversion {
  id: string;
  userId: string;
  assetId: string;
  owner: string;
  account: string;
  eventType: string;
  timestamp: Date;
  quantity: string;
  totalValue: string;
  costBasis: string | null;
  source: string | null;
  metadata: unknown;
  // Joined from event_calculations
  usdCostBasis: string | null;
  usdRealizedGain: string | null;
  usdNewAverageCost: string | null;
}

interface GbpCostPoolState {
  totalQuantity: number;
  totalCostGbp: number;
  averageCostGbp: number;
}

interface GbpConversionStats {
  recoveredFromMetadata: number; // Events where exact original GBP was recovered
  convertedViaTable: number;     // Events converted via fx_rates table
}

// Helper types for metadata parsing
export interface EventMetadata {
  commission?: number;
  ibkrAssetClass?: string;
  activityCode?: string;
  isFuturesCashSettlement?: boolean;
  isFuturesFee?: boolean;
  tag?: string;
  koinlyType?: string;
  // FX fields for exact GBP recovery (avoids round-trip drift)
  originalCurrency?: string;
  fxRateToBase?: number;
  baseCurrencyDivisor?: number;
}

export function parseEventMetadata(metadata: unknown): EventMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  return {
    commission: typeof m.commission === "number" ? m.commission : undefined,
    ibkrAssetClass: typeof m.ibkrAssetClass === "string" ? m.ibkrAssetClass : undefined,
    activityCode: typeof m.activityCode === "string" ? m.activityCode : undefined,
    isFuturesCashSettlement: m.isFuturesCashSettlement === true,
    isFuturesFee: m.isFuturesFee === true,
    tag: typeof m.tag === "string" ? m.tag : undefined,
    koinlyType: typeof m.koinlyType === "string" ? m.koinlyType : undefined,
    originalCurrency: typeof m.originalCurrency === "string" ? m.originalCurrency : undefined,
    fxRateToBase: typeof m.fxRateToBase === "number" ? m.fxRateToBase : undefined,
    baseCurrencyDivisor: typeof m.baseCurrencyDivisor === "number" ? m.baseCurrencyDivisor : undefined,
  };
}

const EPSILON = 0.00000001;

// ============================================================================
// GBP Recovery
// ============================================================================

/**
 * When the original transaction was in GBP, we can recover the exact GBP amount
 * by reversing the ingestion conversion (totalValueUsd / fxRateToBase) rather
 * than using a potentially different rate from the fx_rates table.
 *
 * This avoids round-trip FX drift where:
 *   original_GBP × ibkr_rate → USD → USD × fx_table_rate → drifted_GBP
 *
 * Returns true if recovery is possible, with the effective USD→GBP rate to use.
 */
export function canRecoverOriginalGbp(meta: EventMetadata): boolean {
  return (
    meta.originalCurrency === "GBP" &&
    meta.fxRateToBase !== undefined &&
    meta.fxRateToBase > 0 &&
    meta.fxRateToBase !== 1
  );
}

/**
 * Convert a USD amount to GBP using the best available rate:
 * - If the event was originally in GBP, recover exact amount via ingestion rate
 * - Otherwise, use the fx_rates table rate
 *
 * Also returns the effective USD→GBP rate used (for audit trail storage).
 */
export function usdToGbp(
  usdAmount: number,
  fxRateUsdToGbp: number,
  meta: EventMetadata,
): { gbpAmount: number; effectiveRate: number } {
  if (canRecoverOriginalGbp(meta)) {
    const baseDivisor = meta.baseCurrencyDivisor ?? 1;
    // Reverse the ingestion: totalValueUsd = originalGbp × fxRateToBase / baseDivisor
    // So: originalGbp = totalValueUsd × baseDivisor / fxRateToBase
    const effectiveRate = baseDivisor / meta.fxRateToBase!;
    return { gbpAmount: usdAmount * effectiveRate, effectiveRate };
  }
  return { gbpAmount: usdAmount * fxRateUsdToGbp, effectiveRate: fxRateUsdToGbp };
}

// ============================================================================
// Main Computation
// ============================================================================

export async function computeGbpConversion(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  const errors: CalcError[] = [];

  console.log(`[GbpConv] Starting GBP conversion for user ${ctx.userId}`);

  // Fetch ALL events with their existing USD calculations
  // GBP conversion applies to all events regardless of cost basis method
  const fetchedEvents = await fetchEventsWithCalcs(ctx);
  if (fetchedEvents.length === 0) {
    console.log(`[GbpConv] No events to process`);
    return { success: true, recordsProcessed: 0, duration: Date.now() - startTime, errors: [] };
  }

  console.log(`[GbpConv] Processing ${fetchedEvents.length} events`);

  // Determine date range and pre-fetch FX rates
  const dates = fetchedEvents.map(e => formatDate(e.timestamp));
  const minDate = dates[0]; // Events sorted chronologically
  const maxDate = dates[dates.length - 1];

  console.log(`[GbpConv] Fetching USD→GBP rates from ${minDate} to ${maxDate}...`);
  const fxRates = await getFxRateSeries("USD", "GBP", minDate, maxDate);
  console.log(`[GbpConv] Got ${fxRates.size} FX rates`);

  if (fxRates.size === 0) {
    console.log(`[GbpConv] WARNING: No USD→GBP FX rates found. GBP conversion will be skipped.`);
    return { success: true, recordsProcessed: 0, duration: Date.now() - startTime, errors: [] };
  }

  // Group events by scope
  const groups = groupEventsByScope(fetchedEvents);
  console.log(`[GbpConv] ${groups.size} scopes to process`);

  // Process all events, building GBP cost pool per scope
  const pendingUpdates: UpsertEventCalculationData[] = [];
  const stats: GbpConversionStats = { recoveredFromMetadata: 0, convertedViaTable: 0 };

  for (const [scopeKey, scopeEvents] of groups) {
    const pool: GbpCostPoolState = { totalQuantity: 0, totalCostGbp: 0, averageCostGbp: 0 };

    for (const event of scopeEvents) {
      const eventDate = formatDate(event.timestamp);
      const fxRate = fxRates.get(eventDate);

      if (!fxRate) {
        errors.push({
          eventId: event.id,
          assetId: event.assetId,
          message: `No USD→GBP FX rate for ${eventDate}`,
          severity: "warning",
        });
        continue;
      }

      try {
        const update = processEventGbp(event, fxRate, pool, stats);
        if (update) {
          pendingUpdates.push(update);
          recordsProcessed++;
        }
      } catch (error) {
        errors.push({
          eventId: event.id,
          assetId: event.assetId,
          message: `GBP conversion failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: "warning",
        });
      }
    }
  }

  console.log(
    `[GbpConv] FX source: ${stats.recoveredFromMetadata} recovered from original GBP, ${stats.convertedViaTable} via fx_rates table`
  );

  // Batch-write GBP fields
  console.log(`[GbpConv] Writing ${pendingUpdates.length} GBP updates...`);
  for (let i = 0; i < pendingUpdates.length; i += 100) {
    const chunk = pendingUpdates.slice(i, i + 100);
    for (const update of chunk) {
      await upsertEventCalculation(update);
    }
    if ((i + 100) % 2000 === 0 || i + 100 >= pendingUpdates.length) {
      console.log(
        `[GbpConv]   Writes: ${Math.min(i + 100, pendingUpdates.length)}/${pendingUpdates.length}`
      );
    }
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter(e => e.severity === "error");

  console.log(
    `[GbpConv] Complete. Processed: ${recordsProcessed}, Warnings: ${errors.length - fatalErrors.length}, Errors: ${fatalErrors.length}, Duration: ${duration}ms`
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed,
    duration,
    errors,
  };
}

// ============================================================================
// Event Processing
// ============================================================================

/**
 * Process a single event for GBP conversion.
 * Maintains a parallel GBP cost pool (mirrors USD ACB logic).
 *
 * For events originally transacted in GBP, recovers the exact original
 * amount from metadata rather than using a potentially different fx_rates
 * table rate, avoiding round-trip FX drift.
 */
function processEventGbp(
  event: EventForGbpConversion,
  fxRateUsdToGbp: number,
  pool: GbpCostPoolState,
  stats: GbpConversionStats,
): UpsertEventCalculationData | null {
  const qty = parseFloat(event.quantity);
  const totalValueUsd = parseFloat(event.totalValue);
  const meta = parseEventMetadata(event.metadata);
  const { gbpAmount: totalValueGbp, effectiveRate } = usdToGbp(totalValueUsd, fxRateUsdToGbp, meta);

  if (canRecoverOriginalGbp(meta)) {
    stats.recoveredFromMetadata++;
  } else {
    stats.convertedViaTable++;
  }

  // Special event types that bypass normal ACB logic
  if (meta.isFuturesCashSettlement || meta.isFuturesFee) {
    // Futures settlements: realized gain = totalValue converted at event-date FX
    const realizedGainGbp = totalValueGbp * (meta.isFuturesFee ? -1 : 1);
    return {
      eventId: event.id,
      userId: event.userId,
      fxRateToGbp: effectiveRate.toFixed(8),
      totalValueGbp: totalValueGbp.toFixed(2),
      costBasisGbp: "0",
      realizedGainGbp: realizedGainGbp.toFixed(2),
      newAverageCostGbp: pool.averageCostGbp.toFixed(8),
    };
  }

  if (meta.koinlyType === "transfer") {
    // Transfers: zero gain, carry cost through
    if (isDisposal(event.eventType)) {
      // Transfer out: reduce pool by qty at current GBP ACB
      const costGbp = qty * pool.averageCostGbp;
      pool.totalQuantity = Math.max(0, pool.totalQuantity - qty);
      pool.totalCostGbp = Math.max(0, pool.totalCostGbp - costGbp);
      return {
        eventId: event.id,
        userId: event.userId,
        fxRateToGbp: effectiveRate.toFixed(8),
        totalValueGbp: "0",
        costBasisGbp: costGbp.toFixed(2),
        realizedGainGbp: "0",
        newAverageCostGbp: pool.averageCostGbp.toFixed(8),
      };
    } else {
      // Transfer in: add qty at current GBP ACB (preserve cost basis)
      const costGbp = qty * pool.averageCostGbp;
      pool.totalQuantity += qty;
      pool.totalCostGbp += costGbp;
      return {
        eventId: event.id,
        userId: event.userId,
        fxRateToGbp: effectiveRate.toFixed(8),
        totalValueGbp: costGbp.toFixed(2),
        costBasisGbp: null,
        realizedGainGbp: null,
        newAverageCostGbp: pool.averageCostGbp.toFixed(8),
      };
    }
  }

  if (meta.tag === "Realized gain") {
    // Koinly realized gain: entire amount is gain, converted at event-date FX
    const sign = isDisposal(event.eventType) ? -1 : 1;
    return {
      eventId: event.id,
      userId: event.userId,
      fxRateToGbp: effectiveRate.toFixed(8),
      totalValueGbp: totalValueGbp.toFixed(2),
      costBasisGbp: "0",
      realizedGainGbp: (totalValueGbp * sign).toFixed(2),
      newAverageCostGbp: pool.averageCostGbp.toFixed(8),
    };
  }

  // Futures trade events: zero cost/proceeds, actual gains from SOF
  if (meta.ibkrAssetClass === "FUT" && event.source !== "ibkr_sof") {
    return {
      eventId: event.id,
      userId: event.userId,
      fxRateToGbp: effectiveRate.toFixed(8),
      totalValueGbp: totalValueGbp.toFixed(2),
      costBasisGbp: "0",
      realizedGainGbp: "0",
      newAverageCostGbp: pool.averageCostGbp.toFixed(8),
    };
  }

  // Standard acquisition/disposal logic
  if (isAcquisition(event.eventType)) {
    return processAcquisitionGbp(event, effectiveRate, totalValueGbp, qty, pool, meta);
  } else if (isDisposal(event.eventType)) {
    return processDisposalGbp(event, effectiveRate, totalValueGbp, qty, pool, meta);
  }

  return null;
}

function processAcquisitionGbp(
  event: EventForGbpConversion,
  effectiveRate: number,
  totalValueGbp: number,
  qty: number,
  pool: GbpCostPoolState,
  meta: EventMetadata,
): UpsertEventCalculationData {
  // Compute event cost in GBP (includes commission)
  // Use the same effective rate for cost basis and commission to maintain consistency
  let eventCostGbp: number;
  if (event.costBasis) {
    // costBasis from adapter already includes commission — convert at same rate
    eventCostGbp = parseFloat(event.costBasis) * effectiveRate;
  } else {
    const commission = meta.commission ? Math.abs(meta.commission) : 0;
    eventCostGbp = (parseFloat(event.totalValue) + commission) * effectiveRate;
  }

  // ADJ events: adjustment-type SOF events add to cost pool with special handling
  if (meta.activityCode === "ADJ") {
    // Adjustments add their full value to the cost pool
    pool.totalCostGbp += eventCostGbp;
    if (pool.totalQuantity > EPSILON) {
      pool.averageCostGbp = pool.totalCostGbp / pool.totalQuantity;
    }
    return {
      eventId: event.id,
      userId: event.userId,
      fxRateToGbp: effectiveRate.toFixed(8),
      totalValueGbp: totalValueGbp.toFixed(2),
      costBasisGbp: null,
      realizedGainGbp: null,
      newAverageCostGbp: pool.averageCostGbp.toFixed(8),
    };
  }

  // Standard acquisition: update GBP cost pool
  pool.totalQuantity += qty;
  pool.totalCostGbp += eventCostGbp;
  pool.averageCostGbp = pool.totalQuantity > EPSILON
    ? pool.totalCostGbp / pool.totalQuantity
    : 0;

  return {
    eventId: event.id,
    userId: event.userId,
    fxRateToGbp: effectiveRate.toFixed(8),
    totalValueGbp: totalValueGbp.toFixed(2),
    costBasisGbp: null,
    realizedGainGbp: null,
    newAverageCostGbp: pool.averageCostGbp.toFixed(8),
  };
}

function processDisposalGbp(
  event: EventForGbpConversion,
  effectiveRate: number,
  totalValueGbp: number,
  qty: number,
  pool: GbpCostPoolState,
  meta: EventMetadata,
): UpsertEventCalculationData {
  // Proceeds in GBP (minus commission, converted at same effective rate)
  const commission = meta.commission ? Math.abs(meta.commission) : 0;
  const proceedsGbp = totalValueGbp - (commission * effectiveRate);

  // Cost basis from GBP cost pool
  const costBasisGbp = qty * pool.averageCostGbp;
  const realizedGainGbp = proceedsGbp - costBasisGbp;

  // ADJ disposal: special handling for adjustment-type SOF disposals
  if (meta.activityCode === "ADJ") {
    pool.totalCostGbp -= costBasisGbp;
    if (pool.totalQuantity > EPSILON) {
      pool.averageCostGbp = pool.totalCostGbp / pool.totalQuantity;
    }
    return {
      eventId: event.id,
      userId: event.userId,
      fxRateToGbp: effectiveRate.toFixed(8),
      totalValueGbp: totalValueGbp.toFixed(2),
      costBasisGbp: costBasisGbp.toFixed(2),
      realizedGainGbp: realizedGainGbp.toFixed(2),
      newAverageCostGbp: pool.averageCostGbp.toFixed(8),
    };
  }

  // Update pool: reduce cost pool by disposed amount
  pool.totalQuantity = Math.max(0, pool.totalQuantity - qty);
  pool.totalCostGbp = Math.max(0, pool.totalCostGbp - costBasisGbp);
  // ACB per unit stays the same on disposal (average cost method)

  // Handle position going to zero
  if (pool.totalQuantity < EPSILON) {
    pool.totalQuantity = 0;
    pool.totalCostGbp = 0;
    pool.averageCostGbp = 0;
  }

  return {
    eventId: event.id,
    userId: event.userId,
    fxRateToGbp: effectiveRate.toFixed(8),
    totalValueGbp: totalValueGbp.toFixed(2),
    costBasisGbp: costBasisGbp.toFixed(2),
    realizedGainGbp: realizedGainGbp.toFixed(2),
    newAverageCostGbp: pool.averageCostGbp.toFixed(8),
  };
}

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchEventsWithCalcs(
  ctx: CalcContext,
): Promise<EventForGbpConversion[]> {
  const conditions = [
    eq(events.userId, ctx.userId),
    isNull(events.deletedAt),
    sql`${events.eventType} IN (${sql.join(
      [...ACQUISITION_EVENT_TYPES, ...DISPOSAL_EVENT_TYPES].map(t => sql`${t}`),
      sql`, `,
    )})`,
  ];

  if (ctx.endDate) {
    conditions.push(sql`${events.timestamp} <= ${ctx.endDate}`);
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
      costBasis: events.costBasis,
      source: events.source,
      metadata: events.metadata,
      usdCostBasis: eventCalculations.costBasis,
      usdRealizedGain: eventCalculations.realizedGain,
      usdNewAverageCost: eventCalculations.newAverageCost,
    })
    .from(events)
    .leftJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .where(and(...conditions))
    .orderBy(asc(events.timestamp), asc(events.id));
}

function groupEventsByScope(
  eventList: EventForGbpConversion[],
): Map<string, EventForGbpConversion[]> {
  const groups = new Map<string, EventForGbpConversion[]>();
  for (const event of eventList) {
    const key = `${event.assetId}:${event.owner}:${event.account}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return groups;
}

// ============================================================================
// Utilities
// ============================================================================

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
