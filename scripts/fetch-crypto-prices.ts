/**
 * Daily Crypto Price Fetcher
 *
 * Fetches yesterday's crypto prices from the Massive API (Polygon.io grouped
 * crypto endpoint) and upserts into price_history with source 'massive'.
 * Also copies prices for proxy-tier assets from their market-tier targets.
 *
 * Designed to run as a GitHub Actions cron job (twice daily for resilience).
 * Fully idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/fetch-crypto-prices.ts [--date YYYY-MM-DD] [--dry-run]
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY;
const MASSIVE_BASE = 'https://api.massive.com';
const BATCH_SIZE = 200;

interface MassiveResult {
  T: string;  // "X:BTCUSD"
  c: number;  // close
  o: number;  // open
  h: number;  // high
  l: number;  // low
  v: number;  // volume
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTargetDate(): string {
  const dateIdx = process.argv.indexOf('--date');
  if (dateIdx >= 0 && process.argv[dateIdx + 1]) {
    return process.argv[dateIdx + 1];
  }
  return getYesterdayDate();
}

async function fetchMassiveGrouped(dateStr: string): Promise<Map<string, MassiveResult>> {
  if (!MASSIVE_API_KEY) throw new Error('MASSIVE_API_KEY not set');

  const url = `${MASSIVE_BASE}/v2/aggs/grouped/locale/global/market/crypto/${dateStr}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${MASSIVE_API_KEY}` },
  });

  if (response.status === 429) {
    throw new Error('429 rate limited — try again later');
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Massive API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  const priceMap = new Map<string, MassiveResult>();

  for (const result of (data.results ?? []) as MassiveResult[]) {
    const sym = result.T;
    // Only USD-denominated crypto pairs: "X:BTCUSD" → "BTC"
    if (sym.startsWith('X:') && sym.endsWith('USD') && result.c > 0) {
      const base = sym.slice(2, -3);
      priceMap.set(base.toUpperCase(), result);
    }
  }

  return priceMap;
}

async function upsertPrices(
  rows: { assetId: string; priceDate: string; priceClose: string; priceOpen?: string; priceHigh?: string; priceLow?: string; volume?: string; source: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(schema.priceHistory).values(
      batch.map((r) => ({
        assetId: r.assetId,
        priceDate: r.priceDate,
        priceClose: r.priceClose,
        priceOpen: r.priceOpen ?? null,
        priceHigh: r.priceHigh ?? null,
        priceLow: r.priceLow ?? null,
        volume: r.volume ?? null,
        source: r.source,
      }))
    ).onConflictDoUpdate({
      target: [schema.priceHistory.assetId, schema.priceHistory.priceDate, schema.priceHistory.source],
      set: {
        priceClose: sql`excluded.price_close`,
        priceOpen: sql`excluded.price_open`,
        priceHigh: sql`excluded.price_high`,
        priceLow: sql`excluded.price_low`,
        volume: sql`excluded.volume`,
        updatedAt: sql`NOW()`,
      },
    });
    inserted += batch.length;
  }

  return inserted;
}

async function main() {
  const dateStr = getTargetDate();
  console.log(`Fetching crypto prices for ${dateStr}${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  // Step 1: Build ticker → assetId map for market-tier crypto assets
  const marketCrypto = await db.execute(sql`
    SELECT id, UPPER(ticker) as ticker
    FROM assets
    WHERE pricing_tier = 'market' AND asset_class = 'CRYPTO'
  `);
  const tickerToAssetId = new Map<string, string>();
  for (const row of marketCrypto as any[]) {
    tickerToAssetId.set(row.ticker, row.id);
  }
  console.log(`Market-tier crypto assets: ${tickerToAssetId.size}`);

  // Step 2: Fetch from Massive API
  console.log('Calling Massive API...');
  const priceMap = await fetchMassiveGrouped(dateStr);
  console.log(`Massive returned ${priceMap.size} crypto pairs\n`);

  // Step 3: Match and prepare upsert rows
  const rows: { assetId: string; priceDate: string; priceClose: string; priceOpen?: string; priceHigh?: string; priceLow?: string; volume?: string; source: string }[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const [ticker, result] of priceMap) {
    const assetId = tickerToAssetId.get(ticker);
    if (assetId) {
      rows.push({
        assetId,
        priceDate: dateStr,
        priceClose: String(result.c),
        priceOpen: result.o > 0 ? String(result.o) : undefined,
        priceHigh: result.h > 0 ? String(result.h) : undefined,
        priceLow: result.l > 0 ? String(result.l) : undefined,
        volume: result.v > 0 ? String(result.v) : undefined,
        source: 'massive',
      });
      matched++;
    } else {
      unmatched++;
    }
  }

  // Also check which market-tier crypto assets were NOT matched
  const unmatchedAssets: string[] = [];
  for (const [ticker] of tickerToAssetId) {
    if (!priceMap.has(ticker)) {
      unmatchedAssets.push(ticker);
    }
  }

  console.log(`Matched: ${matched} assets`);
  console.log(`Unmatched Massive tickers (no asset): ${unmatched}`);
  if (unmatchedAssets.length > 0) {
    console.log(`Market-tier crypto without Massive price: ${unmatchedAssets.length}`);
    if (unmatchedAssets.length <= 20) {
      console.log(`  ${unmatchedAssets.join(', ')}`);
    } else {
      console.log(`  ${unmatchedAssets.slice(0, 20).join(', ')} ... and ${unmatchedAssets.length - 20} more`);
    }
  }

  // Step 4: Upsert
  if (!DRY_RUN && rows.length > 0) {
    const count = await upsertPrices(rows);
    console.log(`\nUpserted ${count} prices into price_history (source: massive)`);
  } else if (DRY_RUN) {
    console.log(`\nDry run — would upsert ${rows.length} prices`);
  }

  // Step 5: Copy prices for proxy-tier assets
  console.log('\n--- Proxy price copy ---');
  const proxyAssets = await db.execute(sql`
    SELECT a.id, a.ticker, a.proxy_asset_id, p.ticker as proxy_target_ticker
    FROM assets a
    JOIN assets p ON a.proxy_asset_id = p.id
    WHERE a.pricing_tier = 'proxy' AND a.proxy_asset_id IS NOT NULL
  `);
  console.log(`Proxy-tier assets: ${(proxyAssets as any[]).length}`);

  if (!DRY_RUN && (proxyAssets as any[]).length > 0) {
    // Copy best price from proxy target for the target date
    const proxyResult = await db.execute(sql.raw(`
      INSERT INTO price_history (asset_id, price_date, price_close, source)
      SELECT a.id, '${dateStr}', ph.price_close, 'manual'
      FROM assets a
      JOIN assets p ON a.proxy_asset_id = p.id
      JOIN price_history ph ON ph.asset_id = p.id AND ph.price_date = '${dateStr}'
      WHERE a.pricing_tier = 'proxy'
        AND a.proxy_asset_id IS NOT NULL
        AND ph.price_close IS NOT NULL
      ON CONFLICT (asset_id, price_date, source) DO NOTHING
    `));
    console.log('Proxy prices copied (source: manual)');
  } else if (DRY_RUN) {
    console.log('Dry run — would copy proxy prices');
  }

  await closeDb();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
