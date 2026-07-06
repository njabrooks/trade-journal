/**
 * Options advisor engine (W7 / D11) — math layer for all scenarios.
 *
 * Emits candidate structures as JSON; judgment (which structure, why, sizing
 * rationale) is the skill layer's job — this script only does the math.
 *
 * Scenarios:
 *   hedge       — cheap downside protection for net long exposures:
 *                 protective puts (~95/90/85% × ~90/180 DTE) + put spreads
 *                 (long ~90% / short ~75%)
 *   income      — covered calls on holds: short calls (~105/110/115% ×
 *                 ~30/60 DTE) with yield + if-assigned return, plus run-up
 *                 context (unrealized % of cost basis)
 *   put_entry   — cash-secured puts on bullish-thesis tickers (~95/90/85% ×
 *                 ~30/60 DTE) with yield-on-collateral + effective entry
 *                 discount; held exposure flagged
 *   collar      — held longs ≥ floor: buy put + sell call, same expiry
 *                 (95/105, 90/110, 90/105 × ~30/90 DTE) with netCostPct
 *                 (negative = credit), floor/cap, callFundingRatio, runUpPct —
 *                 the post-run-up "stay long, protect a few weeks" shape
 *                 (docs/v2/21 Phase 3)
 *   risk_reversal — bullish-thesis tickers: sell ~25Δ put / buy ~25Δ call,
 *                 same expiry (~60/120 DTE) with netCostPct + skewEdgeVolPts
 *                 (put IV − call IV). UNDEFINED downside risk — judgment layer
 *                 must flag + size off short-put collateral (docs/v2/21 Phase 3)
 *   leap_entry  — long-dated calls where realized vol exceeds IV by ≥15 pts on
 *                 bullish-thesis names (docs/v2/21 Phase 2). Vol math delegated
 *                 to radon's leap_iv_scanner.py over the live IB Gateway —
 *                 needs the gateway up (local.ibc-gateway) and works best
 *                 during US market hours; ~1 min/ticker, universe capped.
 *   opportunistic — no structures: context payload (cheap-vol scan hits ×
 *                 theses × held flags; rich-vol holds) for skill judgment
 *
 * Usage:
 *   npx tsx scripts/options-advisor.ts --scenario hedge|income|put_entry|collar|risk_reversal|leap_entry|opportunistic
 *                                      [--min-exposure 50000] [--max-tickers 10]
 *   npx tsx scripts/options-advisor.ts --underlying NVDA
 *     Targeted single-name mode (Phase 5): every applicable structure scenario
 *     for one ticker + portfolio/thesis/regime context — the data surface for
 *     the /thesis express/protect move and /decisions expression follow-on.
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

interface Leg {
  action: 'buy' | 'sell';
  right: 'put' | 'call';
  strike: number;
  expiry: string;
  dte: number;
  mid: number;
  delta: number | null;
  iv: number | null;
  openInterest: number | null;
}

interface Structure {
  type:
    | 'protective_put'
    | 'put_spread'
    | 'covered_call'
    | 'cash_secured_put'
    | 'long_leap_call'
    | 'collar'
    | 'risk_reversal';
  legs: Leg[];
  metrics: Record<string, number | null>;
}

interface VolContext {
  regime: string | null;
  ivPercentile252: number | null;
  iv30: number | null;
  ivRv20Ratio: number | null;
  scanDate: string | null;
}

interface Candidate {
  ticker: string;
  assetClass: 'STK' | 'CRYPTO';
  exposureUsd: number;
  pctNav: number | null;
  spot: number;
  chainSnapshotDate: string;
  existingHedge: { longPuts: number; shortCalls: number };
  volContext: VolContext | null;
  /** income: unrealized PnL as % of cost basis on the held position */
  runUpPct?: number | null;
  /** put_entry: the bullish thesis backing this candidate */
  thesis?: { title: string; status: string; confidence: string | null } | null;
  /** leap_entry: realized-vol context from radon's scanner (annualized %) */
  hv?: { hv20: number; hv60: number; hv252: number; avg: number };
  structures: Structure[];
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

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

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

function toLeg(row: ChainRow, action: 'buy' | 'sell', right: 'put' | 'call'): Leg | null {
  const m = mid(row);
  const strike = n(row.strike);
  if (m === null || strike === null) return null;
  return {
    action,
    right,
    strike,
    expiry: row.expiration_date,
    dte: row.dte,
    mid: Math.round(m * 10000) / 10000,
    delta: n(row.delta),
    iv: n(row.implied_volatility),
    openInterest: row.open_interest,
  };
}

// ---------------------------------------------------------------------------
// Scenario structure builders
// ---------------------------------------------------------------------------

const HEDGE_PROTECTION_LEVELS = [0.95, 0.9, 0.85];
const HEDGE_SPREAD_SHORT_LEVEL = 0.75;
const HEDGE_TENORS_DTE = [90, 180];

function buildHedgeStructures(
  puts: ChainRow[],
  spot: number,
  exposureUsd: number,
  isCrypto: boolean
): Structure[] {
  const structures: Structure[] = [];

  for (const targetDte of HEDGE_TENORS_DTE) {
    const expiry = pickExpiry(puts, targetDte);
    if (!expiry) continue;
    const expiryPuts = puts.filter((r) => r.expiration_date === expiry);

    for (const level of HEDGE_PROTECTION_LEVELS) {
      const row = pickStrike(expiryPuts, spot * level);
      if (!row) continue;
      const leg = toLeg(row, 'buy', 'put');
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
    const shortRow = pickStrike(expiryPuts, spot * HEDGE_SPREAD_SHORT_LEVEL);
    if (longRow && shortRow && n(longRow.strike)! > n(shortRow.strike)!) {
      const longLeg = toLeg(longRow, 'buy', 'put');
      const shortLeg = toLeg(shortRow, 'sell', 'put');
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

  return structures.sort(
    (a, b) => (a.metrics.annualizedCostPct ?? 0) - (b.metrics.annualizedCostPct ?? 0)
  );
}

const INCOME_CALL_LEVELS = [1.05, 1.1, 1.15];
const INCOME_TENORS_DTE = [30, 60];

function buildIncomeStructures(
  calls: ChainRow[],
  spot: number,
  exposureUsd: number,
  isCrypto: boolean
): Structure[] {
  const structures: Structure[] = [];

  for (const targetDte of INCOME_TENORS_DTE) {
    const expiry = pickExpiry(calls, targetDte);
    if (!expiry) continue;
    const expiryCalls = calls.filter((r) => r.expiration_date === expiry);

    for (const level of INCOME_CALL_LEVELS) {
      const row = pickStrike(expiryCalls, spot * level);
      if (!row) continue;
      const leg = toLeg(row, 'sell', 'call');
      if (!leg || leg.mid <= 0) continue;

      const yieldPct = leg.mid / spot;
      structures.push({
        type: 'covered_call',
        legs: [leg],
        metrics: {
          dte: leg.dte,
          premiumYieldPct: round4(yieldPct),
          annualizedYieldPct: round4((yieldPct * 365) / Math.max(leg.dte, 1)),
          strikeHeadroomPct: round4(leg.strike / spot - 1),
          totalReturnIfAssignedPct: round4((leg.strike - spot + leg.mid) / spot),
          contractsForFullCover: isCrypto ? null : Math.round(exposureUsd / (spot * 100)),
          premiumPerContract: round2(leg.mid * (isCrypto ? 1 : 100)),
        },
      });
    }
  }

  // richest annualized yield first — judgment weighs headroom against it
  return structures.sort(
    (a, b) => (b.metrics.annualizedYieldPct ?? 0) - (a.metrics.annualizedYieldPct ?? 0)
  );
}

const PUT_ENTRY_LEVELS = [0.95, 0.9, 0.85];
const PUT_ENTRY_TENORS_DTE = [30, 60];

function buildPutEntryStructures(
  puts: ChainRow[],
  spot: number,
  isCrypto: boolean
): Structure[] {
  const structures: Structure[] = [];
  const multiplier = isCrypto ? 1 : 100;

  for (const targetDte of PUT_ENTRY_TENORS_DTE) {
    const expiry = pickExpiry(puts, targetDte);
    if (!expiry) continue;
    const expiryPuts = puts.filter((r) => r.expiration_date === expiry);

    for (const level of PUT_ENTRY_LEVELS) {
      const row = pickStrike(expiryPuts, spot * level);
      if (!row) continue;
      const leg = toLeg(row, 'sell', 'put');
      if (!leg || leg.mid <= 0) continue;

      const yieldOnCollateral = leg.mid / leg.strike;
      structures.push({
        type: 'cash_secured_put',
        legs: [leg],
        metrics: {
          dte: leg.dte,
          yieldOnCollateralPct: round4(yieldOnCollateral),
          annualizedYieldOnCollateralPct: round4(
            (yieldOnCollateral * 365) / Math.max(leg.dte, 1)
          ),
          entryDiscountPct: round4(1 - leg.strike / spot),
          effectiveEntryDiscountPct: round4(1 - (leg.strike - leg.mid) / spot),
          collateralPerContract: round2(leg.strike * multiplier),
          premiumPerContract: round2(leg.mid * multiplier),
        },
      });
    }
  }

  return structures.sort(
    (a, b) =>
      (b.metrics.annualizedYieldOnCollateralPct ?? 0) -
      (a.metrics.annualizedYieldOnCollateralPct ?? 0)
  );
}

/** Nearest row to a target |delta| (0-1), any strike; null if none within tolerance. */
function pickDelta(rows: ChainRow[], targetAbsDelta: number): ChainRow | null {
  let best: ChainRow | null = null;
  let bestDist = Infinity;
  for (const r of rows) {
    const d = n(r.delta);
    if (d === null) continue;
    const dist = Math.abs(Math.abs(d) - targetAbsDelta);
    if (dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best && bestDist <= 0.12 ? best : null;
}

// collar (docs/v2/21 Phase 3) — stay long but fund downside protection by
// selling upside: buy put + sell call, same expiry. The 30-DTE tenor is the
// post-run-up "less bullish for a few weeks" shape; 90-DTE the standing collar.
const COLLAR_TENORS_DTE = [30, 90];
const COLLAR_COMBOS: Array<{ put: number; call: number }> = [
  { put: 0.95, call: 1.05 },
  { put: 0.9, call: 1.1 },
  { put: 0.9, call: 1.05 },
];

function buildCollarStructures(
  puts: ChainRow[],
  calls: ChainRow[],
  spot: number,
  exposureUsd: number,
  isCrypto: boolean
): Structure[] {
  const structures: Structure[] = [];
  const multiplier = isCrypto ? 1 : 100;

  for (const targetDte of COLLAR_TENORS_DTE) {
    const expiry = pickExpiry(puts, targetDte);
    if (!expiry) continue;
    const expiryPuts = puts.filter((r) => r.expiration_date === expiry);
    const expiryCalls = calls.filter((r) => r.expiration_date === expiry);
    if (expiryCalls.length === 0) continue;

    for (const combo of COLLAR_COMBOS) {
      const putRow = pickStrike(expiryPuts, spot * combo.put);
      const callRow = pickStrike(expiryCalls, spot * combo.call);
      if (!putRow || !callRow) continue;
      const putLeg = toLeg(putRow, 'buy', 'put');
      const callLeg = toLeg(callRow, 'sell', 'call');
      if (!putLeg || !callLeg || callLeg.mid <= 0) continue;
      if (putLeg.strike >= callLeg.strike) continue;

      const netCost = putLeg.mid - callLeg.mid; // negative = credit collar
      const netCostPct = netCost / spot;
      const floorPct = putLeg.strike / spot;
      const capPct = callLeg.strike / spot;
      structures.push({
        type: 'collar',
        legs: [putLeg, callLeg],
        metrics: {
          dte: putLeg.dte,
          netCostPct: round4(netCostPct),
          floorPct: round4(floorPct),
          capPct: round4(capPct),
          maxLossPct: round4(1 - floorPct + netCostPct),
          maxGainPct: round4(capPct - 1 - netCostPct),
          callFundingRatio: putLeg.mid > 0 ? round4(callLeg.mid / putLeg.mid) : null,
          contractsForFullCover: isCrypto ? null : Math.round(exposureUsd / (spot * 100)),
          netPremiumPerContract: round2(netCost * multiplier),
        },
      });
    }
  }

  // cheapest protection first (credit collars sort ahead of debit ones)
  return structures.sort((a, b) => (a.metrics.netCostPct ?? 0) - (b.metrics.netCostPct ?? 0));
}

// risk_reversal (docs/v2/21 Phase 3) — bullish skew harvest: sell the rich OTM
// put (~25Δ), buy the cheap OTM call (~25Δ), same expiry. Undefined downside
// risk — the skill must always flag it and size off the short-put collateral.
const RR_TENORS_DTE = [60, 120];
const RR_TARGET_DELTA = 0.25;

function buildRiskReversalStructures(
  puts: ChainRow[],
  calls: ChainRow[],
  spot: number,
  isCrypto: boolean
): Structure[] {
  const structures: Structure[] = [];
  const multiplier = isCrypto ? 1 : 100;

  for (const targetDte of RR_TENORS_DTE) {
    const expiry = pickExpiry(puts, targetDte);
    if (!expiry) continue;
    const expiryPuts = puts.filter((r) => r.expiration_date === expiry && n(r.strike)! < spot);
    const expiryCalls = calls.filter((r) => r.expiration_date === expiry && n(r.strike)! > spot);

    const putRow = pickDelta(expiryPuts, RR_TARGET_DELTA) ?? pickStrike(expiryPuts, spot * 0.9);
    const callRow = pickDelta(expiryCalls, RR_TARGET_DELTA) ?? pickStrike(expiryCalls, spot * 1.1);
    if (!putRow || !callRow) continue;
    const putLeg = toLeg(putRow, 'sell', 'put');
    const callLeg = toLeg(callRow, 'buy', 'call');
    if (!putLeg || !callLeg || putLeg.mid <= 0) continue;

    const netCost = callLeg.mid - putLeg.mid; // negative = credit
    const skewEdge =
      putLeg.iv !== null && callLeg.iv !== null ? putLeg.iv - callLeg.iv : null;
    structures.push({
      type: 'risk_reversal',
      legs: [putLeg, callLeg],
      metrics: {
        dte: putLeg.dte,
        netCostPct: round4(netCost / spot),
        skewEdgeVolPts: skewEdge !== null ? round2(skewEdge * 100) : null,
        putStrikePct: round4(putLeg.strike / spot),
        callStrikePct: round4(callLeg.strike / spot),
        putDelta: putLeg.delta !== null ? round4(putLeg.delta) : null,
        callDelta: callLeg.delta !== null ? round4(callLeg.delta) : null,
        collateralPerContract: round2(putLeg.strike * multiplier),
        netPremiumPerContract: round2(netCost * multiplier),
      },
    });
  }

  // biggest skew edge first
  return structures.sort(
    (a, b) => (b.metrics.skewEdgeVolPts ?? -Infinity) - (a.metrics.skewEdgeVolPts ?? -Infinity)
  );
}

// ---------------------------------------------------------------------------
// Shared data loaders
// ---------------------------------------------------------------------------

interface ExposureRow {
  ticker: string;
  assetClass: 'STK' | 'CRYPTO';
  exposureUsd: number;
  unrealizedUsd: number | null;
  costBasisUsd: number | null;
}

async function loadExposures(): Promise<ExposureRow[]> {
  const rows = await db.execute(sql`
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
      SUM(CAST(l.unrealized_pnl AS numeric)) AS unrealized_usd,
      SUM(ABS(CAST(l.cost_basis_money AS numeric))) AS cost_basis_usd
    FROM latest l
    JOIN underlyings u ON u.id = l.underlying_id
    WHERE l.asset_class IN ('STK', 'CRYPTO')
      AND l.market_value_usd IS NOT NULL
    GROUP BY u.ticker, l.asset_class
  `);
  return (rows as unknown as Array<{
    ticker: string;
    asset_class: 'STK' | 'CRYPTO';
    exposure_usd: string;
    unrealized_usd: string | null;
    cost_basis_usd: string | null;
  }>).map((r) => ({
    ticker: r.ticker,
    assetClass: r.asset_class,
    exposureUsd: n(r.exposure_usd) ?? 0,
    unrealizedUsd: n(r.unrealized_usd),
    costBasisUsd: n(r.cost_basis_usd),
  }));
}

async function loadOptionOverlays(): Promise<Map<string, { longPuts: number; shortCalls: number }>> {
  const rows = await db.execute(sql`
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
  const out = new Map<string, { longPuts: number; shortCalls: number }>();
  for (const row of rows as unknown as Array<{ ticker: string; long_puts: string; short_calls: string }>) {
    out.set(row.ticker, {
      longPuts: parseInt(row.long_puts) || 0,
      shortCalls: parseInt(row.short_calls) || 0,
    });
  }
  return out;
}

async function loadNav(): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT SUM(CAST(nav_at_snapshot_usd AS numeric)) AS nav
    FROM portfolio_snapshots ps
    WHERE ps.level = 'account'
      AND ps.snapshot_date = (
        SELECT MAX(ps2.snapshot_date) FROM portfolio_snapshots ps2
        WHERE ps2.account_id = ps.account_id AND ps2.level = 'account'
      )
  `);
  return n(((rows as unknown as Array<{ nav?: string }>)[0])?.nav ?? null);
}

async function loadVolContexts(): Promise<Map<string, VolContext>> {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (s.ticker)
      s.ticker, s.regime, s.iv_percentile_252, s.iv30, s.iv_rv20_ratio, r.run_date
    FROM vol_scan_ticker_snapshots s
    JOIN vol_scan_runs r ON r.id = s.run_id
    ORDER BY s.ticker, r.run_date DESC
  `);
  const out = new Map<string, VolContext>();
  for (const row of rows as unknown as Array<{
    ticker: string;
    regime: string | null;
    iv_percentile_252: string | null;
    iv30: string | null;
    iv_rv20_ratio: string | null;
    run_date: string;
  }>) {
    out.set(row.ticker, {
      regime: row.regime,
      ivPercentile252: n(row.iv_percentile_252),
      iv30: n(row.iv30),
      ivRv20Ratio: n(row.iv_rv20_ratio),
      scanDate: row.run_date,
    });
  }
  return out;
}

interface ThesisRow {
  ticker: string;
  title: string;
  status: string;
  confidence: string | null;
}

async function loadBullishTheses(): Promise<Map<string, ThesisRow>> {
  const rows = await db.execute(sql`
    SELECT u.ticker, at.title, at.status, at.confidence_level
    FROM asset_theses at
    JOIN underlyings u ON u.id = at.underlying_id
    WHERE at.direction = 'bullish'
      AND at.status IN ('developing', 'monitoring', 'active')
  `);
  const out = new Map<string, ThesisRow>();
  for (const row of rows as unknown as Array<{
    ticker: string;
    title: string;
    status: string;
    confidence_level: string | null;
  }>) {
    // one thesis per ticker is the norm; last write wins otherwise
    out.set(row.ticker, {
      ticker: row.ticker,
      title: row.title,
      status: row.status,
      confidence: row.confidence_level,
    });
  }
  return out;
}

async function loadChain(ticker: string, contractType: 'put' | 'call', maxDte: number): Promise<ChainRow[]> {
  const rows = await db.execute(sql`
    SELECT contract_type, strike, expiration_date, dte, bid, ask, last,
           delta, implied_volatility, open_interest, underlying_spot, snapshot_date
    FROM options_chain_snapshots
    WHERE ticker = ${ticker}
      AND contract_type = ${contractType}
      AND snapshot_date = (
        SELECT MAX(snapshot_date) FROM options_chain_snapshots WHERE ticker = ${ticker}
      )
      AND snapshot_date > CURRENT_DATE - 5
      AND dte BETWEEN 15 AND ${maxDte}
  `);
  return rows as unknown as ChainRow[];
}

// ---------------------------------------------------------------------------
// Scenario runners
// ---------------------------------------------------------------------------

interface ScenarioOutput {
  scenario: string;
  generatedAt: string;
  nav: number | null;
  minExposureUsd?: number;
  candidates?: Candidate[];
  skipped?: Array<{ ticker: string; reason: string }>;
  /** opportunistic only */
  context?: unknown;
}

type StructureScenario = 'hedge' | 'income' | 'put_entry' | 'collar' | 'risk_reversal';

async function runStructureScenario(
  scenario: StructureScenario,
  minExposure: number
): Promise<ScenarioOutput> {
  // Sequential on purpose: scripts/lib/db.ts pools max 1 connection and
  // concurrent execute() calls deadlock it.
  const exposureRows = await loadExposures();
  const hedges = await loadOptionOverlays();
  const nav = await loadNav();
  const vol = await loadVolContexts();
  const theses = await loadBullishTheses();
  const exposureByTicker = new Map(exposureRows.map((e) => [e.ticker, e]));

  // Candidate tickers per scenario: thesis-driven (held or not) vs exposure-driven
  const thesisDriven = scenario === 'put_entry' || scenario === 'risk_reversal';
  let targets: Array<{ ticker: string; assetClass: 'STK' | 'CRYPTO' }>;
  if (thesisDriven) {
    targets = [...theses.keys()].map((ticker) => ({
      ticker,
      assetClass: exposureByTicker.get(ticker)?.assetClass ?? 'STK',
    }));
  } else {
    targets = exposureRows
      .filter((e) => e.exposureUsd >= minExposure)
      .sort((a, b) => b.exposureUsd - a.exposureUsd)
      .map((e) => ({ ticker: e.ticker, assetClass: e.assetClass }));
  }
  console.error(`[advisor] scenario=${scenario}: ${targets.length} candidate tickers`);

  const candidates: Candidate[] = [];
  const skipped: Array<{ ticker: string; reason: string }> = [];

  // collar + risk_reversal need both sides of the chain
  const dualChain = scenario === 'collar' || scenario === 'risk_reversal';

  for (const target of targets) {
    const contractType = scenario === 'income' ? 'call' : 'put';
    const maxDte = scenario === 'hedge' ? 290 : scenario === 'risk_reversal' ? 190 : 120;
    const chain = await loadChain(target.ticker, contractType, maxDte);
    const callChain = dualChain ? await loadChain(target.ticker, 'call', maxDte) : [];
    if (chain.length === 0 || (dualChain && callChain.length === 0)) {
      skipped.push({
        ticker: target.ticker,
        reason: `no recent ${chain.length === 0 ? contractType : 'call'} chain snapshot`,
      });
      continue;
    }
    const spot = n(chain[0].underlying_spot);
    if (spot === null || spot <= 0) {
      skipped.push({ ticker: target.ticker, reason: 'chain snapshot has no underlying spot' });
      continue;
    }

    const exposure = exposureByTicker.get(target.ticker);
    const exposureUsd = exposure?.exposureUsd ?? 0;
    const isCrypto = target.assetClass === 'CRYPTO';

    // collar only makes sense on a held long — skip unheld/small names
    if (scenario === 'collar' && exposureUsd < minExposure) {
      skipped.push({ ticker: target.ticker, reason: 'no held exposure ≥ floor to collar' });
      continue;
    }

    let structures: Structure[];
    if (scenario === 'hedge') {
      structures = buildHedgeStructures(chain, spot, exposureUsd, isCrypto);
    } else if (scenario === 'income') {
      structures = buildIncomeStructures(chain, spot, exposureUsd, isCrypto);
    } else if (scenario === 'collar') {
      structures = buildCollarStructures(chain, callChain, spot, exposureUsd, isCrypto);
    } else if (scenario === 'risk_reversal') {
      structures = buildRiskReversalStructures(chain, callChain, spot, isCrypto);
    } else {
      structures = buildPutEntryStructures(chain, spot, isCrypto);
    }
    if (structures.length === 0) {
      skipped.push({ ticker: target.ticker, reason: 'no priceable structures in range' });
      continue;
    }

    // run-up context: core input for income AND collar (the post-run-up shape)
    const runUpPct =
      (scenario === 'income' || scenario === 'collar') &&
      exposure?.unrealizedUsd != null &&
      exposure?.costBasisUsd != null &&
      exposure.costBasisUsd > 0
        ? round4(exposure.unrealizedUsd / exposure.costBasisUsd)
        : undefined;

    candidates.push({
      ticker: target.ticker,
      assetClass: target.assetClass,
      exposureUsd: round2(exposureUsd),
      pctNav: nav && nav > 0 ? round4(exposureUsd / nav) : null,
      spot,
      chainSnapshotDate: chain[0].snapshot_date,
      existingHedge: hedges.get(target.ticker) ?? { longPuts: 0, shortCalls: 0 },
      volContext: vol.get(target.ticker) ?? null,
      ...(runUpPct !== undefined ? { runUpPct } : {}),
      ...(thesisDriven ? { thesis: theses.get(target.ticker) ?? null } : {}),
      structures,
    });
    console.error(
      `[advisor] ${target.ticker}: $${Math.round(exposureUsd).toLocaleString()} exposure, ${structures.length} structures`
    );
  }

  return {
    scenario,
    generatedAt: new Date().toISOString(),
    nav,
    minExposureUsd: minExposure,
    candidates,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// leap_entry (docs/v2/21 Phase 2) — long-dated calls where realized vol exceeds
// implied by ≥15 pts, i.e. cheap long-vol expression of a bullish thesis. The
// vol math lives in radon's IB-only scanner (leap_iv_scanner.py, subprocess);
// this runner owns the thesis-derived universe + portfolio context. Needs the
// IB Gateway (local.ibc-gateway) and US market hours for full chain quotes.
// ---------------------------------------------------------------------------

const RADON_ROOT = '/Users/home-hub/projects/radon';
const RADON_PY = `${RADON_ROOT}/.venv/bin/python3`;
const LEAP_CLIENT_ID = '31'; // trade-journal's IB client_id range is 20-49
// Delayed market data (no subscription on the API username yet) runs ~2-4 min/ticker;
// scale the kill switch with the universe instead of a flat cap (10 tickers timed out
// at a flat 30 min on 2026-07-06). Live data is much faster; the cap just stops hangs.
const leapScanTimeoutMs = (tickers: number) => Math.max(20, tickers * 4.5) * 60 * 1000;

interface LeapScanOption {
  ticker: string;
  expiry: string;
  strike: number;
  right: string;
  delta: number;
  iv: number;
  bid: number;
  ask: number;
  mid: number;
  vega: number;
  theta: number;
  oi: number;
  volume: number;
  hv_20_gap: number;
  hv_60_gap: number;
  hv_avg_gap: number;
  is_mispriced: boolean;
  mispricing_score: number;
}

interface LeapScanResult {
  ticker: string;
  price: number;
  hv_20: number;
  hv_60: number;
  hv_252: number;
  avg_hv: number;
  mispriced_count: number;
  options: LeapScanOption[];
}

/** Bullish-thesis tickers that IB can plausibly quote LEAPs on (equities/ETFs;
 *  crypto/perp/futures theses are excluded — the scanner can't qualify them). */
async function loadLeapUniverse(): Promise<Map<string, ThesisRow>> {
  const rows = await db.execute(sql`
    SELECT u.ticker, at.title, at.status, at.confidence_level
    FROM asset_theses at
    JOIN underlyings u ON u.id = at.underlying_id
    WHERE at.direction = 'bullish'
      AND at.status IN ('developing', 'monitoring', 'active')
      AND (u.asset_class = 'STK' OR u.asset_class IS NULL)
  `);
  const out = new Map<string, ThesisRow>();
  for (const row of rows as unknown as Array<{
    ticker: string;
    title: string;
    status: string;
    confidence_level: string | null;
  }>) {
    out.set(row.ticker, {
      ticker: row.ticker,
      title: row.title,
      status: row.status,
      confidence: row.confidence_level,
    });
  }
  return out;
}

async function runLeapEntryScenario(maxTickers: number): Promise<ScenarioOutput> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  const execFileP = promisify(execFile);

  // Sequential on purpose: scripts/lib/db.ts pools max 1 connection.
  const exposureRows = await loadExposures();
  const hedges = await loadOptionOverlays();
  const nav = await loadNav();
  const vol = await loadVolContexts();
  const universe = await loadLeapUniverse();
  const exposureByTicker = new Map(exposureRows.map((e) => [e.ticker, e]));

  // Rank: monitoring before developing, then confidence, then held exposure —
  // the scan is ~1 min/ticker on IB so the universe is capped.
  const confWeight: Record<string, number> = { high: 3, medium: 2, low: 1, exploratory: 0 };
  const ranked = [...universe.values()].sort((a, b) => {
    const statusDelta = Number(b.status === 'monitoring') - Number(a.status === 'monitoring');
    if (statusDelta !== 0) return statusDelta;
    const confDelta = (confWeight[b.confidence ?? ''] ?? 0) - (confWeight[a.confidence ?? ''] ?? 0);
    if (confDelta !== 0) return confDelta;
    return (
      (exposureByTicker.get(b.ticker)?.exposureUsd ?? 0) -
      (exposureByTicker.get(a.ticker)?.exposureUsd ?? 0)
    );
  });
  const targets = ranked.slice(0, maxTickers);
  const dropped = ranked.slice(maxTickers).map((t) => t.ticker);
  console.error(
    `[advisor] scenario=leap_entry: scanning ${targets.length}/${ranked.length} bullish-thesis tickers` +
      (dropped.length ? ` (capped, dropped: ${dropped.join(' ')})` : '')
  );

  // Radon scanner run: writes <output>.html + <output>.json
  const outputHtml = join(process.cwd(), 'logs', 'advisor-leap-scan.html');
  await execFileP(
    RADON_PY,
    [
      'scripts/leap_iv_scanner.py',
      ...targets.map((t) => t.ticker),
      '--client-id',
      LEAP_CLIENT_ID,
      '--json',
      '--output',
      outputHtml,
    ],
    { cwd: RADON_ROOT, timeout: leapScanTimeoutMs(targets.length), maxBuffer: 32 * 1024 * 1024 }
  );
  const scan = JSON.parse(await readFile(outputHtml.replace(/\.html$/, '.json'), 'utf8')) as {
    scan_time: string;
    results: LeapScanResult[];
  };

  const candidates: Candidate[] = [];
  const skipped: Array<{ ticker: string; reason: string }> = dropped.map((ticker) => ({
    ticker,
    reason: 'universe capped (--max-tickers)',
  }));
  const scannedTickers = new Set(scan.results.map((r) => r.ticker));
  for (const t of targets) {
    if (!scannedTickers.has(t.ticker)) {
      skipped.push({ ticker: t.ticker, reason: 'scanner could not qualify/fetch (see logs)' });
    }
  }

  for (const result of scan.results) {
    const mispriced = result.options
      .filter((o) => o.is_mispriced)
      .sort((a, b) => b.mispricing_score - a.mispricing_score);
    if (mispriced.length === 0) {
      skipped.push({ ticker: result.ticker, reason: 'no mispriced LEAPs (IV not below realized vol)' });
      continue;
    }
    const exposure = exposureByTicker.get(result.ticker);
    const exposureUsd = exposure?.exposureUsd ?? 0;
    candidates.push({
      ticker: result.ticker,
      assetClass: 'STK',
      exposureUsd: round2(exposureUsd),
      pctNav: nav && nav > 0 ? round4(exposureUsd / nav) : null,
      spot: result.price,
      chainSnapshotDate: scan.scan_time.slice(0, 10),
      existingHedge: hedges.get(result.ticker) ?? { longPuts: 0, shortCalls: 0 },
      volContext: vol.get(result.ticker) ?? null,
      thesis: universe.get(result.ticker) ?? null,
      hv: {
        hv20: result.hv_20,
        hv60: result.hv_60,
        hv252: result.hv_252,
        avg: result.avg_hv,
      },
      structures: mispriced.slice(0, 4).map((o) => ({
        type: 'long_leap_call' as const,
        legs: [
          {
            action: 'buy' as const,
            right: 'call' as const,
            strike: o.strike,
            expiry: o.expiry,
            dte: Math.round((new Date(
              `${o.expiry.slice(0, 4)}-${o.expiry.slice(4, 6)}-${o.expiry.slice(6, 8)}`
            ).getTime() - Date.now()) / 86_400_000),
            mid: o.mid,
            delta: o.delta,
            iv: o.iv,
            openInterest: o.oi,
          },
        ],
        metrics: {
          iv: round2(o.iv),
          hv20Gap: round2(o.hv_20_gap),
          hv60Gap: round2(o.hv_60_gap),
          avgHvGap: round2(o.hv_avg_gap),
          mispricingScore: round2(o.mispricing_score),
          vega: round4(o.vega),
          theta: round4(o.theta),
          volume: o.volume,
        },
      })),
    });
    console.error(
      `[advisor] ${result.ticker}: ${mispriced.length} mispriced LEAPs (best gap ${mispriced[0].hv_20_gap.toFixed(1)} vs HV20)`
    );
  }

  return {
    scenario: 'leap_entry',
    generatedAt: new Date().toISOString(),
    nav,
    candidates,
    skipped,
  };
}

async function runOpportunisticScenario(): Promise<ScenarioOutput> {
  // Sequential on purpose: scripts/lib/db.ts pools max 1 connection and
  // concurrent execute() calls deadlock it.
  const exposureRows = await loadExposures();
  const nav = await loadNav();
  const vol = await loadVolContexts();
  const theses = await loadBullishTheses();
  const exposureByTicker = new Map(exposureRows.map((e) => [e.ticker, e]));

  const cheapEntries: unknown[] = [];
  const richHolds: unknown[] = [];
  for (const [ticker, v] of vol.entries()) {
    const held = exposureByTicker.get(ticker);
    const thesis = theses.get(ticker);
    if (v.regime === 'cheap' && (thesis || held)) {
      cheapEntries.push({
        ticker,
        ivPercentile252: v.ivPercentile252,
        ivRv20Ratio: v.ivRv20Ratio,
        thesis: thesis ?? null,
        heldExposureUsd: held ? round2(held.exposureUsd) : null,
      });
    }
    if (v.regime === 'rich' && held && held.exposureUsd > 0) {
      richHolds.push({
        ticker,
        ivPercentile252: v.ivPercentile252,
        heldExposureUsd: round2(held.exposureUsd),
        thesis: thesis ?? null,
      });
    }
  }

  return {
    scenario: 'opportunistic',
    generatedAt: new Date().toISOString(),
    nav,
    context: {
      note: 'No mechanical structures — judgment scenario. cheapEntries: long-vol expressions for thesis/held names (use /analyze-vol-curve for strike work). richHolds: premium-selling overlaps with the income scenario.',
      cheapEntries,
      richHolds,
      topExposures: exposureRows
        .sort((a, b) => b.exposureUsd - a.exposureUsd)
        .slice(0, 10)
        .map((e) => ({ ticker: e.ticker, exposureUsd: round2(e.exposureUsd) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Targeted single-name mode (docs/v2/21 Phase 5) — every applicable structure
// scenario for ONE underlying, for the express/protect dialogue in /thesis and
// /decisions. Ephemeral: callers judge conversationally; nothing is stored
// unless the user acts (then save a batch + PATCH it acted). leap_entry is
// excluded (its IB scan is a scheduled/on-demand job, not a dialogue-speed call).
// ---------------------------------------------------------------------------

async function runTargetedUnderlying(ticker: string): Promise<Record<string, unknown>> {
  // Sequential on purpose: scripts/lib/db.ts pools max 1 connection.
  const exposureRows = await loadExposures();
  const hedges = await loadOptionOverlays();
  const nav = await loadNav();
  const vol = await loadVolContexts();
  const theses = await loadBullishTheses();

  const exposure = exposureRows.find((e) => e.ticker === ticker);
  const thesis = theses.get(ticker) ?? null;
  const exposureUsd = exposure?.exposureUsd ?? 0;
  const isCrypto = exposure?.assetClass === 'CRYPTO';
  const held = exposureUsd > 0;

  // Latest regime read for the dialogue's risk framing
  const regimeRows = await db.execute(sql`
    SELECT DISTINCT ON (source) source, band, score, scan_time
    FROM regime_snapshots ORDER BY source, scan_time DESC
  `);

  const puts = await loadChain(ticker, 'put', 190);
  const calls = await loadChain(ticker, 'call', 190);
  const spot = n(puts[0]?.underlying_spot ?? calls[0]?.underlying_spot ?? null);

  const scenarios: Record<string, Structure[]> = {};
  const notes: string[] = [];
  if (spot === null || (puts.length === 0 && calls.length === 0)) {
    notes.push('no recent chain snapshot — structures unavailable (listed options may not exist)');
  } else {
    if (held) {
      scenarios.hedge = buildHedgeStructures(puts, spot, exposureUsd, isCrypto);
      if (calls.length > 0) {
        scenarios.income = buildIncomeStructures(calls, spot, exposureUsd, isCrypto);
        scenarios.collar = buildCollarStructures(puts, calls, spot, exposureUsd, isCrypto);
      }
    } else {
      notes.push('not held — hedge/income/collar omitted');
    }
    if (thesis) {
      scenarios.put_entry = buildPutEntryStructures(puts, spot, isCrypto);
      if (calls.length > 0) {
        scenarios.risk_reversal = buildRiskReversalStructures(puts, calls, spot, isCrypto);
      }
    } else {
      notes.push('no bullish thesis — put_entry/risk_reversal omitted');
    }
    notes.push('leap_entry excluded from targeted mode — run --scenario leap_entry or wait for the 15:20 job');
  }

  const runUpPct =
    exposure?.unrealizedUsd != null && exposure?.costBasisUsd != null && exposure.costBasisUsd > 0
      ? round4(exposure.unrealizedUsd / exposure.costBasisUsd)
      : null;

  return {
    mode: 'targeted',
    underlying: ticker,
    generatedAt: new Date().toISOString(),
    context: {
      spot,
      chainSnapshotDate: puts[0]?.snapshot_date ?? calls[0]?.snapshot_date ?? null,
      exposureUsd: round2(exposureUsd),
      pctNav: nav && nav > 0 ? round4(exposureUsd / nav) : null,
      runUpPct,
      thesis,
      existingHedge: hedges.get(ticker) ?? { longPuts: 0, shortCalls: 0 },
      volContext: vol.get(ticker) ?? null,
      regime: regimeRows,
    },
    scenarios,
    notes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const underlyingIdx = args.indexOf('--underlying');
  if (underlyingIdx >= 0) {
    const ticker = args[underlyingIdx + 1]?.toUpperCase();
    if (!ticker) {
      console.error('--underlying requires a ticker');
      process.exit(1);
    }
    const output = await runTargetedUnderlying(ticker);
    process.stdout.write(JSON.stringify(output, null, 2) + '\n', () => process.exit(0));
    return;
  }
  const scenario = args[args.indexOf('--scenario') + 1] ?? 'hedge';
  const minExposureIdx = args.indexOf('--min-exposure');
  const minExposure = minExposureIdx >= 0 ? parseFloat(args[minExposureIdx + 1]) : 50_000;

  const maxTickersIdx = args.indexOf('--max-tickers');
  const maxTickers = maxTickersIdx >= 0 ? parseInt(args[maxTickersIdx + 1]) : 10;

  const structureScenarios: StructureScenario[] = [
    'hedge',
    'income',
    'put_entry',
    'collar',
    'risk_reversal',
  ];
  let output: ScenarioOutput;
  if ((structureScenarios as string[]).includes(scenario)) {
    output = await runStructureScenario(scenario as StructureScenario, minExposure);
  } else if (scenario === 'leap_entry') {
    output = await runLeapEntryScenario(maxTickers);
  } else if (scenario === 'opportunistic') {
    output = await runOpportunisticScenario();
  } else {
    console.error(
      `Unknown scenario '${scenario}' (hedge | income | put_entry | collar | risk_reversal | leap_entry | opportunistic)`
    );
    process.exit(1);
  }

  // exit only after stdout drains — process.exit() inside console.log truncates
  // large payloads when piped (found on the 16-candidate collar run, 2026-07-06)
  process.stdout.write(JSON.stringify(output, null, 2) + '\n', () => process.exit(0));
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
