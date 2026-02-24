#!/usr/bin/env npx tsx
/**
 * Import Koinly Raw Transaction CSV
 *
 * Imports Koinly raw transaction exports (full history per owner) into the
 * event-sourced system. Uses KoinlyRawAdapter for parsing and transformation.
 *
 * Unlike the consolidated tax-year format, the raw format provides a stable
 * 32-char hex Transaction ID per row, eliminating idempotency key collisions.
 *
 * Usage:
 *   npx tsx scripts/import-koinly-raw.ts --file <path> --owner <name> [--dry-run]
 *   npx tsx scripts/import-koinly-raw.ts --file <path> --owner Nick
 *   npx tsx scripts/import-koinly-raw.ts --file <path> --owner TTC --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";

// Script db (loads .env.local, creates connection)
import { db, closeDb, schema } from "./lib/db.js";

// Adapter import
import { KoinlyRawAdapter } from "../src/lib/adapters/koinly-raw-adapter.js";
import type { CanonicalEvent } from "../src/types/event-sourcing.js";

// ============================================================================
// Types
// ============================================================================

interface CliArgs {
  filePath?: string;
  owner?: string;
  userId?: string;
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
  warnings: string[];
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
      case "--owner":
      case "-o":
        args.owner = nextArg;
        i++;
        break;
      case "--user":
      case "-u":
        args.userId = nextArg;
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
Import Koinly Raw Transaction CSV

Usage:
  npx tsx scripts/import-koinly-raw.ts --file <path> --owner <name> [options]

Required:
  --file, -f <path>     Path to the raw Koinly transactions CSV
  --owner, -o <name>    Owner name (Nick, TTC, Tiff)

Options:
  --user, -u <userId>   User ID (default: "system")
  --dry-run             Parse and validate without persisting
  --verbose, -v         Show detailed output
  --help, -h            Show this help message

Examples:
  npx tsx scripts/import-koinly-raw.ts --file "raw Koinly/Koinly TTC.csv" --owner TTC --dry-run
  npx tsx scripts/import-koinly-raw.ts --file "raw Koinly/Koinly Nick old.csv" --owner Nick
`);
}

// ============================================================================
// Asset Resolution (copied from import-koinly.ts)
// ============================================================================

const assetCache: Map<string, string> = new Map();

function inferAssetClass(ticker: string): string {
  const upper = ticker.toUpperCase();

  if (
    ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "HKD", "SGD"].includes(upper)
  ) {
    return "FIAT";
  }
  if (
    ["USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "GUSD", "UST"].includes(upper)
  ) {
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
// Event Persistence (copied from import-koinly.ts)
// ============================================================================

async function persistEvents(
  events: CanonicalEvent[],
  userId: string,
  importBatchId: string
): Promise<{
  inserted: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ key: string; error: string }>;
}> {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ key: string; error: string }> = [];
  const chunkSize = 100;

  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);

    try {
      const rows = chunk.map((event) => {
        const tsStr =
          event.timestamp instanceof Date
            ? event.timestamp.toISOString()
            : String(event.timestamp);
        const sdStr =
          event.settlementDate instanceof Date
            ? event.settlementDate.toISOString()
            : null;
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
      // Chunk failed — fall back to per-event inserts
      for (const event of chunk) {
        try {
          const tsStr =
            event.timestamp instanceof Date
              ? event.timestamp.toISOString()
              : String(event.timestamp);
          const sdStr =
            event.settlementDate instanceof Date
              ? event.settlementDate.toISOString()
              : null;
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
            costBasis:
              event.costBasis != null ? String(event.costBasis) : null,
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
            key: `event_${event.idempotencyKey?.slice(0, 30)}`,
            error:
              individualError instanceof Error
                ? individualError.cause instanceof Error
                  ? individualError.cause.message
                  : individualError.message
                : String(individualError),
          });
        }
      }
    }
  }

  return { inserted, skipped, errors, errorDetails };
}

// ============================================================================
// Import Function
// ============================================================================

async function importFile(
  filePath: string,
  owner: string,
  userId: string,
  options: { dryRun?: boolean; verbose?: boolean }
): Promise<ImportResult> {
  const startTime = Date.now();
  const fileName = path.basename(filePath);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Read file
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
      errors: [
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }

  // Parse
  const adapter = new KoinlyRawAdapter();
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
      warnings: parseResult.warnings,
      durationMs: Date.now() - startTime,
    };
  }

  warnings.push(...parseResult.warnings);

  if (options.verbose) {
    console.log(`  Parsed ${parseResult.records.length} records`);
    if (parseResult.errors.length > 0) {
      console.log(`  Parse errors: ${parseResult.errors.length}`);
    }
    if (parseResult.warnings.length > 0) {
      console.log(`  Parse warnings: ${parseResult.warnings.length}`);
    }
  }

  // Normalize + Expand
  const importBatchId = randomUUID();
  const context = {
    userId,
    owner,
    account: "Koinly",
    batchId: importBatchId,
  };

  const allEvents: CanonicalEvent[] = [];
  const typeCounts: Record<string, number> = {};

  for (let i = 0; i < parseResult.records.length; i++) {
    try {
      const normalized = adapter.normalize(parseResult.records[i]);
      const events = adapter.expand(normalized, context);
      allEvents.push(...events);

      // Track event type distribution
      for (const e of events) {
        typeCounts[e.eventType] = (typeCounts[e.eventType] || 0) + 1;
      }
    } catch (error) {
      errors.push(
        `Record ${i + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log(`  Expanded to ${allEvents.length} events`);
  if (options.verbose) {
    console.log(
      `  Event types: ${Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([t, c]) => `${t}=${c}`)
        .join(", ")}`
    );
  }

  // Resolve assets
  const resolvedEvents: CanonicalEvent[] = [];
  const uniqueTickers = new Set(allEvents.map((e) => e.assetTicker));

  if (!options.dryRun) {
    console.log(`  Resolving ${uniqueTickers.size} unique assets...`);
  }

  for (const event of allEvents) {
    try {
      if (options.dryRun) {
        // In dry-run mode, skip DB asset resolution
        resolvedEvents.push({ ...event, assetId: "dry-run" });
      } else {
        const assetId = await resolveAsset(event.assetTicker);
        resolvedEvents.push({ ...event, assetId });
      }
    } catch (error) {
      errors.push(
        `Asset resolution (${event.assetTicker}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Persist
  let persistResult = { inserted: 0, skipped: 0, errors: 0 };

  if (!options.dryRun && resolvedEvents.length > 0) {
    console.log(`  Persisting ${resolvedEvents.length} events...`);
    try {
      const storeResult = await persistEvents(
        resolvedEvents,
        userId,
        importBatchId
      );
      persistResult = {
        inserted: storeResult.inserted,
        skipped: storeResult.skipped,
        errors: storeResult.errors,
      };

      if (storeResult.errorDetails.length > 0) {
        errors.push(
          ...storeResult.errorDetails.map((e) => `${e.key}: ${e.error}`)
        );
      }
    } catch (error) {
      errors.push(
        `Persist error: ${error instanceof Error ? error.message : String(error)}`
      );
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
    warnings,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args.filePath) {
    console.error("Error: --file is required");
    printUsage();
    process.exit(1);
  }

  if (!args.owner) {
    console.error("Error: --owner is required (Nick, TTC, or Tiff)");
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(args.filePath)) {
    console.error(`Error: File not found: ${args.filePath}`);
    process.exit(1);
  }

  const userId = args.userId || "system";

  console.log("=".repeat(70));
  console.log("KOINLY RAW TRANSACTION IMPORT");
  console.log("=".repeat(70));
  console.log(`File: ${args.filePath}`);
  console.log(`Owner: ${args.owner}`);
  console.log(`User ID: ${userId}`);
  console.log(
    `Mode: ${args.dryRun ? "DRY RUN (no data will be persisted)" : "LIVE"}`
  );
  console.log("");

  const result = await importFile(args.filePath, args.owner, userId, {
    dryRun: args.dryRun,
    verbose: args.verbose,
  });

  console.log("");
  console.log("=".repeat(70));
  console.log("IMPORT RESULT");
  console.log("=".repeat(70));
  console.log(`Status: ${result.success ? "SUCCESS" : "ERRORS"}`);
  console.log(`Records Parsed: ${result.records}`);
  console.log(`Events Generated: ${result.events}`);

  if (!args.dryRun) {
    console.log(`Events Inserted: ${result.persisted.inserted}`);
    console.log(`Events Skipped (duplicates): ${result.persisted.skipped}`);
    console.log(`Events Failed: ${result.persisted.errors}`);
  } else {
    console.log("(Dry run - no events were persisted)");
  }

  console.log(`Duration: ${result.durationMs}ms`);

  if (result.warnings.length > 0) {
    console.log(`\nWarnings (${result.warnings.length}):`);
    for (const w of result.warnings.slice(0, 10)) {
      console.log(`  - ${w}`);
    }
    if (result.warnings.length > 10) {
      console.log(`  ... and ${result.warnings.length - 10} more`);
    }
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const e of result.errors.slice(0, 10)) {
      console.log(`  - ${e}`);
    }
    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more`);
    }
  }

  console.log("=".repeat(70));
  process.exit(result.success ? 0 : 1);
}

main()
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  })
  .finally(() => closeDb());
