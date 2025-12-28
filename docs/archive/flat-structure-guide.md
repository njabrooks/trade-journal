# Flat Directory Structure Guide

**Updated**: 2025-12-28

## New Structure Overview

All files are now in a **single `investing/` folder** with type prefixes in filenames for easy filtering and organization.

### Before (Nested Folders)
```
investing/
  main-claims/
    ai-adoption-pmi-expansion.md
  macro-theses/
    bullish-ai-supply-chains.md
  asset-views/
    bullish-tsla.md
  research/
    transcripts/
      apps-to-agents.md
    audits/
      apps-to-agents-audit.md
```

### After (Flat Structure) ✅
```
investing/
  2025-12-28-main-claim-ai-adoption-pmi-expansion.md
  2025-12-28-macro-thesis-bullish-ai-supply-chains.md
  2025-12-28-asset-view-bullish-tsla.md
  2025-12-21-transcript-apps-to-agents.md
  2025-12-21-audit-apps-to-agents-audit.md
```

---

## Filename Format

**Format**: `YYYY-MM-DD-{type}-{title}.md`

**Type Prefixes**:
- `main-claim` - Toulmin framework claims
- `macro-thesis` - Cross-asset theses
- `asset-view` - Asset-specific views
- `transcript` - Research transcripts
- `audit` - Processed audits/insights
- `synthesis` - Research syntheses
- `deep-dive` - Deep dive analyses

**Examples**:
```
2025-12-28-main-claim-ai-will-drive-pmi-expansion.md
2025-12-28-macro-thesis-bullish-ai-supply-chains.md
2025-12-28-asset-view-bullish-tsla-robotaxi.md
2025-12-21-transcript-from-apps-to-agents.md
2025-12-21-audit-apps-to-agents-analysis.md
```

---

## Benefits

### ✅ Simpler Organization
- One folder instead of 7+ nested folders
- No need to remember which folder to put things in
- Easier to navigate

### ✅ Chronological Sorting
- All files sorted by date automatically
- Easy to find recent work
- Clear timeline view

### ✅ Type-Based Filtering
- Use Obsidian search: `path:investing main-claim`
- Filter by type: `path:investing macro-thesis`
- Combine filters: `path:investing main-claim 2025-12`

### ✅ Database-Agnostic
- Type field in frontmatter is source of truth
- Filename type prefix is for human readability
- Easy to query in Obsidian

---

## Filtering in Obsidian

### View by Type

**Main Claims Only**:
```
path:investing main-claim
```

**Macro Theses Only**:
```
path:investing macro-thesis
```

**Asset Views Only**:
```
path:investing asset-view
```

**Research Content** (transcripts, audits):
```
path:investing (transcript OR audit)
```

### View by Date Range

**December 2025**:
```
path:investing 2025-12
```

**This Year**:
```
path:investing 2025
```

**Specific Day**:
```
path:investing 2025-12-28
```

### Combined Filters

**Main Claims from December**:
```
path:investing main-claim 2025-12
```

**Asset Views for TSLA**:
```
path:investing asset-view tsla
```

---

## Migration Process

### Step 1: Backup (Recommended)
```bash
# Backup current structure
cp -r /Users/njb/Desktop/nick/investing /Users/njb/Desktop/nick/investing_backup
```

### Step 2: Preview Migration
```bash
npx tsx scripts/migrate-to-flat-structure.ts --dry-run
```

Review the output to ensure filenames look correct.

### Step 3: Apply Migration
```bash
npx tsx scripts/migrate-to-flat-structure.ts
```

This will:
1. Move all files to `investing/` root
2. Add type prefix to each filename
3. Preserve dates from existing filenames

### Step 4: Clean Up Empty Folders
```bash
# From vault root
cd /Users/njb/Desktop/nick/investing
rm -rf main-claims/ macro-theses/ asset-views/
rm -rf research/transcripts/ research/audits/ research/syntheses/ research/deep-dives/
rmdir research/  # Only if empty
```

### Step 5: Verify
1. Open Obsidian
2. Check `investing/` folder
3. Verify all files present with correct names
4. Test search filters
5. Check that frontmatter `type` field matches filename prefix

---

## Creating New Files

### Manual Creation

**Format**: Always use `YYYY-MM-DD-{type}-{title}.md`

**Example**:
1. Create file: `investing/2025-12-28-asset-view-bullish-nvda.md`
2. Add frontmatter:
   ```yaml
   ---
   type: asset_view
   ticker: NVDA
   created_at: 2025-12-28T15:00:00.000Z
   ---
   ```
3. Write content

### Using Templates

Templates are in `investing/templates/` folder:

1. **Copy template** to `investing/`
2. **Rename** with format: `YYYY-MM-DD-{type}-{title}.md`
3. **Fill in content**
4. **Save**

**Example**:
```bash
# Copy template
cp investing/templates/asset-view-template.md investing/2025-12-28-asset-view-bullish-nvda.md

# Edit in Obsidian
# Fill frontmatter and content
# Save
```

---

## Frontmatter Requirements

**Type field is mandatory** and must match filename prefix:

| Filename Prefix | Frontmatter Type |
|----------------|------------------|
| `main-claim-` | `type: main_claim` |
| `macro-thesis-` | `type: macro_thesis` |
| `asset-view-` | `type: asset_view` |
| `transcript-` | `type: research_artifact` |
| `audit-` | `type: research_insight` |

**Example Frontmatter**:
```yaml
---
id: <uuid>
type: asset_view
ticker: TSLA
direction: bullish
created_at: 2025-12-28T15:00:00.000Z
updated_at: 2025-12-28T15:00:00.000Z
---
```

---

## Obsidian Configuration

### Excluded Folders

Add to `.obsidian/app.json` to hide non-content folders:
```json
{
  "userIgnoreFilters": [
    "templates/",
    "research/",
    "main-claims/",
    "macro-theses/",
    "asset-views/"
  ]
}
```

(Only if you keep old folders around for reference)

### Search Suggestions

Create saved searches in Obsidian:

1. **Recent Main Claims**: `path:investing main-claim 2025-12`
2. **All Theses**: `path:investing macro-thesis`
3. **Asset Views**: `path:investing asset-view`
4. **Research Content**: `path:investing (transcript OR audit)`

---

## Troubleshooting

### Files Not Showing in Obsidian

**Check**:
1. Files are in `investing/` root (not nested)
2. Filenames have correct format
3. Files have `.md` extension
4. Refresh Obsidian (Cmd+R / Ctrl+R)

### Type Mismatch

**Issue**: Filename says `main-claim` but frontmatter says `type: macro_thesis`

**Fix**:
```bash
# Run validation
/validate-templates

# Or manually update frontmatter
type: main_claim  # Match filename prefix
```

### Sync Issues

**Issue**: Database sync not working after migration

**Fix**:
1. Clear sync state cache
2. Run `/validate-templates`
3. Force re-sync from database

---

## FAQ

### Q: What if I want to go back to nested folders?

A: You can, but it's not recommended. The flat structure is simpler and more maintainable.

To revert:
1. Create folder structure
2. Move files based on type prefix
3. Remove type prefix from filenames
4. Update `.env.local` directories

### Q: Can I use subfolders for organization?

A: Yes, but it defeats the purpose of the flat structure. Better to use:
- Tags in frontmatter
- Obsidian search filters
- Dataview queries

### Q: How do I find all files for a specific ticker?

**Search**:
```
path:investing asset-view ticker:TSLA
```

Or use Dataview:
```dataview
LIST
FROM "investing"
WHERE type = "asset_view" AND ticker = "TSLA"
```

### Q: What about very old files?

Migration script uses `created_at` from frontmatter. If missing, uses current date. You can manually fix dates after migration.

---

## Summary

✅ **Single folder**: Everything in `investing/`
✅ **Type in filename**: `YYYY-MM-DD-{type}-{title}.md`
✅ **Easy filtering**: Use Obsidian search by type
✅ **Chronological**: Automatic date sorting
✅ **Simple**: No nested folder structure to maintain

**Next Steps**:
1. Backup current structure
2. Run migration script
3. Delete empty folders
4. Test Obsidian search filters
5. Create new files with flat structure format
