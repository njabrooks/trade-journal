#!/usr/bin/env tsx
/**
 * Backfill: replace HyperLiquid's unreliable derived NAV history with the broker's
 * own authoritative account value.
 *
 * Why not arithmetic? The derived NAV path never modelled HL's perp wallet correctly:
 * it added perp uPnL on top of cash that already embeds it (over-count) AND omitted the
 * locked perp margin (under-count). The net error flips sign over time, so it cannot be
 * reconstructed from stored columns. The only truth is HyperLiquid's own "Account Value".
 *
 * Source: the `portfolio` endpoint's accountValueHistory — DAILY for ~the last 30 days,
 * ~WEEKLY before that. For snapshot dates without an exact broker point we carry forward
 * the most recent prior broker reading (flagged `cf`).
 *
 * Apply path: write the broker value to nav_snapshots (authoritative branch), delete the
 * spurious `withdrawable` USD cash rows (cash = spot stablecoins, consistent with the live
 * fix), then recompute portfolio_snapshots + strategy_metrics for HyperLiquid.
 *
 * Usage:
 *   npx tsx scripts/ops/backfill-hl-nav.ts            # dry-run (default) — prints the diff
 *   npx tsx scripts/ops/backfill-hl-nav.ts --apply    # write changes
 */
import { db, closeDb, schema } from '../lib/db.js';
import { and, eq, sql } from 'drizzle-orm';
import { fetchPortfolio, accountValueByDate } from '../../src/lib/ingestion/hyperliquid/api.js';
import { computePortfolioSnapshotsForDateRange } from '../../src/lib/derived/portfolio.js';
import { computeStrategyMetricsForDateRange } from '../../src/lib/derived/strategyMetrics.js';

const { accounts, portfolioSnapshots, positions, cashBalances, navSnapshots, strategies } = schema;
const APPLY = process.argv.includes('--apply');

const fmt = (n: number) => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
const dstr = (d: unknown): string =>
  typeof d === 'string' ? d.slice(0, 10) : new Date(d as string).toISOString().slice(0, 10);

async function main() {
  const wallet = process.env.HYPERLIQUID_WALLET_ADDRESS;
  if (!wallet) throw new Error('HYPERLIQUID_WALLET_ADDRESS not set');

  const [hl] = await db
    .select({ id: accounts.id, label: accounts.label })
    .from(accounts)
    .where(sql`${accounts.brokerName} ILIKE 'hyperliquid'`)
    .limit(1);
  if (!hl) throw new Error('HyperLiquid account not found');
  const HL = hl.id;

  // Broker's authoritative account-value series → day→value, plus carry-forward lookup.
  const brokerMap = accountValueByDate(await fetchPortfolio(wallet));
  const brokerDays = [...brokerMap.keys()].sort();
  const minBrokerDay = brokerDays[0];
  const brokerAsOf = (date: string): { value: number | null; exact: boolean } => {
    if (brokerMap.has(date)) return { value: brokerMap.get(date)!, exact: true };
    let lo = 0, hi = brokerDays.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (brokerDays[mid] <= date) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best >= 0 ? { value: brokerMap.get(brokerDays[best])!, exact: false } : { value: null, exact: false };
  };

  // Current (buggy) account-level snapshots + per-date perp uPnL / withdrawable (context).
  const acctRows = await db
    .select({ date: portfolioSnapshots.snapshotDate, nav: portfolioSnapshots.navAtSnapshotUsd, cash: portfolioSnapshots.totalCashUsd })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.accountId, HL), eq(portfolioSnapshots.level, 'account')));
  const wdRows = await db
    .select({ date: cashBalances.snapshotDate, wd: sql<string>`SUM(COALESCE(${cashBalances.balanceUsd}, 0))` })
    .from(cashBalances)
    .where(and(eq(cashBalances.accountId, HL), eq(cashBalances.source, 'hyperliquid'), eq(cashBalances.currency, 'USD')))
    .groupBy(cashBalances.snapshotDate);
  const wdByDate = new Map(wdRows.map((r) => [dstr(r.date), parseFloat(r.wd || '0')]));

  const rows = acctRows
    .map((r) => {
      const date = dstr(r.date);
      const oldNav = parseFloat(r.nav || '0');
      const oldCash = parseFloat(r.cash || '0');
      const wd = wdByDate.get(date) ?? 0;
      const bk = brokerAsOf(date);
      return { date, oldNav, oldCash, wd, broker: bk.value, exact: bk.exact, correctedCash: oldCash - wd };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  console.log(`\nHyperLiquid (${hl.label}) NAV backfill — broker-anchored — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Broker series: ${brokerDays.length} days (${minBrokerDay} → ${brokerDays[brokerDays.length - 1]}); ${rows.length} HL snapshots to revalue\n`);

  const recent = rows.slice(-21);
  console.log('Recent 21 snapshots (daily broker data):');
  console.log('date          old_nav    broker_nav  src   Δ(broker−old)');
  for (const r of recent) {
    const bk = r.broker != null ? fmt(r.broker) : 'n/a';
    const delta = r.broker != null ? fmt(r.broker - r.oldNav) : '—';
    console.log(`${r.date}  ${fmt(r.oldNav).padStart(10)}  ${bk.padStart(10)}  ${(r.exact ? 'brk' : 'cf').padEnd(3)}  ${delta.padStart(12)}`);
  }

  const older = rows.slice(0, -21);
  const exactN = rows.filter((r) => r.exact).length;
  const noData = rows.filter((r) => r.broker == null).length;
  const sumOld = rows.reduce((s, r) => s + r.oldNav, 0);
  const sumBroker = rows.reduce((s, r) => s + (r.broker ?? r.oldNav), 0);
  const latest = rows[rows.length - 1];
  console.log(`\nOlder (pre-recent): ${older.length} snapshots — ${older.filter((r) => r.exact).length} exact broker / ${older.filter((r) => !r.exact && r.broker != null).length} carry-forward`);
  console.log(`Coverage: ${exactN}/${rows.length} exact broker points, ${rows.length - exactN - noData} carry-forward, ${noData} no-data`);
  console.log(`Latest (${latest.date}): old $${fmt(latest.oldNav)} → broker $${fmt(latest.broker ?? 0)}  (Δ ${fmt((latest.broker ?? 0) - latest.oldNav)})`);
  console.log(`Sum of NAV across all snapshots: old $${fmt(sumOld)} → broker $${fmt(sumBroker)}  (net revaluation ${fmt(sumBroker - sumOld)})`);
  const wdTotal = rows.reduce((s, r) => s + r.wd, 0);
  console.log(`Spurious withdrawable USD cash rows to delete: total $${fmt(wdTotal)} across ${wdByDate.size} dates`);

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write broker NAV to nav_snapshots, delete withdrawable cash rows, recompute portfolio_snapshots + strategy_metrics.');
    await closeDb();
    return;
  }

  console.log('\n[apply] Upserting broker NAV into nav_snapshots...');
  let wrote = 0;
  for (const r of rows) {
    if (r.broker == null) continue;
    await db
      .insert(navSnapshots)
      .values({ accountId: HL, reportDate: r.date, currency: 'USD', total: r.broker.toString(), cash: r.correctedCash.toString() })
      .onConflictDoUpdate({ target: [navSnapshots.accountId, navSnapshots.reportDate], set: { total: r.broker.toString(), cash: r.correctedCash.toString() } });
    wrote++;
  }
  console.log(`[apply] nav_snapshots upserted: ${wrote} (${noData} skipped — no broker data)`);

  console.log('[apply] Deleting spurious withdrawable USD cash rows...');
  await db.delete(cashBalances).where(and(eq(cashBalances.accountId, HL), eq(cashBalances.source, 'hyperliquid'), eq(cashBalances.currency, 'USD')));

  const minDate = rows[0].date;
  const maxDate = latest.date;
  console.log(`[apply] Recomputing portfolio_snapshots ${minDate}..${maxDate}...`);
  const res = await computePortfolioSnapshotsForDateRange(HL, minDate, maxDate, true, true);
  console.log(`[apply] portfolio_snapshots: account=${res.account}, underlying=${res.underlying}`);

  console.log('[apply] Recomputing strategy_metrics for HL strategies...');
  const hlStrats = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(sql`EXISTS (SELECT 1 FROM positions p WHERE p.strategy_id = ${strategies.id} AND p.account_id = ${HL})`);
  for (const s of hlStrats) await computeStrategyMetricsForDateRange(HL, s.id, minDate, maxDate);
  console.log(`[apply] strategy_metrics recomputed for ${hlStrats.length} strategies.`);

  const [after] = await db
    .select({ nav: portfolioSnapshots.navAtSnapshotUsd, cash: portfolioSnapshots.totalCashUsd, lev: portfolioSnapshots.leverageRatio })
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.accountId, HL), eq(portfolioSnapshots.level, 'account'), eq(portfolioSnapshots.snapshotDate, maxDate)));
  console.log(`\n[verify] ${maxDate}: nav=$${fmt(parseFloat(after?.nav || '0'))}, cash=$${fmt(parseFloat(after?.cash || '0'))}, leverage=${after?.lev}`);
  console.log('[apply] Done. Next: re-run advisor (or let 7-day rows expire), then push-to-remote.');
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
