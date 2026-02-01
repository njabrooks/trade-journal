/**
 * Ingestion cursor management for incremental crypto exchange ingestion.
 * Uses the ingestion_cursors table to track high-water marks per exchange.
 */

import { db } from '@/db';
import { ingestionCursors } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Get the stored cursor value for an exchange/account/type combination.
 * Returns null if no cursor exists (first run).
 */
export async function getCursor(
  accountId: string,
  exchange: string,
  cursorType: string
): Promise<string | null> {
  const result = await db
    .select({ cursorValue: ingestionCursors.cursorValue })
    .from(ingestionCursors)
    .where(
      and(
        eq(ingestionCursors.accountId, accountId),
        eq(ingestionCursors.exchange, exchange),
        eq(ingestionCursors.cursorType, cursorType)
      )
    )
    .limit(1);

  return result[0]?.cursorValue ?? null;
}

/**
 * Set (upsert) the cursor value for an exchange/account/type combination.
 */
export async function setCursor(
  accountId: string,
  exchange: string,
  cursorType: string,
  value: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db
    .insert(ingestionCursors)
    .values({
      accountId,
      exchange,
      cursorType,
      cursorValue: value,
      metadata: metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [ingestionCursors.accountId, ingestionCursors.exchange, ingestionCursors.cursorType],
      set: {
        cursorValue: value,
        metadata: metadata ?? null,
        updatedAt: new Date(),
      },
    });
}
