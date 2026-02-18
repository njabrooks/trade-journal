/**
 * Coinbase Source Adapter (Class-based)
 *
 * Parses Coinbase CSV exports and converts them to canonical events.
 *
 * Coinbase CSV format (first 4 rows are metadata):
 * - Row 1: Blank
 * - Row 2: Title
 * - Row 3: User info
 * - Row 4: Headers
 * - Row 5+: Data
 *
 * Columns:
 * - ID: Transaction ID
 * - Timestamp: Transaction timestamp (YYYY-MM-DD HH:MM:SS UTC)
 * - Transaction Type: Type of transaction
 * - Asset: Asset symbol
 * - Quantity Transacted: Amount of asset
 * - Price Currency: Currency of price
 * - Price at Transaction: Price per unit
 * - Subtotal: Subtotal before fees
 * - Total: Total including fees
 * - Fees and/or Spread: Fee amount
 * - Notes: Transaction notes
 *
 * Transaction types:
 * - Advanced Trade Buy/Sell: Advanced trading
 * - Buy: Simple buy
 * - Deposit: Deposit from external
 * - Send: Send to external
 * - Reward income: Staking/interest rewards
 * - Perpetual Futures Buy/Sell: Futures trading
 * - Perpetual Futures Deposit/Withdrawal: Futures margin
 * - Funding Fee: Futures funding fee
 * - Settlements Of Unrealized P/L: Daily futures settlement
 *
 * Stage 3C Migration:
 * - Now extends BaseAdapter for shared utilities
 * - expand() remains synchronous (already was)
 *
 * @see STAGED_IMPLEMENTATION_PLAN.md Stage 3C
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
// Coinbase Raw Record Type
// ============================================================================

/**
 * Raw record from Coinbase CSV export
 */
export interface CoinbaseRaw {
  ID: string;
  Timestamp: string;
  "Transaction Type": string;
  Asset: string;
  "Quantity Transacted": string;
  "Price Currency": string;
  "Price at Transaction": string;
  Subtotal: string;
  Total: string;
  "Fees and/or Spread": string;
  Notes: string;
}

// Expected headers in Coinbase CSV (lowercase for matching)
const COINBASE_HEADERS = [
  "id",
  "timestamp",
  "transaction type",
  "asset",
  "quantity transacted",
  "price currency",
  "price at transaction",
  "subtotal",
  "total",
  "fees and/or spread",
  "notes",
] as const;

// Required headers for valid Coinbase CSV
const REQUIRED_HEADERS = ["id", "timestamp", "transaction type", "asset"];

// ============================================================================
// Coinbase Type Mappings
// ============================================================================

/**
 * Map Coinbase transaction type to canonical event type
 */
function mapCoinbaseToEventType(
  transactionType: string,
  direction: "sent" | "received" | "fee"
): EventType {
  const type = transactionType.toLowerCase();

  // Fee is always FEE
  if (direction === "fee") {
    return "FEE";
  }

  // Trading transactions
  if (type.includes("advanced trade sell") || type.includes("sell")) {
    return direction === "sent" ? "SELL" : "BUY";
  }
  if (type.includes("advanced trade buy") || type === "buy") {
    return direction === "sent" ? "SELL" : "BUY";
  }

  // Deposits and withdrawals
  if (type.includes("deposit")) {
    return "RECEIVE";
  }
  if (type === "send") {
    return "SEND";
  }

  // Rewards
  if (type.includes("reward income") || type.includes("staking")) {
    return "STAKING_REWARD";
  }
  if (type.includes("interest")) {
    return "INTEREST";
  }

  // Futures - treat as income/expense for now
  if (type.includes("perpetual futures")) {
    if (type.includes("deposit")) {
      return "SEND"; // Moving to futures margin
    }
    if (type.includes("withdrawal")) {
      return "RECEIVE"; // Moving from futures margin
    }
    // P&L from futures trading
    return direction === "received" ? "INCOME" : "EXPENSE";
  }

  if (type.includes("funding fee")) {
    return direction === "received" ? "INCOME" : "EXPENSE";
  }

  if (type.includes("settlement")) {
    return direction === "received" ? "INCOME" : "EXPENSE";
  }

  // Default
  return direction === "sent" ? "SEND" : "RECEIVE";
}

/**
 * Calculate sent amount and currency from Coinbase transaction
 */
function calculateSent(
  raw: CoinbaseRaw
): { amount: number | null; currency: string | null } {
  const type = raw["Transaction Type"];
  const quantity = parseNumeric(raw["Quantity Transacted"]);
  const subtotal = parseNumeric(raw.Subtotal);

  if (type.includes("Advanced Trade Sell")) {
    return { amount: quantity, currency: raw.Asset };
  }
  if (type.includes("Advanced Trade Buy")) {
    return { amount: subtotal, currency: "USDC" };
  }
  if (type === "Perpetual Futures Deposit") {
    return { amount: quantity, currency: raw.Asset };
  }
  if (type === "Buy") {
    return { amount: subtotal, currency: "USD" };
  }
  if (type.includes("Funding Fee") || type.includes("Perpetual Futures") || type.includes("Settlement")) {
    if (subtotal !== null && subtotal < 0) {
      return { amount: Math.abs(subtotal), currency: "USDC" };
    }
    return { amount: null, currency: null };
  }
  if (type === "Send") {
    return { amount: quantity !== null ? Math.abs(quantity) : null, currency: raw.Asset };
  }

  return { amount: null, currency: null };
}

/**
 * Calculate received amount and currency from Coinbase transaction
 */
function calculateReceived(
  raw: CoinbaseRaw
): { amount: number | null; currency: string | null } {
  const type = raw["Transaction Type"];
  const quantity = parseNumeric(raw["Quantity Transacted"]);
  const subtotal = parseNumeric(raw.Subtotal);

  if (type.includes("Advanced Trade Sell")) {
    return { amount: subtotal, currency: "USDC" };
  }
  if (type.includes("Advanced Trade Buy")) {
    return { amount: quantity, currency: raw.Asset };
  }
  if (type === "Perpetual Futures Withdrawal") {
    return {
      amount: quantity !== null ? Math.abs(quantity) : null,
      currency: raw.Asset,
    };
  }
  if (type.includes("Deposit")) {
    return { amount: quantity, currency: raw.Asset };
  }
  if (type === "Buy") {
    return { amount: quantity, currency: raw.Asset };
  }
  if (type.includes("Funding Fee") || type.includes("Perpetual Futures") || type.includes("Settlement")) {
    if (subtotal !== null && subtotal > 0) {
      return { amount: subtotal, currency: "USDC" };
    }
    return { amount: null, currency: null };
  }
  if (type.includes("Reward income")) {
    return { amount: quantity, currency: raw.Asset };
  }

  return { amount: quantity, currency: raw.Asset };
}

/**
 * Calculate label from transaction type and notes
 */
function calculateLabel(type: string, notes: string): string {
  if (type === "Perpetual Futures Deposit") return "Pool out";
  if (type === "Perpetual Futures Withdrawal") return "Pool in";
  if (type.includes("Perpetual")) return "Realized P&L";
  if (type.includes("Buy")) return "Buy";
  if (type.includes("Sell")) return "Sell";
  if (type === "Deposit") return "Deposit";
  if (type.includes("Funding Fee")) return "Funding fee";
  if (type === "Reward income") return "Staking reward";
  if (type.includes("Settlement")) return "Realized P&L";
  if (notes?.includes("external account")) return "Deposit";
  if (notes?.includes("to")) return "Withdrawal";
  return "Trade";
}

// ============================================================================
// CSV Parsing Helpers
// ============================================================================

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());

  return parts;
}

/**
 * Parse numeric value, handling currency symbols and N/A
 */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value || value === "N/A" || value.trim() === "") return null;
  const cleaned = value.replace(/[$,]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse Coinbase timestamp format
 */
function parseTimestamp(timestamp: string): Date | null {
  if (!timestamp || timestamp.trim() === "") return null;

  try {
    // Format: "YYYY-MM-DD HH:MM:SS UTC"
    const normalized = timestamp.replace(" UTC", "") + "Z";
    const date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

// ============================================================================
// Coinbase Adapter Implementation
// ============================================================================

export class CoinbaseAdapter extends BaseAdapter<CoinbaseRaw> {
  readonly name: EventSource = "coinbase";
  readonly version = "3.0.0"; // Bumped for Stage 3C

  /**
   * Parse Coinbase CSV content into raw records
   */
  parse(csv: string): ParseResult<CoinbaseRaw> {
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const records: CoinbaseRaw[] = [];

    const lines = csv.trim().split("\n");

    // Coinbase CSVs have 4 header rows (blank, title, user info, headers)
    // Find the actual header row by looking for expected columns
    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].toLowerCase();
      if (line.includes("timestamp") && line.includes("transaction type")) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      // Try standard Coinbase format (headers at row 4, index 3)
      if (lines.length > 3) {
        headerIndex = 3;
      } else {
        return {
          success: false,
          records: [],
          headers: [],
          errors: [
            { message: "Invalid Coinbase CSV: could not find header row", code: "INVALID_HEADER" },
          ],
          warnings: [],
        };
      }
    }

    // Parse headers
    const headers = parseCSVLine(lines[headerIndex]).map((h) =>
      h.toLowerCase().trim()
    );

    // Validate required headers
    for (const required of REQUIRED_HEADERS) {
      if (!headers.includes(required)) {
        return {
          success: false,
          records: [],
          headers,
          errors: [
            { message: `Missing required header: ${required}`, code: "MISSING_HEADER" },
          ],
          warnings: [],
        };
      }
    }

    // Create header index map
    const headerMap = new Map<string, number>();
    headers.forEach((h, i) => headerMap.set(h, i));

    // Parse data rows
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const lineNumber = i + 1;

      try {
        const values = parseCSVLine(line);
        const record = this.createRecord(headers, values, headerMap);

        // Skip rows without valid timestamp
        if (!record.Timestamp || record.Timestamp.trim() === "") {
          warnings.push(`Line ${lineNumber}: Skipped row with missing timestamp`);
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
   * Create a CoinbaseRaw record from parsed values
   */
  private createRecord(
    headers: string[],
    values: string[],
    headerMap: Map<string, number>
  ): CoinbaseRaw {
    const get = (header: string): string => {
      const idx = headerMap.get(header);
      return idx !== undefined ? values[idx] || "" : "";
    };

    return {
      ID: get("id"),
      Timestamp: get("timestamp"),
      "Transaction Type": get("transaction type"),
      Asset: get("asset"),
      "Quantity Transacted": get("quantity transacted"),
      "Price Currency": get("price currency"),
      "Price at Transaction": get("price at transaction"),
      Subtotal: get("subtotal"),
      Total: get("total"),
      "Fees and/or Spread": get("fees and/or spread"),
      Notes: get("notes"),
    };
  }

  /**
   * Normalize a Coinbase raw record to intermediate format
   */
  normalize(raw: CoinbaseRaw): NormalizedRecord {
    const timestamp = parseTimestamp(raw.Timestamp);
    const quantity = parseNumeric(raw["Quantity Transacted"]);
    const price = parseNumeric(raw["Price at Transaction"]);
    const subtotal = parseNumeric(raw.Subtotal);
    const total = parseNumeric(raw.Total);
    const fee = parseNumeric(raw["Fees and/or Spread"]);

    const sent = calculateSent(raw);
    const received = calculateReceived(raw);

    return {
      timestamp: timestamp || new Date(),
      type: raw["Transaction Type"]?.toLowerCase() || "unknown",
      symbol: raw.Asset || undefined,
      price: price || undefined,
      quantity: quantity || undefined,
      totalValue: total || subtotal || undefined,
      commission: fee || undefined,
      currency: raw["Price Currency"] || "USD",
      sent: sent.amount !== null ? { amount: sent.amount, currency: sent.currency } : undefined,
      received: received.amount !== null ? { amount: received.amount, currency: received.currency } : undefined,
      fee: fee !== null && fee > 0 ? { amount: fee, currency: raw["Price Currency"] || "USD" } : undefined,
      label: calculateLabel(raw["Transaction Type"], raw.Notes),
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  /**
   * Expand a normalized Coinbase record into canonical events
   */
  expand(normalized: NormalizedRecord, context: AdapterTransformContext): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    const raw = normalized.raw as unknown as CoinbaseRaw;
    const baseIdempotencyKey = this.getIdempotencyKey(raw);

    // Generate sent event
    if (normalized.sent?.amount && normalized.sent?.currency) {
      const eventType = mapCoinbaseToEventType(raw["Transaction Type"], "sent");
      const sentEvent = this.createEvent({
        normalized,
        context,
        direction: "sent",
        eventType,
        currency: normalized.sent.currency,
        quantity: normalized.sent.amount,
        idempotencySuffix: "sent",
        baseIdempotencyKey,
        raw,
      });
      if (sentEvent) events.push(sentEvent);
    }

    // Generate received event
    if (normalized.received?.amount && normalized.received?.currency) {
      const eventType = mapCoinbaseToEventType(raw["Transaction Type"], "received");
      const receivedEvent = this.createEvent({
        normalized,
        context,
        direction: "received",
        eventType,
        currency: normalized.received.currency,
        quantity: normalized.received.amount,
        idempotencySuffix: "received",
        baseIdempotencyKey,
        raw,
      });
      if (receivedEvent) events.push(receivedEvent);
    }

    // Generate fee event
    if (normalized.fee?.amount && normalized.fee?.currency) {
      const feeEvent = this.createEvent({
        normalized,
        context,
        direction: "fee",
        eventType: "FEE",
        currency: normalized.fee.currency,
        quantity: normalized.fee.amount,
        idempotencySuffix: "fee",
        baseIdempotencyKey,
        raw,
        linkedEventId: events[0]?.id,
      });
      if (feeEvent) events.push(feeEvent);
    }

    return events;
  }

  /**
   * Create a single canonical event
   */
  private createEvent(params: {
    normalized: NormalizedRecord;
    context: AdapterTransformContext;
    direction: "sent" | "received" | "fee";
    eventType: EventType;
    currency: string;
    quantity: number;
    idempotencySuffix: string;
    baseIdempotencyKey: string;
    raw: CoinbaseRaw;
    linkedEventId?: string;
  }): CanonicalEvent | null {
    const {
      normalized,
      context,
      direction,
      eventType,
      currency,
      quantity,
      idempotencySuffix,
      baseIdempotencyKey,
      raw,
      linkedEventId,
    } = params;

    // Skip zero quantities
    if (quantity === 0) return null;

    // Get price and total value
    const priceAtTransaction = parseNumeric(raw["Price at Transaction"]);
    const subtotal = parseNumeric(raw.Subtotal);
    const total = parseNumeric(raw.Total);
    const fee = parseNumeric(raw["Fees and/or Spread"]);

    let totalValue: number;
    let price: number | undefined;

    if (direction === "fee") {
      totalValue = fee || 0;
      price = 1; // Fees are typically in USD
    } else {
      // Use subtotal for trade value, or calculate from quantity * price
      totalValue = Math.abs(subtotal || (quantity * (priceAtTransaction || 0)));
      price = priceAtTransaction || (quantity !== 0 ? totalValue / Math.abs(quantity) : undefined);
    }

    // Cost basis for acquisitions
    let costBasis: number | undefined;
    if (this.isAcquisitionType(eventType)) {
      costBasis = direction === "received" ? (total || totalValue) : totalValue;
    }

    const id = this.generateTempId();

    return {
      id,
      userId: context.userId,
      importBatchId: context.batchId,
      eventType,
      timestamp: normalized.timestamp,
      assetId: "", // Will be resolved by pipeline
      assetTicker: currency.toUpperCase(),
      quantity: Math.abs(quantity),
      price,
      totalValue: Math.abs(totalValue),
      currency: "USD",
      costBasis,
      owner: context.owner,
      account: context.account,
      source: this.name,
      sourceId: raw.ID || `${raw.Timestamp}:${raw["Transaction Type"]}`,
      idempotencyKey: `${baseIdempotencyKey}:${idempotencySuffix}`,
      linkedEventId,
      rawData: raw as unknown as Record<string, unknown>,
      metadata: {
        transactionType: raw["Transaction Type"],
        label: normalized.label || null,
        notes: raw.Notes || null,
        priceCurrency: raw["Price Currency"] || null,
      },
    };
  }

  /**
   * Generate idempotency key for a Coinbase record
   */
  getIdempotencyKey(raw: CoinbaseRaw): string {
    // Coinbase ID is unique
    if (raw.ID) {
      return this.createHash(`coinbase:${raw.ID}`);
    }

    // Fall back to composite key using inherited buildIdempotencyKey
    return this.buildIdempotencyKey(
      "coinbase",
      raw.Timestamp,
      raw["Transaction Type"],
      raw.Asset,
      raw["Quantity Transacted"],
      raw.Subtotal
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
let adapterInstance: CoinbaseAdapter | null = null;

export function getCoinbaseAdapter(): CoinbaseAdapter {
  if (!adapterInstance) {
    adapterInstance = new CoinbaseAdapter();
  }
  return adapterInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetCoinbaseAdapter(): void {
  adapterInstance = null;
}
