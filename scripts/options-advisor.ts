/**
 * Options advisor engine (W7 / D11) — hedge scenario.
 *
 * Gathers the data a hedge recommendation needs and emits candidate
 * structures as JSON. Judgment (which structure, why, sizing rationale) is
 * the skill layer's job — this script only does the math.
 *
 * Per ticker with net long exposure ≥ threshold and a chain snapshot:
 *   - protective puts at ~95/90/85% protection in two tenors (~90 / ~180 DTE)
 *   - put spreads (long ~90%, short ~75%) in the same tenors
 *   - cost metrics (% of exposure, annualized), existing-hedge detection,
 *     vol regime context from the latest scanner run
 *
 * Usage:
 *   npx tsx scripts/options-advisor.ts --scenario hedge [--min-exposure 50000]
 *
 * Output: JSON to stdout; progress to stderr.
 */
import { db } from './lib/db';
import { sql } from 'drizzle-orm';

interface ChainRow {
  contract_type: string;
  strike: string;
  expiration_date: string;
  dte: number;
  bid: string | null;
  ask: string | null;
  last: string | null;
  delta: string | null;
  implied_volatility: string | null;
  open_interest: number | null;
  underlying_spot: string | null;
  snapshot_date: string;
}

interface HedgeLeg {
  action: 'buy' | 'sell';
  right: 'put';
  strike: number;
  expiry: string;
  dte: number;
  mid: number;
  delta: number | null;
  iv: number | null;
  openInterest: number | null;
}

interface HedgeStructure {
  type: 'protective_put' | 'put_spread';
  legs: HedgeLeg[];
  metrics: {
    dte: number;
    /** net premium as % of spot (= % of hedged exposure for 1:1 coverage) */
    costPct: number;
    annualizedCostPct: number;
    /** long-put strike / spot — where protection kicks in */
    protectionLevel: number;
    /** put spread only: protection stops at the short strike */
    protectionFloor: number | null;
    /** worst-case loss to protection (plus premium), % of exposure */
    maxLossPct: number;
    /** contracts to hedge the full exposure (100-multiplier; null for crypto) */
    contractsForFullHedge: number | null;
    netPremiumPerContract: number;
  };
}

interface HedgeCandidate {
  ticker: string;
  assetClass: 'STK' | 'CRYPTO';
  exposureUsd: number;
  pctNav: number | null;
  spot: number;
  chainSnapshotDate: string;
  existingHedge: {
    longPuts: number;
    shortCalls: number;
  };
  volContext: {
    regime: string | null;
    ivPercentile252: number | null;
    iv30: number | null;
    ivRv20Ratio: number | null;
    scanDate: string | null;
  } | null;
  structures: HedgeStructure[];
}

function n(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(x) ? null : x;
}

function mid(row: ChainRow): number | null {
  const bid = n(row.bid);
  const ask = n(row.ask);
  if (bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid) return (bid + ask) / 2;
  const last = n(row.last);
  if (last !== null && last > 0) return last;
  return null;
}

const PROTECTION_LEVELS = [0.95, 0.9, 0.85];
const SPREAD_SHORT_LEVEL = 0.75;
const TENOR_TARGETS_DTE = [90, 180];
const TENOR_TOLERANCE = 0.5; // accept expiries within ±50% of target DTE

function pickExpiry(rows: ChainRow[], targetDte: number): string | null {
  const expiries = new Map<string, number>();
  for (const r of rows) expiries.set(r.expiration_date, r.dte);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [expiry, dte] of expiries.entries()) {
    const dist = Math.abs(dte - targetDte);
    if (dist < bestDist && dist <= targetDte * TENOR_TOLERANCE) {
      best = expiry;
      bestDist = dist;
    }
  }
  return best;
}

function pickStrike(rows: ChainRow[], targetStrike: number): ChainRow | null {
  let best: ChainRow | null = null;
  let bestDist = Infinity;
  for (const r of rows) {
    const strike = n(r.strike);
    if (strike === null) continue;
    const dist = Math.abs(strike - targetStrike);
    if (dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  // reject if the nearest listed strike is way off target (>5% of target)
  if (best && Math.abs(n(best.strike)! - targetStrike) > targetStrike * 0.05) return null;
  return best;
}

function toLeg(row: ChainRow, action: 'buy' | 'sell'): HedgeLeg | null {
  const m = mid(row);
  const strike = n(row.strike);
  if (m === null || strike === null) return null;
  return {
    action,
    right: 'put',
    strike,
    expiry: row.expiration_date,
    dte: row.dte,
    mid: Math.round(m * 10000) / 10000,
    delta: n(row.delta),
    iv: n(row.implied_volatility),
    openInterest: row.open_interest,
  };
}

function buildStructures(
  puts: ChainRow[],
  spot: number,
  exposureUsd: number,
  isCrypto: boolean
): HedgeStructure[] {
  const structures: HedgeStructure[] = [];

  for (const targetDte of TENOR_TARGETS_DTE) {
    const expiry = pickExpiry(puts, targetDte);
    if (!expiry) continue;
    const expiryPuts = puts.filter((r) => r.expiration_date === expiry);

    for (const level of PROTECTION_LEVELS) {
      const row = pickStrike(expiryPuts, spot * level);
      if (!row) continue;
      const leg = toLeg(row, 'buy');
      if (!leg) continue;

      const costPct = leg.mid / spot;
      const protectionLevel = leg.strike / spot;
      structures.push({
        type: 'protective_put',
        legs: [leg],
        metrics: {
          dte: leg.dte,
          costPct: round4(costPct),
          annualizedCostPct: round4((costPct * 365) / Math.max(leg.dte, 1)),
          protectionLevel: round4(protectionLevel),
          protectionFloor: null,
          maxLossPct: round4(1 - protectionLevel + costPct),
          contractsForFullHedge: isCrypto ? null : Math.round(exposureUsd / (spot * 100)),
          netPremiumPerContract: round2(leg.mid * (isCrypto ? 1 : 100)),
        },
      });
    }

    // Put spread: long ~90%, short ~75%
    const longRow = pickStrike(expiryPuts, spot * 0.9);
    const shortRow = pickStrike(expiryPuts, spot * SPREAD_SHORT_LEVEL);
    if (longRow && shortRow && n(longRow.strike)! > n(shortRow.strike)!) {
      const longLeg = toLeg(longRow, 'buy');
      const shortLeg = toLeg(shortRow, 'sell');
      if (longLeg && shortLeg) {
        const netCost = longLeg.mid - shortLeg.mid;
        if (netCost > 0) {
          const costPct = netCost / spot;
          structures.push({
            type: 'put_spread',
            legs: [longLeg, shortLeg],
            metrics: {
              dte: longLeg.dte,
              costPct: round4(costPct),
              annualizedCostPct: round4((costPct * 365) / Math.max(longLeg.dte, 1)),
              protectionLevel: round4(longLeg.strike / spot),
              protectionFloor: round4(shortLeg.strike / spot),
              maxLossPct: round4(1 - longLeg.strike / spot + costPct),
              contractsForFullHedge: isCrypto ? null : Math.round(exposureUsd / (spot * 100)),
              netPremiumPerContract: round2(netCost * (isCrypto ? 1 : 100)),
            },
          });
        }
      }
    }
  }

  return structures.sort((a, b) => a.metrics.annualizedCostPct - b.metrics.annualizedCostPct);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

async function main() {
  const args = process.argv.slice(2);
  const scenario = args[args.indexOf('--scenario') + 1] ?? 'hedge';
  if (scenario !== 'hedge') {
    console.error(`Scenario '${scenario}' not implemented yet (hedge only — W7 iterates scenario by scenario)`);
    process.exit(1);
  }
  const minExposureIdx = args.indexOf('--min-exposure');
  const minExposure = minExposureIdx >= 0 ? parseFloat(args[minExposureIdx + 1]) : 50_000;

  console.error(`[advisor] scenario=hedge min-exposure=$${minExposure.toLocaleString()}`);

  // 1. Net exposure per underlying from latest open-position snapshots
  //    (signed market value; STK + CRYPTO only), plus existing option hedges.
  const exposureRows = await db.execute(sql`
    WITH latest AS (
      SELECT p.*
      FROM positions p
      WHERE p.is_open = true
        AND p.snapshot_date = (
          SELECT MAX(p2.snapshot_date) FROM positions p2 WHERE p2.account_id = p.account_id
        )
    )
    SELECT
      u.ticker,
      l.asset_class,
      SUM(CAST(l.market_value_usd AS numeric)) AS exposure_usd,
      COUNT(*) AS position_count
    FROM latest l
    JOIN underlyings u ON u.id = l.underlying_id
    WHERE l.asset_class IN ('STK', 'CRYPTO')
      AND l.market_value_usd IS NOT NULL
    GROUP BY u.ticker, l.asset_class
  `);

  const optionRows = await db.execute(sql`
    WITH latest AS (
      SELECT p.*
      FROM positions p
      WHERE p.is_open = true
        AND p.snapshot_date = (
          SELECT MAX(p2.snapshot_date) FROM positions p2 WHERE p2.account_id = p.account_id
        )
    )
    SELECT
      COALESCE(pu.ticker, u.ticker) AS ticker,
      SUM(CASE WHEN l.option_right = 'P' AND l.quantity > 0 THEN 1 ELSE 0 END) AS long_puts,
      SUM(CASE WHEN l.option_right = 'C' AND l.quantity < 0 THEN 1 ELSE 0 END) AS short_calls
    FROM latest l
    JOIN underlyings u ON u.id = l.underlying_id
    LEFT JOIN underlyings pu ON pu.id = u.parent_underlying_id
    WHERE l.asset_class IN ('OPT')
    GROUP BY COALESCE(pu.ticker, u.ticker)
  `);

  const navRow = await db.execute(sql`
    SELECT SUM(CAST(nav_at_snapshot_usd AS numeric)) AS nav
    FROM portfolio_snapshots ps
    WHERE ps.level = 'account'
      AND ps.snapshot_date = (
        SELECT MAX(ps2.snapshot_date) FROM portfolio_snapshots ps2
        WHERE ps2.account_id = ps.account_id AND ps2.level = 'account'
      )
  `);
  const nav = n(((navRow as unknown as Array<{ nav?: string }>)[0])?.nav ?? null);

  const hedgesByTicker = new Map<string, { longPuts: number; shortCalls: number }>();
  for (const row of optionRows as unknown as Array<{ ticker: string; long_puts: string; short_calls: string }>) {
    hedgesByTicker.set(row.ticker, {
      longPuts: parseInt(row.long_puts) || 0,
      shortCalls: parseInt(row.short_calls) || 0,
    });
  }

  const exposures = (exposureRows as unknown as Array<{
    ticker: string;
    asset_class: 'STK' | 'CRYPTO';
    exposure_usd: string;
  }>)
    .map((r) => ({ ticker: r.ticker, assetClass: r.asset_class, exposureUsd: n(r.exposure_usd) ?? 0 }))
    .filter((r) => r.exposureUsd >= minExposure)
    .sort((a, b) => b.exposureUsd - a.exposureUsd);

  console.error(`[advisor] ${exposures.length} long exposures ≥ threshold`);

  // 2. Latest vol-scan context
  const scanRows = await db.execute(sql`
    SELECT DISTINCT ON (s.ticker)
      s.ticker, s.regime, s.iv_percentile_252, s.iv30, s.iv_rv20_ratio, r.run_date
    FROM vol_scan_ticker_snapshots s
    JOIN vol_scan_runs r ON r.id = s.run_id
    ORDER BY s.ticker, r.run_date DESC
  `);
  const volByTicker = new Map<string, HedgeCandidate['volContext']>();
  for (const row of scanRows as unknown as Array<{
    ticker: string;
    regime: string | null;
    iv_percentile_252: string | null;
    iv30: string | null;
    iv_rv20_ratio: string | null;
    run_date: string;
  }>) {
    volByTicker.set(row.ticker, {
      regime: row.regime,
      ivPercentile252: n(row.iv_percentile_252),
      iv30: n(row.iv30),
      ivRv20Ratio: n(row.iv_rv20_ratio),
      scanDate: row.run_date,
    });
  }

  // 3. Per-candidate chain → structures
  const candidates: HedgeCandidate[] = [];
  const skipped: Array<{ ticker: string; reason: string }> = [];

  for (const exp of exposures) {
    const chainResult = await db.execute(sql`
      SELECT contract_type, strike, expiration_date, dte, bid, ask, last,
             delta, implied_volatility, open_interest, underlying_spot, snapshot_date
      FROM options_chain_snapshots
      WHERE ticker = ${exp.ticker}
        AND contract_type = 'put'
        AND snapshot_date = (
          SELECT MAX(snapshot_date) FROM options_chain_snapshots WHERE ticker = ${exp.ticker}
        )
        AND snapshot_date > CURRENT_DATE - 5
        AND dte BETWEEN 30 AND 290
    `);
    const puts = chainResult as unknown as ChainRow[];
    if (puts.length === 0) {
      skipped.push({ ticker: exp.ticker, reason: 'no recent put chain snapshot' });
      continue;
    }

    const spot = n(puts[0].underlying_spot);
    if (spot === null || spot <= 0) {
      skipped.push({ ticker: exp.ticker, reason: 'chain snapshot has no underlying spot' });
      continue;
    }

    const structures = buildStructures(puts, spot, exp.exposureUsd, exp.assetClass === 'CRYPTO');
    if (structures.length === 0) {
      skipped.push({ ticker: exp.ticker, reason: 'no priceable structures in range' });
      continue;
    }

    candidates.push({
      ticker: exp.ticker,
      assetClass: exp.assetClass,
      exposureUsd: round2(exp.exposureUsd),
      pctNav: nav && nav > 0 ? round4(exp.exposureUsd / nav) : null,
      spot,
      chainSnapshotDate: puts[0].snapshot_date,
      existingHedge: hedgesByTicker.get(exp.ticker) ?? { longPuts: 0, shortCalls: 0 },
      volContext: volByTicker.get(exp.ticker) ?? null,
      structures,
    });
    console.error(
      `[advisor] ${exp.ticker}: $${Math.round(exp.exposureUsd).toLocaleString()} exposure, ${structures.length} structures`
    );
  }

  console.log(
    JSON.stringify(
      {
        scenario: 'hedge',
        generatedAt: new Date().toISOString(),
        nav,
        minExposureUsd: minExposure,
        candidates,
        skipped,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
