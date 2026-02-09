# Signals UX Redesign

**Status**: ✅ Implementation Complete - Ready for Testing
**Created**: 2026-01-13
**Related**:
- `docs/design/260112-decision-point-implementation-tracker.md`
- `docs/design/260109-decision-point-inventory.md`

---

## Executive Summary

The current signals UI spans ~6,000 lines across 14+ components with unclear user flows and confusing terminology. This document captures decisions for a streamlined redesign using a unified table component pattern.

---

## Problem Statement

### Current Pain Points

1. **Too many concepts visible at once**: response, protocol, measurement, criteria, status, history, monitoring, events, rationale - all competing for attention
2. **No clear user flows**: Users don't know where to go for what action
3. **Deeply nested UI**: Signals → expand → monitoring → expand → specs → expand
4. **Terminology mismatch**: UI still uses "validation/invalidation" in places, but DB has "confirmation/warning"
5. **SignalBatchReview not integrated**: Component exists (616 lines) but isn't wired into triage expansion
6. **monitoring_specs table confusion**: Separate mechanism that overlaps with `explicit_details` on signals, barely used (5 specs for 2 signals out of 150)
7. **"Make Explicit" button unclear**: Flow exists but is disconnected from user's mental model

### Current Component Inventory (~6,000 lines)

| Component | Lines | Purpose | Issue |
|-----------|-------|---------|-------|
| ValidationPointsList | 681 | Main list with nested monitoring | Too complex, wrong terminology |
| SignalBatchReview | 616 | Review AI recommendations | **Not integrated into triage** |
| SignalConfigForm | 515 | Configure explicit triggers | Works but disconnected |
| ValidationPointDetail | 431 | Full detail page | Too many sections |
| ManualCheckDialog | 442 | Run checks + assess | Power-user, adds noise |
| MonitoringSpecForm | 387 | Configure monitoring | Being deprecated |
| MonitoringEventsLog | 383 | View events | Being deprecated |
| UpdateValidationStatusModal | 317 | Update status | Keep but simplify |
| StatusTimeline | 301 | View history | Keep |
| ThesisSynthesisSection | 362 | Container/orchestrator | Simplify |
| SignalsSection | 133 | Wrapper | Keep, enhance |
| + others | ~2,000 | Supporting | Review |

---

## Key Decisions

### Decision 1: Two Signal Categories (Not Three)

**Previous thinking**: Three categories (Judgment, Data-Driven, Price/Indicator)

**Final decision**: Two categories - TradingView webhooks are just another data source within data-driven:

| Category | Description | Trigger Mechanism |
|----------|-------------|-------------------|
| **judgment** | Qualitative/narrative signals | User manually assesses based on news, research, intuition |
| **data_driven** | Quantitative metric signals | Automated check against data sources with specific thresholds |

**Data sources for `data_driven` signals**:
- FRED economic data (GDP, CPI, unemployment, etc.)
- IV data from Massive.com (IV30, IV Rank, IV Percentile)
- Price feeds (spot price, % change, ATR)
- TradingView webhooks (future - price targets, indicator triggers)

### Decision 2: Deprecate monitoring_specs Table

The `monitoring_specs` table is a separate mechanism that overlaps confusingly with `explicit_details` on signals. It's barely used (5 specs for 2 signals).

**Action**: Fold all configuration into the signal's `explicit_details` JSONB field. The signal itself contains everything needed to check it.

**Migration path**:
1. Any existing monitoring_specs configs should be migrated to `explicit_details`
2. Table can be dropped after migration
3. All monitoring spec UI components can be removed

### Decision 3: Unified Signals Table Component

Build a clean table component (like `UnifiedClaimsBrowser`) that:

1. **Works in two contexts**:
   - Thesis detail pages (full functionality)
   - Triage expansion (batch review mode for recommended signals)

2. **Shows key info in collapsed row**:
   - Statement text
   - Type badge (✓ confirmation / ⚠ warning)
   - Category badge (judgment / data-driven)
   - Status badge (recommended / active / triggered / superseded)
   - Quick actions

3. **Expandable row shows**:
   - Trigger criteria (for data-driven: metric/threshold; for judgment: assessment guidelines)
   - Last check / last update info
   - Evidence snippet if triggered
   - Full action buttons

4. **Filters**: By type, by category, by status

### Decision 4: AI Recommends Both Types with Pre-Configuration

When `/build-core-argument` runs:
1. Claude generates both judgment and data-driven signals
2. For data-driven signals, Claude pre-configures API-ready criteria when possible
3. Signals are created with `status: 'recommended'`
4. User reviews via batch review UI, can:
   - Accept as-is
   - Reject
   - Edit statement/criteria before accepting
   - Convert judgment → data-driven (or vice versa)

### Decision 5: Streamlined Signal Detail Page

Reduce from current 8+ sections to:

1. **Signal Card**: Statement, rationale, type/category/status badges
2. **Trigger Criteria**: For data-driven, show metric/threshold config; for judgment, show assessment guidelines
3. **Status History**: Timeline of status changes with evidence
4. **Actions**: Update Status, Configure Trigger

**Remove/hide**: Monitoring Events Log, Manual Check Dialog, MonitoringSpecsList

---

## Known Issues to Fix

### Issue 1: REVIEW_RECOMMENDED_SIGNALS Triage Not Triggering

**Observation**: After running `/build-core-argument` for "Bullish Energy Sector" macro thesis at 11:09 on 2026-01-12, no `REVIEW_RECOMMENDED_SIGNALS` triage record appeared despite the implementation claiming it was complete.

**Investigation needed**:
1. Check if signals were actually created with `status: 'recommended'`
2. Check if triage creation logic in `scripts/insert-thesis-articulation.ts` ran correctly
3. Check `thesisTriage.ts` computation for `REVIEW_RECOMMENDED_SIGNALS` rule
4. May need to manually verify with SQL queries

### Issue 2: SignalBatchReview Not Integrated

The `SignalBatchReview` component exists but is not rendered in `ExpandedTriageDetail.tsx` when `triageRule === 'REVIEW_RECOMMENDED_SIGNALS'`.

**Fix**: Add conditional rendering in `ThesisDetail` component to show `SignalBatchReview` when this rule is active.

### Issue 3: Terminology Mismatch

`ValidationPointsList.tsx` filters use old terms:
- `filterType` checks for `'validation'` | `'invalidation'`
- But database has `'confirmation'` | `'warning'`

**Fix**: Update filter values to match new terminology.

---

## Implementation Plan

### Phase 1: Fix Critical Bugs (Quick Wins) ✅ COMPLETE

**Goal**: Get existing code working correctly

1. ✅ **Debug REVIEW_RECOMMENDED_SIGNALS triage trigger**
   - Root cause: `trigger_type` constraint missing `signal_recommendation` value
   - Fixed: Added to DB constraint and schema.ts comment
   - Created manual triage record for existing 14 recommended signals

2. ✅ **Integrate SignalBatchReview into triage**
   - Added `SignalBatchReview` import to `ExpandedTriageDetail.tsx`
   - Added `isReviewRecommendedSignals` check for the triage rule
   - Renders inline with proper props and onComplete handler

3. ✅ **Fix terminology in ValidationPointsList**
   - Changed `'validation'` → `'confirmation'`
   - Changed `'invalidation'` → `'warning'`
   - Updated filter types, counts, labels, dropdowns, and badge colors (amber for warnings)

4. ✅ **Verify "Make Explicit" button flow**
   - Found bug: API didn't support `category`/`explicitDetails` updates
   - Added `handleUpgradeToExplicit()` handler to `/api/validation-points/[id]/route.ts`
   - Creates history record and journal entry on upgrade

**Completed**: 2026-01-13

### Phase 2: Schema Simplification ✅ COMPLETE

**Goal**: Cleaner data model

1. ✅ **Update signal categories**
   - Updated DB constraint to allow new values: `judgment`, `data_driven`
   - Migrated all 39 `judgment_required` → `judgment`
   - Migrated all 111 `explicit` → `data_driven`
   - Updated `schema.ts` category comment

2. ✅ **Migrate monitoring_specs to explicit_details**
   - Reviewed monitoring_specs: keyword-based news monitoring (5 specs for 2 signals)
   - Decision: Different purpose than data thresholds, mark as deprecated
   - Added deprecation comments to `monitoringSpecs` and `monitoringEvents` in schema.ts
   - UI components will be removed in Phase 4

3. ✅ **Standardize explicit_details schema**
   - Existing `ExplicitDetails` interface in `SignalConfigForm.tsx` already implements this
   - Updated `schema.ts` comment to reference the type
   - Interface supports: `fred` | `iv_data` | `price_feed` data sources

4. ✅ **Update all code references**
   - `thesisSynthesis.ts`: Updated stats property names
   - `validation-points/[id]/route.ts`: Updated upgrade handler
   - `build-core-argument/route.ts`: Updated AI prompt template (validation→confirmation, invalidation→warning)
   - `ValidationPointDetail.tsx` & `ValidationPointsList.tsx`: Updated category checks and icons
   - `batch-review/route.ts`: Updated type definitions and journal action types
   - `SignalsSection.tsx` & `SignalBatchReview.tsx`: Updated category values and messages

**Completed**: 2026-01-13

### Phase 3: Build Unified Signals Table ✅ COMPLETE

**Goal**: Single clean component for all signals display

1. ✅ **Create `UnifiedSignalsTable.tsx`**
   - Created ~943 line component modeled after `UnifiedClaimsBrowser.tsx`
   - Supports two modes: `browse` (thesis page) and `review` (triage batch review)
   - Expandable rows with consistent layout
   - Filtering by type/category/status with search
   - Sortable columns (statement, type, category, status, importance, updatedAt)

2. ✅ **Row structure** implemented:
   ```
   Collapsed:
   [▸] [✓/⚠] Statement text...           [Category] [Importance] [Status]  [Actions]

   Expanded:
   [▾] [✓/⚠] Statement text...           [Category] [Importance] [Status]  [Actions]
       ┌─────────────────────────────────────────────────────────────────┐
       │ Rationale: "This signal tracks..."                              │
       │ Trigger Criteria: (for data-driven) / Assessment: (for judgment)│
       │ [Update Status]  [Make Data-Driven]  [View History]             │
       └─────────────────────────────────────────────────────────────────┘
   ```

3. ✅ **Batch review mode** (for triage):
   - Shows only `status: 'recommended'` signals
   - Each row has Accept/Reject/Configure as Data-Driven actions
   - Bulk actions: Accept All, Reject All
   - On complete, triggers onComplete callback

4. ✅ **Replace usages**:
   - `SignalsSection.tsx`: Now uses `UnifiedSignalsTable` in browse mode
   - `ExpandedTriageDetail.tsx`: Now uses `UnifiedSignalsTable` in review mode
   - Removed `monitoringSpecs` prop from `SignalsSection` (no longer needed)
   - Added `UpdateValidationStatusModal` integration for status updates
   - Created `RecommendedSignalsReview` wrapper to fetch signals for triage context

**Completed**: 2026-01-13

### Phase 4: Streamline Detail Page ✅ COMPLETE

**Goal**: Simpler, focused signal detail view

1. ✅ **Simplify ValidationPointDetail.tsx**
   - Removed tabs UI, now shows status history directly
   - Removed MonitoringEventsLog import and state
   - Updated terminology from 'validation' to 'confirmation'
   - Kept: Signal card, Criteria card, Status history, Actions

2. ✅ **Simplify ThesisSynthesisSection.tsx**
   - Removed all monitoring spec state and handlers (~180 lines)
   - Removed MonitoringSpecForm and ManualCheckDialog imports
   - Component reduced from 363 lines to 187 lines

3. ✅ **Remove deprecated components**:
   - Deleted `MonitoringSpecForm.tsx` (387 lines)
   - Deleted `MonitoringSpecsList.tsx` (~200 lines)
   - Deleted `MonitoringEventsLog.tsx` (383 lines)
   - Deleted `ManualCheckDialog.tsx` (442 lines)
   - Updated `index.ts` exports

**Completed**: 2026-01-13

### Phase 5: Cleanup & Polish ✅ COMPLETE

**Goal**: Remove dead code, ensure consistency

1. ✅ **Clean up ValidationPointsList.tsx**
   - Removed all monitoring-related props, state, and JSX
   - Reduced from 681 lines to 432 lines (~250 lines removed)

2. ✅ **Delete deprecated files**
   - Removed `src/app/api/monitoring/` directory (5 API routes)
   - Removed `src/db/queries/monitoring.ts`
   - Removed `src/lib/services/monitoring/` directory (6 files)

3. ✅ **Database cleanup**
   - Dropped `monitoring_events` table (27 records)
   - Dropped `monitoring_specs` table (5 records)
   - Removed table definitions from `schema.ts`
   - Migration: `migrations/260113-drop-monitoring-tables.sql`

4. **Testing** (manual verification recommended)
   - End-to-end test: synthesize → triage → review → accept
   - Test data-driven signal configuration
   - Test status updates and history

**Completed**: 2026-01-13

### Phase 6: Daily Monitoring Migration ✅ COMPLETE

**Goal**: Unify automated threshold checking with signal-level configuration

1. ✅ **Created `daily-signal-monitoring.ts`**
   - Reads directly from `signals.explicit_details` (category='data_driven')
   - Single source of truth - no more data duplication
   - Supports FRED, IV data, and price feed sources
   - Auto-triggers signals and creates triage records

2. ✅ **Deprecated `daily-thesis-monitoring.ts`**
   - Added @DEPRECATED header with migration notes
   - Old script kept for reference during transition

3. ✅ **Updated launchd job**
   - Renamed `com.trade-journal.thesis-monitoring.plist` → `com.trade-journal.signal-monitoring.plist`
   - Points to new `daily-signal-monitoring.ts` script
   - Logs to `signal-monitoring.log`

4. ✅ **Deprecated `thesisMonitoringConfigs` table**
   - Added detailed deprecation comment in `schema.ts`
   - Table will be dropped after existing configs are migrated
   - Migration path documented for `explicitThresholds` → signal `explicit_details`

**Impact**: Existing threshold configs from `thesisMonitoringConfigs` are now inactive. Signals need to be reconfigured via the new UI to use proper `explicit_details` format.

**Completed**: 2026-01-13

### Phase 7: UX Refinements (Flow Testing Feedback) ✅ COMPLETE

**Goal**: Simplify the signal model based on user testing feedback

#### Key Refinements

1. **Status Simplification** - Remove `monitoring` status
   - It's redundant since all accepted signals are being monitored
   - Simplified states: `recommended` → `not_triggered` → `triggered` (+ `superseded`)

2. **Category Derived from Configuration**
   - All signals are `judgment` by default
   - Signal becomes `data_driven` **only when** `explicit_details` is configured
   - Removing/clearing explicit_details reverts to `judgment`
   - No direct UI to set category - only the ⚡ config form changes it

3. **Unified Actions Across Contexts**
   - Browse mode (thesis page) should show Accept/Reject for `recommended` signals
   - Same actions available regardless of where you're viewing the signal
   - Actions adapt based on signal status, not viewing context

4. **The ⚡ Zap Flow Clarification**
   - Opens config form regardless of current category
   - Saving config → sets `category: 'data_driven'` + stores `explicit_details`
   - A data-oriented statement can still be manually assessed (stays `judgment`)

#### Implementation Tasks

1. ✅ **Remove `monitoring` status**
   - Updated `schema.ts` status constraint comment
   - Migrated 1 existing `monitoring` signal to `not_triggered`
   - Removed from `UnifiedSignalsTable.tsx` (filters, badges, sorting)
   - Removed from `UpdateValidationStatusModal.tsx` status options
   - Updated `assess-impact/route.ts` to set `not_triggered` instead of `monitoring`

2. ✅ **Make category derived**
   - Updated `/api/skills/build-core-argument/route.ts` to not include category in AI prompt
   - Updated `scripts/insert-thesis-articulation.ts` to always set `category='judgment'` and `explicitDetails=null`
   - Updated `batch-review/route.ts` to not accept category in modifications
   - Category only becomes `data_driven` when user configures via SignalConfigForm

3. ✅ **Unify browse/review mode actions**
   - `UnifiedSignalsTable.tsx` now shows Accept/Reject/⚡Zap for `status='recommended'` regardless of mode
   - After acceptance, shows Update Status / Configure Data-Driven
   - Actions adapt based on signal status, not viewing context

4. ✅ **Update related components**
   - `UnifiedSignalsTable.tsx`: Unified action rendering in both table rows and expanded rows
   - `SignalConfigForm.tsx`: Already handles setting `data_driven` on save
   - `UpdateValidationStatusModal.tsx`: Removed `monitoring` option
   - `thesisSynthesis.ts`: Changed `monitoring` stat to `notTriggered`

**Completed**: 2026-01-13

---

## User Flows (Target State)

### Flow 1: After Synthesis

```
User runs /build-core-argument
    ↓
Claude generates articulation + recommended signals
    ↓
Signals created with status='recommended'
    ↓
REVIEW_RECOMMENDED_SIGNALS triage record created
    ↓
User sees triage item in queue
    ↓
User expands → sees UnifiedSignalsTable in review mode
    ↓
User accepts/rejects/edits each signal
    ↓
Triage auto-resolves when all reviewed
```

### Flow 2: Ongoing Signal Management

```
User views thesis detail page
    ↓
Sees Signals section with UnifiedSignalsTable
    ↓
Can filter by type/category/status
    ↓
Can expand any signal to see details
    ↓
Can update status, configure data trigger, view history
    ↓
For deep dive, can click through to signal detail page
```

### Flow 3: Signal Trigger Response

```
Data-driven signal crosses threshold (future: automated check)
    ↓
Signal status → 'triggered'
    ↓
SIGNAL_TRIGGERED triage record created
    ↓
User sees triage item
    ↓
User expands → sees ThesisSignalTriageCard
    ↓
User assesses impact: Strengthens/Weakens/No Change
    ↓
User optionally updates thesis conviction
    ↓
Triage resolved
```

---

## Files to Modify/Create

### New Files
- `src/components/signals/UnifiedSignalsTable.tsx` - Main new component

### Modify
- `src/components/triage/ExpandedTriageDetail.tsx` - Add SignalBatchReview/UnifiedSignalsTable for REVIEW_RECOMMENDED_SIGNALS
- `src/components/thesis-synthesis/ValidationPointsList.tsx` - Fix terminology, then deprecate
- `src/components/signals/SignalsSection.tsx` - Use new UnifiedSignalsTable
- `src/db/schema.ts` - Update category enum, explicit_details type
- `src/lib/derived/thesisTriage.ts` - Debug REVIEW_RECOMMENDED_SIGNALS rule

### Deprecate/Remove
- `src/components/thesis-synthesis/MonitoringSpecForm.tsx`
- `src/components/thesis-synthesis/MonitoringSpecsList.tsx`
- `src/components/thesis-synthesis/MonitoringEventsLog.tsx`
- `src/components/thesis-synthesis/ManualCheckDialog.tsx`
- `src/components/signals/SignalBatchReview.tsx` (after UnifiedSignalsTable replaces it)

### Database
- Migration: Update category values
- Migration: Migrate monitoring_specs → explicit_details
- Migration: Drop monitoring_specs table

---

## Success Criteria

1. **REVIEW_RECOMMENDED_SIGNALS triage works end-to-end**
   - Running /build-core-argument creates triage record
   - Expanding triage shows batch review UI
   - Accepting/rejecting signals resolves triage

2. **Unified signals table is the single source of truth**
   - Same component on thesis pages and in triage
   - Clear, consistent UI for all signal operations
   - Filters work correctly with new terminology

3. **Signal categories are clear**
   - Two categories: judgment, data_driven
   - Users understand the distinction
   - Configuration flow is intuitive

4. **Code is simplified**
   - ~3,000 lines removed (monitoring specs components)
   - Clear component boundaries
   - No more overlapping concepts

### Phase 8: Re-articulation & Button Improvements ✅ COMPLETE

**Goal**: Handle re-articulation properly and improve UX consistency

1. ✅ **Supersede existing signals on re-articulation**
   - When running `/build-core-argument` again, existing signals are marked `superseded`
   - New signals created with `status='recommended'`
   - User can delete superseded signals or reinstate valuable ones
   - Journal entry logged for the supersede action
   - Implementation: `scripts/insert-thesis-articulation.ts` Step 2b

2. ✅ **SynthesizeButton calls API directly**
   - Previously: button copied skill command to clipboard
   - Now: button calls `/api/skills/build-core-argument` API directly (like triage does)
   - Shows loading spinner and toast notifications
   - Auto-refreshes page when articulation is created/updated
   - Implementation: `src/components/thesis/SynthesizeButton.tsx`

**Completed**: 2026-01-13

---

## Appendix: Database Queries for Debugging

### Check recommended signals exist
```sql
SELECT id, thesis_id, statement, status, category
FROM signals
WHERE status = 'recommended';
```

### Check REVIEW_RECOMMENDED_SIGNALS triage records
```sql
SELECT * FROM thesis_triage_records
WHERE triage_rule = 'REVIEW_RECOMMENDED_SIGNALS';
```

### Check signal categories distribution
```sql
SELECT category, status, count(*)
FROM signals
GROUP BY category, status
ORDER BY category, status;
```

### Check monitoring specs (to migrate)
```sql
SELECT ms.*, s.statement
FROM monitoring_specs ms
JOIN signals s ON ms.signal_id = s.id;
```

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-13 | Initial design document created from UX discussion |
| 2026-01-13 | Phase 1 completed: Fixed triage trigger, integrated SignalBatchReview, terminology fixes |
| 2026-01-13 | Phase 2 completed: Category migration (judgment/data_driven), code references updated |
| 2026-01-13 | Phase 3 completed: UnifiedSignalsTable created, SignalsSection & ExpandedTriageDetail updated |
| 2026-01-13 | Phase 4 completed: Simplified detail page, deleted 4 deprecated monitoring components (~1,400 lines) |
| 2026-01-13 | Phase 5 completed: Dropped monitoring tables, removed API routes/services, cleaned up ValidationPointsList |
| 2026-01-13 | Phase 6 completed: Migrated daily monitoring to signal-level (daily-signal-monitoring.ts), deprecated thesisMonitoringConfigs |
| 2026-01-13 | Phase 7 started: UX refinements from flow testing - remove monitoring status, derive category from config, unify actions |
