# Research Workflow - Complete Guide

**Last Updated**: 2025-12-28
**Status**: Production-ready with first-class main claims architecture

---

## System Integration

The research workflow is the **intelligence layer** of the Trade Journal system, bridging external research with the decision hierarchy:

```
Research Processing (Local AI via Claude Code Skills)
      ↓
Research Artifacts & Insights (Database with Toulmin claims)
      ↓
Main Claims (First-class entities with evidence accumulation)
      ↓
Macro Theses & Asset Views (Decision hierarchy Level 1-2)
      ↓
Strategies & Positions (Tactical execution Level 3-4)
```

**Key Principle**: All AI processing happens **locally** via Claude Code skills. The web app is for browsing, converting, and managing research—not for AI-assisted processing.

**Related Documentation**:
- [PRD v1.1](/docs/PRD_v1.1.md) - System vision and requirements
- [Terminology Guide](/docs/terminology.md) - Authoritative term definitions
- [System Architecture](/docs/system_architecture_transition_plan.md) - Implementation roadmap

---

## Overview

The research workflow enables systematic conversion of research transcripts into actionable macro theses and asset views using the **Toulmin argumentation framework**. All processing happens locally via Claude Code skills, with the web app serving as a browser and conversion interface.

### Key Features

- **Forensic Claim Extraction**: No information loss from source material
- **Hierarchical Structure**: Main claims link to supporting/rebutting evidence
- **First-Class Main Claims**: Promote high-quality claims to dedicated `main_claims` table
- **Evidence Accumulation**: Link supporting claims from multiple audits to main claims
- **Conversion Tracking**: Claims track when/what they're converted to
- **Provenance Chain**: Full lineage from transcript → claim → thesis/view
- **Interactive UI**: Browse, filter, search, promote, and convert claims in app

---

## Quick Start

### 1. Process a Transcript

```bash
# In Claude Code local session
/process-transcript path/to/transcript.md
```

**Output**: Audit file with Toulmin claims structure

**What it does**:
- Extracts hierarchical claims (main claims + evidence claims)
- Applies Toulmin framework (claim, evidence, reasoning, backing, rebuttal, qualifier)
- Categorizes claims (thesis_candidate, view_candidate, macro, asset_specific)
- Writes to Obsidian vault (configured via `OBSIDIAN_AUDITS_DIR` env var)

### 2. Upload to Database

```bash
/finalize-for-upload path/to/audit.md
```

**Creates**:
- `research_artifacts` record (original transcript)
- `research_insights` record (with `claims_structure` JSONB)

**What it does**:
- Auto-detects content type from frontmatter
- Parses claims structure into JSONB
- Creates database records via `/api/research/*` endpoints

### 3. Browse & Convert in App

Visit `http://localhost:3000/research/[insight-id]`

**Features**:
- Expandable claim cards with full Toulmin structure
- **Promote** high-quality claims to first-class `main_claims` table
- **Convert** claims to macro theses or asset views
- Filter by type (thesis/view candidates), confidence, conversion status
- Search across claims, evidence, reasoning, and tickers

---

## Architecture

### Data Schema

The workflow uses a **hierarchical JSONB structure** stored in `research_insights.claims_structure`:

```typescript
{
  main_claims: [
    {
      id: "claim-1",
      level: "main",
      type: "thesis_candidate" | "view_candidate",
      category: "macro" | "asset_specific",

      // Toulmin Framework
      claim: "The main assertion",
      evidence: "Supporting data and observations",
      reasoning: "Logic connecting evidence to claim",
      backing: "Additional support for reasoning",
      rebuttal: "Counter-arguments or exceptions",
      qualifier: "high" | "medium" | "low" | "exploratory",

      // Metadata
      time_horizon: "long_term" | "medium_term" | "short_term",
      tickers: ["NVDA", "TSLA"],

      // Hierarchical References
      supporting_evidence_claims: ["claim-19", "claim-20"],
      rebutting_evidence_claims: [],

      // Conversion Tracking
      converted_to?: {
        type: "macro_thesis" | "asset_view",
        id: "uuid",
        converted_at: "ISO timestamp"
      }
    }
  ],
  evidence_claims: [
    {
      id: "claim-19",
      level: "evidence",
      type: "supporting" | "rebutting",
      claim: "Evidence claim text",
      evidence: "Additional context or data",
      confidence: "high" | "medium" | "low",
      supports_main_claims: ["claim-1"]
    }
  ]
}
```

### Components

**Active Components** (4 total):
- `ClaimsBrowser.tsx` (665 lines) - Main claims browsing interface
- `ConvertClaimDialog.tsx` (282 lines) - Claim-to-thesis/view conversion
- `WorkflowStatusCard.tsx` (130 lines) - Progress checklist
- `EmptyClaimsState.tsx` (98 lines) - Guidance when no claims exist

**Parser**:
- `src/lib/research/parseClaimsMarkdown.ts` (257 lines) - Converts audit markdown → JSON

**Skills** (`.claude/skills/`):
- `/process-transcript` - Extract Toulmin claims from transcripts
- `/synthesize-claims` - Cross-reference claims against existing theses/views
- `/deep-dive` - Guided collaborative analysis
- `/finalize-for-upload` - Auto-detect and upload research to database

**Archived Components** (~2000 lines):
- Old in-app AI processing workflow (deprecated, moved to `src/components/research/archive/`)

### Database Tables

```sql
-- Source material
research_artifacts (id, title, source_type, raw_content, status, ...)

-- Structured analysis (JSONB storage)
research_insights (
  id,
  research_artifact_id,
  claims_structure JSONB,  -- ← Hierarchical Toulmin structure
  summary,
  key_themes,
  ...
)

-- First-class main claims (NEW - Phase 1)
main_claims (
  id,
  title,
  category,
  claim,
  evidence,          -- Toulmin: supporting data
  reasoning,         -- Toulmin: logic connecting evidence to claim
  backing,
  qualifier,
  rebuttal,
  status,            -- 'active' | 'invalidated' | 'merged'
  ...
)

-- Evidence linking (NEW - Phase 1)
main_claim_evidence (
  id,
  main_claim_id,
  research_insight_id,
  supporting_claim_id,      -- Path to claim in claims_structure JSONB
  relationship_type,        -- 'supports' | 'refutes' | 'qualifies'
  ...
)

-- Claim-to-thesis/view mappings (NEW - Phase 1)
claim_thesis_mappings (
  id,
  main_claim_id,
  macro_thesis_id,         -- One of these
  asset_view_id,           -- is set
  mapping_type,            -- 'supports' | 'refutes' | 'foundation'
  ...
)

-- Hierarchy
macro_theses (id, title, description, thesis_type, direction, ...)
asset_views (id, underlying_id, title, description, direction, target_price, ...)
```

---

## Workflows

### Full Research → Main Claim (NEW)

```
1. Local: /process-transcript → audit with Toulmin claims
2. Local: /finalize-for-upload → upload to database
3. App: Browse claims at /research/{id}
4. App: Click "Promote" on high-quality claim
5. App: Confirm promotion
6. Claim promoted to first-class main_claims table
7. Can now accumulate evidence from multiple audits
8. Can link to multiple theses/views
```

### Full Research → Thesis

```
1. Local: /process-transcript → audit with Toulmin claims
2. Local: /finalize-for-upload → upload to database
3. App: Browse claims at /research/{id}
4. App: Click "Convert" on thesis candidate
5. App: Select thesis type (secular/cyclical/structural/tactical)
6. App: Add directional stance (bullish/bearish/neutral), dates, sectors
7. App: Submit → redirected to /theses/{id}
8. Claim shows "✓ Converted to macro thesis" badge
```

### Full Research → View

```
1. Local: /process-transcript → audit with Toulmin claims
2. Local: /finalize-for-upload → upload to database
3. App: Browse claims at /research/{id}
4. App: Click "Convert" on view candidate
5. App: Enter ticker (e.g., "NVDA"), optionally link to parent thesis
6. App: Add directional stance, target price, entry reference price
7. App: Submit → redirected to /asset-views/{id}
8. Claim shows "✓ Converted to asset view" badge
```

### Partial Conversion

Not all claims need to be converted:
- Convert high-conviction claims to theses/views
- Leave low-conviction or exploratory claims unconverted
- Use as evidence repository for existing theses/views

---

## UI Features

### Filtering & Search
- Full-text search across claims, evidence, and tickers
- Filter by conversion status (All, Unconverted, Converted)
- Filter by claim type (All, Thesis Candidates, View Candidates)
- Filter by confidence level (All, High, Medium, Low, Exploratory)
- Filter by category (All, Macro, Asset Specific)
- Sort by original order, confidence, or time horizon
- Active filters summary with count
- One-click clear all filters

### Keyboard Shortcuts
- Press `/` to focus search input
- Press `Esc` to clear search or close filter panel

### Visual Enhancements
- Enhanced statistics cards with percentage indicators
- Evidence-to-claim ratio (e.g., "2.3:1")
- Toulmin framework tooltips on hover
- Expandable claim cards with hierarchical evidence display
- Conversion status badges
- Collapsible filter panel

### Accessibility
- ARIA labels on search input
- Proper form control attributes
- Keyboard navigation support
- Focus management

---

## Toulmin Framework Explained

Each claim includes six components:

1. **Claim**: The assertion being made
2. **Evidence**: Supporting data and observations
3. **Reasoning**: Logic connecting evidence to claim
4. **Backing**: Additional support for the reasoning
5. **Qualifier**: Confidence level (high, medium, low, exploratory)
6. **Rebuttal**: Counter-arguments or exceptions

**Benefits**:
- Forces explicit reasoning and evidence
- Captures counter-arguments alongside claims
- Creates systematic, traceable research
- Enables conversion to actionable beliefs

---

## Provenance Chain

Every conversion is tracked:

```
research_artifacts (original transcript)
      ↓ (research_artifact_id)
research_insights (claims_structure)
      ↓ (converted_to.id)
macro_theses / asset_views (actionable beliefs)
```

**Claim Conversion Tracking**:
```json
{
  "converted_to": {
    "type": "macro_thesis",
    "id": "5b299579-eccf-4f53-8785-58026ea605b0",
    "converted_at": "2025-12-26T12:34:56.789Z"
  }
}
```

---

## Environment Configuration

Research processing integrates with an external Obsidian vault:

```bash
# .env.local
OBSIDIAN_VAULT_PATH=/Users/njb/Desktop/nick
OBSIDIAN_SYNC_ENABLED=true
OBSIDIAN_SYNC_MODE=polling
OBSIDIAN_SYNC_INTERVAL_MINUTES=5

# Content directories (relative to OBSIDIAN_VAULT_PATH)
OBSIDIAN_TRANSCRIPTS_DIR=investing/research/transcripts
OBSIDIAN_AUDITS_DIR=investing/research/audits
OBSIDIAN_SYNTHESES_DIR=investing/research/syntheses
OBSIDIAN_DEEP_DIVES_DIR=investing/research/deep-dives
OBSIDIAN_MAIN_CLAIMS_DIR=investing/main-claims
OBSIDIAN_MACRO_THESES_DIR=investing/macro-theses
OBSIDIAN_ASSET_VIEWS_DIR=investing/asset-views
```

**Skills Configuration**:
- All skills read these env vars to determine output paths
- Fallback to `research-workspace/` if env vars not set
- Skills write directly to Obsidian vault (not to project folder)

---

## Testing

### Integration Tests

```bash
npx tsx --env-file=.env.local scripts/test-claims-integration.ts
```

**48 tests covering**:
- Data upload verification (5 tests)
- Claims structure verification (8 tests)
- Toulmin structure verification (14 tests)
- Evidence claims verification (6 tests)
- Helper functions (3 tests)
- Conversion simulation (6 tests)
- Database integrity (6 tests)

### Conversion Tests

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
2. Visit: `http://localhost:3000/research/[insight-id]`
3. Test claims browsing, filtering, conversion workflow

---

## File Structure

### Project Structure
```
/src/
├── lib/research/
│   └── parseClaimsMarkdown.ts         # Audit markdown → JSON parser
├── components/research/
│   ├── ClaimsBrowser.tsx              # Main claims browsing UI
│   ├── ConvertClaimDialog.tsx         # Claim conversion UI
│   ├── WorkflowStatusCard.tsx         # Progress tracking
│   ├── EmptyClaimsState.tsx           # Onboarding guidance
│   └── archive/                       # Deprecated in-app AI workflow
├── app/
│   ├── research/[id]/page.tsx         # Claims browser page
│   └── api/research/
│       ├── convert-claim/route.ts     # Claim conversion endpoint
│       └── promote-claim/route.ts     # Main claim promotion endpoint
└── db/
    └── schema.ts                      # Database schema (research tables)

/.claude/skills/
├── process-transcript/                # Toulmin claim extraction skill
├── synthesize-claims/                 # Claim synthesis skill
├── deep-dive/                         # Deep dive analysis skill
└── finalize-for-upload/              # Auto-upload skill
```

### Local Cache (Optional)
```
research-workspace/
├── README.md                          # Workflow documentation (local copy)
├── FUTURE_ENHANCEMENTS.md            # Phase 2+ plans
├── .obsidian/                        # Local Obsidian settings
├── 1-transcripts/                    # Local staging: Raw transcripts
├── 2-audits/                         # Local staging: Processed audits
├── 3-syntheses/                      # Local staging: Synthesis docs
├── 4-deep-dives/                     # Local staging: Deep dives
└── 5-finalized/                      # Local staging: Ready for upload
```

**Note**: The Obsidian vault (configured via env vars) is the canonical source. `research-workspace/` is for local development/testing only.

---

## Troubleshooting

### Issue: Insight shows legacy InsightReview instead of ClaimsBrowser

**Cause**: Insight doesn't have `claims_structure` or it's invalid.

**Solution**:
```sql
SELECT id, claims_structure IS NOT NULL as has_claims
FROM research_insights
WHERE id = 'your-insight-id';
```
If missing, re-upload audit file.

### Issue: Need to backfill direction on existing theses/views

**Solution** (manual SQL):
```sql
-- Backfill macro theses
UPDATE macro_theses
SET direction = 'neutral'
WHERE direction IS NULL;

-- Backfill asset views
UPDATE asset_views
SET direction = 'neutral'
WHERE direction IS NULL;
```

### Issue: Claim conversion fails with 400 error

**Possible Causes**:
1. Claim already converted
2. Invalid thesis_type or ticker
3. Missing required fields

**Debug**:
```sql
SELECT claims_structure->'main_claims'
FROM research_insights
WHERE id = 'your-insight-id';
```
Look for `converted_to` field on claim.

### Issue: Build errors after adding claims components

**Common Issues**:
1. Type imports: Use `import type { Type } from ...`
2. Select onChange: Cast value `e.target.value as typeof state`
3. JSONB casting: Use `as any` for Drizzle JSONB fields

### Issue: Skills not writing to Obsidian vault

**Check**:
1. `.env.local` has correct `OBSIDIAN_*_DIR` paths
2. Directories exist in the Obsidian vault
3. Paths are relative to `OBSIDIAN_VAULT_PATH`

**Fix**:
```bash
# Create missing directories
mkdir -p /Users/njb/Desktop/nick/investing/research/{transcripts,audits,syntheses,deep-dives}
mkdir -p /Users/njb/Desktop/nick/investing/{main-claims,macro-theses,asset-views}
```

---

## Success Metrics

### Workflow Metrics
- ✅ Upload audit in < 30 seconds
- ✅ Convert claim to thesis in < 2 minutes
- ✅ Full round-trip (local → app → local) in < 10 minutes

### Technical Metrics
- ✅ 100% of audit claims preserved in `claims_structure`
- ✅ Zero data loss during parsing
- ✅ < 2s page load for claims browser (with 20+ claims)
- ✅ Conversion API < 500ms response time

### UX Metrics
- ✅ Clear visual hierarchy (main claims → evidence)
- ✅ One-click conversion to thesis/view
- ✅ Provenance preserved (can trace thesis back to source claim)
- ✅ Draft state supported (claims can remain unconverted)

---

## Implementation Status

**Complete** (2025-12-28):
- ✅ First-class `main_claims` table with full Toulmin structure
- ✅ Evidence linking via `main_claim_evidence` table
- ✅ Claim-to-thesis/view mappings via `claim_thesis_mappings` table
- ✅ Directional stance fields added to theses/views
- ✅ Promotion workflow via UI "Promote" button
- ✅ Correct Toulmin terminology (evidence/reasoning) throughout codebase
- ✅ Obsidian bidirectional sync with configurable paths

**Future Enhancements** (see `docs/archive/research/FUTURE_ENHANCEMENTS.md`):
- Main Claim Evolution View: Timeline of evidence accumulation over time
- Claim Graph Visualization: Interactive claim hierarchy graphs
- AI-Assisted Extraction: Auto-extraction of Toulmin components
- Claim Clustering: Group similar claims across transcripts
- Integration with Blotter: Link claims to trading decisions

---

## Related Documentation

- **[CLAUDE.md](/CLAUDE.md)** - Developer quick reference with research workflow summary
- **[PRD v1.1](/docs/PRD_v1.1.md)** - Product vision and requirements
- **[Terminology Guide](/docs/terminology.md)** - Authoritative term definitions
- **[System Architecture](/docs/system_architecture_transition_plan.md)** - Implementation roadmap
- **[Main Claims Implementation](/docs/archive/main-claims-implementation-progress.md)** - Historical implementation notes
- **[Main Claims Workflow Fixes](/docs/archive/main-claims-workflow-fixes.md)** - Recent bug fixes and workflow updates

---

**Document Status**: Single source of truth for the research workflow (replaces `research-workspace/README.md` as canonical reference)
