# PRD → Codebase Comparison Checklist

**Purpose**  
This checklist is used to systematically compare the existing codebase against the locked Product Requirements Document (PRD v1.1).  
Its goal is to identify alignment, gaps, implicit assumptions, and opportunities for phased evolution without restarting the system.

For each item, explicitly mark one of:
- ✅ Exists
- 🟡 Partial
- ❌ Missing
- ⚠️ Implicit / Undocumented

---

## A. Conceptual Coverage (Decision Hierarchy)

### Hierarchy Abstractions
- ❌ Macro thesis abstraction exists
- ❌ Asset-level thesis abstraction exists
- ✅ Strategy abstraction exists (explicit, not implied)
- ✅ Position abstraction exists
- 🟡 Clear parent–child relationships between hierarchy levels (positions → strategies → underlyings, but no macro/asset level)
- 🟡 Hierarchy is represented explicitly in the data model (partial: strategies/positions exist, but macro/asset thesiss missing)
- 🟡 Hierarchy is reflected in application logic (strategies and positions are linked, but no higher-level hierarchy)
- 🟡 Hierarchy is visible or navigable in the UI (strategies and positions are navigable, but no macro/asset level navigation)

---

## B. Data Model Alignment

### Core Execution Objects
- ✅ Accounts modeled explicitly (`accounts` table)
- ✅ Trades modeled explicitly (`trades` table)
- ✅ Positions modeled explicitly (`positions` table)
- ✅ Separation between trades and positions (distinct tables with different purposes)
- ✅ Support for multi-asset instruments (positions support options, stocks via `asset_class`)

### Historical & State Reconstruction
- ✅ Daily position snapshots (`mtm_snapshots`, `positions.snapshot_date`)
- ✅ Ability to reconstruct portfolio state at arbitrary past dates (via `mtm_snapshots`, `nav_snapshots`, `portfolio_snapshots`, `strategy_metrics_snapshots`)
- ✅ Time-series persistence for key metrics (`underlyings_iv_history`, `options_chain_snapshots`, various snapshot tables)

### Belief & Knowledge Objects (Required by PRD)
- ❌ Macro thesis entity
- ❌ Asset view entity
- ✅ Strategy entity (`strategies` table with `thesis` field, but tactical not hierarchical)
- ❌ Research artifact entity
- ❌ Structured research insight entity
- ⚠️ Workflow trigger entity (implicit in `triage_records` and `ingestion_runs.trigger`, not first-class)
- ✅ Triage entity (`triage_records` table)
- ⚠️ Decision entity (implicit in `blotter_actions`, not explicitly modeled as decisions)
- ⚠️ Journal / log entity (`blotter_actions` serves as journal, but not explicitly named/structured as such)

---

## C. Workflow & Decision Loop

### Triggering
- 🟡 Time-based triggers exist (scheduled ingestion via cron, but not explicit time-based review triggers)
- 🟡 Event-based triggers exist (implicit: triage detects DTE, sigma, assignment flags; state code changes)
- ✅ Rule-based triggers exist (DTE flags, sigma flags, assignment risk, size thresholds, PnL thresholds - see `docs/actions.md`)
- ⚠️ Triggers are first-class records (triggers are computed and stored in `triage_records`, but trigger definitions are in code/constants)
- 🟡 Triggers can originate at multiple hierarchy levels (position and strategy level via `triage_records.context_level`, but no underlying/account level triggers yet)

### Triage
- ✅ Triage is explicitly modeled (`triage_records` table)
- ✅ Triage separates evaluation from action (`triage_records` for evaluation, `blotter_actions` for actions)
- ✅ Urgency / severity is captured (`triage_records.severity`: 'info' | 'monitor' | 'attention' | 'urgent' | 'pending' | 'complete')
- ✅ Multiple possible outcomes supported (TRADE, MONITOR, DISMISS, UPDATE actions via `blotter_actions`)

### Decision Capture
- ⚠️ Decisions are explicit records (`blotter_actions` captures actions, but not explicitly as "decisions" with rationale)
- 🟡 Decisions include rationale (`blotter_actions.notes`, `blotter_actions.trade_reason` exist but not required/structured)
- ❌ Confidence or conviction captured
- ✅ "Do nothing" is capturable as a decision (DISMISS action)
- ✅ Decisions are linked to triggering events (`blotter_actions` links to `strategy_id`, `position_id`, `triage_records` via snapshot date)

---

## D. Research & Knowledge Layer

### Research Ingestion
- ❌ Notes can be ingested
- ❌ Articles can be ingested
- ❌ Transcripts (interviews, podcasts, videos) supported
- ❌ External research sources supported

### Research Structure
- ❌ Raw research stored separately from structured insights
- ❌ Claims extracted
- ❌ Evidence extracted
- ❌ Counterpoints extracted
- ❌ Time horizon captured
- ❌ Confidence level captured

### Contextual Mapping
- ❌ Research can be linked to macro theses
- ❌ Research can be linked to asset thesiss
- 🟡 Research can be linked to strategies (strategies have `thesis` field, but no research linking)
- ❌ Research can be linked to positions
- ❌ Support / refute / neutral classification exists

### Pre-Investment Research
- ❌ Research can exist without active positions
- ❌ Pre-investment or exploratory research state exists
- ❌ Research can later be promoted into active theses

---

## E. AI Capability Mapping

For each AI feature currently implemented:
- What is the input?
- What is the output?
- Which PRD capability does it serve?

**Current State**: No AI capabilities are currently implemented in the codebase. All decision support, triage, and analysis is rule-based and deterministic.

### Required AI Capabilities (PRD v1.1)
- ❌ Research summarisation
- ❌ Claim extraction
- ❌ Evidence vs counter-evidence classification
- ❌ Hierarchical classification (macro → position)
- ❌ Belief evaluation (support vs refute)
- ❌ Triage prioritisation assistance
- ❌ Decision support (contextual synthesis)
- ❌ Retrospective pattern detection
- ❌ Bias detection
- ❌ Adversarial / stress-testing (optional, future)

---

## F. UI Surface Coverage

For each surface, note whether it exists, is partial, or is missing.

### Required Surfaces
- 🟡 Global attention / priority dashboard (`/dashboard/portfolio` exists, `/triage` serves as priority queue, but not unified "attention dashboard")
- 🟡 Hierarchy navigator (macro → position) (strategies and positions are navigable via `/strategies`, but no macro/asset level)
- 🟡 Decision workspace (`/triage` page with action buttons, but not full decision support workspace with analytics)
- ❌ Research & knowledge studio
- 🟡 Journal / retrospective analysis view (`/blotter` exists as chronological log, but not explicitly retrospective/analytical)

### Cross-Cutting UI Concerns
- 🟡 Context preserved across navigation (strategy context preserved via tabs, but not full hierarchy context)
- ✅ Visual indication of urgency / priority (severity badges in triage: urgent, attention, monitor, info)
- ❌ Visual indication of belief conflict or drift

---

## G. Architectural & Transition Notes (For Transition Plan)

Use this section to capture implementation-specific observations.

### Stability & Risk
- ✅ **Stable areas (do not refactor)**:
  - Core data model: `accounts`, `trades`, `positions`, `strategies` tables and relationships
  - Ingestion pipeline: Flex CSV parsing and normalization
  - Snapshot system: `mtm_snapshots`, `nav_snapshots`, `portfolio_snapshots`, `strategy_metrics_snapshots`
  - Triage computation logic: rule-based triage in `src/lib/derived/triage.ts`
  - Blotter actions system: `blotter_actions` table and action workflow
- ⚠️ **Fragile or tightly coupled areas**:
  - Triage rules are hardcoded in constants (`src/lib/constants/triage.ts`) - planned migration to DB (see FUTURE_ENHANCEMENTS.md)
  - Strategy auto-derivation logic may need extension for hierarchical theses
  - No clear separation between tactical strategies and strategic theses
- ✅ **Cheap to extend**:
  - `triage_records` table can support additional context levels (underlying, account)
  - `blotter_actions` can be extended with additional fields for decision rationale
  - UI components are modular and can be extended
- ⚠️ **Requires careful migration**:
  - Adding macro/asset hierarchy without breaking existing strategy/position relationships
  - Introducing research layer without disrupting current workflow
  - Adding AI capabilities without replacing existing rule-based logic

### Sequencing Considerations
- ✅ **Low-risk, high-leverage additions**:
  - Add `macro_theses` and `asset_views` tables with foreign keys to `strategies` (backward compatible)
  - Extend `strategies.thesis` to support linking to asset thesiss
  - Add research ingestion endpoints (no impact on existing data)
  - Enhance `blotter_actions` with structured decision fields (rationale, confidence)
- ⚠️ **Prerequisites for later phases**:
  - Macro/asset hierarchy must exist before research can be mapped to it
  - Research ingestion must exist before AI structuring can be applied
  - Decision entities should be explicit before retrospective analysis
- ⚠️ **Dependencies between missing components**:
  - Research layer depends on macro/asset hierarchy for contextual mapping
  - AI capabilities depend on research ingestion infrastructure
  - Decision support depends on both research and explicit decision entities
  - Retrospective analysis depends on explicit decisions and research mappings

---

## H. Summary & Next Actions

- ✅ **Major conceptual gaps identified**:
  1. **Missing hierarchy levels**: No macro theses or asset thesiss - system operates at strategy/position level only
  2. **No research layer**: Complete absence of research ingestion, structuring, or AI-assisted analysis
  3. **Implicit decision model**: Decisions are captured in `blotter_actions` but not explicitly modeled with rationale/confidence
  4. **No AI capabilities**: All logic is rule-based; no AI for research, decision support, or pattern detection
  5. **Limited hierarchy navigation**: UI supports strategy/position navigation but not full macro → position hierarchy

- ✅ **Highest leverage alignment actions identified**:
  1. **Add macro/asset hierarchy** (Phase 1): Create `macro_theses` and `asset_views` tables, link to `strategies` via optional foreign keys. This enables:
     - Research contextual mapping
     - Hierarchical navigation
     - Belief evolution tracking
  2. **Enhance decision capture** (Phase 1): Add structured fields to `blotter_actions` for rationale, confidence, and explicit decision type. Low risk, high value.
  3. **Research ingestion foundation** (Phase 2): Create `research_artifacts` and `research_insights` tables, build ingestion endpoints. Enables future AI integration.
  4. **Explicit trigger model** (Phase 2): Create `workflow_triggers` table to make triggers first-class, supporting time-based and event-based triggers beyond current rule-based triage.

- ✅ **Items explicitly deferred**:
  - AI capabilities (research summarization, claim extraction, belief evaluation) - deferred until research infrastructure exists
  - Adversarial/stress-testing AI - explicitly marked as future in PRD
  - Collaboration and permissions - marked as future extension in PRD
  - Scenario simulation - marked as future extension in PRD

- ✅ **Items requiring design decisions**:
  1. **Macro thesis structure**: How to model secular vs cyclical vs structural beliefs? Should they have time horizons, confidence levels, review schedules?
  2. **Asset view relationship**: Should asset thesiss be one-to-many with strategies, or can strategies express multiple asset thesiss?
  3. **Research → Thesis mapping**: How to handle research that supports/refutes multiple theses? Many-to-many relationship?
  4. **Thesis evolution**: How to track thesis changes over time? Version history? Re-underwriting workflow?
  5. **Pre-investment research**: Should there be a separate "research workspace" or integrate into existing triage/blotter flow?
  6. **Decision confidence**: How to capture and use confidence levels? Should they influence triage prioritization?

**Outcome:**  
This checklist should directly feed into the System Architecture & Transition Plan document, which defines how the existing system will evolve toward PRD v1.1 without loss of momentum.