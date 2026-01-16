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
| Massive.com | IV, Spot prices | Daily (4:30 PM ET) | REST API |
| Yahoo Finance | Spot prices | On-demand | Fallback source |
| IBKR Gateway | IV, Historical | On-demand | Client Portal API |

**Key Tables:**
- `ingestion_runs` - Process tracking for all imports
- `flex_query_configs` - Flex query configuration
- `trades` - Individual trade executions
- `positions` - Current/closed positions with MTM
- `underlyings` - Ticker metadata (spot, IV30, conid)
- `underlyings_iv_history` - Time-series IV/spot snapshots
- `options_chain_snapshots` - Full options chains

**Key Files:**
- `src/lib/ingestion/flex/` - Flex API integration
- `src/lib/services/processTracking.ts` - Process tracking service
- `scripts/run-flex-ingestion.ts` - GitHub Actions runner
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

**Strategy Status (implicit):**
- Status is derived from positions data, not stored explicitly
- Exception: `merged` status for consolidated strategies

**Key Files:**
- `src/lib/services/strategies.ts` (960 lines) - Core strategy service
- `src/lib/services/strategyLinking.ts` - Trade-to-strategy matching
- `src/lib/derived/strategyMetrics.ts` - Metrics computation
- `src/lib/derived/strategyAuto.ts` - Auto-derivation logic

**Deprecated:**
- `stateCode` system (`src/lib/derived/stateCode.ts`, 696 lines) - Replaced by signals

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

**Key Files:**
- `src/lib/derived/triage.ts` (1259 lines) - Position triage computation
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

### 6. Journal/Blotter Domain

**Purpose:** Chronological log of decisions and events

**Key Tables:**
- `journal_entries` - Narrative entries with provenance
- `blotter_actions` - Structured trade/event aggregations

**Blotter Categories:**
- `trade_ingestion` - Trade execution events
- `triage_action` - Triage-driven actions
- `signal_triggered` - Signal events
- `thesis_event` - Thesis lifecycle events
- `manual` - User-created entries

**Bidirectional Linking:**
- `triage_action` entries link to `trade_ingestion` via `linkedBlotterActionId`
- `trade_ingestion` entries track linked triage via `linkedTradeBlotterIds`

**Key Files:**
- `src/lib/derived/blotter.ts` (1805 lines) - Trade aggregation & blotter generation
- `src/lib/workflow/lifecycleDetection.ts` (521 lines) - Lifecycle detection & `logToJournal()`

---

## State Machines

### Entity Status Values

| Entity | Field | Values | Notes |
|--------|-------|--------|-------|
| ResearchArtifact | `status` | draft, processed, archived | Linear progression |
| ResearchInsight | `status` | draft, published, archived | Linear progression |
| MainClaim | `status` | unconfirmed, confirmed, rejected, invalidated, merged | Terminal states |
| IngestionRun | `status` | pending, running, completed, failed | Terminal states |
| Strategy | `status` | draft, open, closed, merged | Mostly implicit |
| Position | `isOpen` | true, false | Boolean toggle |
| TriageRecord | `severity` | info, monitor, attention, urgent, pending, complete | ⚠️ Overloaded - see [#ENH-047](FUTURE_ENHANCEMENTS.md#enh-047-triage-severitystatus-separation) |
| Signal | `status` | recommended, not_triggered, triggered, superseded | Event-driven |
| ThesisTriageRecord | `status` | pending, in_review, actioned, dismissed | Workflow states |
| MacroThesis | `status` | active, under_review, retired, superseded | Lifecycle validity |
| MacroThesis | `workflowStatus` | developing, monitoring, paused, validated, invalidated, abandoned | ⚠️ Schema only, unused in code |
| MacroThesis | `lifecycleStatus` | created (+ code values) | ⚠️ Deprecated but used - see [#ENH-048](FUTURE_ENHANCEMENTS.md#enh-048-thesis-status-field-consolidation) |
| AssetThesis | `status` | active (default) | Lifecycle validity |
| AssetThesis | `workflowStatus` | developing, monitoring, paused, validated, invalidated, abandoned | ⚠️ Schema only, unused in code |
| AssetThesis | `lifecycleStatus` | created (+ code values) | ⚠️ Deprecated but used - see [#ENH-048](FUTURE_ENHANCEMENTS.md#enh-048-thesis-status-field-consolidation) |
| JournalEntry | `status` | active, resolved, dismissed, superseded | Terminal states |
| BlotterAction | `category` | trade_ingestion, triage_action, signal_triggered, thesis_event, manual | Static type |

### State Transition Diagrams

**MainClaim:**
```
unconfirmed ──┬──► confirmed
              ├──► rejected
              ├──► invalidated
              └──► merged
```

**Signal:**
```
recommended ──► not_triggered ──┬──► triggered
                               └──► superseded
```

**MacroThesis/AssetThesis (dual status):**
```
status:         draft ──► active ──┬──► inactive
                                   └──► invalidated

workflowStatus: needs_articulation ──► active ──► needs_review ──► archived
```

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
│  ┌─────────────────┐              ┌─────────────────┐            │
│  │ journal_entries │◄────────────►│ blotter_actions │            │
│  │ (narrative)     │   linked     │ (structured)    │            │
│  └─────────────────┘              └─────────────────┘            │
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
| `stateCode` system | `src/lib/derived/stateCode.ts` (696 lines) | Replaced by signals | Archive/Remove |
| `strategyMetricsSnapshots.stateCode` | `src/db/schema.ts` | Deprecated column | Remove |
| `realizedPnlToDate` | `src/lib/derived/strategyMetrics.ts` | Never computed | Remove or implement |

### Triage Domain

| Item | Location | Reason | Action |
|------|----------|--------|--------|
| `validationPoints` alias | Schema comments | Being phased out → signals | Update docs |

### Blotter Domain

| Item | Location | Reason | Action |
|------|----------|--------|--------|
| `legScope` | `src/db/schema.ts` | Never populated | Remove |
| `riskNotesAtAction` | `src/db/schema.ts` | Never populated | Remove |
| `tradeDescription` | `src/db/schema.ts` | Rarely used | Evaluate |
| `linkedSignalId` | `src/db/schema.ts` | Never used | Remove |

---

## Terminology Inconsistencies

| Current Usage | PRD Term | Files Affected | Action |
|---------------|----------|----------------|--------|
| "Asset View" | "Asset Thesis" | UI components, some API routes | ✅ Standardized (2026-01-16) |
| "Blotter" | "Journal" or "Decision Log" | Entire blotter domain | Gradual rename (deferred) |
| `lifecycleStatus` | `workflowStatus` | Old code references | Already migrated, remove old refs |
| `validationPoints` | `signals` | Schema comments, docs | ✅ Renamed to `signals` (2026-01-16) |
| "conviction" | "confidenceLevel" | Some thesis code | Standardize |

---

## Documentation Gaps

1. ✅ **State machines** - Now documented in CLAUDE.md (2026-01-16)
2. ✅ **Cross-domain relationships** - Now visualized in CLAUDE.md (2026-01-16)
3. **Signal evaluation rules** - Scattered across code, needs centralized documentation
4. **Thesis triage rules** (needs articulation, new claims) - Needs detailed documentation
5. **Auto-promotion flow** from claims_structure JSONB to main_claims table - Needs documentation
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
- Quick wins (realizedPnlToDate, terminology)
- StateCode archival (696 lines)
- Documentation (signals, triage rules)
- #ENH-047 (triage severity/status separation)
- Blotter-to-Journal migration (deferred)
