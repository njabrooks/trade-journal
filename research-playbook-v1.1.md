# AI-Augmented Investment Research System

**From Signal to Conviction (v1.1)**

> **Purpose**
> Build a personal, institution-grade investment research system that increases the *probability of success* by systematically transforming raw information into **decision-grade conviction**, while explicitly managing uncertainty and bias.

---

## 1. Core Design Principles

### 1.1 Unifying Principle

> **Humans define the question and the risk.**
> **AI exhaustively maps the possibility space.**
> **Humans decide where conviction is justified.**

This system is **not** about prediction, idea generation, or automation for its own sake.
It is about **conviction calibration under uncertainty**.

---

### 1.2 What This System Explicitly Is *Not*

- A stock-picking engine
- A summarisation pipeline
- A "Deep Research everywhere" workflow
- A replacement for human judgment

---

### 1.3 What This System Optimises For

- Early idea rejection
- Explicit falsifiability
- Clear separation of cognitive tasks
- Scalable rigour without narrative drift
- Documented belief updates

Your IP lives in: **what advances, what dies, what escalates, and what updates belief.**

---

## 2. Global Architecture & Guardrails

### 2.1 Cognitive State Machine

Each stage represents a **cognitive state**, not merely a tool. Ideas must **earn the right** to progress.

| Stage | Name | Cognitive Function | Deep Research |
|-------|------|-------------------|---------------|
| 1 | Signal Triage | Noise → Latent Claims | ❌ Never |
| 2 | Theme Formalisation | Intuition → Falsifiable Thesis | ❌ Never |
| 3 | Unknown Mapping | Narrative → Decision Leverage | ❌ Never |
| 4 | Evidence Resolution | Uncertainty → Belief Update | ✅ Only here |
| 5 | Expression & Positioning | Belief → Market Expression | ⚠️ Optional data support |

---

### 2.2 Immutable Research State Objects

Every stage writes a structured, append-only record. This creates an audit trail of how beliefs evolved.

```json
{
  "idea_id": "UUID",
  "stage": "unknown_mapping",
  "status": "active | killed | archived | watching",
  "inputs": {},
  "outputs": {},
  "confidence": 0.64,
  "escalation_decision": "advance | hold | kill",
  "kill_reason": null,
  "timestamp": "ISO-8601",
  "source_refs": []
}
```

**Rules**

- No overwriting previous state records
- No free-form narrative carryover between stages
- No silent belief updates — all changes are logged
- Kill reasons are mandatory when rejecting ideas

---

### 2.3 Single Cognitive Task per Prompt

Never mix in a single prompt:

- Extraction
- Interpretation
- Research
- Synthesis
- Decision

Each prompt does **one thing only**. This produces more reliable outputs and clearer audit trails.

---

## 3. Stage-by-Stage Design

---

## Stage 1: Signal Triage

**(Noise → Latent Claims)**

### Objective

Identify **non-consensus, forward-looking claims** with plausible valuation impact.

### Human vs AI Division

- **Human** decides what enters the system (podcast, transcript, article, conversation)
- **AI** extracts what might matter from that source

### When to Use

- After consuming any investment-relevant content
- When you notice something that "feels" important but isn't yet articulated

### Prompt: Latent Claim Extractor

**System Prompt**

```
You extract latent investment-relevant claims from source material.

A claim is valid only if it implies:
- A change in constraints, incentives, or cost curves
- Over a multi-year horizon
- With identifiable winners and losers

Ignore:
- Anecdotes without structural implications
- Summaries of known information
- Generic macro commentary
- Predictions without mechanism
```

**User Prompt**

```
Source: [Transcript / Essay / Talk]

Extract up to 7 latent claims. For each claim provide:

1. **Direct quote**: The specific passage that contains the claim
2. **Implied claim**: One sentence stating what this implies for markets
3. **Mechanism**: Why this would occur (cause → effect chain)
4. **Consensus view**: What the market currently assumes instead
5. **Time horizon**: 0–2y | 2–5y | 5y+
6. **Novelty score**: 0.0–1.0 (how differentiated is this from consensus)
```

### Output Schema

```json
{
  "claim_id": "claim_001",
  "source_ref": "podcast_xyz_timestamp_1423",
  "quote": "...",
  "implied_claim": "...",
  "mechanism": "...",
  "consensus_view": "...",
  "horizon": "2-5y",
  "novelty_score": 0.81,
  "extraction_timestamp": "ISO-8601"
}
```

### Gate Criteria

**Advance** if: Novelty score ≥ 0.6 AND mechanism is plausible AND you find the claim genuinely interesting.

**Kill** if: Claim is consensus, mechanism is unclear, or it's not actionable.

⚠️ **Most ideas should die at this stage.** That is the system working correctly.

---

## Stage 2: Theme Formalisation

**(Intuition → Falsifiable Thesis)**

### Objective

Turn an intuitive claim into something that can be **wrong**. If a thesis cannot be falsified, it cannot guide capital allocation.

### When to Use

- When a claim passes Stage 1 triage
- When you have a strong intuition that needs structuring

### Prompt 2A: Thesis Skeleton Builder

**System Prompt**

```
You are formalising an investment hypothesis.
Your goal is to make it precise enough to be falsified.
Do not elaborate. Do not add caveats. Be maximally specific.
```

**User Prompt**

```
Input claim: [Latent claim from Stage 1]

Produce:

1. **Core thesis** (≤25 words): The specific, falsifiable statement
2. **Primary economic driver**: The single variable that most determines outcome
3. **Value chain impact**: Which parts of the industry are affected and how
4. **Primary beneficiaries**: Companies/sectors that win if thesis is correct
5. **Primary victims**: Companies/sectors that lose if thesis is correct
```

### Prompt 2B: Failure-First Expansion

**System Prompt**

```
You identify ways an investment thesis could fail.
Focus on structural failures, not timing or valuation concerns.
Be adversarial. The goal is to find weaknesses.
```

**User Prompt**

```
Thesis: [Core thesis from 2A]

List 5 distinct ways this thesis could fail.

Requirements:
- At least 2 must be structural (fundamental flaw in the logic)
- At least 1 must be execution-related (thesis is right but doesn't translate to returns)
- For each failure mode, specify what evidence would indicate it's occurring
```

### Output Schema

```json
{
  "thesis_id": "thesis_001",
  "source_claim_id": "claim_001",
  "core_thesis": "...",
  "primary_driver": "...",
  "value_chain_impact": "...",
  "beneficiaries": ["...", "..."],
  "victims": ["...", "..."],
  "failure_modes": [
    {
      "mode": "...",
      "type": "structural | execution | timing | external",
      "evidence_indicators": "..."
    }
  ],
  "formalisation_timestamp": "ISO-8601"
}
```

### Gate Criteria

**Advance** if: Core thesis is crisp, failure modes are specific, and you can imagine evidence that would kill it.

**Hold** if: Failure modes feel vague — return and refine the thesis.

**Kill** if: Cannot articulate what would prove the thesis wrong.

---

## Stage 3: Unknown Mapping

**(Narrative → Decision Leverage)**

### Objective

Identify **which uncertainties actually matter**. This is the pivot point that determines whether research is worthwhile.

### Why This Stage Matters

Most investment research fails here. Investors accumulate information without asking: "Would resolving this actually change my decision?" This stage forces that discipline.

### When to Use

- After a thesis passes Stage 2 formalisation
- Before committing any deep research effort

### Prompt 3A: Decision-Critical Unknowns

**System Prompt**

```
You identify uncertainties that materially affect capital allocation decisions.

An unknown matters only if:
- Resolving it would change conviction (position size or direction)
- It is potentially resolvable through research
- The answer isn't already priced into markets

Rank by decision impact, not by interestingness.
```

**User Prompt**

```
Thesis: [Core thesis from Stage 2]
Failure modes: [List from Stage 2]

1. List all major unknowns that could affect conviction in this thesis
2. Rank them by decision impact (how much would resolving this change your view?)
3. For the top 3 unknowns, provide:
   - What specific evidence would resolve it?
   - What outcome would kill the thesis?
   - What outcome would significantly increase conviction?
   - Is this externally resolvable (vs. only knowable in hindsight)?
   - Resolution type: empirical data | industry behaviour | regulatory | technological
```

### Prompt 3B: Research Scope Definition

**System Prompt**

```
You are scoping research effort for an investment thesis.
Research is expensive. Only recommend research that could change decisions.
```

**User Prompt**

```
Given these decision-critical unknowns: [Top 3 from 3A]

For each unknown, specify:
1. What sources would credibly resolve this? (filings, industry data, expert channels, etc.)
2. What is the expected research effort? (hours, not "moderate")
3. What is the asymmetry? (What do you gain if resolved vs. cost of research)
4. Recommended research approach (specific queries, not general directions)
```

### Output Schema

```json
{
  "thesis_id": "thesis_001",
  "unknowns": [
    {
      "unknown_id": "unk_001",
      "description": "...",
      "decision_impact": "high | medium | low",
      "resolution_type": "empirical | industry | regulatory | technological",
      "kill_condition": "...",
      "conviction_increase_condition": "...",
      "externally_resolvable": true,
      "recommended_sources": ["...", "..."],
      "estimated_effort_hours": 2,
      "research_queries": ["...", "..."]
    }
  ],
  "mapping_timestamp": "ISO-8601"
}
```

### Gate Criteria

**Advance** if: At least one unknown is high-impact, externally resolvable, and has clear kill conditions.

**Kill** if: No unknown is decisive — the idea is narrative-driven, not evidence-driven.

**Archive** if: Unknowns exist but aren't currently resolvable — revisit when new data emerges.

🚨 **This is the most important gate.** Ideas that pass here have earned research effort.

---

## Stage 4: Evidence Resolution

**(Uncertainty → Belief Update)**

### Objective

Resolve the decision-critical unknowns identified in Stage 3. Update beliefs based on evidence quality, not quantity.

### When Deep Research Is Permitted

Only when ALL of the following are true:

- A clear **kill condition** exists from Stage 3
- The unknown is **externally resolvable**
- The payoff is **asymmetric** (potential insight exceeds research cost)

### Research Architecture

For each decision-critical unknown, run **three parallel research tracks**:

| Track | Purpose | Prompt Focus |
|-------|---------|--------------|
| Falsification | Find disconfirming evidence | "What would prove this wrong?" |
| Validation | Find confirming evidence with mechanism | "What supports this and why?" |
| Analogues | Find historical precedents | "When has something similar happened?" |

This prevents confirmation bias while ensuring comprehensive coverage.

### Prompt 4A: Falsification Research

**System Prompt**

```
You are conducting research to falsify an investment thesis.
Your primary goal is to find evidence that contradicts the thesis.
Confirmation is secondary. Surface contradictions aggressively.
Do not soften negative findings.
```

**User Prompt (for Claude Deep Research)**

```
Thesis: [Core thesis]
Unknown to resolve: [Specific unknown from Stage 3]
Kill condition: [What would invalidate this]

Research objective: Find evidence that this thesis is WRONG.

Specifically investigate:
- [Specific research query 1 from Stage 3]
- [Specific research query 2 from Stage 3]

For all evidence found:
1. State the finding clearly
2. Assess source credibility (company filing / industry data / expert opinion / media)
3. Explain how it bears on the thesis
4. Note any caveats or limitations
```

### Prompt 4B: Validation Research

**System Prompt**

```
You are conducting research to validate an investment thesis.
Focus on mechanism validation — not just that something is true, but WHY it's true.
Identify the causal chain and where it could break.
```

**User Prompt (for Claude Deep Research)**

```
Thesis: [Core thesis]
Unknown to resolve: [Specific unknown from Stage 3]
Conviction increase condition: [What would strengthen this]

Research objective: Find evidence supporting this thesis AND validate the mechanism.

Specifically investigate:
- [Specific research query 1]
- [Specific research query 2]

For all evidence found:
1. State the finding clearly
2. Assess source credibility
3. Explain the causal mechanism (not just correlation)
4. Identify where the mechanism could break down
```

### Prompt 4C: Historical Analogues Research

**System Prompt**

```
You are researching historical precedents for an investment thesis.
Find situations where similar dynamics played out.
Focus on what actually happened, not what was predicted.
Note both successes and failures of analogous theses.
```

**User Prompt (for Claude Deep Research)**

```
Thesis: [Core thesis]
Primary driver: [From Stage 2]
Value chain impact: [From Stage 2]

Research objective: Find historical situations with similar dynamics.

Consider:
- Similar technological/regulatory/competitive shifts
- Similar value chain disruptions
- Similar consensus-to-reality gaps

For each analogue:
1. Describe the situation and timeframe
2. What was the consensus view at the time?
3. What actually happened?
4. What determined winners vs. losers?
5. What's similar and different to current thesis?
```

### Prompt 4D: Evidence Synthesis

**System Prompt**

```
You are synthesising research findings into a belief update.
Weigh evidence by quality, not quantity.
Do not paper over contradictions — flag them explicitly.
Produce a probabilistic assessment, not a narrative.
```

**User Prompt**

```
You have received research from three tracks on this thesis:
[Attach outputs from 4A, 4B, 4C]

Synthesise into:

1. **Evidence summary**: Key findings organised by theme (not by source)

2. **Evidence weighting**: 
   - Company filings/data: weight 0.0-1.0
   - Industry data: weight 0.0-1.0  
   - Expert opinion: weight 0.0-1.0
   - Media/commentary: weight 0.0-1.0

3. **Contradiction log**: Where does evidence conflict? Do not resolve — just flag.

4. **Belief update**:
   - Prior confidence (from Stage 3): X
   - Posterior confidence: Y
   - Key factors driving the update

5. **Remaining unknowns**: What couldn't be resolved? Does it matter?

6. **Thesis status recommendation**: advance | hold | kill | modify
   - If modify, specify what changes
```

### Output Schema

```json
{
  "thesis_id": "thesis_001",
  "unknown_resolved": "unk_001",
  "evidence_for": [
    {"finding": "...", "source_type": "...", "credibility": 0.8}
  ],
  "evidence_against": [
    {"finding": "...", "source_type": "...", "credibility": 0.7}
  ],
  "analogues": [
    {"situation": "...", "outcome": "...", "relevance": 0.6}
  ],
  "contradictions": [
    {"topic": "...", "position_a": "...", "position_b": "..."}
  ],
  "source_weights": {
    "company_filings": 0.8,
    "industry_data": 0.7,
    "expert_opinion": 0.5,
    "media": 0.3
  },
  "prior_confidence": 0.60,
  "posterior_confidence": 0.72,
  "confidence_delta_drivers": ["...", "..."],
  "unresolved_items": ["..."],
  "thesis_status": "advance | hold | kill | modify",
  "modification_notes": null,
  "resolution_timestamp": "ISO-8601"
}
```

### Gate Criteria

**Advance** if: Posterior confidence ≥ 0.65 AND no unresolved unknowns are decision-critical.

**Hold** if: Confidence is moderate (0.50-0.65) — may need additional research or time.

**Kill** if: Evidence materially contradicts thesis OR posterior confidence < 0.50.

**Modify** if: Core insight is valid but thesis needs refinement based on evidence.

---

## Stage 5: Expression & Positioning

**(Belief → Market Expression)**

### Objective

Translate conviction into actionable positioning. Decide **if and how** the thesis should be expressed in a portfolio.

### When to Use

- After a thesis passes Stage 4 with sufficient conviction
- When preparing to allocate capital or add to watchlist

### Part A: Value Chain Mapping

### Prompt 5A: Value Chain Translation

**System Prompt**

```
You are mapping an investment thesis across its value chain.
Identify where value accrues and where it leaks.
Do not recommend. Provide the analytical framework for human decision.
```

**User Prompt**

```
Thesis: [Core thesis]
Primary beneficiaries: [From Stage 2]
Primary victims: [From Stage 2]

Map across the value chain. For each layer (upstream suppliers, direct players, downstream customers, enablers):

1. **Companies/sectors** at this layer
2. **Revenue sensitivity**: How directly does thesis impact top line?
3. **Margin sensitivity**: Does thesis improve or compress margins?
4. **Capital intensity**: Investment required to capture opportunity
5. **Timing of impact**: When does this layer see effects? (immediate / 1-2y / 3-5y)
6. **Execution risk**: What could prevent value capture even if thesis is right?
```

### Prompt 5B: Order-of-Effects Classification

**System Prompt**

```
You are classifying investment exposures by order of effect.
First-order effects are most direct but often most priced.
Second and third-order effects may offer better risk/reward.
Classify only. Do not rank or recommend.
```

**User Prompt**

```
Thesis: [Core thesis]
Value chain map: [From 5A]

Classify potential investments:

**First-order** (direct exposure to thesis):
- List companies/sectors
- Note: likely most consensus, potentially most priced

**Second-order** (derivative demand):
- List companies/sectors  
- Note: less obvious, may offer better entry

**Third-order** (enablers/infrastructure):
- List companies/sectors
- Note: most indirect, longest duration

For each, note key risk if thesis is right but this specific expression fails.
```

### Part B: Decision Support Data

### Prompt 5C: Sentiment & Positioning Scan

**System Prompt**

```
You are gathering sentiment and positioning data to inform timing decisions.
Present data factually. Do not interpret or recommend.
Flag anything unusual relative to historical norms.
```

**User Prompt (for Deep Research — optional)**

```
For [specific company or sector]:

Compile:
1. **Sell-side sentiment**: Rating distribution, recent changes, price target range
2. **Earnings revisions**: 30/60/90 day revision trends
3. **Institutional positioning**: Recent 13F changes, concentration
4. **Options market**: Put/call ratios, implied volatility vs. historical
5. **Insider activity**: Recent transactions, pattern vs. history
6. **Short interest**: Current level, trend, days to cover

Flag any metrics that appear unusual (>1 std dev from recent history).
```

### Prompt 5D: Technical Setup Assessment

**User Prompt**

```
For [specific ticker]:

Assess current technical setup:
1. **Trend**: Primary trend direction and strength
2. **Key levels**: Major support/resistance zones
3. **Momentum**: RSI, MACD status
4. **Volume**: Recent volume vs. average, any divergences
5. **Pattern**: Any notable chart patterns forming

Note: This is decision support, not a trading signal.
```

### Prompt 5E: Catalyst Calendar

**User Prompt**

```
For [specific company or sector]:

Identify upcoming catalysts:
1. **Earnings dates**: Next 2 quarters
2. **Guidance events**: Investor days, conferences
3. **Regulatory dates**: Decision deadlines, filing dates
4. **Industry events**: Trade shows, product launches
5. **Macro events**: Relevant economic releases, policy decisions

For each, note potential impact direction (positive/negative/uncertain for thesis).
```

### Part C: Position Sizing Framework

### Prompt 5F: Sizing Input Compilation

**System Prompt**

```
You are compiling inputs for a position sizing decision.
Do not recommend a size. Provide the framework inputs.
The human makes the final allocation decision.
```

**User Prompt**

```
Thesis: [Core thesis]
Posterior confidence: [From Stage 4]
Expression: [Specific instrument/company]

Compile sizing inputs:

1. **Conviction score**: [From Stage 4 posterior]
2. **Liquidity assessment**: Average daily volume, bid-ask spread
3. **Volatility profile**: Historical vol, recent vol, implied vol
4. **Correlation to existing positions**: [Requires portfolio context]
5. **Maximum adverse scenario**: What's the realistic downside if wrong?
6. **Time horizon alignment**: Does instrument duration match thesis horizon?
7. **Catalyst proximity**: Near-term events that could force re-evaluation
```

### Output Schema

```json
{
  "thesis_id": "thesis_001",
  "expression_analysis": {
    "value_chain_map": {...},
    "order_of_effects": {
      "first_order": [...],
      "second_order": [...],
      "third_order": [...]
    }
  },
  "decision_support": {
    "sentiment_data": {...},
    "technical_setup": {...},
    "catalyst_calendar": [...]
  },
  "sizing_inputs": {
    "conviction_score": 0.72,
    "liquidity": "...",
    "volatility": "...",
    "max_adverse": "...",
    "horizon_alignment": "..."
  },
  "expression_timestamp": "ISO-8601"
}
```

### Final Human Gate

Only **after completing Stage 5** should you:

- Make final valuation assessment
- Determine position size
- Set entry criteria and levels
- Define exit conditions (both profit and loss)
- Decide: **act | watch | discard**

🎯 **A no-trade decision is a valid success state.** The system's job is conviction calibration, not trade generation.

---

## 4. Kill Log & Learning System

### Purpose

Track rejected ideas systematically. This is where you learn about your own biases and improve idea quality over time.

### Kill Log Schema

```json
{
  "idea_id": "...",
  "killed_at_stage": 1-5,
  "kill_reason": "...",
  "kill_category": "weak_mechanism | consensus | unfalsifiable | negative_evidence | unresolvable | poor_expression",
  "original_claim": "...",
  "time_invested": "hours",
  "lesson_learned": "...",
  "kill_timestamp": "ISO-8601"
}
```

### Periodic Review Prompts

**Monthly: Kill Pattern Analysis**

```
Review this month's kill log.

1. At which stage did most ideas die?
2. What kill categories dominate?
3. Are there source patterns? (Certain podcasts/authors generating lower-quality ideas?)
4. What would have caught these earlier?
```

**Quarterly: Belief Update Review**

```
Review all ideas that reached Stage 4 this quarter.

1. How did confidence change from prior to posterior?
2. Were updates mostly up or down?
3. Which evidence types drove the largest updates?
4. Any ideas that should have been killed earlier in hindsight?
```

---

## 5. Implementation Recommendations

### 5.1 Data Model (Supabase)

```sql
-- Core tables
CREATE TABLE ideas (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  current_stage INTEGER,
  status TEXT, -- active, killed, archived, watching, expressed
  source_ref TEXT
);

CREATE TABLE stage_records (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  stage INTEGER,
  inputs JSONB,
  outputs JSONB,
  confidence DECIMAL,
  escalation_decision TEXT,
  kill_reason TEXT,
  created_at TIMESTAMP
);

CREATE TABLE kill_log (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  killed_at_stage INTEGER,
  kill_reason TEXT,
  kill_category TEXT,
  time_invested_hours DECIMAL,
  lesson_learned TEXT,
  created_at TIMESTAMP
);
```

### 5.2 Prompt Template Storage

Store prompt templates in Obsidian or your app with parameter slots:

```markdown
## Prompt: Latent Claim Extractor
**Stage:** 1
**Type:** System + User
**Parameters:** {{source_content}}

### System
[System prompt text]

### User  
[User prompt text with {{source_content}} slot]
```

### 5.3 Workflow Integration

- **Stage 1** runs via Claude API on your transcript/content pipeline
- **Stages 2-3** run via Claude (Opus or Sonnet) with extended thinking
- **Stage 4** uses Claude Deep Research for evidence gathering, then Claude for synthesis
- **Stage 5** combines Deep Research (optional), your TradingView data feeds, and manual assessment

### 5.4 Unknowns Taxonomy

Maintain a reusable taxonomy for faster unknown classification:

| Category | Examples | Typical Resolution |
|----------|----------|-------------------|
| Market structure | Competitive dynamics, barriers to entry | Industry data, expert interviews |
| Technology | Adoption curves, technical feasibility | Technical deep dives, analogues |
| Regulatory | Policy direction, enforcement likelihood | Legal analysis, precedent research |
| Execution | Management capability, capital access | Track record analysis, filings |
| Macro | Demand sensitivity, input costs | Economic data, scenario analysis |

---

## 6. Quick Reference Card

### Stage Progression Gates

| Stage | Advance If | Kill If |
|-------|-----------|---------|
| 1 | Novelty ≥ 0.6, mechanism plausible | Consensus, no mechanism |
| 2 | Thesis crisp, failures specific | Cannot define falsification |
| 3 | High-impact resolvable unknown exists | No decisive unknowns |
| 4 | Posterior confidence ≥ 0.65 | Confidence < 0.50 or evidence contradicts |
| 5 | Expression identified, sizing framework complete | No attractive expression available |

### Deep Research Rules

✅ **Use when:** Clear kill condition, externally resolvable, asymmetric payoff
❌ **Never use:** Stages 1-3, to confirm existing beliefs, without specific queries

### Prompt Discipline

- One cognitive task per prompt
- Always specify what NOT to do
- Include output format requirements
- Reference prior stage outputs explicitly

---

**Version:** 1.1
**Status:** Implementation-ready
**Changelog from v1.0:**
- Added three-track research architecture (falsification, validation, analogues)
- Added evidence synthesis stage
- Expanded Stage 5 with technical, sentiment, and catalyst components
- Added sizing framework inputs
- Added Kill Log and learning system
- Added implementation recommendations
- Added Quick Reference Card
