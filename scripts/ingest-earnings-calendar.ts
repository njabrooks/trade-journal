#!/usr/bin/env tsx
/**
 * Ingest earnings calendar data from Finnhub for portfolio holdings
 *
 * This script:
 * 1. Queries open positions for distinct tickers
 * 2. Filters to equity-like tickers (skips crypto, special chars)
 * 3. Looks up underlying_id for each ticker
 * 4. Calls Finnhub /calendar/earnings for each ticker (next N days)
 * 5. Upserts into earnings_events table
 * 6. Updates underlyings.next_earnings_date when new data found
 *
 * Environment variables required:
 * - FINNHUB_API_KEY: Finnhub API key
 * - DATABASE_URL_POOLER: Database connection string
 *
 * Usage:
 *   npx tsx scripts/ingest-earnings-calendar.ts           # Default 90 days
 *   npx tsx scripts/ingest-earnings-calendar.ts --days 180
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, sql } from 'drizzle-orm';

const { earningsEvents, positions, underlyings } = schema;

// ---------------------------------------------------------------------------
// Config & CLI args
// ---------------------------------------------------------------------------

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY_MS = 200; // 30 calls/sec free tier — 200ms is safe

function parseDaysArg(): number {
  const idx = process.argv.indexOf('--days');
  if (idx >= 0 && process.argv[idx + 1]) {
    const val = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 90;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

/** Equity-like ticker filter — skip crypto pairs, special-char tickers, etc. */
function isEquityTicker(ticker: string): boolean {
  // Must be 1-5 uppercase alpha chars (standard US equity/ETF tickers)
  // Also allow a single dot for BRK.B style tickers
  return /^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker);
}

interface FinnhubEarningsEntry {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string; // 'bmo' | 'amc' | 'dmh'
  quarter: number;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number;
}

interface FinnhubEarningsResponse {
  earningsCalendar: FinnhubEarningsEntry[];
}

// ---------------------------------------------------------------------------
// Finnhub API
// ---------------------------------------------------------------------------

async function fetchEarningsCalendar(
  ticker: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<FinnhubEarningsEntry[]> {
  const url = `${FINNHUB_BASE}/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Finnhub ${res.status}: ${body.substring(0, 200)}`);
  }

  const data: FinnhubEarningsResponse = await res.json();
  return data.earningsCalendar ?? [];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  if (!FINNHUB_API_KEY) {
    console.error('FINNHUB_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const days = parseDaysArg();
  const now = new Date();
  const from = formatDate(now);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + days);
  const to = formatDate(toDate);

  console.log(`Earnings calendar ingestion: ${from} → ${to} (${days} days)\n`);

  // 1. Get distinct tickers from open positions
  const openPositions = await db
    .selectDistinct({ ticker: positions.symbol })
    .from(positions)
    .where(eq(positions.isOpen, true));

  const allTickers = openPositions.map((p) => p.ticker.toUpperCase());
  const tickers = allTickers.filter(isEquityTicker);

  const skipped = allTickers.filter((t) => !isEquityTicker(t));
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} non-equity tickers: ${skipped.join(', ')}`);
  }

  console.log(`Processing ${tickers.length} equity tickers\n`);

  if (tickers.length === 0) {
    console.log('No equity tickers to process.');
    await closeDb();
    process.exit(0);
  }

  // 2. Build ticker → underlying_id map
  const underlyingRows = await db
    .select({ id: underlyings.id, ticker: underlyings.ticker })
    .from(underlyings);

  const underlyingMap = new Map<string, string>();
  for (const row of underlyingRows) {
    underlyingMap.set(row.ticker.toUpperCase(), row.id);
  }

  // 3. Fetch earnings for each ticker and upsert
  let totalUpserted = 0;
  let totalErrors = 0;
  const nextEarningsUpdates: Array<{ ticker: string; underlyingId: string; nextDate: string }> = [];

  for (const ticker of tickers) {
    try {
      const entries = await fetchEarningsCalendar(ticker, from, to, FINNHUB_API_KEY);

      if (entries.length === 0) {
        console.log(`[${ticker}] No earnings scheduled`);
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }

      const underlyingId = underlyingMap.get(ticker) ?? null;

      for (const entry of entries) {
        if (!entry.date) continue;

        const record = {
          underlyingId: underlyingId,
          ticker: ticker,
          reportDate: entry.date,
          reportTime: entry.hour ?? null,
          epsEstimate: entry.epsEstimate != null ? String(entry.epsEstimate) : null,
          epsActual: entry.epsActual != null ? String(entry.epsActual) : null,
          revenueEstimate: entry.revenueEstimate != null ? String(entry.revenueEstimate) : null,
          revenueActual: entry.revenueActual != null ? String(entry.revenueActual) : null,
          quarter: entry.quarter != null ? String(entry.quarter) : null,
          year: entry.year ?? null,
          source: 'finnhub' as const,
        };

        await db
          .insert(earningsEvents)
          .values(record)
          .onConflictDoUpdate({
            target: [earningsEvents.ticker, earningsEvents.reportDate, earningsEvents.source],
            set: {
              epsActual: sql`EXCLUDED.eps_actual`,
              epsEstimate: sql`EXCLUDED.eps_estimate`,
              revenueActual: sql`EXCLUDED.revenue_actual`,
              revenueEstimate: sql`EXCLUDED.revenue_estimate`,
              reportTime: sql`EXCLUDED.report_time`,
              quarter: sql`EXCLUDED.quarter`,
              year: sql`EXCLUDED.year`,
              underlyingId: sql`EXCLUDED.underlying_id`,
              updatedAt: sql`NOW()`,
            },
          });

        totalUpserted++;
      }

      // Track earliest future earnings date for underlyings update
      const futureDates = entries
        .filter((e) => e.date && e.date >= from)
        .map((e) => e.date)
        .sort();

      if (futureDates.length > 0 && underlyingId) {
        nextEarningsUpdates.push({
          ticker,
          underlyingId,
          nextDate: futureDates[0],
        });
      }

      console.log(`[${ticker}] ${entries.length} earnings event(s) upserted`);
    } catch (err) {
      totalErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ticker}] Error: ${msg}`);
    }

    await delay(RATE_LIMIT_DELAY_MS);
  }

  // 4. Update underlyings.next_earnings_date
  let underlyingsUpdated = 0;
  for (const { ticker, underlyingId, nextDate } of nextEarningsUpdates) {
    try {
      await db
        .update(underlyings)
        .set({ nextEarningsDate: nextDate })
        .where(eq(underlyings.id, underlyingId));
      underlyingsUpdated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ticker}] Failed to update next_earnings_date: ${msg}`);
    }
  }

  // 5. Summary
  console.log('\n--- Summary ---');
  console.log(`Tickers processed: ${tickers.length}`);
  console.log(`Earnings events upserted: ${totalUpserted}`);
  console.log(`Underlyings next_earnings_date updated: ${underlyingsUpdated}`);
  if (totalErrors > 0) {
    console.log(`Errors: ${totalErrors}`);
  }

  await closeDb();
  process.exit(0);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
