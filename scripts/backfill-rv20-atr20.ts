#!/usr/bin/env tsx
/**
 * Backfill rv20 + atr20 for all underlyings via Massive daily aggregates.
 *
 * For each ticker that already has IV history (i.e. is part of the daily
 * Massive ingest universe), fetch ~2 years of daily OHLC bars, compute rv20
 * (annualized stdev of log returns over trailing 20 returns) and atr20
 * (avg true range over trailing 20 days) for every date with sufficient
 * history, and upsert into underlyings_iv_history. Also writes the latest
 * computed values back to the underlyings denormalized cache.
 *
 * Idempotent — re-running updates only the rv20/atr20 fields.
 *
 * Usage:
 *   npx tsx scripts/backfill-rv20-atr20.ts                # all tickers
 *   npx tsx scripts/backfill-rv20-atr20.ts --dry-run       # report only
 *   npx tsx scripts/backfill-rv20-atr20.ts TSLA NVDA SPY   # specific tickers
 *   npx tsx scripts/backfill-rv20-atr20.ts --years 1       # narrower window
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql, eq, inArray } from 'drizzle-orm';
import {
  fetchDailyAggs,
  computeRv,
  computeAtr,
  type MassiveDailyBar,
} from '../src/lib/ingestion/massive/aggs.js';

const { underlyings, underlyingsIvHistory } = schema;

function checkEnv() {
  const required = ['MASSIVE_API_KEY', 'DATABASE_URL_POOLER'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0]!;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

interface TickerJob {
  ticker: string;
  underlyingId: string;
}

async function getTickersToBackfill(filter: string[] | null): Promise<TickerJob[]> {
  if (filter && filter.length > 0) {
    const set = filter.map((t) => t.toUpperCase());
    const rows = await db
      .select({ ticker: underlyings.ticker, underlyingId: underlyings.id })
      .from(underlyings)
      .where(inArray(underlyings.ticker, set));
    return rows;
  }
  // Default: any ticker with at least one IV history row.
  const rows = await db.execute(sql`
    SELECT DISTINCT u.ticker, u.id AS underlying_id
    FROM underlyings u
    JOIN underlyings_iv_history h ON h.underlying_id = u.id
    ORDER BY u.ticker;
  `);
  const list = rows as unknown as { ticker: string; underlying_id: string }[];
  return list.map((r) => ({ ticker: r.ticker, underlyingId: r.underlying_id }));
}

interface DateMetrics {
  date: string;
  spot: number;
  rv20: number | null;
  atr20: number | null;
}

function computeRollingMetrics(bars: MassiveDailyBar[]): DateMetrics[] {
  const out: DateMetrics[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const window = bars.slice(0, i + 1); // inclusive of current bar
    const rv = computeRv(
      window.map((b) => b.close),
      20
    );
    const atr = computeAtr(window, 20);
    out.push({ date: bar.date, spot: bar.close, rv20: rv, atr20: atr });
  }
  return out;
}

async function main() {
  checkEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const yearsIdx = args.indexOf('--years');
  const years = yearsIdx >= 0 ? Number(args[yearsIdx + 1]) || 2 : 2;
  const tickerArgs = args.filter((a) => !a.startsWith('--') && Number.isNaN(Number(a)));

  const from = isoDaysAgo(Math.round(years * 365 + 35)); // pad for warmup
  const to = todayIso();

  const jobs = await getTickersToBackfill(tickerArgs.length ? tickerArgs : null);
  console.log(`\n[BACKFILL] Universe: ${jobs.length} tickers`);
  console.log(`[BACKFILL] Date range: ${from} → ${to}`);

  if (dryRun) {
    console.log(`\n[BACKFILL] --dry-run: no fetches/writes.`);
    console.log(`[BACKFILL] Would fetch ${jobs.length} ticker series and compute rv20/atr20 per date.`);
    await closeDb();
    process.exit(0);
  }

  let totalRowsUpdated = 0;
  let totalRowsInserted = 0;
  let tickerErrors = 0;
  const latestCache = new Map<string, { spot: number; rv20: number | null; atr20: number | null; date: string }>();

  for (const { ticker, underlyingId } of jobs) {
    try {
      const bars = await fetchDailyAggs(ticker, from, to);
      if (bars.length === 0) {
        console.log(`  ${ticker.padEnd(8)} no bars returned, skipping`);
        continue;
      }
      const metrics = computeRollingMetrics(bars);
      const withMetrics = metrics.filter((m) => m.rv20 !== null);
      console.log(
        `  ${ticker.padEnd(8)} ${bars.length} bars → ${withMetrics.length} rv20 values (${
          metrics.filter((m) => m.atr20 !== null).length
        } atr20)`
      );

      // Single INSERT ... ON CONFLICT per row — preserves existing iv30/spot
      // (from prior daily ingest) when row already exists, only writes rv20/atr20.
      for (const m of metrics) {
        await db.execute(sql`
          INSERT INTO underlyings_iv_history
            (underlying_id, ticker, as_of_date, spot, rv20, atr20, source, created_at, updated_at)
          VALUES
            (${underlyingId}, ${ticker.toUpperCase()}, ${m.date}, ${m.spot},
             ${m.rv20}, ${m.atr20}, 'massive', NOW(), NOW())
          ON CONFLICT (ticker, as_of_date, source) DO UPDATE SET
            spot = COALESCE(underlyings_iv_history.spot, EXCLUDED.spot),
            rv20 = EXCLUDED.rv20,
            atr20 = EXCLUDED.atr20,
            updated_at = NOW();
        `);
        totalRowsUpdated++;
      }

      const latest = metrics[metrics.length - 1];
      latestCache.set(ticker.toUpperCase(), {
        spot: latest.spot,
        rv20: latest.rv20,
        atr20: latest.atr20,
        date: latest.date,
      });

      await new Promise((res) => setTimeout(res, 200)); // polite pacing
    } catch (err) {
      tickerErrors += 1;
      console.log(
        `  ${ticker.padEnd(8)} ❌ ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Mirror latest values into the underlyings denormalized cache.
  console.log(`\n[BACKFILL] Updating underlyings.* denormalized cache (${latestCache.size} tickers)...`);
  for (const [ticker, latest] of latestCache) {
    await db
      .update(underlyings)
      .set({
        spot: latest.spot.toString(),
        rv20: latest.rv20 != null ? latest.rv20.toString() : null,
        atr20: latest.atr20 != null ? latest.atr20.toString() : null,
        updatedAt: new Date(),
      })
      .where(eq(underlyings.ticker, ticker));
  }

  console.log(
    `\n[BACKFILL] ✅ Done. Inserted ${totalRowsInserted}, updated ${totalRowsUpdated}, ${tickerErrors} ticker errors.`
  );
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[BACKFILL] Fatal:', err);
  await closeDb();
  process.exit(1);
});
