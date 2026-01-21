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

## Input

An idea directory path, unknown ID, and track type:
- `/research-unknown pipeline/idea-001-energy-storage unknown-1 falsification`
- `/research-unknown pipeline/idea-001-energy-storage unknown-2 validation`
- `/research-unknown pipeline/idea-001-energy-storage unknown-1 analogues`

## Output

- Appends findings to `stage-4-evidence.md`
- Creates the file from template if it doesn't exist

## Instructions

When the user asks to research an unknown:
- "Research unknown 1 for idea-001 using falsification track"
- "/research-unknown pipeline/idea-001-energy-storage unknown-1 falsification"
- "Find disconfirming evidence for unknown 2"
- "Look for historical analogues for this thesis"

### Step 1: Read Context

Read from the idea directory:

1. `_meta.yaml` - Get current stage and thesis title
2. `stage-2-thesis.md` - Get the core thesis
3. `stage-3-unknowns.md` - Get the specific unknown being researched

Extract for the specified unknown:
- Unknown title and description
- Kill condition
- Conviction increase condition
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

Use WebSearch and WebFetch to find relevant information.

**Search Strategy by Track:**

**Falsification Track:**
- Search for counterexamples
- Search for opposing expert views
- Search for failed predictions in this domain
- Look for structural reasons why thesis might fail

**Validation Track:**
- Search for supporting data and evidence
- Search for expert commentary supporting the view
- Look for mechanism explanations
- Find corroborating independent sources

**Analogues Track:**
- Search for historical precedents
- Look for similar situations in different markets/sectors
- Find case studies of comparable dynamics
- Search for academic research on similar patterns

### Step 4: Document Findings

For each finding, document:

```markdown
#### Finding {N}: {title}

**Source**: {URL or reference}
**Source Type**: {company_filing | industry_data | expert_opinion | academic | media}
**Credibility**: {0.0-1.0}

**Content**:
{Key facts and quotes from the source}

**Bearing on Thesis**:
{How this finding affects the thesis - supports, contradicts, or qualifies}

**Caveats**:
{Limitations of this evidence, potential biases, missing context}
```

### Step 5: Write to Evidence File

If `stage-4-evidence.md` doesn't exist, create it from template:

```markdown
---
stage: 4
title: "Evidence Resolution"
source_thesis: "{thesis_title}"
created_at: "{timestamp}"
---

# Evidence Resolution: {thesis_title}

## Research Findings

{findings will be appended here}

---

## Evidence Synthesis

{To be completed by /synthesize-evidence}
```

Append findings under the appropriate unknown and track:

```markdown
### Unknown {N}: {unknown_title}

#### {Track} Track

**Research Date**: {ISO date}
**Researcher**: Claude

**Findings**:

{Insert findings here}

**Track Summary**:
- Total findings: {N}
- Key takeaway: {one sentence summary}
- Impact on thesis: {strengthens | weakens | neutral | mixed}
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
| 1 | {title} | {type} | {0.X} | {strengthens/weakens/neutral} |
| 2 | {title} | {type} | {0.X} | {strengthens/weakens/neutral} |

### Track Assessment

**Overall Track Conclusion**:
{What this track's research suggests about the unknown}

**Kill Condition Status**:
{Does any finding trigger the kill condition? yes/no/partially}

**Conviction Impact**:
{Does any finding meet the conviction increase condition? yes/no/partially}

---

Research appended to: stage-4-evidence.md

Next steps:
- Run additional tracks: `/research-unknown {idea_path} {unknown_id} {other_track}`
- Research other unknowns: `/research-unknown {idea_path} unknown-{N} {track}`
- When all research complete: `/synthesize-evidence {idea_path}`
```

## Source Type Reference

| Source Type | Description | Default Credibility |
|-------------|-------------|-------------------|
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

## Research Quality Guidelines

**Good research findings:**
- Specific facts with citations
- Quantitative data where possible
- Direct quotes from primary sources
- Clear attribution

**Avoid:**
- Vague or unsupported claims
- Speculation presented as fact
- Single-source conclusions
- Confirmation bias (especially in validation track)

## Notes

- **Multiple runs expected**: Run this skill 2-3 times per unknown (different tracks)
- **Falsification first**: When possible, run falsification track first to avoid confirmation bias
- **Source diversity**: Aim for 3-5 findings per track from diverse sources
- **Honesty over advocacy**: The goal is truth-finding, not thesis defense
- **Quality over quantity**: Fewer high-quality findings beat many low-quality ones
