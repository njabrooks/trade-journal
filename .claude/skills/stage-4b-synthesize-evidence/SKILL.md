---
name: stage-4b-synthesize-evidence
description: Stage 4B - Consolidate research files and synthesize findings into belief update with posterior confidence. Completes Stage 4 Evidence Resolution.
---

# Synthesize Evidence (Stage 4B)

## Purpose

After running Deep Research via Claude desktop (`/research-unknown-desktop`), this skill:
1. **Consolidates** individual research files into `stage-4-evidence.md`
2. Synthesizes all findings into coherent themes
3. Weights evidence by source credibility
4. Identifies contradictions
5. Calculates belief update (prior → posterior confidence)
6. Makes gate recommendation (advance/hold/kill/modify)

**Workflow Note**: This skill handles the full Stage 4 completion, including consolidation of individual research files that were created via Claude desktop (which cannot write directly to the repo).

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

### Step 1: Consolidate Research Files (if needed)

**This step handles the workflow where Deep Research was run in Claude desktop.**

Scan the idea directory for individual research analysis files. These may follow various naming patterns:

**Expected patterns from `/research-unknown-desktop` skill:**
- `unknown-{N}-{track}-analysis.md` (e.g., `unknown-3-falsification-analysis.md`)

**Legacy patterns (from ad-hoc Deep Research runs):**
- `Unknown {N} - {title} - {Track} Analysis.md`
- `{unknown-title}-{track}.md`
- Any `.md` file containing research findings for an unknown

**Consolidation process:**

1. **Check if `stage-4-evidence.md` exists with Research Findings**
   - If it has a complete "Research Findings" section with all unknowns, skip consolidation
   - If missing or incomplete, proceed with consolidation

2. **Scan for individual research files**
   - List all `.md` files in the idea directory (excluding `_meta.yaml`, `stage-1-*.md`, `stage-2-*.md`, `stage-3-*.md`)
   - Identify files that contain research findings (look for "Kill Condition", "Findings", "Analysis" sections)

3. **Create or update `stage-4-evidence.md`**
   - Use the template from `research-workspace/templates/stage-4-evidence-template.md`
   - For each unknown from `stage-3-unknowns.md`, find and consolidate relevant research files
   - Organize by unknown, then by track (falsification, validation, analogues)

4. **Consolidation output format:**

```markdown
---
stage: 4
title: "Evidence Resolution"
source_thesis: "{thesis from stage-2}"
prior_confidence: {from _meta.yaml}
created_at: "{timestamp}"
---

# Evidence Resolution: {thesis_title}

## Research Findings

### Unknown 1: {title from stage-3}

#### Falsification Track

**Research Date**: {from file metadata or YAML frontmatter}
**Objective**: Find evidence that this thesis is WRONG

**Kill Condition Assessment**:
> {Quote the kill condition from stage-3-unknowns.md}

**Status**: {NOT TRIGGERED | PARTIALLY TRIGGERED | TRIGGERED}

**Findings**:
{Consolidate findings from the falsification analysis file}

- {Finding 1}
  - Source: {type}
  - Credibility: {0.0-1.0}
  - Bearing on thesis: {explanation}

**Caveats**: {from original analysis}

#### Validation Track

{Same structure, from validation analysis file}

#### Analogues Track (if exists)

{Same structure, from analogues analysis file}

---

### Unknown 2: {title}

{Repeat structure}

---

### Unknown 3: {title}

{Repeat structure}
```

5. **After consolidation, report:**
   ```
   Consolidated {N} research files into stage-4-evidence.md:
   - Unknown 1: falsification ✓, validation ✓
   - Unknown 2: falsification ✓, validation ✓
   - Unknown 3: validation ✓

   Missing tracks: Unknown 3 falsification (not found)

   Proceeding to synthesis...
   ```

**Note**: If no individual research files are found AND `stage-4-evidence.md` doesn't exist, stop and inform the user that research files are needed before synthesis can proceed.

### Step 2: Read All Materials

Read from the idea directory:

1. `_meta.yaml` - Get current confidence (prior)
2. `stage-2-thesis.md` - Get the thesis and failure modes
3. `stage-3-unknowns.md` - Get the unknowns and their conditions
4. `stage-4-evidence.md` - Get all research findings (now consolidated from Step 1)

### Step 3: Organize Findings by Theme

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

### Step 4: Weight Evidence by Source

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

### Step 5: Document Contradictions

Flag evidence that conflicts - don't resolve it, just note it:

```markdown
### Contradiction Log

| Topic | Position A | Position B | Resolution |
|-------|-----------|-----------|------------|
| {topic} | {view from finding X} | {view from finding Y} | UNRESOLVED |
| {topic} | {view from finding X} | {view from finding Y} | {explanation if resolved} |

**Critical Contradictions**: {count} - {do any affect thesis validity?}
```

### Step 6: Evaluate Unknown Resolution

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

### Step 7: Calculate Belief Update

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

### Step 8: Make Gate Recommendation

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

### Step 9: Write Modification Notes (if applicable)

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

### Step 10: Update Files

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

### Step 11: Update Database Entity (if ADVANCE or MODIFY)

If the gate decision is **ADVANCE** or **MODIFY** (modify_and_advance), update the linked thesis entity in the database:

1. **Read `linked_thesis_id` from `_meta.yaml`**. If not present (older pipeline idea), skip this step and note that `/graduate-pipeline-idea` should be run manually.

2. **Update pipeline_stage** on the thesis:
   ```bash
   cd trade-journal && npx tsx scripts/psql-query.ts "UPDATE macro_theses SET pipeline_stage = 4, updated_at = now() WHERE id = '{linked_thesis_id}'" --format json
   ```

3. **Update thesis status to `developing`** (if still `draft`):
   ```bash
   cd trade-journal && npx tsx scripts/ops/update-entity-status.ts \
     --entity-type macro_thesis --id "{linked_thesis_id}" \
     --status developing --rationale "Pipeline Stage 4 evidence synthesis complete, posterior confidence: {X.XX}"
   ```

4. **If research produced well-defined signals**: The deep research often identifies specific monitoring signals with kill conditions and conviction thresholds. These should be captured as signals via `/build-core-argument` or `/graduate-pipeline-idea` in a subsequent step — do NOT create signals directly here. Instead, note in the output summary that signal creation is the next step.

5. **Update `_meta.yaml`** with the pipeline_stage update confirmation.

**Note**: Full thesis promotion to `monitoring` (with articulation + signals) happens via `/build-core-argument` or `/graduate-pipeline-idea`, not here. This step only advances the draft thesis to `developing` with updated pipeline_stage.

### Step 12: Output Summary

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
