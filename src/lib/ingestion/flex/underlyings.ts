import { db } from '@/db';
import { underlyings, trades } from '@/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

/**
 * Detects names that look like IBKR option contract descriptions
 * rather than real underlying names (e.g. "HYG 15MAY26 79 P").
 */
function looksLikeOptionDescription(name: string): boolean {
  // Option descriptions follow patterns like "IBIT 20MAR26 95 C" or "HYG 15MAY26 79 P"
  return /\d{2}[A-Z]{3}\d{2}\s+\d/.test(name);
}

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
    if (name && (!existingRecord.name || looksLikeOptionDescription(existingRecord.name))) {
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

  // Before creating, try to extract CONID from trades if available
  // This ensures future underlying creation includes CONID
  let conidFromTrades: number | null = null;
  try {
    const tradeWithConid = await db
      .select({
        rawRow: trades.rawRow,
      })
      .from(trades)
      .where(
        and(
          isNotNull(trades.rawRow),
          sql`${trades.rawRow}::jsonb->>'UnderlyingSymbol' = ${normalizedTicker}`
        )
      )
      .limit(1);

    if (tradeWithConid.length > 0 && tradeWithConid[0]!.rawRow) {
      const rawRow = tradeWithConid[0]!.rawRow as Record<string, unknown>;
      const underlyingConid = rawRow['UnderlyingConid'];
      
      if (underlyingConid) {
        const conidNum = typeof underlyingConid === 'string' 
          ? parseInt(underlyingConid, 10)
          : typeof underlyingConid === 'number'
          ? underlyingConid
          : null;
        
        if (conidNum && !isNaN(conidNum)) {
          conidFromTrades = conidNum;
        }
      }
    }
  } catch (error) {
    // If CONID extraction fails, continue without it
    console.warn(`Failed to extract CONID from trades for ${normalizedTicker}:`, error);
  }

  // Create new underlying with CONID if we found it
  try {
    const [created] = await db
      .insert(underlyings)
      .values({
        ticker: normalizedTicker,
        assetClass: assetClass ?? null,
        baseCurrency: baseCurrency ?? null,
        name: name ?? null,
        conid: conidFromTrades,
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

