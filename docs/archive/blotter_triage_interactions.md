# Blotter-Triage Interactions: Data Flow & Behavior Specification

**Purpose**: This document details how blotter records are created, matched, and how they interact with triage records. Use this for iterating on desired frontend and backend behavior.

**Status**: Draft for review and iteration

---

## Table of Contents

1. [Overview](#overview)
2. [Data Flow Architecture](#data-flow-architecture)
3. [Data Transformations](#data-transformations)
4. [Matching Logic](#matching-logic)
5. [Feedback Loops to Triage](#feedback-loops-to-triage)
6. [Frontend Behavior](#frontend-behavior)
7. [Backend Behavior](#backend-behavior)
8. [Edge Cases & Scenarios](#edge-cases--scenarios)
9. [Open Questions & Iteration Points](#open-questions--iteration-points)

---

## Overview

The blotter system creates a unified activity log by combining:
- **Trade ingestion records** (`source = 'trade_ingestion'`) - Actual executed trades from broker data
- **Trade Action records** (`source = 'triage_action'`, `actionDetail = 'TRADE'`) - User decisions from triage queue

**Core Principle**: Every ingested trade should be matched with a Trade Action created by the user. The sequencing (Trade Action first vs. trade ingestion first) only affects display, not the matching logic.

### Key Concepts

- **Trade Action**: Unified action type created from triage records (position or strategy level). Always intended to match with ingested trades.
- **DECISION**: Trade Action created before trade ingestion (shows as pending until matched)
- **EXECUTION**: Trade ingestion creates blotter entry (actual executed trades)
- **RECONCILE**: Trade Action created after trade ingestion (via QUANTITY_CHANGE triage record)

### Primary Matching Key

**`conid` (Contract ID)** is the **only** matching key. Every position in the `positions` table has a `conid` that links to a `strategyId`. Trade Actions fetch `conid` from positions, and trades have `conid` from ingestion. Matching is always by `conid` + `actionDate`.

---

## Data Flow Architecture

### High-Level Flow

```
┌─────────────────┐
│ Trade Ingestion │
│   (CSV Upload)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Insert Trades into `trades` table│
└────────┬────────────────────────────┘
         │
         ├──────────────────────────────────┐
         │                                  │
         ▼                                  ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│ 2. Create Trade Blotter  │   │ 3. Compute Triage Records    │
│    Entries               │   │    - Position-level flags    │
│    - Aggregate by        │   │    - Strategy-level flags    │
│      (strategyId, conid, │   │    - QUANTITY_CHANGE         │
│       tradeDate)         │   │      detection               │
│    - source:             │   │                              │
│      'trade_ingestion'   │   │                              │
└────────┬─────────────────┘   └──────────┬───────────────────┘
         │                                 │
         │                                 │
         └──────────────┬──────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │ 4. Matching Logic            │
         │    - Match trade entries to  │
         │      triage actions          │
         │    - Bidirectional linking   │
         │      via conid               │
         └────────┬─────────────────────┘
                  │
                  ▼
         ┌──────────────────────────────┐
         │ 5. User Creates Triage Action│
         │    - TRADE action            │
         │    - QUANTITY_CHANGE action  │
         │    - Attempts to match       │
         │      existing trade entries  │
         └────────┬─────────────────────┘
                  │
                  ▼
         ┌──────────────────────────────┐
         │ 6. Blotter Display           │
         │    - Groups matched records  │
         │    - Shows DECISION →        │
         │      EXECUTION → RECONCILE   │
         └──────────────────────────────┘
```

### Two-Way Matching

Matching can happen in either direction:

1. **Trades → Trade Actions**: When trades are ingested, match to existing pending Trade Actions
2. **Trade Actions → Trades**: When user creates Trade Action, match to existing trade entries

**Key Point**: The matching logic is identical regardless of sequencing. The only difference is:
- If Trade Action first: Shows as "pending" in blotter until trade ingested
- If trade first: QUANTITY_CHANGE triage record prompts user to create Trade Action

---

## Data Transformations

### 1. Trade Ingestion → Trade Blotter Entry

**Input**: Individual trade records from CSV
**Output**: Aggregated blotter entries

#### Transformation Steps

1. **Query trades for date**
   ```sql
   SELECT id, strategyId, symbol, conid, side, quantity, netAmount, accountId
   FROM trades
   WHERE DATE(tradeDate) = {tradeDate}
     AND accountId = {accountId} [optional]
     AND strategyId = {strategyId} [optional]
   ```

2. **Group by aggregation key**
   - Primary key: `(strategyId || 'UNLINKED')_${conid || symbol}`
   - Groups all trades for same strategy + contract on same date

3. **Aggregate quantities**
   - Net quantity: `SUM(CASE WHEN side = 'BUY' THEN quantity ELSE -quantity END)`
   - Net premium: `SUM(netAmount)`
   - Trade IDs: Array of all trade IDs in group
   - Trade count: Length of trade IDs array

4. **Create blotter entry**
   ```typescript
   {
     blotterId: `TRADE_${strategyId || 'UNLINKED'}_${conid || symbol}_${tradeDate}`,
     source: 'trade_ingestion',
     actionDate: tradeDate,
     snapshotDate: tradeDate,
     strategyId: agg.strategyId ?? null,
     ticker: agg.symbol,
     strategyKey: strategy.strategyKey ?? null,
     strategyLabel: strategy.autoDerivedLabel ?? null,
     actionClass: 'TRADE',
     actionDetail: 'TRADE_INGESTED',
     reasonCode: 'TRADE_EXECUTION',
     qtyChange: agg.netQuantity.toString(),
     premiumChange: agg.netPremium.toString(),
     tradeIds: agg.tradeIds, // JSONB array
     tradeCount: agg.tradeIds.length,
     conid: agg.conid ?? null,
     completed: true, // Trades are already executed
   }
   ```

5. **Attempt matching** (see Matching Logic section)

#### Key Fields

- **`blotterId`**: Deterministic ID for idempotency (no timestamp)
- **`source`**: Always `'trade_ingestion'` for trade entries
- **`conid`**: Primary matching key (can be null for unlinked trades)
- **`tradeIds`**: JSONB array of all trade IDs aggregated
- **`tradeCount`**: Number of trades in aggregation

---

### 2. Triage Record → Trade Action Blotter Entry

**Input**: Triage record + user Trade Action
**Output**: One or more blotter entries with `source = 'triage_action'`, `actionDetail = 'TRADE'`

#### Trade Action Form

When user selects "TRADE" action from triage (position or strategy level), a form opens with:

**Position Selection**:
- User selects positions by **ticker/symbol** (or from list of positions in strategy)
- Positions are identified by `conid` (fetched from positions table)

**Auto-Populated Fields** (from positions table based on selected `conid`):
- **Asset Class** (from `positions.assetClass`)
- **Underlying** (from `positions.underlyingId` → `underlyings.symbol`, or `positions.symbol` for stocks)
- **Expiry** (from `positions.expiry`, for options)
- **Strike** (from `positions.strike`, for options)
- **P/C** (from `positions.optionRight`, mapped: 'C' → 'CALL', 'P' → 'PUT', for options)
- **Quantity** (from `positions.quantity`, but **editable** - user may trade different quantity)

**Required User Input**:
- **Quantity** * (number, required, pre-populated from position but editable)
- **Trade Reason** (text, required)
- **Trade Stage** (select: 'open', 'close', 'hedge', 'roll', 'reduce', 'add', required)

**Form Behavior**:
- **Position-level triage**: 
  - Form opens with specific position pre-selected
  - Fields auto-populated from position data
  - User can edit quantity and add/remove other positions in the strategy
- **Strategy-level triage**: 
  - Form opens with all positions in strategy available for selection
  - User selects positions to trade (one or more)
  - Selected positions' fields auto-populated
  - User can edit quantities and add/remove positions
- **QUANTITY_CHANGE triage** (strategy-level):
  - Form opens with unmatched trade executions pre-populated
  - Fetches triage record to get `unmatchedTradeExecutions` JSONB array
  - Maps trade executions to positions by `conid`
  - Pre-populates quantities from executed trades (signed values from trade execution)
  - Some fields disabled (asset class, underlying) - locked to trade execution data
  - Quantities editable (user can adjust if needed)
  - Same UI structure as TRADE form, but data source is trade executions, not positions table

#### Transformation Steps

1. **User selects TRADE action from triage queue**
   - Opens Trade Action form
   - User selects positions by ticker/symbol (or from position list)
   - Form auto-populates fields from positions table based on selected `conid`:
     - Asset Class, Underlying, Expiry, Strike, P/C, Quantity
   - User edits quantity (if different from position quantity)
   - User provides tradeReason and tradeStage

2. **Fetch position data for each selected position**
   ```typescript
   // For each position selected in the trade action
   const position = await db
     .select({
       conid: positions.conid,
       symbol: positions.symbol,
       assetClass: positions.assetClass,
       quantity: positions.quantity,
       expiry: positions.expiry,
       strike: positions.strike,
       optionRight: positions.optionRight,
       underlyingId: positions.underlyingId,
     })
     .from(positions)
     .where(eq(positions.id, positionId))
     .limit(1);
   
    // Fetch underlying symbol if needed (for options)
   const underlying = position.assetClass !== 'STK' && position.underlyingId
     ? await db
         .select({ symbol: underlyings.symbol })
         .from(underlyings)
         .where(eq(underlyings.id, position.underlyingId))
         .limit(1)
     : null;
   
   // For stocks (STK), the position.symbol IS the underlying
   // For options, fetch from underlyings table
   // conid is guaranteed to exist (positions table has conid per position)
   ```

3. **Create one blotter entry per position**
   ```typescript
   // For each position in the trade action
   for (const tradePosition of tradePositions) {
     const position = await getPositionById(tradePosition.positionId);
     
     // Determine actionDate:
     // - If from QUANTITY_CHANGE triage: actionDate = triage.snapshotDate (matches trade date)
     // - Otherwise: actionDate = triage.snapshotDate + 1 day (intended for next day's trades)
     const actionDate = triage.recommendedAction === 'QUANTITY_CHANGE'
       ? triage.snapshotDate
       : addDays(triage.snapshotDate, 1);
     
     await db.insert(blotterActions).values({
       blotterId: `${actionDate}_${strategyId}_${position.conid}_${Date.now()}`,
       source: 'triage_action',
       actionDate: actionDate,
       snapshotDate: triage.snapshotDate,
       strategyId: strategyId || triage.strategyId,
       positionId: tradePosition.positionId,
       ticker: position.symbol,
       conid: position.conid, // Primary matching key
       actionClass: 'TRADE',
       actionDetail: 'TRADE',
       reasonCode: triage.recommendedAction || null,
       // Store trade details for display (from position data, quantity may be edited)
       // Note: Trade details stored as JSON in notes field for display
       qtyChange: Math.abs(tradePosition.quantity).toString(), // Absolute value (user-edited quantity)
       tradeReason: tradeReason,
       tradeStage: tradeStage,
       notes: JSON.stringify({
         // User-provided notes (if any)
         text: notes || null,
         // Trade details for display (from position data)
         tradeDetails: {
           assetClass: position.assetClass,
           quantity: tradePosition.quantity, // User-edited quantity (signed)
           underlying: position.assetClass === 'STK' 
             ? position.symbol // For stocks, symbol is the underlying
             : (underlying?.symbol || position.symbol), // For options, fetch underlying
           expiry: position.expiry,
           strike: position.strike,
           optionRight: position.optionRight, // 'C' or 'P'
         }
       }),
       completed: false, // Will be updated to true when matched
       severityOverride: 'pending', // Will be updated to 'complete' when trade detected
     });
   }
   ```

4. **Attempt matching** (see Matching Logic section)

5. **Update triage record severity**
   - Set to `'pending'` (will be updated to `'complete'` when trade detected)

#### Key Fields

- **`blotterId`**: Includes timestamp (unique per action)
- **`source`**: Always `'triage_action'` for Trade Actions
- **`actionDetail`**: Always `'TRADE'`
- **`actionDate`**: 
  - **QUANTITY_CHANGE**: `triage.snapshotDate` (matches trade date)
  - **Other triage**: `triage.snapshotDate + 1 day` (intended for next day's trades)
- **`conid`**: Fetched from positions table (guaranteed to exist)
- **`qtyChange`**: Absolute value of user-edited quantity (used for matching, signed quantity stored in notes JSON)
- **Trade details**: Stored as JSON in `notes` field (assetClass, underlying, expiry, strike, optionRight) - fetched from positions table
- **`tradeReason`** and **`tradeStage`**: Required metadata
- **Quantity sign**: Actual direction/sign comes from trade ingestion records (single source of truth)

---

### 3. Trade Ingestion → QUANTITY_CHANGE Triage Record

**Input**: Ingested trades that don't match pending Trade Actions
**Output**: Strategy-level QUANTITY_CHANGE triage record

#### Transformation Steps

1. **After trade ingestion and matching**
   - Trades are ingested and trade blotter entries created
   - Matching logic attempts to match trades to pending Trade Actions
   - **Unmatched trades** remain

2. **Group unmatched trades by strategy**
   ```typescript
   // Find all unmatched trade blotter entries for this date
   const unmatchedTrades = await db
     .select()
     .from(blotterActions)
     .where(
       and(
         eq(blotterActions.source, 'trade_ingestion'),
         eq(blotterActions.actionDate, tradeDate),
         isNull(blotterActions.linkedBlotterActionId),
         isNotNull(blotterActions.strategyId)
       )
     );
   
   // Group by strategyId
   const tradesByStrategy = new Map<string, typeof unmatchedTrades>();
   for (const trade of unmatchedTrades) {
     if (!trade.strategyId) continue;
     if (!tradesByStrategy.has(trade.strategyId)) {
       tradesByStrategy.set(trade.strategyId, []);
     }
     tradesByStrategy.get(trade.strategyId)!.push(trade);
   }
   ```

3. **For each strategy with unmatched trades**
   - Aggregate trades by `conid` (each position aggregated individually)
   - Create one strategy-level QUANTITY_CHANGE triage record

4. **Create triage record with unmatched trade execution details**
   ```typescript
   {
     snapshotDate: tradeDate, // Date of the trades
     accountId: accountId,
     contextLevel: 'strategy', // Always strategy-level
     positionId: null, // Strategy-level, no specific position
     strategyId: strategyId,
     symbol: strategy.strategyKey || 'Strategy', // Strategy identifier
     recommendedAction: 'QUANTITY_CHANGE',
     severity: 'pending', // User must create Trade Action
     unmatchedTradeExecutions: [
       {
         blotterId: string, // Blotter entry ID
         blotterActionId: string, // Blotter action UUID
         conid: number, // Contract ID for matching
         ticker: string, // Position ticker/symbol
         actionDate: string, // Trade date
         qtyChange: number, // Net quantity (signed, from trade execution)
         premiumChange: number, // Net premium
         tradeIds: string[], // Array of trade IDs
         tradeCount: number, // Number of trades aggregated
       },
       // ... one entry per position (conid)
     ],
     notes: JSON.stringify({
       unmatchedTrades: [
         // Aggregated summary for display
         { conid, ticker, totalQtyChange, totalPremiumChange, tradeCount }
       ]
     }),
     // ... other triage fields
   }
   ```

5. **Triage record stores full trade execution details**
   - `unmatchedTradeExecutions` JSONB field contains complete details for each unmatched trade execution
   - Each position (conid) has one entry with aggregated trade data
   - Used by QUANTITY_CHANGE form to pre-populate position selection
   - Enables matching when user creates Trade Action

#### Key Points

- **Strategy-level only**: One QUANTITY_CHANGE record per strategy per date
- **After matching**: Only includes trades that didn't match pending Trade Actions (created after matching completes)
- **Not part of computeTriageForDate**: QUANTITY_CHANGE is different from other triage records - it depends on matching results, not position comparisons
- **Aggregated by position**: Each `conid` aggregated separately, then grouped by strategy
- **Purpose**: Prompt user to create Trade Action for unmatched trades

---

## Matching Logic

### Matching Algorithm

**Simplified**: Matching is always by `conid` + `actionDate` + `quantity`. No fallbacks needed since `conid` is guaranteed to exist. 

**Quantity Matching**:
- Uses **absolute values** for comparison (handles long/short complexity in option strategies)
- Tolerance: **0.01 units** (handles rounding differences)
- Actual sign/direction comes from trade ingestion records (single source of truth for executed trades)
- Trade Action `qtyChange` stores absolute value, but original signed quantity stored in notes JSON

#### Match by conid + actionDate + quantity

```typescript
// When trade entry is created, match to pending Trade Actions
WHERE source = 'triage_action'
  AND actionDetail = 'TRADE'
  AND actionDate = {tradeDate}
  AND conid = {tradeConid}
  AND ABS(ABS(CAST(qtyChange AS DECIMAL)) - ABS({tradeNetQuantity})) <= 0.01 // Quantity match (absolute values, tolerance 0.01)
  AND completed = false // Only match pending actions

// When Trade Action is created, match to existing trade entries
WHERE source = 'trade_ingestion'
  AND actionDate = {actionDate}
  AND conid = {actionConid}
  AND ABS(ABS(CAST(qtyChange AS DECIMAL)) - ABS({actionQuantity})) <= 0.01 // Quantity match (absolute values, tolerance 0.01)
  AND linkedBlotterActionId IS NULL // Only match unmatched trades
```

**Key Points**:
- **Exact date match**: `actionDate` must match exactly (no ±1 day tolerance)
- **conid required**: Both records must have `conid` (guaranteed from positions/trades)
- **Quantity match**: Uses **absolute values** for comparison (tolerance: 0.01 units)
  - Trade Action `qtyChange`: Absolute value of user-specified quantity (signed quantity stored in notes JSON)
  - Trade entry `qtyChange`: Net quantity from trades (BUY - SELL, can be positive or negative)
  - Comparison: `ABS(tradeAction.qtyChange) ≈ ABS(tradeEntry.qtyChange)` within 0.01
  - **Direction/sign**: Always comes from trade ingestion records (single source of truth)
- **One-to-one**: Each Trade Action matches to one trade entry (or aggregated trade entry for same conid/date)
- **Multiple positions**: If Trade Action includes multiple positions, creates multiple blotter entries, each matches independently

### Bidirectional Linking

When two records match:

```typescript
// Transaction: Atomic bidirectional link
await db.transaction(async (tx) => {
  // Link A → B
  await tx.update(blotterActions)
    .set({ linkedBlotterActionId: actionBId })
    .where(eq(blotterActions.id, actionAId));
  
  // Link B → A
  await tx.update(blotterActions)
    .set({ linkedBlotterActionId: actionAId })
    .where(eq(blotterActions.id, actionBId));
});
```

### Matching Scenarios

#### Scenario A: Trade Action Created First, Then Trade Ingested

1. User creates Trade Action from triage (e.g., position-level DTE flag)
   - Form opens, user specifies positions and trade details
   - Creates blotter entry(ies) with `actionDate = snapshotDate + 1`
   - `severityOverride = 'pending'`, `completed = false`
2. Trade ingested on next day → Creates `source = 'trade_ingestion'` entry
   - `actionDate = tradeDate` (matches Trade Action's `actionDate`)
3. Trade entry attempts match → Finds Trade Action by `conid` + `actionDate` + `quantity` (within tolerance)
4. Bidirectional link created
5. Trade Action updated: `severityOverride = 'complete'`, `completed = true`
6. **Result**: Matched group with DECISION + EXECUTION

#### Scenario B: Trade Ingested First, Then QUANTITY_CHANGE Trade Action Created

1. Trade ingested → Creates `source = 'trade_ingestion'` entry
   - No matching pending Trade Action found
2. QUANTITY_CHANGE triage record created (strategy-level)
   - Includes all unmatched trades for strategy on that date
   - Aggregated by position (conid), grouped by strategy
   - **Stores full trade execution details in `unmatchedTradeExecutions` JSONB field**:
     - `blotterId`, `blotterActionId`, `conid`, `ticker`, `actionDate`
     - `qtyChange` (signed, from trade execution), `premiumChange`
     - `tradeIds`, `tradeCount`
3. User creates Trade Action from QUANTITY_CHANGE triage
   - Form opens, fetches triage record to get `unmatchedTradeExecutions`
   - **Pre-populated with trade execution data**:
     - Positions matched by `conid` from trade executions
     - Quantities pre-filled from executed trades (signed values)
     - Asset class and underlying fields disabled (locked to trade execution)
     - User can edit quantities if needed
   - User provides `tradeReason` and `tradeStage` (required)
   - Creates blotter entry(ies) with `actionDate = snapshotDate` (trade date)
   - Creates Trade Actions (`actionClass = 'TRADE'`, `actionDetail = 'TRADE'`)
4. Trade Action attempts match → Finds trade entry by `conid` + `actionDate` + `quantity` (within tolerance)
5. Bidirectional link created
6. Trade Action updated: `severityOverride = 'complete'`, `completed = true`
7. **Result**: Matched group with EXECUTION + RECONCILE

#### Scenario C: Multiple Positions in Trade Action

1. User creates Trade Action from strategy-level triage
   - Form includes multiple positions (e.g., closing entire strategy)
   - User specifies trade details for each position
2. Creates multiple blotter entries (one per position/conid)
   - Each entry has its own `conid` and `actionDate`
3. Trades ingested (one per position or aggregated)
4. Each Trade Action entry matches independently to its corresponding trade entry by `conid` + `actionDate` + `quantity`
5. **Result**: Multiple matched groups, can be grouped by strategy in UI

#### Scenario D: No Match

1. Trade ingested → Creates entry, no matching Trade Action found
2. QUANTITY_CHANGE triage record created for strategy
3. **Result**: Unmatched trade entry shown in blotter, QUANTITY_CHANGE in triage queue

---

## Feedback Loops to Triage

### 1. Pending Trade Action Reconciliation

**When**: Trade ingested and matched to pending Trade Action

**Process**:
1. Trade ingested → Trade blotter entry created
2. Matching logic finds pending Trade Action (`severityOverride = 'pending'`, `actionDetail = 'TRADE'`)
3. Bidirectional link created
4. Trade Action updated: `severityOverride = 'complete'`, `completed = true`
5. Associated triage record updated: `severity = 'complete'`

**Purpose**: Automatically mark Trade Actions as complete when trade is detected and matched

### 2. Triage Record Severity Updates

**When**: User creates triage action with severity override

**Process**:
1. User creates action (e.g., `DISMISS`, `MONITOR`)
2. Blotter entry created with `severityOverride`
3. Triage record updated immediately:
   ```typescript
   UPDATE triage_records
   SET severity = {severityOverride},
       updatedAt = NOW()
   WHERE id = {triageId}
   ```

**Purpose**: Immediate feedback in triage queue

### 3. Unmatched Trades Trigger QUANTITY_CHANGE Triage Record

**When**: Trades ingested but don't match pending Trade Actions

**Process**:
1. Trades ingested → Trade blotter entries created
2. Matching logic attempts to match to pending Trade Actions
3. Unmatched trades identified (no `linkedBlotterActionId`)
4. Unmatched trades grouped by strategy and aggregated by position (conid)
5. Strategy-level QUANTITY_CHANGE triage record created
6. User sees in triage queue
7. User creates Trade Action from QUANTITY_CHANGE triage
8. Trade Action matches to trade entries

**Purpose**: Ensure all ingested trades are reconciled with user Trade Actions

---

## Frontend Behavior

### Blotter Page Structure

```
BlotterPage
  └─ BlotterPageClient
      └─ Grouped by Date (BlotterDateGroup)
          ├─ Matched Groups (BlotterMatchedGroup)
          │   ├─ Primary Summary Row (collapsed)
          │   └─ Expanded Records (when clicked)
          │       ├─ DECISION (triage TRADE action)
          │       ├─ EXECUTION (trade ingestion entries)
          │       └─ RECONCILE (QUANTITY_CHANGE action)
          └─ Unmatched Entries (BlotterRecordRow)
              ├─ Unmatched trade entries
              └─ Unmatched triage actions
```

### Matched Group Display

#### Primary Summary Row (Collapsed)

- **Processed**: Most recent `createdAt` from all linked records
- **Event Date**: `actionDate` from trade ingestion (or triage if no trade)
- **Strategy**: Strategy key/label
- **Action**: Badge showing "TRADE"
- **Status**: "Matched (N trades)" badge
- **Reason**: `reasonCode` or `actionDetail`
- **Financials**: Aggregated `qtyChange` and `premiumChange` from all linked trades

#### Expanded Records (When Clicked)

Shows all linked records sorted by `createdAt` (newest first):

1. **DECISION** (if exists)
   - Badge: Purple (`bg-purple-50 text-purple-700`)
   - Source: `triage_action` with `actionDetail = 'TRADE'`
   - Condition: `actionDate` is future date (Trade Action created before trade)
   - Shows: `createdAt`, `actionDate`, strategy, ticker, trade details (asset class, quantity, underlying, expiry, strike, P/C), `tradeReason`, `tradeStage`, notes

2. **EXECUTION** (one or more)
   - Badge: Blue (`bg-blue-50 text-blue-700`)
   - Source: `trade_ingestion`
   - Shows: `createdAt`, `actionDate`, strategy, ticker, `qtyChange`, `premiumChange`, `tradeCount`

3. **RECONCILE** (if exists)
   - Badge: Amber (`bg-amber-50 text-amber-700`)
   - Source: `triage_action` with `actionDetail = 'TRADE'` and `reasonCode = 'QUANTITY_CHANGE'`
   - Condition: `actionDate` matches trade date (Trade Action created after trade)
   - Shows: `createdAt`, `actionDate`, strategy, ticker, trade details, `tradeReason`, `tradeStage`, notes

### Unmatched Entry Display

- **Unmatched Trade Entries**: Show with indicator that they need reconciliation
- **Unmatched Triage Actions**: Show with indicator that trade not yet ingested

### Sorting & Filtering

- **Sort by**: `createdAt`, `actionDate`, `strategyKey`, `actionClass`, `premiumChange`
- **Filter by**: `source`, `actionClass`, `status` (matched/unmatched/pending), `strategyKey`, `followUp`

### Grouping Options

- **By Date**: Default (groups by `actionDate`)
- **By Strategy**: Alternative view (groups by `strategyKey`)

### Triage Action Forms

#### TRADE Action Form

**Trigger**: User selects "TRADE" action from triage queue (position or strategy level)

**Data Source**: Loads positions from `positions` table via `/api/positions?strategyId={strategyId}`

**Form Behavior**:
- Position selection: User selects positions from strategy
- Default quantities: Negative (closing positions by default)
- All fields editable: Asset class, underlying, expiry, strike, P/C, quantity
- Creates Trade Actions with `actionDate = snapshotDate + 1 day` (intended for next day)

#### QUANTITY_CHANGE Action Form

**Trigger**: User selects "UPDATE" action from QUANTITY_CHANGE triage record

**Data Source**: 
- Fetches triage record via `/api/triage?id={triageId}`
- Extracts `unmatchedTradeExecutions` JSONB array
- Maps trade executions to positions by `conid`

**Form Behavior**:
- Position selection: Pre-populated from unmatched trade executions
- Default quantities: From executed trades (signed values, pre-filled)
- Some fields disabled: Asset class and underlying locked to trade execution data
- Quantities editable: User can adjust if needed
- Creates Trade Actions with `actionDate = snapshotDate` (matches trade date)

**Key Differences from TRADE Form**:
- Pre-populated with trade execution data (not position data)
- Quantities come from executed trades (not position quantities)
- Some fields disabled (asset class, underlying) - locked to trade execution
- Same UI structure, different data source and purpose

---

## Backend Behavior

### API Endpoints

#### 1. Trade Ingestion: `POST /api/ingest/flex/trades`

**Flow**:
1. Parse CSV, validate, normalize
2. Insert trades into `trades` table
3. For each unique `(accountId, tradeDate)`:
   - Auto-link trades to strategies
   - Compute strategy metrics
   - **Create trade blotter entries** (`computeTradeBlotterEntriesForDate`)
     - Aggregates trades by `(strategyId, conid, tradeDate)`
     - Attempts to match to pending Trade Actions
   - **Compute triage records** (`computeTriageForDate`)
     - Position-level flags (DTE, ITM, assignment risk)
     - Strategy-level flags
     - **Note**: QUANTITY_CHANGE records are NOT created here (they depend on matching results)
   - **Create QUANTITY_CHANGE triage records** (after matching completes, if unmatched trades exist)
     - Only runs after all matching attempts complete
     - Groups unmatched trades by strategy
     - Aggregates by position (conid)
     - Creates strategy-level QUANTITY_CHANGE triage record
     - **Stores full trade execution details in `unmatchedTradeExecutions` JSONB field**:
       - Includes `blotterId`, `blotterActionId`, `conid`, `ticker`, `actionDate`
       - Includes `qtyChange` (signed), `premiumChange`, `tradeIds`, `tradeCount`
       - Used by QUANTITY_CHANGE form to pre-populate position selection

**Error Handling**:
- Blotter creation failures don't fail ingestion (logged only)
- Triage computation failures don't fail ingestion (logged only)
- QUANTITY_CHANGE creation failures don't fail ingestion (logged only)

#### 2. Triage Action: `POST /api/triage/action`

**Flow**:
1. Validate `triageId` and `actionType`
2. Get triage record
3. **If `actionType = 'TRADE'` OR (`actionType = 'UPDATE'` AND `recommendedAction = 'QUANTITY_CHANGE'` AND `tradePositions` provided)**:
   - Validate `tradePositions` array (required, at least one position)
   - Validate `tradeReason` and `tradeStage` (required)
   - For each position in `tradePositions`:
     - Fetch `conid` from positions table (guaranteed to exist)
     - Determine `actionDate`:
       - If `reasonCode = 'QUANTITY_CHANGE'`: `actionDate = triage.snapshotDate` (matches trade date)
       - Otherwise: `actionDate = triage.snapshotDate + 1 day` (intended for next day's trades)
     - Create blotter entry with trade details
     - **For QUANTITY_CHANGE**: Creates Trade Actions (`actionClass = 'TRADE'`, `actionDetail = 'TRADE'`)
     - **For regular TRADE**: Creates Trade Actions (`actionClass = 'TRADE'`, `actionDetail = 'TRADE'`)
   - **Attempt matching** each Trade Action entry to existing trade entries
4. **For other action types**: Create single blotter entry (no matching)
5. Update triage record severity (if override set)

**Note**: QUANTITY_CHANGE uses `actionType = 'UPDATE'` but creates Trade Actions when `tradePositions` is provided, enabling matching with trade executions.

#### 3. Get Triage Record: `GET /api/triage?id={triageId}`

**Purpose**: Fetch triage record by ID, including `unmatchedTradeExecutions` JSONB field for QUANTITY_CHANGE records.

**Flow**:
1. Validate `id` parameter
2. Query `triage_records` table by ID
3. Return full triage record including `unmatchedTradeExecutions` field

**Used by**: QUANTITY_CHANGE form to load trade execution details for pre-populating position selection.

**Request Body for TRADE Action**:
```typescript
{
  triageId: string;
  actionType: 'TRADE' | 'UPDATE'; // UPDATE for QUANTITY_CHANGE, TRADE for other triage
  tradePositions: Array<{
    positionId: string; // Required - identifies position by ID
    quantity: number; // Required - user-edited quantity (signed, may differ from position quantity)
    // Note: Other fields (assetClass, underlying, expiry, strike, optionRight) 
    // are fetched from positions table based on positionId, not sent in request
  }>;
  tradeReason: string; // Required
  tradeStage: string; // Required: 'open' | 'close' | 'hedge' | 'roll' | 'reduce' | 'add'
  notes?: string; // Optional user notes (will be merged with trade details JSON)
}
```

**Note**: 
- The frontend should fetch position data (assetClass, underlying, expiry, strike, optionRight) from the positions table based on `positionId` and display it in the form
- Only `positionId` and user-edited `quantity` (signed) need to be sent to the backend
- Trade details are stored as JSON in the `notes` field for display
- `qtyChange` field stores absolute value of quantity for matching purposes
- **For QUANTITY_CHANGE**: `actionType = 'UPDATE'` but creates Trade Actions (`actionClass = 'TRADE'`, `actionDetail = 'TRADE'`) when `tradePositions` is provided

**Matching**:
- Only attempts if `actionType = 'TRADE'`
- Matches each Trade Action entry independently by `conid` + `actionDate` + `quantity`
- Quantity matching: Compares absolute values with tolerance of 0.01 units
- Direction/sign always comes from trade ingestion records (single source of truth)
- Uses `matchTriageActionToTradeBlotter` function

#### 3. Blotter Query: `GET /api/blotter` (via `getBlotterEntries`)

**Flow**:
1. Query `blotter_actions` with filters
2. Join with `strategies` for strategy metadata
3. Return flat list of entries
4. Frontend organizes into matched groups

**Filters**:
- `accountId`
- `source` (array)
- `actionClass` (array)
- `status` (matched/unmatched/pending)
- `strategyKey` (array)
- `followUp` (array)

### Database Queries

#### Get Blotter Entries

```typescript
SELECT 
  ba.id,
  ba.actionDate,
  ba.createdAt,
  ba.strategyId,
  s.strategyKey,
  ba.actionClass,
  ba.actionDetail,
  ba.reasonCode,
  ba.qtyChange,
  ba.premiumChange,
  ba.source,
  ba.tradeCount,
  ba.tradeIds,
  ba.conid,
  ba.linkedBlotterActionId,
  ba.linkedTradeBlotterIds,
  ba.ticker,
  -- ... other fields
FROM blotter_actions ba
LEFT JOIN strategies s ON ba.strategyId = s.id
WHERE {filters}
ORDER BY {sort} {direction}
```

#### Organize into Matched Groups (Frontend)

```typescript
function organizeEntries(entries: BlotterEntry[]): {
  matchedGroups: MatchedGroup[];
  unmatchedEntries: BlotterEntry[];
} {
  // 1. Build graph of linked entries
  const linkedMap = new Map<string, Set<string>>();
  
  for (const entry of entries) {
    if (entry.linkedBlotterActionId) {
      // Add bidirectional link
      if (!linkedMap.has(entry.id)) {
        linkedMap.set(entry.id, new Set());
      }
      linkedMap.get(entry.id)!.add(entry.linkedBlotterActionId);
      
      if (!linkedMap.has(entry.linkedBlotterActionId)) {
        linkedMap.set(entry.linkedBlotterActionId, new Set());
      }
      linkedMap.get(entry.linkedBlotterActionId)!.add(entry.id);
    }
    
    // Handle multi-link (QUANTITY_CHANGE with multiple trades)
    if (entry.linkedTradeBlotterIds) {
      const linkedIds = entry.linkedTradeBlotterIds as string[];
      for (const linkedId of linkedIds) {
        if (!linkedMap.has(entry.id)) {
          linkedMap.set(entry.id, new Set());
        }
        linkedMap.get(entry.id)!.add(linkedId);
      }
    }
  }
  
  // 2. Find connected components (matched groups)
  const visited = new Set<string>();
  const matchedGroups: MatchedGroup[] = [];
  
  for (const entry of entries) {
    if (visited.has(entry.id)) continue;
    
    // Find all connected entries (BFS)
    const component: BlotterEntry[] = [];
    const queue = [entry.id];
    visited.add(entry.id);
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentEntry = entries.find(e => e.id === currentId);
      if (currentEntry) {
        component.push(currentEntry);
      }
      
      const linked = linkedMap.get(currentId);
      if (linked) {
        for (const linkedId of linked) {
          if (!visited.has(linkedId)) {
            visited.add(linkedId);
            queue.push(linkedId);
          }
        }
      }
    }
    
    // If component has multiple entries, it's a matched group
    if (component.length > 1) {
      // Find triage action (source = 'triage_action')
      const triageAction = component.find(e => e.source === 'triage_action');
      if (triageAction) {
        const linkedTrades = component.filter(e => e.source === 'trade_ingestion');
        matchedGroups.push({ triageAction, linkedTrades });
      }
    }
  }
  
  // 3. Find unmatched entries
  const matchedIds = new Set(matchedGroups.flatMap(g => 
    [g.triageAction.id, ...g.linkedTrades.map(t => t.id)]
  ));
  const unmatchedEntries = entries.filter(e => !matchedIds.has(e.id));
  
  return { matchedGroups, unmatchedEntries };
}
```

---

## Edge Cases & Scenarios

### 1. Unlinked Trades (No strategyId)

**Scenario**: Trade ingested before strategy is created/confirmed

**Behavior**:
- Trade blotter entry created with `strategyId = null`
- `conid` still stored for later matching
- When strategy is linked/confirmed, `backfillTradeBlotterForStrategy` updates entries

**Frontend**: Shows as "Unlinked" in strategy column

### 2. Multiple Trades Same Contract Same Day

**Scenario**: Multiple trades for same `conid` on same date

**Behavior**:
- Aggregated into single blotter entry
- `tradeIds` contains all trade IDs
- `tradeCount` shows number of trades
- Net quantities and premiums summed

**Frontend**: Shows aggregated totals, `tradeCount` in expanded view

### 3. Strategy-Level QUANTITY_CHANGE with Multiple Positions

**Scenario**: Multiple positions have unmatched trades on same date for strategy

**Behavior**:
- One QUANTITY_CHANGE triage record (strategy-level)
- Multiple trade entries created (one per position/conid, aggregated)
- User creates Trade Action with multiple positions
- Creates multiple Trade Action blotter entries (one per position)
- Each Trade Action entry matches to corresponding trade entry independently

**Frontend**: Multiple matched groups (one per position), can be grouped by strategy in UI

### 4. Trade Action Created Before Trade Ingested

**Scenario**: User creates Trade Action from triage, trade not yet ingested

**Behavior**:
- Trade Action created with `actionDate = snapshotDate + 1` (intended for next day)
- `severityOverride = 'pending'`, `completed = false`
- No match found initially (trade not yet ingested)
- When trade ingested on next day, matching logic finds pending Trade Action
- Bidirectional link created
- Trade Action updated: `severityOverride = 'complete'`, `completed = true`

**Frontend**: Initially shows as "pending" (DECISION only), then becomes matched after ingestion (DECISION + EXECUTION)

### 5. Trade Ingested Before Trade Action Created

**Scenario**: Trade ingested, user hasn't created Trade Action yet

**Behavior**:
- Trade blotter entry created
- No matching pending Trade Action found
- QUANTITY_CHANGE triage record created (strategy-level, includes unmatched trades)
- User creates Trade Action from QUANTITY_CHANGE triage
- Trade Action created with `actionDate = snapshotDate` (matches trade date)
- Matching finds trade entry
- Bidirectional link created
- Trade Action updated: `severityOverride = 'complete'`, `completed = true`

**Frontend**: Initially shows as unmatched trade (EXECUTION only), then becomes matched after Trade Action created (EXECUTION + RECONCILE)

### 6. Merged Strategies

**Scenario**: Strategy merged into another strategy

**Behavior**:
- `fixMergedStrategyBlotterEntries` updates blotter entries
- Finds target strategy by matching `conid` and `actionDate` in trades
- Updates `strategyId` on blotter entries

**Frontend**: Shows under new strategy

### 7. Missing conid

**Scenario**: Trade or position missing `conid` (should not happen)

**Behavior**:
- `conid` is guaranteed to exist:
  - Trades: `conid` from broker data (required field)
  - Positions: `conid` in positions table (required field)
  - Trade Actions: `conid` fetched from positions table
- If `conid` is missing, log error and skip matching
- Entry remains unmatched

**Frontend**: Shows as unmatched with error indicator

### 8. First Day of Data

**Scenario**: No previous snapshot date exists

**Behavior**:
- Trades ingested → Trade blotter entries created
- No previous positions to compare
- Unmatched trades trigger QUANTITY_CHANGE triage records (strategy-level)
- User creates Trade Actions to reconcile

**Frontend**: Shows QUANTITY_CHANGE triage records for strategies with unmatched trades

---

## Open Questions & Iteration Points

### 1. Matching Precision

**Question**: Should we allow matching across dates (e.g., ±1 day)?

**Current**: Only matches exact `actionDate`

**Considerations**:
- Trades may be reported on different dates than execution
- Could reduce false matches but increase complexity

**RESOLVED**: Exact `actionDate` matches only. 
- Trade Actions (non-QUANTITY_CHANGE): `actionDate = triage.snapshotDate + 1` (intended for next day's trades)
- Trade Actions (QUANTITY_CHANGE): `actionDate = triage.snapshotDate` (matches trade date)
- Trade ingestion: `actionDate = tradeDate`

---

### 2. Unmatched Trade Handling

**Question**: Should unmatched trades automatically create QUANTITY_CHANGE triage records?

**Current**: QUANTITY_CHANGE only created from position comparison

**Considerations**:
- Trades without matching positions might need reconciliation
- Could create noise if trades are already matched to TRADE actions

**RESOLVED**: Unmatched trades are grouped by strategy and aggregated by position (conid). One strategy-level QUANTITY_CHANGE triage record created per strategy per date. User creates Trade Action to reconcile all unmatched trades.

---

### 3. QUANTITY_CHANGE Aggregation

**Question**: Should we aggregate QUANTITY_CHANGE records at strategy level or keep position-level?

**Current**: Both position-level and strategy-level records created

**Considerations**:
- Strategy-level reduces triage queue size
- Position-level provides more granular reconciliation
- Could show both in UI (strategy summary + position details)

**RESOLVED**: Strategy-level only. Reduces triage queue size. Each position's trades aggregated individually, then grouped together in the same QUANTITY_CHANGE triage record.

---

### 4. Matching Confidence

**Question**: Should we show matching confidence/quality in UI?

**Current**: Binary matched/unmatched

**Considerations**:
- `conid` match = high confidence
- `ticker` match = medium confidence
- Could help users identify potential false matches

**RESOLVED**: No matching confidence needed. `conid` is always present. Matching is by `conid` + `actionDate` + `quantity` (absolute values, tolerance 0.01). No ambiguity. Direction/sign comes from trade ingestion records.

---

### 5. Recompute Triggers

**Question**: When should we recompute blotter entries?

**Current Triggers**:
- After trade ingestion
- After strategy linking/confirmation
- After position linking
- After strategy merge
- Manual recompute endpoint

**Considerations**:
- Should we recompute on triage action creation?
- Should we recompute on position updates?
- Performance vs. data freshness tradeoff

**TODO**: The logical point for recomputing blotter entries (or atleast recomuting matches) is trades and position ingestion. These happen at roughly the same time so the key time to do it is when BOTH positions and trades have been ingested. I don't know if the current approach here is sufficient, given these ingestions also trigger other key processes like defining strategies. It may well be.

---

### 6. Blotter Entry Deletion

**Question**: Should we allow deletion of blotter entries?

**Current**: No deletion endpoint

**Considerations**:
- Might need to delete incorrect entries
- Should cascade to linked entries?
- Audit trail concerns

**TODO**: Not needed at present.

---

### 7. Historical Data Backfill

**Question**: How should we handle backfilling historical data?

**Current**: Manual recompute endpoints exist

**Considerations**:
- Should we auto-backfill when strategies are linked?
- Should we backfill on first ingestion?
- Performance implications

**TODO**: Not for now, but we should return to this when the matching process is completely resolved.

---

### 8. UI Grouping Preferences

**Question**: Should users be able to customize grouping (by date, strategy, status)?

**Current**: Grouped by date, can filter by strategy

**Considerations**:
- Different users may prefer different views
- Could add view preferences/settings

**TODO**: Grouping by date seems the priority given this allows inline display of matched records.

---

### 9. Action Labeling

**Question**: Are the current action labels (DECISION, EXECUTION, RECONCILE) clear?

**Current Labels**:
- DECISION: TRADE action from triage
- EXECUTION: Trade ingestion entry
- RECONCILE: QUANTITY_CHANGE action

**Considerations**:
- Could use different terminology
- Could add more labels (e.g., "PLANNED", "EXECUTED", "VERIFIED")

**TODO**: I like this labeling as it allows the user to see whether the action preceded (DECISION) or followed (RECONCILE) the trade.

---

### 10. Multi-Account Support

**Question**: How should we handle multiple accounts in blotter?

**Current**: Filters by primary account

**Considerations**:
- Should we show all accounts or filter by selected account?
- Should matched groups span accounts?
- Cross-account strategy matching?

**TODO**: Return to this later.

---

## Implementation Notes

### Code Locations

- **Trade Blotter Creation**: `src/lib/derived/blotter.ts` → `computeTradeBlotterEntriesForDate`
- **QUANTITY_CHANGE Triage Creation**: `src/lib/derived/blotter.ts` → `createQuantityChangeTriageForUnmatchedTrades`
  - Creates triage records with `unmatchedTradeExecutions` JSONB field
- **Matching Logic**: `src/lib/derived/blotter.ts` → `matchTradeBlotterToTriageAction`, `matchTriageActionToTradeBlotter`
- **Triage Computation**: `src/lib/derived/triage.ts` → `computeTriageForDate`, `computeQuantityChangeTriageForDate`
- **Triage Action API**: `src/app/api/triage/action/route.ts`
- **Triage Record API**: `src/app/api/triage/route.ts` → `GET /api/triage?id={triageId}`
- **Trade Ingestion API**: `src/app/api/ingest/flex/trades/route.ts`
- **Blotter Query**: `src/db/queries/blotter.ts` → `getBlotterEntries`
- **Frontend Components**: 
  - `src/components/blotter/BlotterMatchedGroup.tsx`
  - `src/components/blotter/BlotterDateGroup.tsx`
  - `src/app/blotter/BlotterPageClient.tsx`
  - `src/components/triage/TriageActionButtons.tsx` → QUANTITY_CHANGE form with position selection

### Database Schema

Key tables:
- `blotter_actions`: All blotter entries (both sources)
- `trades`: Individual trade records
- `triage_records`: Triage queue records
- `positions`: Position snapshots
- `strategies`: Strategy definitions

Key fields in `blotter_actions`:
- `source`: `'triage_action'` | `'trade_ingestion'`
- `actionDetail`: `'TRADE'` for Trade Actions, `'TRADE_INGESTED'` for trade entries
- `linkedBlotterActionId`: Primary link (one-to-one)
- `linkedTradeBlotterIds`: Multi-link (one-to-many, JSONB array) - not used in simplified model
- `conid`: Primary matching key (required, fetched from positions table)
- `tradeIds`: Array of trade IDs (for trade entries)
- `tradeCount`: Number of trades aggregated (for trade entries)
- **Trade Action fields**:
  - `qtyChange`: Absolute value of quantity (for matching)
  - `tradeReason`: Reason for trade
  - `tradeStage`: Stage of trade (open, close, hedge, roll, reduce, add)
  - `notes`: JSON string containing:
    - `text`: User-provided notes (if any)
    - `tradeDetails`: Object with:
      - `assetClass`: Asset class (OPT, STK, etc.) - from positions table
      - `quantity`: Signed quantity (user-edited) - from user input
      - `underlying`: Underlying symbol - from positions table (for STK, use position.symbol)
      - `expiry`: Expiry date (for options) - from positions table
      - `strike`: Strike price (for options) - from positions table
      - `optionRight`: PUT or CALL (for options) - from positions table

Key fields in `triage_records`:
- `unmatchedTradeExecutions`: JSONB array (for QUANTITY_CHANGE records only)
  - Contains full details of unmatched trade executions:
    - `blotterId`: Blotter entry ID
    - `blotterActionId`: Blotter action UUID
    - `conid`: Contract ID for matching
    - `ticker`: Position ticker/symbol
    - `actionDate`: Trade date
    - `qtyChange`: Net quantity (signed, from trade execution)
    - `premiumChange`: Net premium
    - `tradeIds`: Array of trade IDs
    - `tradeCount`: Number of trades aggregated
  - Used by QUANTITY_CHANGE form to pre-populate position selection
  - Enables matching when user creates Trade Action

---

## Revision History

- **2025-01-XX**: Initial draft for review and iteration
- **2025-01-XX**: Simplified model - unified Trade Action concept, conid-only matching, strategy-level QUANTITY_CHANGE

---

**Next Steps**: Review this document and add comments/feedback in the "Open Questions & Iteration Points" section. We'll iterate on the design based on your input.
