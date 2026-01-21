---
name: express-thesis
description: Stage 5 - Translate conviction into actionable positioning. Maps value chain, classifies order of effects, and compiles sizing inputs for human decision.
allowed-tools: Read, Write
---

# Express Thesis (Stage 5)

## Purpose

Translate conviction into actionable positioning. This stage answers: **"If and how should this thesis be expressed in a portfolio?"**

This is Stage 5 of the research playbook: **Expression & Positioning (Belief → Market Expression)**

**Important**: This skill does NOT recommend trades. It provides the analytical framework for human decision-making.

## Input

An idea directory path that has completed Stage 4 with decision `advance` or `modify_and_advance`:
- `pipeline/idea-001-advanced-packaging-growth`

Required files:
- `_meta.yaml` (confidence ≥ 0.65, stage 4 complete)
- `stage-2-thesis.md` (thesis, beneficiaries, victims)
- `stage-4-evidence.md` (evidence synthesis, investment expression refinement)

## Output

Creates `stage-5-expression.md` containing:
1. Value chain map
2. Order of effects classification
3. Decision support data (optional - can be populated later)
4. Sizing inputs framework
5. Final decision recommendation (act | watch | discard)

## Instructions

When the user asks to express a thesis:
- "Express thesis for idea-001"
- "/express-thesis pipeline/idea-001-advanced-packaging-growth"
- "Complete Stage 5 for this idea"
- "How should we position for this thesis?"

### Step 1: Validate Readiness

Read `_meta.yaml` and verify:
- `current_stage: 4`
- `status: active`
- `confidence >= 0.65`
- Last stage_history decision is `advance` or `modify_and_advance`

If not ready, stop and explain what's missing.

### Step 2: Read All Materials

Read from the idea directory:

1. `_meta.yaml` - Get confidence score
2. `stage-2-thesis.md` - Get thesis, beneficiaries, victims
3. `stage-4-evidence.md` - Get:
   - Evidence synthesis themes
   - Modified thesis (if applicable)
   - Investment Expression Refinement (if present)

### Step 3: Build Value Chain Map

Map the thesis across its value chain. For each layer, analyze companies/sectors.

```markdown
## Value Chain Map

### Upstream (Suppliers)

| Company/Sector | Revenue Sensitivity | Margin Impact | Capital Intensity | Timing | Execution Risk |
|----------------|---------------------|---------------|-------------------|--------|----------------|
| {name} | {high/med/low} | {improve/compress/neutral} | {high/med/low} | {immediate/1-2y/3-5y} | {specific risk} |

### Direct Players

| Company/Sector | Revenue Sensitivity | Margin Impact | Capital Intensity | Timing | Execution Risk |
|----------------|---------------------|---------------|-------------------|--------|----------------|
| {name} | {high/med/low} | {improve/compress/neutral} | {high/med/low} | {immediate/1-2y/3-5y} | {specific risk} |

### Downstream (Customers)

| Company/Sector | Revenue Sensitivity | Margin Impact | Capital Intensity | Timing | Execution Risk |
|----------------|---------------------|---------------|-------------------|--------|----------------|
| {name} | {high/med/low} | {improve/compress/neutral} | {high/med/low} | {immediate/1-2y/3-5y} | {specific risk} |

### Enablers

| Company/Sector | Revenue Sensitivity | Margin Impact | Capital Intensity | Timing | Execution Risk |
|----------------|---------------------|---------------|-------------------|--------|----------------|
| {name} | {high/med/low} | {improve/compress/neutral} | {high/med/low} | {immediate/1-2y/3-5y} | {specific risk} |
```

**Column definitions:**
- **Revenue Sensitivity**: How directly does thesis impact top line?
- **Margin Impact**: Does thesis improve or compress margins?
- **Capital Intensity**: Investment required to capture opportunity
- **Timing**: When does this layer see effects?
- **Execution Risk**: What could prevent value capture even if thesis is right?

### Step 4: Classify Order of Effects

Classify potential investments by directness of exposure.

```markdown
## Order of Effects

### First-Order (Direct Exposure)

{Most direct exposure to thesis. Likely most consensus and potentially most priced.}

- **{Company/Sector}**
  - Why first-order: {explanation}
  - Risk if thesis right but expression fails: {specific risk}
  - Consensus level: {crowded/moderate/underfollowed}

- **{Company/Sector}**
  - Why first-order: {explanation}
  - Risk if thesis right but expression fails: {specific risk}
  - Consensus level: {crowded/moderate/underfollowed}

### Second-Order (Derivative Demand)

{Less obvious exposure. May offer better entry due to less attention.}

- **{Company/Sector}**
  - Why second-order: {explanation}
  - Risk if thesis right but expression fails: {specific risk}
  - Why potentially better than first-order: {rationale}

- **{Company/Sector}**
  - Why second-order: {explanation}
  - Risk if thesis right but expression fails: {specific risk}
  - Why potentially better than first-order: {rationale}

### Third-Order (Enablers/Infrastructure)

{Most indirect exposure. Longest duration, least correlated to near-term noise.}

- **{Company/Sector}**
  - Why third-order: {explanation}
  - Risk if thesis right but expression fails: {specific risk}
  - Duration alignment: {how long to realize value}

### Potential Shorts (Victims)

{Companies/sectors that lose if thesis is correct.}

- **{Company/Sector}**
  - Why victim: {explanation}
  - Risk if shorting: {specific risk - squeeze, buyout, etc.}
  - Timing consideration: {when does pressure manifest}
```

### Step 5: Decision Support Data (Optional Section)

Create placeholders for optional data that can be populated later via TradingView, broker data, or separate research.

```markdown
## Decision Support Data

**Note**: This section is optional. Populate when ready to act.

### Sentiment & Positioning

| Metric | {Ticker 1} | {Ticker 2} | {Ticker 3} |
|--------|-----------|-----------|-----------|
| Sell-side rating | {TBD} | {TBD} | {TBD} |
| 30-day earnings revisions | {TBD} | {TBD} | {TBD} |
| Institutional ownership change | {TBD} | {TBD} | {TBD} |
| Short interest | {TBD} | {TBD} | {TBD} |
| Options put/call ratio | {TBD} | {TBD} | {TBD} |

### Technical Setup

| Metric | {Ticker 1} | {Ticker 2} | {Ticker 3} |
|--------|-----------|-----------|-----------|
| Primary trend | {TBD} | {TBD} | {TBD} |
| Distance from 200 DMA | {TBD} | {TBD} | {TBD} |
| RSI (14) | {TBD} | {TBD} | {TBD} |
| Key support level | {TBD} | {TBD} | {TBD} |
| Key resistance level | {TBD} | {TBD} | {TBD} |

### Catalyst Calendar

| Date | Event | Ticker(s) | Expected Impact |
|------|-------|-----------|-----------------|
| {TBD} | {event} | {ticker} | {positive/negative/uncertain} |

**To populate**: Use TradingView, broker tools, or run optional Deep Research for specific tickers.
```

### Step 6: Compile Sizing Inputs

Provide framework inputs for position sizing. Do NOT recommend a size.

```markdown
## Sizing Inputs

**Conviction Score**: {from Stage 4 posterior confidence}

### Per-Expression Analysis

| Expression | Liquidity | Volatility | Correlation | Max Adverse | Horizon Alignment |
|------------|-----------|------------|-------------|-------------|-------------------|
| {ticker 1} | {ADV, spread} | {hist/implied} | {to portfolio} | {realistic downside %} | {match thesis horizon?} |
| {ticker 2} | {ADV, spread} | {hist/implied} | {to portfolio} | {realistic downside %} | {match thesis horizon?} |

### Key Sizing Considerations

1. **Conviction-to-size mapping**: {How does 0.72 confidence translate to position size in your framework?}
2. **Correlation risk**: {Are multiple expressions correlated? Portfolio-level impact?}
3. **Catalyst proximity**: {Near-term events that could force re-evaluation?}
4. **Liquidity constraints**: {Can you build/exit position at desired size?}
```

### Step 7: Final Decision Framework

```markdown
## Final Decision

**Recommended Action**: {act | watch | discard}

**Rationale**: {Why this recommendation}

### If Act

**Selected Expression(s)**:
1. **{Ticker/Instrument}**: {Why this expression - order of effect, risk/reward}
2. **{Ticker/Instrument}**: {Why this expression - order of effect, risk/reward}

**Entry Criteria**:
- {Condition 1 - price level, technical setup, catalyst timing}
- {Condition 2}

**Exit Conditions (Profit)**:
- {Target 1}: {rationale - thesis milestone, valuation, technical}
- {Target 2}: {rationale}

**Exit Conditions (Loss)**:
- {Stop 1}: {rationale - thesis invalidation signal}
- {Stop 2}: {rationale - risk management}

**Review Triggers**:
- {What would cause re-evaluation before targets/stops?}

### If Watch

**Trigger to Act**:
- {What would make you convert to act?}

**Review Date**: {When to revisit}

**What to Monitor**:
- {Specific metrics or events}

### If Discard

**Reason for Discarding**:
- {Why not acting despite completing the pipeline}

**Lesson Learned**:
- {What does this teach about the research process?}

---

**A no-trade decision is a valid success state.** The system's job is conviction calibration, not trade generation.
```

### Step 8: Write stage-5-expression.md

Create the complete Stage 5 output file:

```markdown
---
stage: 5
title: "Expression & Positioning"
source_thesis: "{modified thesis from stage-4, or original from stage-2}"
conviction_score: {from _meta.yaml}
created_at: "{ISO timestamp}"
---

# Expression: {thesis_title}

{All sections from Steps 3-7}
```

### Step 9: Update _meta.yaml

```yaml
current_stage: 5
status: {expressed | watching | discarded}
updated_at: "{ISO timestamp}"

confidence_history:
  - stage: 5
    value: {same as stage 4 - expression doesn't change conviction}
    date: "{today}"
    note: "Expression complete. Decision: {act/watch/discard}. {Brief rationale}"

stage_history:
  - stage: 5
    started_at: "{timestamp}"
    completed_at: "{ISO timestamp}"
    decision: {act | watch | discard}
    note: "{Selected expressions and rationale}"
```

### Step 10: Output Summary

```
## Stage 5 Complete: Expression & Positioning

**Thesis**: {modified thesis}
**Conviction**: {X.XX}
**Decision**: {ACT | WATCH | DISCARD}

### Value Chain Summary

| Layer | Key Players | Best Expression |
|-------|-------------|-----------------|
| Upstream | {names} | {best pick if any} |
| Direct | {names} | {best pick if any} |
| Downstream | {names} | {best pick if any} |
| Enablers | {names} | {best pick if any} |

### Order of Effects

| Order | Players | Consensus Level | Risk |
|-------|---------|-----------------|------|
| 1st | {names} | {crowded/moderate/under} | {key risk} |
| 2nd | {names} | {crowded/moderate/under} | {key risk} |
| 3rd | {names} | {crowded/moderate/under} | {key risk} |

### Selected Expressions (if Act)

| Expression | Order | Entry Criteria | Target | Stop |
|------------|-------|----------------|--------|------|
| {ticker} | {1st/2nd/3rd} | {condition} | {target} | {stop} |

---

{If ACT}
**Next Steps**:
1. Populate Decision Support Data for selected expressions
2. Set alerts for entry criteria
3. Size position according to your framework

{If WATCH}
**Monitor for**:
- {trigger 1}
- {trigger 2}
**Review date**: {date}

{If DISCARD}
Idea archived. Lesson: {brief learning}

---

Pipeline complete for idea-{XXX}. Total progression: Stage 1 → 5
Confidence journey: {stage 1 value} → {stage 5 value}
Time in pipeline: {duration}
```

## Notes

- **Do not recommend specific sizes**: Provide framework inputs, human decides allocation
- **Consensus level matters**: First-order plays are often crowded; second/third-order may offer better entry
- **Expression can fail even if thesis is right**: Always specify this risk
- **Watch is valid**: Not every thesis needs immediate action
- **Discard is valid**: Completing the pipeline and not trading is a success if the process was rigorous
- **Decision support is optional**: Can be populated later when ready to act

## Integration with Trade Journal

After Stage 5 completes with decision `act`:
1. Selected expressions can be converted to **asset theses** via `/finalize-for-upload`
2. The macro thesis can be created linking to the asset theses
3. Strategies can be created under the asset theses
4. This connects the research pipeline to the execution system
