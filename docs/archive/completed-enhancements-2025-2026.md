# Completed Enhancements Archive (2025-2026)

**Purpose**: Historical record of completed enhancement specifications. Moved from FUTURE_ENHANCEMENTS.md to reduce document size.

**Reference**: For active work and backlog, see `docs/FUTURE_ENHANCEMENTS.md`

---

## Unified Triage Action Button (2026-01-19)

### #ENH-050: Unified Triage Action Button
**Status**: Complete (2026-01-19)
**PRD Alignment**: Section 6 (Workflow & Triage Engine)

Context-aware quick action button for triage inbox that provides one-click access to primary actions without expanding rows.

**Problems Solved:**
1. User had to expand rows to discover available actions
2. No visual cues about what action is appropriate per trigger type
3. Inconsistent action patterns across position/strategy/thesis triggers
4. Expanded detail showed excessive information for simple synthesis actions

**Key Components Created:**

| Component | Location | Purpose |
|-----------|----------|---------|
| `TriageQuickAction` | `src/components/triage/TriageQuickAction.tsx` | Context-aware action button with dropdown |
| `ThesisClaimsBrowserWrapper` | `src/components/triage/ThesisClaimsBrowserWrapper.tsx` | Claims browser filtered by thesis |
| `/api/claims/with-sources` | `src/app/api/claims/with-sources/route.ts` | API endpoint for client-side claims fetching |

**Action Mapping:**
| Trigger | Primary | Secondary | Behavior |
|---------|---------|-----------|----------|
| `ASSIGNMENT_RISK*`, `ITM_*`, `SIGMA_*` | Monitor | Dismiss | Duration dropdown (7/14/28 days) |
| `CONFIRM_STRATEGY` | Confirm | — | Opens StrategyConfirmationDialog |
| `LINK_STRATEGY_TO_THESIS` | Link | Dismiss | Opens StrategyConfirmationDialog |
| `QUANTITY_CHANGE`, `TRADE_INGESTION` | Trade | — | Expands row with auto-start |
| `PRODUCE_CORE_ARGUMENT` | Synthesize | Dismiss | Expands, shows "Build Core Argument" |
| `UPDATE_CORE_ARGUMENT` | Update | Dismiss | Expands, shows "Update Articulation (+N claims)" |
| `SIGNAL_TRIGGERED` | Assess | Dismiss | Expands to show signal assessment |
| `REVIEW_RECOMMENDED_SIGNALS` | Review | Dismiss | Expands to show signals table |

**Simplified Synthesis UI:**
For PRODUCE_CORE_ARGUMENT and UPDATE_CORE_ARGUMENT triggers, the expanded view shows only:
- Action card at top with claim counts and action button
- Claims browser showing linked claims
- Removed: urgency banner, info grid, purple box, suggested action section, bottom buttons

**Thesis Triage Re-triggering:**
Thesis triage is event-driven (not scheduled). Dismissed records re-trigger only when:
- New claims are linked to the thesis
- Manual reconciliation script is run

This means dismissing a synthesis trigger means "acknowledged until new evidence arrives."

**Quality Metrics:**
- 20+ trigger types mapped to appropriate actions
- Severity-based color scheme (rose/amber/blue/slate)
- Full TypeScript type safety
- Consistent UX across position, strategy, and thesis triage

---

## Unified Entity Detail UX/UI (2026-01-19)

### #ENH-049: Unified Entity Detail UX/UI
**Status**: Complete (2026-01-19)
**PRD Alignment**: Section 3 (Conceptual Model - Hierarchy)

Aligned UX/UI patterns across Macro Thesis, Asset Thesis, and Strategy detail pages with consistent 3-tab navigation, two-column layout, and shared components.

**Problems Solved:**
1. Inconsistent navigation patterns - users had to learn 3 different mental models
2. Asset Thesis accordion overload - collapsed 10 sections into 3 focused tabs
3. Action discoverability - consolidated edit/synthesize/link actions in header dropdown
4. Visual hierarchy unclear - now clear primary (tabs) / secondary (sidebar) distinction

**Unified Design Pattern:**
- Two-column layout: main content area + sticky sidebar
- 3 tabs: Overview, Evidence, Execution
- URL-based tab navigation (no client-side state)
- Persistent sidebar with Quick Stats + Related Entities

**Shared Components Created:**

| Component | Location | Purpose |
|-----------|----------|---------|
| `EntityDetailLayout` | `src/components/layout/EntityDetailLayout.tsx` | Master wrapper for all entity detail pages |
| `EntityTabs` | `src/components/layout/EntityTabs.tsx` | Reusable tab navigation with URL-based routing |
| `EntitySidebar` | `src/components/layout/EntitySidebar.tsx` | Sticky sidebar with accordion sections |
| `EntityActions` | `src/components/layout/EntityActions.tsx` | Standardized actions dropdown |
| `info-row.tsx` | `src/components/ui/info-row.tsx` | Label/value display pairs for metadata |
| `createEntityTabs()` | `src/lib/types/entity-tabs.ts` | Helper to create standard 3-tab structure |

**Entity-Specific Implementations:**

| Entity | Pages | Sidebar |
|--------|-------|---------|
| Macro Thesis | `[id]/page.tsx` (redirect), `overview/`, `evidence/`, `execution/` | `MacroThesisSidebar.tsx` |
| Asset Thesis | `[id]/page.tsx` (redirect), `overview/`, `evidence/`, `execution/` | `AssetThesisSidebar.tsx` |
| Strategy | `[strategyId]/page.tsx` (redirect), `overview/`, `evidence/`, `execution/` | `StrategySidebar.tsx` |

**Tab Content Mapping:**

| Tab | Macro Thesis | Asset Thesis | Strategy |
|-----|--------------|--------------|----------|
| Overview | Core argument, notes | Core argument, market data | Performance metrics, charts |
| Evidence | Signals, main claims | Signals, claims | Triage queue, signals |
| Execution | Linked asset theses, strategies | Linked macro theses, strategies | Positions, trades |

**Quality Metrics:**
- Code reusability: Core layout components used across 9 page files
- UX consistency: All three entity types follow identical structural pattern
- Type safety: Full TypeScript with well-defined interfaces

---

## Status Field Technical Debt (2026-01-16)

### #ENH-047: Triage Severity/Status Separation
**Status**: Complete (2026-01-16)
**PRD Alignment**: Section 6.1 (Triggers), Section 6.2 (Triage)

Separated workflow status from severity level in triage records. Previously, the `severity` field conflated two concepts: importance levels (urgent, attention, monitor, info) and workflow states (pending, complete).

**Key Insight**: Triage records are separate objects associated with domain entities. The entity has its own lifecycle status; the triage record has its own workflow state + severity.

**Implemented**:
- Added `status` column to `triage_records`: `inbox` | `in_progress` | `done`
- Added `status` column to `thesis_triage_records`: `inbox` | `in_progress` | `done`
- Standardized `severity` to pure importance: `urgent` | `attention` | `monitor` | `info`
- Migration script: `migrations/20260116_triage_status_severity_separation.sql`
- Updated TypeScript types in `src/types/triage.ts`
- Updated schema in `src/db/schema.ts`

**Files Changed**: ~30 files across queries, API routes, derived logic, UI components

**Foundation for**: #ENH-048 (Entity Status Standardization) - extends this pattern to all domain entities

### #ENH-048: Entity Status Standardization
**Status**: Complete (2026-01-16)
**PRD Alignment**: Section 3 (Decision Hierarchy), Section 5 (Research Layer)

Standardized all entity `status` fields to use a universal lifecycle model. Builds on #ENH-047's pattern of separating workflow state from lifecycle status.

**Universal Lifecycle Values:**
- `draft` → Planning/developing stage
- `active` → Currently active/open
- `complete` → Finished/closed successfully
- `rejected` → Abandoned/invalidated/merged

**Entity Migrations:**

| Entity | Old Values | New Values |
|--------|------------|------------|
| `main_claims` | unconfirmed, confirmed, rejected, invalidated, merged | draft, active, complete, rejected |
| `signals` | recommended, not_triggered, triggered, superseded | draft, active, complete, rejected |
| `macro_theses` | status + workflowStatus + lifecycleStatus | status only (draft, active, complete, rejected) |
| `asset_theses` | status + workflowStatus + lifecycleStatus | status only (draft, active, complete, rejected) |
| `strategies` | open, closed, merged, draft, planned | draft, active, complete, rejected |

**Key Simplifications:**
- Removed `workflowStatus` and `lifecycleStatus` from theses (triage system handles workflow)
- Unified `merged`, `invalidated`, `superseded` → `rejected`
- Added explicit `status` field to strategies (previously computed)

**Migration Scripts:**
- `migrations/20260116_standardize_claim_status.sql`
- `migrations/20260116_standardize_signal_status.sql`
- `migrations/20260116_standardize_thesis_status.sql`
- `migrations/20260116_standardize_strategy_status.sql`

**Files Changed**: ~50 files across schema, queries, API routes, services, derived logic, UI components

---

## Phase 3.1: Thesis Synthesis & Signal Extraction (2026-01-16)

### #ENH-035: Thesis Articulation Generation
**Status**: Complete (2026-01-16)
**PRD Alignment**: Section 5.5 (Thesis Evaluation), Section 5.7 (Role of AI)

Claude Code skill to synthesize linked claims into coherent thesis articulation with key drivers, assumptions, and evidence gaps. Versioned storage for belief evolution tracking.

**Implemented**:
- `/build-core-argument` Claude Code skill (`.claude/skills/build-core-argument/SKILL.md` - 1337 lines)
- `thesis_articulations` table with versioning (`src/db/schema.ts`)
- Provenance tracking via `claims_used` field storing claim IDs that were synthesized
- Dual-write support for articulations
- Markdown output to `~/Desktop/investment-research/thesis-articulations/`

**Key Features**:
- Multi-step synthesis: fetch thesis → retrieve claims → LLM synthesis → extract signals → write articulation
- Versioned articulations with timestamps and linked claim tracking
- Generates structured output: Core Argument, Key Drivers, Assumptions, Evidence Gaps, Confidence Assessment

**Files Changed**:
- `.claude/skills/build-core-argument/SKILL.md` (skill definition)
- `src/db/schema.ts` (thesis_articulations table)
- `src/db/queries/research.ts` (articulation queries)

---

### #ENH-036: Signal Extraction from Thesis Articulation
**Status**: Complete (2026-01-16)
**PRD Alignment**: Section 6.1 (Triggers)
**Dependencies**: #ENH-035

Extract explicit, measurable criteria for thesis validation/invalidation during articulation. Push for specificity on qualitative criteria.

**Implemented**:
- Signal extraction integrated into `/build-core-argument` skill
- `signals` table with `explicit_details` JSONB for threshold configuration
- `type` field with values: `confirmation` | `warning`
- `classification` distinguishes `explicit` (measurable) vs `judgment` (qualitative)
- `entity_type` supports both `macro_thesis` and `asset_thesis`

**Signal Configuration Structure**:
```typescript
interface ExplicitDetails {
  metric_type: 'price' | 'iv30' | 'fred' | 'custom';
  threshold_type: 'above' | 'below' | 'between';
  threshold_value: number;
  ticker?: string;       // For price/IV signals
  fred_series?: string;  // For FRED signals
}
```

**Files Changed**:
- `src/db/schema.ts` (signals table definition)
- `src/components/signals/SignalConfigForm.tsx` (UI for signal configuration)
- `.claude/skills/build-core-argument/SKILL.md` (signal extraction logic)

---

### #ENH-037: Manual Status Tracking & Audit Trail
**Status**: Complete (2026-01-16)
**PRD Alignment**: Section 8 (Institutional Memory)
**Dependencies**: #ENH-036

In-app UI for manually updating signal status with evidence. Full audit trail of status changes.

**Implemented**:
- `signal_status_history` table tracking all status changes with timestamps and evidence
- `journal_entries` table serves as decision audit log (already existed, now integrated with signals)
- `StatusTimeline.tsx` component for visualizing signal status history
- `ValidationPointDetail.tsx` component for signal detail pages

**Note**: Original spec mentioned `decision_audit_log` table - this functionality is provided by the existing `journal_entries` table which logs all system events including signal status changes.

**Files Changed**:
- `src/db/schema.ts` (signal_status_history table)
- `src/components/thesis-synthesis/StatusTimeline.tsx` (301 lines)
- `src/components/thesis-synthesis/ValidationPointDetail.tsx` (431 lines)
- `src/app/api/signals/update-status/route.ts` (status update endpoint)

---

### #ENH-042F: IV30 & Price Data Integration
**Status**: Complete (2026-01-16)
**PRD Alignment**: Section 6.1 (Triggers - Automated Monitoring)
**Dependencies**: #ENH-042B

Monitor price/IV from `underlyings_iv_history` table against signal thresholds.

**Implemented**:
- Price/IV threshold checking in `scripts/daily-signal-monitoring.ts`
- Reads from `underlyings_iv_history` table for latest spot and IV30 values
- Checks against `signals.explicit_details` thresholds
- Creates triage records when thresholds are breached
- Logs breaches to journal

**Files Changed**:
- `scripts/daily-signal-monitoring.ts` (integrated price/IV monitoring)

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

### #ENH-020-playbook: Strategy Playbook Tab
**Status**: Abandoned (2026-01-16)
**Reason**: Playbook system was removed - it was only used for stateCode configuration which has been replaced by the Signals system. Entry/exit rules and risk management now handled through signals and triage.
