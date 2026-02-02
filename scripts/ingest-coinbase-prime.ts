#!/usr/bin/env tsx
/**
 * Coinbase Prime ingestion script.
 * Fetches fills (trades) and balances (positions) from Coinbase Prime API.
 * Runs incrementally using cursors stored in ingestion_cursors table.
 *
 * Usage:
 *   npx tsx scripts/ingest-coinbase-prime.ts
 *   npx tsx scripts/ingest-coinbase-prime.ts --full   # Force full backfill
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, ne, sql } from 'drizzle-orm';

// Coinbase Prime API functions
import { fetchAllFills, fetchBalances } from '../src/lib/ingestion/coinbase-prime/api.js';
import { normalizeCBPFill } from '../src/lib/ingestion/coinbase-prime/fills.js';
import { normalizeCBPBalances, extractCBPCashBalances } from '../src/lib/ingestion/coinbase-prime/balances.js';
import { toNewTrade, toNewPosition } from '../src/lib/ingestion/crypto/types.js';
import { upsertCashBalances } from '../src/lib/ingestion/crypto/cashBalances.js';

// Reuse existing infra
import { resolveAccountId } from '../src/lib/ingestion/flex/account.js';
import { ensureUnderlyingId } from '../src/lib/ingestion/flex/underlyings.js';
import { trackProcess } from '../src/lib/services/processTracking.js';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '../src/lib/derived/strategyAuto.js';
import { computeTriageForDate } from '../src/lib/derived/triage.js';
import { computePortfolioSnapshotsForDateRange } from '../src/lib/derived/portfolio.js';
import { computeStrategyMetricsForDateRange } from '../src/lib/derived/strategyMetrics.js';
import { evaluateStrategySignalsForDate } from '../src/lib/derived/signalEvaluation.js';

const { trades, positions, underlyings, ingestionCursors, strategies } = schema;

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
  const portfolioId = process.env.COINBASE_PRIME_PORTFOLIO_ID;
  if (!portfolioId) {
    console.error('COINBASE_PRIME_PORTFOLIO_ID environment variable is required');
    process.exit(1);
  }

  const forceFullBackfill = process.argv.includes('--full');
  const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[CBP] Starting Coinbase Prime ingestion...`);
  console.log(`[CBP] Portfolio: ${portfolioId.slice(0, 8)}...`);
  console.log(`[CBP] Snapshot date: ${snapshotDate}`);
  if (forceFullBackfill) {
    console.log(`[CBP] Mode: Full backfill (--full flag)`);
  }

  // Resolve account ID (creates if not exists)
  const accountId = await resolveAccountId(portfolioId, 'CoinbasePrime');
  console.log(`[CBP] Account ID: ${accountId}`);

  await trackProcess(
    'coinbase_prime_ingestion',
    'scheduled',
    { portfolioId: portfolioId.slice(0, 8) + '...', snapshotDate },
    async () => {
      // ── Step 1: Fetch fills incrementally ──────────────────────
      console.log('\n[CBP] Fetching fills...');

      // start_date is required by the CBP fills endpoint
      let startDate: string;
      if (!forceFullBackfill) {
        const cursor = await getCursor(accountId, 'coinbase_prime', 'fills');
        if (cursor) {
          // Start from cursor (ISO timestamp of last fill)
          // Add 1 second to avoid re-fetching the exact same fill
          const cursorDate = new Date(cursor);
          cursorDate.setSeconds(cursorDate.getSeconds() + 1);
          startDate = cursorDate.toISOString();
          console.log(`[CBP] Resuming from cursor: ${startDate}`);
        } else {
          // Initial backfill: go back 2 years
          startDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
          console.log(`[CBP] No cursor found, performing initial backfill from ${startDate.split('T')[0]}`);
        }
      } else {
        startDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
        console.log(`[CBP] Full backfill from ${startDate.split('T')[0]}`);
      }

      const { fills, latestTimestamp } = await fetchAllFills(portfolioId, startDate);
      console.log(`[CBP] Fetched ${fills.length} fills`);

      // Normalize all fills
      const normalizedTrades = fills.map((fill) => {
        const normalized = normalizeCBPFill(fill, accountId);
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
          console.warn(`[CBP] Batch insert failed at offset ${i}, falling back to individual inserts`);
          for (const trade of batch) {
            try {
              const result = await db
                .insert(trades)
                .values(trade)
                .onConflictDoNothing({ target: trades.brokerTransactionId });
              tradesInserted += result.rowCount ?? 0;
            } catch (innerError) {
              console.warn(`[CBP] Failed to insert trade ${trade.brokerTransactionId}:`, innerError);
            }
          }
        }
        if (i + BATCH_SIZE < normalizedTrades.length) {
          console.log(`[CBP] Trades: inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(normalizedTrades.length / BATCH_SIZE)}`);
        }
      }

      const tradesSkipped = fills.length - tradesInserted;
      console.log(`[CBP] Trades: ${tradesInserted} inserted, ${tradesSkipped} skipped (duplicates)`);

      // Update cursor
      if (latestTimestamp) {
        await setCursor(accountId, 'coinbase_prime', 'fills', latestTimestamp);
      }

      // ── Step 2: Fetch balances (positions) ────────────────────
      console.log('\n[CBP] Fetching balances...');
      const balances = await fetchBalances(portfolioId);
      const cbpPositions = normalizeCBPBalances(balances, accountId, snapshotDate);
      console.log(`[CBP] Positions: ${cbpPositions.length} active (non-stablecoin)`);

      // ── Step 2b: Extract cash balances ──────────────────────
      const cashInputs = extractCBPCashBalances(balances, accountId, snapshotDate);
      const cashInserted = await upsertCashBalances(cashInputs);
      console.log(`[CBP] Cash balances: ${cashInserted} inserted (${cashInputs.map(c => `${c.currency}: $${c.balanceUsd ?? '?'}`).join(', ') || 'none'})`);

      // ── Step 3: Resolve underlyings and upsert positions ──────
      console.log('\n[CBP] Resolving underlyings and upserting positions...');

      for (const pos of cbpPositions) {
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
      if (cbpPositions.length > 0) {
        const newPositions = cbpPositions.map(toNewPosition);
        await db.insert(positions).values(newPositions);
      }

      console.log(`[CBP] Inserted ${cbpPositions.length} positions for ${snapshotDate}`);

      // ── Step 4: Recompute derived data ─────────────────────────
      console.log('\n[CBP] Running recompute chain...');

      // Auto-link positions and trades to strategies
      const linkResult = await autoLinkPositionsToStrategies(accountId, {
        snapshotDate,
      });
      console.log(`[CBP] Strategy auto-link: ${linkResult.strategiesCreated} created, ${linkResult.positionsLinked} linked`);

      const tradeLinkResult = await autoLinkTradesToStrategies(accountId, {
        snapshotDate,
      });
      console.log(`[CBP] Trade auto-link: ${tradeLinkResult.tradesLinked} linked`);

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
      console.log(`[CBP] Strategy metrics: computed for ${accountStrategies.length} strategies`);

      // Compute triage
      const triageResult = await computeTriageForDate(snapshotDate, accountId, undefined, true);
      console.log(`[CBP] Triage: ${triageResult.position} position, ${triageResult.strategy} strategy records`);

      // Evaluate signals
      const signalResults = await evaluateStrategySignalsForDate(accountId, snapshotDate);
      const triggered = signalResults.filter((r) => r.triggered);
      if (triggered.length > 0) {
        console.log(`[CBP] Signals: ${triggered.length} triggered`);
      }

      return {
        tradesInserted,
        tradesSkipped,
        totalFills: fills.length,
        positions: cbpPositions.length,
        strategiesCreated: linkResult.strategiesCreated,
        positionsLinked: linkResult.positionsLinked,
      };
    }
  );

  console.log('\n[CBP] Coinbase Prime ingestion complete!');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[CBP] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
