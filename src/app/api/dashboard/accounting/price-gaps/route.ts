import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  PRICE_SOURCE_CONFIGS,
  ASSET_SOURCE_CASE_SQL,
  expectedLatestPriceDate,
  assessSourceHealth,
  type PriceSourceId,
  type SourceHealthResult,
  type PriceDeliveryReport,
  type SourceStatus,
} from "@/lib/price-source-config";

export async function GET() {
  try {
    const now = new Date();

    const rows = (await db.execute(sql.raw(`
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

        -- Fiat always monitored (FX rates) — except USD (base currency)
        -- Stablecoins excluded — hardcoded $1.00, no pipeline to monitor
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
    `))) as any[];

    // Snapshot fallback for crypto (massive primary, snapshot fallback)
    const snapshotFallbacks = (await db.execute(sql.raw(`
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
    `))) as any[];

    const snapshotDates = new Map<string, string>();
    for (const row of snapshotFallbacks) {
      snapshotDates.set(row.ticker, row.last_snapshot_date);
    }

    // Group by source and build health results
    const sourceMap = new Map<PriceSourceId, Array<(typeof rows)[number]>>();
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
      const latestDelivery = assets.reduce<string | null>((best, row) => {
        if (!row.last_price_date) return best;
        return !best || row.last_price_date > best ? row.last_price_date : best;
      }, null);

      const status = assessSourceHealth(config, latestDelivery, now);

      const problemAssets: SourceHealthResult["problemAssets"] = [];
      for (const row of assets) {
        const isAssetCurrent =
          row.last_price_date && row.last_price_date >= expected;
        if (isAssetCurrent) {
          currentCount++;
          continue;
        }
        if (config.id === "massive" && row.asset_class === "CRYPTO") {
          const snapDate = snapshotDates.get(row.ticker);
          if (snapDate && snapDate >= expected) {
            currentCount++;
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

    const statuses = results.map((r) => r.status);
    const overallStatus: SourceStatus = statuses.includes("down")
      ? "down"
      : statuses.includes("delayed")
        ? "delayed"
        : "healthy";

    const totalMonitored = rows.length;
    const freshness =
      totalMonitored > 0
        ? Math.round((currentCount / totalMonitored) * 100)
        : 100;

    const report: PriceDeliveryReport = {
      checkedAt: now.toISOString(),
      totalMonitored,
      overallStatus,
      sources: results,
      freshness,
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error fetching price delivery status:", error);
    return NextResponse.json(
      { error: "Failed to fetch price delivery status" },
      { status: 500 },
    );
  }
}
