# System Architecture & Transition Plan
## Evolving Toward PRD v1.1

**Version:** 1.0  
**Status:** Draft  
**Date:** 2025-12-20  
**Based on:** PRD v1.1, PRD Codebase Comparison

---

## Executive Summary

This document defines how the existing Trade Journal system will evolve toward the Universal Investment Operating System vision (PRD v1.1) without disrupting current operations or losing momentum.

**Current State:** A functional options trading journal with strategy/position tracking, triage workflow, and blotter actions. Strong foundation in execution data, snapshots, and rule-based triage.

**Target State:** A complete investment operating system with hierarchical belief model (macro → asset → strategy → position), research layer, AI-assisted analysis, and institutional memory.

**Transition Strategy:** Phased evolution with backward compatibility, incremental value delivery, and minimal disruption to existing workflows.

---

## 1. Target Architecture (PRD v1.1 Alignment)

### 1.1 Conceptual Model

The target system implements a **four-level decision hierarchy**:

```
Macro Theses (Level 1)
  └─> Asset Views (Level 2)
      └─> Strategies (Level 3)
          └─> Positions (Level 4)
```

**Key Principles:**
- Every object has explicit position in hierarchy
- Objects inherit contextual meaning from higher levels
- Beliefs are living objects that evolve with evidence
- Research flows top-down to inform decisions
- Decisions flow bottom-up to validate beliefs

### 1.2 Core Architectural Layers

#### Layer 1: Data Ingestion & Normalization
- **Status:** ✅ Complete
- Multi-broker ingestion (IBKR Flex, manual CSV)
- Normalized canonical model
- Historical state reconstruction via snapshots

#### Layer 2: Belief & Knowledge Hierarchy
- **Status:** ❌ Missing (Levels 1-2), ✅ Partial (Level 3)
- Macro theses (secular, cyclical, structural)
- Asset views (asset-specific theses)
- Strategies (tactical expression of views)
- Positions (execution)

#### Layer 3: Research & Intelligence
- **Status:** ❌ Missing
- Research ingestion (articles, transcripts, notes)
- AI-assisted structuring (summarization, claim extraction)
- Contextual mapping to hierarchy
- Pre-investment research state

#### Layer 4: Workflow & Decision Loop
- **Status:** ✅ Partial
- Triggers (time, event, rule-based)
- Triage (evaluation, severity, urgency)
- Decision capture (explicit with rationale)
- Action execution (trades, updates, observations)

#### Layer 5: Decision Support & Analytics
- **Status:** 🟡 Partial
- Options/payoff analytics
- Risk/exposure views
- Research synthesis (missing)
- Prior decision context (partial)

#### Layer 6: Institutional Memory
- **Status:** ⚠️ Implicit
- Chronological journal (blotter_actions)
- Retrospective analysis (missing)
- Pattern detection (missing)
- Bias detection (missing)

### 1.3 Decision Loop

The system implements a closed-loop decision process that operates at all hierarchy levels:

```
Trigger
  ↓
Triage (evaluate urgency / severity)
  ↓
Decision (with rationale + confidence)
  ↓
Action / Inaction
  ↓
Outcome
  ↓
Journal
  ↓
Retrospective Learning
  ↺ feeds back into Theses / Views
```

**Key Points:**
- **Triggers** initiate the loop (time-based, event-based, rule-based)
- **Triage** evaluates and prioritizes (urgency, severity)
- **Decisions** are explicit with rationale and confidence
- **Actions** or **Inaction** are both valid outcomes
- **Outcomes** are tracked and evaluated
- **Journal** captures the complete loop
- **Retrospective Learning** closes the loop by informing belief evolution

This loop operates at all hierarchy levels (macro thesis → asset view → strategy → position).

---

## 2. Current State Analysis

### 2.1 What Works Well (Preserve)

**Core Data Model:**
- `accounts`, `trades`, `positions`, `strategies` tables are stable and well-designed
- Snapshot system (`mtm_snapshots`, `nav_snapshots`, `portfolio_snapshots`, `strategy_metrics_snapshots`) enables historical reconstruction
- Separation of trades vs positions is correct

**Workflow Engine:**
- Triage system (`triage_records`) with rule-based triggers
- Blotter actions (`blotter_actions`) for decision capture
- Severity/urgency classification works
- Action workflow (TRADE, MONITOR, DISMISS, UPDATE) is functional

**Ingestion Pipeline:**
- Flex CSV parsing and normalization
- Multi-source data handling (IBKR, Massive)
- Process tracking (`ingestion_runs`)

**UI Foundation:**
- Strategy and position navigation
- Triage queue with filtering
- Blotter/journal view
- Modular component architecture

### 2.2 Critical Gaps

**Missing Hierarchy Levels:**
- No macro theses entity
- No asset views entity
- Strategies exist but are tactical, not connected to higher-level beliefs

**No Research Layer:**
- No research ingestion
- No structured research insights
- No AI capabilities
- No research → thesis mapping

**Implicit Decision Model:**
- Decisions captured in `blotter_actions` but not explicitly modeled
- No structured rationale or confidence fields
- No explicit decision type classification

**Limited Trigger Model:**
- Triggers are computed, not first-class entities
- Time-based triggers limited to ingestion scheduling
- Event-based triggers implicit in triage rules

---

## 3. Transition Phases

### Phase 1: Foundation (Months 1-2)
**Goal:** Add hierarchy levels and enhance decision capture without breaking existing functionality.

**Deliverables:**
1. Macro theses and asset views data model
2. Enhanced decision capture in blotter
3. Basic hierarchy navigation UI
4. Backward-compatible strategy linking

**Risk:** Low - All changes are additive and optional.

---

### Phase 2: Research Infrastructure (Months 3-4)
**Goal:** Build research ingestion and storage foundation.

**Deliverables:**
1. Research artifacts and insights tables
2. Research ingestion endpoints
3. Research → hierarchy mapping
4. Pre-investment research state

**Risk:** Low - New functionality, no impact on existing workflows.

---

### Phase 3: AI Integration (Months 5-6)
**Goal:** Add AI-assisted research structuring and decision support.

**Deliverables:**
1. Research summarization
2. Claim extraction
3. Evidence classification
4. Belief evaluation (support/refute)
5. Decision support synthesis

**Risk:** Medium - Requires AI infrastructure, but can be added incrementally.

---

### Phase 4: Enhanced Workflows (Months 7-8)
**Goal:** Expand trigger model and retrospective analysis.

**Deliverables:**
1. First-class trigger entities
2. Time-based review triggers
3. Event-based triggers (beyond triage)
4. Retrospective analysis views
5. Pattern detection

**Risk:** Medium - May require refactoring existing triage logic.

---

## 4. Phase 1: Foundation - Detailed Design

### 4.1 Data Model: Macro Theses & Asset Views

#### 4.1.1 `macro_theses` Table

```sql
CREATE TABLE macro_theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  thesis_type text NOT NULL, -- 'secular' | 'cyclical' | 'structural'
  time_horizon text, -- 'long_term' | 'medium_term' | 'short_term'
  confidence_level text, -- 'high' | 'medium' | 'low' | 'exploratory'
  status text NOT NULL DEFAULT 'active', -- 'active' | 'under_review' | 'retired' | 'superseded'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  next_review_due_at timestamptz,
  created_by uuid, -- Future: user_id for collaboration
  notes jsonb -- Flexible metadata
);

CREATE INDEX idx_macro_theses_status ON macro_theses(status);
CREATE INDEX idx_macro_theses_type ON macro_theses(thesis_type);
```

**Design Decisions:**
- `thesis_type` distinguishes secular (multi-decade), cyclical (business cycle), structural (regime change)
- `confidence_level` supports PRD requirement for belief evolution
- `status` enables re-underwriting workflow
- `next_review_due_at` supports time-based triggers

#### 4.1.2 `asset_views` Table

```sql
CREATE TABLE asset_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  macro_thesis_id uuid REFERENCES macro_theses(id) ON DELETE SET NULL,
  underlying_id uuid REFERENCES underlyings(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  narrative text, -- Story/context
  fundamental_context text,
  positioning_context text,
  regime_context text,
  time_horizon text,
  confidence_level text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  next_review_due_at timestamptz,
  notes jsonb
);

CREATE INDEX idx_asset_views_macro_thesis ON asset_views(macro_thesis_id);
CREATE INDEX idx_asset_views_underlying ON asset_views(underlying_id);
CREATE INDEX idx_asset_views_status ON asset_views(status);
```

**Design Decisions:**
- `macro_thesis_id` is nullable - asset views can exist independently
- `underlying_id` links to existing underlyings table
- Multiple context fields support PRD requirement for "narrative, fundamental, positioning, and regime context"
- Same status/review pattern as macro theses

#### 4.1.3 Extend `strategies` Table

```sql
ALTER TABLE strategies
  ADD COLUMN asset_view_id uuid REFERENCES asset_views(id) ON DELETE SET NULL,
  ADD COLUMN macro_thesis_id uuid REFERENCES macro_theses(id) ON DELETE SET NULL;

CREATE INDEX idx_strategies_asset_view ON strategies(asset_view_id);
CREATE INDEX idx_strategies_macro_thesis ON strategies(macro_thesis_id);
```

**Design Decisions:**
- Both foreign keys are nullable for backward compatibility
- Existing strategies continue to work without hierarchy links
- Strategies can link to asset views OR macro theses (or both)
- Allows gradual migration of existing strategies

**⚠️ Critical Clarification: Strategy vs Thesis**
- **Strategies are tactical execution constructs**, not long-lived belief objects
- **Macro Theses and Asset Views are belief objects** that evolve with evidence
- **Strategies link to theses/views** but remain tactical - their linkage is **additive, not redefining**
- A strategy can express an asset view, but the strategy itself is not the belief
- Example: "Covered call on GLXY" (strategy) expresses "GLXY will trade sideways" (asset view), but the strategy is the tactical implementation, not the belief itself

### 4.2 Enhanced Decision Capture

#### 4.2.1 Extend `blotter_actions` Table

```sql
ALTER TABLE blotter_actions
  ADD COLUMN decision_type text, -- 'trade' | 'update_thesis' | 'record_observation' | 'no_action'
  ADD COLUMN decision_rationale text, -- Structured rationale
  ADD COLUMN confidence_level text, -- 'high' | 'medium' | 'low'
  ADD COLUMN conviction_score integer, -- 1-10 scale
  ADD COLUMN expected_outcome text, -- What outcome is expected
  ADD COLUMN actual_outcome text, -- Filled in retrospectively
  ADD COLUMN outcome_evaluated_at timestamptz; -- When outcome was reviewed

CREATE INDEX idx_blotter_decision_type ON blotter_actions(decision_type);
```

**Design Decisions:**
- `decision_type` aligns with PRD: "Take action (trade), Update thesis or metadata, Record observation, Explicitly take no action"
- `decision_rationale` is structured (vs free-form `notes`)
- `confidence_level` and `conviction_score` support PRD requirement for capturing conviction
- `expected_outcome` and `actual_outcome` enable retrospective analysis
- All fields nullable for backward compatibility

### 4.3 UI Components

#### 4.3.1 Hierarchy Navigator

**New Page:** `/hierarchy` or integrated into existing navigation

**Components:**
- Tree view: Macro Theses → Asset Views → Strategies → Positions
- Breadcrumb navigation
- Filter by status, type, confidence
- Quick actions: Create thesis, link strategy, review due

**Implementation:**
- Server component for data fetching
- Client component for interactive tree
- Reuse existing strategy/position detail views

#### 4.3.2 Macro Thesis Detail Page

**New Page:** `/theses/[thesisId]`

**Sections:**
- Thesis overview (type, status, confidence, review schedule)
- Linked asset views
- Linked strategies (with performance)
- Research mappings (Phase 2)
- Review history

#### 4.3.3 Asset View Detail Page

**New Page:** `/asset-views/[viewId]`

**Sections:**
- View overview (narrative, fundamental, positioning, regime context)
- Parent macro thesis (if linked)
- Linked strategies
- Linked positions
- Research mappings (Phase 2)

### 4.4 Migration Strategy

**Step 1: Create Tables**
- Run migrations for `macro_theses`, `asset_views`
- Add foreign keys to `strategies`
- Extend `blotter_actions`

**Step 2: Seed Initial Data (Optional)**
- Create placeholder macro theses for existing strategies
- Manual linking via admin UI

**Step 3: Update UI**
- Add hierarchy navigator
- Add thesis/view detail pages
- Enhance strategy detail to show hierarchy links

**Step 4: Gradual Adoption**
- Existing strategies continue to work
- New strategies can optionally link to hierarchy
- No forced migration

---

## 5. Phase 2: Research Infrastructure - Detailed Design

### 5.1 Data Model: Research Layer

#### 5.1.1 `research_artifacts` Table

```sql
CREATE TABLE research_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL, -- 'article' | 'transcript' | 'note' | 'report' | 'video'
  source_url text,
  title text NOT NULL,
  raw_content text, -- Full text/content
  ingested_at timestamptz NOT NULL DEFAULT now(),
  ingested_by uuid, -- Future: user_id
  metadata jsonb, -- Source-specific metadata (author, date, etc.)
  file_storage_path text, -- If file uploaded
  status text NOT NULL DEFAULT 'raw', -- 'raw' | 'processing' | 'structured' | 'error'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_artifacts_source_type ON research_artifacts(source_type);
CREATE INDEX idx_research_artifacts_status ON research_artifacts(status);
CREATE INDEX idx_research_artifacts_ingested_at ON research_artifacts(ingested_at);
```

**Design Decisions:**
- `raw_content` stores full text (for AI processing and search)
- `status` tracks processing pipeline
- `metadata` is flexible JSONB for source-specific fields
- `file_storage_path` supports file uploads (future: S3/Storage)

#### 5.1.2 `research_insights` Table

```sql
CREATE TABLE research_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,
  summary text NOT NULL, -- AI-generated summary
  key_claims jsonb, -- Array of extracted claims
  supporting_evidence jsonb, -- Array of evidence points
  counter_evidence jsonb, -- Array of counterpoints
  time_horizon text, -- Extracted time horizon
  confidence_level text, -- Extracted confidence
  structured_at timestamptz NOT NULL DEFAULT now(),
  structured_by text, -- 'ai' | 'manual' | 'hybrid'
  ai_model_version text, -- For tracking AI model used
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_insights_artifact ON research_insights(research_artifact_id);
CREATE INDEX idx_research_insights_time_horizon ON research_insights(time_horizon);
```

**Design Decisions:**
- `key_claims` is JSONB array: `[{claim: "...", confidence: "...", evidence: "..."}]`
- `supporting_evidence` and `counter_evidence` are structured arrays
- `structured_by` tracks whether AI or manual (supports hybrid workflow)
- `ai_model_version` enables model evolution tracking

#### 5.1.3 `research_mappings` Table

```sql
CREATE TABLE research_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_insight_id uuid NOT NULL REFERENCES research_insights(id) ON DELETE CASCADE,
  hierarchy_level text NOT NULL, -- 'macro_thesis' | 'asset_view' | 'strategy' | 'position'
  macro_thesis_id uuid REFERENCES macro_theses(id) ON DELETE CASCADE,
  asset_view_id uuid REFERENCES asset_views(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES strategies(id) ON DELETE CASCADE,
  position_id uuid REFERENCES positions(id) ON DELETE CASCADE,
  mapping_type text NOT NULL, -- 'supports' | 'refutes' | 'neutral' | 'exploratory'
  confidence text, -- 'high' | 'medium' | 'low'
  mapped_at timestamptz NOT NULL DEFAULT now(),
  mapped_by text, -- 'ai' | 'manual' | 'hybrid'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_mappings_insight ON research_mappings(research_insight_id);
CREATE INDEX idx_research_mappings_macro_thesis ON research_mappings(macro_thesis_id);
CREATE INDEX idx_research_mappings_asset_view ON research_mappings(asset_view_id);
CREATE INDEX idx_research_mappings_strategy ON research_mappings(strategy_id);
CREATE INDEX idx_research_mappings_type ON research_mappings(mapping_type);
```

**Design Decisions:**
- `hierarchy_level` + specific FK ensures only one target per mapping
- `mapping_type` supports PRD requirement: "supports existing beliefs, refutes or challenges them, is neutral or exploratory"
- Multiple mappings per insight (many-to-many) - research can map to multiple theses/views
- `mapped_by` tracks AI vs manual mapping

#### 5.1.4 Pre-Investment Research State

**Approach:** Use `research_insights` with no `research_mappings` entries.

**Query Pattern:**
```sql
-- Find pre-investment research
SELECT ri.*
FROM research_insights ri
LEFT JOIN research_mappings rm ON ri.id = rm.research_insight_id
WHERE rm.id IS NULL
ORDER BY ri.structured_at DESC;
```

**Design Decision:** No separate table needed - absence of mappings indicates pre-investment state.

### 5.2 Research Ingestion API

#### 5.2.1 Endpoints

**POST `/api/research/ingest`**
- Accept: text/plain, application/json, multipart/form-data
- Parameters:
  - `source_type`: required
  - `title`: required
  - `content`: required (or file upload)
  - `source_url`: optional
  - `metadata`: optional JSON
- Returns: `research_artifact` with status 'raw'

**POST `/api/research/process/[artifactId]`**
- Triggers AI processing (Phase 3) or manual structuring
- Returns: `research_insight` when complete

**GET `/api/research/artifacts`**
- List with filters: source_type, status, date range
- Pagination support

**GET `/api/research/insights`**
- List with filters: time_horizon, confidence, mapped/unmapped
- Include artifact summary

### 5.3 UI Components

#### 5.3.1 Research Studio

**New Page:** `/research`

**Sections:**
- Research ingestion form (text input, file upload, URL)
- Artifact list (raw, processing, structured)
- Insight list (with mapping status)
- Pre-investment research queue
- Search and filters

#### 5.3.2 Research Mapping UI

**Component:** Research mapping modal/form

**Features:**
- Select hierarchy level and target (thesis/view/strategy/position)
- Choose mapping type (supports/refutes/neutral/exploratory)
- Set confidence
- View existing mappings for insight
- AI suggestions (Phase 3)

### 5.4 Migration Strategy

**Step 1: Create Tables**
- Run migrations for research tables
- No impact on existing data

**Step 2: Build Ingestion**
- Create API endpoints
- Build UI for ingestion
- Manual structuring initially (AI in Phase 3)

**Step 3: Manual Mapping**
- Users manually map research to hierarchy
- Builds training data for Phase 3 AI

---

## 6. Phase 3: AI Integration - Detailed Design

### 6.1 AI Capabilities

#### 6.1.1 Research Summarization

**Input:** `research_artifact.raw_content`  
**Output:** `research_insight.summary`  
**Model:** GPT-4 or Claude (via API)  
**Prompt:** Structured prompt for investment research summarization

**Implementation:**
```typescript
async function summarizeResearch(content: string): Promise<string> {
  const prompt = `Summarize the following investment research, focusing on:
  - Key investment theses and claims
  - Supporting evidence
  - Counterarguments or risks
  - Time horizon implications
  - Confidence indicators
  
  Research content:
  ${content}`;
  
  return await callAI(prompt);
}
```

#### 6.1.2 Claim Extraction

**Input:** `research_artifact.raw_content`  
**Output:** `research_insight.key_claims` (JSONB array)  
**Model:** GPT-4 with structured output

**Output Format:**
```json
[
  {
    "claim": "Inflation will remain elevated due to structural factors",
    "confidence": "high",
    "evidence": ["Supply chain constraints", "Wage pressure"],
    "time_horizon": "medium_term"
  }
]
```

#### 6.1.3 Evidence Classification

**Input:** `research_insight.key_claims`  
**Output:** `research_insight.supporting_evidence`, `research_insight.counter_evidence`  
**Model:** GPT-4 with classification

#### 6.1.4 Hierarchical Classification

**Input:** `research_insight`  
**Output:** Suggested `research_mappings`  
**Model:** GPT-4 with context of existing theses/views

**Context Provided:**
- Existing macro theses (titles, descriptions)
- Existing asset views (titles, narratives)
- Existing strategies (if relevant)

**Output:** Array of suggested mappings with confidence scores

#### 6.1.5 Belief Evaluation

**Input:** `research_insight` + existing `macro_thesis` or `asset_view`  
**Output:** Mapping type (supports/refutes/neutral) + confidence  
**Model:** GPT-4 with comparison logic

### 6.2 AI Infrastructure

#### 6.2.1 Service Layer

**File:** `src/lib/services/ai/research.ts`

**Functions:**
- `summarizeResearch(content: string): Promise<string>`
- `extractClaims(content: string): Promise<Claim[]>`
- `classifyEvidence(claims: Claim[]): Promise<EvidenceClassification>`
- `suggestMappings(insight: ResearchInsight, context: HierarchyContext): Promise<MappingSuggestion[]>`
- `evaluateBelief(insight: ResearchInsight, thesis: MacroThesis | AssetView): Promise<BeliefEvaluation>`

#### 6.2.2 Configuration

**Environment Variables:**
- `AI_PROVIDER`: 'openai' | 'anthropic'
- `AI_API_KEY`: API key
- `AI_MODEL`: Model version (e.g., 'gpt-4', 'claude-3-opus')

**Rate Limiting:**
- Queue system for batch processing
- Retry logic for API failures
- Cost tracking

#### 6.3 Integration Points

**Automatic Processing:**
- On research ingestion: Queue for summarization
- After summarization: Queue for claim extraction
- After claim extraction: Queue for evidence classification
- After classification: Queue for mapping suggestions

**Manual Override:**
- Users can trigger AI processing manually
- Users can edit AI outputs
- Users can reject AI suggestions

**⚠️ Critical AI Framing: Proposals, Not State Transitions**
- **AI outputs are always proposals**, never automatic state transitions
- AI may suggest mappings, classifications, or evaluations, but **human approval is required**
- AI assists with structuring and evaluation, but does not create/retire theses or trigger trades
- Example: AI suggests "This research supports Macro Thesis X" → User reviews and approves/rejects
- **Principle**: AI is assistive and evaluative, not authoritative (per PRD Section 5.7)

### 6.4 Migration Strategy

**Step 1: AI Infrastructure**
- Set up API clients
- Create service layer
- Add configuration

**Step 2: Incremental Rollout**
- Start with summarization only
- Add claim extraction
- Add mapping suggestions
- Add belief evaluation

**Step 3: Hybrid Workflow**
- AI provides suggestions
- Users review and approve
- System learns from corrections

---

## 7. Phase 4: Enhanced Workflows - Detailed Design

### 7.1 First-Class Trigger Model

#### 7.1.1 `workflow_triggers` Table

```sql
CREATE TABLE workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL, -- 'time_based' | 'event_based' | 'rule_based'
  trigger_name text NOT NULL,
  hierarchy_level text NOT NULL, -- 'macro_thesis' | 'asset_view' | 'strategy' | 'position' | 'underlying' | 'account'
  target_id uuid, -- FK to target (thesis/view/strategy/position/etc)
  schedule_cron text, -- For time-based triggers
  event_type text, -- For event-based triggers
  rule_definition jsonb, -- For rule-based triggers
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  next_trigger_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_triggers_type ON workflow_triggers(trigger_type);
CREATE INDEX idx_workflow_triggers_level ON workflow_triggers(hierarchy_level);
CREATE INDEX idx_workflow_triggers_active ON workflow_triggers(is_active);
CREATE INDEX idx_workflow_triggers_next_trigger ON workflow_triggers(next_trigger_at);
```

**Design Decisions:**
- `trigger_type` distinguishes time/event/rule
- `rule_definition` is JSONB for flexibility
- `next_trigger_at` enables efficient querying for time-based triggers
- Supports all hierarchy levels (including underlying/account)

#### 7.1.2 `trigger_executions` Table

```sql
CREATE TABLE trigger_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES workflow_triggers(id) ON DELETE CASCADE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  result text, -- 'triggered' | 'skipped' | 'error'
  triage_record_id uuid REFERENCES triage_records(id) ON DELETE SET NULL,
  error_message text,
  metadata jsonb
);

CREATE INDEX idx_trigger_executions_trigger ON trigger_executions(trigger_id);
CREATE INDEX idx_trigger_executions_executed_at ON trigger_executions(executed_at);
```

**Design Decisions:**
- Links to `triage_records` when trigger produces triage
- `metadata` stores trigger-specific context
- Enables audit trail of trigger execution

### 7.2 Time-Based Triggers

**Examples:**
- Weekly macro thesis review
- Monthly asset view review
- Quarterly strategy review
- Daily position check

**Implementation:**
- Cron job queries `workflow_triggers` where `next_trigger_at <= now()`
- Executes trigger
- Creates triage record if needed
- Updates `next_trigger_at`

### 7.3 Event-Based Triggers

**Examples:**
- Earnings announcement → asset view review
- Major market move → macro thesis review
- Expiry approaching → position review
- State code change → strategy review (already exists, but make explicit)

**Implementation:**
- Event listeners in ingestion/compute pipelines
- Create trigger execution
- Evaluate trigger rules
- Create triage record if needed

### 7.4 Retrospective Analysis

#### 7.4.1 Decision Outcome Tracking

**Enhancement to `blotter_actions`:**
- Users mark decisions as "outcome reviewed"
- Fill in `actual_outcome`
- Compare to `expected_outcome`
- Calculate decision quality metrics

#### 7.4.2 Retrospective Views

**New Page:** `/retrospectives`

**Sections:**
- Decision quality dashboard
- Pattern detection (AI-assisted)
- Bias detection (AI-assisted)
- Performance attribution by thesis/view
- Learning insights

#### 7.4.3 Pattern Detection (AI)

**Input:** Historical `blotter_actions` with outcomes  
**Output:** Detected patterns (e.g., "Decisions made under high volatility tend to underperform")  
**Model:** GPT-4 with analysis prompt

**Implementation:**
- Periodic batch job
- Analyze decision patterns
- Surface insights to users
- Support manual review

### 7.5 Migration Strategy

**Step 1: Create Trigger Tables**
- Migrate existing triage rules to `workflow_triggers`
- Create trigger execution tracking

**Step 2: Time-Based Triggers**
- Add cron job for scheduled triggers
- Migrate existing review schedules

**Step 3: Event-Based Triggers**
- Add event listeners
- Migrate existing implicit triggers

**Step 4: Retrospective Analysis**
- Build outcome tracking UI
- Add pattern detection (AI)
- Build retrospective dashboard

---

## 8. Implementation Guidelines

### 8.1 Backward Compatibility

**Principle:** All new features must be additive and optional.

**Strategies:**
- New tables don't affect existing queries
- New columns are nullable
- New foreign keys are optional
- Existing workflows continue to work
- Gradual migration path for existing data

### 8.2 Testing Strategy

**Unit Tests:**
- New service functions
- AI integration (mocked)
- Data model migrations

**Integration Tests:**
- API endpoints
- UI components
- Workflow end-to-end

**Manual Testing:**
- Existing workflows still work
- New features work independently
- Gradual adoption path

### 8.3 Rollout Plan

**Phase 1:**
- Deploy data model changes
- Deploy UI (hidden behind feature flags)
- Manual testing
- Gradual user adoption

**Phase 2:**
- Deploy research ingestion
- Manual structuring initially
- User feedback
- Iterate on UI

**Phase 3:**
- Deploy AI infrastructure
- Start with summarization only
- Monitor costs and quality
- Expand capabilities incrementally

**Phase 4:**
- Deploy trigger model
- Migrate existing triggers
- Add new trigger types
- Build retrospective views

### 8.4 Risk Mitigation

**Risk: Breaking Existing Functionality**
- Mitigation: Comprehensive testing, feature flags, gradual rollout
- Rollback: Database migrations are reversible, code can be reverted

**Risk: AI Costs**
- Mitigation: Rate limiting, batch processing, cost monitoring
- Fallback: Manual processing always available

**Risk: Data Migration Complexity**
- Mitigation: Optional migrations, no forced data changes
- Fallback: Existing data continues to work without hierarchy links

**Risk: User Adoption**
- Mitigation: Gradual introduction, clear value proposition
- Support: Documentation, training, feedback loops

---

## 9. Success Metrics

### 9.1 Phase 1 Metrics

- Number of macro theses created
- Number of asset views created
- Percentage of strategies linked to hierarchy
- User engagement with hierarchy navigator

### 9.2 Phase 2 Metrics

- Number of research artifacts ingested
- Number of research insights created
- Number of research mappings
- Pre-investment research queue size

### 9.3 Phase 3 Metrics

- AI processing success rate
- AI suggestion acceptance rate
- Time saved vs manual processing
- AI cost per research artifact

### 9.4 Phase 4 Metrics

- Number of active triggers
- Trigger execution success rate
- Decision outcome review rate
- Pattern detection insights generated

---

## 10. Open Questions & Design Decisions

### 10.1 Macro Thesis Structure

**Question:** How detailed should macro theses be? Should they have sub-theses?

**Recommendation:** Start simple (single-level theses). Add hierarchy later if needed.

### 10.2 Asset View Relationship

**Question:** Can one strategy express multiple asset views?

**Recommendation:** Start with one-to-many (asset view → strategies). Add many-to-many later if needed.

### 10.3 Research → Thesis Mapping

**Question:** How to handle research that supports/refutes multiple theses?

**Recommendation:** Many-to-many via `research_mappings` table. One insight can map to multiple theses.

### 10.4 Thesis Evolution

**Question:** How to track thesis changes over time?

**Recommendation:** Start with `updated_at` and `last_reviewed_at`. Add version history later if needed.

### 10.5 Pre-Investment Research

**Question:** Separate workspace or integrate into existing flow?

**Recommendation:** Separate `/research` page initially. Integrate into triage/hierarchy later based on usage.

### 10.6 Decision Confidence

**Question:** How to use confidence levels in triage prioritization?

**Recommendation:** Start with manual confidence. Add AI-assisted confidence scoring in Phase 3.

---

## 11. Next Steps

### Immediate (Week 1-2)

1. **Review and Approve Plan**
   - Stakeholder review
   - Design decision finalization
   - Resource allocation

2. **Phase 1 Kickoff**
   - Create database migration for macro_theses/asset_views
   - Design UI mockups for hierarchy navigator
   - Set up development environment

### Short-Term (Month 1)

1. **Phase 1 Implementation**
   - Complete data model
   - Build basic UI
   - Manual testing
   - User feedback

2. **Phase 2 Planning**
   - Research table design review
   - Ingestion API design
   - UI wireframes

### Medium-Term (Months 2-4)

1. **Phase 2 Implementation**
   - Research infrastructure
   - Ingestion endpoints
   - Manual mapping UI

2. **Phase 3 Planning**
   - AI provider selection
   - Cost analysis
   - Prompt engineering

---

## Appendix A: Database Schema Summary

### New Tables (Phase 1)
- `macro_theses`
- `asset_views`

### Extended Tables (Phase 1)
- `strategies` (add `macro_thesis_id`, `asset_view_id`)
- `blotter_actions` (add decision fields)

### New Tables (Phase 2)
- `research_artifacts`
- `research_insights`
- `research_mappings`

### New Tables (Phase 4)
- `workflow_triggers`
- `trigger_executions`

---

## Appendix B: API Endpoints Summary

### Phase 1
- `GET /api/theses` - List macro theses
- `GET /api/theses/[id]` - Get thesis detail
- `POST /api/theses` - Create thesis
- `PUT /api/theses/[id]` - Update thesis
- `GET /api/asset-views` - List asset views
- `GET /api/asset-views/[id]` - Get view detail
- `POST /api/asset-views` - Create view
- `PUT /api/asset-views/[id]` - Update view

### Phase 2
- `POST /api/research/ingest` - Ingest research
- `POST /api/research/process/[id]` - Process research
- `GET /api/research/artifacts` - List artifacts
- `GET /api/research/insights` - List insights
- `POST /api/research/mappings` - Create mapping
- `DELETE /api/research/mappings/[id]` - Delete mapping

### Phase 4
- `GET /api/triggers` - List triggers
- `POST /api/triggers` - Create trigger
- `PUT /api/triggers/[id]` - Update trigger
- `GET /api/triggers/[id]/executions` - Get trigger executions

---

## Appendix C: UI Pages Summary

### Phase 1
- `/theses` - Macro theses list
- `/theses/[id]` - Thesis detail
- `/asset-views` - Asset views list
- `/asset-views/[id]` - View detail
- `/hierarchy` - Hierarchy navigator (new or integrated)

### Phase 2
- `/research` - Research studio
- `/research/[id]` - Research detail
- `/research/mappings` - Mapping interface

### Phase 4
- `/retrospectives` - Retrospective analysis
- `/triggers` - Trigger management

---

**Document Status:** Ready for review and implementation planning.

