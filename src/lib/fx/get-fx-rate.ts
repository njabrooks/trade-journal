/**
 * FX Rate Utility
 *
 * Single source of truth for FX conversion. All rates in the `fxRates` table
 * are stored as from_currency → USD. This module handles:
 * - Direct lookups (GBP → USD)
 * - Gap-fill for weekends/holidays (nearest prior business day)
 * - Inverse rates (USD → GBP = 1 / GBP→USD)
 * - Cross-rates (EUR → GBP = EUR→USD / GBP→USD)
 * - Batch lookups for time series with forward-fill
 *
 * Part of M5: Base Currency Support.
 */

import { db } from "@/db";
import { fxRates } from "@/db/schema";
import { and, eq, lte, sql, gte, asc } from "drizzle-orm";

/**
 * Get the FX rate to convert 1 unit of `from` into `to` on a given date.
 * Returns null if no rate data is available.
 *
 * Examples:
 *   getFxRate('GBP', 'USD', '2026-02-28') → ~1.26 (1 GBP = 1.26 USD)
 *   getFxRate('USD', 'GBP', '2026-02-28') → ~0.79 (1 USD = 0.79 GBP)
 *   getFxRate('EUR', 'GBP', '2026-02-28') → cross-rate via USD
 */
export async function getFxRate(
  from: string,
  to: string,
  date: string
): Promise<number | null> {
  if (from === to) return 1;

  // Both involve USD — one direct lookup
  if (to === "USD") {
    return getDirectRate(from, date);
  }
  if (from === "USD") {
    const inverse = await getDirectRate(to, date);
    return inverse ? 1 / inverse : null;
  }

  // Cross-rate: from→USD / to→USD
  const [fromToUsd, toToUsd] = await Promise.all([
    getDirectRate(from, date),
    getDirectRate(to, date),
  ]);
  if (fromToUsd && toToUsd) {
    return fromToUsd / toToUsd;
  }
  return null;
}

/**
 * Get FX rates for a date range, returning a Map<dateStr, rate>.
 * Forward-fills gaps (weekends/holidays use the most recent prior rate).
 *
 * More efficient than calling getFxRate() per date — does a single DB query.
 */
export async function getFxRateSeries(
  from: string,
  to: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  if (from === to) {
    // Fill every date with 1
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      result.set(formatDate(current), 1);
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return result;
  }

  if (to === "USD") {
    return getDirectRateSeries(from, startDate, endDate);
  }
  if (from === "USD") {
    const directSeries = await getDirectRateSeries(to, startDate, endDate);
    const inverted = new Map<string, number>();
    for (const [date, rate] of directSeries) {
      inverted.set(date, 1 / rate);
    }
    return inverted;
  }

  // Cross-rate series
  const [fromSeries, toSeries] = await Promise.all([
    getDirectRateSeries(from, startDate, endDate),
    getDirectRateSeries(to, startDate, endDate),
  ]);
  let current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dateStr = formatDate(current);
    const fromRate = fromSeries.get(dateStr);
    const toRate = toSeries.get(dateStr);
    if (fromRate && toRate) {
      result.set(dateStr, fromRate / toRate);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Direct lookup: from_currency → USD with gap-fill.
 * Queries fxRates for the most recent rate on or before the target date.
 */
async function getDirectRate(
  fromCurrency: string,
  date: string
): Promise<number | null> {
  const rows = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.fromCurrency, fromCurrency),
        eq(fxRates.toCurrency, "USD"),
        lte(fxRates.snapshotDate, date)
      )
    )
    .orderBy(sql`${fxRates.snapshotDate} DESC`)
    .limit(1);

  return rows[0]?.rate ? parseFloat(rows[0].rate) : null;
}

/**
 * Fetch all direct rates (from_currency → USD) in a date range,
 * then forward-fill to produce a rate for every calendar day.
 *
 * Also fetches one rate before startDate for gap-fill at the start.
 */
async function getDirectRateSeries(
  fromCurrency: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  // Fetch rates in range + one prior rate for forward-fill seed
  const rows = await db
    .select({
      date: fxRates.snapshotDate,
      rate: fxRates.rate,
    })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.fromCurrency, fromCurrency),
        eq(fxRates.toCurrency, "USD"),
        lte(fxRates.snapshotDate, endDate)
      )
    )
    .orderBy(asc(fxRates.snapshotDate));

  // Build a sparse map of available rates
  const sparseRates = new Map<string, number>();
  let seedRate: number | null = null;

  for (const row of rows) {
    const rate = parseFloat(row.rate);
    if (row.date < startDate) {
      seedRate = rate; // Keep updating — last one before startDate wins
    } else {
      sparseRates.set(row.date, rate);
    }
  }

  // Forward-fill: for each calendar day, use that day's rate or carry forward
  const result = new Map<string, number>();
  let lastRate = seedRate;
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = formatDate(current);
    if (sparseRates.has(dateStr)) {
      lastRate = sparseRates.get(dateStr)!;
    }
    if (lastRate !== null) {
      result.set(dateStr, lastRate);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
