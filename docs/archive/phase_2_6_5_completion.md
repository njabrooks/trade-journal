# Phase 2.6.5: Streamlined Claim Conversion - Completion Report

**Status**: ✅ Complete
**Date**: 2025-12-29
**Effort**: ~30 minutes (faster than estimated 3-4 days)

---

## Summary

Phase 2.6.5 implemented a streamlined workflow for converting research claims into new Macro Theses or Asset Views. The "Convert" button creates a NEW entity (not converting the claim itself) and automatically links the claim as evidence with full provenance tracking.

---

## What Was Implemented

### 1. ConvertClaimToEntityDialog Component

**File**: `src/components/research/ConvertClaimToEntityDialog.tsx` (423 lines)

**Two-Step Conversion Workflow**:

**Step 1: Choose Entity Type**
- Large clickable cards for Macro Thesis or Asset View
- Clear descriptions of each type
- Simple visual design for quick decision

**Step 2: Fill in Structured Fields**
- **Common Fields** (both entity types):
  - Direction (bullish/bearish/neutral)
  - Time Horizon (long_term/medium_term/short_term)
  - Confidence Level (high/medium/low/exploratory)

- **Macro Thesis Specific**:
  - Thesis Type (secular/cyclical/structural)
  - Sectors / Topics (multi-select using SectorSelector from Phase 2.6.4)

- **Asset View Specific**:
  - Ticker (must exist in underlyings table)

**Live Title Preview**:
- Shows auto-generated title as user fills in fields
- Format: `{Direction} {Ticker/Sector} {Time Horizon}`
- Updates in real-time
- Uses title generation from Phase 2.6.3

**Automatic Evidence Linking**:
- Creates new thesis/view via existing API routes
- Passes `linkedMainClaimIds: [claim.id]` to link claim as evidence
- Adds provenance metadata to notes field:
  ```json
  {
    "source_claim_id": "claim-uuid",
    "source_claim_title": "Claim title",
    "created_via_conversion": true
  }
  ```

**Navigation**:
- After creation, redirects to new thesis/view detail page
- Refreshes router to show updated data

### 2. Claims Browser Integration

**File**: `src/components/research/UnifiedClaimsBrowser.tsx`

**Added "Convert" Button** in Actions column:
- Small outline button with arrow icon
- Positioned next to expand/collapse button
- Opens ConvertClaimToEntityDialog on click
- Passes claim data to dialog

**Dialog State Management**:
- `convertDialogOpen` - controls dialog visibility
- `claimToConvert` - stores claim being converted
- Resets state on dialog close

---

## Key Design Decisions

### 1. Create NEW Entity (Don't Convert Claim)

**Decision**: "Convert" button creates a NEW macro thesis or asset view. The claim remains unchanged and is linked as evidence.

**Rationale**:
- ✅ Claim preserves full Toulmin framework structure
- ✅ Claim can support multiple theses/views (many-to-many)
- ✅ Provenance chain intact (claim → thesis/view)
- ✅ Claim remains browsable/searchable independently

**Alternative Considered**: Convert claim directly into thesis/view
- ⚠️ Would lose Toulmin structure (evidence, reasoning, backing)
- ⚠️ Would lose source research linkage
- ⚠️ Couldn't support one claim → many theses

### 2. Two-Step Workflow (Choose Type → Fill Fields)

**Decision**: First choose entity type, then fill in fields (not all fields on one page)

**Rationale**:
- ✅ Clearer cognitive flow (decide what, then how)
- ✅ Reduces visual complexity (only show relevant fields)
- ✅ Macro Thesis vs Asset View have different required fields
- ✅ Easier to add AI suggestions in future (suggestions based on chosen type)

**Alternative Considered**: Single-page form with all fields
- ⚠️ Overwhelming (too many fields at once)
- ⚠️ Unclear which fields apply to which entity type

### 3. Manual Field Selection (Not AI-Suggested Yet)

**Decision**: User manually selects all field values. No AI suggestions implemented in this phase.

**Rationale**:
- ✅ Faster implementation (no AI endpoint needed)
- ✅ User has full control
- ✅ Simpler testing (deterministic behavior)
- ✅ Foundation in place for AI suggestions in future

**Future Enhancement**: Add AI suggestions that analyze claim text and suggest:
- Direction (detect bullish/bearish sentiment)
- Sectors (match claim content to taxonomy)
- Time Horizon (detect keywords like "long-term", "near-term")

Implementation approach for future:
```typescript
// Add suggestion button
<Button onClick={() => getSuggestions(claim)}>
  ✨ Get AI Suggestions
</Button>

// Call API endpoint
async function getSuggestions(claim: MainClaim) {
  const response = await fetch('/api/research/suggest-fields', {
    method: 'POST',
    body: JSON.stringify({ claimText: claim.claim }),
  });
  const { direction, sectors, timeHorizon } = await response.json();
  // Pre-fill form fields
}
```

### 4. Use Existing API Routes

**Decision**: Use existing `/api/theses/create` and `/api/asset-views/create` routes (not new conversion-specific endpoints)

**Rationale**:
- ✅ DRY (don't repeat validation/creation logic)
- ✅ Both routes already support `linkedMainClaimIds` parameter
- ✅ Title auto-generation already implemented (Phase 2.6.3)
- ✅ Less code to maintain

**Alternative Considered**: Create `/api/research/claims/convert` endpoint
- ⚠️ Would duplicate create logic
- ⚠️ Extra API route to maintain

---

## Files Created/Modified

**New Files**:
- `src/components/research/ConvertClaimToEntityDialog.tsx` (423 lines)
- `docs/archive/phase_2_6_5_completion.md` (this file)

**Modified Files**:
- `src/components/research/UnifiedClaimsBrowser.tsx` - Added Convert button and dialog integration

**Total Lines Added**: ~450 lines

---

## Testing

### Manual Testing Required (User Action)

**Basic Conversion Flow**:
1. Navigate to `/research/claims`
2. Click "Convert" button on any claim
3. Choose "Macro Thesis"
4. Fill in fields (direction, sectors, time horizon, thesis type)
5. Observe live title preview updates
6. Click "Create Macro Thesis"
7. Verify redirect to new thesis detail page
8. Verify claim is linked in "Main Claims" section
9. Repeat for "Asset View" path

**Field Validation**:
- Try creating Macro Thesis without sectors → should work but title is "Untitled Macro Thesis"
- Try creating Asset View without ticker → should show error
- Try creating Asset View with invalid ticker → should show error from API

**Navigation**:
- Click "Back" button → should return to Step 1
- Click "Cancel" → should close dialog
- Click outside dialog → (not implemented, manual close only)

### TypeScript Compilation

```bash
npx tsc --noEmit --skipLibCheck
# ✅ No errors in Phase 2.6.5 files
```

---

## Dependencies Met

- ✅ **Phase 2.6.3** (Auto-generated titles) - Dialog uses title generation functions
- ✅ **Phase 2.6.4** (Sector taxonomy) - Dialog uses SectorSelector component
- ✅ **Existing API routes** (`/api/theses/create`, `/api/asset-views/create`) support claim linking

---

## Next Steps

### Phase 2.6.6: Enhanced Hierarchy Linking UX (#ENH-008)

**Goal**: Improve UX for end-to-end linking of hierarchy objects

**Implementation**:
1. Visual indicators for missing links (e.g., "⚠️ No Asset View linked")
2. Inline linking workflows at obvious entry points
3. Bulk linking tools
4. Validation warnings for incomplete hierarchies

**Required Links**:
- Position → Strategy (required)
- Strategy → Asset View (required)
- Asset View → Macro Thesis(es) (required, can be multiple)
- Asset Views and Macro Theses → Main Claims (evidence linking)

**Estimated Effort**: 1 week

---

## Future Enhancements for Phase 2.6.5

### 1. AI Field Suggestions

**Feature**: Analyze claim text to suggest field values

**Implementation**:
- Add "✨ Get AI Suggestions" button in dialog
- Create `/api/research/suggest-fields` endpoint
- Use Claude to analyze claim and suggest:
  - Direction (sentiment analysis)
  - Sectors (match to taxonomy)
  - Time Horizon (keyword detection)
- Pre-fill form with suggestions (user can edit)

**Effort**: 1-2 days

### 2. Bulk Conversion

**Feature**: Select multiple claims and convert them all at once

**Use Case**: User processes a research audit with 10 claims, wants to convert 5 of them to theses

**Implementation**:
- Add checkboxes to claims browser
- "Convert Selected" button
- Batch conversion workflow (maybe wizard-style)

**Effort**: 2-3 days

### 3. Conversion Preview

**Feature**: Show preview of what will be created before clicking "Create"

**Implementation**:
- Expandable "Preview" section in dialog
- Shows full thesis/view data that will be created
- Shows claim linkage details

**Effort**: 1 day

---

## Enhancement ID

- **#ENH-011**: Streamlined Claim Conversion ✅ Complete

---

## Big Picture Impact

**User Benefits**:
- ✅ One-click workflow from claim → thesis/view
- ✅ No manual copying/pasting of claim text
- ✅ Automatic provenance tracking
- ✅ Live title preview shows exactly what will be created
- ✅ Consistent with existing title generation pattern

**Developer Benefits**:
- ✅ Reuses existing API routes (DRY)
- ✅ Clean separation: Dialog component → API routes → Database
- ✅ Foundation for future AI suggestions
- ✅ Type-safe throughout

**System Architecture**:
- ✅ Completes research workflow loop: Artifact → Insight → Claims → Thesis/View → Strategy → Position
- ✅ Maintains full provenance chain (no information loss)
- ✅ Supports many-to-many (one claim can support multiple theses)
- ✅ Enables top-down analysis (thesis → claims → research sources)

---

## Lessons Learned

1. **Reuse > Rebuild**: Using existing API routes saved significant time. No need to duplicate create logic.

2. **Live Preview is Powerful**: Showing the auto-generated title as user types provides immediate feedback and confidence.

3. **Two-Step Flow Works**: Breaking into "Choose Type" → "Fill Fields" reduces cognitive load compared to one big form.

4. **Manual First, AI Later**: Building the manual workflow first gives us a solid foundation. AI suggestions can be added incrementally.

---

**Status**: ✅ Phase 2.6.5 Complete - Ready for User Testing

---

**Total Phase 2.6 Progress**: ~71% complete (5 of 7 sub-phases done)
- ✅ Phase 2.6.1: Sidebar Reordering
- ✅ Phase 2.6.2: Claims Browser Page
- ✅ Phase 2.6.3: Auto-Generated Titles
- ✅ Phase 2.6.4: Schema & Taxonomy Improvements
- ✅ Phase 2.6.5: Streamlined Claim Conversion
- ⏳ Phase 2.6.6: Enhanced Hierarchy Linking UX
- ⏳ Phase 2.6.7: Asset View Terminology Review
