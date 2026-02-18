#!/usr/bin/env npx tsx
/**
 * Import IBKR Combined Files
 *
 * Imports IBKR combined report files (containing STFU, POST, FXPO, TRNT, RATE)
 * into the event-sourced system.
 *
 * Usage:
 *   npx tsx scripts/import-ibkr-combined.ts --file <path> --user <userId>
 *   npx tsx scripts/import-ibkr-combined.ts --dir <path> --user <userId>
 *   npx tsx scripts/import-ibkr-combined.ts --dir <path> --user <userId> --dry-run
 *   npx tsx scripts/import-ibkr-combined.ts --dir <path> --user <userId> --year 2024
 *
 * Options:
 *   --file, -f <path>     Path to a single IBKR combined CSV file
 *   --dir, -d <path>      Directory containing IBKR combined files
 *   --user, -u <userId>   User ID for the imported events
 *   --year, -y <year>     Only import files from specific UK tax year
 *   --max-year <year>     Import files up to and including this UK tax year
 *   --dry-run             Parse and validate without persisting
 *   --verbose, -v         Show detailed output
 *   --help, -h            Show this help message
 *
 * Ported from twotreescap-app/scripts/shadow-mode/import-ibkr-combined.ts
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

// Script db (loads .env.local, creates connection)
import { db, closeDb, schema } from "./lib/db.js";

// Adapter imports (pure transformation, no db dependency)
import {
  processIbkrCombinedFile,
  isIbkrCombinedFile,
  getIbkrCombinedFileSummary,
  mapIbkrAssetClass,
} from "../src/lib/adapters/ibkr/index.js";
import type { CanonicalEvent } from "../src/types/event-sourcing.js";

// ============================================================================
// Types
// ============================================================================

interface CliArgs {
  filePath?: string;
  dirPath?: string;
  userId?: string;
  year?: number;
  maxYear?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

interface ImportResult {
  filePath: string;
  fileName: string;
  success: boolean;
  summary: {
    accountId: string;
    dateRange: { start: string; end: string };
    tradeRows: number;
    sofRows: number;
  };
  events: {
    trades: number;
    sof: number;
    total: number;
  };
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
      case "--year":
      case "-y":
        args.year = parseInt(nextArg);
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
Import IBKR Combined Files

Usage:
  npx tsx scripts/import-ibkr-combined.ts [options]

Options:
  --file, -f <path>     Path to a single IBKR combined CSV file
  --dir, -d <path>      Directory containing IBKR combined files (searches recursively)
  --user, -u <userId>   User ID for the imported events (required)
  --year, -y <year>     Only import files from specific UK tax year (e.g., 2024 for 2024/25)
  --max-year <year>     Import files up to and including this UK tax year
  --dry-run             Parse and validate without persisting to database
  --verbose, -v         Show detailed output including per-event info
  --help, -h            Show this help message

Examples:
  # Import a single file
  npx tsx scripts/import-ibkr-combined.ts --file ./data/20240405_IBKR.csv --user user_123

  # Import all files from a directory
  npx tsx scripts/import-ibkr-combined.ts --dir ./historical-data --user user_123

  # Dry run to see what would be imported
  npx tsx scripts/import-ibkr-combined.ts --dir ./historical-data --user user_123 --dry-run

  # Import only UK tax year 2023/24 files
  npx tsx scripts/import-ibkr-combined.ts --dir ./historical-data --user user_123 --year 2023

  # Import all files up to and including tax year 2024/25
  npx tsx scripts/import-ibkr-combined.ts --dir ./historical-data --user user_123 --max-year 2024

File Detection:
  Files are detected as IBKR combined format if:
  - Filename matches pattern: YYYYMMDD.*IBKR.*.csv (e.g., "20240405 IBKR Nick.csv")
  - File content starts with "BOF," marker

UK Tax Year Mapping:
  Tax year 2023/24: April 6, 2023 to April 5, 2024
  Files ending 20240405 belong to tax year 2023/24
  Files ending 20250405 belong to tax year 2024/25
`);
}

// ============================================================================
// File Discovery
// ============================================================================

function findIbkrCombinedFiles(dirPath: string): string[] {
  const files: string[] = [];

  function scanDir(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
        const filename = entry.name.toLowerCase();
        if (/^\d{8}.*ibkr/i.test(filename) || /ibkr.*combined/i.test(filename)) {
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

function filterByTaxYear(files: string[], targetYear: number): string[] {
  return files.filter((filePath) => {
    const filename = path.basename(filePath);
    const dateStr = extractDateFromFilename(filename);
    if (!dateStr) return false;
    return dateToUkTaxYear(dateStr) === targetYear;
  });
}

function filterByMaxTaxYear(files: string[], maxYear: number): string[] {
  return files.filter((filePath) => {
    const filename = path.basename(filePath);
    const dateStr = extractDateFromFilename(filename);
    if (!dateStr) return false;
    return dateToUkTaxYear(dateStr) <= maxYear;
  });
}

// ============================================================================
// Asset Resolution (inline, uses script db)
// ============================================================================

const assetCache: Map<string, string> = new Map();

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
  const resolvedEvents: CanonicalEvent[] = [];

  for (const event of events) {
    const assetId = await resolveAsset(event.assetTicker, event.metadata as Record<string, unknown>);
    resolvedEvents.push({
      ...event,
      assetId,
    });
  }

  return resolvedEvents;
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
      const rows = chunk.map((event) => ({
        id: event.id.startsWith("temp_") ? randomUUID() : event.id,
        userId,
        eventType: event.eventType,
        timestamp: event.timestamp,
        settlementDate: event.settlementDate ?? null,
        assetId: event.assetId,
        quantity: String(event.quantity),
        price: event.price != null ? String(event.price) : null,
        totalValue: String(event.totalValue),
        currency: event.currency,
        costBasis: event.costBasis != null ? String(event.costBasis) : null,
        owner: event.owner ?? null,
        account: event.account ?? null,
        source: event.source,
        sourceId: event.sourceId ?? null,
        idempotencyKey: event.idempotencyKey,
        importBatchId,
        linkedEventId: event.linkedEventId ?? null,
        rawData: event.rawData ?? null,
        metadata: event.metadata ?? null,
      }));

      const result = await db
        .insert(schema.events)
        .values(rows)
        .onConflictDoNothing({ target: schema.events.idempotencyKey })
        .returning({ id: schema.events.id });

      inserted += result.length;
      skipped += chunk.length - result.length;
    } catch (error) {
      errors += chunk.length;
      errorDetails.push({
        key: `chunk_${Math.floor(i / chunkSize)}`,
        error: error instanceof Error ? error.message : String(error),
      });
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
  const errors: string[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    return {
      filePath,
      fileName,
      success: false,
      summary: { accountId: "", dateRange: { start: "", end: "" }, tradeRows: 0, sofRows: 0 },
      events: { trades: 0, sof: 0, total: 0 },
      persisted: { inserted: 0, skipped: 0, errors: 0 },
      errors: [`Failed to read file: ${error instanceof Error ? error.message : String(error)}`],
      durationMs: Date.now() - startTime,
    };
  }

  if (!isIbkrCombinedFile(content)) {
    return {
      filePath,
      fileName,
      success: false,
      summary: { accountId: "", dateRange: { start: "", end: "" }, tradeRows: 0, sofRows: 0 },
      events: { trades: 0, sof: 0, total: 0 },
      persisted: { inserted: 0, skipped: 0, errors: 0 },
      errors: ["Not a valid IBKR combined file (missing BOF marker)"],
      durationMs: Date.now() - startTime,
    };
  }

  const fileSummary = getIbkrCombinedFileSummary(content);
  const importBatchId = randomUUID();

  const result = processIbkrCombinedFile(content, {
    userId,
    importBatchId,
    processTrades: true,
    processStatementOfFunds: true,
  });

  errors.push(...result.stats.errors);

  if (options.verbose) {
    console.log(`  Processed: ${result.tradeEvents.length} trade events, ${result.sofEvents.length} SOF events`);
  }

  // Resolve asset IDs
  let resolvedEvents: CanonicalEvent[] = [];
  if (result.allEvents.length > 0) {
    try {
      resolvedEvents = await resolveAssetIds(result.allEvents);
      if (options.verbose) {
        console.log(`  Resolved ${resolvedEvents.length} asset IDs`);
      }
    } catch (error) {
      errors.push(`Asset resolution error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Persist events
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
    success: errors.length === 0,
    summary: {
      accountId: fileSummary.accountId,
      dateRange: fileSummary.dateRange,
      tradeRows: fileSummary.sectionCounts.TRNT.rows,
      sofRows: fileSummary.sectionCounts.STFU.rows,
    },
    events: {
      trades: result.tradeEvents.length,
      sof: result.sofEvents.length,
      total: result.allEvents.length,
    },
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
  console.log("IBKR COMBINED FILE IMPORT");
  console.log("=".repeat(70));
  console.log(`User ID: ${args.userId}`);
  console.log(`Dry Run: ${args.dryRun ? "YES (no data will be persisted)" : "NO"}`);
  if (args.year) {
    console.log(`Tax Year Filter: ${args.year}/${(args.year + 1).toString().slice(-2)}`);
  }
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
    files = findIbkrCombinedFiles(args.dirPath);

    if (args.year) {
      files = filterByTaxYear(files, args.year);
    }
    if (args.maxYear) {
      files = filterByMaxTaxYear(files, args.maxYear);
    }
  }

  if (files.length === 0) {
    console.log("No IBKR combined files found to import.");
    process.exit(0);
  }

  console.log(`Found ${files.length} file(s) to import:`);
  for (const file of files) {
    const dateStr = extractDateFromFilename(path.basename(file));
    const taxYear = dateStr ? dateToUkTaxYear(dateStr) : "?";
    console.log(`  - ${path.basename(file)} (Tax Year: ${taxYear}/${Number(taxYear) + 1})`);
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
    totalEvents += result.events.total;
    totalInserted += result.persisted.inserted;
    totalSkipped += result.persisted.skipped;
    totalErrors += result.persisted.errors;

    const status = result.success ? "OK" : "ERRORS";
    console.log(`    Status: ${status}`);
    console.log(`    Account: ${result.summary.accountId}`);
    console.log(`    Date Range: ${result.summary.dateRange.start} to ${result.summary.dateRange.end}`);
    console.log(`    Events: ${result.events.trades} trades, ${result.events.sof} SOF = ${result.events.total} total`);

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
