#!/usr/bin/env tsx
/**
 * Seed watchlist_entries with IBKR-tradable underlyings ONLY.
 *
 * The scanner targets cheap optionality via IBKR, so the radar must be restricted
 * to tickers we can actually trade there. This seed uses three sources:
 *
 *   1. Open IBKR positions                → 'open_ibkr_position'
 *   2. Active strategies on IBKR accounts → 'active_ibkr_strategy'
 *   3. Active asset theses whose underlying has ever appeared in an IBKR
 *      account (open or historical)      → 'active_ibkr_thesis'
 *
 * Non-IBKR crypto positions (Coinbase/Kraken/HyperLiquid/Deribit/Solana) are
 * reported as "proxy candidates" — the script suggests IBKR proxies but does
 * NOT add them automatically. Use scripts/ops/add-to-watchlist.ts to add
 * cross-asset hedges (VXX, UVXY, QQQ, TLT, etc.) manually.
 *
 * Reason priority when an underlying appears in multiple sources:
 *   open_ibkr_position > active_ibkr_strategy > active_ibkr_thesis
 *
 * Idempotent via UNIQUE(underlying_id). Existing rows are untouched.
 *
 * Usage:
 *   npx tsx scripts/seed-watchlist.ts             # write
 *   npx tsx scripts/seed-watchlist.ts --dry-run   # report only
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';

const { watchlistEntries } = schema;

// Non-IBKR crypto tokens likely to have a tradable IBKR proxy.
// User curates additions in the map; the seed only reports which proxies
// would fit — it does not auto-add. Add manually via add-to-watchlist.ts.
const CRYPTO_TO_IBKR_PROXY: Record<string, string> = {
  BTC: 'IBIT',
  CBBTC: 'IBIT',
  ETH: 'ETHA',
  SOL: 'SOLZ',
  // Others (HYPE, DOGE, TAO, SUI, memecoins…) have no clean proxy today.
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Source 1: open positions in IBKR accounts
  // Source 2: active strategies whose account is an IBKR account
  // Source 3: active asset_theses whose underlying has *ever* appeared
  //          in an IBKR position (open or historical)
  const rows = await db.execute(sql`
    WITH ibkr_accounts AS (
      SELECT id FROM accounts WHERE broker_name = 'IBKR'
    ),
    ibkr_underlying_ids AS (
      SELECT DISTINCT p.underlying_id
      FROM positions p
      JOIN ibkr_accounts a ON a.id = p.account_id
      WHERE p.underlying_id IS NOT NULL
    ),
    from_open_positions AS (
      SELECT DISTINCT p.underlying_id
      FROM positions p
      JOIN ibkr_accounts a ON a.id = p.account_id
      WHERE p.is_open = true AND p.underlying_id IS NOT NULL
    ),
    from_strategies AS (
      SELECT DISTINCT at.underlying_id
      FROM strategies s
      JOIN ibkr_accounts a ON a.id = s.account_id
      JOIN asset_theses at ON at.id = s.asset_thesis_id
      WHERE s.status IN ('draft', 'active')
        AND at.underlying_id IS NOT NULL
    ),
    from_theses AS (
      SELECT DISTINCT at.underlying_id
      FROM asset_theses at
      JOIN ibkr_underlying_ids iu ON iu.underlying_id = at.underlying_id
      WHERE at.status IN ('developing', 'monitoring')
        AND at.underlying_id IS NOT NULL
    ),
    combined AS (
      SELECT underlying_id, 'open_ibkr_position' AS reason, 1 AS priority_rank FROM from_open_positions
      UNION ALL
      SELECT underlying_id, 'active_ibkr_strategy' AS reason, 2 AS priority_rank FROM from_strategies
      UNION ALL
      SELECT underlying_id, 'active_ibkr_thesis' AS reason, 3 AS priority_rank FROM from_theses
    ),
    priority_ranked AS (
      SELECT underlying_id, reason, priority_rank,
             ROW_NUMBER() OVER (PARTITION BY underlying_id ORDER BY priority_rank) AS rn
      FROM combined
    )
    SELECT r.underlying_id, r.reason, u.ticker, u.name, u.asset_class
    FROM priority_ranked r
    JOIN underlyings u ON u.id = r.underlying_id
    WHERE r.rn = 1
    ORDER BY r.priority_rank, u.ticker;
  `);

  const candidates = rows as unknown as {
    underlying_id: string;
    reason: string;
    ticker: string;
    name: string | null;
    asset_class: string | null;
  }[];

  console.log(`\n[SEED] IBKR-sourced candidates: ${candidates.length}`);

  // Report what's already in watchlist
  const existing = await db
    .select({ underlyingId: watchlistEntries.underlyingId })
    .from(watchlistEntries);
  const existingSet = new Set(existing.map((r) => r.underlyingId));

  const toInsert = candidates.filter((c) => !existingSet.has(c.underlying_id));
  const alreadyPresent = candidates.length - toInsert.length;

  console.log(`[SEED] Already in watchlist: ${alreadyPresent}`);
  console.log(`[SEED] New to insert: ${toInsert.length}`);

  if (toInsert.length > 0) {
    console.log(`\n[SEED] New entries:`);
    for (const row of toInsert) {
      console.log(`  + ${row.ticker.padEnd(8)} (${row.reason})`);
    }
  }

  // --- Report on non-IBKR crypto positions ---
  const cryptoPositions = await db.execute(sql`
    SELECT DISTINCT u.ticker, a.broker_name
    FROM positions p
    JOIN accounts a ON a.id = p.account_id
    JOIN underlyings u ON u.id = p.underlying_id
    WHERE p.is_open = true
      AND a.broker_name <> 'IBKR'
      AND a.broker_name <> 'Manual'
    ORDER BY u.ticker;
  `);
  const cryptoRows = cryptoPositions as unknown as {
    ticker: string;
    broker_name: string;
  }[];

  const proxyReady: Array<{ held: string; proxy: string; broker: string }> = [];
  const proxyMissing: string[] = [];
  for (const row of cryptoRows) {
    const proxy = CRYPTO_TO_IBKR_PROXY[row.ticker.toUpperCase()];
    if (proxy) {
      proxyReady.push({ held: row.ticker, proxy, broker: row.broker_name });
    } else {
      proxyMissing.push(`${row.ticker} (${row.broker_name})`);
    }
  }

  if (proxyReady.length > 0) {
    console.log(`\n[SEED] Non-IBKR positions with suggested IBKR proxy (add manually if wanted):`);
    const seenProxies = new Set<string>();
    for (const r of proxyReady) {
      const key = `${r.held}->${r.proxy}`;
      if (seenProxies.has(key)) continue;
      seenProxies.add(key);
      const inWatchlist = await db.execute(sql`
        SELECT 1 FROM watchlist_entries we
        JOIN underlyings u ON u.id = we.underlying_id
        WHERE UPPER(u.ticker) = ${r.proxy} LIMIT 1;
      `);
      const status = (inWatchlist as unknown as unknown[]).length > 0
        ? 'already in watchlist'
        : 'NOT in watchlist';
      console.log(`  ${r.held.padEnd(8)} → ${r.proxy.padEnd(6)}  [${status}]`);
    }
  }

  if (proxyMissing.length > 0) {
    console.log(`\n[SEED] Non-IBKR positions without a proxy mapping (no action):`);
    console.log(`  ${proxyMissing.join(', ')}`);
  }

  if (dryRun) {
    console.log(`\n[SEED] --dry-run: no writes performed.`);
    await closeDb();
    process.exit(0);
  }

  if (toInsert.length === 0) {
    console.log(`\n[SEED] Nothing to insert.`);
    await closeDb();
    process.exit(0);
  }

  // Batch insert
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize).map((c) => ({
      underlyingId: c.underlying_id,
      addedReason: c.reason,
      priority: 'normal' as const,
      isActive: true,
    }));
    const result = await db
      .insert(watchlistEntries)
      .values(batch)
      .onConflictDoNothing({ target: watchlistEntries.underlyingId })
      .returning({ id: watchlistEntries.id });
    inserted += result.length;
  }

  console.log(`\n[SEED] ✅ Inserted ${inserted} watchlist entries.`);
  console.log(`[SEED] To add hedges (VXX, UVXY, QQQ, TLT, ETHA, SOLZ, ...), use:`);
  console.log(`       npx tsx scripts/ops/add-to-watchlist.ts --ticker VXX --reason "vol hedge"`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[SEED] Error:', err);
  await closeDb();
  process.exit(1);
});
