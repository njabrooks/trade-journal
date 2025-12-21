# Blotter UI/UX Improvements - Analysis & Recommendations

## Current State Analysis

### Primary Row Display
- **Processed**: Most recent processed timestamp
- **Event Date**: Action date
- **Strategy**: Strategy key (link to strategy page)
- **Action**: Always shows "TRADE" badge
- **Status**: "Matched" with count of linked trades
- **Reason**: reasonCode or actionDetail
- **Financials**: Aggregated qtyChange and premiumChange

### Secondary Row Display (Expanded)
- Shows individual records: DECISION, RECONCILE, or EXECUTION
- Each row shows: processed time, event date, strategy, action badge, ticker, status, reason, financials
- Limited trade detail information

### Available Data Fields

#### BlotterEntry Interface
- Basic: `id`, `actionDate`, `createdAt`, `strategyId`, `strategyKey`, `ticker`, `conid`
- Action: `actionClass`, `actionDetail`, `reasonCode`, `legScope`
- Financials: `qtyChange`, `premiumChange`, `realizedPnl`
- Trade Info: `tradeIds` (array), `tradeCount`, `source`
- Linking: `linkedBlotterActionId`, `linkedTradeBlotterIds`, `linkedTradeEntries`
- Metadata: `notes`, `linkedNotes`, `linkedTradeReason`, `linkedTradeStage`
- Follow-up: `followUpRequired`, `followUpDate`, `completed`

#### Trade Details (from trades table - need to fetch)
- `symbol`, `conid`, `side` (BUY/SELL), `quantity`, `price`
- `grossAmount`, `netAmount`, `fees` (commissions)
- `assetClass`, `exchange`, `orderType`, `currency`
- `tradeDate`, `brokerTransactionId`, `brokerExecId`

#### Position Details (from positions table - need to fetch via conid)
- `symbol`, `conid`, `assetClass`
- `expiry`, `strike`, `optionRight` (for options)
- `quantity`, `absNotional`, `unrealizedPnl`

## User Requirements

### 1. Strategy Column
- **Primary Row**: Show strategy key
- **Secondary Rows**: Show positions (ticker/symbol) that were associated with each decision/execution/reconciliation
  - If multiple positions in one secondary row, show one per line
  - Use position details from linked trades or positions table

### 2. Action Column
- **Primary Row**: Show "TRADE" (current behavior is fine)
- **Secondary Rows**: 
  - **DECISION**: When triage action (actionDetail='TRADE') was created before trade execution
  - **RECONCILE**: When triage action (reasonCode='QUANTITY_CHANGE') was created after trade execution
  - **EXECUTION**: Trade ingestion records (source='trade_ingestion')

### 3. Trade Execution Details
Need to display comprehensive trade information:
- Quantity (signed, with BUY/SELL indicator)
- Tickers/symbols traded
- Market value (grossAmount or calculated from price × quantity)
- Commissions/fees
- Net amount
- Asset class, exchange, order type
- Individual trade breakdown when multiple trades aggregated

### 4. Triage Action Details
For DECISION and RECONCILE actions:
- Notes captured (from `notes` field, may be JSON)
- Trade/position details that were captured
- Trade reason and stage (for RECONCILE)

## Proposed Improvements

### Option 1: Enhanced Expandable Details (Recommended)
**Primary Row**: Keep current summary, but improve action badge logic
**Secondary Rows**: 
- Show position tickers in Strategy column
- Show DECISION/RECONCILE/EXECUTION badges correctly
- Add expandable detail sections for:
  - Trade execution details (quantity, price, fees, commissions, etc.)
  - Notes and context
  - Position details (expiry, strike, option right for options)

### Option 2: Inline Detail Cards
**Primary Row**: Same as Option 1
**Secondary Rows**: 
- Compact view with key info
- Click to expand inline detail card showing:
  - Full trade breakdown table
  - Notes section
  - Position details

### Option 3: Modal/Sheet Details
**Primary Row**: Same as Option 1
**Secondary Rows**: Compact view
**Details**: Click opens modal/sheet with comprehensive details

## Implementation Plan

### Phase 1: Data Enhancement
1. Enhance `getBlotterEntries` query to fetch:
   - Individual trade records via `tradeIds`
   - Position details via `conid` lookup
   - Parse notes JSON if needed

2. Extend `BlotterEntry` interface with:
   - `tradeDetails`: Array of full trade records
   - `positionDetails`: Position information
   - `parsedNotes`: Parsed notes object

### Phase 2: Display Logic
1. Update `BlotterMatchedGroup`:
   - Fix action badge logic (DECISION vs RECONCILE)
   - Show positions in Strategy column for secondary rows
   - Add trade details expansion

2. Create `TradeDetailsCard` component:
   - Display individual trades in table format
   - Show: symbol, side, quantity, price, gross, net, fees
   - Group by position if multiple trades

3. Create `PositionDetailsCard` component:
   - Show position information
   - For options: expiry, strike, put/call
   - For stocks: just symbol

### Phase 3: UX Polish
1. Improve visual hierarchy
2. Add tooltips for abbreviations
3. Better formatting for financials
4. Color coding for trade sides (BUY/SELL)

## Specific Code Changes Needed

### 1. Query Enhancement (`src/db/queries/blotter.ts`)
- Add function to fetch trade details by tradeIds
- Add function to fetch position details by conid
- Parse notes JSON in query layer

### 2. Component Updates
- `BlotterMatchedGroup.tsx`: Fix action logic, add position display
- `BlotterRecordRow.tsx`: Enhance detail expansion
- New: `TradeDetailsCard.tsx`
- New: `PositionDetailsCard.tsx`

### 3. Type Updates
- Extend `BlotterEntry` interface
- Add `TradeDetail` interface
- Add `PositionDetail` interface

