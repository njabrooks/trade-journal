/**
 * Price Gap Detection
 *
 * Checks for market-tier assets missing recent prices in price_history.
 * Only monitors assets that are CURRENTLY HELD (appear in recent position
 * snapshots or have recent FX rates for fiat). This prevents false alerts
 * for assets that were sold but remain classified as market tier.
 *
 * Uses GitHub Actions annotations for visibility:
 *   - Individual critical gaps → ::warning:: annotations (visible in summary)
 *   - Only hard-fails (exit 1) when freshness drops below 80%
 *     (i.e. widespread pricing failure, not a single stale asset)
 *
 * Designed to run as a daily GitHub Actions cron job after crypto prices
 * have been fetched. Output is visible in GitHub Actions logs.
 *
 * Usage:
 *   npx tsx scripts/check-price-gaps.ts
 */

import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

// Freshness threshold — fail only when this % of held assets lack current prices
const FRESHNESS_FAIL_THRESHOLD = 80;

async function main() {
  console.log('Checking price gaps for market-tier assets...\n');

  // Find market-tier assets with stale or missing prices.
  // Only include assets that are currently held:
  //   - Equities/crypto: appear in positions snapshots within last 14 days
  //   - Fiat: always included (FX rates should flow daily)
  const gaps = await db.execute(sql`
    WITH currently_held AS (
      -- Assets with recent position snapshots (last 14 days)
      SELECT DISTINCT a.id
      FROM assets a
      JOIN positions p ON UPPER(p.symbol) = UPPER(a.ticker)
      WHERE p.snapshot_date >= CURRENT_DATE - INTERVAL '14 days'
        AND p.quantity <> 0

      UNION

      -- Fiat currencies are always monitored (FX rates flow daily)
      SELECT id FROM assets WHERE asset_class = 'FIAT' AND pricing_tier = 'market'
    )
    SELECT
      a.ticker,
      a.asset_class,
      MAX(ph.price_date)::text as last_price_date,
      CASE
        WHEN MAX(ph.price_date) IS NULL THEN NULL
        ELSE CURRENT_DATE - MAX(ph.price_date)
      END as gap_days
    FROM assets a
    INNER JOIN currently_held ch ON ch.id = a.id
    LEFT JOIN price_history ph ON ph.asset_id = a.id
    WHERE a.pricing_tier = 'market'
    GROUP BY a.id, a.ticker, a.asset_class
    ORDER BY
      CASE WHEN MAX(ph.price_date) IS NULL THEN 1 ELSE 0 END DESC,
      gap_days DESC NULLS FIRST
  `) as any[];

  // Categorize
  const current: typeof gaps = [];     // 0-1 days (today or yesterday)
  const stale: typeof gaps = [];       // 2-5 days
  const critical: typeof gaps = [];    // >5 days
  const neverPriced: typeof gaps = []; // no price_history at all

  for (const row of gaps) {
    if (row.last_price_date === null) {
      neverPriced.push(row);
    } else if (row.gap_days <= 1) {
      current.push(row);
    } else if (row.gap_days <= 5) {
      stale.push(row);
    } else {
      critical.push(row);
    }
  }

  // Also count total market-tier assets for context
  const totalMarket = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM assets WHERE pricing_tier = 'market'
  `) as any[];
  const totalMarketCount = parseInt(totalMarket[0]?.cnt ?? '0');

  const total = gaps.length;
  const freshness = total > 0 ? Math.round((current.length / total) * 100) : 100;

  console.log(`Total market-tier assets: ${totalMarketCount}`);
  console.log(`Currently held (monitored): ${total}`);
  console.log(`  Current (0-1 days):    ${current.length}`);
  console.log(`  Stale (2-5 days):      ${stale.length}`);
  console.log(`  Critical (>5 days):    ${critical.length}`);
  console.log(`  Never priced:          ${neverPriced.length}`);
  console.log(`  Freshness:             ${freshness}%`);

  if (stale.length > 0) {
    console.log('\n--- Stale prices (2-5 days) ---');
    for (const row of stale) {
      console.log(`  ${row.ticker.padEnd(12)} ${row.asset_class.padEnd(12)} last: ${row.last_price_date}  (${row.gap_days}d)`);
    }
  }

  if (critical.length > 0) {
    console.log('\n--- CRITICAL gaps (>5 days) ---');
    for (const row of critical) {
      console.log(`  ${row.ticker.padEnd(12)} ${row.asset_class.padEnd(12)} last: ${row.last_price_date}  (${row.gap_days}d)`);
      // GitHub Actions warning annotation — shows in workflow summary
      console.log(`::warning::Price gap: ${row.ticker} (${row.asset_class}) last priced ${row.last_price_date} (${row.gap_days}d ago)`);
    }
  }

  if (neverPriced.length > 0) {
    console.log('\n--- Never priced ---');
    for (const row of neverPriced.slice(0, 30)) {
      console.log(`  ${row.ticker.padEnd(12)} ${row.asset_class.padEnd(12)}`);
    }
    if (neverPriced.length > 30) {
      console.log(`  ... and ${neverPriced.length - 30} more`);
    }
  }

  // Summary JSON for programmatic consumption
  const summary = {
    total,
    current: current.length,
    stale: stale.length,
    critical: critical.length,
    neverPriced: neverPriced.length,
    freshness,
  };
  console.log('\n--- Summary JSON ---');
  console.log(JSON.stringify(summary));

  await closeDb();

  // Only hard-fail when freshness drops below threshold (widespread pricing failure)
  // Individual critical gaps get ::warning:: annotations above but don't block the workflow
  if (freshness < FRESHNESS_FAIL_THRESHOLD) {
    console.log(`\n❌ Freshness ${freshness}% is below ${FRESHNESS_FAIL_THRESHOLD}% threshold — pricing pipeline may be broken.`);
    process.exit(1);
  }

  if (critical.length > 0 || stale.length > 0) {
    console.log(`\n⚠️  ${critical.length} critical, ${stale.length} stale — see warnings above.`);
  } else {
    console.log('\n✅ All prices current.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
