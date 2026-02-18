/**
 * IBKR Mark-to-Market P&L (MTM) Adapter (Class-based)
 *
 * Transforms IBKR MTM P&L records into price history entries.
 * This is a SPECIALIZED adapter - it produces price data, not events.
 *
 * Purpose:
 * - Extract daily closing prices for assets held in IBKR
 * - Populate price_history table for market value calculations
 * - Used for unrealized gain/loss computation
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/ibkr-mtmpnl-adapter.ts
 */

import type { ParseResult, ParseError, AdapterValidationResult } from "@/types/event-sourcing";
import type { NewPriceHistoryRow, PriceSource } from "@/db/schema";
import {
  BaseSpecializedAdapter,
  type SpecializedTransformContext,
} from "../base-specialized-adapter";
import { mapIbkrAssetClass, normalizeIbkrSymbol } from "./utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Raw IBKR MTM P&L CSV record
 */
export interface IbkrMtmpnlRaw {
  ClientAccountID?: string;
  AssetClass?: string;
  SubCategory?: string;
  Symbol?: string;
  Description?: string;
  Conid?: string;
  UnderlyingConid?: string;
  UnderlyingSymbol?: string;
  Multiplier?: string;
  Strike?: string;
  Expiry?: string;
  "Put/Call"?: string;
  ReportDate?: string;
  PreviousCloseQuantity?: string;
  PrevClosePrice?: string;
  CloseQuantity?: string;
  ClosePrice?: string;
  TransactionMtmPnl?: string;
  PriorOpenMtmPnl?: string;
  Commissions?: string;
  Other?: string;
  OtherWithAccruals?: string;
  Total?: string;
  TotalWithAccruals?: string;
  Code?: string;
}

/**
 * Header mapping from CSV columns
 */
const HEADER_MAPPING: Record<string, keyof IbkrMtmpnlRaw> = {
  ClientAccountID: "ClientAccountID",
  AssetClass: "AssetClass",
  SubCategory: "SubCategory",
  Symbol: "Symbol",
  Description: "Description",
  Conid: "Conid",
  UnderlyingConid: "UnderlyingConid",
  UnderlyingSymbol: "UnderlyingSymbol",
  Multiplier: "Multiplier",
  Strike: "Strike",
  Expiry: "Expiry",
  "Put/Call": "Put/Call",
  ReportDate: "ReportDate",
  PreviousCloseQuantity: "PreviousCloseQuantity",
  PrevClosePrice: "PrevClosePrice",
  CloseQuantity: "CloseQuantity",
  ClosePrice: "ClosePrice",
  TransactionMtmPnl: "TransactionMtmPnl",
  PriorOpenMtmPnl: "PriorOpenMtmPnl",
  Commissions: "Commissions",
  Other: "Other",
  OtherWithAccruals: "OtherWithAccruals",
  Total: "Total",
  TotalWithAccruals: "TotalWithAccruals",
  Code: "Code",
};

// ============================================================================
// Output Type
// ============================================================================

/**
 * Extended price history output with metadata for asset resolution
 */
export interface MtmpnlPriceOutput extends Omit<NewPriceHistoryRow, "assetId"> {
  /** Asset ID - resolved by pipeline */
  assetId: string;
  /** Ticker for asset resolution */
  assetTicker: string;
  /** IBKR conid for asset resolution */
  conid?: string;
  /** Asset class for asset resolution */
  assetClass?: string;
  /** Description for asset creation */
  description?: string;
}

// ============================================================================
// IBKR MTM P&L Adapter Class
// ============================================================================

export class IbkrMtmpnlAdapter extends BaseSpecializedAdapter<IbkrMtmpnlRaw, MtmpnlPriceOutput> {
  readonly name = "ibkr_mtmpnl";
  readonly version = "3.0.0";

  // ============================================================================
  // Parse
  // ============================================================================

  parse(csv: string): ParseResult<IbkrMtmpnlRaw> {
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

      // Map headers
      const headerIndices = new Map<keyof IbkrMtmpnlRaw, number>();
      headers.forEach((header, index) => {
        const mapped = HEADER_MAPPING[header.trim()];
        if (mapped) {
          headerIndices.set(mapped, index);
        }
      });

      // Parse data rows
      const records: IbkrMtmpnlRaw[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = this.parseCSVLine(line);
          const record: IbkrMtmpnlRaw = {};

          headerIndices.forEach((colIndex, field) => {
            const value = values[colIndex]?.trim();
            if (value && value !== "") {
              (record as Record<string, string>)[field] = value;
            }
          });

          // Only include records with conid and report date
          if (record.Conid && record.ReportDate) {
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
  // Transform
  // ============================================================================

  /**
   * Transform MTM records to price history entries.
   * Asset IDs are left empty for pipeline resolution.
   */
  transform(
    records: IbkrMtmpnlRaw[],
    _context: SpecializedTransformContext
  ): MtmpnlPriceOutput[] {
    const priceRecords: MtmpnlPriceOutput[] = [];

    // Group by conid + date to deduplicate (may have multiple accounts)
    const seen = new Set<string>();

    for (const raw of records) {
      const closePrice = this.parseNumeric(raw.ClosePrice);

      // Skip records without valid closing price
      if (closePrice === null || closePrice <= 0) {
        continue;
      }

      // Skip if already processed this asset/date combo
      const dedupeKey = `${raw.Conid}:${raw.ReportDate}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      const ticker = normalizeIbkrSymbol(raw.Symbol) ?? raw.Symbol ?? "";

      const priceRecord: MtmpnlPriceOutput = {
        assetId: "", // Resolved by pipeline
        assetTicker: ticker,
        conid: raw.Conid,
        assetClass: mapIbkrAssetClass(raw.AssetClass),
        description: raw.Description,
        priceDate: raw.ReportDate!,
        priceClose: closePrice.toString(),
        source: "ibkr" as PriceSource,
        sourceRawPrice: closePrice.toString(),
        sourceCurrency: "USD",
        fxRateToUsd: "1",
      };

      priceRecords.push(priceRecord);
    }

    return priceRecords;
  }

  // ============================================================================
  // Idempotency Key
  // ============================================================================

  getIdempotencyKey(raw: IbkrMtmpnlRaw): string {
    return this.buildIdempotencyKey(
      "ibkr_mtmpnl",
      raw.Conid,
      raw.ReportDate,
      raw.ClosePrice
    );
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validate(record: MtmpnlPriceOutput): AdapterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const price = this.parseNumeric(record.priceClose);
    if (price === null || price <= 0) {
      errors.push("Price must be positive");
    }

    if (!record.assetTicker) {
      errors.push("Asset ticker is required");
    }

    if (!record.priceDate) {
      errors.push("Price date is required");
    }

    return this.createValidationResult(errors.length === 0, errors, warnings);
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let instance: IbkrMtmpnlAdapter | null = null;

/**
 * Get singleton instance of IbkrMtmpnlAdapter
 */
export function getIbkrMtmpnlAdapter(): IbkrMtmpnlAdapter {
  if (!instance) {
    instance = new IbkrMtmpnlAdapter();
  }
  return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetIbkrMtmpnlAdapter(): void {
  instance = null;
}

export default IbkrMtmpnlAdapter;
