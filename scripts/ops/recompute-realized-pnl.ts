/**
 * Recompute realized PnL columns on strategy_metrics_snapshots (W4).
 *
 * Idempotent backfill/repair tool. The daily pipeline maintains these columns
 * via computeStrategyMetrics(); this tool rebuilds history efficiently:
 * one trades load per (account, strategy) scope, then a running cumulative
 * across that scope's existing snapshot rows.
 *
 * Usage:
 *   npx tsx scripts/ops/recompute-realized-pnl.ts            # all scopes
 *   npx tsx scripts/ops/recompute-realized-pnl.ts --strategy-id <uuid>
 *   npx tsx scripts/ops/recompute-realized-pnl.ts --dry-run
 *
 * Coverage note: confidence is assessed against the LATEST snapshot date's
 * positions and applied to all rows in the scope (per-date assessment is done
 * by the daily path; for backfill the latest reconciliation is the meaningful
 * one — history gaps don't heal by going back in time).
 */
import { db, closeDb, schema } from '../lib/db';
import { and, eq, sql } from 'drizzle-orm';
import {
  computeRealizedSeries,
  assessCoverage,
  fetchFuturesMultipliers,
  type TradeForRealizedPnl,
} from '../../src/lib/derived/realizedPnl';
import { writeClosingSnapshotIfNeeded } from '../../src/lib/derived/strategyMetrics';

const { strategyMetricsSnapshots, trades, positions } = schema;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const stratIdx = args.indexOf('--strategy-id');
  const onlyStrategy = stratIdx >= 0 ? args[stratIdx + 1] : null;

  const scopes = await db
    .selectDistinct({
      accountId: strategyMetricsSnapshots.accountId,
      strategyId: strategyMetricsSnapshots.strategyId,
    })
    .from(strategyMetricsSnapshots)
    .where(onlyStrategy ? eq(strategyMetricsSnapshots.strategyId, onlyStrategy) : undefined);

  console.log(`Scopes to process: ${scopes.length}${dryRun ? ' (dry run)' : ''}`);
  let rowsUpdated = 0;
  const confidenceCounts: Record<string, number> = {};

  for (const scope of scopes) {
    const tradeRows = await db
      .select({
        symbol: trades.symbol,
        assetClass: trades.assetClass,
        side: trades.side,
        quantity: trades.quantity,
        price: trades.price,
        netAmount: trades.netAmount,
        fees: trades.fees,
        fxRateToBase: trades.fxRateToBase,
        tradeDate: trades.tradeDate,
      })
      .from(trades)
      .where(
        and(eq(trades.accountId, scope.accountId), eq(trades.strategyId, scope.strategyId))
      );

    // Terminal row first: a strategy whose positions vanished needs its
    // close-date snapshot (unrealized 0, realized lands) before the walk below.
    if (!dryRun) {
      await writeClosingSnapshotIfNeeded(scope.accountId, scope.strategyId);
    }

    const snapshotRows = await db
      .select({
        id: strategyMetricsSnapshots.id,
        snapshotDate: strategyMetricsSnapshots.snapshotDate,
        totalUnrealizedPnl: strategyMetricsSnapshots.totalUnrealizedPnl,
      })
      .from(strategyMetricsSnapshots)
      .where(
        and(
          eq(strategyMetricsSnapshots.accountId, scope.accountId),
          eq(strategyMetricsSnapshots.strategyId, scope.strategyId)
        )
      )
      .orderBy(strategyMetricsSnapshots.snapshotDate);

    if (snapshotRows.length === 0) continue;

    let confidence: 'full' | 'partial_history' | 'no_trades' = 'no_trades';
    const cumulativeByDate = new Map<string, number>();

    if (tradeRows.length > 0) {
      const multipliers = await fetchFuturesMultipliers(
        scope.accountId,
        tradeRows.filter((r) => (r.assetClass ?? '').toUpperCase() === 'FUT').map((r) => r.symbol)
      );
      const series = computeRealizedSeries(
        tradeRows.map((r): TradeForRealizedPnl => ({
          ...r,
          quantity: r.quantity ?? '0',
          tradeDate: r.tradeDate ?? '1970-01-01',
          multiplier: multipliers.get(r.symbol) ?? null,
        }))
      );

      // Running cumulative over sorted realized dates.
      const sortedDates = [...series.realizedByDate.keys()].sort();
      let running = 0;
      const runningByDate: Array<{ date: string; total: number }> = [];
      for (const d of sortedDates) {
        running += series.realizedByDate.get(d)!;
        runningByDate.push({ date: d, total: running });
      }
      // For each snapshot date, take the last realized total at or before it.
      for (const row of snapshotRows) {
        let total = 0;
        for (const entry of runningByDate) {
          if (entry.date <= row.snapshotDate) total = entry.total;
          else break;
        }
        cumulativeByDate.set(row.snapshotDate, total);
      }

      const latestDate = snapshotRows[snapshotRows.length - 1].snapshotDate;
      const positionRows = await db
        .select({ symbol: positions.symbol, quantity: positions.quantity })
        .from(positions)
        .where(
          and(
            eq(positions.accountId, scope.accountId),
            eq(positions.strategyId, scope.strategyId),
            eq(positions.snapshotDate, latestDate),
            sql`${positions.quantity} != 0`
          )
        );
      confidence = assessCoverage(
        series.netQtyBySymbol,
        positionRows.map((p) => ({
          symbol: p.symbol,
          quantity: parseFloat(p.quantity ?? '0') || 0,
        })),
        series.skippedTrades
      );
    }

    confidenceCounts[confidence] = (confidenceCounts[confidence] ?? 0) + 1;

    if (!dryRun) {
      for (const row of snapshotRows) {
        const realized = confidence === 'no_trades' ? null : (cumulativeByDate.get(row.snapshotDate) ?? 0);
        const unreal = row.totalUnrealizedPnl ? parseFloat(row.totalUnrealizedPnl) : 0;
        const cumulative = realized !== null || row.totalUnrealizedPnl !== null
          ? ((realized ?? 0) + unreal).toFixed(2)
          : null;
        await db
          .update(strategyMetricsSnapshots)
          .set({
            realizedPnlToDate: realized !== null ? realized.toFixed(2) : null,
            cumulativePnl: cumulative,
            realizedConfidence: confidence,
            updatedAt: new Date(),
          })
          .where(eq(strategyMetricsSnapshots.id, row.id));
        rowsUpdated++;
      }
    } else {
      rowsUpdated += snapshotRows.length;
    }
  }

  console.log(`Done. Rows ${dryRun ? 'would update' : 'updated'}: ${rowsUpdated}`);
  console.log('Confidence by scope:', JSON.stringify(confidenceCounts));
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
