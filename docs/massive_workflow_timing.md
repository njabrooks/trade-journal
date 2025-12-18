# Massive.com Workflow Timing & Integration

## Current Schedule

### Massive Ingestion
- **Time**: 4:30 PM ET (8:30 PM UTC during DST)
- **Frequency**: Daily
- **Purpose**: Fetch EOD spot prices and IV30 for all active underlyings

### Flex Ingestion  
- **Time**: Every 6 hours (12 AM, 6 AM, 12 PM, 6 PM ET)
- **Frequency**: 4x per day
- **Purpose**: Fetch positions and trades from IBKR

## Timing Rationale

### Why 4:30 PM ET for Massive?

1. **Data Availability**:
   - Market closes at 4:00 PM ET
   - Daily Market Summary finalized by ~4:15 PM ET
   - Options chain snapshot finalized by ~4:20 PM ET
   - **4:30 PM ET is safe** - data is definitely available

2. **Integration with Flex**:
   - Flex runs at 6:00 PM ET (next run after market close)
   - Massive at 4:30 PM ensures IV data is available **before** Flex runs
   - State codes computed during Flex ingestion will have latest IV data
   - Triage computed after Flex will have complete data

3. **Earlier is Better**:
   - Faster data availability
   - More time for any retries if needed
   - Ensures data is ready for evening Flex run

## Data Flow & Dependencies

```
4:30 PM ET: Massive Ingestion
  ↓
  Stores: underlyings_iv_history (spot, iv30)
  ↓
6:00 PM ET: Flex Ingestion (next scheduled run)
  ↓
  Ingests: positions, trades
  ↓
  Auto-triggers: Strategy Metrics Computation
    ↓
    Computes: State Codes (uses underlyings_iv_history.iv30)
    ↓
    Stores: strategy_metrics_snapshots (with state_code)
    ↓
  Auto-triggers: Triage Computation
    ↓
    Detects: STATE_CODE_CHANGE (reads stored state codes)
    ↓
    Creates: Triage records
```

## Manual Trigger Behavior

**Question**: Will manual trigger fetch all underlyings?

**Answer**: **Yes** - if no tickers specified, it fetches all active underlyings:

```typescript
// From scripts/ingest-underlyings-massive.ts
if (tickers && tickers.length > 0) {
  tickersToProcess = tickers.map(t => t.trim().toUpperCase());
} else {
  // Get all active underlyings
  const underlyingsList = await db
    .select({ ticker: underlyings.ticker })
    .from(underlyings)
    .where(eq(underlyings.isActive, true));
  
  tickersToProcess = underlyingsList.map(u => u.ticker);
}
```

**To fetch specific tickers**:
```bash
npx tsx scripts/ingest-underlyings-massive.ts 2025-12-18 TSLA AAPL
```

## State Code Recompute After Massive Ingestion

### Current Behavior

**State codes are NOT automatically recomputed after Massive ingestion**

**Why?**
- State codes are computed during **strategy metrics computation**
- Strategy metrics are computed **after Flex ingestion** (not after Massive)
- Massive ingestion only updates `underlyings_iv_history` table

### When State Codes Are Computed

1. **After Flex Ingestion** (automatic):
   - Flex runs → ingests positions
   - Auto-triggers strategy metrics computation
   - Strategy metrics computation includes state code computation
   - Uses latest IV data from `underlyings_iv_history`

2. **After Strategy Confirmation** (automatic):
   - Backfills all historical state codes
   - Uses IV data for each historical date

3. **Manual Recompute** (via API):
   - `/api/recompute/strategy-metrics?snapshotDate=2025-12-18`
   - Recomputes state codes for that date

### Do You Need to Recompute?

**For same-day ingestion**: **No** - if Massive runs at 4:30 PM and Flex runs at 6:00 PM, state codes will be computed with latest IV data automatically.

**For backfill**: **Yes** - if you backfill historical IV data, you should recompute state codes for those dates:

```bash
# After backfilling IV data for date range
curl -X POST /api/recompute/strategy-metrics \
  -d '{"startDate": "2025-12-01", "endDate": "2025-12-18"}'
```

## Recommended Workflow

### Daily Automated Flow

1. **4:30 PM ET**: Massive ingestion runs
   - Fetches spot and IV30 for all underlyings
   - Stores in `underlyings_iv_history`

2. **6:00 PM ET**: Flex ingestion runs (next scheduled)
   - Ingests positions and trades
   - Auto-triggers strategy metrics computation
   - State codes computed using latest IV data (from 4:30 PM run)
   - Auto-triggers triage computation
   - STATE_CODE_CHANGE detected if state codes changed

### Manual Backfill Flow

1. **Backfill IV data**:
   ```bash
   npx tsx scripts/ingest-underlyings-massive.ts 2025-12-01 TSLA AAPL
   npx tsx scripts/ingest-underlyings-massive.ts 2025-12-02 TSLA AAPL
   # ... etc
   ```

2. **Recompute state codes** (after backfill):
   ```bash
   curl -X POST /api/recompute/strategy-metrics \
     -d '{"startDate": "2025-12-01", "endDate": "2025-12-18"}'
   ```

3. **Recompute triage** (optional, to refresh STATE_CODE_CHANGE records):
   ```bash
   curl -X POST /api/recompute/triage \
     -d '{"startDate": "2025-12-01", "endDate": "2025-12-18"}'
   ```

## Future Enhancement: Auto-Recompute After Massive

**Could add**: Automatic state code recompute after Massive ingestion

**Implementation**:
```typescript
// After Massive ingestion completes
const affectedDates = [targetDate]; // Or date range if backfilling
await recomputeStrategyMetricsForDates(affectedDates);
```

**Considerations**:
- Only needed if Massive runs AFTER Flex for the day
- Current schedule (4:30 PM Massive, 6:00 PM Flex) doesn't need this
- Could be useful for manual backfills

## Summary

✅ **Massive at 4:30 PM ET** - Data available before Flex runs  
✅ **Flex at 6:00 PM ET** - Computes state codes with latest IV data  
✅ **Manual trigger** - Fetches all active underlyings if no tickers specified  
✅ **No auto-recompute needed** - State codes computed during Flex ingestion  
⚠️ **Backfill requires manual recompute** - After backfilling historical IV data

