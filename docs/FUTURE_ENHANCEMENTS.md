# Future Enhancements

**Purpose**: Single source of truth for planned enhancements with PRD traceability.

**Last Updated**: 2026-01-16 (Audit - moved ENH-035/036/037/042F to completed)

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

### #ENH-049: Unified Entity Detail UX/UI
**Priority**: High | **Effort**: 1-2 weeks | **Phase**: 5+
**PRD**: Section 3 (Conceptual Model - Hierarchy)
**Status**: PLANNED

Align UX/UI patterns across Macro Thesis, Asset Thesis, and Strategy detail pages for consistent navigation, information architecture, and visual design.

**Current State Analysis:**

| Aspect | Macro Thesis | Asset Thesis | Strategy |
|--------|--------------|--------------|----------|
| Layout | Linear sections | 10-item accordion | 3-tab pages |
| Navigation | Breadcrumb only | Breadcrumb + modal | Breadcrumb + tabs |
| State | Server-only | Heavy client state | Per-tab state |
| Visualization | Text/badges | Text/badges | Charts + tables |
| Actions | 2 (edit, synthesize) | 6+ (scattered) | Many per tab |

**Problems Identified:**
1. **Inconsistent navigation patterns** - Users must learn 3 different mental models
2. **Asset Thesis accordion overload** - 10 sections is too many to scan
3. **Action discoverability** - Edit/synthesize/link actions placed inconsistently
4. **Visual hierarchy unclear** - No clear primary/secondary content distinction
5. **No performance data on theses** - Strategies have charts, theses don't

**Proposed Unified Design Pattern:**

All three entity types adopt a **two-zone layout with consistent tabs**:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Breadcrumb: Macro Thesis → Asset Thesis → Strategy]           │
│  [Status Badge] [Title]                        [Actions ▼]      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐ ┌────────────────┐ │
│  │  [Overview] [Evidence] [Execution]       │ │   SIDEBAR      │ │
│  ├─────────────────────────────────────────┤ │                │ │
│  │                                          │ │  Quick Stats   │ │
│  │     TAB CONTENT AREA                     │ │  - Status      │ │
│  │     (varies by tab)                      │ │  - Confidence  │ │
│  │                                          │ │  - Direction   │ │
│  │                                          │ │  - Horizon     │ │
│  │                                          │ │                │ │
│  │                                          │ │  Related       │ │
│  │                                          │ │  - 3 Asset ▶   │ │
│  │                                          │ │  - 2 Strat ▶   │ │
│  │                                          │ │                │ │
│  └─────────────────────────────────────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Unified Tab Structure:**

| Tab | Macro Thesis | Asset Thesis | Strategy |
|-----|--------------|--------------|----------|
| **Overview** | Core argument, description | Core argument, market data | Performance metrics, charts |
| **Evidence** | Claims, signals | Claims, signals, news | Triage alerts, signals |
| **Execution** | Linked asset theses | Linked strategies | Positions, trades |

**Key Design Principles:**
1. **Persistent sidebar** - Always-visible metadata + related entity links
2. **3 tabs max** - Clear information hierarchy, lazy loading per tab
3. **Actions dropdown** - Consolidated edit/synthesize/link actions in header
4. **Consistent visual language** - Same card styles, badges, spacing
5. **Progressive disclosure** - Summary in sidebar, detail in tabs

**Implementation Plan:**

---

#### Phase 1: Foundation Components (#ENH-049A)

Create shared layout primitives that all three entity types will use.

**1.1 Extract InfoRow to shared UI**
File: `src/components/ui/info-row.tsx`
```tsx
// Extract from StrategySidebar - simple label/value display
interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}
```

**1.2 Create EntityTabs component**
File: `src/components/layout/EntityTabs.tsx`
- URL-based tab navigation (same pattern as StrategyTabs)
- Props: `tabs: { label: string; href: string }[]`, `basePath: string`
- Uses `usePathname()` to detect active tab
- Reusable across all entity types

**1.3 Create EntitySidebar component**
File: `src/components/layout/EntitySidebar.tsx`
- Generalized from StrategySidebar
- Props: `metadata: InfoRowProps[]`, `relatedEntities: RelatedEntity[]`, `actions?: ReactNode`
- Sticky positioning: `sticky top-6 h-fit w-[28rem]`
- Accordion sections: "Quick Stats", "Related Entities"

**1.4 Create EntityDetailLayout component**
File: `src/components/layout/EntityDetailLayout.tsx`
- Two-column responsive grid: `grid-cols-1 lg:grid-cols-[1fr_28rem]`
- Slots for: tabs, main content, sidebar
- Wraps DashboardShell with consistent structure

**1.5 Create EntityActions dropdown**
File: `src/components/layout/EntityActions.tsx`
- DropdownMenu with Edit, Synthesize, Link actions
- Standardized action placement in header area

**Files Created:**
- `src/components/ui/info-row.tsx`
- `src/components/layout/EntityTabs.tsx`
- `src/components/layout/EntitySidebar.tsx`
- `src/components/layout/EntityDetailLayout.tsx`
- `src/components/layout/EntityActions.tsx`

---

#### Phase 2: Migrate Macro Thesis (#ENH-049B)

Convert from single-page sections to tab-based layout with sidebar.

**2.1 Create tab page structure**
```
src/app/macro-theses/[id]/
├── page.tsx              → redirect to /overview
├── overview/page.tsx     → Core argument, description, notes
├── evidence/page.tsx     → Claims browser, signals section
└── execution/page.tsx    → Linked asset theses, linked strategies
```

**2.2 Create MacroThesisSidebar**
File: `src/components/theses/MacroThesisSidebar.tsx`
- Quick Stats: Type, Direction, Time Horizon, Confidence, Status
- Related: Count of linked asset theses, count of linked strategies
- Click to scroll/navigate to Execution tab

**2.3 Update page components**
- Each tab fetches only its required data (lazy loading)
- Share thesis metadata via layout or refetch (small query)

**Tab Content Mapping:**
| Current Section | New Location |
|-----------------|--------------|
| Overview metadata | Sidebar (always visible) |
| Core Argument | Overview tab |
| Notes | Overview tab (bottom) |
| Signals | Evidence tab |
| Main Claims | Evidence tab |
| Linked Asset Theses | Execution tab |
| Linked Strategies | Execution tab |

**Files Modified:**
- `src/app/macro-theses/[id]/page.tsx` → redirect only
- **New:** `src/app/macro-theses/[id]/overview/page.tsx`
- **New:** `src/app/macro-theses/[id]/evidence/page.tsx`
- **New:** `src/app/macro-theses/[id]/execution/page.tsx`
- **New:** `src/components/theses/MacroThesisSidebar.tsx`

---

#### Phase 3: Migrate Asset Thesis (#ENH-049C)

Collapse 10 accordion sections into 3 focused tabs.

**3.1 Create tab page structure**
```
src/app/asset-theses/[id]/
├── page.tsx              → redirect to /overview
├── overview/page.tsx     → Core argument, market data, notes
├── evidence/page.tsx     → Claims, signals, news archive, triage alerts
└── execution/page.tsx    → Linked strategies (with mini performance cards)
```

**3.2 Create AssetThesisSidebar**
File: `src/components/asset-theses/AssetThesisSidebar.tsx`
- Quick Stats: Underlying, Direction, Time Horizon, Confidence, Status, Target Price
- Market Data: Spot, IV30 (if underlying exists)
- Related: Count of linked macro theses, count of linked strategies

**3.3 Reorganize content**
| Current Accordion | New Location |
|-------------------|--------------|
| Overview | Sidebar |
| Triage Alerts | Evidence tab (top, highlighted if urgent) |
| Core Argument | Overview tab |
| Signals | Evidence tab |
| News Archive | Evidence tab |
| Underlying Market Data | Sidebar + Overview tab (detailed) |
| Main Claims | Evidence tab |
| Linked Macro Theses | Sidebar (compact) + Execution tab (detailed) |
| Linked Strategies | Execution tab |
| Notes | Overview tab (bottom) |

**3.4 Deprecate accordion component**
- `AssetThesisDetailSections.tsx` → archive or delete after migration
- `AssetThesisDetailClient.tsx` → simplify to just breadcrumb handling

**Files Modified:**
- `src/app/asset-theses/[id]/page.tsx` → redirect only
- **New:** `src/app/asset-theses/[id]/overview/page.tsx`
- **New:** `src/app/asset-theses/[id]/evidence/page.tsx`
- **New:** `src/app/asset-theses/[id]/execution/page.tsx`
- **New:** `src/components/asset-theses/AssetThesisSidebar.tsx`
- **Deprecate:** `src/components/asset-theses/AssetThesisDetailSections.tsx`

---

#### Phase 4: Align Strategy (#ENH-049D)

Strategy already has tabs. Add consistent sidebar and rename tabs to match pattern.

**4.1 Rename tabs for consistency**
| Current Tab | New Tab Name |
|-------------|--------------|
| Performance | Overview |
| Triage | Evidence |
| Signals | (merge into Evidence) |

**4.2 Restructure to 3 tabs**
```
src/app/strategies/[strategyId]/
├── page.tsx              → redirect to /overview
├── overview/page.tsx     → Performance metrics, charts, summary
├── evidence/page.tsx     → Triage alerts + signals (combined)
└── execution/page.tsx    → Open positions, recent trades
```

**4.3 Standardize sidebar**
- Current: Only on Triage tab, shows strategy info
- New: On all tabs, consistent with other entities
- Move "Strategy Info" accordion content to EntitySidebar

**Tab Content Mapping:**
| Current | New Location |
|---------|--------------|
| Performance metrics | Overview tab |
| Charts | Overview tab |
| Triage table | Evidence tab |
| Signals section | Evidence tab (below triage) |
| Strategy Info sidebar | Sidebar (all tabs) |
| Positions table | Execution tab |
| Trades table | Execution tab |

**Files Modified:**
- `src/app/strategies/[strategyId]/performance/page.tsx` → rename to overview
- `src/app/strategies/[strategyId]/triage/page.tsx` → rename to evidence, add signals
- `src/app/strategies/[strategyId]/signals/page.tsx` → merge into evidence
- **New:** `src/app/strategies/[strategyId]/execution/page.tsx`
- `src/components/strategies/StrategySidebar.tsx` → use EntitySidebar

---

#### Phase 5: Visual Polish (#ENH-049E)

**5.1 Card styling upgrade**
```css
/* Current */
bg-white rounded-lg border border-slate-200

/* New - subtle elevation */
bg-white rounded-lg border border-slate-200 shadow-sm
```

**5.2 Status badges in header**
- Move status badge next to title in DashboardShell
- Remove from metadata grids (redundant)

**5.3 Empty state improvements**
- Create `EmptySection` component with icon, message, CTA button
- Use consistently across all browsers/lists

**5.4 Hover states**
- Add `hover:bg-slate-50` to related entity links
- Add `hover:shadow-md transition-shadow` to clickable cards

**Files Modified:**
- `src/components/layout/DashboardShell.tsx` - add status badge slot
- **New:** `src/components/ui/empty-section.tsx`
- Various section components - add shadow-sm, hover states

---

#### Phase 6: Performance Visualization for Theses (#ENH-049F)

**6.1 Mini strategy performance cards**
File: `src/components/strategies/StrategyPerformanceCard.tsx`
- Compact card showing: Label, Unrealized PnL, Status
- Sparkline showing 30-day PnL trend
- Used in thesis Execution tabs

**6.2 Aggregate thesis performance**
- On Asset Thesis Execution tab: Sum of linked strategy performance
- On Macro Thesis Execution tab: Rollup through asset theses

**Files Created:**
- `src/components/strategies/StrategyPerformanceCard.tsx`
- `src/components/strategies/StrategyPerformanceList.tsx`

---

**Implementation Order:**

1. **Phase 1** (Foundation) - Create shared components first
2. **Phase 2** (Macro Thesis) - Simplest entity, proves the pattern
3. **Phase 3** (Asset Thesis) - Most complex migration (10 → 3)
4. **Phase 4** (Strategy) - Align existing tabs, add sidebar
5. **Phase 5** (Visual Polish) - Apply across all entities
6. **Phase 6** (Charts) - Enhancement, can be deferred

**Estimated Effort per Phase:**
- Phase 1: 1 day
- Phase 2: 1 day
- Phase 3: 2 days
- Phase 4: 1 day
- Phase 5: 0.5 day
- Phase 6: 1 day (optional)

**Total: 5-7 days**

---

### #ENH-038: Automated Monitoring System
**Priority**: High | **Effort**: 1-2 days | **Phase**: 3.2
**PRD**: Section 6.1 (Triggers - Automated Monitoring)
**Dependencies**: #ENH-037 (COMPLETE)
**Status**: PARTIAL - Script exists, missing GitHub Actions integration

Core monitoring script exists (`scripts/daily-signal-monitoring.ts`) that checks price/IV and FRED thresholds against signals. Missing GitHub Actions cron job to run automatically.

**Completed**:
- `signal_data_tracking` table for tracking data fetches
- `daily-signal-monitoring.ts` script (reads signals.explicit_details, checks thresholds)
- FRED API integration for economic data thresholds
- Price/IV monitoring from `underlyings_iv_history`

**Remaining**:
- GitHub Actions workflow for scheduled execution
- Web search/RSS feed integration (deferred to #ENH-039)

---

### #ENH-020: Automated Tests
**Priority**: High | **Effort**: 2-3 weeks | **Phase**: 5+
**PRD**: N/A (Infrastructure)

Unit tests for service functions, integration tests for ingestion flows, API endpoint tests.

---

### #ENH-014: Complete Manual Linking UI
**Priority**: High | **Effort**: 2-3 days | **Phase**: 5+ (Quick Win)
**PRD**: Section 4 (Data Ingestion)
**Status**: PARTIAL - UI shell exists, implementation incomplete

Add endpoints to list unlinked positions/trades. Display in table with bulk-select and filters.

**Current State**:
- UI page exists at `/admin/strategies/[id]/link/page.tsx`
- `loadUnlinkedItems()` function is empty - returns no data
- Missing: API endpoints to query unlinked positions/trades
- Missing: Actual linking logic implementation

---

## Planned - Medium Priority

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
**Priority**: Medium | **Effort**: 1-2 days | **Phase**: 3.2D (Quick Win)
**Dependencies**: #ENH-042B
**Status**: PARTIAL - Tables exist, needs UI and testing

Schema and integration exist but needs UI work:

**Completed**:
- `fred_series_metadata` table in schema
- `thesis_fred_indicators` table linking theses to FRED series
- FRED threshold checking in `daily-signal-monitoring.ts`

**Remaining**:
- UI for configuring FRED indicators on thesis detail pages
- Testing the end-to-end flow

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

**Next Enhancement ID**: #ENH-050

### ID Allocation

| Range | Phase/Area |
|-------|------------|
| #ENH-001 - #ENH-012 | Legacy (Phase 1-2) |
| #ENH-013 - #ENH-025 | Phase 2.6-2.7 |
| #ENH-035 - #ENH-039 | Phase 3.1-3.3 |
| #ENH-040 - #ENH-046 | Phase 3.2 sub-phases |
| #ENH-047 - #ENH-048 | Status field technical debt |
| #ENH-049 | Unified Entity Detail UX/UI |
| #ENH-050+ | Available |

**Format**: `#ENH-XXX` or `#ENH-XXX-name` for variants

---

## Completed Enhancements

For detailed specifications of completed work, see [docs/archive/completed-enhancements-2025-2026.md](archive/completed-enhancements-2025-2026.md).

### Summary

| Phase | Date | Key Deliverables |
|-------|------|------------------|
| #ENH-035 | 2026-01-16 | Thesis articulation generation - `/synthesize-thesis` skill, versioned articulations |
| #ENH-036 | 2026-01-16 | Signal extraction from articulation - signals table, explicit/judgment classification |
| #ENH-037 | 2026-01-16 | Manual status tracking & audit trail - signal_status_history, StatusTimeline UI |
| #ENH-042F | 2026-01-16 | IV30 & Price data integration - monitoring via daily-signal-monitoring.ts |
| #ENH-048 | 2026-01-16 | Entity status standardization - unified lifecycle (draft, active, complete, rejected) |
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
| #ENH-020-playbook | Strategy Playbook Tab | Playbook removed, replaced by Signals system |

---

## Related Documents

- **PRD v1.1**: `docs/PRD_v1.1.md` - Product vision (locked)
- **Current State**: `docs/CURRENT_STATE.md` - Actual implementation state
- **Cleanup Plan**: `docs/CLEANUP_PLAN.md` - Technical debt tracking
- **Entity Status Guide**: `docs/features/entity-status-standardization.md` - Universal status model for #ENH-048
- **Completed Details**: `docs/archive/completed-enhancements-2025-2026.md`
