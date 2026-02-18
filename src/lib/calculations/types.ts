/**
 * Calculation Engine Types
 *
 * Type definitions for the V2 calculation engine that handles:
 * - Running quantity calculation
 * - Tax lot creation (FIFO)
 * - FIFO matching for disposals
 * - Average cost basis calculation
 * - Daily balance aggregation
 *
 * Ported from twotreescap-app as part of M2 migration.
 */

import type { CalcPhase, BatchStateMachineInterface } from "@/types/event-sourcing";

// ============================================================================
// Core Calculation Types
// ============================================================================

/**
 * Extended CalcPhase to include lot_creation and fifo_matching
 * These are sub-phases of the cost_basis calculation
 */
export type ExtendedCalcPhase = CalcPhase | "lot_creation" | "fifo_matching";

/**
 * Context passed to each calculation step
 */
export interface CalcContext {
  userId: string;
  batchId: string;
  incremental: boolean;
  startDate?: Date;
  endDate?: Date;
  stateMachine: BatchStateMachineInterface;
}

export type CalcErrorSeverity = "warning" | "error";

export interface CalcError {
  eventId?: string;
  lotId?: string;
  assetId?: string;
  message: string;
  severity: CalcErrorSeverity;
  context?: Record<string, unknown>;
}

export interface CalcResult {
  success: boolean;
  recordsProcessed: number;
  duration: number;
  errors: CalcError[];
}

export interface Calculation {
  name: ExtendedCalcPhase;
  depends: ExtendedCalcPhase[];
  compute: (ctx: CalcContext) => Promise<CalcResult>;
}

// ============================================================================
// Running Quantity Types
// ============================================================================

export interface RunningQuantityUpdate {
  id: string;
  runningQuantity: number;
}

export interface QuantityGroupKey {
  assetId: string;
  owner: string;
  account: string;
}

// ============================================================================
// Tax Lot Types
// ============================================================================

export interface LotCreationData {
  userId: string;
  assetId: string;
  owner: string;
  account: string;
  acquisitionEventId: string;
  acquisitionDate: Date;
  quantity: number;
  costBasisPerUnit: number;
  totalCostBasis: number;
}

export interface LotCreationResult extends CalcResult {
  lotsCreated: number;
}

// ============================================================================
// FIFO Matching Types
// ============================================================================

export interface LotConsumptionRecord {
  lotId: string;
  quantity: number;
  costBasis: number;
  proceeds: number;
  realizedGain: number;
  holdingDays: number;
  isLongTerm: boolean;
}

export interface FifoMatchResult {
  disposalEventId: string;
  totalQuantityMatched: number;
  totalCostBasis: number;
  totalProceeds: number;
  totalRealizedGain: number;
  consumptions: LotConsumptionRecord[];
  isComplete: boolean;
  shortfall?: number;
}

export interface FifoMatchingResult extends CalcResult {
  disposalsMatched: number;
  incompleteMatches: number;
  totalRealizedGains: number;
  totalRealizedLosses: number;
}

// ============================================================================
// Average Cost Types
// ============================================================================

export interface AverageCostState {
  positionId: string;
  totalQuantity: number;
  totalCostBasis: number;
  averageCostPerUnit: number;
  firstAcquisitionDate?: Date;
}

export interface AverageCostProcessResult {
  success: boolean;
  position: AverageCostState;
  costBasis?: number;
  realizedGain?: number;
  holdingDays?: number;
  isLongTerm?: boolean;
}

// ============================================================================
// Daily Balance Types
// ============================================================================

export interface DailyBalanceKey {
  date: string;
  assetId: string;
  assetTicker: string;
  owner: string;
  accountType: string;
}

export interface DailyBalanceRecord {
  date: string;
  assetId: string;
  assetTicker: string;
  owner: string;
  accountType: string;
  quantity: number;
  bookValue?: number;
  price?: number;
  marketValue?: number;
  marketValueSource?: string;
}

// ============================================================================
// Audit & Reporting Types
// ============================================================================

export interface TaxReportSummary {
  year: number;
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  totalGains: number;
  totalLosses: number;
  netGainLoss: number;
  byAsset: AssetGainLoss[];
}

export interface AssetGainLoss {
  assetTicker: string;
  shortTerm: number;
  longTerm: number;
  total: number;
}

export interface ConsistencyReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checkedAt: Date;
}

// ============================================================================
// Event Type Helpers
// ============================================================================

export const ACQUISITION_EVENT_TYPES = [
  "BUY",
  "RECEIVE",
  "DIVIDEND",
  "STAKING_REWARD",
  "AIRDROP",
  "MINING_REWARD",
  "GIFT_IN",
  "FORK",
  "INCOME",
] as const;

export type AcquisitionEventType = (typeof ACQUISITION_EVENT_TYPES)[number];

export const DISPOSAL_EVENT_TYPES = [
  "SELL",
  "SEND",
  "FEE",
  "GIFT_OUT",
  "LOST",
  "EXPENSE",
] as const;

export type DisposalEventType = (typeof DISPOSAL_EVENT_TYPES)[number];

export function isAcquisition(eventType: string): boolean {
  return ACQUISITION_EVENT_TYPES.includes(eventType as AcquisitionEventType);
}

export function isDisposal(eventType: string): boolean {
  return DISPOSAL_EVENT_TYPES.includes(eventType as DisposalEventType);
}
