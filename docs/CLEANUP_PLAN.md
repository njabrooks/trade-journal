# Cleanup Plan: PRD Alignment & Technical Debt

**Generated:** 2026-01-16
**Updated:** 2026-01-16 (All major cleanups COMPLETED)
**Purpose:** Map audit findings against PRD v1.1 and prioritize cleanup work.

---

## Table of Contents

1. [PRD Alignment Assessment](#prd-alignment-assessment)
2. [Completed Cleanups](#completed-cleanups)
3. [Remaining Work](#remaining-work)
4. [Risk Mitigation](#risk-mitigation)

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

**Completed:** `researchMappings` table dropped - claims now link directly to theses.

---

### PRD Section 6: Workflow & Triage Engine

| PRD Concept | Implementation Status |
|-------------|----------------------|
| Triggers (event-based) | ✅ TradingView webhooks via signals |
| Triggers (rule-based) | ✅ Signal evaluation |
| Triage | ✅ `triage_records` with status/severity separation |

**Completed:** `stateCode` system removed - replaced by signals.

---

### PRD Section 8: Logging, Journal & Institutional Memory

| PRD Concept | Implementation Status |
|-------------|----------------------|
| Chronological journal | ✅ `journal_entries` table |
| Event Logging | ✅ `logToJournal()` captures all events |

**Completed:** Blotter system fully removed (2026-01-16):
- Trade ingestion events → Journal entries
- Triage metadata → Journal entries
- Severity overrides → `triage_records` table (overrideSource, overrideExpiresDate, overrideAt columns)
- `blotter_actions` table dropped, backup retained as `blotter_actions_backup`

---

## Completed Cleanups

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

### 2. StateCode/Playbook System (✅ FULLY REMOVED - 2026-01-16)

Replaced by signals system.

**Removed:**
- `src/lib/derived/stateCode.ts` (696 lines)
- `src/lib/services/strategyStateCode.ts`
- `playbook_items` table
- `strategyMetricsSnapshots.stateCode` column
- `strategyMetricsSnapshots.realizedPnlToDate` column
- `blotter_actions.stateCodeAtAction` column
- `src/app/admin/playbook/` (UI)
- `src/app/api/playbook/` (API routes)
- `src/db/queries/playbook.ts`
- `src/components/playbook/CriteriaBuilder`
- Renamed `PlaybookSidebar` → `StrategySidebar`

---

### 3. Research Mappings (✅ REMOVED - 2026-01-16)

Insight-level mappings were redundant - claims now link directly to theses via `claim_thesis_mappings`.

**Removed:**
- `research_mappings` table
- All `researchMappings` queries from `src/db/queries/research.ts`

---

### 4. Dead Functions & Columns (✅ REMOVED - 2026-01-16)

| Item | Location | Status |
|------|----------|--------|
| `getAllClaimsWithSources()` | `src/db/queries/research.ts` | ✅ Removed |
| `getPreInvestmentResearch()` | `src/db/queries/research.ts` | ✅ Removed |
| `realizedPnlToDate` | `strategyMetricsSnapshots` | ✅ Dropped |

---

### 5. Triage Severity/Status Separation (✅ #ENH-047 - 2026-01-16)

Separated workflow status from severity level on `triage_records`:
- `status`: inbox, in_progress, done (workflow state)
- `severity`: urgent, attention, monitor, info (importance level)

---

### 6. Entity Status Standardization (✅ #ENH-048 - 2026-01-16)

Unified lifecycle status values across all entities:
- `draft` → `active` → `complete` | `rejected`

Applied to: MacroThesis, AssetThesis, Strategy, Signal, MainClaim, ResearchArtifact, ResearchInsight

---

### 7. Terminology Standardization (✅ COMPLETED - 2026-01-16)

| Change | Status |
|--------|--------|
| `asset_view` → `asset_thesis` | ✅ Updated across all files |
| `validation_points` → `signals` | ✅ Renamed |
| `conviction` → `confidenceLevel` | ✅ Standardized |

---

## Remaining Work

### Documentation Needed

| Topic | Priority | Notes |
|-------|----------|-------|
| Signal evaluation rules | Medium | Centralize from scattered code |
| Thesis triage rules | Medium | Document needs_articulation, new claims triggers |
| Auto-promotion flow | Low | claims_structure → main_claims |

### Housekeeping

| Task | Priority | Notes |
|------|----------|-------|
| Drop `blotter_actions_backup` | Low | After verification period (30 days) |

---

## Risk Mitigation

### Rollback plan
- Database backups retained (`blotter_actions_backup`)
- Git history preserves all removed files
- Migration files documented in `/migrations/`

---

## Success Criteria

**All Major Cleanups Complete (2026-01-16):**

- [x] `research_mappings` table dropped
- [x] `researchMappings` queries removed from research.ts
- [x] Dead functions removed from research.ts
- [x] `asset_view` → `asset_thesis` terminology updated
- [x] StateCode system removed (696 lines)
- [x] Playbook system removed (UI, API, queries)
- [x] `blotter_actions` table dropped
- [x] Triage severity/status separated (#ENH-047)
- [x] Entity status standardized (#ENH-048)
- [x] Documentation updated (CLAUDE.md, CURRENT_STATE.md)

**Remaining:**
- [ ] Documentation (signals, triage rules)
- [ ] Drop backup table after verification
