---
name: read-theses
description: Query and display macro theses from Supabase database. Use when you need to read thesis data, filter by status/type/conviction, or examine thesis details for cross-referencing research.
allowed-tools: Bash
---

# Read Macro Theses from Database

## Purpose

Query the `macro_theses` table to retrieve and display thesis data. Useful for:
- Cross-referencing research against existing theses
- Analyzing thesis distribution by type or conviction
- Finding theses by status (active, archived, etc.)

## Schema Reference

The `macro_theses` table has these key columns:
- `id` (uuid) - Primary key
- `title` (text) - Thesis title
- `description` (text) - Full thesis description
- `thesis_type` (text) - Type: secular, cyclical, structural, tactical
- `time_horizon` (text) - Time frame: long_term, medium_term, short_term
- `confidence_level` (text) - Confidence: high, medium, low, exploratory
- `status` (text) - Status: active, archived, etc.
- `created_at` (timestamptz) - Creation timestamp
- `updated_at` (timestamptz) - Last update timestamp
- `last_reviewed_at` (timestamptz) - Last review timestamp
- `next_review_due_at` (timestamptz) - Next review due date
- `notes` (jsonb) - Additional notes

## Query Examples

### Read all active theses
```sql
SELECT
  id,
  title,
  description,
  thesis_type,
  confidence_level,
  time_horizon,
  status,
  created_at,
  updated_at
FROM macro_theses
WHERE status = 'active'
ORDER BY created_at DESC;
```

### Filter by thesis type
```sql
SELECT
  id,
  title,
  thesis_type,
  confidence_level,
  created_at
FROM macro_theses
WHERE status = 'active'
  AND thesis_type = 'secular'
ORDER BY confidence_level DESC, created_at DESC;
```

### Count by type and confidence
```sql
SELECT
  thesis_type,
  confidence_level,
  COUNT(*) as count
FROM macro_theses
WHERE status = 'active'
GROUP BY thesis_type, confidence_level
ORDER BY thesis_type, confidence_level;
```

### Get thesis with notes
```sql
SELECT
  id,
  title,
  description,
  thesis_type,
  confidence_level,
  notes
FROM macro_theses
WHERE status = 'active' AND notes IS NOT NULL
ORDER BY updated_at DESC;
```

## Usage Instructions

When the user asks to:
- "Read macro theses" or "Show me theses"
- "What theses do I have?"
- "List active secular theses"
- "Show high-conviction theses"

Use `mcp__supabase__execute_sql` with appropriate SQL queries from the examples above.

## Display Format

Present results in a clear, readable format:

```
Found 3 macro theses:

1. AI Infrastructure Buildout (secular, high confidence)
   - Created: 2025-01-15
   - Time horizon: long_term
   - Description: [first 200 chars...]

2. Federal Reserve Pivot (cyclical, medium confidence)
   - Created: 2025-01-10
   - Time horizon: medium_term
   - Description: [first 200 chars...]
```

## Notes

- Default to filtering by `status = 'active'` unless user specifies otherwise
- Order by `created_at DESC` for recent-first view
- Truncate long descriptions in list views
- For single thesis details, show full description and notes

## SQL Execution

All SQL queries should be executed using the `psql-query.ts` helper script:

```bash
# For queries that return data (SELECT)
npx tsx scripts/psql-query.ts "SELECT * FROM table_name WHERE condition" --format json

# For queries that modify data (INSERT/UPDATE/DELETE)
npx tsx scripts/psql-query.ts "INSERT INTO table_name (...) VALUES (...) RETURNING *" --format json
```

The helper script:
- Loads DATABASE_URL_POOLER from .env.local automatically
- Returns results as JSON by default (or use --format table, --format csv)
- Handles errors and connection issues
- Properly escapes quotes and special characters

**Important**: Escape single quotes in SQL strings by doubling them: `'It''s working'`
