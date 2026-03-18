/**
 * Ingest NASDAQ and S&P 500 Index Prices into price_history
 *
 * Fetches daily OHLCV data from Yahoo Finance for ^IXIC (NASDAQ Composite)
 * and ^GSPC (S&P 500), ensures corresponding assets exist, and upserts
 * into the price_history table.
 *
 * Usage:
 *   npx tsx scripts/ingest-index-prices.ts              # Fetch 2 years
 *   npx tsx scripts/ingest-index-prices.ts --dry-run     # Preview without writing
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;

const INDEX_DEFINITIONS = [
  {
    ticker: '^IXIC',
    name: 'NASDAQ Composite',
    yahooTicker: '^IXIC',
    assetClass: 'INDEX',
  },
  {
    ticker: '^GSPC',
    name: 'S&P 500',
    yahooTicker: '^GSPC',
    assetClass: 'INDEX',
  },
] as const;

interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch daily OHLCV from Yahoo Finance.
 */
async function fetchYahooDailyPrices(
  yahooTicker: string,
  range: string = '2y'
): Promise<DailyPrice[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=${range}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    console.warn(`  Yahoo Finance: ${res.status} for ${yahooTicker}`);
    return [];
  }

  const data = (await res.json()) as Record<string, unknown>;
  const chart = data.chart as Record<string, unknown>;
  const results = (chart?.result as Array<Record<string, unknown>>) || [];
  if (results.length === 0) return [];

  const result = results[0];
  const timestamps = result.timestamp as number[];
  const indicators = result.indicators as Record<string, unknown>;
  const quote = (indicators?.quote as Array<Record<string, unknown>>)?.[0];
  const opens = quote?.open as (number | null)[];
  const highs = quote?.high as (number | null)[];
  const lows = quote?.low as (number | null)[];
  const closes = quote?.close as (number | null)[];
  const volumes = quote?.volume as (number | null)[];

  if (!timestamps || !closes) return [];

  const prices: DailyPrice[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
    prices.push({
      date,
      open: opens?.[i] ?? closes[i]!,
      high: highs?.[i] ?? closes[i]!,
      low: lows?.[i] ?? closes[i]!,
      close: closes[i]!,
      volume: volumes?.[i] ?? 0,
    });
  }

  return prices;
}

/**
 * Ensure an asset record exists for the given index. Returns asset ID.
 */
async function ensureAsset(def: (typeof INDEX_DEFINITIONS)[number]): Promise<string> {
  const existing = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(eq(schema.assets.ticker, def.ticker))
    .limit(1);

  if (existing.length > 0) {
    console.log(`  Asset "${def.ticker}" already exists (${existing[0].id})`);
    return existing[0].id;
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create asset "${def.ticker}" (${def.name})`);
    return 'dry-run-id';
  }

  const [inserted] = await db
    .insert(schema.assets)
    .values({
      ticker: def.ticker,
      name: def.name,
      assetClass: def.assetClass,
      pricingTier: 'market',
      baseCurrency: 'USD',
      isActive: true,
    })
    .returning({ id: schema.assets.id });

  console.log(`  Created asset "${def.ticker}" (${inserted.id})`);
  return inserted.id;
}

/**
 * Upsert price rows into price_history in batches.
 */
async function upsertPrices(
  rows: {
    assetId: string;
    priceDate: string;
    priceClose: string;
    priceOpen: string;
    priceHigh: string;
    priceLow: string;
    volume: string;
    source: string;
  }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(schema.priceHistory)
      .values(
        batch.map((r) => ({
          assetId: r.assetId,
          priceDate: r.priceDate,
          priceClose: r.priceClose,
          priceOpen: r.priceOpen,
          priceHigh: r.priceHigh,
          priceLow: r.priceLow,
          volume: r.volume,
          source: r.source,
        }))
      )
      .onConflictDoUpdate({
        target: [
          schema.priceHistory.assetId,
          schema.priceHistory.priceDate,
          schema.priceHistory.source,
        ],
        set: {
          priceClose: sql`excluded.price_close`,
          priceOpen: sql`excluded.price_open`,
          priceHigh: sql`excluded.price_high`,
          priceLow: sql`excluded.price_low`,
          volume: sql`excluded.volume`,
          updatedAt: sql`NOW()`,
        },
      });
    upserted += batch.length;
  }

  return upserted;
}

async function main() {
  console.log(`Ingesting index prices${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  for (const def of INDEX_DEFINITIONS) {
    console.log(`\n--- ${def.name} (${def.ticker}) ---`);

    // Step 1: Ensure asset exists
    const assetId = await ensureAsset(def);

    // Step 2: Fetch prices from Yahoo Finance
    console.log(`  Fetching 2y daily prices from Yahoo Finance...`);
    const prices = await fetchYahooDailyPrices(def.yahooTicker, '2y');
    console.log(`  Received ${prices.length} data points`);

    if (prices.length === 0) {
      console.warn(`  No prices received for ${def.ticker}, skipping.`);
      continue;
    }

    console.log(`  Date range: ${prices[0].date} to ${prices[prices.length - 1].date}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would upsert ${prices.length} rows`);
      console.log(`  Sample: ${prices[0].date} close=${prices[0].close.toFixed(2)}`);
      console.log(`  Sample: ${prices[prices.length - 1].date} close=${prices[prices.length - 1].close.toFixed(2)}`);
      continue;
    }

    // Step 3: Upsert into price_history
    const rows = prices.map((p) => ({
      assetId,
      priceDate: p.date,
      priceClose: p.close.toFixed(6),
      priceOpen: p.open.toFixed(6),
      priceHigh: p.high.toFixed(6),
      priceLow: p.low.toFixed(6),
      volume: Math.round(p.volume).toString(),
      source: 'yahoo',
    }));

    const upserted = await upsertPrices(rows);
    console.log(`  Upserted ${upserted} rows into price_history`);
  }

  console.log('\nDone.');
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
