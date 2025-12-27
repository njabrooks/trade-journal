---
name: mcp-create-thesis
description: Create a new macro thesis in Supabase database from markdown file. Use when creating high-level cross-asset beliefs (secular, cyclical, structural) from finalized research. Creates thesis directly in hierarchy.
allowed-tools: mcp__supabase__execute_sql, Read, Bash
---

# Create Macro Thesis in Database

## Purpose

Create a new macro thesis record in the `macro_theses` table. This adds a high-level, cross-asset belief to your investment decision hierarchy.

Typical workflow:
1. Process research and develop thesis collaboratively
2. Finalize thesis in `research-workspace/finalized/`
3. Use this skill to create thesis in database
4. Optionally link evidence via research_mappings in app UI

## File Format Expected

Markdown file with YAML frontmatter:

```markdown
---
title: AI Infrastructure Buildout Drives Semiconductor Demand
description: |
  The rapid expansion of AI infrastructure requires massive investments
  in datacenter GPUs, networking, and power delivery. This secular trend
  spans 5-10 years and creates sustained demand for semiconductor capacity,
  especially advanced nodes.
thesis_type: secular
time_horizon: long_term
confidence_level: high
notes:
  key_drivers:
    - "Scaling laws require exponentially more compute"
    - "Hyperscalers committed to $500B+ capex through 2030"
    - "Energy constraints limit datacenter expansion"
  risks:
    - "AI model efficiency improvements reduce compute demand"
    - "Economic downturn reduces enterprise AI adoption"
---

# AI Infrastructure Buildout Thesis

## Core Narrative

[Detailed thesis narrative...]

## Supporting Evidence

- OpenAI scaling laws paper (2020)
- Meta AI Research Cluster announcement (2023)
- NVIDIA H100 supply constraints (2024)

## Counter-Evidence

- Groq's LPU efficiency claims
- Apple's on-device AI approach
```

## Required Frontmatter Fields

- `title` (string) - Thesis title/statement
- `description` (string) - Full thesis description

## Optional Frontmatter Fields

- `thesis_type` (string) - One of: secular, cyclical, structural, tactical
- `time_horizon` (string) - One of: long_term, medium_term, short_term
- `confidence_level` (string) - One of: high, medium, low, exploratory
- `status` (string) - One of: active, archived (default: active)
- `notes` (object) - Additional notes as JSONB

## Upload Process

1. **Read the file** using the Read tool
2. **Parse frontmatter** to extract thesis data
3. **Validate required fields** (title, description)
4. **Validate enums**:
   - `thesis_type`: secular, cyclical, structural, tactical
   - `time_horizon`: long_term, medium_term, short_term
   - `confidence_level`: high, medium, low, exploratory
   - `status`: active, archived
5. **Execute INSERT SQL** with parameterized query
6. **Return thesis ID** for linking

## SQL Insert Template

```sql
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
VALUES (
  $1,  -- title
  $2,  -- description
  $3,  -- thesis_type (nullable)
  $4,  -- time_horizon (nullable)
  $5,  -- confidence_level (nullable)
  COALESCE($6, 'active'),  -- status (default 'active')
  $7,  -- notes (jsonb, nullable)
  NOW(),
  NOW()
)
RETURNING id, title, thesis_type, confidence_level, created_at;
```

## Usage Instructions

When the user asks to:
- "Create thesis from finalized/ai-infrastructure.md"
- "Add this macro thesis to the database"
- "Upload new secular thesis"

Follow these steps:
1. Read the file
2. Parse YAML frontmatter
3. Validate required fields and enums
4. Execute INSERT query
5. Return the thesis ID

## Validation Rules

**Title**:
- Required
- Non-empty string
- Recommended: Clear, declarative statement (max 200 chars)

**Description**:
- Required
- Non-empty string
- Recommended: 2-5 paragraphs explaining the thesis, drivers, and timeframe

**Thesis Type** (if present):
- Must be one of: secular, cyclical, structural, tactical
- Secular: Long-term structural shifts (5-20 years)
- Cyclical: Business cycle related (1-5 years)
- Structural: Market structure changes (3-10 years)
- Tactical: Short-term opportunities (<1 year)

**Time Horizon** (if present):
- Must be one of: long_term, medium_term, short_term
- long_term: 5+ years
- medium_term: 1-5 years
- short_term: <1 year

**Confidence Level** (if present):
- Must be one of: high, medium, low, exploratory
- high: Strong conviction, substantial evidence
- medium: Moderate conviction, mixed evidence
- low: Weak conviction, limited evidence
- exploratory: Hypothesis formation stage

**Notes** (if present):
- Must be valid JSONB structure
- Common fields: key_drivers, risks, catalysts, invalidation_criteria

## Example Response

After successful creation:

```
✅ Macro thesis created successfully

   ID: thesis-123-abc-789
   Title: AI Infrastructure Buildout Drives Semiconductor Demand
   Type: secular
   Time horizon: long_term
   Confidence: high
   Created: 2025-01-15 18:40:00

→ Next steps:
   1. Create asset views linked to this thesis (use /mcp-create-view)
   2. Link supporting research in app UI (research_mappings)
   3. Connect to strategies in the decision hierarchy
```

## Error Handling

**Missing required field**:
```
❌ Validation error: Missing required field 'description'

Please add description to frontmatter:
---
title: Your Title
description: |
  Multi-line description
  of your thesis
---
```

**Invalid enum value**:
```
❌ Validation error: Invalid thesis_type 'mega-trend'

Valid values: secular, cyclical, structural, tactical
```

**Empty title**:
```
❌ Validation error: Title cannot be empty

Provide a clear, declarative thesis statement.
```

## Duplicate Detection

Before creating a new thesis, consider checking for similar existing theses:

```sql
SELECT id, title, description, thesis_type, confidence_level
FROM macro_theses
WHERE status = 'active'
  AND (
    title ILIKE '%AI%' OR
    description ILIKE '%infrastructure%'
  )
LIMIT 5;
```

If similar theses exist, suggest to user:
- Link as supporting evidence to existing thesis, OR
- Proceed with new thesis if sufficiently distinct

## Notes

- Use parameterized queries to prevent SQL injection
- Default status is 'active' if not specified
- `created_at` and `updated_at` are automatically set
- `last_reviewed_at` and `next_review_due_at` can be set manually in app
- Notes field uses JSONB for flexible structure
- Return the thesis ID for use in asset view creation
- File paths are relative to project root: `research-workspace/finalized/file.md`
- Consider setting up review reminders based on time_horizon
