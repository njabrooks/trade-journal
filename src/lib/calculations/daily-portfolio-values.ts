/**
 * Daily Portfolio Values (NAV) — Engine Phase
 *
 * Aggregates enriched portfolio_daily_balances into daily_portfolio_values.
 * Three aggregation levels:
 * 1. Per-account: (date, owner, accountType)
 * 2. Per-owner: (date, owner) with account = NULL
 * 3. Grand total: (date) with owner = NULL, account = NULL
 *
 * Runs as the `daily_nav` engine phase, after `market_value_enrichment`.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { CalcContext, CalcResult, CalcError } from "./types";

/**
 * Main engine phase: compute daily portfolio values at all aggregation levels
 */
export async function computeDailyPortfolioValues(
  ctx: CalcContext
): Promise<CalcResult> {
  const startTime = Date.now();
  const errors: CalcError[] = [];
  let recordsProcessed = 0;

  try {
    // Clear existing values for full recalc
    if (!ctx.incremental) {
      await db.execute(sql`
        DELETE FROM daily_portfolio_values WHERE user_id = ${ctx.userId}
      `);
      console.log("[DailyNAV] Cleared existing portfolio values for full recalc");
    }

    // Level 1: Per-account aggregation
    const l1Count = await aggregatePerAccount(ctx.userId);
    console.log(`[DailyNAV] Level 1 (per-account): ${l1Count} rows`);
    recordsProcessed += l1Count;

    // Level 2: Per-owner aggregation
    const l2Count = await aggregatePerOwner(ctx.userId);
    console.log(`[DailyNAV] Level 2 (per-owner): ${l2Count} rows`);
    recordsProcessed += l2Count;

    // Level 3: Grand total aggregation
    const l3Count = await aggregateGrandTotal(ctx.userId);
    console.log(`[DailyNAV] Level 3 (grand total): ${l3Count} rows`);
    recordsProcessed += l3Count;

    console.log(`[DailyNAV] Total: ${recordsProcessed} rows across 3 levels`);
  } catch (error) {
    errors.push({
      message: `Daily NAV computation failed: ${error instanceof Error ? error.message : String(error)}`,
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

// Shared SQL fragment for aggregation columns
const AGG_COLUMNS = `
  SUM(market_value::numeric) as total_market_value,
  SUM(COALESCE(book_value::numeric, 0)) as total_book_value,
  SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)) as unrealized_gain,
  CASE
    WHEN SUM(COALESCE(book_value::numeric, 0)) != 0
    THEN ((SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)))
          / NULLIF(SUM(COALESCE(book_value::numeric, 0)), 0) * 100)
    ELSE 0
  END as unrealized_gain_percent,
  COUNT(*) FILTER (WHERE quantity::numeric != 0) as position_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (
      WHERE market_value_source IS NOT NULL
        AND market_value_source NOT IN ('book_value_fallback', 'no_data', 'zero_quantity')
    )::numeric / GREATEST(COUNT(*)::numeric, 1) * 100)
    ELSE 100
  END as price_completeness
`;

// Shared SQL fragment for ON CONFLICT using the expression index
const ON_CONFLICT_UPSERT = `
  ON CONFLICT (user_id, date, COALESCE(owner, '__ALL__'), COALESCE(account, '__ALL__'))
  DO UPDATE SET
    total_market_value = EXCLUDED.total_market_value,
    total_book_value = EXCLUDED.total_book_value,
    unrealized_gain = EXCLUDED.unrealized_gain,
    unrealized_gain_percent = EXCLUDED.unrealized_gain_percent,
    position_count = EXCLUDED.position_count,
    price_completeness = EXCLUDED.price_completeness,
    updated_at = NOW()
`;

/**
 * Level 1: Per-account aggregation — GROUP BY (date, owner, account_type)
 */
async function aggregatePerAccount(userId: string): Promise<number> {
  await db.execute(sql`
    INSERT INTO daily_portfolio_values (
      user_id, date, owner, account,
      total_market_value, total_book_value,
      unrealized_gain, unrealized_gain_percent,
      position_count, price_completeness, updated_at
    )
    SELECT
      ${userId} as user_id,
      date,
      owner,
      account_type as account,
      SUM(market_value::numeric) as total_market_value,
      SUM(COALESCE(book_value::numeric, 0)) as total_book_value,
      SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)) as unrealized_gain,
      CASE
        WHEN SUM(COALESCE(book_value::numeric, 0)) != 0
        THEN ((SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)))
              / NULLIF(SUM(COALESCE(book_value::numeric, 0)), 0) * 100)
        ELSE 0
      END as unrealized_gain_percent,
      COUNT(*) FILTER (WHERE quantity::numeric != 0) as position_count,
      CASE
        WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (
          WHERE market_value_source IS NOT NULL
            AND market_value_source NOT IN ('book_value_fallback', 'no_data', 'zero_quantity')
        )::numeric / GREATEST(COUNT(*)::numeric, 1) * 100)
        ELSE 100
      END as price_completeness,
      NOW() as updated_at
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value IS NOT NULL
    GROUP BY date, owner, account_type
    ON CONFLICT (user_id, date, COALESCE(owner, '__ALL__'), COALESCE(account, '__ALL__'))
    DO UPDATE SET
      total_market_value = EXCLUDED.total_market_value,
      total_book_value = EXCLUDED.total_book_value,
      unrealized_gain = EXCLUDED.unrealized_gain,
      unrealized_gain_percent = EXCLUDED.unrealized_gain_percent,
      position_count = EXCLUDED.position_count,
      price_completeness = EXCLUDED.price_completeness,
      updated_at = NOW()
  `);

  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM daily_portfolio_values
    WHERE user_id = ${userId} AND owner IS NOT NULL AND account IS NOT NULL
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}

/**
 * Level 2: Per-owner aggregation — GROUP BY (date, owner)
 */
async function aggregatePerOwner(userId: string): Promise<number> {
  await db.execute(sql`
    INSERT INTO daily_portfolio_values (
      user_id, date, owner, account,
      total_market_value, total_book_value,
      unrealized_gain, unrealized_gain_percent,
      position_count, price_completeness, updated_at
    )
    SELECT
      ${userId} as user_id,
      date,
      owner,
      NULL as account,
      SUM(market_value::numeric) as total_market_value,
      SUM(COALESCE(book_value::numeric, 0)) as total_book_value,
      SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)) as unrealized_gain,
      CASE
        WHEN SUM(COALESCE(book_value::numeric, 0)) != 0
        THEN ((SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)))
              / NULLIF(SUM(COALESCE(book_value::numeric, 0)), 0) * 100)
        ELSE 0
      END as unrealized_gain_percent,
      COUNT(*) FILTER (WHERE quantity::numeric != 0) as position_count,
      CASE
        WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (
          WHERE market_value_source IS NOT NULL
            AND market_value_source NOT IN ('book_value_fallback', 'no_data', 'zero_quantity')
        )::numeric / GREATEST(COUNT(*)::numeric, 1) * 100)
        ELSE 100
      END as price_completeness,
      NOW() as updated_at
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value IS NOT NULL
    GROUP BY date, owner
    ON CONFLICT (user_id, date, COALESCE(owner, '__ALL__'), COALESCE(account, '__ALL__'))
    DO UPDATE SET
      total_market_value = EXCLUDED.total_market_value,
      total_book_value = EXCLUDED.total_book_value,
      unrealized_gain = EXCLUDED.unrealized_gain,
      unrealized_gain_percent = EXCLUDED.unrealized_gain_percent,
      position_count = EXCLUDED.position_count,
      price_completeness = EXCLUDED.price_completeness,
      updated_at = NOW()
  `);

  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM daily_portfolio_values
    WHERE user_id = ${userId} AND owner IS NOT NULL AND account IS NULL
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}

/**
 * Level 3: Grand total — GROUP BY (date)
 */
async function aggregateGrandTotal(userId: string): Promise<number> {
  await db.execute(sql`
    INSERT INTO daily_portfolio_values (
      user_id, date, owner, account,
      total_market_value, total_book_value,
      unrealized_gain, unrealized_gain_percent,
      position_count, price_completeness, updated_at
    )
    SELECT
      ${userId} as user_id,
      date,
      NULL as owner,
      NULL as account,
      SUM(market_value::numeric) as total_market_value,
      SUM(COALESCE(book_value::numeric, 0)) as total_book_value,
      SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)) as unrealized_gain,
      CASE
        WHEN SUM(COALESCE(book_value::numeric, 0)) != 0
        THEN ((SUM(market_value::numeric) - SUM(COALESCE(book_value::numeric, 0)))
              / NULLIF(SUM(COALESCE(book_value::numeric, 0)), 0) * 100)
        ELSE 0
      END as unrealized_gain_percent,
      COUNT(*) FILTER (WHERE quantity::numeric != 0) as position_count,
      CASE
        WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (
          WHERE market_value_source IS NOT NULL
            AND market_value_source NOT IN ('book_value_fallback', 'no_data', 'zero_quantity')
        )::numeric / GREATEST(COUNT(*)::numeric, 1) * 100)
        ELSE 100
      END as price_completeness,
      NOW() as updated_at
    FROM portfolio_daily_balances
    WHERE user_id = ${userId}
      AND market_value IS NOT NULL
    GROUP BY date
    ON CONFLICT (user_id, date, COALESCE(owner, '__ALL__'), COALESCE(account, '__ALL__'))
    DO UPDATE SET
      total_market_value = EXCLUDED.total_market_value,
      total_book_value = EXCLUDED.total_book_value,
      unrealized_gain = EXCLUDED.unrealized_gain,
      unrealized_gain_percent = EXCLUDED.unrealized_gain_percent,
      position_count = EXCLUDED.position_count,
      price_completeness = EXCLUDED.price_completeness,
      updated_at = NOW()
  `);

  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM daily_portfolio_values
    WHERE user_id = ${userId} AND owner IS NULL AND account IS NULL
  `);
  return parseInt((result as any)[0]?.cnt ?? "0");
}
