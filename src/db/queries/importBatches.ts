"use server";

import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { eq, and, desc, ne, inArray } from "drizzle-orm";
import type {
  SelectImportBatch,
  InsertImportBatch,
  BatchStatus,
  CalcPhase,
} from "@/types/event-sourcing";
import { VALID_TRANSITIONS } from "@/types/event-sourcing";

/**
 * Get a batch by its ID
 */
export async function getImportBatchById(id: string): Promise<SelectImportBatch | null> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, id))
    .limit(1);
  return batch || null;
}

/**
 * Get a batch by user ID and file hash (idempotency check)
 */
export async function getImportBatchByFileHash(
  userId: string,
  fileHash: string
): Promise<SelectImportBatch | null> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(
      eq(importBatches.userId, userId),
      eq(importBatches.fileHash, fileHash)
    ))
    .limit(1);
  return batch || null;
}

/**
 * Create a new import batch
 */
export async function createImportBatch(
  batch: Pick<InsertImportBatch, 'userId' | 'source' | 'filename' | 'fileHash'>
): Promise<SelectImportBatch> {
  const [newBatch] = await db
    .insert(importBatches)
    .values({
      ...batch,
      status: 'pending',
    })
    .returning();
  return newBatch;
}

/**
 * Update a batch's status with transition validation
 */
export async function updateImportBatchStatus(
  batchId: string,
  newStatus: BatchStatus,
  metadata?: Partial<Omit<InsertImportBatch, 'id' | 'userId' | 'status'>>
): Promise<SelectImportBatch> {
  const current = await getImportBatchById(batchId);
  if (!current) {
    throw new Error(`Import batch ${batchId} not found`);
  }

  const allowedTransitions = VALID_TRANSITIONS[current.status as BatchStatus];
  if (!allowedTransitions?.includes(newStatus)) {
    throw new Error(
      `Invalid state transition: ${current.status} → ${newStatus}. ` +
      `Allowed: ${allowedTransitions?.join(', ') || 'none'}`
    );
  }

  const updateData: Partial<InsertImportBatch> = {
    status: newStatus,
    updatedAt: new Date(),
    ...metadata,
  };

  if (newStatus === 'completed' || newStatus === 'failed') {
    updateData.completedAt = new Date();
  }

  const [updated] = await db
    .update(importBatches)
    .set(updateData)
    .where(eq(importBatches.id, batchId))
    .returning();

  return updated;
}

/**
 * Update batch progress
 */
export async function updateImportBatchProgress(
  batchId: string,
  processed: number,
  total: number,
  skipped?: number
): Promise<void> {
  await db
    .update(importBatches)
    .set({
      processedRecords: processed,
      totalRecords: total,
      ...(skipped !== undefined && { skippedRecords: skipped }),
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId));
}

/**
 * Set calculation phase
 */
export async function setImportBatchCalcPhase(
  batchId: string,
  phase: CalcPhase,
  progress?: Record<string, unknown>
): Promise<void> {
  await db
    .update(importBatches)
    .set({
      calcPhase: phase,
      calcProgress: progress ?? null,
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId));
}

/**
 * Mark batch as failed
 */
export async function failImportBatch(
  batchId: string,
  error: Error
): Promise<SelectImportBatch> {
  return updateImportBatchStatus(batchId, 'failed', {
    errorMessage: error.message,
    errorDetails: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Mark batch as completed
 */
export async function completeImportBatch(batchId: string): Promise<SelectImportBatch> {
  return updateImportBatchStatus(batchId, 'completed');
}

/**
 * Get recent batches for a user
 */
export async function getRecentImportBatches(
  userId: string,
  limit = 10
): Promise<SelectImportBatch[]> {
  return db
    .select()
    .from(importBatches)
    .where(eq(importBatches.userId, userId))
    .orderBy(desc(importBatches.startedAt))
    .limit(limit);
}

/**
 * Get active (non-terminal) batches for a user
 */
export async function getActiveImportBatches(userId: string): Promise<SelectImportBatch[]> {
  return db
    .select()
    .from(importBatches)
    .where(and(
      eq(importBatches.userId, userId),
      ne(importBatches.status, 'completed'),
      ne(importBatches.status, 'failed')
    ))
    .orderBy(desc(importBatches.startedAt));
}

/**
 * Get the latest completed batch for a user
 */
export async function getLatestCompletedImportBatch(
  userId: string
): Promise<SelectImportBatch | null> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(
      eq(importBatches.userId, userId),
      eq(importBatches.status, 'completed')
    ))
    .orderBy(desc(importBatches.completedAt))
    .limit(1);
  return batch || null;
}
