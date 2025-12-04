import { db } from '@/db';
import { underlyings } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Ensures an underlying record exists for the given ticker.
 * Returns the underlying ID, or null if ticker is not provided.
 * Updates existing records with new data if provided.
 */
export async function ensureUnderlyingId(
  ticker: string | null | undefined,
  assetClass?: string | null,
  baseCurrency?: string | null,
  name?: string | null
): Promise<string | null> {
  if (!ticker || ticker.trim() === '') {
    return null;
  }

  const normalizedTicker = ticker.trim().toUpperCase();

  // Try to find existing underlying
  const existing = await db
    .select()
    .from(underlyings)
    .where(eq(underlyings.ticker, normalizedTicker))
    .limit(1);

  if (existing.length > 0) {
    const existingRecord = existing[0];
    // Update existing record if we have new data for fields that are currently null
    const updates: Partial<typeof underlyings.$inferInsert> = {};
    if (assetClass && !existingRecord.assetClass) {
      updates.assetClass = assetClass;
    }
    if (baseCurrency && !existingRecord.baseCurrency) {
      updates.baseCurrency = baseCurrency;
    }
    if (name && !existingRecord.name) {
      updates.name = name;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(underlyings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(underlyings.id, existingRecord.id));
    }

    return existingRecord.id;
  }

  // Create new underlying
  try {
    const [created] = await db
      .insert(underlyings)
      .values({
        ticker: normalizedTicker,
        assetClass: assetClass ?? null,
        baseCurrency: baseCurrency ?? null,
        name: name ?? null,
      })
      .returning();

    return created?.id ?? null;
  } catch (error) {
    // If insert fails (e.g., duplicate key), try to fetch again
    const retry = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, normalizedTicker))
      .limit(1);

    return retry[0]?.id ?? null;
  }
}

