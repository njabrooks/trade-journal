/**
 * Base Adapter Class
 *
 * Abstract base class for all source adapters providing common utilities
 * and enforcing the adapter contract. All adapters (IBKR, Koinly, Buxfer,
 * Coinbase, etc.) should extend this class.
 *
 * Key design decisions (Stage 3C):
 * - expand() is SYNCHRONOUS - asset resolution is deferred to pipeline
 * - Common utilities are inherited, not duplicated
 * - Factory pattern with singleton instances
 */

import { createHash, randomUUID } from "crypto";
import type {
  EventType,
  EventSource,
  ParseResult,
  ParseError,
  NormalizedRecord,
  AdapterValidationResult,
} from "@/types/event-sourcing";
import type { CanonicalEvent } from "./types";
import { ACQUISITION_EVENT_TYPES, DISPOSAL_EVENT_TYPES } from "./types";

// ============================================================================
// Transform Context (simplified - no async asset resolution)
// ============================================================================

/**
 * Context passed to adapters during transformation.
 * Note: assetResolver is NOT included - resolution happens in pipeline.
 */
export interface AdapterTransformContext {
  /** User performing the import */
  userId: string;
  /** Owner name for the events */
  owner: string;
  /** Account name for the events */
  account: string;
  /** Import batch ID */
  batchId: string;
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Base Adapter Interface (synchronous expand)
// ============================================================================

/**
 * Source Adapter Interface with synchronous expand().
 * This differs from the legacy interface which had async expand().
 */
export interface SyncSourceAdapter<TRaw = Record<string, string>> {
  /** Adapter name (e.g., 'ibkr_trade', 'koinly') */
  readonly name: EventSource;

  /** Adapter version for tracking changes */
  readonly version: string;

  /** Parse CSV/raw data to source-specific records */
  parse(csv: string): ParseResult<TRaw>;

  /** Normalize a raw record to intermediate format */
  normalize(raw: TRaw): NormalizedRecord;

  /** Expand normalized record to canonical events (SYNCHRONOUS) */
  expand(normalized: NormalizedRecord, context: AdapterTransformContext): CanonicalEvent[];

  /** Generate idempotency key for a raw record */
  getIdempotencyKey(raw: TRaw): string;

  /** Validate a canonical event before persistence */
  validate(event: CanonicalEvent): AdapterValidationResult;
}

// ============================================================================
// Base Adapter Abstract Class
// ============================================================================

/**
 * Abstract base class for all source adapters.
 *
 * Provides:
 * - Common utility methods for parsing, hashing, date handling
 * - Event type classification helpers
 * - CSV parsing utilities
 * - Standard validation logic
 *
 * Subclasses must implement:
 * - parse(): Source-specific CSV parsing
 * - normalize(): Convert raw records to NormalizedRecord
 * - expand(): Convert normalized records to CanonicalEvent[]
 * - getIdempotencyKey(): Generate unique key for deduplication
 * - validate(): Source-specific validation rules
 *
 * @template TRaw - The raw record type from the source CSV
 */
export abstract class BaseAdapter<TRaw = Record<string, string>>
  implements SyncSourceAdapter<TRaw>
{
  // ============================================================================
  // Abstract Properties - must be defined by each adapter
  // ============================================================================

  abstract readonly name: EventSource;
  abstract readonly version: string;

  // ============================================================================
  // Abstract Methods - must be implemented by each adapter
  // ============================================================================

  abstract parse(csv: string): ParseResult<TRaw>;
  abstract normalize(raw: TRaw): NormalizedRecord;
  abstract expand(
    normalized: NormalizedRecord,
    context: AdapterTransformContext
  ): CanonicalEvent[];
  abstract getIdempotencyKey(raw: TRaw): string;
  abstract validate(event: CanonicalEvent): AdapterValidationResult;

  // ============================================================================
  // Protected Utilities - Numeric Parsing
  // ============================================================================

  /**
   * Parse a numeric string to number, returning null for invalid/empty.
   * Handles common formats: "1,234.56", "$1,234.56", "-1234.56"
   */
  protected parseNumeric(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (trimmed === "") return null;

    // Remove currency symbols and thousand separators
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
   * Create SHA256 hash of input string (for idempotency keys)
   */
  protected createHash(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  /**
   * Generate a UUID v4 for events.
   * Note: Originally generated temp IDs for pipeline processing, but
   * now generates real UUIDs for direct persistence compatibility.
   */
  protected generateTempId(): string {
    return randomUUID();
  }

  /**
   * Generate a proper UUID v4
   */
  protected generateUUID(): string {
    return randomUUID();
  }

  // ============================================================================
  // Protected Utilities - Date Parsing
  // ============================================================================

  /**
   * Parse ISO date string to Date object.
   * Returns null for invalid dates.
   */
  protected parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Parse date with fallback to current date
   */
  protected parseDateOrNow(dateStr: string | null | undefined): Date {
    return this.parseDate(dateStr) ?? new Date();
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  protected formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  // ============================================================================
  // Protected Utilities - FX Conversion
  // ============================================================================

  /**
   * Convert value to base currency (USD) using FX rate.
   * Rate of 1 means no conversion needed.
   */
  protected convertToBase(
    value: number,
    fxRateToBase: number | null | undefined
  ): number {
    const rate = fxRateToBase ?? 1;
    return value * rate;
  }

  // ============================================================================
  // Protected Utilities - CSV Parsing
  // ============================================================================

  /**
   * Standard CSV line parser handling quoted fields with commas.
   * Properly handles:
   * - Quoted fields containing commas
   * - Escaped quotes ("" inside quoted fields)
   * - Mixed quoted and unquoted fields
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
          // Escaped quote inside quoted field
          current += '"';
          i++; // Skip next quote
        } else if (char === '"') {
          // End of quoted field
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true;
        } else if (char === ",") {
          // Field separator
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }

    // Push last field
    result.push(current.trim());

    return result;
  }

  /**
   * Parse CSV content into lines, handling multi-line quoted fields.
   * Returns array of complete logical rows.
   */
  protected parseCSVLines(csv: string): string[] {
    const lines = csv.trim().split("\n");
    const combined: string[] = [];
    let currentLine = "";

    for (const line of lines) {
      currentLine += (currentLine ? "\n" : "") + line;
      const quoteCount = (currentLine.match(/"/g) || []).length;
      if (quoteCount % 2 === 0) {
        combined.push(currentLine);
        currentLine = "";
      }
    }

    // Add any remaining content
    if (currentLine) {
      combined.push(currentLine);
    }

    return combined;
  }

  /**
   * Create a record from headers and values arrays
   */
  protected createRecordFromArrays<T extends Record<string, string>>(
    headers: string[],
    values: string[]
  ): T {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = values[index];
      if (value !== undefined && value !== "") {
        record[header.trim()] = value;
      }
    });
    return record as T;
  }

  // ============================================================================
  // Protected Utilities - Event Type Classification
  // ============================================================================

  /**
   * Check if event type is an acquisition (creates cost basis)
   */
  protected isAcquisitionType(eventType: EventType | string): boolean {
    return ACQUISITION_EVENT_TYPES.includes(eventType as EventType);
  }

  /**
   * Check if event type is a disposal (consumes cost basis)
   */
  protected isDisposalType(eventType: EventType | string): boolean {
    return DISPOSAL_EVENT_TYPES.includes(eventType as EventType);
  }

  // ============================================================================
  // Protected Utilities - Validation Helpers
  // ============================================================================

  /**
   * Create a basic validation result with common checks.
   * Subclasses can extend this with source-specific validation.
   */
  protected createBaseValidationResult(event: CanonicalEvent): AdapterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!event.eventType) {
      errors.push("Missing eventType");
    }
    if (!event.timestamp || isNaN(event.timestamp.getTime())) {
      errors.push("Invalid or missing timestamp");
    }
    if (!event.assetTicker) {
      errors.push("Missing assetTicker");
    }
    if (event.quantity === undefined || event.quantity === null) {
      errors.push("Missing quantity");
    }
    if (event.quantity !== undefined && event.quantity <= 0) {
      errors.push("Quantity must be positive");
    }
    if (!event.idempotencyKey) {
      errors.push("Missing idempotencyKey");
    }

    // Warnings for potentially missing data
    if (event.totalValue === 0) {
      warnings.push("Total value is zero");
    }
    if (
      this.isAcquisitionType(event.eventType) &&
      !event.costBasis &&
      event.eventType !== "RECEIVE"
    ) {
      warnings.push("Cost basis missing for acquisition event");
    }
    if (
      !event.price &&
      event.eventType !== "RECEIVE" &&
      event.eventType !== "SEND" &&
      event.eventType !== "FEE"
    ) {
      warnings.push("Missing price for trade event");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // Protected Utilities - Idempotency Key Helpers
  // ============================================================================

  /**
   * Build an idempotency key from parts.
   * Joins non-empty parts with ':' and hashes the result.
   */
  protected buildIdempotencyKey(...parts: (string | number | null | undefined)[]): string {
    const keyParts = parts
      .map((p) => (p !== null && p !== undefined ? String(p) : ""))
      .filter((p) => p !== "");
    return this.createHash(keyParts.join(":"));
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
}

// ============================================================================
// Type Exports
// ============================================================================

export type { CanonicalEvent } from "./types";
export type {
  EventType,
  EventSource,
  ParseResult,
  ParseError,
  NormalizedRecord,
  AdapterValidationResult,
} from "@/types/event-sourcing";
