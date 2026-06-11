/**
 * UK Section 104 Cost Basis Calculation
 *
 * Implements HMRC-compliant Section 104 pooling with:
 * 1. Same-day rule: match disposals against same-day acquisitions (FIFO)
 * 2. 30-day bed & breakfast rule: match against acquisitions in next 30 days (FIFO)
 * 3. Section 104 pool: remaining quantity matched at running average pool cost
 *
 * All values in GBP — uses totalValueGbp from the gbp_conversion phase.
 *
 * Two-pass algorithm per scope (asset, owner, account):
 *   Pass 1: Identify same-day and B&B claims for each disposal
 *   Pass 2: Build pool from unclaimed acquisitions, match remaining disposals from pool
 *
 * Part of M6: UK Tax Method.
 */

import { db } from "@/db";
import {
  events,
  eventCalculations,
  accounts,
  assets,
  section104Pools,
  section104Matches,
} from "@/db/schema";
import { eq, and, isNull, asc, sql, inArray } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError, S104MatchRecord, S104PoolState } from "./types";
import { isAcquisition, isDisposal, ACQUISITION_EVENT_TYPES, DISPOSAL_EVENT_TYPES } from "./types";
import { upsertEventCalculation, type UpsertEventCalculationData } from "./event-calculations-helper";

// ============================================================================
// Constants
// ============================================================================

const EPSILON = 0.00000001;
const BNB_WINDOW_DAYS = 30;

// ============================================================================
// Types
// ============================================================================

interface EventForS104 {
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
  // Joined from event_calculations (gbp_conversion phase output)
  totalValueGbp: string | null;
  fxRateToGbp: string | null;
  newAverageCostGbp: string | null;
  costBasisGbp: string | null;
  realizedGainGbp: string | null;
}

export interface EventMetadata {
  commission?: number;
  ibkrAssetClass?: string;
  activityCode?: string;
  isFuturesCashSettlement?: boolean;
  isFuturesFee?: boolean;
  tag?: string;
  koinlyType?: string;
}

/** Parsed event ready for S104 processing */
export interface S104Event {
  id: string;
  userId: string;
  assetId: string;
  owner: string;
  account: string;
  eventType: string;
  timestamp: Date;
  dateStr: string; // YYYY-MM-DD for date comparison
  quantity: number;
  totalValueGbp: number;
  fxRateToGbp: number;
  isAcq: boolean;
  isDisp: boolean;
  isSpecial: boolean; // futures, transfers, realized gain, ADJ — bypass S104 matching
  meta: EventMetadata;
  costPerUnitGbp: number; // totalValueGbp / quantity (for acquisitions)
  // GBP ACB values from gbp_conversion (for special event passthrough)
  gbpCostBasis: number | null;
  gbpRealizedGain: number | null;
}

/** Tracks disposal matching state during Pass 1 */
interface DisposalMatchState {
  event: S104Event;
  matches: S104MatchRecord[];
  poolRemaining: number; // quantity left for pool matching after same-day + B&B
  totalProceedsGbp: number;
}

// ============================================================================
// Metadata Parsing
// ============================================================================

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
  };
}

/** Check if event is a special type that bypasses normal S104 matching */
export function isSpecialEvent(eventType: string, meta: EventMetadata, source: string | null): boolean {
  // Transaction fees — these should be folded into the parent transaction's cost basis,
  // not treated as separate disposals. Koinly handles fees this way; treating them as
  // disposals inflates match count and creates "ours_only" noise in reconciliation.
  if (eventType === "FEE") return true;
  // Futures trade events (zero cost/proceeds)
  if (meta.ibkrAssetClass === "FUT" && source !== "ibkr_sof") return true;
  // Futures cash settlements / fees
  if (meta.isFuturesCashSettlement || meta.isFuturesFee) return true;
  // Koinly transfers (cost-neutral)
  if (meta.koinlyType === "transfer") return true;
  // Koinly "Realized gain" tagged events
  if (meta.tag === "Realized gain") return true;
  // ADJ events
  if (meta.activityCode === "ADJ") return true;
  return false;
}

// ============================================================================
// Date Helpers
// ============================================================================

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

// ============================================================================
// Main Calculation Function
// ============================================================================

export async function computeUkSection104(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  let recordsProcessed = 0;
  const errors: CalcError[] = [];

  console.log(`[S104] Starting UK Section 104 calculation for user ${ctx.userId}`);

  // Find owners who have accounts using uk_section_104 cost basis method
  const s104Owners = await findS104Owners();

  if (s104Owners.length === 0) {
    console.log(`[S104] No owners use uk_section_104 method`);
    return { success: true, recordsProcessed: 0, duration: Date.now() - startTime, errors: [] };
  }

  console.log(`[S104] Found ${s104Owners.length} owners: ${s104Owners.join(", ")}`);

  // Fetch events with GBP values from gbp_conversion phase
  const rawEvents = await fetchEventsWithGbp(ctx, s104Owners);

  if (rawEvents.length === 0) {
    console.log(`[S104] No events to process`);
    return { success: true, recordsProcessed: 0, duration: Date.now() - startTime, errors: [] };
  }

  console.log(`[S104] Processing ${rawEvents.length} events`);

  // Parse events into S104-ready format
  const parsed = parseEvents(rawEvents, errors);
  console.log(`[S104] ${parsed.length} events parsed (${rawEvents.length - parsed.length} skipped — no GBP value)`);

  // Group by scope
  const groups = groupByScope(parsed);
  console.log(`[S104] ${groups.size} scopes to process`);

  // Collect all pending writes
  const pendingCalcUpdates: UpsertEventCalculationData[] = [];
  const pendingMatches: S104MatchRecord[] = [];
  const pendingPoolUpdates: Array<{
    userId: string;
    assetId: string;
    owner: string;
    account: string;
    pool: S104PoolState;
    lastEventId: string;
  }> = [];

  // Process each scope
  let scopeIndex = 0;
  for (const [scopeKey, scopeEvents] of groups) {
    const [assetId, owner, account] = scopeKey.split(":");

    try {
      const result = processScope(scopeEvents);

      // Collect calc updates
      for (const update of result.calcUpdates) {
        pendingCalcUpdates.push(update);
        recordsProcessed++;
      }

      // Collect match records
      pendingMatches.push(...result.matches);

      // Collect pool state
      if (result.lastEventId) {
        pendingPoolUpdates.push({
          userId: ctx.userId,
          assetId,
          owner,
          account,
          pool: result.finalPool,
          lastEventId: result.lastEventId,
        });
      }
    } catch (error) {
      errors.push({
        assetId,
        message: `S104 scope ${scopeKey} failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      });
    }

    scopeIndex++;
    if (scopeIndex % 100 === 0 || scopeIndex === groups.size) {
      console.log(`[S104] Scopes: ${scopeIndex}/${groups.size}, events: ${recordsProcessed}/${parsed.length}`);
    }
  }

  // Clear existing S104 matches for this user (full recalc)
  console.log(`[S104] Clearing existing S104 matches...`);
  await clearExistingMatches(ctx.userId, s104Owners);

  // Batch-write event calculations
  console.log(`[S104] Writing ${pendingCalcUpdates.length} event calculation updates...`);
  for (let i = 0; i < pendingCalcUpdates.length; i += 100) {
    const chunk = pendingCalcUpdates.slice(i, i + 100);
    for (const update of chunk) {
      await upsertEventCalculation(update);
    }
    if ((i + 100) % 2000 === 0 || i + 100 >= pendingCalcUpdates.length) {
      console.log(`[S104]   Calc updates: ${Math.min(i + 100, pendingCalcUpdates.length)}/${pendingCalcUpdates.length}`);
    }
  }

  // Batch-write match records
  console.log(`[S104] Writing ${pendingMatches.length} match records...`);
  for (let i = 0; i < pendingMatches.length; i += 100) {
    const chunk = pendingMatches.slice(i, i + 100);
    await db.insert(section104Matches).values(
      chunk.map((m) => ({
        disposalEventId: m.disposalEventId,
        acquisitionEventId: m.acquisitionEventId,
        matchType: m.matchType,
        quantityMatched: m.quantityMatched.toFixed(8),
        costBasisGbp: m.costBasisGbp.toFixed(2),
        proceedsGbp: m.proceedsGbp.toFixed(2),
        realizedGainGbp: m.realizedGainGbp.toFixed(2),
        acquisitionDate: m.acquisitionDate,
        poolQtyAfter: m.poolQtyAfter?.toFixed(8) ?? null,
        poolCostGbpAfter: m.poolCostGbpAfter?.toFixed(2) ?? null,
      })),
    );
    if ((i + 100) % 2000 === 0 || i + 100 >= pendingMatches.length) {
      console.log(`[S104]   Match records: ${Math.min(i + 100, pendingMatches.length)}/${pendingMatches.length}`);
    }
  }

  // Batch-write pool states
  console.log(`[S104] Writing ${pendingPoolUpdates.length} pool states...`);
  for (const pu of pendingPoolUpdates) {
    await db
      .insert(section104Pools)
      .values({
        userId: pu.userId,
        assetId: pu.assetId,
        owner: pu.owner,
        account: pu.account,
        poolQuantity: pu.pool.poolQuantity.toFixed(8),
        poolCostBasisGbp: pu.pool.poolCostBasisGbp.toFixed(2),
        poolAverageCostGbp: pu.pool.poolAverageCostGbp.toFixed(8),
        firstAcquisitionDate: pu.pool.firstAcquisitionDate ?? null,
        lastUpdatedEventId: pu.lastEventId,
      })
      .onConflictDoUpdate({
        target: [
          section104Pools.userId,
          section104Pools.assetId,
          section104Pools.owner,
          section104Pools.account,
        ],
        set: {
          poolQuantity: sql`EXCLUDED.pool_quantity`,
          poolCostBasisGbp: sql`EXCLUDED.pool_cost_basis_gbp`,
          poolAverageCostGbp: sql`EXCLUDED.pool_average_cost_gbp`,
          firstAcquisitionDate: sql`EXCLUDED.first_acquisition_date`,
          lastUpdatedEventId: sql`EXCLUDED.last_updated_event_id`,
          updatedAt: sql`now()`,
        },
      });
  }

  const duration = Date.now() - startTime;
  const fatalErrors = errors.filter((e) => e.severity === "error");

  console.log(
    `[S104] Complete. Processed: ${recordsProcessed}, Matches: ${pendingMatches.length}, ` +
      `Pools: ${pendingPoolUpdates.length}, Errors: ${fatalErrors.length}, Duration: ${duration}ms`,
  );

  return {
    success: fatalErrors.length === 0,
    recordsProcessed,
    duration,
    errors,
  };
}

// ============================================================================
// Scope Processing — Two-Pass Algorithm
// ============================================================================

export interface ScopeResult {
  calcUpdates: UpsertEventCalculationData[];
  matches: S104MatchRecord[];
  finalPool: S104PoolState;
  lastEventId: string | null;
}

export function processScope(scopeEvents: S104Event[]): ScopeResult {
  const calcUpdates: UpsertEventCalculationData[] = [];
  const allMatches: S104MatchRecord[] = [];
  const pool: S104PoolState = {
    poolQuantity: 0,
    poolCostBasisGbp: 0,
    poolAverageCostGbp: 0,
  };

  // Separate acquisitions and disposals (non-special only)
  const acquisitions = scopeEvents.filter((e) => e.isAcq && !e.isSpecial);
  const disposals = scopeEvents.filter((e) => e.isDisp && !e.isSpecial);
  const specialEvents = scopeEvents.filter((e) => e.isSpecial);

  // Build acquisition index by date for efficient lookup
  const acqByDate = new Map<string, S104Event[]>();
  for (const acq of acquisitions) {
    if (!acqByDate.has(acq.dateStr)) acqByDate.set(acq.dateStr, []);
    acqByDate.get(acq.dateStr)!.push(acq);
  }

  // Track how much of each acquisition is reserved by same-day/B&B
  const reservedQty = new Map<string, number>();
  const getAvailable = (acqId: string, totalQty: number): number => {
    return totalQty - (reservedQty.get(acqId) ?? 0);
  };
  const reserve = (acqId: string, qty: number): void => {
    reservedQty.set(acqId, (reservedQty.get(acqId) ?? 0) + qty);
  };

  // Track disposal matching state
  const disposalStates: DisposalMatchState[] = [];

  // ==========================================
  // Pass 1: Same-day and B&B matching
  // ==========================================

  for (const disp of disposals) {
    const matches: S104MatchRecord[] = [];
    let remaining = disp.quantity;
    const proceedsPerUnit = disp.totalValueGbp / disp.quantity;
    // Commission is already reflected in totalValueGbp from gbp_conversion
    const totalProceedsGbp = disp.totalValueGbp;

    // 1. Same-day rule
    const sameDayAcqs = acqByDate.get(disp.dateStr) ?? [];
    for (const acq of sameDayAcqs) {
      if (remaining < EPSILON) break;
      const available = getAvailable(acq.id, acq.quantity);
      if (available < EPSILON) continue;

      const matched = Math.min(remaining, available);
      const costGbp = matched * acq.costPerUnitGbp;
      const proceedsGbp = matched * proceedsPerUnit;
      const gainGbp = proceedsGbp - costGbp;

      reserve(acq.id, matched);
      matches.push({
        disposalEventId: disp.id,
        acquisitionEventId: acq.id,
        matchType: "same_day",
        quantityMatched: matched,
        costBasisGbp: costGbp,
        proceedsGbp,
        realizedGainGbp: gainGbp,
        acquisitionDate: acq.dateStr,
        poolQtyAfter: null,
        poolCostGbpAfter: null,
      });
      remaining -= matched;
    }

    // 2. B&B rule (next 30 calendar days)
    if (remaining > EPSILON) {
      for (let d = 1; d <= BNB_WINDOW_DAYS; d++) {
        if (remaining < EPSILON) break;
        const lookDate = addDays(disp.dateStr, d);
        const bnbAcqs = acqByDate.get(lookDate) ?? [];
        for (const acq of bnbAcqs) {
          if (remaining < EPSILON) break;
          const available = getAvailable(acq.id, acq.quantity);
          if (available < EPSILON) continue;

          const matched = Math.min(remaining, available);
          const costGbp = matched * acq.costPerUnitGbp;
          const proceedsGbp = matched * proceedsPerUnit;
          const gainGbp = proceedsGbp - costGbp;

          reserve(acq.id, matched);
          matches.push({
            disposalEventId: disp.id,
            acquisitionEventId: acq.id,
            matchType: "bed_and_breakfast",
            quantityMatched: matched,
            costBasisGbp: costGbp,
            proceedsGbp,
            realizedGainGbp: gainGbp,
            acquisitionDate: acq.dateStr,
            poolQtyAfter: null,
            poolCostGbpAfter: null,
          });
          remaining -= matched;
        }
      }
    }

    disposalStates.push({
      event: disp,
      matches,
      poolRemaining: remaining,
      totalProceedsGbp,
    });
  }

  // ==========================================
  // Pass 2: Build pool + pool matching
  // ==========================================

  // Create a chronological timeline of:
  // - Acquisitions: add unreserved portion to pool
  // - Disposals: match pool remaining
  // Both sorted chronologically for correct pool state tracking

  // Index disposal states by event ID for quick lookup
  const disposalStateMap = new Map<string, DisposalMatchState>();
  for (const ds of disposalStates) {
    disposalStateMap.set(ds.event.id, ds);
  }

  let lastEventId: string | null = null;

  for (const event of scopeEvents) {
    lastEventId = event.id;

    // Handle special events (pass through GBP values, no pool impact)
    if (event.isSpecial) {
      calcUpdates.push(buildSpecialEventCalcUpdate(event, pool));
      continue;
    }

    if (event.isAcq) {
      // Add unreserved portion to pool
      const reserved = reservedQty.get(event.id) ?? 0;
      const unreserved = event.quantity - reserved;

      if (unreserved > EPSILON) {
        const costGbp = unreserved * event.costPerUnitGbp;
        pool.poolQuantity += unreserved;
        pool.poolCostBasisGbp += costGbp;
        pool.poolAverageCostGbp =
          pool.poolQuantity > EPSILON
            ? pool.poolCostBasisGbp / pool.poolQuantity
            : 0;
        if (!pool.firstAcquisitionDate) {
          pool.firstAcquisitionDate = event.timestamp;
        }
      }

      // Write event calculation (acquisition — no realized gain, record pool avg cost)
      calcUpdates.push({
        eventId: event.id,
        userId: event.userId,
        newAverageCostGbp: pool.poolAverageCostGbp.toFixed(8),
      });
    }

    if (event.isDisp) {
      const ds = disposalStateMap.get(event.id);
      if (!ds) continue; // shouldn't happen

      // 3. Pool matching for remaining quantity
      if (ds.poolRemaining > EPSILON && pool.poolQuantity > EPSILON) {
        const matchQty = Math.min(ds.poolRemaining, pool.poolQuantity);
        const costGbp = matchQty * pool.poolAverageCostGbp;
        const proceedsPerUnit = ds.totalProceedsGbp / ds.event.quantity;
        const proceedsGbp = matchQty * proceedsPerUnit;
        const gainGbp = proceedsGbp - costGbp;

        // Reduce pool
        pool.poolQuantity -= matchQty;
        pool.poolCostBasisGbp -= costGbp;
        if (pool.poolQuantity > EPSILON) {
          pool.poolAverageCostGbp = pool.poolCostBasisGbp / pool.poolQuantity;
        } else {
          pool.poolQuantity = 0;
          pool.poolCostBasisGbp = 0;
          pool.poolAverageCostGbp = 0;
        }

        ds.matches.push({
          disposalEventId: ds.event.id,
          acquisitionEventId: null,
          matchType: "section_104_pool",
          quantityMatched: matchQty,
          costBasisGbp: costGbp,
          proceedsGbp,
          realizedGainGbp: gainGbp,
          acquisitionDate: null,
          poolQtyAfter: pool.poolQuantity,
          poolCostGbpAfter: pool.poolCostBasisGbp,
        });

        ds.poolRemaining -= matchQty;
      }

      // Aggregate match results for this disposal
      const totalCostBasisGbp = ds.matches.reduce((sum, m) => sum + m.costBasisGbp, 0);
      const totalRealizedGainGbp = ds.matches.reduce((sum, m) => sum + m.realizedGainGbp, 0);

      // Write event calculation — S104 values go to dedicated fields,
      // preserving the GBP ACB values written by gbp_conversion
      calcUpdates.push({
        eventId: event.id,
        userId: event.userId,
        s104CostBasisGbp: totalCostBasisGbp.toFixed(2),
        s104RealizedGainGbp: totalRealizedGainGbp.toFixed(2),
        newAverageCostGbp: pool.poolAverageCostGbp.toFixed(8),
      });

      // Collect matches for batch insert
      allMatches.push(...ds.matches);
    }
  }

  // Fix userId on special event calc updates (they're built with empty userId)
  const userId = scopeEvents[0]?.userId ?? "";
  for (const update of calcUpdates) {
    if (!update.userId || update.userId === "") {
      update.userId = userId;
    }
  }

  return {
    calcUpdates,
    matches: allMatches,
    finalPool: pool,
    lastEventId,
  };
}

// ============================================================================
// Special Event Handling
// ============================================================================

/**
 * Build calc update for special events that bypass S104 matching.
 * These preserve the GBP values from gbp_conversion unchanged —
 * the S104 phase carries them through to the S104 fields so that
 * gains from futures settlements, realized gains, fees, etc. are
 * visible regardless of which cost basis method is being viewed.
 */
function buildSpecialEventCalcUpdate(
  event: S104Event,
  pool: S104PoolState,
): UpsertEventCalculationData {
  const update: UpsertEventCalculationData = {
    eventId: event.id,
    userId: "", // Will be fixed in the caller
    newAverageCostGbp: pool.poolAverageCostGbp.toFixed(8),
  };

  // Carry forward GBP ACB values to S104 fields for special events.
  // gbp_conversion already computed the correct gain for these events
  // (e.g. realized_gain tag → full amount as gain, futures settlement → MTM).
  // Without this passthrough, S104 fields would be NULL and gains would
  // be invisible when viewing in GBP/S104 mode.
  if (event.gbpCostBasis !== null) {
    update.s104CostBasisGbp = event.gbpCostBasis.toFixed(2);
  }
  if (event.gbpRealizedGain !== null) {
    update.s104RealizedGainGbp = event.gbpRealizedGain.toFixed(2);
  }

  return update;
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Find owners who have at least one account using uk_section_104 cost basis.
 * Events store owner directly (e.g. "Nick") but accounts table uses
 * broker_account_id which doesn't match events.account.
 * So we filter by owner (from accounts table) against events.owner.
 */
async function findS104Owners(): Promise<string[]> {
  const fetched = await db
    .selectDistinct({ owner: accounts.owner })
    .from(accounts)
    .where(eq(accounts.costBasisMethod, "uk_section_104"));
  return fetched.filter((a) => a.owner != null).map((a) => a.owner!);
}

/** Asset classes excluded from S104 — fiat currency-to-currency gains are non-taxable */
const EXCLUDED_ASSET_CLASSES = ["FIAT"];

async function fetchEventsWithGbp(
  ctx: CalcContext,
  ownerNames: string[],
): Promise<EventForS104[]> {
  const conditions = [
    eq(events.userId, ctx.userId),
    isNull(events.deletedAt),
    inArray(events.owner, ownerNames),
    sql`${events.eventType} IN (${sql.join(
      [...ACQUISITION_EVENT_TYPES, ...DISPOSAL_EVENT_TYPES].map((t) => sql`${t}`),
      sql`, `,
    )})`,
    // Exclude FIAT assets — currency-to-currency gains/losses are non-taxable for CGT
    sql`${assets.assetClass} NOT IN (${sql.join(
      EXCLUDED_ASSET_CLASSES.map((c) => sql`${c}`),
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
      totalValueGbp: eventCalculations.totalValueGbp,
      fxRateToGbp: eventCalculations.fxRateToGbp,
      newAverageCostGbp: eventCalculations.newAverageCostGbp,
      costBasisGbp: eventCalculations.costBasisGbp,
      realizedGainGbp: eventCalculations.realizedGainGbp,
    })
    .from(events)
    .innerJoin(assets, eq(events.assetId, assets.id))
    .leftJoin(eventCalculations, eq(events.id, eventCalculations.eventId))
    .where(and(...conditions))
    .orderBy(asc(events.timestamp), asc(events.id));
}

// ============================================================================
// Event Parsing
// ============================================================================

function parseEvents(rawEvents: EventForS104[], errors: CalcError[]): S104Event[] {
  const parsed: S104Event[] = [];

  for (const raw of rawEvents) {
    const meta = parseEventMetadata(raw.metadata);
    const qty = parseFloat(raw.quantity);
    const totalValueGbp = raw.totalValueGbp ? parseFloat(raw.totalValueGbp) : null;
    const fxRate = raw.fxRateToGbp ? parseFloat(raw.fxRateToGbp) : 0;

    if (totalValueGbp === null) {
      errors.push({
        eventId: raw.id,
        assetId: raw.assetId,
        message: `No totalValueGbp from gbp_conversion — skipping`,
        severity: "warning",
      });
      continue;
    }

    const isAcq = isAcquisition(raw.eventType);
    const isDisp = isDisposal(raw.eventType);
    const special = isSpecialEvent(raw.eventType, meta, raw.source);
    const costPerUnit = qty > EPSILON ? Math.abs(totalValueGbp) / qty : 0;

    parsed.push({
      id: raw.id,
      userId: raw.userId,
      assetId: raw.assetId,
      owner: raw.owner,
      account: raw.account,
      eventType: raw.eventType,
      timestamp: raw.timestamp,
      dateStr: formatDate(raw.timestamp),
      quantity: qty,
      totalValueGbp: Math.abs(totalValueGbp),
      fxRateToGbp: fxRate,
      isAcq,
      isDisp,
      isSpecial: special,
      meta,
      gbpCostBasis: raw.costBasisGbp ? parseFloat(raw.costBasisGbp) : null,
      gbpRealizedGain: raw.realizedGainGbp ? parseFloat(raw.realizedGainGbp) : null,
      costPerUnitGbp: costPerUnit,
    });
  }

  return parsed;
}

// ============================================================================
// Grouping
// ============================================================================

function groupByScope(events: S104Event[]): Map<string, S104Event[]> {
  const groups = new Map<string, S104Event[]>();
  for (const event of events) {
    const key = `${event.assetId}:${event.owner}:${event.account}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return groups;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clear existing S104 matches for recalculation.
 * Uses a subquery to find disposal events belonging to S104 accounts.
 */
async function clearExistingMatches(userId: string, ownerNames: string[]): Promise<void> {
  // Delete matches where the disposal event belongs to one of the S104 owners
  await db.execute(sql`
    DELETE FROM section_104_matches
    WHERE disposal_event_id IN (
      SELECT id FROM events
      WHERE user_id = ${userId}
        AND owner IN (${sql.join(ownerNames.map((a) => sql`${a}`), sql`, `)})
    )
  `);

  // Clear pool states for this user's S104 owners
  await db.execute(sql`
    DELETE FROM section_104_pools
    WHERE user_id = ${userId}
      AND owner IN (${sql.join(ownerNames.map((a) => sql`${a}`), sql`, `)})
  `);
}
