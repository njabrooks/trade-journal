#!/usr/bin/env tsx
/**
 * Bridge: Flex Ingestion → Event-Sourced System
 *
 * Reads Flex CSV files (containing TRNT and STFU sections) and transforms
 * them into canonical events via the existing IbkrTradeAdapter and IbkrSofAdapter.
 *
 * Two modes:
 *   --csv-dir <dir>    Read saved CSVs from Flex ingestion (primary mode)
 *   --backfill         Read from trades.rawRow for historical TRNT backfill
 *
 * Usage:
 *   # From saved Flex CSVs (automated, after run-flex-ingestion.ts --save-csv):
 *   npx tsx scripts/bridge-flex-to-events.ts --csv-dir /tmp/flex-csv --user <userId>
 *
 *   # Backfill TRNT events from existing trades table:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/bridge-flex-to-events.ts --backfill --user <userId>
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
  --backfill        Backfill TRNT events from trades.rawRow
  --user <userId>   User ID for events (required)
  --dry-run         Parse and transform without persisting
  --verbose, -v     Show detailed output
  --help, -h        Show this help
`);
    process.exit(0);
  }

  const csvDirIdx = args.indexOf("--csv-dir");
  const userIdx = args.indexOf("--user");

  if (userIdx < 0) {
    console.error("Error: --user <userId> is required");
    process.exit(1);
  }

  return {
    csvDir: csvDirIdx >= 0 ? args[csvDirIdx + 1] : undefined,
    backfill: args.includes("--backfill"),
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

  console.log(`Found ${csvFiles.length} CSV file(s) in ${csvDir}\n`);

  const tradeAdapter = new IbkrTradeAdapter();
  const sofAdapter = new IbkrSofAdapter();
  const batchId = randomUUID();

  let totalTrntEvents = 0;
  let totalStfuEvents = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const file of csvFiles) {
    const filePath = resolve(csvDir, file);
    console.log(`Processing: ${file}`);

    const csvText = readFileSync(filePath, "utf-8");
    const { trnt, stfu } = parseFlexCsvSections(csvText);

    console.log(`  TRNT rows: ${trnt.length}, STFU rows: ${stfu.length}`);

    // Build context (owner/account derived per-row by adapters via mapOwnerFromAccountId)
    const context: AdapterTransformContext = {
      userId: args.userId,
      owner: "", // Derived per-row by adapter
      account: "", // Derived per-row by adapter
      batchId,
    };

    // Transform TRNT → events
    const trntEvents = transformTradeRecords(trnt, tradeAdapter, context);
    totalTrntEvents += trntEvents.length;

    // Transform STFU → events
    const stfuEvents = transformSofRecords(stfu, sofAdapter, context);
    totalStfuEvents += stfuEvents.length;

    const allEvents = [...trntEvents, ...stfuEvents];

    if (allEvents.length === 0) {
      console.log("  No events produced.\n");
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
  console.log("Backfill mode: reading TRNT records from trades.rawRow...\n");

  const tradeAdapter = new IbkrTradeAdapter();
  const batchId = randomUUID();

  const context: AdapterTransformContext = {
    userId: args.userId,
    owner: "", // Derived per-row
    account: "", // Derived per-row
    batchId,
  };

  // Fetch all trades with rawRow
  const allTrades = await db
    .select({
      id: schema.trades.id,
      rawRow: schema.trades.rawRow,
      tradeDate: schema.trades.tradeDate,
    })
    .from(schema.trades)
    .orderBy(schema.trades.tradeDate);

  console.log(`Found ${allTrades.length} trades in database\n`);

  let trntEvents: CanonicalEvent[] = [];
  let skippedNoRaw = 0;

  for (const trade of allTrades) {
    if (!trade.rawRow || typeof trade.rawRow !== "object") {
      skippedNoRaw++;
      continue;
    }

    const raw = trade.rawRow as unknown as IbkrTradeRaw;

    // rawRow must have Conid to be valid
    if (!raw.Conid) {
      skippedNoRaw++;
      continue;
    }

    try {
      const normalized = tradeAdapter.normalize(raw);
      const expanded = tradeAdapter.expand(normalized, context);
      trntEvents.push(...expanded);
    } catch (err) {
      console.error(`  Error transforming trade ${trade.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Produced ${trntEvents.length} events from ${allTrades.length - skippedNoRaw} trades`);
  if (skippedNoRaw > 0) {
    console.log(`Skipped ${skippedNoRaw} trades (no rawRow or missing Conid)`);
  }

  if (trntEvents.length === 0) {
    console.log("No events to persist.");
    return;
  }

  if (args.dryRun) {
    console.log(`\n[DRY RUN] Would persist ${trntEvents.length} events`);
    if (args.verbose) {
      for (const ev of trntEvents.slice(0, 10)) {
        console.log(`  ${ev.eventType} ${ev.assetTicker} qty=${ev.quantity} @ ${ev.timestamp.toISOString()}`);
      }
      if (trntEvents.length > 10) console.log(`  ... and ${trntEvents.length - 10} more`);
    }
    return;
  }

  // Resolve asset IDs
  console.log("\nResolving assets...");
  const resolved = await resolveAssetIds(trntEvents);

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

  if (!args.csvDir && !args.backfill) {
    console.error("Error: must specify --csv-dir <dir> or --backfill");
    process.exit(1);
  }

  console.log("Bridge: Flex Ingestion → Event-Sourced System");
  console.log(`Mode: ${args.backfill ? "backfill (trades.rawRow)" : `csv-dir (${args.csvDir})`}`);
  console.log(`User: ${args.userId}`);
  if (args.dryRun) console.log("DRY RUN — no data will be persisted");
  console.log();

  try {
    if (args.backfill) {
      await runBackfillMode(args);
    } else if (args.csvDir) {
      await runCsvMode(args.csvDir, args);
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
