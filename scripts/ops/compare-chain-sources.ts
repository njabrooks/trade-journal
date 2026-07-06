#!/usr/bin/env tsx
/**
 * compare-chain-sources — measure Massive EOD chain snapshots against live IBKR
 * quotes for the same contracts (docs/v2/21: settles the "which data source"
 * question empirically).
 *
 * For each ticker: takes liquid contracts from the latest options_chain_snapshots
 * (ATM ±1 strike put+call at ~30 and ~90 DTE, OI > 10), quotes them live via
 * scripts/ibkr-quote-contracts.py (IB Gateway, read-only), and reports per-contract
 * and aggregate drift: mid %, IV vol-points, and whether IB served live or delayed
 * data. Run during US market hours (14:30–21:00 London) — that's the comparison
 * that matters; EOD-vs-EOD would flatter Massive.
 *
 * Interpretation guide:
 *   - mid drift reflects BOTH staleness and intraday move — check the same-day
 *     underlying move before blaming the snapshot
 *   - IV drift is the cleaner quality signal (vol moves slower than price)
 *   - marketDataType 3/4 = IB served delayed data (subscription gap for that class)
 *
 * Usage:
 *   npx tsx scripts/ops/compare-chain-sources.ts [--tickers GLXY,TSLA,GLW] [--per-ticker 4]
 */
import { db, closeDb } from '../lib/db';
import { sql } from 'drizzle-orm';
import { spawn } from 'child_process';

const RADON_PY = '/Users/home-hub/projects/radon/.venv/bin/python3';

/** Run the quote helper with the contract list on stdin, return its stdout. */
function quoteViaIb(requestJson: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(RADON_PY, ['scripts/ibkr-quote-contracts.py'], { cwd: process.cwd() });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGTERM');
      reject(new Error('quote script timed out (10 min)'));
    }, 10 * 60 * 1000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`quote script rc=${code}: ${err.slice(-400)}`));
    });
    p.stdin.write(requestJson);
    p.stdin.end();
  });
}

interface SnapRow {
  ticker: string;
  contract_type: string;
  strike: string;
  expiration_date: string;
  dte: number;
  bid: string | null;
  ask: string | null;
  last: string | null;
  implied_volatility: string | null;
  open_interest: number | null;
  underlying_spot: string | null;
  snapshot_date: string;
}

const num = (v: string | null): number | null => {
  if (v === null) return null;
  const x = parseFloat(v);
  return isNaN(x) ? null : x;
};

async function pickContracts(ticker: string, perTicker: number): Promise<SnapRow[]> {
  // nearest-to-ATM put + call at the expiry closest to 30 and 90 DTE
  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT MAX(snapshot_date) AS d FROM options_chain_snapshots WHERE ticker = ${ticker}
    ),
    ranked AS (
      SELECT o.*,
        ABS(o.dte - t.target_dte) AS dte_dist,
        ROW_NUMBER() OVER (
          PARTITION BY o.contract_type, t.target_dte
          ORDER BY ABS(o.dte - t.target_dte), ABS(CAST(o.strike AS numeric) - CAST(o.underlying_spot AS numeric))
        ) AS rn
      FROM options_chain_snapshots o
      CROSS JOIN (VALUES (30), (90)) AS t(target_dte)
      JOIN latest l ON o.snapshot_date = l.d
      WHERE o.ticker = ${ticker}
        AND o.open_interest > 10
        -- same price rule as the advisor's mid(): live bid/ask, else last
        AND ((o.bid IS NOT NULL AND CAST(o.bid AS numeric) > 0
              AND o.ask IS NOT NULL AND CAST(o.ask AS numeric) > 0)
             OR (o.last IS NOT NULL AND CAST(o.last AS numeric) > 0))
        AND o.underlying_spot IS NOT NULL
    )
    SELECT ticker, contract_type, strike, expiration_date, dte, bid, ask, last,
           implied_volatility, open_interest, underlying_spot, snapshot_date
    FROM ranked WHERE rn = 1
    LIMIT ${perTicker}
  `);
  return rows as unknown as SnapRow[];
}

async function main() {
  const args = process.argv.slice(2);
  const tickersIdx = args.indexOf('--tickers');
  const perIdx = args.indexOf('--per-ticker');
  const perTicker = perIdx >= 0 ? parseInt(args[perIdx + 1]) : 4;
  const tickers =
    tickersIdx >= 0
      ? args[tickersIdx + 1].split(',').map((t) => t.trim().toUpperCase())
      : ['GLXY', 'TSLA', 'GLW'];

  const snaps: SnapRow[] = [];
  for (const t of tickers) {
    const rows = await pickContracts(t, perTicker);
    if (rows.length === 0) console.error(`[compare] ${t}: no usable snapshot contracts`);
    snaps.push(...rows);
  }
  if (snaps.length === 0) {
    console.error('No contracts to compare.');
    process.exit(1);
  }
  console.error(`[compare] quoting ${snaps.length} contracts live via IB…`);

  const request = snaps.map((s) => ({
    ticker: s.ticker,
    expiry: s.expiration_date.replace(/-/g, ''),
    strike: num(s.strike),
    right: s.contract_type.toUpperCase().startsWith('C') ? 'C' : 'P',
  }));
  const stdout = await quoteViaIb(JSON.stringify(request));

  const live = JSON.parse(stdout) as Array<{
    ticker: string;
    expiry: string;
    strike: number;
    right: string;
    bid?: number | null;
    ask?: number | null;
    mid?: number | null;
    iv?: number | null;
    marketDataType?: number;
    error?: string;
  }>;

  const rows: Array<Record<string, unknown>> = [];
  const midDrifts: number[] = [];
  const ivDrifts: number[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    const l = live[i];
    const bid = num(s.bid);
    const ask = num(s.ask);
    const snapMid =
      bid !== null && ask !== null && bid > 0 && ask > 0 ? (bid + ask) / 2 : num(s.last);
    const midDrift =
      l?.mid != null && snapMid != null && snapMid > 0 ? (l.mid - snapMid) / snapMid : null;
    const ivDrift =
      l?.iv != null && num(s.implied_volatility) != null ? l.iv - num(s.implied_volatility)! : null;
    if (midDrift !== null) midDrifts.push(Math.abs(midDrift));
    if (ivDrift !== null) ivDrifts.push(Math.abs(ivDrift));
    rows.push({
      contract: `${s.ticker} ${s.expiration_date} ${s.strike}${s.contract_type[0].toUpperCase()}`,
      snapDate: s.snapshot_date,
      snapMid: snapMid !== null ? Math.round(snapMid * 100) / 100 : null,
      liveMid: l?.mid ?? null,
      midDriftPct: midDrift !== null ? Math.round(midDrift * 1000) / 10 : null,
      snapIv: num(s.implied_volatility),
      liveIv: l?.iv ?? null,
      ivDriftVolPts: ivDrift !== null ? Math.round(ivDrift * 1000) / 10 : null,
      ibDataType: l?.marketDataType ?? null,
      error: l?.error ?? null,
    });
  }

  const median = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  console.log(
    JSON.stringify(
      {
        comparedAt: new Date().toISOString(),
        contracts: rows,
        aggregate: {
          n: rows.length,
          quoted: midDrifts.length,
          medianAbsMidDriftPct: median(midDrifts) !== null ? Math.round(median(midDrifts)! * 1000) / 10 : null,
          medianAbsIvDriftVolPts: median(ivDrifts) !== null ? Math.round(median(ivDrifts)! * 1000) / 10 : null,
          ibServedDelayed: live.filter((l) => (l.marketDataType ?? 1) >= 3).length,
        },
        note: 'mid drift includes the intraday underlying move — IV drift is the cleaner staleness/quality signal. ibDataType 1=live 3=delayed.',
      },
      null,
      2
    )
  );
  await closeDb();
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
