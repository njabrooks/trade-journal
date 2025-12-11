/**
 * Blotter-Trades Integration
 * 
 * Computes and manages trade blotter entries from ingested trades.
 * These entries are separate from triage TRADE actions and are linked bidirectionally.
 */

import { db } from '@/db';
import {
  blotterActions,
  trades,
  strategies,
  positions,
  NewBlotterAction,
} from '@/db/schema';
import { and, eq, sql, isNull, isNotNull, gte, lte, inArray, or, ne } from 'drizzle-orm';

interface TradeAggregation {
  strategyId: string | null;
  symbol: string;
  tradeDate: string; // YYYY-MM-DD
  netQuantity: number;
  netPremium: number;
  realizedPnl: number;
  tradeIds: string[];
  accountId: string;
  conid: number | null; // Contract ID for matching
}

/**
 * Aggregates trades by (strategyId, conid, tradeDate) and creates blotter entries
 * Uses conid as primary grouping key for matching trades to positions
 */
export async function computeTradeBlotterEntriesForDate(
  tradeDate: string, // YYYY-MM-DD
  accountId?: string,
  strategyId?: string
): Promise<number> {
  // Build where clause
  const whereClauses = [eq(sql`DATE(${trades.tradeDate})`, tradeDate)];

  if (accountId) {
    whereClauses.push(eq(trades.accountId, accountId));
  }

  if (strategyId) {
    whereClauses.push(eq(trades.strategyId, strategyId));
  }

  // Query all trades for this date
  const tradesForDate = await db
    .select({
      id: trades.id,
      strategyId: trades.strategyId,
      symbol: trades.symbol,
      conid: trades.conid,
      side: trades.side,
      quantity: trades.quantity,
      netAmount: trades.netAmount,
      accountId: trades.accountId,
    })
    .from(trades)
    .where(and(...whereClauses));

  if (tradesForDate.length === 0) {
    return 0;
  }

  // Group by (strategyId, conid) - conid is primary matching key
  const aggregations = new Map<string, TradeAggregation>();

  for (const trade of tradesForDate) {
    // Use conid as primary grouping key, fallback to symbol if conid missing
    const groupingKey = trade.conid
      ? `${trade.strategyId || 'UNLINKED'}_${trade.conid}`
      : `${trade.strategyId || 'UNLINKED'}_${trade.symbol}`;

    if (!aggregations.has(groupingKey)) {
      aggregations.set(groupingKey, {
        strategyId: trade.strategyId,
        symbol: trade.symbol,
        tradeDate,
        netQuantity: 0,
        netPremium: 0,
        realizedPnl: 0,
        tradeIds: [],
        accountId: trade.accountId,
        conid: trade.conid,
      });
    }

    const agg = aggregations.get(groupingKey)!;
    const qty = Number(trade.quantity) || 0;
    const netAmt = Number(trade.netAmount) || 0;

    // Net quantity: BUY is positive, SELL is negative
    if (trade.side === 'BUY') {
      agg.netQuantity += qty;
    } else {
      agg.netQuantity -= qty;
    }

    agg.netPremium += netAmt;
    agg.tradeIds.push(trade.id);
  }

  let created = 0;

  // Create blotter entry for each aggregation
  for (const agg of aggregations.values()) {
    // Generate deterministic blotterId for this aggregation (no timestamp for idempotency)
    // Use conid in ID if available for better uniqueness
    const blotterId = `TRADE_${agg.strategyId || 'UNLINKED'}_${agg.conid || agg.symbol}_${tradeDate}`;

    // Upsert pattern: Delete by unique key (blotterId), then insert
    // This ensures idempotency - safe to run multiple times (matches existing codebase pattern)
    await db.delete(blotterActions).where(eq(blotterActions.blotterId, blotterId));

    // Get strategy metadata if linked
    let strategyKey: string | null = null;
    let strategyLabel: string | null = null;

    if (agg.strategyId) {
      const strategy = await db
        .select({
          strategyKey: strategies.strategyKey,
          label: strategies.label,
        })
        .from(strategies)
        .where(eq(strategies.id, agg.strategyId))
        .limit(1);

      if (strategy.length > 0) {
        strategyKey = strategy[0].strategyKey;
        strategyLabel = strategy[0].label;
      }
    }

    // Insert new entry (upsert pattern: delete + insert ensures idempotency)
    const newEntry = await db
      .insert(blotterActions)
      .values({
        blotterId: blotterId,
        source: 'trade_ingestion',
        actionDate: tradeDate,
        snapshotDate: tradeDate,
        strategyId: agg.strategyId,
        ticker: agg.symbol,
        strategyKey,
        strategyLabel,
        actionClass: 'TRADE',
        actionDetail: 'TRADE_INGESTED',
        reasonCode: 'TRADE_EXECUTION',
        qtyChange: agg.netQuantity.toString(),
        premiumChange: agg.netPremium.toString(),
        tradeIds: agg.tradeIds,
        tradeCount: agg.tradeIds.length,
        conid: agg.conid ? BigInt(agg.conid) : null,
        completed: true, // Trades are already executed
        createdAt: new Date(),
      })
      .returning({ id: blotterActions.id });

    // Attempt to match with existing triage TRADE action
    if (newEntry.length > 0) {
      await matchTradeBlotterToTriageAction(newEntry[0].id, agg);
    }

    created++;
  }

  return created;
}

/**
 * Matches a trade blotter entry to a triage TRADE action
 * Uses conid as primary match, falls back to symbol/strategyId/date
 */
async function matchTradeBlotterToTriageAction(
  tradeBlotterId: string,
  agg: TradeAggregation
): Promise<void> {
  const whereClauses = [
    eq(blotterActions.source, 'triage_action'),
    eq(blotterActions.actionDetail, 'TRADE'),
    eq(blotterActions.actionDate, agg.tradeDate),
  ];

  // Primary match: by conid
  if (agg.conid) {
    whereClauses.push(eq(blotterActions.conid, BigInt(agg.conid)));
  } else {
    // Fallback: by symbol and strategyId
    whereClauses.push(eq(blotterActions.ticker, agg.symbol));
    if (agg.strategyId) {
      whereClauses.push(eq(blotterActions.strategyId, agg.strategyId));
    } else {
      whereClauses.push(isNull(blotterActions.strategyId));
    }
  }

  const matchingTriageAction = await db
    .select({ id: blotterActions.id })
    .from(blotterActions)
    .where(and(...whereClauses))
    .limit(1);

  if (matchingTriageAction.length > 0) {
    const triageActionId = matchingTriageAction[0].id;

    // Bidirectional linking (use transaction for atomicity)
    await db.transaction(async (tx) => {
      await tx
        .update(blotterActions)
        .set({
          linkedBlotterActionId: triageActionId,
          updatedAt: new Date(),
        })
        .where(eq(blotterActions.id, tradeBlotterId));

      await tx
        .update(blotterActions)
        .set({
          linkedBlotterActionId: tradeBlotterId,
          updatedAt: new Date(),
        })
        .where(eq(blotterActions.id, triageActionId));
    });
  }
}

/**
 * Matches a triage TRADE action to an existing trade blotter entry
 * Called when triage action is created
 */
export async function matchTriageActionToTradeBlotter(
  triageBlotterId: string,
  strategyId: string | null,
  symbol: string,
  conid: number | null,
  actionDate: string
): Promise<void> {
  const whereClauses = [
    eq(blotterActions.source, 'trade_ingestion'),
    eq(blotterActions.actionDate, actionDate),
  ];

  // Primary match: by conid
  if (conid) {
    whereClauses.push(eq(blotterActions.conid, BigInt(conid)));
  } else {
    // Fallback: by symbol and strategyId
    whereClauses.push(eq(blotterActions.ticker, symbol));
    if (strategyId) {
      whereClauses.push(eq(blotterActions.strategyId, strategyId));
    } else {
      whereClauses.push(isNull(blotterActions.strategyId));
    }
  }

  const matchingTradeEntry = await db
    .select({ id: blotterActions.id })
    .from(blotterActions)
    .where(and(...whereClauses))
    .limit(1);

  if (matchingTradeEntry.length > 0) {
    const tradeEntryId = matchingTradeEntry[0].id;

    // Bidirectional linking (use transaction for atomicity)
    await db.transaction(async (tx) => {
      await tx
        .update(blotterActions)
        .set({
          linkedBlotterActionId: tradeEntryId,
          updatedAt: new Date(),
        })
        .where(eq(blotterActions.id, triageBlotterId));

      await tx
        .update(blotterActions)
        .set({
          linkedBlotterActionId: triageBlotterId,
          updatedAt: new Date(),
        })
        .where(eq(blotterActions.id, tradeEntryId));
    });
  }
}

/**
 * Computes trade blotter entries for a date range
 */
export async function computeTradeBlotterEntriesForDateRange(
  startDate: string,
  endDate: string,
  accountId?: string,
  strategyId?: string
): Promise<number> {
  // Get unique trade dates in range
  const whereClauses = [
    gte(sql`DATE(${trades.tradeDate})`, startDate),
    lte(sql`DATE(${trades.tradeDate})`, endDate),
  ];

  if (accountId) {
    whereClauses.push(eq(trades.accountId, accountId));
  }

  if (strategyId) {
    whereClauses.push(eq(trades.strategyId, strategyId));
  }

  const tradeDates = await db
    .selectDistinct({
      tradeDate: sql<string>`DATE(${trades.tradeDate})`.as('trade_date'),
    })
    .from(trades)
    .where(and(...whereClauses));

  let totalCreated = 0;

  for (const { tradeDate } of tradeDates) {
    const count = await computeTradeBlotterEntriesForDate(tradeDate, accountId, strategyId);
    totalCreated += count;
  }

  return totalCreated;
}

/**
 * Backfills trade blotter entries when a strategy is linked/confirmed
 * Also updates existing unlinked entries with the new strategyId
 */
export async function backfillTradeBlotterForStrategy(strategyId: string): Promise<number> {
  // Get strategy to find accountId
  const strategy = await db
    .select({ accountId: strategies.accountId })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (strategy.length === 0) {
    return 0;
  }

  const accountId = strategy[0].accountId;

  // Find all trades for this strategy
  const strategyTrades = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      conid: trades.conid,
      tradeDate: trades.tradeDate,
    })
    .from(trades)
    .where(eq(trades.strategyId, strategyId));

  if (strategyTrades.length === 0) {
    return 0;
  }

  // Get unique trade dates
  const tradeDates = new Set<string>();
  for (const trade of strategyTrades) {
    const date = new Date(trade.tradeDate).toISOString().split('T')[0];
    tradeDates.add(date);
  }

  let created = 0;

  // Recompute blotter entries for each date
  for (const date of tradeDates) {
    const count = await computeTradeBlotterEntriesForDate(date, accountId, strategyId);
    created += count;
  }

  // Also update existing unlinked entries that match this strategy's conids
  const strategyConids = strategyTrades.map((t) => t.conid).filter((c): c is number => c !== null);

  if (strategyConids.length > 0) {
    await db
      .update(blotterActions)
      .set({
        strategyId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(blotterActions.source, 'trade_ingestion'),
          isNull(blotterActions.strategyId),
          inArray(blotterActions.conid, strategyConids.map((c) => BigInt(c)))
        )
      );
  }

  return created;
}

/**
 * Recomputes trade blotter entries when positions are linked to a strategy
 * Uses conid to match trades to positions
 */
export async function recomputeTradeBlotterForPositionLinking(
  strategyId: string,
  positionConids: number[]
): Promise<number> {
  if (positionConids.length === 0) {
    return 0;
  }

  // Find all trades with matching conids
  const matchingTrades = await db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      tradeDate: trades.tradeDate,
    })
    .from(trades)
    .where(
      and(
        inArray(trades.conid, positionConids.map((c) => BigInt(c))),
        or(
          isNull(trades.strategyId),
          ne(trades.strategyId, strategyId) // Also update if strategy changed
        )
      )
    );

  // Update trades with new strategyId
  await db
    .update(trades)
    .set({ strategyId })
    .where(
      and(
        inArray(trades.conid, positionConids.map((c) => BigInt(c))),
        or(isNull(trades.strategyId), ne(trades.strategyId, strategyId))
      )
    );

  // Get unique dates and accountIds
  const datesByAccount = new Map<string, Set<string>>();
  for (const trade of matchingTrades) {
    const date = new Date(trade.tradeDate).toISOString().split('T')[0];
    const accId = trade.accountId;

    if (!datesByAccount.has(accId)) {
      datesByAccount.set(accId, new Set());
    }
    datesByAccount.get(accId)!.add(date);
  }

  let created = 0;

  // Recompute blotter entries for affected dates
  for (const [accountId, dates] of datesByAccount.entries()) {
    for (const date of dates) {
      const count = await computeTradeBlotterEntriesForDate(date, accountId, strategyId);
      created += count;
    }
  }

  return created;
}
