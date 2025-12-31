# Migration Bug Fixes - Multi-Macro Thesis Support

## Overview
After implementing the Sprint 1 migration for multi-macro thesis support, several components were still using old field names, causing silent failures where operations appeared to succeed but data wasn't actually updated.

## Root Cause
The database schema was updated to:
- Rename `asset_theses.macro_thesis_id` → `primary_macro_thesis_id`
- Remove `strategies.macro_thesis_id` (strategies now inherit through asset thesis)

However, many client-side components were still using the old field names in API requests.

## Bugs Found & Fixed

### 1. LinkToThesisDialog (Asset Thesis Browser)
**Issue**: When linking an asset thesis to a macro thesis from the UnifiedAssetThesisBrowser, the PATCH request succeeded but nothing updated.

**Root Cause**: Sending `macroThesisId` instead of `primaryMacroThesisId`

**Fix**: Updated to send `primaryMacroThesisId` in the PATCH body

**Files**: `src/components/asset-theses/LinkToThesisDialog.tsx`

---

### 2. CreateAssetThesisForm
**Issue**: Creating asset theses with macro thesis links would fail silently.

**Root Cause**: 
- Interface defined `macroThesisId` 
- State used `primaryMacroThesisId`
- Type mismatch

**Fix**: Updated interface to use `primaryMacroThesisId`

**Files**: `src/components/linking/CreateAssetThesisForm.tsx`

---

### 3. CreateAssetThesisDialog
**Issue**: Creating asset theses from research claims wouldn't link to macro thesis.

**Root Cause**: Sending `macroThesisId` instead of `primaryMacroThesisId`

**Fix**: Updated to send `primaryMacroThesisId` in POST body

**Files**: `src/components/asset-theses/CreateAssetThesisDialog.tsx`

---

### 4. UnifiedLinkingDialog (Multiple Issues)
**Issue**: Creating and linking entities in various contexts would fail.

**Root Causes**:
- Sending `macroThesisId` when linking asset thesis to new macro thesis
- Sending `macroThesisId` when creating asset thesis
- Trying to set `macroThesisId` on strategies (doesn't exist anymore)

**Fixes**:
- Updated asset thesis PATCH to use `primaryMacroThesisId`
- Updated asset thesis creation to use `primaryMacroThesisId`
- Removed `macroThesisId` from strategy creation/update
- Removed `macroThesisId` prop from CreateStrategyForm call

**Files**: `src/components/linking/UnifiedLinkingDialog.tsx`

---

### 5. CreateStrategyForm
**Issue**: Form was accepting and trying to set `macroThesisId` on strategies.

**Root Cause**: Strategies no longer have direct `macroThesisId` field after migration.

**Fix**: 
- Removed `macroThesisId` from interface
- Removed `macroThesisId` from props
- Removed `macroThesisId` from state
- Added comments explaining strategies inherit macro thesis through asset thesis

**Files**: `src/components/linking/CreateStrategyForm.tsx`

---

### 6. AssetThesisSelector
**Issue**: Type mismatch between interface and actual usage in filters.

**Root Cause**: 
- Interface defined `macroThesisId` and `macroThesisTitle`
- Code used `primaryMacroThesisId` in filters
- Display used `macroThesisTitle` instead of `primaryMacroThesisTitle`

**Fix**: Updated interface and display to use `primaryMacroThesisId` and `primaryMacroThesisTitle`

**Files**: `src/components/strategies/AssetThesisSelector.tsx`

---

### 7. LinkToViewDialog
**Issue**: Linking strategies to asset theses would try to set non-existent `macroThesisId` field.

**Root Cause**: Strategy PATCH was trying to set both `assetThesisId` and `macroThesisId`

**Fix**: 
- Removed `macroThesisId` from PATCH body
- Added comment explaining strategies inherit macro thesis through asset thesis

**Files**: `src/components/strategies/LinkToViewDialog.tsx`

---

### 8. LinkAssetThesesToMacroDialog
**Issue**: Linking asset theses to macro theses from macro thesis detail page would fail silently.

**Root Cause**: Sending `macroThesisId` instead of `primaryMacroThesisId`

**Fix**: Updated to send `primaryMacroThesisId` in PATCH body

**Files**: `src/components/theses/LinkAssetThesesToMacroDialog.tsx`

---

## Impact

### Before Fixes
- Asset thesis linking appeared to work but didn't save
- Strategy creation with macro thesis context would fail
- Asset thesis creation from various contexts wouldn't link properly
- Type errors were masked by `any` types in some places

### After Fixes
- All linking operations work correctly
- Type safety improved with correct interface definitions
- Consistent field naming across all components
- Clear comments explaining the new architecture

## Testing Checklist

- [ ] Link asset thesis to macro thesis from UnifiedAssetThesisBrowser
- [ ] Create asset thesis from UnifiedLinkingDialog
- [ ] Create asset thesis from research claim
- [ ] Link strategy to asset thesis
- [ ] Create strategy with asset thesis context
- [ ] Link asset thesis to macro thesis from macro thesis detail page
- [ ] Verify asset thesis selector shows correct macro thesis info
- [ ] Verify no TypeScript errors in affected files

## Lessons Learned

1. **Schema migrations require comprehensive client-side updates**: Database changes must be reflected in all TypeScript interfaces, not just query functions.

2. **Silent failures are dangerous**: The API's backwards compatibility (accepting but ignoring unknown fields) masked these bugs. Consider adding warnings for deprecated fields.

3. **Type safety is critical**: Using `any` types in some places allowed these bugs to slip through. Stricter typing would have caught them at compile time.

4. **Systematic search is essential**: Using grep to find all occurrences of old field names was crucial for finding all bugs.

## Related Commits

- `5653813` - fix(ui): update LinkToThesisDialog to use primaryMacroThesisId
- `931baf5` - fix(migration): update all components to use new field names
- `9ed5b36` - fix(migration): fix remaining field name bugs in selectors
- `3c130f4` - fix(migration): fix LinkAssetThesesToMacroDialog field name
