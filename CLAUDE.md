# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Next.js full-stack application** for managing a multi-exchange investment portfolio, developing macro and asset theses, and monitoring evidence for those theses over time. The system spans five integrated layers:

1. **Data ingestion** — live portfolio data from IBKR (equity options), HyperLiquid, Coinbase Prime, Kraken, Deribit, Solana, and Massive.com (IV/spot snapshots)
2. **Belief hierarchy** — macro theses and asset theses, structured with claims provenance and synthesised articulations; linked to tactical strategies and positions
3. **Research intelligence** — Toulmin-framework claim extraction from transcripts and articles feeds the thesis hierarchy. World Monitor and Thesis Monitor intelligence briefings are ingested and linked to thesis signals.
4. **Signal monitoring** — explicit confirmation/warning criteria per thesis and strategy, with time-series data snapshots (quantitative and qualitative), FRED economic indicator thresholds, and TradingView economic calendar integration
5. **Research playbook** — stage-gated pipeline (5 stages: init → thesis → unknowns → evidence → expression) for developing new investment ideas from initial claim to expressed position

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
npx tsx scripts/ingest-deribit.ts              # Deribit crypto ingestion
npx tsx scripts/ingest-deribit.ts --full       # Deribit full backfill
npx tsx scripts/ingest-solana.ts               # Solana wallet balance ingestion

# Database query helper (used by skills)
npx tsx scripts/psql-query.ts "SELECT ..." --format json   # Execute SQL via psql
```


## Architecture Overview

### Decision Hierarchy

The system implements a four-level decision hierarchy:

1. **Macro Theses** - Cross-asset beliefs (secular, cyclical, structural)
2. **Asset Theses** - Asset-specific theses about underlyings
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
React Frontend (UnifiedClaimsBrowser, ConvertClaimToEntityDialog)
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

**Thesis lifecycle model** — theses use a two-phase lifecycle:

```
draft → developing → monitoring → complete | rejected
```

- `developing`: accumulating claims as thesis evidence. Intelligence routes as claim suggestions.
- `monitoring`: `build-core-argument` has run, signals exist. Intelligence routes as signal evidence.
- Transition trigger: `insert-thesis-articulation.ts` sets developing → monitoring on articulation creation.

**Other entities** use a universal status model:

```
draft ──► active ──┬──► complete
                   └──► rejected
```

| Entity | Field | Values | Notes |
|--------|-------|--------|-------|
| MacroThesis | `status` | draft, developing, monitoring, complete, rejected | Two-phase lifecycle |
| AssetThesis | `status` | draft, developing, monitoring, complete, rejected | Two-phase lifecycle |
| MainClaim | `status` | draft, active, complete, rejected | Single unified lifecycle |
| Signal | `status` | draft, active, complete, rejected | Single unified lifecycle |
| Strategy | `status` | draft, active, complete, rejected | Auto-computed from positions |
| TriageRecord | `status` | inbox, in_progress, done | Workflow state |
| TriageRecord | `severity` | urgent, attention, monitor, info | Importance level |
| Position | `isOpen` | true, false | Boolean toggle (closed when quantity = 0) |

**Key Transitions:**
```
Thesis:     draft → developing → monitoring → complete | rejected (monitoring → developing for rework)
Strategy:   draft (no positions) → active (open positions) → complete (closed) | rejected (abandoned)
Triage:     inbox → in_progress → done (workflow), severity is independent
```

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

### Investment Pipeline

New investment ideas are developed through a stage-gated research playbook in `research-workspace/pipeline/`. Each idea lives in its own directory (`idea-NNN-slug/`) with a `_meta.yaml` tracking file and one markdown file per stage:

```
pipeline/idea-NNN-slug/
├── _meta.yaml          # State: stage, confidence, linked_theses, stage_history, next_review
├── stage-1-triage.md
├── stage-2-thesis.md
├── stage-3-unknowns.md
├── stage-4-evidence.md
└── stage-5-expression.md
```

**Stages:**
1. **Init** — claim or transcript initialises the idea with source reference and initial confidence
2. **Formalise** — produce a falsifiable thesis with explicit failure modes
3. **Map unknowns** — identify decision-critical unknowns (primary gate: is research effort justified?)
4. **Evidence** — research unknowns via falsification, validation, or analogue tracks; update posterior confidence
5. **Express** — translate conviction into actionable positioning (value chain, sizing inputs)

Ideas that don't reach conviction threshold are archived or moved to "watch" status. Stage gates are managed via the `/advance-or-kill` skill. The pipeline is independent of the live thesis hierarchy — a pipeline idea creates a `macro_thesis` or `asset_thesis` record only when it reaches the expression stage with sufficient confidence.

### Signal Monitoring & Intelligence

The signals system connects the belief layer to live data:

- **`thesis_articulations`** — `build-core-argument` synthesises linked claims into a versioned core argument. Articulations generate the signals that define what would confirm or invalidate the thesis.
- **`signal_data_snapshots`** — time-series record of each signal's state. Quantitative snapshots come from `collect-signal-data.ts` (data-driven signals); qualitative snapshots come from `ingest-world-monitor.ts` (thesis-monitor reports) and `assess-validation-evidence` (research routing).
- **Intelligence briefings** — World Monitor and Thesis Monitor reports (from Arbor) are ingested via `ingest-world-monitor.ts` into `intelligence_reports` + `intelligence_items`. Thesis Monitor reports trigger `generateQualitativeSnapshots()` which writes directly to `signal_data_snapshots`.
- **FRED indicators** — macro signals can be wired to FRED economic series via `thesis_fred_indicators`. Threshold breaches are logged to `fred_threshold_breaches`.

## Key Directories

### `/src/app` - Next.js App Router
- **Pages:** `/strategies`, `/triage`, `/journal`, `/dashboard`, `/research/*`, `/macro-theses/*`, `/asset-theses/*`, `/admin/*`
- **API Routes:** `/api/ingest/*`, `/api/ibkr/*`, `/api/strategies/*`, `/api/triage/*`, `/api/journal/*`, `/api/recompute/*`, `/api/research/*`

### `/src/db` - Data Layer
- **`schema.ts`** - Complete Drizzle ORM schema with relationships and indexes (authoritative)
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
  - `pairNormalization.ts` - Exchange-specific ticker normalization (HyperLiquid, Coinbase Prime, Kraken, Deribit, Solana)
  - `cursors.ts` - Incremental ingestion cursor helpers using `ingestion_cursors` table
- **`coinbase-prime/`** - Coinbase Prime API integration (HMAC-SHA256 auth, fills, balances)
- **`deribit/`** - Deribit API integration (OAuth client credentials auth, spot fills + balances)
  - `api.ts` - HTTP client with OAuth token caching, types, retry/backoff
  - `fills.ts` - Spot trade normalization
- **`hyperliquid/`** - HyperLiquid API integration
- **`kraken/`** - Kraken API integration (HMAC-SHA512 auth, trades, balances, margin positions)
  - `api.ts` - HTTP client (single POST endpoint, no auth), types, retry/backoff
  - `fills.ts` - Fill normalization + time-based pagination (500/query, 10K limit)
  - `positions.ts` - Perp, spot, and staked HYPE position normalization
- **`solana/`** - Solana blockchain integration (Helius DAS API, balance snapshots only)
  - `api.ts` - Helius RPC client, DAS API types
  - `positions.ts` - Token balance normalization (SOL + SPL tokens)
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

### `/src/lib/intelligence` - Intelligence Routing
- **`scoring.ts`** - Shared signal-matching algorithm (ticker +3, keyword +1, statement word +0.5). Used by ingest-world-monitor.ts and intelligence routing. Includes neutral detection and keyword extraction.
- **`resolver.ts`** - Relevance resolver: tickers → underlyings → asset theses → macro theses → signals → strategies. Returns lifecycle phase per thesis for routing decisions.
- **`evaluate.ts`** - Core evaluation: lifecycle-aware routing of intel items. Monitoring theses → signal evidence, developing theses → claim candidates, all theses → contextual intel.
- **`emitIntelItems.ts`** - Shared utility for writing normalized intel items from ingestion scripts.
- **`parseWorldMonitor.ts`** - World/Thesis Monitor report markdown parser.

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
  - `ConvertClaimToEntityDialog.tsx` - Convert claims to macro theses or asset theses
  - `WorkflowStatusCard.tsx` (130 lines) - Research workflow progress tracking UI
  - `EmptyClaimsState.tsx` (98 lines) - Onboarding guidance for research workflow
  - `archive/` - Deprecated in-app AI workflow components (11 components archived)

### `/scripts` - Standalone Utilities
- **`lib/db.ts`** - Database helper for scripts (handles dotenv + Drizzle ORM correctly)
- **`run-flex-ingestion.ts`** - Flex ingestion runner (used by GitHub Actions)
- **`ingest-underlyings-massive.ts`** - Massive.com daily ingestion
- **`collect-signal-data.ts`** - Quantitative signal data collection (writes `signal_data_snapshots`)
- **`ingest-world-monitor.ts`** - Runs `generateQualitativeSnapshots()`: auto-writes qualitative `signal_data_snapshots` from thesis monitor reports
- **`ingest-economic-calendar.ts`** - TradingView economic calendar ingestion (writes `economic_events`)
- **`ingest-finnhub-analyst-data.ts`** - Finnhub analyst data ingestion: upgrade/downgrade, price targets, insider transactions (writes `analyst_actions`, `analyst_price_targets`, `insider_transactions`). Note: upgrade/downgrade and price target endpoints require Finnhub premium; insider transactions work on free tier.
- **`psql-query.ts`** - Read-only SQL query helper used by skills

### `/.claude/skills` - Claude Code Skills

**Research Ingestion (Bottom-Up Discovery):**
- **`process-transcript`** - Forensic Toulmin claim extraction from research transcripts
- **`process-note`** - Toulmin extraction for general (non-investment) content
- **`synthesize-claims`** - Cross-reference audit claims against existing theses in database
- **`finalize-for-upload`** - Upload finalized research (auto-detects artifact/insight/macro thesis/asset thesis)

**Thesis Synthesis:**
- **`build-core-argument`** - Build core argument for a thesis from linked claims (generates articulation + confirmation/warning signals)

**Signal Assessment (Top-Down Evidence):**
- **`assess-validation-evidence`** - Assess content against active signals to identify confirmation or warning evidence. Resolves signals via `signal_entity_links`, writes `signal_data_snapshots` directly to DB.
- **`configure-signal`** - Interactive 7-step workflow: classify signal → identify data source → test live endpoint → set thresholds → write `explicit_details` JSON to signal record → verify

**Investment Pipeline (Stage-Gated Research Playbook):**
- **`stage-1-init-idea`** - Initialize a pipeline idea from a claim/transcript; creates `_meta.yaml` + `stage-1-triage.md`
- **`stage-2-formalize-thesis`** - Produce a falsifiable thesis with failure modes
- **`stage-3-map-unknowns`** - Identify decision-critical unknowns; primary gate before research effort
- **`stage-4a-prep-desktop-research`** / **`stage-4a-research-unknown`** - Stage 4 research tracks
- **`stage-4b-synthesize-evidence`** - Consolidate findings into belief update with posterior confidence
- **`stage-5-express-thesis`** - Translate conviction to actionable positioning
- **`pipeline-status`** - View all active pipeline ideas (stage, confidence, age, status)
- **`advance-or-kill`** - Gate evaluation: advance, hold, or kill an idea; handles kill log

**Workflow Coordination:**
- **`paperclip-backlog`** - Create and read Paperclip issues. Use to log follow-up work, technical debt, or feature requests.

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
- **`positions`** - Current/closed positions with MTM data. `market_value_usd` is the canonical USD market value field (always populated). Legacy fields `abs_notional` (position currency) and `abs_notional_usd` (IBKR only) are deprecated — prefer `market_value_usd`.

### Derived/Computed Tables
- **`triage_records`** - Triage alerts with severity/urgency/reasons (includes override columns)
- **`journal_entries`** - Chronological audit trail for all events
- **`strategy_metrics_snapshots`** - Historical strategy performance
- **`portfolio_snapshots`** - Account/underlying-level portfolio aggregates (notionals, NAV, cash, leverage)
- **`mtm_snapshots`** - Mark-to-market snapshots
- **`nav_snapshots`** - Net asset value snapshots per account (IBKR EQUT, HyperLiquid marginSummary); includes cash column
- **`cash_balances`** - Per-currency cash/stablecoin/fiat balances per account per date (USD, USDC, USDT, EUR, etc.)

### Supporting Tables
- **`underlyings_iv_history`** - Time-series IV/spot snapshots (unique on ticker + date + source)
- **`options_chain_snapshots`** - Full options chains for IV analysis
- **`strategy_templates`** - Reusable strategy patterns for auto-linking
- **`triage_rules`** - Configurable triage logic
- **`ingestion_runs`** - Process tracking for all data imports
- **`ingestion_cursors`** - Incremental ingestion state per exchange/account (high-water mark timestamps)
- **`economic_events`** - TradingView economic calendar data. Fields: `tv_event_id`, `event_type`, `title`, `indicator`, `category`, `country`, `event_date` (timestamp), `impact_level` (high|medium|low), `actual`, `forecast`, `previous`, `unit`, `source`, `source_url`, `period`. Ingested by `scripts/ingest-economic-calendar.ts`.
- **`analyst_actions`** - Analyst upgrade/downgrade rating changes. Fields: `underlying_id`, `ticker`, `action` (up|down|main|init|reit), `analyst_firm`, `from_grade`, `to_grade`, `action_date`, `source`. Unique on (ticker, analyst_firm, action_date, source). Ingested by `scripts/ingest-finnhub-analyst-data.ts`.
- **`analyst_price_targets`** - Consensus price target snapshots. Fields: `underlying_id`, `ticker`, `target_high`, `target_low`, `target_mean`, `target_median`, `number_analysts`, `snapshot_date`, `source`. Unique on (ticker, snapshot_date, source). Ingested by `scripts/ingest-finnhub-analyst-data.ts`.
- **`insider_transactions`** - Insider buying/selling. Fields: `underlying_id`, `ticker`, `insider_name`, `shares`, `change`, `transaction_date`, `filing_date`, `transaction_code` (P=purchase, S=sale), `transaction_price`, `source`. Unique on (ticker, insider_name, transaction_date, change, source). Ingested by `scripts/ingest-finnhub-analyst-data.ts`.

### Intelligence Routing Tables
- **`intel_items`** - Normalized cross-source intelligence with processing state. Every intelligence-class ingestion script emits to this table. Fields: `source_key` (finnhub_analyst|sec_edgar|economic_calendar|earnings_calendar|insider_transaction|world_monitor|thesis_monitor), `source_table`, `source_record_id`, `occurred_at`, `headline`, `body`, `severity`, `tickers` (text[]), `processing_status` (pending|processed|skipped), `processing_result` (signal_evidence|contextual|claim_candidate|null), `metadata` (jsonb). Unique on (source_table, source_record_id). Evaluated by `scripts/evaluate-intel-items.ts`.

### Research Tables
- **`research_artifacts`** - Raw research content (transcripts, articles, notes) with metadata
- **`research_insights`** - Processed insights with `claims_structure` JSONB field
  - `claims_structure` stores hierarchical Toulmin framework (main_claims + evidence_claims)
  - Each claim has: text, evidence, reasoning, backing, confidence, category, conversion status
- **`research_hierarchy_recommendations`** - Auto-generated suggestions for linking claims to theses
- **`prompts`** - AI prompts for research processing (versioned, activatable)
- **Provenance tracking** - `macro_theses` and `asset_theses` include source claim metadata for traceability

### Thesis Synthesis & Triage
- **`thesis_articulations`** - Versioned synthesised core arguments per thesis. Fields: `thesis_id`, `thesis_type`, `version`, `core_argument`, `key_drivers` (jsonb), `key_assumptions` (jsonb), `confidence_level`, `confidence_rationale`, `evidence_gaps`, `claim_ids_used`, `referenced_theses`. Created by `build-core-argument` skill via `scripts/insert-thesis-articulation.ts`.
- **`thesis_triage_records`** - Thesis-level triage queue (needs articulation, new claims, etc.). Separate from position-level `triage_records`.
- **`thesis_news_items`** - News items archived per thesis for ongoing monitoring.

### Signals & Monitoring Tables
- **`signals`** - Explicit confirmation/invalidation criteria. Fields: `id`, `articulation_id`, `type` (confirmation|invalidation|completion), `statement`, `notes`, `category` (judgment|data_driven), `importance` (critical|significant|supporting), `explicit_details` (jsonb), `status` (draft|active|complete|rejected). Entity linkages live in `signal_entity_links`, not on this table.
- **`signal_entity_links`** - Junction table linking signals to strategies and theses (many-to-many). Replaced direct `strategy_id`/`thesis_id` FK columns on signals.
- **`signal_data_snapshots`** - Time-series assessments per signal. Tracks both quantitative data (`observed_value`, `threshold_value`, `pct_to_threshold`) and qualitative assessments (`assessment`: neutral|strengthening|confirmed|weakening|invalidated, `evidence_summary`). Source tracked via `data_source` and optional `report_id`.
- **`signal_status_history`** - Audit trail of signal status transitions.
- **`signal_data_tracking`** - Last observed data point per signal (used for on_release triggers).
- **`signal_data_source_registry`** - Browsable library of available data sources for signal configuration. Fields: `key` (unique identifier), `name`, `description`, `category` (price|fundamental|economic|sentiment|qualitative|derived|internal), `measure_type` (quantitative|qualitative), `available_metrics` (jsonb), `asset_scope` (per_ticker|global|per_thesis), `supported_tickers` (text[]), `ingestion_method` (automated_cron|automated_derived|manual_skill|manual_cdp), `ingestion_script`, `ingestion_schedule`, `config_template` (jsonb), `config_example` (jsonb), `is_active`. Queried by the `configure-signal` skill to dynamically discover sources instead of hardcoded templates.

### Intelligence & Economic Data
- **`intelligence_reports`** - World Monitor and Thesis Monitor intelligence briefings. Fields: `report_date`, `report_type` (world-monitor|thesis-monitor), `executive_summary`, `key_themes`, `full_markdown`, severity counts. Ingested by `scripts/ingest-world-monitor.ts`.
- **`intelligence_items`** - Individual items extracted from reports. Fields: `report_id`, `severity`, `sector`, `headline`, `body`, `source_urls`, `relevant_tickers`.
- **`fred_series_metadata`** - FRED series reference data (title, frequency, units, source).
- **`fred_observations`** - Historical time-series data from FRED API.
- **`thesis_fred_indicators`** - Links theses to FRED series with threshold configurations for breach detection.
- **`fred_threshold_breaches`** - Audit trail of FRED threshold breach events.

## Key Terminology Distinctions

- **Underlying** (reference data — ticker, spot price, IV) vs **Asset Thesis** (belief about that underlying)
- **Strategy** (tactical execution construct) vs **Thesis** (long-lived belief that evolves with evidence)
- **Signal** (confirmation/warning criterion attached to a thesis or strategy) vs **Triage Record** (actionable item created when a signal or rule triggers)
- **Research Artifact** (raw content: transcript, article) vs **Research Insight** (processed artifact with Toulmin claims structure)
- **Claim** (individual Toulmin assertion from research) vs **Articulation** (synthesised core argument built from multiple linked claims)

## Data Ingestion Architecture

Remote Supabase is the single source of truth. All machines connect directly to remote Supabase; there is no local database mode.

### GitHub Actions Scheduled Jobs

Ingestion runs automatically via GitHub Actions (all times UTC):
- **Flex ingestion**: Hourly from 4 AM to 2 PM UTC (covers US market hours)
- **Massive ingestion**: 9:30 PM UTC (4:30 PM ET, 30 min after market close)
- **HyperLiquid ingestion**: Every 4 hours, 24/7 (crypto markets)
- **Coinbase Prime ingestion**: Every 4 hours (offset 15min from HL), 24/7
- **Kraken ingestion**: Every 4 hours (offset 30min from HL), 24/7
- **Deribit ingestion**: Every 4 hours (offset 45min from HL), 24/7
- **Solana ingestion**: Every 4 hours (offset 50min from HL), 24/7

Workflows:
- `.github/workflows/flex-ingestion.yml` - IBKR Flex API trades/positions
- `.github/workflows/massive-ingestion.yml` - Massive.com IV/spot data
- `.github/workflows/hyperliquid-ingestion.yml` - HyperLiquid fills/positions/staking
- `.github/workflows/coinbase-prime-ingestion.yml` - Coinbase Prime fills/balances
- `.github/workflows/kraken-ingestion.yml` - Kraken trades/balances/margin positions
- `.github/workflows/deribit-ingestion.yml` - Deribit spot fills/balances
- `.github/workflows/solana-ingestion.yml` - Solana wallet balance snapshots
- `.github/workflows/economic-calendar-ingestion.yml` - TradingView economic calendar
- `.github/workflows/earnings-calendar-ingestion.yml` - Earnings calendar
- `.github/workflows/finnhub-analyst-ingestion.yml` - Finnhub analyst data (upgrade/downgrade, price targets, insider transactions)
- `.github/workflows/sec-filings-ingestion.yml` - SEC filings
- `.github/workflows/crypto-prices.yml` - Crypto price snapshots
- `.github/workflows/manual-snapshots.yml` - Manual data snapshots
- `.github/workflows/price-gap-check.yml` - Price data gap detection

Manual trigger available from GitHub UI for testing.

## Environment Variables

Required in `.env.local`:

```bash
# Database - Remote Supabase
DATABASE_URL_POOLER=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:5432/postgres
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

# Deribit
DERIBIT_CLIENT_ID=<client-id>
DERIBIT_CLIENT_SECRET=<client-secret>

# Solana (Helius) — supports multiple wallets with owner labels
HELIUS_API_KEY=<api-key>
SOLANA_WALLETS='[{"address":"<wallet-1>","label":"Owner Name 1"},{"address":"<wallet-2>","label":"Owner Name 2"}]'
```

## Cross-Repo Workflow & Operating Model

### Paperclip Workflow Model

- **Claude Code** (this session) = problem-solving and scoping partner. Use it for investigation, debugging, schema work, skill execution, and scoping new issues.
- **Paperclip agents** = execution engine for discrete engineering tasks. Once a task is scoped clearly enough that an agent could execute it with zero clarifying questions, file it in Paperclip via `/paperclip-backlog` rather than doing it here.
- **Do not** execute multi-step engineering tasks in Claude Code that belong in Paperclip. Scope → file → let agents execute.

### Notes → Trade Journal Interface

Research flows one way: notes repo → trade-journal database. The `process-inbox` skill (notes) handles the full pipeline:

1. **Signal routing** — scores the inbox item against active signals by ticker/keyword overlap; when relevance is high, routes to `/assess-validation-evidence` (trade-journal skill), which resolves signals via `signal_entity_links` and writes `signal_data_snapshots` to DB
2. **Claim extraction** — runs Toulmin extraction and produces an audit file; investment content is uploaded to Supabase via `/finalize-for-upload`, populating `research_artifacts`, `research_insights`, and `main_claims`
3. **Claim linkage** — after upload, generates linkage suggestions mapping new claims to existing theses; `/synthesize-claims` can be run to cross-reference and produce explicit `claim_thesis_mappings`

Trade-journal CLAUDE.md describes this interface. Notes-side pipeline details live in the notes repo CLAUDE.md.

### Signal Monitoring Architecture

Qualitative signal data flows in via two paths:
- **Scheduled**: `scripts/ingest-world-monitor.ts` → `generateQualitativeSnapshots()` — reads thesis monitor reports and writes qualitative `signal_data_snapshots`
- **Research routing**: `assess-validation-evidence` skill — writes snapshots directly when processing inbox content with high signal relevance

Quantitative signal data:
- `scripts/collect-signal-data.ts` — collects from configured data sources per signal's `explicit_details`
- `/configure-signal` skill — interactive setup for wiring a signal to its data source

## Working with the Codebase

### When Adding Features
1. **Check CLAUDE.md first** - This file is the living reference for architecture, schema, and patterns
2. **Check existing patterns** - Look at similar features in `/src/lib/derived/` or `/src/lib/services/`
3. **Use Drizzle ORM** - All database access via Drizzle; prefer pre-built queries in `/src/db/queries/`
4. **Add process tracking** - Log ingestion runs to `ingestion_runs` table
5. **Follow computation pattern** - Compute during ingestion, store results, don't compute on query
6. **Update CLAUDE.md** - Keep schema and directory sections in sync with code changes

### Documentation Maintenance

**CRITICAL:** Documentation must stay in sync with code. Follow this checklist for every significant change.

**After completing any feature or fix:**

| Change Type | Update Required |
|-------------|-----------------|
| New table/column | `CLAUDE.md` (Database Schema section) |
| New API route | `CLAUDE.md` (Key Directories section) |
| New component | `CLAUDE.md` (Key Directories section) |
| State field changes | `CLAUDE.md` (Entity State Machines section) |
| New work item / technical debt | File a Paperclip issue via `/paperclip-backlog` |
| Dead code identified / removed | Note in a journal entry or Paperclip issue |

**Quick sanity check:**
- Does `CLAUDE.md` Key Directories and Database Schema match actual file structure?

**Quarterly cleanup (or when docs feel stale):**
1. Run `grep -r "TODO\|FIXME\|DEPRECATED" src/` to find code debt
2. Review Paperclip backlog for stale items that may no longer be relevant

### When Planning Future Work

All follow-up work, technical debt, and feature requests are tracked in **Paperclip** — use the `/paperclip-backlog` skill to create and read issues.

**Quality bar for a Paperclip issue:** could an agent execute it with zero clarifying questions? If not, scope it further before filing.

**Process:**
1. Identify the work item during a session
2. Run `/paperclip-backlog` to file a Paperclip issue with full context
3. Reference the Paperclip issue ID (e.g. TWO-xxx) in any related code or notes

**Do not** create entries in `docs/FUTURE_ENHANCEMENTS.md` for new work — that file is legacy and no longer maintained.

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

**Key Components**:
- **Parser**: `src/lib/research/parseClaimsMarkdown.ts` - Audit markdown → JSON
- **Markdown Generator**: `src/lib/obsidian/markdown.ts` - Used by skills to write local files
- **UI Components**: `src/components/research/` (UnifiedClaimsBrowser, ConvertClaimToEntityDialog, etc.)
- **Skills**: `.claude/skills/` (process-transcript, synthesize-claims, finalize-for-upload, assess-validation-evidence)
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
7. **Signal-Based Triggers** - Signals system handles strategy trigger evaluation
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
18. **Coinbase Prime Integration** - HMAC-SHA256 auth with base64-decoded secret. Fills (trades) with cursor pagination, balances (positions) with USD fiat_amount. Cost basis not tracked on positions. Spot-only (no perps)
19. **Kraken Integration** - HMAC-SHA512 auth with base64-decoded secret + nonce. TradesHistory (offset pagination, 50/page, rate cost 2), Balance (spot positions with Ticker price enrichment), OpenPositions (margin with cost basis/PnL from API). Cost basis not tracked on spot positions
20. **Deribit Integration** - OAuth client credentials auth (token cached, auto-refreshed on expiry). Spot fills (trade history) with incremental cursor ingestion + account balance snapshots. Options/futures support deferred — shared types pre-wired with OPT asset class and expiry/strike/optionRight fields for future use. Iterates over supported currencies (BTC, ETH, SOL, USDC). Index prices fetched from public endpoint for USD conversion
21. **Solana Integration** - Balance-only snapshot via Helius DAS API (`getAssetsByOwner`). No trade history. API key appended to RPC URL. Captures native SOL + SPL fungible tokens with USD pricing from Helius. Filters dust tokens (< $0.01) and stablecoins. Supports multiple wallets via `SOLANA_WALLETS` JSON env var with per-wallet labels. Each wallet becomes a separate account with its label set
22. **Cash & NAV Tracking** - Cash/stablecoin/fiat balances tracked in `cash_balances` table across all sources. NAV is dual-path: authoritative from `nav_snapshots` for margin accounts (IBKR, HyperLiquid), derived as positions + cash for non-margin accounts (Coinbase, Kraken, Deribit, Solana). Portfolio page shows Market Value, Cash, NAV, Leverage (gross exposure / NAV), and Positions. Cash breakdown available via "Cash" filter tab

## TradingView Chart Drawing Integration

Strategy price signals are created by drawing TP/SL lines on a dedicated TradingView layout, then syncing via CDP.

**Setup:**
1. Open TradingView in Chrome with remote debugging (`--remote-debugging-port=9222`)
2. Draw horizontal ray lines labelled `TP1 [N%]`, `TP2 [N%]`, `TP3 [N%]`, or `SL [N%]` on the Price/BTC layout
3. Run `npx tsx scripts/sync-tv-drawings.ts` to import drawings as signals

**Key files:**
- CDP sync script: `scripts/sync-tv-drawings.ts`
- Price collector: `scripts/collect-signal-data.ts`
- Signal display: `src/components/signals/StrategySignalsSection.tsx`
- Junction table: `signal_entity_links` (one signal links to multiple strategies)

## Quick Navigation for Specific Features

- **Research Workflow** → `/src/lib/research/` + `/.claude/skills/`
- **Claims Browsing** → `/src/components/research/UnifiedClaimsBrowser.tsx` + `/src/app/research/[id]/page.tsx`
- **Claim Conversion** → `/src/components/research/ConvertClaimToEntityDialog.tsx` + `/src/app/api/research/convert-claim/`
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
- **Database Schema** → `/src/db/schema.ts` (authoritative)
- **Styles** → `/src/app/globals.css` (Tailwind with custom animations)

## Future Development Context

Backlog tracked in Paperclip. Use `/paperclip-backlog` to pull current issues.

When implementing new features, use CLAUDE.md as the primary reference.
