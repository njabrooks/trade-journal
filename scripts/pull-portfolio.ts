/**
 * Pull full portfolio snapshot from the Trade Journal database.
 *
 * Outputs:
 *   - NAV, Cash, Leverage, Snapshot dates
 *   - Owner breakdown
 *   - Underlying breakdown (grouped by parent underlying)
 *   - Strategy breakdown with positions
 *   - Cash breakdown by currency/source
 *
 * Usage:
 *   npx tsx scripts/pull-portfolio.ts                    # All accounts, human-readable
 *   npx tsx scripts/pull-portfolio.ts --format json      # JSON output
 *   npx tsx scripts/pull-portfolio.ts --account-ids id1,id2
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, sql, inArray, asc, desc } from 'drizzle-orm';

const {
  positions,
  underlyings,
  strategies,
  assetTheses,
  accounts,
  portfolioSnapshots,
  cashBalances,
} = schema;

// Alias for parent underlying join
const parentUnderlyings = schema.underlyings;

interface PositionRow {
  id: string;
  symbol: string;
  assetClass: string | null;
  quantity: number;
  avgPrice: number | null;
  costBasisMoney: number | null;
  spot: number | null;
  underlyingSpot: number | null;
  marketValueUsd: number | null;
  absNotionalUsd: number | null;
  unrealizedPnl: number | null;
  multiplier: number | null;
  currency: string | null;
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
  side: string | null;
  snapshotDate: string;
  accountId: string;
  strategyId: string | null;
  underlyingTicker: string | null;
  underlyingId: string | null;
  parentUnderlyingTicker: string | null;
  accountLabel: string | null;
  accountOwner: string | null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmt(n: number | null, decimals = 0): string {
  if (n === null) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n === null) return '—';
  return (n * 100).toFixed(decimals) + '%';
}

function fmtUsd(n: number | null): string {
  if (n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return sign + '$' + (abs / 1_000).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

async function main() {
  const args = process.argv.slice(2);
  const formatJson = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
  const accountIdArg = args.includes('--account-ids')
    ? args[args.indexOf('--account-ids') + 1]
    : null;

  // 1. Get accounts
  const allAccounts = await db
    .select({
      id: accounts.id,
      label: accounts.label,
      owner: accounts.owner,
      brokerName: accounts.brokerName,
    })
    .from(accounts);

  const accountIds = accountIdArg
    ? accountIdArg.split(',')
    : allAccounts.map((a) => a.id);

  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

  // 2. Fetch aggregate NAV / cash / leverage (per-account latest dates)
  const portfolioResult = await db
    .select({
      nav: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`,
      totalCashUsd: sql<string>`SUM(CAST(${portfolioSnapshots.totalCashUsd} AS NUMERIC))`,
      totalAbsNotional: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.totalAbsNotionalUsd}, ${portfolioSnapshots.totalAbsNotional}) AS NUMERIC))`,
      maxDate: sql<string>`MAX(${portfolioSnapshots.snapshotDate})`,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, 'account'),
        sql`${portfolioSnapshots.snapshotDate} = (
          SELECT MAX(ps2.snapshot_date)
          FROM portfolio_snapshots ps2
          WHERE ps2.account_id = ${portfolioSnapshots.accountId}
            AND ps2.level = 'account'
        )`
      )
    );

  const nav = toNum(portfolioResult[0]?.nav);
  const totalCashUsd = toNum(portfolioResult[0]?.totalCashUsd);
  const totalAbsNotional = toNum(portfolioResult[0]?.totalAbsNotional);
  const leverageRatio = totalAbsNotional && nav && nav > 0 ? totalAbsNotional / nav : null;
  const snapshotDate = portfolioResult[0]?.maxDate ?? null;

  // 3. Owner breakdown
  const ownerRows = await db
    .select({
      owner: accounts.owner,
      nav: sql<string>`SUM(CAST(COALESCE(${portfolioSnapshots.navAtSnapshotUsd}, ${portfolioSnapshots.navAtSnapshot}) AS NUMERIC))`,
    })
    .from(portfolioSnapshots)
    .innerJoin(accounts, eq(portfolioSnapshots.accountId, accounts.id))
    .where(
      and(
        inArray(portfolioSnapshots.accountId, accountIds),
        eq(portfolioSnapshots.level, 'account'),
        sql`${portfolioSnapshots.snapshotDate} = (
          SELECT MAX(ps2.snapshot_date)
          FROM portfolio_snapshots ps2
          WHERE ps2.account_id = ${portfolioSnapshots.accountId}
            AND ps2.level = 'account'
        )`
      )
    )
    .groupBy(accounts.owner);

  // 4. Fetch all open positions (per-account latest snapshot dates)
  const positionRows = await db
    .select({
      id: positions.id,
      symbol: positions.symbol,
      assetClass: positions.assetClass,
      quantity: positions.quantity,
      avgPrice: positions.avgPrice,
      costBasisMoney: positions.costBasisMoney,
      spot: positions.spot,
      underlyingSpot: underlyings.spot,
      marketValueUsd: positions.marketValueUsd,
      absNotionalUsd: positions.absNotionalUsd,
      unrealizedPnl: positions.unrealizedPnl,
      multiplier: positions.multiplier,
      currency: sql<string | null>`COALESCE(${positions.currency}, ${underlyings.baseCurrency})`,
      expiry: positions.expiry,
      strike: positions.strike,
      optionRight: positions.optionRight,
      side: positions.side,
      snapshotDate: positions.snapshotDate,
      accountId: positions.accountId,
      strategyId: positions.strategyId,
      underlyingTicker: underlyings.ticker,
      underlyingId: positions.underlyingId,
      parentUnderlyingTicker: sql<string | null>`pu.ticker`,
      accountLabel: accounts.label,
      accountOwner: accounts.owner,
    })
    .from(positions)
    .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
    .leftJoin(
      sql`underlyings pu`,
      sql`pu.id = ${underlyings.parentUnderlyingId}`
    )
    .leftJoin(accounts, eq(positions.accountId, accounts.id))
    .where(
      and(
        inArray(positions.accountId, accountIds),
        sql`${positions.quantity} != 0`,
        sql`${positions.snapshotDate} = (
          SELECT MAX(p2.snapshot_date)
          FROM positions p2
          WHERE p2.account_id = ${positions.accountId}
        )`
      )
    )
    .orderBy(asc(positions.symbol));

  const allPositions: PositionRow[] = positionRows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    assetClass: r.assetClass,
    quantity: Number(r.quantity),
    avgPrice: toNum(r.avgPrice),
    costBasisMoney: toNum(r.costBasisMoney),
    spot: toNum(r.spot),
    underlyingSpot: toNum(r.underlyingSpot),
    marketValueUsd: toNum(r.marketValueUsd),
    absNotionalUsd: toNum(r.absNotionalUsd),
    unrealizedPnl: toNum(r.unrealizedPnl),
    multiplier: toNum(r.multiplier),
    currency: r.currency,
    expiry: r.expiry,
    strike: toNum(r.strike),
    optionRight: r.optionRight,
    side: r.side,
    snapshotDate: r.snapshotDate,
    accountId: r.accountId,
    strategyId: r.strategyId,
    underlyingTicker: r.underlyingTicker,
    underlyingId: r.underlyingId,
    parentUnderlyingTicker: r.parentUnderlyingTicker,
    accountLabel: r.accountLabel,
    accountOwner: r.accountOwner,
  }));

  // 5. Fetch strategy metadata for active strategies
  const strategyIds = [
    ...new Set(allPositions.map((p) => p.strategyId).filter((id): id is string => id !== null)),
  ];

  const strategyRows = strategyIds.length > 0
    ? await db
        .select({
          id: strategies.id,
          strategyKey: strategies.strategyKey,
          label: strategies.autoDerivedLabel,
          status: strategies.status,
          closedAt: strategies.closedAt,
          strategyType: strategies.strategyType,
          direction: strategies.direction,
          assetThesisId: strategies.assetThesisId,
          assetThesisTitle: assetTheses.title,
        })
        .from(strategies)
        .leftJoin(assetTheses, eq(strategies.assetThesisId, assetTheses.id))
        .where(inArray(strategies.id, strategyIds))
    : [];

  const strategyMap = new Map<string, typeof strategyRows[0] & { positions: PositionRow[] }>();
  for (const row of strategyRows) {
    const isActive = row.status === 'active' && !row.closedAt;
    if (!isActive) continue;
    strategyMap.set(row.id, { ...row, positions: [] });
  }

  const unlinkedPositions: PositionRow[] = [];
  for (const pos of allPositions) {
    if (pos.strategyId && strategyMap.has(pos.strategyId)) {
      strategyMap.get(pos.strategyId)!.positions.push(pos);
    } else {
      unlinkedPositions.push(pos);
    }
  }

  // 6. Cash breakdown
  const cashRows = await db
    .select({
      currency: cashBalances.currency,
      balance: sql<string>`SUM(CAST(${cashBalances.balance} AS NUMERIC))`,
      balanceUsd: sql<string>`SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC))`,
      source: cashBalances.source,
      accountId: cashBalances.accountId,
    })
    .from(cashBalances)
    .where(
      and(
        inArray(cashBalances.accountId, accountIds),
        sql`${cashBalances.snapshotDate} = (
          SELECT MAX(cb2.snapshot_date)
          FROM cash_balances cb2
          WHERE cb2.account_id = ${cashBalances.accountId}
        )`
      )
    )
    .groupBy(cashBalances.currency, cashBalances.source, cashBalances.accountId)
    .orderBy(desc(sql`SUM(CAST(${cashBalances.balanceUsd} AS NUMERIC))`));

  // 7. Group by underlying
  const underlyingGroups = new Map<string, {
    ticker: string;
    positions: PositionRow[];
    strategies: string[];
    totalMarketValue: number;
    totalNotional: number;
  }>();

  for (const pos of allPositions) {
    const ticker = pos.parentUnderlyingTicker ?? pos.underlyingTicker ?? pos.symbol;
    if (!underlyingGroups.has(ticker)) {
      underlyingGroups.set(ticker, {
        ticker,
        positions: [],
        strategies: [],
        totalMarketValue: 0,
        totalNotional: 0,
      });
    }
    const group = underlyingGroups.get(ticker)!;
    group.positions.push(pos);
    group.totalMarketValue += pos.marketValueUsd ?? 0;
    group.totalNotional += Math.abs(pos.marketValueUsd ?? pos.absNotionalUsd ?? 0);
    if (pos.strategyId && !group.strategies.includes(pos.strategyId)) {
      group.strategies.push(pos.strategyId);
    }
  }

  // Sort underlyings by abs notional descending
  const sortedUnderlyings = [...underlyingGroups.values()].sort(
    (a, b) => b.totalNotional - a.totalNotional
  );

  // --- OUTPUT ---

  if (formatJson) {
    const output = {
      snapshotDate,
      nav,
      totalCashUsd,
      totalAbsNotional,
      leverageRatio,
      ownerBreakdown: ownerRows.map((r) => ({
        owner: r.owner,
        nav: toNum(r.nav),
      })),
      underlyingBreakdown: sortedUnderlyings.map((g) => ({
        ticker: g.ticker,
        positionCount: g.positions.length,
        totalMarketValueUsd: g.totalMarketValue,
        totalAbsNotionalUsd: g.totalNotional,
        pctNav: nav ? g.totalNotional / nav : null,
        positions: g.positions.map((p) => ({
          symbol: p.symbol,
          assetClass: p.assetClass,
          quantity: p.quantity,
          avgPrice: p.avgPrice,
          spot: p.spot,
          marketValueUsd: p.marketValueUsd,
          unrealizedPnl: p.unrealizedPnl,
          expiry: p.expiry,
          strike: p.strike,
          optionRight: p.optionRight,
          side: p.side,
          account: p.accountLabel,
          owner: p.accountOwner,
          strategyId: p.strategyId,
        })),
      })),
      strategies: [...strategyMap.values()].map((s) => ({
        id: s.id,
        strategyKey: s.strategyKey,
        label: s.label,
        direction: s.direction,
        strategyType: s.strategyType,
        assetThesisTitle: s.assetThesisTitle,
        positions: s.positions.map((p) => ({
          symbol: p.symbol,
          quantity: p.quantity,
          marketValueUsd: p.marketValueUsd,
          unrealizedPnl: p.unrealizedPnl,
        })),
        totalMarketValueUsd: s.positions.reduce(
          (sum, p) => sum + (p.marketValueUsd ?? 0),
          0
        ),
      })),
      unlinkedPositions: unlinkedPositions.map((p) => ({
        symbol: p.symbol,
        assetClass: p.assetClass,
        quantity: p.quantity,
        marketValueUsd: p.marketValueUsd,
        account: p.accountLabel,
        owner: p.accountOwner,
      })),
      cashBreakdown: cashRows.map((r) => ({
        currency: r.currency,
        source: r.source,
        balance: toNum(r.balance),
        balanceUsd: toNum(r.balanceUsd),
        account: accountMap.get(r.accountId)?.label ?? r.accountId,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Human-readable output
    console.log('═══════════════════════════════════════════════════════');
    console.log('  PORTFOLIO SNAPSHOT');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Date:       ${snapshotDate ?? '—'}`);
    console.log(`  NAV:        ${fmtUsd(nav)}`);
    console.log(`  Cash:       ${fmtUsd(totalCashUsd)}`);
    console.log(`  Gross Exp:  ${fmtUsd(totalAbsNotional)}`);
    console.log(`  Leverage:   ${leverageRatio ? leverageRatio.toFixed(2) + 'x' : '—'}`);
    console.log(`  Positions:  ${allPositions.length}`);
    console.log('───────────────────────────────────────────────────────');

    // Owner breakdown
    console.log('\n  OWNER BREAKDOWN');
    console.log('  ─────────────────');
    for (const o of ownerRows) {
      const ownerNav = toNum(o.nav);
      console.log(`  ${(o.owner ?? 'Unknown').padEnd(12)} ${fmtUsd(ownerNav).padStart(10)}  ${nav ? fmtPct(ownerNav! / nav) : '—'}`);
    }

    // Underlying breakdown
    console.log('\n  UNDERLYING BREAKDOWN');
    console.log('  ─────────────────────────────────────────────────────');
    console.log('  ' + 'Ticker'.padEnd(10) + 'Positions'.padEnd(12) + 'Market Value'.padStart(14) + '  % NAV'.padStart(8));
    console.log('  ' + '─'.repeat(50));
    for (const g of sortedUnderlyings) {
      const pctNav = nav ? g.totalNotional / nav : null;
      console.log(
        '  ' +
          g.ticker.padEnd(10) +
          String(g.positions.length).padEnd(12) +
          fmtUsd(g.totalMarketValue).padStart(14) +
          ('  ' + fmtPct(pctNav)).padStart(8)
      );
    }

    // Strategy detail
    console.log('\n  ACTIVE STRATEGIES');
    console.log('  ─────────────────────────────────────────────────────');
    const sortedStrategies = [...strategyMap.values()].sort((a, b) => {
      const aVal = a.positions.reduce((s, p) => s + Math.abs(p.marketValueUsd ?? 0), 0);
      const bVal = b.positions.reduce((s, p) => s + Math.abs(p.marketValueUsd ?? 0), 0);
      return bVal - aVal;
    });

    for (const strat of sortedStrategies) {
      const totalMv = strat.positions.reduce((s, p) => s + (p.marketValueUsd ?? 0), 0);
      const totalPnl = strat.positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
      console.log(`\n  ▸ ${strat.label ?? strat.strategyKey} [${strat.direction ?? '—'}]`);
      if (strat.assetThesisTitle) {
        console.log(`    Thesis: ${strat.assetThesisTitle}`);
      }
      console.log(`    Type: ${strat.strategyType ?? '—'}  |  MV: ${fmtUsd(totalMv)}  |  PnL: ${fmtUsd(totalPnl)}`);
      for (const p of strat.positions) {
        const desc = p.optionRight
          ? `${p.symbol} ${p.expiry ?? ''} ${p.strike ?? ''}${p.optionRight ?? ''}`
          : p.symbol;
        console.log(
          `      ${desc.padEnd(30)} qty: ${fmt(p.quantity).padStart(8)}  mv: ${fmtUsd(p.marketValueUsd).padStart(10)}  pnl: ${fmtUsd(p.unrealizedPnl).padStart(10)}`
        );
      }
    }

    // Unlinked positions
    if (unlinkedPositions.length > 0) {
      console.log(`\n  UNLINKED POSITIONS (${unlinkedPositions.length})`);
      console.log('  ─────────────────────────────────────────────────────');
      for (const p of unlinkedPositions) {
        const desc = p.optionRight
          ? `${p.symbol} ${p.expiry ?? ''} ${p.strike ?? ''}${p.optionRight ?? ''}`
          : p.symbol;
        console.log(
          `  ${desc.padEnd(30)} qty: ${fmt(p.quantity).padStart(8)}  mv: ${fmtUsd(p.marketValueUsd).padStart(10)}  [${p.accountLabel ?? '—'}]`
        );
      }
    }

    // Cash breakdown
    console.log('\n  CASH BREAKDOWN');
    console.log('  ─────────────────────────────────────────────────────');
    for (const c of cashRows) {
      const bal = toNum(c.balanceUsd);
      if (bal !== null && Math.abs(bal) < 1) continue; // Skip dust
      const acct = accountMap.get(c.accountId);
      console.log(
        `  ${(c.currency ?? '?').padEnd(6)} ${(c.source ?? '—').padEnd(14)} ${fmtUsd(bal).padStart(10)}  [${acct?.label ?? '—'}]`
      );
    }

    console.log('\n═══════════════════════════════════════════════════════');
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
