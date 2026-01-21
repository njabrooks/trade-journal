---
name: stage-4a-prep-desktop-research
description: Generate a ready-to-paste prompt for Claude Desktop Deep Research. Extracts context from pipeline idea and formats for Stage 4 research.
allowed-tools: Read, Glob
---

# Prepare Desktop Research Prompt

## Purpose

Generates a complete, ready-to-paste prompt for Claude Desktop Deep Research. This bridges Claude Code (where the pipeline state lives) with Claude Desktop (where Deep Research runs).

## Input

Idea directory path, unknown number, and track type:
- `/prep-desktop-research pipeline/idea-001-energy-storage 1 falsification`
- `/prep-desktop-research pipeline/idea-001-advanced-packaging-growth 2 validation`

## Instructions

### Step 1: Read Context

Read from the specified idea directory:

1. `_meta.yaml` - Get thesis title
2. `stage-2-thesis.md` - Get core thesis statement
3. `stage-3-unknowns.md` - Get the specific unknown

Extract for the specified unknown:
- Unknown title and description
- Kill condition (exact text)
- Conviction increase condition (exact text)
- Research queries

### Step 2: Generate Prompt

Output a complete prompt that the user can copy/paste into Claude Desktop.

Format:

```
## Ready for Claude Desktop

Copy everything below the line and paste into Claude Desktop with your "Research Playbook - Stage 4" project selected.

---

Research **unknown {N}** for the thesis using **{track}** track.

**Thesis:**
> {Core thesis from stage-2}

**Unknown {N}: {Title}**

{Description of the unknown}

**Kill Condition:**
{Exact kill condition text}

**Conviction Increase Condition:**
{Exact conviction increase condition text}

**Research Queries (use as starting points):**
1. {Query 1}
2. {Query 2}
3. {Query 3}

**Track Instructions:**
{Track-specific instructions}

Please conduct Deep Research and format your findings using the output template from the project instructions.

---

## After Research Completes

Save the output as: `unknown-{N}-{track}-analysis.md`

Location: `research-workspace/pipeline/{idea-folder}/`

Then return here and run:
```
/synthesize-evidence {idea-path}
```
```

### Track-Specific Instructions

**For falsification:**
```
Your primary goal is to find evidence that CONTRADICTS this thesis. Search for:
- Evidence that the kill condition is being met
- Counterexamples and opposing expert views
- Structural reasons why the thesis might fail
- Failed predictions in this domain

Be adversarial. Surface contradictions aggressively.
```

**For validation:**
```
Your goal is to find evidence that SUPPORTS this thesis with clear mechanism. Search for:
- Evidence that the conviction increase condition is being met
- Supporting data with causal explanations
- Expert commentary supporting the view
- Corroborating independent sources

Focus on WHY the thesis would work, not just WHAT supports it.
```

**For analogues:**
```
Your goal is to find HISTORICAL PRECEDENTS with similar dynamics. Search for:
- Similar technological/regulatory/competitive shifts
- Cases where similar theses played out
- What actually happened vs what was predicted
- What determined winners vs losers

Document both successes and failures of analogous situations.
```

### Step 3: Provide Next Steps

After outputting the prompt, remind the user:

```
## Workflow Reminder

1. Copy the prompt above
2. Open Claude Desktop → "Research Playbook - Stage 4" project
3. Paste and run Deep Research
4. Save output as `unknown-{N}-{track}-analysis.md` in the idea folder
5. Return here for next track or `/synthesize-evidence` when done
```

## Example Output

```
## Ready for Claude Desktop

Copy everything below the line and paste into Claude Desktop with your "Research Playbook - Stage 4" project selected.

---

Research **unknown 1** for the thesis using **falsification** track.

**Thesis:**
> Advanced packaging (chiplets, 2.5D/3D) will capture disproportionate semiconductor value through 2028 as node scaling economics deteriorate.

**Unknown 1: N2/18A Cost-Per-Transistor Trajectory**

This is the core premise of the thesis. If next-generation nodes (TSMC N2, Intel 18A) deliver cost-per-transistor improvements at historical rates, advanced packaging remains a niche premium solution rather than a structural shift.

**Kill Condition:**
- N2 wafer pricing comes in at <1.5x N3 pricing (historical node progression)
- Major AI chip designers (AMD, NVIDIA, hyperscalers) announce monolithic N2 designs over chiplet alternatives
- TSMC/Intel guide to continued cost-per-transistor improvement through 2028
- EUV high-NA demonstrates >80% yield within 18 months of introduction

**Conviction Increase Condition:**
- N2 wafer pricing exceeds 2x N3 pricing
- Major designers explicitly cite cost as reason for chiplet architecture
- Intel 18A delays or yield struggles continue
- Foundry CapEx guidance shifts toward packaging vs. leading-edge node expansion

**Research Queries (use as starting points):**
1. What is the projected N2 wafer price vs N3, and how does this compare to historical node transitions?
2. What are AMD and NVIDIA's announced roadmaps for monolithic vs chiplet architectures at N2?
3. What is TSMC's CapEx allocation between leading-edge node expansion vs advanced packaging capacity?

**Track Instructions:**
Your primary goal is to find evidence that CONTRADICTS this thesis. Search for:
- Evidence that the kill condition is being met
- Counterexamples and opposing expert views
- Structural reasons why the thesis might fail
- Failed predictions in this domain

Be adversarial. Surface contradictions aggressively.

Please conduct Deep Research and format your findings using the output template from the project instructions.

---

## After Research Completes

Save the output as: `unknown-1-falsification-analysis.md`

Location: `research-workspace/pipeline/idea-001-advanced-packaging-growth/`

Then return here and run:
```
/synthesize-evidence research-workspace/pipeline/idea-001-advanced-packaging-growth
```
```

## Notes

- This skill is read-only; it doesn't modify any files
- The generated prompt includes all context Claude Desktop needs
- Works without GitHub connector in Claude Desktop (context is embedded)
- Track type must be: falsification, validation, or analogues
