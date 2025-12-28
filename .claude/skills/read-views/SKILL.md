---
name: read-views
description: Query and display asset views from Supabase database. Use when you need to read asset-specific views, filter by ticker/underlying, or examine view-to-thesis relationships for research cross-referencing.
allowed-tools: Bash
---

# Read Asset Views from Database

## Purpose

Query the `asset_views` table to retrieve and display asset-specific thesis data. Useful for:
- Cross-referencing research against existing asset views
- Finding views for specific tickers (NVDA, TSMC, etc.)
- Examining view-to-thesis linkages
- Analyzing views by conviction level

## Schema Reference

The `asset_views` table has these key columns:
- `id` (uuid) - Primary key
- `macro_thesis_id` (uuid) - Link to parent macro thesis (nullable)
- `underlying_id` (uuid) - Link to underlying ticker (nullable)
- `title` (text) - View title
- `description` (text) - Full view description
- `narrative` (text) - Narrative context
- `fundamental_context` (text) - Fundamental analysis
- `positioning_context` (text) - Positioning analysis
- `regime_context` (text) - Market regime context
- `time_horizon` (text) - Time frame: long_term, medium_term, short_term
- `confidence_level` (text) - Confidence: high, medium, low, exploratory
- `status` (text) - Status: active, archived, etc.
- `created_at` (timestamptz) - Creation timestamp
- `updated_at` (timestamptz) - Last update timestamp
- `last_reviewed_at` (timestamptz) - Last review timestamp
- `next_review_due_at` (timestamptz) - Next review due date
- `notes` (jsonb) - Additional notes

## Query Examples

### Read all active views
```sql
SELECT
  av.id,
  av.title,
  av.description,
  av.confidence_level,
  av.time_horizon,
  av.status,
  u.ticker,
  av.created_at,
  av.updated_at
FROM asset_views av
LEFT JOIN underlyings u ON av.underlying_id = u.id
WHERE av.status = 'active'
ORDER BY av.created_at DESC;
```

### Filter by ticker
```sql
SELECT
  av.id,
  av.title,
  av.description,
  av.narrative,
  av.confidence_level,
  u.ticker,
  u.name as underlying_name,
  av.created_at
FROM asset_views av
JOIN underlyings u ON av.underlying_id = u.id
WHERE u.ticker = 'NVDA' AND av.status = 'active'
ORDER BY av.created_at DESC;
```

### Views with parent thesis
```sql
SELECT
  av.id,
  av.title as view_title,
  u.ticker,
  mt.title as thesis_title,
  mt.thesis_type,
  av.confidence_level,
  av.created_at
FROM asset_views av
LEFT JOIN underlyings u ON av.underlying_id = u.id
LEFT JOIN macro_theses mt ON av.macro_thesis_id = mt.id
WHERE av.status = 'active' AND av.macro_thesis_id IS NOT NULL
ORDER BY mt.title, av.created_at DESC;
```

### Count by confidence and ticker
```sql
SELECT
  u.ticker,
  av.confidence_level,
  COUNT(*) as count
FROM asset_views av
JOIN underlyings u ON av.underlying_id = u.id
WHERE av.status = 'active'
GROUP BY u.ticker, av.confidence_level
ORDER BY u.ticker, av.confidence_level;
```

### Get view with full context
```sql
SELECT
  av.id,
  av.title,
  av.description,
  av.narrative,
  av.fundamental_context,
  av.positioning_context,
  av.regime_context,
  av.confidence_level,
  av.time_horizon,
  u.ticker,
  u.name as underlying_name,
  mt.title as parent_thesis,
  av.notes
FROM asset_views av
LEFT JOIN underlyings u ON av.underlying_id = u.id
LEFT JOIN macro_theses mt ON av.macro_thesis_id = mt.id
WHERE av.id = $1;
```

## Usage Instructions

When the user asks to:
- "Read asset views" or "Show me views"
- "What views do I have for NVDA?"
- "List views linked to thesis X"
- "Show high-conviction asset views"
- "What's my view on TSMC?"

Use `mcp__supabase__execute_sql` with appropriate SQL queries from the examples above.

### Ticker Filtering

If user provides a ticker:
1. Use uppercase ticker value in WHERE clause: `WHERE u.ticker = 'NVDA'`
2. Join with `underlyings` table to get ticker information
3. Show underlying name alongside ticker

## Display Format

Present results in a clear, readable format:

```
Found 2 asset views:

1. NVDA - AI Chip Monopoly (high confidence)
   - Parent thesis: AI Infrastructure Buildout
   - Time horizon: long_term
   - Created: 2025-01-15
   - Narrative: [first 200 chars...]

2. TSMC - Foundry Dominance (medium confidence)
   - Parent thesis: Tech Supply Chain
   - Time horizon: medium_term
   - Created: 2025-01-10
   - Fundamental: [first 200 chars...]
```

### For detailed view (single result)

Show all context fields:
- Title and description
- Narrative
- Fundamental context
- Positioning context
- Regime context
- Parent thesis (if linked)
- Notes (if present)

## Notes

- Default to filtering by `status = 'active'` unless user specifies otherwise
- Always JOIN with `underlyings` table to show ticker
- LEFT JOIN with `macro_theses` to show parent thesis (may be null)
- Order by `created_at DESC` for recent-first view
- Truncate long text fields in list views, show full text for single-view queries
- Ticker parameter should be case-insensitive (convert to uppercase)

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
