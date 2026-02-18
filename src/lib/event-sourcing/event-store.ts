import { db } from "@/db";
import { sql } from "drizzle-orm";
import { events } from "@/db/schema";
import type {
  InsertEvent,
  SelectEvent,
  CanonicalEvent,
  PersistResult,
  PersistOptions,
} from "@/types/event-sourcing";

// ============================================================================
// Event Store Service
// ============================================================================

/**
 * EventStore - Service for persisting canonical events
 *
 * Handles batch inserts with idempotency via ON CONFLICT DO NOTHING.
 * Events with duplicate idempotency keys are silently skipped.
 *
 * Design principles:
 * - Idempotent: Same input always produces same result
 * - Atomic: All-or-nothing semantics when using transactions
 * - Observable: Reports inserted vs skipped counts
 */
export class EventStore {
  private readonly defaultChunkSize = 100;

  /**
   * Convert a CanonicalEvent to InsertEvent format
   */
  private toInsertEvent(event: CanonicalEvent): InsertEvent {
    // Format settlement date as string (YYYY-MM-DD) for date column
    let settlementDateStr: string | null = null;
    if (event.settlementDate) {
      const sd = event.settlementDate instanceof Date
        ? event.settlementDate
        : new Date(event.settlementDate);
      settlementDateStr = sd.toISOString().split("T")[0];
    }

    return {
      id: event.id,
      userId: event.userId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      settlementDate: settlementDateStr,
      assetId: event.assetId,
      assetTicker: event.assetTicker,
      quantity: String(event.quantity),
      price: event.price != null ? String(event.price) : null,
      totalValue: String(event.totalValue),
      currency: event.currency,
      costBasis: event.costBasis != null ? String(event.costBasis) : null,
      owner: event.owner,
      account: event.account,
      source: event.source,
      sourceId: event.sourceId,
      importBatchId: event.importBatchId,
      linkedEventId: event.linkedEventId ?? null,
      idempotencyKey: event.idempotencyKey,
      rawData: event.rawData,
      metadata: event.metadata ?? null,
    };
  }

  /**
   * Persist a batch of canonical events
   *
   * Uses ON CONFLICT DO NOTHING for idempotency - events with
   * duplicate idempotency keys are silently skipped.
   *
   * @param canonicalEvents - Array of canonical events to persist
   * @param options - Persist options
   * @returns PersistResult with inserted/skipped counts
   */
  async persistBatch(
    canonicalEvents: CanonicalEvent[],
    options: PersistOptions = {}
  ): Promise<PersistResult> {
    const { chunkSize = this.defaultChunkSize, onProgress } = options;

    if (!canonicalEvents || canonicalEvents.length === 0) {
      return {
        inserted: 0,
        skipped: 0,
        errors: 0,
        insertedIds: [],
        skippedKeys: [],
        errorDetails: [],
      };
    }

    // Convert to insert format
    const insertEvents = canonicalEvents.map((e) => this.toInsertEvent(e));
    const idempotencyKeys = new Set(canonicalEvents.map((e) => e.idempotencyKey));

    // Split into chunks
    const chunks: InsertEvent[][] = [];
    for (let i = 0; i < insertEvents.length; i += chunkSize) {
      chunks.push(insertEvents.slice(i, i + chunkSize));
    }

    console.log(
      `EventStore: Persisting ${canonicalEvents.length} events in ${chunks.length} chunks...`
    );

    const insertedIds: string[] = [];
    const errorDetails: Array<{ key: string; error: string }> = [];
    let totalProcessed = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.length === 0) continue;

      try {
        // Use ON CONFLICT DO NOTHING for idempotency
        const result = await db
          .insert(events)
          .values(chunk)
          .onConflictDoNothing({ target: events.idempotencyKey })
          .returning({ id: events.id, idempotencyKey: events.idempotencyKey });

        insertedIds.push(...result.map((r) => r.id));

        totalProcessed += chunk.length;
        console.log(
          `EventStore: Chunk ${i + 1}/${chunks.length}: inserted ${result.length}/${chunk.length} events`
        );

        // Report progress
        if (onProgress) {
          await onProgress(totalProcessed, canonicalEvents.length);
        }
      } catch (error) {
        // Log error but continue with other chunks
        console.error(`EventStore: Error in chunk ${i + 1}:`, error);

        // Try to identify which events failed
        for (const event of chunk) {
          errorDetails.push({
            key: event.idempotencyKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Calculate skipped (submitted - inserted - errors)
    const skipped = canonicalEvents.length - insertedIds.length - errorDetails.length;
    const skippedKeys = [...idempotencyKeys].filter(
      (key) =>
        !insertedIds.some((id) => {
          // We'd need to query to get the actual mapping, but for now
          // we'll just report the count
          return false;
        })
    );

    const persistResult: PersistResult = {
      inserted: insertedIds.length,
      skipped,
      errors: errorDetails.length,
      insertedIds,
      skippedKeys: [], // Would need additional query to populate
      errorDetails,
    };

    console.log(
      `EventStore: Completed. Inserted: ${persistResult.inserted}, Skipped: ${persistResult.skipped}, Errors: ${persistResult.errors}`
    );

    return persistResult;
  }

  /**
   * Persist a single canonical event
   *
   * @param event - Canonical event to persist
   * @returns The inserted event or null if skipped (duplicate)
   */
  async persistOne(event: CanonicalEvent): Promise<SelectEvent | null> {
    const insertEvent = this.toInsertEvent(event);

    try {
      const [result] = await db
        .insert(events)
        .values(insertEvent)
        .onConflictDoNothing({ target: events.idempotencyKey })
        .returning();

      if (result) {
        console.log(`EventStore: Inserted event ${result.id}`);
        return result;
      } else {
        console.log(
          `EventStore: Skipped duplicate event with key ${event.idempotencyKey}`
        );
        return null;
      }
    } catch (error) {
      console.error(`EventStore: Error inserting event:`, error);
      throw error;
    }
  }

  /**
   * Check which idempotency keys already exist
   *
   * Useful for pre-filtering events before attempting persist.
   *
   * @param keys - Array of idempotency keys to check
   * @returns Set of keys that already exist
   */
  async checkExisting(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) {
      return new Set();
    }

    // Query in chunks to avoid parameter limits
    const chunkSize = 1000;
    const existingKeys = new Set<string>();

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);

      const results = await db
        .select({ key: events.idempotencyKey })
        .from(events)
        .where(
          sql`${events.idempotencyKey} IN (${sql.join(
            chunk.map((k) => sql`${k}`),
            sql`, `
          )})`
        );

      for (const r of results) {
        existingKeys.add(r.key);
      }
    }

    return existingKeys;
  }

  /**
   * Delete all events for a batch (for rollback/retry scenarios)
   *
   * @param batchId - Import batch ID
   * @returns Number of events deleted
   */
  async deleteByBatch(batchId: string): Promise<number> {
    const deleted = await db
      .delete(events)
      .where(sql`${events.importBatchId} = ${batchId}`)
      .returning({ id: events.id });

    console.log(`EventStore: Deleted ${deleted.length} events for batch ${batchId}`);
    return deleted.length;
  }

  /**
   * Get count of events for a batch
   */
  async countByBatch(batchId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(sql`${events.importBatchId} = ${batchId}`);

    return Number(result?.count ?? 0);
  }
}

// Singleton instance
let storeInstance: EventStore | null = null;

/**
 * Get the singleton EventStore instance
 */
export function getEventStore(): EventStore {
  if (!storeInstance) {
    storeInstance = new EventStore();
  }
  return storeInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetEventStore(): void {
  storeInstance = null;
}
