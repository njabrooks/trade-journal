/**
 * Koinly Source Adapter (Class-based)
 *
 * Parses Koinly CSV exports and converts them to canonical events.
 *
 * Koinly transaction types:
 * - buy: Acquire crypto with fiat/stablecoin
 * - sell: Dispose crypto for fiat/stablecoin
 * - exchange: Swap one crypto for another
 * - transfer: Move between wallets
 * - deposit: Receive from external source
 * - withdrawal: Send to external destination
 * - staking: Staking rewards
 * - mining: Mining rewards
 * - airdrop: Airdrop receipt
 * - fork: Fork/split receipt
 * - gift: Gift in/out
 * - lost: Lost/stolen
 *
 * Each Koinly record can expand into up to 3 events:
 * - Sent event (SELL, SEND, or disposal)
 * - Received event (BUY, RECEIVE, or acquisition)
 * - Fee event (FEE)
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
// Koinly Raw Record Type
// ============================================================================

/**
 * Raw record from Koinly CSV export
 */
export interface KoinlyRaw {
  Date: string;
  Type: string;
  Tag: string;
  "Sending Wallet": string;
  "Sent Amount": string;
  "Sent Currency": string;
  "Sent Cost Basis": string;
  "Receiving Wallet": string;
  "Received Amount": string;
  "Received Currency": string;
  "Received Cost Basis": string;
  "Fee Amount": string;
  "Fee Currency": string;
  "Gain (USD)": string;
  "Net Value (USD)": string;
  "Fee Value (USD)": string;
  TxSrc: string;
  TxDest: string;
  TxHash: string;
  Description: string;
}

// Expected headers in Koinly CSV (lowercase for matching)
const KOINLY_HEADERS = [
  "date",
  "type",
  "tag",
  "sending wallet",
  "sent amount",
  "sent currency",
  "sent cost basis",
  "receiving wallet",
  "received amount",
  "received currency",
  "received cost basis",
  "fee amount",
  "fee currency",
  "gain (usd)",
  "net value (usd)",
  "fee value (usd)",
  "txsrc",
  "txdest",
  "txhash",
  "description",
] as const;

// Required headers for valid Koinly CSV
const REQUIRED_HEADERS = ["date", "type"];

// ============================================================================
// Koinly Type Mappings
// ============================================================================

/**
 * Map Koinly type + direction to canonical event type
 */
function mapKoinlyToEventType(
  koinlyType: string,
  direction: "sent" | "received" | "fee"
): EventType {
  const type = koinlyType.toLowerCase();

  // Fee is always FEE
  if (direction === "fee") {
    return "FEE";
  }

  // Map by Koinly type
  switch (type) {
    case "buy":
      return direction === "sent" ? "SELL" : "BUY"; // Sent fiat = SELL fiat, Received crypto = BUY
    case "sell":
      return direction === "sent" ? "SELL" : "BUY"; // Sent crypto = SELL, Received fiat = BUY fiat
    case "exchange":
      return direction === "sent" ? "SELL" : "BUY";
    case "transfer":
      return direction === "sent" ? "SEND" : "RECEIVE";
    case "deposit":
      return "RECEIVE";
    case "withdrawal":
      return "SEND";
    case "staking":
    case "staking_reward":
      return "STAKING_REWARD";
    case "mining":
    case "mining_reward":
      return "MINING_REWARD";
    case "airdrop":
      return "RECEIVE";
    case "fork":
      return "FORK";
    case "gift":
      return direction === "sent" ? "GIFT_OUT" : "GIFT_IN";
    case "lost":
    case "stolen":
      return "LOST";
    case "income":
      return "INCOME";
    case "expense":
      return "EXPENSE";
    case "dividend":
      return "DIVIDEND";
    case "interest":
      return "INTEREST";
    default:
      // Default based on direction
      return direction === "sent" ? "SEND" : "RECEIVE";
  }
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

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Combine lines that are part of quoted fields spanning multiple lines
 */
function combineQuotedLines(lines: string[], startIndex: number): string[] {
  const combined: string[] = [];
  let currentLine = "";

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
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
 * Parse numeric value from string, returning null if invalid
 */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const num = parseFloat(value.replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

// ============================================================================
// Koinly Adapter Implementation
// ============================================================================

export class KoinlyAdapter extends BaseAdapter<KoinlyRaw> {
  readonly name: EventSource = "koinly";
  readonly version = "3.1.0"; // Fix #17: commission linking on parent events

  /**
   * Parse Koinly CSV content into raw records
   */
  parse(csv: string): ParseResult<KoinlyRaw> {
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const records: KoinlyRaw[] = [];

    const lines = csv.trim().split("\n");

    // Find header row (contains 'date,type,tag')
    const headerIndex = lines.findIndex((line) =>
      line.toLowerCase().includes("date,type,tag")
    );

    if (headerIndex === -1) {
      return {
        success: false,
        records: [],
        headers: [],
        errors: [
          {
            message: "Invalid Koinly CSV: could not find header row",
            code: "INVALID_HEADER",
          },
        ],
        warnings: [],
      };
    }

    // Parse headers
    const headers = lines[headerIndex]
      .toLowerCase()
      .split(",")
      .map((h) => h.trim());

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
    const dataLines = combineQuotedLines(lines, headerIndex + 1);

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const lineNumber = headerIndex + 2 + i;

      try {
        const values = parseCSVLine(line);
        const record = this.createRecord(headers, values, headerMap);

        // Skip rows without valid type
        if (!record.Type || record.Type === "Unknown") {
          warnings.push(
            `Line ${lineNumber}: Skipped row with invalid type`
          );
          continue;
        }

        records.push(record);
      } catch (error) {
        errors.push({
          message:
            error instanceof Error ? error.message : "Unknown parse error",
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
   * Create a KoinlyRaw record from parsed values
   */
  private createRecord(
    headers: string[],
    values: string[],
    headerMap: Map<string, number>
  ): KoinlyRaw {
    const get = (header: string): string => {
      const idx = headerMap.get(header);
      return idx !== undefined ? values[idx] || "" : "";
    };

    return {
      Date: get("date"),
      Type: get("type") || "Unknown",
      Tag: get("tag"),
      "Sending Wallet": get("sending wallet"),
      "Sent Amount": get("sent amount"),
      "Sent Currency": get("sent currency"),
      "Sent Cost Basis": get("sent cost basis"),
      "Receiving Wallet": get("receiving wallet"),
      "Received Amount": get("received amount"),
      "Received Currency": get("received currency"),
      "Received Cost Basis": get("received cost basis"),
      "Fee Amount": get("fee amount"),
      "Fee Currency": get("fee currency"),
      "Gain (USD)": get("gain (usd)"),
      "Net Value (USD)": get("net value (usd)"),
      "Fee Value (USD)": get("fee value (usd)"),
      TxSrc: get("txsrc"),
      TxDest: get("txdest"),
      TxHash: get("txhash"),
      Description: get("description"),
    };
  }

  /**
   * Normalize a Koinly raw record to intermediate format
   */
  normalize(raw: KoinlyRaw): NormalizedRecord {
    const timestamp = new Date(raw.Date);
    const sentAmount = parseNumeric(raw["Sent Amount"]);
    const receivedAmount = parseNumeric(raw["Received Amount"]);
    const feeAmount = parseNumeric(raw["Fee Amount"]);
    const netValueUSD = parseNumeric(raw["Net Value (USD)"]);
    const feeValueUSD = parseNumeric(raw["Fee Value (USD)"]);

    return {
      timestamp,
      type: raw.Type.toLowerCase(),
      label: raw.Tag || undefined,
      txHash: raw.TxHash || undefined,
      sent: sentAmount
        ? { amount: sentAmount, currency: raw["Sent Currency"] || null }
        : undefined,
      received: receivedAmount
        ? { amount: receivedAmount, currency: raw["Received Currency"] || null }
        : undefined,
      fee: feeAmount
        ? { amount: feeAmount, currency: raw["Fee Currency"] || null }
        : undefined,
      totalValue: netValueUSD || undefined,
      netWorth: netValueUSD || undefined,
      account: raw["Sending Wallet"] || raw["Receiving Wallet"] || undefined,
      costBasis:
        parseNumeric(raw["Sent Cost Basis"]) ||
        parseNumeric(raw["Received Cost Basis"]) ||
        undefined,
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  /**
   * Expand a normalized Koinly record into canonical events
   */
  expand(
    normalized: NormalizedRecord,
    context: AdapterTransformContext
  ): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    const raw = normalized.raw as unknown as KoinlyRaw;
    const baseIdempotencyKey = this.getIdempotencyKey(raw);

    // Generate sent event
    if (normalized.sent?.amount && normalized.sent?.currency) {
      const eventType = mapKoinlyToEventType(normalized.type || "", "sent");
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
      const eventType = mapKoinlyToEventType(normalized.type || "", "received");
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
        // Link fee to the first event
        linkedEventId: events[0]?.id,
      });
      if (feeEvent) events.push(feeEvent);
    }

    // Fix #17: Set commission on parent event for calculation engine.
    // V1 only embeds fee into cost/proceeds for buy/sell/exchange types.
    // FEE event adjusts unit position quantity; commission adjusts dollar cost/proceeds.
    const feeValueUSD = parseNumeric(raw["Fee Value (USD)"]);
    if (feeValueUSD && feeValueUSD > 0 && events.length > 0) {
      const koinlyType = (normalized.type || "").toLowerCase();
      let targetEvent: CanonicalEvent | undefined;
      switch (koinlyType) {
        case "buy":
          // Fee adds to acquisition cost
          targetEvent = events.find(
            (e) => e.eventType === "BUY" || e.eventType === "RECEIVE"
          );
          break;
        case "sell":
        case "exchange":
          // Fee reduces disposal proceeds
          targetEvent = events.find(
            (e) => e.eventType === "SELL" || e.eventType === "SEND"
          );
          break;
        // transfer/deposit/withdrawal: V1 does NOT embed fee in parent
      }
      if (targetEvent?.metadata) {
        (targetEvent.metadata as Record<string, unknown>).commission =
          feeValueUSD;
      }
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
    raw: KoinlyRaw;
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

    // Calculate value
    const netValueUSD = parseNumeric(raw["Net Value (USD)"]);
    const feeValueUSD = parseNumeric(raw["Fee Value (USD)"]);

    let totalValue: number;
    let price: number | undefined;

    if (direction === "fee") {
      totalValue = feeValueUSD || 0;
      price = quantity !== 0 ? Math.abs(totalValue) / Math.abs(quantity) : undefined;
    } else {
      totalValue = netValueUSD || 0;
      price = quantity !== 0 ? Math.abs(totalValue) / Math.abs(quantity) : undefined;
    }

    // Cost basis for acquisitions
    let costBasis: number | undefined;
    if (this.isAcquisitionType(eventType)) {
      if (direction === "received") {
        costBasis = parseNumeric(raw["Received Cost Basis"]) || totalValue;
      } else {
        costBasis = parseNumeric(raw["Sent Cost Basis"]) || totalValue;
      }
    }

    const id = this.generateTempId();

    return {
      id,
      userId: context.userId,
      importBatchId: context.batchId,
      eventType,
      timestamp: normalized.timestamp,
      assetId: "", // Resolved by pipeline
      assetTicker: currency.toUpperCase(),
      quantity: Math.abs(quantity),
      price,
      totalValue: Math.abs(totalValue),
      currency: "USD",
      costBasis,
      owner: context.owner,
      account: context.account,
      source: this.name,
      sourceId: raw.TxHash || `${raw.Date}:${raw.Type}`,
      idempotencyKey: `${baseIdempotencyKey}:${idempotencySuffix}`,
      linkedEventId,
      rawData: raw as unknown as Record<string, unknown>,
      metadata: {
        koinlyType: raw.Type,
        tag: raw.Tag || null,
        txHash: raw.TxHash || null,
        sendingWallet: raw["Sending Wallet"] || null,
        receivingWallet: raw["Receiving Wallet"] || null,
        description: raw.Description || null,
      },
    };
  }

  /**
   * Generate idempotency key for a Koinly record
   *
   * Fix #12: Include Type and currencies alongside TxHash to prevent collisions.
   * Koinly decomposes single Solana DeFi operations (LP deposits, reward harvests)
   * into multiple CSV rows sharing the same TxHash. Without differentiating by
   * Type/currency, events from different rows collide on the `:sent`/`:received`
   * suffix, causing silent data loss (e.g., missing transfer RECEIVE events for
   * RAY-SOL, RAY-USDT, RAY LP tokens -- root cause of $22K structural gap).
   *
   * Fix #15: Include Tag AND amounts to prevent collisions between rows sharing
   * TxHash + Type + currencies. Two common collision patterns:
   * (a) Same TxHash/Type/currencies, different Tags (e.g., "Cost" vs "Loan repayment")
   * (b) Same TxHash/Type/Tag/currencies, different amounts (e.g., fee vs principal)
   * Duplicate CSV rows (re-imports) still dedup correctly since all fields match.
   *
   * Fix #16: Include Date to prevent collisions between multi-hop transfer legs.
   * Koinly records two-hop transfer chains (e.g., Deribit->wallet->FTX) as separate
   * CSV rows sharing the same TxHash, Type, Tag, amounts, AND currencies -- only
   * the timestamp and wallet fields differ. Without Date, the second leg is dropped.
   */
  getIdempotencyKey(raw: KoinlyRaw): string {
    if (raw.TxHash) {
      return this.createHash(
        `koinly:${raw.TxHash}:${raw.Date || ""}:${raw.Type || ""}:${raw.Tag || ""}:${raw["Sent Amount"] || ""}:${raw["Sent Currency"] || ""}:${raw["Received Amount"] || ""}:${raw["Received Currency"] || ""}`
      );
    }

    // Fall back to composite key using inherited buildIdempotencyKey
    return this.buildIdempotencyKey(
      "koinly",
      raw.Date,
      raw.Type,
      raw.Tag,
      raw["Sent Amount"],
      raw["Sent Currency"],
      raw["Received Amount"],
      raw["Received Currency"]
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
let adapterInstance: KoinlyAdapter | null = null;

export function getKoinlyAdapter(): KoinlyAdapter {
  if (!adapterInstance) {
    adapterInstance = new KoinlyAdapter();
  }
  return adapterInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetKoinlyAdapter(): void {
  adapterInstance = null;
}
