# Future Enhancements

**Purpose**: Single source of truth for all enhancements (past, present, future) with clear traceability to PRD and original sources.

**Last Updated**: 2025-12-29

---

## Quick Navigation

- [Active/In Progress](#activein-progress-enhancements) - Current work
- [Planned Enhancements](#planned-enhancements-by-priority) - Prioritized backlog
- [Completed Enhancements](#completed-enhancements) - Historical record
- [Deferred Enhancements](#deferred-enhancements) - Future phases
- [Gap Analysis](#gap-analysis) - PRD alignment notes
- [Enhancement Registry](#enhancement-registry) - ID tracker

---

## Active/In Progress Enhancements

### Phase 2.6: Research UX Enhancements (Current Focus)
**Status**: 🚧 In Progress (Started 2025-12-28)
**PRD Alignment**: Section 5 (Research & Intelligence Layer), Section 3 (Conceptual Model)
**Source**: `docs/archive/20251228_enhancements.md`
**Effort**: 2-3 weeks total

#### #ENH-001: Sidebar Navigation Reordering ✅
**Status**: ✅ Complete (2025-12-28)
**Priority**: High
**Effort**: 10 minutes
**PRD**: Section 9 (Visualisation & Attention Management)
**Phase**: Phase 2.6.1
**Source**: docs/archive/20251228_enhancements.md (item 1)

**Description**: Reorder main sidebar section to: Triage > Blotter > Strategies > Asset Views > Macro Theses > Research > Portfolio

**Big Picture Impact**: Reflects workflow priority - action items first, strategic context second

---

#### #ENH-002: Claims Browser Page
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: 4 days (actual)
**PRD**: Section 5.4 (Contextual Mapping to Investment Hierarchy)
**Phase**: Phase 2.6.2
**Source**: docs/archive/20251228_enhancements.md (item 2)

**Description**: Unified page showing all main claims with auto-promotion architecture from research audits

**Implemented Features**:
- ✅ Filters: status (unconfirmed/confirmed/invalidated/merged), confidence, category
- ✅ Search across claim text, evidence, tickers, reasoning, backing
- ✅ Links to source research artifacts with external link icons
- ✅ Status badges showing claim lifecycle state
- ✅ Actions: Promote button (unconfirmed → confirmed), expandable full Toulmin framework
- ✅ Auto-promotion: Audit claims automatically synced to main_claims table
- ✅ Source tracking: Links back to originating research insight
- ✅ Statistics dashboard showing total claims, unconfirmed, confirmed, invalidated counts
- ✅ Database migration via psql (source_insight_id, source_claim_id columns)
- ✅ API route: /api/research/claims/promote
- ✅ CLI script: scripts/auto-promote-claims.ts
- ✅ Integrated into finalize-for-upload skill workflow

**Technical Implementation**:
- Schema: main_claims table extended with source tracking columns
- Queries: getAllMainClaimsWithSources(), autoPromoteAuditClaims(), promoteMainClaim()
- UI: UnifiedClaimsBrowser.tsx (463 lines) - tabular layout matching blotter
- Page: /research/claims/page.tsx with server-side data fetching
- Migration: add_main_claims_source_tracking.sql (executed via psql)

**Big Picture Impact**: Central hub for evaluating research claims before converting to theses/views. All audit claims now auto-promoted to first-class database records with full lifecycle management.

---

#### #ENH-006: Asset View Auto-Generated Titles ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: ~2 hours actual (2-3 days estimated)
**PRD**: Section 3 (Asset Views)
**Phase**: Phase 2.6.3
**Source**: docs/archive/20251228_enhancements.md (item 6)
**Dependencies**: Structured fields already existed in schema ✅

**Description**: Generate titles from required fields: `{Direction} {Underlying} {Time Horizon}`

**Example**: "Bullish TSLA Medium Term"

**Implemented**:
- ✅ Title generation utility functions (`src/lib/utils/title-generation.ts`)
- ✅ Updated API route (`/api/asset-views/create/route.ts`) to auto-generate titles
- ✅ Backfill script (`scripts/backfill-asset-view-titles.ts`) with dry-run mode
- ✅ Unit tests (7 tests for Asset Views, all passing)
- ✅ Title optional in API (allows manual override)

**Key Discovery**: Schema already had `direction`, `timeHorizon`, `underlyingId` fields - no migration needed!

**Big Picture Impact**: Consistent naming convention, easier scanning of asset views. Foundation for claim conversion workflow.

---

#### #ENH-009: Macro Thesis Auto-Generated Titles ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: ~2 hours actual (2-3 days estimated)
**PRD**: Section 3 (Macro Theses)
**Phase**: Phase 2.6.3
**Source**: docs/archive/20251228_enhancements.md (item 9)
**Dependencies**: Structured fields already existed in schema ✅

**Description**: Generate titles from required fields: `{Direction} {Sector/Topic} {Time Horizon}`

**Example**: "Bullish US Inflation Medium Term"

**Implemented**:
- ✅ Title generation utility functions (`src/lib/utils/title-generation.ts`)
- ✅ Updated API route (`/api/theses/create/route.ts`) to auto-generate titles
- ✅ Backfill script (`scripts/backfill-macro-thesis-titles.ts`) with dry-run mode
- ✅ Unit tests (10 tests for Macro Theses, all passing)
- ✅ Title optional in API (allows manual override)
- ✅ Uses first sector when multiple provided (for concise titles)

**Key Discovery**: Schema already had `direction`, `timeHorizon`, `sectors` fields - no migration needed!

**Big Picture Impact**: Consistent naming convention, clearer thesis hierarchy. Foundation for claim conversion workflow.

---

#### #ENH-004: Link Asset Views to Underlyings Schema ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: Medium
**Effort**: ~30 minutes actual (1-2 days estimated)
**PRD**: Section 3.2 (Asset Views)
**Phase**: Phase 2.6.4
**Source**: docs/archive/20251228_enhancements.md (item 4)

**Description**: Ensure proper linkage between Asset Views and Underlyings tables

**Implemented**:
- ✅ Verified `underlying_id` FK working correctly
- ✅ Added "Underlying Market Data" section to Asset View detail pages
- ✅ Display: Ticker, Name, Asset Class, Currency, Spot Price, IV30, ATR20, RV20
- ✅ Conditional display of Next Earnings Date and Next Ex-Div Date
- ✅ Enhanced Overview section with Direction badge and improved layout

**Big Picture Impact**: Full market context visible on Asset View pages. Enables data-driven decision making.

---

#### #ENH-010: Define Sector/Topic Taxonomy for Macro Theses ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: Medium
**Effort**: ~30 minutes actual (2-3 days estimated)
**PRD**: Section 3.1 (Macro Theses)
**Phase**: Phase 2.6.4
**Source**: docs/archive/20251228_enhancements.md (item 10)

**Description**: Comprehensive taxonomy of sector/topic values for macro theses

**Implemented Taxonomy** (115 total items across 6 categories):
- **Sectors** (12): Technology, Financials, Healthcare, Energy, Industrials, Consumer Discretionary, Consumer Staples, Materials, Real Estate, Utilities, Communication Services, Transport
- **Industries** (26): AI, Semiconductors, Software, Cloud Computing, Cybersecurity, Banking, Insurance, Oil & Gas, Renewables, Biotech, Pharmaceuticals, Aviation, Defense, Automotive, E-commerce, etc.
- **Regions** (25): Global, US, Canada, Mexico, Europe, UK, Germany, France, Italy, Spain, Asia, China, Hong Kong, Japan, India, South Korea, Singapore, South America, Brazil, Middle East, Africa, Australia
- **Asset Classes** (8): Equities, Bonds, Commodities, Currencies, Crypto, Real Estate, Options, Futures
- **Economic Factors** (29): Inflation, Interest Rates, Central Bank Policy, Fed Policy, ECB Policy, Yield Curve, Economic Growth, GDP, Employment, Wages, Consumer Spending, Business Investment, Market Structure, Liquidity, Volatility, Risk Appetite, Fiscal Policy, Government Spending, Regulation, Tax Policy, Trade, Globalization, Supply Chains, Geopolitics, Demographics, Technology Adoption, Climate Change, Energy Transition
- **Common Combinations** (15): US Inflation, European Inflation, Chinese Growth, US Employment, European Energy Crisis, Chinese Tech Sector, US Tech Sector, European Banks, Japanese Equities, Indian Tech, US Treasury Bonds, European Government Bonds, UK Gilts, Chinese Equities, AI Infrastructure Build-Out, Energy Transition, Deglobalization, Reshoring, Crypto Adoption

**Technical Implementation**:
- ✅ `src/lib/constants/sector-taxonomy.ts` - TypeScript constants (type-safe, version-controlled)
- ✅ `src/components/ui/SectorSelector.tsx` - Multi-select dropdown component with search and category filtering
- ✅ Utility functions: `getAllTaxonomyItems()`, `searchTaxonomy()`, `isValidTaxonomyValue()`, etc.
- ✅ Enhanced Macro Thesis detail page to display sectors as chips

**Big Picture Impact**: Structured thesis categorization with comprehensive 115-item taxonomy. Foundation for AI-powered sector suggestions in Phase 2.6.5.

---

#### #ENH-005: Rename Asset View to Asset Thesis?
**Status**: ⏳ Under Consideration
**Priority**: Medium
**Effort**: 1 day (if approved)
**PRD**: Section 3 (Conceptual Model)
**Phase**: Phase 2.6.7
**Source**: docs/archive/20251228_enhancements.md (item 5)

**Description**: Rename "Asset View" to "Asset Thesis" for terminology consistency

**Open Questions**:
- Does this improve clarity or create confusion?
- PRD uses "Asset Views" - would this deviate from PRD?
- Need user feedback before proceeding

**Decision Required**: ⏳ Awaiting user decision (Yes/No)

---

#### #ENH-011: Convert Claim Button Creates New Thesis/View ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: ~30 minutes actual (3-4 days estimated)
**PRD**: Section 5.4 (Contextual Mapping)
**Phase**: Phase 2.6.5
**Source**: docs/archive/20251228_enhancements.md (item 11)
**Dependencies**: #ENH-006 ✅, #ENH-009 ✅, #ENH-010 ✅

**Description**: Convert button creates NEW macro thesis or asset view (doesn't convert claim itself)

**Implemented Workflow**:
1. User clicks "Convert" button on claim in claims browser
2. Two-step dialog:
   - Step 1: Choose entity type (Macro Thesis or Asset View)
   - Step 2: Fill structured fields (direction, sector/ticker, time horizon)
3. Live title preview shows auto-generated title as user types
4. System creates new thesis/view via existing API routes
5. Claim automatically linked to new entity as evidence
6. Automatic provenance tracking in notes field

**Technical Implementation**:
- ✅ `ConvertClaimToEntityDialog` component (423 lines)
- ✅ "Convert" button in claims browser Actions column
- ✅ Uses SectorSelector for sector multi-select
- ✅ Uses title generation for live preview
- ✅ Reuses `/api/theses/create` and `/api/asset-views/create` routes
- ⏳ AI field suggestions deferred to future enhancement

**Big Picture Impact**: Completes research workflow loop. One-click conversion from claim to hierarchy entity with full provenance tracking.

---

#### #ENH-007: Auto-Generate Asset View Descriptions
**Status**: 🚧 Planned
**Priority**: Medium
**Effort**: 2-3 days
**PRD**: Section 3 (Asset Views), Section 5.7 (AI Role)
**Phase**: Phase 2.6.5
**Source**: docs/archive/20251228_enhancements.md (item 7)
**Dependencies**: #ENH-011 ✅ (requires claim linking)

**Description**: AI-generated descriptions for Asset Views based on linked Macro Theses and Main Claims

**Implementation**:
- When asset view created/updated, AI synthesizes description from:
  - Linked macro theses
  - Linked main claims (evidence)
  - Underlying context
- User can review and edit AI-generated description
- Description stored in asset_views.description field

**Big Picture Impact**: Auto-populated context, reduces manual documentation burden

---

#### #ENH-008: Enhanced Hierarchy Linking UX
**Status**: 🚧 Planned
**Priority**: High
**Effort**: 1 week
**PRD**: Section 3 (Conceptual Model), Section 4 (Data Ingestion)
**Phase**: Phase 2.6.6
**Source**: docs/archive/20251228_enhancements.md (item 8)
**Dependencies**: #ENH-011 ✅ (after conversion workflow)

**Description**: Clearer and more intuitive UX for end-to-end linking of hierarchy objects

**Required Links**:
- Every Position → Strategy (required)
- Every Strategy → Asset View (required)
- Every Asset View → Macro Thesis(es) (required, can be multiple)
- Asset Views and Macro Theses → Main Claims (evidence linking)

**UX Improvements**:
- Visual indicators for missing links
- Inline linking workflows at obvious entry points
- Bulk linking tools
- Validation warnings for incomplete hierarchies
- Guided workflow for new users

**Big Picture Impact**: Ensures complete hierarchy coverage, enables top-down analysis

---

## Planned Enhancements (by Priority)

### High Priority

#### #ENH-020: Automated Tests
**Status**: ⏳ Planned
**Priority**: High
**Effort**: 2-3 weeks (infrastructure + core tests)
**PRD**: N/A (Infrastructure)
**Phase**: Phase 5+
**Source**: docs/archive/plan.plan.md (line 53)

**Description**: Automated test coverage for reliability

**Scope**:
- Unit tests for service functions
- Integration tests for ingestion → recompute flows
- API endpoint tests
- UI component tests

**Big Picture Impact**: Prevents regressions, enables confident refactoring

---

#### #ENH-014: Complete Manual Linking UI
**Status**: ⏳ Planned (Quick Win)
**Priority**: High
**Effort**: 2-3 days
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 5+
**Source**: FUTURE_ENHANCEMENTS.md #14

**Current State**:
- ✅ API endpoints exist (`/api/strategies/link`)
- ✅ UI page exists (`/admin/strategies/[id]/link`)
- ⚠️ Missing: API endpoints to list unlinked positions/trades

**Enhancement**:
- Add endpoints: `GET /api/positions?unlinked=true&accountId=...`
- Add endpoints: `GET /api/trades?unlinked=true&accountId=...`
- Display unlinked items in table with bulk-select
- Filter by account, date range, symbol

**Big Picture Impact**: Better UX for managing unlinked positions/trades

---

### Medium Priority

#### #ENH-005-triage: Triage Rules Database Persistence
**Status**: ⏳ Planned
**Priority**: Medium
**Effort**: 3-4 days
**PRD**: Section 6 (Workflow & Triage Engine)
**Phase**: Phase 5+
**Source**: FUTURE_ENHANCEMENTS.md #5

**Current State**:
- Rules read from `TRIAGE_RULES_V1` constant in code
- ✅ Admin UI exists (`/admin/triage`)
- ✅ API endpoint exists but doesn't persist (`/api/admin/triage-rules`)
- ⚠️ Missing: Database table and persistence logic

**Enhancement**:
- Create `triage_rules` table
- Update API endpoint to save rules to database
- Update triage computation to load rules from database (with fallback)
- Support multiple rule sets
- Migration to seed initial rules

**Big Picture Impact**: Enables dynamic rule configuration without code changes

---

#### #ENH-001-roll: Roll Trade Auto-Detection
**Status**: ⏳ Planned
**Priority**: Medium
**Effort**: 1 week
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 5+
**Source**: FUTURE_ENHANCEMENTS.md #1

**Current State**: Roll trades detected as separate close/open events, user must manually set `tradeStage = 'roll'`

**Enhancement**: Pattern matching to auto-detect rolls by matching underlying + expiry/strike changes

**Big Picture Impact**: Reduces manual work, improves data quality

---

#### #ENH-013: Decision-Making Assistant (AI Integration)
**Status**: ⏳ Planned
**Priority**: Medium
**Effort**: 2-3 weeks
**PRD**: Section 7 (Decision Support & Analytics)
**Phase**: Phase 5+
**Source**: FUTURE_ENHANCEMENTS.md #13

**Description**: Connect decision-making process to ChatGPT at strategy-detail level

**Features**:
- Share decision context with AI
- AI recommendations on optimal action (trade) to manage risk and maximize EV
- Manual capture of options data (greeks, IV at relevant strikes and expiries)
- Integrate with existing triage/blotter workflow

**Big Picture Impact**: AI-assisted decision support for tactical trading decisions

---

#### #ENH-023: Underlyings Allocation Management & Triggers
**Status**: ⏳ Planned
**Priority**: Medium
**Effort**: 1-2 weeks
**PRD**: Section 3 (Conceptual Model) - Portfolio-level extension
**Phase**: Phase 5+
**Source**: FUTURE_ENHANCEMENTS.md #23

**Description**: Allocation planning page and target-based triggers

**Features**:
- UI to specify target percentage allocations for each underlying
- Account-level or cross-account allocation targets
- Current vs. target allocation display
- Triggers when allocation exceeds target (over-allocated)
- Triggers when approaching target (scaling in - 80%, 90% of target)

**Big Picture Impact**: Portfolio allocation planning, risk management, scaling guidance

---

#### #ENH-008-time: Time-Based Workflow & Memory System
**Status**: ⏳ Planned
**Priority**: Medium-High
**Effort**: Very High (multiple phases)
**PRD**: Section 8 (Logging, Journal & Institutional Memory)
**Phase**: Phase 6+ (break into smaller phases)
**Source**: FUTURE_ENHANCEMENTS.md #8

**Context**: Addresses fundamental workflow needs (memory, pattern recognition, reviews)

**Sub-Components** (implement in phases):
1. **Event Logging & Tracking** (#8a) - Market events, trade context, patterns
2. **Time-Based Review Workflows** (#8b) - Weekly/monthly reviews
3. **Pattern Recognition & Connection System** (#8c) - Historical comparisons
4. **Emotional State Tracking** (#8d) - Emotional context during trades
5. **Calendar-Based Triggers** (#8e) - Expiry/earnings reminders

**Big Picture Impact**: Transforms system from reactive to proactive, enables learning across time

---

### Low Priority

#### #ENH-002-timeout: Trade Decision Timeout/Resolution
**Status**: ⏳ Planned
**Priority**: Low
**Effort**: 1 week
**PRD**: Section 6 (Workflow & Triage Engine)
**Phase**: Phase 6+
**Source**: FUTURE_ENHANCEMENTS.md #2

**Current State**: TRADE actions that are never executed remain 'pending' indefinitely

**Enhancement**: Manual resolution or timeout mechanism for pending trades

---

#### #ENH-015: Merged/Archive View
**Status**: ⏳ Planned
**Priority**: Low
**Effort**: 3-4 days
**PRD**: N/A (UI enhancement)
**Phase**: Phase 6+
**Source**: FUTURE_ENHANCEMENTS.md #15

**Enhancement**: Expose `status='merged'` strategies + history, optional undo functionality

---

#### #ENH-011-exercises: Exercises/Assignments Ingestion
**Status**: ⏳ Planned
**Priority**: Low
**Effort**: 1 week
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 6+
**Source**: FUTURE_ENHANCEMENTS.md #11

**Description**: Flex `OPTT` row → `exercises`-related table

---

#### #ENH-012-cash: Cash Transactions Ingestion
**Status**: ⏳ Planned
**Priority**: Low
**Effort**: 1 week
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 6+
**Source**: FUTURE_ENHANCEMENTS.md #12

**Description**: Flex `CTRN` row → `cash_flows` table

---

#### #ENH-010a: IBKR API Integration for IV History & Spot Prices
**Status**: ⏳ Planned
**Priority**: Low
**Effort**: 1-2 weeks
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 6+
**Source**: FUTURE_ENHANCEMENTS.md #10a

**Context**: Upgrade from Option Strategist (weekly data) to IBKR API (daily data)

**Problem**:
- Option Strategist provides weekly data that doesn't align with daily position snapshots
- ITM calculations require underlying spot prices that match snapshot dates
- Current implementation uses `underlyings_iv_history.spot` for ITM calculations
- Weekly data means spot prices don't match daily snapshot dates

**Solution**:
- Connect to IBKR API gateway for **daily** IV and spot price data
- Query IV30 and spot price data on-demand or via scheduled job
- **Historical data capability** for backfilling past dates
- More accurate triage metrics (ITM flags, sigma calculations)

**Big Picture Impact**: More accurate triage metrics, enables historical backfilling

**Note**: Deprioritized from Critical to Low (2025-12-29) - current data sources sufficient for now

---

## Completed Enhancements

### Phase 2.5: AI Research Enhancements (2025-12-22)
**PRD**: Section 5.7 (Role of AI)

- ✅ **Phase 2.5.0**: Prompt Management System (editable prompts)
- ✅ **Phase 2.5.1**: Multi-Model AI Support (Claude, GPT, Gemini)
- ✅ **Phase 2.5.2**: Hierarchy Analysis & Recommendations
- ✅ **Phase 2.5.3**: Recommendation UI (accept/reject AI recommendations)

**Source**: docs/ai_research_enhancements_plan.md

---

### Phase 2: Research & Intelligence Layer (2025-12-22)
**PRD**: Section 5 (Research, Knowledge & Intelligence Layer)

- ✅ **Phase 2.1**: Database & Core Infrastructure
- ✅ **Phase 2.2**: Research Ingestion
- ✅ **Phase 2.3**: AI Integration
- ✅ **Phase 2.4**: Research Mapping UI

**Source**: docs/implementation_progress.md

---

### Phase 1: Beliefs & Decision Hierarchy (2025-12-21)
**PRD**: Section 3 (Conceptual Model)

- ✅ **Phase 1.0**: Core Implementation (macro_theses, asset_views tables)
- ✅ **Phase 1.5**: Hierarchy Linking UI

**Source**: docs/implementation_progress.md

---

### Recent Completions (2025-12-22)

- ✅ **#9**: Automated Flex Ingestion (GitHub Actions, Vercel cron)
- ✅ **#10**: Underlyings IV History Ingestion (manual via Option Strategist)
- ✅ **#4**: State Code Change Performance Optimization
- ✅ **#21**: Auto-Trigger Recompute After Data Changes
- ✅ **#24**: Account Management UI (edit/delete accounts)
- ✅ **#25**: Multi-Account Support in UI (account selector)

**Source**: FUTURE_ENHANCEMENTS.md

---

## Deferred Enhancements

### Deferred to Phase 4+ (Requires Trigger Infrastructure)

#### #ENH-003: Claims in Triage Page
**Status**: ⏳ Deferred
**Priority**: Medium (after Phase 4)
**Effort**: 1-2 weeks
**PRD**: Section 6 (Workflow & Triage Engine)
**Phase**: Phase 4+ (Enhanced Workflows)
**Source**: docs/archive/20251228_enhancements.md (item 3)
**Reason for Deferral**: Requires Phase 4 trigger infrastructure (first-class trigger entities)

**Description**: Transcript processing generates triage trigger, claim promotion/archiving resolves trigger

**Big Picture Impact**: Unifies research and trading workflows in single attention management system

---

#### #ENH-012: Mandatory Link Triage Triggers
**Status**: ⏳ Deferred
**Priority**: Medium (after Phase 4)
**Effort**: 1 week
**PRD**: Section 6 (Workflow & Triage Engine)
**Phase**: Phase 4+ (Enhanced Workflows)
**Source**: docs/archive/20251228_enhancements.md (item 12)
**Reason for Deferral**: Requires Phase 4 trigger infrastructure

**Description**: Generate triage records when mandatory links missing (Strategy without Asset View, etc.)

**Big Picture Impact**: Ensures hierarchy completeness through workflow enforcement

---

## Gap Analysis

**Source**: Merged from docs/future_enhancements_prd_gap_analysis.md (2025-12-20)

### Items NOT Explicitly in PRD v1.1

Most enhancements fall into three categories:

#### 1. Implementation/Technical Details (Expected - Not in PRD)
These are tactical implementation details that wouldn't appear in a strategic PRD:
- Roll Trade Auto-Detection (#ENH-001-roll)
- Trade Decision Timeout (#ENH-002-timeout)
- State Code Computation (#4 - completed)
- Triage Rules Database Persistence (#ENH-005-triage)
- IBKR API Integration (#ENH-010a)
- Manual Linking UI (#ENH-014)
- Position Lifecycle Modeling
- Automated Tests (#ENH-020)

**Assessment**: ✅ Expected - These are implementation details, not PRD requirements

#### 2. Specific Tactical Features (Partially Covered in PRD)
These align with PRD concepts but are more specific/granular:
- **Underlying-Level Triggers** - PRD mentions "triggers at all levels" but doesn't specify IV spike, concentration risk
- **Account-Level Triggers** - PRD mentions triggers but doesn't specify leverage/cash/margin warnings
- **Allocation Management** (#ENH-023) - Portfolio-level tool, not explicitly in PRD

**Assessment**: ⚠️ Partially covered - PRD establishes concept, enhancements provide specifics

#### 3. Deep Implementation of PRD Concepts
**Time-Based Workflow & Memory System** (#ENH-008-time):
- PRD mentions retrospective analysis, pattern detection, continuous improvement ✅
- But doesn't specify: emotional state tracking, calendar-based triggers, event logging, review workflows
- **Assessment**: ⚠️ Partially covered - PRD establishes vision, enhancement provides detailed spec

**Decision-Making Assistant** (#ENH-013):
- PRD mentions decision support and synthesis ✅
- But doesn't specify: ChatGPT integration, options data capture, specific AI assistant interface
- **Assessment**: ⚠️ Partially covered - PRD establishes concept, enhancement specifies implementation

### Recommendations for PRD Evolution

Consider adding to PRD:
1. **Emotional State Tracking** (#ENH-008-time, #8d) - Captures decision context at time of decision
2. **Calendar-Based Triggers** (#ENH-008-time, #8e) - Specific examples of time-based triggers
3. **Allocation Management** (#ENH-023) - Portfolio-level risk management

**Conclusion**: Most enhancements are correctly implementation details. Gap analysis shows appropriate separation between strategic vision (PRD) and tactical implementation (enhancements).

---

## Enhancement Registry

**Next Enhancement ID**: #ENH-024

**ID Format**: `#ENH-XXX` (zero-padded to 3 digits) or `#ENH-XXX-name` (for descriptive variants)

**Assignment Policy**: Assign ID when enhancement is first documented in this register

**Legacy IDs**: Some enhancements use original numbering from old FUTURE_ENHANCEMENTS.md (e.g., #1, #4, #9) - these are preserved for historical continuity

---

## Quick Reference: Priority Guidelines

**High Priority** - Critical for core functionality or user experience:
- Phase 2.6 enhancements (research UX)
- IBKR API integration (#ENH-010a) - fixes critical triage accuracy issue
- Automated tests (#ENH-020) - prevents regressions
- Manual linking UI completion (#ENH-014) - quick win

**Medium Priority** - Important for workflow improvements:
- Triage rules persistence (#ENH-005-triage)
- Roll trade auto-detection (#ENH-001-roll)
- Decision-making assistant (#ENH-013)
- Allocation management (#ENH-023)
- Time-based workflow (#ENH-008-time) - high impact but large scope

**Low Priority** - Nice-to-have enhancements:
- Trade timeout resolution (#ENH-002-timeout)
- Merged/archive view (#ENH-015)
- Exercises ingestion (#ENH-011-exercises)
- Cash transactions ingestion (#ENH-012-cash)

---

## Document Status

**Living Document** - Update as enhancements are added, completed, or reprioritized

**Related Documents**:
- **PRD v1.1**: `docs/PRD_v1.1.md` - Product vision (locked)
- **Architecture**: `docs/system_architecture_transition_plan.md` - Implementation roadmap
- **Progress**: `docs/implementation_progress.md` - Phase completion tracking
- **Archived Sources**: `docs/archive/` - Original enhancement brainstorming docs
