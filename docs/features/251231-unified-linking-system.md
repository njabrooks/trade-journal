# Unified Linking System

**Created**: 2025-12-31  
**Status**: Foundation Complete, Migration In Progress

## Overview

The Unified Linking System provides a standardized way to link entities across the hierarchy with both "Link to Existing" and "Create New & Link" functionality.

## Problem Solved

**Before:**
- Each linking dialog was custom-built
- Only supported linking to existing entities
- No way to create new entities inline
- Users had to navigate away to create entities
- Inconsistent UX across browsers
- 150+ lines of code per dialog

**After:**
- Single reusable `UnifiedLinkingDialog` component
- Supports both existing and new entity creation
- Stay in context, no navigation needed
- Consistent UX everywhere
- ~30 lines of code per dialog (80% reduction)

## Architecture

### Component Hierarchy

```
UnifiedLinkingDialog
├── Header (title, source name, close button)
├── Tabs
│   ├── Tab 1: Link to Existing
│   │   └── ExistingEntityList
│   │       ├── Search bar
│   │       ├── Filtered list of entities
│   │       └── Select buttons
│   └── Tab 2: Create New & Link
│       ├── CreateMacroThesisForm (if targetType = macroThesis)
│       ├── CreateAssetThesisForm (if targetType = assetThesis)
│       └── CreateStrategyForm (coming soon)
└── Footer (handled by forms)
```

### Core Components

#### 1. UnifiedLinkingDialog
Main dialog component with tabbed interface.

**Props:**
```typescript
interface UnifiedLinkingDialogProps {
  sourceType: 'claim' | 'strategy' | 'assetThesis' | 'macroThesis';
  sourceId: string;
  sourceTitle: string;
  targetType: 'macroThesis' | 'assetThesis' | 'strategy';
  existingItemsComponent: React.ReactNode;
  autoLinkContext?: {
    macroThesisId?: string;
    assetThesisId?: string;
  };
  onClose: () => void;
}
```

#### 2. ExistingEntityList
Generic searchable list for "Link to Existing" tab.

**Props:**
```typescript
interface ExistingEntityListProps<T> {
  entityType: 'macroThesis' | 'assetThesis' | 'strategy';
  onSelect: (entityId: string) => Promise<void>;
  onCancel: () => void;
  filterParams?: Record<string, string>;
  renderItem: (item: T) => React.ReactNode;
}
```

#### 3. CreateMacroThesisForm
Form for creating new macro theses.

**Features:**
- Auto-generates title: `{direction} {sector} {timeHorizon}`
- Sector management with add/remove
- Required fields: direction, timeHorizon, confidence, sectors (1+)
- Optional: title (if autoGenTitle=false), description

#### 4. CreateAssetThesisForm  
Form for creating new asset theses.

**Features:**
- Auto-generates title: `{direction} {ticker} {timeHorizon}`
- Fetches underlyings from `/api/underlyings`
- Auto-links to macroThesisId if provided
- Required fields: underlying, direction, timeHorizon, confidence

## Usage Pattern

### Example: Macro Thesis → Asset Thesis Linking

```typescript
// In UnifiedMacroThesisBrowser or macro thesis detail page

import { UnifiedLinkingDialog } from '@/components/linking/UnifiedLinkingDialog';
import { ExistingEntityList } from '@/components/linking/ExistingEntityList';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

function LinkAssetThesesDialog({ macroThesisId, macroThesisTitle, isOpen, onClose }) {
  const router = useRouter();

  const handleSelectAssetThesis = async (assetThesisId: string) => {
    // Link the asset thesis to this macro thesis
    const response = await fetch(`/api/asset-theses/${assetThesisId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macroThesisId }),
    });

    if (!response.ok) {
      throw new Error('Failed to link');
    }

    router.refresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <UnifiedLinkingDialog
      sourceType="macroThesis"
      sourceId={macroThesisId}
      sourceTitle={macroThesisTitle}
      targetType="assetThesis"
      autoLinkContext={{ macroThesisId }} // Auto-link new asset theses to this macro thesis
      onClose={onClose}
      existingItemsComponent={
        <ExistingEntityList
          entityType="assetThesis"
          onSelect={handleSelectAssetThesis}
          onCancel={onClose}
          renderItem={(thesis) => (
            <div>
              <div className="font-medium">{thesis.title}</div>
              <div className="flex gap-2 text-xs">
                {thesis.ticker && <span>{thesis.ticker}</span>}
                {thesis.direction && <Badge>{thesis.direction}</Badge>}
              </div>
            </div>
          )}
        />
      }
    />
  );
}
```

### Example: Strategy → Asset Thesis Linking

```typescript
function LinkStrategyToAssetThesisDialog({ strategyId, strategyLabel, isOpen, onClose }) {
  const router = useRouter();

  const handleSelectAssetThesis = async (assetThesisId: string) => {
    const response = await fetch(`/api/strategies/${strategyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetThesisId }),
    });

    if (!response.ok) throw new Error('Failed to link');
    
    router.refresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <UnifiedLinkingDialog
      sourceType="strategy"
      sourceId={strategyId}
      sourceTitle={strategyLabel}
      targetType="assetThesis"
      onClose={onClose}
      existingItemsComponent={
        <ExistingEntityList
          entityType="assetThesis"
          onSelect={handleSelectAssetThesis}
          onCancel={onClose}
          renderItem={(thesis) => (
            <div>
              <div className="font-medium">{thesis.title}</div>
              {thesis.ticker && <span className="text-xs">{thesis.ticker}</span>}
            </div>
          )}
        />
      }
    />
  );
}
```

## Migration Checklist

### Dialogs to Migrate (7 remaining)

- [ ] LinkStrategiesToViewDialog (src/components/asset-theses/)
  - Currently: Simple dropdown
  - Add: CreateAssetThesisForm tab
  
- [ ] LinkToViewDialog (src/components/strategies/)
  - Currently: Search with filters
  - Add: CreateAssetThesisForm tab

- [ ] LinkToThesisDialog (src/components/asset-theses/)
  - Currently: Search with filters
  - Add: CreateMacroThesisForm tab

- [ ] HierarchyBreadcrumb - Strategy linking
  - Currently: LinkToViewDialog
  - Migrate to UnifiedLinkingDialog

- [ ] HierarchyBreadcrumb - Asset thesis linking
  - Currently: LinkToThesisDialog
  - Migrate to UnifiedLinkingDialog

- [ ] Claims browser linking (if applicable)
  - Check ConvertClaimToEntityDialog pattern
  - May need separate handling

### Migration Steps

1. **Identify the dialog to migrate**
   - Note: sourceType, sourceId, targetType
   - Note: what API call performs the link

2. **Create wrapper component**
   ```typescript
   export function YourDialog({ sourceId, sourceTitle, isOpen, onClose }) {
     if (!isOpen) return null;
     return <UnifiedLinkingDialog ... />;
   }
   ```

3. **Implement handleSelect function**
   ```typescript
   const handleSelect = async (targetId: string) => {
     const response = await fetch(`/api/${sourceType}/${sourceId}`, {
       method: 'PATCH',
       body: JSON.stringify({ [targetIdField]: targetId }),
     });
     if (!response.ok) throw new Error('...');
     router.refresh();
     onClose();
   };
   ```

4. **Create renderItem function**
   ```typescript
   renderItem={(item) => (
     <div>
       <div className="font-medium">{item.title}</div>
       {/* Custom fields, badges, etc */}
     </div>
   )}
   ```

5. **Set autoLinkContext if applicable**
   - For parent → child links, provide parent ID
   - Example: Macro Thesis → Asset Thesis, pass macroThesisId

6. **Test both tabs**
   - Tab 1: Search and link existing
   - Tab 2: Create new and verify auto-link

7. **Clean up old dialog file** (optional)
   - Keep for reference or delete

## Best Practices

### Auto-linking Logic

When creating new entities that should link to the source:

1. **Pass autoLinkContext**
   ```typescript
   autoLinkContext={{ macroThesisId: thesis.id }}
   ```

2. **Form receives context**
   - CreateAssetThesisForm: Receives macroThesisId prop
   - Includes it in POST body

3. **UnifiedLinkingDialog handles additional links**
   - After POST (create), may do additional PATCH (link)
   - Example: Strategy needs both assetThesisId AND macroThesisId

### Rendering Entity Items

Keep renderItem simple and scannable:

```typescript
renderItem={(item) => (
  <div className="space-y-1">
    {/* Primary info */}
    <div className="font-medium text-slate-900">{item.title}</div>
    
    {/* Secondary info */}
    <div className="flex items-center gap-2 text-xs">
      {item.ticker && <span className="font-mono">{item.ticker}</span>}
      {item.direction && <Badge>{item.direction}</Badge>}
      {item.status && <Badge variant="outline">{item.status}</Badge>}
    </div>
  </div>
)}
```

### Error Handling

Forms handle their own errors. The `onSelect` function should throw errors:

```typescript
const handleSelect = async (id: string) => {
  const response = await fetch(...);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to link'); // ExistingEntityList catches and displays
  }
  router.refresh();
  onClose();
};
```

## Testing

### Manual Test Checklist

For each migrated dialog:

- [ ] Tab 1: Link to Existing
  - [ ] Search works
  - [ ] List renders correctly
  - [ ] Select button works
  - [ ] Link persists after refresh
  - [ ] Error handling works

- [ ] Tab 2: Create New
  - [ ] Form validation works
  - [ ] Required fields enforced
  - [ ] Auto-generated title displays
  - [ ] Submit creates entity
  - [ ] Entity auto-links to source
  - [ ] Error handling works

- [ ] General
  - [ ] Close button works
  - [ ] Tabs switch smoothly
  - [ ] Loading states display
  - [ ] Router refresh updates UI

## Future Enhancements

### Potential Additions

1. **Bulk Linking**
   - Select multiple entities to link at once
   - Useful for linking multiple strategies to one asset thesis

2. **Advanced Filters**
   - Add filters in ExistingEntityList
   - Date ranges, statuses, etc.

3. **Recent Items**
   - Show recently created/linked items at top
   - LocalStorage tracking

4. **Keyboard Shortcuts**
   - Tab/Shift+Tab to switch tabs
   - Cmd+K for search focus
   - Enter to submit forms

5. **Validation Improvements**
   - Real-time validation as user types
   - Field-level error messages
   - Async validation (e.g., duplicate ticker check)

## Related Files

**Core Components:**
- `src/components/linking/UnifiedLinkingDialog.tsx`
- `src/components/linking/ExistingEntityList.tsx`
- `src/components/linking/CreateMacroThesisForm.tsx`
- `src/components/linking/CreateAssetThesisForm.tsx`

**Example Migration:**
- `src/components/theses/LinkAssetThesesToMacroDialog.tsx`

**API Endpoints:**
- `src/app/api/theses/create/route.ts`
- `src/app/api/asset-theses/create/route.ts`
- `src/app/api/underlyings/route.ts`

**Documentation:**
- `docs/unified-linking-system.md` (this file)
- `docs/20251230-enhancements.md` (original requirements)

## Questions?

If you encounter issues during migration, check:
1. Are props correctly mapped (sourceType, targetType)?
2. Is handleSelect calling the right API endpoint?
3. Is autoLinkContext set for parent→child links?
4. Does the API route support PATCH with the field you're sending?
5. Is renderItem returning valid JSX?

