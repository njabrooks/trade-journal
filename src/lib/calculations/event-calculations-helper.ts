/**
 * Event Calculations Helper
 *
 * Helper functions for the event_calculations table.
 * This table stores all calculation-derived state, keeping events immutable.
 *
 * Ported from twotreescap-app as part of M2 migration.
 */

import { db } from "@/db";
import { eventCalculations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export interface UpsertEventCalculationData {
  eventId: string;
  userId: string;
  runningQuantity?: string | null;
  costBasis?: string | null;
  costBasisMethod?: string | null;
  realizedGain?: string | null;
  holdingDays?: number | null;
  isLongTerm?: boolean | null;
  newAverageCost?: string | null;
  averageCostUsed?: string | null;
  fifoMatched?: boolean | null;
  lotConsumptionsCount?: number | null;
  lotType?: string | null;
}

export interface RunningQuantityUpdate {
  eventId: string;
  userId: string;
  runningQuantity: string;
}

// ============================================================================
// Upsert Functions
// ============================================================================

/**
 * Upsert a single event calculation row.
 * Only updates fields that are explicitly provided (non-undefined).
 */
export async function upsertEventCalculation(
  data: UpsertEventCalculationData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient: any = db
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateSet: Record<string, any> = {
    calculatedAt: sql`now()`,
  };

  if (data.runningQuantity !== undefined) updateSet.runningQuantity = data.runningQuantity;
  if (data.costBasis !== undefined) updateSet.costBasis = data.costBasis;
  if (data.costBasisMethod !== undefined) updateSet.costBasisMethod = data.costBasisMethod;
  if (data.realizedGain !== undefined) updateSet.realizedGain = data.realizedGain;
  if (data.holdingDays !== undefined) updateSet.holdingDays = data.holdingDays;
  if (data.isLongTerm !== undefined) updateSet.isLongTerm = data.isLongTerm;
  if (data.newAverageCost !== undefined) updateSet.newAverageCost = data.newAverageCost;
  if (data.averageCostUsed !== undefined) updateSet.averageCostUsed = data.averageCostUsed;
  if (data.fifoMatched !== undefined) updateSet.fifoMatched = data.fifoMatched;
  if (data.lotConsumptionsCount !== undefined) updateSet.lotConsumptionsCount = data.lotConsumptionsCount;
  if (data.lotType !== undefined) updateSet.lotType = data.lotType;

  await dbClient
    .insert(eventCalculations)
    .values({
      eventId: data.eventId,
      userId: data.userId,
      runningQuantity: data.runningQuantity ?? null,
      costBasis: data.costBasis ?? null,
      costBasisMethod: data.costBasisMethod ?? null,
      realizedGain: data.realizedGain ?? null,
      holdingDays: data.holdingDays ?? null,
      isLongTerm: data.isLongTerm ?? null,
      newAverageCost: data.newAverageCost ?? null,
      averageCostUsed: data.averageCostUsed ?? null,
      fifoMatched: data.fifoMatched ?? null,
      lotConsumptionsCount: data.lotConsumptionsCount ?? null,
      lotType: data.lotType ?? null,
    })
    .onConflictDoUpdate({
      target: eventCalculations.eventId,
      set: updateSet,
    });
}

/**
 * Batch upsert running quantities for many events at once.
 */
export async function batchUpsertRunningQuantities(
  updates: RunningQuantityUpdate[],
  chunkSize = 100
): Promise<void> {
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);

    await db
      .insert(eventCalculations)
      .values(
        chunk.map((u) => ({
          eventId: u.eventId,
          userId: u.userId,
          runningQuantity: u.runningQuantity,
        }))
      )
      .onConflictDoUpdate({
        target: eventCalculations.eventId,
        set: {
          runningQuantity: sql`EXCLUDED.running_quantity`,
          calculatedAt: sql`now()`,
        },
      });
  }
}

// ============================================================================
// Clear Functions
// ============================================================================

/**
 * Clear event calculations for a user.
 * 'full': DELETE all rows. 'cost_basis_only': NULL cost-basis fields, preserve runningQuantity.
 */
export async function clearEventCalculations(
  userId: string,
  mode: "full" | "cost_basis_only" = "full"
): Promise<void> {
  if (mode === "full") {
    await db
      .delete(eventCalculations)
      .where(eq(eventCalculations.userId, userId));
  } else {
    await db
      .update(eventCalculations)
      .set({
        costBasis: null,
        costBasisMethod: null,
        realizedGain: null,
        holdingDays: null,
        isLongTerm: null,
        newAverageCost: null,
        averageCostUsed: null,
        fifoMatched: null,
        lotConsumptionsCount: null,
        lotType: null,
        calculatedAt: new Date(),
      })
      .where(eq(eventCalculations.userId, userId));
  }
}
