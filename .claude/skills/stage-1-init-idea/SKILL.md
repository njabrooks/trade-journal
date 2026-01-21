---
name: stage-1-init-idea
description: Initialize a new pipeline idea from a claim (audit file) or transcript. Creates the idea directory structure with _meta.yaml and stage-1-triage.md. Use this to begin tracking an idea through the research playbook stages.
allowed-tools: Read, Write, Bash, Skill
---

# Initialize Pipeline Idea

## Purpose

Create a new pipeline idea from either:
1. **An existing audit file** - Select a promising main claim that has already been extracted
2. **A raw transcript** - Run `/process-transcript` first, then select a claim

This skill creates the idea directory structure and initializes tracking for progression through the research playbook stages.

## Workflow

```
Input: Audit file path + claim number OR Transcript file path
  |
  v
1. If transcript: Run /process-transcript to create audit
2. Read audit file and list main claims with novelty scores
3. User selects claim to advance
4. Validate novelty score >= 0.6 (warn if below, allow override)
5. Create idea directory: pipeline/idea-XXX-{slug}/
6. Create _meta.yaml with Stage 1 complete
7. Create stage-1-triage.md with claim details
  |
  v
Output: Initialized idea ready for Stage 2 (/formalize-thesis)
```

## Instructions

When the user asks to initialize an idea:
- "Init idea from audit file X, claim Y"
- "Start pipeline for this claim"
- "Create idea from transcript X"

### Step 1: Determine Input Type

**If audit file provided**:
- Read the audit file
- Skip to Step 3

**If transcript file provided**:
- Inform user that you'll run `/process-transcript` first
- Call the `process-transcript` skill: `/process-transcript {transcript_path}`
- After audit is created, proceed to Step 2

### Step 2: Read Audit and List Claims

Read the audit file and extract all main claims with their key metadata:

```
Main Claims Available for Pipeline:

ID    | Title                                | Novelty | Type              | Category
------|--------------------------------------|---------|-------------------|----------
1     | AI agents will replace apps by 2026  | 0.72    | thesis_candidate  | macro
2     | NVIDIA margin pressure from custom   | 0.45    | view_candidate    | asset_specific
3     | Enterprise AI adoption accelerating  | 0.38    | thesis_candidate  | macro
...

Claims with novelty >= 0.6 are recommended for pipeline advancement.
Claims below 0.6 can still be advanced with user override.

Which claim would you like to advance? (Enter claim number)
```

### Step 3: Validate and Get User Selection

After user selects a claim:

1. **If novelty >= 0.6**: Proceed normally
2. **If novelty < 0.6**: Warn the user:
   ```
   Warning: Claim {N} has novelty score {X}, below the recommended threshold of 0.6.

   Low novelty claims may:
   - Already be priced into markets
   - Lack differentiated insight
   - Have lower potential alpha

   Do you want to proceed anyway? (y/n)
   ```

### Step 4: Generate Idea ID and Slug

Determine the next idea ID by scanning existing pipeline directories:

```bash
ls /Users/njb/Desktop/trade-journal/research-workspace/pipeline/ | grep "^idea-" | sort -V | tail -1
```

- If no existing ideas: Start with `idea-001`
- Otherwise: Increment from highest existing ID

Generate slug from claim title:
- Lowercase
- Replace spaces with hyphens
- Remove special characters
- Truncate to ~30 chars
- Example: "AI agents will replace apps by 2026" → "ai-agents-replace-apps-2026"

### Step 5: Create Directory Structure

```bash
mkdir -p /Users/njb/Desktop/trade-journal/research-workspace/pipeline/idea-{XXX}-{slug}
```

### Step 6: Create _meta.yaml

Create the metadata file with initial state:

```yaml
# Pipeline Idea Metadata
idea_id: "idea-{XXX}"
title: "{Full claim title}"
slug: "{slug}"

# Progression State
current_stage: 1
status: active

# Source Reference
source_claim_id: "claim-{N}"
source_audit: "{path to audit file}"

# Confidence Tracking
confidence: {novelty_score}
confidence_history:
  - stage: 1
    value: {novelty_score}
    date: "{today ISO date}"
    note: "Novelty score from forensic extraction"

# Stage History
stage_history:
  - stage: 1
    started_at: "{ISO timestamp}"
    completed_at: "{ISO timestamp}"
    decision: advance
    note: "Claim selected from audit. Novelty: {score}, mechanism plausible."

# Timestamps
created_at: "{ISO timestamp}"
updated_at: "{ISO timestamp}"
```

### Step 7: Create stage-1-triage.md

Copy the full claim details from the audit into the Stage 1 file:

```markdown
---
stage: 1
title: "Signal Triage"
source_audit: "{audit file path}"
source_claim_id: "claim-{N}"
created_at: "{ISO timestamp}"
---

# Stage 1: Signal Triage

## Selected Claim

{Copy the FULL claim structure from the audit, including:}

### Claim {N}: {Title}

**Level**: main
**Type**: {thesis_candidate | view_candidate}
**Category**: {macro | asset_specific}
**Tickers**: {list}
**Time Horizon**: {long_term | medium_term | short_term}
**Qualifier**: {high | medium | low | exploratory}
**Novelty Score**: {0.0-1.0}
**Consensus View**: {what market currently assumes}

**Claim**:
{The claim text}

**Evidence**:
{List all evidence with timestamps}

**Reasoning**:
{Why evidence supports claim}

**Backing**:
{Theoretical/historical support}

**Rebuttal**:
{Counter-arguments}

**Supporting Evidence Claims**: {list}
**Rebutting Evidence Claims**: {list}

---

## Gate Assessment

**Decision**: advance
**Rationale**: Claim selected for pipeline advancement. Novelty score {X} {meets threshold | below threshold but user override approved}. Mechanism is {plausible | needs validation}.

---

## Next Step

Run `/formalize-thesis pipeline/idea-{XXX}-{slug}` to proceed to Stage 2: Theme Formalisation.
```

### Step 8: Confirm Creation

Output confirmation:

```
Idea initialized successfully!

  ID: idea-{XXX}
  Title: {title}
  Location: research-workspace/pipeline/idea-{XXX}-{slug}/

  Files created:
  - _meta.yaml (tracking metadata)
  - stage-1-triage.md (claim details)

  Current stage: 1 (Signal Triage) - COMPLETE
  Confidence: {novelty_score}

Next step: Run `/formalize-thesis pipeline/idea-{XXX}-{slug}` to proceed to Stage 2.
```

## Notes

- This skill does NOT perform Stage 2 work - it only initializes the idea
- If the audit file doesn't have novelty_score or consensus_view fields, warn the user that the audit was created before the enhancement
- The pipeline directory is `research-workspace/pipeline/` (project-local, not Obsidian vault)
- Ideas can be initialized from any audit file, including older ones
