# Obsidian Templates

This directory contains templates for creating new entities in Obsidian that sync with Supabase.

## Available Templates

### Database Sync Templates
1. **main-claim-template.md** - For creating main claims (Toulmin framework)
2. **macro-thesis-template.md** - For creating macro theses (cross-asset beliefs)
3. **asset-view-template.md** - For creating asset views (ticker-specific theses)
4. **research-artifact-template.md** - For creating raw research artifacts

### Research Pipeline Templates (Local Only)
These templates are used by the research playbook pipeline (see `research-playbook-v1.1.md`):

5. **pipeline-meta-template.yaml** - Idea metadata tracking (stage, status, confidence history)
6. **stage-2-thesis-template.md** - Theme formalisation (core thesis + failure modes)
7. **stage-3-unknowns-template.md** - Unknown mapping (decision-critical unknowns)
8. **stage-4-evidence-template.md** - Evidence resolution (research findings + synthesis)
9. **stage-5-expression-template.md** - Expression & positioning (value chain + sizing)

## Usage

### In Obsidian (with Templater plugin)

1. Install the Templater community plugin
2. Set template folder to `.templates`
3. Use hotkey or command palette to insert template
4. Fill in frontmatter and content
5. Save file - it will sync to database on next sync

### Manual Usage

1. Copy template file to appropriate directory:
   - Main Claims: `/investing/main-claims/`
   - Macro Theses: `/investing/macro-theses/`
   - Asset Views: `/investing/asset-views/`
   - Research Artifacts: `/investing/research/transcripts/`

2. Rename file with YYYY-MM-DD prefix + descriptive name:
   - Format: `YYYY-MM-DD-descriptive-name.md`
   - Example: `2025-12-28-bullish-tsla.md`
   - Use lowercase and hyphens

3. Fill in frontmatter:
   - Leave `id` blank (auto-generated on sync)
   - Set `created_at` and `updated_at` to current timestamp
   - Fill in required fields per template

4. Write content following template structure

5. Save and sync

## Frontmatter Guidelines

### Required Fields (vary by template)
- `type` - Entity type (main_claim, macro_thesis, asset_view, research_artifact)
- `created_at` - ISO 8601 timestamp
- `updated_at` - ISO 8601 timestamp
- `sync_source` - Where this record originated (obsidian or database)

### Type-Specific Required Fields
- **Main Claim**: `category`, `status`
- **Macro Thesis**: `thesis_type`
- **Asset View**: `ticker`
- **Research Artifact**: `source_type`, `title`

### Field Formats
- **Dates**: ISO 8601 (`2025-12-28T15:18:42.055Z`) or YYYY-MM-DD
- **Arrays**: YAML array syntax (`[]` or `- item`)
- **Enums**: Use exact lowercase values (e.g., `bullish` not `Bullish`)

## Template Placeholders

Templates use these placeholders:
- `{{date}}` - Current date (if using Templater)
- `<placeholders>` - Replace with actual content
- `YYYY-MM-DD` - Date format examples

## Validation

Before syncing, ensure:
1. All required frontmatter fields are filled
2. Enum fields use valid values
3. YAML syntax is valid (no tabs, correct indentation)
4. File is in correct directory
5. Filename follows conventions (lowercase, hyphens, no special chars)

## Sync Behavior

When you save a file:
1. Obsidian file watcher detects change
2. File is parsed and validated
3. Data is synced to Supabase
4. `last_synced_at` is updated
5. If `id` was blank, it's filled in from database

## Troubleshooting

**Sync Failed**: Check frontmatter for YAML syntax errors
**Missing Fields**: Ensure all required fields are present
**Invalid Values**: Check enum fields match allowed values
**Conflict**: Both file and database modified - manual resolution needed

## See Also

- `/docs/obsidian-templates.md` - Full template documentation
- `/docs/features/research-workflow.md` - Research workflow guide
- `/src/lib/obsidian/` - Sync implementation code
