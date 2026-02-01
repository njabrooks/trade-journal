# Current State of the Codebase

**Generated:** 2026-01-16
**Purpose:** Comprehensive documentation of the actual implemented state of the trade-journal application.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Domain Breakdown](#domain-breakdown)
3. [State Machines](#state-machines)
4. [Cross-Domain Relationships](#cross-domain-relationships)
5. [Dead Code Registry](#dead-code-registry)
6. [Terminology Inconsistencies](#terminology-inconsistencies)
7. [Documentation Gaps](#documentation-gaps)

---

## Architecture Overview

The application implements a **four-level decision hierarchy**:

```
Macro Theses (cross-asset beliefs)
    ↓
Asset Theses (ticker-specific beliefs)
    ↓
Strategies (tactical implementations)
    ↓
Positions (live exposures)
```

Data flows into this hierarchy from two primary sources:

1. **Trading Data** - IBKR Flex, Massive.com, Yahoo Finance, IBKR Gateway
2. **Research Data** - Local Markdown processing via Claude Code skills

---

## Domain Breakdown

### 1. Ingestion Domain

**Purpose:** ETL pipelines for external trading data

**External Sources:**
| Source | Data Type | Frequency | Method |
|--------|-----------|-----------|--------|
| IBKR Flex API | Trades, Positions | Hourly (GitHub Actions) | XML/CSV via Flex Web Service |
| HyperLiquid | Fills, Perps, Spot, Staking | Every 4h (GitHub Actions) | POST to `/info` endpoint |
| Coinbase Prime | Fills, Balances | Every 4h (GitHub Actions) | HMAC-SHA256 authenticated REST |
| Massive.com | IV, Spot prices | Daily (4:30 PM ET) | REST API |
| Yahoo Finance | Spot prices | On-demand | Fallback source |
| IBKR Gateway | IV, Historical | On-demand | Client Portal API |

**Key Tables:**
- `ingestion_runs` - Process tracking for all imports
- `ingestion_cursors` - Incremental ingestion state per exchange/account
- `flex_query_configs` - Flex query configuration
- `trades` - Individual trade executions (IBKR + HyperLiquid + Coinbase Prime)
- `positions` - Current/closed positions with MTM (STK, OPT, CRYPTO, PERP)
- `underlyings` - Ticker metadata (spot, IV30, conid)
- `underlyings_iv_history` - Time-series IV/spot snapshots
- `options_chain_snapshots` - Full options chains

**Key Files:**
- `src/lib/ingestion/flex/` - IBKR Flex API integration
- `src/lib/ingestion/crypto/` - Shared crypto exchange modules (types, pair normalization, cursors)
- `src/lib/ingestion/hyperliquid/` - HyperLiquid API client, fill/position normalization
- `src/lib/ingestion/coinbase-prime/` - Coinbase Prime API client (HMAC auth), fill/balance normalization
- `src/lib/services/processTracking.ts` - Process tracking service
- `scripts/run-flex-ingestion.ts` - IBKR GitHub Actions runner
- `scripts/ingest-hyperliquid.ts` - HyperLiquid GitHub Actions runner
- `scripts/ingest-coinbase-prime.ts` - Coinbase Prime GitHub Actions runner
- `scripts/ingest-underlyings-massive.ts` - Daily IV/spot ingestion

---

### 2. Research Domain

**Purpose:** Local-first Toulmin framework claim extraction from research artifacts

**Workflow:**
```
Transcript/Article → /process-transcript → Local Markdown Audit
                                                    ↓
                                          /finalize-for-upload
                                                    ↓
                                          research_artifacts (raw)
                                          research_insights (with claims_structure)
                                                    ↓
                                          auto-promote to main_claims
                                                    ↓
                                          convert-claim API
                                                    ↓
                                          macro_theses / asset_theses
```

**Key Tables:**
- `research_artifacts` - Raw research content (transcripts, articles, notes)
- `research_insights` - Processed insights with `claims_structure` JSONB
- `main_claims` - First-class claim records (auto-promoted from JSONB)
- `claim_thesis_mappings` - Many-to-many linking claims ↔ theses

**Claims Structure (JSONB):**
```typescript
interface ClaimsStructure {
  main_claims: MainClaim[];
  metadata: {
    source_type: string;
    extraction_date: string;
    total_claims: number;
  };
}

interface MainClaim {
  id: string;
  claim: string;
  evidence: string[];
  reasoning: string;
  backing: string;
  qualifier: string;
  rebuttal?: string;
  type: 'thesis_candidate' | 'view_candidate' | 'evidence';
  time_horizon?: string;
  relevant_tickers?: string[];
  converted_to?: { type: string; id: string; converted_at: string };
  evidence_claims?: EvidenceClaim[];
}
```

**Key Files:**
- `src/lib/research/parseClaimsMarkdown.ts` - Markdown → JSON parser
- `src/db/queries/research.ts` - Query functions including `autoPromoteAuditClaims()`
- `src/app/api/research/convert-claim/route.ts` - Claim → thesis conversion
- `.claude/skills/process-transcript/` - Claim extraction skill
- `.claude/skills/finalize-for-upload/` - Upload workflow skill

**Active Skills:**
- `process-transcript` - Extract Toulmin claims from transcripts
- `synthesize-claims` - Cross-reference claims against existing theses
- `deep-dive` - Guided analysis on themes/tickers
- `finalize-for-upload` - Upload to Supabase
- `assess-signal-evidence` - Assess content against existing signals

---

### 3. Strategies Domain

**Purpose:** Tactical trading implementations

**Key Tables:**
- `strategies` - User-defined strategies with entry context
- `strategy_templates` - Reusable patterns for auto-linking
- `strategy_metrics_snapshots` - Historical performance data

**Strategy Status:**
- Explicit `status` field with standardized lifecycle values: `draft`, `active`, `complete`, `rejected`
- Status is auto-computed based on positions during ingestion/recompute
- Merged strategies get `complete` status (absorbed into target)

**Key Files:**
- `src/lib/services/strategies.ts` (960 lines) - Core strategy service
- `src/lib/services/strategyLinking.ts` - Trade-to-strategy matching
- `src/lib/derived/strategyMetrics.ts` - Metrics computation
- `src/lib/derived/strategyAuto.ts` - Auto-derivation logic

**Removed (2026-01-16):**
- `stateCode` system - Replaced by signals, code archived and deleted
- `playbook_items` table - Dropped, was only used for stateCode configuration

---

### 4. Positions/Trades Domain

**Purpose:** Individual trade executions and live exposures

**Key Tables:**
- `trades` - Immutable trade execution records
- `positions` - Current/closed positions with MTM data

**Position State:**
- `isOpen: boolean` - true = open position, false = closed
- No explicit status field on trades (immutable records)
- Quantity-based lifecycle (quantity = 0 → closed)

**Key Files:**
- `src/lib/ingestion/flex/trades.ts` - Trade normalization
- `src/lib/ingestion/flex/positions.ts` - Position processing
- `src/lib/derived/portfolio.ts` - Portfolio aggregations

---

### 5. Triage/Signals Domain

**Purpose:** Evaluation of urgency/severity and trigger rules

**Key Tables:**
- `triage_records` - Position-level alerts with severity/urgency/reasons
- `signals` - Trigger rules attached to strategies
- `thesis_triage_records` - Thesis-level triage (needs articulation, new claims)

**Triage Rule Sets:**
| Rule Set | Source | Trigger |
|----------|--------|---------|
| `trade_ingestion_v1` | `processCsv.ts` | Trades ingested via Flex CSV |
| `quantity_change_v1` | `triage.ts` | Position quantity changed (non-trade) |
| `options_v1` | `triage.ts` | Position-level (DTE, ITM, SIGMA, SIZE) |
| `strategy_v1` | `triage.ts` | Strategy-level (CONFIRM_STRATEGY, LINK_TO_THESIS, SIZE, COMPLEXITY) |
| `thesis_*` | `thesisTriage.ts` | Thesis-level (NEEDS_RESEARCH, PRODUCE_CORE_ARGUMENT, etc.) |

**Key Workflow Triggers:**
- `CONFIRM_STRATEGY` (urgent) - Auto-derived strategy needs confirmation (label, type, direction; assetThesisId optional)
- `LINK_STRATEGY_TO_THESIS` (info) - Confirmed strategy missing asset thesis link (soft reminder)

**Account-Agnostic Triage:**
- Triage queue displays records from all accounts by default
- Query functions: `getTriageQueueAllAccounts()`, `getUnifiedTriageQueue()` (accountId optional)

**Key Files:**
- `src/lib/ingestion/flex/processCsv.ts` - Trade ingestion triage creation
- `src/lib/derived/triage.ts` (1259 lines) - Position/strategy triage computation
- `src/lib/derived/signalEvaluation.ts` (365 lines) - Auto signal evaluation
- `src/lib/derived/thesisTriage.ts` (550 lines) - Thesis triage rules
- `supabase/functions/tv-webhook/` - TradingView webhook handler

**Signal Evaluation Flow:**
```
Signal Config (price_above, price_below, etc.)
           ↓
signalEvaluation.ts (cron or on-demand)
           ↓
Signal status: recommended → not_triggered → triggered
           ↓
Triage record created with recommendedAction
           ↓
Journal entry logged
```

---

### 6. Journal Domain

**Purpose:** Chronological log of decisions and events

**Key Tables:**
- `journal_entries` - Narrative entries with provenance

**Note:** The `blotter_actions` table was deprecated and removed (2026-01-16). Functionality migrated to:
- Journal entries capture all events via `logToJournal()`
- Triage severity overrides stored directly on `triage_records` via override columns

**Override System (triage_records):**
```typescript
// Override fields on triage_records table
overrideSource: 'user_dismiss' | 'user_monitor' | null
overrideExpiresDate: Date | null  // Position expiration or 30 days
overrideAt: Date | null           // When override was applied
```

**Journal Action Types:**
| Type | Description |
|------|-------------|
| `trade_ingested` | Trades ingested for strategy (Flex CSV ingestion) |
| `triage_trade_action` | User captured trade metadata (stage, reason, notes) |
| `triage_detected` | System detected new trigger |
| `triage_dismissed` | User dismissed triage |
| `triage_monitored` | User set to monitor |
| `signal_triggered` | Strategy signal triggered |
| `claim_converted` | Claim converted to thesis |
| `claim_linked` | Claim linked to existing thesis |

**Key Files:**
- `src/lib/workflow/lifecycleDetection.ts` (521 lines) - Lifecycle detection & `logToJournal()`
- `src/app/api/triage/action/route.ts` - Triage action handling with override persistence

---

## State Machines

### Universal Status Model

All entities now use standardized lifecycle status values (as of #ENH-048):

```
draft ──► active ──┬──► complete
                   └──► rejected
```

- **draft**: Planning/developing stage
- **active**: Currently active/open
- **complete**: Finished/closed successfully
- **rejected**: Abandoned/invalidated/merged

### Entity Status Values

| Entity | Field | Values | Notes |
|--------|-------|--------|-------|
| ResearchArtifact | `status` | draft, active, complete, rejected | ✅ [#ENH-048] |
| ResearchInsight | `status` | draft, active, complete, rejected | ✅ [#ENH-048] |
| MainClaim | `status` | draft, active, complete, rejected | ✅ [#ENH-048] |
| IngestionRun | `status` | pending, running, completed, failed | Terminal states |
| Strategy | `status` | draft, active, complete, rejected | ✅ [#ENH-048] Explicit status field |
| Position | `isOpen` | true, false | Boolean toggle (quantity-based) |
| TriageRecord | `status` | inbox, in_progress, done | Workflow state ✅ [#ENH-047] |
| TriageRecord | `severity` | urgent, attention, monitor, info | Importance level ✅ [#ENH-047] |
| Signal | `status` | draft, active, complete, rejected | ✅ [#ENH-048] |
| ThesisTriageRecord | `status` | inbox, in_progress, done | Workflow state ✅ [#ENH-047] |
| ThesisTriageRecord | `severity` | urgent, attention, monitor, info | Importance level ✅ [#ENH-047] |
| MacroThesis | `status` | draft, active, complete, rejected | ✅ [#ENH-048] Single status field |
| AssetThesis | `status` | draft, active, complete, rejected | ✅ [#ENH-048] Single status field |
| JournalEntry | `status` | active, resolved, dismissed, superseded | Terminal states |

### State Transition Diagrams

**Universal Lifecycle (Claims, Signals, Theses, Strategies):**
```
draft ──► active ──┬──► complete
                   └──► rejected
```

**Strategy Status Derivation:**
- `draft` → Never had positions
- `active` → Has open positions (quantity != 0)
- `complete` → All positions closed (also used for merged strategies)
- `rejected` → Abandoned by user

---

## Cross-Domain Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

INGESTION (Entry Points)                    RESEARCH (Entry Points)
┌──────────────────────┐                    ┌──────────────────────┐
│ IBKR Flex API        │                    │ Transcripts/Articles │
│ Massive.com          │                    │ (Local Markdown)     │
│ Yahoo Finance        │                    │                      │
│ IBKR Gateway         │                    │                      │
└──────────┬───────────┘                    └──────────┬───────────┘
           │                                           │
           ▼                                           ▼
┌──────────────────────┐                    ┌──────────────────────┐
│ ingestion_runs       │                    │ research_artifacts   │
│ (process tracking)   │                    │ research_insights    │
└──────────┬───────────┘                    │ (claims_structure)   │
           │                                └──────────┬───────────┘
           ▼                                           │
┌──────────────────────┐                              │ auto-promote
│ trades               │                              ▼
│ positions            │                    ┌──────────────────────┐
│ underlyings          │                    │ main_claims          │
│ underlyings_iv_hist  │                    └──────────┬───────────┘
└──────────┬───────────┘                              │
           │                                          │ convert-claim
           │                                          ▼
           │                                ┌──────────────────────┐
           │                                │ claim_thesis_mappings│
           │                                └──────────┬───────────┘
           │                                           │
           ▼                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BELIEF LAYER                                   │
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ macro_theses    │◄────────────►│ asset_theses    │            │
│  │ (cross-asset)   │   linkage    │ (ticker-specific)│            │
│  └────────┬────────┘              └────────┬────────┘            │
│           │                                │                      │
│           └────────────┬───────────────────┘                      │
│                        ▼                                          │
│           ┌─────────────────────┐                                 │
│           │ thesis_triage_recs  │ (needs articulation, new claims)│
│           └─────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────┘
                         │
                         │ evidence linkage
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    EXECUTION LAYER                                │
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ strategies      │◄────────────►│ positions       │            │
│  │ (tactical)      │   contains   │ (live exposure) │            │
│  └────────┬────────┘              └────────┬────────┘            │
│           │                                │                      │
│           ▼                                ▼                      │
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ signals         │              │ triage_records  │            │
│  │ (trigger rules) │              │ (alerts)        │            │
│  └─────────────────┘              └─────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
                         │
                         │ all events flow to
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    JOURNAL LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ journal_entries                                              │ │
│  │ (narrative audit trail for all events)                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Note: blotter_actions removed (2026-01-16)                      │
│  Overrides now stored on triage_records (overrideSource)         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Dead Code Registry

### Research Domain

| Item | Location | Reason | Action |
|------|----------|--------|--------|
| `getAllClaimsWithSources()` | `src/db/queries/research.ts` | Superseded by `getAllMainClaimsWithSources()` | ✅ Removed (2026-01-16) |
| `getPreInvestmentResearch()` | `src/db/queries/research.ts` | Never called | ✅ Removed (2026-01-16) |
| `category` on insights | `src/db/schema.ts` | Only 'insight' value used | Evaluate |
| `confidenceLevel` on insights | `src/db/schema.ts` | Moved to claim level | Evaluate |
| `keyTakeaways` on insights | `src/db/schema.ts` | Superseded by claims structure | Evaluate |
| `researchMappings` table | `src/db/schema.ts` | Replaced by claim_thesis_mappings | ✅ Dropped (2026-01-16) |

**Note:** `research_mappings` table was deprecated and dropped (2026-01-16). Claim-to-thesis linking via `claim_thesis_mappings` provides more granular provenance tracking.

### Strategies Domain

| Item | Location | Reason | Action |
|------|----------|--------|--------|
| `stateCode` system | `src/lib/derived/stateCode.ts` (696 lines) | Replaced by signals | ✅ Removed (2026-01-16) |
| `strategyStateCode` service | `src/lib/services/strategyStateCode.ts` | Replaced by signals | ✅ Removed (2026-01-16) |
| `strategyMetricsSnapshots.stateCode` | `src/db/schema.ts` | Deprecated column | ✅ Dropped (2026-01-16) |
| `strategyMetricsSnapshots.realizedPnlToDate` | `src/db/schema.ts` | Never computed | ✅ Dropped (2026-01-16) |
| `playbook_items` table | `src/db/schema.ts` | Only used for stateCode config | ✅ Dropped (2026-01-16) |
| `blotter_actions.stateCodeAtAction` | `src/db/schema.ts` | StateCode removed | ✅ Dropped (2026-01-16) |
| Playbook admin UI | `src/app/admin/playbook/` | Only used for stateCode config | ✅ Removed (2026-01-16) |
| Playbook API routes | `src/app/api/playbook/` | Only used for stateCode config | ✅ Removed (2026-01-16) |

### Triage Domain

| Item | Location | Reason | Action |
|------|----------|--------|--------|
| `validationPoints` alias | Schema comments | Being phased out → signals | Update docs |

### Blotter Domain

| Item | Location | Reason | Action |
|------|----------|--------|--------|
| `blotter_actions` table | `src/db/schema.ts` | Replaced by journal + triage overrides | ✅ Removed (2026-01-16) |
| `blotter.ts` | `src/lib/derived/` | 1805 lines of blotter generation | ✅ Removed (2026-01-16) |
| `legScope` | `src/db/schema.ts` | Never populated | ✅ Removed with table (2026-01-16) |
| `riskNotesAtAction` | `src/db/schema.ts` | Never populated | ✅ Removed with table (2026-01-16) |
| `tradeDescription` | `src/db/schema.ts` | Rarely used | ✅ Removed with table (2026-01-16) |
| `linkedSignalId` | `src/db/schema.ts` | Never used | ✅ Removed with table (2026-01-16) |

**Migration Summary (2026-01-16):**
- Override tracking moved to `triage_records.overrideSource`, `overrideExpiresDate`, `overrideAt`
- Event audit trail via `journal_entries` using `logToJournal()`
- Backup retained as `blotter_actions_backup` for verification period

---

## Terminology Inconsistencies

| Current Usage | PRD Term | Files Affected | Action |
|---------------|----------|----------------|--------|
| "Asset View" | "Asset Thesis" | UI components, some API routes | ✅ Standardized (2026-01-16) |
| "Blotter" | "Journal" | N/A | ✅ Blotter system removed (2026-01-16) |
| `lifecycleStatus` | `workflowStatus` | Old code references | Already migrated, remove old refs |
| `validationPoints` | `signals` | Schema comments, docs | ✅ Renamed to `signals` (2026-01-16) |
| "conviction" | "confidenceLevel" | Some thesis code | Standardize |

---

## Documentation Gaps

1. ✅ **State machines** - Now documented in CLAUDE.md (2026-01-16)
2. ✅ **Cross-domain relationships** - Now visualized in CLAUDE.md (2026-01-16)
3. ✅ **Signal evaluation rules** - Centralized in `docs/features/signal-triage-rules.md` (2026-01-16)
4. ✅ **Thesis triage rules** - Centralized in `docs/features/signal-triage-rules.md` (2026-01-16)
5. ✅ **Auto-promotion flow** - Documented in `docs/features/signal-triage-rules.md` (Claims Auto-Promotion section)
6. ✅ **Dual status pattern** - Now explained in CLAUDE.md Important Implementation Notes (2026-01-16)

---

## Next Steps

### Completed (2026-01-16)
1. ✅ **Dead Code Cleanup** - Removed dead functions from research.ts
2. ✅ **Terminology Standardization** - Aligned `asset_view` → `asset_thesis` across codebase
3. ✅ **Schema Cleanup** - Dropped `research_mappings` table, renamed `validation_points` → `signals`
4. ✅ **CLAUDE.md Refresh** - Updated with state machines, cross-domain flows, and future enhancements process

### Remaining

See **[CLEANUP_PLAN.md - Unified Remaining Work](CLEANUP_PLAN.md#unified-remaining-work)** for the consolidated backlog.

Key items:
- ~~Quick wins (realizedPnlToDate, terminology)~~ ✅ Complete
- ~~StateCode archival (696 lines)~~ ✅ Complete (2026-01-16)
- ~~Playbook removal~~ ✅ Complete (2026-01-16)
- ~~#ENH-047 (triage severity/status separation)~~ ✅ Complete (2026-01-16)
- ~~#ENH-048 (entity status standardization)~~ ✅ Complete (2026-01-16)
- ~~Blotter-to-Journal migration~~ ✅ Complete (2026-01-16)
- ~~Documentation (signals, triage rules)~~ ✅ Complete - `docs/features/signal-triage-rules.md` (2026-01-16)
- ~~#ENH-035 (thesis articulation generation)~~ ✅ Complete (2026-01-16)
- ~~#ENH-036 (signal extraction from articulation)~~ ✅ Complete (2026-01-16)
- ~~#ENH-037 (manual status tracking & audit trail)~~ ✅ Complete (2026-01-16)
- ~~#ENH-042F (IV30 & Price data integration)~~ ✅ Complete (2026-01-16)
