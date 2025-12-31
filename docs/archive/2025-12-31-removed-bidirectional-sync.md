# Removed Bidirectional Obsidian Sync

**Date**: 2025-12-31
**Status**: Complete

## Summary

Removed all bidirectional sync infrastructure between Obsidian and Supabase. **Supabase is now the single source of truth** for all entities (main claims, macro theses, asset theses).

## Rationale

The bidirectional sync added significant complexity with minimal benefit:
- **Linking mismatch**: Supabase uses UUIDs, Obsidian uses backlinks (note titles)
- **Maintenance burden**: Duplicate linking logic that breaks on title/filename changes
- **Complexity**: File watchers, sync state cache, conflict detection, etc.
- **Failure points**: File watcher crashes, sync conflicts, race conditions

**Better approach**: Local-first Markdown processing → one-way upload to Supabase → manage in web UI.

## What Was Removed

### 1. NPM Dependencies
- `chokidar` - File watching library
- `@types/chokidar` - TypeScript types

### 2. File Watcher Infrastructure (3 files)
- `src/lib/obsidian/watcher.ts` - Chokidar file watcher
- `src/lib/obsidian/syncState.ts` - Sync state cache management
- `src/instrumentation.ts` - Auto-start watcher on server boot

### 3. Sync Services (2 files)
- `src/lib/obsidian/sync.ts` - Bidirectional sync logic (Obsidian ↔ DB)
- `src/lib/obsidian/hooks.ts` - Post-save sync hooks

### 4. Sync API Routes (5 routes)
- `src/app/api/sync/watcher/route.ts` - Start/stop watcher
- `src/app/api/sync/obsidian/file/route.ts` - Manual file sync
- `src/app/api/sync/obsidian/scan/route.ts` - Scan Obsidian vault
- `src/app/api/sync/database/to-obsidian/route.ts` - DB → Obsidian sync
- `src/app/api/sync/force-sync-all/route.ts` - Bulk sync

### 5. Sync UI Components (2 files)
- `src/app/admin/sync/page.tsx` - Admin sync dashboard page
- `src/components/sync/SyncDashboard.tsx` - Dashboard component

### 6. Sync Hook Calls (3 locations)
- `src/app/api/research/promote-claim/route.ts` - Removed `afterMainClaimSave()` call
- `src/app/api/research/convert-claim/route.ts` - Removed `afterMacroThesisSave()` and `afterAssetThesisSave()` calls

### 7. Navigation Updates (2 files)
- `src/components/layout/AppSidebar.tsx` - Removed "Obsidian Sync" menu item
- `src/components/layout/DashboardShell.tsx` - Removed "admin-sync" from NavKey type

### 8. Scripts (1 file)
- `scripts/sync-all-main-claims.ts` - Bulk sync script

### 9. Environment Variables
- Removed: `OBSIDIAN_SYNC_ENABLED`
- Kept: `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_*_DIR` (used by skills for local file output)

### 10. Documentation Updates
- `CLAUDE.md` - Updated research workflow section, removed sync references
- `docs/features/research-workflow.md` - Removed "Bidirectional Sync" section, updated workflow description
- `.gitignore` - Removed `.obsidian-sync-state.json` entry

## What Was Kept

### Local Research Processing (✅ Still Works)
All Claude Code skills for local Markdown generation:
- `/process-transcript` - Extract Toulmin claims → local Markdown
- `/synthesize-claims` - Cross-reference claims against DB
- `/deep-dive` - Collaborative analysis
- `/finalize-for-upload` - Upload to Supabase (one-way)

### Markdown Generation Library
- `src/lib/obsidian/markdown.ts` - Used by skills to write local Markdown files
  - Can be repurposed for future manual export feature

### Environment Variables (for local processing)
```bash
OBSIDIAN_VAULT_PATH=/Users/njb/Desktop/nick
OBSIDIAN_TRANSCRIPTS_DIR=investing/research/transcripts
OBSIDIAN_AUDITS_DIR=investing/research/audits
OBSIDIAN_SYNTHESES_DIR=investing/research/syntheses
OBSIDIAN_DEEP_DIVES_DIR=investing/research/deep-dives
```

Skills use these to determine where to write local Markdown files.

## New Workflow

### Before (Bidirectional Sync)
```
1. Local: /process-transcript → audit.md (writes to Obsidian)
2. Local: /finalize-for-upload → uploads to Supabase
3. App: Create/edit thesis in Supabase
4. Auto-sync: DB → Obsidian (writes to vault)
5. Obsidian: Edit file
6. Auto-sync: Obsidian → DB (updates Supabase)
```

### After (Supabase as Single Source of Truth)
```
1. Local: /process-transcript → audit.md (writes to local directory)
2. Local: /finalize-for-upload → uploads to Supabase
3. App: Create/edit thesis in Supabase ← CANONICAL
4. (Optional) Manual export: Copy/paste from UI when needed
5. Work in local Markdown for processing only
6. Re-upload via /finalize-for-upload if needed
```

## Benefits

✅ **Eliminates linking complexity** - No more UUID ↔ backlink translation  
✅ **Simpler mental model** - Supabase = truth, local files = staging  
✅ **Fewer failure points** - No file watcher crashes, sync conflicts  
✅ **Cleaner codebase** - ~2000 lines of sync code removed  
✅ **Keeps local research workflow** - Markdown processing still works perfectly  
✅ **Easier maintenance** - No duplicate linking logic to maintain  

## Files Deleted

**Total: 13 files + 1 directory**

1. `src/lib/obsidian/watcher.ts`
2. `src/lib/obsidian/syncState.ts`
3. `src/lib/obsidian/sync.ts`
4. `src/lib/obsidian/hooks.ts`
5. `src/instrumentation.ts`
6. `src/app/api/sync/` (entire directory with 5 route files)
7. `src/app/admin/sync/page.tsx`
8. `src/components/sync/SyncDashboard.tsx`
9. `scripts/sync-all-main-claims.ts`

## Lines of Code Removed

- **Sync infrastructure**: ~1500 lines
- **UI components**: ~300 lines
- **API routes**: ~400 lines
- **Hook calls**: ~20 lines
- **Total**: ~2200 lines removed

## Migration Notes

**No database migration needed** - All database tables remain unchanged. Only removed application-layer sync logic.

**No user action required** - Existing data in Supabase is unaffected. Users can continue using the web UI normally.

**Skills still work** - All Claude Code skills continue to function. They write local Markdown files, which are then uploaded via `/finalize-for-upload`.

## Future Considerations

### Optional: Manual Export Feature
Could add one-way export (DB → Markdown download) for manual use:

```typescript
// /src/app/api/export/macro-thesis/[id]/route.ts
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const thesis = await db.select().from(macroTheses).where(eq(macroTheses.id, params.id));
  const markdown = generateThesisMarkdown(thesis); // Use existing markdown.ts
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown',
      'Content-Disposition': `attachment; filename="thesis-${thesis.title}.md"`,
    },
  });
}
```

**Status**: Deferred - not currently needed. Users can copy/paste from UI when needed.

## Related Documentation

- [Research Workflow Guide](../features/research-workflow.md) - Updated to reflect new workflow
- [CLAUDE.md](../../CLAUDE.md) - Updated research workflow section
- [PRD v1.1](../PRD_v1.1.md) - System vision (unchanged)
- [Terminology Guide](../terminology.md) - Term definitions (unchanged)

---

**Document Status**: Historical record of architectural simplification

