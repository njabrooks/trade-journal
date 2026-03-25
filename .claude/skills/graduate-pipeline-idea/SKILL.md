---
name: graduate-pipeline-idea
description: Formal handoff from pipeline idea files to Trade Journal database entities. Creates or updates thesis, links claims, creates signals via /build-core-argument, and updates pipeline state. Use after Stage 4B synthesis or Stage 5 expression.
---

# Graduate Pipeline Idea

## Purpose

Formal handoff from a research pipeline idea to the Trade Journal database. This skill bridges the gap between the flat-file pipeline (research-workspace/pipeline/) and the database entities that power the UI and monitoring system.

## Two Pipeline Exit Points

1. **High conviction → asset thesis directly** (idea-001 pattern): Research produces a specific investment vehicle with clear entry/exit criteria
2. **Conditional conviction → macro thesis with monitoring signals** (idea-007 pattern): Research identifies a structural condition worth monitoring; asset thesis creation is gated on macro signals firing

## Input

An idea directory path, e.g.:
- `pipeline/idea-007-national-resilience-investment`
- Just the idea ID: `idea-007`

## Workflow

```
INPUT: Pipeline idea path
  |
STEP 1: Read pipeline state (_meta.yaml + stage files)
  |
STEP 2: Determine graduation path (macro vs asset, direct vs gated)
  |
STEP 3: Create or update thesis entity in DB
  |
STEP 4: Link research claims to thesis
  |
STEP 5: Run /build-core-argument for articulation + signals
  |
STEP 6: Update pipeline state (graduated)
  |
OUTPUT: Active thesis in DB with signals, pipeline archived
```

## Instructions

### Step 1: Read Pipeline State

Read from the idea directory:

1. `_meta.yaml` — current_stage, status, confidence, linked_thesis_id (if exists from stage-1)
2. `stage-2-thesis.md` — the falsifiable thesis with failure modes
3. `stage-3-unknowns.md` — unknowns and kill/conviction conditions
4. `stage-4-evidence.md` — research findings and synthesis (if exists)
5. `stage-5-expression.md` — expression and positioning (if exists)

**Validate readiness**: The idea should be at Stage 4 (with ADVANCE or MODIFY decision) or Stage 5. If the idea is at an earlier stage or has status `killed`, stop and inform the user.

### Step 2: Determine Graduation Path

Based on the pipeline research, determine:

**Thesis type**:
- If the idea is about a structural condition/theme → `macro thesis`
- If the idea targets a specific ticker/asset → `asset thesis`
- If both: create the macro thesis first, then the asset thesis linked to it

**Conviction level**:
- Confidence >= 0.65 and Stage 5 ACT → thesis starts at `developing`, ready for articulation + signals → `monitoring`
- Confidence 0.50-0.64 or Stage 5 WATCH → thesis starts at `developing` with monitoring signals but no active positions
- Confidence < 0.50 → should have been killed; warn user

Present the graduation plan to the user:
```
Graduation Plan for {idea title}:

  Pipeline confidence: {X.XX}
  Stage 5 decision: {ACT / WATCH / not reached}

  Thesis type: {macro / asset}
  Initial status: developing → monitoring (after articulation)
  Direction: {bullish / bearish / neutral}
  Confidence: {exploratory / low / medium / high}

  Claims to link: {count from research}
  Signals expected: {count from Stage 4 kill/conviction conditions}

Proceed? (y/n)
```

### Step 3: Create or Update Thesis Entity

**If `linked_thesis_id` exists in `_meta.yaml`** (thesis was created at Stage 1):
- The thesis already exists in the DB as a draft
- Update its description from the refined Stage 2 thesis
- Update pipeline_stage to current stage
- Update confidence_level

```bash
cd trade-journal && npx tsx scripts/psql-query.ts "
  UPDATE macro_theses
  SET description = '{refined description from stage-2}',
      pipeline_stage = {current_stage},
      confidence_level = '{mapped confidence}',
      updated_at = now()
  WHERE id = '{linked_thesis_id}'
" --format json
```

**If no `linked_thesis_id`** (older pipeline idea, thesis not yet in DB):
- Create it using the ops script:

```bash
cd trade-journal && npx tsx scripts/ops/create-macro-thesis.ts \
  --title "{thesis title from stage-2}" \
  --description "{thesis description}" \
  --thesis-type "{secular|cyclical|structural}" \
  --direction "{bullish|bearish|neutral}" \
  --confidence "{mapped confidence}" \
  --pipeline-stage {current_stage} \
  --pipeline-idea-ref "{idea_id}-{slug}"
```

- Record the returned ID in `_meta.yaml` as `linked_thesis_id`

**Confidence mapping** (pipeline confidence → DB confidence_level):
- 0.80+ → `high`
- 0.65-0.79 → `medium`
- 0.50-0.64 → `low`
- Below 0.50 → `exploratory`

### Step 4: Link Research Claims to Thesis

If the pipeline research was uploaded to the Trade Journal database (via `/finalize-for-upload`), find the claims and link them:

```bash
cd trade-journal && npx tsx scripts/psql-query.ts "
  SELECT id, title, claim FROM main_claims
  WHERE source_insight_id IN (
    SELECT id FROM research_insights
    WHERE title ILIKE '%{keyword from idea}%'
  )
  AND status = 'active'
" --format json
```

For each claim found, link it to the thesis:

```bash
cd trade-journal && npx tsx scripts/ops/link-claim-to-thesis.ts \
  --claim-id "{claim_id}" \
  --thesis-id "{thesis_id}" \
  --thesis-type macro \
  --mapping-type supports
```

If claims haven't been uploaded yet, note this as a follow-up action.

### Step 5: Build Core Argument

Run `/build-core-argument` for the thesis. The skill will automatically detect the `pipeline_idea_ref` and load pipeline research files as additional context (see Step 1b in build-core-argument SKILL.md).

This step creates:
- Versioned articulation (core argument, key drivers, assumptions)
- Focused signals derived from both claims AND pipeline research kill/conviction conditions
- Promotes thesis from `developing` → `monitoring` (if signals created)

```
/build-core-argument {thesis_id}
```

### Step 6: Create Macro-to-Macro Links (if applicable)

If the pipeline research identified parent/supporting macro theses, create the relationships:

```bash
cd trade-journal && npx tsx scripts/psql-query.ts "
  INSERT INTO macro_thesis_related_macro_theses
    (source_macro_thesis_id, target_macro_thesis_id, relationship_type, relationship_note, added_by)
  VALUES
    ('{parent_thesis_id}', '{new_thesis_id}', 'parent_of', '{relationship description}', 'graduate-pipeline-idea')
" --format json
```

Common relationships from pipeline research:
- Deglobalization → National Resilience (`parent_of`)
- AI Infrastructure → AI Hyperscalers (`parent_of`)
- Monetary Debasement → Tokenisation (`supports`)

### Step 7: Update Pipeline State

Update `_meta.yaml`:

```yaml
status: graduated
graduated_at: "{ISO timestamp}"
linked_thesis_id: "{thesis_id}"
linked_thesis_type: "{macro|asset}"

stage_history:
  - stage: graduation
    started_at: "{ISO timestamp}"
    completed_at: "{ISO timestamp}"
    decision: graduated
    note: "Pipeline idea graduated to Trade Journal. Thesis ID: {id}, status: monitoring"
```

Add a journal entry for the thesis:

```bash
cd trade-journal && npx tsx scripts/ops/add-journal-note.ts \
  --entity-type macro_thesis \
  --id "{thesis_id}" \
  --note "Graduated from research pipeline ({idea_id}). Pipeline confidence: {X.XX}, stage reached: {N}. Articulation and signals created."
```

### Step 8: Output Summary

```
Pipeline Graduation Complete!

  Pipeline: {idea_id} — {title}
  Status: graduated

  Thesis created/updated:
  - ID: {thesis_id}
  - Type: {macro|asset}
  - Status: monitoring
  - Confidence: {level}

  Claims linked: {count}
  Signals created: {count} ({N} confirmation, {N} invalidation)

  Macro-to-macro links: {list or "none"}

  Pipeline state: graduated (files preserved for reference)
```

## Notes

- This skill orchestrates other skills (/build-core-argument) — it is the top-level graduation workflow
- Pipeline files are preserved after graduation (not deleted) — they serve as research provenance
- If the thesis already has an articulation and signals (e.g., from a manual `/build-core-argument` run), this skill will still run the full workflow but `insert-thesis-articulation.ts` will create a new version
- For asset thesis graduation, you'll also need to create the underlying (if not exists) and link to a parent macro thesis via the junction table
- The two-tier architecture (Phase 1 schema) enables macro thesis signals to gate asset thesis creation via `CONSIDER_ASSET_EXPRESSION` triage items (Phase 3)
