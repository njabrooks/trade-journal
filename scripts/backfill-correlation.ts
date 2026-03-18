/**
 * Backfill historical BTC-NASDAQ correlation snapshots.
 *
 * Fetches ~18 months of daily prices from Yahoo Finance, computes rolling
 * 30-day and 90-day Pearson correlation on daily returns, and inserts
 * one snapshot per day for each correlation signal.
 *
 * Usage:
 *   npx tsx scripts/backfill-correlation.ts              # Backfill and insert
 *   npx tsx scripts/backfill-correlation.ts --dry-run    # Preview without writing
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const { signalDataSnapshots } = schema;

// Signal IDs from database
const SIGNALS = [
  {
    id: 'e25c67b1-8287-452a-8b77-ec49c38cd5d3',
    label: '90d BTC-NASDAQ correlation',
    window: 90,
    threshold: 0.7,
  },
  {
    id: '0a99ed25-e607-41a4-8cb8-dc04ff19642a',
    label: '30d BTC-NASDAQ decorrelation',
    window: 30,
    threshold: 0, // warning signal — threshold is "below 0.3"
  },
];

interface DailyPrice {
  date: string;
  close: number;
}

async function fetchYahooPrices(ticker: string, range = '2y'): Promise<DailyPrice[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) {
    console.error(`  Yahoo Finance error for ${ticker}: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as Record<string, unknown>;
  const chart = data.chart as Record<string, unknown>;
  const results = (chart?.result as Array<Record<string, unknown>>) || [];
  if (results.length === 0) return [];

  const result = results[0];
  const timestamps = result.timestamp as number[];
  const quote = (
    (result.indicators as Record<string, unknown>)?.quote as Array<
      Record<string, unknown>
    >
  )?.[0];
  const closes = quote?.close as (number | null)[];
  if (!timestamps || !closes) return [];

  return timestamps
    .map((ts, i) =>
      closes[i] != null
        ? {
            date: new Date(ts * 1000).toISOString().split('T')[0],
            close: closes[i]!,
          }
        : null
    )
    .filter((p): p is DailyPrice => p !== null);
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 10) return NaN;

  // Correlate daily returns
  const xr: number[] = [];
  const yr: number[] = [];
  for (let i = 1; i < n; i++) {
    xr.push((x[i] - x[i - 1]) / x[i - 1]);
    yr.push((y[i] - y[i - 1]) / y[i - 1]);
  }

  const mx = xr.reduce((a, b) => a + b, 0) / xr.length;
  const my = yr.reduce((a, b) => a + b, 0) / yr.length;

  let sxy = 0,
    sx2 = 0,
    sy2 = 0;
  for (let i = 0; i < xr.length; i++) {
    const dx = xr[i] - mx;
    const dy = yr[i] - my;
    sxy += dx * dy;
    sx2 += dx * dx;
    sy2 += dy * dy;
  }

  const d = Math.sqrt(sx2 * sy2);
  return d === 0 ? 0 : sxy / d;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Backfill BTC-NASDAQ Correlation');
  console.log('Fetching price history from Yahoo Finance...\n');

  const [btcData, ndxData] = await Promise.all([
    fetchYahooPrices('BTC-USD', '2y'),
    fetchYahooPrices('^IXIC', '2y'),
  ]);

  console.log(`  BTC: ${btcData.length} days`);
  console.log(`  NASDAQ: ${ndxData.length} days`);

  // Build price maps
  const btcMap = new Map(btcData.map((p) => [p.date, p.close]));
  const ndxMap = new Map(ndxData.map((p) => [p.date, p.close]));

  // Find common dates (both have data)
  const commonDates = btcData
    .map((p) => p.date)
    .filter((d) => ndxMap.has(d))
    .sort();

  console.log(`  Common trading days: ${commonDates.length}\n`);

  for (const signal of SIGNALS) {
    console.log(`Signal: ${signal.label} (${signal.window}d window)`);

    // Need at least window+1 days to compute first correlation
    const startIdx = signal.window;
    let inserted = 0;
    let skipped = 0;

    const rows: Array<{
      signalId: string;
      snapshotDate: Date;
      observedValue: string;
      thresholdValue: string;
      pctToThreshold: string;
      unit: string;
      evidenceSummary: string | null;
      dataSource: string;
    }> = [];

    for (let i = startIdx; i < commonDates.length; i++) {
      const date = commonDates[i];
      const windowDates = commonDates.slice(i - signal.window, i + 1);

      const btcPrices = windowDates.map((d) => btcMap.get(d)!);
      const ndxPrices = windowDates.map((d) => ndxMap.get(d)!);

      const corr = pearsonCorrelation(btcPrices, ndxPrices);
      if (isNaN(corr)) continue;

      const pct =
        signal.threshold > 0 ? (corr / signal.threshold) * 100 : 0;

      // Use midnight UTC for the date
      const snapshotDate = new Date(date + 'T00:00:00Z');

      rows.push({
        signalId: signal.id,
        snapshotDate,
        observedValue: String(corr),
        thresholdValue: String(signal.threshold),
        pctToThreshold: String(Math.round(pct * 100) / 100),
        unit: 'correlation',
        evidenceSummary: `${signal.window}d BTC-NASDAQ correlation: ${corr.toFixed(4)}`,
        dataSource: 'derived',
      });
    }

    console.log(`  Computed ${rows.length} daily correlation values`);
    console.log(
      `  Range: ${rows[0]?.snapshotDate.toISOString().split('T')[0]} → ${rows[rows.length - 1]?.snapshotDate.toISOString().split('T')[0]}`
    );
    console.log(
      `  Latest: ${parseFloat(rows[rows.length - 1]?.observedValue).toFixed(4)}`
    );

    if (!dryRun && rows.length > 0) {
      // Batch insert with onConflictDoNothing
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await db
          .insert(signalDataSnapshots)
          .values(batch)
          .onConflictDoNothing();
        inserted += batch.length;
      }
      console.log(`  Inserted up to ${inserted} rows (dupes skipped)\n`);
    } else {
      console.log(`  (dry run — no data written)\n`);
    }
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
