# Thesis Synthesis & Monitoring System

**Purpose**: End-state specification for the thesis synthesis and monitoring system
**Status**: Living Specification (implementation tracked in [ACTIVE_ROADMAP.md](../ACTIVE_ROADMAP.md))
**Created**: 2026-01-03
**Last Updated**: 2026-01-07
**PRD Alignment**: Sections 5.5 (Thesis Evaluation), 5.7 (Role of AI), 6.1 (Triggers), 8 (Institutional Memory)

---

## Executive Summary

This document defines requirements for a thesis synthesis and monitoring system that transforms atomic research claims into articulated investment theses with explicit validation/invalidation criteria, then monitors those criteria over time to ensure accountability and enable learning.

### The Core Problem

The current research workflow produces **claims as inputs** - atomic insights extracted from research with Toulmin structure. These claims get linked to theses, but the theses themselves lack:

1. **Synthesized articulation** - A coherent statement of what we believe and why
2. **Explicit success/failure criteria** - What would validate or invalidate the thesis
3. **Ongoing monitoring** - Tracking whether those criteria are being met
4. **Accountability** - Recording what we actually did vs. what our stated process said to do
5. **Learning feedback** - Post-outcome analysis to improve future theses

### The Vision

Build a system where:
- Claude synthesizes claims into coherent thesis articulations
- Claude extracts explicit validation/invalidation points from those articulations
- Claude monitors news and developments against those points
- The system tracks thesis status and user decisions with full provenance
- Post-outcome analysis enables learning and process improvement

**Key insight**: Claims are inputs, not outputs. The synthesized thesis with validation/invalidation criteria is the output that becomes the standard the user holds themselves accountable to.

---

## Conceptual Model

```
LAYER 1: Evidence Collection
├── Research artifacts → Toulmin claims (bottom-up discovery)
├── Claims assigned to theses by user
└── Output: Structured atomic insights with provenance
    See: docs/features/research-workflow.md

LAYER 2: Thesis Synthesis
├── Input: All claims linked to a thesis
├── Claude synthesizes → coherent investment thesis (Core Argument)
├── Claude extracts → validation/invalidation points
├── User refines/approves
├── UI: Core Argument displayed as primary thesis summary (see Section 2.4)
└── Output: Articulated thesis + explicit success/failure criteria
    Skill: /build-core-argument

LAYER 3: Monitoring & Accountability
├── Thesis-level monitoring config (NOT per-validation-point)
│   ├── Auto-derived keywords from validation point statements
│   ├── Ticker + company name for asset theses
│   └── Explicit thresholds extracted from validation points
├── Two complementary workflows:
│   ├── Top-down assessment: Evaluate new content against ALL validation points
│   │   Skill: /assess-validation-evidence
│   │   See: docs/features/validation-assessment-workflow.md
│   └── Automated monitoring: Thesis-level content aggregation + broad analysis
│       Scripts: daily-thesis-monitoring.ts, monitor-fred-validation.ts
├── Status changes logged with timestamps
├── User actions tracked against stated criteria
└── Output: Living scorecard + decision audit trail

LAYER 4: Learning (FUTURE)
├── Outcomes vs predictions
├── Process adherence analysis
├── Pattern identification
└── Output: Feedback for improving future theses
```

### Workflow Distinction

| Workflow | Direction | Trigger | Use Case |
|----------|-----------|---------|----------|
| **Bottom-up discovery** (`/process-transcript`) | Content → Claims → Theses | New research arrives | Research ingestion |
| **Top-down assessment** (`/assess-validation-evidence`) | Thesis + Content → Evidence for ALL validation points | User identifies relevant content | Targeted validation check |
| **Automated monitoring** (scheduled scripts) | Thesis-level config → Content aggregation → Broad analysis → Triage | Cron schedule | Proactive surveillance |

---

## Layer 2: Thesis Synthesis

### 2.1 Thesis Articulation

**Purpose**: Transform a collection of claims into a coherent, synthesized investment thesis.

#### Input

| Field | Source | Required |
|-------|--------|----------|
| Thesis metadata | `macro_theses` or `asset_theses` table | Yes |
| Linked claims | `main_claims` with full Toulmin structure | Yes |
| Prior articulation | Previous version (for iterative refinement) | No |

#### Output Structure

```typescript
interface ThesisArticulation {
  id: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  version: number;
  createdAt: Date;

  // Core synthesis
  coreArgument: string;        // 1-2 paragraphs: what we believe and why
  keyDrivers: string[];        // 3-5 main factors that would make this play out
  keyAssumptions: string[];    // 3-5 things that must be true for thesis to hold

  // Context
  timeframe: {
    horizon: 'immediate' | 'short_term' | 'medium_term' | 'long_term' | 'secular';
    expectedResolution?: string;  // e.g., "Q2 2026" or "12-18 months"
  };

  // Confidence
  confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
  confidenceRationale: string;

  // Gaps
  evidenceGaps: string[];      // What additional research would strengthen/weaken

  // Provenance
  claimIdsUsed: string[];      // Which claims were synthesized
  generatedBy: 'claude' | 'user';
  userEdits?: string;          // Summary of user modifications

  // Compositional dependencies (discovered during synthesis)
  referencedTheses: ThesisDependency[];  // Other theses this depends on
}

interface ThesisDependency {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  relationship: 'depends_on' | 'supports' | 'contradicts';
  notes?: string;              // How this dependency affects the parent thesis
}
```

#### Compositional Thesis Dependencies

**Design Decision**: Theses are often compositional - a belief in "Bullish US Economic Growth" might depend on beliefs in "Bullish US Tech & AI" and "Bearish US Interest Rates". Rather than forcing users to manually maintain thesis-to-thesis relationships, **Claude discovers these dependencies during the synthesis process**.

**How it works**:
1. When synthesizing an articulation, Claude examines the claims and existing thesis linkages
2. Claude identifies when the thesis logic depends on other theses (often already linked in the hierarchy)
3. These dependencies are captured in `referencedTheses` with the relationship type
4. User reviews and confirms during the interactive refinement

**Benefits**:
- Dependencies emerge naturally from synthesis, not manual configuration
- Claude is better at identifying implicit dependencies than users
- Existing claim-to-thesis linkages provide the raw material for discovery
- User retains control via review/feedback

**Implications for validation points**:
- Validation points can reference dependent theses (see Section 2.2)
- When a dependent thesis is invalidated, parent thesis validation points can trigger
- Enables cascade monitoring without complex hierarchy management

#### Storage Decision

**Versioned storage** via separate `thesis_articulations` table.

Rationale:
- Track how articulation evolves as new claims are added
- Compare versions to see belief evolution
- Maintain provenance of what was believed when
- Low storage cost, high analytical value

#### Regeneration Triggers

**TBD through testing**. Candidates:
- On-demand only (user requests)
- When N new claims are added (threshold TBD)
- When a high-confidence claim is added
- On a schedule (weekly refresh)

Initial implementation: **On-demand only** to establish baseline, then iterate.

#### User Editing

**Hybrid approach**:
- User interacts with Claude to refine
- Claude re-synthesizes based on feedback
- Final output stored with `userEdits` field noting modifications
- Direct editing allowed but flagged as breaking provenance chain

---

### 2.2 Validation/Invalidation Points

**Purpose**: Extract explicit, measurable criteria for thesis success and failure.

#### Output Structure

```typescript
interface ValidationPoint {
  id: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  articulationId: string;      // Link to source articulation

  // Core definition
  type: 'validation' | 'invalidation';
  statement: string;           // What would validate/invalidate
  rationale: string;           // Why this matters to the thesis

  // Classification
  category: 'explicit' | 'judgment_required';
  importance: 'critical' | 'significant' | 'supporting';
  timeframe: 'immediate' | 'medium_term' | 'secular';

  // For explicit points
  explicit?: {
    metric: string;            // What to measure
    threshold: string;         // Condition that triggers
    dataSources: string[];     // Where to get data
    monitoringFrequency: 'daily' | 'weekly' | 'monthly' | 'on_demand';
  };

  // For judgment-required points
  judgment?: {
    observableProxies: string[];   // What to watch
    judgmentCriteria: string;      // How user would decide
    reviewFrequency: 'daily' | 'weekly' | 'monthly';
  };

  // Response protocol
  responseProtocol: {
    description: string;           // What to do if triggered
    linkedStrategies?: string[];   // Strategies to adjust
    escalation?: 'review_thesis' | 'reduce_exposure' | 'exit' | 'increase_exposure';
  };

  // Status tracking
  status: 'not_triggered' | 'monitoring' | 'triggered' | 'superseded';
  statusHistory: StatusUpdate[];

  // Dependent thesis reference (for compositional validation)
  dependentThesis?: {
    thesisId: string;
    thesisType: 'macro' | 'asset';
    condition: 'invalidated' | 'confidence_drops' | 'status_changes';
    conditionDetail?: string;    // e.g., "confidence drops below medium"
  };

  // Provenance
  linkedClaimIds: string[];    // Claims that support this point
  createdAt: Date;
  updatedAt: Date;
}

interface StatusUpdate {
  timestamp: Date;
  previousStatus: string;
  newStatus: string;
  evidence: {
    source: string;
    summary: string;
    link?: string;
  };
  confidence: 'low' | 'medium' | 'high';
  assessedBy: 'claude' | 'user';
  userActionTaken?: string;
}
```

#### Quantity Guidelines

No arbitrary limits. Quality over quantity.

- Claude proposes points based on thesis content
- User approves, rejects, or refines
- Claude pushes back on vague criteria: "You said 'if sentiment shifts' - what would you observe?"
- Final count depends on thesis complexity and available evidence

#### Push for Specificity

Claude should be **firm but not blocking**:

```
GOOD: "For 'regulatory environment becomes hostile', I'd suggest tracking:
enforcement actions per quarter, legislative proposals mentioning crypto,
public statements from SEC/CFTC. Would any of these work as proxies?"

BAD: "I cannot accept 'regulatory environment becomes hostile' as a
validation point because it's too vague."
```

Accept qualitative points but always suggest observable proxies.

#### Response Protocols

Specificity depends on context:

| Importance | Protocol Example |
|------------|------------------|
| Critical | "Exit all linked strategies within 48 hours" |
| Significant | "Reduce exposure by 50%, trigger thesis review" |
| Supporting | "Note for next scheduled review" |

For strategy-level cascading: **Each strategy should have its own reaction function** that references thesis-level validation points. When a thesis validation point triggers, all linked strategies evaluate their reaction functions.

---

### 2.3 The Synthesis Process

**Implementation**: Claude Code skill (hybrid approach)

#### Workflow

```
1. LOAD CONTEXT
   ├── Pull thesis metadata
   ├── Pull all linked claims with full Toulmin structure
   ├── Pull other theses in the hierarchy (for dependency discovery)
   └── Pull prior articulation (if exists)

2. GENERATE DRAFT ARTICULATION
   ├── Synthesize core argument from claims
   ├── Identify key drivers and assumptions
   ├── Assess confidence level
   └── Note evidence gaps

3. DISCOVER COMPOSITIONAL DEPENDENCIES
   ├── Examine claims linked to multiple theses
   ├── Identify when thesis logic depends on other theses
   ├── Check if dependent theses already exist in the system
   └── Propose referencedTheses with relationship types

4. EXTRACT CANDIDATE VALIDATION/INVALIDATION POINTS
   ├── From explicit claims
   ├── From identified assumptions
   ├── From evidence gaps (what would fill them)
   └── From dependent theses (e.g., "If [dependent thesis] is invalidated...")

5. PRESENT TO USER
   ├── "Here's my synthesis..."
   ├── "I notice this thesis depends on your beliefs in [X] and [Y]..."
   ├── "Here are the validation/invalidation points I extracted..."
   └── "What would you change?"

6. REFINE BASED ON FEEDBACK
   ├── User pushes back, Claude adjusts
   ├── Claude challenges vague criteria
   └── Iterate until user approves

7. PUSH FOR SPECIFICITY
   ├── For each judgment-required point
   ├── "What would you observe that tells you X?"
   └── "What sources would you trust?"

8. FINALIZE
   ├── User approves
   ├── Store articulation with version (including referencedTheses)
   ├── Store validation points with provenance (including dependent thesis refs)
   └── Link to source claims
```

#### Mode

**Interactive conversation** (not batch document generation).

Rationale:
- Refinement requires back-and-forth
- User judgment is critical
- Claude can push for specificity in real-time

#### Frequency

**On-demand initially**, with potential for:
- Prompted refresh when new claims added ("Your thesis has 5 new claims since last articulation. Would you like to re-synthesize?")
- Scheduled review reminders based on thesis timeframe

---

### 2.4 UI/UX: Core Argument as Primary Display

**Purpose**: Define how thesis articulation is displayed in the UI, and the relationship between Core Argument and the legacy Summary field.

#### Design Decision: Core Argument Replaces Summary

The thesis detail pages previously had two potentially overlapping text sections:
1. **Summary** (`ai_summary` field) - Generated by `/generate-summary` skill
2. **Thesis Articulation** - Generated by `/build-core-argument` skill, containing Core Argument + Key Drivers + Assumptions + Validation Points

**Problem**: The Core Argument from articulation is essentially a *better* summary because:
- It's distilled from claims (more focused)
- It's part of the accountability framework
- It includes the "because" - causal reasoning
- It's falsifiable and testable

**Solution**: **Core Argument predominates** when an articulation exists.

#### Section Structure

The thesis detail page should have a single **"Core Argument"** section (not separate Summary and Articulation sections):

```
┌─────────────────────────────────────────────────────────────┐
│ CORE ARGUMENT                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Core Argument text from articulation]                      │
│                                                             │
│ OR if no articulation exists:                               │
│ [Legacy ai_summary OR description]                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Generated: [date] • Version [N] • [X] claims synthesized    │
│ ⚠️ [staleness warning if applicable]                        │
└─────────────────────────────────────────────────────────────┘
```

#### Display Priority

1. **If articulation exists**: Show `coreArgument` from latest articulation
2. **If no articulation but `ai_summary` exists**: Show `ai_summary` with note "Run /build-core-argument to create full articulation"
3. **If no articulation and no `ai_summary` but `description` exists**: Show `description`
4. **If nothing exists**: Show prompt to create articulation

#### Articulation Sub-Sections

When an articulation exists, the Core Argument section can expand to show:

```
┌─────────────────────────────────────────────────────────────┐
│ CORE ARGUMENT                                     [Expand ▼]│
├─────────────────────────────────────────────────────────────┤
│ [Core Argument text]                                        │
│                                                             │
│ ▸ Key Drivers (5)                                          │
│ ▸ Key Assumptions (5)                                      │
│ ▸ Evidence Gaps (3)                                        │
│ ▸ Dependencies (1 macro thesis)                            │
│                                                             │
│ Confidence: HIGH • Horizon: medium_term                     │
└─────────────────────────────────────────────────────────────┘
```

#### Validation Points Section

Validation points remain a **separate section** (not merged into Core Argument) because:
- They are the accountability mechanism
- They have their own status tracking
- They need prominent display for monitoring

```
┌─────────────────────────────────────────────────────────────┐
│ VALIDATION POINTS                                (9 total)  │
├─────────────────────────────────────────────────────────────┤
│ ✓ Validation (3)  •  ✗ Invalidation (6)                    │
│                                                             │
│ [ValidationPointsList component]                            │
└─────────────────────────────────────────────────────────────┘
```

#### Staleness Indicators

Show staleness warning on Core Argument when:
- **New claims added**: "⚠️ 5 new claims since last synthesis — consider running /build-core-argument"
- **Age-based**: "⚠️ Articulation is 45 days old — consider reviewing"
- **Validation point triggered**: "⚠️ VP-3 was triggered — thesis may need re-evaluation"

#### Relationship to `/generate-summary` Skill

The `/generate-summary` skill remains available for:
- Quick summaries when you don't want full articulation
- Theses without enough claims for meaningful synthesis
- Generating `ai_summary` field for backwards compatibility

However, once an articulation is created, the Core Argument takes precedence in display.

#### Implementation Notes

**File changes needed**:
- `src/components/asset-theses/AssetThesisDetailSections.tsx`
  - Remove separate "Summary" accordion item
  - Rename "Thesis Articulation" to "Core Argument"
  - Show `coreArgument` from articulation OR fallback to `aiSummary`/`description`
  - Add sub-sections for drivers/assumptions/gaps when expanded

- `src/components/thesis-synthesis/ThesisSynthesisSection.tsx`
  - Update to show Core Argument as primary content
  - Move validation points to separate display

**Database changes**: None required (fields already exist)

---

## Layer 3: Monitoring & Accountability

### 3.1 Thesis-Level Monitoring Configuration

**Purpose**: Define what to watch and how at the thesis level, not per validation point.

#### Design Philosophy: Generic vs Per-Point Specs

**Problem with per-point specs**: If each validation point needs its own monitoring spec (keywords, sources, thresholds), the configuration burden becomes prohibitive:
- 10 validation points × 5 theses = 50 specs to maintain
- Each requires careful keyword selection and threshold tuning
- High friction discourages creating validation points

**Solution: Thesis-level search config + broad analysis**:
- Configure monitoring at the thesis level (one config per thesis)
- Keywords auto-derived from validation point statements + user additions
- When content arrives, run broad analysis against ALL validation points
- Claude determines which points have relevant evidence

```
OLD MODEL (Per-Point):
VP-1 → MonitoringSpec-1 → Source A, Keywords X
VP-2 → MonitoringSpec-2 → Source B, Keywords Y
VP-3 → MonitoringSpec-3 → Source C, Keywords Z

NEW MODEL (Thesis-Level):
Asset Thesis (GLW)
  └── ThesisMonitoringConfig
        ├── ticker: "GLW"
        ├── keywords: [auto-derived from VPs + user additions]
        ├── sources: [fred, price_iv, news, sec_filings]
        │
        └── On content arrival:
              └── /assess-validation-evidence (broad analysis)
                    └── Returns: which VPs have evidence
```

#### Structure

```typescript
interface ThesisMonitoringConfig {
  id: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';

  // Identity (for asset theses)
  ticker?: string;                    // Auto-populated from underlying
  companyName?: string;               // For news search accuracy

  // Search configuration
  searchConfig: {
    // Auto-derived from validation point statements
    derivedKeywords: string[];        // e.g., ["optical revenue", "display glass", "solar"]

    // User-added keywords for better coverage
    additionalKeywords: string[];     // e.g., ["Hemlock", "Gorilla Glass"]

    // Negative keywords to filter noise
    exclusions: string[];             // e.g., ["unrelated-topic"]
  };

  // Data sources to monitor
  sources: {
    fred?: {
      enabled: boolean;
      series: string[];               // e.g., ["ICSA", "UNRATE"] for macro theses
    };
    priceIv?: {
      enabled: boolean;               // Uses ticker from thesis underlying
    };
    news?: {
      enabled: boolean;
      providers: ('finnhub' | 'yahoo' | 'google')[];
    };
    secFilings?: {
      enabled: boolean;
      filingTypes: ('8-K' | '10-Q' | '10-K' | 'Form4')[];
    };
  };

  // Frequency
  frequency: 'daily' | 'weekly';
  lastChecked?: Date;

  // Auto-derived threshold checks (from explicit validation points)
  explicitThresholds: ExplicitThreshold[];

  createdAt: Date;
  updatedAt: Date;
}

interface ExplicitThreshold {
  validationPointId: string;
  source: 'fred' | 'price_iv';
  metric: string;                     // e.g., "ICSA", "spot", "iv30"
  operator: '>' | '<' | '>=' | '<=' | '==';
  value: number;
  description: string;                // Human-readable: "ICSA > 250,000"
}
```

#### Auto-Derivation of Keywords

When a thesis monitoring config is created or updated, keywords are auto-derived:

```typescript
function deriveKeywordsFromValidationPoints(validationPoints: ValidationPoint[]): string[] {
  const keywords = new Set<string>();

  for (const vp of validationPoints) {
    // Extract from statement
    // "Optical segment revenue >$5.4B" → ["optical", "revenue"]
    // "Major customer loss" → ["customer", "loss"]

    // Extract from rationale
    // "Core growth driver for thesis" → []

    // Extract from explicit metrics
    if (vp.explicitDetails?.metric) {
      keywords.add(vp.explicitDetails.metric);
    }

    // Extract from observable proxies
    if (vp.judgmentDetails?.observableProxies) {
      vp.judgmentDetails.observableProxies.forEach(p => keywords.add(p));
    }
  }

  return Array.from(keywords);
}
```

#### Data Sources

| Source Type | Examples | Use Case | Cost |
|-------------|----------|----------|------|
| **FRED Economic Data** | ICSA, UNRATE, CPI, Fed Funds | Macro thesis validation | Free (via OpenBB) |
| **Price/IV Data** | Spot, IV30, IV rank, IV percentile | Asset thesis validation | Free (existing Massive ingestion) |
| **News & SEC Filings** | Finnhub, SEC EDGAR RSS | Company-specific events | Free tier |
| **Manual input** | User observation | Qualitative judgment | N/A |

#### Source-Specific Behavior

##### FRED Economic Data

For macro theses, FRED series can be specified in the config. The monitoring script:
1. Fetches latest values for configured series
2. Checks against `explicitThresholds` from validation points
3. If threshold breached → creates triage record with affected validation point

**Implementation**: `scripts/monitor-fred-validation.ts`
- Uses OpenBB integration (already configured with FRED API key)
- GitHub Actions cron: daily at 10 AM ET (after FRED releases)

##### Price/IV Data

For asset theses, uses the underlying ticker from the thesis. The monitoring script:
1. Queries `underlyings_iv_history` for latest spot/IV
2. Checks against `explicitThresholds` from validation points
3. If threshold breached → creates triage record

**Implementation**: `scripts/monitor-price-iv-validation.ts`
- Queries existing `underlyings_iv_history` table
- GitHub Actions: chains after `massive-ingestion.yml`

##### News & SEC Filings

For all theses, uses ticker + derived keywords for search. The monitoring script:
1. Queries news APIs with thesis keywords
2. Filters by relevance score (Claude-powered semantic analysis)
3. For relevant articles → runs `/assess-validation-evidence` against ALL validation points
4. Creates triage record with affected points

**Implementation**: `scripts/monitor-news-validation.ts`
- Finnhub API (free tier: 60 calls/min)
- SEC EDGAR RSS feeds
- Claude-powered relevance scoring

#### Relevance Scoring

When news/filings are retrieved, Claude scores relevance:

```typescript
interface ContentRelevanceScore {
  content: {
    headline: string;
    summary: string;
    source: string;
    publishedAt: Date;
    url: string;
  };
  relevance: number;        // 0-1 score for thesis overall
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  suggestedAction: 'assess' | 'record_only' | 'ignore';
}
```

**Assessment trigger**: When relevance > 0.7, auto-run `/assess-validation-evidence` to evaluate content against all validation points and identify which are affected.

#### Source Credibility Weighting

| Tier | Sources | Weight |
|------|---------|--------|
| Tier 1 | WSJ, Bloomberg, SEC filings, FRED | 1.0x |
| Tier 2 | Reputable industry news (CoinDesk, etc.) | 0.8x |
| Tier 3 | Aggregators, blogs | 0.5x |

#### Execution Architecture

```
GitHub Actions (cron: daily 6 AM ET)
    ↓
Load active theses with monitoring configs
    ↓
For each thesis:
    ├── Query data sources (FRED, Price/IV, News)
    ├── Check explicit thresholds
    ├── Score news relevance
    └── If relevant content found:
          ├── Run /assess-validation-evidence (broad analysis)
          └── Create thesis triage record
    ↓
Store results to database
```

#### Database Schema

```sql
-- Thesis monitoring configurations (one per thesis)
CREATE TABLE thesis_monitoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),

  -- Search configuration
  ticker TEXT,                        -- For asset theses
  company_name TEXT,
  derived_keywords JSONB DEFAULT '[]',
  additional_keywords JSONB DEFAULT '[]',
  exclusions JSONB DEFAULT '[]',

  -- Source configuration
  sources JSONB NOT NULL DEFAULT '{}',

  -- Explicit thresholds (auto-extracted from validation points)
  explicit_thresholds JSONB DEFAULT '[]',

  -- Frequency
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  last_checked TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (thesis_id, thesis_type)
);

CREATE INDEX idx_thesis_monitoring_thesis ON thesis_monitoring_configs(thesis_id, thesis_type);
CREATE INDEX idx_thesis_monitoring_ticker ON thesis_monitoring_configs(ticker);
```

**Note**: The old `monitoring_specs` table (per validation point) is deprecated. Existing data can be migrated to thesis-level configs.

---

### 3.2 Status Tracking

**Purpose**: Maintain a living record of validation point status over time.

#### Structure

```typescript
interface ValidationStatusRecord {
  id: string;
  validationPointId: string;
  timestamp: Date;

  // Status
  previousStatus: string;
  newStatus: string;

  // Evidence
  evidence: {
    source: string;
    summary: string;
    link?: string;
    rawContent?: string;       // For audit purposes
  };

  // Assessment
  confidence: 'low' | 'medium' | 'high';
  assessedBy: 'claude' | 'user';

  // Action tracking
  userActionRequired: boolean;
  userActionTaken?: string;
  userActionTimestamp?: Date;
}
```

#### Logging Principle

**Everything is logged**:
- Status changes
- "No change" checks (to show monitoring is happening)
- User decisions
- Divergence from stated protocol

---

### 3.3 Decision Audit Trail

**Purpose**: Track what the user actually did vs. what their stated process said they should do.

#### Structure

```typescript
interface DecisionRecord {
  id: string;
  timestamp: Date;

  // Context
  thesisId?: string;
  strategyId?: string;
  validationPointId?: string;

  // Trigger
  triggerType: 'validation_point' | 'playbook' | 'user_discretion' | 'other';
  triggerDescription: string;

  // Process vs. actual
  statedProcessResponse: string;   // What rules said to do
  actualActionTaken: string;       // What was actually done

  // Rationale
  rationale?: string;              // User explanation if diverged
  divergenceAcknowledged: boolean; // Did user explicitly acknowledge divergence?

  // Outcome (filled in later)
  outcome?: {
    timestamp: Date;
    result: string;
    retrospectiveNotes?: string;
  };
}
```

#### The Accountability Loop

This is the **commitment device**:

1. User articulates thesis with validation/invalidation points
2. User specifies response protocols ("If X happens, I will Y")
3. System monitors for X
4. When X happens, system records:
   - What the protocol said to do
   - What the user actually did
   - User's rationale if they diverged
5. When strategy closes, system records outcome
6. Analysis can answer: "Did following the process produce better results than deviating?"

---

### 3.4 Thesis Triage: The Monitoring Inbox

**Purpose**: Extend the existing triage pattern (used for strategies/positions) to macro theses and asset theses. Create a unified inbox where automated monitoring surfaces actionable items for user review.

**PRD Alignment**: Section 6 (Workflow & Triage Engine) - "Triage as inbox/task management layer"

#### Conceptual Model

```
STRATEGY TRIAGE (Existing)
├── Trigger: Position metrics (DTE, size, IV, P&L)
├── Output: Triage records with severity/urgency
└── User action: Review, adjust, close positions

THESIS TRIAGE (New - This Section)
├── Trigger: Monitoring pipeline detects relevant content
├── Output: Thesis triage records with pre-analysis
└── User action: Review AI synthesis, update validation point status
```

#### The Daily Monitoring Pipeline

For each active thesis (macro or asset), the system runs a **daily aggregation pipeline**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY MONITORING PIPELINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────┐     ┌──────────────────────┐        │
│  │ PERPLEXITY SEARCH     │     │ STRUCTURED DATA      │        │
│  │ (Primary Discovery)   │     │ (Quantitative)       │        │
│  ├───────────────────────┤     ├──────────────────────┤        │
│  │ • News (all sources)  │     │ • FRED (macro)       │        │
│  │ • SEC filings         │     │ • Price/IV (Massive) │        │
│  │ • Earnings coverage   │     │                      │        │
│  │ • Analyst opinions    │     │                      │        │
│  │ • Regulatory news     │     │                      │        │
│  │ • Industry blogs      │     │                      │        │
│  └──────────┬────────────┘     └──────────┬───────────┘        │
│             │                             │                     │
│             └──────────┬──────────────────┘                     │
│                        ▼                                        │
│         ┌────────────────────────┐                             │
│         │ Relevance Filtering    │                             │
│         │ (Claude scoring 0-1)   │                             │
│         └───────────┬────────────┘                             │
│                     ▼                                          │
│         ┌────────────────────────┐                             │
│         │ /assess-validation-    │                             │
│         │  evidence skill        │                             │
│         │ (auto-triggered)       │                             │
│         └───────────┬────────────┘                             │
│                     ▼                                          │
│         ┌────────────────────────┐                             │
│         │ Generate Thesis        │                             │
│         │ Triage Record          │                             │
│         └────────────────────────┘                             │
│                                                                  │
│  Note: SEC EDGAR RSS and Finnhub available as contingencies     │
│  if Perplexity coverage validation reveals gaps.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Source Configuration by Thesis Type

| Thesis Type | Perplexity Query Focus | Structured Data | Schedule |
|-------------|------------------------|-----------------|----------|
| **Macro Thesis** (e.g., "US Economic Growth") | Fed announcements, employment news, inflation data | FRED (ICSA, UNRATE, CPI) | Daily 6 AM ET |
| **Asset Thesis - Equity** (e.g., "Bullish GLW") | Company news, SEC filings, earnings, analyst ratings | Price/IV (Massive) | Daily 6 AM ET |
| **Asset Thesis - Crypto** (e.g., "Bullish BTC") | Protocol news, regulatory, institutional adoption | Price (CoinGecko via Perplexity) | Daily 6 AM ET |
| **Asset Thesis - Macro Asset** (e.g., "Bullish Gold") | Central bank, geopolitical, ETF flows | FRED (yields, dollar index) | Daily 6 AM ET |

#### Thesis Triage Record Structure

```typescript
interface ThesisTriageRecord {
  id: string;
  createdAt: Date;

  // Thesis context
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;

  // Trigger source
  triggerType: 'scheduled_monitoring' | 'filing_alert' | 'data_release' | 'manual';
  triggerSource: string;           // e.g., "daily_news_scan", "sec_8k_alert", "fred_release"

  // Aggregated content
  contentSummary: {
    totalItemsScanned: number;
    relevantItemsFound: number;
    sources: string[];             // Which sources contributed
    dateRange: { from: Date; to: Date };
  };

  // AI analysis (from /assess-validation-evidence)
  aiAnalysis: {
    assessmentId: string;          // Link to full assessment report
    summary: string;               // 2-3 sentence executive summary
    validationPointsAffected: {
      pointId: string;
      pointStatement: string;
      evidenceType: 'strong_validation' | 'weak_validation' | 'neutral' | 'weak_invalidation' | 'strong_invalidation';
      confidence: 'high' | 'medium' | 'low';
      recommendedAction: string;
    }[];
    keyFindings: string[];         // Bullet points
    suggestedNextSteps: string[];
  };

  // Triage classification
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient';

  // User action tracking
  status: 'pending' | 'in_review' | 'actioned' | 'dismissed';
  userNotes?: string;
  actionsTaken?: {
    timestamp: Date;
    action: string;
    validationPointUpdates?: { pointId: string; newStatus: string }[];
  }[];

  // Link to detailed assessment
  assessmentReportPath?: string;   // Path to full markdown report
}
```

#### Severity/Urgency Classification

| Evidence Type | Importance | Severity | Urgency |
|---------------|------------|----------|---------|
| Strong invalidation | Critical | **critical** | immediate |
| Strong invalidation | Significant | high | today |
| Strong validation | Critical | high | today |
| Weak invalidation | Critical | high | this_week |
| Strong validation | Significant | medium | this_week |
| Weak validation/invalidation | Supporting | low | when_convenient |
| Neutral/No evidence | Any | info | when_convenient |

#### User Workflow

```
1. USER OPENS TRIAGE DASHBOARD
   ├── See unified inbox: Strategy triage + Thesis triage
   ├── Filter by thesis, severity, urgency
   └── Sort by most recent or most urgent

2. USER SELECTS THESIS TRIAGE RECORD
   ├── View executive summary (AI-generated)
   ├── See affected validation points with evidence type
   ├── Expand to view full assessment report
   └── See source links for verification

3. USER TAKES ACTION
   ├── Option A: Accept AI recommendation
   │   └── One-click update validation point status
   ├── Option B: Modify and accept
   │   └── Edit status/notes, then save
   ├── Option C: Investigate further
   │   └── Click source links, run manual /assess-validation-evidence
   └── Option D: Dismiss
       └── Mark as dismissed with optional note

4. SYSTEM RECORDS
   ├── All actions logged to audit trail
   ├── Validation point status updated
   └── Triage record marked as actioned
```

#### Implementation: Scheduled Jobs

**Daily News Monitoring** (`scripts/daily-thesis-monitoring.ts`):
```typescript
// GitHub Actions: 6 AM ET daily
async function runDailyThesisMonitoring() {
  // 1. Load all active theses with their validation points
  const theses = await loadActiveTheses();

  for (const thesis of theses) {
    // 2. Query all configured sources for this thesis
    const content = await aggregateSources(thesis);

    // 3. Filter by relevance (Claude scoring)
    const relevant = await filterByRelevance(content, thesis.validationPoints);

    if (relevant.length > 0) {
      // 4. Run /assess-validation-evidence on relevant content
      const assessment = await runAssessment(thesis, relevant);

      // 5. Generate triage record
      await createThesisTriageRecord({
        thesis,
        content: relevant,
        assessment,
        triggerType: 'scheduled_monitoring',
        triggerSource: 'daily_news_scan'
      });
    }
  }
}
```

**Watch Scripts** (event-triggered):
```typescript
// SEC Filing Watcher - runs every 15 minutes
async function watchSECFilings() {
  const newFilings = await checkSECEdgarRSS();

  for (const filing of newFilings) {
    // Find asset theses for this ticker
    const theses = await findThesesByTicker(filing.ticker);

    for (const thesis of theses) {
      // High-priority filing: auto-assess and create triage
      if (filing.type === '8-K' || filing.type === '10-Q') {
        const assessment = await runAssessment(thesis, [filing]);
        await createThesisTriageRecord({
          thesis,
          content: [filing],
          assessment,
          triggerType: 'filing_alert',
          triggerSource: `sec_${filing.type.toLowerCase()}`
        });
      }
    }
  }
}

// FRED Data Watcher - runs after FRED releases (10 AM ET)
async function watchFREDReleases() {
  const releases = await checkFREDReleases();

  for (const release of releases) {
    // Find macro theses that monitor this series
    const theses = await findThesesByFREDSeries(release.series);

    for (const thesis of theses) {
      // Check if any thresholds are triggered
      const triggered = await evaluateThresholds(thesis, release);

      if (triggered.length > 0) {
        await createThesisTriageRecord({
          thesis,
          content: [release],
          assessment: { triggered },
          triggerType: 'data_release',
          triggerSource: `fred_${release.series}`
        });
      }
    }
  }
}
```

#### Database Schema Addition

```sql
-- Thesis triage records (parallel to existing triage_records for strategies)
CREATE TABLE thesis_triage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Thesis context
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),

  -- Trigger
  trigger_type TEXT NOT NULL,
  trigger_source TEXT NOT NULL,

  -- Content summary
  content_summary JSONB NOT NULL,

  -- AI analysis
  ai_analysis JSONB NOT NULL,
  assessment_report_path TEXT,

  -- Classification
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  urgency TEXT NOT NULL CHECK (urgency IN ('immediate', 'today', 'this_week', 'when_convenient')),

  -- User action
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'actioned', 'dismissed')),
  user_notes TEXT,
  actions_taken JSONB DEFAULT '[]',

  -- Timestamps
  reviewed_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ
);

CREATE INDEX idx_thesis_triage_thesis ON thesis_triage_records(thesis_id, thesis_type);
CREATE INDEX idx_thesis_triage_status ON thesis_triage_records(status);
CREATE INDEX idx_thesis_triage_severity ON thesis_triage_records(severity, urgency);
CREATE INDEX idx_thesis_triage_created ON thesis_triage_records(created_at DESC);
```

#### Hybrid Workflow: Automated + Manual

The system supports both automated and manual triggers:

| Trigger | Source | AI Analysis | User Action |
|---------|--------|-------------|-------------|
| **Automated - Scheduled** | Daily news scan | Full `/assess-validation-evidence` | Review and approve |
| **Automated - Event** | SEC filing, FRED release | Full `/assess-validation-evidence` | Review and approve |
| **Manual - User discovers content** | User browses internet | User triggers `/assess-validation-evidence` | Review and document |
| **Manual - Quick note** | User observation | None (user writes directly) | Document immediately |

For manual discoveries, user can:
1. Run `/assess-validation-evidence` from Claude Code with the URL/content
2. System creates triage record with the assessment
3. User reviews in app and updates validation points

This creates a **complete capture system**: nothing falls through the cracks whether discovered by automation or by the user browsing manually.

---

#### Content Source Implementation Guide

**Purpose**: Detailed implementation specifications for each content source in the monitoring pipeline.

##### Architecture: Perplexity + Structured Data

**Key Insight**: Perplexity Search API provides superior coverage at minimal cost (~$1-3/month) compared to integrating multiple free sources. The architecture is:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMPLIFIED MONITORING ARCHITECTURE            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐     ┌──────────────────────┐         │
│  │ PERPLEXITY SEARCH    │     │ STRUCTURED DATA      │         │
│  │ (Primary Discovery)  │     │ (Quantitative)       │         │
│  ├──────────────────────┤     ├──────────────────────┤         │
│  │ • News (all sources) │     │ • FRED (macro)       │         │
│  │ • SEC filings*       │     │ • Price/IV (Massive) │         │
│  │ • Earnings coverage  │     │                      │         │
│  │ • Analyst opinions   │     │                      │         │
│  │ • Regulatory news    │     │                      │         │
│  │ • Industry blogs     │     │                      │         │
│  └──────────┬───────────┘     └──────────┬───────────┘         │
│             │                            │                      │
│             └──────────┬─────────────────┘                      │
│                        ▼                                        │
│         ┌────────────────────────┐                             │
│         │ Claude Analysis        │                             │
│         │ (Relevance + Evidence) │                             │
│         └───────────┬────────────┘                             │
│                     ▼                                          │
│         ┌────────────────────────┐                             │
│         │ Thesis Triage Record   │                             │
│         └────────────────────────┘                             │
│                                                                  │
│  * SEC filing coverage via Perplexity requires validation       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why Perplexity over multiple free sources:**

| Factor | Multiple Free Sources | Perplexity |
|--------|----------------------|------------|
| Integration complexity | 4-5 APIs to maintain | 1 API |
| Coverage breadth | Source-specific gaps | Indexes everything |
| Deduplication | Required across sources | Built-in |
| Cost | Free but dev time | ~$1-3/month |
| Non-consensus signals | Limited to indexed sources | Broad web coverage |
| Citations/transparency | Varies by source | Always included |

##### Implementation Phases

| Phase | Sources | Complexity | Value | Status |
|-------|---------|------------|-------|--------|
| **A** | Price/IV (existing), FRED API | Low | High | ✅ Built |
| **B** | Perplexity Search API | Low | Very High | ✅ Built |
| **C** | SEC EDGAR RSS (contingency) | Medium | High | If needed |
| **D** | Finnhub (contingency) | Low | Medium | If needed |

**Phase B is complete.** Phases C-D are contingencies if Perplexity coverage proves insufficient.

---

##### Phase A: Quantitative Data Sources ✅

**Already Implemented** in `daily-thesis-monitoring.ts`:

**1. Price/IV Data** (existing `underlyings_iv_history` table)
```typescript
// Source: Massive.com daily ingestion (already running)
// Data: spot, iv30, atr20, rv20
// Schedule: Daily after Massive ingestion (~4:30 PM ET)
// Implementation: Query underlyings_iv_history for latest values

async function checkPriceIvThresholds(config: ThesisMonitoringConfig) {
  const latest = await db.select()
    .from(underlyingsIvHistory)
    .where(eq(underlyingsIvHistory.ticker, config.ticker))
    .orderBy(desc(underlyingsIvHistory.asOfDate))
    .limit(1);

  // Evaluate explicit thresholds from config
  for (const threshold of config.explicitThresholds) {
    if (threshold.source === 'price_iv') {
      const value = threshold.metric === 'spot' ? latest.spot : latest.iv30;
      if (evaluateThreshold(threshold, value)) {
        // Threshold breached!
      }
    }
  }
}
```

**2. FRED Economic Data** (direct API)
```typescript
// Source: FRED API (free, 120 requests/minute)
// API Key: FRED_API_KEY in .env.local
// Data: Any FRED series (ICSA, UNRATE, CPI, Fed Funds, etc.)
// Schedule: Daily at 10 AM ET (after FRED releases)

async function getFredLatestValue(series: string): Promise<number | null> {
  const url = `https://api.stlouisfed.org/fred/series/observations?` +
    `series_id=${series}&api_key=${process.env.FRED_API_KEY}` +
    `&file_type=json&sort_order=desc&limit=1`;

  const response = await fetch(url);
  const data = await response.json();
  return parseFloat(data.observations[0].value);
}

// Common macro thesis series:
const MACRO_SERIES = {
  'ICSA': 'Initial Claims (Weekly)',
  'UNRATE': 'Unemployment Rate (Monthly)',
  'CPIAUCSL': 'CPI All Items (Monthly)',
  'FEDFUNDS': 'Fed Funds Rate (Daily)',
  'DGS10': '10-Year Treasury Yield (Daily)',
  'T10Y2Y': 'Yield Curve 10Y-2Y (Daily)',
  'BAMLH0A0HYM2': 'HY Credit Spread (Daily)',
};
```

---

##### Phase B: Perplexity Search API ✅ IMPLEMENTED

**Status**: Fully implemented in `scripts/daily-thesis-monitoring.ts`

**Perplexity Search API** (not Sonar) is the primary discovery layer because:
- **Raw results**: Returns URLs, titles, snippets (2K tokens each), dates - not LLM summaries
- **Breadth**: Indexes everything (Reuters, WSJ, SEC filings, niche blogs, crypto sources)
- **Multi-query**: Up to 5 queries per single API call → 5x efficiency
- **Recency filter**: Built-in `search_recency_filter: 'day'` for last 24 hours
- **Cost**: $5/1,000 requests (flat, no token costs) → ~$0.60/month with batching
- **Non-consensus signals**: Catches early litigation, regulatory drafts, trade-press M&A chatter

```typescript
// API Documentation: https://docs.perplexity.ai/api-reference/search-post
// Endpoint: POST https://api.perplexity.ai/search
// Pricing: $5 per 1,000 requests (NO token costs)
// API Key: PERPLEXITY_API_KEY in .env.local

interface PerplexitySearchResult {
  url: string;               // Source link
  title: string;             // Page title
  snippet: string;           // 2K tokens of extracted content
  date?: string;             // Publication date
  lastUpdated?: string;      // Modification timestamp
}

interface PerplexityBatchOptions {
  maxResultsPerQuery?: number;    // 1-20, default 5
  maxTokensPerPage?: number;      // Content per result, default 2048
  recencyFilter?: 'day' | 'week' | 'month' | 'year';
  country?: string;               // ISO 3166-1 alpha-2 (e.g., 'US')
}

async function searchPerplexityBatch(
  queries: string[],  // Up to 5 queries per call
  options: PerplexityBatchOptions = {}
): Promise<{ results: PerplexitySearchResult[]; id: string }> {
  const response = await fetch('https://api.perplexity.ai/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: queries.length === 1 ? queries[0] : queries,  // String or array
      max_results: options.maxResultsPerQuery * queries.length,
      max_tokens_per_page: options.maxTokensPerPage || 2048,
      search_recency_filter: options.recencyFilter || 'day',
      country: options.country || 'US',
    }),
  });

  const data = await response.json();
  return { results: data.results, id: data.id };
}
```

**Multi-Query Batching Strategy** (Strategy B - Implemented):

```typescript
// ✅ IMPLEMENTED: Batch up to 5 theses per API call
// 20 theses ÷ 5 per batch = 4 requests/day → ~$0.60/month

// Flow:
// 1. Group theses into batches of 5
// 2. Build keyword-based query for each thesis
// 3. Execute single API call with query array
// 4. Match results back to theses via scoring

const BATCH_SIZE = 5;
for (let i = 0; i < contexts.length; i += BATCH_SIZE) {
  const batch = contexts.slice(i, i + BATCH_SIZE);
  const queries = batch.map(ctx => ctx.query);

  // Single API call for 5 theses
  const response = await searchPerplexityBatch(queries, {
    maxResultsPerQuery: 5,
    recencyFilter: 'day',
  });

  // Match flat results back to theses
  const matches = matchResultsToTheses(response.results, batch);
}
```

##### Query Design Principles

**DISCOVERY-FIRST APPROACH** (Updated 2026-01-06 based on empirical testing):

Perplexity Search API uses **semantic relevance ranking**, not boolean AND matching. Testing (`test-perplexity-query-styles.ts`) revealed:

| Query Style | Results | Overlap with Simple |
|-------------|---------|---------------------|
| `"Corning Inc GLW news"` (simple) | 10 | - |
| `"Corning Inc GLW optical display glass hemlock solar news"` (complex) | 10 | **Only 4/10** |

**Key Finding**: More keywords don't filter results—they **shift relevance ranking** toward those topics. Complex queries may miss important general news (M&A, regulatory, earnings surprises).

**Recommended Approach**:

| Thesis Type | Query Strategy | Example |
|-------------|----------------|---------|
| **Asset thesis** | Simple: Company + ticker + "news" | `"Corning Inc GLW news"` |
| **Macro thesis** | 2-3 keywords + "news" (no ticker to anchor) | `"Fed interest rates policy news"` |

**Why Simple Queries for Asset Theses**:
- Cast wide net for ALL company news
- Let result-matching algorithm filter by thesis relevance
- Catch unexpected developments (litigation, regulatory, M&A)
- Keywords used for **scoring**, not **discovery**

**Query Examples**:

```typescript
// Asset thesis for GLW (SIMPLE):
"Corning Inc GLW news"

// Macro thesis for Fed policy (needs keywords):
"Fed interest rates policy news"

// Crypto asset thesis (SIMPLE):
"Galaxy Digital GLXY news"
```

##### Keyword Sources (for Result Matching, NOT Query Building)

Keywords are used to **score and match** results back to theses, not to build queries:

| Source | Purpose | Example |
|--------|---------|---------|
| **Ticker** | High-weight matching (score +10) | "GLW" |
| **Company name** | High-weight matching (score +8) | "Corning Inc" |
| **derivedKeywords** | Medium-weight matching (score +2 each) | ["optical", "revenue", "display"] |
| **additionalKeywords** | Medium-weight matching | ["Hemlock", "Gorilla Glass"] |

**Keyword extraction from validation points** (used for matching):

```typescript
// Validation point: "Optical segment revenue >$5.4B"
// Derived keywords for matching: ["optical", "segment", "revenue"]

// Validation point: "Major customer loss (Apple, Samsung)"
// Derived keywords for matching: ["customer", "loss", "apple", "samsung"]
```

##### Result-to-Thesis Matching

Since multi-query returns a **flat array** (not grouped by query), we score each result against each thesis:

```typescript
function scoreResultMatch(result, context): { score: number; keywords: string[] } {
  let score = 0;
  const searchText = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();

  // Ticker match: +10 points
  if (searchText.includes(context.ticker.toLowerCase())) score += 10;

  // Company name match: +8 points
  if (searchText.includes(context.companyName.toLowerCase())) score += 8;

  // Each keyword match: +2 points (max 5 keywords)
  for (const keyword of context.keywords.slice(0, 5)) {
    if (searchText.includes(keyword.toLowerCase())) score += 2;
  }

  // Recency bonus (within 3 days): +3 points
  if (isRecentDate(result.date, 3)) score += 3;

  return { score, keywords: matchedKeywords };
}

// Minimum score threshold: 5 (at least ticker OR 2+ keywords)
```

##### Configuring a Thesis for Monitoring

**1. In the database** (`thesis_monitoring_configs` table):

```sql
INSERT INTO thesis_monitoring_configs (
  thesis_id, thesis_type, ticker, company_name,
  search_config, sources, enabled
) VALUES (
  'uuid-of-thesis', 'asset', 'GLW', 'Corning Inc',
  '{
    "derivedKeywords": ["optical", "display", "glass"],
    "additionalKeywords": ["Hemlock", "Gorilla Glass", "solar"],
    "exclusions": []
  }',
  '{
    "news": { "enabled": true, "providers": ["perplexity"] },
    "priceIv": { "enabled": true },
    "secFilings": { "enabled": true }
  }',
  true
);
```

**2. Generated query**: `"Corning Inc GLW optical display glass hemlock solar news"`

**3. Result**: API returns URLs, titles, snippets matching this query

##### Cost Breakdown

| Theses | Batches/Day | Requests/Month | Cost/Month |
|--------|-------------|----------------|------------|
| 5 | 1 | 30 | $0.15 |
| 10 | 2 | 60 | $0.30 |
| 20 | 4 | 120 | $0.60 |
| 50 | 10 | 300 | $1.50 |

**vs. Alternative approaches**:
- Sonar (LLM summaries): $5/1K + $1-15/1M tokens → ~$3-10/month
- Multiple free APIs: $0 but 4-5 integrations to maintain

---

##### OLD: Query Building (Deprecated)

**Note**: The following was the original Sonar-based approach. Keeping for reference but **do not use**.

```typescript
// DEPRECATED: Sonar approach (LLM summaries)
// Now using Search API (raw results) instead

// Example thesis-specific query (old style):
function buildThesisQuery(config: ThesisMonitoringConfig): string {
  const keywords = [
    ...config.searchConfig.derivedKeywords,
    ...config.searchConfig.additionalKeywords,
  ].join(', ');

  const exclusions = config.searchConfig.exclusions.length > 0
    ? `Exclude: ${config.searchConfig.exclusions.join(', ')}.`
    : '';

  return `
    What are the latest news and developments for ${config.companyName} (${config.ticker})
    in the last 24 hours?

    Focus on: ${keywords}, SEC filings, earnings, analyst ratings, material events.
    ${exclusions}

    Provide specific facts with sources. Include any SEC filings (8-K, 10-Q, 10-K, Form 4).
  `;
}
```

**Integration Pattern**:

```typescript
async function monitorThesisWithPerplexity(config: ThesisMonitoringConfig) {
  // 1. Build targeted query
  const query = buildThesisQuery(config);

  // 2. Search Perplexity
  const result = await searchPerplexity(query);

  // 3. Claude relevance scoring (if content returned)
  if (result.content && result.content.length > 100) {
    const scored = await scoreRelevance([{
      source: 'perplexity',
      type: 'aggregated_news',
      title: `Daily scan: ${config.ticker}`,
      content: result.content,
      citations: result.citations,
      publishedAt: new Date(),
    }], config.validationPoints);

    // 4. For high-relevance items, create triage record
    if (scored.relevance > 0.5) {
      await createThesisTriageRecord({
        thesis: config,
        content: result,
        assessment: scored,
        triggerType: 'scheduled_monitoring',
        triggerSource: 'perplexity_daily_scan',
      });
    }
  }
}
```

---

##### Perplexity Coverage Validation

**Before relying on Perplexity as the sole discovery layer**, validate coverage for each source type:

| Source Type | Validation Test | Expected Coverage | Contingency if Gap |
|-------------|-----------------|-------------------|-------------------|
| **Major news** (WSJ, Reuters, Bloomberg) | Query recent GLW/GLXY news, verify WSJ/Reuters citations | High | None needed |
| **SEC 8-K filings** | Query "SEC 8-K [ticker] [recent date]", verify EDGAR links | Medium-High* | Phase C: SEC EDGAR RSS |
| **SEC 10-Q/10-K** | Query quarterly report filings | Medium-High* | Phase C: SEC EDGAR RSS |
| **Form 4 (insider trades)** | Query "insider trading [ticker]" | Medium | Phase C: SEC EDGAR RSS |
| **Earnings coverage** | Query post-earnings, verify coverage of call highlights | High | Manual transcript paste |
| **Analyst ratings** | Query "analyst rating upgrade downgrade [ticker]" | Medium-High | Phase D: Finnhub ratings |
| **Crypto news** | Query protocol/exchange news | High | None needed |
| **Regulatory/litigation** | Query regulatory actions, lawsuits | High | None needed |
| **Niche/trade press** | Query industry-specific topics | High (key advantage) | None needed |

**\* SEC filings note**: Perplexity indexes SEC filings but may have latency. For time-sensitive 8-K alerts (material events), consider SEC EDGAR RSS as supplement.

**Validation Procedure**:

```bash
# Run this validation script before production deployment
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/validate-perplexity-coverage.ts
```

```typescript
// scripts/validate-perplexity-coverage.ts
const validationTests = [
  {
    name: 'SEC 8-K coverage',
    query: 'SEC 8-K filing Corning GLW January 2026',
    expectedCitation: 'sec.gov',
    threshold: 0.8,  // 80% of tests should return SEC citations
  },
  {
    name: 'Major news coverage',
    query: 'Corning GLW news Reuters WSJ January 2026',
    expectedCitation: ['reuters.com', 'wsj.com'],
    threshold: 0.9,
  },
  // ... more tests
];

// If any test fails threshold → enable corresponding contingency phase
```

---

##### Phase C: SEC EDGAR RSS (Contingency)

**When to enable**: If Perplexity validation shows <80% SEC filing coverage OR >4 hour latency on material filings.

**SEC EDGAR** provides real-time filing alerts via RSS feeds:

```typescript
// RSS Feeds:
// - Company filings: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={type}&dateb=&owner=include&count=40&output=atom
// - All recent filings: https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&count=40&output=atom

// Key filing types to monitor:
// 8-K  - Material events (earnings, leadership changes, acquisitions)
// 10-Q - Quarterly reports
// 10-K - Annual reports
// Form 4 - Insider trading

import Parser from 'rss-parser';

interface SECFiling {
  ticker: string;
  cik: string;
  filingType: string;
  title: string;
  link: string;
  filedAt: Date;
}

async function checkSECFilings(ticker: string, cik: string): Promise<SECFiling[]> {
  const parser = new Parser();
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?` +
    `action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=10&output=atom`;

  const feed = await parser.parseURL(url);

  return feed.items.map(item => ({
    ticker,
    cik,
    filingType: extractFilingType(item.title),
    title: item.title,
    link: item.link,
    filedAt: new Date(item.pubDate),
  }));
}

// Schedule: Every 15 minutes during market hours
// Trigger: New 8-K or 10-Q → immediate triage record
```

**CIK Lookup**: SEC uses CIK numbers, not tickers. Store mapping in `underlyings` table:
```sql
ALTER TABLE underlyings ADD COLUMN sec_cik TEXT;
-- Example: GLW → 0000024741
```

---

##### Phase D: Finnhub (Contingency)

**When to enable**: If Perplexity validation shows gaps in real-time news or analyst ratings.

**Finnhub** provides:
- Company news (60 calls/minute free tier)
- Analyst recommendations
- Earnings calendar

```typescript
// API Documentation: https://finnhub.io/docs/api/company-news
// Rate Limit: 60 calls/minute (free tier)
// API Key: FINNHUB_API_KEY in .env.local

async function fetchFinnhubNews(ticker: string, fromDate: Date): Promise<FinnhubNewsItem[]> {
  const from = fromDate.toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];

  const url = `https://finnhub.io/api/v1/company-news?` +
    `symbol=${ticker}&from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`;

  const response = await fetch(url);
  return response.json();
}

// Also useful: Analyst recommendations
async function fetchAnalystRatings(ticker: string): Promise<AnalystRating[]> {
  const url = `https://finnhub.io/api/v1/stock/recommendation?` +
    `symbol=${ticker}&token=${process.env.FINNHUB_API_KEY}`;

  const response = await fetch(url);
  return response.json();
}
```

**Use as supplement to Perplexity** when:
- Need real-time news alerts (Perplexity may have latency)
- Want structured analyst rating changes (easier to parse than natural language)

---

##### AI Analysis Layer

All content flows through Claude for relevance scoring and evidence assessment:

```typescript
interface ContentItem {
  source: 'finnhub' | 'sec' | 'fred' | 'google' | 'perplexity';
  type: 'news' | 'filing' | 'data_release' | 'transcript';
  title: string;
  content: string;
  url?: string;
  publishedAt: Date;
  rawData?: unknown;
}

interface RelevanceScore {
  item: ContentItem;
  relevance: number;              // 0-1
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  affectedValidationPoints: string[];  // Point IDs
  suggestedAction: 'full_assessment' | 'record_only' | 'ignore';
}

async function scoreContentRelevance(
  content: ContentItem[],
  thesis: ThesisWithValidationPoints
): Promise<RelevanceScore[]> {
  // Claude prompt: Given thesis + validation points + content items,
  // score each item's relevance and identify affected VPs

  const prompt = `
You are analyzing content for relevance to an investment thesis.

THESIS: ${thesis.title}
VALIDATION POINTS:
${thesis.validationPoints.map(vp => `- ${vp.id}: ${vp.statement}`).join('\n')}

CONTENT TO ANALYZE:
${content.map((c, i) => `[${i}] ${c.title}\n${c.content.slice(0, 500)}...`).join('\n\n')}

For each content item, provide:
1. Relevance score (0-1)
2. Which validation points it might affect
3. Recommended action (full_assessment / record_only / ignore)

Respond in JSON format.
`;

  // Call Claude API
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseScores(response.content);
}
```

---

##### Triage Record Generation

When relevant content is found, create a thesis triage record:

```typescript
async function createThesisTriageRecord(params: {
  thesis: Thesis;
  content: ContentItem[];
  assessment: AssessmentResult;
  triggerType: string;
  triggerSource: string;
}): Promise<void> {
  const { thesis, content, assessment, triggerType, triggerSource } = params;

  // Determine severity based on validation point importance + evidence type
  const severity = calculateSeverity(assessment);
  const urgency = calculateUrgency(assessment);

  await db.insert(thesisTriageRecords).values({
    thesisId: thesis.id,
    thesisType: thesis.type,
    triggerType,
    triggerSource,
    contentSummary: {
      totalItemsScanned: content.length,
      relevantItemsFound: assessment.relevantItems.length,
      sources: [...new Set(content.map(c => c.source))],
      dateRange: { from: content[0].publishedAt, to: content[content.length-1].publishedAt },
    },
    aiAnalysis: {
      summary: assessment.executiveSummary,
      validationPointsAffected: assessment.affectedPoints,
      keyFindings: assessment.keyFindings,
      suggestedNextSteps: assessment.suggestedActions,
    },
    severity,
    urgency,
    status: 'pending',
  });

  // Also store full assessment report as markdown file
  const reportPath = await storeAssessmentReport(assessment);
  // Update record with report path
}
```

---

##### Implementation Timeline

```
Week 1: Phase B - Perplexity Integration + Validation
├── Day 1-2: Setup
│   ├── Add PERPLEXITY_API_KEY to env
│   ├── Implement searchPerplexity() function
│   └── Add to daily-thesis-monitoring.ts
│
├── Day 3-4: Coverage Validation
│   ├── Create validate-perplexity-coverage.ts script
│   ├── Run validation tests for each source type
│   ├── Document gaps (if any)
│   └── Decision: Enable contingency phases or proceed
│
├── Day 5: Integration
│   ├── Implement buildThesisQuery() with batching
│   ├── Add Claude relevance scoring layer
│   ├── Create triage records for high-relevance items
│   └── Test with GLW thesis end-to-end

Week 2: Polish + Contingencies (if needed)
├── If SEC coverage gap → Implement Phase C (SEC EDGAR RSS)
├── If analyst ratings gap → Implement Phase D (Finnhub)
├── Add GitHub Action for daily monitoring
└── Monitor cost and adjust batching

Week 3+: Iterate based on real usage
├── Tune relevance thresholds
├── Expand to additional theses
└── Add UI for triage review
```

**Cost Projection**:
- Perplexity: ~$1-3/month (3-5 queries/day × 30 days = 90-150 requests)
- Claude analysis: ~$1-2/month (relevance scoring on flagged items)
- **Total**: ~$2-5/month for comprehensive monitoring

---

#### Success Metrics

- [ ] Automated monitoring catches 80%+ of relevant developments
- [ ] Average daily triage review time < 10 minutes
- [ ] False positive rate < 20% (manageable noise)
- [ ] 100% of validation point status changes have linked triage records (full provenance)
- [ ] User can trace any thesis status back to source content

---

## Technical Architecture

### Database Schema Additions

```sql
-- Thesis articulations (versioned)
CREATE TABLE thesis_articulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),
  version INTEGER NOT NULL DEFAULT 1,

  -- Core synthesis
  core_argument TEXT NOT NULL,
  key_drivers JSONB NOT NULL DEFAULT '[]',
  key_assumptions JSONB NOT NULL DEFAULT '[]',

  -- Context
  timeframe JSONB NOT NULL,
  confidence_level TEXT NOT NULL,
  confidence_rationale TEXT,
  evidence_gaps JSONB DEFAULT '[]',

  -- Provenance
  claim_ids_used JSONB NOT NULL DEFAULT '[]',
  generated_by TEXT NOT NULL CHECK (generated_by IN ('claude', 'user')),
  user_edits TEXT,

  -- Compositional dependencies (discovered during synthesis)
  referenced_theses JSONB DEFAULT '[]',
  -- Array of: { thesis_id, thesis_type, thesis_title, relationship, notes }

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (thesis_id, thesis_type, version)
);

-- Validation/invalidation points
CREATE TABLE validation_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),
  articulation_id UUID REFERENCES thesis_articulations(id),

  -- Core definition
  type TEXT NOT NULL CHECK (type IN ('validation', 'invalidation')),
  statement TEXT NOT NULL,
  rationale TEXT,

  -- Classification
  category TEXT NOT NULL CHECK (category IN ('explicit', 'judgment_required')),
  importance TEXT NOT NULL CHECK (importance IN ('critical', 'significant', 'supporting')),
  timeframe TEXT NOT NULL CHECK (timeframe IN ('immediate', 'medium_term', 'secular')),

  -- Category-specific details
  explicit_details JSONB,      -- metric, threshold, data_sources, monitoring_frequency
  judgment_details JSONB,      -- observable_proxies, judgment_criteria, review_frequency

  -- Response protocol
  response_protocol JSONB NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'not_triggered'
    CHECK (status IN ('not_triggered', 'monitoring', 'triggered', 'superseded')),

  -- Dependent thesis reference (for compositional validation)
  dependent_thesis_id UUID,
  dependent_thesis_type TEXT,
  dependent_thesis_condition TEXT,  -- 'invalidated', 'confidence_drops', 'status_changes'
  dependent_thesis_condition_detail TEXT,

  -- Provenance
  linked_claim_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monitoring specifications
CREATE TABLE monitoring_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_point_id UUID NOT NULL REFERENCES validation_points(id),

  -- Search strategy
  keywords JSONB NOT NULL DEFAULT '[]',
  semantic_description TEXT,
  sources JSONB DEFAULT '[]',
  exclusions JSONB DEFAULT '[]',

  -- Timing
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'on_demand')),
  last_checked TIMESTAMPTZ,
  next_check TIMESTAMPTZ,

  -- Alert configuration
  alert_threshold JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation status history
CREATE TABLE validation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_point_id UUID NOT NULL REFERENCES validation_points(id),

  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_status TEXT,
  new_status TEXT NOT NULL,

  -- Evidence
  evidence JSONB NOT NULL,

  -- Assessment
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  assessed_by TEXT NOT NULL CHECK (assessed_by IN ('claude', 'user')),

  -- Action tracking
  user_action_required BOOLEAN DEFAULT false,
  user_action_taken TEXT,
  user_action_timestamp TIMESTAMPTZ
);

-- Decision audit trail
CREATE TABLE decision_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Context
  thesis_id UUID,
  thesis_type TEXT,
  strategy_id UUID,
  validation_point_id UUID REFERENCES validation_points(id),

  -- Trigger
  trigger_type TEXT NOT NULL,
  trigger_description TEXT NOT NULL,

  -- Process vs. actual
  stated_process_response TEXT NOT NULL,
  actual_action_taken TEXT NOT NULL,
  rationale TEXT,
  divergence_acknowledged BOOLEAN DEFAULT false,

  -- Outcome (updated later)
  outcome JSONB
);

-- Indexes
CREATE INDEX idx_articulations_thesis ON thesis_articulations(thesis_id, thesis_type);
CREATE INDEX idx_validation_points_thesis ON validation_points(thesis_id, thesis_type);
CREATE INDEX idx_validation_points_status ON validation_points(status);
CREATE INDEX idx_monitoring_specs_next_check ON monitoring_specs(next_check);
CREATE INDEX idx_status_history_point ON validation_status_history(validation_point_id);
CREATE INDEX idx_decision_audit_thesis ON decision_audit_log(thesis_id, thesis_type);
CREATE INDEX idx_decision_audit_strategy ON decision_audit_log(strategy_id);
```

### Component Architecture

```
CLAUDE CODE SKILLS (Heavy Processing)
├── /build-core-argument
│   ├── Load thesis + claims
│   ├── Generate articulation
│   ├── Extract validation points
│   ├── Interactive refinement
│   └── Store to database
│
├── /monitor-theses (scheduled)
│   ├── Load active monitoring specs
│   ├── Execute searches
│   ├── Score relevance
│   ├── Update status
│   └── Create alerts
│
└── /analyze-outcome
    ├── Load strategy outcome
    ├── Compare to thesis predictions
    ├── Analyze process adherence
    └── Generate insights

IN-APP UI (Display & Light Interaction)
├── Thesis detail page
│   ├── Articulation display (latest version)
│   ├── Version history toggle
│   ├── Validation points list
│   └── Status scorecard
│
├── Validation point detail
│   ├── Status timeline
│   ├── Evidence log
│   └── Manual status update
│
├── Monitoring dashboard
│   ├── Points requiring attention
│   ├── Recent status changes
│   └── Upcoming reviews
│
└── Decision audit view
    ├── Process adherence metrics
    ├── Divergence log
    └── Outcome attribution

SCHEDULED JOBS (GitHub Actions)
├── Daily/weekly monitoring runs
├── Trigger Claude Code session
└── Store results to database
```

---

## Open Questions

### To Resolve Through Testing

| Question | Options | Resolution Approach |
|----------|---------|---------------------|
| Regeneration triggers | On-demand / N claims / schedule | Start on-demand, add triggers based on user feedback |
| Monitoring frequency | Daily / weekly per point | Start weekly for all, adjust based on timeframe |
| Relevance threshold | Numeric score (0-1) | Calibrate through initial runs |
| Push aggressiveness | Firm / gentle / blocking | Start firm, soften if user friction |
| Source prioritization | Weighted list / equal | Build initial list, weight through experience |

### Design Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage model | Versioned tables | Track evolution, low cost |
| Editing model | Hybrid (Claude + user) | Maintain provenance while allowing refinement |
| Validation point limits | No arbitrary limit | Quality over quantity, user decides |
| Response protocol specificity | Context-dependent | Critical = specific, supporting = general |
| Strategy cascading | Per-strategy reaction functions | Each strategy evaluates its own response |
| Execution environment | Claude Code + GitHub Actions | Leverage existing infrastructure |
| MVP scope | Manual monitoring | Get core loop working first |

---

## Success Criteria

### MVP Success

- [ ] User can generate thesis articulation from claims in <5 minutes
- [ ] Validation points capture key assumptions and falsifiability criteria
- [ ] User can manually update status with evidence in <1 minute
- [ ] Full audit trail shows status history and linked decisions
- [ ] User reports feeling "accountable" to their stated process

### Phase 2 Success

- [ ] Automated monitoring catches 80%+ of relevant developments
- [ ] False positive rate <20% (noise is manageable)
- [ ] User spends <10 minutes/week reviewing monitoring results
- [ ] Alerts surface issues before user would have noticed manually

### Long-term Success

- [ ] User can answer: "Did I follow my process?"
- [ ] User can answer: "Did following my process produce better results?"
- [ ] Thesis quality improves measurably over time
- [ ] System surfaces insights user wouldn't have found otherwise

---

## Related Documents

### End-State Specifications
- **[Validation Assessment Workflow](260105-validation-assessment-workflow.md)** - Top-down evidence assessment skill documentation
- **[Research Workflow](251231-research-workflow.md)** - Bottom-up claims extraction process

### Task Tracking
- **[ACTIVE_ROADMAP.md](../ACTIVE_ROADMAP.md)** - Implementation status and task breakdown (Phase 3.x)

### Context
- **[PRD v1.1](../PRD_v1.1.md)** - Product vision (Sections 5.5, 5.7, 6.1, 8)
- **[FUTURE_ENHANCEMENTS.md](../FUTURE_ENHANCEMENTS.md)** - Enhancement registry
- **[System Architecture](../system_architecture_transition_plan.md)** - Technical implementation context

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-03 | Claude + User | Initial requirements draft |
| 2026-01-04 | Claude + User | Expanded News & Narratives with detailed implementation strategy, database schema, relevance scoring design, and cost structure |
| 2026-01-06 | Claude + User | Consolidated as end-state spec: removed implementation roadmap (now in ACTIVE_ROADMAP.md), added workflow distinction table, merged monitoring specs from phase3_2_continuation.md, added validation-assessment-workflow reference |
| 2026-01-06 | Claude + User | Added Section 3.4 Thesis Triage: extended PRD triage pattern to macro/asset theses with daily monitoring pipeline, multi-source aggregation (Yahoo News, Google News, Finnhub, Twitter, Perplexity, FRED, SEC EDGAR), ThesisTriageRecord schema, severity/urgency classification, and Layer 4 learning integration |
| 2026-01-07 | Claude + User | **Major update**: (1) Section 2.4 UI/UX - Core Argument replaces Summary as primary display, with display priority and staleness indicators; (2) Section 3.1 rewritten - thesis-level monitoring config replaces per-validation-point specs, reducing configuration burden; (3) Updated conceptual model to reflect thesis-level monitoring approach |
| 2026-01-07 | Claude + User | **Architecture simplification**: Perplexity Search API as primary discovery layer (~$1-3/month) replacing multi-source approach (Finnhub, SEC EDGAR, Google, Yahoo). Added coverage validation matrix, batching strategy, and contingency plans for SEC EDGAR/Finnhub if Perplexity gaps discovered. Updated pipeline diagrams and implementation timeline. |
| 2026-01-06 | Claude + User | **Phase B Implemented**: Perplexity Search API integration complete in `daily-thesis-monitoring.ts`. Using Search API (not Sonar) with multi-query batching (5 queries per call), recency filtering, and result-to-thesis matching via scoring. Cost: ~$0.60/month for 20 theses. Added detailed query design documentation including keyword sourcing, query structure, and scoring algorithm. |
| 2026-01-06 | Claude + User | **Query Design Update**: Empirical testing (`test-perplexity-query-styles.ts`) revealed complex queries shift ranking rather than filter. Simple queries ("Company TICKER news") for asset theses catch more general news. Keywords now used for result-matching scoring, not query building. Updated spec Section 3.4 and `daily-thesis-monitoring.ts`. |
| 2026-01-06 | Claude + User | **Analysis Pipeline Complete**: Full implementation of Claude relevance scoring, validation point matching, and triage record creation in `daily-thesis-monitoring.ts`. Tested with GLW thesis - 8 unique results (dual-query), AI analysis, VP matching, triage record ce75989d created with low/when_convenient classification. Schema `thesis_triage_records` migrated. |
