# Future Enhancements

**Purpose**: Single source of truth for all enhancements (past, present, future) with clear traceability to PRD and original sources.

**Last Updated**: 2026-01-05 (Phase 3.2A Complete: Validation Assessment Workflow | #ENH-042)

---

## Quick Navigation

- [Active/In Progress](#activein-progress-enhancements) - Current work
- [Planned Enhancements](#planned-enhancements-by-priority) - Prioritized backlog
- [Completed Enhancements](#completed-enhancements) - Historical record
- [Abandoned Enhancements](#abandoned-enhancements) - Cancelled features
- [Deferred Enhancements](#deferred-enhancements) - Future phases
- [Gap Analysis](#gap-analysis) - PRD alignment notes
- [Enhancement Registry](#enhancement-registry) - ID tracker

---

## Active/In Progress Enhancements

**Status**: ✅ All active work complete! Phase 3.2A finished (2026-01-05)

See [Completed Enhancements](#completed-enhancements) for Phase 3.2A details.

---

### Phase 2.7: Unified Browser Pattern & Hierarchy UX ✅
**Status**: ✅ Complete (2025-12-31)
**PRD Alignment**: Section 3 (Conceptual Model), Section 9 (Visualisation & Attention Management)
**Source**: `docs/20251230-enhancements.md`
**Actual Effort**: 2 days (9 of 11 enhancements complete, 2 deferred)
**Master Plan**: `docs/20251230-implementation-plan.md`

**Overview**: Extended the UnifiedClaimsBrowser.tsx pattern to all hierarchy entities. Includes advanced filtering, inline linking workflows, expandable rows, and detail page enhancements.

**Enhancement IDs**: #ENH-013 through #ENH-023

**Completed Enhancements**:
- ✅ #ENH-013: Unified Macro Thesis Browser
- ✅ #ENH-014: Unified Asset Thesis Browser
- ✅ #ENH-015: Unified Strategies Browser
- ✅ #ENH-016: Research Detail Page UX
- ✅ #ENH-017: Claims 'Linked To' Filter
- ✅ #ENH-021: Rename /theses → /macro-theses
- ✅ #ENH-023: Fix ClientHierarchyBreadcrumb Bugs
- ✅ #ENH-018: Macro Thesis Detail Page Enhancements
- ✅ #ENH-019: Asset Thesis Detail Page Enhancements

**Deferred Enhancements**:
- ⏳ #ENH-020-playbook: Strategy Playbook Tab (to Phase 3+)
- ⏳ #ENH-022: AI-Assisted Summary Generation (to Phase 3+)

**Big Picture Impact**: Consistent, high-quality browsing experience across all hierarchy levels. ~40% reduction in vertical space on detail pages. Powerful filtering and search on all entity types. Progressive disclosure without page navigation. Foundation for future visualization features.

#### #ENH-013: Unified Macro Thesis Browser ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: High
**Effort**: 4 hours
**PRD**: Section 3 (Macro Theses), Section 9 (Visualisation)
**Phase**: Phase 2.7.1 (Sprint 1)
**Source**: docs/20251230-enhancements.md

**Description**: Standardize macro thesis browsing with UnifiedClaimsBrowser pattern

**Implemented Features**:
- ✅ 5 filters: Type, Time Horizon, Confidence, Status, Direction
- ✅ Search across title, description, sectors, notes
- ✅ Sort by: Created, Updated, Title, Status, Type
- ✅ Expandable rows showing full description, notes, outcomes
- ✅ Keyboard shortcuts: ↑↓ navigation, Enter to expand, Esc to close
- ✅ Shows linked counts: Asset Theses, Strategies

**Technical Implementation**:
- Component: `src/components/theses/UnifiedMacroThesisBrowser.tsx` (631 lines)
- Query: Extended `MacroThesisListItem` interface in `src/db/queries/macroTheses.ts`
- Added fields: description, sectors, direction, positionStartDate, positionEndDate, outcome, outcomeNotes, actualOutcomeDate, notes
- New query: `getClaimsWithSourcesForThesis()` for UnifiedClaimsBrowser integration
- Page: Updated `src/app/macro-theses/page.tsx`

**Big Picture Impact**: Powerful filtering and search on macro theses. Consistent UX with claims browser. Progressive disclosure via expandable rows.

---

#### #ENH-014: Unified Asset Thesis Browser ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: High
**Effort**: 4 hours
**PRD**: Section 3 (Asset Theses), Section 9 (Visualisation)
**Phase**: Phase 2.7.1 (Sprint 1)
**Source**: docs/20251230-enhancements.md

**Description**: Standardize asset thesis browsing with UnifiedClaimsBrowser pattern

**Implemented Features**:
- ✅ 5 filters: Ticker, Macro Thesis, Time Horizon, Confidence, Status
- ✅ Search across title, description, narrative, ticker, notes
- ✅ Sort by: Created, Updated, Title, Status, Ticker
- ✅ Expandable rows showing narrative, contexts (fundamental, positioning, regime), targets
- ✅ Keyboard shortcuts: ↑↓ navigation, Enter to expand, Esc to close
- ✅ Shows linked counts: Strategies

**Technical Implementation**:
- Component: `src/components/asset-theses/UnifiedAssetThesisBrowser.tsx` (660 lines)
- Query: Extended `AssetThesisListItem` interface in `src/db/queries/assetTheses.ts`
- Added fields: description, narrative, fundamentalContext, positioningContext, regimeContext, direction, positionStartDate, positionEndDate, targetPrice, entryReferencePrice, outcome, outcomeNotes, actualOutcomeDate, actualPrice, notes
- New query: `getMainClaimsWithSourcesForAssetThesis()` for UnifiedClaimsBrowser integration
- Page: Updated `src/app/asset-theses/page.tsx`

**Big Picture Impact**: Powerful filtering and search on asset theses. Consistent UX with claims browser. Progressive disclosure via expandable rows.

---

#### #ENH-015: Unified Strategies Browser ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: High
**Effort**: 5 hours
**PRD**: Section 3 (Strategies), Section 9 (Visualisation)
**Phase**: Phase 2.7.1 (Sprint 1)
**Source**: docs/20251230-enhancements.md

**Description**: Standardize strategy browsing with UnifiedClaimsBrowser pattern

**Implemented Features**:
- ✅ 5 filters: Status (all/open/closed/draft/planned), Account, Asset Thesis, Macro Thesis, State Code
- ✅ Search across label, description, rationale, notes
- ✅ Sort by: Opened, Closed, Label, Status, Notional
- ✅ Expandable rows showing rationale, exit strategy, risk management, trade management
- ✅ Keyboard shortcuts: ↑↓ navigation, Enter to expand, Esc to close
- ✅ Shows financial metrics: Abs Notional, Unrealized PnL, % NAV
- ✅ Displays both open and closed strategies

**Technical Implementation**:
- Component: `src/components/strategies/UnifiedStrategiesBrowser.tsx` (700+ lines)
- Query: Extended `StrategyListItem` interface in `src/db/queries/strategies.ts`
- Added fields: description, rationale, exitStrategy, riskManagement, tradeManagement, capitalAllocation, expectedReturn, maxDrawdown, timeHorizon, closedAt, notes
- Modified `getStrategiesForList()` to accept status filter
- Removed hardcoded `.filter((s) => s.status === "open")`
- Page: Updated `src/app/strategies/page.tsx`

**Big Picture Impact**: Powerful filtering and search on strategies. Can now view closed strategies. Consistent UX with claims browser. Progressive disclosure via expandable rows.

---

#### #ENH-016: Research Detail Page UX ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: Medium
**Effort**: 1 hour
**PRD**: Section 5 (Research), Section 9 (Visualisation)
**Phase**: Phase 2.7.2 (Sprint 2)
**Source**: docs/20251230-enhancements.md

**Description**: Make research detail page more compact with side-by-side layout

**Implemented Features**:
- ✅ Metadata and Workflow Status sections now side-by-side (grid-cols-2)
- ✅ More compact layout (p-6 → p-4)
- ✅ Text updated: "X claims converted to hierarchy" → "X claims linked to theses"

**Technical Implementation**:
- Files: `src/app/research/[id]/page.tsx`, `src/components/research/WorkflowStatusCard.tsx`

**Big Picture Impact**: Better use of horizontal space. More information visible above the fold.

---

#### #ENH-017: Claims 'Linked To' Filter ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: High
**Effort**: 2 hours
**PRD**: Section 5.4 (Contextual Mapping)
**Phase**: Phase 2.7.2 (Sprint 2)
**Source**: docs/20251230-enhancements.md

**Description**: Add filter to show claims linked to specific theses or unlinked

**Implemented Features**:
- ✅ New filter dropdown: "Linked To"
- ✅ Options: All, Unlinked, [Macro Theses list], [Asset Theses list]
- ✅ Filters claims by their linkedTheses and linkedViews arrays
- ✅ Grouped optgroups for clear hierarchy

**Technical Implementation**:
- File: `src/components/research/UnifiedClaimsBrowser.tsx`
- State: `linkedToFilter` (all/unlinked/thesis.id)
- Logic: Filter by linkedTheses and linkedViews arrays

**Big Picture Impact**: Easy discovery of unlinked claims that need thesis assignment. Quick filtering to specific thesis context.

---

#### #ENH-021: Rename /theses → /macro-theses ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: Medium
**Effort**: 1 hour
**PRD**: Section 3 (Macro Theses)
**Phase**: Phase 2.7.2 (Sprint 2)
**Source**: docs/20251230-enhancements.md

**Description**: Rename route for clarity and consistency with "Asset Theses"

**Implemented Features**:
- ✅ Renamed `src/app/theses/` → `src/app/macro-theses/`
- ✅ Updated sidebar navigation link
- ✅ Updated NavKey type in DashboardShell
- ✅ Updated HierarchyBreadcrumb paths
- ✅ Updated all internal links
- ✅ Kept old routes for backwards compatibility

**Technical Implementation**:
- Files: `src/app/macro-theses/page.tsx`, `src/app/macro-theses/[id]/page.tsx`, `src/components/layout/AppSidebar.tsx`, `src/components/layout/DashboardShell.tsx`, `src/components/ui/HierarchyBreadcrumb.tsx`, `src/app/asset-theses/[id]/page.tsx`

**Big Picture Impact**: Clearer terminology. Consistent naming across hierarchy levels.

---

#### #ENH-023: Fix ClientHierarchyBreadcrumb Bugs ✅
**Status**: ✅ Complete (2025-12-30)
**Priority**: Critical
**Effort**: 3 hours
**PRD**: Section 3 (Hierarchy Navigation)
**Phase**: Phase 2.7.2 (Sprint 2)
**Source**: User bug report + docs/20251230-enhancements.md

**Description**: Fix hierarchy linking not persisting due to field name mismatch

**Bug Fixed**: Field name mismatch causing silent update failures
- **Root Cause**: Client sending `macro_thesis_id` and `asset_thesis_id` (snake_case) but Drizzle schema expects `macroThesisId` and `assetThesisId` (camelCase)
- **Impact**: API returned 200 but database updates were silently ignored
- **Solution**: Changed `JSON.stringify` payloads to use camelCase field names
- Also fixed API response structure expectations (data vs data.theses/data.views)

**Technical Implementation**:
- Files: `src/components/asset-theses/LinkToThesisDialog.tsx`, `src/components/strategies/LinkToViewDialog.tsx`
- Changed: `macro_thesis_id` → `macroThesisId`, `asset_thesis_id` → `assetThesisId`

**Big Picture Impact**: Hierarchy linking now works correctly. Critical bug fix for core workflow.

---

#### #ENH-018: Macro Thesis Detail Page Enhancements ✅
**Status**: ✅ Complete (2025-12-31)
**Priority**: High
**Effort**: 4 hours
**PRD**: Section 3 (Macro Theses), Section 9 (Visualisation)
**Phase**: Phase 2.7.3 (Sprint 3)
**Source**: docs/20251230-enhancements.md

**Description**: Refactor macro thesis detail page with unified browsers and compact layout

**Implemented Features**:
- ✅ Compact Overview: p-6 → p-4, text-lg → text-base, grid gap-4 → gap-x-4 gap-y-2
- ✅ Section Reordering: Overview → Summary (was Description) → Main Claims → Linked Asset Theses → Linked Strategies → Notes
- ✅ Main Claims: Now uses `UnifiedClaimsBrowser` filtered for this thesis
- ✅ Linked Asset Theses: Now uses `UnifiedAssetThesisBrowser` filtered for this thesis
- ✅ Linked Strategies: Now uses `UnifiedStrategiesBrowser` filtered for this thesis
- ✅ Delete Functionality: Added to EditMacroThesisDialog with confirmation modal
- ✅ All section headings: text-lg → text-base for consistency

**Technical Implementation**:
- Files: `src/app/macro-theses/[id]/page.tsx` (complete rewrite), `src/components/theses/EditMacroThesisDialog.tsx` (added delete)

**Big Picture Impact**: ~40% less vertical space. Powerful filtering on all linked entities. Progressive disclosure without page navigation. Consistent UX across detail pages.

---

#### #ENH-019: Asset Thesis Detail Page Enhancements ✅
**Status**: ✅ Complete (2025-12-31)
**Priority**: High
**Effort**: 4 hours
**PRD**: Section 3 (Asset Theses), Section 9 (Visualisation)
**Phase**: Phase 2.7.3 (Sprint 3)
**Source**: docs/20251230-enhancements.md

**Description**: Refactor asset thesis detail page with unified browsers and compact layout

**Implemented Features**:
- ✅ Compact Overview: p-6 → p-4, text-lg → text-base, grid gap-4 → gap-x-4 gap-y-2
- ✅ Section Reordering: Overview → Summary (was Description) → Underlying Market Data → Main Claims → Linked Macro Theses → Linked Strategies → Notes
- ✅ Main Claims: Now uses `UnifiedClaimsBrowser` filtered for this thesis
- ✅ Linked Macro Theses: New dedicated section with `UnifiedMacroThesisBrowser`
- ✅ Linked Strategies: Now uses `UnifiedStrategiesBrowser` filtered for this thesis
- ✅ Underlying Market Data: Fixed display (was empty before)
- ✅ All section headings: text-lg → text-base for consistency

**Technical Implementation**:
- Files: `src/app/asset-theses/[id]/page.tsx` (complete rewrite)
- New query: `getMainClaimsWithSourcesForAssetThesis()` in `src/db/queries/assetTheses.ts`

**Big Picture Impact**: ~40% less vertical space. Powerful filtering on all linked entities. Dedicated Macro Thesis section provides better hierarchy visibility. Underlying Market Data now functional.

---

#### #ENH-020-playbook: Strategy Playbook Tab ⏳
**Status**: ⏳ Deferred to Phase 3+
**Priority**: Medium
**Effort**: 8-10 hours estimated
**PRD**: Section 3 (Strategies), Section 6 (Decision Capture)
**Phase**: Phase 2.7.4 (Sprint 4) → Deferred
**Source**: docs/20251230-enhancements.md

**Description**: Add playbook tab to strategy detail pages

**Proposed Features**:
- Entry/exit rules documentation
- Position sizing guidelines
- Risk management checklist
- Trade journal integration

**Reason for Deferral**: Core unified browser pattern complete. Playbook is valuable but not critical for current workflow. Can be implemented in future phase when strategy management features are prioritized.

---

#### #ENH-022: AI-Assisted Summary Generation ⏳
**Status**: ⏳ Deferred to Phase 3+
**Priority**: Medium
**Effort**: 12-15 hours estimated
**PRD**: Section 5 (Research), Section 3 (Theses)
**Phase**: Phase 2.7.4 (Sprint 4) → Deferred
**Source**: docs/20251230-enhancements.md
**Dependencies**: Requires AI API integration (OpenAI/Anthropic)

**Description**: Auto-generate summaries for theses from linked claims evidence

**Proposed Features**:
- Generate summaries from linked claims evidence
- Incorporate position outcomes
- Include notes and context
- One-click regeneration

**Reason for Deferral**: Requires AI infrastructure setup (API keys, rate limiting, cost management). Manual summaries sufficient for now. Can be implemented when AI features are prioritized.

---

### Phase 2.6: Research UX Enhancements ✅
**Status**: ✅ Complete (2025-12-29)
**PRD Alignment**: Section 5 (Research & Intelligence Layer), Section 3 (Conceptual Model)
**Source**: `docs/archive/20251228_enhancements.md`
**Actual Effort**: 2 days (8 of 9 enhancements complete, 1 deferred)

#### #ENH-001: Sidebar Navigation Reordering ✅
**Status**: ✅ Complete (2025-12-28)
**Priority**: High
**Effort**: 10 minutes
**PRD**: Section 9 (Visualisation & Attention Management)
**Phase**: Phase 2.6.1
**Source**: docs/archive/20251228_enhancements.md (item 1)

**Description**: Reorder main sidebar section to: Triage > Blotter > Strategies > Asset Thesiss > Macro Theses > Research > Portfolio

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

#### #ENH-006: Asset Thesis Auto-Generated Titles ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: ~2 hours actual (2-3 days estimated)
**PRD**: Section 3 (Asset Thesiss)
**Phase**: Phase 2.6.3
**Source**: docs/archive/20251228_enhancements.md (item 6)
**Dependencies**: Structured fields already existed in schema ✅

**Description**: Generate titles from required fields: `{Direction} {Underlying} {Time Horizon}`

**Example**: "Bullish TSLA Medium Term"

**Implemented**:
- ✅ Title generation utility functions (`src/lib/utils/title-generation.ts`)
- ✅ Updated API route (`/api/asset-theses/create/route.ts`) to auto-generate titles
- ✅ Backfill script (`scripts/backfill-asset-view-titles.ts`) with dry-run mode
- ✅ Unit tests (7 tests for Asset Thesiss, all passing)
- ✅ Title optional in API (allows manual override)

**Key Discovery**: Schema already had `direction`, `timeHorizon`, `underlyingId` fields - no migration needed!

**Big Picture Impact**: Consistent naming convention, easier scanning of asset thesiss. Foundation for claim conversion workflow.

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

#### #ENH-004: Link Asset Thesiss to Underlyings Schema ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: Medium
**Effort**: ~30 minutes actual (1-2 days estimated)
**PRD**: Section 3.2 (Asset Thesiss)
**Phase**: Phase 2.6.4
**Source**: docs/archive/20251228_enhancements.md (item 4)

**Description**: Ensure proper linkage between Asset Thesiss and Underlyings tables

**Implemented**:
- ✅ Verified `underlying_id` FK working correctly
- ✅ Added "Underlying Market Data" section to Asset Thesis detail pages
- ✅ Display: Ticker, Name, Asset Class, Currency, Spot Price, IV30, ATR20, RV20
- ✅ Conditional display of Next Earnings Date and Next Ex-Div Date
- ✅ Enhanced Overview section with Direction badge and improved layout

**Big Picture Impact**: Full market context visible on Asset Thesis pages. Enables data-driven decision making.

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

#### #ENH-005: Rename Asset View to Asset Thesis ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: Medium
**Effort**: 1 day (actual)
**PRD**: Section 3 (Conceptual Model)
**Phase**: Phase 2.6.7
**Source**: docs/archive/20251228_enhancements.md (item 5)

**Description**: Comprehensive rename from "Asset View" to "Asset Thesis" for terminology consistency

**Completed**:
- ✅ Database migration: 102 files changed, 451+ occurrences
- ✅ Table renamed: asset_views → asset_theses
- ✅ All schema, types, components, pages updated
- ✅ Documentation updated across all files
- ✅ Migration executed via psql and verified

**Big Picture Impact**: Eliminates terminology confusion - "Macro Thesis" and "Asset Thesis" are now consistently named throughout the application

---

#### #ENH-011: Unified Claim Confirmation with Linking Workflow ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: 1.5 days actual (3-4 days estimated)
**PRD**: Section 5.4 (Contextual Mapping)
**Phase**: Phase 2.6.5
**Source**: docs/archive/20251228_enhancements.md (item 11)
**Dependencies**: #ENH-006 ✅, #ENH-009 ✅, #ENH-010 ✅

**Description**: Unified workflow for confirming claims by either creating new theses/views OR linking to existing ones

**Evolution**: Originally implemented as "Convert" button creating new entities, later enhanced to support linking to existing entities and integrated with claim status confirmation.

**Implemented Workflow**:
1. User selects 'confirmed' status on unlinked claim
2. Dialog opens with mode selection:
   - **Link to Existing**: Multi-select scrollable lists of available theses/views
   - **Create New**: Fill structured fields to create new thesis/view
3. **Link Mode Features**:
   - Search/filter available theses by title, sector, type, status
   - Search/filter available views by title, ticker, status
   - Multi-select checkboxes with selection count display
   - Visual badges (purple for thesis types, blue for view tickers)
   - Button shows count: "Link & Confirm (3)"
4. **Create Mode Features**:
   - Choose entity type (Macro Thesis or Asset Thesis)
   - Fill structured fields (direction, sector/ticker, time horizon)
   - Live title preview shows auto-generated title
5. Claim automatically linked to selected/created entities as evidence
6. Status set to 'confirmed' after linking
7. Automatic provenance tracking in notes field

**Technical Implementation**:
- ✅ Complete rewrite of `ConvertClaimToEntityDialog` component (282 lines)
- ✅ Removed separate "Convert" button - integrated with status confirmation
- ✅ Enhanced `UnifiedClaimsBrowser` - status change triggers dialog
- ✅ New API endpoints:
  - `/api/research/claims/available-entities` - Fetch available theses/views
  - `/api/research/claims/link-to-entities` - Link claim to existing entities
- ✅ Updated thesis/view creation APIs to auto-confirm linked claims
- ✅ Uses SectorSelector for sector multi-select
- ✅ Uses title generation for live preview
- ✅ Added 'rejected' status for claims that shouldn't be converted
- ⏳ AI field suggestions deferred to future enhancement

**Data Quality Improvements**:
- ✅ Fixed claim title generation to use `auditClaim.title` instead of truncated text
- ✅ Retrospective script: `reset-orphaned-confirmed-claims.ts` (reset 5 orphaned claims)
- ✅ Retrospective script: `regenerate-claim-titles.ts` (updated 30 claim titles)
- ✅ Fixed duplicate "Energy Transition" in sector taxonomy

**Big Picture Impact**: Complete research workflow with flexible confirmation - link to existing entities (reduce duplication) or create new ones (capture novel insights). Ensures data consistency with automatic status management and provenance tracking.

---

#### #ENH-007: Auto-Generate Asset Thesis Descriptions
**Status**: ⏸️ Deferred
**Priority**: Medium
**Effort**: 2-3 days
**PRD**: Section 3 (Asset Theses), Section 5.7 (AI Role)
**Phase**: Deferred from Phase 2.6
**Source**: docs/archive/20251228_enhancements.md (item 7)
**Dependencies**: #ENH-011 ✅ (claim linking complete)

**Description**: AI-generated descriptions for Asset Theses based on linked Macro Theses and Main Claims

**Implementation**:
- When asset thesis created/updated, AI synthesizes description from:
  - Linked macro theses
  - Linked main claims (evidence)
  - Underlying context
- User can review and edit AI-generated description
- Description stored in asset_theses.description field

**Deferral Reason**: Medium priority feature - Phase 2.6 substantially complete (8/9 enhancements) without this. Can be implemented when AI synthesis capabilities are prioritized.

**Big Picture Impact**: Auto-populated context, reduces manual documentation burden

---

#### #ENH-008: Enhanced Hierarchy Linking UX ✅
**Status**: ✅ Complete (2025-12-29)
**Priority**: High
**Effort**: 1 day (actual)
**PRD**: Section 3 (Conceptual Model), Section 4 (Data Ingestion)
**Phase**: Phase 2.6.6
**Source**: docs/archive/20251228_enhancements.md (item 8)
**Dependencies**: #ENH-011 ✅

**Description**: Clearer and more intuitive UX for end-to-end linking of hierarchy objects

**Implemented**:
- ✅ Visual hierarchy breadcrumb component with color-coded status indicators
- ✅ Inline linking dialogs for macro theses and asset theses
- ✅ Search/filter capabilities in linking workflows
- ✅ Cascade linking (strategy→view also links parent thesis)
- ✅ Immediate feedback with router.refresh()
- ✅ Integration across all strategy and asset thesis pages

**Big Picture Impact**: Complete hierarchy linking without page navigation. Visual warnings for missing required relationships. Foundation for Phase 1.7 interactive hierarchy tree.

---

## Planned Enhancements (by Priority)

### High Priority

#### #ENH-020-playbook: Strategy Playbook Tab
**Status**: ⏳ Deferred from Phase 2.7
**Priority**: Medium
**Effort**: 8-10 hours estimated
**PRD**: Section 3 (Strategies), Section 6 (Decision Capture)
**Phase**: Phase 3+ (complementary to Phase 3.1)
**Source**: docs/20251230-enhancements.md
**Related**: #ENH-036 (Validation Points) - playbooks should define reaction functions

**Description**: Add playbook tab to strategy detail pages

**Proposed Features**:
- Entry/exit rules documentation
- Position sizing guidelines
- Risk management checklist
- Trade journal integration
- **Reaction functions**: Per-strategy responses to thesis validation point changes (integrates with #ENH-036)

**Relationship to Phase 3**: Strategy playbooks should define **reaction functions** that reference thesis-level validation points. When a validation point triggers, each linked strategy evaluates its reaction function to determine response.

**Big Picture Impact**: Codifies trading rules and risk management at strategy level. Improves consistency and discipline. Connects tactical execution to fundamental monitoring.

---

#### #ENH-022: AI-Assisted Summary Generation
**Status**: 🔀 Superseded by #ENH-035 (Thesis Articulation Generation)
**Priority**: Medium
**Effort**: 12-15 hours estimated
**PRD**: Section 5 (Research), Section 3 (Theses)
**Phase**: Absorbed into Phase 3.1
**Source**: docs/20251230-enhancements.md

**Description**: Auto-generate summaries for theses from linked claims evidence

**Superseded By**: #ENH-035 (Thesis Articulation Generation) provides a more comprehensive solution that includes:
- Full thesis articulation (not just summary)
- Key drivers, assumptions, confidence rationale
- Evidence gaps identification
- Versioned storage for belief evolution tracking
- Interactive refinement workflow

See [Thesis Synthesis & Monitoring System](features/thesis-synthesis-monitoring.md) for the comprehensive design.

---

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

#### #ENH-043: Multi-Exchange Crypto Ingestion
**Status**: 💡 Proposed
**Priority**: Medium
**Effort**: 2-3 weeks
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 5+
**Source**: User request (2026-01-05)

**Description**: Extend ingestion infrastructure to support cryptocurrency exchanges beyond IBKR, enabling unified portfolio tracking across traditional and crypto markets.

**Supported Exchanges**:
- **Coinbase Prime** - Institutional crypto trading
- **Coinbase** - Retail crypto exchange
- **Kraken** - Multi-asset crypto exchange
- **HyperLiquid** - Perpetuals and derivatives
- **Decentralized Exchanges (DEX)** - On-chain activity (Uniswap, etc.)

**Current State**:
- Ingestion pipeline designed for IBKR Flex API (trades, positions, MTM)
- Schema supports options and equities, not crypto-specific instruments
- Single-source ingestion architecture (one primary broker)

**Technical Approach**:
1. **Schema Extensions**:
   - Add `exchange` field to `trades` and `positions` tables
   - Add `instrument_type` enum: equity, option, crypto_spot, crypto_perp, crypto_futures
   - Extend `underlyings` table for crypto assets (on-chain addresses, network identifiers)
   - Support crypto-specific fields: gas fees, network, contract address, settlement type

2. **Standardized Ingestion Interface**:
   - Abstract ingestion layer: `IExchangeAdapter` interface
   - Common normalization: ticker, quantity, price, timestamp, fees
   - Exchange-specific adapters: `CoinbasePrimeAdapter`, `HyperLiquidAdapter`, etc.
   - Handle exchange-specific quirks (Coinbase API vs CSV exports, DEX on-chain logs)

3. **Data Source Integration**:
   - **Coinbase/Coinbase Prime**: REST API + CSV exports
   - **Kraken**: REST API + CSV exports
   - **HyperLiquid**: REST API (perpetuals focus)
   - **DEX**: Web3 provider (Etherscan/block explorers + RPC nodes)

4. **Multi-Source Reconciliation**:
   - Deduplicate cross-exchange transfers (withdrawal on Exchange A = deposit on Exchange B)
   - Track inter-exchange flows in `cash_flows` or new `transfers` table
   - Portfolio-level aggregation across exchanges

**Why This Helps**:
- **Unified View**: Single system tracking traditional + crypto portfolios
- **Cross-Asset Strategies**: Manage strategies spanning TradFi and crypto
- **Institutional Crypto**: Support Coinbase Prime for institutional-grade crypto trading
- **DeFi Integration**: Track on-chain positions (LP tokens, staking, lending)

**Big Picture Impact**: Transforms system into true multi-asset, multi-exchange portfolio operating system. Enables cross-market thesis validation (e.g., "Bullish BTC" thesis linked to strategies across IBKR futures, Coinbase spot, HyperLiquid perps).

**Dependencies**:
- #ENH-044 (Multi-Account IBKR Support) - establish multi-account pattern first
- Schema migration for instrument types and exchange identifiers

---

#### #ENH-044: Multi-Account IBKR Support
**Status**: 💡 Proposed
**Priority**: Medium-High
**Effort**: 1-2 weeks
**PRD**: Section 4 (Data Ingestion & Normalisation)
**Phase**: Phase 5+
**Source**: User request (2026-01-05)

**Description**: Support multiple Interactive Brokers accounts within the same system, enabling consolidated portfolio management across personal, institutional, or strategy-segregated accounts.

**Current State**:
- System assumes single IBKR account
- `accounts` table exists but ingestion hardcoded to single Flex query
- Account selector UI exists but limited use (prepared for multi-account)

**Proposed Solution**:

1. **Ingestion Layer**:
   - Support multiple Flex query IDs (one per IBKR account)
   - Store account-specific credentials in `accounts` table or env vars
   - Run ingestion per account: `IBKR_FLEX_QUERIES=account1:query1,account2:query2`
   - Tag all imported data with `account_id`

2. **Configuration**:
   - Env var format: `IBKR_ACCOUNTS=[{name:"Personal",flexToken:"...",positionsQueryId:"...",tradesQueryId:"..."},{name:"IRA",...}]`
   - Alternative: Database-stored config in `accounts` table with encrypted credentials
   - UI: Admin page for adding/editing IBKR accounts

3. **Data Isolation & Aggregation**:
   - All queries filtered by `account_id` (already partially implemented)
   - Cross-account portfolio view (aggregate metrics across accounts)
   - Strategy linking: Allow strategies to span accounts (e.g., hedge across personal + IRA)

4. **Account-Specific Features**:
   - Account-level triage rules (different thresholds for IRA vs taxable)
   - Account selector in UI (already exists in `AccountSelector.tsx`)
   - Per-account P&L tracking and tax reporting

**Technical Implementation**:
- **Ingestion**: Modify `scripts/run-flex-ingestion.ts` to iterate over account configs
- **Schema**: Already supports `account_id` FK in trades/positions (no migration needed)
- **UI**: Leverage existing `AccountSelector` component in dashboard/triage
- **Queries**: Ensure all queries respect `account_id` filter

**Why This Helps**:
- **Account Segregation**: Separate personal, retirement (IRA), institutional accounts
- **Tax Optimization**: Track taxable vs tax-advantaged accounts separately
- **Consolidated View**: See total portfolio across all IBKR accounts
- **Foundation for #ENH-043**: Establishes multi-account pattern for multi-exchange support

**Big Picture Impact**: Enables institutional-grade multi-account management. Foundation for later multi-exchange support (#ENH-043). Supports complex account structures (taxable brokerage + Roth IRA + SEP IRA, etc.).

**Dependencies**: None (schema already multi-account ready)

**Quick Win Potential**: Could be Tier 1 if prioritized - much of the infrastructure already exists (account selector, schema FK), just need ingestion loop and config.

---

#### #ENH-008-time: Time-Based Workflow & Memory System
**Status**: ⏳ Partially absorbed into Phase 3
**Priority**: Medium-High
**Effort**: Very High (multiple phases)
**PRD**: Section 8 (Logging, Journal & Institutional Memory)
**Phase**: Some components absorbed into Phase 3, others remain for Phase 6+
**Source**: FUTURE_ENHANCEMENTS.md #8

**Context**: Addresses fundamental workflow needs (memory, pattern recognition, reviews)

**Sub-Components** (implement in phases):
1. **Event Logging & Tracking** (#8a) - Market events, trade context, patterns → *Partially absorbed into #ENH-037 (audit trail)*
2. **Time-Based Review Workflows** (#8b) - Weekly/monthly reviews → *Absorbed into #ENH-038 (automated monitoring)*
3. **Pattern Recognition & Connection System** (#8c) - Historical comparisons → *Absorbed into Phase 3.4 (Learning & Feedback)*
4. **Emotional State Tracking** (#8d) - Emotional context during trades → *Remains distinct (Phase 6+)*
5. **Calendar-Based Triggers** (#8e) - Expiry/earnings reminders → *Remains distinct (Phase 6+)*

**What Phase 3 Covers**: Event logging (#8a), time-based reviews (#8b), pattern recognition (#8c) are substantially covered by the Thesis Synthesis & Monitoring System.

**What Remains Distinct**: Emotional state tracking (#8d) and calendar-based triggers (#8e) are not addressed by Phase 3 and remain for future implementation.

**Big Picture Impact**: Transforms system from reactive to proactive, enables learning across time

---

#### #ENH-034: AI Summary Version History
**Status**: 🔀 Absorbed into #ENH-035 (Thesis Articulation Generation)
**Priority**: Medium
**Effort**: 3-4 days
**PRD**: Section 5.5 (Thesis Evaluation & Re-Underwriting), Section 8 (Institutional Memory)
**Phase**: Absorbed into Phase 3.1
**Source**: User request (2026-01-02)
**Related**: #ENH-033 (Thesis Evolution Timeline)

**Problem**: When AI summaries are regenerated, old claim IDs and summary text are lost - no audit trail or version history

**Absorbed By**: #ENH-035 (Thesis Articulation Generation) addresses this comprehensively via:
- `thesis_articulations` table with built-in versioning (version number per thesis)
- Each articulation stores `claim_ids_used` for full provenance
- Version history queryable by thesis_id + thesis_type
- Designed for comparison and evolution tracking from the start

See [Thesis Synthesis & Monitoring System](features/thesis-synthesis-monitoring.md) Section 2.1 for schema design.

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

## Abandoned Enhancements

### #ENH-025: Strategy Provenance Chain Component
**Status**: ❌ ABANDONED (2026-01-04)
**Priority**: Was Tier 1 (Quick Win)
**Effort**: 2-3 days (implementation completed but reverted)
**PRD**: Section 3 (Conceptual Model - Decision Hierarchy)
**Phase**: Was Phase 2.10
**Source**: ACTIVE_ROADMAP.md Phase 2.10
**Reason for Abandonment**: Does not add sufficient value beyond existing HierarchyBreadcrumb component, which already shows the full hierarchy chain in a compact, effective format. The dedicated provenance tab would duplicate functionality without meaningful improvement.

**What Was Built**:
- Full implementation with 9 components and API endpoint
- Positions → Strategy → Asset Thesis → Macro Theses → Claims flow
- Responsive layout with visual status indicators
- Code preserved in git history (commits `9d8ba79` and `074a67e`)

**Big Picture Impact**: None - existing HierarchyBreadcrumb already fulfills the "why this position?" requirement effectively.

**Recovery Path**: Code can be restored from git commit `9d8ba79` if requirements change.

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

**Description**: Generate triage records when mandatory links missing (Strategy without Asset Thesis, etc.)

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

**Next Enhancement ID**: #ENH-040

### Phase 3: Thesis Synthesis & Monitoring System (Planned)

**Status**: Requirements Complete (2026-01-03)
**PRD Alignment**: Sections 5.5 (Thesis Evaluation), 5.7 (Role of AI), 6.1 (Triggers), 8 (Institutional Memory)
**Specification**: [docs/features/thesis-synthesis-monitoring.md](features/thesis-synthesis-monitoring.md)

**Overview**: Transform atomic research claims into articulated investment theses with explicit validation/invalidation criteria, then monitor those criteria over time to ensure accountability and enable learning.

**Enhancement IDs**: #ENH-035 through #ENH-039

#### #ENH-035: Thesis Articulation Generation
**Status**: ⏳ Planned
**Priority**: High
**Effort**: 1 week
**Phase**: 3.1 (MVP)

**Description**: Claude Code skill to synthesize linked claims into coherent thesis articulation with key drivers, assumptions, confidence level, and evidence gaps. Versioned storage for tracking belief evolution.

**Deliverables**:
- `/synthesize-thesis` Claude Code skill
- `thesis_articulations` table with versioning
- Interactive refinement workflow
- Provenance tracking (which claims were synthesized)

---

#### #ENH-036: Validation/Invalidation Point Extraction
**Status**: ⏳ Planned
**Priority**: High
**Effort**: 1 week
**Phase**: 3.1 (MVP)
**Dependencies**: #ENH-035

**Description**: Extract explicit, measurable criteria for thesis success and failure. Claude pushes for specificity on qualitative criteria while accepting judgment-required points with observable proxies.

**Deliverables**:
- Extraction as part of `/synthesize-thesis` skill
- `validation_points` table with explicit/judgment classification
- Response protocol specification
- Push-for-specificity interaction pattern

---

#### #ENH-037: Manual Status Tracking & Audit Trail
**Status**: ⏳ Planned
**Priority**: High
**Effort**: 1 week
**Phase**: 3.1 (MVP)
**Dependencies**: #ENH-036

**Description**: In-app UI for manually updating validation point status with evidence. Full audit trail of status changes and linked user decisions. Decision audit log tracking process vs. actual actions.

**Deliverables**:
- `validation_status_history` table
- `decision_audit_log` table
- Validation point detail UI with status timeline
- Divergence acknowledgment workflow

---

#### #ENH-038: Automated Monitoring System
**Status**: ⏳ Planned
**Priority**: High
**Effort**: 2 weeks
**Phase**: 3.2
**Dependencies**: #ENH-037

**Description**: Claude proactively monitors validation points via scheduled jobs. Web search, RSS feeds, and API integrations with relevance filtering and alert generation.

**Deliverables**:
- `monitoring_specs` table
- `/monitor-theses` scheduled Claude Code skill
- GitHub Actions cron integration
- Relevance scoring and noise filtering
- In-app alert system

---

#### #ENH-042: Validation Assessment Workflow (Phase 3.2A)
**Status**: ✅ Complete (2026-01-05)
**Priority**: High
**Effort**: 4 hours
**Phase**: 3.2A (MVP supplement)
**Dependencies**: #ENH-036, #ENH-037
**PRD Alignment**: Section 5.5 (Thesis Evaluation), Section 6.1 (Triggers)
**Specification**: [docs/features/validation-assessment-workflow.md](features/validation-assessment-workflow.md)

**Description**: Top-down evidence assessment workflow that complements bottom-up research discovery. Analyzes content (SEC filings, presentations, transcripts) against existing validation points to identify validation/invalidation evidence.

**Problem Solved**:
- Monitoring identifies new content (SEC filings, presentations) but lacks structured way to assess against validation points
- Need targeted validation assessment distinct from comprehensive claim extraction (process-transcript)
- Missing link between monitoring detection and validation status updates

**Implemented Features**:
- ✅ `/assess-validation-evidence` Claude Code skill
- ✅ Database script: `scripts/assess-validation-evidence.ts` (437 lines)
- ✅ Ticker-based thesis lookup: `ticker:GLXY` → auto-finds thesis
- ✅ Fetches validation points from Supabase
- ✅ Supports multiple content sources: URLs, files, text
- ✅ LLM-powered cross-reference analysis
- ✅ Structured markdown assessment report
- ✅ Evidence categorization: strong/weak validation/invalidation
- ✅ Confidence scoring: high/medium/low/none
- ✅ Actionable recommendations for status updates
- ✅ Integration with existing UI (ValidationPointsList, UpdateValidationStatusModal)
- ✅ Real-world testing: Galaxy Digital SEC presentation assessment

**Workflow**:
```
User discovers content → /assess-validation-evidence ticker:GLXY <source>
→ Fetch validation points → Analyze content → Generate report
→ Review evidence → Update statuses via UI → Record monitoring events
```

**Key Distinction from process-transcript**:
- **process-transcript**: Bottom-up claim extraction (exhaustive, all assertions)
- **assess-validation-evidence**: Top-down validation check (targeted, specific points)

**Big Picture Impact**:
- Completes monitoring loop: detection → assessment → status update → audit trail
- Enables evidence-based validation tracking for thesis accountability
- Bridges research intelligence with tactical decision making
- Foundation for automated monitoring triggers (future Phase 3.2+)

**Technical Implementation**:
- Skill: `.claude/skills/assess-validation-evidence/`
- Script: `scripts/assess-validation-evidence.ts` (437 lines)
- Queries: `validation_points`, `macro_theses`, `asset_theses` tables
- Output: Markdown report with summary, evidence sections, recommendations
- UI: Reuses existing Phase 3.2A components

**Files Changed**:
- NEW: `.claude/skills/assess-validation-evidence/skill.json`
- NEW: `.claude/skills/assess-validation-evidence/SKILL.md`
- NEW: `scripts/assess-validation-evidence.ts`
- NEW: `docs/features/validation-assessment-workflow.md`
- NEW: `docs/features/phase3_2_continuation.md` (continuation roadmap)
- MODIFIED: `CLAUDE.md` (documented new skill)
- MODIFIED: `docs/terminology.md` (asset_views → asset_theses)
- MODIFIED: `.claude/skills/create-view/skill.json` (terminology fix)
- MODIFIED: `.claude/skills/read-views/skill.json` (terminology fix)

---

#### #ENH-042B: Assessment-to-Database Recording
**Status**: 💡 Proposed (Tier 1 - Quick Win)
**Priority**: High
**Effort**: 1-2 days
**Phase**: 3.2B
**Dependencies**: #ENH-042
**PRD Alignment**: Section 5.5 (Thesis Evaluation), Section 8 (Institutional Memory)

**Description**: Extend assess-validation-evidence workflow to write assessment results directly to database with interactive user review and approval.

**Problem**: Currently generates markdown reports but requires manual status updates via UI - creates gap in audit trail and adds friction.

**Deliverables**:
- Extend `assess-validation-evidence.ts` with database write capability
- Add interactive review mode (approve/reject/modify per validation point)
- Batch approval workflow for high-confidence assessments
- Record to `validation_status_history` table
- Update `validation_points.status` upon approval
- Link monitoring events to status updates

**Why This Helps**:
- Eliminates manual data entry
- Ensures complete audit trail
- Enables trend analysis over time
- Foundation for automated monitoring

---

#### #ENH-042C: Validation Status History UI
**Status**: 💡 Proposed (Tier 1 - Quick Win)
**Priority**: High
**Effort**: 2-3 days
**Phase**: 3.2B
**Dependencies**: #ENH-042B
**PRD Alignment**: Section 9 (Visualization), Section 8 (Institutional Memory)

**Description**: Build UI to view validation point status history, evidence timeline, and monitoring activities.

**Deliverables**:
- Validation point detail page (`/macro-theses/[id]/validation/[pointId]`)
- Status timeline component (chronological status changes)
- Monitoring events log (table of all checks performed)
- Evidence comparison view (side-by-side multi-assessment)
- Integration with existing ValidationPointsList component

**Why This Helps**:
- Users can see full history of validation progress
- Evidence accumulation visible over time
- Audit trail accessible and queryable
- Supports accountability and learning

---

#### #ENH-042D: Evidence Aggregation & Trend Analysis
**Status**: 💡 Proposed (Tier 2 - Strategic)
**Priority**: Medium
**Effort**: 1 week
**Phase**: 3.2C
**Dependencies**: #ENH-042C
**PRD Alignment**: Section 7 (Decision Support & Analytics)

**Description**: Calculate evidence strength scores and visualize validation progress trends over time.

**Deliverables**:
- Evidence strength score (0-100) based on:
  - Number of confirming data points
  - Confidence levels over time
  - Source credibility weighting
  - Recency of evidence
- Trend visualization (line chart with annotations)
- Conflicting evidence detection
- Forecast trajectory (is validation accelerating?)

**Why This Helps**:
- Quantitative assessment of thesis strength
- Identify when confidence should change
- Detect contradictory evidence automatically
- Support conviction calibration

---

#### #ENH-042E: FRED Economic Data Integration
**Status**: 💡 Proposed (Tier 1 - Quick Win)
**Priority**: High
**Effort**: 2-3 days
**Phase**: 3.2D
**Dependencies**: #ENH-042B
**PRD Alignment**: Section 6.1 (Triggers - Automated Monitoring)

**Description**: Automated monitoring of FRED economic data series against validation point thresholds.

**Current State**:
- OpenBB integration exists and tested
- FRED API key configured
- Test script working (`scripts/openbb/query_fred_monitoring.py`)

**Deliverables**:
- FRED monitoring spec support in database
- Daily scheduled check script (`scripts/monitor-fred-validation.ts`)
- GitHub Actions workflow (daily 10 AM ET)
- Threshold evaluation and alert generation
- Python-TypeScript bridge for OpenBB integration

**Example Use Cases**:
- "ICSA (initial claims) > 250,000" triggers invalidation of "Bullish US Employment" thesis
- "CPI YoY > 3.5%" validates "Inflation persists" thesis
- "UNRATE > 5.0%" triggers review of macro economic theses

**Why This Helps**:
- Automated economic data monitoring (zero manual effort)
- Timely alerts on macro developments
- Foundation for multi-source monitoring

---

#### #ENH-042F: IV30 & Price Data Integration
**Status**: 💡 Proposed (Tier 2 - Strategic)
**Priority**: Medium
**Effort**: 3-4 days
**Phase**: 3.2D
**Dependencies**: #ENH-042B
**PRD Alignment**: Section 6.1 (Triggers - Automated Monitoring)

**Description**: Automated monitoring of price and IV data from existing `underlyings_iv_history` table.

**Current State**:
- IV/spot data ingested daily from Massive.com
- Data stored in `underlyings_iv_history` table
- Available for all tracked underlyings

**Deliverables**:
- Price/IV monitoring spec support
- Daily check after Massive ingestion (GitHub Actions)
- Threshold evaluation for spot, IV30, IV rank, IV percentile
- Alert generation on threshold crossings

**Example Use Cases**:
- "BTC spot > $100,000" validates "Bullish BTC" thesis
- "GLXY IV30 < 40" invalidates "High volatility persists" point
- "SPY IV rank < 20 for 30 days" validates "Complacency returns"

**Why This Helps**:
- Leverages existing data pipeline
- Market-based validation triggers
- Complements fundamental analysis

---

#### #ENH-042G: News & SEC Filing Integration
**Status**: 💡 Proposed (Tier 2 - Strategic)
**Priority**: Medium
**Effort**: 1-2 weeks
**Phase**: 3.2D
**Dependencies**: #ENH-042B
**PRD Alignment**: Section 6.1 (Triggers), Phase 3.3 (News & Narratives)

**Description**: Automated news monitoring with semantic relevance scoring and auto-assessment triggering.

**Deliverables**:
- News monitoring spec support
- Finnhub integration (free tier)
- SEC EDGAR RSS feed parsing
- Claude relevance scoring (semantic + novelty + credibility)
- Auto-trigger assessment on high-relevance news
- Daily monitoring script with GitHub Actions

**Relevance Scoring**:
- Semantic relevance (0-1): Does this relate to validation point?
- Novelty: Is this new information or rehash?
- Source credibility: Weight by source tier
- Confidence: low/medium/high

**Why This Helps**:
- Proactive intelligence gathering
- Catches developments before user would notice
- Semantic understanding prevents keyword noise
- Auto-assessment reduces manual work

---

#### #ENH-042H: Master Monitoring Orchestration
**Status**: 💡 Proposed (Tier 2 - Strategic)
**Priority**: Medium
**Effort**: 1 week
**Phase**: 3.2E
**Dependencies**: #ENH-042E, #ENH-042F, #ENH-042G
**PRD Alignment**: Section 6.1 (Triggers - Automated Monitoring)

**Description**: Unified monitoring orchestration script running all data source checks and generating summary reports.

**Deliverables**:
- Master monitoring script (`scripts/run-all-monitoring.ts`)
- GitHub Actions daily workflow
- Monitoring summary report
- Alert aggregation and notification
- Error handling and logging

**Workflow**:
```
Daily 9 AM ET:
  → FRED economic data monitoring
  → Price/IV data monitoring (after Massive ingestion)
  → News & SEC filing monitoring
  → Generate summary report
  → Send notifications if alerts exist
```

**Why This Helps**:
- Single daily monitoring run
- Consistent execution schedule
- Centralized logging and error handling
- User gets one summary instead of multiple alerts

---

#### #ENH-039: News & Narratives Integration
**Status**: ⏳ Planned
**Priority**: Medium
**Effort**: 2-3 weeks
**Phase**: 3.3
**Dependencies**: #ENH-038

**Description**: Proactive intelligence gathering beyond explicit monitoring. Track emerging narratives, suggest new validation points, detect cross-thesis correlations.

**Deliverables**:
- Narrative tracking system
- Cross-thesis intelligence ("affects 3 theses")
- Source management and credibility scoring
- Financial data provider API integrations

---

**Phase 3.4 (Learning & Feedback)**: Outcome analysis, process adherence metrics, thesis quality scoring. Specified in detail doc, no ENH ID assigned yet.

---

#### #ENH-040: Data Visualization Enhancements
**Status**: 💡 Proposed
**Priority**: Medium (Tier 1 Quick Win)
**Effort**: 1-2 days per enhancement
**Phase**: Backlog

**Description**: Leverage existing data sources to enhance detail pages with market context and visualizations. Data already flows into the system via IBKR, Massive.com, and FRED/OpenBB integrations.

**Opportunities Identified**:
- **Asset Thesis Detail**: 90-day spot/IV history chart (data in `underlyings_iv_history`)
- **Asset Thesis Detail**: Options chain IV surface visualization (data in `options_chain_snapshots`)
- **Macro Thesis Detail**: Relevant FRED metrics display (via OpenBB integration)
- **Strategy Performance**: Asset contribution waterfall
- **Portfolio Dashboard**: Cross-asset correlation matrix

**Why This Helps**:
- Market context at decision point (no external lookups needed)
- Visual validation of thesis assumptions
- Connects data layer to belief layer

**Data Sources**: IBKR (existing), Massive.com (existing), FRED via OpenBB (configured)

---

#### #ENH-041: Local-First Database Architecture Migration
**Status**: 💡 Proposed
**Priority**: High (Tier 1 - Cost Optimization & Performance)
**Effort**: 1-2 weeks (phased implementation)
**Phase**: Backlog (high priority)
**Source**: docs/archive/local-db-architecture-vs-supabase.md

**Description**: Migrate from Supabase-only to hybrid local-first architecture with SQLite as primary data store and Supabase as backup/sync layer.

**Current State**:
- Supabase Pro hosting all data (~$25/month = $300/year)
- Single-user application with local/LAN-only access
- PostgreSQL-compatible schema via Drizzle ORM
- No Supabase-specific features in use (no RLS, Edge Functions, Realtime)

**Proposed Architecture (Hybrid)**:
```
┌─────────────────────────────────────┐
│  Local SQLite (source of truth)     │
│  - Trades, positions, strategies    │
│  - Research artifacts & claims      │
│  - Zero latency, zero cost          │
└─────────────────────────────────────┘
              │
              │ (nightly push or manual sync)
              ▼
┌─────────────────────────────────────┐
│  Supabase (backup + future mobile)  │
│  - Read-only mirror                 │
│  - Off-site durability              │
│  - Optional: future multi-device    │
└─────────────────────────────────────┘
```

**Implementation Plan**:
1. **Phase 1**: Add SQLite via `better-sqlite3` as primary store
2. **Phase 2**: Refactor `src/db/index.ts` to support dual connections (env flag)
3. **Phase 3**: Update all writes to hit SQLite first
4. **Phase 4**: Create sync script `scripts/sync-to-supabase.ts` (one-way push)
5. **Phase 5**: Validate both systems in parallel for 2-4 weeks
6. **Phase 6**: Optionally downgrade Supabase to free tier or read-only

**Schema Portability**: Already PostgreSQL-compatible (via Drizzle), migration is mechanical:
- `jsonb` → `text` (JSON as text)
- `serial` → `integer primary key autoincrement`
- Everything else: identical

**Why This Helps**:
- **Cost Savings**: $300/year → $0/year (immediate ROI)
- **Performance**: Sub-millisecond queries (no network latency)
- **Ownership**: Full data control, offline-first
- **Future Optionality**: Keep Supabase for mobile/remote access without lock-in
- **Simplicity**: Zero backend infrastructure to manage

**Benefits Over Pure Local**:
- Off-site backup via Supabase free tier
- Future multi-device access without re-architecture
- GitHub Actions can write to either store

**Risks & Mitigation**:
| Risk               | Mitigation                               |
| ------------------ | ---------------------------------------- |
| Data loss          | Daily backup script to Supabase          |
| Migration bugs     | Run both systems in parallel for 2-4 weeks |
| GitHub Actions     | Support both connection modes via env vars |
| Schema divergence  | Drizzle ORM ensures schema parity        |

**Dependencies**: None (schema already portable)

**Big Picture Impact**: Aligns architecture with actual use case (single-user, local-first), eliminates recurring costs, improves performance, maintains future optionality for collaboration/mobile.

**Reference**: See [docs/archive/local-db-architecture-vs-supabase.md](archive/local-db-architecture-vs-supabase.md) for full architectural analysis and conversation transcript.

---

#### #ENH-042: Claim Detail Page Linking Workflow
**Status**: 💡 Proposed
**Priority**: Medium (Tier 1 Quick Win)
**Effort**: 2-4 hours
**PRD**: Section 5.4 (Contextual Mapping to Investment Hierarchy)
**Phase**: Backlog
**Source**: User request (2026-01-05)

**Description**: Add ability to link claims to macro/asset theses directly from the claim detail page (`/research/claims/[id]`), using existing linking components.

**Current State**:
- Claim linking only available from the claims browser page (`/research/claims`)
- Claim detail page shows linked theses but provides no way to add new links
- Users must navigate back to claims browser to link a claim after viewing its details

**Proposed Solution**:
- Add "+" button or "Link to Thesis" button in appropriate section of claim detail page
- Reuse existing `ConvertClaimToEntityDialog` component from claims browser
- Pre-select the current claim in the dialog context
- Support both "Link to Existing" and "Create New" modes

**Technical Implementation**:
- Component: Reuse `ConvertClaimToEntityDialog.tsx` (no changes needed)
- Page: Update `src/app/research/claims/[id]/page.tsx`
- Add button in "Linked Theses" section or similar location
- Pass claim data as props to dialog

**Why This Helps**:
- **Improved UX**: Complete workflow without navigation back to claims browser
- **Context preservation**: Users can link immediately after reviewing claim details
- **Consistency**: Same linking workflow available in both locations
- **Zero duplication**: Reuses existing, tested component

**Files Changed** (estimated):
- Modified: `src/app/research/claims/[id]/page.tsx` - Add link button and dialog integration
- Unchanged: `src/components/research/ConvertClaimDialog.tsx` - Reuse as-is

**Big Picture Impact**: Reduces friction in research workflow by enabling linking at point of review. Completes the claim detail page as a fully functional management interface.

---

### Phase 2.7 Enhancement IDs (Complete 2025-12-31)

- **#ENH-013**: ✅ Unified Macro Thesis Browser (UnifiedMacroThesisBrowser.tsx)
- **#ENH-014**: ✅ Unified Asset Thesis Browser (UnifiedAssetThesisBrowser.tsx)
- **#ENH-015**: ✅ Unified Strategies Browser (UnifiedStrategiesBrowser.tsx)
- **#ENH-016**: ✅ Research Detail Page UX Improvements (compact metadata/workflow)
- **#ENH-017**: ✅ Claims Browser 'Linked To' Filter (multi-select theses/views)
- **#ENH-018**: ✅ Macro Thesis Detail Page Enhancements (delete, compact overview, unified browsers)
- **#ENH-019**: ✅ Asset Thesis Detail Page Enhancements (market data fix, unified browsers)
- **#ENH-020-playbook**: ⏳ Strategy Detail Page Enhancements (Playbook tab) - Deferred to Phase 3+

### Phase 2.10 Enhancement ID (Abandoned 2026-01-04)

- **#ENH-025**: ❌ Strategy Provenance Chain Component - ABANDONED (redundant with HierarchyBreadcrumb)
- **#ENH-021**: ✅ Rename /theses → /macro-theses (URL consistency)
- **#ENH-022**: ⏳ AI-Assisted Summary Generation (Claude Skills) - Deferred to Phase 3+
- **#ENH-023**: ✅ ClientHierarchyBreadcrumb Bug Fixes (field name mismatch)

**Status**: 9 of 11 complete (82%), 2 deferred to future phases

**Note**: #ENH-020 already assigned to Automated Tests. Strategy enhancements use #ENH-020-playbook to avoid collision.

**Next Enhancement ID**: #ENH-045 (ENH-042A through ENH-042H allocated to Phase 3.2 sub-phases)

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
