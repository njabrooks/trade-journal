# Blotter-Trades Integration Design

## Problem Statement

The blotter currently only contains triage-based actions. We need to include all trade records to create a unified activity log. Key challenges:

1. **Aggregation**: Trades are individual records, but blotter should show daily aggregates per symbol/strategy
2. **Timing**: Trades may be ingested before strategies are confirmed/linked
3. **Matching**: Link trade ingestion records with triage TRADE action records (they are separate, not duplicates)
4. **Linking**: Ensure trades link correctly to strategies using conID as the primary matching key
5. **Recompute**: When strategy_id changes or positions are linked, recompute trade blotter entries

## Solution: Auto-Create Blotter Entries from Trades

### Schema Changes

Add to `blotter_actions` table:

```sql
ALTER TABLE blotter_actions
  ADD COLUMN source text DEFAULT 'triage_action', -- 'triage_action' | 'trade_ingestion'
  ADD COLUMN trade_id uuid REFERENCES trades(id) ON DELETE SET NULL, -- For single trade links
  ADD COLUMN trade_ids jsonb, -- Array of trade IDs for aggregated entries
  ADD COLUMN trade_count integer, -- Number of trades aggregated
  ADD COLUMN conid bigint, -- Contract ID for matching trades to positions
  ADD COLUMN linked_blotter_action_id uuid REFERENCES blotter_actions(id) ON DELETE SET NULL; -- Link to matching triage action or trade entry

-- Indexes for matching lookups
CREATE INDEX idx_blotter_trade_source ON blotter_actions(strategy_id, ticker, action_date, source) 
  WHERE source = 'trade_ingestion';
  
CREATE INDEX idx_blotter_conid ON blotter_actions(conid) 
  WHERE conid IS NOT NULL;
  
CREATE INDEX idx_blotter_linked ON blotter_actions(linked_blotter_action_id) 
  WHERE linked_blotter_action_id IS NOT NULL;
```

### Aggregation Strategy

**Daily Aggregation by (strategyId, conid, tradeDate):**
- Group all trades for same strategy + conid + date
- **Primary matching key: conID** (contract identifier) - matches trades to positions
- Sum quantities (net: BUY - SELL)
- Sum premium changes (netAmount)
- Sum realized PnL
- Store array of trade IDs in `trade_ids` JSONB field
- Store conid for matching to positions

**For unlinked trades:**
- Create blotter entries with `strategyId = NULL` but keep `conid`
- When strategy is later linked/confirmed, backfill these entries using conid matching

### Matching Logic (Not Deduplication)

**Key Principle**: Triage TRADE actions and trade ingestion entries are **separate records** that should be **linked together**, not deduplicated.

**Rule 1: Create trade blotter entry for all trades**
- Always create trade blotter entry when trades are ingested
- Don't skip even if pending TRADE action exists
- These are two different records:
  - Triage TRADE action = intention/metadata (before trade)
  - Trade ingestion entry = actual execution (after trade)

**Rule 2: Match trade entries to triage TRADE actions**
- When trade blotter entry is created, check for matching triage TRADE action:
  - Same `strategyId` (or both NULL)
  - Same `conid` (primary match) OR same `ticker`/symbol (fallback)
  - Same `actionDate` (or within 1 day)
  - `actionDetail = 'TRADE'` and `source = 'triage_action'`
- If found, link them via `linked_blotter_action_id` (bidirectional link)
- Trade entry links to triage action, triage action links to trade entry

**Rule 3: Match when triage TRADE action is created**
- When user creates TRADE action from triage:
  - Check for existing trade blotter entry with matching conid/symbol/date
  - If found, link them bidirectionally
  - Trade entry provides execution details, triage action provides metadata

**Rule 4: Match when quantity change triage is updated**
- When user updates QUANTITY_CHANGE triage with metadata:
  - Find matching trade blotter entry (by conid/symbol/date)
  - Link the updated triage action to the trade entry
  - Trade entry shows execution, triage action shows metadata

**Rule 5: Unique constraint**
- Use `blotterId` uniqueness: `TRADE_${strategyId || 'UNLINKED'}_${conid || symbol}_${tradeDate}_${hash}`
- Prevents duplicate trade blotter entries for same aggregation

### Compute Operation: `computeTradeBlotterEntries`

**Location**: `src/lib/derived/blotter.ts` (new file)

**Process**:
1. Query trades for date range (or single date)
2. Group by: `(strategyId, conid, DATE(tradeDate))` - **conid is primary grouping key**
3. For each group:
   - Calculate net quantity change (sum BUY - sum SELL)
   - Calculate net premium (sum netAmount)
   - Calculate realized PnL (sum if available)
   - Get strategy metadata (if strategyId exists)
   - Store conid for matching to positions
   - Create/upsert blotter entry
   - **Attempt to match** with existing triage TRADE action (by conid/symbol/date)
4. Handle unlinked trades separately (strategyId = NULL, but keep conid)

**When It Runs**:
- ✅ **Auto**: After Flex trades ingestion (for ingested trade dates)
- ✅ **Auto**: After strategy linking (backfill for newly linked trades)
- ✅ **Auto**: After strategy confirmation (backfill for confirmed strategies)
- ✅ **Manual**: `/api/recompute/blotter-trades` (date range)

### Backfill & Recompute Logic

**When strategy is linked/confirmed:**
1. Find all trades with `strategyId = NULL` that match the strategy (by conid or symbol pattern)
2. **Recompute trade blotter entries** for those trades (now with strategyId set)
3. Update existing unlinked blotter entries with new strategyId
4. Re-aggregate if needed (merge entries for same strategy/conid/date)

**When trade is manually linked to strategy:**
1. Find existing trade blotter entry (if any) for that trade (by tradeId or conid)
2. Update `strategyId` on blotter entry
3. Recompute aggregation if multiple trades for same strategy/conid/date

**When position is linked to strategy:**
1. Find all trades with matching `conid` that are unlinked
2. Update those trades' `strategyId` to match position's strategyId
3. **Recompute trade blotter entries** for affected dates
4. Update existing blotter entries with new strategyId

**When strategy merge occurs:**
1. Find all trades for source strategies
2. Update trades' `strategyId` to target strategy
3. **Recompute trade blotter entries** for all affected dates
4. Re-aggregate entries (merge entries for same conid/date into target strategy)

**Recompute triggers:**
- ✅ After trade ingestion (for ingested dates)
- ✅ After strategy linking (backfill for newly linked trades)
- ✅ After strategy confirmation (backfill for confirmed strategies)
- ✅ After position linking (recompute for affected trades)
- ✅ After strategy merge (recompute for merged strategies)
- ✅ Manual: `/api/recompute/blotter-trades` (date range)

### Matching Scenarios with Triage TRADE Actions

**Scenario 1: Triage TRADE action created first, then trade ingested**
- User creates TRADE action from triage → creates blotter entry with `source = 'triage_action'`
- Trade ingested → creates blotter entry with `source = 'trade_ingestion'`
- **Matching**: When trade entry created, find matching triage action by conid/symbol/date
  - Link them bidirectionally via `linked_blotter_action_id`
  - Trade entry shows execution details (qty, premium, etc.)
  - Triage action shows metadata (tradeReason, tradeStage, notes)

**Scenario 2: Trade ingested first, then quantity change triage updated**
- Trade ingested → creates blotter entry with `source = 'trade_ingestion'`
- Quantity change detected → creates QUANTITY_CHANGE triage record
- User updates triage with metadata → creates blotter entry with `source = 'triage_action'`
- **Matching**: When triage action created, find matching trade entry by conid/symbol/date
  - Link them bidirectionally
  - Trade entry shows execution, triage action shows metadata

**Scenario 3: Trade ingested, no triage action**
- Trade blotter entry created normally with `source = 'trade_ingestion'`
- No matching triage action exists
- Entry stands alone (can be linked later if user creates triage action)

**Scenario 4: Triage TRADE action, no trade ingested yet**
- User creates TRADE action from triage → creates blotter entry with `source = 'triage_action'`
- Trade not yet ingested (pending execution)
- Entry stands alone until trade is ingested and matched

**Matching Algorithm:**
1. **Primary match**: By `conid` + `actionDate` (same day or within 1 day)
2. **Fallback match**: By `ticker`/`symbol` + `strategyId` + `actionDate`
3. **Quantity match**: If quantities match (within tolerance), consider it a match
4. **Bidirectional linking**: Both entries reference each other via `linked_blotter_action_id`

### Implementation Steps

1. **Schema Migration**
   - Add `source`, `tradeId`, `tradeIds`, `tradeCount` fields
   - Add index for deduplication lookups

2. **Create `computeTradeBlotterEntries` function**
   - Aggregation logic
   - Deduplication checks
   - Upsert pattern (delete + insert for idempotency)

3. **Update Trade Ingestion**
   - After trades ingested, call `computeTradeBlotterEntries` for trade dates
   - Handle errors gracefully (don't fail ingestion)

4. **Update Strategy Linking/Confirmation**
   - After linking/confirmation, backfill trade blotter entries
   - Update existing unlinked entries

5. **Update Triage Action Creation**
   - When TRADE action created, check for existing trade blotter entry
   - Link or merge appropriately

6. **Update Blotter Query**
   - Include both `source = 'triage_action'` and `source = 'trade_ingestion'`
   - Sort by `actionDate` (or `createdAt` for same date)
   - Display source indicator in UI

7. **Recompute Endpoint**
   - Add `/api/recompute/blotter-trades` endpoint
   - Support date range recomputation

### Edge Cases

1. **Trades before strategy confirmation**
   - Create unlinked entries initially
   - Backfill when strategy confirmed

2. **Multiple trades same symbol/date, different strategies**
   - Group by strategyId, so separate entries per strategy
   - Unlinked trades grouped separately

3. **Trade linked to strategy after blotter entry created**
   - Update existing blotter entry's strategyId
   - Re-aggregate if needed (merge with other trades for that strategy)

4. **Partial day trades**
   - Aggregate all trades for the day regardless of time
   - Use `DATE(tradeDate)` for grouping

### Performance Considerations

- **Indexing**: 
  - Index on `(strategyId, ticker, actionDate, source)` for fast lookups
  - Index on `conid` for matching trades to positions
  - Index on `linked_blotter_action_id` for bidirectional lookups
- **Batch Processing**: Process trades in batches (e.g., 1000 at a time)
- **Incremental**: Only process new trades (track last processed trade ID or date)
- **Async**: Run asynchronously after ingestion (don't block main flow)
- **Recompute Optimization**: Only recompute affected dates when strategy/position linking changes

### Alternative: View-Based Approach

If auto-creation proves too complex, alternative:
- Keep trades separate
- Create database view: `blotter_with_trades` that UNIONs blotter_actions + aggregated trades
- Frontend queries view instead of table
- **Pros**: Simpler, no sync issues
- **Cons**: Less flexible, harder to link/reconcile, can't mark trades as "completed" in blotter context

### Recommendation

**Go with auto-creation approach** because:
1. Unified data model (all activity in one place)
2. Better UX (single source of truth)
3. Enables linking/reconciliation between trades and triage actions
4. Can mark trades as "completed" when reconciled
5. More flexible for future features (e.g., trade annotations, notes)

The complexity is manageable with proper matching and recompute logic.

## Key Design Principles

1. **conID is Primary Matching Key**: Use conid to match trades to positions across all operations
2. **Matching, Not Deduplication**: Triage actions and trade entries are separate records that should be linked
3. **Bidirectional Links**: Both entries reference each other for easy navigation
4. **Recompute on Changes**: When strategy_id or position links change, recompute affected trade blotter entries
5. **Aggregation by conID**: Group trades by conid (not just symbol) to handle same symbol, different contracts
