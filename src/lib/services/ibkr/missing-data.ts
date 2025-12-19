/**
 * IBKR Missing Data Detection
 * 
 * Detects missing IBKR spot data based on positions in the portfolio
 * Strategy: From first position date onwards, fetch IBKR historical spot data for every trading day
 * IBKR provides historical spot prices via historical endpoint (no IV - IV comes from Massive)
 * Uses underlying CONID from trades rawRow when available for faster API calls
 */

import { db } from '@/db';
import { underlyingsIvHistory, underlyings, positions, trades } from '@/db/schema';
import { eq, and, isNotNull, isNull, sql, inArray } from 'drizzle-orm';

export interface MissingDataRange {
  ticker: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  missingDays: number;
  conid?: number; // IBKR contract ID if available
}

/**
 * Get all tickers with their first trade date and underlying CONID
 * Uses trades table to find earliest trade date for each underlying
 * Extracts underlying CONID from trades rawRow (UnderlyingConid field)
 * Returns map of ticker -> { firstDate, conid }
 */
async function getTickersWithFirstPositionDate(): Promise<Map<string, { firstDate: string; conid?: number }>> {
  // Get all trades with their underlying symbol and trade date
  // Extract UnderlyingSymbol and UnderlyingConid from rawRow
  const tradeData = await db
    .select({
      tradeDate: trades.tradeDate,
      rawRow: trades.rawRow,
    })
    .from(trades)
    .where(
      and(
        isNotNull(trades.tradeDate),
        isNotNull(trades.rawRow)
      )
    );

  // Group by underlying symbol and find earliest trade date for each
  // Also extract CONID from the first trade for each underlying
  const tickerToData = new Map<string, { firstDate: string; conid?: number }>();
  
  for (const trade of tradeData) {
    if (!trade.rawRow || !trade.tradeDate) continue;
    
    const rawRow = trade.rawRow as Record<string, unknown>;
    const underlyingSymbol = rawRow['UnderlyingSymbol'];
    const underlyingConid = rawRow['UnderlyingConid'];
    
    if (!underlyingSymbol || typeof underlyingSymbol !== 'string') continue;
    
    // Convert tradeDate to YYYY-MM-DD string
    // tradeDate is a timestamp, so it's a Date object
    const tradeDateObj = trade.tradeDate instanceof Date 
      ? trade.tradeDate 
      : new Date(trade.tradeDate);
    
    if (isNaN(tradeDateObj.getTime())) {
      continue; // Skip if invalid date
    }
    
    const tradeDateStr = tradeDateObj.toISOString().split('T')[0]!;
    
    const ticker = underlyingSymbol.trim().toUpperCase();
    const existing = tickerToData.get(ticker);
    
    // Parse CONID
    let conidNum: number | undefined;
    if (underlyingConid) {
      conidNum = typeof underlyingConid === 'string' 
        ? parseInt(underlyingConid, 10)
        : typeof underlyingConid === 'number'
        ? underlyingConid
        : undefined;
      if (conidNum && isNaN(conidNum)) {
        conidNum = undefined;
      }
    }
    
    if (!existing) {
      // First trade for this ticker
      tickerToData.set(ticker, {
        firstDate: tradeDateStr,
        conid: conidNum,
      });
    } else {
      // Update if this trade is earlier
      if (tradeDateStr < existing.firstDate) {
        existing.firstDate = tradeDateStr;
      }
      // Update CONID if we don't have one yet
      if (!existing.conid && conidNum) {
        existing.conid = conidNum;
      }
    }
  }

  // Now update underlying records with CONIDs if we found them
  // Also ensure all tickers have underlying records
  for (const [ticker, data] of tickerToData.entries()) {
    // Find or create underlying record
    const underlyingRecord = await db
      .select({
        id: underlyings.id,
        conid: underlyings.conid,
      })
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker))
      .limit(1);

    if (underlyingRecord.length > 0) {
      // Update CONID if we have one and the record doesn't
      // Check explicitly for null/undefined to handle bigint type correctly
      if (data.conid && (underlyingRecord[0]!.conid === null || underlyingRecord[0]!.conid === undefined)) {
        await db
          .update(underlyings)
          .set({ conid: data.conid, updatedAt: new Date() })
          .where(eq(underlyings.id, underlyingRecord[0]!.id));
      }
    } else {
      // Create underlying record with CONID if available
      await db.insert(underlyings).values({
        ticker,
        conid: data.conid ?? null,
      });
    }
  }

  return tickerToData;
}

/**
 * Find missing IBKR spot data ranges for a ticker
 * Strategy: From the first trade date onwards, check for missing IBKR spot data
 * IBKR historical endpoint can provide historical spot prices
 * Returns ranges of missing dates
 */
async function findMissingIbkrRangesForTicker(
  ticker: string,
  firstTradeDate: string,
  conid?: number
): Promise<MissingDataRange[]> {
  const tickerUpper = ticker.toUpperCase();

  // Generate all dates from first trade date to today
  const startDate = new Date(firstTradeDate + 'T00:00:00Z');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0]!;
  
  // Get all existing records for this ticker from first trade date onwards (any source)
  // Then check which dates have IBKR spot data vs which don't
  const allRecords = await db
    .select({ 
      asOfDate: underlyingsIvHistory.asOfDate,
      source: underlyingsIvHistory.source,
      spot: underlyingsIvHistory.spot,
    })
    .from(underlyingsIvHistory)
    .where(
      and(
        eq(underlyingsIvHistory.ticker, tickerUpper),
        sql`${underlyingsIvHistory.asOfDate} >= ${firstTradeDate}`,
        sql`${underlyingsIvHistory.asOfDate} <= ${todayStr}`
      )
    );

  // Build set of dates that have IBKR spot data
  const ibkrDates = new Set(
    allRecords
      .filter(r => r.source === 'ibkr' && r.spot !== null)
      .map(r => r.asOfDate)
  );
  
  const missingDates: string[] = [];
  const currentDate = new Date(startDate);
  
  // Debug: Check what dates we have vs what we're checking
  const existingDatesArray = Array.from(ibkrDates).sort();
  const lastExistingDate = existingDatesArray.length > 0 ? existingDatesArray[existingDatesArray.length - 1] : null;
  console.log(`[${tickerUpper}] Checking dates from ${firstTradeDate} to ${today.toISOString().split('T')[0]}. Existing IBKR dates: ${existingDatesArray.length} (last: ${lastExistingDate})`);
  
  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0]!;
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Check if IBKR spot data exists for this date
      if (!ibkrDates.has(dateStr)) {
        missingDates.push(dateStr);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Check specifically for Dec 19, 2025
  const dec19 = '2025-12-19';
  const hasDec19 = ibkrDates.has(dec19);
  const dec19InMissing = missingDates.includes(dec19);
  console.log(`[${tickerUpper}] Found ${missingDates.length} missing dates. First: ${missingDates[0] || 'none'}, Last: ${missingDates[missingDates.length - 1] || 'none'}`);
  console.log(`[${tickerUpper}] Dec 19 check: Has IBKR data: ${hasDec19}, In missing list: ${dec19InMissing}`);
  
  // Show last 5 missing dates to see if Dec 19 is there
  if (missingDates.length > 0) {
    const last5 = missingDates.slice(-5);
    console.log(`[${tickerUpper}] Last 5 missing dates: ${last5.join(', ')}`);
  }

  if (missingDates.length === 0) {
    return [];
  }

  // Consolidate consecutive dates into ranges
  const ranges: MissingDataRange[] = [];
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;

  for (let i = 0; i < missingDates.length; i++) {
    const date = missingDates[i]!;
    
    if (rangeStart === null) {
      rangeStart = date;
      rangeEnd = date;
    } else if (rangeEnd) {
      const prevDate = new Date(rangeEnd + 'T00:00:00Z');
      const currentDate = new Date(date + 'T00:00:00Z');
      const daysDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff === 1) {
        // Consecutive date, extend range
        rangeEnd = date;
      } else {
        // Gap in dates, save current range and start new one
        ranges.push({
          ticker: tickerUpper,
          startDate: rangeStart,
          endDate: rangeEnd,
          missingDays: (new Date(rangeEnd + 'T00:00:00Z').getTime() - new Date(rangeStart + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24) + 1,
          conid,
        });
        rangeStart = date;
        rangeEnd = date;
      }
    }
  }

  // Don't forget the last range
  if (rangeStart && rangeEnd) {
    ranges.push({
      ticker: tickerUpper,
      startDate: rangeStart,
      endDate: rangeEnd,
      missingDays: (new Date(rangeEnd + 'T00:00:00Z').getTime() - new Date(rangeStart + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24) + 1,
      conid,
    });
  }
  
  console.log(`[${tickerUpper}] Created ${ranges.length} ranges. Last range: ${ranges.length > 0 ? `${ranges[ranges.length - 1]!.startDate} to ${ranges[ranges.length - 1]!.endDate}` : 'none'}`);

  return ranges;
}

/**
 * Find all missing IBKR data ranges across all tickers
 * Only checks dates from first position date onwards for each ticker
 */
export async function findMissingDataRanges(
  preferredSource: string = 'ibkr',
  maxDaysBack: number = 90
): Promise<MissingDataRange[]> {
  // Get all tickers with their first position date and CONID
  const tickerToData = await getTickersWithFirstPositionDate();
  const allRanges: MissingDataRange[] = [];

  for (const [ticker, data] of tickerToData.entries()) {
    const ranges = await findMissingIbkrRangesForTicker(ticker, data.firstDate, data.conid);
    if (ranges.length > 0) {
      allRanges.push(...ranges);
    }
  }

  // Don't filter by maxDaysBack - we want to fetch from first position date onwards
  // But note: IBKR snapshot only returns CURRENT data, not historical
  // So we'll only fetch today's data and let other sources handle historical
  return allRanges.sort((a, b) => {
    // Sort by ticker first, then by date
    if (a.ticker !== b.ticker) {
      return a.ticker.localeCompare(b.ticker);
    }
    return a.startDate.localeCompare(b.startDate);
  });
}

/**
 * Get summary of missing IBKR data
 * Shows where IBKR is missing for dates from first position date onwards
 */
export async function getMissingDataSummary(
  preferredSource: string = 'ibkr'
): Promise<{
  totalTickers: number;
  tickersWithMissingData: number;
  totalMissingDays: number;
  oldestMissingDate: string | null;
  newestMissingDate: string | null;
  sourceCoverage: {
    source: string;
    tickers: number;
    dates: number;
  }[];
  ibkrCoverage: {
    tickers: number;
    dates: number;
    coveragePercent: number; // % of position dates that have IBKR data
  };
}> {
  const ranges = await findMissingDataRanges(preferredSource);
  const tickerToData = await getTickersWithFirstPositionDate();
  const tickers = Array.from(tickerToData.keys());
  
  // Get source coverage stats (all data, not just position dates)
  const sourceCoverage = await Promise.all(
    ['ibkr', 'massive', 'opt_strat', 'yahoo_finance', 'manual'].map(async (source) => {
      const records = await db
        .selectDistinct({
          ticker: underlyingsIvHistory.ticker,
          asOfDate: underlyingsIvHistory.asOfDate,
        })
        .from(underlyingsIvHistory)
        .where(eq(underlyingsIvHistory.source, source));
      
      const uniqueTickers = new Set(records.map(r => r.ticker));
      const uniqueDates = new Set(records.map(r => r.asOfDate));
      
      return {
        source,
        tickers: uniqueTickers.size,
        dates: uniqueDates.size,
      };
    })
  );

  // Get IBKR-specific coverage: count days from first position date to today
  let totalDaysFromFirstPosition = 0;
  let ibkrCoveredDates = 0;
  const ibkrTickers = new Set<string>();
  const today = new Date().toISOString().split('T')[0]!;
  
  for (const [ticker, data] of tickerToData.entries()) {
    // Calculate total days from first position date to today
    const firstDateObj = new Date(data.firstDate + 'T00:00:00Z');
    const todayDateObj = new Date(today + 'T00:00:00Z');
    const daysFromFirst = Math.floor((todayDateObj.getTime() - firstDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    totalDaysFromFirstPosition += daysFromFirst;
    
    // Count how many of those days have IBKR data
    const ibkrRecords = await db
      .select({ asOfDate: underlyingsIvHistory.asOfDate })
      .from(underlyingsIvHistory)
      .where(
        and(
          eq(underlyingsIvHistory.ticker, ticker),
          eq(underlyingsIvHistory.source, 'ibkr'),
          sql`${underlyingsIvHistory.asOfDate} >= ${data.firstDate}`,
          sql`${underlyingsIvHistory.asOfDate} <= ${today}`
        )
      );
    
    ibkrCoveredDates += ibkrRecords.length;
    if (ibkrRecords.length > 0) {
      ibkrTickers.add(ticker);
    }
  }
  
  const coveragePercent = totalDaysFromFirstPosition > 0 
    ? Math.round((ibkrCoveredDates / totalDaysFromFirstPosition) * 100) 
    : 0;
  
  if (ranges.length === 0) {
    return {
      totalTickers: tickers.length,
      tickersWithMissingData: 0,
      totalMissingDays: 0,
      oldestMissingDate: null,
      newestMissingDate: null,
      sourceCoverage,
      ibkrCoverage: {
        tickers: ibkrTickers.size,
        dates: ibkrCoveredDates,
        coveragePercent,
      },
    };
  }

  const uniqueTickers = new Set(ranges.map(r => r.ticker));
  const totalMissingDays = ranges.reduce((sum, r) => sum + r.missingDays, 0);
  const dates = ranges.flatMap(r => [r.startDate, r.endDate]);
  const sortedDates = dates.sort();

  return {
    totalTickers: tickers.length,
    tickersWithMissingData: uniqueTickers.size,
    totalMissingDays,
    oldestMissingDate: sortedDates[0] || null,
    newestMissingDate: sortedDates[sortedDates.length - 1] || null,
    sourceCoverage,
    ibkrCoverage: {
      tickers: ibkrTickers.size,
      dates: ibkrCoveredDates,
      coveragePercent,
    },
  };
}
