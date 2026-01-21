---
name: research-unknown-desktop
description: Stage 4A research skill optimized for Claude desktop Deep Research. Produces consistent output format for consolidation into stage-4-evidence.md.
allowed-tools: Deep Research, Read (GitHub connector)
---

# Research Unknown - Desktop Deep Research

## Purpose

This skill is designed for Claude desktop app with Deep Research enabled. It researches a single decision-critical unknown from the research playbook Stage 3 using one of three parallel tracks.

**Environment**: Claude desktop app with GitHub connector (read-only)
**Mode**: Deep Research enabled in chat

## Input

The user will provide:
1. **Idea directory path** containing stage-3-unknowns.md
2. **Unknown number** (1, 2, or 3)
3. **Track type**: falsification, validation, or analogues

Example: "Research unknown 3 for idea-001-advanced-packaging-growth using falsification track"

## Research Tracks

| Track | Focus | Guiding Question |
|-------|-------|------------------|
| **falsification** | Find disconfirming evidence | "What would prove this wrong?" |
| **validation** | Find confirming evidence with mechanism | "What supports this and why?" |
| **analogues** | Find historical precedents | "When has something similar happened?" |

## Instructions

### Step 1: Read Context Files

Read from the idea directory via GitHub connector:
- `_meta.yaml` - Current stage and thesis context
- `stage-2-thesis.md` - Core thesis and failure modes
- `stage-3-unknowns.md` - The specific unknown being researched

Extract for the specified unknown:
- Unknown title and description
- Kill condition (what would invalidate thesis)
- Conviction increase condition (what would strengthen thesis)
- Recommended sources
- Research queries

### Step 2: Conduct Deep Research

Use Deep Research to investigate the unknown based on the track type.

**Falsification Track Focus:**
- Search for counterexamples to the thesis
- Find opposing expert views with credentials
- Look for structural reasons why thesis might fail
- Search for failed predictions in this domain

**Validation Track Focus:**
- Search for supporting data and evidence
- Find expert commentary supporting the view
- Look for mechanism explanations
- Find corroborating independent sources

**Analogues Track Focus:**
- Search for historical precedents
- Find similar situations in different markets/sectors
- Look for case studies of comparable dynamics
- Search for academic research on similar patterns

### Step 3: Document Findings

**CRITICAL: Use this exact output format for consistency.**

```markdown
---
unknown_id: {unknown-N}
unknown_title: "{title from stage-3}"
track: {falsification | validation | analogues}
research_date: "{YYYY-MM-DD}"
thesis_title: "{from stage-2}"
---

# {Track} Analysis: {Unknown Title}

**Bottom line:** {2-3 sentence summary of what the research found and its impact on the thesis}

---

## Kill Condition Assessment

**Kill Condition from Stage 3:**
> {Quote the exact kill condition from stage-3-unknowns.md}

**Status:** {NOT TRIGGERED | PARTIALLY TRIGGERED | TRIGGERED}
**Confidence:** {High | Medium | Low}

**Evidence Summary:**
{Brief explanation of why the kill condition is or isn't triggered}

---

## Conviction Condition Assessment

**Conviction Increase Condition from Stage 3:**
> {Quote the exact conviction increase condition from stage-3-unknowns.md}

**Status:** {NOT MET | PARTIALLY MET | MET}
**Confidence:** {High | Medium | Low}

**Evidence Summary:**
{Brief explanation of whether conviction should increase}

---

## Research Findings

### Finding 1: {Title}

**Source:** {URL or reference}
**Source Type:** {company_filing | industry_data | expert_opinion | academic | media}
**Credibility:** {0.0-1.0}
**Date:** {Publication date}

**Content:**
{Key facts, data points, and direct quotes from the source}

**Bearing on Thesis:**
{How this finding affects the thesis - supports, contradicts, or qualifies}

**Caveats:**
{Limitations of this evidence, potential biases, missing context}

---

### Finding 2: {Title}
{Same structure as Finding 1}

---

### Finding 3: {Title}
{Same structure as Finding 1}

---

{Add more findings as needed, typically 3-6 per track}

---

## Source Credibility Summary

| Source | Type | Credibility | Key Contribution |
|--------|------|-------------|------------------|
| {name} | {type} | {0.X} | {what it tells us} |
| {name} | {type} | {0.X} | {what it tells us} |

---

## Track Summary

**Total Findings:** {N}
**Source Breakdown:** {X} company filings, {Y} industry data, {Z} expert opinion, etc.

**Key Takeaway:**
{One sentence summary of what this track's research revealed}

**Impact on Thesis:** {strengthens | weakens | neutral | mixed}

**Kill Condition Status:** {Does any finding trigger the kill condition? Explain briefly}

**Conviction Impact:** {Does any finding meet the conviction increase condition? Explain briefly}

---

## Next Steps

- Additional tracks to run: `/research-unknown-desktop {idea_path} unknown-{N} {other_track}`
- Other unknowns to research: Check stage-3-unknowns.md for priority order
- When all research complete: Consolidate findings into stage-4-evidence.md
```

## Source Type Reference

| Source Type | Description | Default Credibility |
|-------------|-------------|---------------------|
| `company_filing` | SEC filings, earnings calls, investor presentations | 0.8 |
| `industry_data` | Industry reports, market data, trade publications | 0.7 |
| `expert_opinion` | Analyst reports, expert interviews, conference talks | 0.5-0.7 |
| `academic` | Peer-reviewed papers, working papers, research | 0.7-0.9 |
| `media` | News articles, commentary, general press | 0.3-0.5 |

Adjust credibility based on:
- Source reputation and track record
- Potential conflicts of interest
- Recency of information
- Corroboration with other sources

## Quality Guidelines

**Good research findings include:**
- Specific facts with citations and dates
- Quantitative data where possible
- Direct quotes from primary sources
- Clear attribution to named individuals/organizations

**Avoid:**
- Vague or unsupported claims
- Speculation presented as fact
- Single-source conclusions
- Confirmation bias (especially in validation track)

## Notes

- **Multiple runs expected**: Run this skill 2-3 times per unknown (different tracks)
- **Falsification first**: When possible, run falsification track first to avoid confirmation bias
- **Source diversity**: Aim for 3-6 findings per track from diverse sources
- **Honesty over advocacy**: The goal is truth-finding, not thesis defense
- **Quality over quantity**: Fewer high-quality findings beat many low-quality ones
- **Consistent format**: Following the exact template above enables easy consolidation

## File Naming Convention

Save the output file as:
`{unknown-N}-{track}-analysis.md`

Examples:
- `unknown-3-falsification-analysis.md`
- `unknown-1-validation-analysis.md`
- `unknown-2-analogues-analysis.md`

This naming enables the `/synthesize-evidence` skill to easily locate and consolidate all research outputs.
