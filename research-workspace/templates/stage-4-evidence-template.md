---
stage: 4
title: "Evidence Resolution"
source_thesis: "{thesis_title}"
prior_confidence: 0.0
created_at: "{timestamp}"
---

# Evidence Resolution: {thesis_title}

## Research Findings

{For each unknown from Stage 3, document findings from three research tracks:
- Falsification: Evidence that contradicts the thesis
- Validation: Evidence that supports the thesis with mechanism
- Analogues: Historical precedents}

### Unknown 1: {title}

#### Falsification Track

**Research Date**: {date}
**Objective**: Find evidence that this thesis is WRONG

**Findings**:
- {Finding 1}
  - Source: {company filing | industry data | expert opinion | media}
  - Credibility: {0.0-1.0}
  - Bearing on thesis: {How this affects the thesis}

- {Finding 2}
  - Source: {type}
  - Credibility: {0.0-1.0}
  - Bearing on thesis: {How this affects the thesis}

**Caveats**: {Limitations of this evidence}

#### Validation Track

**Research Date**: {date}
**Objective**: Find evidence supporting the thesis AND validate the mechanism

**Findings**:
- {Finding 1}
  - Source: {type}
  - Credibility: {0.0-1.0}
  - Mechanism validation: {Does this explain WHY, not just THAT?}

- {Finding 2}
  - Source: {type}
  - Credibility: {0.0-1.0}
  - Mechanism validation: {explanation}

**Caveats**: {Limitations of this evidence}

#### Analogues Track

**Research Date**: {date}
**Objective**: Find historical situations with similar dynamics

**Analogues Found**:

1. **{Analogue 1 Title}**
   - Situation: {What happened}
   - Timeframe: {When}
   - Consensus view at the time: {What people believed}
   - Actual outcome: {What really happened}
   - Winners vs losers: {Who benefited, who lost}
   - Similarity to current thesis: {0.0-1.0}
   - Key difference: {What's different now}

2. **{Analogue 2 Title}**
   - Situation: {What happened}
   - Timeframe: {When}
   - Consensus view at the time: {What people believed}
   - Actual outcome: {What really happened}
   - Similarity to current thesis: {0.0-1.0}
   - Key difference: {What's different now}

---

### Unknown 2: {title}

{Repeat the three-track structure for each unknown researched}

---

## Evidence Synthesis

### Summary (by Theme, not by Source)

1. **{Theme 1}**: {Key findings across all research tracks}
2. **{Theme 2}**: {Key findings across all research tracks}
3. **{Theme 3}**: {Key findings across all research tracks}

### Source Weighting

| Source Type | Weight | Rationale |
|-------------|--------|-----------|
| Company filings | {0.0-1.0} | {Why this weight} |
| Industry data | {0.0-1.0} | {Why this weight} |
| Expert opinion | {0.0-1.0} | {Why this weight} |
| Media/commentary | {0.0-1.0} | {Why this weight} |

### Contradiction Log

{Where does evidence conflict? Do NOT resolve - just flag for human judgment.}

| Topic | Position A | Position B | Status |
|-------|-----------|-----------|--------|
| {topic} | {view 1} | {view 2} | UNRESOLVED |
| {topic} | {view 1} | {view 2} | UNRESOLVED |

### Belief Update

- **Prior Confidence** (from Stage 3): {X.XX}
- **Posterior Confidence**: {Y.YY}
- **Delta**: {+/- Z.ZZ}

**Key Drivers of Update**:
1. {What evidence most changed the view}
2. {What evidence most changed the view}
3. {What evidence most changed the view}

### Remaining Unknowns

{What couldn't be resolved? Does it matter for the decision?}

- {Unknown 1}: {Status and materiality}
- {Unknown 2}: {Status and materiality}

---

## Gate Assessment

**Thesis Status**: {advance | hold | kill | modify}

**Modification Notes** (if modify):
{What changes should be made to the thesis based on evidence?}

**Rationale**: {Explain the decision. Reference specific criteria:
- Advance if: Posterior confidence >= 0.65 AND no unresolved decision-critical unknowns
- Hold if: Confidence 0.50-0.65, may need additional research
- Kill if: Confidence < 0.50 OR evidence materially contradicts thesis
- Modify if: Core insight valid but thesis needs refinement}
