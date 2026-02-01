# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Next.js full-stack application** for managing options trading strategies, tracking trades, and analyzing performance. The system integrates multiple data sources (IBKR, Massive.com) and implements a decision hierarchy from macro theses down to individual positions.

The application features a **local-first research workflow** using Toulmin framework claim extraction to process research artifacts (transcripts, articles) into structured evidence that feeds macro theses and asset thesiss. This research layer bridges external intelligence gathering with the tactical execution system.

## Technology Stack

- **Frontend:** Next.js 16 (React 19), TypeScript 5, Tailwind CSS 4, Radix UI
- **Backend:** Next.js API Routes, Drizzle ORM 0.44, PostgreSQL (Supabase)
- **External APIs:** IBKR (Flex API + Client Portal Gateway), Massive.com, Yahoo Finance, HyperLiquid, Coinbase Prime, Kraken
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
npx tsx scripts/ingest-hyperliquid.ts           # HyperLiquid crypto ingestion
npx tsx scripts/ingest-hyperliquid.ts --full    # HyperLiquid full backfill
npx tsx scripts/ingest-coinbase-prime.ts        # Coinbase Prime crypto ingestion
npx tsx scripts/ingest-coinbase-prime.ts --full # Coinbase Prime full backfill
npx tsx scripts/ingest-kraken.ts               # Kraken crypto ingestion
npx tsx scripts/ingest-kraken.ts --full        # Kraken full backfill

# Research workflow scripts
npx tsx scripts/test-claims-integration.ts      # Test claims parsing & DB integration
npx tsx scripts/upload-audit-with-claims.ts     # Upload research artifact with claims
npx tsx scripts/migrate-claims-structure.ts     # Migrate existing insights to claims structure

# Database query helper (used by skills)
npx tsx scripts/psql-query.ts "SELECT ..." --format json   # Execute SQL via psql
```

## Documentation Map

**Core Reference** (the three key documents):
- **[PRD v1.1](docs/PRD_v1.1.md)** - Product vision and requirements (locked)
- **[Current State](docs/CURRENT_STATE.md)** - Actual implementation state, state machines, cross-domain flows
- **[Future Enhancements](docs/FUTURE_ENHANCEMENTS.md)** - Single source of truth for planned work

**Feature Documentation** (detailed guides):
- **CLAUDE.md** (this file) - Quick reference, common commands, file navigation
- **[Terminology Guide](docs/features/terminology.md)** - Authoritative term definitions (PRD-aligned)
- **[Research Workflow](docs/features/research-workflow.md)** - Complete research workflow guide
- **[Signal & Triage Rules](docs/features/signal-triage-rules.md)** - All trigger rules, severity levels, auto-promotion flows
- **[Entity Status Guide](docs/features/entity-status-standardization.md)** - Universal lifecycle status model for domain entities

**Operations**:
- **[Database Mode Switch Runbook](docs/runbook-database-mode-switch.md)** - Switching between local and remote Supabase

**Historical/Reference**:
- **[docs/archive/](docs/archive/)** - Completed implementation notes and planning docs

## Architecture Overview

### Decision Hierarchy

The system implements a four-level decision hierarchy (see `docs/PRD_v1.1.md` and `docs/terminology.md`):

1. **Macro Theses** - Cross-asset beliefs (secular, cyclical, structural)
2. **Asset Thesiss** - Asset-specific theses about underlyings
3. **Strategies** - Tactical implementations (options, duration, relative value)
4. **Positions** - Individual trades and live exposures

**CRITICAL:** Do not confuse strategies with theses. Strategies are tactical execution constructs; theses (macro and asset) are long-lived belief objects that evolve with evidence.

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
Computed Tables (triage_records, strategy_metrics_snapshots, journal_entries)
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
Decision Hierarchy (macro_theses, asset_theses)
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
7. **Provenance Tracking** - Automatic tracking from claims → theses via conversion metadata

### Entity State Machines

All lifecycle entities use a **universal status model** (as of #ENH-048):

```
draft ──► active ──┬──► complete
                   └──► rejected
```

| Entity | Field | Values | Notes |
|--------|-------|--------|-------|
| MacroThesis | `status` | draft, active, complete, rejected | Single unified lifecycle |
| AssetThesis | `status` | draft, active, complete, rejected | Single unified lifecycle |
| MainClaim | `status` | draft, active, complete, rejected | Single unified lifecycle |
| Signal | `status` | draft, active, complete, rejected | Single unified lifecycle |
| Strategy | `status` | draft, active, complete, rejected | Auto-computed from positions |
| TriageRecord | `status` | inbox, in_progress, done | Workflow state |
| TriageRecord | `severity` | urgent, attention, monitor, info | Importance level |
| Position | `isOpen` | true, false | Boolean toggle (closed when quantity = 0) |

**Key Transitions:**
```
Universal:  draft → active → complete | rejected
Strategy:   draft (no positions) → active (open positions) → complete (closed) | rejected (abandoned)
Triage:     inbox → in_progress → done (workflow), severity is independent
```

For complete documentation, see `docs/CURRENT_STATE.md`.

### Cross-Domain Data Flow

```
INGESTION (Entry Points)                    RESEARCH (Entry Points)
┌──────────────────────┐                    ┌──────────────────────┐
│ IBKR Flex API        │                    │ Transcripts/Articles │
│ Massive.com          │                    │ (Local Markdown)     │
└──────────┬───────────┘                    └──────────┬───────────┘
           │                                           │
           ▼                                           ▼
┌──────────────────────┐                    ┌──────────────────────┐
│ trades, positions    │                    │ research_artifacts   │
│ underlyings          │                    │ research_insights    │
└──────────┬───────────┘                    │ (claims_structure)   │
           │                                └──────────┬───────────┘
           │                                           │ auto-promote
           │                                           ▼
           │                                ┌──────────────────────┐
           │                                │ main_claims          │
           │                                │ claim_thesis_mappings│
           │                                └──────────┬───────────┘
           │                                           │
           ▼                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BELIEF LAYER                                   │
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ macro_theses    │◄────────────►│ asset_theses    │            │
│  │ (cross-asset)   │   linkage    │ (ticker-specific)│           │
│  └────────┬────────┘              └────────┬────────┘            │
│           └────────────┬───────────────────┘                     │
│                        ▼                                         │
│           ┌─────────────────────┐                                │
│           │ thesis_triage_recs  │                                │
│           └─────────────────────┘                                │
└──────────────────────────────────────────────────────────────────┘
                         │ evidence linkage
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    EXECUTION LAYER                                │
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ strategies      │◄────────────►│ positions       │            │
│  │ (tactical)      │   contains   │ (live exposure) │            │
│  └────────┬────────┘              └────────┬────────┘            │
│           ▼                                ▼                     │
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ signals         │              │ triage_records  │            │
│  └─────────────────┘              └─────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
                         │ all events flow to
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    JOURNAL LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ journal_entries (narrative audit trail for all events)      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  Note: Triage overrides stored on triage_records (overrideSource)│
└──────────────────────────────────────────────────────────────────┘
```

## Key Directories

### `/src/app` - Next.js App Router
- **Pages:** `/strategies`, `/triage`, `/journal`, `/dashboard`, `/research/*`, `/macro-theses/*`, `/asset-theses/*`, `/admin/*`
- **API Routes:** `/api/ingest/*`, `/api/ibkr/*`, `/api/strategies/*`, `/api/triage/*`, `/api/journal/*`, `/api/recompute/*`, `/api/research/*`

### `/src/db` - Data Layer
- **`schema.ts`** (705 lines) - Complete Drizzle ORM schema with relationships and indexes
- **`index.ts`** - Database client with Supabase connection pooling
- **`types.ts`** - Auto-generated TypeScript types from Supabase
- **`queries/`** - Pre-built query functions organized by entity

### `/src/lib/derived` - Computation Engine
Contains business logic for calculating derived insights from raw data:

- **`triage.ts`** (1259 lines) - Position triage: DTE alerts, size thresholds, complexity flags, IV metrics
- **`thesisTriage.ts`** (550 lines) - Thesis triage rules (needs articulation, new claims)
- **`signalEvaluation.ts`** (365 lines) - Auto signal evaluation for strategy triggers
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
- **`crypto/`** - Shared crypto exchange modules
  - `types.ts` - `CryptoTradeInput`, `CryptoPositionInput`, converters to schema types
  - `pairNormalization.ts` - Exchange-specific ticker normalization (HyperLiquid, Coinbase Prime, Kraken)
  - `cursors.ts` - Incremental ingestion cursor helpers using `ingestion_cursors` table
- **`coinbase-prime/`** - Coinbase Prime API integration (HMAC-SHA256 auth, fills, balances)
- **`hyperliquid/`** - HyperLiquid API integration
- **`kraken/`** - Kraken API integration (HMAC-SHA512 auth, trades, balances, margin positions)
  - `api.ts` - HTTP client (single POST endpoint, no auth), types, retry/backoff
  - `fills.ts` - Fill normalization + time-based pagination (500/query, 10K limit)
  - `positions.ts` - Perp, spot, and staked HYPE position normalization
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
- **`triage/`**, **`strategies/`**, **`signals/`**, **`ibkr/`**, **`journal/`** - Feature-specific components
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
- **`test-claims-integration.ts`** - Test claims parsing and database integration (48 tests)
- **`upload-audit-with-claims.ts`** - Upload research artifact with claims structure
- **`migrate-claims-structure.ts`** - Migrate existing insights to new claims structure
- **`test-claim-conversion.ts`** - Test claim-to-thesis conversion logic

### `/.cursor/skills` - Claude Code Skills
Research workflow automation skills (managed skills, invoked via `/skill-name`):

**Research Ingestion (Bottom-Up Discovery):**
- **`process-transcript`** - Process research transcripts with forensic Toulmin claim extraction
- **`synthesize-claims`** - Cross-reference audit claims against existing macro theses and asset theses in database
- **`deep-dive`** - Guide collaborative deep dive analysis on themes or tickers
- **`finalize-for-upload`** - Upload finalized research (auto-detects artifact/insight/macro thesis/asset thesis)

**Signal Assessment (Top-Down Evidence):**
- **`assess-signal-evidence`** - Assess content against existing signals to identify confirmation or warning evidence

**Database Operations:**
- **`create-thesis`** - Create macro thesis in Supabase from markdown (via psql)
- **`create-asset-thesis`** - Create asset thesis in Supabase from markdown (via psql)
- **`read-theses`** - Query and display macro theses from database (via psql)
- **`read-asset-theses`** - Query and display asset theses from database (via psql)
- **`upload-artifact`** - Upload raw research artifact to database (via psql)
- **`upload-insight`** - Upload structured insight to database (via psql)

**Database Access**: All database skills use `scripts/psql-query.ts` helper instead of Supabase MCP due to reliability issues. The helper loads env vars and executes SQL via psql directly.

## Database Schema (Drizzle ORM)

Key tables (see `/src/db/schema.ts` for full schema):

### Core Entities
- **`accounts`** - Broker accounts
- **`underlyings`** - Ticker metadata (spot, IV30, ATR20, RV20, conid)
- **`macro_theses`** - Cross-asset beliefs with confidence level, status, and evidence linkage
- **`asset_theses`** - Asset-specific theses linked to underlyings and macro theses
- **`strategies`** - User-defined trading strategies with entry context
- **`trades`** - Individual trade executions
- **`positions`** - Current/closed positions with MTM data

### Derived/Computed Tables
- **`triage_records`** - Triage alerts with severity/urgency/reasons (includes override columns)
- **`journal_entries`** - Chronological audit trail for all events
- **`strategy_metrics_snapshots`** - Historical strategy performance
- **`mtm_snapshots`** - Mark-to-market snapshots

### Supporting Tables
- **`underlyings_iv_history`** - Time-series IV/spot snapshots (unique on ticker + date + source)
- **`options_chain_snapshots`** - Full options chains for IV analysis
- **`strategy_templates`** - Reusable strategy patterns for auto-linking
- **`triage_rules`** - Configurable triage logic
- **`ingestion_runs`** - Process tracking for all data imports
- **`ingestion_cursors`** - Incremental ingestion state per exchange/account (high-water mark timestamps)

### Research Tables
- **`research_artifacts`** - Raw research content (transcripts, articles, notes) with metadata
- **`research_insights`** - Processed insights with `claims_structure` JSONB field
  - `claims_structure` stores hierarchical Toulmin framework (main_claims + evidence_claims)
  - Each claim has: text, evidence, reasoning, backing, confidence, category, conversion status
- **`prompts`** - AI prompts for research processing (versioned, activatable)
- **Provenance tracking** - `macro_theses` and `asset_theses` include source claim metadata for traceability

## Terminology Reference

See `docs/features/terminology.md` for the authoritative terminology guide. Key concepts:

### PRD-Aligned Terms (Use These)
- **Macro Thesis / Macro Theses** - Cross-asset beliefs ✅ (implemented with claims provenance)
- **Asset Thesis / Asset Theses** - Asset-specific theses about underlyings ✅ (implemented with claims provenance)
- **Research Artifact** - Raw research content (transcript, article, note) ✅
- **Research Insight** - Processed artifact with Toulmin claims structure ✅
- **Claim** - Individual assertion from research with evidence/reasoning/backing ✅
- **Strategies** - Tactical implementations ✅ (existing, aligns with PRD)
- **Positions** - Live exposures ✅ (existing, aligns with PRD)
- **Triage** - Evaluation of urgency/severity ✅ (existing, aligns perfectly)
- **Signals** - Strategy trigger rules (price_above, price_below, etc.) ✅ (implemented 2026-01-16)
- **Journal** - Chronological log of decisions and events ✅ (`journal_entries` table)

### Implementation Terms (Keep As-Is)
- **Underlying** - The financial instrument (reference data, not a belief)
- **Strategy Template** - Reusable strategy pattern (tactical, not in PRD)

### Critical Distinctions
- **Underlying** (reference data) vs **Asset Thesis** (belief about that underlying)
- **Strategy** (tactical execution) vs **Thesis** (long-lived belief at macro or asset level)
- **Triage** (evaluation process) vs **Action Items** (user-facing queue)
- **Signal** (confirmation/warning criteria) vs **Triage Record** (actionable item created when signal triggers)

## Data Ingestion Architecture (Remote-Primary)

**Primary**: Remote Supabase is the source of truth. Ingestion runs via GitHub Actions.
**Development**: All machines connect directly to remote Supabase.
**Fallback**: Local Mac Mini Supabase available for offline development (see runbook).

```
┌─────────────────────────────────────────────────────────────┐
│              REMOTE SUPABASE (Primary)                      │
│              aws-1-eu-north-1.pooler.supabase.com           │
├─────────────────────────────────────────────────────────────┤
│  Source of truth for all data                               │
│                                                             │
│  Data flows:                                                │
│  ├── GitHub Actions → Ingestion (Flex, Massive)            │
│  ├── Edge Functions → TradingView webhooks (tv-webhook)    │
│  └── All machines → Direct reads/writes                     │
└─────────────────────────────────────────────────────────────┘
                    ▲
                    │ Direct connection (all machines)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│            DEVELOPMENT MACHINES                             │
├─────────────────────────────────────────────────────────────┤
│  MacBook Pro / Mac Mini / Any machine                      │
│  npm run dev → connects to remote Supabase                 │
│  Works from anywhere with internet                          │
└─────────────────────────────────────────────────────────────┘
```

### GitHub Actions Scheduled Jobs

Ingestion runs automatically via GitHub Actions (all times UTC):
- **Flex ingestion**: Hourly from 4 AM to 2 PM UTC (covers US market hours)
- **Massive ingestion**: 9:30 PM UTC (4:30 PM ET, 30 min after market close)
- **HyperLiquid ingestion**: Every 4 hours, 24/7 (crypto markets)
- **Coinbase Prime ingestion**: Every 4 hours (offset 15min from HL), 24/7
- **Kraken ingestion**: Every 4 hours (offset 30min from HL), 24/7

Workflows:
- `.github/workflows/flex-ingestion.yml` - IBKR Flex API trades/positions
- `.github/workflows/massive-ingestion.yml` - Massive.com IV/spot data
- `.github/workflows/hyperliquid-ingestion.yml` - HyperLiquid fills/positions/staking
- `.github/workflows/coinbase-prime-ingestion.yml` - Coinbase Prime fills/balances
- `.github/workflows/kraken-ingestion.yml` - Kraken trades/balances/margin positions

Manual trigger available from GitHub UI for testing.

### Environment Configuration

All machines use remote Supabase in `.env.local`:
```bash
DATABASE_URL_POOLER=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
USE_DIRECT_CONNECTION=false
```

### Mode Switching

To switch between local and remote modes, see **[Database Mode Switch Runbook](docs/runbook-database-mode-switch.md)**.

**Why remote-primary?**
- Simpler architecture (no Mac Mini dependency, no Tailscale)
- Edge Functions for webhooks (TradingView alerts)
- Works from anywhere without VPN setup
- GitHub Actions handles scheduled ingestion reliably

**When to use local mode:**
- Offline development
- Schema experimentation
- Heavy data manipulation without egress costs

## Environment Variables

Required in `.env.local`:

```bash
# Database - Local Supabase (primary)
DATABASE_URL_POOLER=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL_DIRECT=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Database - Remote Supabase (for sync scripts)
DATABASE_URL_REMOTE=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres

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

# Coinbase Prime
COINBASE_PRIME_ACCESS_KEY=<access-key>
COINBASE_PRIME_SIGNING_KEY=<base64-encoded-signing-key>
COINBASE_PRIME_PASSPHRASE=<passphrase>
COINBASE_PRIME_PORTFOLIO_ID=<portfolio-id>

# HyperLiquid (no auth needed, just wallet address)
HYPERLIQUID_WALLET_ADDRESS=0x...

# Kraken
KRAKEN_API_KEY=<api-key>
KRAKEN_API_SECRET=<base64-encoded-api-secret>

# TradingView Webhooks (optional - for strategy signals)
NEXT_PUBLIC_TV_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/tv-webhook
```

## Working with the Codebase

### When Adding Features
1. **Read PRD first** - Check `docs/PRD_v1.1.md` and `docs/terminology.md` for context
2. **Check existing patterns** - Look at similar features in `/src/lib/derived/` or `/src/lib/services/`
3. **Use Drizzle ORM** - All database access via Drizzle; prefer pre-built queries in `/src/db/queries/`
4. **Add process tracking** - Log ingestion runs to `ingestion_runs` table
5. **Follow computation pattern** - Compute during ingestion, store results, don't compute on query
6. **Update documentation** - Follow the checklist below

### Documentation Maintenance

**CRITICAL:** Documentation must stay in sync with code. Follow this checklist for every significant change.

**After completing any feature or fix:**

| Change Type | Update Required |
|-------------|-----------------|
| New table/column | `CLAUDE.md` (Database Schema section) |
| New API route | `CLAUDE.md` (Key Directories section) |
| New component | `CLAUDE.md` (Key Directories section) |
| State field changes | `docs/CURRENT_STATE.md` (State Machines section) |
| New enhancement started | `docs/FUTURE_ENHANCEMENTS.md` (move to Active) |
| Enhancement completed | `docs/FUTURE_ENHANCEMENTS.md` (move to Completed summary table) + `docs/archive/completed-enhancements-2025-2026.md` (add full specification) |
| Dead code identified | `docs/CURRENT_STATE.md` (Dead Code Registry) |
| Dead code removed | `docs/CURRENT_STATE.md` (mark as removed) |
| Technical debt added | `docs/FUTURE_ENHANCEMENTS.md` (add to backlog or deferred) |
| Technical debt resolved | `docs/FUTURE_ENHANCEMENTS.md` (mark complete) |
| New terminology | `docs/terminology.md` |
| Terminology changed | Search and update all docs |

**Quick sanity checks:**
- Does `CLAUDE.md` Key Directories match actual file structure?
- Does `CURRENT_STATE.md` State Machines match actual schema?
- Is `FUTURE_ENHANCEMENTS.md` accurate for current sprint?

**Quarterly cleanup (or when docs feel stale):**
1. Run `grep -r "TODO\|FIXME\|DEPRECATED" src/` to find code debt
2. Compare `CURRENT_STATE.md` dead code registry against actual codebase
3. Archive completed enhancements older than 3 months
4. Verify all cross-references between docs are valid

### When Planning Future Work

All enhancements must be tracked in `docs/FUTURE_ENHANCEMENTS.md` - the **single source of truth** for work planning.

**Process:**
1. **Check existing enhancement registry** - Search `FUTURE_ENHANCEMENTS.md` for related work
2. **Create enhancement entry** with unique ID (format: `#ENH-xxx`)
3. **Reference PRD section** - Every enhancement should map to PRD v1.1 sections
4. **Document in appropriate section**:
   - Active/In Progress - Current sprint work
   - Planned - Prioritized backlog
   - Deferred - Intentionally delayed
   - Abandoned - Cancelled with rationale

**Enhancement Entry Template:**
```markdown
#### #ENH-xxx: Feature Name
**Status**: Planned | In Progress | Complete | Deferred | Abandoned
**Priority**: High | Medium | Low
**PRD**: Section X (relevant PRD section)
**Source**: Link to original discussion/issue

**Description**: What this enhancement does
**Technical Implementation**: Key files and approach
**Big Picture Impact**: How this fits into the system
```

**The Three Core Documents:**
- `docs/PRD_v1.1.md` - Product vision and requirements (locked)
- `docs/CURRENT_STATE.md` - Actual implementation state, state machines, dead code registry
- `docs/FUTURE_ENHANCEMENTS.md` - Single source of truth for planned work and technical debt

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

### When Working with Triage/Signals/Journal
- **Triage** (`/src/lib/derived/triage.ts`) - Evaluates positions/strategies, creates `triage_records`
  - **Account-agnostic**: Triage queue shows records from all accounts by default
  - **Key triggers**: `CONFIRM_STRATEGY` (urgent, for unconfirmed auto-derived strategies), `LINK_STRATEGY_TO_THESIS` (info, for confirmed strategies without thesis)
  - **Strategy confirmation**: Requires label, strategyType, direction; assetThesisId is optional (can be linked later)
  - **Strategy merging**: Confirmation dialog includes merge functionality for calendar spreads and multi-leg strategies
- **Thesis Triage** (`/src/lib/derived/thesisTriage.ts`) - Evaluates theses for articulation needs, new claims
- **Signals** (`/src/lib/derived/signalEvaluation.ts`) - Evaluates strategy signals, creates triggers
- **Journal** (`/src/lib/workflow/lifecycleDetection.ts`) - `logToJournal()` captures all events
- **Triage Overrides** - Severity overrides stored on `triage_records` via `overrideSource`, `overrideExpiresDate`, `overrideAt`
- Recomputation via `/api/recompute/*` endpoints after ingestion

### When Working with Research Workflow
The research workflow follows a **local-first processing pattern** using Toulmin framework claim extraction. **Supabase is the single source of truth** - no bidirectional sync with external tools.

**Quick Start**:
```bash
/process-transcript path/to/transcript    # Extract Toulmin claims → local Markdown
/finalize-for-upload path/to/audit        # Upload to Supabase (one-way)
```

**Full Guide**: See **[docs/features/research-workflow.md](251231-research-workflow.md)** for:
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
7. **Signal-Based Triggers** - Signals system handles strategy trigger evaluation (playbook/stateCode system removed)
8. **Local-First Research** - Research processing via Claude Code skills with Supabase as single source of truth
9. **Toulmin Framework** - Claims use Toulmin argumentation model (claim, evidence, reasoning, backing)
10. **Provenance Tracking** - Automatic tracking from research claims → theses with source metadata
11. **JSONB Claims Structure** - `research_insights.claims_structure` stores hierarchical claim tree
12. **No Bidirectional Sync** - One-way upload from local Markdown to Supabase; no automatic sync back to files
13. **TradingView Webhooks** - Price alerts via Edge Function (`supabase/functions/tv-webhook`), matched by `tvAlertName` in signal config
14. **Universal Status Model** - All lifecycle entities (theses, claims, signals, strategies) use unified status: draft, active, complete, rejected
15. **Multi-Exchange Position Snapshots** - Strategy status/metrics use per-account latest snapshot dates (not global) to handle different ingestion schedules across IBKR and crypto exchanges
16. **Crypto Asset Classes** - `CRYPTO` (spot holdings) and `PERP` (perpetual futures) alongside existing `STK`/`OPT`. Position types: `crypto_long`, `crypto_short`, `crypto_staked`, `perp_long`, `perp_short`
17. **HyperLiquid Integration** - No auth needed for reads. Fills (trades), perp/spot positions, staked HYPE (delegations), and mark prices via single POST endpoint. Incremental fill ingestion via `ingestion_cursors` table
18. **Coinbase Prime Integration** - HMAC-SHA256 auth with base64-decoded secret. Fills (trades) with cursor pagination, balances (positions) with USD fiat_amount. No cost basis on positions (deferred to #ENH-051). Spot-only (no perps)
19. **Kraken Integration** - HMAC-SHA512 auth with base64-decoded secret + nonce. TradesHistory (offset pagination, 50/page, rate cost 2), Balance (spot positions with Ticker price enrichment), OpenPositions (margin with cost basis/PnL from API). No cost basis on spot positions (deferred to #ENH-051)

## TradingView Webhook Integration

Strategy signals can be triggered by TradingView price alerts via Supabase Edge Function.

**Setup:**
1. Deploy Edge Function: `supabase functions deploy tv-webhook`
2. Add env var: `NEXT_PUBLIC_TV_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/tv-webhook`
3. In TradingView: Create alert, set webhook URL, use standard JSON payload

**Payload Template (paste into TradingView alert message):**
```json
{
  "ticker": "{{ticker}}",
  "exchange": "{{exchange}}",
  "alertName": "{{alertname}}",
  "price": {{close}},
  "time": "{{timenow}}",
  "interval": "{{interval}}"
}
```

**Matching Logic:**
- Webhook matches signals by `tvAlertName` (case-insensitive) + strategy's `underlying_ticker`
- On match: Signal status → `triggered`, triage record created with `recommendedAction`
- Journal entry logged with trigger context

**Files:**
- Edge Function: `supabase/functions/tv-webhook/index.ts`
- Signal Config UI: `src/components/signals/StrategySignalConfigForm.tsx`
- Signal Display: `src/components/signals/StrategySignalsSection.tsx`

## Quick Navigation for Specific Features

- **Research Workflow** → [docs/features/research-workflow.md](251231-research-workflow.md) (full guide) + `/src/lib/research/` + `/.claude/skills/`
- **Claims Browsing** → `/src/components/research/ClaimsBrowser.tsx` + `/src/app/research/[id]/page.tsx`
- **Claim Conversion** → `/src/components/research/ConvertClaimDialog.tsx` + `/src/app/api/research/convert-claim/`
- **Macro Theses** → `/src/app/theses/` + `/src/db/schema.ts` (macro_theses table)
- **Asset Theses** → `/src/app/asset-theses/` + `/src/db/schema.ts` (asset_theses table)
- **Strategy Management** → `/src/lib/services/strategies.ts` + `/src/app/admin/strategies/`
  - Strategy confirmation → `/src/components/strategies/StrategyConfirmationDialog.tsx` (includes merge functionality)
  - Related strategies API → `/src/app/api/strategies/related/route.ts`
  - Merge API → `/src/app/api/strategies/merge/route.ts`
- **Triage Alerts** → `/src/lib/derived/triage.ts` + `/src/components/triage/`
  - Account-agnostic queue → `/src/db/queries/triage.ts` (`getTriageQueueAllAccounts()`)
  - Triage page → `/src/app/triage/page.tsx` (shows all accounts by default)
- **Trade Ingestion** → `/src/lib/ingestion/flex/trades.ts` + `/src/app/api/ingest/flex/trades/route.ts`
- **IBKR Integration** → `/src/lib/services/ibkr/` + `/src/app/admin/ingestion/ibkr/`
- **Journal** → `/src/lib/workflow/lifecycleDetection.ts` + `/src/components/journal/`
- **Database Schema** → `/src/db/schema.ts` (705 lines, authoritative)
- **Styles** → `/src/app/globals.css` (Tailwind with custom animations)

## Future Development Context

This codebase is transitioning from a tactical options trading tool to the "Universal Investment Operating System" described in `docs/PRD_v1.1.md`.

### Implemented Features ✅
- **Macro Theses** and **Asset Theses** - Core entities with claims provenance tracking
- **Research & Intelligence Layer** - Local-first Toulmin claim extraction workflow
- **Claims Browsing & Conversion** - Web UI for exploring and converting research into macro/asset theses
- **Claude Code Skills** - Automated research processing and database integration
- **Signals System** - Strategy trigger rules with TradingView webhook integration
- **Journal System** - Chronological log of decisions and events (`logToJournal()`)
- **Thesis Triage** - Automated detection of theses needing articulation or new claims

### Remaining Future Additions
See `docs/FUTURE_ENHANCEMENTS.md` for the complete prioritized backlog. Key items:
- **Phase 3.3: Thesis Synthesis** - AI-assisted thesis articulation from accumulated claims
- **Enhanced Evidence Linking** - Direct linkage from positions/strategies back to supporting claims
- **Research Synthesis Dashboard** - Portfolio-wide view of macro thesis → asset thesis → strategy → position chain

### Recently Completed (2026-01-16)
- **Blotter-to-Journal Migration** - `blotter_actions` table removed, overrides now stored on `triage_records`

When implementing new features, consult PRD, terminology docs, and FUTURE_ENHANCEMENTS.md for alignment.
