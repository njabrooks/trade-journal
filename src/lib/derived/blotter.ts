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
  triageRecords,
  NewBlotterAction,
  NewTriageRecord,
} from '@/db/schema';
import { and, eq, sql, isNull, isNotNull, gte, lte, inArray, or, ne, desc, like } from 'drizzle-orm';
import { upsertTriageRecords } from '@/lib/derived/triage';
import { TRIAGE_RULES_V1 } from '@/lib/derived/triage';

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
  // Build where clause - use lowercase date() to match existing pattern
  const whereClauses = [eq(sql`date(${trades.tradeDate})`, tradeDate)];

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
    console.log(`No trades found for date ${tradeDate}, accountId: ${accountId}`);
    return 0;
  }

  console.log(`Found ${tradesForDate.length} trades for date ${tradeDate}`);

  // Group by (strategyId, conid) - conid is primary matching key
  const aggregations = new Map<string, TradeAggregation>();

  for (const trade of tradesForDate) {
    if (!trade.id || !trade.symbol) {
      console.warn('Skipping trade with missing id or symbol:', trade);
      continue;
    }
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

  console.log(`Creating ${aggregations.size} blotter entries from ${tradesForDate.length} trades`);

  // Create blotter entry for each aggregation
  for (const agg of aggregations.values()) {
    try {
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
        try {
          const strategy = await db
            .select({
              strategyKey: strategies.strategyKey,
              autoDerivedLabel: strategies.autoDerivedLabel,
            })
            .from(strategies)
            .where(eq(strategies.id, agg.strategyId))
            .limit(1);

          if (strategy.length > 0 && strategy[0]) {
            strategyKey = strategy[0].strategyKey ?? null;
            strategyLabel = strategy[0].autoDerivedLabel ?? null;
          }
        } catch (error) {
          console.error(`Failed to fetch strategy ${agg.strategyId}:`, error);
          // Continue without strategy metadata
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
          strategyId: agg.strategyId ?? null,
          ticker: agg.symbol,
          strategyKey: strategyKey ?? null,
          strategyLabel: strategyLabel ?? null,
          actionClass: 'TRADE',
          actionDetail: 'TRADE_INGESTED',
          reasonCode: 'TRADE_EXECUTION',
          qtyChange: agg.netQuantity.toString(),
          premiumChange: agg.netPremium.toString(),
          tradeIds: agg.tradeIds && agg.tradeIds.length > 0 ? agg.tradeIds : null,
          tradeCount: agg.tradeIds?.length ?? 0,
          conid: agg.conid ?? null,
          completed: true, // Trades are already executed
          createdAt: new Date(),
        })
        .returning({ id: blotterActions.id });

      // Attempt to match with existing triage TRADE action
      if (newEntry && newEntry.length > 0) {
        await matchTradeBlotterToTriageAction(newEntry[0].id, agg);
      }

      created++;
    } catch (error) {
      console.error(`Failed to create blotter entry for aggregation:`, {
        symbol: agg.symbol,
        strategyId: agg.strategyId,
        conid: agg.conid,
        tradeIds: agg.tradeIds,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Continue with next aggregation even if one fails
    }
  }

  return created;
}

/**
 * Matches a trade blotter entry to triage actions (TRADE or QUANTITY_CHANGE)
 * Uses conid as primary match, falls back to symbol/strategyId/date
 * 
 * This handles bidirectional matching:
 * - TRADE actions: created before trade ingestion, matched when trades are ingested
 * - QUANTITY_CHANGE actions: created after trades, but also matched here if trades are ingested later
 */
async function matchTradeBlotterToTriageAction(
  tradeBlotterId: string,
  agg: TradeAggregation
): Promise<void> {
  // First, try to match to TRADE actions (created before ingestion)
  const tradeActionWhereClauses = [
    eq(blotterActions.source, 'triage_action'),
    eq(blotterActions.actionDetail, 'TRADE'),
    eq(blotterActions.actionDate, agg.tradeDate),
  ];

  // Primary match: by conid + quantity (absolute values)
  if (agg.conid) {
    tradeActionWhereClauses.push(eq(blotterActions.conid, agg.conid));
    // Quantity match: compare absolute values with 0.01 tolerance
    const netQtyAbs = Math.abs(agg.netQuantity);
    tradeActionWhereClauses.push(
      sql`ABS(ABS(CAST(${blotterActions.qtyChange} AS DECIMAL)) - ${netQtyAbs}) <= 0.01`
    );
  } else {
    // Fallback: by symbol and strategyId (shouldn't happen if conid exists)
    tradeActionWhereClauses.push(eq(blotterActions.ticker, agg.symbol));
    if (agg.strategyId) {
      tradeActionWhereClauses.push(eq(blotterActions.strategyId, agg.strategyId));
    } else {
      tradeActionWhereClauses.push(isNull(blotterActions.strategyId));
    }
  }

  const matchingTradeAction = await db
    .select({ id: blotterActions.id })
    .from(blotterActions)
    .where(and(...tradeActionWhereClauses))
    .limit(1);

  if (matchingTradeAction.length > 0) {
    const triageActionId = matchingTradeAction[0].id;

    // Bidirectional linking (use transaction for atomicity)
    await db.transaction(async (tx) => {
      await tx
        .update(blotterActions)
        .set({
          linkedBlotterActionId: triageActionId,
          updatedAt: sql`now()`,
        })
        .where(eq(blotterActions.id, tradeBlotterId));

      await tx
        .update(blotterActions)
        .set({
          linkedBlotterActionId: tradeBlotterId,
          completed: true,
          severityOverride: 'complete',
          updatedAt: sql`now()`,
        })
        .where(eq(blotterActions.id, triageActionId));
    });
    return; // Matched to TRADE action, done
  }

  // If no TRADE action match, try to match to QUANTITY_CHANGE records
  // This handles the case where trades are ingested after QUANTITY_CHANGE records are already processed
  if (agg.strategyId && agg.conid) {
    // Use the improved matching function which handles QUANTITY_CHANGE properly
    // This will find QUANTITY_CHANGE records and link them (including multiple links for strategy-level records)
    try {
      // Find QUANTITY_CHANGE records for this strategy and date
      const qcRecords = await db
        .select({ id: blotterActions.id })
        .from(blotterActions)
        .where(
          and(
            eq(blotterActions.source, 'triage_action'),
            eq(blotterActions.reasonCode, 'QUANTITY_CHANGE'),
            eq(blotterActions.strategyId, agg.strategyId),
            eq(blotterActions.actionDate, agg.tradeDate),
            isNull(blotterActions.linkedBlotterActionId) // Only match unlinked ones
          )
        );

      // For each QUANTITY_CHANGE record, use the improved matching function
      // This will properly handle strategy-level records with multiple positions
      for (const qcRecord of qcRecords) {
        await matchTriageActionToTradeBlotter(
          qcRecord.id,
          agg.strategyId,
          agg.symbol,
          agg.conid,
          agg.tradeDate
        );
      }
    } catch (error) {
      console.error(`Failed to match trade ${tradeBlotterId} to QUANTITY_CHANGE records:`, error);
      // Continue - matching is optional
    }
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
  // Get the triage action to check if it's QUANTITY_CHANGE
  const triageAction = await db
    .select({
      reasonCode: blotterActions.reasonCode,
      actionDetail: blotterActions.actionDetail,
      positionId: blotterActions.positionId,
      strategyId: blotterActions.strategyId,
    })
    .from(blotterActions)
    .where(eq(blotterActions.id, triageBlotterId))
    .limit(1);

  const isQuantityChange = triageAction[0]?.reasonCode === 'QUANTITY_CHANGE';
  const positionId = triageAction[0]?.positionId;
  const actionStrategyId = triageAction[0]?.strategyId || strategyId;

  const whereClauses = [
    eq(blotterActions.source, 'trade_ingestion'),
    eq(blotterActions.actionDate, actionDate),
  ];

  // For QUANTITY_CHANGE, try multiple matching strategies
  if (isQuantityChange) {
    // Strategy 1: If we have a specific positionId, match by that position's conid
    if (positionId) {
      const position = await db
        .select({
          conid: positions.conid,
          symbol: positions.symbol,
        })
        .from(positions)
        .where(eq(positions.id, positionId))
        .limit(1);

      if (position.length > 0 && position[0].conid) {
        const positionConid = position[0].conid;
        const positionSymbol = position[0].symbol;

        // Try matching by conid first
        const conidMatch = await db
          .select({ id: blotterActions.id })
          .from(blotterActions)
          .where(
            and(
              ...whereClauses,
              eq(blotterActions.conid, positionConid)
            )
          )
          .limit(1);

        if (conidMatch.length > 0) {
          await linkBlotterActions(triageBlotterId, conidMatch[0].id);
          return;
        }

        // Fallback: match by position symbol (normalize spaces)
        if (positionSymbol) {
          const normalizedSymbol = positionSymbol.replace(/\s+/g, ' ').trim();
          const symbolMatches = await db
            .select({ 
              id: blotterActions.id,
              ticker: blotterActions.ticker,
            })
            .from(blotterActions)
            .where(and(...whereClauses));

          const symbolMatch = symbolMatches.find(t => 
            t.ticker?.replace(/\s+/g, ' ').trim() === normalizedSymbol
          );

          if (symbolMatch) {
            await linkBlotterActions(triageBlotterId, symbolMatch.id);
            return;
          }
        }
      }
    }

    // Strategy 2: For strategy-level QUANTITY_CHANGE, find all positions that changed on this date
    // and match trade blotter entries by their conids
    if (actionStrategyId && !positionId) {
      // Get all positions for this strategy on this date that had quantity changes
      // (positions that exist on this date but not previous, or had quantity changes)
      const currentPositions = await db
        .select({
          conid: positions.conid,
          symbol: positions.symbol,
          quantity: positions.quantity,
        })
        .from(positions)
        .where(
          and(
            eq(positions.strategyId, actionStrategyId),
            eq(positions.snapshotDate, actionDate),
            sql`CAST(${positions.quantity} AS DECIMAL) != 0`
          )
        );

      // Get previous positions to find which ones changed
      const previousDateResult = await db
        .selectDistinct({ snapshotDate: positions.snapshotDate })
        .from(positions)
        .where(
          and(
            eq(positions.strategyId, actionStrategyId),
            sql`${positions.snapshotDate} < ${actionDate}`
          )
        )
        .orderBy(desc(positions.snapshotDate))
        .limit(1);

      const previousDate = previousDateResult[0]?.snapshotDate;
      const previousPositions = previousDate
        ? await db
            .select({
              conid: positions.conid,
              quantity: positions.quantity,
            })
            .from(positions)
            .where(
              and(
                eq(positions.strategyId, actionStrategyId),
                eq(positions.snapshotDate, previousDate)
              )
            )
        : [];

      const previousByConid = new Map(previousPositions.map(p => [p.conid, p]));
      const currentConids = new Set(currentPositions.map(p => p.conid).filter((c): c is number => c !== null));

      // Find positions that changed (new positions or quantity changed)
      const changedConids: number[] = [];
      for (const currentPos of currentPositions) {
        if (!currentPos.conid) continue;
        const previousPos = previousByConid.get(currentPos.conid);
        const currentQty = Number(currentPos.quantity) || 0;
        const previousQty = previousPos ? Number(previousPos.quantity) || 0 : 0;
        
        if (currentQty !== previousQty) {
          changedConids.push(currentPos.conid);
        }
      }

      // Also check for positions that disappeared (closed/expired) - these also represent changes
      // This handles cases where positions existed on previous date but don't exist on current date
      for (const [conid, previousPos] of previousByConid.entries()) {
        if (!conid) continue; // Skip if conid is null
        // Skip if this position exists in current positions (already processed above)
        if (currentConids.has(conid)) {
          continue;
        }

        // This position existed before but doesn't exist now - it closed/expired
        const previousQty = Number(previousPos.quantity) || 0;
        
        // Only include if previous quantity was non-zero (it was a real position)
        if (previousQty !== 0) {
          changedConids.push(conid);
        }
      }

      // Match trade blotter entries by conid for any of the changed positions
      if (changedConids.length > 0) {
        const tradeMatches = await db
          .select({ 
            id: blotterActions.id,
            tradeCount: blotterActions.tradeCount,
            qtyChange: blotterActions.qtyChange,
          })
          .from(blotterActions)
          .where(
            and(
              ...whereClauses,
              inArray(blotterActions.conid, changedConids)
            )
          );

        // Link to ALL matching trade entries:
        // - Store all trade entry IDs in linkedTradeBlotterIds array
        // - Set primary link (linkedBlotterActionId) to the "primary" entry:
        //   - Prefer entry with most trades (tradeCount)
        //   - Or largest absolute quantity change
        //   - Fallback to first match
        if (tradeMatches.length > 0) {
          // Determine primary match (for backward compatibility)
          let primaryMatch = tradeMatches[0];
          
          // Find entry with highest trade count
          const maxTradeCount = Math.max(
            ...tradeMatches.map(m => m.tradeCount ?? 0)
          );
          const highTradeCountMatches = tradeMatches.filter(
            m => (m.tradeCount ?? 0) === maxTradeCount
          );
          
          if (highTradeCountMatches.length === 1) {
            primaryMatch = highTradeCountMatches[0];
          } else if (highTradeCountMatches.length > 1) {
            // If multiple have same trade count, pick largest absolute qty change
            const maxAbsQty = Math.max(
              ...highTradeCountMatches.map(m => Math.abs(Number(m.qtyChange) || 0))
            );
            primaryMatch = highTradeCountMatches.find(
              m => Math.abs(Number(m.qtyChange) || 0) === maxAbsQty
            ) || primaryMatch;
          }
          
          // Store all matching trade entry IDs
          const allTradeEntryIds = tradeMatches.map(m => m.id);
          
          // Update QUANTITY_CHANGE record with all linked trade entries
          await db
            .update(blotterActions)
            .set({
              linkedBlotterActionId: primaryMatch.id, // Primary link (backward compatible)
              linkedTradeBlotterIds: allTradeEntryIds, // All linked trade entries
              updatedAt: sql`now()`,
            })
            .where(eq(blotterActions.id, triageBlotterId));
          
          // Also update each trade entry to link back to the QUANTITY_CHANGE
          for (const tradeMatch of tradeMatches) {
            await db
              .update(blotterActions)
              .set({
                linkedBlotterActionId: triageBlotterId,
                updatedAt: sql`now()`,
              })
              .where(eq(blotterActions.id, tradeMatch.id));
          }
          
          return;
        }
      }
    }

    // Strategy 3: Fallback - match by strategyId + date (less precise but better than nothing)
    if (actionStrategyId) {
      const strategyMatch = await db
        .select({ id: blotterActions.id })
        .from(blotterActions)
        .where(
          and(
            ...whereClauses,
            eq(blotterActions.strategyId, actionStrategyId)
          )
        )
        .limit(1);

      if (strategyMatch.length > 0) {
        await linkBlotterActions(triageBlotterId, strategyMatch[0].id);
        return;
      }
    }
  }

  // Get the Trade Action's qtyChange for quantity matching
  const tradeActionQty = await db
    .select({ qtyChange: blotterActions.qtyChange })
    .from(blotterActions)
    .where(eq(blotterActions.id, triageBlotterId))
    .limit(1);

  const actionQty = tradeActionQty[0]?.qtyChange ? Number(tradeActionQty[0].qtyChange) : null;

  // Primary match: by conid + quantity (absolute values)
  if (conid) {
    whereClauses.push(eq(blotterActions.conid, conid));
    // Quantity match: compare absolute values with 0.01 tolerance
    if (actionQty !== null) {
      const actionQtyAbs = Math.abs(actionQty);
      whereClauses.push(
        sql`ABS(ABS(CAST(${blotterActions.qtyChange} AS DECIMAL)) - ${actionQtyAbs}) <= 0.01`
      );
    }
  } else {
    // Fallback: by symbol and strategyId (shouldn't happen if conid exists)
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
    await linkBlotterActions(triageBlotterId, matchingTradeEntry[0].id);
  }
}

/**
 * Creates QUANTITY_CHANGE triage records for unmatched trades after matching completes
 * Groups unmatched trades by strategy and aggregates by position (conid)
 * Strategy-level only - one record per strategy per date
 */
export async function createQuantityChangeTriageForUnmatchedTrades(
  tradeDate: string,
  accountId?: string
): Promise<number> {
  // Find all unmatched trade blotter entries for this date
  const unmatchedWhereClauses = [
    eq(blotterActions.source, 'trade_ingestion'),
    eq(blotterActions.actionDate, tradeDate),
    isNull(blotterActions.linkedBlotterActionId),
    isNotNull(blotterActions.strategyId),
  ];

  if (accountId) {
    // Filter by account via strategies
    const strategyIds = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(eq(strategies.accountId, accountId));
    
    if (strategyIds.length > 0) {
      unmatchedWhereClauses.push(
        inArray(blotterActions.strategyId, strategyIds.map(s => s.id))
      );
    } else {
      return 0; // No strategies for this account
    }
  }

  const unmatchedTrades = await db
    .select({
      id: blotterActions.id,
      blotterId: blotterActions.blotterId,
      strategyId: blotterActions.strategyId,
      conid: blotterActions.conid,
      qtyChange: blotterActions.qtyChange,
      premiumChange: blotterActions.premiumChange,
      ticker: blotterActions.ticker,
      actionDate: blotterActions.actionDate,
      tradeIds: blotterActions.tradeIds,
      tradeCount: blotterActions.tradeCount,
    })
    .from(blotterActions)
    .where(and(...unmatchedWhereClauses));

  if (unmatchedTrades.length === 0) {
    return 0; // No unmatched trades
  }

  // Group by strategyId
  const tradesByStrategy = new Map<string, typeof unmatchedTrades>();
  for (const trade of unmatchedTrades) {
    if (!trade.strategyId) continue;
    if (!tradesByStrategy.has(trade.strategyId)) {
      tradesByStrategy.set(trade.strategyId, []);
    }
    tradesByStrategy.get(trade.strategyId)!.push(trade);
  }

  let created = 0;

  // Create one strategy-level QUANTITY_CHANGE triage record per strategy
  for (const [strategyId, trades] of tradesByStrategy.entries()) {
    // Check if QUANTITY_CHANGE triage record already exists for this strategy and date
    // Only check for records from the new system (ruleSet='options_v1', severity='pending')
    // Old records (ruleSet='quantity_change', severity='urgent') should be replaced
    const existingQc = await db
      .select({ id: triageRecords.id })
      .from(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.snapshotDate, tradeDate),
          eq(triageRecords.recommendedAction, 'QUANTITY_CHANGE'),
          eq(triageRecords.contextLevel, 'strategy'),
          eq(triageRecords.ruleSet, TRIAGE_RULES_V1.ruleSet), // Only check for new-style records
          eq(triageRecords.severity, 'pending') // Only check for new-style records
        )
      )
      .limit(1);

    if (existingQc.length > 0) {
      // Already exists from new system, skip
      continue;
    }
    
    // Delete any old-style QUANTITY_CHANGE records (ruleSet='quantity_change') for this strategy/date
    // These are from the old computeQuantityChangeTriageForDate function
    await db
      .delete(triageRecords)
      .where(
        and(
          eq(triageRecords.strategyId, strategyId),
          eq(triageRecords.snapshotDate, tradeDate),
          eq(triageRecords.recommendedAction, 'QUANTITY_CHANGE'),
          eq(triageRecords.contextLevel, 'strategy'),
          eq(triageRecords.ruleSet, 'quantity_change') // Old-style records
        )
      );

    // Get strategy info
    const strategyResult = await db
      .select({
        strategyKey: strategies.strategyKey,
        accountId: strategies.accountId,
      })
      .from(strategies)
      .where(eq(strategies.id, strategyId))
      .limit(1);

    if (strategyResult.length === 0) continue;

    const strategy = strategyResult[0];
    
    if (!strategy.accountId) continue; // Skip if accountId is missing

    // Aggregate trades by conid (each position aggregated individually)
    const tradesByConid = new Map<number, typeof trades>();
    for (const trade of trades) {
      if (!trade.conid) continue;
      if (!tradesByConid.has(trade.conid)) {
        tradesByConid.set(trade.conid, []);
      }
      tradesByConid.get(trade.conid)!.push(trade);
    }

    // Build unmatched trade executions array with full details for matching
    const unmatchedTradeExecutions = Array.from(tradesByConid.entries()).map(([conid, conidTrades]) => {
      const firstTrade = conidTrades[0];
      return {
        blotterId: firstTrade.blotterId,
        blotterActionId: firstTrade.id,
        conid: conid,
        ticker: firstTrade.ticker,
        actionDate: firstTrade.actionDate,
        qtyChange: conidTrades.reduce((sum, t) => sum + (Number(t.qtyChange) || 0), 0), // Net quantity (signed)
        premiumChange: conidTrades.reduce((sum, t) => sum + (Number(t.premiumChange) || 0), 0),
        tradeIds: firstTrade.tradeIds,
        tradeCount: firstTrade.tradeCount || conidTrades.length,
      };
    });

    // Create strategy-level QUANTITY_CHANGE triage record
    const triageRecord: NewTriageRecord = {
      snapshotDate: tradeDate,
      accountId: strategy.accountId,
      contextLevel: 'strategy',
      positionId: null,
      strategyId: strategyId,
      symbol: strategy.strategyKey ?? 'Strategy',
      recommendedAction: 'QUANTITY_CHANGE',
      severity: 'pending',
      ruleSet: TRIAGE_RULES_V1.ruleSet,
      // Store full trade execution details for matching
      unmatchedTradeExecutions: unmatchedTradeExecutions as any,
      // Store aggregated trade info in notes (optional, for display)
      notes: JSON.stringify({
        unmatchedTrades: Array.from(tradesByConid.entries()).map(([conid, conidTrades]) => ({
          conid,
          ticker: conidTrades[0]?.ticker,
          totalQtyChange: conidTrades.reduce((sum, t) => sum + (Number(t.qtyChange) || 0), 0),
          totalPremiumChange: conidTrades.reduce((sum, t) => sum + (Number(t.premiumChange) || 0), 0),
          tradeCount: conidTrades.length,
        })),
      }),
    };

    await upsertTriageRecords([triageRecord]);
    created++;
  }

  return created;
}

/**
 * Backfills matching for trade blotter entries to ensure all trades are linked to QUANTITY_CHANGE records
 * This ensures the one-to-many relationship is complete (one QUANTITY_CHANGE links to all matching trades)
 */
export async function backfillUnmatchedTradeEntries(
  accountId?: string
): Promise<{ checked: number; linked: number }> {
  // First, get all QUANTITY_CHANGE records (not just for unmatched trades)
  // We want to ensure ALL matching trades are linked, even if some are already linked
  const qcWhereClauses = [
    eq(blotterActions.source, 'triage_action'),
    eq(blotterActions.reasonCode, 'QUANTITY_CHANGE'),
    isNotNull(blotterActions.strategyId),
  ];

  if (accountId) {
    const strategyIds = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(eq(strategies.accountId, accountId));
    
    if (strategyIds.length > 0) {
      qcWhereClauses.push(
        inArray(blotterActions.strategyId, strategyIds.map(s => s.id))
      );
    } else {
      return { checked: 0, linked: 0 };
    }
  }

  const allQuantityChangeRecords = await db
    .select({
      id: blotterActions.id,
      strategyId: blotterActions.strategyId,
      actionDate: blotterActions.actionDate,
      positionId: blotterActions.positionId,
      linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
      linkedBlotterActionId: blotterActions.linkedBlotterActionId,
    })
    .from(blotterActions)
    .where(and(...qcWhereClauses));

  let linked = 0;
  let checked = 0;

  // Group QUANTITY_CHANGE records by (strategyId, actionDate)
  const qcByStrategyDate = new Map<string, typeof allQuantityChangeRecords>();
  for (const qcRecord of allQuantityChangeRecords) {
    if (!qcRecord.strategyId || !qcRecord.actionDate) continue;
    const key = `${qcRecord.strategyId}_${qcRecord.actionDate}`;
    if (!qcByStrategyDate.has(key)) {
      qcByStrategyDate.set(key, []);
    }
    qcByStrategyDate.get(key)!.push(qcRecord);
  }

  // Process each QUANTITY_CHANGE record group
  for (const [key, qcRecords] of qcByStrategyDate) {
    const [strategyId, actionDate] = key.split('_');
    
    // Get ALL trades for this strategy and date (not just unmatched)
    const allTradesForDate = await db
      .select({
        id: blotterActions.id,
        conid: blotterActions.conid,
        ticker: blotterActions.ticker,
        linkedBlotterActionId: blotterActions.linkedBlotterActionId,
      })
      .from(blotterActions)
      .where(
        and(
          eq(blotterActions.source, 'trade_ingestion'),
          eq(blotterActions.strategyId, strategyId),
          eq(blotterActions.actionDate, actionDate),
          isNotNull(blotterActions.conid)
        )
      );

    checked += allTradesForDate.length;

    for (const qcRecord of qcRecords) {
      // If it's a position-level QUANTITY_CHANGE, match individual trades
      if (qcRecord.positionId) {
        const position = await db
          .select({ conid: positions.conid })
          .from(positions)
          .where(eq(positions.id, qcRecord.positionId))
          .limit(1);

        if (position.length > 0 && position[0].conid) {
          // Check all trades, not just unmatched ones
          const matchingTrade = allTradesForDate.find(t => t.conid === position[0].conid);
          if (matchingTrade && !qcRecord.linkedBlotterActionId) {
            // Only link if not already linked
            await linkBlotterActions(qcRecord.id, matchingTrade.id);
            linked++;
          }
        }
      } else {
        // Strategy-level QUANTITY_CHANGE - check if any of the unmatched trades should be linked
        // Get all positions that changed on this date for this strategy
        const currentPositions = await db
          .select({
            conid: positions.conid,
            quantity: positions.quantity,
          })
          .from(positions)
          .where(
            and(
              eq(positions.strategyId, strategyId),
              eq(positions.snapshotDate, actionDate),
              sql`CAST(${positions.quantity} AS DECIMAL) != 0`
            )
          );

        // Get previous date positions to find what changed
        const previousDateResult = await db
          .selectDistinct({ snapshotDate: positions.snapshotDate })
          .from(positions)
          .where(
            and(
              eq(positions.strategyId, strategyId),
              sql`${positions.snapshotDate} < ${actionDate}`
            )
          )
          .orderBy(desc(positions.snapshotDate))
          .limit(1);

        const previousDate = previousDateResult[0]?.snapshotDate;
        const previousPositions = previousDate
          ? await db
              .select({
                conid: positions.conid,
                quantity: positions.quantity,
              })
              .from(positions)
              .where(
                and(
                  eq(positions.strategyId, strategyId),
                  eq(positions.snapshotDate, previousDate)
                )
              )
          : [];

        const previousByConid = new Map(previousPositions.map(p => [p.conid, p]));

        // Find positions that changed (new positions or quantity changed)
        const changedConids: number[] = [];
        for (const currentPos of currentPositions) {
          if (!currentPos.conid) continue;
          const previousPos = previousByConid.get(currentPos.conid);
          const currentQty = Number(currentPos.quantity) || 0;
          const previousQty = previousPos ? Number(previousPos.quantity) || 0 : 0;
          
          if (currentQty !== previousQty) {
            changedConids.push(currentPos.conid);
          }
        }

        // Also check for positions that disappeared (expired) - these also represent changes
        for (const prevPos of previousPositions) {
          if (!prevPos.conid) continue;
          const prevQty = Number(prevPos.quantity) || 0;
          if (prevQty !== 0 && !currentPositions.find(p => p.conid === prevPos.conid)) {
            changedConids.push(prevPos.conid);
          }
        }

        // Find ALL trades (matched and unmatched) that match changed conids
        // This ensures we capture all trades, even if some were already linked
        const existingLinkedIds = (qcRecord.linkedTradeBlotterIds as string[] | null) || [];
        const allMatchingTrades = allTradesForDate.filter(
          t => t.conid && changedConids.includes(t.conid)
        );
        const tradesToLink = allMatchingTrades.filter(
          t => !existingLinkedIds.includes(t.id)
        );

        if (tradesToLink.length > 0) {
          // Update QUANTITY_CHANGE record with all linked trade entries
          const allLinkedIds = [...existingLinkedIds, ...tradesToLink.map(t => t.id)];
          
          await db
            .update(blotterActions)
            .set({
              linkedTradeBlotterIds: allLinkedIds,
              // Update primary link if not set, or if we're adding the first trade
              linkedBlotterActionId: qcRecord.linkedBlotterActionId || tradesToLink[0].id,
              updatedAt: sql`now()`,
            })
            .where(eq(blotterActions.id, qcRecord.id));

          // Also update each trade entry to link back to the QUANTITY_CHANGE
          for (const trade of tradesToLink) {
            await db
              .update(blotterActions)
              .set({
                linkedBlotterActionId: qcRecord.id,
                updatedAt: sql`now()`,
              })
              .where(eq(blotterActions.id, trade.id));
          }

          linked += tradesToLink.length;
        }
      }
    }
  }

  return { checked, linked };
}

/**
 * Helper function to create bidirectional links between blotter actions
 */
async function linkBlotterActions(
  action1Id: string,
  action2Id: string
): Promise<void> {
  // Check which action is the Trade Action (triage_action) and which is trade ingestion
  const actions = await db
    .select({
      id: blotterActions.id,
      source: blotterActions.source,
      actionDetail: blotterActions.actionDetail,
    })
    .from(blotterActions)
    .where(
      or(
        eq(blotterActions.id, action1Id),
        eq(blotterActions.id, action2Id)
      )
    );

  const tradeAction = actions.find(a => a.source === 'triage_action' && a.actionDetail === 'TRADE');
  const tradeEntry = actions.find(a => a.source === 'trade_ingestion');

  await db.transaction(async (tx) => {
    // Link both actions
    await tx
      .update(blotterActions)
      .set({
        linkedBlotterActionId: action2Id,
        updatedAt: sql`now()`,
      })
      .where(eq(blotterActions.id, action1Id));

    await tx
      .update(blotterActions)
      .set({
        linkedBlotterActionId: action1Id,
        updatedAt: sql`now()`,
      })
      .where(eq(blotterActions.id, action2Id));

    // Mark Trade Action as complete if it exists
    if (tradeAction) {
      await tx
        .update(blotterActions)
        .set({
          completed: true,
          severityOverride: 'complete',
          updatedAt: sql`now()`,
        })
        .where(eq(blotterActions.id, tradeAction.id));
    }
  });
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
  const processedDates = new Set<string>();

  for (const { tradeDate } of tradeDates) {
    const count = await computeTradeBlotterEntriesForDate(tradeDate, accountId, strategyId);
    processedDates.add(tradeDate);
    totalCreated += count;
  }

  // Create QUANTITY_CHANGE triage records for unmatched trades after all matching is complete
  // Process each date separately to ensure proper grouping by strategy
  if (accountId) {
    for (const tradeDate of processedDates) {
      try {
        await createQuantityChangeTriageForUnmatchedTrades(tradeDate, accountId);
      } catch (error) {
        console.error(`Failed to create QUANTITY_CHANGE triage records for ${tradeDate}:`, error);
        // Continue with other dates even if one fails
      }
    }
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
    const count = await computeTradeBlotterEntriesForDate(date, accountId ?? undefined, strategyId);
    created += count;
  }

  // Also update existing entries that match this strategy's conids
  // This includes:
  // 1. Unlinked entries (strategyId is null)
  // 2. Entries pointing to merged strategies (need to be updated to target strategy)
  const strategyConids = strategyTrades.map((t) => t.conid).filter((c): c is number => c !== null);

  if (strategyConids.length > 0) {
    // Update unlinked entries
    await db
      .update(blotterActions)
      .set({
        strategyId,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(blotterActions.source, 'trade_ingestion'),
          isNull(blotterActions.strategyId),
          inArray(blotterActions.conid, strategyConids)
        )
      );

    // Also update entries that have a strategyId but match this strategy's conids
    // This handles cases where strategies were merged and blotter entries need to be updated
    // We update entries where the conid matches but strategyId doesn't (could be from merged strategy)
    await db
      .update(blotterActions)
      .set({
        strategyId,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(blotterActions.source, 'trade_ingestion'),
          ne(blotterActions.strategyId, strategyId), // Not already pointing to this strategy
          inArray(blotterActions.conid, strategyConids)
        )
      );
  }

  // Note: QUANTITY_CHANGE triage records are created by:
  // - Trade ingestion (after matching attempts)
  // - Recompute operations (computeTradeBlotterEntriesForDateRange)
  // Not created here to avoid redundant processing of all strategies when backfilling one strategy

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
        inArray(trades.conid, positionConids),
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
        inArray(trades.conid, positionConids),
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

/**
 * Backfills missing ticker/conid on existing triage actions and attempts to link them
 * to trade blotter entries. Useful for fixing records created before the matching logic was added.
 */
export async function backfillTriageActionMatching(
  accountId?: string
): Promise<{ updated: number; linked: number }> {
  // Find all triage actions that need backfilling:
  // - source = 'triage_action'
  // - strategyId is not null (needed for matching)
  // - reasonCode = 'QUANTITY_CHANGE' OR actionClass = 'TRADE' (actions that should match trades)
  // - linked_blotter_action_id is null (not yet linked) OR linked_trade_blotter_ids is null (needs multi-link update)
  // - OR (ticker is null OR conid is null) - needs resolution
  const whereClauses = [
    eq(blotterActions.source, 'triage_action'),
    isNotNull(blotterActions.strategyId),
    or(
      eq(blotterActions.reasonCode, 'QUANTITY_CHANGE'),
      eq(blotterActions.actionClass, 'TRADE')
    ),
    or(
      isNull(blotterActions.linkedBlotterActionId), // Not yet linked
      isNull(blotterActions.linkedTradeBlotterIds), // Needs multi-link update (QUANTITY_CHANGE with multiple positions)
      or(
        isNull(blotterActions.ticker),
        isNull(blotterActions.conid)
      )
    ),
  ];

  if (accountId) {
    // If accountId provided, filter by strategies for that account
    const strategyIds = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(eq(strategies.accountId, accountId));
    
    if (strategyIds.length > 0) {
      whereClauses.push(
        inArray(blotterActions.strategyId, strategyIds.map(s => s.id))
      );
    } else {
      // No strategies for this account, nothing to backfill
      return { updated: 0, linked: 0 };
    }
  }

  const unlinkedActions = await db
    .select({
      id: blotterActions.id,
      strategyId: blotterActions.strategyId,
      snapshotDate: blotterActions.snapshotDate,
      actionDate: blotterActions.actionDate,
      ticker: blotterActions.ticker,
      conid: blotterActions.conid,
      positionId: blotterActions.positionId,
      reasonCode: blotterActions.reasonCode,
      linkedBlotterActionId: blotterActions.linkedBlotterActionId,
      linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
    })
    .from(blotterActions)
    .where(and(...whereClauses));

  let updated = 0;
  let linked = 0;

  for (const action of unlinkedActions) {
    if (!action.strategyId || !action.snapshotDate) continue;

    // Resolve ticker/conid from positions if missing
    let resolvedTicker = action.ticker;
    let resolvedConid = action.conid;

    if (!resolvedTicker || !resolvedConid) {
      // Resolve ticker/conid from positions for this strategy
      const latestPosition = await db
        .select({
          conid: positions.conid,
          symbol: positions.symbol,
        })
        .from(positions)
        .where(eq(positions.strategyId, action.strategyId))
        .orderBy(desc(positions.snapshotDate))
        .limit(1);

      if (latestPosition.length > 0) {
        const position = latestPosition[0];
        resolvedTicker = resolvedTicker ?? position.symbol ?? null;
        resolvedConid = resolvedConid ?? position.conid ?? null;
      }
    }

    // Update the action with resolved values if they changed
    if (resolvedTicker !== action.ticker || resolvedConid !== action.conid) {
      await db
        .update(blotterActions)
        .set({
          ticker: resolvedTicker,
          conid: resolvedConid,
          updatedAt: sql`now()`,
        })
        .where(eq(blotterActions.id, action.id));

      updated++;
    }

    // Attempt to match with trade blotter entry (even if already has ticker/conid)
    // This uses the improved matching logic that queries positions directly
    // For QUANTITY_CHANGE, this will also populate linkedTradeBlotterIds with all matching trades
    try {
      const hadLinkBefore = !!action.linkedBlotterActionId;
      const hadMultiLinkBefore = !!action.linkedTradeBlotterIds;
      
      await matchTriageActionToTradeBlotter(
        action.id,
        action.strategyId,
        resolvedTicker ?? '',
        resolvedConid,
        action.actionDate || action.snapshotDate
      );
      
      // Check if it got linked or updated with multi-link
      const checkLinked = await db
        .select({ 
          linkedBlotterActionId: blotterActions.linkedBlotterActionId,
          linkedTradeBlotterIds: blotterActions.linkedTradeBlotterIds,
        })
        .from(blotterActions)
        .where(eq(blotterActions.id, action.id))
        .limit(1);
      
      const hasLinkAfter = !!checkLinked[0]?.linkedBlotterActionId;
      const hasMultiLinkAfter = !!checkLinked[0]?.linkedTradeBlotterIds;
      
      // Count as linked if:
      // - Got a new link (wasn't linked before, now is)
      // - Got multi-link update (was single-linked, now has multiple)
      if ((hasLinkAfter && !hadLinkBefore) || (hasMultiLinkAfter && !hadMultiLinkBefore)) {
        linked++;
      }
    } catch (error) {
      console.error(`Failed to match action ${action.id}:`, error);
      // Continue with next action
    }
  }

  return { updated, linked };
}

/**
 * Fixes blotter entries that point to merged strategies
 * Updates them to point to the target strategy instead
 */
export async function fixMergedStrategyBlotterEntries(
  accountId?: string
): Promise<{ updated: number }> {
  // Find all strategies with status 'merged'
  const mergedStrategies = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(eq(strategies.status, 'merged'));

  if (mergedStrategies.length === 0) {
    return { updated: 0 };
  }

  const mergedStrategyIds = mergedStrategies.map(s => s.id);

  // For each merged strategy, find the target strategy it was merged into
  // We do this by finding strategies that have positions/trades with the same conids
  // Actually, a simpler approach: find blotter entries pointing to merged strategies,
  // then find which target strategy has trades with matching conids on the same dates
  
  // Get all blotter entries pointing to merged strategies
  const conditions = [
    inArray(blotterActions.strategyId, mergedStrategyIds),
    eq(blotterActions.source, 'trade_ingestion'),
    isNotNull(blotterActions.conid),
    isNotNull(blotterActions.actionDate),
  ];

  if (accountId) {
    // Filter by account via strategies
    const strategyIds = await db
      .select({ id: strategies.id })
      .from(strategies)
      .where(eq(strategies.accountId, accountId));
    
    if (strategyIds.length > 0) {
      conditions.push(inArray(blotterActions.strategyId, strategyIds.map(s => s.id)));
    } else {
      return { updated: 0 };
    }
  }

  const entriesToFix = await db
    .select({
      id: blotterActions.id,
      strategyId: blotterActions.strategyId,
      conid: blotterActions.conid,
      actionDate: blotterActions.actionDate,
    })
    .from(blotterActions)
    .where(and(...conditions));

  let updated = 0;

  for (const entry of entriesToFix) {
    if (!entry.conid || !entry.actionDate) continue;

    // Find the target strategy by looking for trades with the same conid and date
    // that belong to a non-merged strategy
    // Convert actionDate to string format (YYYY-MM-DD) for comparison
    // actionDate is a date field, which is stored as a string in the format YYYY-MM-DD
    const actionDateStr = typeof entry.actionDate === 'string'
      ? entry.actionDate.split('T')[0]
      : String(entry.actionDate).split('T')[0];
    
    const targetStrategy = await db
      .select({
        strategyId: trades.strategyId,
      })
      .from(trades)
      .leftJoin(strategies, eq(trades.strategyId, strategies.id))
      .where(
        and(
          eq(trades.conid, entry.conid),
          sql`DATE(${trades.tradeDate}) = ${actionDateStr}`,
          or(
            isNull(strategies.status),
            ne(strategies.status, 'merged')
          )
        )
      )
      .limit(1);

    if (targetStrategy.length > 0 && targetStrategy[0].strategyId) {
      const targetId = targetStrategy[0].strategyId;
      
      // Only update if it's different
      if (targetId !== entry.strategyId) {
        await db
          .update(blotterActions)
          .set({
            strategyId: targetId,
            updatedAt: sql`now()`,
          })
          .where(eq(blotterActions.id, entry.id));
        
        updated++;
      }
    }
  }

  return { updated };
}
