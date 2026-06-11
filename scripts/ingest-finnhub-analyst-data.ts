#!/usr/bin/env tsx
/**
 * Ingest insider-transaction data from Finnhub for all equity underlyings:
 * - Insider transactions → insider_transactions
 *
 * Environment variables required:
 * - FINNHUB_API_KEY: Finnhub API key
 * - DATABASE_URL_POOLER: Database connection string
 *
 * Usage:
 *   npx tsx scripts/ingest-finnhub-analyst-data.ts              # Default: 90 days lookback
 *   npx tsx scripts/ingest-finnhub-analyst-data.ts --days 180   # Custom lookback
 *   npx tsx scripts/ingest-finnhub-analyst-data.ts --dry-run    # Preview without writing
 */

import { db, closeDb, schema } from './lib/db.js';
import { emitIntelItems, type IntelItemInput } from '../src/lib/intelligence/emitIntelItems.js';

const { insiderTransactions, underlyings } = schema;

// ---------------------------------------------------------------------------
// Config & CLI args
// ---------------------------------------------------------------------------

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const RATE_LIMIT_DELAY_MS = 200; // 1 endpoint per ticker, total ~30 calls ≪ 60/min limit

function parseDaysArg(): number {
  const idx = process.argv.indexOf('--days');
  if (idx >= 0 && process.argv[idx + 1]) {
    const val = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 90;
}

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function isEquityTicker(ticker: string): boolean {
  return /^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Finnhub API types
// ---------------------------------------------------------------------------

interface FinnhubInsiderTransaction {
  name: string;
  share: number;
  change: number;
  filingDate: string;     // YYYY-MM-DD
  transactionDate: string; // YYYY-MM-DD
  transactionCode: string;
  transactionPrice: number;
  symbol?: string;
}

interface FinnhubInsiderResponse {
  data: FinnhubInsiderTransaction[];
  symbol: string;
}

// ---------------------------------------------------------------------------
// Finnhub API calls
// ---------------------------------------------------------------------------

async function fetchInsiderTxns(
  ticker: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<FinnhubInsiderTransaction[]> {
  const url = `${FINNHUB_BASE}/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 403) return []; // Premium endpoint — skip silently
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Finnhub insider-transactions ${res.status}: ${body.substring(0, 200)}`);
  }
  const data: FinnhubInsiderResponse = await res.json();
  return data.data ?? [];
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
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  const from = formatDate(fromDate);
  const to = formatDate(now);

  console.log(`Finnhub insider-transaction ingestion: ${from} → ${to} (${days} days)${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Get all underlyings
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

  // Build ticker → underlying_id map
  const underlyingMap = new Map<string, string>();
  for (const row of underlyingRows) {
    underlyingMap.set(row.ticker.toUpperCase(), row.id);
  }

  // Counters
  let insidersUpserted = 0;
  let totalErrors = 0;

  // Collect intel items for batch emission
  const insiderIntelItems: IntelItemInput[] = [];

  for (const ticker of tickers) {
    const underlyingId = underlyingMap.get(ticker) ?? null;
    let tickerInsiders = 0;

    // --- Insider Transactions ---
    try {
      const insiders = await fetchInsiderTxns(ticker, from, to, FINNHUB_API_KEY);
      if (!DRY_RUN) {
        for (const tx of insiders) {
          if (!tx.transactionDate || !tx.name) continue;
          const result = await db
            .insert(insiderTransactions)
            .values({
              underlyingId,
              ticker,
              insiderName: tx.name,
              shares: tx.share != null ? String(tx.share) : null,
              change: tx.change != null ? String(tx.change) : null,
              transactionDate: tx.transactionDate,
              filingDate: tx.filingDate || null,
              transactionCode: tx.transactionCode || null,
              transactionPrice: tx.transactionPrice != null ? String(tx.transactionPrice) : null,
              source: 'finnhub',
            })
            .onConflictDoNothing()
            .returning({ id: insiderTransactions.id });

          if (result.length > 0) {
            const txValue = (tx.share ?? 0) * (tx.transactionPrice ?? 0);
            const isBuy = tx.transactionCode === 'P' || (tx.change != null && tx.change > 0);
            insiderIntelItems.push({
              sourceKey: 'insider_transaction',
              sourceTable: 'insider_transactions',
              sourceRecordId: result[0].id,
              occurredAt: new Date(tx.transactionDate),
              headline: `${ticker} insider ${isBuy ? 'buy' : 'sell'} by ${tx.name}`,
              severity: txValue > 1_000_000 ? 'high' : 'medium',
              tickers: [ticker],
              metadata: {
                insiderName: tx.name,
                transactionCode: tx.transactionCode,
                shares: tx.share,
                price: tx.transactionPrice,
                value: txValue,
              },
            });
          }
          tickerInsiders++;
        }
      } else {
        tickerInsiders = insiders.length;
      }
      insidersUpserted += tickerInsiders;
    } catch (err) {
      totalErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ticker}] Insider transactions error: ${msg}`);
    }
    await delay(RATE_LIMIT_DELAY_MS);

    // Log per-ticker summary
    if (tickerInsiders > 0) {
      console.log(`[${ticker}] ${tickerInsiders} insider txns`);
    }
  }

  // Emit intel items
  if (!DRY_RUN) {
    const insiderEmitted = await emitIntelItems(db, insiderIntelItems);
    console.log(`\nIntel items emitted: ${insiderEmitted} insider`);
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Tickers processed: ${tickers.length}`);
  console.log(`Insider transactions upserted: ${insidersUpserted}`);
  if (totalErrors > 0) {
    console.log(`Errors: ${totalErrors}`);
  }
  if (DRY_RUN) {
    console.log('(DRY RUN — no data was written)');
  }

  await closeDb();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
