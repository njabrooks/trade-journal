# Template Systems Overview

**Updated**: 2025-12-28

## Two Template Systems (No Conflict)

You have **two separate template systems** that serve different purposes:

### 1. Personal Knowledge Management Templates
**Location**: `/Users/njb/Desktop/nick/templates/`

**Purpose**: General PKM and knowledge management
**Database**: Not database-backed
**Scope**: Personal learning, claims from any domain

**Templates**:
- `Claim.md` - General claims (facts, hypotheses, beliefs, predictions)
- `Content.md` - General content tracking
- `Transcript.md` - Podcast/video transcripts

**Schema**:
```yaml
claim_type: "fact | hypothesis | belief | principle | prediction"
domain: "health | business | technology | relationships | finance | learning | other"
confidence: "high | medium | low"
status: "active | verified | disputed | archived"
```

**Use When**: Processing general knowledge, podcasts, books, or personal learning

---

### 2. Investment Research Templates ⭐️ (New)
**Location**: `/Users/njb/Desktop/nick/investing/templates/`

**Purpose**: Investment research workflow (Supabase-backed)
**Database**: Fully integrated with Supabase
**Scope**: Investment research only (theses, views, claims)

**Templates**:
- `main-claim-template.md` - Toulmin framework claims (macro/asset-specific)
- `macro-thesis-template.md` - Cross-asset beliefs (secular/cyclical/structural)
- `asset-view-template.md` - Ticker-specific theses
- `research-artifact-template.md` - Raw transcripts, articles, papers

**Schema**:
```yaml
type: main_claim | macro_thesis | asset_view | research_artifact
category: macro | asset_specific  # for claims
thesis_type: secular | cyclical | structural  # for theses
ticker: TSLA  # for asset views
```

**Use When**: Investment research workflow, syncing with your trading journal database

---

## File Naming Convention ✅ Updated

**All investment research files now use YYYY-MM-DD prefix for consistent chronological sorting.**

### Before (Inconsistent)
```
✅ research/audits/2025-12-21-apps-to-agents-audit.md
✅ research/transcripts/2025-12-21-apps-to-agents.md
❌ main-claims/ai-adoption-will-drive-pmi-expansion.md (no date)
❌ macro-theses/bullish-ai-supply-chains-in-2026.md (no date)
❌ asset-views/bullish-tsla.md (no date)
```

### After (Consistent) ⭐️
```
✅ research/audits/2025-12-21-apps-to-agents-audit.md
✅ research/transcripts/2025-12-21-apps-to-agents.md
✅ main-claims/2025-12-28-ai-adoption-will-drive-pmi-expansion.md
✅ macro-theses/2025-12-28-bullish-ai-supply-chains-in-2026.md
✅ asset-views/2025-12-28-bullish-tsla.md
```

### Naming Rules

**Format**: `YYYY-MM-DD-descriptive-name.md`

**Date Source**:
- **Main Claims**: `created_at` field from frontmatter
- **Macro Theses**: `created_at` field from frontmatter
- **Asset Views**: `created_at` field from frontmatter
- **Research Artifacts**: `published_date` (or `created_at` if missing)
- **Research Insights**: `audit_date` field

**Benefits**:
- ✅ Chronological sorting in file explorers
- ✅ Easy to find recent research
- ✅ Clear temporal context at a glance
- ✅ Consistent across all entity types
- ✅ Groups related items by date

---

## Type Field in Frontmatter ✅

**All investment research files have a `type` field** in frontmatter:

```yaml
---
type: main_claim          # For claims
type: macro_thesis        # For theses
type: asset_view          # For asset views
type: research_artifact   # For raw content
type: research_insight    # For processed audits
---
```

This field:
- ✅ Identifies entity type for sync system
- ✅ Enables proper database routing
- ✅ Validates against correct schema
- ✅ Determines file location and template

---

## Migration Guide

### Migrating Existing Files to Date-Prefixed Naming

**Step 1: Preview Changes**
```bash
npx tsx scripts/migrate-filenames-add-date-prefix.ts --dry-run
```

**Step 2: Apply Renames**
```bash
npx tsx scripts/migrate-filenames-add-date-prefix.ts
```

**Step 3: Update Sync State** (Important!)
After renaming files, you need to update the sync state cache since file paths changed:

```bash
# Option 1: Clear sync state and re-sync from database
rm -rf .sync-state/  # or wherever sync cache is stored
# Then trigger a full sync from database

# Option 2: Update sync state manually to point to new paths
# (Implementation depends on sync state cache structure)
```

---

## Which Template System Should I Use?

### Use **Personal Knowledge Management** Templates When:
- Processing podcasts, books, or general content
- Extracting claims about health, relationships, learning
- Building personal knowledge base
- Not investment-related

**Location**: `/Users/njb/Desktop/nick/templates/`

### Use **Investment Research** Templates When:
- Processing investment research (transcripts, articles, papers)
- Creating macro theses or asset views
- Extracting claims for investment decisions
- Syncing with trading journal database

**Location**: `/Users/njb/Desktop/nick/investing/templates/`

---

## Quick Reference

| Aspect | PKM Templates | Investment Templates |
|--------|---------------|---------------------|
| **Location** | `/nick/templates/` | `/nick/investing/templates/` |
| **Database** | Not synced | Supabase-backed |
| **Naming** | No date prefix | `YYYY-MM-DD-` prefix |
| **Type Field** | No | Yes (required) |
| **Scope** | General knowledge | Investment research |
| **Schema** | Custom PKM | Matches Supabase schema |

---

## Summary

✅ **Type Field**: Present in all investment research frontmatter
✅ **YYYY-MM-DD Prefix**: Now implemented for all entity types
✅ **Template Conflict**: No conflict - two systems serve different purposes
✅ **Code Updated**: `generateFilepath()` now adds date prefix automatically
✅ **Migration Script**: Ready to rename existing files

**Next Steps**:
1. Run migration script to rename existing files
2. Update sync state cache after rename
3. Use date-prefixed naming for all new files
4. Continue using both template systems for their intended purposes
