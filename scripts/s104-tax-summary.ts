#!/usr/bin/env tsx
/**
 * Section 104 Tax Summary
 *
 * Queries section_104_matches to display realized gains by UK tax year
 * (April 6 – April 5), broken down by asset and match type.
 *
 * Usage:
 *   npx tsx scripts/s104-tax-summary.ts
 *   npx tsx scripts/s104-tax-summary.ts --year 2025  (tax year 2025/26: Apr 6 2025 – Apr 5 2026)
 *   npx tsx scripts/s104-tax-summary.ts --format json
 */

import { db, closeDb } from './lib/db.js';
import { sql } from "drizzle-orm";

// ============================================================================
// CLI Arguments
// ============================================================================

interface CliArgs {
  year?: number;
  format: "table" | "json";
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let year: number | undefined;
  let format: "table" | "json" = "table";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--format" && args[i + 1]) {
      format = args[i + 1] as "table" | "json";
      i++;
    } else if (args[i] === "--help") {
      console.log(`
Usage: npx tsx scripts/s104-tax-summary.ts [options]

Options:
  --year <YYYY>     UK tax year starting year (e.g., 2025 = Apr 6 2025 – Apr 5 2026)
  --format <fmt>    Output format: table (default) or json
  --help            Show this help
`);
      process.exit(0);
    }
  }

  return { year, format };
}

// ============================================================================
// Queries
// ============================================================================

interface TaxYearSummary {
  taxYear: string;         // e.g., "2025/26"
  taxYearStart: string;    // e.g., "2025-04-06"
  taxYearEnd: string;      // e.g., "2026-04-05"
  totalGainGbp: number;
  totalLossGbp: number;
  netGainGbp: number;
  matchBreakdown: {
    sameDay: { count: number; gainGbp: number };
    bedAndBreakfast: { count: number; gainGbp: number };
    pool: { count: number; gainGbp: number };
  };
  topAssets: Array<{
    ticker: string;
    gainGbp: number;
    matchCount: number;
  }>;
}

async function getMatchSummary(yearFilter?: number): Promise<TaxYearSummary[]> {
  // Build year condition
  let yearCondition = sql`1=1`;
  if (yearFilter) {
    const start = `${yearFilter}-04-06`;
    const end = `${yearFilter + 1}-04-05`;
    yearCondition = sql`e.timestamp::date >= ${start} AND e.timestamp::date <= ${end}`;
  }

  // Get all matches with disposal dates
  const rows = await db.execute(sql`
    SELECT
      m.match_type,
      m.quantity_matched,
      m.cost_basis_gbp::numeric AS cost_gbp,
      m.proceeds_gbp::numeric AS proceeds_gbp,
      m.realized_gain_gbp::numeric AS gain_gbp,
      e.timestamp::date AS disposal_date,
      a.ticker AS asset_ticker,
      -- UK tax year: April 6 to April 5
      CASE
        WHEN EXTRACT(MONTH FROM e.timestamp) >= 4 AND EXTRACT(DAY FROM e.timestamp) >= 6
          THEN EXTRACT(YEAR FROM e.timestamp)::int
        WHEN EXTRACT(MONTH FROM e.timestamp) > 4
          THEN EXTRACT(YEAR FROM e.timestamp)::int
        ELSE EXTRACT(YEAR FROM e.timestamp)::int - 1
      END AS tax_year_start
    FROM section_104_matches m
    JOIN events e ON e.id = m.disposal_event_id
    JOIN assets a ON a.id = e.asset_id
    WHERE ${yearCondition}
    ORDER BY e.timestamp, m.match_type
  `);

  // Group by tax year
  // postgres-js driver returns rows as array directly
  const resultRows = rows as unknown as Array<Record<string, unknown>>;
  const byYear = new Map<number, Array<Record<string, unknown>>>();
  for (const row of resultRows) {
    const yr = row.tax_year_start as number;
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr)!.push(row);
  }

  const summaries: TaxYearSummary[] = [];

  for (const [yr, yearRows] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const summary: TaxYearSummary = {
      taxYear: `${yr}/${(yr + 1).toString().slice(-2)}`,
      taxYearStart: `${yr}-04-06`,
      taxYearEnd: `${yr + 1}-04-05`,
      totalGainGbp: 0,
      totalLossGbp: 0,
      netGainGbp: 0,
      matchBreakdown: {
        sameDay: { count: 0, gainGbp: 0 },
        bedAndBreakfast: { count: 0, gainGbp: 0 },
        pool: { count: 0, gainGbp: 0 },
      },
      topAssets: [],
    };

    const assetGains = new Map<string, { gain: number; count: number }>();

    for (const row of yearRows as Array<Record<string, unknown>>) {
      const gain = Number(row.gain_gbp);
      const matchType = row.match_type as string;
      const ticker = row.asset_ticker as string;

      summary.netGainGbp += gain;
      if (gain >= 0) summary.totalGainGbp += gain;
      else summary.totalLossGbp += gain;

      if (matchType === "same_day") {
        summary.matchBreakdown.sameDay.count++;
        summary.matchBreakdown.sameDay.gainGbp += gain;
      } else if (matchType === "bed_and_breakfast") {
        summary.matchBreakdown.bedAndBreakfast.count++;
        summary.matchBreakdown.bedAndBreakfast.gainGbp += gain;
      } else if (matchType === "section_104_pool") {
        summary.matchBreakdown.pool.count++;
        summary.matchBreakdown.pool.gainGbp += gain;
      }

      if (!assetGains.has(ticker)) assetGains.set(ticker, { gain: 0, count: 0 });
      const ag = assetGains.get(ticker)!;
      ag.gain += gain;
      ag.count++;
    }

    // Top assets by absolute gain
    summary.topAssets = [...assetGains.entries()]
      .map(([ticker, { gain, count }]) => ({ ticker, gainGbp: gain, matchCount: count }))
      .sort((a, b) => Math.abs(b.gainGbp) - Math.abs(a.gainGbp))
      .slice(0, 15);

    summaries.push(summary);
  }

  return summaries;
}

async function getPoolSummary(): Promise<Array<{ ticker: string; poolQty: number; poolCostGbp: number; poolAvgCost: number }>> {
  const rows = await db.execute(sql`
    SELECT
      a.ticker,
      p.pool_quantity::numeric AS pool_qty,
      p.pool_cost_basis_gbp::numeric AS pool_cost,
      p.pool_average_cost_gbp::numeric AS pool_avg
    FROM section_104_pools p
    JOIN assets a ON a.id = p.asset_id
    WHERE p.pool_quantity::numeric > 0.00000001
    ORDER BY p.pool_cost_basis_gbp::numeric DESC
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    ticker: r.ticker as string,
    poolQty: Number(r.pool_qty),
    poolCostGbp: Number(r.pool_cost),
    poolAvgCost: Number(r.pool_avg),
  }));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs();

  const summaries = await getMatchSummary(args.year);
  const pools = await getPoolSummary();

  if (args.format === "json") {
    console.log(JSON.stringify({ taxYears: summaries, activePools: pools }, null, 2));
    await closeDb();
    return;
  }

  // Table format
  if (summaries.length === 0) {
    console.log("No Section 104 matches found. Run the calculation engine first:");
    console.log("  npx tsx scripts/run-calculation-engine.ts --user <userId> --full");
    await closeDb();
    return;
  }

  for (const s of summaries) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`UK Tax Year ${s.taxYear} (${s.taxYearStart} to ${s.taxYearEnd})`);
    console.log("=".repeat(60));
    console.log(`  Total gains:   £${s.totalGainGbp.toFixed(2)}`);
    console.log(`  Total losses:  £${s.totalLossGbp.toFixed(2)}`);
    console.log(`  NET GAIN:      £${s.netGainGbp.toFixed(2)}`);
    console.log();
    console.log(`  Match Breakdown:`);
    console.log(`    Same-day:      ${s.matchBreakdown.sameDay.count} matches, £${s.matchBreakdown.sameDay.gainGbp.toFixed(2)}`);
    console.log(`    B&B (30-day):  ${s.matchBreakdown.bedAndBreakfast.count} matches, £${s.matchBreakdown.bedAndBreakfast.gainGbp.toFixed(2)}`);
    console.log(`    S104 Pool:     ${s.matchBreakdown.pool.count} matches, £${s.matchBreakdown.pool.gainGbp.toFixed(2)}`);
    console.log();
    console.log(`  Top Assets by |Gain|:`);
    for (const a of s.topAssets) {
      const sign = a.gainGbp >= 0 ? "+" : "";
      console.log(`    ${a.ticker.padEnd(12)} ${sign}£${a.gainGbp.toFixed(2).padStart(12)}  (${a.matchCount} matches)`);
    }
  }

  if (pools.length > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("Active S104 Pools (current state)");
    console.log("=".repeat(60));
    console.log(`  ${"Ticker".padEnd(12)} ${"Qty".padStart(14)} ${"Cost (GBP)".padStart(14)} ${"Avg Cost".padStart(12)}`);
    for (const p of pools.slice(0, 20)) {
      console.log(
        `  ${p.ticker.padEnd(12)} ${p.poolQty.toFixed(4).padStart(14)} £${p.poolCostGbp.toFixed(2).padStart(13)} £${p.poolAvgCost.toFixed(4).padStart(11)}`,
      );
    }
    if (pools.length > 20) {
      console.log(`  ... and ${pools.length - 20} more pools`);
    }
  }

  console.log();
  await closeDb();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
