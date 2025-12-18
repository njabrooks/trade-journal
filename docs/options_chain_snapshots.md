# Options Chain Snapshots

## Overview

The `options_chain_snapshots` table stores full options chain data from Massive.com API, enabling historical IV analysis and calculation of metrics like IV Rank and IV Percentile.

## Table Schema

```sql
options_chain_snapshots
├── id (UUID, PK)
├── underlying_id (UUID, FK → underlyings)
├── ticker (TEXT, NOT NULL) - Denormalized for easier querying
├── snapshot_date (DATE, NOT NULL)
├── underlying_spot (NUMERIC) - Spot price at snapshot time
├── source (TEXT, DEFAULT 'massive')
├── contract_type (TEXT) - 'call' | 'put'
├── strike (NUMERIC, NOT NULL)
├── expiration_date (DATE, NOT NULL)
├── dte (INTEGER) - Days to expiry (calculated at snapshot time)
├── implied_volatility (NUMERIC) - IV for this contract (decimal)
├── bid, ask, last (NUMERIC) - Option pricing
├── volume, open_interest (INTEGER)
├── raw_data (JSONB) - Full raw response for future use
└── created_at, updated_at (TIMESTAMPTZ)
```

## Unique Constraint

One record per contract per snapshot date:
- `(ticker, snapshot_date, contract_type, strike, expiration_date, source)`

## Indexes

- `idx_options_chain_ticker_date` - Fast lookups by ticker and date
- `idx_options_chain_underlying_date` - Fast lookups by underlying_id and date
- `idx_options_chain_expiration` - Fast lookups by expiration date
- `idx_options_chain_iv` - Fast IV-based queries (partial index, only non-null IV)

## Data Ingestion

Automatically populated by `scripts/ingest-underlyings-massive.ts` when fetching options chain snapshots from Massive.com API.

The script:
1. Fetches options chain snapshot for each underlying
2. Extracts spot price and calculates IV30 (for `underlyings_iv_history`)
3. Stores full options chain in `options_chain_snapshots` table
4. Handles duplicates via `ON CONFLICT DO NOTHING` (idempotent)

## Use Cases

### 1. IV Rank Calculation

IV Rank = (Current IV - Min IV) / (Max IV - Min IV) × 100

Shows where current IV sits within the 52-week range (0-100).

**Example**:
- Min IV (52 weeks): 0.20 (20%)
- Max IV (52 weeks): 0.60 (60%)
- Current IV: 0.45 (45%)
- IV Rank = (0.45 - 0.20) / (0.60 - 0.20) × 100 = 62.5%

### 2. IV Percentile Calculation

IV Percentile = % of days where IV was lower than current IV

Shows how often IV has been lower than current level.

**Example**:
- 100 days of historical data
- 30 days had IV < current IV
- IV Percentile = 30%

### 3. Historical IV Analysis

Query historical IV for specific:
- Strikes (e.g., ATM options)
- Expiration dates
- Time periods
- Compare IV across different market conditions

### 4. Position-Specific Analysis

For open positions, query IV for:
- Specific option contracts (strike + expiry)
- Track IV changes over time
- Compare to historical ranges

## Usage Examples

### Calculate IV Rank and Percentile

```typescript
import { calculateIvMetrics } from '@/lib/derived/ivMetrics';

const metrics = await calculateIvMetrics('TSLA', '2025-12-17', {
  lookbackDays: 365, // 1 year
  dteRange: { min: 20, max: 40 }, // ~30 DTE options
  strikeRange: { min: 0.95, max: 1.05 }, // ATM ±5%
});

console.log(`IV Rank: ${metrics.ivRank}%`);
console.log(`IV Percentile: ${metrics.ivPercentile}%`);
console.log(`Current IV: ${(metrics.currentIv * 100).toFixed(2)}%`);
console.log(`52-week range: ${(metrics.minIv * 100).toFixed(2)}% - ${(metrics.maxIv * 100).toFixed(2)}%`);
```

### Query Historical IV for Specific Contract

```typescript
import { db } from '@/db';
import { optionsChainSnapshots } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const historicalIv = await db
  .select({
    snapshotDate: optionsChainSnapshots.snapshotDate,
    impliedVolatility: optionsChainSnapshots.impliedVolatility,
    underlyingSpot: optionsChainSnapshots.underlyingSpot,
  })
  .from(optionsChainSnapshots)
  .where(
    and(
      eq(optionsChainSnapshots.ticker, 'TSLA'),
      eq(optionsChainSnapshots.strike, '350'),
      eq(optionsChainSnapshots.expirationDate, '2026-06-18'),
      eq(optionsChainSnapshots.contractType, 'call')
    )
  )
  .orderBy(optionsChainSnapshots.snapshotDate);
```

### Get IV Distribution for Time Period

```typescript
const ivDistribution = await db
  .select({
    impliedVolatility: optionsChainSnapshots.impliedVolatility,
  })
  .from(optionsChainSnapshots)
  .where(
    and(
      eq(optionsChainSnapshots.ticker, 'TSLA'),
      gte(optionsChainSnapshots.snapshotDate, '2025-01-01'),
      lte(optionsChainSnapshots.snapshotDate, '2025-12-17'),
      gte(optionsChainSnapshots.dte, 20),
      lte(optionsChainSnapshots.dte, 40),
      isNotNull(optionsChainSnapshots.impliedVolatility)
    )
  );
```

## Performance Considerations

- **Storage**: Each snapshot can contain hundreds of option contracts
- **Indexes**: Ensure queries use indexed columns (ticker, snapshot_date, underlying_id)
- **Partitioning**: Consider partitioning by date if table grows very large
- **Retention**: Consider archiving old snapshots (>2 years) if storage is a concern

## Future Enhancements

1. **IV Surface Analysis**: Store full IV surface (all strikes × expirations) for advanced analysis
2. **Greeks Storage**: Store delta, gamma, theta, vega if available from API
3. **Volume/Open Interest Trends**: Track changes in volume and OI over time
4. **IV Skew Analysis**: Compare IV across strikes to identify skew patterns
5. **Automated IV Rank Alerts**: Alert when IV Rank exceeds thresholds

