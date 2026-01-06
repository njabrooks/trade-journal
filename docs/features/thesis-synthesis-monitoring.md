# Thesis Synthesis & Monitoring System

**Purpose**: End-state specification for the thesis synthesis and monitoring system
**Status**: Living Specification (implementation tracked in [ACTIVE_ROADMAP.md](../ACTIVE_ROADMAP.md))
**Created**: 2026-01-03
**Last Updated**: 2026-01-06
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
├── Claude synthesizes → coherent investment thesis
├── Claude extracts → validation/invalidation points
├── User refines/approves
└── Output: Articulated thesis + explicit success/failure criteria
    Skill: /synthesize-thesis

LAYER 3: Monitoring & Accountability
├── Validation points → monitoring specifications
├── Two complementary workflows:
│   ├── Top-down assessment: Evaluate new content against validation points
│   │   Skill: /assess-validation-evidence
│   │   See: docs/features/validation-assessment-workflow.md
│   └── Automated monitoring: Scheduled checks of data sources
│       Scripts: monitor-fred-validation.ts, monitor-price-iv-validation.ts, etc.
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
| **Top-down assessment** (`/assess-validation-evidence`) | Validation points + Content → Evidence | User identifies relevant content | Targeted validation check |
| **Automated monitoring** (scheduled scripts) | Data sources → Threshold checks → Alerts | Cron schedule | Proactive surveillance |

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

## Layer 3: Monitoring & Accountability

### 3.1 Monitoring Specifications

**Purpose**: Define what to watch and how for each validation point.

#### Structure

```typescript
interface MonitoringSpec {
  validationPointId: string;

  // Search strategy
  searchStrategy: {
    keywords: string[];
    semanticDescription: string;   // For LLM-based relevance scoring
    sources: string[];             // Specific sites, feeds, APIs
    exclusions: string[];          // Noise to filter
  };

  // Timing
  frequency: 'daily' | 'weekly' | 'on_demand';
  lastChecked?: Date;
  nextCheck?: Date;

  // Alert configuration
  alertThreshold: {
    type: 'metric_condition' | 'relevance_score';
    condition?: string;            // For metrics
    scoreThreshold?: number;       // For relevance (0-1)
  };
}
```

#### Data Sources

| Source Type | Examples | Use Case | Cost |
|-------------|----------|----------|------|
| **FRED Economic Data** | ICSA, UNRATE, CPI, Fed Funds | Macro thesis validation | Free (via OpenBB) |
| **Price/IV Data** | Spot, IV30, IV rank, IV percentile | Asset thesis validation | Free (existing Massive ingestion) |
| **News & SEC Filings** | Finnhub, SEC EDGAR RSS | Company-specific events | Free tier |
| **Manual input** | User observation | Qualitative judgment | N/A |

#### Source-Specific Monitoring Specs

##### FRED Economic Data Monitoring

```typescript
interface FREDMonitoringSpec {
  validationPointId: string;
  source: 'fred';
  series: string[];        // e.g., ['ICSA', 'UNRATE']
  threshold: {
    condition: string;     // e.g., "ICSA > 250000"
    operator: '>' | '<' | '==' | '>=' | '<=';
    value: number;
  };
  frequency: 'daily' | 'weekly';
}
```

**Implementation**: `scripts/monitor-fred-validation.ts`
- Uses OpenBB integration (already configured with FRED API key)
- Python-TypeScript bridge via subprocess
- GitHub Actions cron: daily at 10 AM ET (after FRED releases)

**Example Use Cases**:
- "ICSA > 250,000" → triggers "Labor market deteriorating" invalidation point
- "UNRATE > 5.0" → triggers "Recession risk rising" validation point

##### Price/IV Data Monitoring

```typescript
interface PriceIVMonitoringSpec {
  validationPointId: string;
  source: 'price_iv';
  underlying: string;      // Ticker
  metric: 'spot' | 'iv30' | 'iv_rank' | 'iv_percentile';
  threshold: {
    condition: string;     // e.g., "BTC spot > 100000"
    value: number;
  };
  frequency: 'daily';
}
```

**Implementation**: `scripts/monitor-price-iv-validation.ts`
- Queries existing `underlyings_iv_history` table
- Runs after Massive.com daily ingestion
- GitHub Actions: chains after `massive-ingestion.yml`

**Example Use Cases**:
- "BTC spot > 100000" → validates "Bullish BTC" thesis
- "GLXY IV30 < 40" → invalidates "High volatility persists" point
- "SPY IV rank < 20 for 30 days" → validates "Complacency returns" point

##### News & SEC Filings Monitoring

```typescript
interface NewsMonitoringSpec {
  validationPointId: string;
  source: 'news';
  keywords: string[];          // e.g., ["Galaxy Digital", "crypto regulation"]
  sources: string[];           // e.g., ["finnhub", "sec_edgar"]
  semanticDescription: string; // For LLM relevance scoring
  frequency: 'daily' | 'weekly';
}
```

**Implementation**: `scripts/monitor-news-validation.ts`
- Finnhub API (free tier: 60 calls/min)
- SEC EDGAR RSS feeds
- Claude-powered relevance scoring

**Relevance Scoring**:
```typescript
interface NewsRelevanceScore {
  article: {
    headline: string;
    summary: string;
    source: string;
    publishedAt: Date;
    url: string;
  };
  relevance: number;        // 0-1 score
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;        // Why Claude scored it this way
  suggestedAction: 'assess' | 'record_only' | 'ignore';
}
```

**Auto-Assessment Trigger**: When relevance > 0.7 for a critical validation point, auto-run `/assess-validation-evidence` skill to generate preliminary assessment for user review.

#### Source Credibility Weighting

| Tier | Sources | Weight |
|------|---------|--------|
| Tier 1 | WSJ, Bloomberg, SEC filings, FRED | 1.0x |
| Tier 2 | Reputable industry news (CoinDesk, etc.) | 0.8x |
| Tier 3 | Aggregators, blogs | 0.5x |

User can override via feedback loop.

#### Execution Environment

**Scheduled job via GitHub Actions** connected to Claude Code.

Architecture:
```
GitHub Actions (cron)
    ↓
Trigger Claude Code session
    ↓
Load active monitoring specs
    ↓
Execute searches
    ↓
Filter and score results
    ↓
Update status / create alerts
    ↓
Store results to database
```

Frequency: Start with weekly, move to daily for critical points.

#### Relevance Filtering

Claude's role in filtering:

1. **Semantic relevance** - Not just keyword matching, but "Does this actually relate to the validation point?"
2. **Novelty** - Is this new information or rehash of known facts?
3. **Source credibility** - Weight based on source reputation
4. **Confidence scoring** - 0-1 score for relevance

**TBD through testing**: Source prioritization, noise thresholds, feedback loops.

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
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ News Sources │  │ Data Sources │  │ Filing Sources│          │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤          │
│  │ Yahoo News   │  │ FRED (macro) │  │ SEC EDGAR    │          │
│  │ Google News  │  │ Price/IV     │  │ 8-K filings  │          │
│  │ Finnhub      │  │ (Massive)    │  │ 10-Q/10-K    │          │
│  │ Twitter/X    │  │              │  │ Form 4       │          │
│  │ Perplexity   │  │              │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────┬────┴────────────────┘                   │
│                      ▼                                          │
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
└─────────────────────────────────────────────────────────────────┘
```

#### Source Configuration by Thesis Type

| Thesis Type | Primary Sources | Watch Sources | Schedule |
|-------------|-----------------|---------------|----------|
| **Macro Thesis** (e.g., "US Economic Growth") | FRED data, Fed announcements | Employment reports, CPI releases | Daily + event-triggered |
| **Asset Thesis - Equity** (e.g., "Bullish GLXY") | Yahoo/Google News, Finnhub | SEC filings (8-K, 10-Q), Form 4 | Daily + filing alerts |
| **Asset Thesis - Crypto** (e.g., "Bullish BTC") | CoinDesk, Twitter/X, Perplexity | On-chain metrics, regulatory news | Daily |
| **Asset Thesis - Macro Asset** (e.g., "Bullish Gold") | Bloomberg, FRED | Central bank announcements | Daily + event-triggered |

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
├── /synthesize-thesis
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
- **[Validation Assessment Workflow](validation-assessment-workflow.md)** - Top-down evidence assessment skill documentation
- **[Research Workflow](research-workflow.md)** - Bottom-up claims extraction process

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
