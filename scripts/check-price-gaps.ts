/**
 * Per-Source Price Delivery Monitor
 *
 * Checks that each price source (IBKR, Massive, exchange snapshots, etc.)
 * is delivering prices on schedule for currently-held assets.
 *
 * "Currently held" = assets on each account's LATEST position snapshot with
 * non-zero quantity, plus FIAT and stablecoin assets (always monitored).
 * This replaces the old 14-day lookback — if an asset disappears from the
 * latest snapshot, it's considered closed immediately.
 *
 * Each source has a known cadence (business-day or daily) and lag (T+0 or T+1).
 * The script compares actual delivery dates against expected dates and reports:
 *   - healthy: delivering on schedule
 *   - delayed: behind but within tolerance
 *   - down: multiple missed delivery cycles
 *
 * GitHub Actions annotations:
 *   - ::warning:: for delayed sources
 *   - ::error:: for down sources
 *   - Exit 1 only when any source is DOWN
 *
 * Usage:
 *   npx tsx scripts/check-price-gaps.ts
 */

import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';
import {
  PRICE_SOURCE_CONFIGS,
  ASSET_SOURCE_CASE_SQL,
  expectedLatestPriceDate,
  assessSourceHealth,
  type PriceSourceId,
  type SourceHealthResult,
  type PriceDeliveryReport,
  type SourceStatus,
} from '../src/lib/price-source-config.js';

async function main() {
  const now = new Date();
  console.log('Per-source price delivery check...\n');

  // Single query: find all currently-held assets, assign each to its primary
  // price source, and get the latest price date from that source.
  const rows = await db.execute(sql.raw(`
    WITH latest_snapshot_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM positions
      GROUP BY account_id
    ),
    currently_held AS (
      SELECT DISTINCT COALESCE(a1.id, a2.id) AS asset_id
      FROM positions p
      JOIN latest_snapshot_per_account lsa
        ON p.account_id = lsa.account_id AND p.snapshot_date = lsa.latest_date
      LEFT JOIN assets a1 ON UPPER(a1.ticker) = UPPER(p.symbol)
      LEFT JOIN asset_aliases aa ON UPPER(aa.alias) = UPPER(p.symbol)
      LEFT JOIN assets a2 ON aa.asset_id = a2.id
      WHERE p.quantity::numeric <> 0
        AND COALESCE(a1.id, a2.id) IS NOT NULL

      UNION

      -- Fiat currencies always monitored (FX rates flow daily) — except USD (base currency)
      -- Stablecoins excluded — hardcoded $1.00, no delivery pipeline to monitor
      SELECT id AS asset_id FROM assets
      WHERE asset_class = 'FIAT' AND pricing_tier = 'market' AND ticker != 'USD'
    ),
    asset_with_source AS (
      SELECT
        a.id AS asset_id,
        a.ticker,
        a.asset_class,
        a.pricing_tier,
        ${ASSET_SOURCE_CASE_SQL} AS primary_source
      FROM assets a
      JOIN currently_held ch ON ch.asset_id = a.id
      WHERE a.pricing_tier IN ('market', 'proxy')
    )
    SELECT
      aws.ticker,
      aws.asset_class,
      aws.primary_source,
      MAX(ph.price_date)::text AS last_price_date,
      CASE
        WHEN MAX(ph.price_date) IS NULL THEN NULL
        ELSE CURRENT_DATE - MAX(ph.price_date)
      END AS gap_days
    FROM asset_with_source aws
    LEFT JOIN price_history ph
      ON ph.asset_id = aws.asset_id AND ph.source = aws.primary_source
    GROUP BY aws.asset_id, aws.ticker, aws.asset_class, aws.primary_source
    ORDER BY aws.primary_source, aws.ticker
  `)) as any[];

  // Also query fallback snapshot prices for crypto (massive is primary,
  // snapshot is fallback — if massive is delayed but snapshot is current,
  // the asset isn't really stale)
  const snapshotFallbacks = await db.execute(sql.raw(`
    WITH latest_snapshot_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM positions GROUP BY account_id
    ),
    currently_held AS (
      SELECT DISTINCT COALESCE(a1.id, a2.id) AS asset_id
      FROM positions p
      JOIN latest_snapshot_per_account lsa
        ON p.account_id = lsa.account_id AND p.snapshot_date = lsa.latest_date
      LEFT JOIN assets a1 ON UPPER(a1.ticker) = UPPER(p.symbol)
      LEFT JOIN asset_aliases aa ON UPPER(aa.alias) = UPPER(p.symbol)
      LEFT JOIN assets a2 ON aa.asset_id = a2.id
      WHERE p.quantity::numeric <> 0 AND COALESCE(a1.id, a2.id) IS NOT NULL
    )
    SELECT
      a.ticker,
      MAX(ph.price_date)::text AS last_snapshot_date
    FROM assets a
    JOIN currently_held ch ON ch.asset_id = a.id
    JOIN price_history ph ON ph.asset_id = a.id AND ph.source = 'snapshot'
    WHERE a.asset_class IN ('CRYPTO', 'PERP')
    GROUP BY a.ticker
  `)) as any[];

  const snapshotDates = new Map<string, string>();
  for (const row of snapshotFallbacks) {
    snapshotDates.set(row.ticker, row.last_snapshot_date);
  }

  // Group by source and build health results
  const sourceMap = new Map<PriceSourceId, Array<typeof rows[number]>>();
  for (const row of rows) {
    const src = row.primary_source as PriceSourceId;
    if (!sourceMap.has(src)) sourceMap.set(src, []);
    sourceMap.get(src)!.push(row);
  }

  const results: SourceHealthResult[] = [];
  let currentCount = 0;

  for (const config of PRICE_SOURCE_CONFIGS) {
    const assets = sourceMap.get(config.id) || [];
    if (assets.length === 0) continue;

    const expected = expectedLatestPriceDate(config, now);

    // Source-level latest delivery = max across all assets for this source
    const latestDelivery = assets.reduce<string | null>((best, row) => {
      if (!row.last_price_date) return best;
      return !best || row.last_price_date > best ? row.last_price_date : best;
    }, null);

    const status = assessSourceHealth(config, latestDelivery, now);

    // Find problem assets — those behind the expected date
    const problemAssets: SourceHealthResult['problemAssets'] = [];
    for (const row of assets) {
      const isAssetCurrent = row.last_price_date && row.last_price_date >= expected;
      if (isAssetCurrent) {
        currentCount++;
        continue;
      }

      // For crypto: check snapshot fallback before flagging
      if (config.id === 'massive' && row.asset_class === 'CRYPTO') {
        const snapDate = snapshotDates.get(row.ticker);
        if (snapDate && snapDate >= expected) {
          currentCount++; // covered by snapshot fallback
          continue;
        }
      }

      problemAssets.push({
        ticker: row.ticker,
        assetClass: row.asset_class,
        lastPriceDate: row.last_price_date,
        gapDays: row.gap_days != null ? Number(row.gap_days) : null,
      });
    }

    results.push({
      sourceId: config.id,
      label: config.label,
      status,
      assetCount: assets.length,
      latestDeliveryDate: latestDelivery,
      expectedDate: expected,
      problemAssets,
    });
  }

  // Determine overall status
  const statuses = results.map((r) => r.status);
  const overallStatus: SourceStatus = statuses.includes('down')
    ? 'down'
    : statuses.includes('delayed')
      ? 'delayed'
      : 'healthy';

  const totalMonitored = rows.length;
  const freshness = totalMonitored > 0 ? Math.round((currentCount / totalMonitored) * 100) : 100;

  // --- Console output ---

  console.log('=== Price Source Health ===');
  for (const r of results) {
    const icon = r.status === 'healthy' ? '●' : r.status === 'delayed' ? '◐' : '○';
    const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
    const dateStr = r.latestDeliveryDate ?? 'never';
    console.log(
      `  ${r.label.padEnd(34)} ${icon} ${statusLabel.padEnd(8)} ${String(r.assetCount).padStart(3)} assets  latest: ${dateStr}  expected: ${r.expectedDate}`
    );

    // GitHub Actions annotations
    if (r.status === 'delayed') {
      console.log(`::warning::${r.label}: delayed — latest ${dateStr}, expected ${r.expectedDate}`);
    } else if (r.status === 'down') {
      console.log(`::error::${r.label}: DOWN — latest ${dateStr}, expected ${r.expectedDate}`);
    }
  }

  // Show problem assets if any
  const allProblems = results.flatMap((r) =>
    r.problemAssets.map((a) => ({ ...a, source: r.label }))
  );
  if (allProblems.length > 0) {
    console.log(`\n=== Problem Assets (${allProblems.length}) ===`);
    for (const a of allProblems.slice(0, 30)) {
      const dateStr = a.lastPriceDate ?? 'never';
      const gapStr = a.gapDays != null ? `(${a.gapDays}d)` : '';
      console.log(`  ${a.ticker.padEnd(12)} ${a.assetClass.padEnd(12)} ${a.source.padEnd(30)} last: ${dateStr} ${gapStr}`);
    }
    if (allProblems.length > 30) {
      console.log(`  ... and ${allProblems.length - 30} more`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  ${totalMonitored} monitored assets | Freshness: ${freshness}% | Status: ${overallStatus}`);

  // JSON summary
  const report: PriceDeliveryReport = {
    checkedAt: now.toISOString(),
    totalMonitored,
    overallStatus,
    sources: results,
    freshness,
  };
  console.log('\n--- Summary JSON ---');
  console.log(JSON.stringify(report));

  await closeDb();

  // Exit 1 only when any source is DOWN (multiple missed delivery cycles)
  if (overallStatus === 'down') {
    const downSources = results.filter((r) => r.status === 'down').map((r) => r.label);
    console.log(`\n❌ Source(s) DOWN: ${downSources.join(', ')}`);
    process.exit(1);
  }

  if (overallStatus === 'delayed') {
    const delayedSources = results.filter((r) => r.status === 'delayed').map((r) => r.label);
    console.log(`\n⚠️  Source(s) delayed: ${delayedSources.join(', ')} — see warnings above.`);
  } else {
    console.log('\n✅ All sources delivering on schedule.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
