/**
 * IBKR Data Priority & Fallback
 * 
 * Handles reading IV/spot data with source priority:
 * - Spot: IBKR (primary) -> Massive (fallback)
 * - IV: Massive (only source)
 * 
 * IBKR provides historical spot data via historical endpoint
 * IBKR snapshot provides current IV data, but we use Massive for historical IV
 */

import { db } from '@/db';
import { underlyingsIvHistory } from '@/db/schema';
import { eq, and, inArray, or, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Source priority for spot data (highest to lowest)
 */
const SPOT_SOURCE_PRIORITY = ['ibkr', 'massive', 'yahoo_finance', 'opt_strat', 'manual'] as const;

/**
 * Source priority for IV data (highest to lowest)
 * Note: IBKR is not included as we only use Massive for historical IV
 */
const IV_SOURCE_PRIORITY = ['massive', 'opt_strat', 'manual'] as const;

/**
 * Get IV/spot data for underlying with source priority
 * - Spot: IBKR first, then Massive
 * - IV: Massive only
 */
export async function getIvDataWithPriority(
  underlyingId: string,
  asOfDate: string
): Promise<{
  spot: string | null;
  iv30: string | null;
  source: string | null;
} | null> {
  // Get all records for this underlying and date from all sources
  const records = await db
    .select({
      spot: underlyingsIvHistory.spot,
      iv30: underlyingsIvHistory.iv30,
      source: underlyingsIvHistory.source,
    })
    .from(underlyingsIvHistory)
    .where(
      and(
        eq(underlyingsIvHistory.underlyingId, underlyingId),
        eq(underlyingsIvHistory.asOfDate, asOfDate)
      )
    );

  if (records.length === 0) {
    return null;
  }

  // Find best spot: IBKR first, then Massive
  let bestSpot: string | null = null;
  let spotSource: string | null = null;
  
  for (const source of SPOT_SOURCE_PRIORITY) {
    const record = records.find(r => r.source === source && r.spot !== null);
    if (record) {
      bestSpot = record.spot;
      spotSource = record.source;
      break;
    }
  }

  // Find best IV: Massive only
  let bestIv: string | null = null;
  let ivSource: string | null = null;
  
  for (const source of IV_SOURCE_PRIORITY) {
    const record = records.find(r => r.source === source && r.iv30 !== null);
    if (record) {
      bestIv = record.iv30;
      ivSource = record.source;
      break;
    }
  }

  // Return combined result (use the source that provided the most data)
  return {
    spot: bestSpot,
    iv30: bestIv,
    source: spotSource || ivSource || records[0]?.source || null,
  };
}

/**
 * Batch get IV/spot data for multiple underlyings with source priority
 * - Spot: IBKR first, then Massive
 * - IV: Massive only
 * Returns a map of underlyingId -> { spot, iv30, source }
 */
export async function getIvDataBatchWithPriority(
  underlyingIds: string[],
  asOfDate: string
): Promise<Map<string, { spot: string | null; iv30: string | null; source: string | null }>> {
  if (underlyingIds.length === 0) {
    return new Map();
  }

  // Get all records for these underlyings and date from all sources
  const records = await db
    .select({
      underlyingId: underlyingsIvHistory.underlyingId,
      spot: underlyingsIvHistory.spot,
      iv30: underlyingsIvHistory.iv30,
      source: underlyingsIvHistory.source,
    })
    .from(underlyingsIvHistory)
    .where(
      and(
        inArray(underlyingsIvHistory.underlyingId, underlyingIds),
        eq(underlyingsIvHistory.asOfDate, asOfDate)
      )
    );

  // Group by underlyingId
  const grouped = new Map<string, typeof records>();
  for (const record of records) {
    if (!record.underlyingId) continue;
    
    if (!grouped.has(record.underlyingId)) {
      grouped.set(record.underlyingId, []);
    }
    grouped.get(record.underlyingId)!.push(record);
  }

  // For each underlying, pick best spot and IV separately
  const result = new Map<string, { spot: string | null; iv30: string | null; source: string | null }>();
  
  for (const [underlyingId, underlyingRecords] of grouped.entries()) {
    // Find best spot: IBKR first, then Massive
    let bestSpot: string | null = null;
    let spotSource: string | null = null;
    
    for (const source of SPOT_SOURCE_PRIORITY) {
      const record = underlyingRecords.find(r => r.source === source && r.spot !== null);
      if (record) {
        bestSpot = record.spot;
        spotSource = record.source;
        break;
      }
    }

    // Find best IV: Massive only
    let bestIv: string | null = null;
    let ivSource: string | null = null;
    
    for (const source of IV_SOURCE_PRIORITY) {
      const record = underlyingRecords.find(r => r.source === source && r.iv30 !== null);
      if (record) {
        bestIv = record.iv30;
        ivSource = record.source;
        break;
      }
    }

    // Store combined result
    result.set(underlyingId, {
      spot: bestSpot,
      iv30: bestIv,
      source: spotSource || ivSource || underlyingRecords[0]?.source || null,
    });
  }

  return result;
}

