/**
 * Currency Formatting Utilities
 *
 * Currency-aware formatting for the accounting dashboard.
 * Part of M5: Base Currency Support.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  HKD: "HK$",
  CHF: "CHF ",
};

const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  CAD: "en-CA",
  AUD: "en-AU",
  JPY: "ja-JP",
  HKD: "zh-HK",
  CHF: "de-CH",
};

/**
 * Format a monetary value with the correct currency symbol.
 *
 * formatCurrency(1234.56, 'USD') → '$1,234.56'
 * formatCurrency(1234.56, 'GBP') → '£1,234.56'
 */
export function formatCurrency(value: number, currency: string = "USD"): string {
  const locale = CURRENCY_LOCALES[currency] ?? "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback for unknown currency codes
    const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
    return `${symbol}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Format a compact monetary value (for chart axes, cards).
 *
 * formatCompactCurrency(1234567, 'GBP') → '£1.23M'
 * formatCompactCurrency(45000, 'USD')    → '$45.0K'
 * formatCompactCurrency(500, 'EUR')      → '€500'
 */
export function formatCompactCurrency(
  value: number,
  currency: string = "USD"
): string {
  const symbol = getCurrencySymbol(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/**
 * Get the symbol for a currency code.
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}
