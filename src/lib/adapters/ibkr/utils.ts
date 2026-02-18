/**
 * IBKR Adapter Utilities
 *
 * Shared utilities for parsing and transforming IBKR data formats.
 * Used by all IBKR adapters (trade, SOF, MTM P&L, positions).
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/utils.ts
 */

import crypto from "crypto";

// ============================================================================
// Owner & Account Mapping
// ============================================================================

/**
 * IBKR Client Account ID to Owner mapping
 */
const ACCOUNT_TO_OWNER: Record<string, string> = {
  "U9896103": "Nick",
  "U21416380": "Nick ISA",
  "U21329236": "Alex",
  "U21667159": "Leo",
  "U21419040": "Lily",
  "U14220513": "TTC",
  "U8943999": "Tiff",
  "U21595594": "Tiff ISA",
  "U19875606": "Maisy",
};

/**
 * Maps IBKR client account ID to owner name
 */
export function mapOwnerFromAccountId(clientAccountId: string | null | undefined): string {
  if (!clientAccountId) return "TTC";
  return ACCOUNT_TO_OWNER[clientAccountId] ?? "TTC";
}

/**
 * Creates account string from owner
 * V1 COMPATIBILITY: V1 stores "IBKR" as accountType for all IBKR accounts
 */
export function getAccountName(owner: string): string {
  return "IBKR";
}

// ============================================================================
// Asset Class Mapping
// ============================================================================

/**
 * Maps IBKR asset class to canonical asset class
 */
export function mapIbkrAssetClass(ibkrClass: string | null | undefined): string {
  if (!ibkrClass) return "OTHER";

  const mapping: Record<string, string> = {
    STK: "EQUITY",
    OPT: "DERIVATIVE",
    FOP: "DERIVATIVE",
    FUT: "DERIVATIVE",
    CASH: "FIAT",
    FOREX: "FIAT",
    FIAT: "FIAT",
    CRYPTO: "CRYPTO",
    BOND: "BOND",
    BILL: "BOND",
  };

  return mapping[ibkrClass.toUpperCase()] ?? "OTHER";
}

/**
 * Maps IBKR asset class to legacy transaction asset class (for compatibility)
 */
export function mapIbkrAssetClassLegacy(ibkrClass: string | null | undefined): string {
  if (!ibkrClass) return "Unknown";

  switch (ibkrClass.toUpperCase()) {
    case "FIAT":
    case "CASH":
    case "FOREX":
      return "Fiat";
    case "FOP":
    case "OPT":
      return "Options";
    case "STK":
      return "Stocks";
    case "FUT":
      return "Futures";
    case "BILL":
    case "BOND":
      return "Bonds";
    default:
      return "Unknown";
  }
}

// ============================================================================
// Date/Time Parsing
// ============================================================================

/**
 * Parses IBKR datetime strings to UTC Date objects
 * Handles formats: "YYYY-MM-DD;HH:MM:SS" and "YYYYMMDD;HHMMSS"
 */
export function parseIbkrDateTime(dateTimeString: string | null | undefined): Date | null {
  if (!dateTimeString) return null;

  try {
    const [datePart, timePart] = dateTimeString.split(";");
    if (!datePart || !timePart) return null;

    let year: number, month: number, day: number;

    // Handle both date formats: YYYY-MM-DD and YYYYMMDD
    if (datePart.includes("-")) {
      [year, month, day] = datePart.split("-").map(Number);
    } else {
      year = Number(datePart.substring(0, 4));
      month = Number(datePart.substring(4, 6));
      day = Number(datePart.substring(6, 8));
    }

    let hour: number, minute: number, second: number;

    // Handle both time formats: HH:MM:SS and HHMMSS
    if (timePart.includes(":")) {
      [hour, minute, second] = timePart.split(":").map(Number);
    } else {
      hour = Number(timePart.substring(0, 2));
      minute = Number(timePart.substring(2, 4));
      second = Number(timePart.substring(4, 6));
    }

    // Create date using UTC to avoid timezone issues
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  } catch (error) {
    console.error("Error parsing IBKR DateTime:", error, "for input:", dateTimeString);
    return null;
  }
}

/**
 * Parses IBKR date strings to YYYY-MM-DD format
 * Handles formats: "YYYY-MM-DD", "DD/MM/YYYY", "YYYY/MM/DD", "YYYYMMDD"
 */
export function parseIbkrDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;

  try {
    const trimmed = dateString.trim();

    // Already in YYYY-MM-DD format
    if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return trimmed;
    }

    // Handle DD/MM/YYYY or YYYY/MM/DD format
    if (trimmed.includes("/")) {
      const parts = trimmed.split("/").map(Number);
      if (parts.length !== 3) return null;

      let year: number, month: number, day: number;

      // Check if first part is year (4 digits) or day (2 digits)
      if (parts[0].toString().length === 4) {
        // YYYY/MM/DD format
        [year, month, day] = parts;
      } else {
        // DD/MM/YYYY format
        [day, month, year] = parts;
      }

      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toISOString().split("T")[0];
    }

    // Convert YYYYMMDD to YYYY-MM-DD
    if (trimmed.length === 8 && !trimmed.includes("-")) {
      const year = trimmed.substring(0, 4);
      const month = trimmed.substring(4, 6);
      const day = trimmed.substring(6, 8);
      return `${year}-${month}-${day}`;
    }

    return null;
  } catch (error) {
    console.error("Error parsing IBKR Date:", error, "for input:", dateString);
    return null;
  }
}

/**
 * Converts a date string to a Date object
 */
export function toDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  const parsed = parseIbkrDate(dateString);
  if (!parsed) return null;
  return new Date(`${parsed}T00:00:00.000Z`);
}

// ============================================================================
// Numeric Parsing
// ============================================================================

/**
 * Cleans and validates numeric strings
 * - Trims whitespace
 * - Removes non-numeric characters (allows digits, '.', '-')
 * - Returns the number or null if invalid
 */
export function parseNumeric(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const cleaned = trimmed.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Safely converts a value to number, returning 0 if invalid
 */
export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = parseNumeric(value as string);
  return parsed ?? 0;
}

// ============================================================================
// FX Conversion
// ============================================================================

/**
 * Converts a value to base currency (USD) using FX rate
 */
export function convertToBase(
  value: number,
  fxRateToBase: number | null | undefined
): number {
  const rate = fxRateToBase ?? 1;
  return value * rate;
}

// ============================================================================
// Idempotency Key Generation
// ============================================================================

/**
 * Generates a SHA256 hash of the input string
 */
export function hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generates idempotency key for IBKR trade record
 * Format: ibkr_trade:{conid}:{dateTime}:{quantity}:{tradePrice}
 */
export function generateIbkrTradeIdempotencyKey(record: {
  conid?: string | null;
  dateTime?: Date | string | null;
  quantity?: string | number | null;
  tradePrice?: string | number | null;
}): string {
  const conid = record.conid ?? "";
  const dateTime = record.dateTime instanceof Date
    ? record.dateTime.toISOString()
    : record.dateTime ?? "";
  const quantity = record.quantity?.toString() ?? "";
  const price = record.tradePrice?.toString() ?? "";

  return hash(`ibkr_trade:${conid}:${dateTime}:${quantity}:${price}`);
}

/**
 * Generates idempotency key for IBKR SOF record
 */
export function generateIbkrSofIdempotencyKey(record: {
  conid?: string | null;
  reportDate?: string | null;
  activityCode?: string | null;
  amount?: string | number | null;
}): string {
  const conid = record.conid ?? "";
  const reportDate = record.reportDate ?? "";
  const activityCode = record.activityCode ?? "";
  const amount = record.amount?.toString() ?? "";

  return hash(`ibkr_sof:${conid}:${reportDate}:${activityCode}:${amount}`);
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Asset Symbol Mappings
// ============================================================================

/**
 * Special asset mappings for known edge cases
 */
const ASSET_MAPPINGS: Record<string, string> = {
  "ARKK  220715C00149220": "ARKK  220715C00150000",
  "OXY2  210115C00015000": "OXY   210115C00015000",
  "OXY2  220121C00017500": "OXY   220121C00017500",
  META: "METV",
  "USO1  210115C00005000": "USO   210115C00005000",
  "XOP1  210115C00010000": "XOP   210115C00010000",
  "XOP1  210115P00007000": "XOP   210115P00007000",
  "XOP1  210115P00006000": "XOP   210115P00006000",
};

/**
 * Normalizes IBKR symbol to canonical ticker
 */
export function normalizeIbkrSymbol(
  symbol: string | null | undefined,
  accountType: string = "IBKR"
): string | null {
  if (!symbol) return null;

  // Check for 7-char forex symbols (e.g., "USD.JPY")
  let normalized =
    symbol.length === 7 && symbol[3] === "." ? symbol.substring(0, 3) : symbol;

  // Apply special mappings
  if (normalized in ASSET_MAPPINGS) {
    normalized = ASSET_MAPPINGS[normalized];
  }

  // ETH special case for IBKR (ETF not crypto)
  if (accountType === "IBKR" && normalized === "ETH") {
    normalized = "ETH (ETF)";
  }

  return normalized;
}
