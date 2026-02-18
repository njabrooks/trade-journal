/**
 * IBKR Statement of Funds (SOF) Adapter (Class-based)
 *
 * Transforms IBKR statement of funds records into canonical events.
 * SOF records include: dividends, interest, fees, deposits, withdrawals, etc.
 * Each SOF record typically produces 1 event.
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/ibkr-sof-adapter.ts
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
  toDate,
  normalizeIbkrSymbol,
} from "./utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Raw IBKR SOF CSV record (column headers as keys)
 */
export interface IbkrSofRaw {
  Date?: string;
  CurrencyPrimary?: string;
  ActivityDescription?: string;
  Amount?: string;
  Balance?: string;
  ActivityCode?: string;
  TransactionID?: string;
  ActionID?: string;
  ClientAccountID?: string;
  Symbol?: string;
  Conid?: string;
  OrderID?: string;
  TradeID?: string;
  AssetClass?: string;
  Description?: string;
  UnderlyingSymbol?: string;
  UnderlyingConid?: string;
  BuySell?: string;
  TradeQuantity?: string;
  TradePrice?: string;
  TradeCommission?: string;
  SubCategory?: string;
  Multiplier?: string;
  Strike?: string;
  Expiry?: string;
  "Put/Call"?: string;
  TradeGross?: string;
  TradeTax?: string;
  TradeCode?: string;
  FXRateToBase?: string;
  LevelOfDetail?: string;
  ReportDate?: string;
}

/**
 * Activity code to event type mapping
 *
 * NOTE: Some activity codes (ADJ, FOREX) are handled dynamically based on
 * amount sign rather than having a fixed mapping. These are NOT included here
 * and will fall through to the default RECEIVE/SEND logic.
 *
 * Matches V1 logic in transactions-ibkr_sof-actions.ts
 */
const ACTIVITY_CODE_MAPPING: Record<string, EventType> = {
  // Dividends & Interest
  DIV: "DIVIDEND",
  DIVIDEND: "DIVIDEND",
  INT: "INTEREST",
  INTEREST: "INTEREST",
  PIK: "INTEREST", // Payment in Kind
  CINT: "INTEREST", // Credit Interest (lending interest)
  INTR: "INTEREST", // Lending Interest

  // Deposits & Withdrawals
  DEP: "RECEIVE",
  DEPOSIT: "RECEIVE",
  WITH: "SEND",
  WITHDRAWAL: "SEND",
  WIRE: "RECEIVE", // Wire transfer in
  ACH: "RECEIVE", // ACH transfer in

  // Fees - only actual fees, NOT adjustments
  FEE: "FEE",
  COMM: "FEE",
  OFEE: "FEE", // Other fees
  CFD: "FEE", // CFD financing
  DINT: "FEE", // Debit Interest (borrow fee)
  FRTAX: "FEE", // Foreign Tax (withholding)
  PIL: "FEE", // Payment in Lieu (considered fee/loss)

  // Other
  STAKING: "STAKING_REWARD",
  LENDING: "INTEREST", // Stock lending interest

  // NOTE: The following are NOT mapped here because they need dynamic handling:
  // - ADJ: Adjustments - use RECEIVE/SEND based on amount sign (V1: "Adjustment" tradeType)
  // - FOREX: Currency trades - use RECEIVE/SEND based on amount sign (V1: "Buy/Sell" tradeType)
  // These fall through to the default logic below
};

/**
 * Header mapping from CSV columns to our raw type
 */
const HEADER_MAPPING: Record<string, keyof IbkrSofRaw> = {
  Date: "Date",
  CurrencyPrimary: "CurrencyPrimary",
  ActivityDescription: "ActivityDescription",
  Amount: "Amount",
  Balance: "Balance",
  ActivityCode: "ActivityCode",
  TransactionID: "TransactionID",
  ActionID: "ActionID",
  ClientAccountID: "ClientAccountID",
  Symbol: "Symbol",
  Conid: "Conid",
  OrderID: "OrderID",
  TradeID: "TradeID",
  AssetClass: "AssetClass",
  Description: "Description",
  UnderlyingSymbol: "UnderlyingSymbol",
  UnderlyingConid: "UnderlyingConid",
  "Buy/Sell": "BuySell",
  TradeQuantity: "TradeQuantity",
  TradePrice: "TradePrice",
  TradeCommission: "TradeCommission",
  SubCategory: "SubCategory",
  Multiplier: "Multiplier",
  Strike: "Strike",
  Expiry: "Expiry",
  "Put/Call": "Put/Call",
  TradeGross: "TradeGross",
  TradeTax: "TradeTax",
  TradeCode: "TradeCode",
  FXRateToBase: "FXRateToBase",
  LevelOfDetail: "LevelOfDetail",
  ReportDate: "ReportDate",
};

// ============================================================================
// IBKR SOF Adapter Class
// ============================================================================

/**
 * Activity codes that represent trade settlements.
 * These are already captured by TRNT (Trade Confirmations) and must be excluded
 * from SOF to avoid double-counting cash movements.
 *
 * Matches V1 logic in transactions-ibkr_sof-actions.ts:203
 */
const TRADE_SETTLEMENT_ACTIVITY_CODES = new Set([
  "BUY",
  "SELL",
  "EXE",    // Option exercise
  "ASSIGN", // Option assignment
  "EXP",    // Option/futures expiration - also handled by trade settlements
]);

export class IbkrSofAdapter extends BaseAdapter<IbkrSofRaw> {
  readonly name: EventSource = "ibkr_sof";
  readonly version = "3.5.0"; // Fix: include TransactionID in idempotency key

  // ============================================================================
  // Parse
  // ============================================================================

  parse(csv: string): ParseResult<IbkrSofRaw> {
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
      const headerIndices = new Map<keyof IbkrSofRaw, number>();
      headers.forEach((header, index) => {
        const mapped = HEADER_MAPPING[header.trim()];
        if (mapped) {
          headerIndices.set(mapped, index);
        }
      });

      // Parse data rows
      const records: IbkrSofRaw[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = this.parseCSVLine(line);
          const record: IbkrSofRaw = {};

          headerIndices.forEach((colIndex, field) => {
            const value = values[colIndex]?.trim();
            if (value && value !== "") {
              (record as Record<string, string>)[field] = value;
            }
          });

          // Only include records with a date
          if (record.Date) {
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

  normalize(raw: IbkrSofRaw): NormalizedRecord {
    const amount = this.parseNumeric(raw.Amount) ?? 0;
    const fxRate = this.parseNumeric(raw.FXRateToBase) ?? 1;
    const timestamp = toDate(raw.Date) ?? new Date();

    return {
      timestamp,
      symbol: raw.Symbol ?? raw.CurrencyPrimary ?? undefined,
      conid: raw.Conid ?? undefined,
      description: raw.Description ?? raw.ActivityDescription ?? undefined,
      assetClass: raw.AssetClass
        ? mapIbkrAssetClass(raw.AssetClass)
        : "FIAT",
      quantity: Math.abs(amount),
      price: 1,
      totalValue: Math.abs(this.convertToBase(amount, fxRate)),
      isBuy: amount > 0,
      currency: raw.CurrencyPrimary ?? "USD",
      account: raw.ClientAccountID ?? undefined,
      type: raw.ActivityCode ?? undefined,
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  // ============================================================================
  // Expand (SYNCHRONOUS)
  // ============================================================================

  /**
   * Expand normalized record to canonical events.
   * SOF records typically produce 1 event.
   *
   * NOTE: This is SYNCHRONOUS. Asset IDs are left empty and
   * will be resolved by the asset resolution pipeline.
   */
  expand(
    normalized: NormalizedRecord,
    context: AdapterTransformContext
  ): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    const raw = normalized.raw as IbkrSofRaw;

    // Skip records without amount
    const amount = this.parseNumeric(raw.Amount);
    if (amount === null || amount === 0) {
      return events;
    }

    // Skip BaseCurrency level of detail records - these are summary rows
    // that would double-count the actual transactions
    // Matches V1 logic in transactions-ibkr_sof-actions.ts:204
    if (raw.LevelOfDetail === "BaseCurrency") {
      return events;
    }

    // Skip trade settlement activity codes - these are already handled by TRNT
    // (Trade Confirmations) and including them here would double-count cash movements
    const activityCodeUpper = raw.ActivityCode?.toUpperCase() ?? "";
    if (TRADE_SETTLEMENT_ACTIVITY_CODES.has(activityCodeUpper)) {
      return events;
    }

    // Determine owner and account
    const owner =
      context.owner || mapOwnerFromAccountId(raw.ClientAccountID);
    const account = context.account || getAccountName(owner);

    // Determine event type from activity code
    // Note: activityCodeUpper already defined above for trade exclusion check
    let eventType = ACTIVITY_CODE_MAPPING[activityCodeUpper];

    // Special handling for activity codes that need dynamic mapping
    // (matches V1 logic in transactions-ibkr_sof-actions.ts)
    if (!eventType) {
      if (activityCodeUpper === "FOREX") {
        // FOREX: Check if it's a commission or a currency trade
        const activityDesc = raw.ActivityDescription ?? "";
        if (activityDesc.includes("Commission")) {
          eventType = "FEE";
        } else {
          // Currency trade leg - positive is receive, negative is send
          eventType = amount > 0 ? "RECEIVE" : "SEND";
        }
      } else if (activityCodeUpper === "ADJ") {
        // ADJ (Adjustments): Use RECEIVE/SEND based on amount sign
        // V1 treats these as Deposit/Withdrawal with "Adjustment" tradeType
        eventType = amount > 0 ? "RECEIVE" : "SEND";
      } else {
        // Default: infer from amount sign
        eventType = amount > 0 ? "RECEIVE" : "SEND";
      }
    }

    // For fees, amount is typically negative but we want positive quantity
    if (eventType === "FEE" && amount > 0) {
      // Refund, treat as RECEIVE
      eventType = "RECEIVE";
    }

    // For inflow types (DIVIDEND, INTEREST, etc.), amount is typically positive.
    // A negative amount indicates a reversal/correction by the broker (e.g. IBKR
    // reversing then restating a dividend at a corrected amount). These must be
    // treated as outflows so the signed quantity is subtracted, not added.
    if (
      ["DIVIDEND", "INTEREST", "INCOME", "STAKING_REWARD"].includes(eventType) &&
      amount < 0
    ) {
      eventType = "SEND";
    }

    // Determine the asset ticker
    // All SOF records represent CASH movements - the asset is the currency.
    // For futures/options MTM settlements (ADJ events), we keep the settlement on USD
    // but track the source contract in metadata for P&L attribution reporting.
    //
    // NOTE: Futures MTM settlements don't fit the average cost model well since
    // futures are marked-to-market daily rather than having discrete buy/sell lots.
    // V1 handles this by keeping MTM on USD, and we preserve that approach.
    const assetTicker = raw.CurrencyPrimary ?? "USD";
    const assetClass = "FIAT";

    // Track the source contract for derivative settlements (for P&L reporting by contract)
    const rawAssetClass = raw.AssetClass?.toUpperCase();
    const isDerivativeSettlement =
      activityCodeUpper === 'ADJ' &&
      raw.Symbol &&
      (rawAssetClass === 'FUT' || rawAssetClass === 'OPT' || rawAssetClass === 'FOP');
    const derivativeSymbol = isDerivativeSettlement
      ? normalizeIbkrSymbol(raw.Symbol) ?? raw.Symbol
      : undefined;

    // Track the source security for dividend/interest events
    const dividendSource = ["DIVIDEND", "INTEREST", "STAKING_REWARD"].includes(eventType) && raw.Symbol
      ? normalizeIbkrSymbol(raw.Symbol) ?? raw.Symbol
      : undefined;

    // Calculate value in base currency
    const fxRate = this.parseNumeric(raw.FXRateToBase) ?? 1;
    const valueInBase = Math.abs(amount * fxRate);

    // Generate idempotency key
    const idempotencyKey = this.getIdempotencyKey(raw);

    // Create the event
    // V1 COMPATIBILITY: price = fxRateToBase (1 for USD, actual rate for other currencies)
    // This matches V1's behavior: price: fxRateToBase === 1 ? '1.000000' : fxRateToBase.toFixed(6)
    const event: CanonicalEvent = {
      id: this.generateTempId(),
      userId: context.userId,
      eventType,
      timestamp: normalized.timestamp,
      settlementDate: toDate(raw.ReportDate ?? raw.Date) ?? undefined,
      assetId: "", // Resolved by pipeline
      assetTicker,
      quantity: Math.abs(amount),
      price: fxRate, // V1: uses fxRateToBase
      totalValue: valueInBase,
      currency: "USD", // Base currency for value calculations
      costBasis: ["RECEIVE", "DIVIDEND", "INTEREST", "STAKING_REWARD"].includes(eventType)
        ? valueInBase
        : undefined,
      owner,
      account,
      source: this.name,
      sourceId: raw.TransactionID ?? raw.ActionID ?? "",
      importBatchId: context.batchId,
      linkedEventId: undefined,
      idempotencyKey,
      rawData: normalized.raw,
      metadata: {
        activityCode: raw.ActivityCode,
        activityDescription: raw.ActivityDescription,
        conid: raw.Conid,
        assetClass,
        // For derivative settlements (futures MTM, option settlements), track the source contract
        // This enables P&L reporting by contract even though the settlement is on USD
        derivativeSymbol,
        ibkrAssetClass: isDerivativeSettlement ? rawAssetClass : undefined,
        underlyingSymbol: raw.UnderlyingSymbol,
        fxRateToBase: fxRate,
        originalCurrency: raw.CurrencyPrimary,
        balance: this.parseNumeric(raw.Balance),
        // For dividend/interest events, track which security paid it
        dividendSource,
      },
    };

    events.push(event);
    return events;
  }

  // ============================================================================
  // Idempotency Key
  // ============================================================================

  getIdempotencyKey(raw: IbkrSofRaw): string {
    return this.buildIdempotencyKey(
      "ibkr_sof",
      raw.TransactionID ?? raw.Conid ?? raw.CurrencyPrimary,
      raw.Date ?? raw.ReportDate,
      raw.ActivityCode,
      raw.Amount,
      // Include ActivityDescription to distinguish entries that share the same
      // TransactionID+Date+ActivityCode+Amount but represent different operations
      // (e.g. "Position MTM" vs "Missing Trade VM" correction entries for futures).
      raw.ActivityDescription
    );
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validate(event: CanonicalEvent): AdapterValidationResult {
    const result = this.createBaseValidationResult(event);

    // SOF-specific validation
    // Note: assetId will be empty until pipeline resolves it
    // We don't require assetId here since it's resolved later

    return result;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let instance: IbkrSofAdapter | null = null;

/**
 * Get singleton instance of IbkrSofAdapter
 */
export function getIbkrSofAdapter(): IbkrSofAdapter {
  if (!instance) {
    instance = new IbkrSofAdapter();
  }
  return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetIbkrSofAdapter(): void {
  instance = null;
}

export default IbkrSofAdapter;
