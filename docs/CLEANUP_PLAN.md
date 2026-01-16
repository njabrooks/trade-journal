# Cleanup Plan: PRD Alignment & Technical Debt

**Generated:** 2026-01-16
**Updated:** 2026-01-16 (Revised scope after user decisions)
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

**Deprecated:** Entire `blotter` system - Journal now handles all functionality:
- Trade ingestion events → Journal entries
- Triage metadata → Journal entries
- The complex blotter reconciliation is no longer needed

---

## Deprecated Systems Summary

### 1. Blotter System (FULLY DEPRECATED)

The Journal system now replaces all blotter functionality. Remove entirely:

**Database:**
- `blotter_actions` table - Drop
- All blotter-related columns

**Backend:**
- `src/lib/derived/blotter.ts` (1805 lines) - Archive locally
- `src/db/queries/blotter.ts` - Remove
- `src/app/api/blotter/*` - Remove all routes

**UI:**
- `src/app/blotter/*` - Remove pages
- `src/components/blotter/*` - Remove components

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

**Deferred (blotter system still actively used):**

- [ ] ~~`blotter_actions` table dropped~~ - **DEFERRED** - Still used for triage severity overrides
- [ ] ~~`stateCode` column dropped~~ - **DEFERRED** - Part of blotter dependency chain
- [ ] ~~All blotter UI pages removed~~ - **DEFERRED** - Pages already removed but backend still needed
- [ ] ~~All blotter components removed~~ - **DEFERRED** - Components removed but table active
- [ ] ~~All blotter API routes removed~~ - **DEFERRED** - Routes removed but schema active

**Note:** The blotter_actions table is still actively referenced by:
- `src/lib/derived/triage.ts` - Triage severity override queries
- `src/db/queries/strategies.ts` - Strategy detail view queries
- Triage action recording in API routes

Full blotter deprecation requires migrating these functionalities to the Journal system first.

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
