/**
 * Calculation Engine
 *
 * Orchestrates the execution of calculation steps in dependency order.
 * Uses a directed acyclic graph (DAG) to ensure proper execution order.
 *
 * Calculation dependency graph:
 * ```
 *   sort_indexes
 *        │
 *        ▼
 *   running_quantity
 *        │
 *        ▼
 *   lot_creation ──────► fifo_matching
 *        │                    │
 *        └────────┬───────────┘
 *                 ▼
 *          cost_basis (orchestrator for lot_creation + fifo_matching)
 *                 │
 *                 ▼
 *        average_cost_basis
 *                 │
 *                 ▼
 *          gbp_conversion
 *                 │
 *                 ▼
 *        uk_section_104 (S104 pooling for UK accounts)
 *                 │
 *                 ▼
 *          daily_balances
 *                 │
 *                 ▼
 *          price_population
 *                          │
 *                          ▼
 *               market_value_enrichment
 *                          │
 *                          ▼
 *                      daily_nav
 *                          │
 *                          ▼
 *                     completed
 * ```
 *
 * Ported from twotreescap-app as part of M2 migration.
 */

import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getBatchStateMachine } from "@/lib/event-sourcing/batch-state-machine";
import type { BatchStateMachineInterface, CalcPhase } from "@/types/event-sourcing";
import type { CalcContext, CalcResult, Calculation, ExtendedCalcPhase, CalcError } from "./types";

// Import calculation functions
import { computeRunningQuantity } from "./running-quantity";
import { createTaxLots } from "./lot-creation";
import { runFifoMatchingOptimized } from "./fifo-matching";
import { computeAverageCostBasisOptimized } from "./average-cost";
import { computeGbpConversion } from "./gbp-conversion";
import { computeUkSection104 } from "./uk-section-104";
import { computeDailyBalances } from "./daily-balances";
import { populatePricesFromIbkr } from "./price-population";
import { enrichDailyMarketValues } from "./market-value-enrichment";
import { computeDailyPortfolioValues } from "./daily-portfolio-values";

// ============================================================================
// Calculation Definitions
// ============================================================================

async function computeSortIndexes(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  console.log(`[CalcEngine] sort_indexes: No action needed (computed at query time)`);
  return {
    success: true,
    recordsProcessed: 0,
    duration: Date.now() - startTime,
    errors: [],
  };
}

/**
 * Orchestrator for cost_basis phase - runs lot_creation then fifo_matching
 */
async function computeCostBasis(ctx: CalcContext): Promise<CalcResult> {
  const startTime = Date.now();
  const allErrors: CalcError[] = [];
  let totalRecords = 0;

  // Step 1: Create tax lots for acquisition events
  console.log(`[CalcEngine] cost_basis: Starting lot_creation...`);
  await ctx.stateMachine.setCalcPhase(ctx.batchId, "cost_basis" as CalcPhase, {
    subPhase: "lot_creation",
    progress: 0,
  });

  const lotResult = await createTaxLots(ctx);
  allErrors.push(...lotResult.errors);
  totalRecords += lotResult.recordsProcessed;

  if (!lotResult.success) {
    return {
      success: false,
      recordsProcessed: totalRecords,
      duration: Date.now() - startTime,
      errors: allErrors,
    };
  }

  // Step 2: Run FIFO matching for disposal events
  console.log(`[CalcEngine] cost_basis: Starting fifo_matching...`);
  await ctx.stateMachine.setCalcPhase(ctx.batchId, "cost_basis" as CalcPhase, {
    subPhase: "fifo_matching",
    progress: 50,
  });

  const fifoResult = await runFifoMatchingOptimized(ctx);
  allErrors.push(...fifoResult.errors);
  totalRecords += fifoResult.recordsProcessed;

  console.log(
    `[CalcEngine] cost_basis: Completed. Lots created: ${lotResult.recordsProcessed}, Disposals matched: ${fifoResult.recordsProcessed}`
  );

  return {
    success: fifoResult.success,
    recordsProcessed: totalRecords,
    duration: Date.now() - startTime,
    errors: allErrors,
  };
}

/**
 * All calculations in dependency order
 */
const CALCULATIONS: Calculation[] = [
  {
    name: "sort_indexes",
    depends: [],
    compute: computeSortIndexes,
  },
  {
    name: "running_quantity",
    depends: ["sort_indexes"],
    compute: computeRunningQuantity,
  },
  {
    name: "cost_basis" as ExtendedCalcPhase,
    depends: ["running_quantity"],
    compute: computeCostBasis,
  },
  {
    name: "average_cost_basis",
    depends: ["cost_basis" as ExtendedCalcPhase],
    compute: computeAverageCostBasisOptimized,
  },
  {
    name: "gbp_conversion",
    depends: ["average_cost_basis"],
    compute: computeGbpConversion,
  },
  {
    name: "uk_section_104",
    depends: ["gbp_conversion"],
    compute: computeUkSection104,
  },
  {
    name: "daily_balances",
    depends: ["uk_section_104"],
    compute: computeDailyBalances,
  },
  {
    name: "price_population",
    depends: ["daily_balances"],
    compute: populatePricesFromIbkr,
  },
  {
    name: "market_value_enrichment",
    depends: ["price_population"],
    compute: enrichDailyMarketValues,
  },
  {
    name: "daily_nav",
    depends: ["market_value_enrichment"],
    compute: computeDailyPortfolioValues,
  },
];

// ============================================================================
// Calculation Engine
// ============================================================================

export class CalculationEngine {
  private readonly stateMachine: BatchStateMachineInterface;

  constructor(stateMachine?: BatchStateMachineInterface) {
    this.stateMachine = stateMachine ?? getBatchStateMachine();
  }

  async runAll(
    userId: string,
    batchId: string,
    incremental: boolean = true,
    endDate?: Date
  ): Promise<CalcResult> {
    const startTime = Date.now();
    const allErrors: CalcError[] = [];
    let totalRecords = 0;

    const sortedCalcs = this.topologicalSort(CALCULATIONS);

    const context: CalcContext = {
      userId,
      batchId,
      incremental,
      endDate,
      stateMachine: this.stateMachine,
    };

    if (incremental) {
      context.startDate = await this.getLastSuccessfulCalcDate(userId);
      console.log(
        `[CalcEngine] Incremental mode: Starting from ${context.startDate?.toISOString() ?? "beginning"}`
      );
    } else {
      console.log(`[CalcEngine] Full recalculation mode`);
    }

    if (endDate) {
      console.log(`[CalcEngine] Year filter: processing events up to ${endDate.toISOString()}`);
    }

    for (const calc of sortedCalcs) {
      const phaseForStateMachine = this.mapToCalcPhase(calc.name);

      console.log(`[CalcEngine] Starting phase: ${calc.name}`);
      await this.stateMachine.setCalcPhase(batchId, phaseForStateMachine);

      const phaseStartTime = Date.now();
      try {
        const result = await calc.compute(context);
        const phaseDuration = Date.now() - phaseStartTime;

        console.log(
          `[CalcEngine] ${calc.name}: processed ${result.recordsProcessed} records in ${phaseDuration}ms`
        );

        totalRecords += result.recordsProcessed;
        allErrors.push(...result.errors);

        const fatalErrors = result.errors.filter((e) => e.severity === "error");
        if (!result.success || fatalErrors.length > 0) {
          const errorMsg = `Calculation ${calc.name} failed: ${fatalErrors.map((e) => e.message).join(", ")}`;
          console.error(`[CalcEngine] ${errorMsg}`);
          await this.stateMachine.fail(batchId, new Error(errorMsg));
          return {
            success: false,
            recordsProcessed: totalRecords,
            duration: Date.now() - startTime,
            errors: allErrors,
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[CalcEngine] ${calc.name} threw exception:`, error);
        await this.stateMachine.fail(batchId, error instanceof Error ? error : new Error(errorMsg));

        allErrors.push({
          message: `${calc.name}: ${errorMsg}`,
          severity: "error",
        });

        return {
          success: false,
          recordsProcessed: totalRecords,
          duration: Date.now() - startTime,
          errors: allErrors,
        };
      }
    }

    await this.stateMachine.setCalcPhase(batchId, "completed");

    const totalDuration = Date.now() - startTime;
    console.log(
      `[CalcEngine] All calculations completed. Total records: ${totalRecords}, Duration: ${totalDuration}ms`
    );

    return {
      success: true,
      recordsProcessed: totalRecords,
      duration: totalDuration,
      errors: allErrors,
    };
  }

  async runPhase(
    userId: string,
    batchId: string,
    phase: ExtendedCalcPhase,
    incremental: boolean = true,
    endDate?: Date
  ): Promise<CalcResult> {
    const calc = CALCULATIONS.find((c) => c.name === phase);
    if (!calc) {
      throw new Error(`Unknown calculation phase: ${phase}`);
    }

    const context: CalcContext = {
      userId,
      batchId,
      incremental,
      endDate,
      stateMachine: this.stateMachine,
    };

    if (incremental) {
      context.startDate = await this.getLastSuccessfulCalcDate(userId);
    }

    if (endDate) {
      console.log(`[CalcEngine] Year filter: processing events up to ${endDate.toISOString()}`);
    }

    const phaseForStateMachine = this.mapToCalcPhase(phase);
    await this.stateMachine.setCalcPhase(batchId, phaseForStateMachine);

    return calc.compute(context);
  }

  private topologicalSort(calcs: Calculation[]): Calculation[] {
    const sorted: Calculation[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (calc: Calculation) => {
      if (visited.has(calc.name)) return;
      if (visiting.has(calc.name)) {
        throw new Error(`Circular dependency detected at ${calc.name}`);
      }

      visiting.add(calc.name);

      for (const depName of calc.depends) {
        const depCalc = calcs.find((c) => c.name === depName);
        if (depCalc) visit(depCalc);
      }

      visiting.delete(calc.name);
      visited.add(calc.name);
      sorted.push(calc);
    };

    for (const calc of calcs) {
      visit(calc);
    }

    return sorted;
  }

  private mapToCalcPhase(phase: ExtendedCalcPhase): CalcPhase {
    if (phase === "lot_creation" || phase === "fifo_matching") {
      return "cost_basis";
    }
    return phase as CalcPhase;
  }

  private async getLastSuccessfulCalcDate(userId: string): Promise<Date | undefined> {
    const lastBatch = await db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.status, "completed")
        )
      )
      .orderBy(desc(importBatches.completedAt))
      .limit(1);

    return lastBatch[0]?.completedAt ?? undefined;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let engineInstance: CalculationEngine | null = null;

export function getCalculationEngine(): CalculationEngine {
  if (!engineInstance) {
    engineInstance = new CalculationEngine();
  }
  return engineInstance;
}

export function resetCalculationEngine(): void {
  engineInstance = null;
}
