# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Next.js full-stack application** for managing options trading strategies, tracking trades, and analyzing performance. The system integrates multiple data sources (IBKR, Massive.com) and implements a decision hierarchy from macro theses down to individual positions.

The application features a **local-first research workflow** using Toulmin framework claim extraction to process research artifacts (transcripts, articles) into structured evidence that feeds macro theses and asset thesiss. This research layer bridges external intelligence gathering with the tactical execution system.

## Technology Stack

- **Frontend:** Next.js 16 (React 19), TypeScript 5, Tailwind CSS 4, Radix UI
- **Backend:** Next.js API Routes, Drizzle ORM 0.44, PostgreSQL (Supabase)
- **External APIs:** IBKR (Flex API + Client Portal Gateway), Massive.com, Yahoo Finance
- **Build Tools:** tsx (script execution), ESLint 9

## Common Development Commands

```bash
# Development
npm run dev        # Start development server on http://localhost:3000
npm run build      # Production build
npm start          # Production server
npm run lint       # Run ESLint

# Run standalone scripts
npx tsx scripts/<script-name>.ts

# Common scripts
npx tsx scripts/run-flex-ingestion.ts           # IBKR Flex ingestion
npx tsx scripts/ingest-underlyings-massive.ts   # Massive.com IV/spot ingestion
npx tsx scripts/seed_playbook_items.ts          # Initialize playbook data

# Research workflow scripts
npx tsx scripts/test-claims-integration.ts      # Test claims parsing & DB integration
npx tsx scripts/upload-audit-with-claims.ts     # Upload research artifact with claims
npx tsx scripts/migrate-claims-structure.ts     # Migrate existing insights to claims structure

# Database query helper (used by skills)
npx tsx scripts/psql-query.ts "SELECT ..." --format json   # Execute SQL via psql
```

## Documentation Map

**For Developers** (quick reference and navigation):
- **CLAUDE.md** (this file) - Quick reference, common commands, file navigation
- **[Terminology Guide](docs/terminology.md)** - Authoritative term definitions (PRD-aligned)
- **[Research Workflow](docs/features/research-workflow.md)** - Complete research workflow guide
- **[Documentation Best Practices](docs/DOCUMENTATION_BEST_PRACTICES.md)** - How to document work and link to big picture

**For Architects** (system design and vision):
- **[PRD v1.1](docs/PRD_v1.1.md)** - Product vision and requirements (locked)
- **[System Architecture](docs/system_architecture_transition_plan.md)** - Implementation roadmap and transition plan
- **[Future Enhancements](docs/FUTURE_ENHANCEMENTS.md)** - **Single source of truth** for all enhancements (past/present/future)
- **[Implementation Progress](docs/implementation_progress.md)** - Phase completion tracking

**Historical/Reference**:
- **[docs/archive/](docs/archive/)** - Completed implementation notes and planning docs

## Architecture Overview

### Decision Hierarchy

The system implements a four-level decision hierarchy (see `docs/PRD_v1.1.md` and `docs/terminology.md`):

1. **Macro Theses** - Cross-asset beliefs (secular, cyclical, structural)
2. **Asset Thesiss** - Asset-specific theses about underlyings
3. **Strategies** - Tactical implementations (options, duration, relative value)
4. **Positions** - Individual trades and live exposures

**CRITICAL:** Do not confuse strategies with theses/views. Strategies are tactical execution constructs; theses/views are long-lived belief objects that evolve with evidence.

### Data Flow Pattern

**Trading Data Flow:**
```
External Sources (IBKR Flex, Massive, IBKR Gateway)
  ↓
Ingestion Layer (/src/lib/ingestion/)
  ↓
Raw Data Tables (trades, positions, underlyings_iv_history, etc.)
  ↓
Derived Computation Layer (/src/lib/derived/)
  ↓
Computed Tables (triage_records, blotter_actions, strategy_metrics_snapshots)
  ↓
API Routes (/src/app/api/)
  ↓
React Frontend
```

**Research Data Flow:**
```
Research Sources (Transcripts, Articles, Notes)
  ↓
Local AI Processing (Claude Code skills, Toulmin extraction)
  ↓
Markdown Audits with Claims Structure
  ↓
Research Upload (/src/app/api/research/)
  ↓
Research Tables (research_artifacts, research_insights with claims_structure)
  ↓
Claim Conversion (/src/app/api/research/convert-claim/)
  ↓
Decision Hierarchy (macro_theses, asset_views)
  ↓
React Frontend (ClaimsBrowser, ConvertClaimDialog)
```

### Core Architectural Patterns

1. **Async Computation** - Derived data is computed during ingestion and stored (not computed on-the-fly during queries)
2. **Type Safety** - End-to-end TypeScript with Drizzle ORM
3. **Server Components** - Next.js 16 defaults to server components; client components are minimal
4. **Process Tracking** - All ingestion runs logged to `ingestion_runs` table
5. **Normalized + Denormalized** - Some denormalization (e.g., ticker in multiple tables) for query efficiency
6. **Local-First Research Workflow** - Research processing happens locally via Claude Code skills, with Supabase as single source of truth
7. **Provenance Tracking** - Automatic tracking from claims → theses/views via conversion metadata

## Key Directories

### `/src/app` - Next.js App Router
- **Pages:** `/strategies`, `/triage`, `/blotter`, `/dashboard`, `/research/*`, `/theses/*`, `/asset-theses/*`, `/admin/*`
- **API Routes:** `/api/ingest/*`, `/api/ibkr/*`, `/api/strategies/*`, `/api/triage/*`, `/api/blotter/*`, `/api/recompute/*`, `/api/research/*`

### `/src/db` - Data Layer
- **`schema.ts`** (705 lines) - Complete Drizzle ORM schema with relationships and indexes
- **`index.ts`** - Database client with Supabase connection pooling
- **`types.ts`** - Auto-generated TypeScript types from Supabase
- **`queries/`** - Pre-built query functions organized by entity

### `/src/lib/derived` - Computation Engine
Contains business logic for calculating derived insights from raw data:

- **`triage.ts`** (1096 lines) - Position triage: DTE alerts, size thresholds, complexity flags, IV metrics
- **`blotter.ts`** (1746 lines) - Trade aggregations, strategy matching, action generation
- **`stateCode.ts`** - Position state determination (ITM/OTM, assignment risk, playbook states like "LC1", "RR2")
- **`strategyAuto.ts`** - Auto-linking trades to strategies based on templates
- **`ivMetrics.ts`** - IV rank and IV percentile calculations from options chain snapshots
- **`portfolio.ts`** - Portfolio-level aggregations (unrealized PnL, notional)
- **`strategyMetrics.ts`** - Historical strategy performance snapshots

### `/src/lib/ingestion` - ETL Pipelines
- **`flex/`** - IBKR Flex API integration
  - `api.ts` - Flex Web Service client
  - `trades.ts` - Trade normalization & validation
  - `positions.ts` - Position processing with multiplier handling
  - `processCsv.ts` - Generic CSV parsing/validation framework (uses PapaParse)
- **`massive/`** - Massive.com integration for daily IV/spot snapshots
- **`underlyingsIvHistory.ts`** - IV history management

### `/src/lib/services` - External Integrations
- **`ibkr/`** - IBKR Client Portal Gateway API
  - `client.ts` - Main API client
  - `contracts.ts` - Contract lookup (conid resolution)
  - `historical-spot.ts` - Historical pricing
  - `iv-data.ts` - IV data fetching
  - `data-priority.ts` - Fallback logic (Yahoo Finance → IBKR Gateway → Massive)
- **`strategies.ts`** (32KB) - Strategy business logic
- **`strategyLinking.ts`** - Trade-to-strategy matching logic
- **`processTracking.ts`** - Ingestion run tracking/logging

### `/src/lib/research` - Research Processing
- **`parseClaimsMarkdown.ts`** (257 lines) - Parser for Toulmin framework markdown audits → JSON
  - Hierarchical claim structure (main_claims with nested evidence_claims)
  - Extracts FULL Toulmin framework for BOTH main and evidence claims
  - Full structure: claim, evidence[], reasoning, backing, qualifier, rebuttal
  - Validates claim structure and metadata

### `/src/components` - React UI
Feature-based component organization:
- **`ui/`** - Reusable primitives (Radix UI wrappers)
- **`layout/`** - Shell, navigation, tabs
- **`blotter/`**, **`triage/`**, **`strategies/`**, **`ibkr/`** - Feature-specific components
- **`research/`** - Research workflow components
  - `UnifiedClaimsBrowser.tsx` - Browse main claims with filtering, search, status management
  - `ExpandableEvidenceClaim.tsx` - Expandable card showing full Toulmin framework for evidence claims
  - `ConvertClaimDialog.tsx` (282 lines) - Convert claims to macro theses or asset thesiss
  - `WorkflowStatusCard.tsx` (130 lines) - Research workflow progress tracking UI
  - `EmptyClaimsState.tsx` (98 lines) - Onboarding guidance for research workflow
  - `archive/` - Deprecated in-app AI workflow components (11 components archived)

### `/scripts` - Standalone Utilities
- **`lib/db.ts`** - Database helper for scripts (handles dotenv + Drizzle ORM correctly)
- **`run-flex-ingestion.ts`** - Flex ingestion runner (used by GitHub Actions)
- **`ingest-underlyings-massive.ts`** - Massive.com daily ingestion
- **`seed_playbook_items.ts`** - Playbook initialization
- **`test-claims-integration.ts`** - Test claims parsing and database integration (48 tests)
- **`upload-audit-with-claims.ts`** - Upload research artifact with claims structure
- **`migrate-claims-structure.ts`** - Migrate existing insights to new claims structure
- **`test-claim-conversion.ts`** - Test claim-to-thesis/view conversion logic

### `/.cursor/skills` - Claude Code Skills
Research workflow automation skills (managed skills, invoked via `/skill-name`):
- **`process-transcript`** - Process research transcripts with forensic Toulmin claim extraction
- **`synthesize-claims`** - Cross-reference audit claims against existing theses/views in database
- **`deep-dive`** - Guide collaborative deep dive analysis on themes or tickers
- **`finalize-for-upload`** - Upload finalized research (auto-detects artifact/insight/thesis/view)
- **`create-thesis`** - Create macro thesis in Supabase from markdown (via psql)
- **`create-view`** - Create asset thesis in Supabase from markdown (via psql)
- **`read-theses`** - Query and display macro theses from database (via psql)
- **`read-views`** - Query and display asset thesiss from database (via psql)
- **`upload-artifact`** - Upload raw research artifact to database (via psql)
- **`upload-insight`** - Upload structured insight to database (via psql)

**Database Access**: All database skills use `scripts/psql-query.ts` helper instead of Supabase MCP due to reliability issues. The helper loads env vars and executes SQL via psql directly.

## Database Schema (Drizzle ORM)

Key tables (see `/src/db/schema.ts` for full schema):

### Core Entities
- **`accounts`** - Broker accounts
- **`underlyings`** - Ticker metadata (spot, IV30, ATR20, RV20, conid)
- **`macro_theses`** - Cross-asset beliefs with conviction, status, and evidence linkage
- **`asset_views`** - Asset-specific theses linked to underlyings and macro theses
- **`strategies`** - User-defined trading strategies with entry context
- **`trades`** - Individual trade executions
- **`positions`** - Current/closed positions with MTM data

### Derived/Computed Tables
- **`triage_records`** - Triage alerts with severity/urgency/reasons
- **`blotter_actions`** - Trade-level aggregations and strategy linkage
- **`strategy_metrics_snapshots`** - Historical strategy performance
- **`mtm_snapshots`** - Mark-to-market snapshots

### Supporting Tables
- **`underlyings_iv_history`** - Time-series IV/spot snapshots (unique on ticker + date + source)
- **`options_chain_snapshots`** - Full options chains for IV analysis
- **`strategy_templates`** - Reusable strategy patterns for auto-linking
- **`playbook_items`** - Strategy playbook rules with state codes (LC1, RR2, etc.)
- **`triage_rules`** - Configurable triage logic
- **`ingestion_runs`** - Process tracking for all data imports

### Research Tables
- **`research_artifacts`** - Raw research content (transcripts, articles, notes) with metadata
- **`research_insights`** - Processed insights with `claims_structure` JSONB field
  - `claims_structure` stores hierarchical Toulmin framework (main_claims + evidence_claims)
  - Each claim has: text, evidence, reasoning, backing, confidence, category, conversion status
- **`prompts`** - AI prompts for research processing (versioned, activatable)
- **Provenance tracking** - `macro_theses` and `asset_views` include source claim metadata for traceability

## Terminology Reference

See `docs/terminology.md` for the authoritative terminology guide. Key concepts:

### PRD-Aligned Terms (Use These)
- **Macro Thesis / Macro Theses** - Cross-asset beliefs ✅ (implemented with claims provenance)
- **Asset Thesis / Asset Thesiss** - Asset-specific theses about underlyings ✅ (implemented with claims provenance)
- **Research Artifact** - Raw research content (transcript, article, note) ✅
- **Research Insight** - Processed artifact with Toulmin claims structure ✅
- **Claim** - Individual assertion from research with evidence/reasoning/backing ✅
- **Strategies** - Tactical implementations ✅ (existing, aligns with PRD)
- **Positions** - Live exposures ✅ (existing, aligns with PRD)
- **Triage** - Evaluation of urgency/severity ✅ (existing, aligns perfectly)
- **Journal** or **Decision Log** - Chronological log of decisions (⚠️ currently called "Blotter")

### Implementation Terms (Keep As-Is)
- **Underlying** - The financial instrument (reference data, not a belief)
- **Strategy Template** - Reusable strategy pattern (tactical, not in PRD)
- **State Code** - Playbook state identifier (LC1, RR2) (tactical, not in PRD)
- **Playbook** - Tactical rules for strategy states (tactical, not in PRD)
- **Blotter** - Current term for decision log (will evolve to "Journal")

### Critical Distinctions
- **Underlying** (reference data) vs **Asset Thesis** (belief about that underlying)
- **Strategy** (tactical execution) vs **Thesis/View** (long-lived belief)
- **Triage** (evaluation process) vs **Action Items** (user-facing queue)

## Automated Data Ingestion (GitHub Actions)

Two scheduled workflows (`.github/workflows/`):

1. **`flex-ingestion.yml`** - IBKR trades/positions
   - Cron: `0 4,6,12 * * *` (4 AM, 6 AM, 12 PM GMT)
   - Runs: `npx tsx scripts/run-flex-ingestion.ts`
   - Env vars: `IBKR_FLEX_TOKEN`, `IBKR_FLEX_POSITIONS_QUERY_ID`, `IBKR_FLEX_TRADES_QUERY_ID`

2. **`massive-ingestion.yml`** - IV & spot prices
   - Cron: `30 20 * * *` (4:30 PM ET / 8:30 PM UTC)
   - Runs: `npx tsx scripts/ingest-underlyings-massive.ts`
   - Env vars: `MASSIVE_API_KEY`

## Environment Variables

Required in `.env.local`:

```bash
# Database (Supabase)
DATABASE_URL_POOLER=<supabase-pooler-url>
DATABASE_URL_DIRECT=<supabase-direct-url>
USE_DIRECT_CONNECTION=false

# IBKR Flex API
IBKR_FLEX_TOKEN=<token>
IBKR_FLEX_POSITIONS_QUERY_ID=<query-id>
IBKR_FLEX_TRADES_QUERY_ID=<query-id>
IBKR_FLEX_BASE_URL=https://gdcdyn.interactivebrokers.com/Universal/servlet

# IBKR Client Portal Gateway
IBKR_GATEWAY_BASE_URL=<gateway-url>
IBKR_GATEWAY_USERNAME=<username>
IBKR_GATEWAY_PASSWORD=<password>

# Massive.com
MASSIVE_API_KEY=<api-key>
MASSIVE_API_BASE_URL=https://api.massive.com
```

## Working with the Codebase

### When Adding Features
1. **Read PRD first** - Check `docs/PRD_v1.1.md` and `docs/terminology.md` for context
2. **Check existing patterns** - Look at similar features in `/src/lib/derived/` or `/src/lib/services/`
3. **Use Drizzle ORM** - All database access via Drizzle; prefer pre-built queries in `/src/db/queries/`
4. **Add process tracking** - Log ingestion runs to `ingestion_runs` table
5. **Follow computation pattern** - Compute during ingestion, store results, don't compute on query

### When Modifying Data Ingestion
- CSV ingestion uses PapaParse via `/src/lib/ingestion/flex/processCsv.ts`
- All ingestion has row-level validation with detailed error reporting
- Process tracking is critical - log to `ingestion_runs` with status/errors
- Handle multipliers carefully (100 for equity options contracts)

### When Writing Scripts with Database Access

**Use the scripts helper** (`scripts/lib/db.ts`) for reliable database access:

```typescript
import { db, closeDb, schema } from './lib/db.js';
const { researchInsights, mainClaims } = schema;

async function main() {
  // Use db normally with Drizzle ORM
  const results = await db.select().from(mainClaims);

  // Always close connection when done
  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
```

**Why use the helper instead of `src/db/index.ts`?**

ES module imports are hoisted, so this pattern **fails**:
```typescript
import { config } from 'dotenv';
config({ path: '.env.local' });           // This runs SECOND
import { db } from '../src/db/index.js';  // This runs FIRST (env vars undefined!)
```

The `scripts/lib/db.ts` helper solves this by loading dotenv before creating the client.

**For shell commands**, use `source .env.local`:
```bash
source .env.local && /opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL_POOLER" -c "SELECT ..."
```

**Common pitfall**: Ensure `.env.local` has valid syntax (all lines must have `KEY=value` format, not just `KEY`).

### When Working with Triage/Blotter
- **Triage** (`/src/lib/derived/triage.ts`) - Evaluates positions, creates `triage_records`
- **Blotter** (`/src/lib/derived/blotter.ts`) - Aggregates trades, creates `blotter_actions`
- Both are recomputed after ingestion via `/api/recompute/*` endpoints
- State codes are managed via playbook system (`playbook_items` table)

### When Working with Research Workflow
The research workflow follows a **local-first processing pattern** using Toulmin framework claim extraction. **Supabase is the single source of truth** - no bidirectional sync with external tools.

**Quick Start**:
```bash
/process-transcript path/to/transcript    # Extract Toulmin claims → local Markdown
/finalize-for-upload path/to/audit        # Upload to Supabase (one-way)
```

**Full Guide**: See **[docs/features/research-workflow.md](docs/features/research-workflow.md)** for:
- Detailed workflow stages and Toulmin framework explanation
- Claims structure specification (main claims + evidence claims)
- UI features (filtering, search, conversion, promotion)
- Testing procedures and troubleshooting
- Environment configuration (local Markdown output paths)

**Key Components**:
- **Parser**: `src/lib/research/parseClaimsMarkdown.ts` - Audit markdown → JSON
- **Markdown Generator**: `src/lib/obsidian/markdown.ts` - Used by skills to write local files
- **UI Components**: `src/components/research/` (ClaimsBrowser, ConvertClaimDialog, etc.)
- **Skills**: `.claude/skills/` (process-transcript, synthesize-claims, deep-dive, finalize-for-upload)
- **Database**: `research_artifacts`, `research_insights` (with `claims_structure` JSONB), `main_claims` tables

**Data Flow**: Local Markdown → Upload to Supabase → Browse/manage in web UI. No automatic sync back to local files.

### When Adding API Routes
- Use Next.js App Router conventions (`/src/app/api/*/route.ts`)
- Return JSON responses with proper error handling
- Use Drizzle queries from `/src/db/queries/` when possible
- Follow existing patterns in `/api/ingest/*` or `/api/strategies/*`

### Database Migrations
- Schema managed via Supabase using **psql** (not Drizzle migrations or Supabase MCP)
- Migration files stored in `/migrations/` directory for version control
- Update `/src/db/schema.ts` first as source of truth for TypeScript types
- **Process**:
  1. Update `src/db/schema.ts` with new table/column definitions
  2. Create migration SQL file in `/migrations/` directory
  3. **Run migration immediately via psql** (don't ask user to run it):
     ```bash
     /opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL_POOLER" -f migrations/your-migration.sql
     ```
  4. Verify changes took effect with a query

**Why psql?**
- Supabase MCP tools (`apply_migration`, `execute_sql`) experience timeout errors
- Direct psql execution is fast and reliable
- Migration files provide version control and documentation

**IMPORTANT**: Always run migrations yourself immediately after creating them. Don't ask the user to run them manually.

### Git Commits
**IMPORTANT**: Always use the commit message template at **[docs/archive/commit_message_template.md](docs/archive/commit_message_template.md)**

**Template Structure**:
```
<type>(<scope>): <subject>

## Problem
- <issue description>

## Solution
- <what was changed>

## Impact
- <what this fixes/improves>

## Files Changed
- <file>: <change description>
```

**Types**: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `style`

**When to use full template**:
- Feature additions (`feat`)
- Bug fixes (`fix`)
- Refactors that change behavior

**Simplified format OK for**:
- Dependency updates (`chore`)
- Documentation (`docs`)
- Formatting (`style`)

## Important Implementation Notes

1. **React Compiler** - Project uses `babel-plugin-react-compiler` for automatic optimization
2. **Connection Pooling** - Use `DATABASE_URL_POOLER` for serverless compatibility (GitHub Actions)
3. **Denormalization Strategy** - Ticker is denormalized across multiple tables for query efficiency
4. **IBKR conid** - Stored in `underlyings` table for faster IBKR API calls
5. **Multi-source Data** - Yahoo Finance (spot) → IBKR Gateway → Massive (fallback priority)
6. **CSV Error Handling** - Detailed row-by-row error reporting with line numbers
7. **State Codes** - Playbook states like "LC1", "RR2" are tactical workflow concepts, not PRD concepts
8. **Local-First Research** - Research processing via Claude Code skills with Supabase as single source of truth
9. **Toulmin Framework** - Claims use Toulmin argumentation model (claim, evidence, reasoning, backing)
10. **Provenance Tracking** - Automatic tracking from research claims → theses/views with source metadata
11. **JSONB Claims Structure** - `research_insights.claims_structure` stores hierarchical claim tree
12. **No Bidirectional Sync** - One-way upload from local Markdown to Supabase; no automatic sync back to files

## Quick Navigation for Specific Features

- **Research Workflow** → [docs/features/research-workflow.md](docs/features/research-workflow.md) (full guide) + `/src/lib/research/` + `/.claude/skills/`
- **Claims Browsing** → `/src/components/research/ClaimsBrowser.tsx` + `/src/app/research/[id]/page.tsx`
- **Claim Conversion** → `/src/components/research/ConvertClaimDialog.tsx` + `/src/app/api/research/convert-claim/`
- **Macro Theses** → `/src/app/theses/` + `/src/db/schema.ts` (macro_theses table)
- **Asset Thesiss** → `/src/app/asset-theses/` + `/src/db/schema.ts` (asset_views table)
- **Strategy Management** → `/src/lib/services/strategies.ts` + `/src/app/admin/strategies/`
- **Triage Alerts** → `/src/lib/derived/triage.ts` + `/src/components/triage/`
- **Trade Ingestion** → `/src/lib/ingestion/flex/trades.ts` + `/src/app/api/ingest/flex/trades/route.ts`
- **IBKR Integration** → `/src/lib/services/ibkr/` + `/src/app/admin/ingestion/ibkr/`
- **Blotter/Journal** → `/src/lib/derived/blotter.ts` + `/src/components/blotter/`
- **Database Schema** → `/src/db/schema.ts` (705 lines, authoritative)
- **Styles** → `/src/app/globals.css` (Tailwind with custom animations)

## Future Development Context

This codebase is transitioning from a tactical options trading tool to the "Universal Investment Operating System" described in `docs/PRD_v1.1.md`.

### Implemented Features ✅
- **Macro Theses** and **Asset Thesiss** - Core entities with claims provenance tracking
- **Research & Intelligence Layer** - Local-first Toulmin claim extraction workflow
- **Claims Browsing & Conversion** - Web UI for exploring and converting research into theses/views
- **Claude Code Skills** - Automated research processing and database integration

### Remaining Future Additions
- **Journal / Decision Log** - Evolution of current "Blotter" concept with narrative context
- **Workflow Triggers** - First-class trigger entities beyond current triage rules (Phase 4)
- **Enhanced Evidence Linking** - Direct linkage from positions/strategies back to supporting claims
- **Research Synthesis Dashboard** - Portfolio-wide view of thesis → view → strategy → position chain

When implementing new features, consult the PRD and terminology docs to ensure alignment with the long-term vision.
