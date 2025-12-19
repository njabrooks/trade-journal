# IBKR Multi-Source Data Strategy

## Overview

The system uses **multiple parallel data sources** with priority/fallback to ensure robust data coverage:

1. **IBKR** (Primary) - On-demand, daily data via gateway
2. **Massive** (Fallback) - Automated via GitHub Actions
3. **Option Strategist** (Fallback) - Weekly data
4. **Yahoo Finance** (Fallback) - Spot prices only
5. **Manual** (Fallback) - User-entered

## Architecture

```
┌─────────────────┐
│  IBKR Gateway   │  ← On-demand (user-triggered)
│  (Primary)      │  ← Daily data, most accurate
└────────┬────────┘
         │
         │ Parallel
         │
┌────────▼────────┐
│  GitHub Actions │  ← Automated (4:30 PM ET daily)
│  - Massive.com  │  ← Fallback data source
│  - Yahoo Finance│
└────────┬────────┘
         │
         │ Both write to same table
         │
┌────────▼────────┐
│ underlyings_   │
│ iv_history     │  ← Unique: (ticker, asOfDate, source)
└────────┬────────┘
         │
         │ Priority selection
         │
┌────────▼────────┐
│  App Queries    │  ← Uses highest priority source
│  (Triage, etc.) │
└─────────────────┘
```

## Source Priority

When multiple sources have data for the same date, the system prioritizes:

1. **IBKR** - Most accurate, daily, real-time during market hours
2. **Massive** - Automated, reliable, daily
3. **Option Strategist** - Weekly, less frequent
4. **Yahoo Finance** - Spot prices only, no IV
5. **Manual** - User-entered, least automated

## Data Storage

The `underlyings_iv_history` table has a unique constraint:
- `(ticker, asOfDate, source)` - allows multiple sources per date

**Example:**
```
ticker | asOfDate  | source      | spot  | iv30
--------|-----------|-------------|-------|------
SPY     | 2025-12-17| ibkr        | 676.03| 0.15
SPY     | 2025-12-17| massive     | 676.05| 0.15
SPY     | 2025-12-17| opt_strat   | 676.00| 0.14
```

When querying, the system picks IBKR (highest priority).

## Missing Data Detection

The system detects **true gaps** - dates where NO source has data:

- Checks all sources for each date
- Only marks as "missing" if ALL sources are missing that date
- This ensures we don't duplicate fetch if one source already has it

## Benefits

✅ **Redundancy** - If IBKR fails, Massive provides fallback  
✅ **Data Quality** - Multiple sources validate each other  
✅ **Coverage** - Different sources may have different tickers  
✅ **Reliability** - No single point of failure  
✅ **Flexibility** - Can prioritize based on accuracy/availability  

## Data Flow

### IBKR (On-Demand)
1. User opens app
2. Banner checks for missing data
3. User clicks "Sync Missing Data"
4. Fetches from IBKR gateway
5. Writes with `source='ibkr'`

### GitHub Actions (Automated)
1. Runs daily at 4:30 PM ET
2. Fetches from Massive.com API
3. Writes with `source='massive'`
4. Also uses Yahoo Finance for spot prices (`source='yahoo_finance'`)

### Data Reading (Priority Selection)
1. Query `underlyings_iv_history` for date
2. Get all records from all sources
3. Sort by source priority
4. Return highest priority record with data

## Implementation

### Reading Data with Priority

```typescript
import { getIvDataBatchWithPriority } from '@/lib/services/ibkr/data-priority';

// Get data for multiple underlyings with automatic priority
const data = await getIvDataBatchWithPriority(underlyingIds, snapshotDate);
// Returns: Map<underlyingId, { spot, iv30, source }>
// Automatically picks IBKR > Massive > Option Strategist > etc.
```

### Current Triage Code

The triage code currently queries all sources but doesn't prioritize. This is fine because:
- Multiple sources for same date are stored separately
- The priority function can be integrated later
- For now, if duplicates exist, the query returns all, but we can filter client-side

**Future Enhancement**: Update triage code to use `getIvDataBatchWithPriority()` for automatic source selection.

## Monitoring

The sync banner shows:
- **Source coverage** - Which sources have data and how much
- **Missing days** - Gaps where NO source has data
- **Sync option** - Fetch missing data from IBKR

## Configuration

Source priority is defined in `src/lib/services/ibkr/data-priority.ts`:

```typescript
const SOURCE_PRIORITY = ['ibkr', 'massive', 'opt_strat', 'yahoo_finance', 'manual'];
```

To change priority, reorder this array.

## Best Practices

1. **Let both run** - IBKR on-demand + GitHub Actions automated
2. **Check coverage** - Banner shows which sources are active
3. **Sync when needed** - Use IBKR sync for immediate updates
4. **Trust priority** - System automatically picks best source
5. **Monitor gaps** - Banner alerts when data is missing from ALL sources

## Example Scenarios

### Scenario 1: Normal Operation
- GitHub Actions runs daily → Massive data available
- User opens app → IBKR syncs latest day
- Result: Both sources have data, IBKR prioritized

### Scenario 2: IBKR Gateway Down
- GitHub Actions runs → Massive data available
- User opens app → IBKR sync fails
- Result: Massive data used as fallback

### Scenario 3: GitHub Actions Failed
- IBKR sync works → IBKR data available
- GitHub Actions didn't run → No Massive data
- Result: IBKR data used (no fallback needed)

### Scenario 4: Both Failed
- IBKR sync fails → No IBKR data
- GitHub Actions failed → No Massive data
- Result: Banner shows "Missing data", user can retry

## Migration Notes

- Existing Massive data remains in database
- IBKR data is added alongside (same dates, different source)
- No data loss - both sources coexist
- Priority selection happens at read time
- Can disable GitHub Actions if desired (IBKR becomes primary)

