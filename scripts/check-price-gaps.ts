/**
 * Price Gap Detection
 *
 * Checks for market-tier assets missing recent prices in price_history.
 * Outputs a report and exits with code 1 if any critical gaps (>5 days).
 *
 * Designed to run as a daily GitHub Actions cron job after crypto prices
 * have been fetched. Output is visible in GitHub Actions logs.
 *
 * Usage:
 *   npx tsx scripts/check-price-gaps.ts
 */

import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Checking price gaps for market-tier assets...\n');

  // Find market-tier assets with stale or missing prices
  const gaps = await db.execute(sql`
    SELECT
      a.ticker,
      a.asset_class,
      MAX(ph.price_date)::text as last_price_date,
      CASE
        WHEN MAX(ph.price_date) IS NULL THEN NULL
        ELSE CURRENT_DATE - MAX(ph.price_date)
      END as gap_days
    FROM assets a
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

  const total = gaps.length;
  console.log(`Total market-tier assets: ${total}`);
  console.log(`  Current (0-1 days):    ${current.length}`);
  console.log(`  Stale (2-5 days):      ${stale.length}`);
  console.log(`  Critical (>5 days):    ${critical.length}`);
  console.log(`  Never priced:          ${neverPriced.length}`);

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
    freshness: total > 0 ? Math.round((current.length / total) * 100) : 0,
  };
  console.log('\n--- Summary JSON ---');
  console.log(JSON.stringify(summary));

  await closeDb();

  // Exit with error code if critical gaps exist
  if (critical.length > 0) {
    console.log(`\n⚠️  ${critical.length} assets have critical price gaps (>5 days).`);
    process.exit(1);
  }

  console.log('\n✅ No critical price gaps.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
