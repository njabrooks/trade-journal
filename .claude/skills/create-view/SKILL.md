---
name: create-view
description: Create a new asset view in Supabase database from markdown file. Use when creating asset-specific theses about underlyings (stocks, commodities, etc.) from finalized research. Links to ticker and optionally to parent macro thesis.
allowed-tools: Read, Bash
---

# Create Asset View in Database

## Purpose

Create a new asset view record in the `asset_views` table. This adds an asset-specific thesis to your investment decision hierarchy, linked to a ticker and optionally to a parent macro thesis.

Typical workflow:
1. Process research and develop asset view collaboratively
2. Finalize view in `research-workspace/finalized/`
3. Use this skill to create view in database
4. Link to strategies in app UI

## File Format Expected

Markdown file with YAML frontmatter:

```markdown
---
ticker: NVDA
title: AI Chip Monopoly
description: |
  NVIDIA maintains a dominant position in AI training and inference chips
  through CUDA ecosystem lock-in, superior performance, and first-mover
  advantage in AI-optimized architectures.
macro_thesis_id: thesis-123-abc-789  # optional
narrative: |
  NVIDIA's position in AI chips is protected by multiple moats...
fundamental_context: |
  Datacenter revenue grew 200% YoY in Q3 2024...
positioning_context: |
  Long gamma via ATM calls, hedged with OTM puts...
regime_context: |
  Bull market in AI infrastructure, high volatility regime...
time_horizon: long_term
confidence_level: high
notes:
  catalysts:
    - "Next-gen Blackwell chips shipping Q1 2025"
    - "AWS partnership expansion"
  risks:
    - "AMD MI300 gaining share"
    - "Customer custom silicon (Google TPU, Amazon Trainium)"
---

# NVDA Asset View

## Thesis

[Detailed asset view narrative...]

## Evidence

- Market share data
- Revenue growth metrics
- Competitor analysis
```

## Required Frontmatter Fields

- `ticker` (string) - Ticker symbol (1-5 uppercase letters)
- `title` (string) - View title
- `description` (string) - Full view description

## Optional Frontmatter Fields

- `macro_thesis_id` (uuid) - Link to parent macro thesis
- `narrative` (string) - Overall narrative
- `fundamental_context` (string) - Fundamental analysis
- `positioning_context` (string) - Positioning/trading context
- `regime_context` (string) - Market regime analysis
- `time_horizon` (string) - One of: long_term, medium_term, short_term
- `confidence_level` (string) - One of: high, medium, low, exploratory
- `status` (string) - One of: active, archived (default: active)
- `notes` (object) - Additional notes as JSONB

## Upload Process

1. **Read the file** using the Read tool
2. **Parse frontmatter** to extract view data
3. **Validate required fields** (ticker, title, description)
4. **Resolve ticker to underlying_id**:
   - Query `underlyings` table for ticker
   - If not found, create new underlying record
5. **Validate macro_thesis_id** (if provided):
   - Check thesis exists in `macro_theses` table
6. **Validate enums**:
   - `time_horizon`: long_term, medium_term, short_term
   - `confidence_level`: high, medium, low, exploratory
   - `status`: active, archived
7. **Execute INSERT SQL** with parameterized query
8. **Return view ID** for linking

## SQL Queries

### Step 1: Resolve ticker to underlying_id

```sql
SELECT id, ticker, name
FROM underlyings
WHERE ticker = $1
LIMIT 1;
```

If not found, create:

```sql
INSERT INTO underlyings (ticker, created_at, updated_at)
VALUES ($1, NOW(), NOW())
RETURNING id, ticker;
```

### Step 2: Validate macro_thesis_id (if provided)

```sql
SELECT id, title
FROM macro_theses
WHERE id = $1;
```

### Step 3: Insert asset view

```sql
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
VALUES (
  $1,   -- underlying_id (from step 1)
  $2,   -- macro_thesis_id (nullable)
  $3,   -- title
  $4,   -- description
  $5,   -- narrative (nullable)
  $6,   -- fundamental_context (nullable)
  $7,   -- positioning_context (nullable)
  $8,   -- regime_context (nullable)
  $9,   -- time_horizon (nullable)
  $10,  -- confidence_level (nullable)
  COALESCE($11, 'active'),  -- status (default 'active')
  $12,  -- notes (jsonb, nullable)
  NOW(),
  NOW()
)
RETURNING id, underlying_id, title, confidence_level, created_at;
```

## Usage Instructions

When the user asks to:
- "Create view from finalized/nvda-ai-monopoly.md"
- "Add this asset view to the database"
- "Upload NVDA view linked to AI thesis"

Follow these steps:
1. Read the file
2. Parse YAML frontmatter
3. Validate required fields
4. Resolve ticker to underlying_id (create if needed)
5. Validate macro_thesis_id if provided
6. Execute INSERT query
7. Return the view ID and underlying info

## Validation Rules

**Ticker**:
- Required
- Must be 1-5 uppercase letters
- Examples: NVDA, MSFT, SPY, TSMC
- Invalid: nvidia, NV_1, TOOLONG

**Title**:
- Required
- Non-empty string
- Recommended: Concise view statement (max 100 chars)

**Description**:
- Required
- Non-empty string
- Recommended: 2-3 paragraphs explaining the view

**Macro Thesis ID** (if present):
- Must be valid UUID
- Must exist in macro_theses table
- Provides context for how view fits in hierarchy

**Time Horizon** (if present):
- Must be one of: long_term, medium_term, short_term

**Confidence Level** (if present):
- Must be one of: high, medium, low, exploratory

**Context Fields** (if present):
- `narrative`: Overall story/thesis
- `fundamental_context`: Fundamentals, valuation, growth
- `positioning_context`: How you're positioned, risk management
- `regime_context`: Market regime, volatility, correlations

## Example Response

After successful creation:

```
✅ Asset view created successfully

   ID: view-456-def-012
   Ticker: NVDA
   Underlying ID: underlying-789-ghi-345
   Title: AI Chip Monopoly
   Parent thesis: AI Infrastructure Buildout
   Confidence: high
   Time horizon: long_term
   Created: 2025-01-15 18:45:00

→ Next steps:
   1. Link to strategies in app UI
   2. Add supporting research via research_mappings
   3. Monitor against positions and triage alerts
```

## Error Handling

**Missing required field**:
```
❌ Validation error: Missing required field 'ticker'

Please add ticker to frontmatter:
---
ticker: NVDA
title: Your Title
description: Your description
---
```

**Invalid ticker format**:
```
❌ Validation error: Invalid ticker 'nvidia'

Ticker must be 1-5 uppercase letters (e.g., NVDA, TSMC, SPY)
```

**Macro thesis not found**:
```
❌ Validation error: Macro thesis not found: thesis-123-abc-789

Check the thesis ID or create the thesis first with /mcp-create-thesis
```

**Underlying creation info**:
```
ℹ️  Ticker 'XYZ' not found in underlyings table
✅ Created new underlying record for XYZ
```

## Duplicate Detection

Before creating a new view, consider checking for existing views on the same ticker:

```sql
SELECT
  av.id,
  av.title,
  av.description,
  av.confidence_level,
  u.ticker
FROM asset_views av
JOIN underlyings u ON av.underlying_id = u.id
WHERE u.ticker = $1
  AND av.status = 'active'
ORDER BY av.created_at DESC;
```

If similar views exist, suggest to user:
- Update existing view instead, OR
- Clarify how this view differs (time horizon, positioning, etc.), OR
- Proceed if views are complementary (e.g., fundamental vs. technical)

## Context Field Guidelines

**Narrative**:
- High-level story connecting macro thesis to asset
- Why this asset is the right expression of the thesis
- Key moats, competitive advantages, or catalysts

**Fundamental Context**:
- Valuation metrics (P/E, EV/Sales, etc.)
- Growth rates and trends
- Balance sheet strength
- Management quality
- Industry dynamics

**Positioning Context**:
- Current strategy types (long calls, covered calls, etc.)
- Risk management approach
- Hedge ratios and exposures
- Entry/exit criteria

**Regime Context**:
- Current market regime (risk-on/risk-off, vol regime)
- Correlation environment
- Macro backdrop (rates, liquidity, sentiment)
- How view performs across different regimes

## Notes

- Use parameterized queries to prevent SQL injection
- Ticker is always stored uppercase
- Create underlying if not exists (for new tickers)
- Validate macro_thesis_id before insert
- Default status is 'active' if not specified
- `created_at` and `updated_at` are automatically set
- Notes field uses JSONB for flexible structure
- Return the view ID for use in strategy linking
- File paths are relative to project root: `research-workspace/finalized/file.md`
- Multiple views per ticker are allowed (different time horizons, contexts)

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
