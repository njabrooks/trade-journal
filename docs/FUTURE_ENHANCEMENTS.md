# Future Enhancements

This document captures all planned future enhancements mentioned throughout the codebase documentation. Use this as a reference when prioritizing new features.

**Related Documents**:
- `.cursor/plans/plan v5.md` - Main implementation plan (references this document)
- `docs/actions.md` - Complete specification of triggers, rules, and actions

## Trade & Reconciliation Enhancements

### 1. Roll Trade Auto-Detection
**Location**: `docs/actions.md` (line 318)  
**Current State**: Roll trades are detected as separate 'close' and 'open' events (different `conid`). User must manually set `tradeStage = 'roll'` to link them.  
**Enhancement**: Pattern matching to auto-detect rolls by matching underlying + expiry/strike changes.  
**Priority**: Medium

### 2. Trade Decision Timeout/Resolution
**Location**: `docs/actions.md` (line 317)  
**Current State**: TRADE actions that are never executed remain 'pending' indefinitely.  
**Enhancement**: Consider manual resolution or timeout mechanism for pending trades that never get executed.  
**Priority**: Low

### 3. Trade Validation & Discrepancy Detection
**Location**: `docs/actions.md` (line 26)  
**Current State**: If discrepancy between recorded decision and actual quantity change, both records exist.  
**Enhancement**: Enhanced discrepancy detection and reconciliation workflow.  
**Priority**: Medium

## State Code Computation

### 4. State Code Change Performance Optimization ✅ COMPLETED
**Location**: `docs/actions.md` (line 255)  
**Previous State**: Was disabled in triage computation due to performance concerns.  
**Solution Implemented**: 
- State codes are already computed and stored in `strategy_metrics_snapshots.state_code` during metrics computation
- Change detection now reads stored state codes instead of recomputing (fast database query)
- Implemented in `src/lib/derived/triage.ts:518-545` using `detectStateCodeChangeFromStored()`
- No performance impact - just compares two stored values
- **Additional improvements**:
  - Catch-all state code support: Empty criteria = always matches (ensures every strategy has a state code)
  - Historical backfill: After confirmation, state codes computed for all historical snapshot dates
  - UI guidance: Playbook admin page shows completeness checker and guides users to add catch-all state codes
  - Validation: Warning logs when no state code matches (shouldn't happen with catch-all)
**Status**: ✅ Enabled and working with comprehensive coverage

## Configuration & Rules

### 5. Triage Rules Database Persistence
**Location**: `docs/actions.md` (line 377)  
**Current State**: Rules currently read from `TRIAGE_RULES_V1` constant in `src/lib/derived/triage.ts:13-22`.  
**Enhancement**: 
- Store thresholds in database table (e.g., `triage_rules` or `triage_rule_config`) for persistence
- Load from database during triage computation instead of hardcoded constants
- Support multiple rule sets (currently only `options_v1`)  
**Priority**: Medium

## Future Triggers (Not Yet Implemented)

### 6. Underlying-Level Triggers
**Location**: `docs/actions.md` (lines 431-436)  
**Triggers**:
- IV spike detection
- Concentration risk (too much exposure to single underlying)
- Correlation risk  
**Priority**: Low

### 7. Account-Level Triggers
**Location**: `docs/actions.md` (lines 438-441)  
**Triggers**:
- Overall leverage threshold
- Cash balance warnings
- Margin requirements  
**Priority**: Low

### 8. Time-Based Triggers
**Location**: `docs/actions.md` (lines 443-446)  
**Triggers**:
- Weekly review reminders (narrative news for memory, risk analysis, technical analysis historical comparisons (what period does the current price action look similar to?), etc.)
- Monthly review reminders (roll up based on weekly reviews)
- Expiry date approaching (calendar-based)
- Earnings date proximity
**Priority**: Low

## Data Ingestion

### 9. Automated Flex Ingestion
**Location**: `.cursor/plans/plan v5.md` (line 6-9), `docs/ingestion_v1.md`  
**Current State**: Manual upload via UI  
**Enhancement**: 
- Edge function/cron to call IBKR Flex APIs (FLEX token + query IDs)
- Reuse existing normalizers; trigger recompute on success
- Keep manual upload for backfills
- **Automation approach**: Scheduled Edge function/cron job (e.g., daily or weekly)
  - Calls Flex API endpoints with stored FLEX token and query IDs
  - Processes response through existing ingestion routes
  - Auto-triggers recompute (already implemented)
**Priority**: High

### 10. Underlyings IV History Ingestion ✅ COMPLETED
**Location**: `.cursor/plans/plan v5.md` (line 10-13)  
**Previous State**: Manual or not yet implemented  
**Solution Implemented**: 
- ✅ **Ingestion Module**: `src/lib/ingestion/underlyingsIvHistory.ts`
  - `scrapeOptionStrategist()` - Scrapes Option Strategist free volatility data page
  - `upsertIvSnapshots()` - Idempotent upsert to `underlyings_iv_history` table
  - `getTickersToUpdate()` - Gets tickers from `underlyings` table (optionally filtered to recent positions)
- ✅ **API Endpoint**: `src/app/api/admin/backfill-underlyings/route.ts`
  - POST: Manual trigger for IV ingestion
  - GET: List available tickers
- ✅ **Admin UI**: `src/app/admin/ingestion/underlyings-iv/page.tsx`
  - Manual trigger with ticker selection (all or recent only)
  - Custom ticker input option
  - Results display with summary
- ✅ **Data Source**: Option Strategist free volatility data (weekly updates)
  - Extracts spot price and IV30 (converted from percent to decimal)
  - Parses date from Option Strategist date code format (yymmdd)
  - **Note**: Only captures current week's data (no historical backfilling available from this source)
- **Automated Solution** (Future - to be implemented alongside #9):
  - Edge function/cron job to call `/api/admin/backfill-underlyings` on schedule (weekly recommended)
  - Can reuse existing API endpoint (`/api/admin/backfill-underlyings` POST)
  - Same automation infrastructure as Automated Flex Ingestion (#9)
  - **Historical data limitation**: Option Strategist only provides current week's data
    - For active triggers: Weekly collection going forward is sufficient (triage uses IV for current positions)
    - For historical analysis: Historical IV data would need alternative source (see #10a - IBKR API)
- **Historical Backfilling**:
  - **Current approach**: Forward-looking only - collect IV data weekly going forward
  - **Rationale**: Active triage triggers only need recent IV data (triage looks up IV by `asOfDate` matching position `snapshotDate`)
  - **Historical recompute**: If recomputing triage for past dates, IV data may be missing (triage handles this gracefully with fallback)
  - **Limitation**: Weekly data doesn't match daily snapshot dates, causing inaccurate ITM calculations
  - **Future**: IBKR API (#10a) **CRITICAL** - needed for daily spot/IV data matching snapshot dates
**Status**: ✅ Manual ingestion implemented and working (but limited by weekly data frequency)

### 10a. IBKR API Integration for IV History & Spot Prices (Future Upgrade) ⚠️ CRITICAL FOR ACCURATE TRIAGE
**Location**: Enhancement to #10  
**Current State**: Using Option Strategist (weekly data, current week only)  
**Problem**: 
- Option Strategist provides weekly data that doesn't align with daily position snapshots
- **Critical issue**: ITM calculations require underlying spot prices that match snapshot dates
  - Current implementation uses `underlyings_iv_history.spot` for ITM calculations (see `src/lib/derived/triage.ts`)
  - Weekly Option Strategist data means spot prices don't match daily snapshot dates
  - This causes incorrect ITM flags (false positives/negatives)
- IV data also needs daily granularity for accurate sigma-to-strike calculations
- No historical backfilling capability from Option Strategist

**Enhancement**: 
- Connect to Interactive Brokers API gateway for **daily** IV and spot price data
- **Direct API connection** (different from Flex queries - requires IBKR API gateway setup)
- Query IV30 and spot price data on-demand or via scheduled job
- Provides **daily data** (vs weekly from Option Strategist) that matches position snapshot dates
- **Historical data capability**: Can query historical IV and spot data for backfilling past dates
- More accurate and timely data for triage metrics (ITM flags, sigma calculations)
- Can replace Option Strategist scraping entirely
- **Use cases**:
  - **Daily spot price updates** - Critical for accurate ITM calculations matching snapshot dates
  - **Daily IV30 updates** - More accurate sigma-to-strike calculations
  - **Historical backfilling** - Enables accurate historical triage recomputation for past dates
  - Real-time IV/spot queries for active monitoring
- **Implementation approach**:
  - Build IBKR API client (separate from Flex query infrastructure)
  - Scheduled job to fetch daily IV/spot data for all active underlyings
  - Store in `underlyings_iv_history` table (same schema, just better data source)
  - Reuse existing triage computation logic (already uses `underlyings_iv_history.spot`)
**Priority**: **High** (upgrade path from #10, now critical for accurate triage calculations)

### 11. Exercises/Assignments Ingestion
**Location**: `docs/ingestion_v1.md` (lines 92, 127, 212, 235)  
**Current State**: Not implemented  
**Enhancement**: 
- Flex `OPTT` row → `exercises`-related table
- Section `OPTT` → `lib/ingestion/flex/exercises.ts`  
**Priority**: Low

### 12. Cash Transactions Ingestion
**Location**: `docs/ingestion_v1.md` (lines 93, 128, 213, 243)  
**Current State**: Not implemented  
**Enhancement**: 
- Flex `CTRN` row → `cash_flows` table
- Section `CTRN` → `lib/ingestion/flex/cash.ts`  
**Priority**: Low

## UI/UX Enhancements

### 13. Decision-Making Assistant (AI Integration)
**Location**: `.cursor/plans/plan v5.md` (lines 19-22)  
**Enhancement**: 
- Connect decision-making process to ChatGPT at strategy-detail level
- Share decision context with AI and seek recommendations on optimal action (trade) to manage risk and maximise expected value
- Include feature to manually capture (copy/paste, csv export or screenshot) options data (greeks, IV at relevant strikes and expiries) to facilitate advice from AI  
**Priority**: Medium

### 14. Manual Linking UI
**Location**: `.cursor/plans/plan v5.md`, `.cursor/plans/plan.plan.md` (line 57)  
**Enhancement**: 
- List unlinked positions/trades
- Bulk-assign to strategies  
**Priority**: Medium

### 15. Merged/Archive View
**Location**: `.cursor/plans/plan.plan.md` (line 58)  
**Enhancement**: 
- Expose `status='merged'` strategies + history
- Optional undo functionality  
**Priority**: Low

## Schema & Data Model

### 16. Position Lifecycle Modeling
**Location**: `docs/transform_positions.md` (line 216)  
**Current State**: Each `positions` row is a snapshot, not a full lifecycle  
**Enhancement**: Future version may introduce lifecycle tables/visuals or more explicit open/close modelling  
**Priority**: Low

### 17. Additional Trade Fields
**Location**: `docs/transform_trades.md` (line 401)  
**Enhancement**: Future versions (`db_schema_v1.1+`) may add explicit columns for fields currently only in `raw_row`  
**Priority**: Low

## Testing & Quality

### 18. Endpoint Regression Tests
**Location**: `.cursor/plans/plan.plan.md` (line 14)  
**Enhancement**: 
- Scripted TRNT/POST/MTMP/EQUT flows
- Richer CSV error logging  
**Priority**: Medium

### 19. Data Quality Reports
**Location**: `.cursor/plans/plan.plan.md` (line 52)  
**Enhancement**: 
- Consistency checks
- Error dashboards  
**Priority**: Medium

### 20. Automated Tests
**Location**: `.cursor/plans/plan.plan.md` (line 53)  
**Enhancement**: 
- Unit tests
- Ingestion→recompute integration tests  
**Priority**: High

## Post-Ingestion Automation

### 21. Auto-Trigger Recompute After Data Changes ✅ COMPLETED
**Location**: `.cursor/plans/trade-journal-user-flow-analysis.plan.md`  
**Previous State**: Manual recompute required after data changes  
**Solution Implemented**: 
- ✅ **After manual linking**: `linkPositionToStrategy()` and `linkTradeToStrategy()` now auto-trigger recompute for affected snapshot dates
  - Finds all snapshot dates where linked position/trade exists
  - Computes strategy metrics and triage for those dates
  - Scoped to affected strategy only (fast: ~150ms-1s)
- ✅ **After strategy merge**: `mergeStrategies()` now auto-triggers recompute for target strategy
  - Finds all snapshot dates where target strategy has positions
  - Computes strategy metrics and triage for all dates
  - Scoped to target strategy only (acceptable: ~2.5-5s for user-initiated)
- ✅ **After Flex ingestion**: Positions and trades ingestion routes now auto-trigger recompute
  - Extracts snapshot dates from ingested data
  - Computes portfolio snapshots, strategy metrics, and triage for affected dates
  - Scoped to single date, all strategies (fast: ~2.5-10s)
- Error handling: Recompute failures are logged but don't fail the main operation
- Performance validated: All operations are fast enough to automate (see plan document)
**Status**: ✅ Fully implemented and working

## Documentation

### 22. Complete Transform Documentation
**Location**: `docs/ingestion_v1.md` (lines 329-332)  
**Enhancement**: Finalize transform specs:
- `docs/transform_mtm.md`
- `docs/transform_nav.md`
- `docs/transform_triage.md`
- `docs/transform_blotter.md`  
**Priority**: Low

---

## Quick Reference by Priority

### High Priority
- ✅ State Code Change Performance Optimization (#4) - **COMPLETED**
- ✅ Auto-Trigger Recompute After Data Changes (#21) - **COMPLETED**
- ✅ Underlyings IV History Ingestion (#10) - **COMPLETED** (manual)
- IBKR API Integration for IV History & Spot Prices (#10a) - **CRITICAL** for accurate ITM calculations
- Automated Flex Ingestion (#9)
- Automated Tests (#20)

### Medium Priority
- Roll Trade Auto-Detection (#1)
- Trade Validation & Discrepancy Detection (#3)
- Triage Rules Database Persistence (#5)
- Decision-Making Assistant (AI Integration) (#13)
- Manual Linking UI (#14)
- Endpoint Regression Tests (#18)
- Data Quality Reports (#19)

### Low Priority
- Trade Decision Timeout/Resolution (#2)
- Future Triggers (Underlying/Account/Time-based) (#6, #7, #8)
- Exercises/Assignments Ingestion (#11)
- Cash Transactions Ingestion (#12)
- Merged/Archive View (#15)
- Position Lifecycle Modeling (#16)
- Additional Trade Fields (#17)
- Complete Transform Documentation (#22)

