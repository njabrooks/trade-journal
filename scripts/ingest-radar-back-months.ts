#!/usr/bin/env tsx
/**
 * Radar back-month chain ingest.
 *
 * For every active watchlist ticker, fetch the nearest monthly (3rd-Friday)
 * option-chain snapshots from 1M to 9M out and upsert into
 * options_chain_snapshots. This populates the data the daily cheap-options
 * scanner needs to compute IV percentile, term structure, and skew.
 *
 * Scoped narrowly: only radar names, only monthly expiries, ±25% strikes.
 * Keeps the Massive daily pull (20-40 DTE only) unchanged.
 *
 * Scheduled ~daily after NYC open (13:45 UTC summer / 14:45 UTC winter).
 *
 * Env required: MASSIVE_API_KEY, DATABASE_URL_POOLER
 *
 * Usage:
 *   npx tsx scripts/ingest-radar-back-months.ts             # all active watchlist
 *   npx tsx scripts/ingest-radar-back-months.ts --dry-run   # report only
 *   npx tsx scripts/ingest-radar-back-months.ts TSLA NVDA   # specific tickers
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and } from 'drizzle-orm';
import { fetchOptionsChain, storeOptionsChainSnapshots } from '../src/lib/ingestion/massive/optionsChain.js';
import { getLastTradingDay } from '../src/lib/ingestion/massive/client.js';
import { getSpotPricesFromYahooFinance } from '../src/lib/ingestion/massive/spot.js';

const { watchlistEntries, underlyings } = schema;

function checkEnv() {
  const required = ['MASSIVE_API_KEY', 'DATABASE_URL_POOLER'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }
}

/**
 * Return the 3rd-Friday date of a given (year, month) as YYYY-MM-DD (UTC).
 * month is 0-indexed (0 = January).
 */
function thirdFriday(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const firstDow = first.getUTCDay(); // 0=Sun..5=Fri..6=Sat
  const offsetToFirstFriday = (5 - firstDow + 7) % 7;
  const day = 1 + offsetToFirstFriday + 14;
  return new Date(Date.UTC(year, month, day)).toISOString().split('T')[0]!;
}

/**
 * Return monthly-expiry ISO dates (3rd Fridays) starting from the next
 * monthly after today.
 *
 * Default: 9 monthlies (1M-9M). With --leap, includes 12M, 15M, 18M, 24M
 * for cheap-vol thesis exposure (matches Radon leap_iv_scanner cadence).
 */
function getMonthlyExpiries(today: Date = new Date(), includeLeaps = false): string[] {
  const todayIso = today.toISOString().split('T')[0]!;

  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  if (thirdFriday(year, month) <= todayIso) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  const monthOffsets = includeLeaps
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 14, 17, 23] // 1-9M plus 12, 15, 18, 24
    : [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return monthOffsets.map((offset) => {
    const d = new Date(Date.UTC(year, month + offset, 1));
    return thirdFriday(d.getUTCFullYear(), d.getUTCMonth());
  });
}

interface RadarTicker {
  ticker: string;
  underlyingId: string;
}

async function getRadarTickers(filter?: string[]): Promise<RadarTicker[]> {
  const rows = await db
    .select({
      ticker: underlyings.ticker,
      underlyingId: underlyings.id,
    })
    .from(watchlistEntries)
    .innerJoin(underlyings, eq(watchlistEntries.underlyingId, underlyings.id))
    .where(eq(watchlistEntries.isActive, true));

  if (filter && filter.length > 0) {
    const set = new Set(filter.map((t) => t.toUpperCase()));
    return rows.filter((r) => set.has(r.ticker.toUpperCase()));
  }
  return rows;
}

async function main() {
  checkEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const includeLeaps = args.includes('--leap');
  const tickerArgs = args.filter((a) => !a.startsWith('--'));

  const snapshotDate = getLastTradingDay();
  const expiries = getMonthlyExpiries(new Date(), includeLeaps);

  console.log(`\n[RADAR] Snapshot date: ${snapshotDate}`);
  console.log(`[RADAR] Monthly expiries: ${expiries.join(', ')}`);

  const radar = await getRadarTickers(tickerArgs.length > 0 ? tickerArgs : undefined);
  console.log(`[RADAR] Active watchlist tickers: ${radar.length}`);

  if (dryRun) {
    console.log(`\n[RADAR] --dry-run: no fetches performed.`);
    console.log(`[RADAR] Would fetch ${radar.length} tickers × ${expiries.length} expiries = ${radar.length * expiries.length} chain requests.`);
    await closeDb();
    process.exit(0);
  }

  if (radar.length === 0) {
    console.log(`[RADAR] Nothing to do.`);
    await closeDb();
    process.exit(0);
  }

  // Best-effort spot prices so we can apply ±25% strike filter.
  console.log(`\n[RADAR] Fetching spot for strike filtering...`);
  const spotMap = await getSpotPricesFromYahooFinance(
    snapshotDate,
    radar.map((r) => r.ticker)
  );

  let totalFetched = 0;
  let tickerErrors = 0;

  for (const { ticker, underlyingId } of radar) {
    const spot = spotMap.get(ticker.toUpperCase()) ?? null;
    const strikeMin = spot ? Math.max(0.01, spot * 0.75) : undefined;
    const strikeMax = spot ? spot * 1.25 : undefined;
    console.log(`\n[RADAR] ${ticker} spot=${spot ? spot.toFixed(2) : 'N/A'}`);

    for (const expiry of expiries) {
      try {
        const chain = await fetchOptionsChain({
          ticker,
          minExpiry: expiry,
          maxExpiry: expiry,
          strikeMin,
          strikeMax,
        });
        if (!chain.results || chain.results.length === 0) {
          console.log(`  ${expiry}: no contracts`);
          continue;
        }
        const stored = await storeOptionsChainSnapshots({
          ticker,
          snapshotDate,
          underlyingId,
          spot,
          chain,
        });
        totalFetched += stored.inserted;
        console.log(`  ${expiry}: +${stored.inserted} contracts (${stored.errors} errors)`);
        await new Promise((res) => setTimeout(res, 250));
      } catch (err) {
        tickerErrors += 1;
        console.log(
          `  ${expiry}: ❌ ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  console.log(`\n[RADAR] ✅ Done. Stored ${totalFetched} contracts; ${tickerErrors} expiry errors.`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[RADAR] Fatal:', err);
  await closeDb();
  process.exit(1);
});
