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
 *   opportunistic — no structures: context payload (cheap-vol scan hits ×
 *                 theses × held flags; rich-vol holds) for skill judgment
 *
 * Usage:
 *   npx tsx scripts/options-advisor.ts --scenario hedge|income|put_entry|opportunistic
 *                                      [--min-exposure 50000]
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
  type: 'protective_put' | 'put_spread' | 'covered_call' | 'cash_secured_put';
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

async function runStructureScenario(
  scenario: 'hedge' | 'income' | 'put_entry',
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

  // Candidate tickers per scenario
  let targets: Array<{ ticker: string; assetClass: 'STK' | 'CRYPTO' }>;
  if (scenario === 'put_entry') {
    // bullish-thesis tickers, held or not
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

  for (const target of targets) {
    const contractType = scenario === 'income' ? 'call' : 'put';
    const maxDte = scenario === 'hedge' ? 290 : 120;
    const chain = await loadChain(target.ticker, contractType, maxDte);
    if (chain.length === 0) {
      skipped.push({ ticker: target.ticker, reason: `no recent ${contractType} chain snapshot` });
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

    let structures: Structure[];
    if (scenario === 'hedge') {
      structures = buildHedgeStructures(chain, spot, exposureUsd, isCrypto);
    } else if (scenario === 'income') {
      structures = buildIncomeStructures(chain, spot, exposureUsd, isCrypto);
    } else {
      structures = buildPutEntryStructures(chain, spot, isCrypto);
    }
    if (structures.length === 0) {
      skipped.push({ ticker: target.ticker, reason: 'no priceable structures in range' });
      continue;
    }

    const runUpPct =
      scenario === 'income' &&
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
      ...(scenario === 'put_entry' ? { thesis: theses.get(target.ticker) ?? null } : {}),
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

async function main() {
  const args = process.argv.slice(2);
  const scenario = args[args.indexOf('--scenario') + 1] ?? 'hedge';
  const minExposureIdx = args.indexOf('--min-exposure');
  const minExposure = minExposureIdx >= 0 ? parseFloat(args[minExposureIdx + 1]) : 50_000;

  let output: ScenarioOutput;
  if (scenario === 'hedge' || scenario === 'income' || scenario === 'put_entry') {
    output = await runStructureScenario(scenario, minExposure);
  } else if (scenario === 'opportunistic') {
    output = await runOpportunisticScenario();
  } else {
    console.error(`Unknown scenario '${scenario}' (hedge | income | put_entry | opportunistic)`);
    process.exit(1);
  }

  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
