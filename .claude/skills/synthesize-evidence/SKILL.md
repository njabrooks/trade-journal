---
name: synthesize-evidence
description: Stage 4B - Synthesize all research findings into belief update with posterior confidence. Completes Stage 4 Evidence Resolution.
allowed-tools: Read, Write
---

# Synthesize Evidence (Stage 4B)

## Purpose

After running `/research-unknown` multiple times, this skill:
1. Synthesizes all findings into coherent themes
2. Weights evidence by source credibility
3. Identifies contradictions
4. Calculates belief update (prior → posterior confidence)
5. Makes gate recommendation (advance/hold/kill/modify)

## Input

An idea directory path:
- `pipeline/idea-001-energy-storage`

## Output

- Updates `stage-4-evidence.md` with synthesis section
- Updates `_meta.yaml` with new confidence and stage

## Instructions

When the user asks to synthesize evidence:
- "Synthesize evidence for idea-001"
- "/synthesize-evidence pipeline/idea-001-energy-storage"
- "Complete Stage 4 for this idea"
- "What does the evidence say?"

### Step 1: Read All Materials

Read from the idea directory:

1. `_meta.yaml` - Get current confidence (prior)
2. `stage-2-thesis.md` - Get the thesis and failure modes
3. `stage-3-unknowns.md` - Get the unknowns and their conditions
4. `stage-4-evidence.md` - Get all research findings

### Step 2: Organize Findings by Theme

Don't organize by source - organize by what the evidence tells us.

Identify 3-5 major themes that emerge from the research:

```markdown
### Summary (by Theme)

1. **{Theme 1}**: {Key findings and what they suggest}
   - Supported by: {list findings}
   - Strength: {strong | moderate | weak}

2. **{Theme 2}**: {Key findings and what they suggest}
   - Supported by: {list findings}
   - Strength: {strong | moderate | weak}

3. **{Theme 3}**: {Key findings and what they suggest}
   - Supported by: {list findings}
   - Strength: {strong | moderate | weak}
```

### Step 3: Weight Evidence by Source

Create source weighting table:

```markdown
### Source Weighting

| Source Type | Count | Avg Credibility | Weight in Synthesis |
|-------------|-------|-----------------|---------------------|
| Company filings | {N} | {0.X} | {high/medium/low} |
| Industry data | {N} | {0.X} | {high/medium/low} |
| Expert opinion | {N} | {0.X} | {high/medium/low} |
| Academic | {N} | {0.X} | {high/medium/low} |
| Media | {N} | {0.X} | {high/medium/low} |

**Overall Evidence Quality**: {high | medium | low}
**Diversity Score**: {good | adequate | poor} - {explanation}
```

### Step 4: Document Contradictions

Flag evidence that conflicts - don't resolve it, just note it:

```markdown
### Contradiction Log

| Topic | Position A | Position B | Resolution |
|-------|-----------|-----------|------------|
| {topic} | {view from finding X} | {view from finding Y} | UNRESOLVED |
| {topic} | {view from finding X} | {view from finding Y} | {explanation if resolved} |

**Critical Contradictions**: {count} - {do any affect thesis validity?}
```

### Step 5: Evaluate Unknown Resolution

For each unknown from Stage 3, assess resolution:

```markdown
### Unknown Resolution Status

| Unknown | Kill Condition | Status | Conviction Condition | Status |
|---------|---------------|--------|---------------------|--------|
| {unknown 1} | {condition} | {triggered/not triggered/partial} | {condition} | {met/not met/partial} |
| {unknown 2} | {condition} | {triggered/not triggered/partial} | {condition} | {met/not met/partial} |
| {unknown 3} | {condition} | {triggered/not triggered/partial} | {condition} | {met/not met/partial} |

**Unresolved Unknowns**: {list any that couldn't be researched}
**Decision Criticality**: {do unresolved unknowns matter for the thesis?}
```

### Step 6: Calculate Belief Update

```markdown
### Belief Update

**Prior Confidence**: {from _meta.yaml, typically from Stage 3}
**Posterior Confidence**: {new estimate}

**Confidence Change**: {+/-X.XX}

**Key Drivers of Update**:
1. {What moved confidence up or down}
2. {What moved confidence up or down}
3. {What moved confidence up or down}

**Confidence Calibration Notes**:
{Any caveats about the confidence estimate - sample size, evidence gaps, etc.}
```

**Confidence Guidelines:**
- 0.80+ : Very high conviction, multiple confirming sources, no major contradictions
- 0.65-0.79: High conviction, thesis supported, minor concerns
- 0.50-0.64: Moderate conviction, mixed evidence, meaningful uncertainty
- 0.35-0.49: Low conviction, significant concerns or contradictions
- Below 0.35: Very low conviction, evidence contradicts thesis

### Step 7: Make Gate Recommendation

```markdown
### Gate Assessment

**Thesis Status**: {advance | hold | kill | modify}

**Rationale**:
{Detailed explanation referencing specific evidence and criteria}

**Gate Criteria Check**:
- [ ] Posterior confidence ≥ 0.65? {yes/no} - {actual: X.XX}
- [ ] No unresolved decision-critical unknowns? {yes/no}
- [ ] No kill conditions triggered? {yes/no}
- [ ] Evidence supports (doesn't contradict) core mechanism? {yes/no}
```

**Decision Matrix:**

| Condition | Recommendation |
|-----------|----------------|
| Confidence ≥ 0.65 AND no blockers | **ADVANCE** to Stage 5 |
| Confidence 0.50-0.65, no kill triggers | **HOLD** - may need more research |
| Confidence < 0.50 | **KILL** - insufficient conviction |
| Kill condition triggered | **KILL** - evidence contradicts thesis |
| Core insight valid but framing wrong | **MODIFY** - refine thesis and re-evaluate |

### Step 8: Write Modification Notes (if applicable)

If recommending MODIFY:

```markdown
### Modification Notes

**Original Thesis**:
{from stage-2-thesis.md}

**Suggested Revision**:
{how the thesis should be refined based on evidence}

**What Changed**:
- {specific aspect that needs modification}
- {specific aspect that needs modification}

**Next Steps**:
1. Update stage-2-thesis.md with refined thesis
2. Re-evaluate failure modes
3. May need to re-map unknowns (Stage 3)
4. Re-run relevant research tracks
```

### Step 9: Update Files

**Update `stage-4-evidence.md`** - Add entire synthesis section after Research Findings.

**Update `_meta.yaml`**:

```yaml
current_stage: 4
status: {active | hold | killed}
confidence: {posterior_confidence}
updated_at: "{ISO timestamp}"

confidence_history:
  - stage: 4
    value: {posterior_confidence}
    date: "{ISO date}"
    note: "{Brief note on what drove the update}"

stage_history:
  - stage: 4
    started_at: "{when research began}"
    completed_at: "{ISO timestamp}"
    decision: {advance | hold | kill | modify}
    note: "{Gate decision rationale}"
```

### Step 10: Output Summary

```
## Evidence Synthesis Complete: {thesis_title}

**Prior Confidence**: {X.XX}
**Posterior Confidence**: {X.XX}
**Change**: {+/-X.XX}

### Evidence Summary

| Theme | Strength | Impact |
|-------|----------|--------|
| {theme 1} | {strong/moderate/weak} | {supports/contradicts/neutral} |
| {theme 2} | {strong/moderate/weak} | {supports/contradicts/neutral} |
| {theme 3} | {strong/moderate/weak} | {supports/contradicts/neutral} |

### Unknown Resolution

| Unknown | Resolved? | Kill Triggered? | Conviction Met? |
|---------|-----------|-----------------|-----------------|
| {unknown 1} | {yes/no/partial} | {yes/no} | {yes/no} |
| {unknown 2} | {yes/no/partial} | {yes/no} | {yes/no} |

### Contradictions

{count} contradictions identified, {count} critical

### Gate Decision

**Recommendation**: {ADVANCE | HOLD | KILL | MODIFY}

**Rationale**: {one paragraph explanation}

---

{If ADVANCE}
Idea ready for Stage 5 Expression & Positioning.
Next: Run `/advance-or-kill {idea_path}` to formally advance.

{If HOLD}
Idea needs additional research or time.
Action needed: {specific action}
Review date: {suggested date}

{If KILL}
Idea should be terminated.
Kill category: {category}
Next: Run `/advance-or-kill {idea_path}` to formally kill and archive.

{If MODIFY}
Thesis needs refinement before proceeding.
Next: Update stage-2-thesis.md, then re-evaluate.
```

## Notes

- **Don't advocate**: This skill synthesizes evidence objectively, not to support the thesis
- **Flag uncertainty**: Be clear about evidence gaps and limitations
- **Contradictions are data**: Unresolved contradictions should inform confidence, not be explained away
- **Kill is success**: Killing a weak thesis early is the system working correctly
- **Modify is valid**: Sometimes the core insight is right but the framing is wrong
