---
name: synthesize-thesis
description: Synthesize linked claims into a coherent thesis articulation with explicit validation/invalidation criteria. Creates versioned articulations with provenance tracking. Use when thesis has accumulated claims and needs formal articulation.
allowed-tools: Bash, Read, Write
---

# Synthesize Thesis Skill

## Purpose

Transform a collection of linked claims into a **thesis articulation** - a coherent, synthesized investment thesis with explicit validation/invalidation criteria. This skill:

1. **Synthesizes claims** into a unified core argument with key drivers and assumptions
2. **Extracts validation/invalidation points** - explicit, measurable criteria for thesis success/failure
3. **Discovers compositional dependencies** - identifies when thesis depends on other theses
4. **Pushes for specificity** - challenges vague criteria with observable proxies
5. **Creates versioned storage** - tracks how articulations evolve over time

This is **Layer 2** of the Thesis Synthesis & Monitoring System (see `docs/features/thesis-synthesis-monitoring.md`).

## Key Distinction

| generate-summary | synthesize-thesis |
|------------------|-------------------|
| Creates narrative summary | Creates structured articulation |
| 2-3 paragraphs of prose | Core argument + drivers + assumptions |
| No explicit success criteria | Validation/invalidation points |
| For quick reference | For accountability and monitoring |
| Stored in `ai_summary` field | Stored in `thesis_articulations` table |

Use `generate-summary` for quick overviews. Use `synthesize-thesis` when you want to commit to explicit success/failure criteria.

## Workflow

```
INPUT: Thesis ID or Ticker + (optional) prior articulation version
  |
STEP 1: Load thesis + all linked claims with full Toulmin structure
  |
STEP 2: Generate draft articulation (core argument, drivers, assumptions)
  |
STEP 3: Discover compositional dependencies (thesis-to-thesis relationships)
  |
STEP 4: Extract validation/invalidation points from articulation
  |
STEP 5: Interactive refinement with user
  |
STEP 6: Push for specificity on judgment-required points
  |
STEP 7: Store articulation + validation points with provenance
  |
OUTPUT: Versioned articulation in database, confirmation to user
```

## Instructions

### Step 0: Environment Setup

```bash
set -a
source .env.local
set +a
```

### Step 1: Load Context

Get the thesis with all linked claims AND other theses in the hierarchy (for dependency discovery).

**For Asset Thesis:**

```sql
WITH thesis_data AS (
  SELECT
    at.id,
    at.title,
    at.description,
    at.narrative,
    at.confidence_level,
    at.time_horizon,
    at.direction,
    at.fundamental_context,
    at.positioning_context,
    at.regime_context,
    u.ticker,
    u.spot,
    mt.id as parent_macro_thesis_id,
    mt.title as parent_macro_thesis_title,
    mt.description as parent_macro_thesis_description
  FROM asset_theses at
  LEFT JOIN underlyings u ON at.underlying_id = u.id
  LEFT JOIN macro_theses mt ON at.macro_thesis_id = mt.id
  WHERE at.id = '[THESIS_ID]' OR u.ticker = '[TICKER]'
),
linked_claims AS (
  SELECT
    mc.id,
    mc.title as claim_title,
    mc.claim,
    mc.evidence,
    mc.reasoning,
    mc.backing,
    mc.qualifier,
    mc.rebuttal,
    mc.category,
    mc.time_horizon,
    mc.relevant_tickers,
    ctm.mapping_type,
    ctm.confidence as mapping_confidence,
    ri.title as source_title,
    ra.source_type
  FROM claim_thesis_mappings ctm
  INNER JOIN main_claims mc ON ctm.main_claim_id = mc.id
  LEFT JOIN research_insights ri ON mc.source_insight_id = ri.id
  LEFT JOIN research_artifacts ra ON ri.research_artifact_id = ra.id
  WHERE ctm.asset_thesis_id = (SELECT id FROM thesis_data)
  ORDER BY
    CASE ctm.mapping_type
      WHEN 'foundation' THEN 1
      WHEN 'supports' THEN 2
      WHEN 'refutes' THEN 3
    END,
    mc.created_at DESC
),
sibling_theses AS (
  -- Other asset theses under same macro thesis (for dependency discovery)
  SELECT
    at.id,
    at.title,
    at.description,
    u.ticker,
    'asset' as thesis_type
  FROM asset_theses at
  LEFT JOIN underlyings u ON at.underlying_id = u.id
  WHERE at.macro_thesis_id = (SELECT parent_macro_thesis_id FROM thesis_data)
    AND at.id != (SELECT id FROM thesis_data)
    AND at.status = 'active'
),
prior_articulation AS (
  SELECT
    ta.*
  FROM thesis_articulations ta
  WHERE ta.thesis_id = (SELECT id FROM thesis_data)
    AND ta.thesis_type = 'asset'
  ORDER BY ta.version DESC
  LIMIT 1
)
SELECT
  td.*,
  json_agg(DISTINCT lc.*) FILTER (WHERE lc.id IS NOT NULL) as claims,
  json_agg(DISTINCT st.*) FILTER (WHERE st.id IS NOT NULL) as sibling_theses,
  (SELECT row_to_json(pa.*) FROM prior_articulation pa) as prior_articulation
FROM thesis_data td
LEFT JOIN linked_claims lc ON TRUE
LEFT JOIN sibling_theses st ON TRUE
GROUP BY td.id, td.title, td.description, td.narrative, td.confidence_level,
         td.time_horizon, td.direction, td.fundamental_context,
         td.positioning_context, td.regime_context, td.ticker, td.spot,
         td.parent_macro_thesis_id, td.parent_macro_thesis_title,
         td.parent_macro_thesis_description;
```

Execute via:
```bash
npx tsx scripts/psql-query.ts "<QUERY>" --format json
```

### Step 2: Generate Draft Articulation

Using the loaded data, synthesize a draft articulation. Follow this structure:

---

#### 2.1 Core Argument (2-4 sentences)

**Objective**: Distill all claims into a single, coherent investment thesis.

**Synthesis Process**:
1. Identify the **central insight** that connects all claims
2. State it as a clear, falsifiable assertion
3. Include the "because" - the logical chain from evidence to conclusion
4. Be specific about direction, magnitude, and timeframe

**Good vs Bad**:

❌ BAD: "NVDA is well-positioned to benefit from AI growth."
- Vague, unfalsifiable, no specific insight

✅ GOOD: "NVIDIA will maintain 80%+ datacenter GPU share through 2026 because CUDA's 15-year ecosystem lock-in creates switching costs that hyperscaler custom chips cannot overcome within 2-3 year development cycles, despite Google allocating 60% of internal workloads to TPUs."
- Specific (80% share, 2026 timeframe)
- Causal mechanism (CUDA lock-in, switching costs)
- Acknowledges counter-evidence (TPU adoption)
- Falsifiable (can measure share in 2026)

---

#### 2.2 Key Drivers (3-5 factors)

**Objective**: Identify the main factors that would make this thesis play out.

**For each driver**:
- State it as a condition, not a prediction
- Link to specific claims that support it
- Be concrete about what "success" looks like

**Example**:
```
1. CUDA ecosystem retention rate remains >90%
   (Supported by: Claim 3 - Developer survey showing 94% preferring CUDA)

2. Hyperscaler custom chip performance gap narrows slower than expected
   (Supported by: Claim 7 - Google TPU 4 benchmark still 30% slower on transformer inference)

3. Enterprise AI adoption accelerates, expanding total market
   (Supported by: Claims 2, 5 - Enterprise deployment surveys)
```

---

#### 2.3 Key Assumptions (3-5 assumptions)

**Objective**: Surface the implicit beliefs that must be true for the thesis to hold.

**Critical**: These become the source of validation/invalidation points. Be ruthlessly honest about what you're assuming.

**Types of assumptions**:
- **Market assumptions**: Competition, pricing power, market size
- **Execution assumptions**: Company can deliver on roadmap
- **Macro assumptions**: Economic conditions, regulatory environment
- **Technical assumptions**: Technology trajectory, adoption curves

**Example**:
```
1. NVIDIA continues to out-execute on chip development cycle
   (Implicit in Claim 1 - assumes Blackwell ships on time)

2. Hyperscalers don't vertically integrate training AND inference
   (Implied by Claim 7 - currently only inference is threatened)

3. Total AI compute demand grows faster than custom chip capacity
   (Assumption in Claim 2 - market expansion thesis)
```

---

#### 2.4 Confidence Assessment

**Objective**: Honest assessment of evidence quality and gaps.

**Components**:
- **Level**: low / medium / high / very_high
- **Rationale**: 2-3 sentences explaining the rating
- **Evidence gaps**: What additional research would change confidence?

**Confidence should reflect**:
- Quality of supporting claims (not just quantity)
- Strength of counter-evidence
- Testability of key assumptions
- Time horizon (longer = more uncertainty)

---

#### 2.5 Timeframe

**Objective**: When do you expect resolution?

**Components**:
- **Horizon**: immediate / short_term / medium_term / long_term / secular
- **Expected resolution**: Specific date or range (e.g., "Q2 2026", "12-18 months")
- **Key milestone dates**: Catalyst dates that will test the thesis

---

### Step 3: Discover Compositional Dependencies

**Objective**: Identify when this thesis logically depends on other theses.

**Check for**:
1. **Parent macro thesis**: Does the asset thesis assume the macro thesis is correct?
2. **Sibling theses**: Does this thesis assume related asset theses succeed/fail?
3. **Implied theses**: Does the evidence imply beliefs not yet formalized as theses?

**Relationship types**:
- `depends_on`: This thesis requires the other to be true
- `supports`: This thesis provides evidence for the other
- `contradicts`: This thesis is in tension with the other

**Example output**:
```
Referenced Theses:
1. "AI Infrastructure Build-Out" (macro) - DEPENDS_ON
   Notes: NVDA dominance thesis assumes AI infrastructure spending continues at current trajectory

2. "Hyperscaler Vertical Integration" (asset: GOOGL) - CONTRADICTS
   Notes: If Google's TPU thesis plays out aggressively, NVDA share thesis is threatened
```

**Present to user**: "I notice this thesis appears to depend on [X]. Does that match your thinking?"

---

### Step 4: Extract Validation/Invalidation Points

This is the core accountability mechanism. Extract explicit, measurable criteria for thesis success and failure.

---

#### 4.1 Types of Points

**Validation Points**: What would prove the thesis RIGHT?
**Invalidation Points**: What would prove the thesis WRONG?

**Categories**:

| Category | Description | Example |
|----------|-------------|---------|
| `explicit` | Measurable, observable | "NVDA datacenter share drops below 70%" |
| `judgment_required` | Needs interpretation | "Developer sentiment shifts away from CUDA" |

---

#### 4.2 Extraction Sources

Look for validation/invalidation criteria in:

1. **Key assumptions** → Each assumption can be inverted to create an invalidation point
2. **Key drivers** → Each driver can be tested
3. **Rebutting claims** → Counter-evidence suggests what would prove thesis wrong
4. **Confidence gaps** → What data would fill gaps?
5. **Dependent theses** → If dependent thesis is invalidated, parent should be reviewed

---

#### 4.3 Point Structure

For each validation/invalidation point:

```typescript
{
  type: 'validation' | 'invalidation',
  statement: string,      // Clear, testable criterion
  rationale: string,      // Why this matters to the thesis
  category: 'explicit' | 'judgment_required',
  importance: 'critical' | 'significant' | 'supporting',
  timeframe: 'immediate' | 'medium_term' | 'secular',

  // For explicit points:
  explicit?: {
    metric: string,
    threshold: string,
    dataSources: string[],
    monitoringFrequency: 'daily' | 'weekly' | 'monthly' | 'on_demand'
  },

  // For judgment-required points:
  judgment?: {
    observableProxies: string[],
    judgmentCriteria: string,
    reviewFrequency: 'daily' | 'weekly' | 'monthly'
  },

  // Response protocol:
  responseProtocol: {
    description: string,
    escalation: 'review_thesis' | 'reduce_exposure' | 'exit' | 'increase_exposure'
  },

  // If this point depends on another thesis:
  dependentThesis?: {
    thesisId: string,
    thesisType: 'macro' | 'asset',
    condition: 'invalidated' | 'confidence_drops' | 'status_changes'
  },

  linkedClaimIds: string[]  // Which claims support this point
}
```

---

#### 4.4 Quality Standards

**Good validation/invalidation points**:
- Specific and measurable (or have clear observable proxies)
- Linked to key assumptions or drivers
- Have defined response protocols
- Include timeframe for monitoring

**Examples**:

✅ GOOD (explicit):
```
Type: invalidation
Statement: NVIDIA datacenter revenue share drops below 70% for 2 consecutive quarters
Rationale: Core thesis is dominance; below 70% suggests moat is eroding
Category: explicit
Importance: critical
Metric: Datacenter GPU market share (Mercury Research)
Threshold: <70% for 2 consecutive quarters
Data Sources: Mercury Research quarterly reports, NVDA earnings
Monitoring: quarterly
Response: Exit all NVDA-related strategies within 30 days
```

✅ GOOD (judgment_required):
```
Type: invalidation
Statement: Major developer ecosystem shifts away from CUDA
Rationale: CUDA lock-in is key moat; developer migration would undermine thesis
Category: judgment_required
Importance: critical
Observable Proxies:
  - GitHub star trends: PyTorch with ROCm vs CUDA
  - Developer survey sentiment (Stack Overflow, JetBrains)
  - Major framework announcements (native AMD/Intel support)
Judgment Criteria: Clear trend in 2+ proxies over 6 months
Review Frequency: monthly
Response: Trigger full thesis re-evaluation
```

❌ BAD:
```
Statement: "Competition increases"
Rationale: More competition is bad
```
- Too vague, not measurable
- What competition? From whom? How would you know?

---

### Step 5: Interactive Refinement

Present the draft to the user and iterate:

```
## Draft Thesis Articulation: [THESIS TITLE]

### Core Argument
[2-4 sentences]

### Key Drivers
1. [Driver 1]
2. [Driver 2]
...

### Key Assumptions
1. [Assumption 1]
2. [Assumption 2]
...

### Confidence
Level: [level]
Rationale: [2-3 sentences]
Evidence Gaps: [list]

### Timeframe
Horizon: [horizon]
Expected Resolution: [date/range]

### Compositional Dependencies
[List of referenced theses with relationship types]

### Validation Points
[List with full structure]

### Invalidation Points
[List with full structure]

---

**What would you change?**
- Core argument too broad/narrow?
- Missing key drivers or assumptions?
- Validation points too vague or too specific?
- Dependency relationships I missed?
```

**Refinement loop**:
1. User provides feedback
2. Adjust articulation based on feedback
3. Present updated version
4. Repeat until user approves

---

### Step 6: Push for Specificity

For each `judgment_required` point, challenge the user to make it more concrete:

**Firm but not blocking**:

```
For the point "Developer sentiment shifts away from CUDA":

I've suggested these observable proxies:
- GitHub star trends
- Developer survey sentiment
- Major framework announcements

You could make this more actionable by specifying:
1. What specific change in stars/survey would trigger this?
2. Which frameworks count as "major"?
3. What's the review cadence?

Would you like to add thresholds, or keep this as a judgment call reviewed monthly?
```

**Accept qualitative points** but always suggest observable proxies. The goal is accountability, not false precision.

---

### Step 7: Store Articulation and Validation Points

Once user approves, store to database.

**IMPORTANT: Use TypeScript Script for Complex Insertions**

Due to shell escaping issues with complex JSONB data containing quotes, parentheses, and special characters, **always use a temporary TypeScript script** for insertions rather than raw SQL via psql.

**Create a temporary script** (e.g., `scripts/insert-thesis-articulation-temp.ts`):

```typescript
import { db, closeDb, schema } from './lib/db.js';

const { thesisArticulations, validationPoints } = schema;

async function main() {
  const thesisId = '[THESIS_ID]';

  // Insert articulation
  const [articulation] = await db.insert(thesisArticulations).values({
    thesisId,
    thesisType: 'asset', // or 'macro'
    version: 1, // Will auto-increment if using proper version logic
    coreArgument: `[CORE_ARGUMENT_TEXT]`,

    // IMPORTANT: keyDrivers must be array of objects with 'driver' and 'detail' keys
    keyDrivers: [
      {
        driver: "Driver title here",
        detail: "Detailed explanation of the driver",
        supporting_claims: ["claim-uuid-1", "claim-uuid-2"]
      },
      // ... more drivers
    ],

    // IMPORTANT: keyAssumptions must be array of objects with 'assumption' and 'detail' keys
    keyAssumptions: [
      {
        assumption: "Assumption title here",
        detail: "Detailed explanation of the assumption"
      },
      // ... more assumptions
    ],

    // timeframe is an object
    timeframe: {
      horizon: "medium_term", // immediate | short_term | medium_term | long_term | secular
      expectedResolution: "Q4 2026 - Q2 2027",
      keyMilestones: [
        "May 2025: Nasdaq uplisting (COMPLETED)",
        "H1 2026: First phase online"
      ]
    },

    confidenceLevel: 'high', // low | medium | high | very_high
    confidenceRationale: `[RATIONALE_TEXT]`,
    evidenceGaps: ["Gap 1", "Gap 2"],
    claimIdsUsed: ["uuid-1", "uuid-2"], // Array of claim UUIDs
    generatedBy: 'claude',
    userEdits: '[USER_EDIT_NOTES]',

    // IMPORTANT: referencedTheses uses 'title' not 'thesisTitle'
    referencedTheses: [
      {
        thesisId: "uuid-of-referenced-thesis",
        thesisType: "macro", // or 'asset'
        title: "Referenced Thesis Title", // Use 'title' not 'thesisTitle'
        relationship: "depends_on", // depends_on | supports | contradicts
        notes: "Explanation of the dependency"
      }
    ]
  }).returning();

  console.log('✅ Articulation created:', articulation.id);

  // Insert validation points
  const points = await db.insert(validationPoints).values([
    {
      thesisId,
      thesisType: 'asset',
      articulationId: articulation.id,
      type: 'validation', // or 'invalidation'
      statement: '[STATEMENT]',
      rationale: '[RATIONALE]',
      category: 'explicit', // or 'judgment_required'
      importance: 'critical', // critical | significant | supporting
      timeframe: 'medium_term', // immediate | medium_term | secular
      explicitDetails: {
        metric: 'Metric name',
        threshold: 'Threshold description',
        dataSources: ['Source 1', 'Source 2'],
        monitoringFrequency: 'quarterly' // daily | weekly | monthly | quarterly | on_demand
      },
      // OR for judgment_required:
      // judgmentDetails: {
      //   observableProxies: ['Proxy 1', 'Proxy 2'],
      //   judgmentCriteria: 'How to judge',
      //   reviewFrequency: 'monthly'
      // },
      responseProtocol: {
        description: 'What to do when triggered',
        escalation: 'review_thesis' // review_thesis | reduce_exposure | exit | increase_exposure
      },
      // For dependent thesis points:
      // dependentThesisId: 'uuid',
      // dependentThesisType: 'macro',
      // dependentThesisCondition: 'invalidated',
      linkedClaimIds: ['claim-uuid-1'],
      status: 'not_triggered' // or 'triggered' if already validated
    },
    // ... more validation points
  ]).returning();

  console.log(`✅ Inserted ${points.length} validation points`);

  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
```

**Execute the script:**
```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/insert-thesis-articulation-temp.ts
```

**Clean up after successful insertion:**
```bash
rm scripts/insert-thesis-articulation-temp.ts
```

---

**JSONB Field Structure Reference:**

| Field | Structure |
|-------|-----------|
| `keyDrivers` | `[{ driver: string, detail?: string, supporting_claims?: string[] }]` |
| `keyAssumptions` | `[{ assumption: string, detail?: string }]` |
| `timeframe` | `{ horizon: string, expectedResolution?: string, keyMilestones?: string[] }` |
| `evidenceGaps` | `string[]` |
| `claimIdsUsed` | `string[]` (UUIDs) |
| `referencedTheses` | `[{ thesisId: string, thesisType: string, title: string, relationship: string, notes?: string }]` |
| `explicitDetails` | `{ metric: string, threshold: string, dataSources: string[], monitoringFrequency: string }` |
| `judgmentDetails` | `{ observableProxies: string[], judgmentCriteria: string, reviewFrequency: string }` |
| `responseProtocol` | `{ description: string, escalation?: string }` |
| `linkedClaimIds` | `string[]` (UUIDs) |

**Common Mistakes to Avoid:**
1. ❌ Using `thesisTitle` instead of `title` in referencedTheses
2. ❌ Using plain strings for keyDrivers/keyAssumptions (must be objects)
3. ❌ Using raw SQL with complex escaping (use TypeScript script instead)
4. ❌ Forgetting to close the database connection (`await closeDb()`)

---

### Step 8: Confirmation

Display to user:

```
✅ Thesis Articulation Created: [THESIS TITLE]

Version: [N]
Claims Synthesized: [COUNT]
Validation Points: [X validation, Y invalidation]
Dependencies: [N theses referenced]
Generated: [TIMESTAMP]

**Validation Points Summary**:
- Critical: [N] ([list types])
- Significant: [N]
- Supporting: [N]

**Next Steps**:
- View articulation at /theses/[ID] or /asset-theses/[ID]
- Monitor validation points manually (Phase 3.2 will add automation)
- Re-synthesize when new claims are added with /synthesize-thesis [TICKER]

**Note**: These validation/invalidation points are your commitment device.
When they trigger, you've stated in advance what action you'll take.
The system will track whether you follow through.
```

---

## Prompt Engineering Principles

### 1. Be Directive, Not Suggestive

❌ "You might want to consider..."
✅ "State the core argument in 2-4 sentences that..."

### 2. Provide Structure, Not Templates

Give the user a framework to fill in, not placeholder text to replace.

### 3. Push for Specificity Without Blocking

Challenge vague answers, but accept them if the user insists. The goal is to surface what's being assumed, not to achieve false precision.

### 4. Preserve Provenance

Always link outputs to inputs:
- Which claims support which drivers?
- Which assumptions generate which invalidation points?
- Which theses are compositionally related?

### 5. Make It Iterative

First drafts are always wrong. Build in refinement loops. Present options, not conclusions.

---

## Error Handling

### No Claims Linked
```
This thesis has no linked claims to synthesize.

To create an articulation:
1. Process research with /process-transcript
2. Link claims with /finalize-for-upload or via UI
3. Retry: /synthesize-thesis [TICKER]

Alternatively, you can create an articulation manually by answering the synthesis questions directly.
```

### Only 1-2 Claims
```
This thesis has only [N] linked claims. A richer articulation typically requires 3+ claims.

Options:
A) Proceed with current claims (articulation may be thin)
B) Link additional claims first
C) Create an articulation with manual input alongside claims

Your choice?
```

### Prior Articulation Exists
```
Found prior articulation (Version [N], created [DATE]).

Options:
A) Create new version (builds on prior, bumps version number)
B) Replace prior (overwrite with fresh synthesis)
C) View prior first, then decide

The prior articulation used [N] claims. You now have [M] claims.
[X] new claims since prior articulation.
```

---

## Phase Context

This skill is part of **Phase 3.1: Thesis Articulation Generation** (#ENH-035) in the active roadmap.

**Related Phases**:
- Phase 3.1: #ENH-036 (Validation/Invalidation Point Extraction) - integrated into this skill
- Phase 3.1: #ENH-037 (Manual Status Tracking) - UI for updating point status
- Phase 3.2: #ENH-038 (Automated Monitoring) - will monitor validation points
- Phase 3.3: #ENH-039 (News & Narratives) - will feed monitoring system

See `/docs/features/thesis-synthesis-monitoring.md` for full specification.
See `/docs/ACTIVE_ROADMAP.md` for roadmap context.

---

## Examples

### Example 1: Synthesize NVDA Thesis

```
User: /synthesize-thesis NVDA

Claude: Let me load the NVDA thesis and linked claims...

[Loads data via SQL query]

I found:
- Asset Thesis: "NVDA: AI Accelerator Dominance"
- Parent Macro: "AI Infrastructure Build-Out"
- Linked Claims: 7 (4 foundation, 2 supporting, 1 refuting)

Synthesizing...

## Draft Thesis Articulation: NVDA AI Accelerator Dominance

### Core Argument
NVIDIA will maintain 80%+ datacenter GPU share through 2026 because CUDA's 15-year ecosystem creates switching costs that hyperscaler custom chips cannot overcome within typical 2-3 year development cycles. Despite Google allocating 60% of internal workloads to TPUs and Amazon's Trainium offering 50% cost savings, external enterprise customers lack the engineering capacity to replicate hyperscaler vertical integration, leaving NVIDIA as the default infrastructure layer for AI deployment.

### Key Drivers
1. CUDA ecosystem retention (>90% developer preference in surveys)
   - Supported by: Claim 3

2. Enterprise AI adoption acceleration expanding TAM
   - Supported by: Claims 2, 5

3. Hyperscaler custom chips remain inference-focused, ceding training market
   - Supported by: Claim 7

### Key Assumptions
1. NVIDIA continues to out-execute on chip development cadence (Blackwell ships Q2 2025)
2. Enterprise customers don't co-develop custom chips with hyperscalers
3. Total AI compute demand grows faster than custom chip capacity

### Confidence
Level: high
Rationale: Strong evidence for ecosystem lock-in and enterprise adoption. Counter-evidence (hyperscaler custom chips) is acknowledged but currently limited to internal workloads.
Evidence Gaps: Need updated developer sentiment surveys, enterprise GPU deployment projections

### Timeframe
Horizon: medium_term
Expected Resolution: Q4 2026

### Compositional Dependencies
1. "AI Infrastructure Build-Out" (macro) - DEPENDS_ON
   - This thesis assumes AI infrastructure spending continues at current trajectory
   - If macro thesis is invalidated, asset thesis should be re-evaluated

### Validation Points

1. **NVIDIA datacenter revenue grows >25% YoY through 2026**
   - Type: validation
   - Category: explicit
   - Importance: critical
   - Metric: NVDA datacenter segment revenue YoY growth
   - Threshold: >25% for each quarter through Q4 2026
   - Data Sources: NVDA quarterly earnings
   - Monitoring: quarterly
   - Response: If sustained, increase position size

2. **Enterprise AI deployment surveys show >80% NVIDIA preference**
   - Type: validation
   - Category: explicit
   - Importance: significant
   - Metric: Enterprise GPU vendor preference in IT surveys
   - Threshold: >80% NVIDIA preference
   - Data Sources: Gartner, IDC surveys
   - Monitoring: annually
   - Response: Confirms moat thesis

### Invalidation Points

1. **NVIDIA datacenter share drops below 70%**
   - Type: invalidation
   - Category: explicit
   - Importance: critical
   - Metric: Datacenter GPU market share (Mercury Research)
   - Threshold: <70% for 2 consecutive quarters
   - Data Sources: Mercury Research quarterly reports
   - Monitoring: quarterly
   - Response: Exit all NVDA strategies within 30 days

2. **Major cloud provider offers CUDA-compatible custom chips**
   - Type: invalidation
   - Category: judgment_required
   - Importance: critical
   - Observable Proxies: AWS/Azure/GCP announcements, developer migration patterns
   - Judgment Criteria: Major cloud provider ships CUDA-compatible alternative with >50% cost savings
   - Review Frequency: monthly
   - Response: Trigger full thesis re-evaluation

3. **Parent macro thesis "AI Infrastructure Build-Out" is invalidated**
   - Type: invalidation
   - Category: explicit
   - Importance: critical
   - Dependent Thesis: "AI Infrastructure Build-Out" (macro)
   - Condition: invalidated
   - Response: Immediate thesis re-evaluation required

---

**What would you change?**
- Core argument too broad/narrow?
- Missing key drivers or assumptions?
- Validation points too vague or too specific?
```

---

## Related Skills

- **`/generate-summary`** - Quick narrative summary (no validation points)
- **`/synthesize-claims`** - Map claims to hierarchy (upstream of this skill)
- **`/deep-dive`** - Develop claims further before synthesis
- **`/read-views`** - Query existing asset theses
- **`/read-theses`** - Query existing macro theses
