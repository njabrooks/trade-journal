/**
 * IBKR Historical Spot Price Service
 * 
 * Fetches historical spot prices from IBKR historical endpoint
 * Used to replace Yahoo Finance spot data (more reliable)
 */

import { getHistorical } from './marketdata';
import type { HistoricalDataResponse, HistoricalBar } from './types';

/**
 * Get historical spot price for a specific date
 * Uses IBKR historical endpoint which returns OHLCV bars
 * 
 * @param conid Contract ID
 * @param targetDate Target date (YYYY-MM-DD)
 * @returns Spot price (close price) for that date, or null if not found
 */
export async function getHistoricalSpotForDate(
  conid: number,
  targetDate: string
): Promise<number | null> {
  try {
    // Calculate period needed to include target date
    const targetDateObj = new Date(targetDate + 'T00:00:00Z');
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - targetDateObj.getTime()) / (1000 * 60 * 60 * 24));
    
    // Determine period and bar size
    let period: string;
    if (daysDiff <= 7) {
      period = '1w';
    } else if (daysDiff <= 30) {
      period = '1m';
    } else if (daysDiff <= 90) {
      period = '3m';
    } else if (daysDiff <= 365) {
      period = '1y';
    } else {
      period = '2y'; // Max period
    }
    
    const bar = '1d'; // Daily bars
    
    // Fetch historical data
    const response = await getHistorical(conid, period, bar);
    
    if (!response.data || response.data.length === 0) {
      return null;
    }
    
    // Find the bar that matches the target date
    // Bars have timestamp in milliseconds
    const targetTimestamp = targetDateObj.getTime();
    const targetDateStart = new Date(targetDate + 'T00:00:00Z').getTime();
    const targetDateEnd = new Date(targetDate + 'T23:59:59Z').getTime();
    
    // Find bar closest to target date
    let closestBar: HistoricalBar | null = null;
    let minDiff = Infinity;
    
    for (const bar of response.data) {
      const barTime = bar.t;
      // Check if bar is within the target date
      if (barTime >= targetDateStart && barTime <= targetDateEnd) {
        // Exact match
        return bar.c; // Close price
      }
      
      // Track closest bar
      const diff = Math.abs(barTime - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestBar = bar;
      }
    }
    
    // If no exact match, use closest bar (within 1 day tolerance)
    if (closestBar && minDiff <= 24 * 60 * 60 * 1000) {
      return closestBar.c; // Close price
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching historical spot for conid ${conid} on ${targetDate}:`, error);
    return null;
  }
}

/**
 * Get historical spot prices for multiple dates
 * 
 * @param conid Contract ID
 * @param dates Array of dates (YYYY-MM-DD)
 * @returns Map of date -> spot price
 */
export async function getHistoricalSpotsForDates(
  conid: number,
  dates: string[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  // Fetch once with max period needed
  const sortedDates = dates.sort();
  const earliestDate = sortedDates[0]!;
  const latestDate = sortedDates[sortedDates.length - 1]!;
  
  const earliestDateObj = new Date(earliestDate + 'T00:00:00Z');
  const latestDateObj = new Date(latestDate + 'T00:00:00Z');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const daysFromEarliest = Math.floor((today.getTime() - earliestDateObj.getTime()) / (1000 * 60 * 60 * 24));
  const daysFromLatest = Math.floor((today.getTime() - latestDateObj.getTime()) / (1000 * 60 * 60 * 24));
  
  // IBKR historical endpoint supports max 2y period
  // For larger ranges, we need to fetch in chunks
  // Strategy: Fetch 2y chunks starting from today and going backwards
  
  try {
    const allDateToPrice = new Map<string, number>();
    
    // If the range is within 2 years, fetch once
    if (daysFromEarliest <= 730) {
      let period: string;
      if (daysFromEarliest <= 7) {
        period = '1w';
      } else if (daysFromEarliest <= 30) {
        period = '1m';
      } else if (daysFromEarliest <= 90) {
        period = '3m';
      } else if (daysFromEarliest <= 365) {
        period = '1y';
      } else {
        period = '2y';
      }
      
      console.log(`Fetching historical data for conid ${conid}, period: ${period}, dates: ${dates.length} (${earliestDate} to ${latestDate})`);
      const response = await getHistorical(conid, period, '1d');
      
      if (response.data && response.data.length > 0) {
        console.log(`Received ${response.data.length} bars for conid ${conid}`);
        
        // Debug: Show first and last few dates to understand date format
        const firstFew = response.data.slice(0, 3).map(bar => {
          const barDate = new Date(bar.t);
          return {
            timestamp: bar.t,
            iso: barDate.toISOString(),
            dateStr: barDate.toISOString().split('T')[0],
            local: barDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
          };
        });
        const lastFew = response.data.slice(-3).map(bar => {
          const barDate = new Date(bar.t);
          return {
            timestamp: bar.t,
            iso: barDate.toISOString(),
            dateStr: barDate.toISOString().split('T')[0],
            local: barDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
          };
        });
        console.log(`First 3 bars:`, JSON.stringify(firstFew, null, 2));
        console.log(`Last 3 bars:`, JSON.stringify(lastFew, null, 2));
        console.log(`Requested date range: ${earliestDate} to ${latestDate}`);
        
        for (const bar of response.data) {
          const barDate = new Date(bar.t);
          // IBKR timestamps are in milliseconds, likely representing end of trading day in ET
          // Convert to ET date string to match trading dates
          // Use UTC date string for now, but we'll also try ET date
          const utcDateStr = barDate.toISOString().split('T')[0]!;
          
          // Also try ET date (market timezone) - bars might be timestamped at market close (4PM ET)
          // which is 9PM UTC, so same day. But if timestamped at midnight ET, it's 5AM UTC next day
          const etDateStr = barDate.toLocaleDateString('en-CA', { 
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
          // Store both UTC and ET dates to handle timezone issues
          allDateToPrice.set(utcDateStr, bar.c);
          if (utcDateStr !== etDateStr) {
            allDateToPrice.set(etDateStr, bar.c);
          }
        }
      } else {
        console.warn(`No historical data returned for conid ${conid} with period ${period}`);
      }
    } else {
      // Range exceeds 2 years - fetch in 2y chunks
      console.log(`Range exceeds 2 years (${daysFromEarliest} days), fetching in chunks for conid ${conid}`);
      
      let chunkEnd = new Date(today);
      let chunkStart = new Date(chunkEnd);
      chunkStart.setFullYear(chunkStart.getFullYear() - 2);
      
      while (chunkStart >= earliestDateObj) {
        // Adjust chunk start to not go before earliest date
        if (chunkStart < earliestDateObj) {
          chunkStart = new Date(earliestDateObj);
        }
        
        console.log(`Fetching chunk: ${chunkStart.toISOString().split('T')[0]} to ${chunkEnd.toISOString().split('T')[0]} for conid ${conid}`);
        const response = await getHistorical(conid, '2y', '1d');
        
        if (response.data && response.data.length > 0) {
          for (const bar of response.data) {
            const barDate = new Date(bar.t);
            const utcDateStr = barDate.toISOString().split('T')[0]!;
            const etDateStr = barDate.toLocaleDateString('en-CA', { 
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            
            // Store both UTC and ET dates
            if (utcDateStr >= earliestDate && utcDateStr <= latestDate) {
              allDateToPrice.set(utcDateStr, bar.c);
            }
            if (etDateStr >= earliestDate && etDateStr <= latestDate && etDateStr !== utcDateStr) {
              allDateToPrice.set(etDateStr, bar.c);
            }
          }
          console.log(`Chunk: Added ${response.data.length} bars, ${allDateToPrice.size} total in map`);
        }
        
        // Move to next chunk (2 years earlier)
        chunkEnd = new Date(chunkStart);
        chunkEnd.setDate(chunkEnd.getDate() - 1);
        chunkStart = new Date(chunkEnd);
        chunkStart.setFullYear(chunkStart.getFullYear() - 2);
      }
      
      console.log(`Fetched ${allDateToPrice.size} total bars across chunks for conid ${conid}`);
    }
    
    // Match requested dates
    // If a date isn't found, it might be a holiday/weekend - try to find nearest trading day
    let matched = 0;
    const availableDates = Array.from(allDateToPrice.keys()).sort();
    
    for (const date of dates) {
      let price = allDateToPrice.get(date);
      
      if (price !== undefined) {
        // Exact match found
        results.set(date, price);
        matched++;
      } else {
        // Date not found - might be a holiday/weekend
        // Try to find nearest trading day (within 3 days)
        const dateObj = new Date(date + 'T00:00:00Z');
        const isToday = dateObj.getTime() === today.getTime();
        
        if (isToday) {
          console.warn(`Date ${date} is today - historical API may not have today's data yet (market may still be open)`);
        } else if (availableDates.length > 0) {
          // Find nearest trading day
          let nearestDate: string | null = null;
          let minDiff = Infinity;
          
          for (const availableDate of availableDates) {
            const availableDateObj = new Date(availableDate + 'T00:00:00Z');
            const diff = Math.abs(availableDateObj.getTime() - dateObj.getTime());
            // Only consider dates within 3 days (holidays are usually 1 day)
            if (diff <= 3 * 24 * 60 * 60 * 1000 && diff < minDiff) {
              minDiff = diff;
              nearestDate = availableDate;
            }
          }
          
          if (nearestDate) {
            price = allDateToPrice.get(nearestDate);
            if (price !== undefined) {
              // Use price from nearest trading day
              results.set(date, price);
              matched++;
              console.log(`Date ${date} (holiday/weekend) - using nearest trading day ${nearestDate}`);
            }
          } else {
            // No nearby trading day found
            const earliest = availableDates[0]!;
            const latest = availableDates[availableDates.length - 1]!;
            console.warn(`Date ${date} not found in historical data and no nearby trading day. Available range: ${earliest} to ${latest}`);
          }
        }
      }
    }
    
    console.log(`Matched ${matched} of ${dates.length} requested dates for conid ${conid}`);
    
  } catch (error) {
    // Check if it's a "no bridge" error - this is a gateway connectivity issue, not a code issue
    if (error instanceof Error && error.message.includes('no bridge')) {
      console.error(`Bridge connection unavailable for conid ${conid}. Gateway is authenticated but bridge to IBKR servers is not established.`);
      console.error(`Try re-authenticating at https://localhost:5001 and wait a moment for the bridge to establish.`);
    } else {
      console.error(`Error fetching historical spots for conid ${conid}:`, error);
      if (error instanceof Error) {
        console.error(`Error details: ${error.message}`);
        if ('cause' in error) {
          console.error(`Error cause:`, error.cause);
        }
      }
    }
  }
  
  return results;
}

