/**
 * Calculation Engine V2
 *
 * A modular, dependency-aware calculation engine for computing:
 * - Running quantities
 * - Tax lots (FIFO cost basis)
 * - Average cost basis
 * - Daily balances
 * - Market values
 * - P&L
 *
 * Ported from twotreescap-app as part of M2 migration.
 *
 * Usage:
 * ```typescript
 * import { getCalculationEngine } from "@/lib/calculations";
 *
 * const engine = getCalculationEngine();
 * const result = await engine.runAll(userId, batchId, incremental);
 * ```
 */

// ============================================================================
// Main Engine
// ============================================================================

export { CalculationEngine, getCalculationEngine, resetCalculationEngine } from "./engine";

// ============================================================================
// Individual Calculations
// ============================================================================

export { computeRunningQuantity, getCurrentQuantity, validateRunningQuantities } from "./running-quantity";

export { createTaxLots, getOpenLots, getOpenQuantity, countLots } from "./lot-creation";

export { runFifoMatching, runFifoMatchingOptimized, getConsumptionsForDisposal, getConsumptionsForLot, getTotalRealizedGainLoss, validateFifoConsistency } from "./fifo-matching";

export { computeAverageCostBasis, computeAverageCostBasisOptimized, getAverageCostPosition } from "./average-cost";

export {
  computeDailyBalances,
  getDailyBalance,
  getBalancesForDate,
  getBalanceHistory,
  clearDailyBalances,
} from "./daily-balances";

// ============================================================================
// Types
// ============================================================================

export type {
  CalcContext,
  CalcResult,
  CalcError,
  Calculation,
  ExtendedCalcPhase,
  FifoMatchResult,
  LotConsumptionRecord,
  LotCreationResult,
} from "./types";

export {
  ACQUISITION_EVENT_TYPES,
  DISPOSAL_EVENT_TYPES,
  isAcquisition,
  isDisposal,
} from "./types";
