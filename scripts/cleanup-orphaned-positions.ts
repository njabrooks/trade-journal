/**
 * Cleanup script to re-link orphaned positions to their strategies.
 *
 * After the architectural fix for permanent strategy linking, we need to:
 * 1. Link positions with parent_underlying to the parent's active strategy
 * 2. Link positions from merged strategies to the active merge target
 * 3. Link meme coin positions to their rejected strategies
 *
 * Run with: npx tsx scripts/cleanup-orphaned-positions.ts [--dry-run]
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, isNull, sql, ne, inArray, isNotNull } from 'drizzle-orm';

const { positions, strategies, strategyTemplates, underlyings, accounts } = schema;

interface OrphanedPosition {
  id: string;
  symbol: string;
  assetClass: string;
  accountId: string;
  accountLabel: string | null;
  underlyingId: string | null;
  parentUnderlyingId: string | null;
  parentTicker: string | null;
}

interface TargetStrategy {
  id: string;
  strategyKey: string;
  status: string;
  underlyingTicker: string;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // 1. Get all orphaned positions with their underlying info
  console.log('Fetching orphaned positions...\n');

  const orphanedPositions = await db
    .select({
      id: positions.id,
      symbol: positions.symbol,
      assetClass: positions.assetClass,
      accountId: positions.accountId,
      accountLabel: accounts.label,
      underlyingId: underlyings.id,
      parentUnderlyingId: underlyings.parentUnderlyingId,
    })
    .from(positions)
    .leftJoin(accounts, eq(positions.accountId, accounts.id))
    .leftJoin(underlyings, eq(positions.underlyingId, underlyings.id))
    .where(
      and(
        isNull(positions.strategyId),
        ne(positions.quantity, '0')
      )
    );

  if (orphanedPositions.length === 0) {
    console.log('✅ No orphaned positions found!');
    await closeDb();
    process.exit(0);
  }

  console.log(`Found ${orphanedPositions.length} orphaned positions\n`);

  // 2. Get parent underlying tickers for positions that have them
  const parentUnderlyingIds = orphanedPositions
    .map(p => p.parentUnderlyingId)
    .filter((id): id is string => id !== null);

  const parentUnderlyingsMap = new Map<string, string>();
  if (parentUnderlyingIds.length > 0) {
    const parentUnderlyingsData = await db
      .select({ id: underlyings.id, ticker: underlyings.ticker })
      .from(underlyings)
      .where(inArray(underlyings.id, parentUnderlyingIds));

    for (const pu of parentUnderlyingsData) {
      parentUnderlyingsMap.set(pu.id, pu.ticker);
    }
  }

  // Add parent ticker to positions
  const positionsWithParent: OrphanedPosition[] = orphanedPositions.map(p => ({
    ...p,
    parentTicker: p.parentUnderlyingId ? parentUnderlyingsMap.get(p.parentUnderlyingId) || null : null,
  }));

  // 3. Get active strategies (merge targets)
  const activeStrategies = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      status: strategies.status,
      underlyingTicker: underlyings.ticker,
    })
    .from(strategies)
    .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
    .where(eq(strategies.status, 'active'));

  const activeStrategyByTicker = new Map<string, TargetStrategy>();
  for (const s of activeStrategies) {
    if (s.underlyingTicker) {
      activeStrategyByTicker.set(s.underlyingTicker, s as TargetStrategy);
    }
  }

  console.log('Active strategies available:');
  for (const [ticker, s] of activeStrategyByTicker) {
    console.log(`  ${ticker}: ${s.strategyKey} (${s.id})`);
  }
  console.log('');

  // 4. Get rejected strategies (for meme coins)
  const rejectedStrategies = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      status: strategies.status,
      accountId: strategies.accountId,
      underlyingTicker: underlyings.ticker,
    })
    .from(strategies)
    .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
    .where(eq(strategies.status, 'rejected'));

  // Map: ticker:accountId -> first rejected strategy
  const rejectedStrategyByTickerAccount = new Map<string, TargetStrategy>();
  for (const s of rejectedStrategies) {
    if (s.underlyingTicker && s.accountId) {
      const key = `${s.underlyingTicker}:${s.accountId}`;
      // Keep first one found (don't overwrite if duplicate)
      if (!rejectedStrategyByTickerAccount.has(key)) {
        rejectedStrategyByTickerAccount.set(key, s as TargetStrategy);
      }
    }
  }

  // 5. Get merged strategies with their accounts
  const mergedStrategies = await db
    .select({
      id: strategies.id,
      strategyKey: strategies.strategyKey,
      status: strategies.status,
      accountId: strategies.accountId,
      underlyingTicker: underlyings.ticker,
    })
    .from(strategies)
    .leftJoin(strategyTemplates, eq(strategies.strategyTemplateId, strategyTemplates.id))
    .leftJoin(underlyings, eq(strategyTemplates.underlyingId, underlyings.id))
    .where(eq(strategies.status, 'merged'));

  // Map: ticker:accountId -> merged strategy (to verify merge path)
  const mergedStrategyByTickerAccount = new Map<string, TargetStrategy>();
  for (const s of mergedStrategies) {
    if (s.underlyingTicker && s.accountId) {
      const key = `${s.underlyingTicker}:${s.accountId}`;
      mergedStrategyByTickerAccount.set(key, s as TargetStrategy);
    }
  }

  // 6. Process each orphaned position
  const updates: { positionId: string; targetStrategyId: string; reason: string }[] = [];
  const unresolved: { position: OrphanedPosition; reason: string }[] = [];

  for (const pos of positionsWithParent) {
    let targetStrategy: TargetStrategy | undefined;
    let reason = '';

    // Check 1: Parent underlying (CBBTC -> BTC, HSOL -> SOL, JITOSOL -> SOL)
    if (pos.parentTicker) {
      targetStrategy = activeStrategyByTicker.get(pos.parentTicker);
      if (targetStrategy) {
        reason = `parent_underlying (${pos.symbol} -> ${pos.parentTicker})`;
      }
    }

    // Check 2: Merged strategy exists for this account+ticker -> link to active
    if (!targetStrategy) {
      const mergedKey = `${pos.symbol}:${pos.accountId}`;
      const mergedStrategy = mergedStrategyByTickerAccount.get(mergedKey);
      if (mergedStrategy) {
        targetStrategy = activeStrategyByTicker.get(pos.symbol);
        if (targetStrategy) {
          reason = `merged strategy -> active (${pos.symbol})`;
        }
      }
    }

    // Check 3: Active strategy for same ticker (direct match)
    if (!targetStrategy) {
      targetStrategy = activeStrategyByTicker.get(pos.symbol);
      if (targetStrategy) {
        reason = `direct active match (${pos.symbol})`;
      }
    }

    // Check 4: Rejected strategy for this account+ticker
    if (!targetStrategy) {
      const rejectedKey = `${pos.symbol}:${pos.accountId}`;
      targetStrategy = rejectedStrategyByTickerAccount.get(rejectedKey);
      if (targetStrategy) {
        reason = `rejected strategy (${pos.symbol})`;
      }
    }

    if (targetStrategy) {
      updates.push({
        positionId: pos.id,
        targetStrategyId: targetStrategy.id,
        reason,
      });
    } else {
      unresolved.push({
        position: pos,
        reason: 'No active, merged, or rejected strategy found',
      });
    }
  }

  // 7. Report and execute updates
  console.log('\n📋 PLANNED UPDATES:\n');

  // Group by target strategy for cleaner output
  const updatesByStrategy = new Map<string, typeof updates>();
  for (const u of updates) {
    const existing = updatesByStrategy.get(u.targetStrategyId) || [];
    existing.push(u);
    updatesByStrategy.set(u.targetStrategyId, existing);
  }

  for (const [strategyId, strategyUpdates] of updatesByStrategy) {
    const strategy = activeStrategies.find(s => s.id === strategyId) ||
      rejectedStrategies.find(s => s.id === strategyId);
    console.log(`\n${strategy?.strategyKey || strategyId} (${strategy?.status}):`);
    for (const u of strategyUpdates) {
      const pos = positionsWithParent.find(p => p.id === u.positionId);
      console.log(`  - ${pos?.symbol} (${pos?.accountLabel || 'unknown account'}) [${u.reason}]`);
    }
  }

  if (unresolved.length > 0) {
    console.log('\n⚠️ UNRESOLVED POSITIONS:');
    for (const u of unresolved) {
      console.log(`  - ${u.position.symbol} (${u.position.accountLabel}): ${u.reason}`);
    }
  }

  console.log(`\n\nTotal: ${updates.length} positions to update, ${unresolved.length} unresolved\n`);

  // Execute updates
  if (!dryRun && updates.length > 0) {
    console.log('Executing updates...\n');

    for (const u of updates) {
      await db
        .update(positions)
        .set({ strategyId: u.targetStrategyId, updatedAt: new Date() })
        .where(eq(positions.id, u.positionId));
    }

    console.log(`✅ Updated ${updates.length} positions`);
  } else if (dryRun) {
    console.log('(Dry run - no changes made)');
  }

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
