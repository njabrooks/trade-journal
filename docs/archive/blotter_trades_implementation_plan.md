# Blotter-Trades Integration: Implementation Plan

## Phase 1: Schema Migration

### 1.1 Add Fields to `blotter_actions`

```typescript
// src/db/schema.ts
export const blotterActions = pgTable('blotter_actions', {
  // ... existing fields ...
  source: text('source').default('triage_action'), // 'triage_action' | 'trade_ingestion'
  tradeId: uuid('trade_id').references(() => trades.id, { onDelete: 'set null' }),
  tradeIds: jsonb('trade_ids'), // Array of trade IDs for aggregated entries
  tradeCount: integer('trade_count'), // Number of trades in aggregation
  conid: bigint('conid', { mode: 'number' }), // Contract ID for matching trades to positions
  linkedBlotterActionId: uuid('linked_blotter_action_id').references(() => blotterActions.id, { onDelete: 'set null' }), // Bidirectional link to matching entry
  // ... rest of fields ...
}, (table) => ({
  // ... existing indexes ...
  tradeSourceIdx: index('idx_blotter_trade_source').on(
    table.strategyId,
    table.ticker,
    table.actionDate,
    table.source
  ),
}));
```

### 1.2 Migration SQL

```sql
-- Migration: add_trade_fields_to_blotter
ALTER TABLE blotter_actions
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'triage_action',
  ADD COLUMN IF NOT EXISTS trade_id uuid REFERENCES trades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trade_ids jsonb,
  ADD COLUMN IF NOT EXISTS trade_count integer,
  ADD COLUMN IF NOT EXISTS conid bigint,
  ADD COLUMN IF NOT EXISTS linked_blotter_action_id uuid REFERENCES blotter_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_blotter_trade_source 
  ON blotter_actions(strategy_id, ticker, action_date, source) 
  WHERE source = 'trade_ingestion';
  
CREATE INDEX IF NOT EXISTS idx_blotter_conid 
  ON blotter_actions(conid) 
  WHERE conid IS NOT NULL;
  
CREATE INDEX IF NOT EXISTS idx_blotter_linked 
  ON blotter_actions(linked_blotter_action_id) 
  WHERE linked_blotter_action_id IS NOT NULL;

-- Update existing rows to have source = 'triage_action'
UPDATE blotter_actions SET source = 'triage_action' WHERE source IS NULL;
```

## Phase 2: Core Compute Function

### 2.1 Create `src/lib/derived/blotter.ts`

```typescript
import { db } from '@/db';
import { blotterActions, trades, strategies, positions } from '@/db/schema';
import { and, eq, sql, isNull, isNotNull, gte, lte, inArray } from 'drizzle-orm';
import { NewBlotterAction } from '@/db/schema';

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
 * Aggregates trades by (strategyId, symbol, tradeDate) and creates blotter entries
 */
export async function computeTradeBlotterEntriesForDate(
  tradeDate: string, // YYYY-MM-DD
  accountId?: string,
  strategyId?: string
): Promise<number> {
  // Build where clause
  const whereClauses = [
    eq(sql`DATE(${trades.tradeDate})`, tradeDate),
  ];
  
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
        conid: trade.conid, // Store conid for matching
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
    // Always create trade blotter entry (no deduplication)
    // These are separate from triage TRADE actions and will be matched/linked

    // Generate unique blotterId for this aggregation
    // Use conid in ID if available for better uniqueness
    const blotterId = `TRADE_${agg.strategyId || 'UNLINKED'}_${agg.conid || agg.symbol}_${tradeDate}`;
    
    // Upsert pattern: Delete by unique key (blotterId), then insert
    // This ensures idempotency - safe to run multiple times (matches existing codebase pattern)
    await db
      .delete(blotterActions)
      .where(eq(blotterActions.blotterId, blotterId));
      
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
    const newEntry = await db.insert(blotterActions).values({
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
      }).returning({ id: blotterActions.id });

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
    
    // Bidirectional linking
    await db
      .update(blotterActions)
      .set({
        linkedBlotterActionId: triageActionId,
        updatedAt: new Date(),
      })
      .where(eq(blotterActions.id, tradeBlotterId));

    await db
      .update(blotterActions)
      .set({
        linkedBlotterActionId: tradeBlotterId,
        updatedAt: new Date(),
      })
      .where(eq(blotterActions.id, triageActionId));
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
    
    // Bidirectional linking
    await db
      .update(blotterActions)
      .set({
        linkedBlotterActionId: tradeEntryId,
        updatedAt: new Date(),
      })
      .where(eq(blotterActions.id, triageBlotterId));

    await db
      .update(blotterActions)
      .set({
        linkedBlotterActionId: triageBlotterId,
        updatedAt: new Date(),
      })
      .where(eq(blotterActions.id, tradeEntryId));
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
    const count = await computeTradeBlotterEntriesForDate(
      tradeDate,
      accountId,
      strategyId
    );
    totalCreated += count;
  }

  return totalCreated;
}

/**
 * Backfills trade blotter entries when a strategy is linked/confirmed
 * Also updates existing unlinked entries with the new strategyId
 */
export async function backfillTradeBlotterForStrategy(
  strategyId: string
): Promise<number> {
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
    const count = await computeTradeBlotterEntriesForDate(
      date,
      accountId,
      strategyId
    );
    created += count;
  }

  // Also update existing unlinked entries that match this strategy's conids
  const strategyConids = strategyTrades
    .map(t => t.conid)
    .filter((c): c is number => c !== null);

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
          inArray(blotterActions.conid, strategyConids.map(c => BigInt(c)))
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
        inArray(trades.conid, positionConids.map(c => BigInt(c))),
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
        inArray(trades.conid, positionConids.map(c => BigInt(c))),
        or(
          isNull(trades.strategyId),
          ne(trades.strategyId, strategyId)
        )
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
      const count = await computeTradeBlotterEntriesForDate(
        date,
        accountId,
        strategyId
      );
      created += count;
    }
  }

  return created;
}
```

## Phase 3: Integration Points

### 3.1 Update Trade Ingestion

```typescript
// src/app/api/ingest/flex/trades/route.ts
import { computeTradeBlotterEntriesForDate } from '@/lib/derived/blotter';

// After trades are inserted, add:
if (tradeDates.size > 0 && inserted > 0) {
  // ... existing recompute logic ...
  
  // Create trade blotter entries
  for (const tradeDate of Array.from(tradeDates)) {
    try {
      await computeTradeBlotterEntriesForDate(tradeDate, accountId);
    } catch (error) {
      console.error(`Failed to create trade blotter entries for ${tradeDate}:`, error);
      // Don't fail ingestion if blotter creation fails
    }
  }
}
```

### 3.2 Update Strategy Linking

```typescript
// src/lib/services/strategyLinking.ts
import { backfillTradeBlotterForStrategy, recomputeTradeBlotterForPositionLinking } from '@/lib/derived/blotter';

// After linking position to strategy:
export async function linkPositionToStrategy(positionId: string, strategyId: string): Promise<void> {
  // ... existing linking logic ...
  
  // Get position conid for matching trades
  const position = await db
    .select({ conid: positions.conid, accountId: positions.accountId })
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  if (position.length > 0 && position[0].conid) {
    // Recompute trade blotter entries for trades matching this conid
    try {
      await recomputeTradeBlotterForPositionLinking(strategyId, [position[0].conid]);
    } catch (error) {
      console.error(`Failed to recompute trade blotter after position linking:`, error);
    }
  }
}

// After linking trade to strategy:
export async function linkTradeToStrategy(tradeId: string, strategyId: string): Promise<void> {
  // ... existing linking logic ...
  
  // Get trade conid and date for recompute
  const trade = await db
    .select({ conid: trades.conid, accountId: trades.accountId, tradeDate: trades.tradeDate })
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);

  if (trade.length > 0) {
    const date = new Date(trade[0].tradeDate).toISOString().split('T')[0];
    
    // Recompute trade blotter entry for this date
    try {
      await computeTradeBlotterEntriesForDate(date, trade[0].accountId, strategyId);
    } catch (error) {
      console.error(`Failed to recompute trade blotter after trade linking:`, error);
    }
  }
}
```

### 3.3 Update Strategy Confirmation

```typescript
// src/app/api/strategies/bulk/confirm/route.ts
import { backfillTradeBlotterForStrategy } from '@/lib/derived/blotter';

// After confirming strategies:
for (const id of ids) {
  try {
    await backfillTradeBlotterForStrategy(id);
  } catch (error) {
    console.error(`Failed to backfill trade blotter for strategy ${id}:`, error);
  }
}
```

### 3.5 Update Strategy Merge

```typescript
// src/lib/services/strategies.ts
import { backfillTradeBlotterForStrategy } from '@/lib/derived/blotter';

// After merging strategies:
export async function mergeStrategies(input: MergeStrategiesInput): Promise<...> {
  // ... existing merge logic ...
  
  // Recompute trade blotter entries for target strategy
  // This will include trades from source strategies that were merged
  try {
    await backfillTradeBlotterForStrategy(input.targetId);
  } catch (error) {
    console.error(`Failed to recompute trade blotter after merge:`, error);
  }
}
```

### 3.4 Update Triage Action Creation

```typescript
// src/app/api/triage/action/route.ts
import { matchTriageActionToTradeBlotter } from '@/lib/derived/blotter';

// After creating triage TRADE action, attempt to match with trade blotter entry
const newBlotterAction = await db.insert(blotterActions).values({
  // ... existing fields ...
}).returning({ id: blotterActions.id });

if (newBlotterAction.length > 0 && actionType === 'TRADE') {
  // Get position conid if available (for matching)
  let conid: number | null = null;
  if (positionId) {
    const position = await db
      .select({ conid: positions.conid })
      .from(positions)
      .where(eq(positions.id, positionId))
      .limit(1);
    if (position.length > 0) {
      conid = position[0].conid;
    }
  }

  // Attempt to match with existing trade blotter entry
  try {
    await matchTriageActionToTradeBlotter(
      newBlotterAction[0].id,
      strategyId || triage.strategyId,
      triage.symbol,
      conid,
      triage.snapshotDate
    );
  } catch (error) {
    console.error('Failed to match triage action to trade blotter:', error);
    // Continue - matching is optional, not critical
  }
}
```

## Phase 4: API Endpoints

### 4.1 Recompute Endpoint

```typescript
// src/app/api/recompute/blotter-trades/route.ts
import { computeTradeBlotterEntriesForDateRange } from '@/lib/derived/blotter';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accountId, startDate, endDate, snapshotDate } = body;

  if (snapshotDate) {
    const count = await computeTradeBlotterEntriesForDate(snapshotDate, accountId);
    return NextResponse.json({ success: true, count });
  }

  if (startDate && endDate) {
    const count = await computeTradeBlotterEntriesForDateRange(startDate, endDate, accountId);
    return NextResponse.json({ success: true, count });
  }

  return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
}
```

## Phase 5: Update Queries

### 5.1 Update Blotter Query

```typescript
// src/db/queries/blotter.ts
// Update to include new fields and linked action

export interface BlotterEntry {
  // ... existing fields ...
  source: string | null;
  tradeCount: number | null;
  tradeIds: string[] | null;
  conid: number | null;
  linkedBlotterActionId: string | null;
}

// In getBlotterEntries, add:
.select({
  // ... existing fields ...
  source: blotterActions.source,
  tradeCount: blotterActions.tradeCount,
  tradeIds: blotterActions.tradeIds,
  conid: sql<number | null>`${blotterActions.conid}::bigint`.as('conid'),
  linkedBlotterActionId: blotterActions.linkedBlotterActionId,
})

// Optionally join to get linked action details
.leftJoin(
  blotterActions as linkedActions,
  eq(blotterActions.linkedBlotterActionId, linkedActions.id)
)
```

## Phase 6: Testing Strategy

1. **Unit Tests**: Test aggregation logic, deduplication
2. **Integration Tests**: Test with real trade data, strategy linking
3. **Edge Cases**: Unlinked trades, multiple strategies, same symbol
4. **Performance**: Test with large date ranges (1000+ trades)

## Rollout Plan

1. **Phase 1**: Schema migration (non-breaking, add columns)
2. **Phase 2**: Compute function (test in isolation)
3. **Phase 3**: Integration (one endpoint at a time)
4. **Phase 4**: Backfill existing trades (run recompute for historical data)
5. **Phase 5**: UI updates (show source indicator, trade details)

## Rollback Plan

If issues arise:
1. Set `source = 'triage_action'` for all entries (hides trade entries)
2. Disable auto-creation in ingestion endpoints
3. Keep trades separate until issues resolved
