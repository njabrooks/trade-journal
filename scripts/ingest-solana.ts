#!/usr/bin/env tsx
/**
 * Solana wallet balance ingestion script.
 * Fetches SOL + SPL token balances from Helius DAS API.
 * Supports multiple wallets via SOLANA_WALLETS env var.
 * Balance snapshots only — no trade history, no cursors.
 *
 * Env var format:
 *   SOLANA_WALLETS='[{"address":"7xKX...","label":"Nick Main"},{"address":"9bPQ...","label":"Nick DeFi"}]'
 *
 * Usage:
 *   npx tsx scripts/ingest-solana.ts
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, ne } from 'drizzle-orm';

// Solana API functions
import { fetchTokenHoldings, fetchSolBalance, parseSolanaWallets } from '../src/lib/ingestion/solana/api.js';
import { normalizeSolanaPositions } from '../src/lib/ingestion/solana/positions.js';
import { toNewPosition } from '../src/lib/ingestion/crypto/types.js';

// Reuse existing infra
import { upsertAccount } from '../src/lib/ingestion/flex/account.js';
import { ensureUnderlyingId } from '../src/lib/ingestion/flex/underlyings.js';
import { trackProcess } from '../src/lib/services/processTracking.js';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '../src/lib/derived/strategyAuto.js';
import { computeTriageForDate } from '../src/lib/derived/triage.js';
import { computePortfolioSnapshotsForDateRange } from '../src/lib/derived/portfolio.js';
import { computeStrategyMetricsForDateRange } from '../src/lib/derived/strategyMetrics.js';
import { evaluateStrategySignalsForDate } from '../src/lib/derived/signalEvaluation.js';

const { positions, underlyings, strategies } = schema;

// ── Per-wallet ingestion ──────────────────────────────────────────

async function ingestWallet(
  walletAddress: string,
  label: string,
  snapshotDate: string
) {
  const tag = `[Solana:${label}]`;
  console.log(`\n${tag} Ingesting wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`);

  // Resolve account ID with label (creates or updates)
  const accountId = await upsertAccount({
    brokerAccountId: walletAddress,
    brokerName: 'Solana',
    baseCurrency: 'USD',
    label,
  });
  console.log(`${tag} Account ID: ${accountId}`);

  // ── Step 1: Fetch token holdings + native SOL ────────────────
  console.log(`${tag} Fetching token holdings...`);

  const { tokens, nativeBalance } = await fetchTokenHoldings(walletAddress);
  console.log(`${tag} Fetched ${tokens.length} SPL tokens`);

  // If nativeBalance wasn't returned by DAS API, fetch it separately
  let solBalance = nativeBalance;
  if (!solBalance) {
    console.log(`${tag} Native balance not in DAS response, fetching separately...`);
    const lamports = await fetchSolBalance(walletAddress);
    solBalance = { lamports, pricePerSol: null, totalPrice: null };
  }

  if (solBalance) {
    const solAmount = solBalance.lamports / 1e9;
    console.log(`${tag} Native SOL: ${solAmount.toFixed(4)} SOL`);
  }

  // ── Step 2: Normalize positions ──────────────────────────────
  const solanaPositions = normalizeSolanaPositions(
    tokens,
    solBalance,
    accountId,
    snapshotDate
  );
  console.log(`${tag} Positions: ${solanaPositions.length} active (non-stablecoin, non-dust)`);

  // ── Step 3: Resolve underlyings and upsert positions ────────
  console.log(`${tag} Resolving underlyings and upserting positions...`);

  for (const pos of solanaPositions) {
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
  if (solanaPositions.length > 0) {
    const newPositions = solanaPositions.map(toNewPosition);
    await db.insert(positions).values(newPositions);
  }

  console.log(`${tag} Inserted ${solanaPositions.length} positions for ${snapshotDate}`);

  // ── Step 4: Recompute derived data ─────────────────────────
  console.log(`${tag} Running recompute chain...`);

  const linkResult = await autoLinkPositionsToStrategies(accountId, {
    snapshotDate,
  });
  console.log(`${tag} Strategy auto-link: ${linkResult.strategiesCreated} created, ${linkResult.positionsLinked} linked`);

  const tradeLinkResult = await autoLinkTradesToStrategies(accountId, {
    snapshotDate,
  });
  console.log(`${tag} Trade auto-link: ${tradeLinkResult.tradesLinked} linked`);

  await computePortfolioSnapshotsForDateRange(accountId, snapshotDate, snapshotDate);

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
  console.log(`${tag} Strategy metrics: computed for ${accountStrategies.length} strategies`);

  const triageResult = await computeTriageForDate(snapshotDate, accountId, undefined, true);
  console.log(`${tag} Triage: ${triageResult.position} position, ${triageResult.strategy} strategy records`);

  const signalResults = await evaluateStrategySignalsForDate(accountId, snapshotDate);
  const triggered = signalResults.filter((r) => r.triggered);
  if (triggered.length > 0) {
    console.log(`${tag} Signals: ${triggered.length} triggered`);
  }

  return {
    wallet: walletAddress.slice(0, 8) + '...',
    label,
    splTokens: tokens.length,
    positions: solanaPositions.length,
    strategiesCreated: linkResult.strategiesCreated,
    positionsLinked: linkResult.positionsLinked,
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.error('HELIUS_API_KEY environment variable is required');
    process.exit(1);
  }

  const wallets = parseSolanaWallets();
  const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[Solana] Starting Solana wallet ingestion...`);
  console.log(`[Solana] Wallets: ${wallets.length} configured`);
  for (const w of wallets) {
    console.log(`[Solana]   - ${w.label}: ${w.address.slice(0, 8)}...${w.address.slice(-4)}`);
  }
  console.log(`[Solana] Snapshot date: ${snapshotDate}`);

  await trackProcess(
    'solana_ingestion',
    'scheduled',
    { walletCount: wallets.length, snapshotDate },
    async () => {
      const results = [];
      for (const wallet of wallets) {
        const result = await ingestWallet(wallet.address, wallet.label, snapshotDate);
        results.push(result);
      }
      return { wallets: results };
    }
  );

  console.log('\n[Solana] Solana wallet ingestion complete!');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Solana] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
