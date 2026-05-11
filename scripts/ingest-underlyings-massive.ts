#!/usr/bin/env tsx
/**
 * Ingest underlying spot prices and IV30 from Massive.com API.
 *
 * Pipeline:
 *   1. Get tickers (arg or all underlyings from DB).
 *   2. Fetch spot (Yahoo Finance primary, Massive Daily Grouped fallback).
 *   3. For each ticker: fetch 20-40 DTE chain (±30% strikes), calc IV30, store chain.
 *   4. For held option positions with expiries outside 20-40 DTE: fetch those expiries
 *      specifically so portfolio delta% has full greeks coverage.
 *   5. Upsert all IV30 snapshots to underlyings_iv_history.
 *
 * Scheduled daily at 21:30 UTC (4:30 PM ET, 30 min after market close).
 *
 * Env required: MASSIVE_API_KEY, DATABASE_URL_POOLER
 *
 * Usage:
 *   npx tsx scripts/ingest-underlyings-massive.ts                  # auto-detect trading day
 *   npx tsx scripts/ingest-underlyings-massive.ts 2026-04-17       # specific date
 *   npx tsx scripts/ingest-underlyings-massive.ts 2026-04-17 TSLA  # + specific tickers
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '..', '.env.local') });

import { db } from '../src/db';
import { underlyings, optionsChainSnapshots, positions } from '../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { upsertIvSnapshots } from '../src/lib/ingestion/underlyingsIvHistory';
import {
  getSpotPricesFromYahooFinance,
  getSpotPricesFromDailySummary,
} from '../src/lib/ingestion/massive/spot';
import {
  fetchOptionsChain,
  storeOptionsChainSnapshots,
} from '../src/lib/ingestion/massive/optionsChain';
import { calculateIv30FromChain } from '../src/lib/ingestion/massive/iv30';
import { getLastTradingDay } from '../src/lib/ingestion/massive/client';
import { fetchDailyAggs, computeRv, computeAtr } from '../src/lib/ingestion/massive/aggs';
import { sql } from 'drizzle-orm';

function checkEnvironment(): void {
  const required = ['MASSIVE_API_KEY', 'DATABASE_URL_POOLER'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((k) => console.error(`   - ${k}`));
    process.exit(1);
  }
}

checkEnvironment();

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0]!;
}

async function ingestUnderlyingsFromMassive(
  date?: string,
  tickers?: string[]
): Promise<void> {
  const targetDate = date || getLastTradingDay();
  console.log(`🚀 Massive ingestion for date: ${targetDate}\n`);

  // --- Resolve tickers ---
  let tickersToProcess: string[];
  if (tickers && tickers.length > 0) {
    tickersToProcess = tickers.map((t) => t.trim().toUpperCase());
  } else {
    const rows = await db.select({ ticker: underlyings.ticker }).from(underlyings);
    tickersToProcess = rows.map((r) => r.ticker);
  }
  console.log(`📊 Processing ${tickersToProcess.length} tickers\n`);

  // Map ticker → underlyingId
  const underlyingMap = new Map<string, string | null>();
  for (const ticker of tickersToProcess) {
    const row = await db
      .select({ id: underlyings.id })
      .from(underlyings)
      .where(eq(underlyings.ticker, ticker.toUpperCase()))
      .limit(1);
    underlyingMap.set(ticker.toUpperCase(), row[0]?.id ?? null);
  }

  // --- Step 1: Spot prices (Yahoo primary, Massive fallback) ---
  console.log(`📊 Step 1: Spot prices...`);
  let spotPrices = new Map<string, number>();
  try {
    spotPrices = await getSpotPricesFromYahooFinance(targetDate, tickersToProcess);
  } catch (error) {
    console.log(`⚠️  Yahoo Finance failed: ${error instanceof Error ? error.message : error}`);
  }
  if (spotPrices.size === 0) {
    console.log(`    Falling back to Massive Daily Grouped Summary...`);
    try {
      spotPrices = await getSpotPricesFromDailySummary(targetDate, tickersToProcess);
    } catch (error) {
      console.log(
        `⚠️  Massive Daily Grouped failed: ${error instanceof Error ? error.message : error}`
      );
    }
  }
  if (spotPrices.size === 0) {
    console.log(`⚠️  No spot prices; IV30 will be calculated without ATM filtering.`);
  }

  // --- Step 2: Options chain + IV30 per ticker ---
  console.log(`\n📊 Step 2: Options chain snapshots...`);
  const minExpiry = addDays(targetDate, 20);
  const maxExpiry = addDays(targetDate, 40);
  const snapshots: Array<{
    date: string;
    ticker: string;
    spot?: number | null;
    iv30?: number | null;
    source?: string;
  }> = [];
  let processed = 0;
  let errors = 0;

  for (const ticker of tickersToProcess) {
    try {
      const tickerU = ticker.toUpperCase();
      const underlyingId = underlyingMap.get(tickerU) ?? null;
      const spot = spotPrices.get(tickerU) ?? null;

      const strikeMin = spot ? Math.max(0.01, spot * 0.7) : undefined;
      const strikeMax = spot ? spot * 1.3 : undefined;

      console.log(`\n[${ticker}] Fetching chain (DTE 20-40${spot ? ', ±30% strikes' : ''})...`);
      const chain = await fetchOptionsChain({
        ticker,
        minExpiry,
        maxExpiry,
        strikeMin,
        strikeMax,
      });

      if (chain.results && chain.results.length > 0) {
        const stored = await storeOptionsChainSnapshots({
          ticker,
          snapshotDate: targetDate,
          underlyingId,
          spot,
          chain,
        });
        console.log(
          `[${ticker}] Stored ${stored.inserted} contracts (${stored.errors} errors)`
        );
      }

      const iv30 = calculateIv30FromChain(chain, targetDate, spot);
      if (iv30 != null || spot != null) {
        snapshots.push({
          date: targetDate,
          ticker: tickerU,
          spot,
          iv30,
          source: 'massive',
        });
        console.log(
          `[${ticker}] ✅ Spot: ${spot ? spot.toFixed(2) : 'N/A'}, IV30: ${
            iv30 ? (iv30 * 100).toFixed(2) + '%' : 'N/A'
          }`
        );
      }

      processed += 1;
      await new Promise((res) => setTimeout(res, 500));
    } catch (error) {
      errors += 1;
      console.error(
        `[${ticker}] ❌ ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // --- Step 3: Held option expiries outside 20-40 DTE ---
  console.log(`\n📊 Step 3: Greeks for held positions outside standard window...`);
  try {
    const heldOptions = await db
      .select({
        ticker: underlyings.ticker,
        expiry: positions.expiry,
      })
      .from(positions)
      .innerJoin(underlyings, eq(positions.underlyingId, underlyings.id))
      .where(
        and(
          eq(positions.assetClass, 'OPT'),
          sql`${positions.quantity} != 0`,
          sql`${positions.snapshotDate} = (
            SELECT MAX(p2.snapshot_date) FROM positions p2 WHERE p2.account_id = ${positions.accountId}
          )`
        )
      );

    const tickerExpiries = new Map<string, Set<string>>();
    for (const opt of heldOptions) {
      if (!opt.ticker || !opt.expiry) continue;
      const expiryDate = opt.expiry.split('T')[0]!;
      if (!tickerExpiries.has(opt.ticker)) tickerExpiries.set(opt.ticker, new Set());
      tickerExpiries.get(opt.ticker)!.add(expiryDate);
    }

    let heldFetched = 0;
    for (const [ticker, expiries] of tickerExpiries) {
      for (const expiryDate of expiries) {
        // Skip if already captured for today
        const existing = await db
          .select({ id: optionsChainSnapshots.id })
          .from(optionsChainSnapshots)
          .where(
            and(
              eq(optionsChainSnapshots.ticker, ticker),
              eq(optionsChainSnapshots.snapshotDate, targetDate),
              eq(optionsChainSnapshots.expirationDate, expiryDate)
            )
          )
          .limit(1);
        if (existing.length > 0) continue;

        const tickerU = ticker.toUpperCase();
        const underlyingId = underlyingMap.get(tickerU) ?? null;
        const spot = spotPrices.get(tickerU) ?? null;

        try {
          const chain = await fetchOptionsChain({
            ticker,
            minExpiry: expiryDate,
            maxExpiry: expiryDate,
          });
          if (chain.results && chain.results.length > 0) {
            const stored = await storeOptionsChainSnapshots({
              ticker,
              snapshotDate: targetDate,
              underlyingId,
              spot,
              chain,
            });
            heldFetched += stored.inserted;
            console.log(`[${ticker}] Held expiry ${expiryDate}: +${stored.inserted} contracts`);
          }
          await new Promise((res) => setTimeout(res, 300));
        } catch (err) {
          console.log(
            `[${ticker}] Held expiry ${expiryDate} error: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }
    console.log(`✅ Held-position greeks: +${heldFetched} contracts`);
  } catch (err) {
    console.log(
      `⚠️  Held-position step failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // --- Upsert IV30 snapshots ---
  if (snapshots.length > 0) {
    console.log(`\n💾 Upserting ${snapshots.length} IV/spot snapshots...`);
    const result = await upsertIvSnapshots(snapshots);
    console.log(`\n✅ Ingestion complete:`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`     - ${e.ticker}: ${e.error}`));
    }
  } else {
    console.log(`\n⚠️  No data to ingest (${errors} errors)`);
  }

  // --- Step 4: Compute & write rv20/atr20 + mirror denormalized cache ---
  console.log(`\n📊 Step 4: Computing rv20 + atr20 from daily aggs...`);
  const lookbackFrom = (() => {
    const d = new Date(targetDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 45);
    return d.toISOString().split('T')[0]!;
  })();
  let volMetricsWritten = 0;
  let volMetricsErrors = 0;
  for (const ticker of tickersToProcess) {
    const tickerU = ticker.toUpperCase();
    const underlyingId = underlyingMap.get(tickerU) ?? null;
    if (!underlyingId) continue;
    try {
      const bars = await fetchDailyAggs(ticker, lookbackFrom, targetDate);
      if (bars.length < 21) {
        console.log(`[${ticker}] Insufficient history (${bars.length} bars), skipping vol metrics`);
        continue;
      }
      const rv20 = computeRv(bars.map((b) => b.close), 20);
      const atr20 = computeAtr(bars, 20);
      const latest = bars[bars.length - 1];

      // Update today's iv_history row (preserve existing iv30/spot)
      await db.execute(sql`
        UPDATE underlyings_iv_history
        SET rv20 = ${rv20},
            atr20 = ${atr20},
            updated_at = NOW()
        WHERE underlying_id = ${underlyingId}
          AND as_of_date = ${targetDate};
      `);

      // Mirror latest values into underlyings denormalized cache
      const ivForCache = snapshots.find((s) => s.ticker === tickerU)?.iv30 ?? null;
      await db.execute(sql`
        UPDATE underlyings
        SET spot = ${latest.close},
            iv30 = COALESCE(${ivForCache}, iv30),
            rv20 = ${rv20},
            atr20 = ${atr20},
            updated_at = NOW()
        WHERE id = ${underlyingId};
      `);
      volMetricsWritten++;
      await new Promise((res) => setTimeout(res, 150));
    } catch (err) {
      volMetricsErrors++;
      console.log(
        `[${ticker}] vol metrics error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  console.log(
    `✅ Vol metrics: ${volMetricsWritten} written, ${volMetricsErrors} errors`
  );
}

// Run directly
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const dateArg = process.argv[2];
  const tickersArg = process.argv.slice(3);
  ingestUnderlyingsFromMassive(dateArg, tickersArg.length > 0 ? tickersArg : undefined)
    .then(() => {
      console.log('\n✅ Ingestion completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Ingestion failed:', error);
      process.exit(1);
    });
}

export { ingestUnderlyingsFromMassive };
