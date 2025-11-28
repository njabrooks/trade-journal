# Actions & Triggers Specification
Version 0.1 — 2025-01-XX  
Author: Nick

This document defines all triggers, rules, and actions in the Trade Journal system. Each trigger specifies:
- **Context**: Where the trigger applies (position, strategy, underlying, account)
- **Rule**: The name/identifier of the trigger
- **Rule Criteria**: The logic that determines when the trigger fires
- **Severity**: The priority level (urgent, attention, watch, info)
- **Actions**: Available options to act on the triggered item
- **Completion Criteria**: How the action is marked as complete

---

## Position-Level Triggers

### 1. DTE Flags - Days to Expiry

**Context**: `position`  
**Rule**: DTE-based flags  
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- `quantity != 0`

**Severity Logic** (evaluated in priority order):
1. If `side = 'SHORT'` AND `DTE <= 21` → `attention`
2. Else if `side = 'LONG'` AND `DTE <= 7` → `attention`
3. Else if `DTE <= 30` → `watch`

**Actions**:
- `ROLL` - Roll the position to a later expiry
- `CLOSE` - Close the position entirely
- `REVIEW_DTE` - Review DTE and decide on action
- `MARK_REVIEWED` - Mark as reviewed (no action needed)

**Completion Criteria**: 
- Action taken creates a blotter entry with `action_class` set
- Triage record remains but can be filtered out if `MARK_REVIEWED` is used
- Future: Mark triage record as `resolved = true` when action is taken

**Implementation**: `src/lib/derived/triage.ts:178-190` (DTE severity logic)

---

### 2. `flag_dte_long` - Long DTE Flag

**Context**: `position`  
**Rule**: `flag_dte_long`  
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- `DTE > 30` days
- `quantity != 0`

**Severity**: `info` (informational only)

**Actions**:
- `REVIEW` - Review the position
- `MARK_REVIEWED` - Mark as reviewed

**Completion Criteria**: 
- Similar to `flag_dte_short`

**Implementation**: `src/lib/derived/triage.ts:198` (flagDteLong)

---

### 3. Sigma Flags - Distance to Strike

**Context**: `position`  
**Rule**: `flag_sigma_0_5`, `flag_sigma_1_0`  
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- `sigma_to_strike = |ln(S/K)| / (σ * sqrt(T))`
  - Where S = spot, K = strike, σ = iv30, T = DTE/365
- Requires `underlyings_iv_history.iv30` for the underlying on snapshot date

**Severity Logic** (evaluated in priority order):
1. If `0.5 < sigma_to_strike <= 1.0` → `watch`
2. Else if `sigma_to_strike <= 0.5` AND `side = 'SHORT'` → `urgent`
3. Else if `sigma_to_strike <= 0.5` → `attention`

**Actions**:
- `WATCH_CLOSELY` - Monitor closely (creates blotter note)
- `MONITOR` - Monitor the position
- `ROLL` - Roll to different strike
- `CLOSE` - Close position
- `MARK_REVIEWED` - Mark as reviewed

**Completion Criteria**: 
- Action creates blotter entry
- Short positions very close to ATM (≤0.5σ) are highest priority
- Position is very close to ATM, requires active monitoring

**Implementation**: `src/lib/derived/triage.ts:147-148` (flagSigma05, flagSigma10), `src/lib/derived/triage.ts:172-180` (severity logic)

---

### 4. Assignment Risk Flags

**Context**: `position`  
**Rule**: `flag_assignment`  
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- `is_itm = true` (spot > strike for calls, spot < strike for puts)

**Severity Logic** (evaluated in priority order):
1. If `side = 'SHORT'` AND `is_itm = true` AND `DTE <= 14` → `urgent`
2. Else if `side = 'SHORT'` AND `is_itm = true` AND `DTE <= 30` → `attention`
3. Else if `is_itm = true` → `watch`

**Actions**:
- `CLOSE_OR_ROLL` - Close or roll the short position to avoid assignment
- `MANAGE_ASSIGNMENT` - Manage assignment risk (creates blotter note)
- `MONITOR` - Monitor ITM position
- `MARK_REVIEWED` - Mark as reviewed (if assignment is acceptable)

**Completion Criteria**: 
- Action creates blotter entry with `action_class = 'DEFENSE'` or `'ROLL'`
- Critical for short ITM options near expiry (DTE ≤ 14 is urgent)
- Short ITM options with DTE ≤ 30 require attention

**Implementation**: `src/lib/derived/triage.ts:151-161` (flagAssignmentUrgent, flagAssignmentAttention), `src/lib/derived/triage.ts:165-171` (severity logic)

---

### 5. `is_itm` - In The Money Flag

**Context**: `position`  
**Rule**: `is_itm`  
**Rule Criteria**: 
- Option position (`asset_class = 'OPT'`)
- For calls: `spot > strike`
- For puts: `spot < strike`

**Severity**: 
- `watch` if ITM (used as fallback when not part of assignment risk)
- Higher severity when combined with SHORT side and low DTE (see Assignment Risk Flags)

**Actions**: 
- `MONITOR` - Monitor ITM position
- Used as input for other triggers (assignment risk, state code computation)
- Not typically a standalone action trigger unless no other flags apply

**Completion Criteria**: 
- Informational flag, typically handled via assignment risk flags
- If standalone, creates blotter entry with `action_class = 'NOTE_ONLY'`

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
- `CONFIRM_STRATEGIES` - Navigate to admin/strategies to confirm strategy
  - Review auto-derived strategy and confirm it should be tracked
  - Sets `confirmed_at` timestamp
  - Requires selecting `strategy_type` during confirmation
- `MARK_REVIEWED` - Mark as reviewed (defer confirmation)

**Completion Criteria**: 
- Strategy `confirmed_at` is set (via admin/strategies page)
- `is_auto` is set to `false`
- `strategy_type` is selected (links to playbook items)
- Triage record should disappear on next recompute

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
- `PROVIDE_STRATEGY_METADATA` - Navigate to admin/strategies to complete metadata
  - Fill in missing fields: `strategy_type`, `thesis`, `profit_rules`, `defense_rules`, `time_rules`
- `MARK_REVIEWED` - Mark as reviewed (if fields are intentionally empty)

**Completion Criteria**: 
- All required fields are set (not NULL):
  - `strategy_type`
  - `thesis`
  - `profit_rules`
  - `defense_rules`
  - `time_rules`
- Triage record should disappear on next recompute

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
- Else if `pct_nav_abs_notional >= 0.1` (10% of NAV) → `watch`

**Actions**:
- `REVIEW_SIZE` - Review strategy size (creates blotter entry)
- `REDUCE_SIZE` - Reduce strategy size (for urgent/attention cases)
- `MARK_REVIEWED` - Mark as reviewed (if size is intentional)

**Completion Criteria**: 
- Action creates blotter entry with `action_class = 'SIZE_DOWN'` or `'NOTE_ONLY'`
- Strategy size should be reviewed and potentially reduced via position adjustments
- Triage record persists until `pct_nav_abs_notional < 0.1` or action is taken

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
- `REVIEW_COMPLEXITY` - Review strategy complexity (creates blotter note)
- `MARK_REVIEWED` - Mark as reviewed

**Completion Criteria**: 
- Action creates blotter entry with `action_class = 'NOTE_ONLY'`
- Informational trigger, not critical

**Implementation**: `src/lib/derived/triage.ts:401-413`

---

### 10. `REVIEW_STATE_CODE_CHANGE` - State Code Transition

**Context**: `strategy`  
**Rule**: `REVIEW_STATE_CODE_CHANGE`  
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
- `REVIEW_STATE_CODE` - Review state code change and playbook recommendations
- Navigate to strategy detail page to see playbook items for new state code
- `MARK_REVIEWED` - Mark as reviewed

**Completion Criteria**: 
- Action creates blotter entry
- User reviews playbook items for new state code
- Triage record persists until next state code change or manual dismissal

**Implementation**: `src/lib/derived/stateCode.ts` (framework exists, integration pending in `src/lib/derived/triage.ts:416-420`)

**Note**: Currently disabled in triage computation due to performance concerns. Should be implemented as background job or on-demand computation. **When implemented, any state code change should trigger with `urgent` severity** (as noted in code comment at line 420).

---

## State Code Computation (Playbook-Based)

State codes are computed based on playbook criteria defined in `playbook_items` table. Each strategy type has multiple state codes (e.g., LC1, LC2, LC3, LC4 for "LEAPS long call").

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
- Determined by `playbook_items.default_severity` (if set)
- Otherwise defaults based on state code category

**Actions**:
- Actions defined in `playbook_items.checklist_items` (PrimaryAction, SecondaryAction, RiskNotes)
- Typically includes:
  - Review playbook recommendations
  - Execute primary/secondary actions
  - Update strategy notes

**Completion Criteria**: 
- State code change is detected and logged
- User reviews and acts on playbook recommendations
- Blotter entry created with state code transition

**Implementation**: `src/lib/derived/stateCode.ts:185-348`

---

## Configuration Thresholds

All thresholds are configurable via `/admin/triage`:

- **`dteThreshold`**: Default 30 days (create triage records for options with DTE <= this)
  - **Note**: Position-level DTE severity thresholds are now hardcoded:
    - SHORT positions: DTE <= 21 → `attention`
    - LONG positions: DTE <= 7 → `attention`
    - Any position: DTE <= 30 → `watch`
- **`assignmentDteThreshold`**: Default 10 days
  - **Note**: Assignment risk thresholds are hardcoded:
    - SHORT ITM, DTE <= 14 → `urgent`
    - SHORT ITM, 14 < DTE <= 30 → `attention`
- **`sizeAttentionThreshold`**: Default 0.15 (15% of NAV)
  - **Note**: Not currently used. REVIEW_SIZE uses fixed thresholds:
    - >= 0.5 (50% NAV) → `urgent`
    - >= 0.25 (25% NAV) → `attention`
    - >= 0.1 (10% NAV) → `watch`
- **`sizeUrgentThreshold`**: Default 0.25 (25% of NAV)
  - **Note**: Not currently used (see REVIEW_SIZE thresholds above)
- **`complexityThreshold`**: Default 10 positions (triggers complexity review)

**Implementation**: `src/lib/derived/triage.ts:13-22` (TRIAGE_RULES_V1)

**Future Enhancement**: Make position-level DTE and assignment risk thresholds configurable via admin UI.

---

## Action Implementation Details

### Action Button Component
- **Location**: `src/components/triage/TriageActionButtons.tsx`
- **Behavior**: 
  - Renders context-appropriate action buttons based on `contextLevel` and `recommendedAction`
  - Calls `/api/triage/action` to record action
  - Creates blotter entry automatically

### Action API Endpoint
- **Location**: `src/app/api/triage/action/route.ts`
- **Behavior**:
  - Accepts `triageId`, `actionType`, `notes`, `strategyId`, `positionId`
  - Creates blotter entry with appropriate `action_class`
  - Maps action types to blotter action classes:
    - `ROLL` → `'ROLL'`
    - `CLOSE` → `'CLOSE'`
    - `REDUCE_SIZE` → `'SIZE_DOWN'`
    - `REVIEW` / `MARK_REVIEWED` → `'NOTE_ONLY'`
    - `CONFIRM_STRATEGIES` → `'OPEN'`
    - `PROVIDE_STRATEGY_METADATA` → `'NOTE_ONLY'`
    - `REVIEW_STATE_CODE` → `'NOTE_ONLY'`
    - `MANAGE_ASSIGNMENT` → `'DEFENSE'`

### Completion Tracking
- **Current**: Actions create blotter entries, but triage records remain in queue
- **Future Enhancement**: Add `resolved` or `completed` flag to `triage_records` table
- **Future Enhancement**: Auto-dismiss triage records when underlying condition no longer applies (e.g., DTE > threshold, size reduced)

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

2. **Action Persistence**: Currently actions create blotter entries but don't mark triage records as resolved. Consider:
   - Adding `resolved_at` timestamp to `triage_records`
   - Auto-resolving when underlying condition changes
   - Manual resolve via "Mark Reviewed" action

3. **Severity Escalation**: Some triggers could escalate severity over time (e.g., assignment risk getting closer to expiry). Consider:
   - Time-based severity adjustment
   - Recurring triage record updates

4. **Playbook Integration**: State code changes should link to specific playbook items, showing:
   - Checklist items (PrimaryAction, SecondaryAction, RiskNotes)
   - Recommended actions from playbook
   - Historical state code transitions
