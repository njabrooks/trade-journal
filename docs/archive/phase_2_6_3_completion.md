# Phase 2.6.3: Auto-Generated Titles - Completion Report

**Status**: ✅ Complete
**Date**: 2025-12-29
**Effort**: ~2 hours (faster than estimated 4-5 days due to existing schema fields)

---

## Summary

Phase 2.6.3 implemented auto-generated titles for Asset Views and Macro Theses based on structured fields. The implementation was simpler than expected because the database schema already had all necessary fields (`direction`, `timeHorizon`, `sectors`).

---

## What Was Implemented

### 1. Title Generation Utility (`src/lib/utils/title-generation.ts`)

**Asset View Title Format**: `{Direction} {Ticker} {Time Horizon}`
- Example: `"Bullish TSLA Medium Term"`
- Fallback: `"Untitled Asset View"` (when ticker is missing)

**Macro Thesis Title Format**: `{Direction} {Sector/Topic} {Time Horizon}`
- Example: `"Bullish US Inflation Medium Term"`
- Fallback: `"Untitled Macro Thesis"` (when sector is missing)

**Features**:
- ✅ Auto-capitalizes direction (bullish → Bullish)
- ✅ Formats time horizon (medium_term → Medium Term)
- ✅ Handles missing/null fields gracefully
- ✅ Validation functions to check if title can be generated
- ✅ Detection functions for when regeneration is needed

### 2. Updated API Routes

**Modified Files**:
- `/src/app/api/asset-views/create/route.ts`
- `/src/app/api/theses/create/route.ts`

**Changes**:
- ✅ Made `title` optional in request validation
- ✅ Auto-generates title if not provided (allows manual override)
- ✅ Uses structured fields (direction, ticker/sectors, time horizon)
- ✅ Fixed TypeScript error (removed non-existent `viewType` field)

### 3. Backfill Scripts

**Created Scripts**:
- `scripts/backfill-asset-view-titles.ts` - Updates existing Asset Views
- `scripts/backfill-macro-thesis-titles.ts` - Updates existing Macro Theses

**Features**:
- ✅ Dry-run mode (`--dry-run`) to preview changes
- ✅ Force mode (`--force`) to update all titles
- ✅ Detailed logging showing current vs generated titles
- ✅ Summary statistics (total, updated, skipped, errors)
- ✅ Skips records with insufficient data (no ticker/sectors)

**Usage**:
```bash
# Preview changes
npx tsx scripts/backfill-asset-view-titles.ts --dry-run
npx tsx scripts/backfill-macro-thesis-titles.ts --dry-run

# Apply changes
npx tsx scripts/backfill-asset-view-titles.ts
npx tsx scripts/backfill-macro-thesis-titles.ts
```

### 4. Unit Tests

**Created Test File**: `scripts/test-title-generation.ts`

**Test Coverage**: 17 tests, all passing ✅
- Asset View title generation (7 tests)
- Macro Thesis title generation (10 tests)
- Edge cases (missing fields, empty arrays, fallbacks)
- Validation functions

**Run Tests**:
```bash
npx tsx scripts/test-title-generation.ts
```

---

## Key Decisions

### 1. Title is Optional, Not Auto-Generated Always

**Decision**: Make `title` optional in API routes. If provided, use it. If not, auto-generate.

**Rationale**:
- Allows manual override for special cases
- Backward compatible with existing code
- Gives users flexibility while providing convenience

### 2. No Database Migration Needed

**Discovery**: Database schema already had all necessary fields:
- ✅ `asset_views.direction`
- ✅ `asset_views.timeHorizon`
- ✅ `asset_views.underlyingId` → `underlyings.ticker`
- ✅ `macro_theses.direction`
- ✅ `macro_theses.timeHorizon`
- ✅ `macro_theses.sectors` (array field)

**Impact**: Saved significant implementation time (no schema changes, no migrations)

### 3. Fallback Titles for Incomplete Data

**Decision**: Return `"Untitled Asset View"` or `"Untitled Macro Thesis"` when essential fields are missing.

**Rationale**:
- Better than failing or using empty strings
- Clear indicator that data is incomplete
- Still allows record creation (useful for drafts)

### 4. Use First Sector for Macro Theses

**Decision**: When multiple sectors provided, use only the first one in the title.

**Rationale**:
- Titles should be concise (not "Bullish US Inflation, Chinese Tech, Energy Long Term")
- First sector is typically the primary focus
- Full sector list still stored in database

---

## Files Modified

**New Files**:
- `src/lib/utils/title-generation.ts` (174 lines)
- `scripts/backfill-asset-view-titles.ts` (160 lines)
- `scripts/backfill-macro-thesis-titles.ts` (157 lines)
- `scripts/test-title-generation.ts` (327 lines)

**Modified Files**:
- `src/app/api/asset-views/create/route.ts` (added title generation logic, removed invalid `viewType` field)
- `src/app/api/theses/create/route.ts` (added title generation logic)

**Total Lines Added**: ~850 lines

---

## Testing

### Unit Tests: ✅ All Passing

```
Total tests: 17
Passed: 17
Failed: 0
```

### TypeScript Compilation: ✅ No Errors

```bash
npx tsc --noEmit --skipLibCheck
# No errors in Phase 2.6.3 files
```

### Manual Testing Needed (User Action Required)

**Asset Views**:
1. Create new Asset View via `/api/asset-views/create` without `title`
2. Verify title is auto-generated: `"{Direction} {Ticker} {Time Horizon}"`
3. Test with missing fields (no direction, no time horizon)
4. Test manual title override (provide `title` in request)

**Macro Theses**:
1. Create new Macro Thesis via `/api/theses/create` without `title`
2. Verify title is auto-generated: `"{Direction} {Sector} {Time Horizon}"`
3. Test with multiple sectors (verify first is used)
4. Test manual title override

**Backfill**:
1. Run backfill scripts in dry-run mode
2. Verify proposed changes look correct
3. Run backfill scripts without dry-run
4. Verify existing records updated correctly

---

## Next Steps

### Remaining Phase 2.6 Work

**Phase 2.6.4**: Schema & Taxonomy Improvements (#ENH-004, #ENH-010)
- ✅ Asset Views → Underlyings linking (already complete - `underlyingId` FK exists)
- ⏳ Display underlying metadata on Asset View detail pages
- ⏳ Define sector/topic taxonomy for Macro Theses using Claude

**Phase 2.6.5**: Streamlined Claim Conversion (#ENH-011)
- Convert button creates NEW macro thesis or asset view
- Auto-suggests field values based on claim context
- Dependencies: Requires Phase 2.6.3 ✅ and Phase 2.6.4 taxonomy

**Phase 2.6.6**: Enhanced Hierarchy Linking UX (#ENH-008)
- Visual indicators for missing links
- Inline linking workflows
- Validation warnings

---

## Open Questions

### 1. Should We Update Generic API Routes Too?

**Context**: We only updated `/api/asset-views/create/route.ts` and `/api/theses/create/route.ts`. The generic routes in `/api/asset-views/route.ts` and `/api/theses/route.ts` still require `title`.

**Options**:
- A) Leave as-is (generic routes require title, /create routes auto-generate)
- B) Update generic routes to also auto-generate titles
- C) Deprecate generic routes in favor of /create routes

**Recommendation**: Option A for now. The `/create/` routes are more feature-rich (claim linking) and are used by the conversion workflow.

### 2. Should We Regenerate Titles on Update?

**Context**: Currently, titles are only auto-generated on create. If a user updates `direction` or `timeHorizon`, the title doesn't automatically update.

**Options**:
- A) Keep title static after creation (current behavior)
- B) Auto-regenerate title on every update if structured fields change
- C) Add a "Regenerate Title" button in the UI

**Recommendation**: Option A for now (simplicity). Can add Option C in Phase 2.6.6 if users request it.

---

## Enhancement IDs

- **#ENH-006**: Asset View Auto-Generated Titles ✅ Complete
- **#ENH-009**: Macro Thesis Auto-Generated Titles ✅ Complete

---

## Big Picture Impact

**User Benefits**:
- ✅ Consistent naming convention across all Asset Views and Macro Theses
- ✅ Easier scanning and filtering (titles follow predictable pattern)
- ✅ Less manual work (no need to type repetitive titles)
- ✅ Better UX for claim conversion workflow (Phase 2.6.5)

**Developer Benefits**:
- ✅ Structured data enables better search and filtering
- ✅ Foundation for future UI enhancements (auto-complete, suggestions)
- ✅ Cleaner codebase (centralized title generation logic)

**System Architecture**:
- ✅ Aligns with PRD vision of structured belief hierarchy
- ✅ Makes theses/views more scannable and analyzable
- ✅ Supports future Phase 4 trigger system (e.g., "alert when Bullish TSLA Long Term confidence drops")

---

## Lessons Learned

1. **Check Schema First**: Saved days by discovering fields already existed
2. **Unit Tests First**: Writing tests before backfill scripts caught edge cases early
3. **Dry-Run Mode**: Essential for backfill scripts - prevents accidental data corruption
4. **Fallback Handling**: Important to handle incomplete data gracefully (drafts, legacy records)

---

## Documentation Updates Needed

- [ ] Update `docs/implementation_progress.md` - Mark Phase 2.6.3 as complete
- [ ] Update `docs/FUTURE_ENHANCEMENTS.md` - Mark #ENH-006 and #ENH-009 as complete
- [ ] Update `CLAUDE.md` - Add note about auto-generated titles in "Key Directories" section
- [ ] Update API documentation - Note that `title` is optional in `/create/` routes

---

**Status**: ✅ Phase 2.6.3 Complete - Ready for User Testing
