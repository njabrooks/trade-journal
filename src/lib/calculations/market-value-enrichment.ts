/**
 * Market Value Enrichment — Engine Phase
 *
 * Joins price_history to portfolio_daily_balances to fill in:
 * - price (unit price)
 * - marketValue (quantity × price)
 * - marketValueSource (which source provided the price)
 *
 * Three-pass approach:
 * 1. Exact date match from best_daily_prices view
 * 2. 5-day lookback (carry forward weekends/holidays)
 * 3. Book value fallback (last resort)
 *
 * Runs as the `market_value_enrichment` engine phase, after `price_population`.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError } from "./types";

/**
 * Main engine phase: enrich portfolio_daily_balances with market values
 */
export async function enrichDailyMarketValues(
  ctx: CalcContext
): Promise<CalcResult> {
  const startTime = Date.now();
  const errors: CalcError[] = [];
  let recordsProcessed = 0;

  try {
    // Increase statement timeout for large joins (pooler default may be too short)
    // Set on each query since connection pooler may reset session state between queries
    await db.execute(sql`SET statement_timeout = '1200000'`);

    // First, handle zero-quantity rows — set marketValue = 0
    const zeroResult = await db.execute(sql`
      UPDATE portfolio_daily_balances
      SET price = 0,
          market_value = 0,
          market_value_source = 'zero_quantity',
          updated_at = NOW()
      WHERE user_id = ${ctx.userId}
        AND quantity::numeric = 0
        AND market_value IS NULL
    `);
    const zeroCount = await countUpdated(ctx.userId, "zero_quantity");
    console.log(`[MarketValueEnrichment] Pass 0 (zero qty): ${zeroCount} rows`);
    recordsProcessed += zeroCount;

    // Pass 1: Exact date match
    // Bond prices are per $100 face value, so divide by 100 for BOND asset class
    await db.execute(sql`
      UPDATE portfolio_daily_balances db
      SET price = bdp.price_close,
          market_value = CASE
            WHEN db.asset_class = 'BOND'
            THEN db.quantity::numeric * bdp.price_close::numeric / 100
            WHEN db.asset_class = 'DERIVATIVE'
            THEN db.quantity::numeric * bdp.price_close::numeric * 100
            ELSE db.quantity::numeric * bdp.price_close::numeric
          END,
          market_value_source = bdp.source::text,
          updated_at = NOW()
      FROM best_daily_prices bdp
      WHERE db.asset::uuid = bdp.asset_id
        AND db.date::date = bdp.price_date
        AND db.user_id = ${ctx.userId}
        AND db.market_value IS NULL
        AND db.quantity::numeric != 0
    `);
    const exactCount = await countNonNull(ctx.userId);
    console.log(`[MarketValueEnrichment] Pass 1 (exact match): ${exactCount - recordsProcessed} rows`);
    recordsProcessed = exactCount;

    // Pass 2: 5-day lookback (carry forward)
    await db.execute(sql`
      UPDATE portfolio_daily_balances db
      SET price = sub.price_close,
          market_value = CASE
            WHEN db.asset_class = 'BOND'
            THEN db.quantity::numeric * sub.price_close::numeric / 100
            WHEN db.asset_class = 'DERIVATIVE'
            THEN db.quantity::numeric * sub.price_close::numeric * 100
            ELSE db.quantity::numeric * sub.price_close::numeric
          END,
          market_value_source = sub.source::text || ' (carried)',
          updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (db2.id)
          db2.id as balance_id,
          bdp.price_close,
          bdp.source
        FROM portfolio_daily_balances db2
        JOIN best_daily_prices bdp ON db2.asset::uuid = bdp.asset_id
        WHERE db2.user_id = ${ctx.userId}
          AND db2.market_value IS NULL
          AND db2.quantity::numeric != 0
          AND bdp.price_date < db2.date::date
          AND bdp.price_date >= (db2.date::date - INTERVAL '5 days')
        ORDER BY db2.id, bdp.price_date DESC
      ) sub
      WHERE db.id = sub.balance_id
    `);
    const carriedCount = await countNonNull(ctx.userId);
    console.log(`[MarketValueEnrichment] Pass 2 (5-day carry): ${carriedCount - recordsProcessed} rows`);
    recordsProcessed = carriedCount;

    // Pass 3: Book value fallback
    await db.execute(sql`
      UPDATE portfolio_daily_balances
      SET market_value = book_value,
          price = CASE
            WHEN quantity::numeric != 0
            THEN book_value::numeric / quantity::numeric
            ELSE 0
          END,
          market_value_source = 'book_value_fallback',
          updated_at = NOW()
      WHERE user_id = ${ctx.userId}
        AND market_value IS NULL
        AND book_value IS NOT NULL
        AND quantity::numeric != 0
    `);
    const bvCount = await countNonNull(ctx.userId);
    console.log(`[MarketValueEnrichment] Pass 3 (book value): ${bvCount - recordsProcessed} rows`);
    recordsProcessed = bvCount;

    // Count remaining NULLs
    const remaining = await countRemaining(ctx.userId);
    if (remaining > 0) {
      console.log(`[MarketValueEnrichment] ${remaining} rows still without market value (no price, no book value)`);
      errors.push({
        message: `${remaining} daily_balance rows have no market value after all passes`,
        severity: "warning",
      });
      // Set remaining to 0 market value so NAV computation doesn't skip them
      await db.execute(sql`
        UPDATE portfolio_daily_balances
        SET market_value = 0,
            price = 0,
            market_value_source = 'no_data',
            updated_at = NOW()
        WHERE user_id = ${ctx.userId}
          AND market_value IS NULL
      `);
    }

    console.log(`[MarketValueEnrichment] Total enriched: ${recordsProcessed + remaining} rows`);

    // GBP conversion pass: convert market_value to market_value_gbp using FX rates
    // Uses spot FX rate (correct for market value — it's a point-in-time measure)
    const gbpResult = await db.execute(sql`
      UPDATE portfolio_daily_balances db
      SET market_value_gbp = db.market_value::numeric * fx.rate::numeric,
          fx_rate_usd_gbp = fx.rate::numeric,
          updated_at = NOW()
      FROM (
        SELECT snapshot_date, (1.0 / rate::numeric) as rate
        FROM fx_rates
        WHERE from_currency = 'GBP'
          AND to_currency = 'USD'
      ) fx
      WHERE db.user_id = ${ctx.userId}
        AND db.market_value IS NOT NULL
        AND fx.snapshot_date = (
          SELECT MAX(f2.snapshot_date)
          FROM fx_rates f2
          WHERE f2.from_currency = 'GBP'
            AND f2.to_currency = 'USD'
            AND f2.snapshot_date <= db.date::date
        )
    `);
    const gbpCount = await countGbpEnriched(ctx.userId);
    console.log(`[MarketValueEnrichment] GBP conversion: ${gbpCount} rows enriched`);
  } catch (error) {
    errors.push({
      message: `Market value enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
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
 * Count rows with non-null market_value
 */
async function countNonNull(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value IS NOT NULL
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}

/**
 * Count rows with a specific market_value_source
 */
async function countUpdated(userId: string, source: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value_source = ${source}
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}

/**
 * Count rows with non-null market_value_gbp
 */
async function countGbpEnriched(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value_gbp IS NOT NULL
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}

/**
 * Count rows still missing market_value
 */
async function countRemaining(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value IS NULL
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}
