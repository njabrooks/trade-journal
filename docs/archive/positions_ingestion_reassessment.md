# Positions Ingestion Reassessment - Implementation Plan

## Summary

Reassessing and improving positions (POST) Flex report ingestion to properly capture entry context fields for strategies.

## Current State Analysis

### Fields Currently Mapped
- ✅ **CostBasisPrice** → `positions.avg_price` (with fallback to OpenPrice)
- ✅ **MarkPrice** → `positions.spot`
- ✅ **PositionValue** → `positions.abs_notional`
- ✅ **FifoPnlUnrealized** → `positions.unrealized_pnl`
- ❌ **CostBasisMoney** → NOT STORED (was missing)

### Fallback Logic
- ✅ `avg_price` (CostBasisPrice) has fallback from previous snapshot if null/0
- ✅ `unrealized_pnl` has fallback from previous snapshot if null/0
- ✅ `cost_basis_money` now has fallback from previous snapshot if null/0 (just added)

## Changes Made

### 1. Added `costBasisMoney` Field to Positions Table
- **Schema**: Added `costBasisMoney: numeric('cost_basis_money')` to `positions` table
- **Ingestion**: Added mapping from Flex `CostBasisMoney` field
- **Fallback**: Added fallback logic in all three ingestion routes:
  - `src/app/api/ingest/flex/positions/route.ts`
  - `src/app/api/ingest/flex/positions-all/route.ts`
  - `src/lib/ingestion/flex/processCsv.ts`

### 2. Field Mapping Clarification

From Flex POST report:
- **CostBasisPrice** = Average entry price per unit
  - For stocks: Average purchase price
  - For options: Average premium paid/received per contract
  - Maps to: `positions.avg_price` → `strategies.entry_spot` (for stocks) or entry price (for options)

- **CostBasisMoney** = Total cost basis (net premium/entry notional)
  - For stocks: `quantity * avgPrice * multiplier` (total notional at entry)
  - For options: Net premium paid/received (can be negative for credit spreads)
  - Maps to: `positions.cost_basis_money` → `strategies.entry_notional` AND `strategies.net_premium`

**Note**: For options strategies, `netPremium` and `entryNotional` may differ:
- `netPremium` = Net cash paid/received (can be negative)
- `entryNotional` = Absolute notional at entry (always positive, sum of all legs)

## Next Steps

### 3. Create Function to Populate Strategy Entry Context Fields ✅

Function: `populateStrategyEntryContext(strategyId: string)` - **IMPLEMENTED**

**Logic**:
1. **entrySpot** (`strategies.entry_spot`):
   - Use `avg_price` (CostBasisPrice) from **most recent** position snapshot
   - This reflects the current average cost basis after all position adjustments (additions/reductions)
   - For both stocks and options, this represents the current entry price per unit

2. **netPremium** (`strategies.net_premium`):
   - Sum `cost_basis_money` from all positions at **most recent** snapshot date
   - Signed sum (can be negative for credit spreads)
   - Reflects current adjusted cost basis after all position adjustments
   - For options: This represents net premium paid/received
   - For stocks: This equals entryNotional (no separate premium concept)

3. **entryNotional** (`strategies.entry_notional`):
   - Sum `abs(cost_basis_money)` from all positions at **most recent** snapshot date
   - Always positive (absolute value)
   - Reflects current adjusted notional after all position adjustments

4. **entryIv30** (`strategies.entry_iv30`):
   - Query `underlyings_iv_history` for underlying at `opened_at` date
   - If exact match not found, find closest date within ±7 days
   - Returns null if no IV data available

5. **timeHorizon** (`strategies.time_horizon`):
   - Manual input during `PROVIDE_STRATEGY_METADATA` triage task
   - Not auto-populated

### 4. Integrate into Auto-Linking Flow ✅

- **IMPLEMENTED**: `populateStrategyEntryContext()` is called:
  - ✅ When strategy is auto-created from positions (`findOrCreateStrategyFromPosition`)
  - ✅ When strategy is auto-created from trades (`findOrCreateStrategyFromTrade`)
  - ✅ When strategy is confirmed (status changes from 'draft' to 'open' in `updateStrategy`)
  - Runs asynchronously to avoid blocking strategy creation

### 5. Automated IV30 Ingestion

- Add to GitHub Actions workflow (`.github/workflows/flex-ingestion.yml`)
- Use Massive MCP connection to fetch IV30 data
- Store in `underlyings_iv_history` table
- Run daily or on-demand

### 6. Database Migration ✅

**COMPLETED**: Migration applied via Supabase MCP:
- Migration name: `add_cost_basis_money_to_positions`
- SQL: `ALTER TABLE positions ADD COLUMN IF NOT EXISTS cost_basis_money numeric;`

## Field Naming Considerations

Current naming may be confusing. Consider:
- `avg_price` → `entry_price` or `cost_basis_price` (more explicit)
- `cost_basis_money` → keep as is (matches Flex field name)
- `spot` → `mark_price` (more accurate for options)

**Recommendation**: Keep current names for now to maintain consistency with Flex reports, but document the mapping clearly.

## Raw Flex Positions Table

**Decision**: Skip for now. We have:
- Full data in `positions` table
- Raw CSV can be re-fetched from IBKR if needed
- JSONB `raw_row` field in `mtm_snapshots` if we need raw data later

If we need audit trail or raw data access later, we can add `raw_flex_positions` table.

## Testing Checklist

- [ ] Verify `cost_basis_money` is populated from Flex POST report
- [ ] Verify fallback logic works when CostBasisMoney is null/0
- [ ] Test `populateStrategyEntryContext()` function
- [ ] Verify entry context fields are populated on strategy creation/confirmation
- [ ] Test IV30 lookup from `underlyings_iv_history`
- [ ] Verify migration runs successfully

