#!/usr/bin/env tsx
/**
 * Seed manual assets into the event-sourced pipeline.
 *
 * Creates:
 *   - assets table entries for HOUSE_UK and FTX_CLAIM_USD
 *   - RECEIVE events so the calculation engine produces daily balances
 *   - price_history backfill for HOUSE_UK (£1,860,000 * GBP/USD for every day)
 *
 * Idempotent: safe to re-run. Assets use onConflictDoNothing on ticker,
 * events use onConflictDoNothing on idempotencyKey, prices use onConflictDoUpdate.
 *
 * Usage:
 *   npx tsx scripts/seed-manual-event-assets.ts
 */

import { db, closeDb, schema } from './lib/db.js';
import { sql } from 'drizzle-orm';
import {
  HOUSE_UK_GBP_VALUE,
  HOUSE_UK_PURCHASE_DATE,
  HOUSE_UK_TICKER,
  HOUSE_UK_OWNER,
  HOUSE_UK_ACCOUNT,
  FTX_CLAIM_USD_VALUE,
  FTX_CLAIM_DATE,
  FTX_CLAIM_TICKER,
  FTX_CLAIM_OWNER,
  FTX_CLAIM_ACCOUNT,
  USER_ID,
  getGbpUsdRate,
} from './lib/manual-assets.js';

const { assets, events, importBatches, priceHistory } = schema;

// ── Helpers ──────────────────────────────────────────────────────────

function dateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const current = new Date(startIso + 'T12:00:00Z'); // noon UTC avoids DST edge cases
  const end = new Date(endIso + 'T12:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const gbpUsdRate = await getGbpUsdRate();
  const today = new Date().toISOString().split('T')[0];

  // ── 1. Create import batch ─────────────────────────────────────────

  console.log('[Seed] Creating import batch...');
  const [batch] = await db
    .insert(importBatches)
    .values({
      userId: USER_ID,
      source: 'manual',
      filename: 'seed-manual-event-assets',
      fileHash: 'manual-seed-v1',
      status: 'completed',
      totalRecords: 2,
      processedRecords: 2,
    })
    .onConflictDoNothing()
    .returning();

  let batchId: string;
  if (batch) {
    batchId = batch.id;
    console.log(`[Seed] Import batch created: ${batchId}`);
  } else {
    // Already exists — look it up
    const existing = await db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(sql`user_id = ${USER_ID} AND file_hash = 'manual-seed-v1'`)
      .limit(1);
    batchId = existing[0].id;
    console.log(`[Seed] Import batch already exists: ${batchId}`);
  }

  // ── 2. Create assets ──────────────────────────────────────────────

  console.log('[Seed] Creating assets...');

  const [houseAsset] = await db
    .insert(assets)
    .values({
      ticker: HOUSE_UK_TICKER,
      name: 'UK Property',
      assetClass: 'REAL_ESTATE',
      pricingTier: 'manual',
      baseCurrency: 'GBP',
      decimals: 0,
    })
    .onConflictDoNothing()
    .returning();

  let houseAssetId: string;
  if (houseAsset) {
    houseAssetId = houseAsset.id;
    console.log(`[Seed] HOUSE_UK asset created: ${houseAssetId}`);
  } else {
    const existing = await db
      .select({ id: assets.id })
      .from(assets)
      .where(sql`ticker = ${HOUSE_UK_TICKER}`)
      .limit(1);
    houseAssetId = existing[0].id;
    console.log(`[Seed] HOUSE_UK asset already exists: ${houseAssetId}`);
  }

  const [ftxAsset] = await db
    .insert(assets)
    .values({
      ticker: FTX_CLAIM_TICKER,
      name: 'FTX Bankruptcy Cash Claim',
      assetClass: 'FIAT',
      pricingTier: 'book_value',
      baseCurrency: 'USD',
      decimals: 2,
    })
    .onConflictDoNothing()
    .returning();

  let ftxAssetId: string;
  if (ftxAsset) {
    ftxAssetId = ftxAsset.id;
    console.log(`[Seed] FTX_CLAIM_USD asset created: ${ftxAssetId}`);
  } else {
    const existing = await db
      .select({ id: assets.id })
      .from(assets)
      .where(sql`ticker = ${FTX_CLAIM_TICKER}`)
      .limit(1);
    ftxAssetId = existing[0].id;
    console.log(`[Seed] FTX_CLAIM_USD asset already exists: ${ftxAssetId}`);
  }

  // ── 3. Create RECEIVE events ──────────────────────────────────────

  console.log('[Seed] Creating RECEIVE events...');

  const houseUsdValue = HOUSE_UK_GBP_VALUE * gbpUsdRate;

  const houseEventResult = await db
    .insert(events)
    .values({
      userId: USER_ID,
      eventType: 'RECEIVE',
      timestamp: sql`${HOUSE_UK_PURCHASE_DATE}::timestamptz`,
      assetId: houseAssetId,
      assetTicker: HOUSE_UK_TICKER,
      quantity: '1',
      price: houseUsdValue.toFixed(2),
      totalValue: houseUsdValue.toFixed(2),
      currency: 'USD',
      costBasis: houseUsdValue.toFixed(2),
      owner: HOUSE_UK_OWNER,
      account: HOUSE_UK_ACCOUNT,
      source: 'manual',
      sourceId: 'manual_seed_house_uk',
      importBatchId: batchId,
      idempotencyKey: `manual:${HOUSE_UK_TICKER}:RECEIVE:${HOUSE_UK_PURCHASE_DATE}`,
      rawData: {
        type: 'manual_seed',
        ticker: HOUSE_UK_TICKER,
        gbpValue: HOUSE_UK_GBP_VALUE,
        gbpUsdRate,
        usdValue: houseUsdValue,
      },
    })
    .onConflictDoNothing()
    .returning({ id: events.id });

  if (houseEventResult.length > 0) {
    console.log(`[Seed] HOUSE_UK RECEIVE event created: ${houseEventResult[0].id}`);
  } else {
    console.log('[Seed] HOUSE_UK RECEIVE event already exists (skipped)');
  }

  const ftxEventResult = await db
    .insert(events)
    .values({
      userId: USER_ID,
      eventType: 'RECEIVE',
      timestamp: sql`${FTX_CLAIM_DATE}::timestamptz`,
      assetId: ftxAssetId,
      assetTicker: FTX_CLAIM_TICKER,
      quantity: FTX_CLAIM_USD_VALUE.toString(),
      price: '1',
      totalValue: FTX_CLAIM_USD_VALUE.toString(),
      currency: 'USD',
      costBasis: FTX_CLAIM_USD_VALUE.toString(),
      owner: FTX_CLAIM_OWNER,
      account: FTX_CLAIM_ACCOUNT,
      source: 'manual',
      sourceId: 'manual_seed_ftx_claim',
      importBatchId: batchId,
      idempotencyKey: `manual:${FTX_CLAIM_TICKER}:RECEIVE:${FTX_CLAIM_DATE}`,
      rawData: {
        type: 'manual_seed',
        ticker: FTX_CLAIM_TICKER,
        usdValue: FTX_CLAIM_USD_VALUE,
      },
    })
    .onConflictDoNothing()
    .returning({ id: events.id });

  if (ftxEventResult.length > 0) {
    console.log(`[Seed] FTX_CLAIM_USD RECEIVE event created: ${ftxEventResult[0].id}`);
  } else {
    console.log('[Seed] FTX_CLAIM_USD RECEIVE event already exists (skipped)');
  }

  // ── 4. Backfill HOUSE_UK price history ────────────────────────────

  console.log(`[Seed] Backfilling HOUSE_UK price history from ${HOUSE_UK_PURCHASE_DATE} to ${today}...`);

  const allDates = dateRange(HOUSE_UK_PURCHASE_DATE, today);
  const priceUsd = (HOUSE_UK_GBP_VALUE * gbpUsdRate).toFixed(2);

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < allDates.length; i += BATCH_SIZE) {
    const batch = allDates.slice(i, i + BATCH_SIZE);
    const rows = batch.map((d) => ({
      assetId: houseAssetId,
      priceDate: d,
      priceClose: priceUsd,
      source: 'manual' as const,
    }));

    await db
      .insert(priceHistory)
      .values(rows)
      .onConflictDoUpdate({
        target: [priceHistory.assetId, priceHistory.priceDate, priceHistory.source],
        set: {
          priceClose: sql`excluded.price_close`,
          updatedAt: sql`NOW()`,
        },
      });

    totalInserted += batch.length;
  }

  console.log(`[Seed] HOUSE_UK price history: ${totalInserted} days (${allDates[0]} to ${allDates[allDates.length - 1]})`);
  console.log(`[Seed] Price per unit: $${priceUsd} (£${HOUSE_UK_GBP_VALUE.toLocaleString()} × ${gbpUsdRate.toFixed(4)})`);

  // ── 5. Backfill FTX_CLAIM_USD price history ───────────────────────

  console.log(`[Seed] Backfilling FTX_CLAIM_USD price history from ${FTX_CLAIM_DATE} to ${today}...`);

  const ftxDates = dateRange(FTX_CLAIM_DATE, today);
  let ftxInserted = 0;
  const FTX_BATCH_SIZE = 50;

  for (let i = 0; i < ftxDates.length; i += FTX_BATCH_SIZE) {
    const batch = ftxDates.slice(i, i + FTX_BATCH_SIZE);
    const rows = batch.map((d) => ({
      assetId: ftxAssetId,
      priceDate: d,
      priceClose: '1',  // $1 per unit (it's USD cash)
      source: 'manual' as const,
    }));

    await db
      .insert(priceHistory)
      .values(rows)
      .onConflictDoUpdate({
        target: [priceHistory.assetId, priceHistory.priceDate, priceHistory.source],
        set: {
          priceClose: sql`excluded.price_close`,
          updatedAt: sql`NOW()`,
        },
      });

    ftxInserted += batch.length;
  }

  console.log(`[Seed] FTX_CLAIM_USD price history: ${ftxInserted} days ($1.00/unit)`);

  // ── Summary ───────────────────────────────────────────────────────

  console.log('\n[Seed] Done! Next steps:');
  console.log('  1. Run calculation engine:');
  console.log(`     cd trade-journal && npx tsx scripts/run-calculation-engine.ts --user ${USER_ID}`);
  console.log('  2. Verify daily balances:');
  console.log(`     npx tsx scripts/psql-query.ts "SELECT asset, owner, account_type, COUNT(*) FROM portfolio_daily_balances WHERE asset IN ('${houseAssetId}', '${ftxAssetId}') GROUP BY 1,2,3"`);
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Seed] Fatal error:', error);
    await closeDb();
    process.exit(1);
  });
