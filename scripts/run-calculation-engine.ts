#!/usr/bin/env tsx
/**
 * CLI script to run the calculation engine on imported events
 *
 * Usage:
 *   npx tsx scripts/run-calculation-engine.ts --user <userId>
 *   npx tsx scripts/run-calculation-engine.ts --user <userId> --full
 *   npx tsx scripts/run-calculation-engine.ts --user <userId> --phase running_quantity
 *
 * Options:
 *   --user <userId>     User ID to run calculations for (required)
 *   --full              Run full recalculation (default: incremental)
 *   --phase <phase>     Run a specific phase only (optional)
 *   --year <year>       Process only events up to end of specified year
 *   --dry-run           Show what would be done without running
 *   --help              Show this help message
 *
 * Ported from twotreescap-app as part of M2 migration.
 */

// Import scripts db first — this loads dotenv(.env.local) before any @/ imports resolve
import { db, closeDb, schema } from './lib/db.js';
import { eq, count, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  userId: string;
  incremental: boolean;
  phase?: string;
  year?: number;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    userId: "",
    incremental: true,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--user":
        result.userId = args[++i] || "";
        break;
      case "--full":
        result.incremental = false;
        break;
      case "--phase":
        result.phase = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--year":
        result.year = parseInt(args[++i], 10);
        break;
      case "--help":
        result.help = true;
        break;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Calculation Engine CLI

Run the v2 calculation engine on imported events.

Usage:
  npx tsx scripts/run-calculation-engine.ts --user <userId> [options]

Options:
  --user <userId>     User ID to run calculations for (required)
  --full              Run full recalculation (clears existing calculations)
  --phase <phase>     Run a specific phase only
  --year <year>       Process only events up to end of specified year
  --dry-run           Show what would be done without running
  --help              Show this help message

Available Phases:
  sort_indexes            Placeholder for future sort optimization
  running_quantity        Compute cumulative quantities for each event
  cost_basis              Create tax lots and run FIFO matching
  average_cost_basis      Compute average cost basis for positions
  daily_balances          Compute end-of-day position balances
  price_population        Extract prices from IBKR into price_history
  market_value_enrichment Join prices to daily balances
  daily_nav               Aggregate daily portfolio values

Examples:
  npx tsx scripts/run-calculation-engine.ts --user user_123
  npx tsx scripts/run-calculation-engine.ts --user user_123 --full
  npx tsx scripts/run-calculation-engine.ts --user user_123 --phase running_quantity
`);
}

// ============================================================================
// Statistics Helpers
// ============================================================================

async function getEventStats(userId: string): Promise<{
  totalEvents: number;
  byType: Record<string, number>;
  dateRange: { min: string | null; max: string | null };
}> {
  const totalResult = await db
    .select({ count: count() })
    .from(schema.events)
    .where(eq(schema.events.userId, userId));
  const totalEvents = totalResult[0]?.count ?? 0;

  const byTypeResult = await db
    .select({
      eventType: schema.events.eventType,
      count: count(),
    })
    .from(schema.events)
    .where(eq(schema.events.userId, userId))
    .groupBy(schema.events.eventType);

  const byType: Record<string, number> = {};
  for (const row of byTypeResult) {
    byType[row.eventType] = row.count;
  }

  const dateRangeResult = await db
    .select({
      minDate: sql<string>`MIN(${schema.events.timestamp})::text`,
      maxDate: sql<string>`MAX(${schema.events.timestamp})::text`,
    })
    .from(schema.events)
    .where(eq(schema.events.userId, userId));

  return {
    totalEvents,
    byType,
    dateRange: {
      min: dateRangeResult[0]?.minDate ?? null,
      max: dateRangeResult[0]?.maxDate ?? null,
    },
  };
}

async function getExistingCalculationStats(userId: string): Promise<{
  taxLots: number;
  lotConsumptions: number;
  importBatches: number;
}> {
  const [taxLotsResult, consumptionsResult, batchesResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(schema.taxLots)
      .where(eq(schema.taxLots.userId, userId)),
    db
      .select({ count: count() })
      .from(schema.lotConsumptions)
      .innerJoin(schema.taxLots, eq(schema.lotConsumptions.lotId, schema.taxLots.id))
      .where(eq(schema.taxLots.userId, userId)),
    db
      .select({ count: count() })
      .from(schema.importBatches)
      .where(eq(schema.importBatches.userId, userId)),
  ]);

  return {
    taxLots: taxLotsResult[0]?.count ?? 0,
    lotConsumptions: consumptionsResult[0]?.count ?? 0,
    importBatches: batchesResult[0]?.count ?? 0,
  };
}

async function clearExistingCalculations(userId: string): Promise<void> {
  console.log("Clearing existing calculations...");

  await db.execute(sql`
    DELETE FROM lot_consumptions
    WHERE lot_id IN (
      SELECT id FROM tax_lots WHERE user_id = ${userId}
    )
  `);
  console.log(`  Deleted lot consumptions`);

  await db
    .delete(schema.taxLots)
    .where(eq(schema.taxLots.userId, userId));
  console.log(`  Deleted tax lots`);

  // Clear daily balances — the UPSERT in daily_balances phase only updates
  // existing rows, it doesn't delete stale rows for closed positions.
  // Without this, positions that go to zero keep old negative/stale balances.
  await db.execute(sql`
    DELETE FROM portfolio_daily_balances WHERE user_id = ${userId}
  `);
  console.log(`  Deleted daily balances`);

  // Clear portfolio values (aggregated NAV) since they depend on daily balances
  await db.execute(sql`
    DELETE FROM daily_portfolio_values WHERE user_id = ${userId}
  `);
  console.log(`  Deleted portfolio values`);

  console.log(`  (Running quantities will be recalculated)`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.userId) {
    console.error("Error: --user is required");
    showHelp();
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Calculation Engine CLI");
  console.log("=".repeat(60));
  console.log();

  // Get event statistics
  console.log("Event Statistics:");
  const eventStats = await getEventStats(args.userId);

  if (eventStats.totalEvents === 0) {
    console.error(`Error: No events found for user ${args.userId}`);
    process.exit(1);
  }

  console.log(`  Total Events: ${eventStats.totalEvents.toLocaleString()}`);
  const minDate = eventStats.dateRange.min?.split(" ")[0] ?? "N/A";
  const maxDate = eventStats.dateRange.max?.split(" ")[0] ?? "N/A";
  console.log(`  Date Range: ${minDate} to ${maxDate}`);
  console.log(`  By Type:`);
  for (const [type, cnt] of Object.entries(eventStats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${cnt.toLocaleString()}`);
  }
  console.log();

  // Get existing calculation statistics
  console.log("Existing Calculations:");
  const calcStats = await getExistingCalculationStats(args.userId);
  console.log(`  Tax Lots: ${calcStats.taxLots.toLocaleString()}`);
  console.log(`  Lot Consumptions: ${calcStats.lotConsumptions.toLocaleString()}`);
  console.log(`  Import Batches: ${calcStats.importBatches.toLocaleString()}`);
  console.log();

  // Configuration
  console.log("Configuration:");
  console.log(`  User ID: ${args.userId}`);
  console.log(`  Mode: ${args.incremental ? "Incremental" : "Full Recalculation"}`);
  if (args.phase) {
    console.log(`  Phase: ${args.phase}`);
  }
  if (args.year) {
    console.log(`  Year filter: up to end of ${args.year}`);
  }
  console.log();

  if (args.dryRun) {
    console.log("DRY RUN - No calculations will be executed");
    console.log();
    console.log("Would execute:");
    if (!args.incremental && (calcStats.taxLots > 0 || calcStats.lotConsumptions > 0)) {
      console.log("  1. Clear existing tax lots and lot consumptions");
    }
    console.log(`  2. Create import batch for calculation tracking`);
    if (args.phase) {
      console.log(`  3. Run ${args.phase} phase`);
    } else {
      console.log(`  3. Run all calculation phases in dependency order`);
    }
    await closeDb();
    process.exit(0);
  }

  // For full recalculation, clear existing data
  if (!args.incremental && (calcStats.taxLots > 0 || calcStats.lotConsumptions > 0)) {
    console.log("Full recalculation requested - clearing existing calculations...");
    await clearExistingCalculations(args.userId);
    console.log();
  }

  // Dynamic import: engine modules use @/ paths that need env already loaded
  const { getCalculationEngine } = await import('../src/lib/calculations/index.js');
  const { getBatchStateMachine } = await import('../src/lib/event-sourcing/batch-state-machine.js');

  // Create a batch for tracking
  console.log("Creating import batch for calculation tracking...");
  const stateMachine = getBatchStateMachine();
  const batch = await stateMachine.create(
    args.userId,
    "calculation_engine",
    "cli-triggered",
    randomUUID()
  );
  console.log(`  Batch ID: ${batch.id}`);
  console.log();

  // Transition to calculating state
  await stateMachine.transition(batch.id, "parsing");
  await stateMachine.transition(batch.id, "validating");
  await stateMachine.transition(batch.id, "persisting");
  await stateMachine.transition(batch.id, "calculating");

  // Run calculations
  console.log("Running calculation engine...");
  console.log("-".repeat(60));
  const startTime = Date.now();

  const engine = getCalculationEngine();

  const endDate = args.year ? new Date(`${args.year + 1}-01-01T00:00:00Z`) : undefined;

  let result;
  if (args.phase) {
    result = await engine.runPhase(args.userId, batch.id, args.phase, args.incremental, endDate);
  } else {
    result = await engine.runAll(args.userId, batch.id, args.incremental, endDate);
  }

  const duration = Date.now() - startTime;
  console.log("-".repeat(60));
  console.log();

  // Complete or fail the batch
  if (result.success) {
    await stateMachine.complete(batch.id);
    console.log("Calculation completed successfully!");
  } else {
    try {
      const currentBatch = await stateMachine.get(batch.id);
      if (currentBatch.status !== "failed") {
        const errorMsg = result.errors.map((e: { message: string }) => e.message).join("; ");
        await stateMachine.fail(batch.id, new Error(errorMsg));
      }
    } catch {
      // Ignore errors when checking/updating batch status
    }
    console.log("Calculation failed!");
  }

  // Print results
  console.log();
  console.log("Results:");
  console.log(`  Success: ${result.success}`);
  console.log(`  Records Processed: ${result.recordsProcessed.toLocaleString()}`);
  console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);

  if (result.errors.length > 0) {
    console.log(`  Errors (${result.errors.length}):`);
    for (const error of result.errors.slice(0, 10)) {
      console.log(`    [${error.severity}] ${error.message}`);
    }
    if (result.errors.length > 10) {
      console.log(`    ... and ${result.errors.length - 10} more`);
    }
  }

  // Get final statistics
  console.log();
  console.log("Final Calculation Statistics:");
  const finalStats = await getExistingCalculationStats(args.userId);
  console.log(`  Tax Lots: ${finalStats.taxLots.toLocaleString()}`);
  console.log(`  Lot Consumptions: ${finalStats.lotConsumptions.toLocaleString()}`);

  console.log();
  console.log("=".repeat(60));

  await closeDb();
  process.exit(result.success ? 0 : 1);
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  try { await closeDb(); } catch {}
  process.exit(1);
});
