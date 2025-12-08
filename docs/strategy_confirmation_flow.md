# Strategy Confirmation Flow

## Overview

Strategies can be confirmed from two entry points:
1. **Admin Strategies Page** (`/admin/strategies`) - Direct confirmation
2. **Triage Page** (`/triage`) - Via `CONFIRM_STRATEGIES` triage action

Both paths now use the **same unified confirmation logic** to ensure consistency.

---

## Unified Confirmation Process

When a strategy is confirmed (via either path), the following happens:

### 1. Strategy Updates
- `isAuto` → `false` (marks strategy as manually confirmed)
- `confirmedAt` → Current timestamp
- `strategyType` → Set to selected type (required for confirmation)
- `status` → Set to `"open"` **if strategy has positions**, otherwise keeps current status
- Optional metadata fields can be set: `thesis`, `profitRules`, `defenseRules`, `timeRules`

### 2. Triage Record Resolution
- **All** `CONFIRM_STRATEGIES` triage records for the strategy are resolved to `severity = "complete"`
- This happens automatically regardless of which confirmation path is used
- Ensures no lingering triage flags after confirmation

### 3. State Code Computation
- If `strategyType` is set during confirmation, state codes are computed for all historical snapshot dates
- Runs asynchronously (doesn't block confirmation)

---

## Confirmation Paths

### Path 1: Admin Strategies Page

**Location**: `/admin/strategies/page.tsx`

**Flow**:
1. User clicks "Confirm" on a suggested strategy
2. Modal prompts for `strategyType` selection (required)
3. Optional: Edit `strategyKey`, `label`, and metadata fields
4. Calls `/api/strategies` PATCH with `confirm: true` and `strategyType`
5. Strategy is confirmed and all `CONFIRM_STRATEGIES` triage records are resolved

**Result**: Strategy moves from "Suggested Strategies" to "Confirmed Strategies" section

---

### Path 2: Triage Page

**Location**: `/triage` (via `CONFIRM_STRATEGIES` triage record)

**Flow**:
1. User sees `CONFIRM_STRATEGIES` triage flag (severity: `urgent`)
2. User clicks "Update" action button
3. Form loads with strategy data and prompts for `strategyType` (required)
4. Optional: Edit `strategyKey`, `label`, and metadata fields
5. Calls `/api/strategies` PATCH with `confirm: true` and `strategyType`
6. Then calls `/api/triage/action` to record the action and update the specific triage record
7. Strategy is confirmed and all `CONFIRM_STRATEGIES` triage records are resolved

**Result**: Triage flag severity changes to `"complete"` and disappears from active queue

---

## Key Differences (Before Fix)

**Before**: 
- Admin confirmation didn't resolve triage records
- Status wasn't updated to "open" when confirming
- Inconsistent behavior between paths

**After**:
- ✅ Both paths resolve all `CONFIRM_STRATEGIES` triage records
- ✅ Status automatically set to "open" if strategy has positions
- ✅ Consistent behavior regardless of entry point

---

## Status Logic

Strategy `status` field behavior:

- **On Confirmation**: 
  - If strategy has positions → `status = "open"`
  - If no positions → Keeps current status (e.g., `"draft"`, `"planned"`)

- **Runtime Status** (in queries):
  - Some queries compute status dynamically from positions:
    - Has positions on latest snapshot → `"open"`
    - No positions → `"closed"`
  - This is separate from the stored `status` field

**Note**: The stored `status` field and computed status may differ. The stored field reflects manual confirmation state, while computed status reflects current position state.

---

## Triage Record Resolution

When a strategy is confirmed, **all** `CONFIRM_STRATEGIES` triage records for that strategy are resolved:

```sql
UPDATE triage_records
SET severity = 'complete', updated_at = NOW()
WHERE strategy_id = <strategy_id>
  AND recommended_action = 'CONFIRM_STRATEGIES'
```

This ensures:
- No duplicate confirmation flags
- Consistent state across all snapshot dates
- Clean triage queue after confirmation

---

## State Code Computation

After confirmation with a `strategyType`:

1. State codes are computed for **all historical snapshot dates** where the strategy has positions
2. This ensures a complete state code timeline
3. Runs asynchronously (doesn't block confirmation response)

**Implementation**: `src/lib/services/strategyStateCode.ts::recomputeStateCodeForStrategy()`

---

## Error Handling

- If `strategyType` is missing → API returns 400 error
- If strategy not found → API returns 404 error
- State code computation failures → Logged but don't block confirmation
- Triage record resolution failures → Logged but don't block confirmation

---

## User Experience

**Before Fix**:
- Confirming on admin page didn't resolve triage flags
- Status remained "draft" even after confirmation
- Had to manually resolve triage flags separately

**After Fix**:
- ✅ One-click confirmation resolves everything
- ✅ Status automatically set to "open" if applicable
- ✅ No manual triage resolution needed
- ✅ Consistent behavior from both entry points

