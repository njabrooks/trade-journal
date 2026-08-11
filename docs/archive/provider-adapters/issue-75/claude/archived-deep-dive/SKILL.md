---
name: deep-dive
description: Guide collaborative deep dive analysis on a specific theme or ticker. Use when developing a new thesis/view or expanding existing research with structured exploration, evidence gathering, and counter-argument analysis.
allowed-tools: Read, Write, mcp__supabase__execute_sql, Bash
---

# Deep Dive Research Analysis

## Purpose

Facilitate a collaborative, structured deep dive on a specific theme or ticker to:
1. Develop new macro theses or asset views
2. Expand existing research with additional evidence
3. Challenge assumptions and explore counter-arguments
4. Structure insights for finalization and upload

This is an interactive, conversational skill that guides the user through systematic analysis.

## Workflow

```
Input: Theme or ticker to explore
  ↓
1. Check existing research (theses, views, artifacts)
2. Frame the analysis (thesis vs view, time horizon, etc.)
3. Guide through structured exploration:
   - Core narrative
   - Supporting evidence
   - Counter-evidence
   - Key risks and catalysts
4. Iteratively refine with user
5. Output to deep-dives/ directory
  ↓
Output: ${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_DEEP_DIVES_DIR}/[theme]-analysis.md
```

## Instructions

When the user asks for a deep dive:
- "Deep dive on NVDA monopoly dynamics"
- "Analyze energy infrastructure constraints"
- "Develop a thesis on semiconductor supply chains"

Follow these steps:

### Step 0: Read Environment Variables and Construct Paths

Before processing, read the Obsidian directory configuration from `.env.local`:

```bash
# Read environment variables
cat /Users/njb/Desktop/trade-journal/.env.local | grep OBSIDIAN
```

Construct the full path:
- **Deep dives directory**: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_DEEP_DIVES_DIR}`

For example, with defaults:
- Deep dives: `/Users/njb/Desktop/nick/investing/research/deep-dives`

Use this path for all deep dive outputs. If env vars are not set, fall back to project-local `research-workspace/deep-dives/` directory.

### Step 1: Check Existing Research

Query the database to see what already exists on this topic:

**Check existing main claims** (first-class claim entities):
```sql
SELECT
  id,
  title,
  category,
  claim,
  qualifier,
  time_horizon,
  relevant_tickers,
  status,
  created_at,
  last_evidence_added_at
FROM main_claims
WHERE status = 'active'
  AND (
    title ILIKE '%keyword%' OR
    claim ILIKE '%keyword%' OR
    '%ticker%' = ANY(relevant_tickers)
  )
ORDER BY created_at DESC;
```

**For themes** (potential macro thesis):
```sql
SELECT
  id,
  title,
  description,
  thesis_type,
  confidence_level,
  time_horizon,
  direction,
  sectors
FROM macro_theses
WHERE status IN ('developing', 'monitoring')
  AND (title ILIKE '%keyword%' OR description ILIKE '%keyword%')
ORDER BY created_at DESC;
```

**For tickers** (potential asset view):
```sql
SELECT
  av.id,
  av.title,
  av.description,
  av.confidence_level,
  av.time_horizon,
  av.direction,
  av.target_price,
  u.ticker,
  mt.title as parent_thesis
FROM asset_theses av
JOIN underlyings u ON av.underlying_id = u.id
LEFT JOIN macro_theses mt ON av.macro_thesis_id = mt.id
WHERE u.ticker = $1
  AND av.status IN ('developing', 'monitoring')
ORDER BY av.created_at DESC;
```

**Also check research artifacts**:
```sql
SELECT
  ra.id,
  ra.title,
  ra.source_type,
  ra.tags,
  ri.summary,
  ri.key_themes
FROM research_artifacts ra
LEFT JOIN research_insights ri ON ra.id = ri.research_artifact_id
WHERE ra.status = 'structured'
  AND (
    ra.title ILIKE '%keyword%' OR
    ri.summary ILIKE '%keyword%' OR
    '%keyword%' = ANY(ri.key_themes)
  )
ORDER BY ra.created_at DESC
LIMIT 5;
```

**Present findings**:
```
📚 Existing Research

Main Claims: 1 found
  - "AI Infrastructure Buildout Will Drive PMI Expansion 2025-2026" (macro, high confidence)
    Created: 2025-01-15
    Evidence count: 3 supporting, 1 rebutting
    Last evidence: 2025-01-18

Macro Theses: 1 found
  - "AI Infrastructure Build-Out" (secular, high confidence)
    Direction: bullish
    Created: 2025-01-15

Asset Views: 0 found for NVDA

Research Artifacts: 2 found
  - "AI Infrastructure Buildout Discussion" (transcript, 2025-01-15)
    Themes: AI infrastructure, datacenter capex, semiconductor demand
  - [Other artifact]

How should we proceed?
1. STRENGTHEN existing main claim with additional evidence
2. Create NEW main claim (distinct perspective)
3. Create NEW macro thesis (distinct from existing)
4. Create NEW asset view
5. ENHANCE existing thesis with more evidence
4. Start fresh analysis (no existing research)

[User chooses]
```

### Step 2: Frame the Analysis

Based on user input and what exists, determine the analysis path:

**If user chooses "STRENGTHEN existing main claim"**:
- Goal: Add additional evidence to existing first-class main claim
- Query existing main claim details including current evidence
- Develop new supporting/rebutting evidence with Toulmin structure
- Output: Deep dive document with evidence to link via `/api/research/link-evidence`
- Skip to Step 3B (Evidence Development)

**If user chooses standard thesis/view creation**:

**Type**:
- Macro Thesis (cross-asset, thematic)
- Asset View (ticker-specific)
- Main Claim (reusable insight worth tracking independently)

**For Macro Thesis**, determine:
- **Thesis Type**: secular, cyclical, structural, tactical
  - Secular: Long-term structural shifts (5-20 years)
  - Cyclical: Business cycle related (1-5 years)
  - Structural: Market structure changes (3-10 years)
  - Tactical: Short-term opportunities (<1 year)

- **Time Horizon**: long_term, medium_term, short_term

**For Asset View**, determine:
- **Ticker**: Symbol to analyze
- **Parent Thesis**: Link to existing macro thesis (optional)
- **Time Horizon**: long_term, medium_term, short_term

**Confirm with user**:
```
📋 Analysis Framework

Type: Asset View
Ticker: NVDA
Parent Thesis: "AI Infrastructure Build-Out"
Time Horizon: long_term
Initial Confidence: TBD (develop through analysis)

Focus areas:
1. Competitive moats (CUDA ecosystem, performance)
2. Market share and pricing power
3. Customer concentration and switching costs
4. Competitive threats (AMD, custom chips)
5. Valuation and positioning

Ready to begin? [Yes/No/Modify]
```

### Step 3: Guide Structured Exploration

Work collaboratively through these sections:

#### A. Core Narrative

"Let's start with the core narrative. In 2-3 paragraphs, what's the high-level story?"

**For Thesis**: What's the macro trend or structural shift?
**For View**: What's the investment case for this ticker?

**Prompt user for input**, then help refine:
- Is it clear and concise?
- Does it explain WHY this matters?
- Does it set up the time horizon?

#### B. Supporting Evidence

"Now let's build the evidence base. What supports this narrative?"

Guide user to provide:
- **Quantitative data**: Market share, growth rates, financial metrics
- **Qualitative factors**: Competitive moats, management quality, technology advantages
- **External validation**: What do others (analysts, competitors, customers) say?

For each piece of evidence, capture:
```markdown
### Evidence 1: CUDA Ecosystem Lock-In

**Claim**: NVIDIA's CUDA software platform creates massive switching costs

**Evidence**:
- 10+ years of library development (cuDNN, NCCL, etc.)
- Millions of developers trained on CUDA
- Existing AI frameworks optimized for CUDA

**Source**: [Transcript/Report/Data]
**Confidence**: High
```

#### C. Counter-Evidence & Risks

"Let's stress-test this. What could go wrong? What evidence contradicts this view?"

Guide user through:
- **Bear case scenarios**: What if AI demand plateaus? What if competitors catch up?
- **Counter-evidence**: AMD gaining share, customer custom silicon, efficiency improvements
- **Structural risks**: Regulatory, technological disruption, valuation concerns

Capture same structure as supporting evidence:
```markdown
### Risk 1: AMD MI300 Competition

**Concern**: AMD's MI300X competitive on performance, cheaper

**Counter-Evidence**:
- MI300X benchmarks within 10% of H100
- Meta, Microsoft testing AMD chips
- Price advantage: 20-30% cheaper

**Source**: [Transcript/Report]
**Mitigation**: Even if AMD gains share, TAM growing fast enough for both
**Impact**: Medium
```

#### D. Catalysts & Invalidation Criteria

"What would accelerate or invalidate this thesis/view?"

**Catalysts** (positive):
- Product launches
- Partnership announcements
- Regulatory changes
- Macro trends accelerating

**Invalidation Criteria** (negative):
- Market share falling below X%
- Pricing power erodes (ASP down Y%)
- Key customer defections
- Technology leapfrogged

#### E. Conviction Assessment

Based on evidence gathered, ask:

"On a scale of high / medium / low / exploratory, what's your conviction?"

**Guide**:
- **High**: Strong evidence, limited counter-evidence, clear catalysts
- **Medium**: Good evidence, some risks, less certain timing
- **Low**: Interesting thesis, but limited evidence or high uncertainty
- **Exploratory**: Hypothesis stage, needs more research

### Step 4: Iterative Refinement

As user provides input:
- Ask clarifying questions
- Challenge weak arguments
- Suggest areas to explore further
- Point out contradictions or gaps

**Example prompts**:
- "You mentioned customer concentration as a risk. How concentrated is NVIDIA's revenue?"
- "The bear case on efficiency improvements is interesting. What would that timeline look like?"
- "You're bullish on long-term but see medium-term risks. Should this be medium_term time horizon?"

### Step 5: Structure Output

Once analysis is complete, create a deep dive document:

**For Macro Thesis**:
```markdown
---
type: macro_thesis
title: "Energy Infrastructure as AI Bottleneck"
thesis_type: structural
time_horizon: long_term
confidence_level: medium
status: draft
analyzed_date: "YYYY-MM-DD"
notes:
  parent_research:
    - "AI Infrastructure Buildout Discussion (transcript)"
  catalysts:
    - "Grid capacity limits in CA/TX"
    - "Nuclear restart announcements"
  invalidation_criteria:
    - "Efficiency improves >50% YoY"
    - "Power buildout accelerates significantly"
---

# Deep Dive: Energy Infrastructure as AI Bottleneck

## Core Narrative

[2-3 paragraphs capturing the thesis]

## Supporting Evidence

### Evidence 1: [Title]
**Claim**: [Statement]
**Evidence**: [Details]
**Source**: [Reference]
**Confidence**: High/Medium/Low

### Evidence 2: [Title]
[...]

## Counter-Evidence & Risks

### Risk 1: [Title]
**Concern**: [Statement]
**Counter-Evidence**: [Details]
**Mitigation**: [How to handle]
**Impact**: High/Medium/Low

### Risk 2: [Title]
[...]

## Catalysts

1. **[Catalyst]**: [Description and timeline]
2. **[Catalyst]**: [Description]

## Invalidation Criteria

- **Criterion 1**: [Specific metric or event that would disprove thesis]
- **Criterion 2**: [Another criterion]

## Conviction Assessment

**Level**: Medium

**Rationale**: [Why this conviction level]

**Key Uncertainties**:
- [What would increase conviction]
- [What remains uncertain]

## Related Research

- Existing Thesis: "AI Infrastructure Build-Out" (supports)
- Research Artifact: "AI Infrastructure Buildout Discussion" (evidence source)

## Next Steps

1. **Immediate**:
   - Finalize and upload to database
   - Link to parent thesis

2. **Follow-up**:
   - Develop asset views for energy infrastructure plays
   - Monitor grid capacity metrics
   - Track nuclear/gas datacenter announcements

3. **Questions to Explore**:
   - Which utilities benefit most?
   - What's the timeline for new power capacity?
   - How do hyperscalers hedge this risk?
```

**For Asset View**, similar structure but include:
- `ticker` in frontmatter
- `macro_thesis_id` if linked to parent thesis
- Additional sections:
  - Fundamental Context (valuation, growth, margins)
  - Positioning Context (how you're positioned, if applicable)
  - Regime Context (how it performs in different market regimes)

Save to the Obsidian deep dives directory (from env vars):
```
${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_DEEP_DIVES_DIR}/[theme-or-ticker]-analysis.md
```

For example (with default env vars):
- Output: `/Users/njb/Desktop/nick/investing/research/deep-dives/nvda-monopoly-dynamics-analysis.md`

### Step 6: Wrap Up

After creating the deep dive document:

```
✅ Deep dive analysis complete!

📄 File: deep-dives/energy-infrastructure-analysis.md

## Summary

Type: Macro Thesis
Title: "Energy Infrastructure as AI Bottleneck"
Thesis Type: structural
Confidence: medium
Time Horizon: long_term

Supporting Evidence: 4 points
Counter-Evidence: 3 risks identified
Catalysts: 3 identified
Invalidation Criteria: 2 defined

## Next Steps

Choose one:
1. **Refine further**: Continue analysis, add more evidence
2. **Finalize and upload**: Use `/finalize-for-upload deep-dives/energy-infrastructure-analysis.md`
3. **Develop related views**: Create asset views for energy infrastructure plays

What would you like to do?
```

## Interactive Prompts

Throughout the deep dive, use these prompting techniques:

**Opening Questions**:
- "What initially drew your attention to [theme/ticker]?"
- "What's the core insight that makes this interesting?"

**Evidence Gathering**:
- "What data supports this claim?"
- "Where did you see this? Can you point me to the source?"
- "On a scale of high/medium/low, how confident are you in this evidence?"

**Devil's Advocate**:
- "What would a bear say to this?"
- "What could go wrong with this thesis?"
- "Who are the competitors/alternatives?"

**Synthesis**:
- "How does this fit with your existing theses?"
- "Is this distinct enough to be separate, or should it be part of [existing thesis]?"

**Conviction Building**:
- "What would make you more confident in this?"
- "What are you still uncertain about?"
- "What's the biggest risk to this thesis?"

## Key Principles

**Collaborative, Not Prescriptive**:
- This is a conversation, not a form to fill out
- Ask questions, don't just extract data
- Help user think, don't do the thinking for them

**Structure Without Rigidity**:
- Guide through the framework but allow tangents
- If user wants to explore a specific risk deeply, follow that thread
- Come back to structure afterward

**Challenge Assumptions**:
- Play devil's advocate
- Point out contradictions
- Ask "why?" and "how do you know?"

**Focus on Actionability**:
- Clear next steps
- Specific invalidation criteria
- Concrete catalysts to monitor

**Cross-Reference Constantly**:
- Link to existing theses/views
- Reference research artifacts as evidence
- Show how pieces fit together in hierarchy

## Notes

- This skill is highly INTERACTIVE - expect multiple back-and-forth exchanges
- Output is a markdown file in `deep-dives/` for further refinement
- User can iterate on the deep dive before finalizing
- Deep dives can be used to CREATE new theses/views OR ENHANCE existing ones
- Always save work to a file so it's not lost if conversation ends
- Query database frequently to cross-reference existing research
- Encourage user to challenge their own assumptions
- Balance conviction building with risk awareness
