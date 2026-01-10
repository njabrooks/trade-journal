# Triage & Decision Point UX Redesign Brief

**Purpose**: Design document capturing the full context for a holistic UX/UI redesign of the triage system and decision points across the trade-journal application.

**Status**: Discovery phase - ready for decision point inventory
**Created**: 2026-01-09

---

## Background Context

### What This App Does

This is a trade journal application that bridges the gap between **research** (input) and **trades** (output). The system exists to provide a robust investment process that connects these two ends.

**The Problem Being Solved**: Without the system, users make trading decisions without a structured process to facilitate superior results. They jump straight to trades without systematically building conviction through research.

### The Investment Process Framework

The app implements a sequential decision hierarchy:

```
Research → Claims → Macro Theses → Asset Theses → Strategies → Positions → P&L
```

Where:
- **Research**: Raw content (transcripts, articles, notes) processed via `/process-transcript` skill
- **Claims**: Extracted assertions with Toulmin framework (evidence, reasoning, backing)
- **Macro Theses**: Cross-asset beliefs (secular, cyclical, structural)
- **Asset Theses**: Asset-specific views about underlyings, linked to macro theses
- **Strategies**: Tactical implementations (options strategies, duration plays)
- **Positions**: Individual trades and live exposures
- **P&L**: Closed positions, realized gains/losses

### Two Entry Points (Bookends)

1. **Research Entry** (beginning): User processes transcripts/content → claims extracted → fed into thesis hierarchy
2. **Trade Entry** (end): User executes trades in brokerage → ingested via IBKR Flex → matched to strategies

The system bridges these bookends with process and accountability.

---

## Current Architecture

### Two Orthogonal Features to the Workflow

**1. Triage**
- Centralizes ALL action points across the entire workflow
- Pulls in everything requiring user decision-making or action
- Could potentially be the primary interaction point (user spends most time here)
- Good for quick decisions that don't require extensive analysis
- May be less suitable for complex analytical tasks requiring deep context

**2. Journal**
- Retrospective log of every action (in-app and external like trades)
- Chronological, sequential order of everything that happened
- Provides rich data for future AI analysis
- Enables feedback and insights on process improvement

### Two Levels of Monitoring

**Thesis-Level (Strategic)**
- V&I (Validation/Invalidation) points
- News monitoring via Perplexity searches
- Data feed monitoring (FRED, price thresholds, IV)
- Fundamental/strategic indicators

**Strategy/Position-Level (Tactical)**
- DTE (days to expiry)
- Sigma (standard deviation moves)
- ITM/OTM status
- Size/concentration risk
- State code changes (playbook states)

### Current Touchpoints

**List Views:**
- `/research` - Research artifacts and insights with claims
- `/theses` - Macro theses list
- `/asset-theses` - Asset theses list
- `/strategies` - Strategies list
- `/triage` - Central triage inbox (mixed: thesis lifecycle, monitoring, strategy/position alerts)
- `/blotter` - Trade journal / decision log

**Detail Views:**
- `/research/[id]` - Individual research with claims browser
- `/theses/[id]` - Macro thesis detail
- `/asset-theses/[id]` - Asset thesis detail (has Triage Alerts, V&I Points, News Archive sections)
- `/strategies/[id]` - Strategy detail

**Skills (Claude Code):**
- `/process-transcript` - Extract claims from research
- `/synthesize-thesis` - Generate articulation with V&I points
- `/synthesize-claims` - Cross-reference claims against existing theses
- `/assess-validation-evidence` - Evaluate content against V&I points

---

## Key Design Principles

### Non-Linear User Behavior

While the framework is sequential, actual user behavior is not:
- Users can enter at any stage
- They need to add, remove, update things at any point
- The system must support both the "ideal flow" and ad-hoc interactions

### The Central Design Question

> **What are all the decision points, and for each one: what does the user need to see, and what can they do?**

Once enumerated, UX design becomes:
1. Which decisions are quick enough for triage?
2. Which need full object context?
3. How do we link between them seamlessly?

### Triage Philosophy

Triage should be viable as the **primary interaction point** - if designed well, users could spend most of their time there. But it should also gracefully hand off to object detail pages when deeper analysis is needed.

Key questions for each decision point:
- Is it triage-suitable? (quick context, clear actions)
- Needs object page? (requires related data, comparison, scrolling)
- Needs dedicated workflow? (multi-step, external tools)

---

## Decision Point Inventory Requirements

### Stages to Cover

1. **Research Ingestion**
   - Processing transcripts
   - Reviewing extraction quality
   - Approving/editing claims

2. **Claim Management**
   - Reviewing claims
   - Categorizing (thesis candidate, evidence, etc.)
   - Linking to macro theses
   - Linking to asset theses
   - Promoting to new thesis/view

3. **Thesis Management (Linking)**
   - Linking macro theses ↔ asset theses (bidirectional)
   - Linking asset theses ↔ strategies
   - Linking claims ↔ theses (from both directions)
   - Managing relationship metadata (supports/refutes/foundation)

4. **Thesis Lifecycle**
   - Creation (from claims or manual)
   - Synthesis (generating articulation)
   - Articulation updates (when new claims available)
   - Status changes (active, under_review, archived)

5. **V&I Monitoring**
   - Reviewing monitoring results (news, data)
   - Assessing evidence against V&I points
   - Updating V&I status (not_triggered → monitoring → triggered)
   - Handling auto-triggered thresholds

6. **Strategy Management**
   - Creation and configuration
   - Linking to asset theses
   - Tactical adjustments
   - Entry/exit criteria management

7. **Position Management**
   - Risk trigger responses (DTE, ITM, sigma)
   - Rolling decisions
   - Closing decisions
   - Size adjustments

8. **Trade Reconciliation**
   - Matching triage actions to actual trades
   - Logging trade rationale
   - Post-trade reflection

### For Each Decision Point, Document:

| Field | Description |
|-------|-------------|
| **Decision Point** | Name/identifier |
| **Stage** | Which stage of the workflow |
| **Trigger** | What causes this to surface (automatic detection, user action, time-based) |
| **Context Needed** | What information user needs to make the decision |
| **Available Actions** | Full list of options the user can take |
| **Downstream Effects** | What happens as a result of each action |
| **Complexity** | Quick / Medium / Deep analysis required |
| **Current Location** | Where this exists in the app today (if anywhere) |
| **Triage Suitable?** | Yes / Partial / No - with reasoning |
| **Recommended UX** | Suggested approach for this decision point |

---

## Deliverable

A comprehensive **Decision Point Inventory** document that:

1. Enumerates every decision point across all stages
2. Provides full context for each (using the template above)
3. Assesses triage-suitability for each
4. Recommends UX approach for each
5. Identifies patterns and groupings
6. Proposes a unified triage UX architecture based on findings

This inventory will serve as the foundation for UX/UI redesign work.

---

## Technical References

**Key Code Locations:**
- Triage computation: `src/lib/derived/triage.ts`, `src/lib/derived/thesisTriage.ts`
- Triage UI: `src/components/triage/`, `src/components/asset-theses/TriageAlertSection.tsx`
- V&I management: `src/app/api/validation-points/[id]/route.ts`
- Claim management: `src/components/research/`, `src/app/api/research/`
- Thesis pages: `src/app/theses/`, `src/app/asset-theses/`
- Strategy/Position triage: `src/app/api/triage/`
- Journal logging: `src/lib/workflow/lifecycleDetection.ts`

**Key Documentation:**
- `docs/PRD_v1.1.md` - Product requirements and vision
- `docs/terminology.md` - Authoritative term definitions
- `docs/features/thesis-triage-flows.md` - Current triage implementation details
- `docs/features/research-workflow.md` - Research ingestion workflow
- `CLAUDE.md` - Full codebase overview

**Database Schema:**
- `thesis_triage_records` - Thesis lifecycle and monitoring triage
- `triage_records` - Strategy/position triage
- `journal_entries` - Unified audit trail
- `validation_points` - V&I points with status
- `validation_status_history` - V&I status change log
- `claim_thesis_mappings` - Claim to thesis linkages
- `macro_thesis_asset_thesis_relations` - Thesis linking

---

## Next Steps

1. **Create Decision Point Inventory** - Comprehensive enumeration following the template above
2. **Analyze Patterns** - Identify which decisions cluster together, common contexts
3. **Propose Triage Architecture** - Unified design based on findings
4. **Design Object Page Integration** - How triage and detail pages work together
5. **Prototype Key Flows** - Mock up the most critical user journeys

---

## Conversation Context

This document was created following a design discussion about:
- The relationship between the new Triage Alerts section and Validation Points section
- Whether these should be integrated or remain separate
- The need for a holistic evaluation of all user access points
- Designing UX/UI from first principles rather than being anchored to existing implementation

The user emphasized:
- Research and trades are the two bookends of the process
- The system bridges them with a structured investment process
- Triage should centralize ALL action points across the workflow
- Journal provides retrospective logging for AI analysis
- Both quick triage decisions and deep analytical work need to be supported
- Linking is a key action type that needs to work bidirectionally across all object types
