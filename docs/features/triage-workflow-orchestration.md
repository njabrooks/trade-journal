# Triage as Workflow Orchestration Layer

**Purpose**: Design specification for triage as the universal workflow management layer across all object types
**Status**: Phase 2.5 Implemented (Event-Driven Triage)
**Created**: 2026-01-07
**Last Updated**: 2026-01-07
**PRD Alignment**: Section 6 (Workflow & Triage Engine), Section 8 (Institutional Memory)

---

## Executive Summary

This document defines how triage evolves from "alerts about positions" to **the central inbox of actionable work across all object types**. Every object (thesis, view, strategy, position) has a lifecycle, and triage surfaces the next action needed at each stage.

### Core Architectural Principle

```
AUTOMATION BOUNDARY
────────────────────────────────────────────────────────────────────────────

    AUTOMATED (Scripts/Cron)          │  USER-INITIATED (Claude Code Skills)
    ─────────────────────────────────────────────────────────────────────────
    Cron jobs                         │  /synthesize-thesis
    Perplexity search execution       │  /assess-validation-evidence
    FRED data fetch                   │  /deep-dive
    Flex ingestion                    │  /process-transcript
    Massive IV ingestion              │
                                      │
    OUTPUT: Raw data + triage record  │  OUTPUT: Analysis + decision
    (trigger surfaced)                │  (user in the loop)
    ─────────────────────────────────────────────────────────────────────────
```

**Key Insight**: Automation produces **inputs** and surfaces them via triage. Heavy AI synthesis/analysis work is **user-initiated** via Claude Code skills. This keeps:
- AI costs visible and user-controlled
- User agency in every substantive decision
- Clear audit trail (user invoked skill X, received Y, decided Z)
- No silent background AI processing that could fail unexpectedly

---

## Implementation Progress

### Completed ✅

**Phase 1 (Foundation):**
- `thesis_triage_records` table with JSONB fields for content/analysis
- Triage inbox UI with filtering by severity, thesis type

**Phase 2 (Monitoring Integration):**
- `daily-thesis-monitoring.ts` creates triage records with Perplexity search results
- Claude AI analysis stored in `ai_analysis` JSONB field
- Expandable detail view showing AI analysis, key findings, matched results
- Suggested skill commands displayed and copyable

**Phase 2.5 (Event-Driven Triage) - NEW:**
- Renamed `lifecycle_status` → `workflow_status` with values: `developing` | `monitoring` | `paused` | `validated` | `invalidated` | `abandoned`
- Added `claims_count_at_last_articulation` field to track rule #2
- Added `triage_rule` field to `thesis_triage_records` for categorizing triage types
- Created `src/lib/derived/thesisTriage.ts` with:
  - `computeThesisTriageForThesis()` - compute triage for single thesis
  - `computeThesisTriageForAll()` - reconciliation job for all theses
  - `onArticulationCreated()` - hook for articulation events
- Hooked triage computation into:
  - `/api/research/convert-claim` - when claim creates new thesis
  - `/api/research/link-claim-to-thesis` - when claim linked to existing thesis

**Scripts:**
- `scripts/daily-thesis-monitoring.ts` - Automated news monitoring → triage records
- `scripts/generate-lifecycle-triage.ts` - Batch creation of lifecycle triage records

### Not Yet Built ❌

**Phase 3 (Journal Integration):**
- `journal_entries` table exists but not yet populated
- No audit logging of triage completions, skill invocations, status changes

**Phase 4 (Strategy/Position Lifecycle):**
- Strategy/position triage not yet unified with thesis triage
- Existing position triage (`triage_records` table) remains separate

### Next Steps

1. **Triage UI Updates** - Display thesis lifecycle triage alongside monitoring triage
2. **Articulation hook** - Call `onArticulationCreated()` when articulation is saved
3. **Background reconciliation** - Schedule `computeThesisTriageForAll()` to catch missed updates

---

## Key Design Decision: Evolution State vs Workflow Status

A critical insight emerged during implementation: thesis lifecycle is **not strictly linear**. Claims can be added continuously, articulations can be regenerated, and monitoring runs indefinitely. This led to separating two concepts:

### 1. Evolution State (Computed)

What artifacts exist for a thesis - computed on demand, not stored:

```typescript
interface ThesisEvolutionState {
  claimCount: number;              // From claim_thesis_mappings
  hasArticulation: boolean;        // From thesis_articulations
  hasValidationPoints: boolean;    // From validation_points
  hasMonitoringConfig: boolean;    // From thesis_monitoring_configs
}
```

### 2. Workflow Status (User-Controlled)

User's explicit intent for the thesis - stored in `workflow_status` field:

| Status | Meaning |
|--------|---------|
| `developing` | Building thesis, adding claims, refining articulation |
| `monitoring` | Active V&I point monitoring |
| `paused` | Temporarily inactive |
| `validated` | Closed - thesis proved correct |
| `invalidated` | Closed - thesis proved wrong |
| `abandoned` | Closed - no longer relevant |

### Triage Rules

Triage is triggered by **evolution state changes**, not workflow status:

| #   | Trigger                           | Triage Rule                   | Resolved By                        |
| --- | --------------------------------- | ----------------------------- | ---------------------------------- |
| 1   | Thesis exists, no articulation    | `thesis_needs_articulation`   | Articulation generated             |
| 2   | ≥3 claims since last articulation | `thesis_new_claims_available` | New articulation OR dismiss        |
| 3   | Articulation generated            | *(no triage)*                 | V&I points created in same session |
| 4   | Monitoring finds content          | `thesis_content_monitoring`   | User assesses content              |
| 5   | Data threshold breached           | `thesis_data_monitoring`      | User reviews V&I status            |
| 6   | User self-discovery               | *(no triage)*                 | Journal entry only                 |

---

## The Universal Object Lifecycle

Every object type follows a lifecycle with defined states. Triage surfaces when the object needs user attention to progress.

### 1. Macro Thesis Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     MACRO THESIS LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   LAYER 2: SYNTHESIS                                                     │
│   ┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐ │
│   │ CREATED │────▶│ CLAIMS      │────▶│ SYNTHESIZED │────▶│ VALIDATED│ │
│   │         │     │ LINKED      │     │             │     │          │ │
│   └─────────┘     └─────────────┘     └─────────────┘     └──────────┘ │
│        │                │                   │                   │       │
│        ▼                ▼                   ▼                   ▼       │
│   [triage:         [triage:           [triage:            [triage:      │
│    needs_claims]    needs_synthesis]   needs_v&i_points]   ready_for    │
│                                                            _monitoring] │
│        │                │                   │                   │       │
│        ▼                ▼                   ▼                   ▼       │
│   USER ACTION:     USER ACTION:        USER ACTION:        USER ACTION: │
│   Link claims      /synthesize-thesis  Extract V&I points  Configure    │
│   from research    skill               from articulation   monitoring   │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   LAYER 3: MONITORING                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        MONITORING                                │   │
│   │   ┌────────────────────────────────────────────────────────┐    │   │
│   │   │  Automated triggers (Perplexity, FRED) produce output  │    │   │
│   │   │  → Creates triage record                                │    │   │
│   │   │  → User invokes /assess-validation-evidence            │    │   │
│   │   │  → User decides on thesis status                       │    │   │
│   │   └────────────────────────────────────────────────────────┘    │   │
│   │                            │                                     │   │
│   │                            ▼                                     │   │
│   │                   ┌──────────────┐                               │   │
│   │                   │   CLOSED     │                               │   │
│   │                   │ (validated/  │                               │   │
│   │                   │ invalidated) │                               │   │
│   │                   └──────────────┘                               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2. Asset Thesis Lifecycle

Same pattern as Macro Thesis, but with:
- Underlying ticker linkage
- Price/IV monitoring in addition to news
- Strategy linkage when tactics are deployed

### 3. Strategy Lifecycle (Existing)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       STRATEGY LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐     │
│   │ PLANNED  │────▶│ OPEN     │────▶│ MONITORING│────▶│ CLOSING  │     │
│   │          │     │          │     │           │     │          │     │
│   └──────────┘     └──────────┘     └───────────┘     └──────────┘     │
│        │                │                 │                 │           │
│        ▼                ▼                 ▼                 ▼           │
│   [needs thesis    [needs entry     [DTE/IV/P&L        [needs exit    │
│    linkage]         trades]          triggers]          completion]    │
│                                                                          │
│                                           │                              │
│                                           ▼                              │
│                                    ┌──────────┐                         │
│                                    │ CLOSED   │                         │
│                                    └──────────┘                         │
│                                           │                              │
│                                           ▼                              │
│                                    [post-mortem                         │
│                                     analysis]                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4. Position Lifecycle (Existing)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       POSITION LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     ┌──────────┐     ┌───────────┐                       │
│   │ OPEN     │────▶│ MONITORING│────▶│ CLOSED   │                       │
│   │          │     │           │     │          │                       │
│   └──────────┘     └───────────┘     └──────────┘                       │
│        │                 │                                               │
│        ▼                 ▼                                               │
│   [needs strategy   [DTE alerts,                                        │
│    linkage]          IV alerts,                                         │
│                      P&L triggers]                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Triage Record Types by Object

### Unified Triage Record Structure

```typescript
interface UnifiedTriageRecord {
  id: string;
  createdAt: Date;

  // Object context (polymorphic)
  objectType: 'macro_thesis' | 'asset_thesis' | 'strategy' | 'position';
  objectId: string;
  objectTitle: string;

  // Lifecycle context
  lifecycleStage: string;           // e.g., 'synthesis', 'monitoring', 'closing'
  triggerType: string;              // What caused this triage record
  triggerSource: string;            // Where it came from

  // The actionable item
  actionRequired: string;           // Human-readable description
  suggestedSkill?: string;          // Claude Code skill to invoke (e.g., '/synthesize-thesis')

  // Classification
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient';

  // Status
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';

  // Audit
  completedAt?: Date;
  completedBy?: string;             // 'user' or skill name
  outcomeNotes?: string;
}
```

### Triage Types by Lifecycle Stage

#### Layer 2: Synthesis Stage

| Object | Lifecycle Stage | Trigger | Triage Type | Suggested Skill |
|--------|-----------------|---------|-------------|-----------------|
| Macro Thesis | CREATED | Manual creation | `thesis_needs_claims` | Manual claim linking |
| Macro Thesis | CLAIMS_LINKED | Sufficient claims linked | `thesis_needs_synthesis` | `/synthesize-thesis` |
| Macro Thesis | SYNTHESIZED | Articulation created | `thesis_needs_validation_points` | `/synthesize-thesis` (continuation) |
| Macro Thesis | VALIDATED | V&I points extracted | `thesis_ready_for_monitoring` | Configure monitoring |
| Asset Thesis | (same pattern) | | | |

#### Layer 3: Monitoring Stage

| Object             | Trigger                   | Triage Type                   | Suggested Skill               |
| ------------------ | ------------------------- | ----------------------------- | ----------------------------- |
| Macro/Asset Thesis | Perplexity search output  | `thesis_content_monitoring`   | `/assess-validation-evidence` |
| Macro/Asset Thesis | FRED data release         | `thesis_data_monitoring`      | `/assess-validation-evidence` |
| Macro/Asset Thesis | Price/IV threshold breach | `thesis_price_monitoring`     | `/assess-validation-evidence` |
| Macro/Asset Thesis | User-discovered content   | `thesis_manual_assessment`    | `/assess-validation-evidence` |
| Macro/Asset Thesis | V&I point triggered       | `thesis_validation_triggered` | Review thesis status          |

#### Strategy/Position (Existing Patterns)

| Object | Trigger | Triage Type | Action |
|--------|---------|-------------|--------|
| Strategy | DTE threshold | `strategy_dte_alert` | Review positions |
| Strategy | P&L threshold | `strategy_pnl_alert` | Review strategy |
| Strategy | Quantity change (trade reconciliation) | `strategy_quantity_change` | Reconcile unmatched trades |
| Position | DTE < threshold | `position_dte_alert` | Roll/close |
| Position | IV spike | `position_iv_alert` | Review |
| Position | Assignment risk | `position_assignment_risk` | Action required |

**Note on Quantity Change Trigger**: When trades are ingested via Flex API, they need to be reconciled with strategy objects. The `strategy_quantity_change` triage type surfaces unmatched trade executions that require user action to link to the correct strategy. This is tracked via the `unmatchedTradeExecutions` JSONB field in `triage_records`.

---

## Workflow Orchestration Patterns

### Pattern 1: Lifecycle Progression

When an object completes one lifecycle stage, the system automatically creates a triage record for the next stage.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER completes claim linking                                            │
│       │                                                                  │
│       ▼                                                                  │
│  SYSTEM detects: thesis has ≥3 linked claims                            │
│       │                                                                  │
│       ▼                                                                  │
│  SYSTEM creates triage record:                                          │
│    type: thesis_needs_synthesis                                         │
│    action: "Thesis has sufficient claims. Ready for synthesis."         │
│    suggestedSkill: /synthesize-thesis                                   │
│       │                                                                  │
│       ▼                                                                  │
│  USER sees triage record in inbox                                       │
│       │                                                                  │
│       ▼                                                                  │
│  USER invokes /synthesize-thesis skill                                  │
│       │                                                                  │
│       ▼                                                                  │
│  SKILL creates articulation + validation points                         │
│       │                                                                  │
│       ▼                                                                  │
│  SYSTEM marks triage record as completed                                │
│  SYSTEM creates next triage record: thesis_ready_for_monitoring         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pattern 2: Automated Monitoring → User Analysis

When automated monitoring detects relevant content, it creates a triage record. The user then invokes the appropriate skill.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CRON JOB: daily-thesis-monitoring.ts (6 AM)                            │
│       │                                                                  │
│       ▼                                                                  │
│  SCRIPT executes Perplexity search for each monitored thesis            │
│       │                                                                  │
│       ▼                                                                  │
│  SCRIPT does basic relevance filtering (keyword matching)               │
│       │                                                                  │
│       ▼                                                                  │
│  IF relevant content found:                                             │
│    SCRIPT creates triage record:                                        │
│      type: thesis_content_monitoring                                    │
│      action: "New content found for thesis [X]. Review and assess."     │
│      suggestedSkill: /assess-validation-evidence                        │
│      contentSummary: { sources, headlines, snippets }                   │
│       │                                                                  │
│       ▼                                                                  │
│  USER opens app, sees triage inbox                                      │
│       │                                                                  │
│       ▼                                                                  │
│  USER clicks on triage record, reviews content summary                  │
│       │                                                                  │
│       ▼                                                                  │
│  USER invokes /assess-validation-evidence skill                         │
│    → Skill analyzes content against ALL validation points               │
│    → Skill produces structured assessment                               │
│    → Skill recommends validation point status updates                   │
│       │                                                                  │
│       ▼                                                                  │
│  USER reviews recommendations, approves/modifies                        │
│       │                                                                  │
│       ▼                                                                  │
│  SYSTEM updates validation point statuses                               │
│  SYSTEM logs to journal (decision audit trail)                          │
│  SYSTEM marks triage record as completed                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pattern 3: User-Discovered Content

When the user discovers content outside the app, they can create a triage record manually or invoke a skill directly.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER discovers relevant article while browsing                         │
│       │                                                                  │
│       ▼                                                                  │
│  USER invokes /assess-validation-evidence with URL                      │
│    → Skill fetches content                                              │
│    → Skill analyzes against thesis validation points                    │
│    → Skill produces assessment                                          │
│       │                                                                  │
│       ▼                                                                  │
│  USER reviews, approves status updates                                  │
│       │                                                                  │
│       ▼                                                                  │
│  SYSTEM creates triage record (for audit trail)                         │
│    type: thesis_manual_assessment                                       │
│    status: completed                                                    │
│    outcomeNotes: [summary of assessment]                                │
│       │                                                                  │
│       ▼                                                                  │
│  SYSTEM logs to journal                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Journal as Decision Audit Trail

The journal captures every action across all object types, enabling full reconstruction of the decision process.

### Journal Entry Structure

```typescript
interface JournalEntry {
  id: string;
  timestamp: Date;

  // Object context
  objectType: 'macro_thesis' | 'asset_thesis' | 'strategy' | 'position' | 'claim';
  objectId: string;
  objectTitle: string;

  // Action details
  actionType: string;               // e.g., 'status_change', 'skill_invoked', 'manual_edit'
  actionDescription: string;        // Human-readable

  // Linkage
  triageRecordId?: string;          // If triggered by triage
  skillInvoked?: string;            // If skill was used

  // Before/after state
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;

  // User rationale (for divergence tracking)
  rationale?: string;

  // Provenance
  source: 'user' | 'skill' | 'automation';
}
```

### What Gets Logged

| Action | Object Type | Journal Entry |
|--------|-------------|---------------|
| Claim linked to thesis | Thesis | `claim_linked` |
| Articulation generated | Thesis | `articulation_created` |
| Validation point added | Thesis | `validation_point_added` |
| V&I point status changed | Thesis | `validation_status_changed` |
| Thesis status changed | Thesis | `thesis_status_changed` |
| Thesis lifecycle stage changed | Thesis | `lifecycle_stage_changed` |
| Strategy created | Strategy | `strategy_created` |
| Strategy quantity change reconciled | Strategy | `quantity_change_reconciled` |
| Trade executed | Position | `trade_executed` |
| Trade linked to strategy | Position/Strategy | `trade_linked` |
| Position rolled | Position | `position_rolled` |
| Triage record completed | Any | `triage_completed` |
| Triage record dismissed | Any | `triage_dismissed` |

### Filtering and Analysis

Journal enables:
- **Object history**: "Show me all actions for thesis X"
- **Skill usage**: "Show me all /synthesize-thesis invocations"
- **Divergence tracking**: "Show me decisions where user deviated from stated process"
- **Time-based review**: "Show me all actions last week"
- **Cross-object tracing**: "Show me how this claim influenced thesis Y and strategy Z"

---

## Triage Lifecycle Triggers

### Automatic Triage Record Creation

| Trigger | Creates Triage Record | Object Type |
|---------|----------------------|-------------|
| Thesis created | `thesis_needs_claims` | Thesis |
| ≥3 claims linked to thesis | `thesis_needs_synthesis` | Thesis |
| Articulation created without V&I points | `thesis_needs_validation_points` | Thesis |
| V&I points created | `thesis_ready_for_monitoring` | Thesis |
| Monitoring config saved | `thesis_monitoring_active` (info) | Thesis |
| Perplexity search returns relevant content | `thesis_monitoring_content` | Thesis |
| FRED threshold breached | `thesis_data_trigger` | Thesis |
| Price/IV threshold breached | `thesis_price_trigger` | Thesis |
| V&I point status → triggered | `thesis_validation_triggered` | Thesis |
| Unmatched trades after Flex ingestion | `strategy_quantity_change` | Strategy |
| Position DTE < threshold | `position_dte_alert` | Position |
| Position IV spike | `position_iv_alert` | Position |
| Strategy P&L exceeds threshold | `strategy_pnl_alert` | Strategy |

### Manual Triage Record Creation

Users can create triage records manually for:
- Ad-hoc reminders
- User-discovered content to assess later
- Notes for future review

---

## Skill Touchpoints

### Skills by Lifecycle Stage

| Lifecycle Stage | Primary Skill | When Invoked | Output |
|-----------------|---------------|--------------|--------|
| Evidence Collection | `/process-transcript` | New research artifact | Toulmin claims |
| Evidence Collection | `/synthesize-claims` | Cross-reference claims | Mapping recommendations |
| Evidence Collection | `/deep-dive` | Exploratory research | New claims/insights |
| Thesis Synthesis | `/synthesize-thesis` | After sufficient claims | Articulation + V&I points |
| Monitoring | `/assess-validation-evidence` | Relevant content found | Evidence assessment |
| Monitoring | `/generate-summary` | Quick summary needed | Summary update |

### Skill Invocation Rules

1. **User initiates**: All skill invocations are user-triggered (never automatic)
2. **Triage suggests**: Triage records include `suggestedSkill` field
3. **Audit logged**: Every skill invocation is logged to journal
4. **Output reviewed**: User reviews and approves skill output before system state changes

---

## Database Schema Additions

### Triage Record Types Table

```sql
-- Extend existing triage_records or create unified table
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS object_id UUID;
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS suggested_skill TEXT;

-- Or create new unified table
CREATE TABLE unified_triage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Object context
  object_type TEXT NOT NULL CHECK (object_type IN ('macro_thesis', 'asset_thesis', 'strategy', 'position')),
  object_id UUID NOT NULL,
  object_title TEXT NOT NULL,

  -- Lifecycle context
  lifecycle_stage TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_source TEXT,

  -- Action
  action_required TEXT NOT NULL,
  suggested_skill TEXT,

  -- Classification
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  urgency TEXT NOT NULL CHECK (urgency IN ('immediate', 'today', 'this_week', 'when_convenient')),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),

  -- Audit
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  outcome_notes TEXT,

  -- Content (for monitoring triggers)
  content_summary JSONB,

  -- AI analysis (if pre-computed)
  ai_analysis JSONB
);

CREATE INDEX idx_unified_triage_object ON unified_triage_records(object_type, object_id);
CREATE INDEX idx_unified_triage_status ON unified_triage_records(status);
CREATE INDEX idx_unified_triage_created ON unified_triage_records(created_at DESC);
```

### Journal Extensions

```sql
-- Journal table for decision audit trail (renamed from blotter_entries)
-- Note: blotter_actions table retained for trade-level aggregations
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Object context
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  object_title TEXT,

  -- Action details
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,

  -- Linkage
  triage_record_id UUID REFERENCES unified_triage_records(id),
  skill_invoked TEXT,

  -- State change
  previous_state JSONB,
  new_state JSONB,

  -- Rationale
  rationale TEXT,

  -- Provenance
  source TEXT NOT NULL CHECK (source IN ('user', 'skill', 'automation'))
);

CREATE INDEX idx_journal_object ON journal_entries(object_type, object_id);
CREATE INDEX idx_journal_timestamp ON journal_entries(timestamp DESC);
CREATE INDEX idx_journal_action_type ON journal_entries(action_type);
```

### Thesis Lifecycle Status

```sql
-- Add lifecycle_status to thesis tables
ALTER TABLE macro_theses ADD COLUMN IF NOT EXISTS lifecycle_status TEXT
  DEFAULT 'created' CHECK (lifecycle_status IN (
    'created',           -- Just created, needs claims
    'claims_linked',     -- Has sufficient claims, needs synthesis
    'synthesized',       -- Has articulation, needs V&I points
    'validated',         -- Has V&I points, ready for monitoring
    'monitoring',        -- Active monitoring
    'closed'             -- Validated or invalidated, thesis complete
  ));

ALTER TABLE asset_theses ADD COLUMN IF NOT EXISTS lifecycle_status TEXT
  DEFAULT 'created' CHECK (lifecycle_status IN (
    'created',
    'claims_linked',
    'synthesized',
    'validated',
    'monitoring',
    'closed'
  ));
```

---

## UI Integration

### Unified Triage Inbox

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRIAGE INBOX                                              Filter ▼     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ CRITICAL (2) ────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [!] GLW Thesis: Validation point triggered                       │  │
│  │      "Optical segment revenue missed Q4 guidance"                 │  │
│  │      Suggested: /assess-validation-evidence                       │  │
│  │                                                        [Action ▶] │  │
│  │                                                                    │  │
│  │  [!] SPY Put Strategy: DTE < 7                                    │  │
│  │      Position needs roll or close decision                        │  │
│  │                                                        [Action ▶] │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ HIGH (3) ────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [i] US Economic Growth Thesis: New content to review             │  │
│  │      Perplexity found 5 relevant articles (FRED data release)     │  │
│  │      Suggested: /assess-validation-evidence                       │  │
│  │                                                        [Action ▶] │  │
│  │  ...                                                               │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ MEDIUM (5) ──────────────────────────────────────────────────────┐  │
│  │  ...                                                               │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Triage Record Detail View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRIAGE: GLW Thesis Monitoring Content                      [Dismiss]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  THESIS: Bullish GLW (Asset Thesis)                                     │
│  STAGE: Monitoring                                                       │
│  TRIGGER: Perplexity daily scan (2026-01-07 06:00)                      │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  CONTENT SUMMARY                                                         │
│  • 8 articles scanned, 3 marked relevant                                │
│  • Sources: Reuters, WSJ, Seeking Alpha                                 │
│                                                                          │
│  KEY HEADLINES:                                                          │
│  • "Corning Reports Q4 Optical Segment Revenue Below Expectations"      │
│  • "GLW Stock Down 4% on Earnings Miss"                                 │
│  • "Analyst Downgrades Corning on Margin Concerns"                      │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  SUGGESTED ACTION                                                        │
│  Run /assess-validation-evidence to analyze content against             │
│  all validation points and determine if any are triggered.              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  [Run /assess-validation-evidence]    [View Source Links]       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation

1. **Schema migrations**
   - Add `lifecycle_status` to thesis tables
   - Create `unified_triage_records` table
   - Create `journal_entries` table

2. **Lifecycle status tracking**
   - Update thesis detail pages to show lifecycle status
   - Add lifecycle progression logic (auto-detect stage transitions)

3. **Basic triage record creation**
   - Manual triage record creation for theses
   - Auto-create triage when thesis lifecycle advances

### Phase 2: Monitoring Integration

1. **Connect daily-thesis-monitoring.ts to triage**
   - Modify script to create triage records (not just console output)
   - Store content summary in triage record

2. **Triage inbox UI**
   - Unified inbox showing all object types
   - Filtering by object type, severity, urgency
   - Suggested skill display

3. **Skill invocation from triage**
   - "Run skill" button that opens Claude Code with context
   - Skill completion marks triage record as completed

### Phase 3: Journal Integration

1. **Journal logging**
   - Log all triage completions to journal
   - Log all skill invocations to journal
   - Log all status changes to journal

2. **Journal UI**
   - Timeline view per object
   - Filtering and search
   - Cross-object tracing

### Phase 4: Strategy/Position Lifecycle

1. **Extend strategy lifecycle**
   - Add lifecycle_status to strategies
   - Triage for strategy lifecycle events

2. **Connect existing position triage**
   - Unify position triage with new schema
   - Add suggested actions/skills

---

## Success Criteria

### MVP Success

- [ ] Thesis lifecycle status is visible and accurate
- [ ] Triage records are created at each lifecycle transition
- [ ] User can see unified triage inbox
- [ ] User can invoke suggested skills from triage
- [ ] All actions are logged to journal

### Full Implementation Success

- [ ] Automated monitoring creates triage records (not direct analysis)
- [ ] User initiates all AI-heavy analysis via skills
- [ ] Journal provides complete decision audit trail
- [ ] User can reconstruct decision process for any thesis
- [ ] Triage serves as the primary workflow driver

---

## Related Documents

- **[Thesis Synthesis & Monitoring](thesis-synthesis-monitoring.md)** - Technical implementation details
- **[Validation Assessment Workflow](validation-assessment-workflow.md)** - /assess-validation-evidence skill
- **[Research Workflow](research-workflow.md)** - Evidence collection layer
- **[PRD v1.1](../PRD_v1.1.md)** - Section 6 (Workflow & Triage Engine)

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-07 | Claude + User | Initial design specification |
| 2026-01-07 | Claude + User | Added Implementation Progress section; Phase 1-2 complete, documented event-driven state machine as next step |
