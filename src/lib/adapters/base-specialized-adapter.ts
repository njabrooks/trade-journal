/**
 * Base Specialized Adapter Class
 *
 * Abstract base class for specialized adapters that produce non-event data
 * (e.g., price history, daily snapshots, reference data).
 *
 * Unlike event adapters which have expand() -> CanonicalEvent[], specialized
 * adapters have transform() -> TOutput[] for their specific output type.
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/base-specialized-adapter.ts
 */

import { createHash, randomUUID } from "crypto";
import type { ParseResult, ParseError, AdapterValidationResult } from "@/types/event-sourcing";

// ============================================================================
// Specialized Adapter Interface
// ============================================================================

/**
 * Interface for specialized adapters that produce non-event data.
 *
 * @template TRaw - Raw record type from source CSV
 * @template TOutput - Output record type (e.g., NewPriceHistoryRow, NewDailySnapshot)
 */
export interface SpecializedAdapter<TRaw = Record<string, string>, TOutput = unknown> {
  /** Adapter name (e.g., 'ibkr_mtmpnl', 'ibkr_positions') */
  readonly name: string;

  /** Adapter version for tracking changes */
  readonly version: string;

  /** Parse CSV/raw data to source-specific records */
  parse(csv: string): ParseResult<TRaw>;

  /** Transform raw records to output format */
  transform(records: TRaw[], context: SpecializedTransformContext): TOutput[];

  /** Generate idempotency key for a raw record */
  getIdempotencyKey(raw: TRaw): string;

  /** Validate an output record */
  validate(record: TOutput): AdapterValidationResult;
}

/**
 * Context for specialized adapter transformation.
 * Simpler than event adapters since no asset resolution needed inline.
 */
export interface SpecializedTransformContext {
  /** User performing the import */
  userId: string;
  /** Import batch ID */
  batchId: string;
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Base Specialized Adapter Class
// ============================================================================

/**
 * Abstract base class for specialized adapters.
 *
 * Provides common utilities for:
 * - CSV parsing
 * - Numeric parsing
 * - Date handling
 * - Hash generation
 *
 * @template TRaw - Raw record type from source CSV
 * @template TOutput - Output record type
 */
export abstract class BaseSpecializedAdapter<TRaw = Record<string, string>, TOutput = unknown>
  implements SpecializedAdapter<TRaw, TOutput>
{
  // ============================================================================
  // Abstract Properties
  // ============================================================================

  abstract readonly name: string;
  abstract readonly version: string;

  // ============================================================================
  // Abstract Methods
  // ============================================================================

  abstract parse(csv: string): ParseResult<TRaw>;
  abstract transform(records: TRaw[], context: SpecializedTransformContext): TOutput[];
  abstract getIdempotencyKey(raw: TRaw): string;
  abstract validate(record: TOutput): AdapterValidationResult;

  // ============================================================================
  // Protected Utilities - Numeric Parsing
  // ============================================================================

  /**
   * Parse a numeric string to number, returning null for invalid/empty.
   */
  protected parseNumeric(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (trimmed === "") return null;

    const cleaned = trimmed.replace(/[$,]/g, "").trim();
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Parse numeric with default value (returns 0 if invalid)
   */
  protected parseNumericOrZero(value: string | null | undefined): number {
    return this.parseNumeric(value) ?? 0;
  }

  // ============================================================================
  // Protected Utilities - Hashing & ID Generation
  // ============================================================================

  /**
   * Create SHA256 hash of input string
   */
  protected createHash(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  /**
   * Generate a UUID v4
   */
  protected generateUUID(): string {
    return randomUUID();
  }

  // ============================================================================
  // Protected Utilities - Date Parsing
  // ============================================================================

  /**
   * Parse ISO date string to Date object.
   */
  protected parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  protected formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  // ============================================================================
  // Protected Utilities - CSV Parsing
  // ============================================================================

  /**
   * Standard CSV line parser handling quoted fields with commas.
   */
  protected parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }

    result.push(current.trim());
    return result;
  }

  // ============================================================================
  // Protected Utilities - Error Handling
  // ============================================================================

  /**
   * Create a parse error object
   */
  protected createParseError(
    message: string,
    row?: number,
    code?: string
  ): ParseError {
    return {
      message,
      row,
      code,
    };
  }

  /**
   * Create a failed parse result
   */
  protected createFailedParseResult<T>(
    message: string,
    code?: string
  ): ParseResult<T> {
    return {
      success: false,
      records: [],
      headers: [],
      errors: [this.createParseError(message, undefined, code)],
      warnings: [],
    };
  }

  /**
   * Create a basic validation result
   */
  protected createValidationResult(
    valid: boolean,
    errors: string[] = [],
    warnings: string[] = []
  ): AdapterValidationResult {
    return { valid, errors, warnings };
  }

  // ============================================================================
  // Protected Utilities - Idempotency
  // ============================================================================

  /**
   * Build an idempotency key from parts.
   */
  protected buildIdempotencyKey(...parts: (string | number | null | undefined)[]): string {
    const keyParts = parts
      .map((p) => (p !== null && p !== undefined ? String(p) : ""))
      .filter((p) => p !== "");
    return this.createHash(keyParts.join(":"));
  }
}
