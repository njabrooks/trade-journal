# Phase 2.7: Visual Overview

## Enhancement Landscape

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PHASE 2.7: UNIFIED BROWSER PATTERN              │
│                    Extending Claims Browser Success                  │
└─────────────────────────────────────────────────────────────────────┘

                                ▼

┌─────────────────────────────────────────────────────────────────────┐
│  SPRINT 1: CORE UNIFIED BROWSERS (Week 1) - 5 days                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  #ENH-013: UnifiedMacroThesisBrowser.tsx                            │
│  ├─ Filters: Type, Time Horizon, Confidence, Status                 │
│  ├─ Search: Title, sectors, description                             │
│  ├─ Inline Linking: Asset Theses → LinkToViewsDialog               │
│  └─ Expandable: Full details, claims, notes                         │
│                                                                       │
│  #ENH-014: UnifiedAssetThesisBrowser.tsx                            │
│  ├─ Filters: Time Horizon, Confidence, Status, Underlying, Macro    │
│  ├─ Search: Title, ticker, description                              │
│  ├─ Inline Linking: Macro Theses + Strategies → dialogs            │
│  └─ Expandable: Description, market data, claims                    │
│                                                                       │
│  #ENH-015: UnifiedStrategiesBrowser.tsx                             │
│  ├─ Filters: Status, Account, Asset Thesis, Macro, State Code      │
│  ├─ Search: Strategy label, key, underlying                         │
│  ├─ Inline Linking: Asset Theses → LinkToViewDialog                │
│  └─ Expandable: Positions, actions, metrics                         │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

                                ▼

┌─────────────────────────────────────────────────────────────────────┐
│  SPRINT 2: UX POLISH & BUG FIXES (Week 2) - 3 days                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  #ENH-016: Research Detail Page Compact Layout                      │
│  └─ Combine Metadata + Workflow Status side-by-side                │
│                                                                       │
│  #ENH-017: Claims Browser 'Linked To' Filter                        │
│  └─ Multi-select: Unlinked, Macro Theses, Asset Theses             │
│                                                                       │
│  #ENH-023: Fix ClientHierarchyBreadcrumb Bugs                       │
│  ├─ Asset Thesis page: Populate Macro Thesis dropdown              │
│  └─ Strategy page: Populate Asset Thesis dropdown                   │
│                                                                       │
│  #ENH-021: Rename /theses → /macro-theses                           │
│  └─ URL consistency + backward compatibility redirects              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

                                ▼

┌─────────────────────────────────────────────────────────────────────┐
│  SPRINT 3: DETAIL PAGE ENHANCEMENTS (Week 3) - 4 days              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  #ENH-018: Macro Thesis Detail Page                                 │
│  ├─ Delete functionality with cascade handling                      │
│  ├─ Compact Overview section (2-column grid)                        │
│  ├─ Rename "Description" → "Summary"                                │
│  ├─ Main Claims → UnifiedClaimsBrowser (filtered)                   │
│  ├─ Asset Theses → UnifiedAssetThesisBrowser (filtered)            │
│  ├─ Strategies → UnifiedStrategiesBrowser (filtered)               │
│  └─ Move Notes to bottom                                            │
│                                                                       │
│  #ENH-019: Asset Thesis Detail Page                                 │
│  ├─ Delete functionality with cascade handling                      │
│  ├─ Compact Overview section                                        │
│  ├─ Rename "Description" → "Summary"                                │
│  ├─ Fix Underlying Market Data display                              │
│  ├─ Main Claims → UnifiedClaimsBrowser (filtered)                   │
│  ├─ Add Linked Macro Theses → UnifiedMacroThesisBrowser            │
│  └─ Strategies → UnifiedStrategiesBrowser (filtered)               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

                                ▼

┌─────────────────────────────────────────────────────────────────────┐
│  SPRINT 4: ADVANCED FEATURES (Week 4 - Optional) - 4-5 days        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  #ENH-022: AI-Assisted Summary Generation                           │
│  ├─ Claude Skill: /summarize-thesis <thesis-id>                    │
│  ├─ Claude Skill: /summarize-view <view-id>                        │
│  ├─ Query linked claims via psql                                    │
│  ├─ AI synthesizes 2-3 paragraph summary                            │
│  └─ User reviews and edits, saves to database                       │
│                                                                       │
│  #ENH-020-playbook: Strategy Detail Page Playbook Tab              │
│  ├─ Options payoff charts (manual data entry)                       │
│  ├─ Technical indicators                                            │
│  ├─ AI evaluation: "Should I roll? Close? Add?"                     │
│  └─ Decision context capture                                        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Hierarchy Flow After Phase 2.7

```
┌──────────────────────────────────────────────────────────────────────┐
│                          USER JOURNEY                                 │
└──────────────────────────────────────────────────────────────────────┘

                Research Workflow (Phase 2.6 ✅)
                        │
                        ▼
            ┌───────────────────────┐
            │  /research/claims     │  ← UnifiedClaimsBrowser ✅
            │  (All main claims)    │     Filter by: Status, Confidence, Category
            └───────────────────────┘     NEW: Linked To filter (#ENH-017)
                        │
                        │ Confirm + Link
                        ▼
            ┌───────────────────────────────────────────┐
            │                                           │
            ▼                                           ▼
┌─────────────────────────┐              ┌─────────────────────────┐
│  /macro-theses          │              │  /asset-theses          │
│  (All macro theses)     │              │  (All asset theses)     │
│                         │              │                         │
│  UnifiedMacroThesis     │◄─────────────┤  UnifiedAssetThesis     │
│  Browser (#ENH-013)     │   Link       │  Browser (#ENH-014)     │
│                         │              │                         │
│  • Filter by Type       │              │  • Filter by Underlying │
│  • Filter by Horizon    │              │  • Filter by Macro      │
│  • Search sectors       │              │  • Search ticker        │
│  • Inline link to       │              │  • Inline link to       │
│    Asset Theses         │──────────────┤    Macro Theses         │
│  • Expandable details   │              │  • Expandable details   │
└─────────────────────────┘              └─────────────────────────┘
            │                                           │
            │                                           │
            └────────────────┬──────────────────────────┘
                             │ Link to Strategies
                             ▼
                 ┌───────────────────────┐
                 │  /strategies          │
                 │  (All strategies)     │
                 │                       │
                 │  UnifiedStrategies    │
                 │  Browser (#ENH-015)   │
                 │                       │
                 │  • Filter by Status   │
                 │  • Filter by Account  │
                 │  • Filter by Thesis   │
                 │  • Filter by View     │
                 │  • Show/Hide Closed   │
                 │  • Inline link to     │
                 │    Asset Theses       │
                 │  • Expandable details │
                 └───────────────────────┘
                             │
                             │ Click to view
                             ▼
                 ┌───────────────────────┐
                 │  /strategies/[id]     │
                 │                       │
                 │  • Performance tab    │
                 │  • Triage tab         │
                 │  • Blotter tab        │
                 │  • Playbook tab 🆕    │
                 │    (#ENH-020-playbook)│
                 └───────────────────────┘
```

---

## Component Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     UNIFIED BROWSER PATTERN                         │
│                  (Shared Pattern, Component Reuse)                  │
└────────────────────────────────────────────────────────────────────┘

Base Pattern: UnifiedClaimsBrowser.tsx (Phase 2.6 ✅)
├─ ~463 lines
├─ Pattern established: Filter, Search, Sort, Expand, Inline Actions
└─ Keyboard shortcuts: /, ESC

                                ▼

┌──────────────────────────────────────────────────────────────────┐
│                      SHARED COMPONENTS                            │
│                   (Extract for Reuse)                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  FilterPanel.tsx (~200 lines)                                    │
│  ├─ Generic filter configuration                                 │
│  ├─ Multi-select dropdowns                                       │
│  └─ Clear filters button                                         │
│                                                                    │
│  SortableTableHeader.tsx (~50 lines)                             │
│  ├─ Click to sort                                                │
│  ├─ Visual indicators (arrows)                                   │
│  └─ Asc/desc toggle                                              │
│                                                                    │
│  InlineLinkingCell.tsx (~100 lines)                              │
│  ├─ Display linked items with badges                             │
│  ├─ "+" button to add links                                      │
│  └─ Opens linking dialog                                         │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘

                                ▼

┌──────────────────────────────────────────────────────────────────┐
│                   SPECIALIZED BROWSERS                            │
│               (Reuse Shared Components)                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  UnifiedMacroThesisBrowser.tsx (~800 lines) #ENH-013            │
│  ├─ Uses: FilterPanel, SortableTableHeader, InlineLinkingCell   │
│  ├─ Thesis-specific columns                                      │
│  └─ Links to UnifiedAssetThesisBrowser                          │
│                                                                    │
│  UnifiedAssetThesisBrowser.tsx (~850 lines) #ENH-014            │
│  ├─ Uses: FilterPanel, SortableTableHeader, InlineLinkingCell   │
│  ├─ View-specific columns + market data                         │
│  └─ Links to UnifiedMacroThesisBrowser + UnifiedStrategies      │
│                                                                    │
│  UnifiedStrategiesBrowser.tsx (~900 lines) #ENH-015             │
│  ├─ Uses: FilterPanel, SortableTableHeader, InlineLinkingCell   │
│  ├─ Strategy-specific columns + metrics                         │
│  └─ Links to UnifiedAssetThesisBrowser                          │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘

                                ▼

┌──────────────────────────────────────────────────────────────────┐
│                      LINKING DIALOGS                              │
│              (Reuse Existing from Phase 2.6)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  LinkToThesisDialog.tsx (Phase 2.6.6 ✅)                         │
│  ├─ Multi-select macro theses                                    │
│  ├─ Search and filter                                            │
│  └─ Used by Asset Thesis Browser                                │
│                                                                    │
│  LinkToViewDialog.tsx (Phase 2.6.6 ✅)                           │
│  ├─ Multi-select asset theses                                    │
│  ├─ Search and filter                                            │
│  └─ Used by Strategy Browser                                    │
│                                                                    │
│  NEW: LinkToViewsDialog.tsx (plural)                             │
│  └─ Used by Macro Thesis Browser to link multiple views         │
│                                                                    │
│  NEW: LinkToStrategiesDialog.tsx                                 │
│  └─ Used by Asset Thesis Browser to link multiple strategies    │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      USER INTERACTIONS                            │
└──────────────────────────────────────────────────────────────────┘

1. User visits /macro-theses
        │
        ▼
2. Server-side fetch: getMacroThesesList({ includeLinkedCounts: true })
        │
        ▼
3. Return: [ { thesis, assetThesesCount, strategiesCount } ]
        │
        ▼
4. Render: UnifiedMacroThesisBrowser (client component)
        │
        │  User actions:
        │  ├─ Filter by type → Client-side filter
        │  ├─ Search text → Client-side search
        │  ├─ Sort column → Client-side sort
        │  └─ Click "Asset Theses" column → Open LinkToViewsDialog
        │              │
        │              ▼
        │      5. Fetch: GET /api/asset-theses?macroThesisId=<id>
        │              │
        │              ▼
        │      6. User selects 3 asset theses → Link
        │              │
        │              ▼
        │      7. POST /api/asset-theses/link-macro-thesis
        │         Body: { assetThesisIds: [...], macroThesisId: '...' }
        │              │
        │              ▼
        │      8. Update asset_theses.macro_thesis_id (bulk update)
        │              │
        │              ▼
        │      9. router.refresh() → Re-fetch page data
        │              │
        │              ▼
        │      10. Updated counts displayed immediately
        │
        ▼
11. User clicks thesis title → Navigate to /macro-theses/[id]
        │
        ▼
12. Detail page with filtered UnifiedClaimsBrowser + UnifiedAssetThesisBrowser
```

---

## Progressive Enhancement Strategy

```
Phase 2.6 (Complete ✅)
    └─ UnifiedClaimsBrowser.tsx
       └─ Pattern established
          └─ Filter, Search, Sort, Expand, Inline Actions

                    ▼

Phase 2.7 (Planned)
    ├─ Sprint 1: Replicate pattern to 3 new browsers
    │   └─ Proves pattern is reusable
    ├─ Sprint 2: Extract shared components
    │   └─ Reduces code duplication by 40%
    ├─ Sprint 3: Apply to detail pages
    │   └─ Consistent UX across all pages
    └─ Sprint 4: Add AI features
        └─ Summarization, decision support

                    ▼

Phase 1.7 (Future)
    └─ Hierarchy Tree Navigator
       └─ Interactive visualization
          └─ Uses same data loading patterns
             └─ Unified Browsers become "detail views"

                    ▼

Phase 4 (Future)
    └─ Workflow Triggers & Automation
       └─ Triggers create triage records
          └─ Unified Browsers show "Triage Count" column
             └─ Click to filter triage page

                    ▼

Phase 6 (Future)
    └─ Time-Based Memory System
       └─ Event logging captures context
          └─ Unified Browsers show "Last Event" timeline
             └─ AI synthesizes patterns across time
```

---

## Risk Mitigation

```
┌──────────────────────────────────────────────────────────────────┐
│                         RISKS                                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Risk 1: Component Size (~800-900 lines each)                   │
│  ├─ Impact: Hard to maintain                                     │
│  └─ Mitigation: Extract shared components (Sprint 2)            │
│                                                                    │
│  Risk 2: Query Performance (enriched data)                       │
│  ├─ Impact: Slow page loads                                      │
│  └─ Mitigation: Add database indexes, implement pagination      │
│                                                                    │
│  Risk 3: ClientHierarchyBreadcrumb Bug (unknown root cause)     │
│  ├─ Impact: Blocks linking workflow                              │
│  └─ Mitigation: Prioritize in Sprint 2, debug thoroughly        │
│                                                                    │
│  Risk 4: Playbook Tab Scope Creep                               │
│  ├─ Impact: Sprint 4 extends indefinitely                        │
│  └─ Mitigation: Make optional, define strict MVP scope          │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Success Visualization

```
BEFORE Phase 2.7:
    /theses → Simple table, no filters, no inline linking
    /asset-theses → Simple table, limited filters
    /strategies → Basic table with FilterBar component

                    ▼ Phase 2.7 ▼

AFTER Phase 2.7:
    /macro-theses → UnifiedMacroThesisBrowser
        ├─ 5 filters, full-text search
        ├─ Sortable columns
        ├─ Expandable rows
        └─ Inline linking to Asset Theses

    /asset-theses → UnifiedAssetThesisBrowser
        ├─ 7 filters, full-text search
        ├─ Sortable columns
        ├─ Expandable rows
        └─ Inline linking to Macro Theses + Strategies

    /strategies → UnifiedStrategiesBrowser
        ├─ 6 filters, Show/Hide Closed toggle
        ├─ Sortable columns
        ├─ Expandable rows
        └─ Inline linking to Asset Theses

TIME TO ACTION:
    Find specific thesis:
        Before: Scan entire table manually
        After: Filter + search → instant results

    Link thesis to view:
        Before: Navigate to detail page → Edit form → Save → Back
        After: Click cell → Select → Done (3 clicks, no navigation)

    Review full details:
        Before: Navigate to detail page
        After: Click expand → See inline (no navigation)

COGNITIVE LOAD:
    Before: Remember where to navigate, track current page
    After: Everything accessible inline, visual hierarchy clear
```

---

## Next Steps

1. **Review this plan** - Does it align with your vision?
2. **Confirm priorities** - Sprints 1-2 are high priority, 3-4 are optional?
3. **Start Sprint 1** - Begin with #ENH-013 (Unified Macro Thesis Browser)
4. **Iterate** - Refine pattern based on first implementation
5. **Scale** - Apply learnings to remaining browsers

**Ready to begin Sprint 1, Day 1?**

