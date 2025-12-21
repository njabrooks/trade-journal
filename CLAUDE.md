# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Next.js full-stack application** for managing options trading strategies, tracking trades, and analyzing performance. The system integrates multiple data sources (IBKR, Massive.com) and implements a decision hierarchy from macro theses down to individual positions.

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
```

## Architecture Overview

### Decision Hierarchy

The system implements a four-level decision hierarchy (see `docs/PRD_v1.1.md` and `docs/terminology.md`):

1. **Macro Theses** - Cross-asset beliefs (secular, cyclical, structural)
2. **Asset Views** - Asset-specific theses about underlyings
3. **Strategies** - Tactical implementations (options, duration, relative value)
4. **Positions** - Individual trades and live exposures

**CRITICAL:** Do not confuse strategies with theses/views. Strategies are tactical execution constructs; theses/views are long-lived belief objects that evolve with evidence.

### Data Flow Pattern

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

### Core Architectural Patterns

1. **Async Computation** - Derived data is computed during ingestion and stored (not computed on-the-fly during queries)
2. **Type Safety** - End-to-end TypeScript with Drizzle ORM
3. **Server Components** - Next.js 16 defaults to server components; client components are minimal
4. **Process Tracking** - All ingestion runs logged to `ingestion_runs` table
5. **Normalized + Denormalized** - Some denormalization (e.g., ticker in multiple tables) for query efficiency

## Key Directories

### `/src/app` - Next.js App Router
- **Pages:** `/strategies`, `/triage`, `/blotter`, `/dashboard`, `/admin/*`
- **API Routes:** `/api/ingest/*`, `/api/ibkr/*`, `/api/strategies/*`, `/api/triage/*`, `/api/blotter/*`, `/api/recompute/*`

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

### `/src/components` - React UI
Feature-based component organization:
- **`ui/`** - Reusable primitives (Radix UI wrappers)
- **`layout/`** - Shell, navigation, tabs
- **`blotter/`**, **`triage/`**, **`strategies/`**, **`ibkr/`** - Feature-specific components

### `/scripts` - Standalone Utilities
- **`run-flex-ingestion.ts`** - Flex ingestion runner (used by GitHub Actions)
- **`ingest-underlyings-massive.ts`** - Massive.com daily ingestion
- **`seed_playbook_items.ts`** - Playbook initialization

## Database Schema (Drizzle ORM)

Key tables (see `/src/db/schema.ts` for full schema):

### Core Entities
- **`accounts`** - Broker accounts
- **`underlyings`** - Ticker metadata (spot, IV30, ATR20, RV20, conid)
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

## Terminology Reference

See `docs/terminology.md` for the authoritative terminology guide. Key concepts:

### PRD-Aligned Terms (Use These)
- **Macro Thesis / Macro Theses** - Cross-asset beliefs (new concept, not yet implemented)
- **Asset View / Asset Views** - Asset-specific theses about underlyings (new concept, not yet implemented)
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
- **Underlying** (reference data) vs **Asset View** (belief about that underlying)
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

### When Working with Triage/Blotter
- **Triage** (`/src/lib/derived/triage.ts`) - Evaluates positions, creates `triage_records`
- **Blotter** (`/src/lib/derived/blotter.ts`) - Aggregates trades, creates `blotter_actions`
- Both are recomputed after ingestion via `/api/recompute/*` endpoints
- State codes are managed via playbook system (`playbook_items` table)

### When Adding API Routes
- Use Next.js App Router conventions (`/src/app/api/*/route.ts`)
- Return JSON responses with proper error handling
- Use Drizzle queries from `/src/db/queries/` when possible
- Follow existing patterns in `/api/ingest/*` or `/api/strategies/*`

### Database Migrations
- Schema managed via Supabase (not local Drizzle migrations)
- Update `/src/db/schema.ts` to match Supabase schema
- Use Supabase MCP or console for schema changes
- No `migrations/` directory - schema is source of truth for TypeScript types only

## Important Implementation Notes

1. **React Compiler** - Project uses `babel-plugin-react-compiler` for automatic optimization
2. **Connection Pooling** - Use `DATABASE_URL_POOLER` for serverless compatibility (GitHub Actions)
3. **Denormalization Strategy** - Ticker is denormalized across multiple tables for query efficiency
4. **IBKR conid** - Stored in `underlyings` table for faster IBKR API calls
5. **Multi-source Data** - Yahoo Finance (spot) → IBKR Gateway → Massive (fallback priority)
6. **CSV Error Handling** - Detailed row-by-row error reporting with line numbers
7. **State Codes** - Playbook states like "LC1", "RR2" are tactical workflow concepts, not PRD concepts

## Quick Navigation for Specific Features

- **Strategy Management** → `/src/lib/services/strategies.ts` + `/src/app/admin/strategies/`
- **Triage Alerts** → `/src/lib/derived/triage.ts` + `/src/components/triage/`
- **Trade Ingestion** → `/src/lib/ingestion/flex/trades.ts` + `/src/app/api/ingest/flex/trades/route.ts`
- **IBKR Integration** → `/src/lib/services/ibkr/` + `/src/app/admin/ingestion/ibkr/`
- **Blotter/Journal** → `/src/lib/derived/blotter.ts` + `/src/components/blotter/`
- **Database Schema** → `/src/db/schema.ts` (705 lines, authoritative)
- **Styles** → `/src/app/globals.css` (Tailwind with custom animations)

## Future Development Context

This codebase is transitioning from a tactical options trading tool to the "Universal Investment Operating System" described in `docs/PRD_v1.1.md`. Key future additions:

- **Macro Theses** and **Asset Views** - Not yet implemented (Phase 1)
- **Research & Intelligence Layer** - AI-assisted research structuring (Phase 2)
- **Journal / Decision Log** - Evolution of current "Blotter" concept
- **Workflow Triggers** - First-class trigger entities beyond current triage rules (Phase 4)

When implementing new features, consult the PRD and terminology docs to ensure alignment with the long-term vision.
