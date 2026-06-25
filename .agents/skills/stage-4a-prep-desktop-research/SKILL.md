# Prepare Desktop Research Prompt

## Purpose

Generates a complete, **fully self-contained** prompt for Claude Desktop Deep Research. This bridges Claude Code (where the pipeline state lives) with Claude Desktop (where Deep Research runs).

The generated prompt includes ALL context needed - no external project or templates required.

## Input

Idea directory path, unknown number, and track type:
- `/stage-4a-prep-desktop-research idea-001-energy-storage 1 falsification`
- `/stage-4a-prep-desktop-research idea-001-advanced-packaging-growth 2 validation`

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

Output a complete, self-contained prompt that the user can copy/paste into Claude Desktop.

**IMPORTANT**: The prompt must be fully self-contained with:
1. The thesis and unknown context
2. Track-specific instructions
3. The complete output format template

Use this format:

```
## Ready for Claude Desktop (Self-Contained)

Copy everything below the line and paste into Claude Desktop.

---

Research **unknown {N}** for the thesis using **{track}** track.

**Thesis:**
> {Core thesis from stage-2}

**Unknown {N}: {Title}**

{Description of the unknown - include the full "Question" and "Decision Impact" text from stage-3}

**Kill Condition:**
{Exact kill condition text from stage-3}

**Conviction Increase Condition:**
{Exact conviction increase condition text from stage-3}

**Research Queries (use as starting points):**
1. {Query 1}
2. {Query 2}
3. {Query 3}
4. {Query 4 if exists}

**Track Instructions ({track}):**
{Track-specific instructions - see below}

---

## CRITICAL: Source Citation Requirements

**Do NOT rely on the built-in citation system** - citations visible in the Claude Desktop UI are stripped when exporting to markdown.

Instead, you MUST:
1. **Embed all URLs directly in markdown link format**: `[Source Name](https://full-url-here)`
2. **Use inline links throughout** the Findings section (e.g., "According to [Goldman Sachs Research](https://example.com/report.pdf)...")
3. **Include a References section** at the end with all sources listed with full URLs

Example of correct citation format:
```
### Finding 1: Goldman Projects Surplus Through 2028
- **Source**: Industry report
- **Source URL/Reference**: [Goldman Sachs Commodities Research](https://www.goldmansachs.com/insights/copper-outlook-2026.pdf)
- **Content**: Goldman analyst Eoin Dinsmore stated in their [January 2026 outlook](https://www.goldmansachs.com/insights/copper-outlook-2026.pdf) that...
```

---

## Required Output Format

Structure your findings EXACTLY as follows (this format is required for downstream processing):

{Track-specific output template - see below}

---

## After Research Completes

Save the output as: `unknown-{N}-{track}-analysis.md`

Location: `research-workspace/pipeline/{idea-folder}/`

Then return to Claude Code and run:
```
/stage-4b-synthesize-evidence {idea-path}
```
```

### Track-Specific Instructions and Output Templates

**For falsification:**

Instructions:
```
Your primary goal is to find evidence that CONTRADICTS this thesis. Search for:
- Evidence that the kill condition is being met
- Counterexamples and opposing expert views
- Structural reasons why the thesis might fail
- Data that undermines key assumptions
- Failed predictions in similar domains

Be adversarial. Surface contradictions aggressively. The goal is to DISPROVE the thesis.
```

Output template:
````markdown
# Unknown {N} Falsification: {Unknown Title}

**Research Date**: {YYYY-MM-DD}
**Objective**: Find evidence that this thesis is WRONG

## Findings

### Finding 1: {Descriptive Title}
- **Source**: {company filing | industry report | academic paper | expert opinion | news/media}
- **Source URL/Reference**: {link or citation}
- **Credibility**: {high | medium | low} - {brief justification}
- **Content**: {What the evidence shows - be specific with numbers/quotes}
- **Bearing on thesis**: {How this affects the thesis - does it support the kill condition?}

### Finding 2: {Descriptive Title}
{Same structure}

### Finding 3: {Descriptive Title}
{Same structure}

{Continue for all relevant findings - aim for 5-10 findings}

## Kill Condition Assessment

**Kill condition from thesis**:
> {Quote the exact kill condition}

**Evidence FOR kill condition being triggered**:
- {Specific evidence that suggests kill condition is met}
- {More evidence}

**Evidence AGAINST kill condition being triggered**:
- {Specific evidence that suggests kill condition is NOT met}
- {More evidence}

**Assessment**: {TRIGGERED | NOT TRIGGERED | PARTIALLY TRIGGERED | INCONCLUSIVE}

**Confidence in assessment**: {high | medium | low} - {why}

## Caveats and Limitations

- {What couldn't be verified or found}
- {Data gaps or stale information}
- {Potential biases in sources consulted}
- {Areas that need deeper investigation}

## Summary

{2-3 paragraphs synthesizing what the falsification research found:
- Did the thesis survive the attempt to kill it?
- What's the strongest counterargument discovered?
- What surprised you in the research?
- What remains uncertain?}

## References

{List all sources with full URLs in markdown link format}

1. [Source Name 1](https://full-url-1)
2. [Source Name 2](https://full-url-2)
3. [Source Name 3](https://full-url-3)
{Continue for all sources cited}
````

**For validation:**

Instructions:
```
Your goal is to find evidence that SUPPORTS this thesis with clear mechanism. Search for:
- Evidence that the conviction increase condition is being met
- Supporting data with causal explanations (WHY, not just WHAT)
- Expert commentary supporting the view
- Corroborating independent sources
- Leading indicators that suggest the thesis is playing out

Focus on the MECHANISM - why would this thesis work? Don't just find confirming data, find explanatory evidence.
```

Output template:
````markdown
# Unknown {N} Validation: {Unknown Title}

**Research Date**: {YYYY-MM-DD}
**Objective**: Find evidence that SUPPORTS this thesis with clear mechanism

## Findings

### Finding 1: {Descriptive Title}
- **Source**: {company filing | industry report | academic paper | expert opinion | news/media}
- **Source URL/Reference**: {link or citation}
- **Credibility**: {high | medium | low} - {brief justification}
- **Content**: {What the evidence shows - be specific with numbers/quotes}
- **Mechanism validation**: {Does this explain WHY the thesis works, not just that it might?}

### Finding 2: {Descriptive Title}
{Same structure}

### Finding 3: {Descriptive Title}
{Same structure}

{Continue for all relevant findings - aim for 5-10 findings}

## Conviction Condition Assessment

**Conviction increase condition from thesis**:
> {Quote the exact conviction condition}

**Evidence that conviction condition IS being met**:
- {Specific supporting evidence}
- {More evidence}

**Evidence that conviction condition is NOT being met**:
- {Contradicting evidence found during validation}
- {More evidence}

**Assessment**: {MET | NOT MET | PARTIALLY MET | INCONCLUSIVE}

**Confidence in assessment**: {high | medium | low} - {why}

## Mechanism Analysis

**Core causal chain**:
{Describe the mechanism: A causes B causes C causes thesis outcome}

**Evidence supporting each link**:
- A → B: {evidence}
- B → C: {evidence}
- C → outcome: {evidence}

**Weakest link in the chain**: {which connection has least support}

## Caveats and Limitations

- {What couldn't be verified or found}
- {Confirmation bias risks in this research}
- {Data gaps or stale information}
- {Areas that need deeper investigation}

## Summary

{2-3 paragraphs synthesizing what the validation research found:
- How strong is the support for this thesis?
- Is the mechanism well-supported or speculative?
- What's the strongest supporting evidence?
- What concerns emerged even while validating?}

## References

{List all sources with full URLs in markdown link format}

1. [Source Name 1](https://full-url-1)
2. [Source Name 2](https://full-url-2)
3. [Source Name 3](https://full-url-3)
{Continue for all sources cited}
````

**For analogues:**

Instructions:
```
Your goal is to find HISTORICAL PRECEDENTS with similar dynamics. Search for:
- Similar technological/regulatory/competitive shifts in history
- Cases where similar supply/demand dynamics played out
- What actually happened vs what was predicted at the time
- What determined winners vs losers
- How long the cycle took to play out

Document both SUCCESSES and FAILURES of analogous situations. The goal is pattern-matching, not cherry-picking.
```

Output template:
````markdown
# Unknown {N} Analogues: {Unknown Title}

**Research Date**: {YYYY-MM-DD}
**Objective**: Find historical precedents with similar dynamics

## Analogues Identified

### Analogue 1: {Title - e.g., "China Commodity Boom 2003-2008"}

**Situation**: {What happened - the setup}
**Timeframe**: {When it occurred}
**Key dynamics**: {What made this situation similar to current thesis}

**Consensus view at the time**: {What most people believed would happen}
**Actual outcome**: {What really happened}
**Timeline**: {How long did it take to play out}

**Winners**: {Who benefited and why}
**Losers**: {Who lost and why}

**Similarity to current thesis**: {high | medium | low}
**Key similarities**:
- {Similarity 1}
- {Similarity 2}

**Key differences**:
- {Difference 1 - why current situation may play out differently}
- {Difference 2}

**Lessons for current thesis**:
- {What this analogue suggests about likely outcome}
- {What to watch for}

---

### Analogue 2: {Title}
{Same structure}

---

### Analogue 3: {Title}
{Same structure}

{Aim for 3-5 relevant analogues}

## Cross-Analogue Patterns

**Common patterns across analogues**:
1. {Pattern that appeared in multiple analogues}
2. {Another pattern}
3. {Another pattern}

**Divergent outcomes and why**:
- {Case where outcome differed and the reason}

**Average timeline**: {How long similar situations took to resolve}

**Success rate**: {X of Y analogues supported the thesis-equivalent outcome}

## Implications for Current Thesis

**What analogues suggest about**:
- **Likely outcome**: {based on pattern matching}
- **Timeline**: {when we might see resolution}
- **Magnitude**: {how big the move could be}
- **Key risks**: {what derailed similar situations}

## Caveats and Limitations

- {Why historical analogues may not apply}
- {Structural differences in current environment}
- {Sample size limitations}

## Summary

{2-3 paragraphs synthesizing what the analogues research found:
- What's the base rate for this type of thesis succeeding?
- What's the typical timeline?
- What's the most instructive analogue and why?
- What would make the current situation different?}

## References

{List all sources with full URLs in markdown link format}

1. [Source Name 1](https://full-url-1)
2. [Source Name 2](https://full-url-2)
3. [Source Name 3](https://full-url-3)
{Continue for all sources cited}
````

### Step 3: Provide Workflow Reminder

After outputting the prompt, add:

```
---

## Workflow Reminder

1. Copy everything above (from "Research **unknown..." to the end of the output template)
2. Open Claude Desktop
3. Paste and run Deep Research (no special project needed - prompt is self-contained)
4. Save the output as `unknown-{N}-{track}-analysis.md` in the idea folder
5. Return to Claude Code for next track or run `/stage-4b-synthesize-evidence` when done
```

## Notes

- This skill is read-only; it doesn't modify any files
- The generated prompt is FULLY SELF-CONTAINED - no Claude Desktop project setup required
- Track type must be: falsification, validation, or analogues
- The output templates are designed to be parseable by the Stage 4B synthesis skill
- **Source citations must use inline markdown links** - Claude Desktop's native citation system does not export to markdown
