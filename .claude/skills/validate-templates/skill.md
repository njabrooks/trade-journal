# Skill: validate-templates

**Type**: managed
**Invoke**: `/validate-templates`
**Description**: Validate and fix Obsidian markdown template issues

## Purpose

This skill validates all Obsidian markdown files against template schemas and auto-fixes common issues:
- Missing `ticker` field in asset views
- JSONB notes field issues in macro theses
- "undefined" values in frontmatter
- Invalid enum values
- Missing required fields

## When to Use

Invoke this skill when:
- You notice formatting issues in Obsidian files
- Files show "undefined" or "[object Object]" in the body
- After creating new entities manually
- Before syncing files to database
- Periodically to maintain data quality

## What It Does

1. **Validates** all markdown files in the Obsidian vault
2. **Identifies** schema mismatches and formatting issues
3. **Auto-fixes** common problems:
   - Extracts missing tickers from file titles/content
   - Converts JSONB objects to strings
   - Removes undefined values
4. **Reports** validation results with detailed errors/warnings

## Usage

```bash
/validate-templates
```

Optional: Validate only (no fixes):
```bash
/validate-templates --validate-only
```

## Output

The skill will:
1. Run validation script
2. Show summary of issues found
3. Apply auto-fixes (unless --validate-only)
4. Re-validate to confirm fixes
5. Report final status

## Example

```
User: /validate-templates

Claude:
🔍 Validating Obsidian templates...

Found 8 markdown files
Issues detected:
  - 1 asset view missing ticker
  - 1 macro thesis with JSONB notes issue

🔧 Applying auto-fixes...
  ✅ Added ticker: TSLA
  ✅ Converted notes object to string

✅ All issues resolved!
```

## Implementation

The skill uses:
- `/scripts/validate-obsidian-templates.ts` - Schema validation
- `/scripts/fix-obsidian-templates-simple.ts` - Auto-fix common issues
