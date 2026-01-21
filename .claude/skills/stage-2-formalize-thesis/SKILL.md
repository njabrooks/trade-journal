---
name: stage-2-formalize-thesis
description: Stage 2 of the research playbook - Theme Formalisation. Takes a pipeline idea and produces a falsifiable thesis with failure modes. Transforms intuition into something that can be proven wrong.
allowed-tools: Read, Write
---

# Formalize Thesis (Stage 2)

## Purpose

Transform an intuitive claim into a **falsifiable thesis**. If a thesis cannot be falsified, it cannot guide capital allocation.

This is Stage 2 of the research playbook: **Theme Formalisation (Intuition → Falsifiable Thesis)**

## Input

A pipeline idea directory that has completed Stage 1, e.g.:
- `pipeline/idea-001-energy-storage`
- `research-workspace/pipeline/idea-002-ai-agents`

## Output

Creates `stage-2-thesis.md` in the idea directory containing:
1. **Core thesis** (25 words max, specific and falsifiable)
2. **Primary economic driver** (single variable that determines outcome)
3. **Value chain impact** (who's affected and how)
4. **Primary beneficiaries** (companies/sectors that win)
5. **Primary victims** (companies/sectors that lose)
6. **5 distinct failure modes** (at least 2 structural, 1 execution-related)

## Instructions

When the user asks to formalize a thesis:
- "Formalize thesis for idea-001"
- "Run Stage 2 on pipeline/idea-001-energy-storage"
- "Create thesis for this idea"

### Step 1: Read Stage 1 Output

Read the `stage-1-triage.md` file from the idea directory:

```
{idea_path}/stage-1-triage.md
```

Extract:
- The claim text
- Evidence
- Reasoning
- Backing
- Tickers (if any)
- Time horizon
- Category (macro vs asset_specific)

### Step 2: Generate Thesis Skeleton

Based on the claim, produce:

**Core Thesis (25 words max)**:
- Must be specific enough to be wrong
- Include timeframe if relevant
- Focus on the causal mechanism, not just the prediction
- Example: "AI agent reliability will cross the 95% threshold by Q2 2027, triggering rapid enterprise adoption that obsoletes traditional SaaS interfaces."

**Primary Economic Driver**:
- The ONE variable that most determines success or failure
- Example: "AI model reliability improvement rate"

**Value Chain Impact**:
- Be specific about the causal chain
- Who benefits directly? Who benefits indirectly?
- Who gets hurt? What substitution effects occur?

**Primary Beneficiaries**:
- 2-5 companies or sectors
- Explain WHY they benefit (not just that they do)

**Primary Victims**:
- 2-5 companies or sectors
- Explain WHY they lose

### Step 3: Generate Failure Modes

Create **5 distinct failure modes**. These are ways the thesis could be WRONG.

Requirements:
- At least 2 must be **structural** (fundamental flaw in the logic)
- At least 1 must be **execution-related** (thesis is right but doesn't translate to returns)
- Each must have **observable evidence indicators**

Categories:
- **structural**: The core logic is flawed
- **execution**: Thesis is right but expression fails
- **timing**: Thesis is right but timeline is wrong
- **external**: Outside factors invalidate the thesis

For each failure mode:
```
### {N}. {Failure Mode Title} [{category}]

**Description**: {How the thesis could fail - be specific}

**Evidence Indicators**: {Observable signs this failure mode is occurring}
```

Examples of good failure modes:
- "Model reliability plateau at 90%" [structural] - Evidence: Benchmark scores flat for 6+ months
- "Enterprise procurement cycles extend adoption to 2029" [timing] - Evidence: Deal closure rates in enterprise AI
- "Value accrues to model providers, not application layer" [execution] - Evidence: Application company margins compress

### Step 4: Assess Gate Criteria

Evaluate whether the thesis passes Stage 2:

**Advance if**:
- Core thesis is crisp (specific, falsifiable, 25 words max)
- All 5 failure modes are specific with observable indicators
- At least 2 structural failure modes that challenge the core logic

**Hold if**:
- Failure modes feel vague or too generic
- Unable to specify observable evidence indicators
- Thesis needs refinement but has potential

**Kill if**:
- Cannot articulate what would prove the thesis wrong
- Thesis is unfalsifiable (true by definition or too vague)
- No clear failure modes can be identified

### Step 5: Write stage-2-thesis.md

Create the Stage 2 output file using the template structure:

```markdown
---
stage: 2
title: "Theme Formalisation"
source_claim: "{claim_id from stage-1}"
created_at: "{ISO timestamp}"
---

# Thesis: {Title}

## Core Thesis (25 words max)

{The falsifiable thesis statement}

## Primary Economic Driver

{Single variable that determines outcome}

## Value Chain Impact

{Causal chain of who's affected}

## Primary Beneficiaries

- **{Company/Sector 1}**: {Why they benefit}
- **{Company/Sector 2}**: {Why they benefit}

## Primary Victims

- **{Company/Sector 1}**: {Why they lose}
- **{Company/Sector 2}**: {Why they lose}

---

## Failure Modes

### 1. {Title} [structural]

**Description**: {How thesis fails}

**Evidence Indicators**: {Observable signs}

### 2. {Title} [structural]

**Description**: {How thesis fails}

**Evidence Indicators**: {Observable signs}

### 3. {Title} [execution]

**Description**: {How thesis fails}

**Evidence Indicators**: {Observable signs}

### 4. {Title} [timing]

**Description**: {How thesis fails}

**Evidence Indicators**: {Observable signs}

### 5. {Title} [external]

**Description**: {How thesis fails}

**Evidence Indicators**: {Observable signs}

---

## Gate Assessment

**Decision**: {advance | hold | kill}

**Rationale**: {Why this decision - reference specific criteria}
```

### Step 6: Update _meta.yaml

If decision is **advance**, update the metadata:

```yaml
current_stage: 2
status: active
updated_at: "{ISO timestamp}"

# Add to confidence_history
confidence_history:
  - stage: 2
    value: {same as stage 1, or slightly adjusted if thesis refinement changed view}
    date: "{today}"
    note: "Thesis formalized with 5 failure modes"

# Add to stage_history
stage_history:
  - stage: 2
    started_at: "{timestamp}"
    completed_at: "{timestamp}"
    decision: advance
    note: "Core thesis crisp and falsifiable. 5 specific failure modes identified."
```

If decision is **hold**:
```yaml
status: hold
# Add hold reason to stage_history
```

If decision is **kill**:
- Do NOT update meta - the `/advance-or-kill` skill handles kills

### Step 7: Output Summary

```
Stage 2 Complete: Theme Formalisation

Thesis: {core thesis statement}

Primary Driver: {driver}

Failure Modes:
1. {mode 1} [structural]
2. {mode 2} [structural]
3. {mode 3} [execution]
4. {mode 4} [timing]
5. {mode 5} [external]

Gate Decision: {advance | hold | kill}

{If advance}
Next step: Run `/map-unknowns {idea_path}` to proceed to Stage 3.

{If hold}
Action needed: {What needs to be refined before advancing}

{If kill}
Run `/advance-or-kill {idea_path}` to formally kill this idea and log the reason.
```

## Key Principles

**Falsifiability is non-negotiable**:
- If you can't define what would prove the thesis wrong, it's not a thesis
- Vague theses like "AI will change everything" are useless for capital allocation

**Failure modes must be specific**:
- "Something could go wrong" is not a failure mode
- "Model reliability plateaus at 90% as measured by standard benchmarks" IS a failure mode

**Economic driver should be singular**:
- If you list multiple drivers, you haven't identified the primary one
- The driver is what you'd track most closely to validate/invalidate the thesis

## Notes

- This skill does NOT do research - it formalizes the existing claim
- The thesis may be refined later based on Stage 4 evidence
- If the claim is already well-structured from Stage 1, this stage may be quick
- Poor thesis formalization is the #1 cause of wasted research effort
