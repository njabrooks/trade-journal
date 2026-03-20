#!/usr/bin/env tsx
/**
 * Ingest earnings calendar data from Finnhub for all underlyings
 *
 * This script:
 * 1. Queries all underlyings (not just open positions)
 * 2. Filters to equity-like tickers (skips crypto, special chars)
 * 3. Calls Finnhub /calendar/earnings for each ticker
 * 4. Upserts into earnings_events table
 * 5. Fetches surprise % from Finnhub /stock/earnings endpoint
 * 6. Updates underlyings.next_earnings_date when new data found
 *
 * Environment variables required:
 * - FINNHUB_API_KEY: Finnhub API key
 * - DATABASE_URL_POOLER: Database connection string
 *
 * Usage:
 *   npx tsx scripts/ingest-earnings-calendar.ts                # Forward 90 days
 *   npx tsx scripts/ingest-earnings-calendar.ts --days 180     # Forward 180 days
 *   npx tsx scripts/ingest-earnings-calendar.ts --backfill     # Past 365 days + forward 90 days
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, sql } from 'drizzle-orm';

const { earningsEvents, underlyings } = schema;

// ---------------------------------------------------------------------------
// Config & CLI args
// ---------------------------------------------------------------------------

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY_MS = 1100; // Free tier: 60 calls/min — 1100ms is safe

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

interface FinnhubEarningResult {
  actual: number | null;
  estimate: number | null;
  period: string; // YYYY-MM-DD (fiscal period end date)
  quarter: number;
  surprise: number | null;
  surprisePercent: number | null;
  symbol: string;
  year: number;
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
    throw new Error(`Finnhub calendar ${res.status}: ${body.substring(0, 200)}`);
  }

  const data: FinnhubEarningsResponse = await res.json();
  return data.earningsCalendar ?? [];
}

async function fetchEarningsSurprise(
  ticker: string,
  apiKey: string,
): Promise<FinnhubEarningResult[]> {
  const url = `${FINNHUB_BASE}/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Finnhub earnings ${res.status}: ${body.substring(0, 200)}`);
  }

  const data: FinnhubEarningResult[] = await res.json();
  return data ?? [];
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
  const backfill = process.argv.includes('--backfill');
  const now = new Date();
  const fromDate = new Date(now);
  if (backfill) {
    fromDate.setDate(fromDate.getDate() - 365);
  }
  const from = formatDate(fromDate);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + days);
  const to = formatDate(toDate);

  console.log(`Earnings calendar ingestion: ${from} → ${to}${backfill ? ' (backfill)' : ` (${days} days)`}\n`);

  // 1. Get all underlyings (not just open positions)
  const underlyingRows = await db
    .select({ id: underlyings.id, ticker: underlyings.ticker })
    .from(underlyings);

  const allTickers = [...new Set(underlyingRows.map((r) => r.ticker.toUpperCase()))];
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
      const today = formatDate(now);
      const futureDates = entries
        .filter((e) => e.date && e.date >= today)
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

  // 5. Fetch historical earnings with surprise % from /stock/earnings
  //    This endpoint returns past quarters with actuals + surprise data.
  //    We upsert (insert or update) because the calendar endpoint only returns
  //    future scheduled dates — historical earnings come from this endpoint.
  console.log('\n--- Surprise data pass ---');
  let totalSurpriseUpserted = 0;
  for (const ticker of tickers) {
    try {
      const results = await fetchEarningsSurprise(ticker, FINNHUB_API_KEY);
      if (results.length === 0) {
        await delay(RATE_LIMIT_DELAY_MS);
        continue;
      }

      const underlyingId = underlyingMap.get(ticker) ?? null;
      let tickerUpserted = 0;

      for (const r of results) {
        if (!r.period) continue;

        await db
          .insert(earningsEvents)
          .values({
            underlyingId,
            ticker,
            reportDate: r.period,
            epsEstimate: r.estimate != null ? String(r.estimate) : null,
            epsActual: r.actual != null ? String(r.actual) : null,
            quarter: r.quarter != null ? String(r.quarter) : null,
            year: r.year ?? null,
            surprise: r.surprise != null ? String(r.surprise) : null,
            surprisePercent: r.surprisePercent != null ? String(r.surprisePercent) : null,
            source: 'finnhub' as const,
          })
          .onConflictDoUpdate({
            target: [earningsEvents.ticker, earningsEvents.reportDate, earningsEvents.source],
            set: {
              epsActual: sql`EXCLUDED.eps_actual`,
              epsEstimate: sql`EXCLUDED.eps_estimate`,
              quarter: sql`EXCLUDED.quarter`,
              year: sql`EXCLUDED.year`,
              surprise: sql`EXCLUDED.surprise`,
              surprisePercent: sql`EXCLUDED.surprise_percent`,
              underlyingId: sql`EXCLUDED.underlying_id`,
              updatedAt: sql`NOW()`,
            },
          });

        tickerUpserted++;
      }

      if (tickerUpserted > 0) {
        console.log(`[${ticker}] ${tickerUpserted} historical earnings upserted`);
        totalSurpriseUpserted += tickerUpserted;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ticker}] Surprise fetch error: ${msg}`);
    }

    await delay(RATE_LIMIT_DELAY_MS);
  }

  // 6. Summary
  console.log('\n--- Summary ---');
  console.log(`Tickers processed: ${tickers.length}`);
  console.log(`Earnings events upserted: ${totalUpserted}`);
  console.log(`Historical earnings with surprise data: ${totalSurpriseUpserted}`);
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
