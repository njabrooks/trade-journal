/**
 * Backfill Historical Price Data for Signal Correlation Analysis
 *
 * Fetches daily closing prices from Yahoo Finance for BTC, SPX, NDX, and GLXY.
 * Stores as signal_data_snapshots so correlation signals can be computed.
 * Also computes and reports rolling BTC-NASDAQ correlations.
 *
 * Usage:
 *   npx tsx scripts/backfill-price-history.ts              # Backfill 3 months
 *   npx tsx scripts/backfill-price-history.ts --dry-run     # Show data without storing
 */

import { db, closeDb, schema } from './lib/db.js';

const { signalDataSnapshots } = schema;

interface DailyPrice {
  date: string; // YYYY-MM-DD
  close: number;
}

const YAHOO_TICKERS: Record<string, string> = {
  BTC: 'BTC-USD',
  SPX: '^GSPC',
  NDX: '^IXIC', // NASDAQ Composite (IXIC) — more liquid than NDX for correlation
  GLXY: 'GLXY',
};

async function fetchYahooDailyPrices(ticker: string, range: string = '3mo'): Promise<DailyPrice[]> {
  const yahooTicker = YAHOO_TICKERS[ticker] || ticker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=${range}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    console.warn(`  Yahoo Finance: ${res.status} for ${yahooTicker}`);
    return [];
  }

  const data = await res.json() as Record<string, unknown>;
  const chart = data.chart as Record<string, unknown>;
  const results = (chart?.result as Array<Record<string, unknown>>) || [];
  if (results.length === 0) return [];

  const result = results[0];
  const timestamps = result.timestamp as number[];
  const indicators = result.indicators as Record<string, unknown>;
  const quote = (indicators?.quote as Array<Record<string, unknown>>)?.[0];
  const closes = quote?.close as (number | null)[];

  if (!timestamps || !closes) return [];

  const prices: DailyPrice[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] === null || closes[i] === undefined) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
    prices.push({ date, close: closes[i] as number });
  }

  return prices;
}

/**
 * Compute Pearson correlation coefficient between two price series.
 * Returns a value between -1 and 1.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  // Use daily returns instead of raw prices for correlation
  const xReturns: number[] = [];
  const yReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    xReturns.push((x[i] - x[i - 1]) / x[i - 1]);
    yReturns.push((y[i] - y[i - 1]) / y[i - 1]);
  }

  const meanX = xReturns.reduce((a, b) => a + b, 0) / xReturns.length;
  const meanY = yReturns.reduce((a, b) => a + b, 0) / yReturns.length;

  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < xReturns.length; i++) {
    const dx = xReturns[i] - meanX;
    const dy = yReturns[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : sumXY / denom;
}

/**
 * Compute SPX drawdown from recent high.
 */
function computeDrawdown(prices: number[]): number {
  if (prices.length === 0) return 0;
  const peak = Math.max(...prices);
  const current = prices[prices.length - 1];
  return ((peak - current) / peak) * 100;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Backfilling price history for correlation analysis...\n');

  // Fetch all price series
  const allPrices: Record<string, DailyPrice[]> = {};
  for (const [ticker, _] of Object.entries(YAHOO_TICKERS)) {
    console.log(`Fetching ${ticker}...`);
    const prices = await fetchYahooDailyPrices(ticker);
    allPrices[ticker] = prices;
    console.log(`  ${prices.length} daily prices (${prices[0]?.date} to ${prices[prices.length - 1]?.date})`);
  }

  // Align dates — find common trading days
  const btcDates = new Set(allPrices.BTC.map(p => p.date));
  const spxDates = new Set(allPrices.SPX.map(p => p.date));
  const ndxDates = new Set(allPrices.NDX.map(p => p.date));

  // BTC trades every day but SPX/NDX only on weekdays — use intersection
  const commonDates = [...btcDates].filter(d => spxDates.has(d) && ndxDates.has(d)).sort();
  console.log(`\nCommon trading days: ${commonDates.length}`);

  // Build aligned price arrays
  const btcMap = Object.fromEntries(allPrices.BTC.map(p => [p.date, p.close]));
  const spxMap = Object.fromEntries(allPrices.SPX.map(p => [p.date, p.close]));
  const ndxMap = Object.fromEntries(allPrices.NDX.map(p => [p.date, p.close]));

  const btcPrices = commonDates.map(d => btcMap[d]);
  const spxPrices = commonDates.map(d => spxMap[d]);
  const ndxPrices = commonDates.map(d => ndxMap[d]);

  // Compute rolling correlations
  const windows = [30, 60, 90];
  console.log('\n=== Rolling BTC-NASDAQ Correlations ===');

  for (const window of windows) {
    if (commonDates.length >= window) {
      const btcWindow = btcPrices.slice(-window);
      const ndxWindow = ndxPrices.slice(-window);
      const corr = pearsonCorrelation(btcWindow, ndxWindow);
      console.log(`  ${window}d correlation (BTC vs NASDAQ): ${corr.toFixed(4)}`);
    } else {
      console.log(`  ${window}d: insufficient data (need ${window}, have ${commonDates.length})`);
    }
  }

  // SPX drawdown
  const spxDrawdown = computeDrawdown(spxPrices);
  console.log(`\n  SPX drawdown from 3mo high: ${spxDrawdown.toFixed(2)}%`);
  console.log(`  SPX current: ${spxPrices[spxPrices.length - 1]?.toFixed(2)}`);
  console.log(`  SPX 3mo high: ${Math.max(...spxPrices).toFixed(2)}`);

  // Store daily price snapshots for each ticker
  // These serve as the time-series foundation for future correlation computations
  if (!dryRun) {
    console.log('\nStoring daily price snapshots...');

    // We'll store these as snapshots for a synthetic "price_history" data source
    // linked to the BTC correlation signals
    let stored = 0;
    for (const date of commonDates) {
      const snapshotDate = new Date(date + 'T16:00:00Z'); // Use market close time

      // Store BTC, NDX, SPX prices as individual snapshots
      for (const [ticker, priceMap] of [['BTC', btcMap], ['NDX', ndxMap], ['SPX', spxMap]] as const) {
        const price = (priceMap as Record<string, number>)[date];
        if (!price) continue;

        try {
          await db
            .insert(signalDataSnapshots)
            .values({
              signalId: ticker === 'BTC'
                ? '0a99ed25-e607-41a4-8cb8-dc04ff19642a' // BTC decorrelation signal
                : 'e25c67b1-8287-452a-8b77-ec49c38cd5d3', // BTC 90d correlation signal
              snapshotDate,
              observedValue: String(price),
              thresholdValue: '0',
              pctToThreshold: '0',
              unit: ticker === 'BTC' ? 'USD' : 'index',
              evidenceSummary: `${ticker} daily close: ${price.toFixed(2)}`,
              dataSource: `price_history_${ticker.toLowerCase()}`,
            })
            .onConflictDoNothing();
          stored++;
        } catch {
          // Skip duplicates
        }
      }
    }

    console.log(`  Stored ${stored} price snapshots`);

    // Also compute and store the current correlations as derived snapshots
    const now = new Date();
    if (commonDates.length >= 30) {
      const corr30 = pearsonCorrelation(btcPrices.slice(-30), ndxPrices.slice(-30));
      await db.insert(signalDataSnapshots).values({
        signalId: '0a99ed25-e607-41a4-8cb8-dc04ff19642a', // 30d decorrelation signal
        snapshotDate: now,
        observedValue: String(corr30),
        thresholdValue: '0.3',
        pctToThreshold: String(Math.round((corr30 / 0.3) * 100 * 100) / 100),
        unit: 'correlation',
        evidenceSummary: `30d BTC-NASDAQ correlation: ${corr30.toFixed(4)} | SPX drawdown: ${spxDrawdown.toFixed(1)}% | Signal requires corr<0.3 during SPX drawdown>5%`,
        dataSource: 'derived',
      }).onConflictDoNothing();
      console.log(`  30d correlation snapshot stored: ${corr30.toFixed(4)}`);
    }

    if (commonDates.length >= 60) {
      const corr90 = pearsonCorrelation(btcPrices, ndxPrices); // Use all available data
      await db.insert(signalDataSnapshots).values({
        signalId: 'e25c67b1-8287-452a-8b77-ec49c38cd5d3', // 90d correlation signal
        snapshotDate: now,
        observedValue: String(corr90),
        thresholdValue: '0.7',
        pctToThreshold: String(Math.round((corr90 / 0.7) * 100 * 100) / 100),
        unit: 'correlation',
        evidenceSummary: `${commonDates.length}d BTC-NASDAQ correlation: ${corr90.toFixed(4)} | Invalidation if sustained >0.7 through 2027`,
        dataSource: 'derived',
      }).onConflictDoNothing();
      console.log(`  ${commonDates.length}d correlation snapshot stored: ${corr90.toFixed(4)}`);
    }
  }

  console.log('\nDone.');
  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
