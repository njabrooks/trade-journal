# Advance or Kill (Gate Evaluation)

## Purpose

Evaluate an idea's progress at any stage and make a gate decision:
- **Advance**: Move to next stage
- **Hold**: Stay at current stage, needs refinement
- **Kill**: Terminate the idea and archive to kill log

This skill handles the formal gate transitions and maintains the kill log for learning.

## Input

A pipeline idea directory path, e.g.:
- `pipeline/idea-001-energy-storage`

## Output

- Updates `_meta.yaml` with decision
- If killed: Creates kill log entry and moves idea to `kill-log/`

## Instructions

When the user asks to evaluate an idea:
- "Advance or kill idea-001"
- "Evaluate gate for pipeline/idea-001-energy-storage"
- "Kill this idea"
- "Should we advance this?"

### Step 1: Read Current State

Read `_meta.yaml` from the idea directory:
- Current stage
- Current status
- Confidence
- Stage history

Read the current stage file (e.g., `stage-2-thesis.md` or `stage-3-unknowns.md`)

### Step 2: Evaluate Gate Criteria

Based on current stage, evaluate the appropriate criteria:

**Stage 1 → Stage 2**:
- Advance if: Novelty score >= 0.6 AND mechanism is plausible
- Kill if: Claim is consensus, mechanism is unclear, or not actionable

**Stage 2 → Stage 3**:
- Advance if: Core thesis is crisp and falsifiable, failure modes are specific
- Hold if: Failure modes feel vague, need refinement
- Kill if: Cannot articulate what would prove thesis wrong (unfalsifiable)

**Stage 3 → Stage 4**:
- Advance if: At least one high-impact, externally resolvable unknown with clear kill conditions
- Archive if: Unknowns exist but aren't currently resolvable
- Kill if: No decisive unknowns (narrative-driven, not evidence-driven)

**Stage 4 → Stage 5**:
- Advance if: Posterior confidence >= 0.65 AND no unresolved decision-critical unknowns
- Hold if: Confidence 0.50-0.65 (may need more research)
- Kill if: Confidence < 0.50 OR evidence materially contradicts thesis

**Stage 5 → Complete**:
- Express: Idea leads to position/trade
- Watch: Add to watchlist for later
- Discard: No attractive expression available

### Step 3: Present Assessment

Show the user the gate assessment:

```
## Gate Evaluation: {idea_id}

**Current Stage**: {N} - {stage_name}
**Current Status**: {status}
**Confidence**: {confidence}

### Gate Criteria for Stage {N} → Stage {N+1}

Criteria met:
- {criteria 1}: {status}
- {criteria 2}: {status}
- {criteria 3}: {status}

### Recommendation

**Decision**: {advance | hold | kill | archive}

**Rationale**:
{Explanation of why this decision}

Proceed with this decision? (y/n)
```

### Step 4: Execute Decision

**If ADVANCE**:

1. Update `_meta.yaml`:
```yaml
current_stage: {N+1}
status: active
updated_at: "{ISO timestamp}"

stage_history:
  - stage: {N}
    completed_at: "{ISO timestamp}"
    decision: advance
    note: "Gate criteria met. {specific note}"
```

2. Output next step:
```
Idea advanced to Stage {N+1}.

Next: Run `/{next_skill} {idea_path}` to proceed.
```

**If HOLD**:

1. Update `_meta.yaml`:
```yaml
status: hold
updated_at: "{ISO timestamp}"

stage_history:
  - stage: {N}
    decision: hold
    note: "{Why holding - specific issue to resolve}"
```

2. Output action needed:
```
Idea on hold at Stage {N}.

Action needed: {specific refinement required}

To resume: Address the issue and run this skill again.
```

**If KILL**:

1. Create kill log entry
2. Move idea to kill-log directory
3. Update any tracking

### Step 5: Handle Kill (Detailed)

**Create kill log file**:

```markdown
---
idea_id: "{idea_id}"
title: "{title}"
killed_at_stage: {N}
kill_date: "{ISO date}"
kill_category: "{category}"
time_invested_hours: {estimate}
---

# Killed: {title}

## Summary

**Original Claim**: {from stage-1}
**Core Thesis**: {from stage-2, if reached}
**Killed at Stage**: {N} - {stage_name}
**Kill Date**: {date}

## Kill Reason

**Category**: {category}

**Detailed Reason**:
{Specific explanation of why this idea was killed}

## Kill Categories

The kill was classified as: **{category}**

Available categories:
- `weak_mechanism` - Cause-effect chain not convincing
- `consensus` - Idea is already priced in / widely held
- `unfalsifiable` - Cannot define what would prove it wrong
- `negative_evidence` - Research found contradicting evidence
- `unresolvable` - Key unknowns cannot be researched
- `poor_expression` - Thesis may be right but no good trade expression

## Lesson Learned

{What can be learned from this kill to improve future idea quality?}

Examples:
- "Was too attached to the narrative without checking consensus"
- "Should have validated mechanism earlier"
- "Sources from this domain tend to produce consensus ideas"

## Stage History

{Copy stage history from _meta.yaml}

## Original Files

The following files were part of this idea before killing:
- stage-1-triage.md
- stage-2-thesis.md (if reached)
- stage-3-unknowns.md (if reached)
- stage-4-evidence.md (if reached)
```

**Move to kill-log**:

```bash
mv {idea_path} /Users/njb/Desktop/trade-journal/research-workspace/kill-log/killed-{XXX}-{slug}/
```

**Output confirmation**:

```
Idea killed and archived.

Kill Log Entry: kill-log/killed-{XXX}-{slug}.md

Summary:
- Idea: {title}
- Stage: {N}
- Category: {category}
- Lesson: {lesson}

The kill log is important for learning. Review kills periodically to improve idea quality.
```

### Step 6: Handle Archive (Stage 3 only)

Archiving is similar to killing but with different intent - revisit later.

Update `_meta.yaml`:
```yaml
status: archived
updated_at: "{ISO timestamp}"

stage_history:
  - stage: 3
    decision: archive
    note: "Unknowns not currently resolvable. Revisit when: {conditions}"
```

Don't move to kill-log. The idea stays in pipeline with `archived` status.

Output:
```
Idea archived at Stage 3.

Reason: {Why not currently resolvable}
Revisit when: {Conditions for revisiting}

The idea remains in the pipeline with archived status.
To reactivate: Update _meta.yaml status to 'active' when conditions are met.
```

## Kill Categories Reference

| Category | Description | Example |
|----------|-------------|---------|
| `weak_mechanism` | Cause-effect chain not convincing | "No clear path from AI to revenue impact" |
| `consensus` | Already widely held / priced in | "Every analyst already bullish on this" |
| `unfalsifiable` | Can't define what would prove it wrong | "AI will eventually change everything" |
| `negative_evidence` | Research contradicted the thesis | "Data showed opposite of expected" |
| `unresolvable` | Key unknowns can't be researched | "Depends on private company strategy" |
| `poor_expression` | No good way to express the trade | "Right thesis, wrong instruments available" |

## Notes

- **Kill rate matters**: A healthy pipeline has high kill rates. Most ideas should die. That's the system working correctly.
- **Kill early**: Killing at Stage 1-2 is cheap. Killing at Stage 4 means wasted research.
- **Learn from kills**: The kill log exists to improve future idea quality. Review it periodically.
- **Archive vs Kill**: Archive is "not now", Kill is "not ever"
