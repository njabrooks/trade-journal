/**
 * Position Price Extraction — Standalone Script
 *
 * Extracts MTM prices from Trade Journal's positions table into price_history:
 * - IBKR positions → source 'ibkr'
 * - Non-IBKR positions (Solana, Kraken, etc.) → source 'snapshot'
 * Also inserts hardcoded $1.00 prices for stablecoins/fiat and FX rates.
 *
 * Same SQL logic as src/lib/calculations/price-population.ts but standalone
 * (no CalcContext dependency). Designed to run as a post-step after each
 * Flex ingestion in the GitHub Actions workflow.
 *
 * Fully idempotent — ON CONFLICT DO UPDATE overwrites with latest mark.
 *
 * Usage:
 *   npx tsx scripts/extract-ibkr-prices.ts
 */

import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

const STABLECOIN_TICKERS = [
  'USDT', 'USDC', 'DAI', 'BUSD', 'PYUSD', 'TUSD', 'USDP', 'FRAX',
  'GUSD', 'LUSD', 'SUSD', 'CUSD', 'UST', 'USDD', 'EUROC',
];
const FIAT_TICKERS = ['USD'];
const USER_ID = 'user_2mYzScugP7zfcqv8Ox21i7q9nyW';

async function extractIbkrPrices(): Promise<number> {
  // INSERT...SELECT from positions table with asset resolution via JOIN.
  // Priority: assets.ticker match first, then asset_aliases match.
  const result = await db.execute(sql`
    WITH pos_with_asset AS (
      SELECT DISTINCT ON (COALESCE(a1.id, a2.id), p.snapshot_date)
        COALESCE(a1.id, a2.id) as asset_id,
        p.snapshot_date as price_date,
        p.spot as price_close,
        'ibkr' as source
      FROM positions p
      JOIN accounts acct ON p.account_id = acct.id AND acct.broker_name = 'IBKR'
      LEFT JOIN assets a1 ON UPPER(p.symbol) = UPPER(a1.ticker)
      LEFT JOIN asset_aliases aa ON UPPER(p.symbol) = UPPER(aa.alias)
      LEFT JOIN assets a2 ON aa.asset_id = a2.id
      WHERE p.spot IS NOT NULL
        AND p.spot::numeric > 0
        AND p.snapshot_date IS NOT NULL
        AND COALESCE(p.asset_class, '') NOT IN ('FUT', 'CASH')
        AND COALESCE(a1.id, a2.id) IS NOT NULL
      ORDER BY COALESCE(a1.id, a2.id), p.snapshot_date, p.spot::numeric DESC
    )
    INSERT INTO price_history (asset_id, price_date, price_close, source)
    SELECT asset_id, price_date, price_close, source
    FROM pos_with_asset
    ON CONFLICT (asset_id, price_date, source) DO UPDATE
      SET price_close = EXCLUDED.price_close,
          updated_at = NOW()
  `);

  // Count IBKR prices
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM price_history WHERE source = 'ibkr'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? '0');
}

async function insertStablecoinPrices(): Promise<number> {
  const allTickers = [...STABLECOIN_TICKERS, ...FIAT_TICKERS];
  const tickerList = allTickers.map((t) => `'${t}'`).join(', ');

  await db.execute(sql.raw(`
    WITH stable_positions AS (
      SELECT DISTINCT db.asset::uuid as asset_id, db.date::date as price_date
      FROM portfolio_daily_balances db
      JOIN assets a ON db.asset = a.id::text
      WHERE db.user_id = '${USER_ID}'
        AND db.quantity::numeric > 0
        AND UPPER(a.ticker) IN (${tickerList})
    )
    INSERT INTO price_history (asset_id, price_date, price_close, source)
    SELECT asset_id, price_date, '1.0', 'manual'
    FROM stable_positions
    ON CONFLICT (asset_id, price_date, source) DO NOTHING
  `));

  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM price_history WHERE source = 'manual'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? '0');
}

async function extractSnapshotPrices(): Promise<number> {
  // Extract prices from non-IBKR positions (Solana, Kraken, Deribit, etc.)
  // These are lower priority than API sources but provide coverage for
  // assets/dates not yet fetched from Massive/CoinGecko.
  await db.execute(sql`
    WITH pos_with_asset AS (
      SELECT DISTINCT ON (COALESCE(a1.id, a2.id), p.snapshot_date)
        COALESCE(a1.id, a2.id) as asset_id,
        p.snapshot_date as price_date,
        p.spot as price_close,
        'snapshot' as source
      FROM positions p
      JOIN accounts acct ON p.account_id = acct.id AND acct.broker_name != 'IBKR'
      LEFT JOIN assets a1 ON UPPER(p.symbol) = UPPER(a1.ticker)
      LEFT JOIN asset_aliases aa ON UPPER(p.symbol) = UPPER(aa.alias)
      LEFT JOIN assets a2 ON aa.asset_id = a2.id
      WHERE p.spot IS NOT NULL
        AND p.spot::numeric > 0
        AND p.snapshot_date IS NOT NULL
        AND COALESCE(a1.id, a2.id) IS NOT NULL
      ORDER BY COALESCE(a1.id, a2.id), p.snapshot_date, p.spot::numeric DESC
    )
    INSERT INTO price_history (asset_id, price_date, price_close, source)
    SELECT asset_id, price_date, price_close, source
    FROM pos_with_asset
    ON CONFLICT (asset_id, price_date, source) DO UPDATE
      SET price_close = EXCLUDED.price_close,
          updated_at = NOW()
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM price_history WHERE source = 'snapshot'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? '0');
}

async function extractFxRatePrices(): Promise<number> {
  // Copy FX rates from fx_rates table into price_history for fiat currency assets.
  // This keeps fiat prices current for portfolio valuation and M5/M6 FX conversion.
  // The fx_rates table is populated daily by IBKR Flex RATE section.
  // We store the rate as price_close (e.g., GBP→USD rate = 1.27 means 1 GBP = $1.27).
  const result = await db.execute(sql`
    INSERT INTO price_history (asset_id, price_date, price_close, source)
    SELECT
      a.id as asset_id,
      fr.snapshot_date as price_date,
      fr.rate as price_close,
      'fx_rate' as source
    FROM fx_rates fr
    JOIN assets a ON UPPER(a.ticker) = UPPER(fr.from_currency)
      AND a.asset_class = 'FIAT'
      AND a.pricing_tier = 'market'
    WHERE fr.to_currency = 'USD'
    ON CONFLICT (asset_id, price_date, source) DO UPDATE
      SET price_close = EXCLUDED.price_close,
          updated_at = NOW()
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM price_history WHERE source = 'fx_rate'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? '0');
}

async function main() {
  console.log('Extracting IBKR prices to price_history...\n');

  const ibkrCount = await extractIbkrPrices();
  console.log(`IBKR prices in price_history: ${ibkrCount}`);

  const snapshotCount = await extractSnapshotPrices();
  console.log(`Snapshot prices in price_history (non-IBKR): ${snapshotCount}`);

  const stableCount = await insertStablecoinPrices();
  console.log(`Manual/stablecoin prices in price_history: ${stableCount}`);

  const fxCount = await extractFxRatePrices();
  console.log(`FX rate prices in price_history: ${fxCount}`);

  // Summary of latest prices
  const latest = await db.execute(sql`
    SELECT source, COUNT(*) as cnt, MAX(price_date) as latest_date
    FROM price_history
    WHERE source IN ('ibkr', 'snapshot', 'manual', 'fx_rate')
    GROUP BY source
    ORDER BY source
  `);
  console.log('\nSummary:');
  for (const row of latest as any[]) {
    console.log(`  ${row.source}: ${row.cnt} rows, latest: ${row.latest_date}`);
  }

  await closeDb();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
