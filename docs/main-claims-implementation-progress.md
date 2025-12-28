# Main Claims Implementation Progress

**Plan File**: `/Users/njb/.claude/plans/agile-whistling-shamir.md`

**Last Updated**: 2025-01-28

## Quick Reference

### Environment Configuration
```bash
# Obsidian Vault Integration (.env.local)
OBSIDIAN_VAULT_PATH=/Users/njb/Desktop/nick
OBSIDIAN_SYNC_ENABLED=true
OBSIDIAN_SYNC_MODE=polling
OBSIDIAN_SYNC_INTERVAL_MINUTES=5

# Obsidian Content Directories (relative to OBSIDIAN_VAULT_PATH)
OBSIDIAN_TRANSCRIPTS_DIR=investing/research/transcripts
OBSIDIAN_AUDITS_DIR=investing/research/audits
OBSIDIAN_SYNTHESES_DIR=investing/research/syntheses
OBSIDIAN_DEEP_DIVES_DIR=investing/research/deep-dives
OBSIDIAN_MAIN_CLAIMS_DIR=investing/main-claims
OBSIDIAN_MACRO_THESES_DIR=investing/macro-theses
OBSIDIAN_ASSET_VIEWS_DIR=investing/asset-views
```

### Database Schema Status
✅ All migrations applied successfully

**New Tables**:
- `main_claims` - First-class claim entities with Toulmin structure
- `main_claim_evidence` - Junction table linking supporting claims to main claims
- `claim_thesis_mappings` - Many-to-many relationships between claims and theses/views

**Enhanced Tables**:
- `macro_theses` - Added: direction, positionStartDate, positionEndDate, outcome fields
- `asset_views` - Added: direction, positionStartDate, positionEndDate, targetPrice, outcome fields

### Obsidian Vault Structure
```
/Users/njb/Desktop/nick/
├── investing/
│   ├── main-claims/          # First-class main claim markdown files
│   ├── macro-theses/          # Macro thesis markdown files
│   ├── asset-views/           # Asset view markdown files
│   └── research/
│       ├── transcripts/       # Original transcripts
│       ├── audits/            # Processed audits with claims_structure JSONB
│       ├── syntheses/         # Synthesis documents (claim → hierarchy mapping)
│       └── deep-dives/        # Deep dive analyses
```

## Implementation Status

**🎉 IMPLEMENTATION COMPLETE** (2025-12-28)

All core phases finished. Main claims architecture is production-ready:
- ✅ Phase 1: Database Schema
- ✅ Phase 2: API Routes
- ✅ Phase 3: UI Components
- ✅ Phase 4: Skills Prompts
- ⏭️ Phase 5: Data Migration (skipped - manual)
- ✅ Phase 6: Obsidian Sync

---

### ✅ Phase 1: Database Schema (COMPLETE)
**Week 1** - Completed

**Files Modified**:
- ✅ `src/db/schema.ts` - Added 3 new tables, enhanced 2 existing tables
- ✅ Applied migrations via Supabase MCP

**Key Details**:
- Using Drizzle ORM with PostgreSQL (Supabase)
- All tables use UUID primary keys
- Timestamps use `.defaultNow()` for database-level defaults
- Date fields return strings (Drizzle `date()` type)
- Numeric fields require string values (Drizzle `numeric()` type)

---

### ✅ Phase 2: API Routes (COMPLETE)
**Week 1-2** - Completed

**New API Routes**:
- ✅ `/api/research/promote-claim/route.ts` - Promote audit claim to main_claims table
- ✅ `/api/research/link-evidence/route.ts` - Link supporting claims to main claims
- ✅ `/api/research/link-claim-to-thesis/route.ts` - Link main claims to theses/views

**Key Implementation Notes**:
- All routes return JSON with `{ success, ... }` format
- Use Drizzle `.insert().values().returning()` pattern
- No explicit `createdAt`/`updatedAt` setting (database handles via defaults)
- Numeric fields converted to strings before DB insert

---

### ✅ Phase 6: Obsidian Sync (COMPLETE)
**Week 1-2** - Completed (elevated priority per user preference)

**UPDATE 2025-12-28**: Skills updated to use configurable Obsidian paths

**New Files**:
- ✅ `src/lib/obsidian/markdown.ts` - Frontmatter parsing, markdown generation, wikilink extraction
- ✅ `src/lib/obsidian/sync.ts` - Bidirectional sync logic with conflict detection
- ✅ `src/app/api/sync/obsidian/scan/route.ts` - Scan entire vault
- ✅ `src/app/api/sync/obsidian/file/route.ts` - Sync single file (for file watcher)
- ✅ `src/app/api/sync/database/to-obsidian/route.ts` - Export DB entities to markdown

**Sync Mechanism**:
- **Mode**: Polling (every 5 minutes via cron or manual trigger)
- **Conflict Detection**: Timestamp-based last-write-wins
- **Frontmatter**: YAML with id, type, timestamps, sync_source
- **Wikilinks**: Extracted via regex `\[\[([^\]]+)\]\]`

**Critical Fixes Applied**:
- Use Drizzle-inferred types (`MainClaim`, `MacroThesis`, `AssetView` from schema)
- Date fields: No `.toISOString()` (already strings from Drizzle)
- Numeric fields: Convert to strings (`String(value)`)
- Null → undefined for optional fields (`|| undefined`)
- Remove explicit timestamp setting (use DB defaults)

**Skills Updated for Obsidian Integration** (2025-12-28):
- All file paths now configurable via `.env.local` environment variables
- Skills read `OBSIDIAN_*_DIR` vars to construct full paths to Obsidian vault
- Updated skills: `/process-transcript`, `/synthesize-claims`, `/deep-dive`, `/finalize-for-upload`
- Fallback to project-local `research-workspace/` if env vars not set
- Created missing directories: `syntheses/`, `deep-dives/` in Obsidian vault

---

### ✅ Phase 3: UI Components (COMPLETE)
**Week 2** - Completed 2025-12-28

**Components Created**:
- ✅ `PromoteClaimDialog.tsx` (new) - Dialog for promoting audit claims to main_claims table
- ✅ `MainClaimCard.tsx` (new) - Display first-class main claims with evidence counts
- ✅ `MainClaimEvolutionView.tsx` (new) - Timeline view of evidence accumulation
- ✅ `ClaimsBrowser.tsx` (updated) - Added "Promote" button alongside "Convert"
- ✅ `ConvertClaimDialog.tsx` (updated) - Added directional fields (direction, dates, sectors, prices)

**Build Status**: ✅ All components pass TypeScript compilation

---

### ✅ Phase 4: Skills Prompts (COMPLETE)
**Week 2** - Completed 2025-12-28

**Skills Updated**:
- ✅ `/synthesize-claims` - MAJOR update:
  - Added queries for main_claims table
  - New section 1: Promotion recommendations (which claims to promote)
  - New section 2: Evidence linking recommendations (link to existing main claims)
  - Existing section 3: Thesis/view recommendations (updated)
  - Outputs promotion criteria and linking criteria

- ✅ `/deep-dive` - MINOR update:
  - Added queries for main_claims table in Step 1
  - Added option to "STRENGTHEN existing main claim"
  - Added evidence development path for main claim strengthening

- ✅ `/finalize-for-upload` - MINOR update:
  - Updated frontmatter examples for macro_theses (added direction, dates, sectors)
  - Updated frontmatter examples for asset_views (added direction, dates, target_price)

- ✅ `/process-transcript` - NO UPDATE NEEDED:
  - Terminology already correct (main claims vs evidence claims)

**Priority**: MEDIUM → COMPLETE

---

### ⏭️ Phase 5: Data Migration (SKIPPED)
**Week 3** - Skipped (manual migration)

**Migration Tasks** (to be done manually as needed):
- Extract high-quality main claims from existing `research_insights.claims_structure` JSONB
- Promote to `main_claims` table via UI "Promote" button
- Link supporting claims via `main_claim_evidence`
- Backfill `direction` on existing theses/views (default: 'neutral')

**Rationale**: Few existing records; manual promotion via UI is faster than scripted migration.

**Priority**: LOW (optional)

---

## Workflow Summary

| Stage | Tool | Database | Obsidian Location |
|-------|------|----------|-------------------|
| 1. Process Transcript | `/process-transcript` | `research_insights` | `research/audits/` |
| 2. Promote Main Claims | UI "Promote" button | `main_claims` | `main-claims/` |
| 3. Link Evidence | `/synthesize-claims` | `main_claim_evidence` | (updates main claim files) |
| 4. Create Theses/Views | UI create form | `macro_theses`/`asset_views` | `macro-theses/`/`asset-views/` |

---

## Key Architectural Decisions

1. **Theses/Views = Simple Positions**: Defined by sectors/underlying, direction, timeframe
2. **Main Claims = Qualitative Insights**: Nuanced Toulmin arguments that support multiple theses
3. **Supporting Claims Stay in JSONB**: Only main claims become first-class entities
4. **Polling > File Watcher**: Simpler cross-platform compatibility
5. **Database Defaults for Timestamps**: Leverage `.defaultNow()` instead of application-level setting
6. **Drizzle Type System**: Use schema-inferred types, not custom type definitions

---

## Common Errors & Solutions

### Error: `Cannot find name 'DbMainClaim'`
**Fix**: Use Drizzle-inferred types from schema:
```typescript
import type { MainClaim, MacroThesis, AssetView } from '@/db/schema';
```

### Error: `Property 'toISOString' does not exist on type 'string'`
**Fix**: Drizzle `date()` fields are already strings, don't call `.toISOString()`:
```typescript
position_start_date: thesis.positionStartDate || undefined,
```

### Error: Numeric field type mismatch
**Fix**: Convert numbers to strings for Drizzle `numeric()` type:
```typescript
targetPrice: frontmatter.target_price ? String(frontmatter.target_price) : null,
```

### Error: `'createdAt' does not exist in type...`
**Fix**: Remove explicit timestamp setting (database handles via `.defaultNow()`):
```typescript
const [created] = await db.insert(mainClaims).values(claimData).returning();
```

---

## Next Steps

**Immediate**:
- [ ] Phase 3: Build UI components for claim promotion and browsing
- [ ] Phase 4: Update skill prompts to reflect new architecture
- [ ] Phase 5: Migrate existing data

**Future**:
- [ ] Add file watcher mode (alternative to polling)
- [ ] Implement conflict resolution UI
- [ ] Add batch promotion/linking workflows
- [ ] Create visualization of claim → thesis/view relationships

---

## Build Status

✅ **All TypeScript compilation errors resolved**
✅ **Build successful**: `npm run build` passes
✅ **No runtime errors in sync implementation**

---

## References

- **Plan**: `/Users/njb/.claude/plans/agile-whistling-shamir.md`
- **PRD**: `/Users/njb/Desktop/trade-journal/docs/PRD_v1.1.md`
- **Terminology**: `/Users/njb/Desktop/trade-journal/docs/terminology.md`
- **Schema**: `/Users/njb/Desktop/trade-journal/src/db/schema.ts`
