# Obsidian Markdown Templates

This document defines the canonical markdown templates for all entity types that sync between Obsidian and Supabase.

## Overview

Each entity type has:
1. **Frontmatter schema** - YAML properties that map to database columns
2. **Body structure** - Markdown sections with specific headings
3. **Required fields** - Fields that must be present for valid sync
4. **Optional fields** - Fields that can be omitted

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

### Example

See: `/Users/njb/Desktop/nick/investing/main-claims/ai-adoption-will-drive-a-strong-pmi-expansion-in-2025-2026-creating-a-reflationary-environment-drive.md`

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

### Known Issues to Fix
- `notes` field currently renders as `[object Object]` - should be text
- Need to properly serialize JSONB notes field

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

### Known Issues to Fix
- `ticker` field missing from frontmatter in current implementation
- Shows "undefined" in body when ticker is missing
- Need to add `ticker` to frontmatter generation

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

---

## Validation Rules

### General Rules (All Templates)

1. **Frontmatter must be valid YAML** - No syntax errors
2. **Required fields must be present** - As specified per template
3. **Enum fields must use valid values** - E.g., `status: active` not `status: Active`
4. **Dates must be ISO 8601 or YYYY-MM-DD** - No other formats
5. **Arrays must use YAML array syntax** - `[]` or `- item` format
6. **UUIDs must be valid** - Generated by database or UUID generator

### Type-Specific Rules

#### Main Claim
- `category` must be `macro` or `asset_specific`
- `status` must be `active`, `invalidated`, or `merged`
- If `category: asset_specific`, should reference tickers in body

#### Macro Thesis
- `thesis_type` must be `secular`, `cyclical`, or `structural`
- `sectors` should be non-empty array
- `position_end_date` should be >= `position_start_date`

#### Asset View
- `ticker` must be present and valid (matches `underlyings.ticker`)
- `ticker` should also appear in frontmatter (currently missing)
- If `target_price` set, should have rationale in body
- `actual_price` should only be set when `outcome` is not `ongoing`

#### Research Artifact
- `source_type` must be valid enum value
- `status` workflow: `raw` → `processing` → `processed` (or `error`)

#### Research Insight
- `source_transcript` should reference existing artifact file
- `total_claims` should equal `main_claims` + `evidence_claims`
- `claims_structure` JSONB should match Toulmin framework

---

## Sync Behavior

### Obsidian → Database
1. File modified → Parse frontmatter + body
2. Validate against template schema
3. Extract sections based on template structure
4. Upsert to database (create if new, update if exists)
5. Update `last_synced_at` timestamp

### Database → Obsidian
1. Database record modified → Check sync state
2. Generate frontmatter from database columns
3. Generate body sections from database fields
4. Write to Obsidian vault (create or update file)
5. Track in sync state cache

### Conflict Resolution
- Both modified since `last_synced_at` → Conflict
- User must manually resolve conflicts
- No automatic merge

---

## File Naming Conventions

**All files use YYYY-MM-DD prefix for consistent chronological sorting.**

### Main Claims
- Path: `<vault>/investing/main-claims/<YYYY-MM-DD>-<sanitized-title>.md`
- Example: `2025-12-28-ai-adoption-will-drive-pmi-expansion.md`
- Date: Uses `created_at` field

### Macro Theses
- Path: `<vault>/investing/macro-theses/<YYYY-MM-DD>-<sanitized-title>.md`
- Example: `2025-12-28-bullish-ai-supply-chains-in-2026.md`
- Date: Uses `created_at` field

### Asset Views
- Path: `<vault>/investing/asset-views/<YYYY-MM-DD>-<sanitized-title>.md`
- Example: `2025-12-28-bullish-tsla.md`
- Date: Uses `created_at` field

### Research Artifacts (Transcripts)
- Path: `<vault>/investing/research/transcripts/<YYYY-MM-DD>-<sanitized-title>.md`
- Example: `2025-12-21-apps-to-agents.md`
- Date: Uses `published_date` or `created_at`

### Research Insights (Audits)
- Path: `<vault>/investing/research/audits/<YYYY-MM-DD>-<sanitized-title>-audit.md`
- Example: `2025-12-21-apps-to-agents-audit.md`
- Date: Uses `audit_date`

**Benefits of YYYY-MM-DD prefix:**
- ✅ Chronological sorting in file explorers
- ✅ Easy to find recent items
- ✅ Clear temporal context
- ✅ Consistent across all entity types

---

## Migration Checklist

To fix existing formatting issues:

- [ ] Add `ticker` field to asset view frontmatter generation
- [ ] Fix `notes` field serialization (JSONB → string)
- [ ] Validate all existing files against templates
- [ ] Re-sync files with schema mismatches
- [ ] Add template validation to sync pipeline
- [ ] Create Obsidian template files for manual creation
- [ ] Document template usage in research workflow guide

---

## Implementation Files

Key files that implement these templates:

- `/src/lib/obsidian/markdown.ts` - Frontmatter generation and parsing
- `/src/lib/obsidian/sync.ts` - Sync logic (file ↔ database)
- `/src/db/schema.ts` - Database schema definitions
- `/docs/obsidian-templates.md` - This file (template documentation)
