# Completed Enhancements Archive (2025-2026)

**Purpose**: Historical record of completed enhancement specifications. Moved from FUTURE_ENHANCEMENTS.md to reduce document size.

**Reference**: For active work and backlog, see `docs/FUTURE_ENHANCEMENTS.md`

---

## Phase 3.2: Validation Assessment Workflow (2026-01-05)

### #ENH-042: Validation Assessment Workflow
**Status**: Complete (2026-01-05)
**PRD Alignment**: Section 5.5 (Thesis Evaluation), Section 6.1 (Triggers)

Top-down evidence assessment workflow that complements bottom-up research discovery. Analyzes content against existing validation points.

**Implemented**:
- `/assess-validation-evidence` Claude Code skill
- Database script: `scripts/assess-validation-evidence.ts` (437 lines)
- Ticker-based thesis lookup
- LLM-powered cross-reference analysis
- Structured markdown assessment reports

### #ENH-042B: Assessment-to-Database Recording
**Status**: Complete (2026-01-05)

Extended assess-validation-evidence to write results directly to database via `dualWrite()`.

### #ENH-042C: Validation Status History UI
**Status**: Complete (2026-01-05)

- Validation point detail pages for macro and asset theses
- StatusTimeline component (301 lines)
- MonitoringEventsLog component (383 lines)
- ValidationPointDetail component (431 lines)

---

## Phase 2.7: Unified Browser Pattern & Hierarchy UX (2025-12-31)

**Overview**: Extended UnifiedClaimsBrowser pattern to all hierarchy entities.

### #ENH-013: Unified Macro Thesis Browser
**Status**: Complete (2025-12-30)

- Component: `src/components/theses/UnifiedMacroThesisBrowser.tsx` (631 lines)
- 5 filters: Type, Time Horizon, Confidence, Status, Direction
- Search, sort, expandable rows, keyboard shortcuts

### #ENH-014: Unified Asset Thesis Browser
**Status**: Complete (2025-12-30)

- Component: `src/components/asset-theses/UnifiedAssetThesisBrowser.tsx` (660 lines)
- 5 filters: Ticker, Macro Thesis, Time Horizon, Confidence, Status

### #ENH-015: Unified Strategies Browser
**Status**: Complete (2025-12-30)

- Component: `src/components/strategies/UnifiedStrategiesBrowser.tsx` (700+ lines)
- 5 filters: Status, Account, Asset Thesis, Macro Thesis, State Code
- Displays both open and closed strategies

### #ENH-016: Research Detail Page UX
**Status**: Complete (2025-12-30)

Compact layout with side-by-side metadata and workflow status.

### #ENH-017: Claims 'Linked To' Filter
**Status**: Complete (2025-12-30)

Filter claims by linked thesis or show unlinked claims.

### #ENH-018: Macro Thesis Detail Page Enhancements
**Status**: Complete (2025-12-31)

Refactored with unified browsers, compact layout, delete functionality.

### #ENH-019: Asset Thesis Detail Page Enhancements
**Status**: Complete (2025-12-31)

Refactored with unified browsers, fixed underlying market data display.

### #ENH-021: Rename /theses to /macro-theses
**Status**: Complete (2025-12-30)

URL consistency with asset-theses route.

### #ENH-023: Fix ClientHierarchyBreadcrumb Bugs
**Status**: Complete (2025-12-30)

Fixed field name mismatch causing silent update failures.

---

## Phase 2.6: Research UX Enhancements (2025-12-29)

### #ENH-001: Sidebar Navigation Reordering
**Status**: Complete (2025-12-28)

Reordered to: Triage > Journal > Strategies > Asset Theses > Macro Theses > Research > Portfolio

### #ENH-002: Claims Browser Page
**Status**: Complete (2025-12-29)

- `UnifiedClaimsBrowser.tsx` (463 lines)
- Auto-promotion from claims_structure JSONB to main_claims table
- Status badges, filters, search, source tracking

### #ENH-004: Link Asset Theses to Underlyings Schema
**Status**: Complete (2025-12-29)

Added "Underlying Market Data" section to asset thesis detail pages.

### #ENH-005: Rename Asset View to Asset Thesis
**Status**: Complete (2025-12-29)

Comprehensive rename: 102 files changed, 451+ occurrences.

### #ENH-006: Asset Thesis Auto-Generated Titles
**Status**: Complete (2025-12-29)

Format: `{Direction} {Underlying} {Time Horizon}`

### #ENH-008: Enhanced Hierarchy Linking UX
**Status**: Complete (2025-12-29)

Visual breadcrumb component, inline linking dialogs, cascade linking.

### #ENH-009: Macro Thesis Auto-Generated Titles
**Status**: Complete (2025-12-29)

Format: `{Direction} {Sector/Topic} {Time Horizon}`

### #ENH-010: Define Sector/Topic Taxonomy
**Status**: Complete (2025-12-29)

115-item taxonomy across 6 categories in `src/lib/constants/sector-taxonomy.ts`.

### #ENH-011: Unified Claim Confirmation with Linking Workflow
**Status**: Complete (2025-12-29)

Confirm claims by linking to existing theses OR creating new ones.

---

## Phase 2.5: AI Research Enhancements (2025-12-22)

- Prompt Management System (editable prompts)
- Multi-Model AI Support (Claude, GPT, Gemini)
- Hierarchy Analysis & Recommendations
- Recommendation UI (accept/reject)

---

## Phase 2: Research & Intelligence Layer (2025-12-22)

- Database & Core Infrastructure
- Research Ingestion
- AI Integration
- Research Mapping UI

---

## Phase 1: Beliefs & Decision Hierarchy (2025-12-21)

- Core Implementation (macro_theses, asset_theses tables)
- Hierarchy Linking UI

---

## Infrastructure Enhancements (2025-12)

- #9: Automated Flex Ingestion (GitHub Actions)
- #10: Underlyings IV History Ingestion
- #4: State Code Change Performance Optimization
- #21: Auto-Trigger Recompute After Data Changes
- #24: Account Management UI
- #25: Multi-Account Support in UI

---

## #ENH-041: Local-First Database Architecture (2026-01-05)

Migrated from Supabase-only to hybrid local-first architecture:
- SQLite as primary data store
- PostgreSQL (Supabase) as backup
- Dual-write library for consistency
- Cost savings: $300/year to $0/year

---

## Abandoned Enhancements

### #ENH-025: Strategy Provenance Chain Component
**Status**: Abandoned (2026-01-04)
**Reason**: Does not add value beyond existing HierarchyBreadcrumb component.
**Recovery**: Code preserved in git commit `9d8ba79`.
