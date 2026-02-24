/**
 * Koinly Raw Transaction Adapter
 *
 * Parses Koinly raw transaction CSV exports (full history per owner) and
 * converts them to canonical events. Unlike the consolidated tax-year format,
 * the raw format provides a stable 32-char hex Transaction ID per row that
 * never changes between exports, solving the idempotency key instability
 * that caused duplicate events (e.g. TTC ALCX -70 balance).
 *
 * Raw CSV has 33 columns. Key fields:
 *   ID (read-only)          — stable unique hex ID per row
 *   Parent ID (read-only)   — groups multi-leg transactions
 *   Date (UTC)              — YYYY-MM-DD HH:MM:SS
 *   Type                    — trade | transfer | deposit | withdrawal
 *   Tag                     — subtype (21 values: reward, cost, realized_gain, etc.)
 *   From/To Amount/Currency — amount + currency;koinlyId (e.g. ALCX;25585)
 *   Net Value (read-only)   — USD value
 *   Fee Value (read-only)   — USD fee value
 *
 * Each row expands into up to 3 events: sent (From), received (To), fee.
 *
 * Idempotency key: `koinly_raw:{ID}:{leg}` — no hashing, fully deterministic.
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
// Raw Record Type
// ============================================================================

export interface KoinlyRawRecord {
  "ID (read-only)": string;
  "Parent ID (read-only)": string;
  "Date (UTC)": string;
  Type: string;
  Tag: string;
  "From Wallet (read-only)": string;
  "From Wallet ID": string;
  "From Amount": string;
  "From Currency": string;
  "To Wallet (read-only)": string;
  "To Wallet ID": string;
  "To Amount": string;
  "To Currency": string;
  "Fee Amount": string;
  "Fee Currency": string;
  "Net Value (read-only)": string;
  "Fee Value (read-only)": string;
  "Value Currency (read-only)": string;
  Deleted: string;
  TxSrc: string;
  TxDest: string;
  TxHash: string;
  Description: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_TYPES = new Set(["trade", "transfer", "deposit", "withdrawal"]);

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "NZD", "HKD", "SGD",
]);

// Raw CSV header detection string
const HEADER_MARKER = "ID (read-only)";

// ============================================================================
// Type + Tag → EventType Mapping
// ============================================================================

/**
 * Map raw Koinly Type + Tag + direction to canonical EventType.
 *
 * 31 unique (Type, Tag) combinations verified across all 4 raw files
 * (11,462 transactions, 3 owners). See plan for full audit.
 */
function mapRawTypeTagToEventType(
  type: string,
  tag: string,
  direction: "sent" | "received" | "fee"
): EventType {
  if (direction === "fee") return "FEE";

  switch (type) {
    case "trade":
      // All trade tags (empty, liquidity_in, liquidity_out, swap) → same
      return direction === "sent" ? "SELL" : "BUY";

    case "transfer":
      // All transfer tags (empty, to_pool, from_pool, liquidity_in) → same
      // koinlyType='transfer' in metadata triggers cost-neutral calc engine handling
      return direction === "sent" ? "SEND" : "RECEIVE";

    case "deposit":
      // Tag refines EventType for specific income categories
      switch (tag) {
        case "lending_interest":
          return "INTEREST";
        case "reward":
          return "STAKING_REWARD";
        case "other_income":
          return "INCOME";
        case "mining":
          return "MINING_REWARD";
        case "fork":
          return "FORK";
        case "gift":
          return "GIFT_IN";
        case "dividend":
          return "DIVIDEND";
        default:
          // empty, realized_gain, fee_refund, airdrop, loan,
          // liquidity_in, liquidity_out, from_pool, funding_fee, dust
          return "RECEIVE";
      }

    case "withdrawal":
      switch (tag) {
        case "gift":
          return "GIFT_OUT";
        case "lost":
          return "LOST";
        case "expense":
          return "EXPENSE";
        default:
          // empty, realized_gain, cost, funding_fee, margin_fee,
          // futures_fee, loan_repayment, loan_fee, liquidity_in, liquidity_out
          return "SEND";
      }

    default:
      return direction === "sent" ? "SEND" : "RECEIVE";
  }
}

/**
 * Strip Koinly internal ID from currency string.
 * "ALCX;25585" → "ALCX", "USD;10" → "USD"
 */
function stripCurrencyId(currency: string): string {
  if (!currency) return "";
  const semicolonIdx = currency.indexOf(";");
  return semicolonIdx >= 0 ? currency.slice(0, semicolonIdx) : currency;
}

/**
 * Infer buy vs sell/exchange from the From Currency.
 * Used for commission linking on trade rows.
 */
function inferTradeSubtype(
  fromCurrency: string
): "buy" | "sell_or_exchange" {
  const ticker = stripCurrencyId(fromCurrency).toUpperCase();
  return FIAT_CURRENCIES.has(ticker) ? "buy" : "sell_or_exchange";
}

/**
 * Normalize tag for calc engine compatibility.
 * The calc engine checks metadata.tag === 'Realized gain' (Title Case, from
 * the consolidated format). Raw format uses snake_case 'realized_gain'.
 */
function normalizeTagForCalcEngine(rawTag: string): string {
  if (rawTag === "realized_gain") return "Realized gain";
  return rawTag;
}

// ============================================================================
// Adapter Implementation
// ============================================================================

export class KoinlyRawAdapter extends BaseAdapter<KoinlyRawRecord> {
  readonly name: EventSource = "koinly_raw";
  readonly version = "1.0.0";

  // ==========================================================================
  // parse()
  // ==========================================================================

  parse(csv: string): ParseResult<KoinlyRawRecord> {
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const records: KoinlyRawRecord[] = [];

    // Handle multi-line quoted fields (Description often spans lines)
    const logicalLines = this.parseCSVLines(csv);

    // Find header row
    const headerIndex = logicalLines.findIndex((line) =>
      line.includes(HEADER_MARKER)
    );

    if (headerIndex === -1) {
      return this.createFailedParseResult(
        "Invalid Koinly raw CSV: could not find header row with 'ID (read-only)'",
        "INVALID_HEADER"
      );
    }

    const headers = this.parseCSVLine(logicalLines[headerIndex]);

    // Build header → index map (case-sensitive for raw format)
    const headerMap = new Map<string, number>();
    headers.forEach((h, i) => headerMap.set(h, i));

    // Verify key columns exist
    const requiredCols = ["ID (read-only)", "Date (UTC)", "Type"];
    for (const col of requiredCols) {
      if (!headerMap.has(col)) {
        return this.createFailedParseResult(
          `Missing required column: ${col}`,
          "MISSING_HEADER"
        );
      }
    }

    // Parse data rows
    for (let i = headerIndex + 1; i < logicalLines.length; i++) {
      const line = logicalLines[i];
      if (!line.trim()) continue;

      const lineNumber = i + 1;

      try {
        const values = this.parseCSVLine(line);
        const record = this.createRawRecord(headers, values, headerMap);

        // Skip deleted rows
        if (record.Deleted?.toLowerCase() === "true") {
          warnings.push(`Line ${lineNumber}: Skipped deleted row`);
          continue;
        }

        // Skip rows marked "ignore" in description (manual bookkeeping entries)
        if (record.Description?.toLowerCase().includes("ignore")) {
          warnings.push(`Line ${lineNumber}: Skipped row with 'ignore' in description`);
          continue;
        }

        // Skip invalid types
        const type = record.Type?.toLowerCase();
        if (!type || !VALID_TYPES.has(type)) {
          warnings.push(
            `Line ${lineNumber}: Skipped row with invalid type '${record.Type}'`
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

  private createRawRecord(
    headers: string[],
    values: string[],
    headerMap: Map<string, number>
  ): KoinlyRawRecord {
    const get = (header: string): string => {
      const idx = headerMap.get(header);
      return idx !== undefined ? (values[idx] || "") : "";
    };

    return {
      "ID (read-only)": get("ID (read-only)"),
      "Parent ID (read-only)": get("Parent ID (read-only)"),
      "Date (UTC)": get("Date (UTC)"),
      Type: get("Type"),
      Tag: get("Tag"),
      "From Wallet (read-only)": get("From Wallet (read-only)"),
      "From Wallet ID": get("From Wallet ID"),
      "From Amount": get("From Amount"),
      "From Currency": get("From Currency"),
      "To Wallet (read-only)": get("To Wallet (read-only)"),
      "To Wallet ID": get("To Wallet ID"),
      "To Amount": get("To Amount"),
      "To Currency": get("To Currency"),
      "Fee Amount": get("Fee Amount"),
      "Fee Currency": get("Fee Currency"),
      "Net Value (read-only)": get("Net Value (read-only)"),
      "Fee Value (read-only)": get("Fee Value (read-only)"),
      "Value Currency (read-only)": get("Value Currency (read-only)"),
      Deleted: get("Deleted"),
      TxSrc: get("TxSrc"),
      TxDest: get("TxDest"),
      TxHash: get("TxHash"),
      Description: get("Description"),
    };
  }

  // ==========================================================================
  // normalize()
  // ==========================================================================

  normalize(raw: KoinlyRawRecord): NormalizedRecord {
    const timestamp = new Date(raw["Date (UTC)"] + " UTC");

    const fromAmount = this.parseNumeric(raw["From Amount"]);
    const toAmount = this.parseNumeric(raw["To Amount"]);
    const feeAmount = this.parseNumeric(raw["Fee Amount"]);
    const netValueUSD = this.parseNumeric(raw["Net Value (read-only)"]);

    return {
      timestamp,
      type: raw.Type.toLowerCase(),
      label: raw.Tag || undefined,
      txHash: raw.TxHash || undefined,
      sent: fromAmount
        ? {
            amount: fromAmount,
            currency: stripCurrencyId(raw["From Currency"]),
          }
        : undefined,
      received: toAmount
        ? {
            amount: toAmount,
            currency: stripCurrencyId(raw["To Currency"]),
          }
        : undefined,
      fee: feeAmount
        ? {
            amount: feeAmount,
            currency: stripCurrencyId(raw["Fee Currency"]),
          }
        : undefined,
      totalValue: netValueUSD || undefined,
      netWorth: netValueUSD || undefined,
      account:
        raw["From Wallet (read-only)"] ||
        raw["To Wallet (read-only)"] ||
        undefined,
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  // ==========================================================================
  // expand()
  // ==========================================================================

  expand(
    normalized: NormalizedRecord,
    context: AdapterTransformContext
  ): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    const raw = normalized.raw as unknown as KoinlyRawRecord;
    const type = (normalized.type || "").toLowerCase();
    const tag = (normalized.label || "").toLowerCase();
    const koinlyId = raw["ID (read-only)"];

    // Infer trade subtype for commission linking
    const inferredSubtype =
      type === "trade" ? inferTradeSubtype(raw["From Currency"]) : null;

    // --- Sent event (From side) ---
    if (normalized.sent?.amount && normalized.sent?.currency) {
      const eventType = mapRawTypeTagToEventType(type, tag, "sent");
      const sentEvent = this.createEvent({
        normalized,
        context,
        direction: "sent",
        eventType,
        currency: normalized.sent.currency,
        quantity: normalized.sent.amount,
        idempotencyKey: `koinly_raw:${koinlyId}:sent`,
        raw,
        type,
        tag,
        inferredSubtype,
      });
      if (sentEvent) events.push(sentEvent);
    }

    // --- Received event (To side) ---
    if (normalized.received?.amount && normalized.received?.currency) {
      const eventType = mapRawTypeTagToEventType(type, tag, "received");
      const receivedEvent = this.createEvent({
        normalized,
        context,
        direction: "received",
        eventType,
        currency: normalized.received.currency,
        quantity: normalized.received.amount,
        idempotencyKey: `koinly_raw:${koinlyId}:received`,
        raw,
        type,
        tag,
        inferredSubtype,
      });
      if (receivedEvent) events.push(receivedEvent);
    }

    // --- Fee event ---
    if (normalized.fee?.amount && normalized.fee?.currency) {
      const feeEvent = this.createEvent({
        normalized,
        context,
        direction: "fee",
        eventType: "FEE",
        currency: normalized.fee.currency,
        quantity: normalized.fee.amount,
        idempotencyKey: `koinly_raw:${koinlyId}:fee`,
        raw,
        type,
        tag,
        inferredSubtype,
        linkedEventId: events[0]?.id,
      });
      if (feeEvent) events.push(feeEvent);
    }

    // --- Commission linking (trade type only) ---
    // Matches existing adapter logic at koinly-adapter.ts:463-490
    const feeValueUSD = this.parseNumeric(raw["Fee Value (read-only)"]);
    if (type === "trade" && feeValueUSD && feeValueUSD > 0 && events.length > 0) {
      let targetEvent: CanonicalEvent | undefined;
      if (inferredSubtype === "buy") {
        // Fee adds to acquisition cost → attach to BUY/RECEIVE event
        targetEvent = events.find(
          (e) => e.eventType === "BUY" || e.eventType === "RECEIVE"
        );
      } else {
        // Fee reduces disposal proceeds → attach to SELL/SEND event
        targetEvent = events.find(
          (e) => e.eventType === "SELL" || e.eventType === "SEND"
        );
      }
      if (targetEvent?.metadata) {
        (targetEvent.metadata as Record<string, unknown>).commission =
          feeValueUSD;
      }
    }

    return events;
  }

  // ==========================================================================
  // createEvent()
  // ==========================================================================

  private createEvent(params: {
    normalized: NormalizedRecord;
    context: AdapterTransformContext;
    direction: "sent" | "received" | "fee";
    eventType: EventType;
    currency: string;
    quantity: number;
    idempotencyKey: string;
    raw: KoinlyRawRecord;
    type: string;
    tag: string;
    inferredSubtype: string | null;
    linkedEventId?: string;
  }): CanonicalEvent | null {
    const {
      normalized,
      context,
      direction,
      eventType,
      currency,
      quantity,
      idempotencyKey,
      raw,
      type,
      tag,
      inferredSubtype,
      linkedEventId,
    } = params;

    // Skip zero quantities
    if (quantity === 0) return null;

    // Calculate value
    const netValueUSD = this.parseNumeric(raw["Net Value (read-only)"]);
    const feeValueUSD = this.parseNumeric(raw["Fee Value (read-only)"]);

    let totalValue: number;
    let price: number | undefined;

    if (direction === "fee") {
      totalValue = feeValueUSD || 0;
    } else {
      totalValue = netValueUSD || 0;
    }

    const absQuantity = Math.abs(quantity);
    const absTotalValue = Math.abs(totalValue);
    price =
      absQuantity !== 0 ? absTotalValue / absQuantity : undefined;

    // Cost basis for acquisitions (calc engine recomputes via FIFO/average)
    let costBasis: number | undefined;
    if (this.isAcquisitionType(eventType)) {
      costBasis = absTotalValue;
    }

    const id = this.generateTempId();
    const koinlyId = raw["ID (read-only)"];
    const normalizedTag = tag ? normalizeTagForCalcEngine(tag) : null;

    return {
      id,
      userId: context.userId,
      importBatchId: context.batchId,
      eventType,
      timestamp: normalized.timestamp,
      assetId: "", // Resolved by import pipeline
      assetTicker: currency.toUpperCase(),
      quantity: absQuantity,
      price,
      totalValue: absTotalValue,
      currency: "USD",
      costBasis,
      owner: context.owner,
      account: context.account,
      source: this.name,
      sourceId: koinlyId,
      idempotencyKey,
      linkedEventId,
      rawData: raw as unknown as Record<string, unknown>,
      metadata: {
        koinlyId,
        koinlyParentId: raw["Parent ID (read-only)"] || null,
        koinlyType: type, // CRITICAL: 'transfer' triggers cost-neutral in calc engine
        inferredSubtype: inferredSubtype || null,
        tag: normalizedTag, // CRITICAL: 'Realized gain' triggers special PnL handling
        rawTag: raw.Tag || null,
        txHash: raw.TxHash || null,
        fromWallet: raw["From Wallet (read-only)"] || null,
        toWallet: raw["To Wallet (read-only)"] || null,
        description: raw.Description || null,
      },
    };
  }

  // ==========================================================================
  // getIdempotencyKey()
  // ==========================================================================

  /**
   * Generate idempotency key for a raw record.
   * Uses the stable Koinly Transaction ID — no hashing needed.
   * The leg suffix is appended during expand().
   */
  getIdempotencyKey(raw: KoinlyRawRecord): string {
    return `koinly_raw:${raw["ID (read-only)"]}`;
  }

  // ==========================================================================
  // validate()
  // ==========================================================================

  validate(event: CanonicalEvent): AdapterValidationResult {
    return this.createBaseValidationResult(event);
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let adapterInstance: KoinlyRawAdapter | null = null;

export function getKoinlyRawAdapter(): KoinlyRawAdapter {
  if (!adapterInstance) {
    adapterInstance = new KoinlyRawAdapter();
  }
  return adapterInstance;
}

export function resetKoinlyRawAdapter(): void {
  adapterInstance = null;
}
