# IBKR Priority Data Strategy

## Overview

**Strategy**: Always populate IBKR data when available, even if other sources already have data for that date. When reading data, prioritize IBKR first, then fall back to other sources.

## Why This Approach?

1. **IBKR is most robust** - Direct from broker, most accurate
2. **GitHub Actions runs first** - Massive/Yahoo populate automatically at 4:30 PM ET
3. **User syncs IBKR later** - When they open the app, IBKR data becomes available
4. **Automatic priority** - System always uses IBKR when available, falls back otherwise

## Data Flow

### Writing (Multiple Sources)

```
GitHub Actions (4:30 PM ET)
  ↓
Massive/Yahoo data → source='massive' / 'yahoo_finance'
  ↓
User opens app (later)
  ↓
IBKR sync → source='ibkr' (even if Massive already has that date)
  ↓
Database: Multiple sources for same date
```

### Reading (Priority Selection)

```
Query for date
  ↓
Get all sources for that date
  ↓
Priority: IBKR > Massive > Option Strategist > Yahoo > Manual
  ↓
Return highest priority with data
```

## Implementation

### Missing Data Detection

- **Checks for IBKR gaps** - Finds dates where IBKR is missing (even if other sources have it)
- **Backfills IBKR** - Can fetch IBKR data for dates that already have Massive/Yahoo data
- **Shows coverage** - Banner displays IBKR coverage percentage

### Data Reading

- **Triage calculations** - Uses `getIvDataBatchWithPriority()` to get IBKR-first data
- **Strategy entry context** - Uses priority when looking up entry IV30
- **Automatic fallback** - If IBKR missing, uses Massive/Yahoo automatically

## Benefits

✅ **IBKR always preferred** - Most accurate data used when available  
✅ **No data loss** - All sources preserved in database  
✅ **Automatic fallback** - System handles priority transparently  
✅ **Robust redundancy** - If IBKR fails, Massive/Yahoo still work  
✅ **User-friendly** - Just sync IBKR when you open app, system handles the rest  

## Example Scenario

**Day 1 (4:30 PM ET):**
- GitHub Actions runs → Massive data written (`source='massive'`)
- Database: `SPY 2025-12-17 massive 676.05 0.15`

**Day 1 (6:00 PM ET):**
- User opens app → Syncs IBKR → IBKR data written (`source='ibkr'`)
- Database: 
  - `SPY 2025-12-17 massive 676.05 0.15`
  - `SPY 2025-12-17 ibkr 676.03 0.15` ← **This is used**

**Day 2:**
- Triage calculation queries for `2025-12-17`
- System finds both sources
- **Returns IBKR data** (higher priority)
- Falls back to Massive if IBKR missing

## Coverage Metrics

The banner shows:
- **IBKR coverage %** - Percentage of dates that have IBKR data
- **Missing IBKR days** - Dates where IBKR is missing (even if other sources have it)
- **All sources** - Shows coverage from all sources for reference

## Code Changes

### Updated Files

1. **`src/lib/services/ibkr/missing-data.ts`**
   - Now checks for IBKR-specific gaps (not just any source)
   - Finds dates where IBKR is missing even if Massive/Yahoo have it

2. **`src/lib/derived/triage.ts`**
   - Uses `getIvDataBatchWithPriority()` for automatic IBKR-first selection

3. **`src/lib/services/strategies.ts`**
   - Uses priority-based fetching for entry IV30 lookup

4. **`src/components/ibkr/DataSyncBanner.tsx`**
   - Shows IBKR-specific status and coverage

## Query Pattern

**Before (no priority):**
```typescript
// Could return Massive or IBKR (unpredictable)
const data = await db.select().from(underlyingsIvHistory)
  .where(eq(underlyingsIvHistory.asOfDate, date));
```

**After (with priority):**
```typescript
// Always returns IBKR if available, falls back to Massive
const data = await getIvDataBatchWithPriority(underlyingIds, date);
// Returns: Map<underlyingId, { spot, iv30, source }>
// source will be 'ibkr' if available, 'massive' if not
```

## Migration Notes

- **No breaking changes** - Existing data remains
- **Gradual migration** - IBKR data added over time as users sync
- **Backward compatible** - If IBKR missing, falls back to existing sources
- **No data duplication** - Unique constraint prevents true duplicates (different sources)

## Best Practices

1. **Let GitHub Actions run** - Keeps Massive/Yahoo data as fallback
2. **Sync IBKR when using app** - Adds IBKR data for better accuracy
3. **Monitor coverage** - Banner shows IBKR coverage percentage
4. **Trust the system** - Priority selection happens automatically

