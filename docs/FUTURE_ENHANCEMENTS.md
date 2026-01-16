# Future Enhancements

**Purpose**: Single source of truth for planned enhancements with PRD traceability.

**Last Updated**: 2026-01-16 (Cleanup and archive of completed work)

---

## Quick Navigation

- [Active Work](#active-work)
- [Planned - High Priority](#planned---high-priority)
- [Planned - Medium Priority](#planned---medium-priority)
- [Deferred](#deferred-enhancements)
- [Enhancement Registry](#enhancement-registry)
- [Completed](#completed-enhancements)

---

## Active Work

No active enhancements in progress. See [Planned](#planned---high-priority) for next priorities.

---

## Planned - High Priority

### #ENH-035: Thesis Articulation Generation
**Priority**: High | **Effort**: 1 week | **Phase**: 3.1
**PRD**: Section 5.5 (Thesis Evaluation), Section 5.7 (Role of AI)

Claude Code skill to synthesize linked claims into coherent thesis articulation with key drivers, assumptions, and evidence gaps. Versioned storage for belief evolution tracking.

**Deliverables**:
- `/synthesize-thesis` skill
- `thesis_articulations` table with versioning
- Provenance tracking (which claims were synthesized)

---

### #ENH-036: Signal Extraction from Thesis Articulation
**Priority**: High | **Effort**: 1 week | **Phase**: 3.1
**PRD**: Section 6.1 (Triggers)
**Dependencies**: #ENH-035

Extract explicit, measurable criteria for thesis validation/invalidation during articulation. Push for specificity on qualitative criteria.

**Deliverables**:
- Extraction integrated into `/synthesize-thesis` skill
- `signals` table integration with explicit/judgment classification
- Response protocol specification

---

### #ENH-037: Manual Status Tracking & Audit Trail
**Priority**: High | **Effort**: 1 week | **Phase**: 3.1
**PRD**: Section 8 (Institutional Memory)
**Dependencies**: #ENH-036

In-app UI for manually updating signal status with evidence. Full audit trail of status changes.

**Deliverables**:
- `signal_status_history` table
- `decision_audit_log` table
- Signal detail UI with status timeline

---

### #ENH-038: Automated Monitoring System
**Priority**: High | **Effort**: 2 weeks | **Phase**: 3.2
**PRD**: Section 6.1 (Triggers - Automated Monitoring)
**Dependencies**: #ENH-037

Claude proactively monitors signals via scheduled jobs. Web search, RSS feeds, API integrations.

**Deliverables**:
- `monitoring_specs` table
- `/monitor-theses` scheduled skill
- GitHub Actions cron integration

---

### #ENH-020: Automated Tests
**Priority**: High | **Effort**: 2-3 weeks | **Phase**: 5+
**PRD**: N/A (Infrastructure)

Unit tests for service functions, integration tests for ingestion flows, API endpoint tests.

---

### #ENH-014: Complete Manual Linking UI
**Priority**: High | **Effort**: 2-3 days | **Phase**: 5+ (Quick Win)
**PRD**: Section 4 (Data Ingestion)

Add endpoints to list unlinked positions/trades. Display in table with bulk-select and filters.

**Current State**: API and UI pages exist, missing unlinked item endpoints.

---

## Planned - Medium Priority

### ~~#ENH-020-playbook: Strategy Playbook Tab~~ (ABANDONED)
**Status**: Abandoned (2026-01-16)
**Reason**: Playbook system was removed - it was only used for stateCode configuration which has been replaced by the Signals system. Entry/exit rules and risk management now handled through signals and triage.

---

### #ENH-039: News & Narratives Integration
**Priority**: Medium | **Effort**: 2-3 weeks | **Phase**: 3.3
**PRD**: Section 6.1 (Triggers)
**Dependencies**: #ENH-038

Proactive intelligence gathering, narrative tracking, cross-thesis correlations, source credibility scoring.

---

### #ENH-042D: Evidence Aggregation & Trend Analysis
**Priority**: Medium | **Effort**: 1 week | **Phase**: 3.2C
**Dependencies**: #ENH-042C

Evidence strength scores (0-100), trend visualization, conflicting evidence detection.

---

### #ENH-042E: FRED Economic Data Integration
**Priority**: Medium | **Effort**: 2-3 days | **Phase**: 3.2D (Quick Win)
**Dependencies**: #ENH-042B

Automated monitoring of FRED data against signal thresholds. OpenBB integration already configured.

---

### #ENH-042F: IV30 & Price Data Integration
**Priority**: Medium | **Effort**: 3-4 days | **Phase**: 3.2D
**Dependencies**: #ENH-042B

Monitor price/IV from `underlyings_iv_history` table against thresholds.

---

### #ENH-042G: News & SEC Filing Integration
**Priority**: Medium | **Effort**: 1-2 weeks | **Phase**: 3.2D
**Dependencies**: #ENH-042B

Finnhub integration, SEC EDGAR RSS, semantic relevance scoring, auto-trigger assessment.

---

### #ENH-042H: Master Monitoring Orchestration
**Priority**: Medium | **Effort**: 1 week | **Phase**: 3.2E
**Dependencies**: #ENH-042E, #ENH-042F, #ENH-042G

Unified daily monitoring script running all data source checks.

---

### #ENH-005-triage: Triage Rules Database Persistence
**Priority**: Medium | **Effort**: 3-4 days | **Phase**: 5+
**PRD**: Section 6 (Workflow & Triage Engine)

Persist triage rules to database instead of code constants.

---

### #ENH-001-roll: Roll Trade Auto-Detection
**Priority**: Medium | **Effort**: 1 week | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)

Pattern matching to auto-detect roll trades by underlying + expiry/strike changes.

---

### #ENH-013: Decision-Making Assistant (AI)
**Priority**: Medium | **Effort**: 2-3 weeks | **Phase**: 5+
**PRD**: Section 7 (Decision Support)

ChatGPT integration at strategy-detail level for AI-assisted decision support.

---

### #ENH-023: Underlyings Allocation Management
**Priority**: Medium | **Effort**: 1-2 weeks | **Phase**: 5+
**PRD**: Section 3 (Conceptual Model)

Target percentage allocations, current vs target display, allocation-based triggers.

---

### #ENH-043: Multi-Exchange Crypto Ingestion
**Priority**: Medium | **Effort**: 2-3 weeks | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)

Support Coinbase, Kraken, HyperLiquid, DEX. Schema extensions for crypto instruments.

**Dependencies**: #ENH-044

---

### #ENH-044: Multi-Account IBKR Support
**Priority**: Medium-High | **Effort**: 1-2 weeks | **Phase**: 5+
**PRD**: Section 4 (Data Ingestion)

Multiple IBKR accounts with per-account Flex queries. Foundation for multi-exchange support.

---

### #ENH-040: Data Visualization Enhancements
**Priority**: Medium | **Effort**: 1-2 days each | **Phase**: Backlog

- Asset thesis: 90-day spot/IV chart
- Asset thesis: Options chain IV surface
- Macro thesis: FRED metrics display
- Strategy: Asset contribution waterfall
- Portfolio: Cross-asset correlation matrix

---

### #ENH-046: Claim Detail Page Linking
**Priority**: Medium | **Effort**: 2-4 hours | **Phase**: Backlog (Quick Win)

Add "Link to Thesis" button on claim detail page. Reuse existing ConvertClaimToEntityDialog.

---

### #ENH-048: Thesis Status Field Consolidation
**Priority**: Medium | **Effort**: 1-2 days | **Phase**: 5+ (Technical Debt)
**PRD**: Section 3 (Decision Hierarchy), Section 5 (Research Layer)

Resolve confusion between `status`, `workflowStatus`, and `lifecycleStatus` fields on MacroThesis and AssetThesis entities.

**Current State:**
- `status` - Lifecycle validity (used)
- `workflowStatus` - User intent (schema only, never used in code)
- `lifecycleStatus` - Workflow progression (marked deprecated, but actively used in code)

**Proposed Solution:**

Keep TWO fields with clear, distinct purposes:

| Field | Purpose | Values | When Changes |
|-------|---------|--------|--------------|
| `status` | Lifecycle validity | active, retired, superseded, invalidated | When thesis validity changes |
| `workflowStatus` | Workflow progression | needs_claims, needs_synthesis, needs_signals, monitoring, closed | Auto-computed or manual |

**Migration Steps:**
1. Update `workflowStatus` enum values to match workflow stages
2. Migrate `lifecycleDetection.ts` to use `workflowStatus` instead of `lifecycleStatus`
3. Drop `lifecycleStatus` column after migration
4. Update CURRENT_STATE.md state machines

**Alternative:** Make workflow stage COMPUTED (not stored) based on:
- Has claims? → needs_synthesis
- Has articulation? → needs_signals
- Has signals? → monitoring

This eliminates stored state that can get out of sync.

**Scope:** ~20 file changes (schema, lifecycleDetection.ts, queries, UI)

**See:** [CLEANUP_PLAN.md](CLEANUP_PLAN.md#6-thesis-status-field-confusion-technical-debt) for full analysis.

---

## Planned - Low Priority

### #ENH-002-timeout: Trade Decision Timeout
**Priority**: Low | **Effort**: 1 week | **Phase**: 6+

Manual resolution or timeout for pending trade decisions.

---

### #ENH-015: Merged/Archive View
**Priority**: Low | **Effort**: 3-4 days | **Phase**: 6+

Expose merged strategies with optional undo functionality.

---

### #ENH-011-exercises: Exercises/Assignments Ingestion
**Priority**: Low | **Effort**: 1 week | **Phase**: 6+

Flex OPTT row ingestion for exercises.

---

### #ENH-012-cash: Cash Transactions Ingestion
**Priority**: Low | **Effort**: 1 week | **Phase**: 6+

Flex CTRN row to `cash_flows` table.

---

### #ENH-010a: IBKR API for IV History
**Priority**: Low | **Effort**: 1-2 weeks | **Phase**: 6+

Daily IV/spot from IBKR API instead of weekly Option Strategist data.

---

## Deferred Enhancements

### #ENH-003: Claims in Triage Page
**Deferred to**: Phase 4+ (requires trigger infrastructure)

Research processing generates triage trigger, claim actions resolve it.

---

### #ENH-012: Mandatory Link Triage Triggers
**Deferred to**: Phase 4+ (requires trigger infrastructure)

Generate triage records when mandatory hierarchy links missing.

---

### #ENH-007: Auto-Generate Asset Thesis Descriptions
**Deferred from**: Phase 2.6

AI-generated descriptions from linked macro theses and claims.

---

### #ENH-008-time: Time-Based Workflow Components
**Partially absorbed**: Phase 3 covers event logging, reviews, pattern recognition
**Remaining for Phase 6+**: Emotional state tracking, calendar-based triggers

---

## Enhancement Registry

**Next Enhancement ID**: #ENH-049

### ID Allocation

| Range | Phase/Area |
|-------|------------|
| #ENH-001 - #ENH-012 | Legacy (Phase 1-2) |
| #ENH-013 - #ENH-025 | Phase 2.6-2.7 |
| #ENH-035 - #ENH-039 | Phase 3.1-3.3 |
| #ENH-040 - #ENH-046 | Phase 3.2 sub-phases |
| #ENH-047 - #ENH-048 | Status field technical debt |
| #ENH-049+ | Available |

**Format**: `#ENH-XXX` or `#ENH-XXX-name` for variants

---

## Completed Enhancements

For detailed specifications of completed work, see [docs/archive/completed-enhancements-2025-2026.md](archive/completed-enhancements-2025-2026.md).

### Summary

| Phase | Date | Key Deliverables |
|-------|------|------------------|
| #ENH-047 | 2026-01-16 | Triage severity/status separation - clean workflow vs importance fields |
| 3.2A-B | 2026-01-05 | Validation assessment workflow, database recording, status history UI |
| 2.7 | 2025-12-31 | Unified browsers for all hierarchy entities (9 of 11 complete) |
| 2.6 | 2025-12-29 | Research UX, claims browser, hierarchy linking, terminology standardization |
| 2.5 | 2025-12-22 | AI research enhancements, multi-model support |
| 2 | 2025-12-22 | Research & Intelligence Layer |
| 1 | 2025-12-21 | Beliefs & Decision Hierarchy |
| Infra | 2026-01-05 | Local-first database architecture (#ENH-041) |

### Abandoned

| ID | Name | Reason |
|----|------|--------|
| #ENH-025 | Strategy Provenance Chain | Redundant with HierarchyBreadcrumb |

---

## Related Documents

- **PRD v1.1**: `docs/PRD_v1.1.md` - Product vision (locked)
- **Current State**: `docs/CURRENT_STATE.md` - Actual implementation state
- **Cleanup Plan**: `docs/CLEANUP_PLAN.md` - Technical debt tracking
- **Completed Details**: `docs/archive/completed-enhancements-2025-2026.md`
