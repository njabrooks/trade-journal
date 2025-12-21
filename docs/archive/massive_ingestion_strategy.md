# Massive.com Ingestion Strategy

## Overview

We use Massive.com API to fetch:
1. **Spot Prices**: From Daily Market Summary (free EOD endpoint) - `/v2/aggs/grouped/locale/us/market/stocks/{date}`
2. **Options Chain & IV30**: From Options Chain Snapshot (paid tier) - `/v3/snapshot/options/{underlyingAsset}`

## Data Sources

### Spot Prices

**Endpoint**: `GET /v2/aggs/grouped/locale/us/market/stocks/{date}`  
**Reference**: https://massive.com/docs/rest/stocks/aggregates/daily-market-summary

**Benefits**:
- ✅ Free tier available (end-of-day data)
- ✅ Single API call gets all US stocks for a date
- ✅ More efficient than individual ticker requests
- ✅ Returns EOD close prices (perfect for daily snapshots)

**Fallback**: If not available, spot prices can be obtained from:
- IBKR positions data (already ingested via Flex reports)
- Options chain `underlying_asset.price` (if available in plan)

### Options Chain & IV30

**Endpoint**: `GET /v3/snapshot/options/{underlyingAsset}`  
**Reference**: https://massive.com/docs/rest/options/snapshots/option-chain-snapshot

**Benefits**:
- ✅ Full options chain data for historical analysis
- ✅ Per-contract IV for IV Rank/Percentile calculations
- ✅ Can calculate IV30 from ATM options with ~30 DTE
- ✅ Stores complete chain in `options_chain_snapshots` table

**Query Parameters**:
- `limit=250` - Get maximum contracts
- `expiration_date.gte` / `expiration_date.lte` - Filter for ~30 DTE options

## Scheduling

**Recommended Time**: Just after market close (9:30 PM ET / 1:30 AM UTC)

**Rationale**:
- Market closes at 4:00 PM ET
- EOD data is typically available 30-60 minutes after close
- Running at 9:30 PM ET ensures all data is finalized
- Options chain data is also finalized by this time

**GitHub Actions Schedule**: `30 1 * * *` (1:30 AM UTC = 9:30 PM ET during DST)

## Data Flow

```
Daily at 9:30 PM ET
  ↓
1. Fetch Daily Market Summary (all US stocks)
   → Extract spot prices for active underlyings
   ↓
2. For each underlying:
   → Fetch Options Chain Snapshot
   → Calculate IV30 from ATM options with ~30 DTE
   → Store full options chain in options_chain_snapshots
   ↓
3. Upsert to underlyings_iv_history
   → spot (from daily summary)
   → iv30 (calculated from options chain)
   ↓
4. Store full options chain
   → Enables IV Rank/Percentile calculations
   → Historical IV analysis
```

## Cost Optimization

- **Spot Prices**: Use free Daily Market Summary endpoint (one call for all stocks)
- **Options Chain**: Only fetch for underlyings we actually trade (from `underlyings` table)
- **Rate Limiting**: 500ms delay between options chain requests

## Fallback Strategy

If Daily Market Summary is not available:
1. Spot prices can come from IBKR positions data (already ingested)
2. Options chain still provides IV30
3. System continues to function with partial data

## Future Enhancements

1. **Spot Price Backfill**: Populate missing spots from IBKR positions data
2. **IV Rank/Percentile**: Calculate from stored options chain snapshots
3. **Historical Analysis**: Use full chain data for advanced IV metrics

