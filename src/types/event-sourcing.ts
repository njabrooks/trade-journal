/**
 * Event Sourcing Types
 *
 * Types for the portfolio accounting event-sourcing system,
 * ported from twotreescap-app as part of M2 migration.
 */

import type { ImportBatch, NewImportBatch } from "@/db/schema";

// Re-export schema types under TTC-compatible names for ported code
export type SelectImportBatch = ImportBatch;
export type InsertImportBatch = NewImportBatch;

// ============================================================================
// Batch Status & Calc Phase Enums
// ============================================================================

export const BATCH_STATUSES = [
  'pending',
  'parsing',
  'validating',
  'persisting',
  'calculating',
  'completed',
  'failed',
] as const;

export type BatchStatus = typeof BATCH_STATUSES[number];

export const CALC_PHASES = [
  'sort_indexes',
  'running_quantity',
  'cost_basis',
  'average_cost_basis',
  'daily_balances',
  'price_population',
  'market_value_enrichment',
  'daily_nav',
  'completed',
] as const;

export type CalcPhase = typeof CALC_PHASES[number];

// ============================================================================
// State Machine Transitions
// ============================================================================

export const VALID_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  'pending':     ['parsing', 'failed'],
  'parsing':     ['validating', 'failed'],
  'validating':  ['persisting', 'failed'],
  'persisting':  ['calculating', 'failed'],
  'calculating': ['completed', 'failed'],
  'completed':   [],
  'failed':      ['pending'],
};

export function isValidTransition(from: BatchStatus, to: BatchStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: BatchStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface BatchProgress {
  phase: BatchStatus | CalcPhase;
  processed: number;
  total: number;
  message?: string;
}

export interface BatchErrorDetails {
  name: string;
  message: string;
  stack?: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface ValidationError {
  row: number;
  field?: string;
  message: string;
  value?: unknown;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface BatchStateMachineInterface {
  create(userId: string, source: string, filename: string, fileHash: string): Promise<SelectImportBatch>;
  transition(batchId: string, toStatus: BatchStatus, metadata?: Partial<SelectImportBatch>): Promise<SelectImportBatch>;
  updateProgress(batchId: string, processed: number, total: number): Promise<void>;
  setCalcPhase(batchId: string, phase: CalcPhase, progress?: object): Promise<void>;
  fail(batchId: string, error: Error): Promise<void>;
  complete(batchId: string): Promise<void>;
  get(batchId: string): Promise<SelectImportBatch>;
  getActive(userId: string): Promise<SelectImportBatch[]>;
}
