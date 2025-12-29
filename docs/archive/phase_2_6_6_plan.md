# Phase 2.6.6: Enhanced Hierarchy Linking UX - Implementation Plan

**Status**: 🚧 In Progress
**Start Date**: 2025-12-29
**Estimated Effort**: 1 week
**Dependencies**: Phase 2.6.5 ✅ (Claim Conversion Complete)

---

## Overview

Phase 2.6.6 enhances the hierarchy linking user experience to ensure complete coverage of the decision hierarchy:
- Position → Strategy (required)
- Strategy → Asset Thesis (required)
- Asset Thesis → Macro Thesis(es) (required, can be multiple)
- Asset Thesiss and Macro Theses → Main Claims (evidence linking)

---

## Problem Statement

**Current State**:
- Linking UI exists but provides NO visual indicators for missing required links
- Users can create Asset Thesiss without Macro Theses
- Users can create Strategies without Asset Thesiss
- No validation warnings for incomplete hierarchies
- No inline linking workflows at obvious entry points

**Impact**:
- Incomplete hierarchy coverage
- Difficult to perform top-down analysis (thesis → view → strategy → position)
- No proactive guidance for users to maintain hierarchy integrity

---

## Current Linking Landscape (Discovery Findings)

### 1. Asset Thesis Detail Page (`/asset-theses/[id]`)
**Current Features**:
- ✅ Shows Macro Thesis link (line 67-77)
- ✅ Shows linked strategies table (lines 287-332)
- ✅ Shows linked main claims (lines 214-284)
- ✅ Has "Add Main Claim" button for evidence linking

**Missing**:
- ⚠️ NO visual indicator when Macro Thesis is missing (REQUIRED link!)
- ⚠️ NO inline "Link to Macro Thesis" button/workflow
- ⚠️ NO validation warnings

**Code Location**: `/src/app/asset-theses/[id]/page.tsx`

---

### 2. Macro Thesis Detail Page (`/theses/[id]`)
**Current Features**:
- ✅ Shows linked Asset Thesiss list (lines 183-215)
- ✅ Shows linked Strategies table (lines 217-262)
- ✅ Shows linked Main Claims (lines 112-181)
- ✅ Has "Add Main Claim" button

**Status**: ✅ Complete (no required upward links)

**Code Location**: `/src/app/theses/[id]/page.tsx`

---

### 3. Strategy Triage Page (`/strategies/[id]/triage`)
**Current Features**:
- ✅ Shows hierarchy breadcrumb "Linked to" (lines 117-142)
- ✅ Displays Macro Thesis and Asset Thesis links when they exist
- ✅ Nice visual flow: "Macro Thesis → Asset Thesis"

**Missing**:
- ⚠️ NO visual warning when Asset Thesis is missing (REQUIRED!)
- ⚠️ NO visual warning when Macro Thesis is missing (optional but recommended)
- ⚠️ Breadcrumb only shows IF links exist (line 117 condition)
- ⚠️ NO inline "Link Strategy to Asset Thesis" workflow

**Code Location**: `/src/app/strategies/[strategyId]/triage/page.tsx`

---

### 4. Position Pages
**Status**: ⏳ Need to investigate
- Where do positions display?
- Do positions link to strategies?
- Are there missing link indicators?

---

## Implementation Plan

### Part 1: Visual Indicators for Missing Links

**Goal**: Add clear visual warnings when required links are missing

#### 1.1: Asset Thesis Detail Page - Missing Macro Thesis Warning
**Component**: `/src/app/asset-theses/[id]/page.tsx`

**Current** (lines 67-77):
```tsx
<div>
  <dt className="text-sm font-medium text-slate-500">Macro Thesis</dt>
  <dd className="mt-1 text-sm text-slate-900">
    {view.macroThesis ? (
      <Link href={`/theses/${view.macroThesis.id}`} ...>
        {view.macroThesis.title}
      </Link>
    ) : '—'}
  </dd>
</div>
```

**Enhanced**:
```tsx
<div>
  <dt className="text-sm font-medium text-slate-500">Macro Thesis</dt>
  <dd className="mt-1">
    {view.macroThesis ? (
      <Link href={`/theses/${view.macroThesis.id}`} className="text-blue-600 hover:text-blue-800">
        {view.macroThesis.title}
      </Link>
    ) : (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded">
          ⚠️ Required: Link to Macro Thesis
        </span>
        <LinkToThesisButton viewId={view.id} currentThesisId={null} />
      </div>
    )}
  </dd>
</div>
```

**Components to Create**:
- `<LinkToThesisButton>` - Opens dialog to search and link macro thesis
- Dialog with search/filter for macro theses
- API endpoint: `PATCH /api/asset-theses/[id]` (already exists, just needs to update `macro_thesis_id`)

#### 1.2: Strategy Pages - Missing Asset Thesis/Thesis Warnings
**Component**: `/src/app/strategies/[strategyId]/triage/page.tsx`

**Current** (lines 116-142):
```tsx
{(strategy.macroThesisId || strategy.assetThesisId) && (
  <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-500">Linked to:</span>
      {/* Shows links if they exist */}
    </div>
  </div>
)}
```

**Enhanced**:
```tsx
<div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
  <div className="flex items-center gap-2 text-sm text-slate-600">
    <span className="font-medium text-slate-500">Linked to:</span>

    {/* Macro Thesis (optional but recommended) */}
    {strategy.macroThesisId ? (
      <Link href={`/theses/${strategy.macroThesisId}`} className="text-blue-600 hover:text-blue-800 hover:underline">
        {strategy.macroThesisTitle || 'Macro Thesis'}
      </Link>
    ) : (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-600 rounded">
        No Macro Thesis
      </span>
    )}

    <span className="text-slate-400">→</span>

    {/* Asset Thesis (REQUIRED) */}
    {strategy.assetThesisId ? (
      <Link href={`/asset-theses/${strategy.assetThesisId}`} className="text-blue-600 hover:text-blue-800 hover:underline">
        {strategy.assetViewTitle || 'Asset Thesis'}
      </Link>
    ) : (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
          ⚠️ Required: Link to Asset Thesis
        </span>
        <LinkStrategyToViewButton
          strategyId={strategy.id}
          currentViewId={null}
          currentThesisId={strategy.macroThesisId}
        />
      </div>
    )}
  </div>
</div>
```

**Note**: Always show breadcrumb area (remove conditional on line 117), display warnings for missing links

---

### Part 2: Inline Linking Workflows

**Goal**: Provide quick-action buttons to link hierarchy objects inline (no navigation away)

#### 2.1: Link Asset Thesis to Macro Thesis Dialog
**Component**: `/src/components/asset-theses/LinkToThesisButton.tsx` (new)

**Features**:
- Button opens dialog
- Search/filter macro theses by:
  - Title (text search)
  - Thesis Type (secular/cyclical/structural)
  - Direction (bullish/bearish/neutral)
  - Status (active/under_review/retired)
- Display macro theses in list/grid with:
  - Title
  - Thesis Type badge
  - Direction badge
  - Confidence level
  - Click to select
- Confirm and save via API

**API**: `PATCH /api/asset-theses/[id]` with `{ macro_thesis_id: "uuid" }`

#### 2.2: Link Strategy to Asset Thesis Dialog
**Component**: `/src/components/strategies/LinkStrategyToViewButton.tsx` (new)

**Features**:
- Button opens dialog
- Search/filter asset thesiss by:
  - Title (text search)
  - Underlying ticker
  - Direction
  - Macro Thesis (filter by parent thesis)
- Display views in list with:
  - Title
  - Underlying ticker
  - Direction badge
  - Parent macro thesis (if any)
  - Click to select
- Option to create NEW asset thesis inline (stretch goal)
- Confirm and save via API

**API**: `PATCH /api/strategies/[id]` with `{ asset_thesis_id: "uuid", macro_thesis_id: "uuid" }`

**Note**: When linking strategy to view, also prompt to link to parent macro thesis if view has one

#### 2.3: Link Strategy to Macro Thesis Dialog (Optional)
**Component**: `/src/components/strategies/LinkStrategyToThesisButton.tsx` (new)

**Features**: Similar to 2.2 but for macro theses

---

### Part 3: Validation Warnings

**Goal**: Warn users when they're creating/editing entities without required links

#### 3.1: Asset Thesis Create/Edit Form Warnings
**Location**: Asset Thesis create/edit forms (TBD - forms may not exist yet from Phase 1.6)

**Warning**: "⚠️ Warning: This Asset Thesis is not linked to a Macro Thesis. This is recommended for complete hierarchy coverage."

**Action**: Show inline linking button

#### 3.2: Strategy Create/Edit Form Warnings
**Location**: Strategy create/edit forms

**Warning**: "⚠️ Warning: This Strategy is not linked to an Asset Thesis. This is REQUIRED for triage and analysis."

**Action**: Show inline linking button, prevent save until linked (or show dismissible warning)

#### 3.3: Detail Page Validation Banners
**Feature**: Add persistent banner at top of detail pages when required links are missing

**Example** (Asset Thesis without Macro Thesis):
```tsx
<div className="mb-4 bg-amber-50 border-l-4 border-amber-400 p-4">
  <div className="flex items-start">
    <div className="flex-shrink-0">
      <svg className="h-5 w-5 text-amber-400" ... />
    </div>
    <div className="ml-3 flex-1">
      <p className="text-sm text-amber-700">
        This Asset Thesis is not linked to a Macro Thesis.
        <a href="#" className="font-medium underline">Link to Macro Thesis</a>
      </p>
    </div>
    <button className="ml-auto text-amber-500 hover:text-amber-600">
      <svg className="h-5 w-5" ... /> {/* Dismiss X */}
    </button>
  </div>
</div>
```

---

### Part 4: Bulk Linking Tools (Stretch Goal)

**Goal**: Efficiently link multiple entities at once

#### 4.1: Bulk Link Asset Thesiss to Macro Thesis
**Location**: `/asset-theses` list page

**Features**:
- Multi-select checkboxes for Asset Thesiss
- "Bulk Link to Macro Thesis" button
- Dialog to select target Macro Thesis
- Apply to all selected views
- Show confirmation with count (e.g., "12 Asset Thesiss linked to 'AI Infrastructure Build-Out'")

#### 4.2: Bulk Link Strategies to Asset Thesis
**Location**: `/strategies` list page

**Features**: Similar to 4.1

---

## Implementation Phases

### Phase A: Visual Indicators (Priority 1 - Essential)
**Effort**: 2-3 days
- [ ] Asset Thesis missing thesis indicator
- [ ] Strategy missing view indicator
- [ ] Enhanced visual breadcrumb component (replaces text breadcrumb)
  - Visual flow diagram with boxes and arrows
  - Color coding (green = linked, amber = missing)
  - Clickable navigation
  - Inline "+" buttons for missing links
- [ ] Always-visible breadcrumb on strategy pages
- [ ] Detail page validation banners

### Phase B: Inline Linking Workflows (Priority 2 - High Value)
**Effort**: 2-3 days
- [ ] LinkToThesisButton component + dialog
- [ ] LinkStrategyToViewButton component + dialog
- [ ] Search/filter UI for macro theses
- [ ] Search/filter UI for asset thesiss

### Phase C: Validation Warnings (Priority 3 - Nice to Have)
**Effort**: 1-2 days
- [ ] Create/edit form warnings (depends on Phase 1.6 forms)
- [ ] Persistent validation banners

### Phase D: Bulk Linking Tools (Priority 4 - Deferred/Stretch)
**Effort**: 2-3 days
- [ ] Bulk link Asset Thesiss
- [ ] Bulk link Strategies

**Note**: Phase D may be deferred to future enhancement if time is limited

---

## Success Criteria

**Essential** (Phases A + B):
- ✅ Visual warning on Asset Thesis when Macro Thesis is missing
- ✅ Visual warning on Strategy when Asset Thesis is missing
- ✅ Inline linking workflows (no page navigation required)
- ✅ All required links clearly indicated in UI

**Nice-to-Have** (Phase C):
- ✅ Validation warnings on create/edit forms
- ✅ Persistent banners on detail pages

**Stretch Goals** (Phase D):
- ✅ Bulk linking tools

---

## Open Questions

1. **Position → Strategy linking**:
   - Where do positions display in UI?
   - Do they show strategy links?
   - Do we need missing link indicators there too?

2. **Form validation**:
   - Do Asset Thesis/Strategy create/edit forms exist yet?
   - If not, defer form warnings until Phase 1.6

3. **Link enforcement**:
   - Should we PREVENT saving strategies without Asset Thesiss?
   - Or just show dismissible warnings?
   - User preference needed

4. **Bulk operations**:
   - Is bulk linking high priority or can it be deferred?
   - User feedback needed

---

## Dependencies

- ✅ Phase 2.6.5 (Claim Conversion) - Complete
- ⏳ Phase 1.6 (Create/Edit Forms) - NOT complete (affects Part 3 validation warnings)

---

## Files to Create

### Components:
- `src/components/asset-theses/LinkToThesisButton.tsx`
- `src/components/asset-theses/LinkToThesisDialog.tsx`
- `src/components/strategies/LinkStrategyToViewButton.tsx`
- `src/components/strategies/LinkStrategyToViewDialog.tsx`
- `src/components/ui/ValidationBanner.tsx` (reusable)

### Pages:
- Update: `src/app/asset-theses/[id]/page.tsx`
- Update: `src/app/strategies/[strategyId]/triage/page.tsx`
- Update: `src/app/strategies/[strategyId]/performance/page.tsx` (same breadcrumb)
- Update: `src/app/strategies/[strategyId]/blotter/page.tsx` (same breadcrumb)

### API Routes:
- Verify: `src/app/api/asset-theses/[id]/route.ts` (PATCH for updating macro_thesis_id)
- Verify: `src/app/api/strategies/[id]/route.ts` (PATCH for updating asset_thesis_id)

---

## Visual Enhancements (User Request)

### Option 1: Enhanced Visual Breadcrumb ✅ APPROVED
**Status**: Implementing in Phase A
**Description**: Replace text breadcrumb with visual flow diagram
- Boxes with connecting arrows
- Color coding for link status
- Inline linking buttons

### Option 2: Interactive Hierarchy Tree
**Status**: Deferred to Phase 1.7 (already planned)
**Description**: Full collapsible tree with D3.js/React Flow

### Option 3: Hierarchy Flow Card
**Status**: Decision deferred to end of Phase 2.6.6
**Description**: Vertical flow card with connector lines
**Note**: Will evaluate need after implementing Option 1

---

## Next Steps

1. ✅ Complete discovery (this plan document)
2. ✅ User approved visual breadcrumb enhancement (Option 1)
3. Implement Phase A (Visual Indicators + Enhanced Breadcrumb) - START HERE
4. Implement Phase B (Inline Linking)
5. Decide on Option 3 (Flow Card) at end of Phase 2.6.6
6. Decide on Phase C + D based on time/priority

---

**Status**: ✅ Planning Complete - Implementing Phase A with visual breadcrumb
