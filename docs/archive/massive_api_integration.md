# Massive.com API Integration for Spot Prices and IV30

## Overview

This document outlines how to use Massive.com API to fetch spot prices and IV30 data for underlyings, and integrate it into the automated ingestion pipeline.

## Available Massive Endpoints (via MCP)

Based on available MCP tools, here are the relevant endpoints:

### ✅ Spot Prices (Available on Free Tier)

1. **`get_daily_open_close_agg`** - Daily OHLC data
   - Endpoint: `/v2/aggs/ticker/{ticker}/range/1/day/{date}/{date}`
   - Returns: `{ open, high, low, close, volume, ... }`
   - Use `close` price as spot
   - **Status**: ✅ Works (tested with TSLA)

2. **`get_previous_close_agg`** - Previous day's close
   - Endpoint: `/v2/aggs/ticker/{ticker}/prev`
   - Returns previous trading day's OHLC
   - **Status**: ✅ Works

3. **`get_aggs`** - Aggregated bars
   - Endpoint: `/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}`
   - More flexible for historical data
   - **Status**: ✅ Available

### ✅ IV30 Data (Via Options Chain Snapshot)

**Endpoint**: `GET /v3/snapshot/options/{underlyingAsset}`

**Status**: ✅ Implemented - Uses Options Chain Snapshot endpoint

**How it works**:
1. Fetches full options chain for underlying
2. Gets spot price from `underlying_asset.price`
3. Calculates IV30 by:
   - Finding ATM (at-the-money) options within 5% of spot
   - Filtering for options with DTE between 20-40 days (closest to 30)
   - Averaging IV from top 3 closest-to-30-DTE ATM options
   - If no ATM options, uses closest-to-30-DTE options regardless of strike

**Note**: This endpoint may require a paid tier. If it returns 403, the script falls back to:
- Using daily aggregates endpoint for spot price only
- IV30 remains null (can use Option Strategist as fallback)

**Benefits**:
- Single API call gets both spot and IV30
- Full options chain available for future analysis
- Can analyze specific positions' options if needed

## Implementation

### Script: `scripts/ingest-underlyings-massive.ts`

- Fetches options chain snapshot for each underlying
- Extracts spot price from `underlying_asset.price`
- Calculates IV30 from ATM options with ~30 DTE
- Falls back to daily aggregates if options chain requires paid tier
- Upserts into `underlyings_iv_history` table
- Handles rate limiting and errors

### GitHub Actions Workflow: `.github/workflows/massive-ingestion.yml`

- Runs daily at 2 AM UTC
- Can be manually triggered
- Requires `MASSIVE_API_KEY` secret

## Setup Instructions

### 1. Get Massive.com API Key

1. Sign up at https://massive.com
2. Navigate to API settings
3. Copy your API key
4. Check your tier/plan to see what endpoints are available

### 2. Add GitHub Secrets

Add to your repository secrets:
- `MASSIVE_API_KEY`: Your Massive.com API key
- `MASSIVE_API_BASE_URL`: (Optional) API base URL, defaults to `https://api.massive.com/v2`

### 3. Test the Script Locally

```bash
# Set environment variables
export MASSIVE_API_KEY="your_key_here"
export DATABASE_URL_POOLER="your_db_url"

# Run for today
npx tsx scripts/ingest-underlyings-massive.ts

# Run for specific date
npx tsx scripts/ingest-underlyings-massive.ts 2025-12-17

# Run for specific tickers
npx tsx scripts/ingest-underlyings-massive.ts 2025-12-17 TSLA AAPL
```

## Data Flow

```
GitHub Actions (Daily 2 AM UTC)
  ↓
scripts/ingest-underlyings-massive.ts
  ↓
Massive.com API
  ├─→ Spot Prices (get_daily_open_close_agg)
  └─→ IV30 (TBD - check API docs or calculate from options)
  ↓
upsertIvSnapshots()
  ↓
underlyings_iv_history table
  ↓
Used by:
  - Strategy entry context (entryIv30)
  - Triage calculations (sigma-to-strike)
  - Portfolio analytics
```

## Next Steps

1. **Test Options Chain Snapshot Endpoint**
   - Verify it works with your API key/tier
   - If 403 error: check Massive pricing for options data access
   - Document rate limits for this endpoint

2. **Fine-tune IV30 Calculation**
   - Adjust DTE range (currently 20-40 days)
   - Adjust ATM threshold (currently 5% from spot)
   - Consider weighting by volume/open interest if available

3. **Handle Fallback Scenarios**
   - If options chain unavailable: use daily aggregates for spot
   - For IV30: fallback to Option Strategist (weekly) or other source

3. **Test and Monitor**
   - Run script manually first
   - Monitor GitHub Actions logs
   - Verify data quality in database

4. **Handle Entry vs Ongoing Values**
   - **Entry values**: Use `opened_at` date when populating strategy entry context
   - **Ongoing values**: Daily ingestion captures current market data
   - Both are stored in `underlyings_iv_history` with different dates

## Rate Limits

- Check Massive.com documentation for rate limits
- Script includes 200ms delay between requests
- Adjust if hitting rate limits

## Error Handling

- Invalid API key → 401 error
- Insufficient tier → 403 error
- Missing data → Logged but doesn't fail entire run
- Database errors → Logged and reported

## Cost Considerations

- **Free Tier**: Likely includes basic aggregates (spot prices)
- **Paid Tier**: May include IV30, options data, real-time data
- Check Massive.com pricing: https://massive.com/pricing

