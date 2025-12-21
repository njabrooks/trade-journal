# Massive.com Ingestion Timing Strategy

## Overview

We need to balance data availability, accuracy, and cost when deciding when to fetch data from Massive.com.

## Daily Market Summary (Spot Prices)

**Endpoint**: `GET /v2/aggs/grouped/locale/us/market/stocks/{date}`  
**Reference**: https://massive.com/docs/rest/stocks/aggregates/daily-market-summary

### Data Type
- **Normal Close**: The endpoint returns the **regular trading session close** (4:00 PM ET), not after-hours close
- This is the standard EOD price used for most analysis

### Timing Constraints
- **Free Tier**: Cannot fetch today's data before market close
- **Error**: `"Attempted to request today's data before end of day. Please upgrade your plan"`
- **Solution**: 
  - For same-day ingestion: Run after 4:00 PM ET (market close)
  - For historical backfill: Use any date in the past
  - For production: Schedule to run after market close (9:30 PM ET recommended)

### Recommended Schedule
- **Time**: 9:30 PM ET (1:30 AM UTC during DST)
- **Rationale**: 
  - Market closes at 4:00 PM ET
  - EOD data is finalized 30-60 minutes after close
  - Ensures all data is available and finalized

## Options Chain Snapshot (IV30)

**Endpoint**: `GET /v3/snapshot/options/{underlyingAsset}`  
**Reference**: https://massive.com/docs/rest/options/snapshots/option-chain-snapshot

### Data Type
- **Real-time or Delayed**: Depends on your plan tier
- **Greeks**: Available in real-time (if plan supports it)
- **IV**: Calculated from current option prices

### Timing Considerations

#### Option 1: Before Market Close (3:30-3:45 PM ET)
**Pros**:
- ✅ Live prices and greeks
- ✅ Most accurate IV calculations
- ✅ Real-time market conditions

**Cons**:
- ❌ Prices may change significantly in last 15-30 minutes
- ❌ Not "final" EOD data
- ❌ May miss end-of-day volatility spikes

#### Option 2: After Market Close (4:30-5:00 PM ET)
**Pros**:
- ✅ Final EOD prices
- ✅ Matches Daily Market Summary timing
- ✅ Consistent with other EOD data sources

**Cons**:
- ❌ May have 15-minute delay (depending on plan)
- ❌ After-hours trading can affect some metrics

#### Option 3: Just Before Close (3:45 PM ET)
**Pros**:
- ✅ Captures most of the trading day
- ✅ Still has live greeks and real-time IV
- ✅ Avoids last-minute volatility

**Cons**:
- ❌ Not true EOD data
- ❌ May miss final price movements

### Recommended Approach

**For EOD Analysis (Current Implementation)**:
- Run **after market close** (9:30 PM ET)
- Use final EOD prices
- Consistent with Daily Market Summary
- Matches IBKR Flex report timing (EOD snapshots)

**For Real-time Monitoring (Future Enhancement)**:
- Could add a separate workflow at 3:45 PM ET
- Capture live IV and greeks
- Use for intraday alerts and monitoring

## Current Implementation

**GitHub Actions Schedule**: `30 1 * * *` (1:30 AM UTC = 9:30 PM ET during DST)

**Workflow**:
1. Fetch Daily Market Summary (EOD spot prices)
2. Fetch Options Chain Snapshot (EOD IV and options data)
3. Calculate IV30 from ATM options with ~30 DTE
4. Store in database

## Fallback Strategy

If Daily Market Summary is unavailable:
- **Spot Prices**: Cannot reliably get from IBKR positions (options positions have option prices, not underlying)
- **Solution**: 
  - Use previous day's spot price
  - Or fetch from options chain `underlying_asset.price` (if available in plan)
  - Or use Yahoo Finance / other free source for backfill

## Data Consistency

- **Spot Prices**: Always use EOD close (4:00 PM ET)
- **IV30**: Calculated from EOD option prices
- **Options Chain**: Stored with EOD prices for historical analysis
- **Timing**: All data from same trading day, finalized after close

