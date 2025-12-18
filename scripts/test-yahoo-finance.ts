#!/usr/bin/env tsx
/**
 * Quick test of Yahoo Finance API for spot prices
 * Standalone test - doesn't require database connection
 */

async function fetchYahooFinanceSpot(
  ticker: string,
  date: string
): Promise<number | null> {
  try {
    const dateObj = new Date(date + 'T00:00:00Z');
    const startTimestamp = Math.floor(dateObj.getTime() / 1000) - 86400;
    const endTimestamp = Math.floor(dateObj.getTime() / 1000) + 86400;
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeJournal/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.warn(`  HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data?.chart?.error) {
      console.warn(`  Error:`, data.chart.error);
      return null;
    }
    
    if (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
      const closes = data.chart.result[0].indicators.quote[0].close;
      const timestamps = data.chart.result[0].timestamp;
      
      if (!timestamps || timestamps.length === 0) {
        return null;
      }
      
      const targetTimestamp = Math.floor(dateObj.getTime() / 1000);
      let bestMatch: { index: number; diff: number } | null = null;
      
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const tsDate = new Date(ts * 1000).toISOString().split('T')[0];
        const diff = Math.abs(ts - targetTimestamp);
        
        if (tsDate === date && closes[i] !== null && closes[i] !== undefined) {
          return closes[i];
        }
        
        if (diff < 3 * 86400 && closes[i] !== null && closes[i] !== undefined) {
          if (!bestMatch || diff < bestMatch.diff) {
            bestMatch = { index: i, diff };
          }
        }
      }
      
      if (bestMatch) {
        return closes[bestMatch.index];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`  Error:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function testYahooFinance() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const testTickers = ['TSLA', 'AAPL', 'NVDA'];
  
  console.log(`🧪 Testing Yahoo Finance API\n`);
  console.log(`Today: ${today}`);
  console.log(`Yesterday: ${yesterday}\n`);
  
  for (const ticker of testTickers) {
    console.log(`[${ticker}] Testing...`);
    
    // Test yesterday (should definitely work)
    console.log(`  Yesterday (${yesterday}):`);
    const yesterdaySpot = await fetchYahooFinanceSpot(ticker, yesterday);
    if (yesterdaySpot) {
      console.log(`    ✅ $${yesterdaySpot.toFixed(2)}`);
    } else {
      console.log(`    ❌ No data`);
    }
    
    // Test today (may or may not work depending on timing)
    console.log(`  Today (${today}):`);
    const todaySpot = await fetchYahooFinanceSpot(ticker, today);
    if (todaySpot) {
      console.log(`    ✅ $${todaySpot.toFixed(2)} (EOD data available!)`);
    } else {
      console.log(`    ❌ No data (may not be finalized yet)`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n✅ Test complete`);
}

testYahooFinance()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
