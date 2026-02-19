import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const gaps = (await db.execute(sql`
      SELECT
        a.ticker,
        a.asset_class,
        a.pricing_tier,
        MAX(ph.price_date)::text as last_price_date,
        CASE
          WHEN MAX(ph.price_date) IS NULL THEN NULL
          ELSE CURRENT_DATE - MAX(ph.price_date)
        END as gap_days
      FROM assets a
      LEFT JOIN price_history ph ON ph.asset_id = a.id
      WHERE a.pricing_tier = 'market'
      GROUP BY a.id, a.ticker, a.asset_class, a.pricing_tier
      ORDER BY
        CASE WHEN MAX(ph.price_date) IS NULL THEN 1 ELSE 0 END DESC,
        gap_days DESC NULLS FIRST
    `)) as any[];

    let current = 0;
    let stale = 0;
    let critical = 0;
    let neverPriced = 0;
    const criticalAssets: { ticker: string; assetClass: string; lastPriceDate: string | null; gapDays: number | null }[] = [];
    const staleAssets: typeof criticalAssets = [];

    for (const row of gaps) {
      if (row.last_price_date === null) {
        neverPriced++;
      } else if (row.gap_days <= 1) {
        current++;
      } else if (row.gap_days <= 5) {
        stale++;
        staleAssets.push({
          ticker: row.ticker,
          assetClass: row.asset_class,
          lastPriceDate: row.last_price_date,
          gapDays: row.gap_days,
        });
      } else {
        critical++;
        criticalAssets.push({
          ticker: row.ticker,
          assetClass: row.asset_class,
          lastPriceDate: row.last_price_date,
          gapDays: row.gap_days,
        });
      }
    }

    const total = gaps.length;

    return NextResponse.json({
      total,
      current,
      stale,
      critical,
      neverPriced,
      freshness: total > 0 ? Math.round((current / total) * 100) : 0,
      staleAssets: staleAssets.slice(0, 20),
      criticalAssets: criticalAssets.slice(0, 20),
    });
  } catch (error) {
    console.error("Error fetching price gaps:", error);
    return NextResponse.json(
      { error: "Failed to fetch price gaps" },
      { status: 500 }
    );
  }
}
