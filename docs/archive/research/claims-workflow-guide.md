# Claims Workflow Guide

Complete guide to the hierarchical Toulmin claims workflow for converting research into theses and views.

## Table of Contents

1. [Overview](#overview)
2. [Workflow Stages](#workflow-stages)
3. [Data Schema](#data-schema)
4. [User Workflows](#user-workflows)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The claims workflow enables systematic conversion of research transcripts into actionable macro theses and asset views using the Toulmin argumentation framework.

### Key Features

- **Forensic Claim Extraction**: No information loss from source material
- **Hierarchical Structure**: Main claims link to supporting/rebutting evidence
- **Conversion Tracking**: Claims track when/what they're converted to
- **Provenance Chain**: Full lineage from transcript → claim → thesis/view
- **Interactive UI**: Browse, expand, and convert claims in app

### Toulmin Framework

Each claim includes:
- **Claim**: The assertion being made
- **Grounds**: Evidence supporting the claim
- **Warrant**: Reasoning connecting evidence to claim
- **Backing**: Additional support for the reasoning
- **Qualifier**: Confidence level (high, medium, low, exploratory)
- **Rebuttal**: Counter-arguments or exceptions

---

## Workflow Stages

### Stage 1: Research Ingestion (Local Claude)

Use `/process-transcript` skill in Claude Code to extract claims from research.

**Input**: Raw transcript/article/report
**Output**: Audit file with hierarchical claims structure

```bash
# In Claude Code local session
/process-transcript research-workspace/1-raw/transcript.md
```

Creates: `research-workspace/2-audits/[date]-[slug]-audit.md`

### Stage 2: Upload to Database

Use `/finalize-for-upload` skill to upload audit to Supabase.

**Input**: Audit markdown file
**Output**: Artifact + Insight records with claims_structure

```bash
# In Claude Code local session
/finalize-for-upload 2-audits/2025-12-21-apps-to-agents-audit.md
```

**OR** use upload script directly:

```bash
npx tsx --env-file=.env.local scripts/upload-audit-apps-to-agents.ts
```

Creates:
- `research_artifacts` record (original transcript)
- `research_insights` record (with `claims_structure` JSONB column)

### Stage 3: Browse Claims in App

Visit research detail page to see ClaimsBrowser:

```
http://localhost:3000/research/{insight_id}
```

**Features**:
- Expandable claim cards showing full Toulmin structure
- Statistics (main claims, thesis candidates, view candidates, evidence claims)
- Linked evidence claims (supporting and rebutting)
- Conversion status badges

### Stage 4: Convert Claims to Theses/Views

Click "Convert" button on any unconverted claim.

**Dialog Options**:
- **Macro Thesis**: Select thesis type (secular, cyclical, structural, tactical)
- **Asset View**: Enter ticker, optionally link to parent thesis

**API Call**: `POST /api/research/convert-claim`

Creates:
- `macro_theses` or `asset_views` record
- Updates `claims_structure` to mark claim as converted
- Auto-creates `underlyings` record for new tickers

### Stage 5: Verify Provenance

Claims track their conversion:

```json
{
  "converted_to": {
    "type": "macro_thesis",
    "id": "5b299579-eccf-4f53-8785-58026ea605b0",
    "converted_at": "2025-12-26T12:34:56.789Z"
  }
}
```

**Provenance Chain**:
```
research_artifacts (original transcript)
      ↓ (research_artifact_id)
research_insights (claims_structure)
      ↓ (converted_to.id)
macro_theses / asset_views (actionable beliefs)
```

---

## Data Schema

### `research_insights.claims_structure` (JSONB)

```typescript
{
  "main_claims": [
    {
      "id": "claim-1",
      "level": "main",
      "type": "thesis_candidate" | "view_candidate",
      "category": "macro" | "asset_specific",
      "claim": "AI will drive PMI expansion...",
      "grounds": "Risk-on indicators rising...",
      "warrant": "Cloud to edge transition...",
      "backing": "Previous cycles show...",
      "qualifier": "medium",
      "rebuttal": "Assumes rapid adoption...",
      "time_horizon": "medium_term",
      "relevant_tickers": ["NVDA"],
      "supporting_evidence_claims": ["claim-19", "claim-20"],
      "rebutting_evidence_claims": [],
      "converted_to": {
        "type": "macro_thesis",
        "id": "uuid-here",
        "converted_at": "2025-12-26T..."
      }
    }
  ],
  "evidence_claims": [
    {
      "id": "claim-19",
      "level": "evidence",
      "type": "supporting" | "rebutting",
      "claim": "Dollar weakness signals reflation",
      "grounds": "MACD sell signal in DXY...",
      "confidence": "medium",
      "supports_main_claims": ["claim-1"]
    }
  ],
  "metadata": {
    "extraction_date": "2025-12-24",
    "source_skill": "/process-transcript",
    "toulmin_version": "1.0"
  }
}
```

### Indexes

```sql
CREATE INDEX idx_research_insights_claims_structure
ON research_insights USING GIN (claims_structure);
```

Enables efficient JSONB queries.

---

## User Workflows

### Workflow 1: Full Research → Thesis

```
1. Ingest transcript via /process-transcript
2. Upload audit via /finalize-for-upload
3. Browse claims at /research/{id}
4. Click "Convert" on thesis candidate
5. Select thesis type (e.g., "secular")
6. Submit → redirected to /theses/{id}
7. Claim shows "✓ Converted to macro thesis" badge
```

### Workflow 2: Full Research → View

```
1. Ingest transcript via /process-transcript
2. Upload audit via /finalize-for-upload
3. Browse claims at /research/{id}
4. Click "Convert" on view candidate
5. Enter ticker (e.g., "NVDA")
6. Optionally link to parent thesis
7. Submit → redirected to /asset-views/{id}
8. Claim shows "✓ Converted to asset view" badge
```

### Workflow 3: Partial Conversion

Not all claims need to be converted:
- Convert high-conviction claims to theses/views
- Leave low-conviction or exploratory claims unconverted
- Use as evidence repository for existing theses/views

---

## Testing

### Integration Tests

Run full test suite:

```bash
npx tsx --env-file=.env.local scripts/test-claims-integration.ts
```

**Tests** (48 total):
1. Data upload verification (5 tests)
2. Claims structure verification (8 tests)
3. Toulmin structure verification (14 tests)
4. Evidence claims verification (6 tests)
5. Helper functions (3 tests)
6. Conversion simulation (6 tests)
7. Database integrity (6 tests)

### Conversion Tests

Test claim → thesis/view conversion:

```bash
npx tsx --env-file=.env.local scripts/test-claim-conversion.ts
```

**Verifies**:
- Claim conversion to macro_thesis
- Claim conversion to asset_view
- Provenance chain integrity
- claims_structure updates

### Manual UI Testing

1. Start dev server: `npm run dev`
2. Visit: `http://localhost:3000/research/e20e61f5-d63b-4cf3-b3af-c47b2321614d`
3. Verify:
   - ClaimsBrowser displays correctly
   - Claims expand/collapse
   - Convert dialog opens
   - Conversion succeeds
   - Claim shows "✓ Converted" badge after conversion

---

## Troubleshooting

### Issue: Insight shows legacy InsightReview instead of ClaimsBrowser

**Cause**: Insight doesn't have `claims_structure` or it's invalid.

**Solution**:
```sql
-- Check if claims_structure exists
SELECT id, claims_structure IS NOT NULL as has_claims
FROM research_insights
WHERE id = 'your-insight-id';
```

If missing, re-upload audit file.

### Issue: Claim conversion fails with 400 error

**Possible Causes**:
1. Claim already converted
2. Invalid thesis_type or ticker
3. Missing required fields

**Debug**:
```sql
-- Check claim status
SELECT claims_structure->'main_claims'
FROM research_insights
WHERE id = 'your-insight-id';
```

Look for `converted_to` field on claim.

### Issue: MCP operations timing out

**Workaround**: Use direct database connection via tsx scripts instead of MCP.

```bash
# Instead of MCP execute_sql
npx tsx --env-file=.env.local -e "
import { db } from './src/db/index.js';
// Your query here
"
```

### Issue: Build errors after adding claims components

**Common Issues**:
1. Type imports: Use `import type { Type } from ...`
2. Select onChange: Cast value `e.target.value as typeof state`
3. JSONB casting: Use `as any` for Drizzle JSONB fields

---

## Architecture Notes

### Why Toulmin Framework?

- **Forensic**: Preserves all information from source
- **Structured**: Forces explicit reasoning and evidence
- **Hierarchical**: Links main claims to evidence
- **Actionable**: Clear path from claim to thesis/view

### Why JSONB?

- **Flexible**: Schema can evolve without migrations
- **Queryable**: GIN indexes enable fast JSONB queries
- **Atomic**: Updates are transactional
- **Portable**: Can export claims as JSON

### Why Conversion Tracking?

- **Provenance**: Track which claims led to which theses
- **Deduplication**: Prevent converting same claim twice
- **Audit Trail**: See when and how beliefs evolved
- **Bi-directional**: Navigate from thesis back to source claim

---

## Week 5: UI/UX Enhancements (COMPLETED ✅)

### Implemented Features

**Filtering & Search**:
- ✅ Full-text search across claims, evidence, and tickers
- ✅ Filter by conversion status (All, Unconverted, Converted)
- ✅ Filter by claim type (All, Thesis Candidates, View Candidates)
- ✅ Filter by confidence level (All, High, Medium, Low, Exploratory)
- ✅ Filter by category (All, Macro, Asset Specific)
- ✅ Sort by original order, confidence, or time horizon
- ✅ Active filters summary with count
- ✅ One-click clear all filters

**Keyboard Shortcuts**:
- ✅ Press `/` to focus search input
- ✅ Press `Esc` to clear search or close filter panel
- ✅ Keyboard shortcuts hint displayed in filter panel

**Accessibility**:
- ✅ ARIA labels on search input
- ✅ Proper `htmlFor` and `id` attributes on form controls
- ✅ Keyboard navigation support
- ✅ Focus management for search input

**Visual Enhancements**:
- ✅ Enhanced statistics cards with:
  - Percentage indicators for thesis/view candidates
  - Evidence-to-claim ratio (e.g., "2.3:1")
  - "X shown" indicator when filters active
  - Hover effects with shadow transitions
  - Responsive grid (2 cols mobile, 4 cols desktop)
- ✅ Improved empty state with:
  - Icon and centered layout
  - Clear messaging
  - Call-to-action button
- ✅ Toulmin framework tooltips:
  - Info icons next to each section
  - Helpful explanations on hover
  - Grounds, Warrant, Backing, Rebuttal all explained

**User Experience**:
- ✅ Collapsible filter panel to reduce clutter
- ✅ Show/Hide Filters toggle button
- ✅ Expand/Collapse All claims functionality
- ✅ Smooth transitions and animations

### Usage

**Quick Search**: Press `/` anywhere on the page to instantly focus the search input and start filtering claims.

**Filtering Workflow**:
1. Click "Show Filters" to open filter panel
2. Use search for quick text matching
3. Combine filters for precise targeting
4. View active filter summary at bottom
5. Click "Clear Filters" to reset

**Keyboard Navigation**:
- `/` = Focus search
- `Esc` = Clear search or close filters
- Works even when focused elsewhere on page

### Statistics Explained

**Main Claims**: Total count + filtered count shown in parentheses

**Thesis Candidates**: Count + percentage of total claims

**View Candidates**: Count + percentage of total claims

**Evidence Claims**: Count + ratio to main claims (e.g., "2.3:1" means 2.3 evidence claims per main claim)

---

## Future Enhancements

1. **Enhanced Provenance**:
   - Show "converted from claim" badge on theses/views
   - Link back to source insight from thesis/view page
   - Show evidence claims that support thesis

2. **Workflow Optimizations**:
   - Batch upload multiple audits
   - Auto-suggest thesis type based on claim category
   - Pre-fill parent thesis based on keywords
   - Bulk conversion of multiple claims

3. **Analytics**:
   - Track conversion rates
   - Show high-value unconverted claims
   - Recommend claims for conversion
   - Visualize claim hierarchy graph

---

## Summary

The claims workflow provides a systematic, traceable path from raw research to actionable investment beliefs:

1. **Extract** claims using Toulmin framework (no information loss)
2. **Upload** to database with full hierarchical structure
3. **Browse** claims in interactive UI
4. **Convert** high-conviction claims to theses/views
5. **Track** provenance from source to belief

**Benefits**:
- Research is never lost or forgotten
- Evidence explicitly linked to beliefs
- Conversion decisions are traceable
- Counter-arguments captured alongside claims

**Tested & Production-Ready**: All 48 integration tests passing ✅
