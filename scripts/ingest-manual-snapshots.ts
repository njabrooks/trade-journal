#!/usr/bin/env tsx
/**
 * Manual daily snapshot ingestion.
 * Inserts static/recurring balances and positions that have no live API:
 *   - FTX bankruptcy claim (TTC): $97,374.81 USD cash
 *   - UK property (Nick): £2,000,000 position
 *
 * Usage:
 *   npx tsx scripts/ingest-manual-snapshots.ts
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and } from 'drizzle-orm';

import { upsertAccount } from '../src/lib/ingestion/flex/account.js';
import { upsertCashBalances, type CashBalanceInput } from '../src/lib/ingestion/crypto/cashBalances.js';
import { ensureUnderlyingId } from '../src/lib/ingestion/flex/underlyings.js';
import { toNewPosition } from '../src/lib/ingestion/crypto/types.js';
import { computePortfolioSnapshotsForDateRange } from '../src/lib/derived/portfolio.js';
import { trackProcess } from '../src/lib/services/processTracking.js';

const { positions } = schema;

// ── Configuration ───────────────────────────────────────────────────

interface ManualCashEntry {
  type: 'cash';
  brokerAccountId: string;
  brokerName: string;
  owner: string;
  label: string;
  currency: string;
  balance: string;
  balanceUsd: string;
  source: string;
}

interface ManualPositionEntry {
  type: 'position';
  brokerAccountId: string;
  brokerName: string;
  owner: string;
  label: string;
  symbol: string;
  assetClass: string;
  quantity: string;
  currency: string;
  valueForeign: number;  // Value in local currency
  fetchUsdRate?: () => Promise<number>; // Optional: fetch live FX rate
  fallbackUsdRate: number; // Fallback if fetch fails
}

type ManualEntry = ManualCashEntry | ManualPositionEntry;

async function fetchGbpUsdRate(): Promise<number> {
  // Use Kraken's public API for GBP/USD via GBP→USD ticker
  const url = 'https://api.kraken.com/0/public/Ticker?pair=GBPUSD';
  const response = await fetch(url);
  const json = await response.json() as { error: string[]; result: Record<string, { c: [string, string] }> };
  if (json.error?.length > 0) throw new Error(json.error.join(', '));
  const pair = Object.values(json.result)[0];
  return parseFloat(pair.c[0]);
}

const MANUAL_ENTRIES: ManualEntry[] = [
  // FTX bankruptcy claim — TTC owns $97,374.81 USD from FTX recovery
  {
    type: 'cash',
    brokerAccountId: 'TTC_FTX',
    brokerName: 'FTX',
    owner: 'TTC',
    label: 'TTC_FTX',
    currency: 'USD',
    balance: '97374.81',
    balanceUsd: '97374.81',
    source: 'ftx',
  },
  // UK property — Nick owns property valued at £2,000,000
  {
    type: 'position',
    brokerAccountId: 'Nick_PROPERTY',
    brokerName: 'Manual',
    owner: 'Nick',
    label: 'Nick_Property',
    symbol: 'HOUSE_UK',
    assetClass: 'REAL_ESTATE',
    quantity: '1',
    currency: 'GBP',
    valueForeign: 2_000_000,
    fetchUsdRate: fetchGbpUsdRate,
    fallbackUsdRate: 1.26, // GBP/USD fallback
  },
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const snapshotDate = new Date().toISOString().split('T')[0];
  console.log(`[Manual] Starting manual snapshot ingestion...`);
  console.log(`[Manual] Snapshot date: ${snapshotDate}`);

  await trackProcess(
    'manual_snapshot_ingestion',
    'scheduled',
    { snapshotDate },
    async () => {
      const accountIds: string[] = [];

      for (const entry of MANUAL_ENTRIES) {
        const tag = `[Manual:${entry.owner}:${entry.brokerName}]`;

        // Resolve/create account
        const accountId = await upsertAccount({
          brokerAccountId: entry.brokerAccountId,
          brokerName: entry.brokerName,
          baseCurrency: 'USD',
          label: entry.label,
          owner: entry.owner,
        });
        console.log(`${tag} Account ID: ${accountId}`);

        if (entry.type === 'cash') {
          // Insert cash balance
          const cashInput: CashBalanceInput = {
            accountId,
            snapshotDate,
            currency: entry.currency,
            balance: entry.balance,
            balanceUsd: entry.balanceUsd,
            source: entry.source,
          };
          const inserted = await upsertCashBalances([cashInput]);
          console.log(`${tag} Cash balance: ${inserted} inserted ($${entry.balanceUsd} ${entry.currency})`);

        } else if (entry.type === 'position') {
          // Fetch FX rate if needed
          let usdRate = entry.fallbackUsdRate;
          if (entry.fetchUsdRate) {
            try {
              usdRate = await entry.fetchUsdRate();
              console.log(`${tag} FX rate: 1 ${entry.currency} = ${usdRate.toFixed(4)} USD`);
            } catch (error) {
              console.warn(`${tag} FX rate fetch failed, using fallback ${usdRate}:`, error);
            }
          }

          const valueUsd = entry.valueForeign * usdRate;

          // Ensure underlying exists
          const underlyingId = await ensureUnderlyingId(
            entry.symbol,
            entry.assetClass,
            entry.currency,
            null
          );

          // Delete existing position for today's snapshot (idempotent replace)
          await db
            .delete(positions)
            .where(
              and(
                eq(positions.accountId, accountId),
                eq(positions.snapshotDate, snapshotDate)
              )
            );

          // Insert position
          const newPos = toNewPosition({
            accountId,
            underlyingId,
            assetClass: entry.assetClass,
            symbol: entry.symbol,
            multiplier: '1',
            side: 'LONG',
            quantity: entry.quantity,
            avgPrice: null,
            costBasisMoney: null,
            positionType: 'manual',
            isOpen: true,
            spot: entry.valueForeign.toString(),
            absNotional: entry.valueForeign.toString(),
            marketValueUsd: valueUsd.toFixed(2),
            unrealizedPnl: null,
            snapshotDate,
          });

          await db.insert(positions).values(newPos);
          console.log(`${tag} Position: ${entry.symbol} = ${entry.currency} ${entry.valueForeign.toLocaleString()} ($${valueUsd.toLocaleString()})`);
        }

        if (!accountIds.includes(accountId)) {
          accountIds.push(accountId);
        }
      }

      // Compute portfolio snapshots for all affected accounts
      console.log(`\n[Manual] Computing portfolio snapshots...`);
      for (const accountId of accountIds) {
        await computePortfolioSnapshotsForDateRange(accountId, snapshotDate, snapshotDate);
      }
      console.log(`[Manual] Portfolio snapshots: computed for ${accountIds.length} accounts`);

      return { entries: MANUAL_ENTRIES.length, accounts: accountIds.length };
    }
  );

  console.log('\n[Manual] Manual snapshot ingestion complete!');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Manual] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
