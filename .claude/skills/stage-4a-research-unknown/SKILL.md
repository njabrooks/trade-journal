---
name: stage-4a-research-unknown
description: Stage 4A - Research a single unknown using one of three tracks (falsification, validation, analogues). Appends findings to stage-4-evidence.md.
allowed-tools: Read, Write, WebSearch, WebFetch
---

# Research Unknown (Stage 4A)

## Purpose

Research a single decision-critical unknown from Stage 3 using one of three parallel tracks:
- **Falsification**: Find disconfirming evidence
- **Validation**: Find confirming evidence with mechanism
- **Analogues**: Find historical precedents

This skill is meant to be run multiple times per unknown (one per track).

**When to use this skill vs `/stage-4a-prep-desktop-research`:**
- Use **this skill** for simpler questions where Claude Code's WebSearch/WebFetch is sufficient
- Use **prep-desktop-research** for complex questions requiring Claude Desktop's Deep Research (more thorough web search)

## Input

An idea directory path, unknown ID, and track type:
- `/stage-4a-research-unknown pipeline/idea-001-energy-storage unknown-1 falsification`
- `/stage-4a-research-unknown pipeline/idea-001-energy-storage unknown-2 validation`
- `/stage-4a-research-unknown pipeline/idea-001-energy-storage unknown-1 analogues`

## Output

- Creates `unknown-{N}-{track}-analysis.md` in the idea directory
- File format matches the template used by `/stage-4a-prep-desktop-research` for consistency

## Instructions

When the user asks to research an unknown:
- "Research unknown 1 for idea-001 using falsification track"
- "/stage-4a-research-unknown pipeline/idea-001-energy-storage unknown-1 falsification"
- "Find disconfirming evidence for unknown 2"
- "Look for historical analogues for this thesis"

### Step 1: Read Context

Read from the idea directory:

1. `_meta.yaml` - Get current stage and thesis title
2. `stage-2-thesis.md` - Get the core thesis
3. `stage-3-unknowns.md` - Get the specific unknown being researched

Extract for the specified unknown:
- Unknown title and description (Question and Decision Impact)
- Kill condition (exact text)
- Conviction increase condition (exact text)
- Recommended sources
- Research queries

### Step 2: Select Research Track

Based on the track parameter, set the research focus:

| Track | Focus | Guiding Question |
|-------|-------|------------------|
| `falsification` | Find disconfirming evidence | "What would prove this wrong?" |
| `validation` | Find confirming evidence with mechanism | "What supports this and why?" |
| `analogues` | Find historical precedents | "When has something similar happened?" |

### Step 3: Conduct Research

Use WebSearch and WebFetch to find relevant information. Use the research queries from Stage 3 as starting points.

**Search Strategy by Track:**

**Falsification Track:**
- Search for evidence that the kill condition is being met
- Search for counterexamples and opposing expert views
- Search for structural reasons why thesis might fail
- Look for data that undermines key assumptions
- Find failed predictions in similar domains

**Validation Track:**
- Search for evidence that the conviction increase condition is being met
- Search for supporting data with causal explanations (WHY, not just WHAT)
- Search for expert commentary supporting the view
- Find corroborating independent sources
- Look for leading indicators that suggest the thesis is playing out

**Analogues Track:**
- Search for similar technological/regulatory/competitive shifts in history
- Find cases where similar supply/demand dynamics played out
- Look for what actually happened vs what was predicted at the time
- Identify what determined winners vs losers
- Document how long the cycle took to play out

### Step 4: Document Findings

**IMPORTANT**: Always include source URLs as markdown links: `[Source Name](https://url)`

For each finding, document using this structure:

```markdown
### Finding {N}: {Descriptive Title}

- **Source**: {company filing | industry report | academic paper | expert opinion | news/media}
- **Source URL/Reference**: [Source Name](https://full-url-here)
- **Credibility**: {high | medium | low} - {brief justification}
- **Content**: {What the evidence shows - be specific with numbers/quotes}
- **Bearing on thesis**: {How this affects the thesis - supports, contradicts, or qualifies}
```

Aim for 5-10 findings per track from diverse sources.

### Step 5: Write Analysis File

Create `unknown-{N}-{track}-analysis.md` in the idea directory using the appropriate template below.

**For falsification track:**

```markdown
# Unknown {N} Falsification: {Unknown Title}

**Research Date**: {YYYY-MM-DD}
**Objective**: Find evidence that this thesis is WRONG

## Findings

### Finding 1: {Descriptive Title}
- **Source**: {company filing | industry report | academic paper | expert opinion | news/media}
- **Source URL/Reference**: [Source Name](https://url)
- **Credibility**: {high | medium | low} - {brief justification}
- **Content**: {What the evidence shows - be specific with numbers/quotes}
- **Bearing on thesis**: {How this affects the thesis - does it support the kill condition?}

### Finding 2: {Descriptive Title}
{Same structure}

{Continue for all relevant findings - aim for 5-10 findings}

## Kill Condition Assessment

**Kill condition from thesis**:
> {Quote the exact kill condition from stage-3-unknowns.md}

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
```

**For validation track:**

```markdown
# Unknown {N} Validation: {Unknown Title}

**Research Date**: {YYYY-MM-DD}
**Objective**: Find evidence that SUPPORTS this thesis with clear mechanism

## Findings

### Finding 1: {Descriptive Title}
- **Source**: {company filing | industry report | academic paper | expert opinion | news/media}
- **Source URL/Reference**: [Source Name](https://url)
- **Credibility**: {high | medium | low} - {brief justification}
- **Content**: {What the evidence shows - be specific with numbers/quotes}
- **Mechanism validation**: {Does this explain WHY the thesis works, not just that it might?}

### Finding 2: {Descriptive Title}
{Same structure}

{Continue for all relevant findings - aim for 5-10 findings}

## Conviction Condition Assessment

**Conviction increase condition from thesis**:
> {Quote the exact conviction condition from stage-3-unknowns.md}

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
```

**For analogues track:**

```markdown
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
```

### Step 6: Output Summary

```
## Research Complete: {unknown_title} - {track} track

**Thesis**: {thesis_title}
**Unknown**: {unknown_title}
**Track**: {track}
**Date**: {date}

### Findings Summary

| # | Finding | Source Type | Credibility | Impact |
|---|---------|-------------|-------------|--------|
| 1 | {title} | {type} | {high/med/low} | {strengthens/weakens/neutral} |
| 2 | {title} | {type} | {high/med/low} | {strengthens/weakens/neutral} |

### Track Assessment

**Kill Condition Status** (falsification): {TRIGGERED | NOT TRIGGERED | PARTIALLY TRIGGERED}
**Conviction Condition Status** (validation): {MET | NOT MET | PARTIALLY MET}

**Overall Track Conclusion**:
{What this track's research suggests about the unknown}

---

Research saved to: unknown-{N}-{track}-analysis.md

Next steps:
- Run additional tracks: `/stage-4a-research-unknown {idea_path} unknown-{N} {other_track}`
- Research other unknowns: `/stage-4a-research-unknown {idea_path} unknown-{M} {track}`
- When all research complete: `/stage-4b-synthesize-evidence {idea_path}`
```

## Source Type Reference

| Source Type | Description | Default Credibility |
|-------------|-------------|-------------------|
| `company_filing` | SEC filings, earnings calls, investor presentations | high |
| `industry_report` | Industry reports, market data, trade publications | high |
| `academic_paper` | Peer-reviewed papers, working papers, research | high |
| `expert_opinion` | Analyst reports, expert interviews, conference talks | medium |
| `news/media` | News articles, commentary, general press | low-medium |

Adjust credibility based on:
- Source reputation and track record
- Potential conflicts of interest
- Recency of information
- Corroboration with other sources

## Research Quality Guidelines

**Good research findings:**
- Specific facts with citations and URLs
- Quantitative data where possible
- Direct quotes from primary sources
- Clear attribution with links

**Avoid:**
- Vague or unsupported claims
- Speculation presented as fact
- Single-source conclusions
- Confirmation bias (especially in validation track)
- Missing source URLs

## Notes

- **Multiple runs expected**: Run this skill 2-3 times per unknown (different tracks)
- **Falsification first**: When possible, run falsification track first to avoid confirmation bias
- **Source diversity**: Aim for 5-10 findings per track from diverse sources
- **Honesty over advocacy**: The goal is truth-finding, not thesis defense
- **Quality over quantity**: Fewer high-quality findings beat many low-quality ones
- **URLs required**: All sources must include clickable markdown links
- **Template consistency**: Output format matches `/stage-4a-prep-desktop-research` for downstream processing
