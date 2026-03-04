/**
 * Event Sourcing Types
 *
 * Types for the portfolio accounting event-sourcing system,
 * ported from twotreescap-app as part of M2 migration.
 */

import type { ImportBatch, NewImportBatch, Asset, NewAsset, AssetAlias, NewAssetAlias, Event, NewEvent } from "@/db/schema";

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
  'gbp_conversion',
  'uk_section_104',
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

// ============================================================================
// Schema Type Aliases (M2b — for ported adapter/service code)
// ============================================================================

export type SelectAsset = Asset;
export type InsertAsset = NewAsset;
export type SelectAssetAlias = AssetAlias;
export type InsertAssetAlias = NewAssetAlias;
export type SelectEvent = Event;
export type InsertEvent = NewEvent;

// ============================================================================
// Event Type & Source Constants (M2b)
// ============================================================================

export const EVENT_TYPES = [
  'BUY', 'SELL', 'RECEIVE', 'SEND', 'FEE',
  'DIVIDEND', 'INTEREST', 'STAKING_REWARD', 'MINING_REWARD',
  'GIFT_IN', 'GIFT_OUT', 'FORK', 'INCOME', 'EXPENSE', 'LOST',
] as const;
export type EventType = typeof EVENT_TYPES[number];

export const EVENT_SOURCES = [
  'ibkr_trade', 'ibkr_sof', 'ibkr_mtmpnl', 'ibkr_positions', 'ibkr_combined',
  'koinly', 'koinly_raw', 'coinbase', 'buxfer',
] as const;
export type EventSource = typeof EVENT_SOURCES[number];

// ============================================================================
// Canonical Event (M2b — adapter output before persistence)
// ============================================================================

export interface CanonicalEvent {
  id: string;
  userId: string;
  eventType: EventType;
  timestamp: Date;
  settlementDate?: Date | null;
  assetId: string;
  assetTicker: string;
  quantity: number;
  price?: number | null;
  totalValue: number;
  currency: string;
  costBasis?: number | null;
  owner: string;
  account: string;
  source: EventSource;
  sourceId: string;
  importBatchId: string;
  linkedEventId?: string | null;
  idempotencyKey: string;
  rawData: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// Adapter Types (M2b)
// ============================================================================

export interface ParseResult<T = Record<string, string>> {
  success: boolean;
  records: T[];
  headers: string[];
  errors: ParseError[];
  warnings: string[];
}

export interface ParseError {
  message: string;
  row?: number;
  column?: number;
  code?: string;
}

export interface NormalizedRecord {
  timestamp: Date;
  symbol?: string;
  conid?: string;
  description?: string;
  assetClass?: string;
  quantity?: number;
  price?: number;
  totalValue?: number;
  commission?: number;
  netCash?: number;
  costBasis?: number;
  realizedPnl?: number;
  isBuy?: boolean;
  currency?: string;
  account?: string;
  type?: string;
  sent?: { amount: number; currency: string | null };
  received?: { amount: number; currency: string | null };
  fee?: { amount: number; currency: string | null };
  netWorth?: number;
  label?: string;
  txHash?: string;
  raw: Record<string, unknown>;
}

export interface AdapterValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TransformContext {
  userId: string;
  owner: string;
  account: string;
  batchId: string;
  assetResolver: AssetResolverInterface;
  idempotencyService: IdempotencyServiceInterface;
}

// ============================================================================
// Service Interfaces (M2b)
// ============================================================================

export interface AssetResolverParams {
  source: EventSource | string;
  identifier: string;
  conid?: string;
  assetClass?: string;
  name?: string;
}

export interface AssetResolverInterface {
  resolve(params: AssetResolverParams): Promise<SelectAsset>;
  resolveMany(params: AssetResolverParams[]): Promise<Map<string, SelectAsset>>;
  addAlias(assetId: string, alias: string, source: string): Promise<void>;
}

export interface IdempotencyServiceInterface {
  generateKey(source: string, record: Record<string, unknown>): string;
  exists(key: string): Promise<boolean>;
  batchExists(userId: string, fileHash: string): Promise<SelectImportBatch | null>;
  hashFile(content: string): string;
}

export interface PersistResult {
  inserted: number;
  skipped: number;
  errors: number;
  insertedIds: string[];
  skippedKeys: string[];
  errorDetails: Array<{ key: string; error: string }>;
}

export interface PersistOptions {
  chunkSize?: number;
  useTransaction?: boolean;
  onProgress?: (processed: number, total: number) => void;
}

// ============================================================================
// Pipeline Types (M2b)
// ============================================================================

export interface ImportOptions {
  filename?: string;
  owner: string;
  account: string;
  shadowMode?: boolean;
}

export type ImportProgressType =
  | 'phase'
  | 'progress'
  | 'skipped'
  | 'completed'
  | 'error';

interface BaseImportProgress {
  type: ImportProgressType;
  batchId?: string;
}

export interface PhaseProgress extends BaseImportProgress {
  type: 'phase';
  phase: BatchStatus | CalcPhase;
}

export interface RecordProgress extends BaseImportProgress {
  type: 'progress';
  phase: BatchStatus | CalcPhase;
  total: number;
  processed: number;
}

export interface SkippedProgress extends BaseImportProgress {
  type: 'skipped';
  message: string;
  batchId: string;
}

export interface CompletedProgress extends BaseImportProgress {
  type: 'completed';
  batchId: string;
  imported: number;
  skipped: number;
  errors: number;
}

export interface ErrorProgress extends BaseImportProgress {
  type: 'error';
  message: string;
  batchId?: string;
}

export type ImportProgress =
  | PhaseProgress
  | RecordProgress
  | SkippedProgress
  | CompletedProgress
  | ErrorProgress;
