---
name: finalize-for-upload
description: Upload finalized research to Supabase database. Automatically detects content type (artifact, insight, thesis, or view) from frontmatter and uploads to appropriate tables. Use when ready to commit research to the hierarchy.
allowed-tools: Read, mcp__supabase__execute_sql, Bash
---

# Finalize and Upload Research

## Purpose

Take a finalized research file and upload it to the Supabase database. This skill intelligently detects what type of content you're uploading based on frontmatter and uses the appropriate MCP operations.

Supports uploading:
1. **Audit Files** - Forensic Toulmin claim extraction (from `/process-transcript`)
2. **Research Artifacts** - Raw transcripts, articles, notes
3. **Research Insights** - Structured analysis linked to artifacts
4. **Macro Theses** - High-level cross-asset beliefs
5. **Asset Views** - Asset-specific theses linked to tickers

## Workflow

```
Input: research-workspace/finalized/[file].md
  ↓
1. Read file
2. Parse frontmatter to detect content type
3. Validate required fields
4. Upload to appropriate table(s)
5. Return IDs for linking in app
  ↓
Output: Confirmation with IDs for app UI linking
```

## Instructions

When the user asks to finalize and upload:
- "Finalize and upload finalized/nvda-view.md"
- "Upload this research to the database"
- "Commit this thesis to Supabase"

Follow these steps:

### Step 1: Read and Parse File

Use the Read tool to load the file and parse YAML frontmatter.

### Step 2: Detect Content Type

Based on frontmatter fields:

**Audit** (has `type: audit`):
```yaml
---
type: audit
title: "Research Title"
source_type: transcript|article|report
source_url: "https://..."
analyzed_date: "YYYY-MM-DD"
summary: "2-3 sentence summary"
themes: [theme1, theme2]
tickers: [NVDA, TSMC]
---
```

**Artifact** (has `source_type`):
```yaml
---
title: "Article Title"
source_type: transcript|article|report|video|note|manual
author: "Author Name"
published_date: "YYYY-MM-DD"
tags: [tag1, tag2]
---
```

**Insight** (has `artifact_id`):
```yaml
---
artifact_id: uuid-here
summary: "2-3 sentence summary"
key_themes: [theme1, theme2]
time_horizon: long_term|medium_term|short_term
confidence_level: high|medium|low|exploratory
relevant_tickers: [NVDA, TSMC]
---
```

**Macro Thesis** (has `thesis_type`):
```yaml
---
title: "Thesis Statement"
description: "Full description"
thesis_type: secular|cyclical|structural|tactical
time_horizon: long_term|medium_term|short_term
confidence_level: high|medium|low|exploratory
---
```

**Asset View** (has `ticker`):
```yaml
---
ticker: NVDA
title: "View Title"
description: "Full description"
macro_thesis_id: uuid-here  # optional
narrative: "Overall narrative"
time_horizon: long_term|medium_term|short_term
confidence_level: high|medium|low|exploratory
---
```

### Step 3: Upload Based on Type

#### For Artifacts

Use `/mcp-upload-artifact` logic:

```sql
INSERT INTO research_artifacts (
  title,
  source_type,
  author,
  published_date,
  raw_content,
  content_format,
  source_url,
  tags,
  status,
  ingested_at
)
VALUES (...)
RETURNING id, title, source_type, created_at;
```

**Then ask**: "Would you like to create an insight for this artifact now?"

#### For Audits (NEW - Hierarchical Toulmin Claims)

An audit file contains:
1. **Original transcript** (uploaded as artifact)
2. **Toulmin-structured claims** (uploaded as insight with claims_structure)
3. **Main claims** (thesis/view candidates with full Toulmin framework)
4. **Evidence claims** (supporting/rebutting evidence)

**Upload Process**:

```sql
-- Step 1: Upload transcript as artifact
INSERT INTO research_artifacts (
  title,
  source_type,
  source_url,
  raw_content,
  content_format,
  tags,
  status,
  ingested_at
)
VALUES (
  $title,
  $source_type,
  $source_url,
  $transcript_content,  -- Original transcript from audit file
  'markdown',
  $tags,
  'structured',  -- Already processed, skip 'raw'
  NOW()
)
RETURNING id;

-- Step 2: Parse claims structure using parseClaimsMarkdown
-- import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';
-- const claimsStructure = parseClaimsMarkdown(auditContent);

-- Step 3: Upload audit as insight with claims_structure
INSERT INTO research_insights (
  research_artifact_id,
  summary,
  key_themes,
  claims_structure,  -- NEW: Hierarchical Toulmin structure (parsed JSONB)
  relevant_tickers,
  time_horizon,
  confidence_level,
  structured_by,
  ai_model,
  structured_at
)
VALUES (
  $artifact_id,
  $summary,
  $themes,
  $claims_structure,  -- JSONB from parseClaimsMarkdown()
  $tickers,
  $inferred_time_horizon,
  $inferred_confidence,
  'ai',  -- Valid enum: 'ai' | 'manual' | 'hybrid'
  'process-transcript',  -- Store skill name in ai_model field
  NOW()
)
RETURNING id;
```

**Claims Structure Format**:

Use the **parseClaimsMarkdown** function from `src/lib/research/parseClaimsMarkdown.ts`:

```typescript
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';

const claimsStructure = parseClaimsMarkdown(auditFileContent);
// Returns structured JSON ready for database insertion
```

The parser produces:

```typescript
{
  "main_claims": [
    {
      "id": "claim-1",
      "title": "AI Will Drive US PMI Expansion...",
      "level": "main",
      "type": "thesis_candidate" | "view_candidate",
      "category": "macro" | "asset_specific",
      "tickers": ["NVDA", "TSLA"],
      "time_horizon": "medium_term",
      "qualifier": "high" | "medium" | "low" | "exploratory",
      "claim": "AI adoption will drive...",
      "evidence": ["Risk-on indicators...", "PMIs overlaid..."],
      "reasoning": "The shift from centralized...",
      "backing": "Previous cloud cycles...",
      "rebuttal": ["PMI expansion assumes...", "Regulatory concerns..."],
      "supporting_evidence_claims": ["claim-19", "claim-20"],
      "rebutting_evidence_claims": []
    }
  ],
  "evidence_claims": [
    {
      "id": "claim-19",
      "title": "Dollar Weakness Signals Reflation",
      "level": "evidence",
      "type": "supporting" | "rebutting",
      "supports": "Claim 1 (AI-driven PMI expansion)",
      "claim": "MACD sell signal in dollar...",
      "evidence": ["Dollar MACD potential...", "MSCI World rising..."],
      "qualifier": "medium",
      "rebuttal": "Technical indicators can give false signals" // optional
    }
  ]
}
```

**Parsing Logic** (Automated via `parseClaimsMarkdown`):

The parser automatically:
1. Splits audit markdown into Main Claims and Evidence Claims sections
2. Extracts each claim block (### Claim N: Title)
3. Parses metadata fields (Level, Type, Category, Tickers, etc.)
4. Extracts content sections (Claim, Evidence bullets, Reasoning, Backing, Rebuttal bullets)
5. Preserves relationships (Supporting Evidence Claims, Rebutting Evidence Claims)
6. Returns fully structured JSON ready for `claims_structure` JSONB column

**Output**:

```
✅ Audit uploaded successfully!

   Artifact ID: abc-123-def
   Insight ID: xyz-789-ghi

   Main Claims: 14 (thesis candidates)
   Evidence Claims: 23 (18 supporting, 5 rebutting)

→ View in app: /research/xyz-789-ghi
→ Convert claims to theses/views in the app UI
→ Claims remain in draft state until manually converted
```

**Then suggest**: "Open the app to browse claims and convert high-priority ones to theses/views"

#### For Insights

Use `/mcp-upload-insight` logic:

```sql
-- First verify artifact exists
SELECT id, title FROM research_artifacts WHERE id = $1;

-- Then insert insight
INSERT INTO research_insights (
  research_artifact_id,
  summary,
  key_themes,
  key_claims,
  time_horizon,
  confidence_level,
  relevant_tickers,
  structured_by,
  structured_at
)
VALUES (...)
RETURNING id, research_artifact_id, summary, created_at;

-- Update artifact status
UPDATE research_artifacts
SET status = 'structured', updated_at = NOW()
WHERE id = $1;
```

**Then suggest**: "Next: Create hierarchy mappings in app UI to link this insight to theses/views"

#### For Macro Theses

Use `/mcp-create-thesis` logic:

```sql
-- Optional: Check for similar theses
SELECT id, title, description
FROM macro_theses
WHERE status = 'active'
  AND (title ILIKE '%keyword%' OR description ILIKE '%keyword%')
LIMIT 3;

-- If similar found, ask user to confirm creation
-- Then insert

INSERT INTO macro_theses (
  title,
  description,
  thesis_type,
  time_horizon,
  confidence_level,
  status,
  notes,
  created_at,
  updated_at
)
VALUES (...)
RETURNING id, title, thesis_type, confidence_level, created_at;
```

**Then suggest**: "Next: Create asset views linked to this thesis"

#### For Asset Views

Use `/mcp-create-view` logic:

```sql
-- Resolve ticker to underlying_id
SELECT id, ticker FROM underlyings WHERE ticker = $1;

-- If not found, create underlying
INSERT INTO underlyings (ticker, created_at, updated_at)
VALUES ($1, NOW(), NOW())
RETURNING id, ticker;

-- Validate macro_thesis_id if provided
SELECT id, title FROM macro_theses WHERE id = $1;

-- Insert asset view
INSERT INTO asset_views (
  underlying_id,
  macro_thesis_id,
  title,
  description,
  narrative,
  fundamental_context,
  positioning_context,
  regime_context,
  time_horizon,
  confidence_level,
  status,
  notes,
  created_at,
  updated_at
)
VALUES (...)
RETURNING id, underlying_id, title, confidence_level, created_at;
```

**Then suggest**: "Next: Link this view to strategies in app UI"

### Step 4: Handle Multi-Step Uploads

Some files may need multiple uploads. For example:
- Artifact + Insight (linked)
- Thesis + View (thesis created, then view linked to it)

**Smart detection**:
- If frontmatter has BOTH `source_type` AND `summary`, create artifact then insight
- If creating a view and `macro_thesis_id` is missing but `parent_thesis_title` is provided, search for thesis first

### Step 5: Return Results

Provide clear confirmation with IDs:

```
✅ Upload successful!

Type: Macro Thesis
ID: a07ffb45-32a9-4b16-afac-421a47be09e0
Title: "Semiconductor Supply Chain Resilience"
Type: structural
Confidence: medium
Time Horizon: long_term

→ Next steps:
   1. Create asset views linked to this thesis
   2. Add supporting research via app UI
   3. Link to existing strategies
```

## Validation

Before uploading, validate:

**For All Types**:
- Required fields present
- Valid enum values
- No SQL injection risks (use parameterized queries)

**For Artifacts**:
- `title` non-empty
- `source_type` in: article, transcript, note, report, video, manual
- `tags` is array if present
- `published_date` is valid date if present

**For Insights**:
- `artifact_id` exists in research_artifacts
- `summary` non-empty (2-3 sentences recommended)
- `time_horizon` in: long_term, medium_term, short_term, unknown
- `confidence_level` in: high, medium, low, exploratory
- `relevant_tickers` are 1-5 uppercase letters each

**For Theses**:
- `title` non-empty
- `description` non-empty
- `thesis_type` in: secular, cyclical, structural, tactical
- `time_horizon` in: long_term, medium_term, short_term
- `confidence_level` in: high, medium, low, exploratory

**For Views**:
- `ticker` is 1-5 uppercase letters
- `title` non-empty
- `description` non-empty
- `macro_thesis_id` exists if provided
- `time_horizon` in: long_term, medium_term, short_term
- `confidence_level` in: high, medium, low, exploratory

## Error Handling

**Missing required field**:
```
❌ Validation error: Missing required field 'description'

Required fields for macro thesis:
- title
- description

Please add to frontmatter and try again.
```

**Invalid enum value**:
```
❌ Validation error: Invalid thesis_type 'mega-trend'

Valid values: secular, cyclical, structural, tactical
```

**Referenced ID not found**:
```
❌ Reference error: Macro thesis not found: abc-123-def

Options:
1. Create the parent thesis first
2. Remove macro_thesis_id to create standalone view
3. Check the thesis ID in database
```

**Duplicate detection**:
```
⚠️  Similar thesis found:

   "AI Infrastructure Build-Out" (secular, high)
   Created: 2025-01-15

Your thesis: "AI Datacenter Expansion" (secular, high)

Are these the same? Choose:
1. Link as evidence to existing thesis (don't create new)
2. Create new thesis (sufficiently distinct)
3. Cancel and revise

[User chooses option]
```

## Example Uploads

### Example 1: Simple Artifact

**Input** (`finalized/podcast-transcript.md`):
```yaml
---
title: "Tech Trends 2025 Podcast"
source_type: transcript
author: "Tech Weekly"
published_date: "2025-01-20"
tags: [AI, cloud, semiconductors]
---
[Content...]
```

**Output**:
```
✅ Research artifact uploaded

   ID: f5941431-5450-48fc-bd38-fac0d10b7012
   Title: "Tech Trends 2025 Podcast"
   Type: transcript
   Tags: AI, cloud, semiconductors

→ Create insight? Use /finalize-for-upload with insight frontmatter
```

### Example 2: Artifact + Insight (Combined)

**Input** (`finalized/analyzed-transcript.md`):
```yaml
---
title: "Tech Trends 2025 Podcast"
source_type: transcript
summary: "Cloud providers accelerating AI infrastructure spend..."
key_themes: [AI infrastructure, cloud capex]
time_horizon: long_term
confidence_level: high
relevant_tickers: [MSFT, GOOGL, AMZN]
---
[Content...]
```

**Output**:
```
✅ Research artifact uploaded
   Artifact ID: f5941431-5450-48fc-bd38-fac0d10b7012

✅ Research insight uploaded
   Insight ID: ff254ba0-9509-4f35-b2f9-cea6b989b10d
   Linked to artifact: f5941431-5450-48fc-bd38-fac0d10b7012

✅ Artifact status updated to 'structured'

→ Create hierarchy mappings in app UI
```

### Example 3: Macro Thesis

**Input** (`finalized/energy-constraint-thesis.md`):
```yaml
---
title: "Energy Infrastructure as AI Bottleneck"
description: |
  Power and cooling infrastructure, not semiconductor supply,
  will be the primary constraint on AI datacenter buildout
  for the next 5-7 years.
thesis_type: structural
time_horizon: long_term
confidence_level: medium
notes:
  drivers:
    - Grid capacity limits in key regions
    - 100+ kW rack power density requirements
  risks:
    - Efficiency improvements reduce power needs
    - Nuclear/gas buildout accelerates
---
[Content...]
```

**Output**:
```
✅ Macro thesis created

   ID: b1234567-89ab-cdef-0123-456789abcdef
   Title: "Energy Infrastructure as AI Bottleneck"
   Type: structural
   Confidence: medium
   Time Horizon: long_term

→ Create asset views for energy infrastructure plays
→ Link supporting research in app UI
```

### Example 4: Asset View

**Input** (`finalized/nvda-view.md`):
```yaml
---
ticker: NVDA
title: "AI Accelerator Dominance"
description: "NVIDIA maintains monopoly in AI chips through CUDA moat..."
macro_thesis_id: a07ffb45-32a9-4b16-afac-421a47be09e0
narrative: "First-mover advantage + switching costs..."
time_horizon: long_term
confidence_level: high
---
[Content...]
```

**Output**:
```
✅ Asset view created

   ID: 47e8ffde-4ef8-48b1-9d39-461dd589d910
   Ticker: NVDA
   Title: "AI Accelerator Dominance"
   Parent Thesis: "Semiconductor Supply Chain Resilience"
   Confidence: high
   Time Horizon: long_term

→ Link to strategies in app UI
→ Monitor against positions via triage
```

## Notes

- Use parameterized queries to prevent SQL injection
- Always return IDs for use in app UI
- Suggest logical next steps after each upload
- Check for duplicates before creating theses/views
- Support combined uploads (artifact + insight in one file)
- Default `status` to 'active' for theses/views, 'raw' for artifacts
- Automatically update artifact status to 'structured' when insight created
- Create underlying if ticker not found (auto-provision)
- Validate all foreign key references before inserting
- File paths are relative to project root: `research-workspace/finalized/file.md`
