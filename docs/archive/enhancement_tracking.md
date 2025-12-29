# Enhancement Tracking Register

**Purpose**: Track all enhancements from ideation → completion, linking to PRD and Architecture phases.

**How to Use**:
1. When documenting new enhancements, register them here within 24 hours
2. Assign enhancement IDs (#ENH-XXX format)
3. Map to PRD sections and Architecture phases
4. Update status as work progresses
5. Move to "Completed" section when done

---

## Active Work (Current Sprint)

### 2025-12-28 Batch: Claims & Asset Thesiss UX Improvements
**PRD Alignment**: Section 5 (Research & Intelligence Layer), Section 3 (Conceptual Model - Hierarchy)
**Architecture Phase**: Phase 2.6 (Research UX Enhancements) - NEW
**Status**: 🚧 In Progress
**Priority**: High
**Estimated Effort**: 1-2 weeks
**Owner**: User
**Source**: `docs/20251228_enhancements.md`

**Context**: After completing Phase 2 (Research & Intelligence Layer), several UX improvements emerged:
- Need unified claims browsing across all research
- Asset Thesiss and Macro Theses need auto-generated titles/descriptions
- Linking workflow needs simplification
- Asset Thesiss should be properly linked to underlyings schema

**Enhancements**:

#### #ENH-001: Reorder Sidebar Navigation
**Status**: ✅ Complete (2025-12-28)
**PRD**: Section 9 (Visualisation & Attention Management)
**Effort**: 10 minutes
**Details**: Reorder main sidebar section to: Triage > Blotter > Strategies > Asset Thesiss > Macro Theses > Research > Portfolio
**Rationale**: Reflects workflow priority - action items first, strategic context second

#### #ENH-002: Claims Browser Page
**Status**: 🚧 Planned
**PRD**: Section 5.4 (Contextual Mapping to Investment Hierarchy)
**Effort**: 3-4 days
**Priority**: High (next in order)
**Details**:
- Unified page showing all main claims (promoted and unpromoted)
- Filters: promotion status, conversion status, category, confidence
- Search across claim text, evidence, reasoning
- Links to source research artifacts
- Conversion status badges
- Actions: promote, convert to thesis/view, archive
**Big Picture Impact**: Central hub for evaluating research claims before converting to theses/views

#### #ENH-006: Asset Thesis Auto-Generated Titles
**Status**: 🚧 Planned
**PRD**: Section 3 (Asset Thesiss)
**Effort**: 2-3 days
**Priority**: High
**Details**: Generate titles from required fields: `{Direction} {Underlying} {Time Horizon}`
**Example**: "Bullish TSLA Medium Term"
**Dependencies**: Requires structured fields (direction, time_horizon) in asset_views table
**Big Picture Impact**: Consistent naming convention, easier scanning of asset thesiss

#### #ENH-009: Macro Thesis Auto-Generated Titles
**Status**: 🚧 Planned
**PRD**: Section 3 (Macro Theses)
**Effort**: 2-3 days
**Priority**: High
**Details**: Generate titles from required fields: `{Direction} {Sector/Topic} {Time Horizon}`
**Example**: "Bullish US Inflation Medium Term"
**Dependencies**: Requires structured fields (direction, sector, time_horizon) in macro_theses table
**Big Picture Impact**: Consistent naming convention, clearer thesis hierarchy

#### #ENH-004: Link Asset Thesiss to Underlyings Schema
**Status**: 🚧 Planned
**PRD**: Section 3.2 (Asset Thesiss)
**Effort**: 1-2 days
**Priority**: Medium
**Details**:
- Asset Thesiss already have `underlying_id` FK to underlyings table ✅
- Ensure metadata sharing (ticker, conid, IV history)
- Display underlying metadata on Asset Thesis detail pages
**Big Picture Impact**: Proper data normalization, enables IV/spot price context for asset thesiss

#### #ENH-005: Rename Asset Thesis to Asset Thesis?
**Status**: 🚧 Under Consideration
**PRD**: Section 3 (Conceptual Model)
**Effort**: 1 day (if approved)
**Priority**: Medium
**Details**: Rename "Asset Thesis" to "Asset Thesis" for terminology consistency
**Open Questions**:
- Does this improve clarity or create confusion?
- PRD uses "Asset Thesiss" - would this deviate from PRD?
- Need user feedback before proceeding
**Decision Required**: Yes/No from user

#### #ENH-011: Convert Claim Button Creates New Thesis/View
**Status**: 🚧 Planned
**PRD**: Section 5.4 (Contextual Mapping)
**Effort**: 3-4 days
**Priority**: High
**Details**:
- Convert button creates NEW macro thesis or asset thesis (doesn't convert claim itself)
- Claim is promoted and linked to newly created thesis/view
- AI suggests field values (direction, sector, time horizon) based on claim context
- User reviews and approves suggestions
- Automatic provenance tracking (claim → thesis/view)
**Big Picture Impact**: Streamlines claim → hierarchy workflow, maintains claim as evidence source

#### #ENH-010: Define Sector/Topic Values for Macro Theses
**Status**: 🚧 Planned
**PRD**: Section 3.1 (Macro Theses)
**Effort**: 2-3 days
**Priority**: Medium
**Details**: Use Claude to define taxonomy of sector/topic values:
- Sectors: Technology, Financials, Transport, Energy, Healthcare, etc.
- Industries: AI, Semiconductors, Banking, Aviation, etc.
- Regions: US, Europe, Asia, Hong Kong, South America, etc.
- Asset Classes: Equities, Bonds, Crypto, Commodities, etc.
- Economic Factors: Inflation, Employment, Growth, Interest Rates, etc.
- Combinations: "US Inflation", "Chinese Tech Sector", "UK Govt Bond Yields"
**Big Picture Impact**: Structured thesis categorization, better filtering and search

#### #ENH-008: Clearer End-to-End Linking UX
**Status**: 🚧 Planned
**PRD**: Section 3 (Conceptual Model), Section 4 (Data Ingestion)
**Effort**: 1 week
**Priority**: High
**Details**: Improve UX for linking hierarchy objects:
- Every Position → Strategy (required)
- Every Strategy → Asset Thesis (required)
- Every Asset Thesis → Macro Thesis(es) (required, can be multiple)
- Asset Thesiss and Macro Theses → Main Claims (evidence linking)
**UX Improvements**:
- Clear visual indicators for missing links
- Inline linking workflows at obvious entry points
- Bulk linking tools
- Validation warnings for incomplete hierarchies
**Big Picture Impact**: Ensures complete hierarchy coverage, enables top-down analysis

---

### Deferred Work (Future Phases)

#### #ENH-003: Claims in Triage Page
**Status**: ⏳ Deferred
**PRD**: Section 6 (Workflow & Triage Engine)
**Architecture Phase**: Phase 4+ (Enhanced Workflows)
**Effort**: 1-2 weeks
**Reason for Deferral**: Requires Phase 4 trigger infrastructure (first-class trigger entities)
**Details**:
- Transcript processing generates triage trigger
- Claim promotion/archiving action resolves trigger
- Integrates research workflow into daily triage queue
**Big Picture Impact**: Unifies research and trading workflows in single attention management system

#### #ENH-012: Mandatory Link Triage Triggers
**Status**: ⏳ Deferred
**PRD**: Section 6 (Workflow & Triage Engine)
**Architecture Phase**: Phase 4+ (Enhanced Workflows)
**Effort**: 1 week
**Reason for Deferral**: Requires Phase 4 trigger infrastructure
**Details**: Generate triage records when mandatory links missing:
- Strategy without Asset Thesis
- Asset Thesis without Macro Thesis
- Position without Strategy
**Big Picture Impact**: Ensures hierarchy completeness through workflow enforcement

---

## Completed Work

### 2025-12-22 Batch: Phase 2.5 AI Research Enhancements
**PRD Alignment**: Section 5.7 (Role of AI)
**Architecture Phase**: Phase 2.5 (AI Research Enhancements)
**Status**: ✅ Complete
**Delivered**: 2025-12-22
**Source**: `docs/ai_research_enhancements_plan.md`

**Deliverables**:
- ✅ Phase 2.5.0: Prompt Management System
- ✅ Phase 2.5.1: Multi-Model AI Support (Claude, GPT, Gemini)
- ✅ Phase 2.5.2: Hierarchy Analysis & Recommendations
- ✅ Phase 2.5.3: Recommendation UI

**Big Picture Impact**:
- AI analyzes insights and proposes new theses/views
- User reviews and accepts/rejects AI recommendations
- Multi-model support for cost/quality optimization
- Editable prompts for continuous improvement

**Implementation**: See `implementation_progress.md` Phase 2.5

---

### 2025-12-22 Batch: Research Workflow Overhaul
**PRD Alignment**: Section 5 (Research, Knowledge & Intelligence Layer)
**Architecture Phase**: Phase 2 (Research Infrastructure)
**Status**: ✅ Complete
**Delivered**: 2025-12-22
**Source**: `docs/implementation_progress.md`

**Deliverables**:
- ✅ Phase 2.1: Database & Core Infrastructure
- ✅ Phase 2.2: Research Ingestion
- ✅ Phase 2.3: AI Integration
- ✅ Phase 2.4: Research Mapping UI

**Big Picture Impact**:
- Complete research workflow: ingestion → AI structuring → human review → evidence linking
- Local-first AI processing with Toulmin framework
- Research artifacts → insights → theses/views pipeline functional

**Implementation**: See `implementation_progress.md` Phase 2

---

### 2025-12-21 Batch: Phase 1 Beliefs & Decision Hierarchy
**PRD Alignment**: Section 3 (Conceptual Model)
**Architecture Phase**: Phase 1 (Foundation)
**Status**: ✅ Complete
**Delivered**: 2025-12-21

**Deliverables**:
- ✅ Phase 1.0: Core Implementation (macro_theses, asset_views tables)
- ✅ Phase 1.5: Hierarchy Linking UI

**Big Picture Impact**:
- Established decision hierarchy (Macro Theses → Asset Thesiss → Strategies → Positions)
- Linking workflow functional
- Foundation for research evidence linking

**Implementation**: See `implementation_progress.md` Phase 1

---

## Enhancement Registry

**Next Enhancement ID**: #ENH-013

**ID Format**: `#ENH-XXX` (zero-padded to 3 digits)

**Assignment Policy**: Assign ID when enhancement is first documented in this register

---

## Quick Reference: Document Map

- **PRD**: `docs/PRD_v1.1.md` - Product vision (locked)
- **Architecture**: `docs/system_architecture_transition_plan.md` - Implementation roadmap
- **Progress**: `docs/implementation_progress.md` - Phase completion tracking
- **Future Work**: `docs/FUTURE_ENHANCEMENTS.md` - General future enhancements
- **Gap Analysis**: `docs/future_enhancements_prd_gap_analysis.md` - PRD alignment check
- **This Document**: Central register linking daily work to strategic plan

---

## Workflow Summary

**When documenting new enhancements**:
1. Create dated batch file (e.g., `docs/20251228_enhancements.md`) for brainstorming
2. Register in this document within 24 hours
3. Assign enhancement IDs
4. Map to PRD sections and Architecture phases
5. Estimate effort and set priority

**When starting work**:
1. Update enhancement status to 🚧 In Progress
2. Reference enhancement ID in commits: `feat(research): add claims page (#ENH-002)`

**When completing work**:
1. Mark enhancement ✅ Complete with completion date
2. Move to "Completed Work" section (or keep in batch with ✅ status)
3. Update `implementation_progress.md` with deliverable status

**Weekly sync** (5-10 minutes):
1. Review Active Work section
2. Update statuses
3. Move completed work
4. Check alignment with PRD/Architecture
