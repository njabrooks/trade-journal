/**
 * Source Adapter Types
 *
 * This module defines the core interface for source adapters in the event sourcing
 * architecture. Each data source (IBKR, Koinly, Buxfer, Coinbase) implements this
 * interface to provide consistent parsing, normalization, and event expansion.
 *
 * Key concepts:
 * - SourceAdapter<TRaw>: The main interface all adapters implement
 * - CanonicalEvent: The output format that maps to the events table (defined in @/types/event-sourcing)
 * - ParseResult: Result of CSV parsing
 * - NormalizedRecord: Intermediate format after normalization
 */

import type {
  EventType,
  EventSource,
  TransformContext,
  ParseResult,
  ParseError,
  NormalizedRecord,
  AdapterValidationResult,
  CanonicalEvent,
} from "@/types/event-sourcing";

// Re-export CanonicalEvent so adapter code can import from ./types
export type { CanonicalEvent } from "@/types/event-sourcing";

// ============================================================================
// Source Adapter Interface
// ============================================================================

/**
 * SourceAdapter<TRaw> - The core interface all source adapters implement
 *
 * @template TRaw - The raw record type from the source CSV
 *
 * Adapters are responsible for:
 * 1. Parsing CSV content into raw records
 * 2. Normalizing raw records into intermediate format
 * 3. Expanding normalized records into canonical events
 * 4. Generating idempotency keys for deduplication
 * 5. Validating events before insertion
 */
export interface SourceAdapter<TRaw = Record<string, string>> {
  /**
   * Unique identifier for this adapter
   */
  readonly name: EventSource;

  /**
   * Version string for tracking adapter changes
   */
  readonly version: string;

  /**
   * Parse CSV content into source-specific records
   *
   * This handles the raw CSV parsing, including:
   * - Header detection and validation
   * - Row parsing with proper escaping
   * - Basic format validation
   *
   * @param csv - Raw CSV content as string
   * @returns ParseResult with records or errors
   */
  parse(csv: string): ParseResult<TRaw>;

  /**
   * Normalize a raw record into intermediate format
   *
   * This converts source-specific field names and formats
   * into a standardized intermediate format.
   *
   * @param raw - Raw record from parse()
   * @returns NormalizedRecord
   */
  normalize(raw: TRaw): NormalizedRecord;

  /**
   * Expand a normalized record into canonical events
   *
   * Many source records expand into multiple events:
   * - Trades -> BUY/SELL + FEE
   * - Transfers -> SEND + RECEIVE (sometimes)
   * - Swaps -> SELL + BUY
   *
   * @param normalized - Normalized record from normalize()
   * @param context - Transform context with services
   * @returns Array of canonical events
   */
  expand(normalized: NormalizedRecord, context: TransformContext): CanonicalEvent[];

  /**
   * Generate idempotency key for a raw record
   *
   * The key must be deterministic and unique for each logical transaction.
   * Re-importing the same file should generate the same keys.
   *
   * @param raw - Raw record
   * @returns Unique idempotency key
   */
  getIdempotencyKey(raw: TRaw): string;

  /**
   * Validate a canonical event
   *
   * Checks that all required fields are present and valid.
   * Called before inserting into the database.
   *
   * @param event - Canonical event to validate
   * @returns Validation result with errors/warnings
   */
  validate(event: CanonicalEvent): AdapterValidationResult;
}

// ============================================================================
// Adapter Result Types
// ============================================================================

/**
 * Result of processing a single record through the adapter pipeline
 */
export interface AdapterProcessResult {
  success: boolean;
  events: CanonicalEvent[];
  skipped: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Summary of processing all records from a source
 */
export interface AdapterBatchResult {
  totalRecords: number;
  successfulRecords: number;
  skippedRecords: number;
  errorRecords: number;
  events: CanonicalEvent[];
  errors: Array<{ record: unknown; errors: string[] }>;
  warnings: string[];
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Type guard to check if an object is a CanonicalEvent
 */
export function isCanonicalEvent(obj: unknown): obj is CanonicalEvent {
  if (!obj || typeof obj !== 'object') return false;
  const event = obj as CanonicalEvent;
  return (
    typeof event.id === 'string' &&
    typeof event.eventType === 'string' &&
    event.timestamp instanceof Date &&
    typeof event.assetTicker === 'string' &&
    typeof event.quantity === 'number' &&
    typeof event.totalValue === 'number' &&
    typeof event.idempotencyKey === 'string'
  );
}

/**
 * Generate a temporary UUID-like ID for events
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a hash from string for idempotency keys
 */
export function hashForKey(input: string): string {
  // Simple hash for deterministic key generation
  // In production, use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Event Type Mappings
// ============================================================================

/**
 * Acquisition event types (increase position)
 */
export const ACQUISITION_EVENT_TYPES: EventType[] = [
  'BUY',
  'RECEIVE',
  'DIVIDEND',
  'INTEREST',
  'STAKING_REWARD',
  'MINING_REWARD',
  'GIFT_IN',
  'FORK',
  'INCOME',
];

/**
 * Disposal event types (decrease position)
 */
export const DISPOSAL_EVENT_TYPES: EventType[] = [
  'SELL',
  'SEND',
  'FEE',
  'GIFT_OUT',
  'LOST',
  'EXPENSE',
];

/**
 * Check if an event type is an acquisition
 */
export function isAcquisitionType(eventType: EventType): boolean {
  return ACQUISITION_EVENT_TYPES.includes(eventType);
}

/**
 * Check if an event type is a disposal
 */
export function isDisposalType(eventType: EventType): boolean {
  return DISPOSAL_EVENT_TYPES.includes(eventType);
}
