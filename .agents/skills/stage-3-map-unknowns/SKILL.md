# Map Unknowns (Stage 3)

## Purpose

Identify **which uncertainties actually matter**. This is the pivot point that determines whether research is worthwhile.

Most investment research fails here. Investors accumulate information without asking: "Would resolving this actually change my decision?" This stage forces that discipline.

This is Stage 3 of the research playbook: **Unknown Mapping (Narrative → Decision Leverage)**

## Input

A pipeline idea directory that has completed Stage 2, e.g.:
- `pipeline/idea-001-energy-storage`

Required files:
- `stage-2-thesis.md` (thesis + failure modes)

## Output

Creates `stage-3-unknowns.md` containing:
1. All major unknowns ranked by decision impact
2. Detailed analysis of top 3 unknowns
3. For each: kill conditions, conviction increase conditions, resolution approach
4. Gate assessment: advance, kill, or archive

## Instructions

When the user asks to map unknowns:
- "Map unknowns for idea-001"
- "Run Stage 3 on pipeline/idea-001-energy-storage"
- "What do we need to know about this thesis?"

### Step 1: Read Stage 2 Output

Read `stage-2-thesis.md` from the idea directory:

Extract:
- Core thesis
- Primary economic driver
- Failure modes (all 5)
- Beneficiaries and victims

### Step 2: List All Unknowns

Based on the thesis and failure modes, identify ALL major unknowns that could affect conviction.

For each unknown, ask:
- **Would resolving this change my view?** (decision impact)
- **Can this be researched externally?** (resolvability)
- **Is the answer already priced in?** (alpha potential)

Categories of unknowns:
- **Market structure**: Competitive dynamics, barriers to entry
- **Technology**: Adoption curves, technical feasibility
- **Regulatory**: Policy direction, enforcement likelihood
- **Execution**: Management capability, capital access
- **Macro**: Demand sensitivity, input costs

### Step 3: Rank by Decision Impact

Rank all unknowns by how much resolving them would change conviction:

**HIGH impact**: Resolving this could flip the thesis direction or significantly change position size
**MEDIUM impact**: Resolving this would adjust confidence but not fundamentally change the view
**LOW impact**: Interesting to know but wouldn't change the decision

### Step 4: Analyze Top 3 Unknowns in Detail

For the 3 highest-impact unknowns, specify:

**Kill Condition**:
- What specific evidence would INVALIDATE the thesis?
- Must be observable and measurable
- Example: "If benchmark scores show <5% improvement over 12 months, the reliability plateau is real"

**Conviction Increase Condition**:
- What evidence would SIGNIFICANTLY STRENGTHEN the thesis?
- Must be observable and measurable
- Example: "If enterprise pilot conversion rates exceed 40%, adoption timeline accelerates"

**Resolution Type**:
- empirical: Hard data (filings, benchmarks, economic data)
- industry: Industry behavior and competitive dynamics
- regulatory: Policy and legal landscape
- technological: Technical capabilities and trajectories

**Externally Resolvable**:
- yes: Can be researched with available sources
- no: Only knowable in hindsight
- partially: Some aspects resolvable, core uncertainty remains

**Recommended Sources**:
- Be specific: "NVIDIA quarterly earnings transcripts" not "company filings"
- Include: company filings, industry data, expert channels, academic research

**Estimated Effort**:
- Hours of research required (be realistic)
- Consider: source accessibility, analysis complexity

**Research Queries**:
- Specific, actionable research questions
- Not "What's happening with AI?" but "What are enterprise AI pilot-to-production conversion rates in Fortune 500 companies?"

### Step 5: Assess Gate Criteria

This is the **most important gate** in the pipeline.

**Advance if ALL of these are true**:
- At least ONE unknown is HIGH impact
- That unknown is externally resolvable (yes or partially)
- Clear kill conditions exist for that unknown
- The payoff is asymmetric (insight value > research cost)

**Kill if ANY of these are true**:
- NO decisive unknowns exist (the idea is narrative-driven, not evidence-driven)
- All unknowns are already priced in
- The thesis depends on factors that cannot be researched

**Archive if**:
- Unknowns exist but aren't currently resolvable
- New data sources may emerge later
- Worth revisiting but not worth researching now

### Step 6: Write stage-3-unknowns.md

```markdown
---
stage: 3
title: "Unknown Mapping"
source_thesis: "{thesis from stage-2}"
created_at: "{ISO timestamp}"
---

# Decision-Critical Unknowns: {thesis_title}

## All Unknowns (Ranked by Decision Impact)

1. **{Unknown 1}** - HIGH impact
2. **{Unknown 2}** - HIGH impact
3. **{Unknown 3}** - MEDIUM impact
4. **{Unknown 4}** - MEDIUM impact
5. **{Unknown 5}** - LOW impact

---

## Top 3 Unknowns (Detailed Analysis)

### Unknown 1: {title}

**Decision Impact**: HIGH

**Resolution Type**: {empirical | industry | regulatory | technological}

**Externally Resolvable**: {yes | no | partially}

**Kill Condition**:
{Specific, observable evidence that would invalidate the thesis}

**Conviction Increase Condition**:
{Specific, observable evidence that would strengthen the thesis}

**Recommended Sources**:
- {Source 1}: {Why this source}
- {Source 2}: {Why this source}
- {Source 3}: {Why this source}

**Estimated Effort**: {X} hours

**Research Queries**:
1. {Specific query 1}
2. {Specific query 2}
3. {Specific query 3}

---

### Unknown 2: {title}
{Same structure}

---

### Unknown 3: {title}
{Same structure}

---

## Gate Assessment

**Decision**: {advance | kill | archive}

**Rationale**:
{Explain the decision with specific reference to:
- Whether high-impact resolvable unknowns exist
- Whether kill conditions are clear
- Whether research payoff is asymmetric}

---

## Research Plan (if advancing)

**Priority Order**:
1. Unknown 1: {title} - {estimated hours}
2. Unknown 2: {title} - {estimated hours}
3. Unknown 3: {title} - {estimated hours}

**Total Estimated Effort**: {X} hours

**Recommended Approach**:
{Brief strategy for tackling the research}
```

### Step 7: Update _meta.yaml

If decision is **advance**:
```yaml
current_stage: 3
status: active
updated_at: "{ISO timestamp}"

confidence_history:
  - stage: 3
    value: {may adjust based on unknown analysis}
    date: "{today}"
    note: "{X} high-impact unknowns identified, research plan defined"

stage_history:
  - stage: 3
    started_at: "{timestamp}"
    completed_at: "{timestamp}"
    decision: advance
    note: "High-impact resolvable unknowns with clear kill conditions. Worth researching."
```

If **kill** or **archive**: Leave for `/advance-or-kill` skill

### Step 8: Output Summary

Based on the Research Plan from Step 6, output copy-paste ready commands for the recommended research tracks.

**Use judgment to select which tracks to recommend**:
- Always start with **falsification** on the most foundational unknown (can kill thesis early)
- Include **validation** tracks for unknowns where positive evidence would materially increase conviction
- Skip tracks that wouldn't change the decision or where the unknown isn't resolvable
- Typically recommend 2-4 tracks total, not exhaustive coverage

**Research track definitions**:
- **falsification**: Look for evidence AGAINST the thesis
- **validation**: Look for evidence SUPPORTING the thesis
- **analogues**: (optional) Historical parallels or similar situations

```
Stage 3 Complete: Unknown Mapping

Thesis: {core thesis}

Decision-Critical Unknowns:
1. {Unknown 1} [HIGH] - {resolvable?}
2. {Unknown 2} [HIGH] - {resolvable?}
3. {Unknown 3} [MEDIUM] - {resolvable?}

Gate Decision: {advance | kill | archive}

{If advance}
Research effort required: ~{X} hours

## Stage 4 Research Commands (copy-paste ready)

{Based on your Research Plan, output the recommended tracks in priority order.
Include brief context for why each track and when to stop.
Format each as a code block for easy copying.}

Example format:
### 1. {Unknown N} {Track} - {brief rationale}
```
/stage-4a-prep-desktop-research {idea_path} unknown-N {track}
```

{If kill}
Run `/advance-or-kill {idea_path}` to formally kill and log the reason.

{If archive}
Idea archived. Revisit when: {conditions for revisiting}
```

## Key Principles

**An unknown matters only if**:
- Resolving it would change conviction (position size or direction)
- It is potentially resolvable through research
- The answer isn't already priced into markets

**Rank by decision impact, not by interestingness**:
- Many things are interesting but wouldn't change your decision
- Focus ruthlessly on what moves the needle

**Most ideas should die here**:
- If no decisive unknown exists, the idea is narrative-driven
- Narrative-driven ideas feel compelling but lack decision leverage

**Kill conditions must be specific**:
- "If it doesn't work out" is not a kill condition
- "If AI benchmark scores show <5% improvement over next 12 months" IS a kill condition

## Notes

- This is the **most important gate** - be rigorous
- Don't advance ideas just because they're interesting
- Research is expensive - only pursue asymmetric payoffs
- Ideas that pass here have EARNED research effort
- If you can't define what would kill the thesis, it shouldn't advance
