# Pipeline Status

## Purpose

Display a summary of all ideas currently in the research playbook pipeline, including:
- Active ideas with their current stage and confidence
- Ideas on hold
- Recent kills and patterns from the kill log

## Instructions

When the user asks about pipeline status:
- "Show pipeline status"
- "What ideas are in the pipeline?"
- "Pipeline overview"

### Step 1: Scan Pipeline Directory

Find all idea directories and their `_meta.yaml` files:

```bash
ls -d /Users/njb/Desktop/trade-journal/research-workspace/pipeline/idea-*/ 2>/dev/null || echo "No ideas in pipeline"
```

### Step 2: Read Each Idea's Metadata

For each idea directory found, read the `_meta.yaml` file and extract:
- `idea_id`
- `title`
- `current_stage`
- `status`
- `confidence`
- `created_at`

Calculate age in days from `created_at`.

### Step 3: Display Pipeline Status Table

Format output as:

```
# Research Pipeline Status

## Active Ideas

| ID      | Title                              | Stage | Confidence | Age     | Status |
|---------|------------------------------------|-------|------------|---------|--------|
| idea-001| Energy Storage Cost Curve          | 3     | 0.64       | 6 days  | active |
| idea-002| AI Agents Replace Apps             | 2     | 0.72       | 3 days  | active |
| idea-003| NVIDIA Margin Pressure             | 2     | 0.45       | 2 days  | hold   |

Stage Legend:
1 = Signal Triage (complete for all pipeline ideas)
2 = Theme Formalisation
3 = Unknown Mapping
4 = Evidence Resolution
5 = Expression & Positioning

## Ideas on Hold

| ID      | Title                              | Stage | Confidence | Hold Reason           |
|---------|------------------------------------|-------|------------|-----------------------|
| idea-003| NVIDIA Margin Pressure             | 2     | 0.45       | Failure modes vague   |

## Stage Distribution

Stage 1 (Triage):      0 ideas
Stage 2 (Thesis):      2 ideas
Stage 3 (Unknowns):    1 idea
Stage 4 (Evidence):    0 ideas
Stage 5 (Expression):  0 ideas

Total active: 3
Total on hold: 1
```

### Step 4: Scan Kill Log

Find all killed idea files:

```bash
ls /Users/njb/Desktop/trade-journal/research-workspace/kill-log/*.md 2>/dev/null || echo "No killed ideas"
```

Read each kill log file and extract:
- Original idea title
- Stage where killed
- Kill category
- Kill date

### Step 5: Display Kill Log Summary

```
## Kill Log Summary

Recent Kills (Last 30 Days):
| Date       | Title                    | Stage | Category          |
|------------|--------------------------|-------|-------------------|
| 2026-01-20 | Crypto Mining Thesis     | 1     | consensus         |
| 2026-01-18 | Retail Short Squeeze     | 2     | unfalsifiable     |
| 2026-01-15 | China Tech Rebound       | 3     | unresolvable      |

Kill Patterns:
- Stage 1 kills: 2 (consensus: 2)
- Stage 2 kills: 1 (unfalsifiable: 1)
- Stage 3 kills: 1 (unresolvable: 1)
- Total killed: 4

Most common kill reasons:
1. consensus (2)
2. unfalsifiable (1)
3. unresolvable (1)

Kill rate: 57% (4 killed / 7 total ideas)
```

### Step 6: Provide Quick Actions

End with suggested actions:

```
## Quick Actions

- Initialize new idea: `/init-idea {audit-file} {claim-number}`
- Advance idea to Stage 2: `/formalize-thesis pipeline/idea-XXX-slug`
- Advance idea to Stage 3: `/map-unknowns pipeline/idea-XXX-slug`
- Evaluate gate: `/advance-or-kill pipeline/idea-XXX-slug`
```

## Edge Cases

**Empty Pipeline**:
```
# Research Pipeline Status

No ideas currently in pipeline.

To get started:
1. Process a transcript: `/process-transcript {file}`
2. Initialize an idea: `/init-idea {audit-file} {claim-number}`
```

**No Kill Log**:
```
## Kill Log Summary

No ideas have been killed yet.

Note: A healthy pipeline should have a high kill rate. Most ideas should die
at early stages - that's the system working correctly.
```

## Notes

- This skill is read-only - it doesn't modify any files
- Age is calculated from `created_at` in `_meta.yaml`
- For hold status, read the most recent stage history entry for the hold reason
- The kill log directory is `research-workspace/kill-log/`
