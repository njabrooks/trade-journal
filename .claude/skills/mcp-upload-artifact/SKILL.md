---
name: mcp-upload-artifact
description: Upload a research artifact (transcript, article, note) to Supabase database. Use when ingesting raw research content without structured insights. File should be markdown with frontmatter containing metadata.
allowed-tools: mcp__supabase__execute_sql, Read, Bash
---

# Upload Research Artifact to Database

## Purpose

Upload a research artifact file to the `research_artifacts` table. This stores raw research content that can later be processed into structured insights.

Typical workflow:
1. Drop raw content in `research-workspace/transcripts/`
2. Use this skill to upload to database
3. Later process into insights with `/mcp-upload-insight`

## File Format Expected

Markdown file with YAML frontmatter:

```markdown
---
title: AI Infrastructure Buildout Discussion
source_type: transcript
author: John Doe
published_date: 2025-01-15
tags: [AI, infrastructure, NVDA, TSMC]
source_url: https://example.com/podcast/123
---

# Transcript Content

[Raw content here...]
```

## Required Frontmatter Fields

- `title` (string) - Artifact title
- `source_type` (string) - One of: article, transcript, note, report, video, manual

## Optional Frontmatter Fields

- `author` (string) - Content author
- `published_date` (date) - Publication date (YYYY-MM-DD)
- `tags` (array) - Array of tag strings
- `source_url` (string) - Original source URL
- `content_format` (string) - Default: 'text'
- `metadata` (object) - Additional metadata as JSON

## Upload Process

1. **Read the file** using the Read tool
2. **Parse frontmatter** to extract metadata
3. **Extract content** (everything after frontmatter)
4. **Validate required fields** (title, source_type)
5. **Validate enums**:
   - `source_type` must be one of: article, transcript, note, report, video, manual
   - `status` defaults to 'raw'
6. **Execute INSERT SQL** with parameterized query

## SQL Insert Template

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
  metadata,
  status,
  ingested_at
)
VALUES (
  $1,  -- title
  $2,  -- source_type
  $3,  -- author (nullable)
  $4,  -- published_date (nullable)
  $5,  -- raw_content
  $6,  -- content_format (default 'text')
  $7,  -- source_url (nullable)
  $8,  -- tags (array, nullable)
  $9,  -- metadata (jsonb, nullable)
  'raw',
  NOW()
)
RETURNING id, title, source_type, created_at;
```

## Usage Instructions

When the user asks to:
- "Upload artifact from transcripts/my-file.md"
- "Ingest research file X"
- "Add this transcript to the database"

Follow these steps:
1. Read the file
2. Parse YAML frontmatter
3. Validate required fields
4. Execute INSERT query
5. Return the artifact ID

## Validation Rules

**Title**:
- Required
- Non-empty string

**Source Type**:
- Required
- Must be one of: article, transcript, note, report, video, manual

**Tags** (if present):
- Must be array of strings
- Each tag should be 1-50 characters

**Published Date** (if present):
- Must be valid date in YYYY-MM-DD format
- Cannot be in the future

## Example Response

After successful upload:

```
✅ Research artifact uploaded successfully

   ID: abc123-def456-ghi789
   Title: AI Infrastructure Buildout Discussion
   Type: transcript
   Tags: AI, infrastructure, NVDA, TSMC
   Created: 2025-01-15 18:30:00

→ Next: Use /mcp-upload-insight to add structured insights
   or process with /process-transcript for cross-referencing
```

## Error Handling

**Missing required field**:
```
❌ Validation error: Missing required field 'title'

Please add title to frontmatter:
---
title: Your Title Here
source_type: transcript
---
```

**Invalid source_type**:
```
❌ Validation error: Invalid source_type 'podcast'

Valid values: article, transcript, note, report, video, manual
```

**File not found**:
```
❌ File not found: research-workspace/transcripts/missing.md

Check the file path and try again.
```

## Notes

- Use parameterized queries ($1, $2, etc.) to prevent SQL injection
- Store raw markdown content including frontmatter in `raw_content` field
- Default `status` is 'raw' (will be updated to 'structured' after insight creation)
- `ingested_at` is automatically set to NOW()
- `created_at` and `updated_at` are automatically set by database defaults
- Return the artifact ID so it can be used in subsequent insight uploads
- File paths are relative to project root: `research-workspace/transcripts/file.md`
