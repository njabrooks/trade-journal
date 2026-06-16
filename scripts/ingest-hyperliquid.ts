#!/usr/bin/env tsx
/**
 * HyperLiquid ingestion script.
 * Fetches fills (trades) and positions (perps + spot) from HyperLiquid API.
 * Runs incrementally using cursors stored in ingestion_cursors table.
 *
 * Usage:
 *   npx tsx scripts/ingest-hyperliquid.ts
 *   npx tsx scripts/ingest-hyperliquid.ts --full   # Force full backfill
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, ne, sql } from 'drizzle-orm';

// HyperLiquid API functions
import {
  fetchFillsByTime,
  fetchClearinghouseState,
  fetchSpotClearinghouseState,
  fetchDelegatorSummary,
  fetchAllMids,
  fetchSpotMeta,
  buildSpotMetaMap,
  fetchPortfolio,
  latestAccountValue,
} from '../src/lib/ingestion/hyperliquid/api.js';
import { getHLSpotCanonicalTicker } from '../src/lib/ingestion/crypto/pairNormalization.js';

import { normalizeHLFill, fetchAllFillsFrom } from '../src/lib/ingestion/hyperliquid/fills.js';
import { normalizeHLPerpPositions, normalizeHLSpotPositions, normalizeHLStakedPosition, extractHLCashBalances } from '../src/lib/ingestion/hyperliquid/positions.js';
import { toNewTrade, toNewPosition } from '../src/lib/ingestion/crypto/types.js';
import { upsertCashBalances } from '../src/lib/ingestion/crypto/cashBalances.js';

// Reuse existing infra
import { resolveAccountId } from '../src/lib/ingestion/flex/account.js';
import { ensureUnderlyingId } from '../src/lib/ingestion/flex/underlyings.js';
import { createTradeIngestionRecords } from '../src/lib/ingestion/flex/processCsv.js';
import { trackProcess } from '../src/lib/services/processTracking.js';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '../src/lib/derived/strategyAuto.js';
import { computePortfolioSnapshotsForDateRange } from '../src/lib/derived/portfolio.js';
import { computeStrategyMetricsForDateRange } from '../src/lib/derived/strategyMetrics.js';
import { evaluateStrategySignalsForDate } from '../src/lib/derived/signalEvaluation.js';

const { trades, positions, underlyings, ingestionCursors, strategies, navSnapshots } = schema;

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
  const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;
  if (!walletAddress) {
    console.error('HYPERLIQUID_WALLET_ADDRESS environment variable is required');
    process.exit(1);
  }

  const forceFullBackfill = process.argv.includes('--full');
  const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[HL] Starting HyperLiquid ingestion...`);
  console.log(`[HL] Wallet: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`);
  console.log(`[HL] Snapshot date: ${snapshotDate}`);
  if (forceFullBackfill) {
    console.log(`[HL] Mode: Full backfill (--full flag)`);
  }

  // Resolve account ID (creates if not exists)
  const accountId = await resolveAccountId(walletAddress, 'HyperLiquid');
  console.log(`[HL] Account ID: ${accountId}`);

  await trackProcess(
    'hyperliquid_ingestion',
    'scheduled',
    { walletAddress: walletAddress.slice(0, 8) + '...', snapshotDate },
    async () => {
      // ── Step 1: Fetch reference data ───────────────────────────
      console.log('\n[HL] Fetching spot metadata and mark prices...');

      const [spotMetaRaw, allMids] = await Promise.all([
        fetchSpotMeta(),
        fetchAllMids(),
      ]);

      const spotMeta = buildSpotMetaMap(spotMetaRaw);
      console.log(`[HL] Spot meta: ${spotMeta.size} tokens mapped`);

      // Build mark price map (string → number)
      const markPrices = new Map<string, number>();
      for (const [coin, midPrice] of Object.entries(allMids)) {
        const price = parseFloat(midPrice);
        if (!isNaN(price)) {
          markPrices.set(coin.toUpperCase(), price);
        }
      }
      console.log(`[HL] Mark prices: ${markPrices.size} assets`);

      // ── Step 2: Fetch fills incrementally ──────────────────────
      console.log('\n[HL] Fetching fills...');

      let startTimeMs = 0; // Default: epoch (full backfill)
      if (!forceFullBackfill) {
        const cursor = await getCursor(accountId, 'hyperliquid', 'fills');
        if (cursor) {
          // Start 1ms after last fill to avoid re-fetching it
          startTimeMs = parseInt(cursor, 10) + 1;
          console.log(`[HL] Resuming from cursor: ${new Date(startTimeMs).toISOString()}`);
        } else {
          console.log(`[HL] No cursor found, performing initial backfill`);
        }
      }

      const { fills, latestTimestamp } = await fetchAllFillsFrom(
        fetchFillsByTime,
        walletAddress,
        startTimeMs
      );

      console.log(`[HL] Fetched ${fills.length} fills`);

      // Normalize all fills
      const normalizedTrades = fills.map((fill) => {
        const normalized = normalizeHLFill(fill, accountId, spotMeta);
        return toNewTrade(normalized);
      });

      // Collect unique trade dates for later linking (must track BEFORE insert)
      const tradeDates = new Set<string>();
      for (const trade of normalizedTrades) {
        if (trade.tradeDate) {
          const tradeDateStr = new Date(trade.tradeDate).toISOString().split('T')[0];
          tradeDates.add(tradeDateStr);
        }
      }

      // Batch insert in chunks (avoid Supabase payload limits)
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
          console.warn(`[HL] Batch insert failed at offset ${i}, falling back to individual inserts`);
          // Fallback: insert one by one for this batch
          for (const trade of batch) {
            try {
              const result = await db
                .insert(trades)
                .values(trade)
                .onConflictDoNothing({ target: trades.brokerTransactionId });
              tradesInserted += result.rowCount ?? 0;
            } catch (innerError) {
              console.warn(`[HL] Failed to insert trade ${trade.brokerTransactionId}:`, innerError);
            }
          }
        }
        if (i + BATCH_SIZE < normalizedTrades.length) {
          console.log(`[HL] Trades: inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(normalizedTrades.length / BATCH_SIZE)}`);
        }
      }

      const tradesSkipped = fills.length - tradesInserted;
      console.log(`[HL] Trades: ${tradesInserted} inserted, ${tradesSkipped} skipped (duplicates)`);

      // Update cursor
      if (fills.length > 0) {
        await setCursor(accountId, 'hyperliquid', 'fills', latestTimestamp.toString());
      }

      // ── Step 3: Fetch perp positions ───────────────────────────
      console.log('\n[HL] Fetching perp positions...');
      const perpState = await fetchClearinghouseState(walletAddress);
      const perpPositions = normalizeHLPerpPositions(
        perpState,
        accountId,
        markPrices,
        snapshotDate
      );
      console.log(`[HL] Perp positions: ${perpPositions.length} active`);

      // ── Step 4: Fetch spot positions ───────────────────────────
      console.log('[HL] Fetching spot positions...');
      const spotState = await fetchSpotClearinghouseState(walletAddress);
      const spotPositions = normalizeHLSpotPositions(
        spotState.balances,
        accountId,
        markPrices,
        spotMeta,
        snapshotDate
      );
      console.log(`[HL] Spot positions: ${spotPositions.length} active`);

      // ── Step 4a: Store authoritative NAV + cash balances ──────
      {
        // Cash = spot stablecoin balances ONLY. HyperLiquid `withdrawable` is free margin
        // derived from the unified USDC collateral (which already embeds perp uPnL); counting
        // it as cash double-counts perp equity, so it is excluded (see extractHLCashBalances).
        const cashInputs = extractHLCashBalances(
          spotState.balances,
          accountId,
          spotMeta,
          snapshotDate
        );
        const totalCashUsd = cashInputs.reduce((sum, c) => sum + (c.balanceUsd ? parseFloat(c.balanceUsd) : 0), 0);

        // Authoritative NAV. HyperLiquid is unified cross-margin: perp uPnL is already embedded
        // in the spot USDC balance, so reconstructing NAV as (positions + cash) double-counts
        // perp gains. Instead, mirror the IBKR authoritative-NAV path — write the broker's own
        // account value (spot incl. unified perp equity + staking, the "Account Value" HL shows)
        // to nav_snapshots, so computeAccountLevelSnapshot uses it directly rather than deriving.
        // Verified against HL's reported Account Value to the dollar.
        const accountValue = latestAccountValue(await fetchPortfolio(walletAddress));
        if (accountValue > 0) {
          await db
            .insert(navSnapshots)
            .values({
              accountId,
              reportDate: snapshotDate,
              currency: 'USD',
              total: accountValue.toString(),
              cash: totalCashUsd.toString(),
            })
            .onConflictDoUpdate({
              target: [navSnapshots.accountId, navSnapshots.reportDate],
              set: { total: accountValue.toString(), cash: totalCashUsd.toString() },
            });
          console.log(`[HL] Authoritative NAV: $${accountValue.toFixed(0)} (cash: $${totalCashUsd.toFixed(0)})`);
        } else {
          console.warn(`[HL] portfolio endpoint returned no account value — nav_snapshots NOT written (would fall back to derived NAV)`);
        }

        // Upsert cash balances
        const cashInserted = await upsertCashBalances(cashInputs);
        console.log(`[HL] Cash balances: ${cashInserted} inserted (${cashInputs.map(c => `${c.currency}: $${c.balanceUsd ?? '?'}`).join(', ')})`);
      }

      // ── Step 4b: Fetch staked HYPE ────────────────────────────
      console.log('[HL] Fetching staked HYPE (delegations)...');
      const delegatorSummary = await fetchDelegatorSummary(walletAddress);
      const stakedPosition = normalizeHLStakedPosition(
        delegatorSummary,
        accountId,
        markPrices,
        snapshotDate
      );
      if (stakedPosition) {
        console.log(`[HL] Staked HYPE: ${parseFloat(delegatorSummary.delegated).toFixed(2)} HYPE ($${stakedPosition.absNotional ? parseFloat(stakedPosition.absNotional).toFixed(0) : '?'})`);
      } else {
        console.log(`[HL] Staked HYPE: none`);
      }

      // ── Step 5: Resolve underlyings and upsert positions ──────
      console.log('\n[HL] Resolving underlyings and upserting positions...');

      const allPositions = [...perpPositions, ...spotPositions, ...(stakedPosition ? [stakedPosition] : [])];

      // Resolve underlyingId for each position and update spot prices.
      // For spot CRYPTO positions, use canonical ticker (e.g. UZEC → ZEC) so
      // that wrapped HL tokens are grouped under their canonical underlying.
      for (const pos of allPositions) {
        const underlyingTicker = pos.assetClass === 'CRYPTO'
          ? getHLSpotCanonicalTicker(pos.symbol)
          : pos.symbol;
        const underlyingId = await ensureUnderlyingId(
          underlyingTicker,
          pos.assetClass,
          'USD',
          null
        );
        pos.underlyingId = underlyingId;

        // Update underlying spot price if we have mark data
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
            sql`${positions.assetClass} IN ('CRYPTO', 'PERP')`
          )
        );

      // Insert all positions
      if (allPositions.length > 0) {
        const newPositions = allPositions.map(toNewPosition);
        await db.insert(positions).values(newPositions);
      }

      console.log(`[HL] Inserted ${allPositions.length} positions for ${snapshotDate}`);

      // ── Step 6: Recompute derived data ─────────────────────────
      console.log('\n[HL] Running recompute chain...');

      // Auto-link positions and trades to strategies
      const linkResult = await autoLinkPositionsToStrategies(accountId, {
        snapshotDate,
      });
      console.log(`[HL] Strategy auto-link: ${linkResult.strategiesCreated} created, ${linkResult.positionsLinked} linked`);

      // Auto-link trades for each unique trade date (not just today)
      // This ensures backfilled/historical trades get linked properly
      let totalTradesLinked = 0;
      for (const tradeDate of Array.from(tradeDates)) {
        const result = await autoLinkTradesToStrategies(accountId, {
          snapshotDate: tradeDate,
        });
        totalTradesLinked += result.tradesLinked;
        // Create trade-ingestion journal entries for linked trades
        await createTradeIngestionRecords(accountId, tradeDate);
      }
      console.log(`[HL] Trade auto-link: ${totalTradesLinked} linked across ${tradeDates.size} dates`);

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
      console.log(`[HL] Strategy metrics: computed for ${accountStrategies.length} strategies`);

      // Evaluate signals
      const signalResults = await evaluateStrategySignalsForDate(accountId, snapshotDate);
      const triggered = signalResults.filter((r) => r.triggered);
      if (triggered.length > 0) {
        console.log(`[HL] Signals: ${triggered.length} triggered`);
      }

      return {
        tradesInserted,
        tradesSkipped,
        totalFills: fills.length,
        perpPositions: perpPositions.length,
        spotPositions: spotPositions.length,
        stakedPositions: stakedPosition ? 1 : 0,
        strategiesCreated: linkResult.strategiesCreated,
        positionsLinked: linkResult.positionsLinked,
      };
    }
  );

  console.log('\n[HL] HyperLiquid ingestion complete!');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[HL] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
