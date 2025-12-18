# Massive.com Data → State Code Connection

## Overview

Data from Massive.com ingestion feeds into state code computation through the `WorstShortSigma` metric.

## Data Flow

```
Massive.com Ingestion (Daily at 9:30 PM ET)
  ↓
1. Daily Market Summary → Spot prices
2. Options Chain Snapshot → IV30 (calculated from ATM options)
  ↓
Stored in: underlyings_iv_history
  - ticker, asOfDate, spot, iv30, source='massive'
  ↓
Used by: computeWorstShortSigma()
  - Queries underlyings_iv_history for IV30 and spot
  - Calculates sigma-to-strike for short option positions
  ↓
Used by: computeStateCode()
  - Evaluates playbook criteria including WorstShortSigma
  - Examples: "WorstShortSigma ≤ 0.5σ", "0.5σ < WorstShortSigma ≤ 1.0σ"
  ↓
Result: State code assigned to strategy
  - Stored in strategy_metrics_snapshots.state_code
  - Triggers STATE_CODE_CHANGE triage rule when it changes
```

## Key Components

### 1. `underlyings_iv_history` Table

**Purpose**: Store daily snapshots of spot and IV30 for each underlying

**Schema**:
- `ticker` - Underlying symbol
- `asOfDate` - Snapshot date (YYYY-MM-DD)
- `spot` - EOD close price (from Daily Market Summary)
- `iv30` - 30-day implied volatility (calculated from options chain)
- `source` - Data source (e.g., 'massive', 'opt_strat', 'manual')

**Unique Constraint**: `(ticker, asOfDate, source)`

### 2. `computeWorstShortSigma()` Function

**Location**: `src/lib/derived/stateCode.ts:77-153`

**What It Does**:
1. Finds all short option positions for a strategy
2. For each position, queries `underlyings_iv_history` for:
   - `iv30` - 30-day implied volatility
   - `spot` - Underlying spot price (not option mark price)
3. Calculates sigma-to-strike: `|ln(S/K)| / (IV * sqrt(T))`
   - S = underlying spot
   - K = strike price
   - IV = iv30 (annualized)
   - T = DTE / 365
4. Returns minimum sigma-to-strike (worst case = closest to strike)

**Why It Matters**:
- Short options closer to strike (lower sigma) = higher risk
- State codes use this to trigger risk management actions
- Example: "WorstShortSigma ≤ 0.5σ" → urgent action needed

### 3. State Code Criteria

**Location**: `playbook_items` table

**Examples**:
- `"WorstShortSigma ≤ 0.5σ"` - Pressure zone (shorts very close to strike)
- `"0.5σ < WorstShortSigma ≤ 1.0σ"` - Approach zone (shorts getting closer)
- `"WorstShortSigma is blank OR > 1.0σ"` - Comfy zone (shorts far from strike)

**Evaluation**: `computeStateCode()` evaluates these criteria using `WorstShortSigma` value

### 4. `entryIv30` on Strategies

**Location**: `strategies.entryIv30`

**Purpose**: Historical reference - records IV30 at strategy entry time

**Population**: `populateStrategyEntryContext()` queries `underlyings_iv_history` at `openedAt` date

**Usage**: 
- Currently **NOT used** in state code computation
- Stored for historical analysis and entry context
- Could be used for IV regime analysis (entry IV vs current IV)

## State Code Computation Process

1. **Get Strategy Type** → Load playbook items for that type
2. **Compute Metrics**:
   - `PnlPctOfCost` - From positions (unrealized PnL / entry notional)
   - `MaxDTE` - From positions (maximum days to expiry)
   - `WorstShortSigma` - **Uses `underlyings_iv_history.iv30`** ← **Massive.com data here**
   - `AssignmentRisk` - From position-level triage
   - `hasItm` - From position-level triage
3. **Evaluate Playbook Criteria** - First match wins
4. **Store State Code** - In `strategy_metrics_snapshots.state_code`

## Dependencies

### Critical Dependency

**State codes that use `WorstShortSigma` require**:
- ✅ `underlyings_iv_history` data for the snapshot date
- ✅ IV30 value (not null)
- ✅ Spot price (not null)
- ✅ Short option positions with strikes

**If Missing**:
- `WorstShortSigma` returns `null`
- Criteria with `WorstShortSigma` fail to match
- Strategy may get catch-all state code or `null` state code

### Data Freshness

- **Massive.com ingestion**: Runs daily at 9:30 PM ET
- **State code computation**: Runs during strategy metrics computation
- **Timing**: State codes computed after positions ingested, but need IV data available

## Example: Risk Reversal Strategy

**Strategy Type**: "Risk Reversal"

**Playbook Items**:
1. `RR3`: `"WorstShortSigma ≤ 0.5σ"` - Pressure zone
2. `RR2`: `"0.5σ < WorstShortSigma ≤ 1.0σ"` - Approach zone  
3. `RR1`: `"MaxDTE > 120 AND (WorstShortSigma is blank OR > 1.0σ)"` - Comfy zone

**Computation**:
1. Strategy has short put at strike 450, underlying spot 467
2. Query `underlyings_iv_history` for IV30 = 0.48 (48%)
3. Calculate sigma-to-strike = 0.42σ
4. Match `RR3` criteria → State code = "RR3"
5. Triggers urgent triage: "Prioritise downside risk: roll put down/out..."

## GitHub Actions Schedule

**Massive Ingestion**: Daily at 9:30 PM ET (separate from Flex)

**Flex Ingestion**: Every 6 hours (positions and trades)

**Why Separate**:
- Different data sources (Massive.com vs IBKR)
- Different update frequencies (daily EOD vs every 6 hours)
- Different purposes (market data vs position data)

## Summary

✅ **Massive.com data feeds state codes** through `WorstShortSigma`  
✅ **IV30 from `underlyings_iv_history`** is used in sigma calculations  
✅ **State codes trigger triage rules** when they change  
✅ **Separate GitHub Action** runs daily after market close  

The connection is **indirect but critical** - without IV data, state codes that depend on `WorstShortSigma` cannot be computed correctly.

