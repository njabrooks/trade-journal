#!/usr/bin/env tsx
/**
 * Kraken ingestion script.
 * Fetches trades, balances (spot positions), and open margin positions from Kraken API.
 * Runs incrementally using cursors stored in ingestion_cursors table.
 * Supports multiple accounts via suffixed env vars (KRAKEN_API_KEY_NICK, etc.).
 *
 * Usage:
 *   npx tsx scripts/ingest-kraken.ts                # All configured accounts
 *   npx tsx scripts/ingest-kraken.ts --account NICK # Single account only
 *   npx tsx scripts/ingest-kraken.ts --full         # Force full backfill
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, ne, sql } from 'drizzle-orm';

// Kraken API functions
import { fetchAllTrades, fetchBalance, fetchOpenPositions, fetchTickerPrices, getKrakenConfig, type KrakenConfig } from '../src/lib/ingestion/kraken/api.js';
import { normalizeKrakenTrade } from '../src/lib/ingestion/kraken/fills.js';
import { normalizeKrakenBalances, normalizeKrakenOpenPositions, getTickerPair, extractKrakenCashBalances } from '../src/lib/ingestion/kraken/positions.js';
import { toNewTrade, toNewPosition } from '../src/lib/ingestion/crypto/types.js';
import { upsertCashBalances } from '../src/lib/ingestion/crypto/cashBalances.js';

// Reuse existing infra
import { upsertAccount } from '../src/lib/ingestion/flex/account.js';
import { ensureUnderlyingId } from '../src/lib/ingestion/flex/underlyings.js';
import { createTradeIngestionRecords } from '../src/lib/ingestion/flex/processCsv.js';
import { trackProcess } from '../src/lib/services/processTracking.js';
import { autoLinkPositionsToStrategies, autoLinkTradesToStrategies } from '../src/lib/derived/strategyAuto.js';
import { computePortfolioSnapshotsForDateRange } from '../src/lib/derived/portfolio.js';
import { computeStrategyMetricsForDateRange } from '../src/lib/derived/strategyMetrics.js';
import { evaluateStrategySignalsForDate } from '../src/lib/derived/signalEvaluation.js';

const { trades, positions, underlyings, ingestionCursors, strategies } = schema;

// ── Account Configuration ───────────────────────────────────────────

interface KrakenAccountConfig {
  brokerAccountId: string;
  owner: string;
  label: string;
  envSuffix: string; // e.g., 'NICK' → reads KRAKEN_API_KEY_NICK
}

const ACCOUNTS: KrakenAccountConfig[] = [
  { brokerAccountId: 'Nick_KRAKEN', owner: 'Nick', label: 'Nick_Kraken', envSuffix: 'NICK' },
  { brokerAccountId: 'Maisy_KRAKEN', owner: 'Maisy', label: 'Maisy_Kraken', envSuffix: 'MAISY' },
];

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

// ── Per-account ingestion ─────────────────────────────────────────

async function ingestAccount(
  acct: KrakenAccountConfig,
  config: KrakenConfig,
  snapshotDate: string,
  forceFullBackfill: boolean
) {
  const tag = `[Kraken:${acct.owner}]`;

  // Resolve account ID (creates if not exists, sets owner)
  const accountId = await upsertAccount({
    brokerAccountId: acct.brokerAccountId,
    brokerName: 'Kraken',
    baseCurrency: 'USD',
    label: acct.label,
    owner: acct.owner,
  });
  console.log(`${tag} Account ID: ${accountId}`);

  await trackProcess(
    'kraken_ingestion',
    'scheduled',
    { snapshotDate, account: acct.owner },
    async () => {
      // ── Step 1: Fetch trades incrementally ──────────────────────
      console.log(`\n${tag} Fetching trades...`);

      let startTimestamp: number | undefined;
      if (!forceFullBackfill) {
        const cursor = await getCursor(accountId, 'kraken', 'fills');
        if (cursor) {
          // Resume from cursor (Unix timestamp) + 1 second
          startTimestamp = parseFloat(cursor) + 1;
          const resumeDate = new Date(startTimestamp * 1000).toISOString();
          console.log(`${tag} Resuming from cursor: ${resumeDate}`);
        } else {
          console.log(`${tag} No cursor found, performing initial backfill`);
        }
      } else {
        console.log(`${tag} Full backfill (no start timestamp)`);
      }

      const { trades: krakenTrades, latestTimestamp } = await fetchAllTrades(startTimestamp, config);
      console.log(`${tag} Fetched ${krakenTrades.length} trades`);

      // Normalize all trades
      const normalizedTrades = krakenTrades.map(({ id, trade }) => {
        const normalized = normalizeKrakenTrade(id, trade, accountId);
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
          console.warn(`${tag} Batch insert failed at offset ${i}, falling back to individual inserts`);
          for (const trade of batch) {
            try {
              const result = await db
                .insert(trades)
                .values(trade)
                .onConflictDoNothing({ target: trades.brokerTransactionId });
              tradesInserted += result.rowCount ?? 0;
            } catch (innerError) {
              console.warn(`${tag} Failed to insert trade ${trade.brokerTransactionId}:`, innerError);
            }
          }
        }
        if (i + BATCH_SIZE < normalizedTrades.length) {
          console.log(`${tag} Trades: inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(normalizedTrades.length / BATCH_SIZE)}`);
        }
      }

      const tradesSkipped = krakenTrades.length - tradesInserted;
      console.log(`${tag} Trades: ${tradesInserted} inserted, ${tradesSkipped} skipped (duplicates)`);

      // Update cursor
      if (latestTimestamp !== null) {
        await setCursor(accountId, 'kraken', 'fills', latestTimestamp.toString());
      }

      // ── Step 2: Fetch balances (spot positions) ─────────────────
      console.log(`\n${tag} Fetching balances...`);
      const balances = await fetchBalance(config);
      const balanceEntries = Object.entries(balances).filter(
        ([_, v]) => parseFloat(v) > 0
      );
      console.log(`${tag} Raw balances: ${balanceEntries.length} non-zero`);

      // Fetch spot prices for non-fiat balances
      const SKIP_BALANCE_KEYS = new Set([
        'ZUSD', 'ZEUR', 'ZGBP', 'ZCAD', 'ZJPY',
        'USD', 'EUR', 'GBP', 'CAD', 'JPY',
        'USDC', 'USDT', 'DAI', 'PYUSD',
      ]);
      const pairsForTicker: string[] = [];
      for (const [key] of balanceEntries) {
        if (SKIP_BALANCE_KEYS.has(key)) continue;
        let symbol = key;
        const BALANCE_MAP: Record<string, string> = {
          XXBT: 'BTC', XBT: 'BTC', XETH: 'ETH', XXRP: 'XRP',
          XLTC: 'LTC', XXLM: 'XLM', XDOT: 'DOT', XXDG: 'DOGE',
          XZEC: 'ZEC', XXMR: 'XMR', XREP: 'REP', XETC: 'ETC', XMLN: 'MLN',
        };
        if (BALANCE_MAP[key]) {
          symbol = BALANCE_MAP[key];
        } else if (key.startsWith('X') && key.length > 3) {
          symbol = key.slice(1);
        }
        symbol = symbol.toUpperCase();
        if (SKIP_BALANCE_KEYS.has(symbol)) continue;

        const pair = getTickerPair(symbol);
        if (!pairsForTicker.includes(pair)) {
          pairsForTicker.push(pair);
        }
      }

      let tickerPrices: Record<string, string> = {};
      if (pairsForTicker.length > 0) {
        try {
          tickerPrices = await fetchTickerPrices(pairsForTicker);
          console.log(`${tag} Fetched ticker prices for ${Object.keys(tickerPrices).length} pairs`);
        } catch (error) {
          console.warn(`${tag} Failed to fetch ticker prices, positions will have null notional:`, error);
        }
      }

      const spotPositions = normalizeKrakenBalances(balances, tickerPrices, accountId, snapshotDate);
      console.log(`${tag} Spot positions: ${spotPositions.length} active (non-fiat/stablecoin)`);

      // ── Step 2b: Extract cash balances ──────────────────────
      const cashInputs = extractKrakenCashBalances(balances, accountId, snapshotDate);
      const cashInserted = await upsertCashBalances(cashInputs);
      console.log(`${tag} Cash balances: ${cashInserted} inserted (${cashInputs.map(c => `${c.currency}: ${c.balanceUsd ? '$' + parseFloat(c.balanceUsd).toFixed(0) : c.balance + ' ' + c.currency}`).join(', ') || 'none'})`);

      // ── Step 3: Fetch open margin positions ─────────────────────
      console.log(`\n${tag} Fetching open margin positions...`);
      let marginPositions: ReturnType<typeof normalizeKrakenOpenPositions> = [];
      try {
        const openPositions = await fetchOpenPositions(config);
        marginPositions = normalizeKrakenOpenPositions(openPositions, accountId, snapshotDate);
        console.log(`${tag} Margin positions: ${marginPositions.length} open`);
      } catch (error) {
        // OpenPositions may fail if margin trading not enabled
        console.warn(`${tag} Could not fetch open positions (margin may not be enabled):`, error);
      }

      // Combine all positions
      const allPositions = [...spotPositions, ...marginPositions];

      // ── Step 4: Resolve underlyings and upsert positions ────────
      console.log(`\n${tag} Resolving underlyings and upserting positions...`);

      for (const pos of allPositions) {
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
      if (allPositions.length > 0) {
        const newPositions = allPositions.map(toNewPosition);
        await db.insert(positions).values(newPositions);
      }

      console.log(`${tag} Inserted ${allPositions.length} positions for ${snapshotDate}`);

      // ── Step 5: Recompute derived data ─────────────────────────
      console.log(`\n${tag} Running recompute chain...`);

      // Auto-link positions and trades to strategies
      const linkResult = await autoLinkPositionsToStrategies(accountId, {
        snapshotDate,
      });
      console.log(`${tag} Strategy auto-link: ${linkResult.strategiesCreated} created, ${linkResult.positionsLinked} linked`);

      // Auto-link trades for each unique trade date (not just today)
      let totalTradesLinked = 0;
      for (const tradeDate of Array.from(tradeDates)) {
        const result = await autoLinkTradesToStrategies(accountId, {
          snapshotDate: tradeDate,
        });
        totalTradesLinked += result.tradesLinked;
        await createTradeIngestionRecords(accountId, tradeDate);
      }
      console.log(`${tag} Trade auto-link: ${totalTradesLinked} linked across ${tradeDates.size} dates`);

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
      console.log(`${tag} Strategy metrics: computed for ${accountStrategies.length} strategies`);

      // Evaluate signals
      const signalResults = await evaluateStrategySignalsForDate(accountId, snapshotDate);
      const triggered = signalResults.filter((r) => r.triggered);
      if (triggered.length > 0) {
        console.log(`${tag} Signals: ${triggered.length} triggered`);
      }

      return {
        tradesInserted,
        tradesSkipped,
        totalTrades: krakenTrades.length,
        spotPositions: spotPositions.length,
        marginPositions: marginPositions.length,
        strategiesCreated: linkResult.strategiesCreated,
        positionsLinked: linkResult.positionsLinked,
      };
    }
  );
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const forceFullBackfill = process.argv.includes('--full');
  const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Filter to single account if --account flag provided
  const accountFlagIdx = process.argv.indexOf('--account');
  const accountFilter = accountFlagIdx >= 0 ? process.argv[accountFlagIdx + 1]?.toUpperCase() : null;

  const accountsToIngest = accountFilter
    ? ACCOUNTS.filter(a => a.envSuffix === accountFilter)
    : ACCOUNTS;

  if (accountsToIngest.length === 0) {
    console.error(`No account found for suffix "${accountFilter}". Available: ${ACCOUNTS.map(a => a.envSuffix).join(', ')}`);
    process.exit(1);
  }

  console.log(`[Kraken] Starting Kraken ingestion...`);
  console.log(`[Kraken] Snapshot date: ${snapshotDate}`);
  console.log(`[Kraken] Accounts: ${accountsToIngest.map(a => a.owner).join(', ')}`);
  if (forceFullBackfill) {
    console.log(`[Kraken] Mode: Full backfill (--full flag)`);
  }

  for (const acct of accountsToIngest) {
    try {
      const config = getKrakenConfig(acct.envSuffix);
      await ingestAccount(acct, config, snapshotDate, forceFullBackfill);
      console.log(`\n[Kraken:${acct.owner}] Complete!`);
    } catch (error) {
      console.error(`[Kraken:${acct.owner}] Fatal error:`, error);
      // Continue to next account instead of aborting entirely
    }
  }

  console.log('\n[Kraken] All accounts complete!');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Kraken] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
