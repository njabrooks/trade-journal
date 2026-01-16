# Cleanup Plan: PRD Alignment & Technical Debt

**Generated:** 2026-01-16
**Updated:** 2026-01-16 (Blotter-to-Journal Migration COMPLETED)
**Purpose:** Map audit findings against PRD v1.1 and prioritize cleanup work.

---

## Table of Contents

1. [PRD Alignment Assessment](#prd-alignment-assessment)
2. [Deprecated Systems Summary](#deprecated-systems-summary)
3. [Execution Plan](#execution-plan)
4. [Archive Strategy](#archive-strategy)
5. [Success Criteria](#success-criteria)

---

## PRD Alignment Assessment

### PRD Section 3: Decision Hierarchy

| PRD Concept | Implementation Status | Gap Analysis |
|-------------|----------------------|--------------|
| Macro Theses | ✅ Implemented | `macro_theses` table with status, workflowStatus, claims provenance |
| Asset Theses | ✅ Implemented | `asset_theses` table linked to underlyings and macro theses |
| Strategies | ✅ Implemented | `strategies` table with tactical implementation |
| Positions | ✅ Implemented | `positions` table with MTM and lifecycle |

**Assessment:** Core hierarchy fully implemented. No gaps.

---

### PRD Section 5: Research, Knowledge & Intelligence Layer

| PRD Concept | Implementation Status |
|-------------|----------------------|
| Research Ingestion | ✅ `research_artifacts` table |
| AI-Assisted Structuring | ✅ Toulmin claims extraction via skills |
| Contextual Mapping | ✅ `claim_thesis_mappings` (claim → thesis) |
| Thesis Evaluation | ✅ `thesis_triage_records` for re-underwriting |

**Deprecated:** `researchMappings` table (insight-level mappings) - redundant now that claims link directly to theses.

---

### PRD Section 6: Workflow & Triage Engine

| PRD Concept | Implementation Status |
|-------------|----------------------|
| Triggers (event-based) | ✅ TradingView webhooks via signals |
| Triggers (rule-based) | ✅ Signal evaluation |
| Triage | ✅ `triage_records` with urgency/severity |

**Deprecated:** `stateCode` system - replaced by signals.

---

### PRD Section 8: Logging, Journal & Institutional Memory

| PRD Concept | Implementation Status |
|-------------|----------------------|
| Chronological journal | ✅ `journal_entries` table |
| Event Logging | ✅ `logToJournal()` captures all events |

**Deprecated & Removed:** Entire `blotter` system - Journal now handles all functionality:
- Trade ingestion events → Journal entries
- Triage metadata → Journal entries
- Severity overrides → `triage_records` table (overrideSource, overrideExpiresDate, overrideAt columns)
- ✅ Migration completed 2026-01-16: `blotter_actions` table dropped, backup retained as `blotter_actions_backup`

---

## Deprecated Systems Summary

### 1. Blotter System (✅ FULLY REMOVED - 2026-01-16)

The Journal system and `triage_records` table now handle all former blotter functionality.

**Migration Summary:**
1. Added override columns to `triage_records`: `overrideSource`, `overrideExpiresDate`, `overrideAt`
2. Migrated 9 existing severity overrides from `blotter_actions` to `triage_records`
3. Updated triage computation (`triage.ts`) to read overrides from `triage_records`
4. Updated triage action APIs to write overrides to `triage_records` + journal
5. Dropped `blotter_actions` table (backup retained as `blotter_actions_backup`)

**Migration files:**
- `migrations/20260116_add_triage_override_columns.sql`
- `migrations/20260116_migrate_blotter_overrides.sql`
- `migrations/20260116_drop_blotter_actions.sql`

**Files modified:**
- `src/db/schema.ts` - Removed `blotterActions` table definition
- `src/lib/derived/triage.ts` - Updated to use `triage_records` overrides
- `src/app/api/triage/action/route.ts` - Removed blotter writes
- `src/app/api/triage/action/bulk/route.ts` - Removed blotter writes
- `src/db/queries/strategies.ts` - Removed blotter query from strategy detail

---

### 2. Research Mappings (DEPRECATED)

Insight-level mappings are redundant - claims link directly to theses.

**Database:**
- `research_mappings` table - Drop

**Backend:**
- Remove all `researchMappings` queries from `src/db/queries/research.ts`
- Remove related API routes

---

### 3. StateCode System (DEPRECATED)

Replaced by signals system.

**Backend:**
- `src/lib/derived/stateCode.ts` (696 lines) - Archive locally
- `src/lib/services/strategyStateCode.ts` - Archive locally
- `strategyMetricsSnapshots.stateCode` column - Drop

---

### 4. Dead Functions & Columns

| Item | Location | Action |
|------|----------|--------|
| `getAllClaimsWithSources()` | `src/db/queries/research.ts` | Remove |
| `getPreInvestmentResearch()` | `src/db/queries/research.ts` | Remove |
| `realizedPnlToDate` | `src/lib/derived/strategyMetrics.ts` | Remove |

---

### 5. Triage Severity/Status Overload (TECHNICAL DEBT)

**Issue:** The `triage_records.severity` field conflates severity levels with workflow states.

**Current Values:**
- Severity levels: `info`, `attention`, `urgent` (correct)
- Severity override: `monitor` (valid - means "watch, don't escalate")
- **Workflow states: `pending`, `complete`** (incorrect - these are statuses, not severities)

**Impact:**
- 30+ occurrences across codebase
- Queries filter on `severity = 'pending'` or `severity != 'complete'`
- UI groups 'pending' with statuses and 'complete' with 'actioned'
- `src/types/triage.ts:95` explicitly maps: `status: record.severity ?? "pending"`

**Correct Design (see `thesis_triage_records`):**
- `severity`: 'critical' | 'high' | 'medium' | 'low' | 'info' (pure severity)
- `status`: 'pending' | 'in_review' | 'actioned' | 'dismissed' (pure workflow)

**Recommended Fix:**
1. Add `status` column to `triage_records` table
2. Migrate 'pending'/'complete' values from `severity` to `status`
3. Update code to use proper columns
4. Keep `monitor` as valid severity override

**Scope:** ~30 file changes across queries, API routes, derived logic, UI components

**Tracked as:** #ENH-047 (Triage Severity/Status Separation)

---

### 6. Thesis Status Field Confusion (TECHNICAL DEBT)

**Issue:** MacroThesis and AssetThesis have THREE overlapping status-like fields with unclear purposes.

**Current Fields:**

| Field | Schema Values | Used In Code | Purpose |
|-------|--------------|--------------|---------|
| `status` | active, under_review, retired, superseded | Yes | Lifecycle validity |
| `workflowStatus` | developing, monitoring, paused, validated, invalidated, abandoned | **Schema only** | User intent |
| `lifecycleStatus` | created (default) | **Code only** | Workflow progression |

**The Confusion:**

1. **`lifecycleStatus`** is marked DEPRECATED in schema but actively used in `lifecycleDetection.ts`
2. **`workflowStatus`** exists in schema but has ZERO usage in application code
3. The values don't align:
   - `lifecycleStatus` in code uses: created → claims_linked → synthesized → validated → monitoring → closed
   - `workflowStatus` in schema has: developing, monitoring, paused, validated, invalidated, abandoned

**Files Affected:**
- `src/db/schema.ts` - Both fields defined (lines 84, 90, 156, 162)
- `src/lib/workflow/lifecycleDetection.ts` - Uses `lifecycleStatus` (17 occurrences)

**Root Cause:** `workflowStatus` was added to schema intending to replace `lifecycleStatus`, but:
- The code was never migrated
- The value sets are conceptually different
- The deprecation comment was added without completing the migration

**Tracked as:** #ENH-048 (Thesis Status Field Consolidation)

---

## Execution Plan

### Phase A: Safe Code Removal (No DB Changes)

Remove dead functions that have no dependencies.

**Files to edit:**
1. `src/db/queries/research.ts` - Remove `getAllClaimsWithSources()`, `getPreInvestmentResearch()`
2. `src/lib/derived/strategyMetrics.ts` - Remove `realizedPnlToDate` references

---

### Phase B: Archive Deprecated Systems Locally

Create gitignored archive folder and move deprecated code.

**Setup:**
```
/archive/                          # Add to .gitignore
  /deprecated-2026-01-16/
    blotter.ts                     # From src/lib/derived/
    stateCode.ts                   # From src/lib/derived/
    strategyStateCode.ts           # From src/lib/services/
    README.md                      # Explains what was deprecated and why
```

**Actions:**
1. Create `/archive/deprecated-2026-01-16/` directory
2. Copy deprecated files to archive
3. Add `/archive/` to `.gitignore`
4. Create README.md explaining the deprecation

---

### Phase C: Remove Blotter UI & Routes

Remove all blotter-related frontend code.

**Directories to remove:**
- `src/app/blotter/` - All blotter pages
- `src/components/blotter/` - All blotter components

**API routes to remove:**
- `src/app/api/blotter/` - All blotter API routes

**Imports to clean up:**
- Any imports referencing blotter components/queries

---

### Phase D: Schema Migration (Database Changes)

Create and run migrations to drop deprecated tables/columns.

**✅ COMPLETED: Migration 1: Drop research_mappings table**
```sql
-- migrations/20260116_drop_research_mappings.sql
DROP TABLE IF EXISTS research_mappings CASCADE;
```
- Migration executed successfully
- `researchMappings` removed from `src/db/schema.ts`

**DEFERRED: Migration 2: Drop blotter_actions table**
```sql
DROP TABLE IF EXISTS blotter_actions CASCADE;
```
- **Reason:** Still actively used for triage severity overrides
- **Prerequisite:** Migrate triage severity tracking to journal system

**DEFERRED: Migration 3: Drop stateCode column**
```sql
ALTER TABLE strategy_metrics_snapshots DROP COLUMN IF EXISTS state_code;
```
- **Reason:** Part of blotter dependency chain
- **Prerequisite:** Complete blotter migration first

---

### Phase E: Clean Up Backend References

Remove all code that references dropped tables.

**Research queries (`src/db/queries/research.ts`):**
- Remove all `researchMappings` imports and functions:
  - `getMappedInsightIds()`
  - `createMapping()`
  - `getMappingsForInsight()`
  - `getMappingsForThesis()`
  - `getMappingsForAssetThesis()`
  - `getMappingsForStrategy()`
  - `deleteMapping()`
  - `getEvidenceCountForThesis()`
  - `getEvidenceCountForAssetThesis()`

**Blotter queries:**
- Remove `src/db/queries/blotter.ts` entirely (if exists)

**Derived computations:**
- Remove `src/lib/derived/blotter.ts`
- Remove `src/lib/derived/stateCode.ts`
- Remove `src/lib/services/strategyStateCode.ts`

---

### Phase F: Terminology Standardization

Update `asset_view` → `asset_thesis` across codebase.

**Scope:** ~40 occurrences across 15+ files

**Key files:**
- `src/types/claims.ts` - Type definitions
- `src/db/schema.ts` - `recommendationType` values
- `src/app/api/research/convert-claim/route.ts`
- `src/app/api/research/link-claim-to-thesis/route.ts`
- `src/components/research/ConvertClaimToEntityDialog.tsx`
- `src/components/ui/HierarchyBreadcrumb.tsx`

---

### Phase G: Documentation Refresh

Update documentation to reflect changes.

**CLAUDE.md updates:**
- Remove blotter references
- Update architecture diagram
- Update key directories section
- Add state machine summary (link to CURRENT_STATE.md)

**CURRENT_STATE.md updates:**
- Remove blotter from domain breakdown
- Update dead code registry (mark items as completed)

**New documentation:**
- `docs/features/signals.md` - Document signal evaluation
- `docs/features/thesis-triage.md` - Document thesis triage rules

---

## Archive Strategy

### Local Archive (Gitignored)

Keep deprecated code locally for reference but exclude from repo.

**Structure:**
```
/archive/
  /deprecated-2026-01-16/
    README.md              # Summary of deprecation
    blotter.ts             # 1805 lines - replaced by journal
    stateCode.ts           # 696 lines - replaced by signals
    strategyStateCode.ts   # Service layer for stateCode
```

**README.md content:**
```markdown
# Deprecated Code Archive - 2026-01-16

## What was removed

### Blotter System
- `blotter.ts` (1805 lines) - Complex trade aggregation and reconciliation
- Replaced by: Journal system (`journal_entries` table, `logToJournal()`)
- Reason: Journal captures same data with simpler architecture

### StateCode System
- `stateCode.ts` (696 lines) - Playbook state determination (LC1, RR2, etc.)
- `strategyStateCode.ts` - Service layer
- Replaced by: Signals system
- Reason: Signals provide more flexible trigger mechanism

## Why archived locally
- Preserved for reference during transition
- May contain useful logic patterns
- Not needed in production codebase
```

**.gitignore addition:**
```
# Deprecated code archive
/archive/
```

---

## Success Criteria

**Completed (2026-01-16):**

- [x] `research_mappings` table dropped
- [x] `researchMappings` queries removed from research.ts
- [x] Dead functions removed from research.ts (`getAllClaimsWithSources`, `getPreInvestmentResearch`)
- [x] Blotter imports removed from ingestion routes (flex positions, strategies bulk confirm)
- [x] Deprecated scripts archived (`scripts/archive/repair-quantity-change-matching.ts`)
- [x] `asset_view` → `asset_thesis` terminology updated across all files
- [x] CURRENT_STATE.md updated with cleanup status

**Blotter Migration Completed (2026-01-16):**

- [x] `blotter_actions` table dropped - ✅ Migrated to `triage_records` override columns
- [x] Triage severity override queries updated - ✅ Now use `triage_records.overrideSource`
- [x] Strategy detail view queries updated - ✅ Removed blotter from response
- [x] Triage action API routes updated - ✅ Now write to `triage_records` + journal
- [x] Bulk triage action routes updated - ✅ Now write to `triage_records` + journal
- [x] Admin recompute page cleaned up - ✅ Removed blotter backfill UI

**Note:** Backup retained as `blotter_actions_backup` table for safety. Can be dropped after verification period.

---

## Risk Mitigation

### Before dropping tables
1. Verify no active queries reference them
2. Check for foreign key dependencies
3. Back up data if needed for historical reference

### Before removing UI
1. Ensure journal pages cover all use cases
2. Verify no navigation links to blotter remain

### Rollback plan
- Archive folder contains all deprecated code
- Database migrations can be reversed if needed
- Git history preserves all removed files

---

## Unified Remaining Work

**Last Updated:** 2026-01-16 (StateCode archival completed)

### Quick Wins (< 1 hour each)

| Task | Location | Status |
|------|----------|--------|
| ~~Remove `realizedPnlToDate`~~ | `src/lib/derived/strategyMetrics.ts` | ✅ Complete |
| ~~Standardize "conviction" → "confidenceLevel"~~ | `src/types/claims.ts`, `CLAUDE.md` | ✅ Complete |
| Remove `lifecycleStatus` refs | See #ENH-048 | Tracked as enhancement |

### Safe Code Removal (no dependencies)

| Task | Location | Size | Action |
|------|----------|------|--------|
| ~~Archive `stateCode` system~~ | `src/lib/derived/stateCode.ts` | 696 lines | ✅ Archived (2026-01-16) |
| ~~Archive `strategyStateCode` service~~ | `src/lib/services/strategyStateCode.ts` | ~200 lines | ✅ Archived (2026-01-16) |
| ~~Drop `stateCode` column~~ | `strategyMetricsSnapshots` table | Schema | ✅ Dropped (2026-01-16) |
| ~~Drop `realizedPnlToDate` column~~ | `strategyMetricsSnapshots` table | Schema | ✅ Dropped (2026-01-16) |
| ~~Remove `playbook_items` table~~ | Database | Schema | ✅ Dropped (2026-01-16) |
| ~~Remove `stateCodeAtAction` column~~ | `blotter_actions` table | Schema | ✅ Dropped (2026-01-16) |
| ~~Remove playbook admin UI~~ | `src/app/admin/playbook/` | UI | ✅ Removed (2026-01-16) |
| ~~Remove playbook API routes~~ | `src/app/api/playbook/` | API | ✅ Removed (2026-01-16) |
| ~~Remove playbook queries~~ | `src/db/queries/playbook.ts` | Queries | ✅ Removed (2026-01-16) |
| ~~Remove CriteriaBuilder~~ | `src/components/playbook/` | Component | ✅ Removed (2026-01-16) |
| ~~Rename PlaybookSidebar~~ | `src/components/strategies/` | Component | ✅ Renamed to StrategySidebar (2026-01-16) |

### Dead Columns (blotter_actions)

| Column | Reason | Action |
|--------|--------|--------|
| `legScope` | Never populated | Remove when blotter fully deprecated |
| `riskNotesAtAction` | Never populated | Remove when blotter fully deprecated |
| `linkedSignalId` | Never used | Remove when blotter fully deprecated |

### Documentation Needed

| Topic | Priority | Notes |
|-------|----------|-------|
| Signal evaluation rules | Medium | Centralize from scattered code |
| Thesis triage rules | Medium | Document needs_articulation, new claims triggers |
| Auto-promotion flow | Low | claims_structure → main_claims |

### Schema Changes (tracked enhancements)

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| [#ENH-047](FUTURE_ENHANCEMENTS.md#enh-047-triage-severitystatus-separation) | Triage severity/status separation | Medium |
| [#ENH-048](FUTURE_ENHANCEMENTS.md#enh-048-thesis-status-field-consolidation) | Thesis status field consolidation | Medium |

### Major Migrations (deferred)

| Task | Blocker | Prerequisites |
|------|---------|---------------|
| Blotter → Journal | `blotter_actions` actively used | Migrate triage severity tracking to journal |
| Full blotter deprecation | Above migration | Complete journal migration first |

### Recommended Execution Order

1. ~~**Quick wins**~~ - ✅ Complete (realizedPnlToDate, conviction terminology)
2. ~~**StateCode archival**~~ - ✅ Complete (2026-01-16) - Removed 900+ lines of dead code
3. **Documentation** - Helps future work
4. **#ENH-047** - Triage severity/status separation
5. **#ENH-048** - Thesis status field consolidation
6. **Blotter migration** - Complex, requires planning

---

## Blotter-to-Journal Migration Plan

**Status:** Planning (2026-01-16)

### Current Blotter Usage

Only 6 files reference `blotterActions`:

| File | Usage |
|------|-------|
| `src/db/schema.ts` | Schema definition |
| `src/lib/derived/triage.ts` | Severity override lookups |
| `src/app/api/triage/action/route.ts` | Create triage action records |
| `src/app/api/triage/action/bulk/route.ts` | Bulk triage actions |
| `src/lib/services/strategies.ts` | Strategy service queries |
| `src/db/queries/strategies.ts` | Strategy detail queries |

### Core Functionality to Migrate

1. **Severity Override Tracking**
   - DISMISS/MONITOR actions with severity overrides
   - Override expiry dates (time-limited overrides)
   - Position/Strategy-level targeting

2. **Trade Action Tracking**
   - Pending TRADE actions marked complete on match
   - Links between triage actions and trades

### Migration Strategy

**Phase 1: Dual-Write**
- Continue writing to `blotter_actions`
- Also write to `journal_entries` with override metadata
- `metadata` JSONB stores: `severityOverride`, `triageFlagAtAction`, `overrideExpiresDate`, `monitorDays`

**Phase 2: Switch Reads**
- Update `prefetchSeverityOverrides()` to read from journal
- Query: `actionType = 'triage_override'` + metadata filters
- Test thoroughly with existing data

**Phase 3: Remove Blotter Writes**
- Stop writing to `blotter_actions`
- Remove blotter insert code from triage routes

**Phase 4: Drop Table**
- Verify no remaining references
- Drop `blotter_actions` table

### Journal Entry Schema for Triage Overrides

```typescript
{
  objectType: 'position' | 'strategy',
  objectId: positionId | strategyId,
  actionType: 'triage_override',
  actionDescription: 'DISMISS REVIEW_DTE - User dismissed triage flag',
  metadata: {
    severityOverride: 'complete',      // 'monitor' | 'complete' | 'pending'
    triageFlagAtAction: 'REVIEW_DTE',  // The flag being overridden
    overrideExpiresDate: '2026-02-16', // null = permanent
    monitorDays: 7,                    // For MONITOR actions
    actionDetail: 'DISMISS',           // Original action type
  },
  source: 'user',
  status: 'active',  // 'active' | 'superseded' when new override
}
```

### Index Requirements

Add index for efficient override lookups:
```sql
CREATE INDEX idx_journal_triage_override
ON journal_entries ((metadata->>'triageFlagAtAction'), object_id, status)
WHERE action_type = 'triage_override';
```

### Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Dual-Write | 2-3 hours |
| Phase 2: Switch Reads | 4-6 hours |
| Phase 3: Remove Writes | 1-2 hours |
| Phase 4: Drop Table | 1 hour |
| **Total** | **8-12 hours** |

### Prerequisites

- #ENH-047 completed (clean severity/status separation)
- Sufficient test coverage for triage system
