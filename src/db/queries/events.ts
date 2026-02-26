"use server";

/**
 * Event Queries
 *
 * CRUD operations for the events table.
 * Ported from twotreescap-app/db/queries/events-queries.ts.
 */

import { db } from "@/db";
import { eq, and, gte, lte, isNull, desc, asc } from "drizzle-orm";
import { events } from "@/db/schema";
import type { Event, NewEvent } from "@/db/schema";

// ============================================================================
// Event Queries
// ============================================================================

export async function getEventById(id: string): Promise<Event | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  return event || null;
}

export async function getEventByIdempotencyKey(key: string): Promise<Event | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.idempotencyKey, key))
    .limit(1);
  return event || null;
}

export async function eventExistsByIdempotencyKey(key: string): Promise<boolean> {
  const [result] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.idempotencyKey, key))
    .limit(1);
  return !!result;
}

export async function createEvent(event: NewEvent): Promise<Event> {
  const [newEvent] = await db
    .insert(events)
    .values(event)
    .returning();
  return newEvent;
}

export async function batchInsertEvents(
  eventRows: NewEvent[],
  batchSize = 100
): Promise<Event[]> {
  if (!eventRows || eventRows.length === 0) {
    return [];
  }

  const allInserted: Event[] = [];
  const chunks: NewEvent[][] = [];

  for (let i = 0; i < eventRows.length; i += batchSize) {
    chunks.push(eventRows.slice(i, i + batchSize));
  }

  console.log(`Inserting ${eventRows.length} events in ${chunks.length} batches...`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.length === 0) continue;

    const inserted = await db
      .insert(events)
      .values(chunk)
      .returning();

    allInserted.push(...inserted);
    console.log(`Batch ${i + 1}/${chunks.length}: inserted ${inserted.length} events`);
  }

  return allInserted;
}

export async function getEventsByUserId(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: 'asc' | 'desc';
  }
): Promise<Event[]> {
  const { limit = 1000, offset = 0, orderBy = 'desc' } = options || {};

  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), isNull(events.deletedAt)))
    .orderBy(orderBy === 'asc' ? asc(events.timestamp) : desc(events.timestamp))
    .limit(limit)
    .offset(offset);
}

export async function getEventsByAsset(
  userId: string,
  assetId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    orderBy?: 'asc' | 'desc';
  }
): Promise<Event[]> {
  const { startDate, endDate, orderBy = 'asc' } = options || {};

  const conditions = [
    eq(events.userId, userId),
    eq(events.assetId, assetId),
    isNull(events.deletedAt),
  ];

  if (startDate) {
    conditions.push(gte(events.timestamp, startDate));
  }
  if (endDate) {
    conditions.push(lte(events.timestamp, endDate));
  }

  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(orderBy === 'asc' ? asc(events.timestamp) : desc(events.timestamp));
}

export async function getEventsByBatchId(batchId: string): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.importBatchId, batchId), isNull(events.deletedAt)))
    .orderBy(asc(events.timestamp));
}

export async function deleteEventsByBatchId(batchId: string): Promise<number> {
  const deleted = await db
    .delete(events)
    .where(eq(events.importBatchId, batchId))
    .returning({ id: events.id });
  return deleted.length;
}

export async function getDistinctAssetIds(userId: string): Promise<string[]> {
  const results = await db
    .selectDistinct({ assetId: events.assetId })
    .from(events)
    .where(and(eq(events.userId, userId), isNull(events.deletedAt)));
  return results.map(r => r.assetId);
}

export async function getEventsSince(
  userId: string,
  sinceDate: Date
): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(
      eq(events.userId, userId),
      gte(events.timestamp, sinceDate),
      isNull(events.deletedAt)
    ))
    .orderBy(asc(events.timestamp));
}
