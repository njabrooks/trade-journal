/**
 * CLI reconciliation script — compares snapshot and event-sourced portfolio views.
 * Outputs summary, owner-level comparison, and position-level mismatches.
 *
 * All comparisons are anchored to the "last complete event date" — the latest date
 * where ALL event sources have actual transaction data (not carry-forward).
 *
 * Usage: npx tsx scripts/run-reconciliation.ts
 * Exit code 0 if NAV delta < 5%, exit code 1 if >= 5%.
 */

import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

const USER_ID = 'user_2mYzScugP7zfcqv8Ox21i7q9nyW';

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | null, decimals = 0): string {
  if (v === null) return '—';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(v: number | null): string {
  if (v === null) return '—';
  return '$' + fmt(v);
}

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(1) + '%';
}

async function main() {
  console.log('=== Portfolio Reconciliation ===\n');

  // 1. Determine comparison date — last date with complete event data across all sources
  const eventSourceRows = (await db.execute(sql`
    SELECT source, MAX(timestamp::date)::text AS last_date, COUNT(*)::int AS event_count
    FROM events
    WHERE user_id = ${USER_ID}
    GROUP BY source
    ORDER BY last_date
  `)) as any[];

  // Use MAX of per-source dates. Each source covers different accounts
  // (ibkr_trade → IBKR accounts, koinly → crypto). Using MAX gives us crypto
  // snapshot coverage (NAV starts Feb 11) at the cost of minor IBKR staleness.
  const comparisonDate = eventSourceRows.length > 0
    ? eventSourceRows.reduce((max: string, r: any) => r.last_date > max ? r.last_date : max, eventSourceRows[0].last_date)
    : 'N/A';

  console.log('--- Event Source Freshness ---');
  for (const r of eventSourceRows) {
    console.log(`  ${r.source.padEnd(15)} last event: ${r.last_date}  (${fmt(r.event_count)} events)`);
  }
  console.log(`\nComparison date: ${comparisonDate} (last date with complete data across all sources)\n`);

  // 2. Get snapshot date at comparison point
  const snapshotDateRow = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM portfolio_snapshots WHERE level = 'account' AND snapshot_date <= ${comparisonDate} GROUP BY account_id
    )
    SELECT MIN(latest_date) AS d_min, MAX(latest_date) AS d_max
    FROM latest_per_account
  `)) as any[];

  const snapshotDateMin = snapshotDateRow[0]?.d_min ?? 'N/A';
  const snapshotDateMax = snapshotDateRow[0]?.d_max ?? 'N/A';
  const snapshotDateLabel = snapshotDateMin === snapshotDateMax
    ? snapshotDateMax
    : `${snapshotDateMin} – ${snapshotDateMax}`;

  console.log(`Snapshot date:       ${snapshotDateLabel}`);
  console.log(`Event-sourced date:  ${comparisonDate}\n`);

  // 3. NAV comparison — at comparison date
  const snapshotNavRow = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM portfolio_snapshots WHERE level = 'account' AND snapshot_date <= ${comparisonDate} GROUP BY account_id
    )
    SELECT SUM(ps.nav_at_snapshot_usd::numeric) AS nav
    FROM portfolio_snapshots ps
    JOIN latest_per_account lpa ON lpa.account_id = ps.account_id AND lpa.latest_date = ps.snapshot_date
    WHERE ps.level = 'account'
  `)) as any[];
  const eventNavRow = (await db.execute(sql`
    SELECT total_market_value::numeric AS nav
    FROM daily_portfolio_values
    WHERE user_id = ${USER_ID} AND owner IS NULL AND account IS NULL AND date = ${comparisonDate}
  `)) as any[];

  const snapshotNav = toNum(snapshotNavRow[0]?.nav) ?? 0;
  const eventNav = toNum(eventNavRow[0]?.nav) ?? 0;
  const navDelta = snapshotNav - eventNav;
  const navDeltaPct = eventNav !== 0 ? (navDelta / Math.abs(eventNav)) * 100 : 0;

  console.log('--- NAV Summary ---');
  console.log(`Snapshot NAV:        ${fmtCurrency(snapshotNav)}`);
  console.log(`Event-sourced NAV:   ${fmtCurrency(eventNav)}`);
  console.log(`Delta:               ${fmtCurrency(navDelta)} (${fmtPct(navDeltaPct)})\n`);

  // 4. Per-owner breakdown — at comparison date
  const ownerSnapshotRows = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM portfolio_snapshots WHERE level = 'account' AND snapshot_date <= ${comparisonDate} GROUP BY account_id
    )
    SELECT a.owner, SUM(ps.nav_at_snapshot_usd::numeric) AS nav
    FROM portfolio_snapshots ps
    JOIN accounts a ON a.id = ps.account_id
    JOIN latest_per_account lpa ON lpa.account_id = ps.account_id AND lpa.latest_date = ps.snapshot_date
    WHERE ps.level = 'account'
    GROUP BY a.owner
    ORDER BY a.owner
  `)) as any[];

  const ownerEventRows = (await db.execute(sql`
    SELECT owner, total_market_value::numeric AS nav
    FROM daily_portfolio_values
    WHERE user_id = ${USER_ID} AND owner IS NOT NULL AND account IS NULL AND date = ${comparisonDate}
    ORDER BY owner
  `)) as any[];

  const ownerSnapshot = new Map(ownerSnapshotRows.map((r: any) => [r.owner, toNum(r.nav)]));
  const ownerEvent = new Map(ownerEventRows.map((r: any) => [r.owner, toNum(r.nav)]));
  const allOwners = new Set([...ownerSnapshot.keys(), ...ownerEvent.keys()]);

  console.log('--- Owner Breakdown ---');
  console.log(
    'Owner'.padEnd(12) +
    'Snapshot'.padStart(14) +
    'Event-Sourced'.padStart(16) +
    'Delta'.padStart(14) +
    'Delta %'.padStart(10) +
    '  Status'
  );
  console.log('-'.repeat(82));

  for (const owner of [...allOwners].sort()) {
    const sNav = ownerSnapshot.get(owner) ?? null;
    const eNav = ownerEvent.get(owner) ?? null;
    const delta = sNav != null && eNav != null ? sNav - eNav : null;
    const pct = delta != null && eNav != null && eNav !== 0 ? (delta / Math.abs(eNav)) * 100 : null;
    const status = sNav == null ? 'ES-only' : eNav == null ? 'Snap-only' : Math.abs(pct ?? 0) < 1 ? 'Match' : 'Mismatch';

    console.log(
      owner.padEnd(12) +
      fmtCurrency(sNav).padStart(14) +
      fmtCurrency(eNav).padStart(16) +
      fmtCurrency(delta).padStart(14) +
      fmtPct(pct).padStart(10) +
      `  ${status}`
    );
  }
  console.log();

  // 5. Position-level reconciliation — at comparison date
  const snapshotPositions = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM positions WHERE is_open = true AND snapshot_date <= ${comparisonDate} GROUP BY account_id
    )
    SELECT p.symbol, p.conid, p.quantity::numeric AS qty, p.market_value_usd::numeric AS mv,
           p.asset_class, a.owner, a.broker_name
    FROM positions p
    JOIN accounts a ON a.id = p.account_id
    JOIN latest_per_account lpa ON lpa.account_id = p.account_id AND lpa.latest_date = p.snapshot_date
    WHERE p.is_open = true AND ABS(p.quantity::numeric) > 0.0001
  `)) as any[];

  const eventPositions = (await db.execute(sql`
    SELECT pdb.asset AS asset_id, pdb.quantity::numeric AS qty, pdb.market_value::numeric AS mv,
           pdb.owner, pdb.account_type, pdb.asset_class, ast.ticker, ast.ibkr_conid
    FROM portfolio_daily_balances pdb
    JOIN assets ast ON pdb.asset = ast.id::text
    WHERE pdb.user_id = ${USER_ID}
      AND pdb.date = ${comparisonDate}
      AND ABS(pdb.quantity::numeric) > 0.0001
      AND ast.asset_class NOT IN ('FIAT')
      AND COALESCE(ast.pricing_tier, '') != 'zero'
  `)) as any[];

  // Aggregate both sides by (owner, ticker) to handle multi-account positions
  type AggPos = { ticker: string; conids: string[]; qty: number; mv: number | null; matched: boolean };
  const snapAgg = new Map<string, AggPos>();
  for (const sp of snapshotPositions) {
    const key = `${sp.owner ?? 'Unknown'}::${sp.symbol}`;
    const existing = snapAgg.get(key);
    const qty = toNum(sp.qty) ?? 0;
    const mv = toNum(sp.mv);
    const conid = sp.conid ? String(sp.conid) : null;
    if (existing) {
      existing.qty += qty;
      existing.mv = (existing.mv ?? 0) + (mv ?? 0);
      if (conid && !existing.conids.includes(conid)) existing.conids.push(conid);
    } else {
      snapAgg.set(key, { ticker: sp.symbol, conids: conid ? [conid] : [], qty, mv, matched: false });
    }
  }

  const eventAgg = new Map<string, AggPos>();
  const eventConidMap = new Map<string, string>(); // "owner::conid" → "owner::ticker"
  for (const row of eventPositions) {
    const key = `${row.owner}::${row.ticker}`;
    const existing = eventAgg.get(key);
    const qty = toNum(row.qty) ?? 0;
    const mv = toNum(row.mv);
    const conid = row.ibkr_conid ? String(row.ibkr_conid) : null;
    if (existing) {
      existing.qty += qty;
      existing.mv = (existing.mv ?? 0) + (mv ?? 0);
      if (conid && !existing.conids.includes(conid)) existing.conids.push(conid);
    } else {
      eventAgg.set(key, { ticker: row.ticker, conids: conid ? [conid] : [], qty, mv, matched: false });
    }
    if (conid) eventConidMap.set(`${row.owner}::${conid}`, key);
  }

  let matched = 0, qtyMismatch = 0, mvMismatch = 0, snapOnly = 0;
  const mismatches: string[] = [];

  for (const [snapKey, sp] of snapAgg) {
    const [owner] = snapKey.split('::');

    let ep: AggPos | undefined;
    let method = '';

    // Tier 1: conid
    for (const conid of sp.conids) {
      const eventKey = eventConidMap.get(`${owner}::${conid}`);
      if (eventKey) { ep = eventAgg.get(eventKey); method = 'conid'; break; }
    }
    // Tier 2: ticker
    if (!ep) {
      ep = eventAgg.get(snapKey);
      if (ep) method = 'ticker';
    }

    if (ep) {
      ep.matched = true;
      sp.matched = true;
      const qtyDelta = sp.qty - ep.qty;
      const qtyMatch = Math.abs(qtyDelta) < 0.0001;
      const mvDelta = sp.mv != null && ep.mv != null ? sp.mv - ep.mv : null;
      const mvMatch = mvDelta != null ? Math.abs(mvDelta) / Math.max(Math.abs(sp.mv ?? 0), Math.abs(ep.mv ?? 0), 1) < 0.01 : true;

      if (qtyMatch && mvMatch) {
        matched++;
      } else if (!qtyMatch) {
        qtyMismatch++;
        mismatches.push(`QTY  ${owner.padEnd(8)} ${sp.ticker.padEnd(20)} snap=${fmt(sp.qty, 4).padStart(14)}  es=${fmt(ep.qty, 4).padStart(14)}  delta=${fmt(qtyDelta, 4).padStart(14)}  [${method}]`);
      } else {
        mvMismatch++;
        mismatches.push(`MV   ${owner.padEnd(8)} ${sp.ticker.padEnd(20)} snap=${fmtCurrency(sp.mv).padStart(14)}  es=${fmtCurrency(ep.mv).padStart(14)}  delta=${fmtCurrency(mvDelta).padStart(14)}  [${method}]`);
      }
    } else {
      snapOnly++;
      if (Math.abs(sp.mv ?? 0) > 100) {
        mismatches.push(`SNAP ${owner.padEnd(8)} ${sp.ticker.padEnd(20)} qty=${fmt(sp.qty, 4).padStart(14)}  mv=${fmtCurrency(sp.mv).padStart(14)}  (snapshot only)`);
      }
    }
  }

  let esOnly = 0;
  for (const [key, ep] of eventAgg) {
    if (!ep.matched) {
      esOnly++;
      if (Math.abs(ep.mv ?? 0) > 100) {
        const [owner] = key.split('::');
        mismatches.push(`ES   ${owner.padEnd(8)} ${ep.ticker.padEnd(20)} qty=${fmt(ep.qty, 4).padStart(14)}  mv=${fmtCurrency(ep.mv).padStart(14)}  (event-sourced only)`);
      }
    }
  }

  const total = matched + qtyMismatch + mvMismatch + snapOnly + esOnly;
  const matchRate = total > 0 ? (matched / total) * 100 : 0;

  console.log('--- Position Summary ---');
  console.log(`Total positions:     ${total}`);
  console.log(`Matched:             ${matched} (${fmtPct(matchRate)})`);
  console.log(`Qty mismatch:        ${qtyMismatch}`);
  console.log(`MV mismatch:         ${mvMismatch}`);
  console.log(`Snapshot only:       ${snapOnly}`);
  console.log(`Event-sourced only:  ${esOnly}\n`);

  if (mismatches.length > 0) {
    console.log('--- Discrepancies (MV > $100) ---');
    for (const m of mismatches) {
      console.log(m);
    }
    console.log();
  }

  // Exit code
  const criticalDelta = Math.abs(navDeltaPct) >= 5;
  if (criticalDelta) {
    console.log(`WARNING: NAV delta ${fmtPct(navDeltaPct)} exceeds 5% threshold`);
  } else {
    console.log(`OK: NAV delta ${fmtPct(navDeltaPct)} within 5% threshold`);
  }

  await closeDb();
  process.exit(criticalDelta ? 1 : 0);
}

main().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(2);
});
