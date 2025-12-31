# Phase 2.7: Unified Browser Pattern & Hierarchy UX
## Implementation Plan

**Created**: 2025-12-30  
**Status**: Planned  
**Dependencies**: Phase 2.6 ✅ (UnifiedClaimsBrowser.tsx pattern established)  
**PRD Alignment**: Section 3 (Conceptual Model), Section 9 (Visualisation & Attention Management)

---

## Executive Summary

Phase 2.6 introduced the `UnifiedClaimsBrowser.tsx` pattern with advanced filtering, search, inline linking, and expandable rows. This phase extends that pattern across all hierarchy entities and adds AI-assisted summarization capabilities.

**Pattern Features**:
- Advanced filtering with multi-select and search
- Sortable columns with visual indicators
- Expandable rows for full details
- Inline status/linking workflows (no page navigation)
- Keyboard shortcuts (/ for search, ESC to close)
- Consistent visual language across all browsers

**Core Philosophy**: Every hierarchy level should have the same high-quality browsing experience established in Claims Browser.

---

## Enhancement Registry

### New Enhancement IDs

- **#ENH-013**: Unified Macro Thesis Browser (`UnifiedMacroThesisBrowser.tsx`)
- **#ENH-014**: Unified Asset Thesis Browser (`UnifiedAssetThesisBrowser.tsx`)
- **#ENH-015**: Unified Strategies Browser (`UnifiedStrategiesBrowser.tsx`)
- **#ENH-016**: Research Detail Page UX Improvements (compact metadata/workflow)
- **#ENH-017**: Claims Browser 'Linked To' Filter (multi-select theses/views)
- **#ENH-018**: Macro Thesis Detail Page Enhancements (delete, compact overview, AI summary)
- **#ENH-019**: Asset Thesis Detail Page Enhancements (delete, compact overview, AI summary, market data fix)
- **#ENH-020**: Strategy Detail Page Enhancements (Playbook tab, unified sections)
- **#ENH-021**: Rename `/theses` → `/macro-theses` (URL consistency)
- **#ENH-022**: AI-Assisted Summary Generation (Claude Skills for thesis/view summarization)
- **#ENH-023**: ClientHierarchyBreadcrumb Bug Fixes (populate macro/asset thesis selectors)

### Mapping to 20251230-enhancements.md

| Enhancement Doc Item | Enhancement ID | Type |
|---------------------|----------------|------|
| 1.1 - /research/[id] improvements | #ENH-016 | UX Polish |
| 1.2 - /research/claims 'Linked To' filter | #ENH-017 | Feature |
| 1.3 - /theses → /macro-theses + browser | #ENH-013, #ENH-021 | Feature + Rename |
| 1.4 - /theses/[id] improvements | #ENH-018 | Feature |
| 1.5 - /asset-theses browser | #ENH-014 | Feature |
| 1.6 - /asset-theses/[id] improvements | #ENH-019, #ENH-023 | Feature + Bug |
| 1.7 - /strategies browser | #ENH-015 | Feature |
| 1.8 - /strategies/[id] improvements | #ENH-020 | Feature |
| 1.4.4, 1.6.4 - AI summarization | #ENH-022 | AI Feature |

---

## Implementation Phases

### Phase 2.7.1: Core Unified Browsers ⭐ HIGH PRIORITY
**Effort**: 4-5 days  
**Why First**: Establishes consistent UX pattern across all hierarchy levels  

#### #ENH-013: Unified Macro Thesis Browser
**Status**: ⏳ Planned  
**Effort**: 1.5 days  
**PRD**: Section 3.1 (Macro Theses)  

**Current State**:
```
/theses/page.tsx - Simple table, no filters, no search, no expandable rows
```

**Target State**:
```tsx
UnifiedMacroThesisBrowser.tsx
- Columns: Title, Type, Time Horizon, Confidence, Status, Asset Theses, Strategies
- Filters: Type (secular/cyclical/structural), Time Horizon, Confidence, Status
- Search: Title, sectors, description, notes
- Sort: All columns
- Inline linking: Asset Theses column → LinkToViewsDialog (multi-select)
- Expandable: Show full description, sectors, linked claims, notes
```

**Implementation**:
1. Create `src/components/theses/UnifiedMacroThesisBrowser.tsx` (~800 lines, based on UnifiedClaimsBrowser)
2. Copy pattern: filters, search, sort, expand, keyboard shortcuts
3. Add thesis-specific columns and actions
4. Integrate `LinkToViewsDialog` for inline asset thesis linking
5. Update `/theses/page.tsx` to use new component

**API Changes**:
- Extend `getMacroThesesList()` to include linked views count, linked strategies count
- Optional: Add `GET /api/theses/available-views` for linking dialog

---

#### #ENH-014: Unified Asset Thesis Browser
**Status**: ⏳ Planned  
**Effort**: 1.5 days  
**PRD**: Section 3.2 (Asset Theses)  

**Current State**:
```
/asset-theses/page.tsx - Simple table, limited filters
```

**Target State**:
```tsx
UnifiedAssetThesisBrowser.tsx
- Columns: Title, Underlying, Time Horizon, Confidence, Status, Macro Theses, Strategies
- Filters: Time Horizon, Confidence, Status, Underlying (multi-select), Macro Thesis (multi-select)
- Search: Title, ticker, description, notes
- Sort: All columns
- Inline linking:
  - Macro Theses column → LinkToThesisDialog (multi-select)
  - Strategies column → LinkToStrategiesDialog (multi-select)
- Expandable: Show full description, market data, linked claims, notes
```

**Implementation**:
1. Create `src/components/asset-theses/UnifiedAssetThesisBrowser.tsx` (~850 lines)
2. Add underlying filter (typeahead or dropdown with all tickers)
3. Add macro thesis filter (multi-select from existing theses)
4. Integrate `LinkToThesisDialog` and `LinkToStrategiesDialog`
5. Update `/asset-theses/page.tsx` to use new component

**API Changes**:
- Extend `getAssetThesesList()` to include macro thesis titles, strategies count
- Add `GET /api/asset-theses/available-strategies` for linking dialog
- Add `POST /api/asset-theses/link-strategies` for bulk strategy linking

---

#### #ENH-015: Unified Strategies Browser
**Status**: ⏳ Planned  
**Effort**: 1.5 days  
**PRD**: Section 3.3 (Strategies)  

**Current State**:
```
/strategies/page.tsx - Simple table with FilterBar
/admin/strategies/page.tsx - Separate admin interface
```

**Target State**:
```tsx
UnifiedStrategiesBrowser.tsx
- Columns: Strategy, Account, State Code, Status, Asset Theses, Abs Notional, Unrealized, % NAV
- Additional columns to consider: Entry Date, DTE, Triage Count, Last Action
- Filters:
  - Status (open/closed/draft/planned/merged) with toggle for "Show Closed"
  - Account (multi-select)
  - Asset Thesis (multi-select)
  - Macro Thesis (multi-select)
  - State Code (multi-select from playbook codes: LC1, RR2, etc.)
- Search: Strategy label, key, underlying, notes
- Sort: All columns
- Inline linking: Asset Theses column → LinkToViewDialog (multi-select)
- Expandable: Show full positions, recent actions, metrics, notes
```

**Implementation**:
1. Create `src/components/strategies/UnifiedStrategiesBrowser.tsx` (~900 lines)
2. Merge /strategies and /admin/strategies functionality
3. Add "Show Closed" toggle (default: hide closed/merged)
4. Add state code filter (pull from playbook_items table)
5. Integrate `LinkToViewDialog` for inline asset thesis linking
6. Update `/strategies/page.tsx` to use new component

**Note**: Item 1.7.2 from requirements doc (integrate admin page) is complex and deferred to Phase 2.7.4.

**API Changes**:
- Extend `getStrategiesForList()` to support status filter (include closed when requested)
- Add account names to query results

---

### Phase 2.7.2: Claims & Research UX Polish ⭐ QUICK WINS
**Effort**: 1 day  
**Why Second**: High-value improvements to existing workflow  

#### #ENH-017: Claims Browser 'Linked To' Filter
**Status**: ⏳ Planned  
**Effort**: 3 hours  
**PRD**: Section 5.4 (Contextual Mapping)  
**Source**: 20251230-enhancements.md (1.2.1)  

**Implementation**:
```tsx
// Add to UnifiedClaimsBrowser.tsx filter panel
<div>
  <label>Linked To</label>
  <MultiSelect
    options={[
      { value: 'unlinked', label: 'Unlinked Claims' },
      ...macroTheses.map(t => ({ value: `thesis-${t.id}`, label: t.title, badge: 'Macro' })),
      ...assetViews.map(v => ({ value: `view-${v.id}`, label: v.title, badge: 'Asset' }))
    ]}
    value={linkedToFilter}
    onChange={setLinkedToFilter}
  />
</div>
```

**API Changes**:
- Add `linkedTheses` and `linkedViews` to existing claims query (already implemented ✅)
- No new API needed

---

#### #ENH-016: Research Detail Page UX Improvements
**Status**: ⏳ Planned  
**Effort**: 2 hours  
**PRD**: Section 5 (Research Layer)  
**Source**: 20251230-enhancements.md (1.1)  

**Changes**:
1. Combine Metadata + Workflow Status sections into compact side-by-side layout
2. Update Workflow Status text: "12 claims converted" → "12 claims linked to theses"
3. Reduce vertical spacing throughout page
4. Keep UnifiedClaimsBrowser.tsx as primary focus

**Files**:
- `/research/[id]/page.tsx` - Layout changes
- Possibly extract Metadata/Workflow into single component

---

### Phase 2.7.3: Detail Page Enhancements 🔧 MEDIUM PRIORITY
**Effort**: 3-4 days  
**Why Third**: Improves individual entity management  

#### #ENH-018: Macro Thesis Detail Page Enhancements
**Status**: ⏳ Planned  
**Effort**: 1.5 days  
**PRD**: Section 3.1 (Macro Theses)  
**Source**: 20251230-enhancements.md (1.4)  

**Checklist**:
- [ ] 1.4.1: Add delete button to Edit thesis dialog
- [ ] 1.4.2: Make Overview section more compact (2-column grid)
- [ ] 1.4.3: Rename "Description" section → "Summary"
- [ ] 1.4.5: Move Notes section to bottom
- [ ] 1.4.6: Replace Main Claims section with UnifiedClaimsBrowser filtered by `linkedThesisId`, change "Linked To" column → "Source"
- [ ] 1.4.7: Replace Linked Asset Theses section with UnifiedAssetThesisBrowser filtered by `macroThesisId`
- [ ] 1.4.8: Replace Linked Strategies section with UnifiedStrategiesBrowser filtered by `macroThesisId`
- [ ] 1.4.4: AI Summary skill (see #ENH-022)

**Implementation**:
1. Update `/theses/[id]/page.tsx`
2. Create filtered instances of Unified browsers
3. Add delete confirmation dialog
4. Rearrange sections

**API Changes**:
- Add `DELETE /api/theses/[id]` endpoint with cascade handling
- Extend claims query to support `linkedThesisId` filter

---

#### #ENH-019: Asset Thesis Detail Page Enhancements
**Status**: ⏳ Planned  
**Effort**: 1.5 days  
**PRD**: Section 3.2 (Asset Theses)  
**Source**: 20251230-enhancements.md (1.6)  

**Checklist**:
- [ ] 1.6.1: Add delete button to Edit asset thesis dialog
- [ ] 1.6.2: Make Overview section more compact
- [ ] 1.6.3: Rename "Description" → "Summary", move above Underlying Market Data
- [ ] 1.6.5: Fix Underlying Market Data not populating (query/display issue)
- [ ] 1.6.6: Replace Main Claims section with UnifiedClaimsBrowser filtered by `linkedViewId`, change "Linked To" → "Source"
- [ ] 1.6.7: Add "Linked Macro Theses" section using UnifiedMacroThesisBrowser
- [ ] 1.6.8: Replace Linked Strategies section with UnifiedStrategiesBrowser
- [ ] 1.6.4: AI Summary skill (see #ENH-022)

**Implementation**:
1. Update `/asset-theses/[id]/page.tsx`
2. Debug underlying market data query (check joins to underlyings table)
3. Create filtered instances of Unified browsers
4. Add delete confirmation dialog

**API Changes**:
- Add `DELETE /api/asset-theses/[id]` endpoint with cascade handling
- Fix `getAssetThesisById()` to properly join underlyings data
- Extend claims query to support `linkedViewId` filter

---

#### #ENH-023: ClientHierarchyBreadcrumb Bug Fixes
**Status**: ⏳ Planned (Bug Fix)  
**Effort**: 2 hours  
**PRD**: Section 3 (Conceptual Model)  
**Source**: 20251230-enhancements.md (1.6.0, 1.8.0)  

**Bugs**:
1. `/asset-theses/[id]`: "Link to Macro Thesis" not populating with records
2. `/strategies/[id]`: "Link to Asset Thesis" not populating with records

**Root Cause**: Likely API endpoint or data fetching issue in `LinkToThesisDialog` or `LinkToViewDialog`

**Investigation**:
1. Check `GET /api/theses` endpoint (should return all active theses)
2. Check `GET /api/asset-theses` endpoint (should return all active views)
3. Verify dialog components are calling correct endpoints
4. Check for TypeScript type mismatches

---

### Phase 2.7.4: Advanced Features 🚀 LOWER PRIORITY
**Effort**: 4-5 days  
**Why Last**: High complexity, nice-to-have features  

#### #ENH-020: Strategy Detail Page Enhancements
**Status**: ⏳ Planned  
**Effort**: 2-3 days  
**PRD**: Section 3.3 (Strategies), Section 7 (Decision Support)  
**Source**: 20251230-enhancements.md (1.8)  

**Checklist**:
- [ ] 1.8.1: Integrate /admin/strategies features (edit, delete, merge)
- [ ] 1.8.2: Add filtered Performance, Triage, Blotter tabs (already partially exists)
- [ ] 1.8.3: Add Playbook tab for AI-assisted decision-making

**Playbook Tab Scope**:
- Options payoff charts (Greeks, IV at strikes/expiries)
- Technical indicators (chart patterns, support/resistance)
- AI evaluation: "Should I roll? Close? Add to position?"
- Decision context capture (emotional state, market regime)

**Implementation**:
1. Update `/strategies/[id]/page.tsx` to add tabs
2. Create `PlaybookTab.tsx` component
3. Integrate existing performance/triage/blotter components
4. Design AI evaluation interface (manual input → Claude API → recommendation)

**Dependencies**:
- #ENH-013 (Decision-Making Assistant) from FUTURE_ENHANCEMENTS.md
- Requires manual options data capture (no IBKR options chain API yet)

---

#### #ENH-022: AI-Assisted Summary Generation (Claude Skills)
**Status**: ⏳ Planned  
**Effort**: 2 days  
**PRD**: Section 5.7 (Role of AI)  
**Source**: 20251230-enhancements.md (1.4.4, 1.6.4)  

**Goal**: Generate summarization of Macro Thesis or Asset Thesis based on linked Main Claims

**Implementation**:
1. Create `.cursor/skills/summarize-thesis.md` skill
2. Create `.cursor/skills/summarize-view.md` skill
3. Skills query linked claims via psql
4. AI generates 2-3 paragraph summary synthesizing claims
5. User reviews and edits in Summary section (make editable)
6. Save summary back to `macro_theses.description` or `asset_theses.description`

**Example Workflow**:
```bash
# User invokes skill on thesis detail page
/summarize-thesis <thesis-id>

# Skill queries linked claims
SELECT claim, evidence, reasoning FROM main_claims
JOIN thesis_claims ON ...
WHERE thesis_id = <thesis-id>

# AI synthesizes summary
"Based on 7 linked claims, this thesis argues that..."

# User edits and confirms
# Skill updates database via psql
UPDATE macro_theses SET description = '...' WHERE id = '...'
```

**Alternative**: In-app AI button (requires API endpoint + Anthropic API key handling)

---

#### #ENH-021: Rename `/theses` → `/macro-theses`
**Status**: ⏳ Planned  
**Effort**: 1 hour  
**PRD**: Section 3 (Conceptual Model)  
**Source**: 20251230-enhancements.md (1.3.1)  

**Why**: Terminology consistency - "Macro Thesis" vs "Asset Thesis" naming

**Implementation**:
1. Rename folder: `/src/app/theses` → `/src/app/macro-theses`
2. Update all internal links: `/theses/${id}` → `/macro-theses/${id}`
3. Update sidebar nav: `activeNav="theses"` → `activeNav="macro-theses"`
4. Update navigation constants in `NavKey` type
5. Add Next.js redirect: `/theses/:id` → `/macro-theses/:id` (for backwards compatibility)

**Files to Update**:
- `/src/app/theses/*` → `/src/app/macro-theses/*`
- `/src/components/layout/AppSidebar.tsx`
- `/src/db/types.ts` (NavKey)
- All Link components referencing `/theses`
- README.md, CLAUDE.md

---

## Deferred to Future Phases

### #ENH-003: Claims in Triage Page
**Status**: ⏳ Deferred to Phase 4+  
**Reason**: Requires Phase 4 trigger infrastructure (first-class trigger entities)  
**Source**: FUTURE_ENHANCEMENTS.md  

---

### Bigger Picture Ideas (from 20251230-enhancements.md section 3)

**3.1. Time-Based AI Monitoring**
- Maps to **#ENH-008-time** (FUTURE_ENHANCEMENTS.md)
- Phase 6+ (memory & pattern recognition system)

**3.2. Enhanced Blotter Journaling**
- Maps to **#ENH-008a** (Event Logging & Tracking)
- Phase 6+ (transforms Blotter into Journal)

**3.3. Enhanced Triage Triggers**
- Maps to **#ENH-003**, **#ENH-012** (Mandatory Link Triage Triggers)
- Phase 4+ (requires trigger infrastructure)

**3.4. Claude-Powered Natural Language UX**
- Novel concept - no existing enhancement ID
- Phase 7+ (requires significant R&D)
- **Potential**: "Link TSLA asset thesis to robotics macro thesis" → Claude interprets and executes
- Requires: Intent classification, entity resolution, transaction orchestration
- Reference: Emerging "Apps to Agents" paradigm (see research-workspace/1-transcripts/2025-12-21-apps-to-agents.md)

---

## Implementation Order (Recommended)

### Sprint 1: Core Browsers (Week 1)
**Goal**: Establish Unified Browser pattern across all hierarchy levels  
**Duration**: 5 days  

1. Day 1-2: #ENH-013 (Unified Macro Thesis Browser)
2. Day 2-3: #ENH-014 (Unified Asset Thesis Browser)
3. Day 4-5: #ENH-015 (Unified Strategies Browser)

**Deliverable**: All list pages have consistent, high-quality browsing experience

---

### Sprint 2: UX Polish & Bug Fixes (Week 2)
**Goal**: Polish existing features and fix reported bugs  
**Duration**: 3 days  

1. Day 1: #ENH-016 (Research page UX improvements) + #ENH-017 (Claims 'Linked To' filter)
2. Day 2: #ENH-023 (Fix ClientHierarchyBreadcrumb bugs)
3. Day 3: #ENH-021 (Rename /theses → /macro-theses) + testing

**Deliverable**: Bug-free navigation, improved research workflow

---

### Sprint 3: Detail Page Enhancements (Week 3)
**Goal**: Improve individual entity management  
**Duration**: 4 days  

1. Day 1-2: #ENH-018 (Macro Thesis detail page)
2. Day 3-4: #ENH-019 (Asset Thesis detail page)

**Deliverable**: Delete functionality, compact layouts, filtered Unified browsers in detail pages

---

### Sprint 4: Advanced Features (Week 4 - Optional)
**Goal**: AI-assisted features and advanced decision support  
**Duration**: 4-5 days  

1. Day 1-2: #ENH-022 (AI-assisted summarization skills)
2. Day 3-5: #ENH-020 (Strategy detail page enhancements + Playbook tab)

**Deliverable**: AI-generated summaries, Playbook decision support

---

## Success Metrics

### Phase 2.7.1 Success Criteria
- ✅ All 3 Unified Browsers implemented (Macro, Asset, Strategies)
- ✅ Filter/search/sort working on all columns
- ✅ Inline linking workflows (no page navigation)
- ✅ Expandable rows show full details
- ✅ Keyboard shortcuts functional (/, ESC)
- ✅ Build passes with no TypeScript errors
- ✅ Consistent visual styling across all browsers

### Phase 2.7.2 Success Criteria
- ✅ Claims browser has 'Linked To' multi-select filter
- ✅ Research detail page metadata sections compact and side-by-side
- ✅ ClientHierarchyBreadcrumb bugs fixed (populate dropdowns)
- ✅ URL rename complete with redirects working

### Phase 2.7.3 Success Criteria
- ✅ Delete functionality works for Macro Theses and Asset Theses
- ✅ Detail pages use filtered Unified Browsers
- ✅ Underlying Market Data displays on Asset Thesis pages
- ✅ Section ordering improved (Summary, Market Data, Claims, Strategies, Notes)

### Phase 2.7.4 Success Criteria
- ✅ AI summarization skills functional (manual invocation)
- ✅ Strategy detail page has Playbook tab (if implemented)
- ✅ Performance/Triage/Blotter tabs filtered by strategy ID

---

## Risk Assessment

### Technical Risks

**Risk 1: UnifiedBrowser Component Size**
- **Severity**: Medium
- **Mitigation**: Each browser ~800-900 lines. Consider extracting shared logic into hooks (`useUnifiedBrowser.ts`)

**Risk 2: Query Performance**
- **Severity**: Medium
- **Concern**: Unified browsers need enriched data (counts, linked entities)
- **Mitigation**: Add database indexes, use Drizzle joins efficiently, implement pagination if needed

**Risk 3: ClientHierarchyBreadcrumb Bug Root Cause**
- **Severity**: High (blocks linking workflow)
- **Mitigation**: Prioritize in Sprint 2, debug thoroughly before other detail page work

### Scope Risks

**Risk 4: Feature Creep (Playbook Tab)**
- **Severity**: Medium
- **Concern**: #ENH-020 Playbook tab is complex and touches Decision Support (PRD Section 7)
- **Mitigation**: Make optional, defer to future phase if scope expands

**Risk 5: AI Summarization Reliability**
- **Severity**: Low
- **Concern**: AI-generated summaries may be inaccurate
- **Mitigation**: Make summaries editable, user reviews before saving

---

## Dependencies

### External Dependencies
- No new packages required ✅
- Uses existing Radix UI components (Badge, Button, Dialog, Select)
- Uses existing API routes (extend with new endpoints)

### Internal Dependencies
- **Phase 2.6 Complete** ✅ (UnifiedClaimsBrowser pattern established)
- **Drizzle Schema** ✅ (all tables exist)
- **Query Functions** ⚠️ (need extensions for filtered views)

### API Extensions Needed

**New Endpoints**:
```
GET  /api/theses?includeLinked=true              # Extended query
GET  /api/asset-theses/available-strategies       # For linking dialog
POST /api/asset-theses/link-strategies            # Bulk strategy linking
DELETE /api/theses/[id]                           # Delete with cascade
DELETE /api/asset-theses/[id]                     # Delete with cascade
```

**Query Function Extensions**:
```typescript
// src/db/queries/macroTheses.ts
getMacroThesesList({ includeLinkedCounts: boolean })

// src/db/queries/assetTheses.ts
getAssetThesesList({ macroThesisId?: string, includeLinkedCounts: boolean })

// src/db/queries/research.ts
getAllMainClaimsWithSources({ linkedThesisId?: string, linkedViewId?: string })

// src/db/queries/strategies.ts
getStrategiesForList({ status?: string[], includeClosedStrategies?: boolean })
```

---

## Testing Strategy

### Manual Testing Checklist

**Per Unified Browser**:
- [ ] Filters apply correctly
- [ ] Search finds results across all searchable fields
- [ ] Sort works on all columns (asc/desc toggle)
- [ ] Expand/collapse row shows full details
- [ ] Inline linking creates associations in database
- [ ] Keyboard shortcuts work (/, ESC)
- [ ] Empty state displays when no results

**Per Detail Page**:
- [ ] Delete confirmation prevents accidental deletion
- [ ] Filtered Unified Browsers show only related items
- [ ] Section ordering matches requirements
- [ ] Underlying market data displays (Asset Thesis)
- [ ] Summary section is editable

**Cross-Browser Testing**:
- [ ] Consistent styling across all Unified Browsers
- [ ] Badge colors match (Macro = purple, Asset = blue)
- [ ] Link navigation works (click Macro Thesis → goes to detail page)

### Automated Testing (Future)
- Unit tests for filter logic
- Integration tests for linking workflows
- E2E tests for keyboard shortcuts
- See #ENH-020 (Automated Tests) in FUTURE_ENHANCEMENTS.md

---

## Documentation Updates

**Files to Update**:
1. **docs/FUTURE_ENHANCEMENTS.md**
   - Move #ENH-013 through #ENH-023 to "Active/In Progress"
   - Update "Next Enhancement ID" to #ENH-024

2. **docs/implementation_progress.md**
   - Add Phase 2.7 section with subsections for each sprint
   - Update success metrics

3. **CLAUDE.md**
   - Add Unified Browser pattern to "Key Directories" → `/src/components`
   - Update navigation map with renamed `/macro-theses` path

4. **README.md**
   - Update feature list to mention Unified Browsers
   - Add screenshots (optional)

---

## Rollout Strategy

### Option A: Big Bang (All browsers at once)
**Pros**: Consistent UX immediately, easier to test patterns  
**Cons**: High risk, longer feedback loop  

### Option B: Incremental (One browser per week) ⭐ RECOMMENDED
**Pros**: Learn from each implementation, iterate on pattern  
**Cons**: Inconsistent UX during rollout  

**Recommended Approach**: Incremental (Option B)
- Week 1: Macro Thesis browser + UX polish
- Week 2: Asset Thesis browser + bug fixes
- Week 3: Strategies browser + detail pages
- Week 4: AI features (optional)

---

## Post-Implementation Review

**Questions to Answer**:
1. Did Unified Browser pattern improve UX? (measure time-to-action)
2. Did inline linking reduce page navigation? (analytics)
3. Are users discovering filters and search? (usage tracking)
4. Do AI summaries save time? (user feedback)
5. Should we apply this pattern to other pages? (Triage, Blotter)

**Next Steps After Phase 2.7**:
- **Phase 3**: Enhanced Analytics & Metrics (performance attribution)
- **Phase 4**: Workflow Triggers & Automation (first-class trigger entities)
- **Phase 1.7**: Hierarchy Tree Navigator (interactive visualization)

---

## Appendix: Component Reuse Strategy

### Shared Components to Extract

**FilterPanel Component** (~200 lines)
```tsx
// src/components/ui/FilterPanel.tsx
interface FilterPanelProps {
  filters: FilterConfig[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onClear: () => void;
}
```

**SortableTableHeader Component** (~50 lines)
```tsx
// src/components/ui/SortableTableHeader.tsx
interface SortableTableHeaderProps {
  label: string;
  column: string;
  currentSort: { column: string; direction: 'asc' | 'desc' };
  onSort: (column: string) => void;
}
```

**InlineLinkingCell Component** (~100 lines)
```tsx
// src/components/ui/InlineLinkingCell.tsx
interface InlineLinkingCellProps {
  linkedItems: Array<{ id: string; title: string; type: 'macro' | 'asset' }>;
  onLink: () => void;
  emptyState?: string;
}
```

### Reuse Benefit
- Reduce code duplication by ~40%
- Consistent behavior across all browsers
- Easier to maintain and update

---

## Related Documents

- **PRD v1.1**: Section 3 (Conceptual Model), Section 9 (Visualisation)
- **FUTURE_ENHANCEMENTS.md**: Enhancement registry and priorities
- **implementation_progress.md**: Phase tracking
- **20251230-enhancements.md**: Original requirements (this plan's source)
- **Phase 2.6 Completion Notes**: `docs/archive/phase_2_6_*.md` (pattern reference)

---

**Document Status**: ✅ Ready for Review  
**Next Action**: Review with user, confirm priorities, begin Sprint 1

