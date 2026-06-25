#!/usr/bin/env tsx
/**
 * Relink IBKR exercise/assignment stock bookings to the option strategy that
 * economically produced them.
 *
 * This is strategy attribution only. It does not touch tax/accounting lots.
 *
 * Usage:
 *   npx tsx scripts/ops/relink-option-exercise-assignment-trades.ts --strategy-id <uuid> --date 2026-06-18
 *   npx tsx scripts/ops/relink-option-exercise-assignment-trades.ts --account-id <uuid> --start-date 2026-06-01 --end-date 2026-06-30 --apply
 */
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { db, closeDb, schema } from '../lib/db.js';
import {
  isStockExerciseAssignmentTrade,
  matchStockExerciseAssignmentToOptionStrategy,
  type ExerciseAssignmentTrade,
} from '../../src/lib/derived/optionExerciseAssignment';

const { trades, strategies } = schema;

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function rangeClauses(date: string | null, startDate: string | null, endDate: string | null) {
  const clauses = [];
  if (date) {
    clauses.push(eq(sql`date(${trades.tradeDate})`, date));
  } else {
    if (startDate) clauses.push(gte(sql`date(${trades.tradeDate})`, startDate));
    if (endDate) clauses.push(lte(sql`date(${trades.tradeDate})`, endDate));
  }
  return clauses;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const strategyId = argValue('--strategy-id');
  let accountId = argValue('--account-id');
  const date = argValue('--date');
  const startDate = argValue('--start-date');
  const endDate = argValue('--end-date');

  if (strategyId) {
    const [strategy] = await db
      .select({ accountId: strategies.accountId })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);
    if (!strategy) throw new Error(`Strategy not found: ${strategyId}`);
    accountId = strategy.accountId;
  }

  if (!accountId) {
    throw new Error('Required: --strategy-id or --account-id');
  }

  const tradeRange = rangeClauses(date, startDate, endDate);
  const stockRows: ExerciseAssignmentTrade[] = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      strategyId: trades.strategyId,
      symbol: trades.symbol,
      assetClass: trades.assetClass,
      tradeDate: trades.tradeDate,
      side: trades.side,
      quantity: trades.quantity,
      price: trades.price,
      rawRow: trades.rawRow,
    })
    .from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.assetClass, 'STK'), ...tradeRange));

  const optionConditions = [
    eq(trades.accountId, accountId),
    eq(trades.assetClass, 'OPT'),
    isNotNull(trades.strategyId),
    ...tradeRange,
  ];
  if (strategyId) optionConditions.push(eq(trades.strategyId, strategyId));

  const optionRows: ExerciseAssignmentTrade[] = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      strategyId: trades.strategyId,
      symbol: trades.symbol,
      assetClass: trades.assetClass,
      tradeDate: trades.tradeDate,
      side: trades.side,
      quantity: trades.quantity,
      price: trades.price,
      rawRow: trades.rawRow,
    })
    .from(trades)
    .where(and(...optionConditions));

  const actions: Array<{
    stockTradeId: string;
    symbol: string;
    currentStrategyId: string | null;
    targetStrategyId: string;
    optionTradeIds: string[];
    strike: number;
    kind: string;
    action: 'update' | 'already_linked';
  }> = [];
  const skipped: string[] = [];
  const ambiguous: Array<{ stockTradeId: string; targetStrategyIds: string[] }> = [];
  const affectedStrategyIds = new Set<string>();

  for (const stockRow of stockRows) {
    if (!isStockExerciseAssignmentTrade(stockRow)) continue;
    const result = matchStockExerciseAssignmentToOptionStrategy(stockRow, optionRows);

    if (result.status === 'none') {
      skipped.push(stockRow.id);
      continue;
    }
    if (result.status === 'ambiguous') {
      ambiguous.push({
        stockTradeId: stockRow.id,
        targetStrategyIds: [...new Set(result.matches.map((match) => match.strategyId))],
      });
      continue;
    }

    const match = result.match;
    affectedStrategyIds.add(match.strategyId);
    if (stockRow.strategyId) affectedStrategyIds.add(stockRow.strategyId);

    const action = stockRow.strategyId === match.strategyId ? 'already_linked' : 'update';
    actions.push({
      stockTradeId: stockRow.id,
      symbol: stockRow.symbol,
      currentStrategyId: stockRow.strategyId,
      targetStrategyId: match.strategyId,
      optionTradeIds: match.optionTradeIds,
      strike: match.strike,
      kind: match.kind,
      action,
    });

    if (apply && action === 'update') {
      await db.update(trades).set({ strategyId: match.strategyId }).where(eq(trades.id, stockRow.id));
    }
  }

  const updates = actions.filter((action) => action.action === 'update');
  const alreadyLinked = actions.filter((action) => action.action === 'already_linked');
  console.log(JSON.stringify({
    dryRun: !apply,
    accountId,
    strategyId,
    range: { date, startDate, endDate },
    stockCandidates: stockRows.filter((row) => isStockExerciseAssignmentTrade(row)).length,
    optionCandidates: optionRows.length,
    updates: updates.length,
    alreadyLinked: alreadyLinked.length,
    skipped: skipped.length,
    ambiguous: ambiguous.length,
    affectedStrategyIds: [...affectedStrategyIds],
    actions,
    skippedStockTradeIds: skipped,
    ambiguousMatches: ambiguous,
  }, null, 2));

  await closeDb();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('Error:', error);
  await closeDb();
  process.exit(1);
});
