# CONID Population & Triage Data Usage

## Why Some Underlyings Don't Have CONID

### Current State
Some underlying records may not have CONID because:

1. **Created before CONID extraction was added** - Underlyings created before we added CONID extraction logic won't have it
2. **No trades with UnderlyingConid** - If there are no trades in the database for that ticker, or the trades don't have `UnderlyingConid` in `rawRow`, CONID can't be extracted
3. **Trades exist but CONID missing** - Some trades might not have `UnderlyingConid` in their raw data

### Automatic Backfill
**Yes, CONIDs are automatically backfilled during IBKR sync:**

The `getTickersWithFirstTradeDate()` function in `src/lib/services/ibkr/missing-data.ts` (lines 103-131) does two things:
1. Extracts CONID from trades for each ticker
2. **Updates existing underlying records** if they don't have CONID but we found one in trades

```typescript
// From missing-data.ts lines 116-123
if (underlyingRecord.length > 0) {
  // Update CONID if we have one and the record doesn't
  if (data.conid && !underlyingRecord[0]!.conid) {
    await db
      .update(underlyings)
      .set({ conid: data.conid, updatedAt: new Date() })
      .where(eq(underlyings.id, underlyingRecord[0]!.id));
  }
}
```

**So you don't need to manually add CONIDs** - they'll be populated automatically when:
- You run the IBKR sync (which calls `getTickersWithFirstTradeDate()`)
- The sync finds trades with `UnderlyingConid` for those tickers

### Manual Backfill (If Needed)
If you want to manually backfill CONIDs for underlyings that don't have trades yet, you can:
1. Use the IBKR contract search API to find CONIDs
2. Update the `underlyings` table directly

But this is usually unnecessary since the sync process handles it automatically.

---

## Automatic CONID Population for New Underlyings

### Yes, CONIDs are automatically populated when new underlyings are created

The `ensureUnderlyingId()` function in `src/lib/ingestion/flex/underlyings.ts` (lines 53-89) extracts CONID from trades **before creating** a new underlying record:

```typescript
// Before creating, try to extract CONID from trades if available
let conidFromTrades: number | null = null;
try {
  const tradeWithConid = await db
    .select({ rawRow: trades.rawRow })
    .from(trades)
    .where(
      and(
        isNotNull(trades.rawRow),
        sql`${trades.rawRow}::jsonb->>'UnderlyingSymbol' = ${normalizedTicker}`
      )
    )
    .limit(1);

  if (tradeWithConid.length > 0 && tradeWithConid[0]!.rawRow) {
    const rawRow = tradeWithConid[0]!.rawRow as Record<string, unknown>;
    const underlyingConid = rawRow['UnderlyingConid'];
    // ... parse and set conidFromTrades
  }
} catch (error) {
  // Continue without CONID if extraction fails
}

// Create new underlying with CONID if we found it
await db.insert(underlyings).values({
  ticker: normalizedTicker,
  conid: conidFromTrades,  // <-- CONID included if found
  // ...
});
```

**So new underlyings will automatically have CONID if:**
- There are trades in the database for that ticker
- Those trades have `UnderlyingConid` in their `rawRow`

---

## App Process for Creating Underlying Records

### Trigger Points

Underlying records are created/ensured in these scenarios:

#### 1. **Flex Positions Ingestion** (Primary)
**File**: `src/lib/ingestion/flex/positions.ts`
**Function**: `normalizeFlexPositionRow()` (line 198)

```typescript
const underlyingId = await ensureUnderlyingId(
  underlyingTicker,
  assetClass,
  currencyPrimary,
  description
);
```

**When**: During Flex positions CSV ingestion
- Extracts `UnderlyingSymbol` from position row
- Calls `ensureUnderlyingId()` to find or create underlying
- CONID is extracted from trades if available

#### 2. **Flex Trades Ingestion** (Indirect)
**File**: `src/lib/ingestion/flex/trades.ts`
- Trades are stored with `rawRow` containing `UnderlyingSymbol` and `UnderlyingConid`
- Underlyings are created when positions reference them (see #1)

#### 3. **Strategy Creation** (Manual)
**File**: `src/lib/services/strategies.ts`
**Function**: `createStrategy()` (line 140)

```typescript
const underlyingId = await resolveUnderlyingId(input.underlyingId, input.underlyingTicker);
```

**When**: User creates a strategy manually
- Resolves underlying by ID or ticker
- May create underlying if it doesn't exist

#### 4. **Auto Strategy Derivation**
**File**: `src/lib/derived/strategyAuto.ts`
**Function**: `findOrCreateStrategyFromTrade()` (line 293)

```typescript
const underlyingId = await ensureUnderlyingId(ticker, null, trade.assetClass);
```

**When**: Auto-deriving strategies from trades
- Extracts ticker from trade symbol
- Ensures underlying exists

### Data Flow

```
Flex CSV Ingestion
  ↓
Positions/Trades Processing
  ↓
normalizeFlexPositionRow() / normalizeFlexTradeRow()
  ↓
ensureUnderlyingId(ticker, ...)
  ↓
1. Check if underlying exists
2. If not, search trades for CONID
3. Create underlying with CONID (if found)
  ↓
Underlying Record Created/Updated
```

### Fields Populated

When creating an underlying:
- **ticker**: From `UnderlyingSymbol` in Flex data
- **conid**: Extracted from `UnderlyingConid` in trades `rawRow` (if available)
- **assetClass**: From position/trade data
- **baseCurrency**: From position data
- **name**: From position description

---

## How Triage Utilizes `getIvDataBatchWithPriority`

### Overview

Triage uses `getIvDataBatchWithPriority()` to fetch IV and spot data for all underlyings in a single batch query, with source priority logic.

### Code Location

**File**: `src/lib/derived/triage.ts`
**Function**: `computePositionTriageForDate()` (lines 194-200)

```typescript
// Batch fetch IV data for all underlyingIds to avoid N+1 queries
const underlyingIds = Array.from(
  new Set(
    optionPositions
      .map((p) => p.underlyingId)
      .filter((id): id is string => Boolean(id))
  )
);

const ivDataMap = new Map<string, string | null>();
const underlyingSpotMap = new Map<string, string | null>();
if (underlyingIds.length > 0) {
  // Use priority-based data fetching: IBKR > Massive > Option Strategist > Yahoo > Manual
  const { getIvDataBatchWithPriority } = await import('@/lib/services/ibkr/data-priority');
  const priorityData = await getIvDataBatchWithPriority(underlyingIds, snapshotDate);

  for (const [underlyingId, data] of priorityData.entries()) {
    ivDataMap.set(underlyingId, data.iv30);
    underlyingSpotMap.set(underlyingId, data.spot);
  }
}
```

### Process Flow

1. **Collect Underlying IDs**
   - Extracts all unique `underlyingId` values from option positions
   - Filters out null/undefined values

2. **Batch Fetch with Priority**
   - Calls `getIvDataBatchWithPriority(underlyingIds, snapshotDate)`
   - Returns a `Map<underlyingId, { spot, iv30, source }>`

3. **Store in Maps**
   - `ivDataMap`: Maps underlyingId → IV30 value
   - `underlyingSpotMap`: Maps underlyingId → spot price

4. **Use in Triage Calculations**
   - **ITM Calculation** (line 214-224): Uses `underlyingSpotMap` to determine if option is ITM
   - **Sigma Calculation** (line 238-246): Uses `underlyingSpotMap` and `ivDataMap` for sigma-to-strike
   - **Assignment Risk** (line 260-273): Uses spot data for ITM checks

### Source Priority Logic

**File**: `src/lib/services/ibkr/data-priority.ts`

#### Spot Price Priority
1. **IBKR** (primary) - Historical spot from IBKR API
2. **Massive** (fallback)
3. Yahoo Finance
4. Option Strategist
5. Manual

#### IV30 Priority
1. **Massive** (only source for historical IV)
2. Option Strategist
3. Manual

**Note**: IBKR is not used for IV because we only use Massive for historical IV data. IBKR provides current IV via snapshot API, but we use Massive for historical IV.

### Why Batch Fetching?

**Performance**: Instead of making N queries (one per underlying), we make a single query that fetches all underlying data at once. This is critical for triage calculations which may process hundreds of positions.

### Example Usage in Triage

```typescript
// Get underlying spot for ITM calculation
const underlyingSpot = position.underlyingId 
  ? underlyingSpotMap.get(position.underlyingId) ?? null 
  : null;

// Use underlying spot for ITM calculation (not option mark price)
const spotForItm = position.assetClass === 'OPT' 
  ? underlyingSpot  // For options, only use underlying spot
  : (underlyingSpot ?? position.spot);  // For stocks, prefer underlying spot

const isItm = computeIsItm(position.optionRight, spotForItm, position.strike);

// Get IV for sigma calculation
const iv30 = position.underlyingId ? ivDataMap.get(position.underlyingId) ?? null : null;

const sigmaToStrike = computeSigmaToStrike(
  spotForSigma,
  position.strike,
  iv30,
  dte
);
```

### Key Points

1. **Batch Processing**: All underlyings fetched in one query
2. **Source Priority**: IBKR spot prioritized, Massive IV prioritized
3. **Fallback Logic**: If IBKR spot not available, falls back to Massive
4. **Options vs Stocks**: For options, MUST use underlying spot (not option mark price)
5. **Data Validation**: Checks for required spot data before creating ITM/sigma flags

---

## Summary

### CONID Population
- ✅ **Automatic for new underlyings**: Extracted from trades during creation
- ✅ **Automatic backfill for existing**: Updated during IBKR sync if trades have CONID
- ⚠️ **Manual only if**: No trades exist for that ticker (rare)

### Underlying Creation Process
- **Primary trigger**: Flex positions ingestion
- **Function**: `ensureUnderlyingId()` in `src/lib/ingestion/flex/underlyings.ts`
- **CONID extraction**: Automatic from trades `rawRow` if available
- **Also triggered by**: Strategy creation, auto-strategy derivation

### Triage Data Usage
- **Batch fetching**: All underlyings fetched in one query
- **Priority**: IBKR spot first, Massive IV first
- **Usage**: ITM calculation, sigma calculation, assignment risk
- **Performance**: Critical for processing hundreds of positions efficiently

