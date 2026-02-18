/**
 * Buxfer Source Adapter
 *
 * Parses Buxfer CSV exports and converts them to canonical events.
 *
 * Buxfer is a personal finance tracking tool that records income and expenses.
 * Each Buxfer transaction maps to a single event:
 * - Positive amounts -> RECEIVE (income/deposit)
 * - Negative amounts -> SEND (expense/withdrawal)
 *
 * Buxfer CSV format:
 * - ID: Unique Buxfer transaction ID
 * - Date: Transaction date (DD/MM/YYYY or YYYY-MM-DD)
 * - Description: Transaction description
 * - Currency: Currency code
 * - Amount: Positive for income, negative for expense
 * - Type: Transaction type from Buxfer
 * - Tags: Comma-separated tags
 * - Account: Account name
 * - Status: Transaction status
 * - Memo: Additional notes
 * - IOU: IOU information
 */

import type { EventType, EventSource } from "@/types/event-sourcing";
import {
  BaseAdapter,
  type AdapterTransformContext,
  type ParseResult,
  type ParseError,
  type NormalizedRecord,
  type CanonicalEvent,
} from "./base-adapter";
import type { AdapterValidationResult } from "@/types/event-sourcing";

// ============================================================================
// Buxfer Raw Record Type
// ============================================================================

/**
 * Raw record from Buxfer CSV export
 */
export interface BuxferRaw {
  ID: string;
  Date: string;
  Description: string;
  Currency: string;
  Amount: string;
  Type: string;
  Tags: string;
  Account: string;
  Status: string;
  Memo: string;
  IOU: string;
}

// Expected headers in Buxfer CSV
const BUXFER_HEADERS = [
  "id",
  "date",
  "description",
  "currency",
  "amount",
  "type",
  "tags",
  "account",
  "status",
  "memo",
  "iou",
] as const;

// Required headers for valid Buxfer CSV
const REQUIRED_HEADERS = ["id", "date"];

// ============================================================================
// Buxfer Type Mappings
// ============================================================================

/**
 * Map Buxfer type to canonical event type
 */
function mapBuxferToEventType(buxferType: string, amount: number): EventType {
  const type = buxferType.toLowerCase();

  // Income types
  if (type.includes("income") || type.includes("salary") || type.includes("payment received")) {
    return "INCOME";
  }
  if (type.includes("dividend")) {
    return "DIVIDEND";
  }
  if (type.includes("interest")) {
    return "INTEREST";
  }

  // Expense types
  if (type.includes("expense") || type.includes("payment")) {
    return "EXPENSE";
  }
  if (type.includes("fee")) {
    return "FEE";
  }

  // Transfer types
  if (type.includes("transfer")) {
    return amount >= 0 ? "RECEIVE" : "SEND";
  }

  // Default based on amount sign
  return amount >= 0 ? "RECEIVE" : "SEND";
}

// ============================================================================
// CSV Parsing Helpers
// ============================================================================

/**
 * Parse a CSV line handling quoted fields with commas and line breaks
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteBuffer = "";

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        quoteBuffer += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
        if (!inQuotes && quoteBuffer) {
          current += quoteBuffer;
          quoteBuffer = "";
        }
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      quoteBuffer = "";
    } else {
      if (inQuotes) {
        quoteBuffer += char;
      } else {
        current += char;
      }
    }
  }

  // Add the last field
  result.push((current + quoteBuffer).trim());

  return result.map((field) => field.replace(/^"(.*)"$/, "$1"));
}

/**
 * Combine lines that are part of quoted fields spanning multiple lines
 */
function combineQuotedLines(lines: string[], startIndex: number): string[] {
  const combined: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '"') {
        inQuotes = !inQuotes;
      }
      currentLine += line[j];
    }

    if (!inQuotes) {
      combined.push(currentLine);
      currentLine = "";
    } else {
      currentLine += "\n";
    }
  }

  if (currentLine) {
    combined.push(currentLine);
  }

  return combined;
}

/**
 * Parse date from various formats
 */
function parseDate(dateString: string): Date | null {
  if (!dateString) return null;

  // Try YYYY-MM-DD format
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const date = new Date(dateString + "T00:00:00Z");
    return isNaN(date.getTime()) ? null : date;
  }

  // Try DD/MM/YYYY format
  const parts = dateString.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
  }

  // Try standard Date parsing as fallback
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse numeric value from string
 */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Sanitize text by removing problematic characters
 */
function sanitizeText(text: string): string {
  if (!text) return text;
  return text
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/[^\u0000-\u007F]+/g, "")
    .trim();
}

// ============================================================================
// Buxfer Adapter Implementation
// ============================================================================

export class BuxferAdapter extends BaseAdapter<BuxferRaw> {
  readonly name: EventSource = "buxfer";
  readonly version = "3.0.0"; // Bumped for Stage 3C

  /**
   * Parse Buxfer CSV content into raw records
   */
  parse(csv: string): ParseResult<BuxferRaw> {
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const records: BuxferRaw[] = [];

    const lines = csv.trim().split("\n");

    if (lines.length < 2) {
      return {
        success: false,
        records: [],
        headers: [],
        errors: [{ message: "CSV file is empty or has no data rows", code: "EMPTY_FILE" }],
        warnings: [],
      };
    }

    // Parse headers (first line)
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"(.*)"$/, "$1").toLowerCase());

    // Validate required headers
    for (const required of REQUIRED_HEADERS) {
      if (!headers.includes(required)) {
        return {
          success: false,
          records: [],
          headers,
          errors: [
            {
              message: `Missing required header: ${required}`,
              code: "MISSING_HEADER",
            },
          ],
          warnings: [],
        };
      }
    }

    // Create header index map
    const headerMap = new Map<string, number>();
    headers.forEach((h, i) => headerMap.set(h, i));

    // Combine quoted lines and parse data rows
    const dataLines = combineQuotedLines(lines, 1);

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const lineNumber = i + 2;

      if (!line.trim()) {
        continue;
      }

      try {
        const values = parseCSVLine(line);
        const record = this.createRecord(headers, values, headerMap);

        // Skip rows without valid ID or date
        if (!record.ID || !record.Date) {
          warnings.push(`Line ${lineNumber}: Skipped row with missing ID or date`);
          continue;
        }

        records.push(record);
      } catch (error) {
        errors.push({
          message: error instanceof Error ? error.message : "Unknown parse error",
          row: lineNumber,
          code: "PARSE_ERROR",
        });
      }
    }

    return {
      success: errors.length === 0,
      records,
      headers,
      errors,
      warnings,
    };
  }

  /**
   * Create a BuxferRaw record from parsed values
   */
  private createRecord(
    headers: string[],
    values: string[],
    headerMap: Map<string, number>
  ): BuxferRaw {
    const get = (header: string): string => {
      const idx = headerMap.get(header);
      return idx !== undefined ? values[idx] || "" : "";
    };

    return {
      ID: get("id"),
      Date: get("date"),
      Description: sanitizeText(get("description")),
      Currency: get("currency"),
      Amount: get("amount"),
      Type: get("type"),
      Tags: sanitizeText(get("tags")),
      Account: get("account"),
      Status: get("status"),
      Memo: sanitizeText(get("memo")),
      IOU: get("iou"),
    };
  }

  /**
   * Normalize a Buxfer raw record to intermediate format
   */
  normalize(raw: BuxferRaw): NormalizedRecord {
    const timestamp = parseDate(raw.Date);
    const amount = parseNumeric(raw.Amount);

    // Determine if this is income (positive) or expense (negative)
    const isIncome = amount !== null && amount >= 0;

    return {
      timestamp: timestamp || new Date(),
      type: raw.Type?.toLowerCase() || "unknown",
      symbol: raw.Currency || "USD",
      description: raw.Description || undefined,
      quantity: amount !== null ? Math.abs(amount) : undefined,
      totalValue: amount !== null ? Math.abs(amount) : undefined,
      currency: raw.Currency || "USD",
      account: raw.Account || undefined,
      label: raw.Tags || undefined,
      isBuy: isIncome,
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  /**
   * Expand a normalized Buxfer record into canonical events
   *
   * Stage 3C Migration:
   * - Now uses AdapterTransformContext (synchronous)
   * - Uses inherited utility methods
   */
  expand(normalized: NormalizedRecord, context: AdapterTransformContext): CanonicalEvent[] {
    const raw = normalized.raw as unknown as BuxferRaw;
    const amount = parseNumeric(raw.Amount);

    // Skip if no valid amount
    if (amount === null || amount === 0) {
      return [];
    }

    const eventType = mapBuxferToEventType(raw.Type || "", amount);
    const quantity = Math.abs(amount);
    const currency = raw.Currency || "USD";

    // Determine owner from account name (text before first "-")
    const owner = raw.Account?.split("-")[0]?.trim() || context.owner;

    const id = this.generateTempId();

    // For fiat transactions, price is always 1
    const isFiat = ["USD", "EUR", "GBP", "HKD", "JPY", "CHF", "CAD", "AUD"].includes(
      currency.toUpperCase()
    );

    const event: CanonicalEvent = {
      id,
      userId: context.userId,
      importBatchId: context.batchId,
      eventType,
      timestamp: normalized.timestamp,
      assetId: "", // Resolved by pipeline
      assetTicker: currency.toUpperCase(),
      quantity,
      price: isFiat ? 1 : undefined,
      totalValue: quantity,
      currency: "USD",
      costBasis: this.isAcquisitionType(eventType) ? quantity : undefined,
      owner,
      account: raw.Account || context.account,
      source: this.name,
      sourceId: raw.ID,
      idempotencyKey: this.getIdempotencyKey(raw),
      rawData: raw as unknown as Record<string, unknown>,
      metadata: {
        buxferType: raw.Type || null,
        description: raw.Description || null,
        tags: raw.Tags || null,
        status: raw.Status || null,
        memo: raw.Memo || null,
      },
    };

    return [event];
  }

  /**
   * Generate idempotency key for a Buxfer record
   */
  getIdempotencyKey(raw: BuxferRaw): string {
    // Buxfer ID is unique, so use it directly
    if (raw.ID) {
      return this.createHash(`buxfer:${raw.ID}`);
    }

    // Fall back to composite key if no ID
    return this.buildIdempotencyKey(
      "buxfer",
      raw.Date,
      raw.Amount,
      raw.Description,
      raw.Account
    );
  }

  /**
   * Validate a canonical event
   */
  validate(event: CanonicalEvent): AdapterValidationResult {
    // Use base validation (handles common checks)
    return this.createBaseValidationResult(event);
  }
}

// Export singleton factory
let adapterInstance: BuxferAdapter | null = null;

export function getBuxferAdapter(): BuxferAdapter {
  if (!adapterInstance) {
    adapterInstance = new BuxferAdapter();
  }
  return adapterInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetBuxferAdapter(): void {
  adapterInstance = null;
}
