#!/usr/bin/env tsx
/**
 * Daily cheap-options scanner — Phase 1 (snapshotting only).
 *
 * For each active watchlist ticker, compute cheapness metrics and write one
 * row to vol_scan_ticker_snapshots. No strategy synthesis in Phase 1.
 *
 * Metrics:
 *   - spot, iv30, rv20           (from underlyings)
 *   - iv_rv20_ratio              (iv30 / rv20)
 *   - iv_percentile_252          (primary cheapness signal, 252d lookback)
 *   - iv_rank_252                (secondary, kept for comparison)
 *   - term_structure_slope       (IV_back_6M - IV_front_1M, both ATM)
 *   - skew_25d                   (25Δ put IV − 25Δ call IV at front expiry)
 *
 * Gates (all thresholds default; overridable via CLI):
 *   is_cheap = (iv_pct ≤ 30 OR iv_rv20 ≤ 1.10)
 *              AND (term_slope ≥ 0 OR back < front)
 *
 * Depends on: ingest-radar-back-months.ts having populated 1M-9M chains
 * earlier in the same day (otherwise term structure + skew will be null).
 *
 * Usage:
 *   npx tsx scripts/scan-cheap-options.ts
 *   npx tsx scripts/scan-cheap-options.ts --dry-run
 *   npx tsx scripts/scan-cheap-options.ts --iv-pct 25 --iv-rv 1.05
 */

import { db, closeDb, schema } from './lib/db.js';
import { and, eq, gte, isNotNull, lte, sql, desc } from 'drizzle-orm';
import { calculateIvMetrics } from '../src/lib/derived/ivMetrics.js';
import { getLastTradingDay } from '../src/lib/ingestion/massive/client.js';

const {
  watchlistEntries,
  underlyings,
  optionsChainSnapshots,
  positions,
  assetTheses,
  volScanRuns,
  volScanTickerSnapshots,
} = schema;

function checkEnv() {
  const required = ['DATABASE_URL_POOLER'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }
}

function parseFlag(name: string, fallback: number): number {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const val = Number(process.argv[idx + 1]);
  return Number.isFinite(val) ? val : fallback;
}

interface RadarRow {
  ticker: string;
  underlyingId: string;
  spot: number | null;
  iv30: number | null;
  rv20: number | null;
}

async function getRadar(): Promise<RadarRow[]> {
  // Read each metric (spot/iv30/rv20) from the most recent underlyings_iv_history
  // row that has it non-null. Backfill and daily ingest may write different
  // metrics on different dates (e.g., backfill writes rv20/atr20 ahead of the
  // next daily ingest's iv30), so per-metric freshness avoids losing data.
  const rows = await db.execute(sql`
    WITH latest_spot AS (
      SELECT DISTINCT ON (underlying_id) underlying_id, spot
      FROM underlyings_iv_history WHERE spot IS NOT NULL
      ORDER BY underlying_id, as_of_date DESC
    ),
    latest_iv30 AS (
      SELECT DISTINCT ON (underlying_id) underlying_id, iv30
      FROM underlyings_iv_history WHERE iv30 IS NOT NULL
      ORDER BY underlying_id, as_of_date DESC
    ),
    latest_rv20 AS (
      SELECT DISTINCT ON (underlying_id) underlying_id, rv20
      FROM underlyings_iv_history WHERE rv20 IS NOT NULL
      ORDER BY underlying_id, as_of_date DESC
    )
    SELECT u.ticker,
           u.id AS underlying_id,
           ls.spot,
           li.iv30,
           lr.rv20
    FROM watchlist_entries we
    JOIN underlyings u ON u.id = we.underlying_id
    LEFT JOIN latest_spot ls ON ls.underlying_id = u.id
    LEFT JOIN latest_iv30 li ON li.underlying_id = u.id
    LEFT JOIN latest_rv20 lr ON lr.underlying_id = u.id
    WHERE we.is_active = true
    ORDER BY u.ticker;
  `);
  const radar = rows as unknown as {
    ticker: string;
    underlying_id: string;
    spot: string | number | null;
    iv30: string | number | null;
    rv20: string | number | null;
  }[];
  return radar.map((r) => ({
    ticker: r.ticker,
    underlyingId: r.underlying_id,
    spot: r.spot != null ? Number(r.spot) : null,
    iv30: r.iv30 != null ? Number(r.iv30) : null,
    rv20: r.rv20 != null ? Number(r.rv20) : null,
  }));
}

interface TermSkewMetrics {
  frontMonthIv: number | null;
  backMonthIv: number | null;
  termStructureSlope: number | null;
  skew25d: number | null;
}

/**
 * Compute term-structure slope (back-month IV − front-month IV) and 25Δ skew
 * from today's options_chain_snapshots rows.
 *
 * Front = ATM calls at DTE 20-40 (avg IV).
 * Back = ATM calls at DTE 150-210 (avg IV).
 * Skew = 25Δ put IV − 25Δ call IV at the nearest expiry (DTE 20-40).
 */
/**
 * Returns the source to read for (ticker, snapshotDate). Prefers 'ibkr' if any
 * IBKR rows exist for that ticker on that date; falls back to 'massive'.
 */
async function getPreferredSource(
  ticker: string,
  snapshotDate: string
): Promise<'ibkr' | 'massive'> {
  const rows = await db
    .select({ id: optionsChainSnapshots.id })
    .from(optionsChainSnapshots)
    .where(
      and(
        eq(optionsChainSnapshots.ticker, ticker.toUpperCase()),
        eq(optionsChainSnapshots.snapshotDate, snapshotDate),
        eq(optionsChainSnapshots.source, 'ibkr')
      )
    )
    .limit(1);
  return rows.length > 0 ? 'ibkr' : 'massive';
}

async function computeTermAndSkew(
  ticker: string,
  snapshotDate: string,
  spot: number | null,
  source: 'ibkr' | 'massive'
): Promise<TermSkewMetrics> {
  if (!spot || spot <= 0) {
    return {
      frontMonthIv: null,
      backMonthIv: null,
      termStructureSlope: null,
      skew25d: null,
    };
  }

  const atmBand = { lo: spot * 0.95, hi: spot * 1.05 };

  const ivAvg = async (dteMin: number, dteMax: number): Promise<number | null> => {
    const rows = await db
      .select({ iv: optionsChainSnapshots.impliedVolatility })
      .from(optionsChainSnapshots)
      .where(
        and(
          eq(optionsChainSnapshots.ticker, ticker.toUpperCase()),
          eq(optionsChainSnapshots.snapshotDate, snapshotDate),
          eq(optionsChainSnapshots.source, source),
          eq(optionsChainSnapshots.contractType, 'call'),
          gte(optionsChainSnapshots.dte, dteMin),
          lte(optionsChainSnapshots.dte, dteMax),
          gte(optionsChainSnapshots.strike, atmBand.lo.toString()),
          lte(optionsChainSnapshots.strike, atmBand.hi.toString()),
          isNotNull(optionsChainSnapshots.impliedVolatility)
        )
      );
    const vals = rows
      .map((r) => (r.iv != null ? Number(r.iv) : NaN))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  const frontMonthIv = await ivAvg(20, 40);
  const backMonthIv = await ivAvg(150, 210);
  const termStructureSlope =
    frontMonthIv != null && backMonthIv != null ? backMonthIv - frontMonthIv : null;

  // 25Δ skew at front expiry: find the earliest DTE 20-40 expiry, then best-matching
  // 25Δ put and call by |delta|.
  const frontExpiryRow = await db
    .select({ expirationDate: optionsChainSnapshots.expirationDate })
    .from(optionsChainSnapshots)
    .where(
      and(
        eq(optionsChainSnapshots.ticker, ticker.toUpperCase()),
        eq(optionsChainSnapshots.snapshotDate, snapshotDate),
        eq(optionsChainSnapshots.source, source),
        gte(optionsChainSnapshots.dte, 20),
        lte(optionsChainSnapshots.dte, 40)
      )
    )
    .orderBy(optionsChainSnapshots.dte)
    .limit(1);

  if (frontExpiryRow.length === 0) {
    return { frontMonthIv, backMonthIv, termStructureSlope, skew25d: null };
  }
  const frontExpiry = frontExpiryRow[0].expirationDate;

  const skewRows = await db
    .select({
      ct: optionsChainSnapshots.contractType,
      iv: optionsChainSnapshots.impliedVolatility,
      delta: optionsChainSnapshots.delta,
    })
    .from(optionsChainSnapshots)
    .where(
      and(
        eq(optionsChainSnapshots.ticker, ticker.toUpperCase()),
        eq(optionsChainSnapshots.snapshotDate, snapshotDate),
        eq(optionsChainSnapshots.source, source),
        eq(optionsChainSnapshots.expirationDate, frontExpiry),
        isNotNull(optionsChainSnapshots.delta),
        isNotNull(optionsChainSnapshots.impliedVolatility)
      )
    );

  const bestMatch = (target: number, ct: 'call' | 'put'): number | null => {
    let best: { iv: number; d: number } | null = null;
    for (const r of skewRows) {
      if (r.ct !== ct) continue;
      const d = r.delta != null ? Number(r.delta) : NaN;
      const iv = r.iv != null ? Number(r.iv) : NaN;
      if (!Number.isFinite(d) || !Number.isFinite(iv) || iv <= 0) continue;
      const diff = Math.abs(d - target);
      if (best === null || diff < Math.abs(best.d - target)) {
        best = { iv, d };
      }
    }
    return best ? best.iv : null;
  };

  const put25 = bestMatch(-0.25, 'put');
  const call25 = bestMatch(0.25, 'call');
  const skew25d = put25 != null && call25 != null ? put25 - call25 : null;

  return { frontMonthIv, backMonthIv, termStructureSlope, skew25d };
}

async function hasOpenPosition(underlyingId: string): Promise<boolean> {
  const rows = await db
    .select({ id: positions.id })
    .from(positions)
    .where(and(eq(positions.underlyingId, underlyingId), eq(positions.isOpen, true)))
    .limit(1);
  return rows.length > 0;
}

async function linkedAssetThesisIds(underlyingId: string): Promise<string[]> {
  const rows = await db
    .select({ id: assetTheses.id })
    .from(assetTheses)
    .where(
      and(
        eq(assetTheses.underlyingId, underlyingId),
        sql`${assetTheses.status} IN ('developing', 'monitoring')`
      )
    );
  return rows.map((r) => r.id);
}

async function main() {
  checkEnv();

  const dryRun = process.argv.includes('--dry-run');
  const ivPctThreshold = parseFlag('--iv-pct', 30);
  const ivRvThreshold = parseFlag('--iv-rv', 1.1);
  const lookbackDays = parseFlag('--lookback', 252);
  const universeSource = 'watchlist';

  const snapshotDate = getLastTradingDay();
  const radar = await getRadar();

  console.log(`\n[SCAN] Date: ${snapshotDate}`);
  console.log(`[SCAN] Universe: ${universeSource} (${radar.length} tickers)`);
  console.log(`[SCAN] Thresholds: iv_pct ≤ ${ivPctThreshold}, iv/rv20 ≤ ${ivRvThreshold}, lookback ${lookbackDays}d`);

  if (radar.length === 0) {
    console.log(`[SCAN] Empty watchlist. Exiting.`);
    await closeDb();
    process.exit(0);
  }

  // Create run record
  let runId: string | null = null;
  if (!dryRun) {
    const run = await db
      .insert(volScanRuns)
      .values({
        runDate: snapshotDate,
        universeSource,
        universeSize: radar.length,
        ivPercentileThreshold: ivPctThreshold.toString(),
        ivRv20RatioThreshold: ivRvThreshold.toString(),
        lookbackDays,
        status: 'running',
      })
      .onConflictDoUpdate({
        target: [volScanRuns.runDate, volScanRuns.universeSource],
        set: {
          universeSize: radar.length,
          ivPercentileThreshold: ivPctThreshold.toString(),
          ivRv20RatioThreshold: ivRvThreshold.toString(),
          lookbackDays,
          status: 'running',
          startedAt: new Date(),
          completedAt: null,
          errorText: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: volScanRuns.id });
    runId = run[0]?.id ?? null;
    if (!runId) throw new Error('Failed to create vol_scan_runs row');
    console.log(`[SCAN] Run id: ${runId}`);
  }

  let processed = 0;
  let cheap = 0;
  let rich = 0;
  let mixed = 0;
  let errors = 0;

  for (const r of radar) {
    try {
      // IV rank + percentile via existing helper (reused from vol-curve)
      const ivMetrics = await calculateIvMetrics(r.ticker, snapshotDate, {
        lookbackDays,
      });

      const ivRv20Ratio =
        r.iv30 != null && r.rv20 != null && r.rv20 > 0 ? r.iv30 / r.rv20 : null;

      const preferredSource = await getPreferredSource(r.ticker, snapshotDate);
      const { frontMonthIv, backMonthIv, termStructureSlope, skew25d } =
        await computeTermAndSkew(r.ticker, snapshotDate, r.spot, preferredSource);

      // --- Cheap regime gates (long vol) ---
      const gateIvPercentile =
        ivMetrics.ivPercentile != null ? ivMetrics.ivPercentile <= ivPctThreshold : null;
      const gateIvRvRatio = ivRv20Ratio != null ? ivRv20Ratio <= ivRvThreshold : null;
      const gateTermNormal = termStructureSlope != null ? termStructureSlope >= 0 : null;
      const gateBackBelowFront =
        backMonthIv != null && frontMonthIv != null ? backMonthIv < frontMonthIv : null;

      // Structural gate is permissive when no data is available — we shouldn't
      // suppress a cheapness verdict purely because the radar back-months
      // ingest hasn't run today.
      const noTermStructureData = gateTermNormal === null && gateBackBelowFront === null;
      const cheapnessPasses =
        (gateIvPercentile === true || gateIvRvRatio === true) &&
        (gateTermNormal === true || gateBackBelowFront === true || noTermStructureData);

      // --- Rich regime gates (short vol / yield harvest) ---
      const IV_PCT_HIGH = 100 - ivPctThreshold; // default 70 when ivPct threshold = 30
      const IV_RV_HIGH = ivRvThreshold + 0.20; // default 1.30 when cheap threshold = 1.10

      const gateIvPercentileHigh =
        ivMetrics.ivPercentile != null ? ivMetrics.ivPercentile >= IV_PCT_HIGH : null;
      const gateIvRvRatioHigh = ivRv20Ratio != null ? ivRv20Ratio >= IV_RV_HIGH : null;
      const gateTermStressed =
        termStructureSlope != null ? termStructureSlope <= 0 : null;
      const gateFrontAboveBack =
        backMonthIv != null && frontMonthIv != null ? frontMonthIv > backMonthIv : null;

      const noRichTermData = gateTermStressed === null && gateFrontAboveBack === null;
      const richnessPasses =
        (gateIvPercentileHigh === true || gateIvRvRatioHigh === true) &&
        (gateTermStressed === true || gateFrontAboveBack === true || noRichTermData);

      const isCheap = cheapnessPasses;
      const isRich = richnessPasses;

      // Regime classification.
      // When both flags trigger (e.g., IV pct high but IV/RV ratio low) → 'mixed'
      // — current dynamics conflict with historical context; needs judgment.
      let regime: 'cheap' | 'rich' | 'neutral' | 'mixed';
      if (isCheap && isRich) regime = 'mixed';
      else if (isCheap) regime = 'cheap';
      else if (isRich) regime = 'rich';
      else regime = 'neutral';

      // --- Cheap score (0-100, higher = cheaper) ---
      let cheapScore = 0;
      if (ivMetrics.ivPercentile != null) {
        cheapScore += (100 - ivMetrics.ivPercentile) * 0.5;
      }
      if (ivRv20Ratio != null) {
        cheapScore += Math.max(0, Math.min(30, (1.5 - ivRv20Ratio) * 60));
      }
      if (gateTermNormal === true || gateBackBelowFront === true) cheapScore += 10;
      cheapScore = Math.max(0, Math.min(100, cheapScore));

      // --- Rich score (0-100, higher = more rich) ---
      let richScore = 0;
      if (ivMetrics.ivPercentile != null) {
        richScore += ivMetrics.ivPercentile * 0.5;
      }
      if (ivRv20Ratio != null) {
        // Higher ratio = more rich. 1.00 → 0, 1.50 → 30.
        richScore += Math.max(0, Math.min(30, (ivRv20Ratio - 1.0) * 60));
      }
      if (gateTermStressed === true || gateFrontAboveBack === true) richScore += 10;
      richScore = Math.max(0, Math.min(100, richScore));

      const score = cheapScore; // preserved name for the existing summary

      const openPos = await hasOpenPosition(r.underlyingId);
      const thesisIds = await linkedAssetThesisIds(r.underlyingId);

      const summary =
        `${r.ticker.padEnd(8)} ` +
        `src=${preferredSource.padEnd(7)} ` +
        `ivPct=${ivMetrics.ivPercentile?.toFixed(1).padStart(5) ?? '  n/a'} ` +
        `iv/rv=${ivRv20Ratio?.toFixed(2) ?? ' n/a'} ` +
        `slope=${termStructureSlope != null ? (termStructureSlope * 100).toFixed(1) + 'pp' : 'n/a'} ` +
        `skew=${skew25d != null ? (skew25d * 100).toFixed(1) + 'pp' : 'n/a'} ` +
        `[${regime.toUpperCase().padEnd(7)}] ` +
        `cheap=${cheapScore.toFixed(0).padStart(3)} rich=${richScore.toFixed(0).padStart(3)}`;
      console.log(`  ${summary}`);

      if (regime === 'cheap') cheap += 1;
      else if (regime === 'rich') rich += 1;
      else if (regime === 'mixed') mixed += 1;
      processed += 1;

      if (dryRun || !runId) continue;

      await db
        .insert(volScanTickerSnapshots)
        .values({
          runId,
          ticker: r.ticker.toUpperCase(),
          underlyingId: r.underlyingId,
          spot: r.spot?.toString() ?? null,
          iv30: r.iv30?.toString() ?? null,
          rv20: r.rv20?.toString() ?? null,
          rv60: null, // Phase 1 skip; require spot history we don't yet store
          ivRv20Ratio: ivRv20Ratio?.toString() ?? null,
          ivRank252: ivMetrics.ivRank != null ? ivMetrics.ivRank.toString() : null,
          ivPercentile252:
            ivMetrics.ivPercentile != null ? ivMetrics.ivPercentile.toString() : null,
          termStructureSlope: termStructureSlope?.toString() ?? null,
          frontMonthIv: frontMonthIv?.toString() ?? null,
          backMonthIv: backMonthIv?.toString() ?? null,
          skew25d: skew25d?.toString() ?? null,
          isCheap,
          cheapnessScore: cheapScore.toString(),
          gateIvPercentile,
          gateIvRvRatio,
          gateTermNormal,
          gateBackBelowFront,
          isRich,
          richnessScore: richScore.toString(),
          gateIvPercentileHigh,
          gateIvRvRatioHigh,
          gateTermStressed,
          gateFrontAboveBack,
          regime,
          hasOpenPosition: openPos,
          linkedAssetThesisIds: thesisIds,
          historyDays: ivMetrics.sampleSize,
          dataSource: preferredSource,
        })
        .onConflictDoUpdate({
          target: [volScanTickerSnapshots.runId, volScanTickerSnapshots.ticker],
          set: {
            spot: r.spot?.toString() ?? null,
            iv30: r.iv30?.toString() ?? null,
            rv20: r.rv20?.toString() ?? null,
            ivRv20Ratio: ivRv20Ratio?.toString() ?? null,
            ivRank252: ivMetrics.ivRank != null ? ivMetrics.ivRank.toString() : null,
            ivPercentile252:
              ivMetrics.ivPercentile != null ? ivMetrics.ivPercentile.toString() : null,
            termStructureSlope: termStructureSlope?.toString() ?? null,
            frontMonthIv: frontMonthIv?.toString() ?? null,
            backMonthIv: backMonthIv?.toString() ?? null,
            skew25d: skew25d?.toString() ?? null,
            isCheap,
            cheapnessScore: cheapScore.toString(),
            gateIvPercentile,
            gateIvRvRatio,
            gateTermNormal,
            gateBackBelowFront,
            isRich,
            richnessScore: richScore.toString(),
            gateIvPercentileHigh,
            gateIvRvRatioHigh,
            gateTermStressed,
            gateFrontAboveBack,
            regime,
            hasOpenPosition: openPos,
            linkedAssetThesisIds: thesisIds,
            historyDays: ivMetrics.sampleSize,
            dataSource: preferredSource,
          },
        });
    } catch (err) {
      errors += 1;
      console.log(
        `  ${r.ticker.padEnd(8)} ❌ ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(
    `\n[SCAN] ✅ Processed ${processed}/${radar.length}. Cheap: ${cheap}, Rich: ${rich}, Mixed: ${mixed}. Errors: ${errors}.`
  );

  if (!dryRun && runId) {
    await db
      .update(volScanRuns)
      .set({
        status: errors === radar.length ? 'error' : 'complete',
        completedAt: new Date(),
        errorText: errors > 0 ? `${errors} ticker errors` : null,
      })
      .where(eq(volScanRuns.id, runId));
  }

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[SCAN] Fatal:', err);
  await closeDb();
  process.exit(1);
});
