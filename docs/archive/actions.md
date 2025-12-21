# Actions & Triggers Specification
Version 0.1 — 2025-01-XX  
Author: Nick

This document defines all triggers, rules, and actions in the Trade Journal system. Each trigger specifies:
- **Context**: Where the trigger applies (position, strategy, underlying, account)
- **Rule**: The name/identifier of the trigger
- **Rule Criteria**: The logic that determines when the trigger fires, and the severity value that applies. After computing severity from rule criteria, check `blotter_actions` for active severity override from previous actions (Monitor/Dismiss).
- **Severity**: The priority level (urgent, attention, monitor, info, pending, complete)
  - **urgent**: needs immediate action (unlikely a Dismiss action)
  - **attention**: needs careful consideration (unlikely to be a Dismiss action)
  - **monitor**: trigger that has received a Monitor action.
  - **info**: trigger that has received a Dismiss action.
  - **pending**: trigger that has received a Trade action but has not yet been validated and reconciled by ingestion of trades records in trades schema.
  - **complete**: trigger will no longer fire due to Trade or Update action.
- **Actions**: Available options to act on the triggered item
  - 4 types of action:
    - **Trade** (close, adjust, hedge, roll, reduce, add, etc.)
      - Record trade decision i.e. change in quantity of positions and other metadata. Set severity to 'pending'.
      - Auto-validate and reconcile trade decision by detecting quantity changes in subsequent position snapshots. Set severity to 'complete'.
      - **Reconciliation Process**: When `QUANTITY_CHANGE` trigger detects a quantity change for a position/strategy that has a pending TRADE action:
        1. Match pending TRADE blotter actions by `positionId` or `strategyId`
        2. Update blotter action `severityOverride` from 'pending' to 'complete'
        3. Update associated triage record `severity` from 'pending' to 'complete'
        4. Mark blotter action as `completed = true`
        5. **No new QUANTITY_CHANGE triage record is created** - prevents duplicate blotter entries
      - **If no pending TRADE action exists**: A QUANTITY_CHANGE triage record is created, allowing user to capture trade metadata via UPDATE action
      - If a discrepancy is detected between recorded decision and actual quantity change, the `QUANTITY_CHANGE` trigger will still fire (allowing user to capture the actual trade metadata)
      - If Trade decision is to close, strategy status is set to 'pending closed' until validated and reconciled by quantity change detection, then set to 'closed'.
    - **Monitor** (No immediate action. Set trigger severity to 'monitor' and specify the monitor period in days (or 'until date'). At end of monitor period, change severity to 'attention' assuming rule criteria still applies.)
    - **Dismiss** (No action required. Set trigger severity to 'info'.)
    - **Update** (Enter metadata or complete forms as required. Set trigger severity to 'complete' on completion.)
- **Completion Criteria**: How the trigger is resolved (in all cases)
  - Either no action is taken, or an action is taken which creates a blotter entry.
  - On future snapshot dates, the trigger is re-evaluated:
    - **If Rule Criteria no longer applies**: No triage record created (trigger resolved naturally)
    - **If Rule Criteria still applies**: 
      1. Compute severity from Rule Criteria
      2. Check for active severity override in `blotter_actions` (see "Severity Override Mechanism" section)
      3. If override exists and not expired: use override severity
      4. If override expired or doesn't exist: use computed severity
      5. Create triage record with final severity

---

## Position-Level Triggers

### 1. DTE Flags - Days to Expiry

**Context**: `position`  
**Rule**: `DTE<=21_SHORT`, `DTE<=7_LONG`, `DTE<=30`
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- `quantity != 0`

**Severity Logic** (evaluated in priority order):
1. `DTE<=21 SHORT`: If `side = 'SHORT'` AND `DTE <= 21` → `attention`
2. `DTE<=7 LONG`: Else if `side = 'LONG'` AND `DTE <= 7` → `attention`
3. `DTE<=30`: Else if `DTE <= 30` → `info`

**Actions**:
- `TRADE:ROLL` - Roll the position to a later expiry. Select the position and quantity change. Specify the replacemenet position and quantity.
- `TRADE:CLOSE` - Close the position entirely. Confirm the position and quantity change (auto-calculated).
- `MONITOR` - Specify the monitor period in days/until date.
- `DISMISS`

**Implementation**: `src/lib/derived/triage.ts:178-190` (DTE severity logic)

### 2. Sigma Flags - Distance to Strike

**Context**: `position`  
**Rule**: `SIGMA_0.5_SHORT`, `SIGMA_0.5_LONG`, `SIGMA_1.0`  
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- `sigma_to_strike = |ln(S/K)| / (σ * sqrt(T))`
  - Where S = spot, K = strike, σ = iv30, T = DTE/365
- Requires `underlyings_iv_history.iv30` for the underlying on snapshot date

**Severity Logic** (evaluated in priority order):
1. `SIGMA_0.5_SHORT`: If `sigma_to_strike <= 0.5` AND `side = 'SHORT'` → `urgent`
2. `SIGMA_0.5_LONG`: Else if `sigma_to_strike <= 0.5` → `attention`
3. `SIGMA_1.0`: Else if `0.5 < sigma_to_strike <= 1.0` → `info`

**Actions**:
- `TRADE:ROLL` - Roll the position to a later expiry. Select the position and quantity change. Specify the replacemenet position and quantity.
- `TRADE:CLOSE` - Close the position entirely. Confirm the position and quantity change (auto-calculated).
- `MONITOR` - Specify the monitor period in days/until date.
- `DISMISS` - Only an option if severity <> `info`

**Implementation**: `src/lib/derived/triage.ts:147-148` (flagSigma05, flagSigma10), `src/lib/derived/triage.ts:172-180` (severity logic)

---

### 3. Assignment Risk Flags

**Context**: `position`  
**Rule**: `ASSIGNMENT_RISK`  
**Rule Criteria**: 
- `asset_class = 'OPT'` (Option position)
- `is_itm = true` (spot > strike for calls, spot < strike for puts)
- `side = 'SHORT'` (Short option)

**Severity Logic** (evaluated in priority order):
1. If `DTE <= 14` → `urgent`
2. Else if `DTE <= 30` → `attention`
3. Else → `info`

**Actions**:
- `TRADE:ROLL` - Roll the position to a later expiry. Select the position and quantity change. Specify the replacemenet position and quantity.
- `TRADE:CLOSE` - Close the position entirely. Confirm the position and quantity change (auto-calculated).
- `MONITOR` - Specify the monitor period in days/until date.
- `DISMISS`

**Implementation**: `src/lib/derived/triage.ts:151-161` (flagAssignmentUrgent, flagAssignmentAttention), `src/lib/derived/triage.ts:165-171` (severity logic)

---

### 4. ITM Flag

**Context**: `position`  
**Rule**: `LONG_ITM`  
**Rule Criteria**: 
- `asset_class = 'OPT'` (Option position)
- `is_itm = true` (spot > strike for calls, spot < strike for puts)
- `side = 'LONG'` (Long option)

**Severity Logic**: 
- `info`

**Actions**: 
- None

**Implementation**: `src/lib/derived/triage.ts:49-63` (computeIsItm), `src/lib/derived/triage.ts:122` (usage), `src/lib/derived/triage.ts:167-170` (severity)

---

## Strategy-Level Triggers

### 7. `CONFIRM_STRATEGIES` - Unconfirmed Auto-Derived Strategy

**Context**: `strategy`  
**Rule**: `CONFIRM_STRATEGIES`  
**Rule Criteria**: 
- Strategy exists with `is_auto = true`
- `confirmed_at IS NULL`
- Strategy has positions on the snapshot date

**Severity**: `urgent`

**Actions**:
- `UPDATE` - Navigate to admin/strategies to confirm strategy.
  - Review auto-derived strategy and confirm it should be tracked
  - Sets `confirmed_at` timestamp
  - Requires selecting `strategy_type` during confirmation (links to playbook items)
  - `is_auto` is set to `false`
  - Severity set to `complete`

**Implementation**: `src/lib/derived/triage.ts:317-329`

---

### 7b. `PROVIDE_STRATEGY_METADATA` - Missing Required Fields

**Context**: `strategy`  
**Rule**: `PROVIDE_STRATEGY_METADATA`  
**Rule Criteria**: 
- Strategy has `confirmed_at IS NOT NULL` (already confirmed)
- Any of the following fields are NULL/not set:
  - `strategy_type`
  - `thesis`
  - `profit_rules`
  - `defense_rules`
  - `time_rules`
- Note: `strategy_key` is always set (NOT NULL constraint)

**Severity**: `urgent`

**Actions**:
- `UPDATE` - Navigate to admin/strategies to complete metadata
  - Fill in missing fields: `strategy_type`, `thesis`, `profit_rules`, `defense_rules`, `time_rules`

**Completion Criteria**: 
- All required fields are set (not NULL):
  - `strategy_type`
  - `thesis`
  - `profit_rules`
  - `defense_rules`
  - `time_rules`
- Severity set to `complete`

**Implementation**: `src/lib/derived/triage.ts:331-352`

---

### 8. `REVIEW_SIZE` - Strategy Size vs NAV (Merged)

**Context**: `strategy`  
**Rule**: `REVIEW_SIZE`  
**Rule Criteria**: 
- Strategy has `pct_nav_abs_notional >= 0.1` (10% of NAV)
- Based on `strategy_metrics_snapshots.pct_nav_abs_notional`

**Severity Logic**:
- If `pct_nav_abs_notional >= 0.5` (50% of NAV) → `urgent`
- Else if `pct_nav_abs_notional >= 0.25` (25% of NAV) → `attention`
- Else if `pct_nav_abs_notional >= 0.1` (10% of NAV) → `info`

**Actions**:
- `TRADE` - Confirm the position and quantity change.
- `MONITOR` - Specify the monitor period in days/until date.
- `DISMISS` - Only an option if severity <> `info`

**Implementation**: `src/lib/derived/triage.ts:355-398`

---

### 9. `REVIEW_COMPLEXITY` - Strategy Complexity

**Context**: `strategy`  
**Rule**: `REVIEW_COMPLEXITY`  
**Rule Criteria**: 
- Strategy has `num_open_positions > complexity_threshold` (default: 10)
- Based on `strategy_metrics_snapshots.num_open_positions`

**Severity**: `info`

**Actions**: 
- None

**Implementation**: `src/lib/derived/triage.ts:401-413`

---

### 10. `STATE_CODE_CHANGE` - State Code Transition

**Context**: `strategy`  
**Rule**: `STATE_CODE_CHANGE`  
**Rule Criteria**: 
- Strategy has `strategy_type` set
- State code changed between previous and current snapshot dates
- State code computed via `computeStateCode()` based on playbook criteria:
  - `PnlPctOfCost` (unrealized PnL / entry notional * 100)
  - `MaxDTE` (maximum days to expiry across all positions)
  - `WorstShortSigma` (minimum sigma-to-strike for short positions)
  - `AssignmentRisk` (boolean from position-level triage)
  - `Legs ITM` (boolean from position-level triage)

**Severity**: `urgent`

**Actions**:
- `TRADE` - Confirm the position and quantity change.
- `MONITOR` - Specify the monitor period in days/until date.
- `DISMISS` - Only an option if severity <> `info`

**Implementation**: 
- `src/lib/derived/stateCode.ts` - State code computation framework
- `src/lib/derived/triage.ts:518-545` - State code change detection in triage computation
- Uses optimized `detectStateCodeChangeFromStored()` which reads stored state codes from `strategy_metrics_snapshots` instead of recomputing (fast performance)

**Performance Note**: State codes are already computed and stored during strategy metrics computation. Change detection simply compares stored values, making it fast enough to run during triage computation without performance concerns.

---

### 11. `QUANTITY_CHANGE` - Position/Strategy Quantity Change Detected

**Context**: `position` (initially), `strategy` (once positions are linked)  
**Rule**: `QUANTITY_CHANGE`  
**Rule Criteria**: 
- Quantity change detected by comparing positions between consecutive snapshot dates
- For position-level: Compare position by `conid` (broker's unique instrument identifier) across snapshot dates
- For strategy-level: Aggregate quantity changes across all positions in a strategy
- Change detected if:
  - Position exists on current snapshot but not on previous snapshot (new position) → `tradeStage = 'open'`
  - Position exists on previous snapshot but not on current snapshot, or quantity went to zero → `tradeStage = 'close'`
  - Position quantity increased (positive change) → `tradeStage = 'add'`
  - Position quantity decreased but not to zero (negative change) → `tradeStage = 'reduce'`
  - Position closed and new position opened with same underlying but different expiry/strike → `tradeStage = 'roll'` (requires pattern matching)
  - New position opened with different characteristics while existing positions remain → `tradeStage = 'hedge'` (requires pattern matching)

**Severity**: `urgent`

**Actions**:
- `UPDATE` only - Capture trade metadata and justification
  - **Required fields**:
    - `tradeReason` (text) - Explanation for the trade action taken
    - `tradeStage` (select: 'open', 'close', 'hedge', 'roll', 'reduce', 'add') - Auto-detected but editable
  - **Optional fields** (for opening trades):
    - `thesis` (text) - Entry thesis and reasoning
    - `profitRules` (text) - When to take profits
    - `defenseRules` (text) - How to defend the position
    - `timeRules` (text) - Time-based exit criteria
  - On completion, creates two blotter entries:
    1. Trade entry: Records the actual trade/quantity change
    2. Metadata entry: Records the captured metadata (trade reason, stage, thesis, rules)

**Completion Criteria**: 
- All required fields (`tradeReason`, `tradeStage`) are filled
- Severity set to `complete`
- Blotter entries created

**Implementation Notes**:
- **Position-level detection**: Initially detect at position level by comparing `conid` across snapshot dates
- **Strategy-level aggregation**: Once positions are linked to strategies, optionally create strategy-level records if multiple positions in a strategy changed
- **Auto-detection logic**:
  - `open`: Position with `conid` exists on current snapshot but not on previous snapshot
  - `close`: Position with `conid` existed on previous snapshot with non-zero quantity, now has zero quantity or doesn't exist
  - `add`: Quantity increased (positive delta)
  - `reduce`: Quantity decreased but not to zero (negative delta)
  - `roll`: Position closed and new position opened with same underlying but different expiry/strike (requires matching logic)
  - `hedge`: New position opened while existing positions remain (requires pattern matching)
- **Matching positions across snapshots**: Use `conid` as the primary matching key (broker's unique instrument identifier)
- **Reconciliation with pending TRADE actions**:
  - When a quantity change is detected, automatically check for pending TRADE actions for the same position/strategy
  - **If pending TRADE action found**:
    - Update the pending TRADE action's `severityOverride` to 'complete' and mark as `completed = true`
    - Update the associated triage record's `severity` to 'complete'
    - **Do NOT create a new QUANTITY_CHANGE triage record** (prevents duplicate blotter entries)
    - Result: Single blotter entry transitions from 'pending' to 'complete'
  - **If no pending TRADE action found**:
    - Create QUANTITY_CHANGE triage record (user can capture metadata via UPDATE action)
    - Result: New blotter entry created when user updates QUANTITY_CHANGE trigger
  - This completes the reconciliation flow: TRADE action (pending) → Quantity change detected → TRADE action (complete) - **no duplicate entries**
- **Edge cases**:
  - First snapshot date: No previous snapshot to compare → skip (no change to detect)
  - Strategy not yet confirmed: Position-level record created, moves to strategy-level once strategy is confirmed
  - Multiple positions in strategy change: Strategy-level record aggregates all changes
  - Pending TRADE action exists: Automatically reconciled when quantity change is detected
  - **Trade decision recorded but never executed**: TRADE action remains 'pending' indefinitely. Consider manual resolution or timeout mechanism in future.
  - **Roll trades**: When closing one position and opening another (different `conid`), detected as separate 'close' and 'open' events. User must manually set `tradeStage = 'roll'` to link them. Future enhancement: pattern matching to auto-detect rolls.
  - **Discrepancy between recorded and actual trade**: If recorded TRADE action doesn't match actual quantity change (e.g., recorded "close" but quantity increased), both records exist:
    - Pending TRADE action gets reconciled to 'complete' (indicates intent was recorded)
    - QUANTITY_CHANGE trigger still fires (allows user to capture what actually happened)
    - User can review both records to understand the discrepancy
  - **Multiple pending TRADE actions**: If multiple TRADE actions are recorded before execution, all are reconciled when quantity change is detected. This is intentional - all pending actions for the position/strategy are marked complete.
  - **Partial fills**: If a trade is partially filled across multiple days, each quantity change reconciles the pending TRADE action. The first reconciliation marks it complete; subsequent changes create new QUANTITY_CHANGE records.
  - **Strategy-level TRADE with position-level changes**: Reconciliation works via `strategyId` matching, so strategy-level TRADE actions are reconciled when any position in the strategy changes.

**Implementation**: `src/lib/derived/triage.ts` (functions: `computeQuantityChangeTriageForDate`, `reconcilePendingTradeActions`)

---

## State Code Computation (Playbook-Based)

State codes are computed based on playbook criteria defined in `playbook_items` table. Each strategy type has multiple state codes (e.g., LC1, LC2, LC3, LC4 for "LEAPS long call") and one state code which is always the initial state code when the strategy is opened. `STATE_CODE_CHANGE` occurs whenever there is a change of state code after this initial state code.

### State Code Criteria Evaluation

**Context**: `strategy`  
**Rule**: Dynamic based on `playbook_items.code`  
**Rule Criteria**: 
Evaluated in order of `playbook_items.code` (ascending). First matching criteria wins.

**Supported Criteria Patterns**:
1. **MaxDTE conditions**: `MaxDTE > 90`, `MaxDTE <= 30`, etc.
2. **PnlPctOfCost conditions**: `PnlPctOfCost ≤ 0.3`, `PnlPctOfCost > 0.5`, etc.
3. **WorstShortSigma conditions**: `WorstShortSigma ≤ 0.5σ`, `WorstShortSigma > 1.0σ`, etc.
4. **AssignmentRisk conditions**: `AssignmentRisk = Yes`, `AssignmentRisk ≠ Yes`
5. **ITM conditions**: `ITM = True`, `Legs ITM = Yes`
6. **Exclusion conditions**: `not LC2/LC3/LC4` (excludes specific state codes)

**Severity**: 
- Severity set to urgent only if state code changes. 
- Determined by `playbook_items.default_severity` (if set)

**Implementation**: `src/lib/derived/stateCode.ts:185-348`

---

## Configuration Thresholds

### Position-Level Rule Configuration

**Location**: `/admin/triage` (`src/app/admin/triage/page.tsx`)

**Configurable Thresholds** (stable, rarely changed):
- `dteThreshold` (default: 30 days) - DTE threshold for creating triage records
- `assignmentDteThreshold` (default: 10 days) - DTE threshold for assignment risk
- `sizeAttentionThreshold` (default: 0.15 = 15% of NAV) - Strategy size attention threshold
- `sizeUrgentThreshold` (default: 0.25 = 25% of NAV) - Strategy size urgent threshold
- `complexityThreshold` (default: 10 positions) - Strategy complexity threshold

**Current Implementation**: 
- UI exists at `/admin/triage` for viewing/editing thresholds (admin use only)
- API endpoint: `/api/admin/triage-rules` (validates but doesn't persist yet)
- Rules currently read from `TRIAGE_RULES_V1` constant in `src/lib/derived/triage.ts:13-22`
- **Note**: These thresholds are stable and don't require regular configuration like state code criteria

**Future Enhancement**: 
- Store thresholds in database table (e.g., `triage_rules` or `triage_rule_config`) for persistence
- Load from database during triage computation instead of hardcoded constants
- Support multiple rule sets (currently only `options_v1`)

### State Code Criteria Configuration

**Location**: `/admin/playbook` (`src/app/admin/playbook/page.tsx`)

**Configuration Method**: 
- Uses `CriteriaBuilder` component (`src/components/playbook/CriteriaBuilder.tsx`)
- Criteria stored in `playbook_items.criteria` as text
- Supports complex criteria patterns (see "State Code Criteria Evaluation" section above)

**Configurable Elements**:
- State code criteria (e.g., `MaxDTE > 90`, `PnlPctOfCost ≤ 0.3`)
- Default severity per state code (`playbook_items.default_severity`)
- Checklist items (PrimaryAction, SecondaryAction, RiskNotes)
- Category and context applicability

**Implementation**: 
- Fully implemented with database persistence
- Criteria parsed and evaluated in `src/lib/derived/stateCode.ts`

---

## Action Implementation Details

### Action Button Component
- **Location**: `src/components/triage/TriageActionButtons.tsx`
- **Behavior**: 
  - Actions should be confirmed by a single button, with the nature of the action (Trade/Monitor/Dismiss/Update) and relevant metadata selected in UI options in `src/app/strategies/[strategyId]/page.tsx`.
  - Actions should be implemented at the `src/app/strategies/[strategyId]/page.tsx` level.
  - Context-awareness should present decision workflow and metadata input/selection.
  - Calls `/api/triage/action` to record action
  - Creates blotter entry automatically

### QUANTITY_CHANGE Action Form
- **Location**: `src/components/triage/TriageActionButtons.tsx` (UPDATE action for `QUANTITY_CHANGE` trigger)
- **Form Fields**:
  - **Trade Reason** (text, required) - Explanation for the trade action taken
  - **Trade Stage** (select, required) - Auto-detected but editable:
    - Options: 'open', 'close', 'hedge', 'roll', 'reduce', 'add'
    - Default: Auto-detected based on quantity change pattern
  - **Thesis** (text, optional) - Entry thesis and reasoning (relevant for opening trades)
  - **Profit Rules** (text, optional) - When to take profits (relevant for opening trades)
  - **Defense Rules** (text, optional) - How to defend the position (relevant for opening trades)
  - **Time Rules** (text, optional) - Time-based exit criteria (relevant for opening trades)
- **Blotter Entries Created**:
  1. Trade entry: Records the actual trade/quantity change with `actionType = 'TRADE'`
  2. Metadata entry: Records the captured metadata with `actionType = 'UPDATE'` and `notes` containing trade reason, stage, thesis, rules

---

## Future Triggers (Not Yet Implemented)

### Underlying-Level Triggers
- IV spike detection
- Concentration risk (too much exposure to single underlying)
- Correlation risk

### Account-Level Triggers
- Overall leverage threshold
- Cash balance warnings
- Margin requirements

### Time-Based Triggers
- Weekly review reminders
- Expiry date approaching (calendar-based)
- Earnings date proximity

---

## Notes

1. **State Code Computation**: Currently disabled in triage computation due to performance. Should be:
   - Implemented as background job after snapshot ingestion
   - Or computed on-demand when viewing strategy detail
   - Or cached in `strategy_metrics_snapshots` table

4. **Playbook Integration**: State code changes should link to specific playbook items, showing:
   - Checklist items / notes for context in decision workflow (PrimaryAction, SecondaryAction, RiskNotes)
   - Recommended actions from playbook
   - Historical state code transitions

5. **Severity Override Mechanism**
   
   **Purpose**: Persist user decisions (Monitor/Dismiss) across snapshot dates so that manual severity adjustments survive daily recomputation.
   
   **Schema Changes Required** (to `blotter_actions` table):
   - `positionId: uuid('position_id')` - Reference to position (for position-level triggers)
   - `severityOverride: text('severity_override')` - Override severity value ('info' | 'monitor' | 'attention' | 'urgent')
   - `overrideExpiresDate: date('override_expires_date')` - When override expires (null = permanent)
   - `monitorDays: integer('monitor_days')` - For Monitor actions: days before reverting to 'attention'
   
   **Override Application Flow** (during triage computation):
   1. Rule Criteria evaluated → determines if trigger should fire and computed severity
   2. If trigger fires (`shouldCreate = true`):
      - Query `blotter_actions` for active override matching:
        - `positionId` (for position-level) OR `strategyId` (for strategy-level)
        - `actionDetail IN ('MONITOR', 'DISMISS')`
        - `severityOverride IS NOT NULL`
        - `overrideExpiresDate IS NULL OR overrideExpiresDate >= snapshotDate`
      - If active override found: use `severityOverride` instead of computed severity
      - If override expired: ignore override, use computed severity
   3. If trigger doesn't fire (`shouldCreate = false`): No record created, override irrelevant
   
   **Action Behavior**:
   - **DISMISS**: Creates blotter entry with `severityOverride = 'info'`, `overrideExpiresDate = null` (permanent)
   - **MONITOR**: Creates blotter entry with `severityOverride = 'monitor'`, `overrideExpiresDate = actionDate + monitorDays`, `monitorDays = user_specified_days`
     - After `overrideExpiresDate`, if condition still applies, severity reverts to computed value (typically 'attention')
   - **TRADE**: Creates blotter entry with `severityOverride = 'pending'` initially, then `'complete'` after validation
   - **UPDATE**: Creates blotter entry with `severityOverride = 'complete'` on completion
   
   **Override Matching Logic**:
   - Override matches triage record if ALL of the following are true:
     - `blotter_actions.positionId = triage_records.positionId` (for position-level triggers)
       - OR `blotter_actions.strategyId = triage_records.strategyId` (for strategy-level triggers)
     - AND `blotter_actions.actionDetail IN ('MONITOR', 'DISMISS')`
     - AND `blotter_actions.severityOverride IS NOT NULL`
     - AND (`blotter_actions.overrideExpiresDate IS NULL` OR `blotter_actions.overrideExpiresDate >= snapshotDate`)
     - AND `blotter_actions.triageFlagAtAction = triage_records.recommendedAction`
       - **Critical**: `triageFlagAtAction` stores the `recommendedAction` from the original triage record
       - `recommendedAction` values identify specific rules (e.g., 'REVIEW_DTE', 'WATCH_CLOSELY', 'REVIEW_SIZE', 'CONFIRM_STRATEGIES')
       - Override applies only to the specific rule identified by `recommendedAction`
       - Example: Dismissing 'REVIEW_DTE' only affects DTE flags, not sigma flags ('WATCH_CLOSELY') for the same position
   
   **Understanding `recommendedAction` and `ruleSet`**:
   - **`recommendedAction`**: Identifies the specific rule/trigger (e.g., 'REVIEW_DTE', 'WATCH_CLOSELY', 'REVIEW_SIZE')
     - Used for override matching to ensure rule-specific overrides
     - Each trigger type has a unique `recommendedAction` value
   - **`ruleSet`**: Groups related rules together (e.g., 'options_v1', 'options_v1:size', 'strategy_workflow')
     - Used for organizing rules and preventing conflicts during triage record upserts
     - Not used for override matching (override matching uses `recommendedAction` for specificity)
   
   **Edge Cases**:
   - **Condition no longer applies**: If Rule Criteria no longer met on future snapshot, no triage record created, override ignored (no record to override)
   - **Multiple overrides for same rule**: If multiple overrides exist for same position/strategy + `recommendedAction`, use most recent (ORDER BY createdAt DESC LIMIT 1)
   - **Monitor expiration**: When `overrideExpiresDate` passes, override is ignored. Rule Criteria runs normally and computed severity applies (no override to check)
   - **New action replaces old**: If user takes new action (e.g., Monitor after Dismiss), new override replaces old one for that specific rule (most recent wins)
   - **Different rules, same position**: Overrides are rule-specific. User can dismiss DTE flag ('REVIEW_DTE') while still monitoring sigma flag ('WATCH_CLOSELY') for the same position
   
   **Implementation**: 
   - Modify `computePositionTriageForDate()` and `computeStrategyTriageForDate()` in `src/lib/derived/triage.ts`
   - Add override check after severity computation, before creating triage record
   - Update `/api/triage/action` to store override fields in blotter entry
   
   **Reference**: See Agent thread `Walkthrough of idealised user flow` for discussion of override mechanism design.