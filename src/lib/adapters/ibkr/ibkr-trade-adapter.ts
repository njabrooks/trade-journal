/**
 * IBKR Trade Adapter (Class-based)
 *
 * Transforms IBKR trade confirmations into canonical events.
 * Each trade may produce up to 3 events:
 * 1. Main trade event (BUY/SELL)
 * 2. Cash movement event (RECEIVE/SEND for proceeds/payment)
 * 3. Fee event (if commission + taxes > 0)
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/ibkr-trade-adapter.ts
 */

import type { EventSource, EventType } from "@/types/event-sourcing";
import {
  BaseAdapter,
  type AdapterTransformContext,
} from "../base-adapter";
import type {
  ParseResult,
  ParseError,
  NormalizedRecord,
  AdapterValidationResult,
} from "@/types/event-sourcing";
import type { CanonicalEvent } from "../types";
import {
  mapOwnerFromAccountId,
  getAccountName,
  mapIbkrAssetClass,
  parseIbkrDateTime,
  toDate,
  normalizeIbkrSymbol,
} from "./utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Raw IBKR trade CSV record (column headers as keys)
 */
export interface IbkrTradeRaw {
  ClientAccountID?: string;
  CurrencyPrimary?: string;
  FXRateToBase?: string;
  AssetClass?: string;
  SubCategory?: string;
  Symbol?: string;
  Description?: string;
  Conid?: string;
  UnderlyingSymbol?: string;
  Multiplier?: string;
  Strike?: string;
  Expiry?: string;
  DateTime?: string;
  "Put/Call"?: string;
  TradeDate?: string;
  Quantity?: string;
  TradePrice?: string;
  TradeMoney?: string;
  Proceeds?: string;
  Taxes?: string;
  IBCommission?: string;
  IBCommissionCurrency?: string;
  NetCash?: string;
  NetCashInBase?: string;
  "Open/CloseIndicator"?: string;
  "Notes/Codes"?: string;
  CostBasis?: string;
  FifoPnlRealized?: string;
  CapitalGainsPnl?: string;
  FxPnl?: string;
  MtmPnl?: string;
  "Buy/Sell"?: string;
  IBOrderID?: string;
}

/**
 * Header mapping from CSV columns to record keys
 */
const HEADER_MAPPING: Record<string, keyof IbkrTradeRaw> = {
  ClientAccountID: "ClientAccountID",
  CurrencyPrimary: "CurrencyPrimary",
  FXRateToBase: "FXRateToBase",
  AssetClass: "AssetClass",
  SubCategory: "SubCategory",
  Symbol: "Symbol",
  Description: "Description",
  Conid: "Conid",
  UnderlyingSymbol: "UnderlyingSymbol",
  Multiplier: "Multiplier",
  Strike: "Strike",
  Expiry: "Expiry",
  DateTime: "DateTime",
  "Put/Call": "Put/Call",
  TradeDate: "TradeDate",
  Quantity: "Quantity",
  TradePrice: "TradePrice",
  TradeMoney: "TradeMoney",
  Proceeds: "Proceeds",
  Taxes: "Taxes",
  IBCommission: "IBCommission",
  IBCommissionCurrency: "IBCommissionCurrency",
  NetCash: "NetCash",
  NetCashInBase: "NetCashInBase",
  "Open/CloseIndicator": "Open/CloseIndicator",
  "Notes/Codes": "Notes/Codes",
  CostBasis: "CostBasis",
  FifoPnlRealized: "FifoPnlRealized",
  CapitalGainsPnl: "CapitalGainsPnl",
  FxPnl: "FxPnl",
  MtmPnl: "MtmPnl",
  "Buy/Sell": "Buy/Sell",
  IBOrderID: "IBOrderID",
};

// ============================================================================
// IBKR Trade Adapter Class
// ============================================================================

export class IbkrTradeAdapter extends BaseAdapter<IbkrTradeRaw> {
  readonly name: EventSource = "ibkr_trade";
  readonly version = "3.8.0"; // Fix #20: non-USD futures cash settlement currency mismatch

  // ============================================================================
  // Parse
  // ============================================================================

  parse(csv: string): ParseResult<IbkrTradeRaw> {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    try {
      const lines = csv.trim().split("\n");
      if (lines.length < 2) {
        return this.createFailedParseResult(
          "CSV file is empty or has no data rows"
        );
      }

      // Parse headers
      const headerLine = lines[0];
      const headers = this.parseCSVLine(headerLine);

      // Map headers to our expected format
      const headerIndices = new Map<keyof IbkrTradeRaw, number>();
      headers.forEach((header, index) => {
        const mapped = HEADER_MAPPING[header.trim()];
        if (mapped) {
          headerIndices.set(mapped, index);
        }
      });

      // Parse data rows
      const records: IbkrTradeRaw[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = this.parseCSVLine(line);
          const record: IbkrTradeRaw = {};

          headerIndices.forEach((colIndex, field) => {
            const value = values[colIndex]?.trim();
            if (value && value !== "") {
              (record as Record<string, string>)[field] = value;
            }
          });

          // Only include records with a conid (skip summary rows)
          if (record.Conid) {
            records.push(record);
          }
        } catch (err) {
          errors.push(
            this.createParseError(
              `Error parsing row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`,
              i + 1
            )
          );
        }
      }

      return {
        success: errors.length === 0,
        records,
        headers,
        errors,
        warnings,
      };
    } catch (err) {
      return this.createFailedParseResult(
        `Parse error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  // ============================================================================
  // Normalize
  // ============================================================================

  normalize(raw: IbkrTradeRaw): NormalizedRecord {
    const quantity = this.parseNumeric(raw.Quantity) ?? 0;
    const isBuy = raw["Buy/Sell"] === "BUY" || quantity > 0;
    const fxRate = this.parseNumeric(raw.FXRateToBase) ?? 1;

    // Parse datetime, falling back to trade date
    const dateTime = parseIbkrDateTime(raw.DateTime);
    const tradeDate = toDate(raw.TradeDate);
    const timestamp = dateTime ?? tradeDate ?? new Date();

    return {
      timestamp,
      symbol: raw.Symbol ?? undefined,
      conid: raw.Conid ?? undefined,
      description: raw.Description ?? undefined,
      assetClass: mapIbkrAssetClass(raw.AssetClass),
      quantity: Math.abs(quantity),
      price: this.convertToBase(this.parseNumericOrZero(raw.TradePrice), fxRate),
      totalValue: Math.abs(
        this.convertToBase(this.parseNumericOrZero(raw.TradeMoney), fxRate)
      ),
      commission: Math.abs(
        this.convertToBase(
          this.parseNumericOrZero(raw.IBCommission) +
            this.parseNumericOrZero(raw.Taxes),
          raw.IBCommissionCurrency === "USD" ? 1 : fxRate
        )
      ),
      netCash: this.convertToBase(
        this.parseNumericOrZero(raw.NetCash),
        fxRate
      ),
      costBasis: this.parseNumeric(raw.CostBasis) ?? undefined,
      realizedPnl: this.parseNumeric(raw.FifoPnlRealized) ?? undefined,
      isBuy,
      currency: raw.CurrencyPrimary ?? "USD",
      account: raw.ClientAccountID ?? undefined,
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  // ============================================================================
  // Expand (SYNCHRONOUS)
  // ============================================================================

  /**
   * Expand normalized record to canonical events.
   * Creates 1-3 events: trade, cash movement, and optionally fee.
   *
   * NOTE: This is SYNCHRONOUS. Asset IDs are left empty and
   * will be resolved by the asset resolution pipeline.
   */
  expand(
    normalized: NormalizedRecord,
    context: AdapterTransformContext
  ): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    const raw = normalized.raw as IbkrTradeRaw;

    // Skip CASH asset class (forex cash movements handled separately)
    if (raw.AssetClass === "CASH") {
      return events;
    }

    // Determine owner and account
    const owner =
      context.owner || mapOwnerFromAccountId(raw.ClientAccountID);
    const account = context.account || getAccountName(owner);

    // Base properties for all events from this trade
    const baseProps = {
      userId: context.userId,
      owner,
      account,
      source: this.name,
      importBatchId: context.batchId,
      rawData: normalized.raw,
    };

    // Generate base idempotency key
    const baseKey = this.getIdempotencyKey(raw);

    // Normalize symbol for display
    const ticker =
      normalizeIbkrSymbol(normalized.symbol) ?? normalized.symbol ?? "";

    // 1. Main trade event (BUY or SELL)
    const tradeEventId = this.generateTempId();
    const tradeEvent: CanonicalEvent = {
      ...baseProps,
      id: tradeEventId,
      eventType: normalized.isBuy ? "BUY" : "SELL",
      timestamp: normalized.timestamp,
      settlementDate: toDate(raw.TradeDate) ?? undefined,
      assetId: "", // Resolved by pipeline
      assetTicker: ticker,
      quantity: normalized.quantity ?? 0,
      price: normalized.price ?? undefined,
      totalValue: normalized.totalValue ?? 0,
      currency: "USD",
      costBasis: normalized.isBuy
        ? (normalized.totalValue ?? 0) + (normalized.commission ?? 0)
        : undefined,
      sourceId: raw.IBOrderID ?? raw.Conid ?? "",
      idempotencyKey: `${baseKey}:trade`,
      metadata: {
        conid: normalized.conid,
        ibkrAssetClass: raw.AssetClass,
        realizedPnl: normalized.realizedPnl,
        fxRateToBase: this.parseNumeric(raw.FXRateToBase),
        originalCurrency: normalized.currency,
        // Fix #18: Set commission for avg-cost engine (reads meta.commission ?? 0)
        commission: normalized.commission ?? undefined,
      },
    };
    events.push(tradeEvent);

    // 2. Cash movement event (proceeds for sells, payment for buys)
    const fxRate = this.parseNumeric(raw.FXRateToBase) ?? 1;
    const isFutures = raw.AssetClass === "FUT";
    const cashCurrency = raw.CurrencyPrimary ?? "USD";

    // V1 COMPATIBILITY ANALYSIS (from actual V1 data):
    // - V1 stores RAW currency values (e.g., -45400 HKD), NOT USD-converted
    // - price = fxRate (e.g., 0.12777)
    // - grossValue = raw * fxRate (USD value)
    //
    // For futures (FUT):
    // - V1 uses futCashSettlementUsd = (NetCash * FXRate) - feeValue
    //   where feeValue = taxes + ibCommission (negative!) -> subtraction of negative = addition
    //   Effectively: NetCash * FXRate + |commission| = Proceeds * FXRate
    // - Currency is typically USD, so raw ~ converted

    // Pre-compute fee amount to handle commission rebates.
    // IBKR occasionally gives positive commission (rebates) on options trades.
    // A FEE event always reduces the balance, so a positive commission treated as
    // FEE would incorrectly deduct the rebate instead of crediting it.
    // When commission is a rebate (positive), we fold it into the cash event amount.
    const feeCurrency = raw.IBCommissionCurrency ?? "USD";
    const rawFeeAmount =
      (this.parseNumeric(raw.IBCommission) ?? 0) +
      (this.parseNumeric(raw.Taxes) ?? 0);
    let feeHandledAsCashAdjustment = false;

    let rawCashAmount: number;      // Raw value in original currency
    let convertedCashAmount: number; // USD value

    if (isFutures) {
      // Fix #20: Futures cash settlement -- compute in ORIGINAL currency, not USD.
      // IBKR's NetCash is in CurrencyPrimary (e.g., CNH, EUR, or USD).
      // NetCash = Proceeds + IBCommission (commission already deducted).
      // We add commission back (in the same currency) to get the pre-commission
      // settlement, because the FEE event handles commission separately.
      //
      // Previous bug: multiplied NetCash by fxRate (converting to USD) but stored
      // with assetTicker=CurrencyPrimary, causing quantity/currency mismatch
      // for non-USD futures (CNH, EUR).
      const commissionInCashCurrency =
        feeCurrency === cashCurrency
          ? Math.abs(rawFeeAmount)
          : Math.abs(rawFeeAmount) / fxRate; // Convert USD fee to cashCurrency
      rawCashAmount =
        this.parseNumericOrZero(raw.NetCash) + commissionInCashCurrency;
      convertedCashAmount = rawCashAmount * fxRate;
    } else {
      // Regular trades: use RAW proceeds (in original currency)
      rawCashAmount = this.parseNumericOrZero(raw.Proceeds);

      // Commission rebate handling: when net fee is positive (rebate/credit),
      // fold into the cash amount so the RECEIVE/SEND event reflects the true
      // settlement amount matching IBKR's Statement of Funds (STFU).
      if (rawFeeAmount > 0 && feeCurrency === cashCurrency) {
        rawCashAmount += rawFeeAmount;
        feeHandledAsCashAdjustment = true;
      }

      convertedCashAmount = rawCashAmount * fxRate;
    }

    if (Math.abs(rawCashAmount) > 0.01) {
      // Cash flow direction is determined by the SIGN of the amount
      // - proceeds is negative for buys (pay cash) -> SEND
      // - proceeds is positive for sells (receive cash) -> RECEIVE
      const cashEventType = rawCashAmount > 0 ? "RECEIVE" : "SEND";

      const cashEvent: CanonicalEvent = {
        ...baseProps,
        id: this.generateTempId(),
        eventType: cashEventType,
        timestamp: normalized.timestamp,
        settlementDate: toDate(raw.TradeDate) ?? undefined,
        assetId: "", // Resolved by pipeline
        assetTicker: cashCurrency, // V1: uses currencyPrimary
        // V1: quantity is RAW value in original currency (not converted)
        quantity: Math.abs(rawCashAmount),
        price: fxRate, // V1: uses fxRateToBase
        // totalValue is USD-converted for base currency calculations
        totalValue: Math.abs(convertedCashAmount),
        currency: "USD", // Base currency for value calculations
        costBasis: undefined,
        sourceId: raw.IBOrderID ?? raw.Conid ?? "",
        linkedEventId: tradeEventId,
        idempotencyKey: `${baseKey}:cash`,
        metadata: {
          linkedTradeEventId: tradeEventId,
          isFuturesCashSettlement: isFutures,
          originalCurrency: cashCurrency,
          fxRateToBase: fxRate,
          rawAmount: rawCashAmount,
          convertedAmount: convertedCashAmount,
        },
      };
      events.push(cashEvent);
    }

    // 3. Fee event (if commission + taxes > threshold)
    // Skip if fee was already folded into the cash event (rebate case).
    // IMPORTANT: V1 uses the RAW fee amount (in original currency) for balanceChange,
    // and the CONVERTED amount for grossValue. We match this by using raw for quantity
    // and converted for totalValue.
    const convertedFeeAmount =
      feeCurrency === "USD"
        ? rawFeeAmount
        : rawFeeAmount * fxRate;

    if (!feeHandledAsCashAdjustment && Math.abs(rawFeeAmount) > 0.01) {
      const feeEvent: CanonicalEvent = {
        ...baseProps,
        id: this.generateTempId(),
        eventType: "FEE",
        timestamp: normalized.timestamp,
        settlementDate: toDate(raw.TradeDate) ?? undefined,
        assetId: "", // Resolved by pipeline
        assetTicker: feeCurrency,
        // Use RAW amount for quantity (matches V1's balanceChange)
        quantity: Math.abs(rawFeeAmount),
        // Price is the FX rate (1 for USD, fxRate for others)
        price: feeCurrency === "USD" ? 1 : fxRate,
        // Use CONVERTED amount for totalValue (matches V1's grossValue)
        totalValue: Math.abs(convertedFeeAmount),
        currency: "USD",
        costBasis: undefined,
        sourceId: raw.IBOrderID ?? raw.Conid ?? "",
        linkedEventId: tradeEventId,
        idempotencyKey: `${baseKey}:fee`,
        metadata: {
          linkedTradeEventId: tradeEventId,
          ibCommission: this.parseNumeric(raw.IBCommission),
          taxes: this.parseNumeric(raw.Taxes),
          isFuturesFee: isFutures,
          originalCurrency: feeCurrency,
          fxRateToBase: feeCurrency === "USD" ? 1 : fxRate,
        },
      };
      events.push(feeEvent);
    }

    return events;
  }

  // ============================================================================
  // Idempotency Key
  // ============================================================================

  getIdempotencyKey(raw: IbkrTradeRaw): string {
    // DateTime is always a string in IbkrTradeRaw
    const dateTime = raw.DateTime ?? "";

    // CRITICAL: IBOrderID must be included to distinguish fills at the same
    // price/time/quantity. Without it, multiple fills from a single large order
    // (e.g., buying 600 SPY filled as 6x100 shares) would be deduplicated.
    return this.buildIdempotencyKey(
      "ibkr_trade",
      raw.Conid,
      dateTime,
      raw.Quantity,
      raw.TradePrice,
      raw.IBOrderID
    );
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validate(event: CanonicalEvent): AdapterValidationResult {
    const result = this.createBaseValidationResult(event);

    // IBKR-specific validation
    // Note: assetId will be empty until pipeline resolves it
    // We don't require assetId here since it's resolved later

    // Warnings for potentially missing IBKR data
    if (
      event.eventType === "BUY" &&
      !event.costBasis &&
      event.metadata?.ibkrAssetClass !== "FUT"
    ) {
      if (!result.warnings.includes("Cost basis missing for acquisition event")) {
        result.warnings.push("Cost basis missing for IBKR BUY event");
      }
    }

    return result;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let instance: IbkrTradeAdapter | null = null;

/**
 * Get singleton instance of IbkrTradeAdapter
 */
export function getIbkrTradeAdapter(): IbkrTradeAdapter {
  if (!instance) {
    instance = new IbkrTradeAdapter();
  }
  return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetIbkrTradeAdapter(): void {
  instance = null;
}

export default IbkrTradeAdapter;
