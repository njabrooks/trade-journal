---
name: validate-templates
description: Interactive validation and modification of Obsidian markdown templates. Validates files against schemas, enforces naming conventions, and allows targeted modifications via natural language requests.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
---

# Validate and Modify Obsidian Templates

## Purpose

This skill provides **interactive validation and modification** of Obsidian markdown files:

1. **Validate** - Check all files against schemas (frontmatter + body structure)
2. **Enforce** - Ensure naming conventions and metadata standards
3. **Modify** - Make targeted changes based on user requests
4. **Report** - Explain issues and changes in plain language

**Key difference from scripts:** This is interactive. Claude can make intelligent edits based on your natural language requests, not just run fixed auto-fixes.

## When to Use

Invoke `/validate-templates` when you need to:
- Validate all Obsidian files against schemas
- Fix formatting issues (missing fields, wrong values)
- Make bulk modifications ("add confidence: high to all main claims")
- Update specific files ("add ticker: TSLA to this asset view")
- Enforce naming conventions (YYYY-MM-DD prefixes, type prefixes)
- Check for "undefined" or "[object Object]" rendering issues

## Interactive Workflow

**Step 1: Validation**
```
User: /validate-templates

Claude:
🔍 Validated 8 files. Found issues:
  - 2025-12-28-asset-view-tsla.md: missing ticker in frontmatter
  - 2025-12-28-main-claim-ai.md: missing confidence field
  - 2025-12-28-macro-thesis-supply.md: invalid thesis_type value
```

**Step 2: User Request**
```
User: Fix all issues

OR

User: Add ticker: TSLA to the asset view and add confidence: medium to all main claims

OR

User: Just fix the invalid thesis_type, leave the rest
```

**Step 3: Execution**
Claude uses Read/Edit tools to make changes, then re-validates.

## Instructions

When user invokes `/validate-templates`:

### Step 1: Locate Obsidian Vault

Read environment variables to find the Obsidian vault path:

```bash
cat /Users/njb/Desktop/trade-journal/.env.local | grep OBSIDIAN_VAULT_PATH
```

Default: `/Users/njb/Desktop/nick`

The investing directory structure (flat structure):
```
investing/
├── 2025-12-28-main-claim-{title}.md
├── 2025-12-28-macro-thesis-{title}.md
├── 2025-12-28-asset-view-{title}.md
├── 2025-12-21-transcript-{title}.md
└── 2025-12-21-audit-{title}.md
```

### Step 2: Find All Markdown Files

Use Glob to find all markdown files in the investing directory:

```
Pattern: investing/*.md
Exclude: investing/templates/
```

### Step 3: Validate Each File

For each file, read and validate:

1. **Parse frontmatter** (YAML between `---` markers)
2. **Check type field** to determine entity type
3. **Validate against schema** (see Template Schemas section below)
4. **Check required fields**
5. **Validate enum values**
6. **Check filename format** (YYYY-MM-DD-{type}-{title}.md)
7. **Check for rendering issues** (undefined, [object Object])

**Validation checks:**
- Required fields present
- Enum values valid
- Date formats correct (ISO 8601 or YYYY-MM-DD)
- Ticker present for asset views
- Type matches filename prefix
- Body sections present per schema

### Step 4: Report Issues

Organize issues by file and severity:

```
🔍 Validation Results

✅ Valid: 5 files
❌ Invalid: 3 files

Issues Found:

📄 2025-12-28-asset-view-tsla.md
  ❌ Missing required field: ticker
  🟡 Body contains "undefined"

📄 2025-12-28-macro-thesis-ai.md
  ❌ Invalid value for thesis_type: "long_term" (must be: secular, cyclical, structural)

📄 2025-12-28-main-claim-adoption.md
  🟡 Missing optional field: confidence
```

### Step 5: Wait for User Request

Ask user what they want to do:
- "Fix all issues automatically"
- "Add field X to all Y type files"
- "Update field Z in specific file"
- "Fix only errors, skip warnings"
- "Show me the file content first"

### Step 6: Execute Changes

Based on user request, use Edit tool to make targeted changes:

**Example: Add missing ticker**
```typescript
// Read file to find ticker from title or body
// Use Edit tool to add to frontmatter:
old_string: "---\nid: ...\ntype: asset_view\n"
new_string: "---\nid: ...\ntype: asset_view\nticker: TSLA\n"
```

**Example: Fix invalid enum**
```typescript
// Use Edit tool:
old_string: "thesis_type: long_term"
new_string: "thesis_type: secular"
```

**Example: Add field to all main claims**
```typescript
// For each main claim file:
// Use Edit tool to add confidence field
old_string: "type: main_claim\ncategory:"
new_string: "type: main_claim\nconfidence: medium\ncategory:"
```

### Step 7: Re-validate

After making changes, re-run validation to confirm all issues resolved.

### Step 8: Report Changes

Summarize what was changed:

```
✅ Applied changes:

📄 2025-12-28-asset-view-tsla.md
  ✅ Added ticker: TSLA

📄 2025-12-28-macro-thesis-ai.md
  ✅ Updated thesis_type: long_term → secular

📄 All 3 main claim files
  ✅ Added confidence: medium

🎉 All files now valid!
```

---

# Template Schemas Reference

This section defines the canonical schemas for all entity types. Use these for validation.

## Template 1: Main Claim

Main claims are first-class belief entities using the Toulmin framework.

### Frontmatter Schema

```yaml
---
# System fields (managed by sync)
id: <uuid>                           # UUID, auto-generated
type: main_claim                     # Fixed value
created_at: <iso8601>                # ISO 8601 timestamp
updated_at: <iso8601>                # ISO 8601 timestamp
last_synced_at: <iso8601>            # ISO 8601 timestamp
sync_source: obsidian|database       # Last sync source

# Main claim metadata
category: macro|asset_specific       # REQUIRED: Claim category
status: active|invalidated|merged    # Default: active
confidence: high|medium|low|exploratory  # Toulmin qualifier
time_horizon: long_term|medium_term|short_term  # Optional
linked_to_theses: <number>           # Count (auto-populated)
linked_to_views: <number>            # Count (auto-populated)
---
```

### Body Structure

```markdown
# <Claim Title>

## Claim
<The core assertion - this is the main claim text>

## Evidence
<Supporting evidence for the claim>

## Reasoning
<Logical reasoning connecting evidence to claim>

## Backing
<Foundational support for the reasoning>

## Confidence (Qualifier)
<High|Medium|Low|Exploratory>

## Rebuttal
<Potential counter-arguments or limitations>

---

## Supporting Evidence

_Evidence links will be populated from the database_

---

## Linked Theses/Views

_Thesis/view links will be populated from the database_

---

## Evolution Log

**<YYYY-MM-DD>**: <Change description>
```

### Required Fields
- Frontmatter: `id`, `type`, `category`, `status`
- Body: `# Title`, `## Claim`

### Filename Format
`YYYY-MM-DD-main-claim-{title}.md`

---

## Template 2: Macro Thesis

Cross-asset beliefs about market sectors, themes, or regimes.

### Frontmatter Schema

```yaml
---
# System fields (managed by sync)
id: <uuid>                           # UUID, auto-generated
type: macro_thesis                   # Fixed value
created_at: <iso8601>                # ISO 8601 timestamp
updated_at: <iso8601>                # ISO 8601 timestamp
last_synced_at: <iso8601>            # ISO 8601 timestamp
sync_source: obsidian|database       # Last sync source

# Thesis metadata
thesis_type: secular|cyclical|structural  # REQUIRED
sectors: []                          # Array of sector strings (e.g., ['Technology', 'AI'])
direction: bullish|bearish|neutral   # Optional
confidence_level: high|medium|low|exploratory  # Default: medium

# Position dates
position_start_date: <YYYY-MM-DD>    # Optional
position_end_date: <YYYY-MM-DD>      # Optional

# Outcome tracking
outcome: validated|invalidated|partial|ongoing  # Default: ongoing
---
```

### Body Structure

```markdown
# <Thesis Title>

## Position
**Sectors**: <comma-separated list>
**Direction**: <bullish|bearish|neutral>
**Timeframe**: <start_date> → <end_date>
**Thesis Type**: <secular|cyclical|structural>

## Rationale Summary
<Concise summary of the thesis rationale>

## Notes
<Additional notes, context, or supporting details>

---

## Main Claims Supporting This Thesis

_Main claim links will be populated from the database_

---

## Related Positions

_Related theses, views, and strategies will be populated from the database_

---

## Outcome Tracking
**Status**: <validated|invalidated|partial|ongoing>
**Last Review**: <YYYY-MM-DD>
**Next Review**: <YYYY-MM-DD or _TBD_>
```

### Required Fields
- Frontmatter: `id`, `type`, `thesis_type`
- Body: `# Title`, `## Rationale Summary`

### Filename Format
`YYYY-MM-DD-macro-thesis-{title}.md`

---

## Template 3: Asset View

Asset-specific theses about particular underlyings (stocks, commodities, etc.).

### Frontmatter Schema

```yaml
---
# System fields (managed by sync)
id: <uuid>                           # UUID, auto-generated
type: asset_view                     # Fixed value
created_at: <iso8601>                # ISO 8601 timestamp
updated_at: <iso8601>                # ISO 8601 timestamp
last_synced_at: <iso8601>            # ISO 8601 timestamp
sync_source: obsidian|database       # Last sync source

# Asset view metadata
ticker: <TICKER>                     # REQUIRED: Stock ticker (e.g., TSLA, NVDA)
direction: bullish|bearish|neutral   # Optional
confidence_level: high|medium|low|exploratory  # Default: medium

# Position dates
position_start_date: <YYYY-MM-DD>    # Optional
position_end_date: <YYYY-MM-DD>      # Optional

# Price targets
target_price: <number>               # Numeric price target
entry_reference_price: <number>      # Reference entry price
actual_price: <number>               # Actual exit/outcome price
actual_outcome_date: <YYYY-MM-DD>    # Actual outcome date

# Outcome tracking
outcome: validated|invalidated|partial|ongoing  # Default: ongoing
---
```

### Body Structure

```markdown
# <View Title>

## Position
**Underlying**: <TICKER>
**Direction**: <bullish|bearish|neutral>
**Timeframe**: <start_date> → <end_date>
**Target Price**: $<target_price>
**Entry Price**: $<entry_reference_price>

## Narrative
<High-level investment narrative>

## Description
<Detailed description of the view>

## Fundamental Context
<Fundamental analysis supporting the view>

## Positioning Context
<Market positioning, sentiment, technicals>

## Regime Context
<Macro regime analysis>

---

## Main Claims Supporting This View

_Main claim links will be populated from the database_

---

## Related Positions

_Related theses and strategies will be populated from the database_

---

## Outcome Tracking
**Status**: <validated|invalidated|partial|ongoing>
**Actual Price**: $<actual_price>
**Outcome Date**: <actual_outcome_date>
**Last Review**: <YYYY-MM-DD>
**Next Review**: <YYYY-MM-DD or _TBD_>
```

### Required Fields
- Frontmatter: `id`, `type`, `ticker`
- Body: `# Title`, `## Description`

### Filename Format
`YYYY-MM-DD-asset-view-{title}.md`

---

## Template 4: Research Artifact (Raw Transcript/Article)

Raw research content before processing.

### Frontmatter Schema

```yaml
---
# System fields
id: <uuid>                           # UUID, auto-generated
type: research_artifact              # Fixed value
created_at: <iso8601>                # ISO 8601 timestamp
updated_at: <iso8601>                # ISO 8601 timestamp

# Source metadata
source_type: transcript|article|podcast|video|paper|note  # REQUIRED
source_url: <url>                    # Optional
title: <string>                      # REQUIRED
author: <string>                     # Optional
published_date: <YYYY-MM-DD>         # Optional

# Content metadata
content_format: text|markdown|html   # Default: text
file_name: <string>                  # Optional
tags: []                             # Array of tag strings

# Processing status
status: raw|processing|processed|error  # Default: raw
processing_error: <string>           # Error message if status=error
---
```

### Body Structure

```markdown
# <Artifact Title>

**Source**: <source_url or "N/A">
**Author**: <author or "N/A">
**Published**: <published_date or "N/A">
**Type**: <source_type>

---

## Content

<Raw content - transcript, article text, etc.>
```

### Required Fields
- Frontmatter: `id`, `type`, `source_type`, `title`
- Body: `# Title`, content

### Filename Format
`YYYY-MM-DD-transcript-{title}.md` (if source_type is transcript)
`YYYY-MM-DD-article-{title}.md` (if source_type is article)

---

## Template 5: Research Insight (Processed Audit)

Structured insights extracted from research artifacts with Toulmin claims.

### Frontmatter Schema

```yaml
---
# System fields
id: <uuid>                           # UUID, auto-generated
type: research_insight               # Fixed value
created_at: <iso8601>                # ISO 8601 timestamp
updated_at: <iso8601>                # ISO 8601 timestamp

# Source reference
source_transcript: <path>            # Path to source artifact file
audit_date: <YYYY-MM-DD>             # Date of audit/processing

# Claim statistics
total_claims: <number>               # Total claims extracted
main_claims: <number>                # Count of main claims
evidence_claims: <number>            # Count of evidence claims

# Metadata
key_themes: []                       # Array of theme strings
time_horizon: long_term|medium_term|short_term  # Optional
confidence_level: high|medium|low|exploratory   # Optional
relevant_tickers: []                 # Array of ticker strings

# Processing metadata
structured_by: <string>              # Who/what processed it (e.g., "claude-sonnet-4.5")
ai_model: <string>                   # AI model used
human_reviewed: true|false           # Default: false
---
```

### Body Structure

```markdown
# Forensic Audit: <Title>

**Source**: <source_url>
**Processed**: <audit_date>
**Total Claims**: <total> (<main> main, <evidence> evidence)

---

## Main Claims (Thesis/View Candidates)

### Claim 1: <Claim Title>

**Level**: main
**Type**: thesis_candidate|view_candidate
**Category**: macro|asset_specific
**Tickers**: <ticker list or "N/A">
**Time Horizon**: long_term|medium_term|short_term
**Qualifier**: high|medium|low|exploratory

**Claim**:
<Claim text>

**Evidence**:
<Bulleted evidence list>

**Reasoning**:
<Reasoning text>

**Backing**:
<Backing text>

**Rebuttal**:
<Bulleted rebuttal list>

**Supporting Evidence Claims**: <comma-separated claim IDs>
**Rebutting Evidence Claims**: <comma-separated claim IDs>

---

### Claim 2: ...

---

## Evidence Claims (Supporting Claims)

### Claim <N>: <Evidence Claim Title>

**Level**: evidence
**Category**: <category>
**Time Reference**: <timestamp or section reference>

**Claim**:
<Evidence claim text>

**Source Context**:
<Context from source material>

---
```

### Required Fields
- Frontmatter: `id`, `type`, `source_transcript`, `audit_date`
- Body: At least one main claim with Toulmin structure

### Filename Format
`YYYY-MM-DD-audit-{title}.md`

---

# Template Systems Overview

## Two Separate Template Systems

You have **two template systems** that serve different purposes:

### 1. Personal Knowledge Management (PKM) Templates
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

### 2. Investment Research Templates ⭐️
**Location**: `/Users/njb/Desktop/nick/investing/` (flat structure)

**Purpose**: Investment research workflow (Supabase-backed)
**Database**: Fully integrated with Supabase
**Scope**: Investment research only (theses, views, claims)

**Templates**: See schemas above (main_claim, macro_thesis, asset_view, etc.)

**Use When**: Investment research workflow, syncing with trading journal database

---

## File Naming Convention

**All investment research files use flat structure with YYYY-MM-DD and type prefixes:**

**Format**: `YYYY-MM-DD-{type}-{title}.md`

**Type Prefixes**:
- `main-claim-` → `type: main_claim`
- `macro-thesis-` → `type: macro_thesis`
- `asset-view-` → `type: asset_view`
- `transcript-` → `type: research_artifact`
- `audit-` → `type: research_insight`

**Examples**:
```
2025-12-28-main-claim-ai-adoption-drives-pmi-expansion.md
2025-12-28-macro-thesis-bullish-ai-supply-chains.md
2025-12-28-asset-view-bullish-tsla-robotaxi.md
2025-12-21-transcript-apps-to-agents.md
2025-12-21-audit-apps-to-agents-analysis.md
```

**Benefits**:
- ✅ Chronological sorting
- ✅ Easy filtering in Obsidian (`path:investing main-claim`)
- ✅ Type identification from filename
- ✅ Simple organization (1 folder vs nested)

---

## Type Field in Frontmatter

**All investment research files MUST have a `type` field** in frontmatter:

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

# Common Validation Patterns

## Pattern 1: Missing Required Field

**Issue**:
```yaml
---
type: asset_view
# Missing ticker
---
```

**Fix**:
```yaml
---
type: asset_view
ticker: TSLA
---
```

**Command**: "Add ticker: TSLA to this file"

---

## Pattern 2: Invalid Enum Value

**Issue**:
```yaml
---
type: macro_thesis
thesis_type: long_term  # Invalid!
---
```

**Fix**:
```yaml
---
type: macro_thesis
thesis_type: secular  # Valid!
---
```

**Command**: "Change thesis_type to secular"

---

## Pattern 3: Bulk Field Addition

**Issue**: Multiple files missing optional field

**Command**: "Add confidence: medium to all main claims"

**Execution**:
- Find all files with `type: main_claim`
- Use Edit tool to add `confidence: medium` to frontmatter
- Report results

---

## Pattern 4: Filename/Type Mismatch

**Issue**:
```
Filename: 2025-12-28-macro-thesis-ai-supply-chains.md
Frontmatter: type: main_claim  # Mismatch!
```

**Fix Options**:
1. Rename file to match type
2. Update type to match filename

**Command**: "Which is correct - the filename or the type?"

---

## Pattern 5: Date Format Issues

**Issue**:
```yaml
---
created_at: 12/28/2025  # Invalid!
---
```

**Fix**:
```yaml
---
created_at: 2025-12-28T00:00:00.000Z  # Valid ISO 8601
---
```

**Command**: "Fix date formats to ISO 8601"

---

# Troubleshooting

## Issue: "undefined" in Body Text

**Cause**: Missing field in frontmatter that's referenced in body template

**Example**:
```markdown
**Underlying**: undefined  # ticker is missing from frontmatter
```

**Fix**: Add missing field to frontmatter

---

## Issue: "[object Object]" in Body Text

**Cause**: JSONB field not properly serialized

**Example**:
```markdown
## Notes
[object Object]  # notes field is an object, not a string
```

**Fix**: Convert object to JSON string

---

## Issue: Validation Script vs Interactive Skill

**When to use scripts**:
- Quick non-interactive validation: `npx tsx scripts/validate-obsidian-templates.ts`
- CI/CD pipelines
- Automated checks

**When to use this skill**:
- Interactive modifications
- Bulk updates based on requests
- Complex validation with explanations
- Learning what's wrong with files

---

## Issue: Sync Conflicts

**Cause**: File modified in Obsidian AND database since last sync

**Detection**: Check `last_synced_at` vs file mtime and database updated_at

**Resolution**: Manual - user must choose which version to keep

---

# Summary

This skill provides:
- ✅ **Validation** against schemas
- ✅ **Interactive modifications** based on natural language
- ✅ **Bulk operations** (add field to all X type files)
- ✅ **Targeted fixes** (update specific file)
- ✅ **Clear reporting** of issues and changes

Use this when you need more than just running a script - when you need Claude to understand context and make intelligent edits.
