/**
 * IBKR Positions Adapter (Class-based)
 *
 * Transforms IBKR open positions data into daily snapshots.
 * This is a SPECIALIZED adapter - it produces position snapshots, not events.
 *
 * Purpose:
 * - Import IBKR's reported positions as reference snapshots
 * - Enable reconciliation between calculated positions and IBKR's view
 * - Populate daily_snapshots table with authoritative data
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/ibkr-positions-adapter.ts
 */

import type { ParseResult, ParseError, AdapterValidationResult } from "@/types/event-sourcing";
import type { NewDailySnapshot } from "@/db/schema";
import {
  BaseSpecializedAdapter,
  type SpecializedTransformContext,
} from "../base-specialized-adapter";
import {
  mapOwnerFromAccountId,
  getAccountName,
  mapIbkrAssetClass,
  normalizeIbkrSymbol,
} from "./utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Raw IBKR Positions CSV record
 */
export interface IbkrPositionsRaw {
  ClientAccountID?: string;
  CurrencyPrimary?: string;
  FXRateToBase?: string;
  AssetClass?: string;
  Symbol?: string;
  Description?: string;
  Conid?: string;
  UnderlyingSymbol?: string;
  Multiplier?: string;
  ReportDate?: string;
  Quantity?: string;
  MarkPrice?: string;
  PositionValue?: string;
  PositionValueInBase?: string;
  OpenPrice?: string;
  CostBasisPrice?: string;
  CostBasisMoney?: string;
  PercentOfNAV?: string;
  FifoPnlUnrealized?: string;
  UnrealizedCapitalGainsPnl?: string;
  UnrealizedFxPnl?: string;
  Side?: string;
  FunctionalCurrency?: string;
  FxCurrency?: string;
  CostPrice?: string;
  CostBasis?: string;
  ClosePrice?: string;
  Value?: string;
  UnrealizedPL?: string;
  UsdPrice?: string;
  UsdValue?: string;
  Asset?: string;
}

/**
 * Header mapping from CSV columns
 */
const HEADER_MAPPING: Record<string, keyof IbkrPositionsRaw> = {
  ClientAccountID: "ClientAccountID",
  CurrencyPrimary: "CurrencyPrimary",
  FXRateToBase: "FXRateToBase",
  AssetClass: "AssetClass",
  Symbol: "Symbol",
  Description: "Description",
  Conid: "Conid",
  UnderlyingSymbol: "UnderlyingSymbol",
  Multiplier: "Multiplier",
  ReportDate: "ReportDate",
  Quantity: "Quantity",
  MarkPrice: "MarkPrice",
  PositionValue: "PositionValue",
  PositionValueInBase: "PositionValueInBase",
  OpenPrice: "OpenPrice",
  CostBasisPrice: "CostBasisPrice",
  CostBasisMoney: "CostBasisMoney",
  PercentOfNAV: "PercentOfNAV",
  FifoPnlUnrealized: "FifoPnlUnrealized",
  UnrealizedCapitalGainsPnl: "UnrealizedCapitalGainsPnl",
  UnrealizedFxPnl: "UnrealizedFxPnl",
  Side: "Side",
  FunctionalCurrency: "FunctionalCurrency",
  FxCurrency: "FxCurrency",
  CostPrice: "CostPrice",
  CostBasis: "CostBasis",
  ClosePrice: "ClosePrice",
  Value: "Value",
  UnrealizedPL: "UnrealizedPL",
  UsdPrice: "UsdPrice",
  UsdValue: "UsdValue",
  Asset: "Asset",
};

// ============================================================================
// Output Type
// ============================================================================

/**
 * Extended snapshot output with metadata for asset resolution
 */
export interface PositionsSnapshotOutput extends Omit<NewDailySnapshot, "assetId"> {
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
// IBKR Positions Adapter Class
// ============================================================================

export class IbkrPositionsAdapter extends BaseSpecializedAdapter<IbkrPositionsRaw, PositionsSnapshotOutput> {
  readonly name = "ibkr_positions";
  readonly version = "3.0.0";

  // ============================================================================
  // Parse
  // ============================================================================

  parse(csv: string): ParseResult<IbkrPositionsRaw> {
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
      const headerIndices = new Map<keyof IbkrPositionsRaw, number>();
      headers.forEach((header, index) => {
        const mapped = HEADER_MAPPING[header.trim()];
        if (mapped) {
          headerIndices.set(mapped, index);
        }
      });

      // Parse data rows
      const records: IbkrPositionsRaw[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = this.parseCSVLine(line);
          const record: IbkrPositionsRaw = {};

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
   * Transform positions to daily snapshots.
   * Asset IDs are left empty for pipeline resolution.
   */
  transform(
    records: IbkrPositionsRaw[],
    context: SpecializedTransformContext
  ): PositionsSnapshotOutput[] {
    const snapshots: PositionsSnapshotOutput[] = [];

    for (const raw of records) {
      const quantity = this.parseNumeric(raw.Quantity);

      // Skip records without valid quantity
      if (quantity === null || quantity === 0) {
        continue;
      }

      // Determine owner and account
      const owner = mapOwnerFromAccountId(raw.ClientAccountID);
      const account = getAccountName(owner);

      // Get ticker for asset resolution
      const ticker = normalizeIbkrSymbol(raw.Symbol) ?? raw.Symbol ?? "";

      // Parse values (prefer base currency values)
      const fxRate = this.parseNumericOrZero(raw.FXRateToBase) || 1;
      const costBasis = this.parseNumericOrZero(raw.CostBasisMoney) ||
                        this.parseNumericOrZero(raw.CostBasis);
      const marketValue = this.parseNumericOrZero(raw.PositionValueInBase) ||
                          this.parseNumericOrZero(raw.PositionValue) * fxRate;
      const pricePerUnit = this.parseNumericOrZero(raw.MarkPrice) ||
                           this.parseNumericOrZero(raw.ClosePrice);
      const unrealizedGain = this.parseNumeric(raw.FifoPnlUnrealized) ??
                             this.parseNumeric(raw.UnrealizedPL) ??
                             (marketValue - costBasis);

      // Calculate unrealized gain percent
      const unrealizedGainPercent = costBasis !== 0
        ? (unrealizedGain / Math.abs(costBasis)) * 100
        : 0;

      const snapshot: PositionsSnapshotOutput = {
        userId: context.userId,
        snapshotDate: raw.ReportDate!,
        assetId: "", // Resolved by pipeline
        assetTicker: ticker,
        conid: raw.Conid,
        assetClass: mapIbkrAssetClass(raw.AssetClass),
        description: raw.Description,
        owner,
        account,
        quantity: Math.abs(quantity).toString(),
        costBasis: costBasis.toString(),
        pricePerUnit: pricePerUnit.toString(),
        marketValue: marketValue.toString(),
        unrealizedGain: unrealizedGain.toString(),
        unrealizedGainPercent: unrealizedGainPercent.toString(),
        isCalculated: false, // This is imported from IBKR, not calculated
      };

      snapshots.push(snapshot);
    }

    return snapshots;
  }

  // ============================================================================
  // Idempotency Key
  // ============================================================================

  getIdempotencyKey(raw: IbkrPositionsRaw): string {
    return this.buildIdempotencyKey(
      "ibkr_positions",
      raw.ClientAccountID,
      raw.Conid,
      raw.ReportDate,
      raw.Quantity
    );
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validate(record: PositionsSnapshotOutput): AdapterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const quantity = this.parseNumeric(record.quantity as string);
    if (quantity === null || quantity < 0) {
      errors.push("Quantity must be non-negative");
    }

    if (!record.assetTicker) {
      errors.push("Asset ticker is required");
    }

    if (!record.snapshotDate) {
      errors.push("Snapshot date is required");
    }

    return this.createValidationResult(errors.length === 0, errors, warnings);
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let instance: IbkrPositionsAdapter | null = null;

/**
 * Get singleton instance of IbkrPositionsAdapter
 */
export function getIbkrPositionsAdapter(): IbkrPositionsAdapter {
  if (!instance) {
    instance = new IbkrPositionsAdapter();
  }
  return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetIbkrPositionsAdapter(): void {
  instance = null;
}

export default IbkrPositionsAdapter;
