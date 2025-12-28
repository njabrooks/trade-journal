# How to Use Obsidian Templates

**Updated**: 2025-12-28

## Quick Start

### 1. Templates Are Now Visible in Obsidian! ✅

**Location**: `/investing/templates/` folder

The templates folder is now visible in Obsidian's file explorer (renamed from `.templates` to `templates`).

You can:
- Browse templates directly in Obsidian
- Copy and paste template content
- Use with Templater plugin
- Reference for proper formatting

---

## 2. Use the `/validate-templates` Skill

You can now validate and auto-fix template issues with a simple command:

### Basic Usage

```bash
/validate-templates
```

This will:
1. ✅ Validate all markdown files against schemas
2. 🔧 Auto-fix common issues (missing tickers, undefined values, etc.)
3. 📊 Re-validate and report status

### Validation Only (No Fixes)

```bash
/validate-templates --validate-only
```

This will only report issues without making any changes.

### When to Use

Run `/validate-templates` whenever:
- You manually create new files in Obsidian
- You notice "undefined" or "[object Object]" in file content
- After importing research from external sources
- Before syncing files to database
- Periodically (weekly/monthly) for data quality maintenance

---

## 3. Creating New Entities

### Option A: Using Templater Plugin (Recommended)

1. **Install Templater** (Community Plugin in Obsidian)
   - Settings → Community Plugins → Browse
   - Search "Templater" → Install → Enable

2. **Configure Templater**
   - Settings → Templater → Template folder location
   - Set to: `templates`
   - Enable "Trigger Templater on new file creation" (optional)

3. **Use Template**
   - Create new file in appropriate folder (main-claims, macro-theses, etc.)
   - Use Templater hotkey or command palette
   - Select template
   - Fill in placeholders

### Option B: Manual Copy (Works Immediately)

1. **Navigate to `templates/` folder in Obsidian**
2. **Copy template file**
   - Right-click template → Duplicate
   - Or copy content to new file
3. **Move to correct location**:
   - Main Claims → `/investing/main-claims/`
   - Macro Theses → `/investing/macro-theses/`
   - Asset Views → `/investing/asset-views/`
4. **Rename with date prefix**: `YYYY-MM-DD-descriptive-name.md`
5. **Fill in frontmatter and content**
6. **Save** - sync will auto-populate ID

---

## 4. Template Reference

### Available Templates

All templates in `/investing/templates/`:

1. **main-claim-template.md** - Toulmin framework claims
   - Use for: Investment theses, market beliefs, research claims
   - Required: `type`, `category`, `status`

2. **macro-thesis-template.md** - Cross-asset beliefs
   - Use for: Macro views, sector themes, regime calls
   - Required: `type`, `thesis_type`

3. **asset-view-template.md** - Ticker-specific theses
   - Use for: Stock/asset positions, price targets
   - Required: `type`, `ticker`

4. **research-artifact-template.md** - Raw content
   - Use for: Transcripts, articles, papers
   - Required: `type`, `source_type`, `title`

---

## 5. Common Workflows

### Workflow 1: Processing a New Transcript

1. **Copy `research-artifact-template.md`** to `/research/transcripts/`
2. **Rename**: `YYYY-MM-DD-transcript-title.md`
3. **Fill frontmatter**:
   ```yaml
   source_type: transcript
   title: "Transcript Title"
   source_url: "https://..."
   published_date: "YYYY-MM-DD"
   ```
4. **Paste transcript content**
5. **Save**
6. **Run `/process-transcript`** skill (if available)
7. **Run `/validate-templates`** to ensure formatting

### Workflow 2: Creating a New Asset View

1. **Copy `asset-view-template.md`** to `/asset-views/`
2. **Rename**: `2025-12-28-bullish-tsla.md`
3. **Fill frontmatter**:
   ```yaml
   ticker: TSLA
   direction: bullish
   target_price: 500
   entry_reference_price: 400
   ```
4. **Write sections**: Narrative, Description, Context
5. **Save**
6. **Run `/validate-templates`**
7. **Sync to database**

### Workflow 3: Extracting Claims from Research

1. **Create audit file** (using claim extraction skill)
2. **Copy main claim sections** from audit
3. **Use `main-claim-template.md`** for each claim
4. **Save to `/main-claims/`** with date prefix
5. **Run `/validate-templates`**
6. **Link claims to theses/views**

---

## 6. Validation & Quality Checks

### Regular Maintenance

**Weekly**: Run validation to catch issues early
```bash
/validate-templates
```

**Before Important Operations**:
- Before database sync
- Before sharing research
- Before creating pull requests
- Before archiving research

### Understanding Validation Output

**✅ Valid files**: Pass all schema checks
**❌ Invalid files**: Have errors that prevent sync
**🟡 Warnings**: Non-critical issues (may work but suboptimal)

**Common Errors**:
- Missing required fields (ticker, type, category)
- Invalid enum values (wrong status, direction, etc.)
- Malformed dates (use ISO 8601 or YYYY-MM-DD)

**Common Warnings**:
- "undefined" in body text
- "[object Object]" from improper serialization
- These auto-fix with `/validate-templates`

---

## 7. Tips & Best Practices

### Naming
- ✅ Always use `YYYY-MM-DD-` prefix
- ✅ Use lowercase and hyphens
- ✅ Be descriptive but concise
- ❌ Don't use special characters or spaces

### Frontmatter
- ✅ Leave `id` blank (auto-generated)
- ✅ Set dates in ISO 8601 format
- ✅ Use exact enum values (case-sensitive)
- ✅ Fill all required fields

### Content
- ✅ Follow template section headings
- ✅ Be specific and detailed
- ✅ Link to related claims/theses with wikilinks
- ✅ Update evolution log when making changes

### Validation
- ✅ Run `/validate-templates` after manual creation
- ✅ Fix any errors before syncing
- ✅ Review warnings (may indicate data quality issues)

---

## 8. Troubleshooting

### Templates Not Showing in Obsidian
- Check folder is named `templates` (not `.templates`)
- Refresh file explorer (Cmd+R / Ctrl+R)
- Restart Obsidian

### Templater Not Working
- Ensure plugin is enabled
- Check template folder path: `templates`
- Verify template files exist
- Check Templater settings

### Validation Errors
- Read error message carefully
- Check template documentation
- Run `/validate-templates --validate-only` first
- Fix manually if auto-fix doesn't work

### Sync Issues
- Ensure frontmatter is valid YAML
- Check all required fields present
- Verify enum values are correct
- Run validation before syncing

---

## Summary

✅ **Templates visible** in `/investing/templates/`
✅ **Skill available**: `/validate-templates` for auto-fixing
✅ **Two methods**: Templater plugin OR manual copy
✅ **Regular validation**: Maintain data quality
✅ **Date prefixes**: Automatic chronological sorting

**Next Steps**:
1. Install Templater plugin (optional but recommended)
2. Try creating a new entity using a template
3. Run `/validate-templates` to check formatting
4. Sync to database

For detailed schema reference, see `/docs/obsidian-templates.md`
