/**
 * FX Rate Lookup for IBKR Combined Reports
 *
 * Builds a lookup table from the RATE section of IBKR combined reports.
 * Used to detect non-USD base currencies and compute the correction
 * divisor needed to normalise all monetary values to USD.
 *
 * Formula: amount_usd = amount_in_base / usdToBaseRate
 * When base is USD, usdToBaseRate = 1 (no-op).
 */

import type { IbkrSection } from "./ibkr-combined-parser";

// ============================================================================
// Types
// ============================================================================

export interface FxRateLookup {
  /** The report's base currency (ToCurrency in RATE section) */
  baseCurrency: string;
  /** Whether the base currency is something other than USD */
  isNonUsdBase: boolean;
  /**
   * Returns the USD-to-base divisor for a given YYYYMMDD date string.
   * For USD-base reports, always returns 1.
   * For non-USD-base, returns the RATE[USD→base] for that date.
   */
  getUsdToBaseDivisor: (dateStr: string) => number;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build an FX rate lookup from the RATE sections of a parsed IBKR combined file.
 *
 * The RATE section has columns: Date/Time, FromCurrency, ToCurrency, Rate
 * ToCurrency is uniform within a file and represents the report's base currency.
 */
export function buildFxRateLookup(rateSections: IbkrSection[]): FxRateLookup {
  // Collect all RATE rows across sections (multiple days/sub-accounts)
  const allRows: string[][] = [];
  for (const section of rateSections) {
    allRows.push(...section.rows);
  }

  if (allRows.length === 0) {
    return { baseCurrency: "USD", isNonUsdBase: false, getUsdToBaseDivisor: () => 1 };
  }

  // Detect base currency from ToCurrency column (index 2 in: Date, From, To, Rate)
  // Headers: ["Date/Time", "FromCurrency", "ToCurrency", "Rate"]
  const baseCurrency = allRows[0]?.[2] ?? "USD";

  if (baseCurrency === "USD") {
    return { baseCurrency: "USD", isNonUsdBase: false, getUsdToBaseDivisor: () => 1 };
  }

  // Non-USD base: build a date → USD-to-base rate lookup
  // We need the rows where FromCurrency = "USD"
  const usdRatesByDate = new Map<string, number>();
  const sortedDates: string[] = [];

  for (const row of allRows) {
    const date = row[0];      // YYYYMMDD
    const fromCcy = row[1];   // FromCurrency
    const rate = parseFloat(row[3]); // Rate

    if (fromCcy === "USD" && date && !isNaN(rate)) {
      if (!usdRatesByDate.has(date)) {
        sortedDates.push(date);
      }
      usdRatesByDate.set(date, rate);
    }
  }

  sortedDates.sort();

  if (usdRatesByDate.size === 0) {
    console.error(
      `[fx-rate-lookup] WARNING: Non-USD base currency (${baseCurrency}) detected but no USD→${baseCurrency} rates found in RATE section. Falling back to divisor=1.`
    );
    return { baseCurrency, isNonUsdBase: true, getUsdToBaseDivisor: () => 1 };
  }

  console.error(
    `[fx-rate-lookup] Non-USD base currency detected: ${baseCurrency}. ` +
    `${usdRatesByDate.size} USD→${baseCurrency} daily rates loaded ` +
    `(${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}).`
  );

  return {
    baseCurrency,
    isNonUsdBase: true,
    getUsdToBaseDivisor: (dateStr: string): number => {
      // Exact match first
      const exact = usdRatesByDate.get(dateStr);
      if (exact !== undefined) return exact;

      // Fall back to nearest prior date (for weekends/holidays)
      let nearest: number | undefined;
      for (const d of sortedDates) {
        if (d <= dateStr) {
          nearest = usdRatesByDate.get(d);
        } else {
          break;
        }
      }

      if (nearest !== undefined) return nearest;

      // If date is before all available rates, use the earliest
      return usdRatesByDate.get(sortedDates[0])!;
    },
  };
}
