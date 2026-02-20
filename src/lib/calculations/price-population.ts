/**
 * Price Population — Engine Phase
 *
 * Extracts prices from position snapshots into price_history:
 * - IBKR positions → source 'ibkr'
 * - Non-IBKR positions (Solana, Kraken, etc.) → source 'snapshot'
 * Also inserts hardcoded stablecoin/fiat prices.
 * This is a fast, DB-only operation (no external API calls).
 *
 * Runs as the `price_population` engine phase, after `daily_balances`.
 */

import { db } from "@/db";
import { priceHistory } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError } from "./types";

// Stablecoins priced at $1.00
const STABLECOIN_TICKERS = [
  "USDT", "USDC", "DAI", "BUSD", "PYUSD", "TUSD", "USDP", "FRAX", "GUSD",
  "LUSD", "SUSD", "CUSD", "UST", "USDD", "EUROC",
];

// Fiat currencies priced at $1.00 (USD-denominated system)
const FIAT_TICKERS = ["USD"];

/**
 * Main engine phase: populate price_history from IBKR open positions + stablecoins
 */
export async function populatePricesFromIbkr(
  ctx: CalcContext
): Promise<CalcResult> {
  const startTime = Date.now();
  const errors: CalcError[] = [];
  let recordsProcessed = 0;

  try {
    // Step 1: Extract IBKR prices
    const ibkrCount = await extractIbkrPrices(ctx.userId);
    recordsProcessed += ibkrCount;
    console.log(`[PricePopulation] Extracted ${ibkrCount} IBKR prices`);

    // Step 2: Extract non-IBKR position snapshot prices
    const snapshotCount = await extractSnapshotPrices();
    recordsProcessed += snapshotCount;
    console.log(`[PricePopulation] Extracted ${snapshotCount} snapshot prices (non-IBKR)`);

    // Step 3: Insert stablecoin/fiat hardcoded prices
    const stableCount = await insertStablecoinPrices(ctx.userId);
    recordsProcessed += stableCount;
    console.log(`[PricePopulation] Inserted ${stableCount} stablecoin/fiat prices`);
  } catch (error) {
    errors.push({
      message: `Price population failed: ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
    });
  }

  return {
    success: errors.filter((e) => e.severity === "error").length === 0,
    recordsProcessed,
    duration: Date.now() - startTime,
    errors,
  };
}

/**
 * Extract prices from TJ positions table into price_history.
 *
 * Uses a single INSERT...SELECT to map position symbols to asset UUIDs
 * via the assets table and asset_aliases table.
 *
 * TJ's `positions` table (from Flex ingestion) is the equivalent of TTC's
 * `ibkr_open_positions`. Column mapping:
 *   - positions.symbol → ibkr_open_positions.asset
 *   - positions.snapshot_date → ibkr_open_positions.reportdate
 *   - positions.spot → ibkr_open_positions.usdprice (mark price)
 *   - positions.asset_class → ibkr_open_positions.assetclass
 *
 * Skips: FUT (futures), CASH (handled by stablecoin/fiat logic),
 * and rows with null/zero spot price.
 */
async function extractIbkrPrices(_userId: string): Promise<number> {
  // Use INSERT ... SELECT with asset resolution via JOIN
  // Priority: assets.ticker match first, then asset_aliases match
  // Only pull from actual IBKR accounts — other brokers (Solana, Kraken,
  // CoinbasePrime, etc.) have their own price sources.
  await db.execute(sql`
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

  // Count how many rows were affected
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM price_history
    WHERE source = 'ibkr'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? "0");
}

/**
 * Extract prices from non-IBKR positions (Solana, Kraken, Deribit, etc.)
 * into price_history with source 'snapshot'.
 *
 * These are lower priority than dedicated API sources (Massive, CoinGecko)
 * but provide coverage for assets/dates not yet fetched from APIs.
 */
async function extractSnapshotPrices(): Promise<number> {
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
    SELECT COUNT(*) as cnt
    FROM price_history
    WHERE source = 'snapshot'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? "0");
}

/**
 * Insert hardcoded $1.00 prices for stablecoins and USD
 * for every date where positions exist in portfolio_daily_balances.
 */
async function insertStablecoinPrices(userId: string): Promise<number> {
  // Find all (asset_id, date) pairs for stablecoins/fiat that have portfolio_daily_balances
  // but no price_history entry
  const allTickers = [...STABLECOIN_TICKERS, ...FIAT_TICKERS];
  // Build a SQL IN list for the tickers
  const tickerList = allTickers.map((t) => `'${t}'`).join(", ");

  await db.execute(sql.raw(`
    WITH stable_positions AS (
      SELECT DISTINCT db.asset::uuid as asset_id, db.date::date as price_date
      FROM portfolio_daily_balances db
      JOIN assets a ON db.asset = a.id::text
      WHERE db.user_id = '${userId}'
        AND db.quantity::numeric > 0
        AND UPPER(a.ticker) IN (${tickerList})
    )
    INSERT INTO price_history (asset_id, price_date, price_close, source)
    SELECT asset_id, price_date, '1.0', 'manual'
    FROM stable_positions
    ON CONFLICT (asset_id, price_date, source) DO NOTHING
  `));

  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM price_history
    WHERE source = 'manual'
  `);
  return parseInt((countResult as any)[0]?.cnt ?? "0");
}
