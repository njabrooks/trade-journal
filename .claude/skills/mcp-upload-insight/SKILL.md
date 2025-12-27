---
name: mcp-upload-insight
description: Upload structured research insight to Supabase database. Use when uploading processed/analyzed research with themes, claims, and evidence. Requires existing artifact_id from a previously uploaded artifact.
allowed-tools: mcp__supabase__execute_sql, Read, Bash
---

# Upload Research Insight to Database

## Purpose

Upload a structured research insight to the `research_insights` table. This stores analyzed, structured knowledge extracted from raw research artifacts.

Typical workflow:
1. Upload raw artifact with `/mcp-upload-artifact` (get artifact_id)
2. Process/analyze the content collaboratively with Claude
3. Use this skill to upload structured insights linked to artifact_id
4. Later create hierarchy mappings in the app UI

## File Format Expected

Markdown file with YAML frontmatter containing structured analysis:

```markdown
---
artifact_id: abc123-def456-ghi789
summary: "2-3 sentence summary of key insights"
key_themes: [AI infrastructure, semiconductor supply chain, energy constraints]
time_horizon: long_term
confidence_level: high
relevant_tickers: [NVDA, TSMC, AMD]
structured_by: manual
key_claims:
  - claim: "NVIDIA has a monopoly on AI training chips"
    evidence: "95% market share in datacenter GPUs for AI workloads"
    confidence: high
  - claim: "TSMC's advanced nodes are supply-constrained"
    evidence: "3nm production at 80% utilization, 6-month lead times"
    confidence: medium
---

# Detailed Analysis

[Optional additional context, notes, etc...]
```

## Required Frontmatter Fields

- `artifact_id` (uuid) - Link to parent research_artifact (from /mcp-upload-artifact)
- `summary` (string) - 2-3 sentence summary

## Optional Frontmatter Fields

- `key_themes` (array) - Array of theme strings
- `key_claims` (array of objects) - Structured claims with evidence
  - Each claim has: `claim`, `evidence`, `confidence`
- `supporting_evidence` (object) - JSONB supporting evidence
- `counter_evidence` (object) - JSONB counter-evidence
- `time_horizon` (string) - One of: long_term, medium_term, short_term, unknown
- `confidence_level` (string) - One of: high, medium, low, exploratory
- `relevant_tickers` (array) - Array of ticker strings (uppercase, 1-5 letters)
- `structured_by` (string) - One of: ai, manual, hybrid
- `ai_model` (string) - Model name if AI-structured
- `ai_processing_cost_usd` (number) - Processing cost if AI-structured
- `human_reviewed` (boolean) - Default false
- `human_review_notes` (string) - Review notes

## Upload Process

1. **Read the file** using the Read tool
2. **Parse frontmatter** to extract metadata
3. **Validate required fields** (artifact_id, summary)
4. **Validate artifact_id exists** in research_artifacts table
5. **Validate enums**:
   - `time_horizon`: long_term, medium_term, short_term, unknown
   - `confidence_level`: high, medium, low, exploratory
   - `structured_by`: ai, manual, hybrid
6. **Validate tickers**: 1-5 uppercase letters each
7. **Execute INSERT SQL** with parameterized query
8. **Update parent artifact status** to 'structured'

## SQL Insert Template

```sql
INSERT INTO research_insights (
  research_artifact_id,
  summary,
  key_themes,
  key_claims,
  supporting_evidence,
  counter_evidence,
  time_horizon,
  confidence_level,
  relevant_tickers,
  structured_at,
  structured_by,
  ai_model,
  ai_processing_cost_usd,
  human_reviewed,
  human_review_notes
)
VALUES (
  $1,   -- research_artifact_id
  $2,   -- summary
  $3,   -- key_themes (array)
  $4,   -- key_claims (jsonb)
  $5,   -- supporting_evidence (jsonb, nullable)
  $6,   -- counter_evidence (jsonb, nullable)
  $7,   -- time_horizon (nullable)
  $8,   -- confidence_level (nullable)
  $9,   -- relevant_tickers (array, nullable)
  NOW(),
  $10,  -- structured_by (default 'manual')
  $11,  -- ai_model (nullable)
  $12,  -- ai_processing_cost_usd (nullable)
  $13,  -- human_reviewed (default false)
  $14   -- human_review_notes (nullable)
)
RETURNING id, research_artifact_id, summary, created_at;
```

## Update Artifact Status

After successful insight upload, update the parent artifact:

```sql
UPDATE research_artifacts
SET status = 'structured',
    updated_at = NOW()
WHERE id = $1;
```

## Usage Instructions

When the user asks to:
- "Upload insight from deep-dives/my-analysis.md"
- "Add structured insight for artifact XYZ"
- "Upload this analysis to the database"

Follow these steps:
1. Read the file
2. Parse YAML frontmatter
3. Validate artifact_id exists
4. Validate required fields and enums
5. Execute INSERT query
6. Update parent artifact status
7. Return the insight ID

## Validation Rules

**Artifact ID**:
- Required
- Must be valid UUID
- Must exist in research_artifacts table

**Summary**:
- Required
- Non-empty string
- Recommended: 2-3 sentences, max 500 characters

**Key Claims** (if present):
- Must be array of objects
- Each object must have: `claim` (string), `evidence` (string)
- Optional: `confidence` (high, medium, low)

**Time Horizon** (if present):
- Must be one of: long_term, medium_term, short_term, unknown

**Confidence Level** (if present):
- Must be one of: high, medium, low, exploratory

**Relevant Tickers** (if present):
- Must be array of strings
- Each ticker: 1-5 uppercase letters
- Examples: NVDA, MSFT, SPY, TSMC

**Structured By**:
- Defaults to 'manual'
- Must be one of: ai, manual, hybrid

## Example Response

After successful upload:

```
✅ Research insight uploaded successfully

   Insight ID: xyz789-abc123-def456
   Artifact ID: abc123-def456-ghi789
   Summary: [first 100 chars...]
   Themes: AI infrastructure, semiconductor supply chain, energy constraints
   Tickers: NVDA, TSMC, AMD
   Confidence: high
   Time horizon: long_term
   Created: 2025-01-15 18:35:00

✅ Updated parent artifact status to 'structured'

→ Next: Create hierarchy mappings in app UI to link this insight
   to macro theses or asset views
```

## Error Handling

**Missing artifact_id**:
```
❌ Validation error: Missing required field 'artifact_id'

Please add artifact_id to frontmatter (from /mcp-upload-artifact):
---
artifact_id: abc123-def456-ghi789
summary: Your summary here
---
```

**Artifact not found**:
```
❌ Artifact not found: abc123-def456-ghi789

Make sure you uploaded the artifact first with /mcp-upload-artifact
```

**Invalid ticker format**:
```
❌ Validation error: Invalid ticker 'nvidia' in relevant_tickers

Tickers must be 1-5 uppercase letters (e.g., NVDA, TSMC, SPY)
```

**Invalid enum value**:
```
❌ Validation error: Invalid time_horizon 'very_long_term'

Valid values: long_term, medium_term, short_term, unknown
```

## Notes

- Always verify artifact_id exists before inserting
- Use parameterized queries to prevent SQL injection
- Tickers must be uppercase (validate/transform if needed)
- `key_claims` is stored as JSONB for flexible structure
- Update parent artifact status to 'structured' after successful insert
- `structured_at` is automatically set to NOW()
- `created_at` and `updated_at` are set by database defaults
- Return the insight ID for potential use in hierarchy mapping
- File paths are relative to project root: `research-workspace/deep-dives/file.md`
