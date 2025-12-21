# Daily Ingestion Test Plan - Data-Driven

**Current System State**: Latest date is `2025-11-19`  
**Available Data**: Daily positions and trades from `2025-11-20` through `2025-12-09`

This plan is tailored to the actual data you have, identifying which test scenarios can be validated with each day's upload.

---

## Data Analysis Summary

### Days with Trading Activity
- **2025-11-20**: Assignment (37 contracts), expirations, stock additions
- **2025-11-21**: Expirations, final assignment
- **2025-11-24 to 2025-12-01**: No trades (position value changes only)
- **2025-12-02**: Major changes - stock reduction, option additions
- **2025-12-03**: Continued option additions
- **2025-12-04 to 2025-12-09**: No trades (position value changes only)

### Key Test Opportunities
1. **Assignment Risk** (2025-11-20): GLXY 21NOV25 40P assignment
2. **Expirations** (2025-11-21): Multiple option expirations
3. **Stock Quantity Changes** (2025-12-02): IBIT stock reduction (5500 → 3000)
4. **Option Quantity Changes** (2025-12-02, 2025-12-03): Multiple option additions
5. **Multiple Position Changes** (2025-12-02): Strategy-level aggregation
6. **Monitor/Dismiss Persistence** (2025-11-24 to 2025-12-09): Days with no trades

---

## Test Results Tracking

> **Note**: This section will be updated as we work through each day's testing. Document actual outcomes, bugs found, and fixes applied.

### Day 1 Results (2025-11-20)
**Status**: ✅ Strategy Linking Fixed, Triage Results Verified  
**Date Tested**: 2025-01-XX  
**Tester**: User

**Issues Found**:
- **CRITICAL**: After ingesting 2025-11-20 data, strategy list shows individual position-level strategies instead of merged strategies
  - Confirmed strategies (e.g., "IBIT 260918", "GLXY 260918") exist and are correct
  - Strategy list page shows position-level strategies (e.g., "IBIT 260918C00060000 2026-09-18") instead
  - Root cause: When positions are re-ingested, they lose their `strategyId` linkage
  - Auto-linking creates new position-level strategies instead of finding existing merged strategies
  - Performance: 24 seconds for positions ingestion is acceptable (32 positions with recompute)

**Fixes Applied**:
- **Fix 1**: Updated `findOrCreateStrategyFromPosition` to exclude merged strategies and prioritize strategies with existing positions
- **Fix 2**: Updated `deriveStrategyKeyFromPosition` to extract underlying ticker from option symbols (e.g., "IBIT" from "IBIT  260918C00060000") instead of using the full symbol, so it matches merged strategy keys like "IBIT 260918"
- **Fix 3** (Better approach): Updated `autoLinkPositionsToStrategies` to match positions by `conid` first - if a position with the same `conid` already has a `strategyId`, use that strategy. This preserves strategy linkage across snapshot dates and only falls back to key derivation for truly new positions.
- **Fix 4**: Updated merge process to run recompute in background (non-blocking) for better UX
- **Fix 5**: Added browser notification when background recompute completes
- **Fix 6**: Combined suggested and confirmed strategies into single table, distinguished by status (draft vs open/closed)

**Test Results**:
- [x] Assignment risk detection (GLXY 251121P00040000) - ✅ **PASS** - Shows as `monitor` severity (was set to monitor previously)
- [x] QUANTITY_CHANGE detection - ✅ **PASS** - Detected for:
  - GLXY-STK (stock addition: 40000 → 43700)
  - IBIT 260918 (multiple option positions changed)
  - GLXY 251121 (multiple option positions changed)
- [x] Strategy-level aggregation - ✅ **PASS** - QUANTITY_CHANGE triggers are at strategy level, not individual positions
- [ ] Record pending TRADE action - _[To test]_
- [ ] Strategy confirmation workflow - _[To test - PROVIDE_STRATEGY_METADATA triggers present]_
- [x] MONITOR action - ✅ **PASS** - GLXY 251121P00040000 shows `monitor` severity (override working)
- [ ] DISMISS action - _[To test]_

**Triage Results Analysis** (2025-11-20):
✅ **All results look correct!**

**Expected Triggers Found**:
- ✅ **QUANTITY_CHANGE (urgent)**: GLXY-STK, IBIT 260918, GLXY 251121 - All correct
- ✅ **REVIEW_SIZE (urgent)**: GLXY-STK (54.4% NAV) - Correct, above 25% threshold
- ✅ **REVIEW_SIZE (info)**: IBIT-STK, HOOD-STK, TSLA-STK - Correct, below urgent threshold
- ✅ **REVIEW_DTE (attention)**: GLXY 251121 positions (1 DTE, expiring next day) - Correct
- ✅ **ASSIGNMENT_RISK≤14_DTE (monitor)**: GLXY 251121P00040000 - Correct, shows monitor override is working
- ✅ **ITM_LONG (info)**: TSLA 260618C00350000 - Correct, long call that's ITM
- ✅ **PROVIDE_STRATEGY_METADATA (attention)**: Multiple strategies - Correct, need metadata/confirmation

**No Issues Found**: All triggers match expected behavior based on the data!

---

## Day-by-Day Test Plan

### Day 1: 2025-11-20 - Assignment & Expiration Testing

**Upload:**
- `2025-11-20_positions.csv`
- `2025-11-20_trades.csv`
- Underlyings IV history for 2025-11-20

**Expected Changes:**
- GLXY stock: 40000 → 43700 (added 3700 shares)
- GLXY 21NOV25 40P: -38 → -1 (37 contracts assigned)
- Multiple option trades executed
- GLXY 21NOV25 20P, 45C, 50C expiring next day

**Test Scenarios:**

#### 1.1 Assignment Risk Detection
1. Before recompute, check if GLXY 21NOV25 40P has assignment risk trigger
2. Verify:
   - Position is SHORT, ITM, DTE <= 14 (expires 2025-11-21)
   - **ASSIGNMENT_RISK≤14_DTE** trigger appears (severity: `urgent`)
   - Notes indicate assignment risk
3. Test actions:
   - **TRADE**: Record defensive action (roll, close, hedge)
   - **MONITOR**: Set 3-day monitor period
   - **DISMISS**: Dismiss if acceptable

#### 1.2 QUANTITY_CHANGE Detection
1. Recompute Day 1
2. Verify **QUANTITY_CHANGE** triggers for:
   - GLXY stock: 40000 → 43700 (trade stage: "add")
   - GLXY 21NOV25 40P: -38 → -1 (trade stage: "reduce" - assignment)
   - Other option positions that changed
3. Check strategy-level aggregation:
   - If multiple positions in same strategy changed, verify single strategy-level trigger
   - Notes should aggregate all changes

#### 1.3 Record Pending TRADE Action
1. Find a position-level trigger (e.g., **REVIEW_DTE**, **SIGMA**, or **ASSIGNMENT_RISK**)
2. Click Actions → Trade
3. Record trade decision:
   - Trade Reason: "Testing reconciliation workflow"
   - Trade Stage: "close" or "reduce"
   - Verify default quantities are negative (to close)
4. Submit
5. Verify:
   - Blotter entry created with `severityOverride = 'pending'`
   - Triage record severity → `pending`
   - `completed = false`

#### 1.4 Strategy Confirmation
1. Find **CONFIRM_STRATEGIES** triggers
2. Confirm at least one strategy with full metadata
3. Verify:
   - Strategy confirmed
   - Triage record → `complete`
   - Strategy appears in `/strategies` page

#### 1.5 Position-Level Triggers
1. Check for:
   - **REVIEW_DTE** (options with DTE <= 30)
   - **SIGMA** triggers (if IV data available)
   - **ITM** triggers (if spot data available)
2. Test MONITOR action:
   - Set 7-day monitor period
   - Verify `overrideExpiresDate` = 2025-11-27
   - Verify severity → `monitor`
3. Test DISMISS action:
   - Verify severity → `info`
   - Verify `overrideExpiresDate` = null

---

### Day 2: 2025-11-21 - Expiration & Reconciliation Testing

**Upload:**
- `2025-11-21_positions.csv`
- `2025-11-21_trades.csv`
- Underlyings IV history for 2025-11-21

**Expected Changes:**
- GLXY stock: 43700 → 43800 (added 100 shares)
- GLXY 21NOV25 options expired (20P, 45C, 50C) - quantities → 0
- GLXY 21NOV25 40P: -1 → 0 (final assignment, then expired)
- No new option positions opened

**Test Scenarios:**

#### 2.1 TRADE Action Reconciliation
1. **Before recompute**, verify pending TRADE action from Day 1 still shows as `pending`
2. Recompute Day 2
3. Verify reconciliation:
   - If pending TRADE was for a position that changed quantity:
     - Blotter entry `severityOverride` → `complete`
     - Blotter entry `completed` → `true`
     - Triage record severity → `complete`
     - **No QUANTITY_CHANGE trigger** for that position/strategy
   - If pending TRADE was for a position that didn't change:
     - Remains `pending` (not reconciled yet)

#### 2.2 Expiration Handling
1. Verify positions that expired (quantities → 0):
   - GLXY 21NOV25 20P, 45C, 50C should show quantity = 0
   - GLXY 21NOV25 40P should show quantity = 0
2. Check for **QUANTITY_CHANGE** triggers:
   - Trade stage should be "close" (quantity → 0)
   - Notes should indicate expiration
3. Verify no false triggers:
   - Expired positions shouldn't generate DTE, SIGMA, or ITM triggers

#### 2.3 QUANTITY_CHANGE Without Pending TRADE
1. Find a position that changed but had NO pending TRADE action
2. Verify **QUANTITY_CHANGE** trigger appears (severity: `urgent`)
3. Click Actions → Update
4. Fill in:
   - Trade Reason: "Assignment and expiration"
   - Trade Stage: (auto-detected, should be "close" for expirations)
5. Submit
6. Verify:
   - Blotter entry created
   - Triage record severity → `complete`

#### 2.4 Monitor Expiration Check
1. Check Day 1 triggers that were set to MONITOR
2. Verify:
   - If monitor period hasn't expired: severity remains `monitor`
   - If monitor period expired: severity reverts to computed value (if trigger still applies)

---

### Day 3: 2025-11-24 - Monitor Persistence & Override Testing

**Upload:**
- `2025-11-24_positions.csv`
- `2025-11-24_trades.csv` (likely empty - just headers)
- Underlyings IV history for 2025-11-24

**Expected Changes:**
- No quantity changes (no trades)
- Position values changed (mark-to-market)
- Same positions, different prices

**Test Scenarios:**

#### 3.1 Monitor Expiration
1. If any triggers were set to MONITOR on Day 1 with 3-day period:
   - Monitor period should expire on 2025-11-23
   - On Day 3 (2025-11-24), verify:
     - If trigger criteria still applies: severity reverts to computed value
     - If trigger criteria no longer applies: no triage record (naturally resolved)

#### 3.2 DISMISS Override Persistence
1. Find triggers that were DISMISSed on Day 1 or Day 2
2. Recompute Day 3
3. Verify:
   - If trigger criteria still applies: severity remains `info` (override persists)
   - Override is permanent (`overrideExpiresDate = null`)
   - No new triage record created (override prevents it)

#### 3.3 State Code Change Detection
1. If strategies have state code changes:
2. Verify **STATE_CODE_CHANGE** triggers appear
3. Notes should show: "State code changed from X to Y"
4. Test actions:
   - **TRADE**: Record adjustment decision
   - **MONITOR**: Set monitoring period
   - **DISMISS**: Dismiss if false positive

#### 3.4 No False QUANTITY_CHANGE Triggers
1. Verify NO **QUANTITY_CHANGE** triggers (no quantity changes)
2. Position values changed but quantities stayed same
3. System should correctly distinguish value changes from quantity changes

---

### Days 4-6: 2025-11-25 to 2025-12-01 - Continuity Testing

**Upload:**
- Daily positions and trades files (likely no trades)
- Underlyings IV history for each day

**Expected Changes:**
- No quantity changes (no trades)
- Position values change daily (mark-to-market)

**Test Scenarios:**

#### 4.1 Override Persistence Across Multiple Days
1. Verify DISMISSed triggers remain dismissed
2. Verify MONITOR triggers:
   - Track expiration dates
   - Verify expiration behavior when dates pass
3. Verify completed triggers remain `complete`

#### 4.2 Time-Bound vs Historical Triggers
1. Verify:
   - **QUANTITY_CHANGE** and **CONFIRM_STRATEGIES** triggers from previous days persist (historical)
   - Position-level triggers (DTE, SIGMA, ITM) only show for latest date (time-bound)
   - Old position-level triggers don't persist

#### 4.3 Natural Resolution
1. If trigger criteria no longer applies (e.g., DTE > 30, position closed):
2. Verify:
   - No triage record created
   - Trigger naturally resolved
   - No false positives

---

### Day 7: 2025-12-02 - Major Quantity Changes & Strategy Aggregation

**Upload:**
- `2025-12-02_positions.csv`
- `2025-12-02_trades.csv` (39 lines - significant trading)
- Underlyings IV history for 2025-12-02

**Expected Changes:**
- IBIT stock: 5500 → 3000 (reduced 2500 shares) - **MAJOR CHANGE**
- IBIT 260918C00060000: 20 → 40 (doubled)
- IBIT 260918P00045000: -20 → -40 (doubled)
- IBIT 260918C00090000: -20 → -40 (doubled)
- Multiple option trades executed

**Test Scenarios:**

#### 7.1 Stock Reduction Detection
1. Recompute Day 7
2. Verify **QUANTITY_CHANGE** trigger for IBIT stock:
   - Trade stage: "reduce" (5500 → 3000)
   - Severity: `urgent`
   - Notes show quantity change
3. Test UPDATE action:
   - Trade Reason: "Reducing position size"
   - Trade Stage: "reduce"
   - Submit and verify completion

#### 7.2 Strategy-Level Aggregation
1. If IBIT options are in same strategy as IBIT stock:
2. Verify:
   - Single **QUANTITY_CHANGE** trigger at strategy level
   - Notes aggregate all changes: "4 position(s) changed: IBIT: 5500 → 3000 (reduce); IBIT 260918C00060000: 20 → 40 (add); ..."
   - All position changes captured in one trigger

#### 7.3 Multiple Option Additions
1. Verify individual position changes:
   - IBIT 260918C00060000: 20 → 40 (add)
   - IBIT 260918P00045000: -20 → -40 (add to short)
   - IBIT 260918C00090000: -20 → -40 (add to short)
2. If strategy-level: verify aggregation
3. If position-level: verify individual triggers

#### 7.4 TRADE Action Before Recompute
1. **Before recompute**, record a TRADE action for one of the positions that will change
2. Recompute Day 7
3. Verify:
   - TRADE action reconciles to `complete`
   - No QUANTITY_CHANGE trigger for that position/strategy
   - Other positions still show QUANTITY_CHANGE triggers

---

### Day 8: 2025-12-03 - Continued Additions & Partial Reconciliation

**Upload:**
- `2025-12-03_positions.csv`
- `2025-12-03_trades.csv` (31 lines)
- Underlyings IV history for 2025-12-03

**Expected Changes:**
- IBIT 260918C00060000: 40 → 50 (added 10)
- IBIT 260918P00045000: -40 → -50 (added 10 short)
- IBIT 260918C00090000: -40 → -50 (added 10 short)
- Multiple option trades executed

**Test Scenarios:**

#### 8.1 Continued Position Additions
1. Recompute Day 8
2. Verify **QUANTITY_CHANGE** triggers:
   - Trade stages: "add"
   - Notes show quantity changes
3. If strategy-level: verify aggregation of all changes

#### 8.2 Partial Fill Scenario
1. If a TRADE action was recorded on Day 7 for a larger quantity:
2. Verify:
   - TRADE action reconciles to `complete` when quantity changes
   - If only partial fill: new QUANTITY_CHANGE trigger appears for remaining change
   - Both records exist in blotter

#### 8.3 Multiple Pending TRADE Actions
1. If multiple TRADE actions were recorded for same position/strategy:
2. Verify:
   - All pending TRADE actions reconcile when quantity changes
   - All marked as `complete`
   - No duplicate QUANTITY_CHANGE triggers

---

### Days 9-11: 2025-12-04 to 2025-12-09 - Final Validation

**Upload:**
- Daily positions and trades files (likely no trades)
- Underlyings IV history for each day

**Expected Changes:**
- No quantity changes (no trades)
- Position values change daily

**Test Scenarios:**

#### 9.1 Comprehensive Review
1. Review entire triage queue
2. Verify:
   - All pending TRADE actions reconciled
   - All monitor periods tracked correctly
   - All dismissed triggers remain dismissed
   - All completed triggers show `complete`
   - Historical triggers (QUANTITY_CHANGE, CONFIRM_STRATEGIES) persist
   - Time-bound triggers only show for latest date

#### 9.2 Blotter Audit Trail
1. Check `/blotter` page
2. Verify:
   - Complete audit trail of all actions
   - All TRADE actions properly reconciled
   - No duplicate entries
   - All metadata captured correctly

#### 9.3 Data Quality Checks
1. Verify:
   - No false positive triggers
   - No missing triggers (when data available)
   - Accurate severity calculations
   - Proper override persistence
   - Clean reconciliation flow

---

## Test Checklist by Day

### Day 1 (2025-11-20)
- [ ] Assignment risk detection (GLXY 21NOV25 40P)
- [ ] QUANTITY_CHANGE detection (stock additions, option changes)
- [ ] Strategy-level aggregation (if multiple positions in strategy)
- [ ] Record pending TRADE action
- [ ] Strategy confirmation workflow
- [ ] MONITOR action (7-day period)
- [ ] DISMISS action (permanent override)

### Day 2 (2025-11-21)
- [ ] TRADE action reconciliation (pending → complete)
- [ ] Expiration handling (quantities → 0)
- [ ] QUANTITY_CHANGE for expirations (trade stage: "close")
- [ ] No false triggers for expired positions
- [ ] Monitor expiration check

### Day 3 (2025-11-24)
- [ ] Monitor expiration (3-day period from Day 1)
- [ ] DISMISS override persistence
- [ ] State code change detection
- [ ] No false QUANTITY_CHANGE triggers (no quantity changes)

### Days 4-6 (2025-11-25 to 2025-12-01)
- [ ] Override persistence across multiple days
- [ ] Time-bound vs historical trigger distinction
- [ ] Natural resolution of triggers

### Day 7 (2025-12-02)
- [ ] Stock reduction detection (IBIT: 5500 → 3000)
- [ ] Strategy-level aggregation (4 positions changed)
- [ ] Multiple option additions
- [ ] TRADE action reconciliation
- [ ] UPDATE action for QUANTITY_CHANGE

### Day 8 (2025-12-03)
- [ ] Continued position additions
- [ ] Partial fill scenario
- [ ] Multiple pending TRADE actions reconciliation

### Days 9-11 (2025-12-04 to 2025-12-09)
- [ ] Comprehensive triage queue review
- [ ] Blotter audit trail verification
- [ ] Data quality checks
- [ ] Performance validation

---

## Key Test Scenarios Summary

### Core Workflows
1. **TRADE → Pending → Reconciliation**: Day 1 record TRADE, Day 2 verify reconciliation
2. **QUANTITY_CHANGE without pending TRADE**: Day 2 expirations, Day 7 stock reduction
3. **Strategy-level aggregation**: Day 7 (multiple positions in strategy change)
4. **Monitor expiration**: Day 3 (3-day period from Day 1)
5. **DISMISS persistence**: Days 3-11 (verify permanent override)

### Edge Cases
1. **Expirations**: Day 2 (quantities → 0)
2. **Assignment**: Day 1 (37 contracts assigned)
3. **Stock reduction**: Day 7 (major position size change)
4. **Multiple additions**: Day 7-8 (option positions doubled/tripled)
5. **No trades days**: Days 3-6, 9-11 (verify no false QUANTITY_CHANGE)

### Data Quality
1. **No false positives**: Verify triggers only fire when appropriate
2. **No missing triggers**: Verify all changes detected
3. **Accurate reconciliation**: Verify pending TRADE actions reconcile correctly
4. **Override persistence**: Verify MONITOR/DISMISS overrides persist correctly

---

## Success Criteria

✅ All TRADE actions reconcile properly  
✅ QUANTITY_CHANGE triggers detect all quantity changes  
✅ Strategy-level aggregation works correctly  
✅ Monitor periods expire and revert correctly  
✅ DISMISS overrides persist permanently  
✅ No false positive triggers  
✅ No missing triggers (when data available)  
✅ Expirations handled correctly  
✅ Assignment risk detected correctly  
✅ Historical vs time-bound triggers work correctly  

---

## Notes

- **Underlyings IV History**: Ensure you upload IV data for each day to test SIGMA and ITM triggers
- **Assignment Risk**: Day 1 has a real assignment scenario (GLXY 21NOV25 40P)
- **Expirations**: Day 2 has multiple option expirations
- **Major Changes**: Day 7 has the most significant quantity changes (stock reduction + option additions)
- **No Trade Days**: Use Days 3-6 and 9-11 to test override persistence and natural resolution
