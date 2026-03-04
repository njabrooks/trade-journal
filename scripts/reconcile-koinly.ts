#!/usr/bin/env tsx
/**
 * Koinly Reconciliation Script
 *
 * Compares Koinly's GBP tax report (transaction-level) against our Section 104
 * matches to verify GBP conversion accuracy and cost basis / gain-loss accuracy.
 *
 * Usage:
 *   npx tsx scripts/reconcile-koinly.ts --entity ttc --year 2022
 *   npx tsx scripts/reconcile-koinly.ts --entity nick --year 2023
 *   npx tsx scripts/reconcile-koinly.ts --all
 *   npx tsx scripts/reconcile-koinly.ts --entity ttc --year 2022 --format json
 */

import { db, closeDb } from "./lib/db.js";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Configuration
// ============================================================================

const KOINLY_DIR =
  "/Users/njb/Library/Mobile Documents/com~apple~CloudDocs/twotreescap-app-data/gbp-koinly-cgt";

// Tax year boundaries per entity
const TAX_YEAR_CONFIG: Record<string, { startMonth: number; startDay: number }> = {
  nick: { startMonth: 4, startDay: 6 },   // April 6
  ttc: { startMonth: 5, startDay: 1 },     // May 1
};

// File naming: Koinly_2022_2023_Nick_Transaction_history.csv
function getKoinlyFilePath(entity: string, year: number): string {
  const entityLabel = entity === "nick" ? "Nick" : "TTC";
  const filename = `Koinly_${year}_${year + 1}_${entityLabel}_Transaction_history.csv`;
  return path.join(KOINLY_DIR, filename);
}

function getTaxYearRange(entity: string, year: number): { start: Date; end: Date } {
  const config = TAX_YEAR_CONFIG[entity];
  const start = new Date(Date.UTC(year, config.startMonth - 1, config.startDay));
  // End is one day before the next year's start
  const end = new Date(Date.UTC(year + 1, config.startMonth - 1, config.startDay - 1, 23, 59, 59));
  return { start, end };
}

function getTaxYearLabel(entity: string, year: number): string {
  const { start, end } = getTaxYearRange(entity, year);
  const fmt = (d: Date) =>
    `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
  return `${year}/${(year + 1).toString().slice(-2)} (${fmt(start)} – ${fmt(end)})`;
}

// ============================================================================
// CSV Parsing (handles multi-line quoted Description fields)
// ============================================================================

interface KoinlyTxn {
  date: Date;
  dateStr: string;
  type: string;
  tag: string;
  sentAmount: number;
  sentCurrency: string;
  sentCostBasis: number;
  receivedAmount: number;
  receivedCurrency: string;
  receivedCostBasis: number;
  gainGbp: number;
  netValueGbp: number;
  feeValueGbp: number;
  description: string;
}

function parseNum(s: string): number {
  if (!s || !s.trim()) return 0;
  return parseFloat(s.replace(/,/g, "")) || 0;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function parseCSVWithMultilineFields(content: string): string[] {
  const logicalLines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const ch of content) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      logicalLines.push(current);
      current = "";
    } else if (ch === "\r" && !inQuotes) {
      // skip CR
    } else {
      current += ch;
    }
  }
  if (current.trim()) logicalLines.push(current);
  return logicalLines;
}

function parseKoinlyCSV(filePath: string): KoinlyTxn[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const logicalLines = parseCSVWithMultilineFields(content);

  // Find header line (starts with "Date,Type")
  const headerIdx = logicalLines.findIndex((l) => l.startsWith("Date,Type"));
  if (headerIdx === -1) throw new Error(`No header found in ${filePath}`);

  const headers = parseCSVLine(logicalLines[headerIdx]);
  const colIdx = (name: string) => headers.indexOf(name);

  const txns: KoinlyTxn[] = [];
  for (let i = headerIdx + 1; i < logicalLines.length; i++) {
    const line = logicalLines[i];
    if (!line.trim()) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 14) continue;

    const dateStr = fields[colIdx("Date")] || "";
    const date = new Date(dateStr.replace(" UTC", "Z"));
    if (isNaN(date.getTime())) continue;

    txns.push({
      date,
      dateStr: dateStr.slice(0, 10),
      type: fields[colIdx("Type")] || "",
      tag: fields[colIdx("Tag")] || "",
      sentAmount: parseNum(fields[colIdx("Sent Amount")]),
      sentCurrency: (fields[colIdx("Sent Currency")] || "").trim(),
      sentCostBasis: parseNum(fields[colIdx("Sent Cost Basis")]),
      receivedAmount: parseNum(fields[colIdx("Received Amount")]),
      receivedCurrency: (fields[colIdx("Received Currency")] || "").trim(),
      receivedCostBasis: parseNum(fields[colIdx("Received Cost Basis")]),
      gainGbp: parseNum(fields[colIdx("Gain (GBP)")]),
      netValueGbp: parseNum(fields[colIdx("Net Value (GBP)")]),
      feeValueGbp: parseNum(fields[colIdx("Fee Value (GBP)")]),
      description: (fields[colIdx("Description")] || "").replace(/\n/g, " ").trim(),
    });
  }

  return txns;
}

// ============================================================================
// Koinly Disposal Extraction
// ============================================================================

interface KoinlyDisposal {
  date: Date;
  dateStr: string;
  type: string;
  tag: string;
  asset: string;
  quantity: number;
  costBasisGbp: number;
  proceedsGbp: number;
  gainGbp: number;
  description: string;
}

function extractKoinlyDisposals(txns: KoinlyTxn[]): KoinlyDisposal[] {
  const disposals: KoinlyDisposal[] = [];

  for (const txn of txns) {
    // Only rows with a gain value are taxable disposals in Koinly's view
    if (txn.gainGbp === 0 && !hasGainField(txn)) continue;

    // The disposed asset is the sent currency (for sell/exchange)
    // For some types, it might be different
    let asset = txn.sentCurrency;
    let quantity = txn.sentAmount;
    let costBasis = txn.sentCostBasis;
    let proceeds = txn.netValueGbp;

    // For crypto_withdrawal/transfer with gains, the sent side is the disposal
    if (!asset && txn.receivedCurrency) {
      asset = txn.receivedCurrency;
      quantity = txn.receivedAmount;
      costBasis = txn.receivedCostBasis;
    }

    if (!asset || asset === "GBP") continue;

    disposals.push({
      date: txn.date,
      dateStr: txn.dateStr,
      type: txn.type,
      tag: txn.tag,
      asset,
      quantity,
      costBasisGbp: costBasis,
      proceedsGbp: proceeds,
      gainGbp: txn.gainGbp,
      description: txn.description,
    });
  }

  return disposals;
}

// Check if the original CSV row had a non-empty Gain field (including zero)
function hasGainField(txn: KoinlyTxn): boolean {
  // We stored 0 for empty fields too, so we need the raw gain
  // Since we can't distinguish 0 from empty after parsing, we rely on
  // the fact that Koinly only shows gain on actual disposal events
  // For the purpose of this script, we'll include all rows with gainGbp !== 0
  return txn.gainGbp !== 0;
}

// ============================================================================
// Our S104 Match Queries
// ============================================================================

interface OurMatch {
  matchType: string;
  quantityMatched: number;
  costBasisGbp: number;
  proceedsGbp: number;
  realizedGainGbp: number;
  ticker: string;
  disposalDate: string;
  eventType: string;
  eventTimestamp: string;
}

async function getOurMatches(
  owner: string,
  startDate: string,
  endDate: string
): Promise<OurMatch[]> {
  const rows = await db.execute(sql`
    SELECT
      m.match_type,
      m.quantity_matched::numeric AS quantity_matched,
      m.cost_basis_gbp::numeric AS cost_basis_gbp,
      m.proceeds_gbp::numeric AS proceeds_gbp,
      m.realized_gain_gbp::numeric AS realized_gain_gbp,
      a.ticker,
      e.timestamp::date AS disposal_date,
      e.event_type AS event_type,
      e.timestamp AS event_timestamp
    FROM section_104_matches m
    JOIN events e ON e.id = m.disposal_event_id
    JOIN assets a ON a.id = e.asset_id
    WHERE e.owner = ${owner}
      AND e.account = 'Koinly'
      AND e.timestamp >= ${startDate + "T00:00:00Z"}
      AND e.timestamp <= ${endDate + "T23:59:59Z"}
    ORDER BY a.ticker, e.timestamp
  `);

  const resultRows = rows as unknown as Array<Record<string, unknown>>;
  return resultRows.map((r) => ({
    matchType: r.match_type as string,
    quantityMatched: Number(r.quantity_matched),
    costBasisGbp: Number(r.cost_basis_gbp),
    proceedsGbp: Number(r.proceeds_gbp),
    realizedGainGbp: Number(r.realized_gain_gbp),
    ticker: r.ticker as string,
    disposalDate: String(r.disposal_date),
    eventType: r.event_type as string,
    eventTimestamp: String(r.event_timestamp),
  }));
}

// ============================================================================
// Comparison Logic
// ============================================================================

interface AssetComparison {
  asset: string;
  ourGain: number;
  ourCount: number;
  ourCostBasis: number;
  ourProceeds: number;
  koinlyGain: number;
  koinlyCount: number;
  koinlyCostBasis: number;
  koinlyProceeds: number;
  gainDelta: number;
  gainDeltaPct: number | null;
  status: "match" | "close" | "discrepancy" | "koinly_only" | "ours_only";
}

interface TransactionMatch {
  date: string;
  asset: string;
  // Our side
  ourCostBasis: number | null;
  ourProceeds: number | null;
  ourGain: number | null;
  ourMatchType: string | null;
  ourQty: number | null;
  // Koinly side
  koinlyCostBasis: number | null;
  koinlyProceeds: number | null;
  koinlyGain: number | null;
  koinlyType: string | null;
  koinlyQty: number | null;
  // Delta
  gainDelta: number | null;
  costBasisDelta: number | null;
  matchStatus: "matched" | "ours_only" | "koinly_only";
}

interface ReconciliationResult {
  entity: string;
  year: number;
  taxYearLabel: string;
  aggregate: {
    ourTotalGain: number;
    ourTotalLoss: number;
    ourNetGain: number;
    ourMatchCount: number;
    koinlyTotalGain: number;
    koinlyTotalLoss: number;
    koinlyNetGain: number;
    koinlyDisposalCount: number;
    netGainDelta: number;
    netGainDeltaPct: number | null;
  };
  assetComparisons: AssetComparison[];
  transactionMatches: TransactionMatch[];
}

function buildAssetComparisons(
  ourMatches: OurMatch[],
  koinlyDisposals: KoinlyDisposal[]
): AssetComparison[] {
  // Group our matches by ticker
  const ourByAsset = new Map<string, { gain: number; count: number; costBasis: number; proceeds: number }>();
  for (const m of ourMatches) {
    const key = m.ticker;
    if (!ourByAsset.has(key)) ourByAsset.set(key, { gain: 0, count: 0, costBasis: 0, proceeds: 0 });
    const a = ourByAsset.get(key)!;
    a.gain += m.realizedGainGbp;
    a.count++;
    a.costBasis += m.costBasisGbp;
    a.proceeds += m.proceedsGbp;
  }

  // Group Koinly disposals by asset
  const koinlyByAsset = new Map<string, { gain: number; count: number; costBasis: number; proceeds: number }>();
  for (const d of koinlyDisposals) {
    const key = d.asset;
    if (!koinlyByAsset.has(key)) koinlyByAsset.set(key, { gain: 0, count: 0, costBasis: 0, proceeds: 0 });
    const a = koinlyByAsset.get(key)!;
    a.gain += d.gainGbp;
    a.count++;
    a.costBasis += d.costBasisGbp;
    a.proceeds += d.proceedsGbp;
  }

  // All assets
  const allAssets = new Set([...ourByAsset.keys(), ...koinlyByAsset.keys()]);
  const comparisons: AssetComparison[] = [];

  for (const asset of allAssets) {
    const ours = ourByAsset.get(asset);
    const koinly = koinlyByAsset.get(asset);

    const ourGain = ours?.gain ?? 0;
    const koinlyGain = koinly?.gain ?? 0;
    const delta = ourGain - koinlyGain;
    const denominator = Math.max(Math.abs(ourGain), Math.abs(koinlyGain));
    const deltaPct = denominator > 1 ? (delta / denominator) * 100 : null;

    let status: AssetComparison["status"];
    if (!ours) status = "koinly_only";
    else if (!koinly) status = "ours_only";
    else if (Math.abs(delta) < 1) status = "match";
    else if (deltaPct !== null && Math.abs(deltaPct) < 5) status = "close";
    else status = "discrepancy";

    comparisons.push({
      asset,
      ourGain,
      ourCount: ours?.count ?? 0,
      ourCostBasis: ours?.costBasis ?? 0,
      ourProceeds: ours?.proceeds ?? 0,
      koinlyGain,
      koinlyCount: koinly?.count ?? 0,
      koinlyCostBasis: koinly?.costBasis ?? 0,
      koinlyProceeds: koinly?.proceeds ?? 0,
      gainDelta: delta,
      gainDeltaPct: deltaPct,
      status,
    });
  }

  // Sort by absolute delta descending
  comparisons.sort((a, b) => Math.abs(b.gainDelta) - Math.abs(a.gainDelta));
  return comparisons;
}

function buildTransactionMatches(
  ourMatches: OurMatch[],
  koinlyDisposals: KoinlyDisposal[],
  assetsToDrill: Set<string>
): TransactionMatch[] {
  const results: TransactionMatch[] = [];

  // Group our matches by (asset, date)
  const ourByKey = new Map<string, OurMatch[]>();
  for (const m of ourMatches) {
    if (!assetsToDrill.has(m.ticker)) continue;
    const key = `${m.ticker}:${m.disposalDate}`;
    if (!ourByKey.has(key)) ourByKey.set(key, []);
    ourByKey.get(key)!.push(m);
  }

  // Group Koinly disposals by (asset, date)
  const koinlyByKey = new Map<string, KoinlyDisposal[]>();
  for (const d of koinlyDisposals) {
    if (!assetsToDrill.has(d.asset)) continue;
    const key = `${d.asset}:${d.dateStr}`;
    if (!koinlyByKey.has(key)) koinlyByKey.set(key, []);
    koinlyByKey.get(key)!.push(d);
  }

  const allKeys = new Set([...ourByKey.keys(), ...koinlyByKey.keys()]);

  for (const key of [...allKeys].sort()) {
    const [asset, date] = key.split(":");
    const ours = ourByKey.get(key) || [];
    const koinlys = koinlyByKey.get(key) || [];

    // Aggregate per-date per-asset (since our system may have multiple matches per disposal)
    if (ours.length > 0 && koinlys.length > 0) {
      const ourTotal = ours.reduce(
        (acc, m) => ({
          costBasis: acc.costBasis + m.costBasisGbp,
          proceeds: acc.proceeds + m.proceedsGbp,
          gain: acc.gain + m.realizedGainGbp,
          qty: acc.qty + m.quantityMatched,
        }),
        { costBasis: 0, proceeds: 0, gain: 0, qty: 0 }
      );
      const koinlyTotal = koinlys.reduce(
        (acc, d) => ({
          costBasis: acc.costBasis + d.costBasisGbp,
          proceeds: acc.proceeds + d.proceedsGbp,
          gain: acc.gain + d.gainGbp,
          qty: acc.qty + d.quantity,
        }),
        { costBasis: 0, proceeds: 0, gain: 0, qty: 0 }
      );

      results.push({
        date,
        asset,
        ourCostBasis: ourTotal.costBasis,
        ourProceeds: ourTotal.proceeds,
        ourGain: ourTotal.gain,
        ourMatchType: ours.map((m) => m.matchType).join(","),
        ourQty: ourTotal.qty,
        koinlyCostBasis: koinlyTotal.costBasis,
        koinlyProceeds: koinlyTotal.proceeds,
        koinlyGain: koinlyTotal.gain,
        koinlyType: koinlys.map((d) => d.type).join(","),
        koinlyQty: koinlyTotal.qty,
        gainDelta: ourTotal.gain - koinlyTotal.gain,
        costBasisDelta: ourTotal.costBasis - koinlyTotal.costBasis,
        matchStatus: "matched",
      });
    } else if (ours.length > 0) {
      for (const m of ours) {
        results.push({
          date,
          asset,
          ourCostBasis: m.costBasisGbp,
          ourProceeds: m.proceedsGbp,
          ourGain: m.realizedGainGbp,
          ourMatchType: m.matchType,
          ourQty: m.quantityMatched,
          koinlyCostBasis: null,
          koinlyProceeds: null,
          koinlyGain: null,
          koinlyType: null,
          koinlyQty: null,
          gainDelta: null,
          costBasisDelta: null,
          matchStatus: "ours_only",
        });
      }
    } else {
      for (const d of koinlys) {
        results.push({
          date,
          asset,
          ourCostBasis: null,
          ourProceeds: null,
          ourGain: null,
          ourMatchType: null,
          ourQty: null,
          koinlyCostBasis: d.costBasisGbp,
          koinlyProceeds: d.proceedsGbp,
          koinlyGain: d.gainGbp,
          koinlyType: d.type,
          koinlyQty: d.quantity,
          gainDelta: null,
          costBasisDelta: null,
          matchStatus: "koinly_only",
        });
      }
    }
  }

  return results;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatGbp(n: number): string {
  const sign = n >= 0 ? "" : "-";
  return `${sign}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function printResult(result: ReconciliationResult): void {
  const agg = result.aggregate;
  const divider = "=".repeat(90);
  const subDivider = "-".repeat(90);

  console.log();
  console.log(divider);
  console.log(
    `  ${result.entity.toUpperCase()} ${result.taxYearLabel}`
  );
  console.log(divider);

  // Aggregate
  console.log();
  console.log("  AGGREGATE COMPARISON");
  console.log(subDivider);
  console.log(
    `  ${"".padEnd(30)} ${"Our S104".padStart(15)} ${"Koinly".padStart(15)} ${"Delta".padStart(15)}`
  );
  console.log(
    `  ${"Total gains".padEnd(30)} ${formatGbp(agg.ourTotalGain).padStart(15)} ${formatGbp(agg.koinlyTotalGain).padStart(15)} ${formatGbp(agg.ourTotalGain - agg.koinlyTotalGain).padStart(15)}`
  );
  console.log(
    `  ${"Total losses".padEnd(30)} ${formatGbp(agg.ourTotalLoss).padStart(15)} ${formatGbp(agg.koinlyTotalLoss).padStart(15)} ${formatGbp(agg.ourTotalLoss - agg.koinlyTotalLoss).padStart(15)}`
  );
  console.log(
    `  ${"NET GAIN".padEnd(30)} ${formatGbp(agg.ourNetGain).padStart(15)} ${formatGbp(agg.koinlyNetGain).padStart(15)} ${formatGbp(agg.netGainDelta).padStart(15)}`
  );
  console.log(
    `  ${"Disposal count".padEnd(30)} ${String(agg.ourMatchCount).padStart(15)} ${String(agg.koinlyDisposalCount).padStart(15)}`
  );
  if (agg.netGainDeltaPct !== null) {
    console.log(
      `  Net gain delta: ${agg.netGainDeltaPct.toFixed(1)}%`
    );
  }

  // Per-asset comparison
  console.log();
  console.log("  PER-ASSET COMPARISON (sorted by |delta|)");
  console.log(subDivider);
  console.log(
    `  ${"Asset".padEnd(16)} ${"Our Gain".padStart(14)} ${"Koinly Gain".padStart(14)} ${"Delta".padStart(14)} ${"Our#".padStart(5)} ${"K#".padStart(5)} ${"Status".padStart(14)}`
  );
  console.log(subDivider);

  for (const c of result.assetComparisons) {
    if (Math.abs(c.gainDelta) < 0.01 && c.status === "match") continue;
    console.log(
      `  ${c.asset.slice(0, 15).padEnd(16)} ${formatGbp(c.ourGain).padStart(14)} ${formatGbp(c.koinlyGain).padStart(14)} ${formatGbp(c.gainDelta).padStart(14)} ${String(c.ourCount).padStart(5)} ${String(c.koinlyCount).padStart(5)} ${c.status.padStart(14)}`
    );
  }

  // Transaction drill-down
  if (result.transactionMatches.length > 0) {
    // Group by asset
    const byAsset = new Map<string, TransactionMatch[]>();
    for (const tm of result.transactionMatches) {
      if (!byAsset.has(tm.asset)) byAsset.set(tm.asset, []);
      byAsset.get(tm.asset)!.push(tm);
    }

    for (const [asset, matches] of byAsset) {
      console.log();
      console.log(`  TRANSACTION DRILL-DOWN: ${asset}`);
      console.log(subDivider);
      console.log(
        `  ${"Date".padEnd(10)} ${"Our CB".padStart(12)} ${"Our Proc".padStart(12)} ${"Our Gain".padStart(12)} ${"K CB".padStart(12)} ${"K Proc".padStart(12)} ${"K Gain".padStart(12)} ${"G Delta".padStart(10)} ${"CB Delta".padStart(10)} ${"Status".padStart(11)}`
      );

      for (const m of matches) {
        const ourCB = m.ourCostBasis !== null ? formatGbp(m.ourCostBasis) : "-";
        const ourProc = m.ourProceeds !== null ? formatGbp(m.ourProceeds) : "-";
        const ourGain = m.ourGain !== null ? formatGbp(m.ourGain) : "-";
        const kCB = m.koinlyCostBasis !== null ? formatGbp(m.koinlyCostBasis) : "-";
        const kProc = m.koinlyProceeds !== null ? formatGbp(m.koinlyProceeds) : "-";
        const kGain = m.koinlyGain !== null ? formatGbp(m.koinlyGain) : "-";
        const gDelta = m.gainDelta !== null ? formatGbp(m.gainDelta) : "-";
        const cbDelta = m.costBasisDelta !== null ? formatGbp(m.costBasisDelta) : "-";

        console.log(
          `  ${m.date.padEnd(10)} ${ourCB.padStart(12)} ${ourProc.padStart(12)} ${ourGain.padStart(12)} ${kCB.padStart(12)} ${kProc.padStart(12)} ${kGain.padStart(12)} ${gDelta.padStart(10)} ${cbDelta.padStart(10)} ${m.matchStatus.padStart(11)}`
        );
      }
    }
  }
}

// ============================================================================
// Main Reconciliation
// ============================================================================

async function reconcile(
  entity: string,
  year: number,
  format: "table" | "json"
): Promise<ReconciliationResult> {
  const filePath = getKoinlyFilePath(entity, year);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Koinly file not found: ${filePath}`);
  }

  const ownerName = entity === "nick" ? "Nick" : "TTC";
  const { start, end } = getTaxYearRange(entity, year);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // Parse Koinly CSV
  console.error(`Parsing ${path.basename(filePath)}...`);
  const allTxns = parseKoinlyCSV(filePath);
  const koinlyDisposals = extractKoinlyDisposals(allTxns);
  console.error(`  ${allTxns.length} total transactions, ${koinlyDisposals.length} disposals with gains`);

  // Query our S104 matches
  console.error(`Querying S104 matches for ${ownerName} (${startStr} to ${endStr})...`);
  const ourMatches = await getOurMatches(ownerName, startStr, endStr);
  console.error(`  ${ourMatches.length} S104 match records`);

  // Build asset-level comparison
  const assetComparisons = buildAssetComparisons(ourMatches, koinlyDisposals);

  // Determine which assets to drill down into (top discrepancies)
  const assetsToDrill = new Set<string>();
  for (const c of assetComparisons) {
    if (c.status === "discrepancy" || c.status === "close") {
      assetsToDrill.add(c.asset);
    }
    if (assetsToDrill.size >= 15) break;
  }
  // Also drill into koinly_only and ours_only
  for (const c of assetComparisons) {
    if (c.status === "koinly_only" || c.status === "ours_only") {
      if (Math.abs(c.gainDelta) > 100) assetsToDrill.add(c.asset);
    }
  }

  // Build transaction-level matches
  const transactionMatches = buildTransactionMatches(
    ourMatches,
    koinlyDisposals,
    assetsToDrill
  );

  // Compute aggregates
  const ourTotalGain = ourMatches.reduce(
    (s, m) => (m.realizedGainGbp >= 0 ? s + m.realizedGainGbp : s),
    0
  );
  const ourTotalLoss = ourMatches.reduce(
    (s, m) => (m.realizedGainGbp < 0 ? s + m.realizedGainGbp : s),
    0
  );
  const koinlyTotalGain = koinlyDisposals.reduce(
    (s, d) => (d.gainGbp >= 0 ? s + d.gainGbp : s),
    0
  );
  const koinlyTotalLoss = koinlyDisposals.reduce(
    (s, d) => (d.gainGbp < 0 ? s + d.gainGbp : s),
    0
  );
  const ourNet = ourTotalGain + ourTotalLoss;
  const koinlyNet = koinlyTotalGain + koinlyTotalLoss;
  const netDelta = ourNet - koinlyNet;
  const denom = Math.max(Math.abs(ourNet), Math.abs(koinlyNet));
  const netDeltaPct = denom > 1 ? (netDelta / denom) * 100 : null;

  return {
    entity,
    year,
    taxYearLabel: getTaxYearLabel(entity, year),
    aggregate: {
      ourTotalGain,
      ourTotalLoss,
      ourNetGain: ourNet,
      ourMatchCount: ourMatches.length,
      koinlyTotalGain,
      koinlyTotalLoss,
      koinlyNetGain: koinlyNet,
      koinlyDisposalCount: koinlyDisposals.length,
      netGainDelta: netDelta,
      netGainDeltaPct: netDeltaPct,
    },
    assetComparisons,
    transactionMatches,
  };
}

// ============================================================================
// CLI
// ============================================================================

interface CliArgs {
  entity?: string;
  year?: number;
  all: boolean;
  format: "table" | "json";
}

function parseCli(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { all: false, format: "table" };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--entity":
        result.entity = args[++i]?.toLowerCase();
        break;
      case "--year":
        result.year = parseInt(args[++i], 10);
        break;
      case "--all":
        result.all = true;
        break;
      case "--format":
        result.format = args[++i] as "table" | "json";
        break;
      case "--help":
        console.log(`
Koinly Reconciliation Script

Usage:
  npx tsx scripts/reconcile-koinly.ts --entity <nick|ttc> --year <2022|2023|2024>
  npx tsx scripts/reconcile-koinly.ts --all
  npx tsx scripts/reconcile-koinly.ts --entity ttc --year 2022 --format json

Options:
  --entity <name>   Entity: nick or ttc
  --year <YYYY>     Tax year start (2022 = 2022/23)
  --all             Run all 6 entity-year combinations
  --format <fmt>    Output: table (default) or json
  --help            Show this help
`);
        process.exit(0);
    }
  }

  return result;
}

async function main() {
  const cli = parseCli();

  const runs: Array<{ entity: string; year: number }> = [];

  if (cli.all) {
    for (const entity of ["ttc", "nick"]) {
      for (const year of [2022, 2023, 2024]) {
        runs.push({ entity, year });
      }
    }
  } else if (cli.entity && cli.year) {
    runs.push({ entity: cli.entity, year: cli.year });
  } else {
    console.error("Error: specify --entity and --year, or --all");
    process.exit(1);
  }

  const results: ReconciliationResult[] = [];

  for (const run of runs) {
    try {
      const result = await reconcile(run.entity, run.year, cli.format);
      results.push(result);

      if (cli.format === "table") {
        printResult(result);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`Error for ${run.entity} ${run.year}: ${err.message}`);
        console.error(err.stack);
      } else {
        console.error(`Error for ${run.entity} ${run.year}:`, err);
      }
    }
  }

  if (cli.format === "json") {
    console.log(JSON.stringify(results, null, 2));
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  try {
    await closeDb();
  } catch {}
  process.exit(1);
});
