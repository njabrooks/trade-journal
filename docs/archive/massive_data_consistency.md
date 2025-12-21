# Massive.com Data Consistency Strategy

## Problem Statement

When ingesting spot prices and IV30 from different Massive.com endpoints, we need to ensure they represent the **same valuation moment** (EOD close) and are stored with the **same as-of-date**.

## Current Implementation

### Data Flow

1. **Step 1: Fetch Daily Market Summary** (Canonical Spot)
   - Endpoint: `GET /v2/aggs/grouped/locale/us/market/stocks/{date}`
   - Returns: EOD close price (4:00 PM ET normal close)
   - Available: ~4:05-4:15 PM ET
   - **This becomes the canonical spot price**

2. **Step 2: Fetch Options Chain Snapshot** (IV30)
   - Endpoint: `GET /v3/snapshot/options/{underlyingAsset}`
   - Returns: Options chain with IV, greeks, prices
   - **Uses canonical spot from Step 1** (ignores `underlying_asset.price` from options chain)
   - Calculates IV30 from ATM options with ~30 DTE

3. **Step 3: Store Combined Snapshot**
   - Both spot and IV30 stored with same `asOfDate` (YYYY-MM-DD)
   - Source: `'massive'`
   - Unique constraint: `(ticker, asOfDate, source)`

### Key Design Decisions

#### ✅ Use Daily Market Summary Spot as Canonical

**Why?**
- Daily Market Summary is the authoritative source for EOD stock prices
- Returns the official 4:00 PM ET close (normal close, not after-hours)
- Available reliably after 4:15 PM ET
- One API call gets all stocks (efficient)

**Implementation:**
```typescript
// Step 1: Get canonical spot
const spotPrices = await getSpotPricesFromDailySummary(targetDate, tickers);

// Step 2: Use canonical spot for IV30 calculation
const { iv30 } = await getSpotAndIv30FromMassive(ticker, targetDate, underlyingId, canonicalSpot);

// Step 3: Store both with same asOfDate
snapshots.push({
  date: targetDate,        // Same date for both
  ticker,
  spot: canonicalSpot,     // From Daily Market Summary
  iv30,                    // From Options Chain (calculated using canonical spot)
  source: 'massive',
});
```

#### ✅ Ignore Options Chain `underlying_asset.price`

**Why?**
- Options chain may have slightly different timing
- Daily Market Summary is the authoritative source
- Ensures consistency across all underlyings

**Implementation:**
- Pass `canonicalSpot` to `getSpotAndIv30FromMassive()`
- Use it for ATM filtering and IV30 calculation
- Ignore `underlying_asset.price` from options chain response

#### ✅ Same `asOfDate` for Both Fields

**Why?**
- Both represent EOD close for the same trading day
- Stored in same database record
- Unique constraint ensures no duplicates

**Database Schema:**
```sql
CREATE TABLE underlyings_iv_history (
  ticker TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  spot NUMERIC,
  iv30 NUMERIC,
  source TEXT NOT NULL,
  UNIQUE (ticker, as_of_date, source)
);
```

## Timing Strategy

### Recommended Schedule

**GitHub Actions**: Run at **9:30 PM ET** (1:30 AM UTC during DST)

**Rationale:**
- Market closes at 4:00 PM ET
- Daily Market Summary available by 4:15 PM ET
- Options Chain Snapshot finalized by 4:20 PM ET
- Running at 9:30 PM ET ensures all data is finalized
- 5+ hour buffer provides safety margin

### For Same-Day Testing

If testing on the same day:
- **Must run after 4:15 PM ET** (when Daily Market Summary is available)
- Or use previous date for testing/backfill

## Data Consistency Guarantees

### ✅ Same Valuation Moment

- **Spot**: Official 4:00 PM ET close from Daily Market Summary
- **IV30**: Calculated from options chain using the same canonical spot
- Both represent the same trading day's EOD close

### ✅ Same As-Of-Date

- Both stored with `asOfDate = targetDate` (YYYY-MM-DD)
- Same database record (unique constraint on `ticker, asOfDate, source`)
- No timing mismatches

### ✅ Idempotent

- Can re-run for same date without duplicates
- Uses `INSERT ... ON CONFLICT DO UPDATE`
- Updates existing record if it exists

## Edge Cases

### Missing Spot Price

**Scenario**: Daily Market Summary unavailable (e.g., before market close)

**Handling:**
- Skip options chain fetch (cannot calculate IV30 without spot)
- Log warning
- Return early (no partial data)

### Missing IV30

**Scenario**: Options chain unavailable or no ATM options found

**Handling:**
- Store spot price only
- `iv30 = null` in database
- Can be backfilled later

### Different Sources

**Scenario**: Multiple sources for same date (e.g., `'massive'` and `'yahoo_finance'`)

**Handling:**
- Unique constraint on `(ticker, asOfDate, source)`
- Each source has its own record
- Can compare/merge if needed

## Future Enhancements

### Real-time Monitoring

Could add a separate workflow at 3:45 PM ET:
- Fetch live options chain (real-time IV)
- Use for intraday alerts
- Store with different source (e.g., `'massive_realtime'`)

### Historical Backfill

- Can backfill any historical date
- Uses same logic (Daily Market Summary → Options Chain)
- Ensures consistency even for old data

## References

- [Daily Market Summary Docs](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary)
- [Options Chain Snapshot Docs](https://massive.com/docs/rest/options/snapshots/option-chain-snapshot)
- [Timing Strategy](./massive_ingestion_timing.md)

