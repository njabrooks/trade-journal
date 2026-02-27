#!/usr/bin/env tsx
/**
 * Bridge: Flex Ingestion → Event-Sourced System
 *
 * Reads Flex CSV files (containing TRNT and STFU sections) and transforms
 * them into canonical events via the existing IbkrTradeAdapter and IbkrSofAdapter.
 *
 * IMPORTANT: Only processes events AFTER the latest combined-report event timestamp.
 * Combined reports aggregate partial fills into single events; Flex data returns
 * individual fills. Processing Flex data for dates already covered by combined
 * reports would double-count trades.
 *
 * Usage:
 *   # From saved Flex CSVs (automated, after run-flex-ingestion.ts --save-csv):
 *   npx tsx scripts/bridge-flex-to-events.ts --csv-dir /tmp/flex-csv --user <userId>
 *
 *   # Dry run (parse + transform but don't persist):
 *   npx tsx scripts/bridge-flex-to-events.ts --csv-dir /tmp/flex-csv --user <userId> --dry-run
 */

import { randomUUID } from "crypto";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { eq, sql } from "drizzle-orm";

// Script db (loads .env.local, creates connection)
import { db, closeDb, schema } from "./lib/db.js";

// Adapters (pure transformation, no db dependency)
import { IbkrTradeAdapter } from "../src/lib/adapters/ibkr/ibkr-trade-adapter.js";
import { IbkrSofAdapter } from "../src/lib/adapters/ibkr/ibkr-sof-adapter.js";
import type { IbkrTradeRaw } from "../src/lib/adapters/ibkr/ibkr-trade-adapter.js";
import type { IbkrSofRaw } from "../src/lib/adapters/ibkr/ibkr-sof-adapter.js";
import type { AdapterTransformContext } from "../src/lib/adapters/base-adapter.js";
import type { CanonicalEvent } from "../src/types/event-sourcing.js";
import { mapIbkrAssetClass } from "../src/lib/adapters/ibkr/utils.js";

// ============================================================================
// CLI Args
// ============================================================================

interface CliArgs {
  csvDir?: string;
  backfill: boolean;
  userId: string;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage:
  npx tsx scripts/bridge-flex-to-events.ts --csv-dir <dir> --user <userId>
  npx tsx scripts/bridge-flex-to-events.ts --backfill --user <userId>

Options:
  --csv-dir <dir>   Directory with saved Flex CSVs
  --backfill        Read from trades.rawRow instead of CSVs
  --user <userId>   User ID for events (required)
  --dry-run         Parse and transform without persisting
  --verbose, -v     Show detailed output
  --help, -h        Show this help

Notes:
  Only processes events AFTER the latest combined-report event.
  Flex CSVs contain per-fill data; combined reports aggregate fills.
  Bridging overlapping dates would double-count trades.
`);
    process.exit(0);
  }

  const csvDirIdx = args.indexOf("--csv-dir");
  const userIdx = args.indexOf("--user");

  if (userIdx < 0) {
    console.error("Error: --user <userId> is required");
    process.exit(1);
  }

  const backfill = args.includes("--backfill");

  if (csvDirIdx < 0 && !backfill) {
    console.error("Error: --csv-dir <dir> or --backfill is required");
    process.exit(1);
  }

  return {
    csvDir: csvDirIdx >= 0 ? args[csvDirIdx + 1] : undefined,
    backfill,
    userId: args[userIdx + 1],
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

// ============================================================================
// Flex CSV Section Parser
// ============================================================================

/**
 * Parse a Flex CSV file into section records.
 * Flex CSVs use the format:
 *   HEADER,<SECTION_CODE>,field1,field2,...
 *   DATA,<SECTION_CODE>,value1,value2,...
 */
function parseFlexCsvSections(csvText: string): {
  trnt: IbkrTradeRaw[];
  stfu: IbkrSofRaw[];
} {
  const lines = csvText.trim().split("\n");

  // Collect headers per section code
  const sectionHeaders = new Map<string, string[]>();
  const trntRows: IbkrTradeRaw[] = [];
  const stfuRows: IbkrSofRaw[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse CSV line (handle quoted fields)
    const fields = parseCSVLine(trimmed);
    const marker = fields[0];
    const sectionCode = fields[1];

    if (marker === "HEADER") {
      // Store field names (columns 2+)
      sectionHeaders.set(sectionCode, fields.slice(2));
    } else if (marker === "DATA") {
      const headers = sectionHeaders.get(sectionCode);
      if (!headers) continue;
      const values = fields.slice(2);

      // Build record from header/value pairs
      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        const key = headers[i]?.trim();
        const val = values[i]?.trim();
        if (key && val && val !== "") {
          record[key] = val;
        }
      }

      if (sectionCode === "TRNT") {
        // Only include records with a Conid (skip summary rows)
        if (record.Conid) {
          trntRows.push(record as unknown as IbkrTradeRaw);
        }
      } else if (sectionCode === "STFU") {
        // Only include records with a Date
        if (record.Date) {
          // Skip BaseCurrency summary rows early
          if (record.LevelOfDetail === "BaseCurrency") continue;
          stfuRows.push(record as unknown as IbkrSofRaw);
        }
      }
    }
  }

  return { trnt: trntRows, stfu: stfuRows };
}

/**
 * Simple CSV line parser handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

// ============================================================================
// Asset Resolution (same pattern as import-ibkr-combined.ts)
// ============================================================================

const assetCache = new Map<string, string>();

function inferAssetClass(ticker: string, metadata?: Record<string, unknown>): string {
  const ibkrAssetClass = metadata?.ibkrAssetClass as string | undefined;
  if (ibkrAssetClass) {
    const mapped = mapIbkrAssetClass(ibkrAssetClass);
    if (mapped !== "OTHER") return mapped;
  }

  const upperTicker = ticker.toUpperCase();

  if (["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "HKD", "SGD", "CNH"].includes(upperTicker)) {
    return "FIAT";
  }
  if (["BTC", "ETH", "SOL", "ADA", "DOT", "LINK", "AVAX", "MATIC", "XRP", "LTC", "DOGE"].includes(upperTicker)) {
    return "CRYPTO";
  }
  if (["USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "GUSD"].includes(upperTicker)) {
    return "STABLECOIN";
  }
  if (ticker.match(/\d{6}[CP]\d{8}/)) {
    return "DERIVATIVE";
  }

  return "EQUITY";
}

async function resolveAsset(ticker: string, metadata?: Record<string, unknown>): Promise<string> {
  if (assetCache.has(ticker)) {
    return assetCache.get(ticker)!;
  }

  const existing = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.ticker, ticker))
    .limit(1);

  if (existing.length > 0) {
    assetCache.set(ticker, existing[0].id);
    return existing[0].id;
  }

  const assetClass = inferAssetClass(ticker, metadata);
  const conid = metadata?.conid as string | undefined;

  const [inserted] = await db
    .insert(schema.assets)
    .values({
      ticker,
      name: ticker,
      assetClass,
      ibkrConid: conid,
      decimals: assetClass === "CRYPTO" ? 8 : 2,
      baseCurrency: "USD",
      isActive: true,
    })
    .onConflictDoNothing({ target: schema.assets.ticker })
    .returning({ id: schema.assets.id });

  if (inserted) {
    assetCache.set(ticker, inserted.id);
    return inserted.id;
  }

  const [existingAfterConflict] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.ticker, ticker))
    .limit(1);

  if (existingAfterConflict) {
    assetCache.set(ticker, existingAfterConflict.id);
    return existingAfterConflict.id;
  }

  throw new Error(`Failed to resolve or create asset for ticker: ${ticker}`);
}

async function resolveAssetIds(events: CanonicalEvent[]): Promise<CanonicalEvent[]> {
  const resolved: CanonicalEvent[] = [];
  for (const event of events) {
    const assetId = await resolveAsset(event.assetTicker, event.metadata as Record<string, unknown>);
    resolved.push({ ...event, assetId });
  }
  return resolved;
}

// ============================================================================
// Event Persistence (same pattern as import-ibkr-combined.ts)
// ============================================================================

async function persistEvents(
  events: CanonicalEvent[],
  userId: string,
  importBatchId: string
): Promise<{ inserted: number; skipped: number; errors: number; errorDetails: Array<{ key: string; error: string }> }> {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ key: string; error: string }> = [];
  const chunkSize = 100;

  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);

    try {
      const rows = chunk.map((event) => {
        const tsStr = event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp);
        const sdStr = event.settlementDate instanceof Date ? event.settlementDate.toISOString() : null;
        return {
          id: event.id.startsWith("temp_") ? randomUUID() : event.id,
          userId,
          eventType: event.eventType,
          timestamp: sql`${tsStr}::timestamptz`,
          settlementDate: sdStr ? sql`${sdStr}::timestamptz` : null,
          assetId: event.assetId,
          assetTicker: event.assetTicker,
          quantity: String(event.quantity),
          price: event.price != null ? String(event.price) : null,
          totalValue: String(event.totalValue),
          currency: event.currency,
          costBasis: event.costBasis != null ? String(event.costBasis) : null,
          owner: event.owner ?? null,
          account: event.account ?? null,
          source: event.source,
          sourceId: event.sourceId ?? "",
          idempotencyKey: event.idempotencyKey,
          importBatchId,
          linkedEventId: null, // Nulled: FK constraint fails when referenced trade was deduplicated
          rawData: event.rawData ?? {},
          metadata: event.metadata ?? null,
        };
      });

      const result = await db
        .insert(schema.events)
        .values(rows as any)
        .onConflictDoNothing({ target: schema.events.idempotencyKey })
        .returning({ id: schema.events.id });

      inserted += result.length;
      skipped += chunk.length - result.length;
    } catch (error) {
      errors += chunk.length;
      errorDetails.push({
        key: `chunk_${Math.floor(i / chunkSize)}`,
        error: error instanceof Error
          ? (error.cause instanceof Error ? error.cause.message : error.message)
          : String(error),
      });
    }
  }

  return { inserted, skipped, errors, errorDetails };
}

// ============================================================================
// Cutoff Date: Only bridge events AFTER the latest combined-report event
// ============================================================================

/**
 * Get the latest timestamp from combined-report ibkr_trade and ibkr_sof events.
 * Flex data should only be bridged for dates AFTER this cutoff to avoid
 * double-counting (combined reports aggregate partial fills; Flex returns them individually).
 */
async function getCombinedReportCutoff(userId: string): Promise<Date | null> {
  const result = await db.execute(sql`
    SELECT MAX(timestamp) as max_ts
    FROM events
    WHERE user_id = ${userId}
      AND source IN ('ibkr_trade', 'ibkr_sof')
      AND deleted_at IS NULL
  `) as unknown as Array<{ max_ts: string | null }>;

  const maxTs = result[0]?.max_ts;
  if (!maxTs) return null;
  return new Date(maxTs);
}

/**
 * Parse an IBKR DateTime string (YYYYMMDD;HHMMSS) into a Date.
 */
function parseIbkrDateTimeString(dt: string | undefined): Date | null {
  if (!dt) return null;
  // Handle "YYYYMMDD;HHMMSS" format
  const match = dt.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  }
  // Handle "YYYY-MM-DD;HH:MM:SS" format
  const match2 = dt.match(/^(\d{4}-\d{2}-\d{2});(\d{2}:\d{2}:\d{2})$/);
  if (match2) {
    return new Date(`${match2[1]}T${match2[2]}Z`);
  }
  return null;
}

/**
 * Parse an IBKR Date string (YYYYMMDD or YYYY-MM-DD) into a Date.
 */
function parseIbkrDateString(d: string | undefined): Date | null {
  if (!d) return null;
  const match = d.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  }
  if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return new Date(`${d}T00:00:00Z`);
  }
  return null;
}

// ============================================================================
// Transform Functions
// ============================================================================

function transformTradeRecords(
  rawRows: IbkrTradeRaw[],
  adapter: IbkrTradeAdapter,
  context: AdapterTransformContext
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];

  for (const raw of rawRows) {
    try {
      const normalized = adapter.normalize(raw);
      const expanded = adapter.expand(normalized, context);
      events.push(...expanded);
    } catch (err) {
      console.error(`  Error transforming TRNT row (Conid=${raw.Conid}):`, err instanceof Error ? err.message : err);
    }
  }

  return events;
}

function transformSofRecords(
  rawRows: IbkrSofRaw[],
  adapter: IbkrSofAdapter,
  context: AdapterTransformContext
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];

  for (const raw of rawRows) {
    try {
      const normalized = adapter.normalize(raw);
      const expanded = adapter.expand(normalized, context);
      events.push(...expanded);
    } catch (err) {
      console.error(`  Error transforming STFU row (Date=${raw.Date}, Activity=${raw.ActivityCode}):`, err instanceof Error ? err.message : err);
    }
  }

  return events;
}

// ============================================================================
// CSV Mode: Read saved Flex CSVs
// ============================================================================

async function runCsvMode(csvDir: string, args: CliArgs): Promise<void> {
  if (!existsSync(csvDir)) {
    console.log(`No CSV directory found at ${csvDir} — nothing to bridge.`);
    return;
  }

  const csvFiles = readdirSync(csvDir).filter((f) => f.endsWith(".csv"));
  if (csvFiles.length === 0) {
    console.log(`No CSV files found in ${csvDir} — nothing to bridge.`);
    return;
  }

  // Determine cutoff: only bridge events AFTER the latest combined-report event.
  // Combined reports aggregate partial fills; Flex returns individual fills.
  // Processing overlapping dates would double-count trades.
  const cutoffDate = await getCombinedReportCutoff(args.userId);
  if (cutoffDate) {
    console.log(`Combined-report cutoff: ${cutoffDate.toISOString()}`);
    console.log(`Only bridging events AFTER this timestamp.\n`);
  } else {
    console.log(`No existing combined-report events found — bridging all.\n`);
  }

  console.log(`Found ${csvFiles.length} CSV file(s) in ${csvDir}\n`);

  const tradeAdapter = new IbkrTradeAdapter();
  const sofAdapter = new IbkrSofAdapter();
  const batchId = randomUUID();

  let totalTrntRows = 0;
  let totalStfuRows = 0;
  let totalTrntFiltered = 0;
  let totalStfuFiltered = 0;
  let totalTrntEvents = 0;
  let totalStfuEvents = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const file of csvFiles) {
    const filePath = resolve(csvDir, file);
    console.log(`Processing: ${file}`);

    const csvText = readFileSync(filePath, "utf-8");
    const { trnt, stfu } = parseFlexCsvSections(csvText);

    totalTrntRows += trnt.length;
    totalStfuRows += stfu.length;

    // Filter TRNT rows to only include trades AFTER the cutoff
    let filteredTrnt = trnt;
    if (cutoffDate) {
      filteredTrnt = trnt.filter((raw) => {
        const dt = parseIbkrDateTimeString(raw.DateTime);
        return dt && dt > cutoffDate;
      });
    }
    totalTrntFiltered += trnt.length - filteredTrnt.length;

    // Filter STFU rows to only include records AFTER the cutoff
    let filteredStfu = stfu;
    if (cutoffDate) {
      filteredStfu = stfu.filter((raw) => {
        const d = parseIbkrDateString(raw.Date ?? raw.ReportDate);
        return d && d > cutoffDate;
      });
    }
    totalStfuFiltered += stfu.length - filteredStfu.length;

    console.log(`  TRNT: ${trnt.length} total, ${filteredTrnt.length} after cutoff`);
    console.log(`  STFU: ${stfu.length} total, ${filteredStfu.length} after cutoff`);

    // Build context (owner/account derived per-row by adapters via mapOwnerFromAccountId)
    const context: AdapterTransformContext = {
      userId: args.userId,
      owner: "", // Derived per-row by adapter
      account: "", // Derived per-row by adapter
      batchId,
    };

    // Transform TRNT → events
    const trntEvents = transformTradeRecords(filteredTrnt, tradeAdapter, context);
    totalTrntEvents += trntEvents.length;

    // Transform STFU → events
    const stfuEvents = transformSofRecords(filteredStfu, sofAdapter, context);
    totalStfuEvents += stfuEvents.length;

    const allEvents = [...trntEvents, ...stfuEvents];

    if (allEvents.length === 0) {
      console.log("  No events after cutoff filter.\n");
      continue;
    }

    if (args.dryRun) {
      console.log(`  [DRY RUN] Would persist ${trntEvents.length} TRNT + ${stfuEvents.length} STFU events`);
      if (args.verbose) {
        for (const ev of allEvents.slice(0, 5)) {
          console.log(`    ${ev.eventType} ${ev.assetTicker} qty=${ev.quantity} @ ${ev.timestamp.toISOString()}`);
        }
        if (allEvents.length > 5) console.log(`    ... and ${allEvents.length - 5} more`);
      }
      console.log();
      continue;
    }

    // Resolve asset IDs
    console.log("  Resolving assets...");
    const resolved = await resolveAssetIds(allEvents);

    // Persist
    console.log("  Persisting events...");
    const result = await persistEvents(resolved, args.userId, batchId);
    totalInserted += result.inserted;
    totalSkipped += result.skipped;

    console.log(`  Inserted: ${result.inserted}, Skipped (dedup): ${result.skipped}`);
    if (result.errors > 0) {
      console.error(`  Errors: ${result.errors}`);
      for (const d of result.errorDetails) {
        console.error(`    ${d.key}: ${d.error}`);
      }
    }
    console.log();
  }

  console.log("Summary:");
  console.log(`  Total TRNT rows: ${totalTrntRows} (${totalTrntFiltered} filtered by cutoff)`);
  console.log(`  Total STFU rows: ${totalStfuRows} (${totalStfuFiltered} filtered by cutoff)`);
  console.log(`  TRNT events produced: ${totalTrntEvents}`);
  console.log(`  STFU events produced: ${totalStfuEvents}`);
  if (!args.dryRun) {
    console.log(`  Total inserted: ${totalInserted}`);
    console.log(`  Total skipped (dedup): ${totalSkipped}`);
  }
}

// ============================================================================
// Backfill Mode: Read from trades.rawRow
// ============================================================================

async function runBackfillMode(args: CliArgs): Promise<void> {
  // Determine cutoff
  const cutoffDate = await getCombinedReportCutoff(args.userId);
  if (cutoffDate) {
    console.log(`Combined-report cutoff: ${cutoffDate.toISOString()}`);
    console.log(`Only bridging trades AFTER this timestamp.\n`);
  } else {
    console.log(`No existing combined-report events found — bridging all.\n`);
  }

  // Fetch IBKR trades from the trades table that are after the cutoff
  const cutoffClause = cutoffDate
    ? sql`AND t.trade_date > ${cutoffDate.toISOString()}::timestamptz`
    : sql``;

  const rows = await db.execute(sql`
    SELECT t.raw_row, t.trade_date, t.symbol, t.broker_transaction_id, a.broker_name
    FROM trades t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.broker_name = 'IBKR'
      AND t.raw_row IS NOT NULL
      AND jsonb_typeof(t.raw_row) = 'object'
      AND (t.raw_row->>'Conid') IS NOT NULL
      ${cutoffClause}
    ORDER BY t.trade_date
  `) as unknown as Array<{
    raw_row: Record<string, string>;
    trade_date: string;
    symbol: string;
    broker_transaction_id: string;
    broker_name: string;
  }>;

  console.log(`Found ${rows.length} IBKR trades with rawRow after cutoff\n`);

  if (rows.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const tradeAdapter = new IbkrTradeAdapter();
  const batchId = randomUUID();
  const context: AdapterTransformContext = {
    userId: args.userId,
    owner: "",
    account: "",
    batchId,
  };

  // Transform each rawRow through the adapter
  const allEvents: CanonicalEvent[] = [];
  let transformErrors = 0;

  for (const row of rows) {
    try {
      const rawRecord = row.raw_row as unknown as IbkrTradeRaw;
      const normalized = tradeAdapter.normalize(rawRecord);
      const expanded = tradeAdapter.expand(normalized, context);
      allEvents.push(...expanded);
    } catch (err) {
      transformErrors++;
      if (args.verbose) {
        console.error(`  Error transforming ${row.symbol} @ ${row.trade_date}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`Transformed: ${allEvents.length} events from ${rows.length} trades (${transformErrors} errors)`);

  if (args.verbose) {
    for (const ev of allEvents.slice(0, 10)) {
      const ts = ev.timestamp instanceof Date ? ev.timestamp.toISOString() : String(ev.timestamp);
      console.log(`  ${ev.eventType} ${ev.assetTicker} qty=${ev.quantity} @ ${ts}`);
    }
    if (allEvents.length > 10) console.log(`  ... and ${allEvents.length - 10} more`);
  }

  if (args.dryRun) {
    console.log(`\n[DRY RUN] Would persist ${allEvents.length} events`);
    return;
  }

  // Resolve asset IDs
  console.log("\nResolving assets...");
  const resolved = await resolveAssetIds(allEvents);

  // Persist
  console.log("Persisting events...");
  const result = await persistEvents(resolved, args.userId, batchId);

  console.log(`\nResults:`);
  console.log(`  Inserted: ${result.inserted}`);
  console.log(`  Skipped (dedup): ${result.skipped}`);
  if (result.errors > 0) {
    console.error(`  Errors: ${result.errors}`);
    for (const d of result.errorDetails) {
      console.error(`    ${d.key}: ${d.error}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs();

  console.log("Bridge: Flex Ingestion → Event-Sourced System");
  console.log(`Mode: ${args.backfill ? "backfill (trades table)" : `CSV (${args.csvDir})`}`);
  console.log(`User: ${args.userId}`);
  if (args.dryRun) console.log("DRY RUN — no data will be persisted");
  console.log();

  try {
    if (args.backfill) {
      await runBackfillMode(args);
    } else {
      await runCsvMode(args.csvDir!, args);
    }
    console.log("\nDone.");
  } catch (error) {
    console.error("\nFatal error:", error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
