import { db } from '@/db';
import { positions, underlyings } from '@/db/schema';
import { eq, isNull, and, inArray } from 'drizzle-orm';
import { ensureUnderlyingId } from '@/lib/ingestion/flex/underlyings';

/**
 * Extracts underlying ticker from an option symbol.
 * Uses the same logic as strategyAuto.ts for consistency.
 */
function extractTickerFromOptionSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  // Use the same pattern as strategyAuto.ts
  const match = symbol.match(/^([A-Z0-9]+)\s+(\d{6})/);
  if (match) {
    return match[1].trim().toUpperCase();
  }
  
  // Fallback: try to extract just the ticker part before any digits
  const trimmed = symbol.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex > 0) {
    return trimmed.substring(0, spaceIndex).trim().toUpperCase();
  }
  
  // Last resort: try to find where digits start
  const digitMatch = trimmed.match(/^([A-Z]+)/);
  if (digitMatch) {
    return digitMatch[1].toUpperCase();
  }
  
  return null;
}

/**
 * Backfills underlying records for existing positions.
 * This function:
 * 1. Finds positions with missing underlyingId
 * 2. Attempts to derive underlying ticker from position data
 * 3. Creates/updates underlying records
 * 4. Links positions to underlying records
 * 
 * Note: This is best-effort. For positions that were ingested before
 * UnderlyingSymbol was captured, we can only derive tickers for stocks.
 * Options without UnderlyingSymbol in the original data cannot be backfilled.
 */
export async function backfillUnderlyingRecords(
  accountId?: string
): Promise<{
  underlyingRecordsCreated: number;
  underlyingRecordsUpdated: number;
  positionsLinked: number;
  positionsSkipped: number;
}> {
  let underlyingRecordsCreated = 0;
  let underlyingRecordsUpdated = 0;
  let positionsLinked = 0;
  let positionsSkipped = 0;

  // Find all positions with missing underlyingId
  const conditions = [isNull(positions.underlyingId)];
  if (accountId) {
    conditions.push(eq(positions.accountId, accountId));
  }

  const positionsToProcess = await db
    .select({
      id: positions.id,
      symbol: positions.symbol,
      assetClass: positions.assetClass,
      accountId: positions.accountId,
    })
    .from(positions)
    .where(and(...conditions));

  // Group by underlying ticker to avoid duplicate underlying lookups
  const tickerMap = new Map<string, { positionIds: string[]; assetClass: string | null }>();

  for (const pos of positionsToProcess) {
    let underlyingTicker: string | null = null;

    if (pos.assetClass === 'STK') {
      // For stocks, the symbol IS the underlying ticker
      underlyingTicker = pos.symbol.trim().toUpperCase();
    } else if (pos.assetClass === 'OPT') {
      // For options, try to extract ticker from symbol
      underlyingTicker = extractTickerFromOptionSymbol(pos.symbol);
    }

    if (!underlyingTicker) {
      positionsSkipped++;
      continue;
    }

    if (!tickerMap.has(underlyingTicker)) {
      tickerMap.set(underlyingTicker, { positionIds: [], assetClass: pos.assetClass });
    }
    tickerMap.get(underlyingTicker)!.positionIds.push(pos.id);
  }

  // Process each unique ticker
  for (const [underlyingTicker, data] of tickerMap.entries()) {
    const assetClass = data.assetClass;

    // Check if underlying already exists
    const existing = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, underlyingTicker))
      .limit(1);

    let underlyingId: string | null;
    
    if (existing.length > 0) {
      underlyingId = existing[0].id;
      underlyingRecordsUpdated++;
    } else {
      // Create new underlying (without currency/name since we don't have that data)
      underlyingId = await ensureUnderlyingId(underlyingTicker, assetClass, null, null);
      if (underlyingId) {
        underlyingRecordsCreated++;
      }
    }

    if (!underlyingId) {
      positionsSkipped += data.positionIds.length;
      continue;
    }

    // Link all positions with this ticker to the underlying
    // Process in batches to avoid SQL parameter limits
    const batchSize = 1000;
    for (let i = 0; i < data.positionIds.length; i += batchSize) {
      const batch = data.positionIds.slice(i, i + batchSize);
      await db
        .update(positions)
        .set({ underlyingId, updatedAt: new Date() })
        .where(inArray(positions.id, batch));
    }
    
    positionsLinked += data.positionIds.length;
  }

  return {
    underlyingRecordsCreated,
    underlyingRecordsUpdated,
    positionsLinked,
    positionsSkipped,
  };
}

