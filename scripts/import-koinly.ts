#!/usr/bin/env npx tsx
/**
 * Import Koinly CSV Files
 *
 * Imports Koinly CSV exports into the event-sourced system.
 * Uses the KoinlyAdapter for parsing and transformation.
 *
 * Usage:
 *   npx tsx scripts/import-koinly.ts --file <path> --user <userId>
 *   npx tsx scripts/import-koinly.ts --dir <path> --user <userId>
 *   npx tsx scripts/import-koinly.ts --dir <path> --user <userId> --dry-run
 *
 * Options:
 *   --file, -f <path>     Path to a single Koinly CSV file
 *   --dir, -d <path>      Directory containing Koinly CSV files (searches recursively)
 *   --user, -u <userId>   User ID for the imported events
 *   --max-year <year>     Import files up to and including this UK tax year
 *   --dry-run             Parse and validate without persisting
 *   --verbose, -v         Show detailed output
 *   --help, -h            Show this help message
 *
 * Ported from twotreescap-app/scripts/shadow-mode/import-koinly.ts
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";

// Script db (loads .env.local, creates connection)
import { db, closeDb, schema } from "./lib/db.js";

// Adapter imports (pure transformation, no db dependency)
import { KoinlyAdapter } from "../src/lib/adapters/koinly-adapter.js";
import type { CanonicalEvent } from "../src/types/event-sourcing.js";

// ============================================================================
// Types
// ============================================================================

interface CliArgs {
  filePath?: string;
  dirPath?: string;
  userId?: string;
  maxYear?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

interface ImportResult {
  filePath: string;
  fileName: string;
  owner: string;
  success: boolean;
  records: number;
  events: number;
  persisted: {
    inserted: number;
    skipped: number;
    errors: number;
  };
  errors: string[];
  durationMs: number;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case "--file":
      case "-f":
        args.filePath = nextArg;
        i++;
        break;
      case "--dir":
      case "-d":
        args.dirPath = nextArg;
        i++;
        break;
      case "--user":
      case "-u":
        args.userId = nextArg;
        i++;
        break;
      case "--max-year":
        args.maxYear = parseInt(nextArg);
        i++;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--verbose":
      case "-v":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`
Import Koinly CSV Files

Usage:
  npx tsx scripts/import-koinly.ts [options]

Options:
  --file, -f <path>     Path to a single Koinly CSV file
  --dir, -d <path>      Directory containing Koinly CSV files (searches recursively)
  --user, -u <userId>   User ID for the imported events (required)
  --max-year <year>     Import files up to and including this UK tax year
  --dry-run             Parse and validate without persisting to database
  --verbose, -v         Show detailed output including per-event info
  --help, -h            Show this help message

Examples:
  # Import a single file
  npx tsx scripts/import-koinly.ts --file "./data/20210504 Koinly Nick.csv" --user user_123

  # Import all Koinly files from a directory
  npx tsx scripts/import-koinly.ts --dir ./historical-data --user user_123

  # Dry run to see what would be imported
  npx tsx scripts/import-koinly.ts --dir ./historical-data --user user_123 --dry-run

  # Import all files up to and including tax year 2021/22
  npx tsx scripts/import-koinly.ts --dir ./historical-data --user user_123 --max-year 2021

File Detection:
  Files are detected as Koinly exports if:
  - Filename contains "koinly" (case-insensitive) and ends with .csv

Owner Detection:
  Owner is inferred from filename:
  - Contains "nick" -> Nick
  - Contains "ttc" -> TTC
  - Contains "tiff" -> Tiff
  - Otherwise -> Unknown

Account:
  All Koinly events are assigned account "Koinly" (wallet info is preserved in metadata).
`);
}

// ============================================================================
// File Discovery
// ============================================================================

function findKoinlyFiles(dirPath: string): string[] {
  const files: string[] = [];

  function scanDir(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
        if (/koinly/i.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  scanDir(dirPath);
  return files.sort();
}

function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/^(\d{8})/);
  return match ? match[1] : null;
}

function dateToUkTaxYear(dateStr: string): number {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6));
  const day = parseInt(dateStr.substring(6, 8));

  if (month < 4 || (month === 4 && day < 6)) {
    return year - 1;
  }
  return year;
}

function filterByMaxTaxYear(files: string[], maxYear: number): string[] {
  return files.filter((filePath) => {
    const filename = path.basename(filePath);
    const dateStr = extractDateFromFilename(filename);
    if (!dateStr) return false;
    return dateToUkTaxYear(dateStr) <= maxYear;
  });
}

function extractOwner(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("nick")) return "Nick";
  if (lower.includes("ttc")) return "TTC";
  if (lower.includes("tiff")) return "Tiff";
  return "Unknown";
}

// ============================================================================
// Asset Resolution (inline, uses script db)
// ============================================================================

const assetCache: Map<string, string> = new Map();

function inferAssetClass(ticker: string): string {
  const upper = ticker.toUpperCase();

  if (["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "HKD", "SGD"].includes(upper)) {
    return "FIAT";
  }
  if (["USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "GUSD", "UST"].includes(upper)) {
    return "STABLECOIN";
  }

  return "CRYPTO";
}

async function resolveAsset(ticker: string): Promise<string> {
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

  const assetClass = inferAssetClass(ticker);
  const [inserted] = await db
    .insert(schema.assets)
    .values({
      ticker,
      name: ticker,
      assetClass,
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

// ============================================================================
// Event Persistence (inline, uses script db)
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
        linkedEventId: event.linkedEventId ?? null,
        rawData: event.rawData ?? {},
        metadata: event.metadata ?? null,
      }; });

      const result = await db
        .insert(schema.events)
        .values(rows as any)
        .onConflictDoNothing({ target: schema.events.idempotencyKey })
        .returning({ id: schema.events.id });

      inserted += result.length;
      skipped += chunk.length - result.length;
    } catch (error) {
      // Chunk failed — fall back to per-event inserts to salvage good events
      for (const event of chunk) {
        try {
          const tsStr = event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp);
          const sdStr = event.settlementDate instanceof Date ? event.settlementDate.toISOString() : null;
          const row = {
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
            linkedEventId: event.linkedEventId ?? null,
            rawData: event.rawData ?? {},
            metadata: event.metadata ?? null,
          };

          const result = await db
            .insert(schema.events)
            .values(row as any)
            .onConflictDoNothing({ target: schema.events.idempotencyKey })
            .returning({ id: schema.events.id });

          if (result.length > 0) inserted++;
          else skipped++;
        } catch (individualError) {
          errors++;
          errorDetails.push({
            key: `event_${event.idempotencyKey?.slice(0, 16)}`,
            error: individualError instanceof Error
              ? (individualError.cause instanceof Error ? individualError.cause.message : individualError.message)
              : String(individualError),
          });
        }
      }
    }
  }

  return { inserted, skipped, errors, errorDetails };
}

// ============================================================================
// Import Functions
// ============================================================================

async function importFile(
  filePath: string,
  userId: string,
  options: { dryRun?: boolean; verbose?: boolean }
): Promise<ImportResult> {
  const startTime = Date.now();
  const fileName = path.basename(filePath);
  const owner = extractOwner(fileName);
  const errors: string[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    return {
      filePath,
      fileName,
      owner,
      success: false,
      records: 0,
      events: 0,
      persisted: { inserted: 0, skipped: 0, errors: 0 },
      errors: [`Failed to read file: ${error instanceof Error ? error.message : String(error)}`],
      durationMs: Date.now() - startTime,
    };
  }

  // Parse with KoinlyAdapter
  const adapter = new KoinlyAdapter();
  const parseResult = adapter.parse(content);

  if (!parseResult.success && parseResult.records.length === 0) {
    return {
      filePath,
      fileName,
      owner,
      success: false,
      records: 0,
      events: 0,
      persisted: { inserted: 0, skipped: 0, errors: 0 },
      errors: parseResult.errors.map((e) => e.message),
      durationMs: Date.now() - startTime,
    };
  }

  if (options.verbose) {
    console.log(`  Parsed ${parseResult.records.length} records`);
    if (parseResult.errors.length > 0) {
      console.log(`  Parse errors: ${parseResult.errors.length}`);
    }
  }

  // Normalize, expand, and collect all events
  const importBatchId = randomUUID();
  const context = {
    userId,
    owner,
    account: "Koinly",
    batchId: importBatchId,
  };

  const allAdapterEvents: CanonicalEvent[] = [];

  for (let i = 0; i < parseResult.records.length; i++) {
    try {
      const normalized = adapter.normalize(parseResult.records[i]);
      const events = adapter.expand(normalized, context);
      allAdapterEvents.push(...events);
    } catch (error) {
      errors.push(`Record ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (options.verbose) {
    console.log(`  Expanded to ${allAdapterEvents.length} events`);
  }

  // Resolve assets and build full events
  const resolvedEvents: CanonicalEvent[] = [];

  for (const event of allAdapterEvents) {
    try {
      const assetId = await resolveAsset(event.assetTicker);
      resolvedEvents.push({
        ...event,
        userId,
        importBatchId,
        assetId,
        id: event.id.startsWith("temp_") ? randomUUID() : event.id,
      });
    } catch (error) {
      errors.push(`Asset resolution: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Persist
  let persistResult = { inserted: 0, skipped: 0, errors: 0 };

  if (!options.dryRun && resolvedEvents.length > 0) {
    try {
      const storeResult = await persistEvents(resolvedEvents, userId, importBatchId);
      persistResult = {
        inserted: storeResult.inserted,
        skipped: storeResult.skipped,
        errors: storeResult.errors,
      };

      if (storeResult.errorDetails.length > 0) {
        errors.push(...storeResult.errorDetails.map((e) => `${e.key}: ${e.error}`));
      }
    } catch (error) {
      errors.push(`Persist error: ${error instanceof Error ? error.message : String(error)}`);
      persistResult.errors = resolvedEvents.length;
    }
  }

  return {
    filePath,
    fileName,
    owner,
    success: errors.length === 0,
    records: parseResult.records.length,
    events: resolvedEvents.length,
    persisted: persistResult,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args.userId) {
    console.error("Error: --user is required");
    printUsage();
    process.exit(1);
  }

  if (!args.filePath && !args.dirPath) {
    console.error("Error: Either --file or --dir is required");
    printUsage();
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("KOINLY CSV IMPORT");
  console.log("=".repeat(70));
  console.log(`User ID: ${args.userId}`);
  console.log(`Dry Run: ${args.dryRun ? "YES (no data will be persisted)" : "NO"}`);
  if (args.maxYear) {
    console.log(`Max Tax Year: ${args.maxYear}/${(args.maxYear + 1).toString().slice(-2)}`);
  }
  console.log("");

  let files: string[] = [];

  if (args.filePath) {
    if (!fs.existsSync(args.filePath)) {
      console.error(`Error: File not found: ${args.filePath}`);
      process.exit(1);
    }
    files = [args.filePath];
  } else if (args.dirPath) {
    if (!fs.existsSync(args.dirPath)) {
      console.error(`Error: Directory not found: ${args.dirPath}`);
      process.exit(1);
    }
    files = findKoinlyFiles(args.dirPath);

    if (args.maxYear) {
      files = filterByMaxTaxYear(files, args.maxYear);
    }
  }

  if (files.length === 0) {
    console.log("No Koinly CSV files found to import.");
    process.exit(0);
  }

  console.log(`Found ${files.length} file(s) to import:`);
  for (const file of files) {
    const filename = path.basename(file);
    const owner = extractOwner(filename);
    const dateStr = extractDateFromFilename(filename);
    const taxYear = dateStr ? dateToUkTaxYear(dateStr) : "?";
    console.log(`  - ${filename} (Owner: ${owner}, Tax Year: ${taxYear}/${Number(taxYear) + 1})`);
  }
  console.log("");

  const results: ImportResult[] = [];
  let totalEvents = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`[${i + 1}/${files.length}] Importing: ${path.basename(file)}`);

    const result = await importFile(file, args.userId!, {
      dryRun: args.dryRun,
      verbose: args.verbose,
    });

    results.push(result);
    totalEvents += result.events;
    totalInserted += result.persisted.inserted;
    totalSkipped += result.persisted.skipped;
    totalErrors += result.persisted.errors;

    const status = result.success ? "OK" : "ERRORS";
    console.log(`    Status: ${status}`);
    console.log(`    Owner: ${result.owner}`);
    console.log(`    Records: ${result.records} -> ${result.events} events`);

    if (!args.dryRun) {
      console.log(`    Persisted: ${result.persisted.inserted} inserted, ${result.persisted.skipped} skipped`);
    }

    if (result.errors.length > 0) {
      console.log(`    Errors:`);
      for (const error of result.errors.slice(0, 5)) {
        console.log(`      - ${error}`);
      }
      if (result.errors.length > 5) {
        console.log(`      ... and ${result.errors.length - 5} more`);
      }
    }

    console.log(`    Duration: ${result.durationMs}ms`);
    console.log("");
  }

  console.log("=".repeat(70));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(70));
  console.log(`Files Processed: ${results.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`With Errors: ${results.filter((r) => !r.success).length}`);
  console.log("");
  console.log(`Total Events Generated: ${totalEvents}`);

  if (!args.dryRun) {
    console.log(`Events Inserted: ${totalInserted}`);
    console.log(`Events Skipped (duplicates): ${totalSkipped}`);
    console.log(`Events Failed: ${totalErrors}`);
  } else {
    console.log("(Dry run - no events were persisted)");
  }

  console.log("=".repeat(70));

  const hasErrors = results.some((r) => !r.success) || totalErrors > 0;
  process.exit(hasErrors ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  })
  .finally(() => closeDb());
