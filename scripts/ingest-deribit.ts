#!/usr/bin/env tsx
/**
 * Deribit ingestion script.
 * Fetches spot trades (fills) and account balances from Deribit API.
 * Runs incrementally using cursors stored in ingestion_cursors table.
 *
 * Options/futures support deferred — currently handles spot trades and balances only.
 *
 * Usage:
 *   npx tsx scripts/ingest-deribit.ts
 *   npx tsx scripts/ingest-deribit.ts --full   # Force full backfill
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, ne } from 'drizzle-orm';

// Deribit API functions
import { fetchAllTrades, fetchAllAccountSummaries, fetchAllIndexPrices } from '../src/lib/ingestion/deribit/api.js';
import { normalizeDeribitTrade } from '../src/lib/ingestion/deribit/fills.js';
import { toNewTrade, toNewPosition } from '../src/lib/ingestion/crypto/types.js';
import type { CryptoPositionInput } from '../src/lib/ingestion/crypto/types.js';
import { upsertCashBalances } from '../src/lib/ingestion/crypto/cashBalances.js';
import type { CashBalanceInput } from '../src/lib/ingestion/crypto/cashBalances.js';

// Reuse existing infra
import { upsertAccount } from '../src/lib/ingestion/flex/account.js';
import { ensureUnderlyingId } from '../src/lib/ingestion/flex/underlyings.js';
import { trackProcess } from '../src/lib/services/processTracking.js';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '../src/lib/derived/strategyAuto.js';
import { computeTriageForDate } from '../src/lib/derived/triage.js';
import { computePortfolioSnapshotsForDateRange } from '../src/lib/derived/portfolio.js';
import { computeStrategyMetricsForDateRange } from '../src/lib/derived/strategyMetrics.js';
import { evaluateStrategySignalsForDate } from '../src/lib/derived/signalEvaluation.js';

const { trades, positions, underlyings, ingestionCursors, strategies } = schema;

// Stablecoins to skip in balance positions
const SKIP_CURRENCIES = new Set(['USDC', 'USDT']);

// ── Cursor helpers (inline to avoid @/ import in scripts) ──────────

async function getCursor(
  accountId: string,
  exchange: string,
  cursorType: string
): Promise<string | null> {
  const result = await db
    .select({ cursorValue: ingestionCursors.cursorValue })
    .from(ingestionCursors)
    .where(
      and(
        eq(ingestionCursors.accountId, accountId),
        eq(ingestionCursors.exchange, exchange),
        eq(ingestionCursors.cursorType, cursorType)
      )
    )
    .limit(1);
  return result[0]?.cursorValue ?? null;
}

async function setCursor(
  accountId: string,
  exchange: string,
  cursorType: string,
  value: string
): Promise<void> {
  await db
    .insert(ingestionCursors)
    .values({ accountId, exchange, cursorType, cursorValue: value })
    .onConflictDoUpdate({
      target: [ingestionCursors.accountId, ingestionCursors.exchange, ingestionCursors.cursorType],
      set: { cursorValue: value, updatedAt: new Date() },
    });
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const clientId = process.env.DERIBIT_CLIENT_ID;
  if (!clientId) {
    console.error('DERIBIT_CLIENT_ID environment variable is required');
    process.exit(1);
  }

  const forceFullBackfill = process.argv.includes('--full');
  const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[Deribit] Starting Deribit ingestion...`);
  console.log(`[Deribit] Snapshot date: ${snapshotDate}`);
  if (forceFullBackfill) {
    console.log(`[Deribit] Mode: Full backfill (--full flag)`);
  }

  // Resolve account ID with label (creates or updates)
  const label = process.env.DERIBIT_ACCOUNT_LABEL || 'Nick_DERIBIT';
  const accountId = await upsertAccount({
    brokerAccountId: clientId,
    brokerName: 'Deribit',
    baseCurrency: 'USD',
    label,
  });
  console.log(`[Deribit] Account ID: ${accountId} (${label})`);

  await trackProcess(
    'deribit_ingestion',
    'scheduled',
    { snapshotDate },
    async () => {
      // ── Step 1: Fetch trades incrementally ──────────────────────
      console.log('\n[Deribit] Fetching trades...');

      let startTimestamp: number | undefined;
      if (!forceFullBackfill) {
        const cursor = await getCursor(accountId, 'deribit', 'fills');
        if (cursor) {
          // Resume from cursor (Unix ms timestamp) + 1ms
          startTimestamp = parseInt(cursor, 10) + 1;
          const resumeDate = new Date(startTimestamp).toISOString();
          console.log(`[Deribit] Resuming from cursor: ${resumeDate}`);
        } else {
          console.log(`[Deribit] No cursor found, performing initial backfill`);
        }
      } else {
        console.log(`[Deribit] Full backfill (no start timestamp)`);
      }

      const { trades: deribitTrades, latestTimestamp } = await fetchAllTrades(startTimestamp);
      console.log(`[Deribit] Fetched ${deribitTrades.length} trades`);

      // Normalize all trades
      const normalizedTrades = deribitTrades.map((trade) => {
        const normalized = normalizeDeribitTrade(trade, accountId);
        return toNewTrade(normalized);
      });

      // Batch insert in chunks
      let tradesInserted = 0;
      const BATCH_SIZE = 200;

      for (let i = 0; i < normalizedTrades.length; i += BATCH_SIZE) {
        const batch = normalizedTrades.slice(i, i + BATCH_SIZE);
        try {
          const result = await db
            .insert(trades)
            .values(batch)
            .onConflictDoNothing({ target: trades.brokerTransactionId });

          tradesInserted += result.rowCount ?? 0;
        } catch (error) {
          console.warn(`[Deribit] Batch insert failed at offset ${i}, falling back to individual inserts`);
          for (const trade of batch) {
            try {
              const result = await db
                .insert(trades)
                .values(trade)
                .onConflictDoNothing({ target: trades.brokerTransactionId });
              tradesInserted += result.rowCount ?? 0;
            } catch (innerError) {
              console.warn(`[Deribit] Failed to insert trade ${trade.brokerTransactionId}:`, innerError);
            }
          }
        }
        if (i + BATCH_SIZE < normalizedTrades.length) {
          console.log(`[Deribit] Trades: inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(normalizedTrades.length / BATCH_SIZE)}`);
        }
      }

      const tradesSkipped = deribitTrades.length - tradesInserted;
      console.log(`[Deribit] Trades: ${tradesInserted} inserted, ${tradesSkipped} skipped (duplicates)`);

      // Update cursor
      if (latestTimestamp !== null) {
        await setCursor(accountId, 'deribit', 'fills', latestTimestamp.toString());
      }

      // ── Step 2: Fetch account balances (spot positions) ─────────
      console.log('\n[Deribit] Fetching account balances...');
      const summaries = await fetchAllAccountSummaries();
      console.log(`[Deribit] Fetched ${summaries.length} account summaries`);

      // Fetch index prices for USD conversion
      console.log('[Deribit] Fetching index prices...');
      const indexPrices = await fetchAllIndexPrices();
      console.log(`[Deribit] Index prices: ${Array.from(indexPrices.entries()).map(([k, v]) => `${k}=$${v.toFixed(2)}`).join(', ')}`);

      // Extract cash balances from stablecoin accounts
      const cashInputs: CashBalanceInput[] = [];
      for (const summary of summaries) {
        if (summary.balance === 0) continue;
        const symbol = summary.currency.toUpperCase();
        if (SKIP_CURRENCIES.has(symbol)) {
          cashInputs.push({
            accountId,
            snapshotDate,
            currency: symbol,
            balance: summary.balance.toString(),
            balanceUsd: summary.balance.toString(),
            source: 'deribit',
          });
        }
      }
      const cashInserted = await upsertCashBalances(cashInputs);
      console.log(`[Deribit] Cash balances: ${cashInserted} inserted (${cashInputs.map(c => `${c.currency}: $${c.balanceUsd ?? '?'}`).join(', ') || 'none'})`);

      // Normalize balances into positions
      const balancePositions: CryptoPositionInput[] = [];
      for (const summary of summaries) {
        if (summary.equity === 0) continue;
        const symbol = summary.currency.toUpperCase();
        if (SKIP_CURRENCIES.has(symbol)) continue;

        const spot = indexPrices.get(symbol) ?? null;
        const absNotional = spot ? Math.abs(summary.equity) * spot : null;

        balancePositions.push({
          accountId,
          underlyingId: null,
          assetClass: 'CRYPTO',
          symbol,
          multiplier: '1',
          side: summary.equity > 0 ? 'LONG' : 'SHORT',
          quantity: summary.equity.toString(),
          avgPrice: null, // No cost basis from account summary
          costBasisMoney: null,
          positionType: summary.equity > 0 ? 'crypto_long' : 'crypto_short',
          isOpen: true,
          spot: spot?.toString() ?? null,
          absNotional: absNotional?.toFixed(6) ?? null,
          unrealizedPnl: null,
          snapshotDate,
        });
      }
      console.log(`[Deribit] Positions: ${balancePositions.length} active (non-stablecoin)`);

      // ── Step 3: Resolve underlyings and upsert positions ────────
      console.log('\n[Deribit] Resolving underlyings and upserting positions...');

      for (const pos of balancePositions) {
        const underlyingId = await ensureUnderlyingId(
          pos.symbol,
          pos.assetClass,
          'USD',
          null
        );
        pos.underlyingId = underlyingId;

        // Update underlying spot price if available
        if (underlyingId && pos.spot) {
          await db
            .update(underlyings)
            .set({ spot: pos.spot, updatedAt: new Date() })
            .where(eq(underlyings.id, underlyingId));
        }
      }

      // Delete existing positions for today's snapshot (idempotent replace)
      await db
        .delete(positions)
        .where(
          and(
            eq(positions.accountId, accountId),
            eq(positions.snapshotDate, snapshotDate),
            eq(positions.assetClass, 'CRYPTO')
          )
        );

      // Insert all positions
      if (balancePositions.length > 0) {
        const newPositions = balancePositions.map(toNewPosition);
        await db.insert(positions).values(newPositions);
      }

      console.log(`[Deribit] Inserted ${balancePositions.length} positions for ${snapshotDate}`);

      // ── Step 4: Recompute derived data ─────────────────────────
      console.log('\n[Deribit] Running recompute chain...');

      // Auto-link positions and trades to strategies
      const linkResult = await autoLinkPositionsToStrategies(accountId, {
        snapshotDate,
      });
      console.log(`[Deribit] Strategy auto-link: ${linkResult.strategiesCreated} created, ${linkResult.positionsLinked} linked`);

      const tradeLinkResult = await autoLinkTradesToStrategies(accountId, {
        snapshotDate,
      });
      console.log(`[Deribit] Trade auto-link: ${tradeLinkResult.tradesLinked} linked`);

      // Compute portfolio snapshots
      await computePortfolioSnapshotsForDateRange(accountId, snapshotDate, snapshotDate);

      // Compute strategy metrics for all active strategies on this account
      const accountStrategies = await db
        .select({ id: strategies.id })
        .from(strategies)
        .where(
          and(
            eq(strategies.accountId, accountId),
            ne(strategies.status, 'rejected')
          )
        );

      for (const strategy of accountStrategies) {
        await computeStrategyMetricsForDateRange(accountId, strategy.id, snapshotDate, snapshotDate);
      }
      console.log(`[Deribit] Strategy metrics: computed for ${accountStrategies.length} strategies`);

      // Compute triage
      const triageResult = await computeTriageForDate(snapshotDate, accountId, undefined, true);
      console.log(`[Deribit] Triage: ${triageResult.position} position, ${triageResult.strategy} strategy records`);

      // Evaluate signals
      const signalResults = await evaluateStrategySignalsForDate(accountId, snapshotDate);
      const triggered = signalResults.filter((r) => r.triggered);
      if (triggered.length > 0) {
        console.log(`[Deribit] Signals: ${triggered.length} triggered`);
      }

      return {
        tradesInserted,
        tradesSkipped,
        totalTrades: deribitTrades.length,
        positions: balancePositions.length,
        strategiesCreated: linkResult.strategiesCreated,
        positionsLinked: linkResult.positionsLinked,
      };
    }
  );

  console.log('\n[Deribit] Deribit ingestion complete!');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Deribit] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
