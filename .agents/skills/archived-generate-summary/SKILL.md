# Generate Thesis Summary Skill

## Purpose

Generate AI-powered summaries of asset theses from their linked claims (Toulmin framework). This skill:
- Synthesizes evidence from multiple research claims into coherent narratives
- Tracks provenance (which claims contributed to each summary)
- Detects staleness (when new claims have been added since last generation)
- Supports two detail levels: **paragraph** (2-3 paragraphs) and **deep-dive** (full Toulmin analysis)

## Workflow

```
INPUT: Ticker or Thesis ID + Detail Level
  ↓
STEP 1: Fetch thesis + linked claims (single SQL query)
  ↓
STEP 2: AI synthesis based on detail level
  ↓
STEP 3: Update database with summary + provenance
  ↓
OUTPUT: Confirmation with generation details
```

## Instructions

### Step 0: Environment Setup

Load environment variables from `.env.local`:

```bash
set -a
source .env.local
set +a
```

### Step 1: Get Input

Ask the user for:
1. **Ticker or Thesis ID** (e.g., "NVDA" or thesis UUID)
2. **Detail Level** (optional, defaults to "paragraph")
   - `paragraph` - 2-3 paragraph executive summary
   - `deep_dive` - Comprehensive Toulmin framework analysis

### Step 2: Fetch Thesis and Linked Claims (Full Hierarchy)

Execute a single SQL query to fetch the thesis with **all linked claims from both asset and macro theses, including evidence claims**:

```sql
WITH thesis_data AS (
  SELECT
    at.id, at.title, at.description, at.narrative,
    at.confidence_level, at.time_horizon, at.direction,
    at.fundamental_context, at.positioning_context, at.regime_context,
    at.primary_macro_thesis_id,
    u.ticker, u.spot, u.iv30,
    mt.title as parent_thesis_title
  FROM asset_theses at
  LEFT JOIN underlyings u ON at.underlying_id = u.id
  LEFT JOIN macro_theses mt ON at.primary_macro_thesis_id = mt.id
  WHERE at.id = '[THESIS_ID]' OR u.ticker = '[TICKER]'
),
main_claims_data AS (
  -- Get main claims from BOTH asset thesis and parent macro thesis
  SELECT
    mc.id,
    mc.title as claim_title,
    mc.claim,
    mc.evidence,
    mc.reasoning,
    mc.backing,
    mc.qualifier,
    mc.rebuttal,
    mc.category,
    mc.time_horizon as claim_time_horizon,
    mc.relevant_tickers,
    mc.source_insight_id,
    mc.source_claim_id,
    ctm.mapping_type,  -- How this claim relates to the thesis
    ctm.confidence as mapping_confidence,
    ri.title as insight_title,
    ri.claims_structure,  -- JSONB with evidence_claims array
    ra.title as artifact_title,
    ra.source_type,
    CASE
      WHEN ctm.asset_thesis_id IS NOT NULL THEN 'asset_thesis'
      WHEN ctm.macro_thesis_id IS NOT NULL THEN 'macro_thesis'
    END as claim_source_level
  FROM claim_thesis_mappings ctm
  INNER JOIN main_claims mc ON ctm.main_claim_id = mc.id
  LEFT JOIN research_insights ri ON mc.source_insight_id = ri.id
  LEFT JOIN research_artifacts ra ON ri.research_artifact_id = ra.id
  WHERE ctm.asset_thesis_id = (SELECT id FROM thesis_data)
     OR ctm.macro_thesis_id = (SELECT primary_macro_thesis_id FROM thesis_data)
  ORDER BY
    claim_source_level,  -- Macro first, then asset
    CASE ctm.mapping_type
      WHEN 'foundation' THEN 1
      WHEN 'supports' THEN 2
      WHEN 'refutes' THEN 3
    END,
    mc.created_at DESC
),
evidence_claims_extracted AS (
  -- Extract evidence claims from JSONB for each main claim
  SELECT
    mcd.id as main_claim_id,
    mce.relationship_type,
    mce.supporting_claim_id,
    ec_elem.value as evidence_claim_data
  FROM main_claims_data mcd
  LEFT JOIN main_claim_evidence mce ON mcd.id = mce.main_claim_id
  LEFT JOIN research_insights ri ON mce.research_insight_id = ri.id,
  LATERAL jsonb_array_elements(
    COALESCE(ri.claims_structure -> 'evidence_claims', '[]'::jsonb)
  ) AS ec_elem(value)
  WHERE ec_elem.value ->> 'id' = mce.supporting_claim_id
)
SELECT
  td.*,
  json_agg(
    json_build_object(
      'id', mcd.id,
      'claim_title', mcd.claim_title,
      'claim', mcd.claim,
      'evidence', mcd.evidence,
      'reasoning', mcd.reasoning,
      'backing', mcd.backing,
      'qualifier', mcd.qualifier,
      'rebuttal', mcd.rebuttal,
      'category', mcd.category,
      'time_horizon', mcd.claim_time_horizon,
      'relevant_tickers', mcd.relevant_tickers,
      'mapping_type', mcd.mapping_type,
      'mapping_confidence', mcd.mapping_confidence,
      'claim_source_level', mcd.claim_source_level,
      'source_title', COALESCE(mcd.artifact_title, mcd.insight_title),
      'source_type', mcd.source_type,
      'claims_structure', mcd.claims_structure,  -- Full JSONB for AI to parse
      'linked_evidence_claims', (
        SELECT json_agg(
          json_build_object(
            'relationship_type', ece.relationship_type,
            'claim_data', ece.evidence_claim_data
          )
        )
        FROM evidence_claims_extracted ece
        WHERE ece.main_claim_id = mcd.id
      )
    ) ORDER BY
      mcd.claim_source_level,
      CASE mcd.mapping_type
        WHEN 'foundation' THEN 1
        WHEN 'supports' THEN 2
        WHEN 'refutes' THEN 3
      END
  ) FILTER (WHERE mcd.id IS NOT NULL) as claims
FROM thesis_data td
LEFT JOIN main_claims_data mcd ON TRUE
GROUP BY td.id, td.title, td.description, td.narrative, td.confidence_level,
         td.time_horizon, td.direction, td.fundamental_context,
         td.positioning_context, td.regime_context, td.ticker,
         td.spot, td.iv30, td.parent_thesis_title, td.primary_macro_thesis_id;
```

**Execute via:**
```bash
npx tsx scripts/psql-query.ts "<QUERY>" --format json
```

**Important:** Replace `[THESIS_ID]` or `[TICKER]` with the actual value from user input.

### Step 3: AI Synthesis

Based on the detail level, generate a summary using the fetched data. **IMPORTANT:** The query returns claims at multiple levels:

- **Main claims** from both asset thesis AND parent macro thesis (check `claim_source_level`)
- **Evidence claims** nested under each main claim (in `linked_evidence_claims` array)
- **Relationship indicators**: `mapping_type` (foundation/supports/refutes) and `relationship_type` (for evidence claims)

#### Paragraph Mode (2-3 paragraphs)

**Objective**: Write a tight, professional investment thesis that synthesizes claims into a coherent narrative. Avoid marketing language, formulaic phrases, and meaningless filler. Write like a senior analyst presenting to institutional investors.

**CRITICAL - Synthesis Process (follow these steps BEFORE writing):**

1. **Read ALL claims completely**:
   - Main claim text (the core assertion)
   - Evidence array (specific data points, quotes, numbers)
   - Reasoning (how evidence supports the claim)
   - Backing (why the reasoning is valid)
   - Qualifier (confidence level, conditions)
   - Rebuttal (counter-arguments addressed)

2. **Extract specific data points**:
   - Numbers, percentages, dollar amounts
   - Dates, timelines, specific events
   - Direct quotes that illustrate key points
   - DO NOT paraphrase evidence - use actual data points

3. **Identify themes and connections**:
   - Group claims by theme (e.g., institutional adoption, market structure, competitive moat, timing risk)
   - Look for claims that reinforce each other
   - Identify tensions or qualifications
   - Note the logical flow: macro context → asset-specific edge → execution risk

4. **Map evidence to narrative**:
   - What is the core investment thesis that emerges from ALL claims together?
   - Which specific data points prove this thesis?
   - What counter-evidence or risks must be acknowledged?
   - What would invalidate the thesis?

5. **Preserve logical chains**:
   - Evidence → Reasoning → Backing (don't skip steps)
   - Show WHY the evidence matters, not just WHAT it says
   - Connect multiple evidence points to build compound arguments

**Guidelines:**
- **Be direct**: State the thesis clearly without preamble like "presents a bullish view"
- **Synthesize, don't list**: Weave claims together into a logical argument, don't enumerate them
- **Use evidence naturally**: Integrate supporting data into the narrative flow
- **Cite sources cleanly**: Use brief inline citations, not verbose attributions
- **Connect macro to micro**: Show how macro context enables the asset-specific opportunity
- **Be specific**: Use concrete data points, avoid vague qualitative statements
- **Skip obvious statements**: Don't state things like "confidence level is high" - let the evidence speak

**Structure:**

**Paragraph 1 - Core Thesis (2-4 sentences)**
- Lead with the investment thesis clearly stated
- If macro thesis exists, establish macro context that creates the opportunity
- State the specific asset-level insight or edge
- Include key price/valuation context if relevant (current levels, targets, catalysts)

**Paragraph 2 - Evidence Synthesis (4-6 sentences)**
- Synthesize foundation and supporting claims into a coherent argument
- Organize by logic/theme, not by claim enumeration
- Weave in specific evidence points that support each element
- Use inline citations: (Source: [Artifact Title])
- Connect evidence points to show how they reinforce each other
- For evidence sub-claims, integrate them as supporting detail within the narrative

**Paragraph 3 - Risks & Invalidation (3-4 sentences)**
- Acknowledge material risks and counter-evidence
- State specific conditions that would invalidate the thesis
- Include timing risks or catalysts that affect conviction
- Be balanced but focused on what actually matters

**Citation Style:**
- Inline: "Bitcoin outperformed despite institutional skepticism (Source: Hyperscaler Earnings Analysis)"
- Natural integration: "Recent evidence of 300% increase in datacenter permits (Source: Q3 2025 Report) supports accelerating infrastructure buildout"
- Avoid: "According to [long source title], the evidence shows that..." (too verbose)

**Bad vs Good Synthesis Example:**

**Claim Evidence**: "Bitcoin was $16K three years ago, $50K pre-election, ripped to $100K December/January - 'crammed a lot of gains'"

❌ **BAD (paraphrasing without insight)**:
"Bitcoin rose from $16K to $100K over three years, cramming substantial gains into a compressed timeframe that created vulnerability."

✅ **GOOD (specific data + insight)**:
"Bitcoin front-ran political expectations, rising from $16K to $50K ahead of the election before surging to $100K post-victory. This anticipatory price action left the asset vulnerable when promised catalysts (sovereign wealth fund) failed to materialize on expected timelines."

**Why the good version is better:**
- Uses specific price levels showing the progression ($16K → $50K → $100K)
- Identifies the insight: the move was anticipatory, not just "gains over time"
- Connects to the risk: front-running creates vulnerability to catalyst disappointment
- Adds context: what specific catalyst was expected?

**IMPORTANT**: The examples above show STYLE and APPROACH. When generating summaries, you MUST synthesize from the actual claim data in the query results, not copy example language. Follow the 5-step synthesis process, extract specific data from evidence arrays, and build your own narrative from the source material.

#### Deep-Dive Mode (Comprehensive)

**Structure:**
1. **Thesis Overview** (1-2 paragraphs)
   - Full description + narrative
   - All context fields (fundamental, positioning, regime)
   - **Parent macro thesis linkage**: State the macro thesis title and how asset thesis derives from it

2. **Macro Context** (if parent macro thesis has claims)
   - Section header: `## Macro Foundation: [Parent Macro Thesis Title]`
   - Each macro-level foundation claim with full Toulmin
   - Evidence claims nested under each main claim
   - Explains the broader context this asset thesis operates within

3. **Asset-Specific Foundation Claims** (full Toulmin framework)
   - Section header: `## Asset Thesis Foundation`
   - Each asset-level foundation claim as a subsection with full Toulmin:
     ```
     ### [Claim Title] (Asset Foundation)

     **Claim:** [Main assertion]

     **Evidence:**
     - [Evidence point 1]
     - [Evidence point 2]

     **Reasoning:** [How evidence supports claim]

     **Backing:** [Why reasoning is valid]

     **Qualifier:** [Confidence level - High/Medium/Low]

     **Rebuttal:** [Counter-arguments addressed]

     **Source:** [Artifact/Insight Title] ([Source Type])
     **Mapping Confidence:** [High/Medium/Low]

     #### Supporting Evidence Claims:
     [For each linked evidence claim:]
     - **"[Evidence Claim Text]"** (Relationship: supporting)
       - Evidence: [Evidence from evidence claim]
       - Reasoning: [Reasoning from evidence claim]
       - Source: [Artifact Title]
     ```

4. **Supporting Claims** (organized by theme)
   - Section header: `## Supporting Evidence`
   - Group related supports claims (both macro and asset level)
   - Same hierarchical Toulmin structure with evidence claims nested

5. **Counter-Evidence** (if any refutes claims exist)
   - Section header: `## Counter-Arguments and Risks`
   - Each refutes claim with full Toulmin + evidence claims
   - Analysis of impact on overall thesis confidence
   - Conditions that would strengthen/weaken counter-arguments

6. **Synthesis and Conviction Assessment** (2-3 paragraphs)
   - Weighted assessment across hierarchy levels (macro → asset → evidence)
   - Count claims by type: X foundation, Y supporting, Z refuting
   - Count evidence claims by relationship: X supporting evidence, Y rebutting evidence
   - Confidence justification based on evidence quality and quantity
   - Key dependencies and invalidation criteria
   - Signal-to-noise ratio: strong evidence vs weak/exploratory claims

7. **Research Sources** (organized by level)
   - **Macro Thesis Sources**: [List artifacts/insights for macro claims]
   - **Asset Thesis Sources**: [List artifacts/insights for asset claims]
   - Group by source type (transcript, article, note)

### Step 4: Update Database

Construct and execute the UPDATE query:

```sql
UPDATE asset_theses
SET
  ai_summary = E'[SUMMARY_TEXT]',
  ai_summary_detail_level = '[paragraph|deep_dive]',
  ai_summary_generated_at = NOW(),
  ai_summary_claim_ids = ARRAY['[ID1]'::text, '[ID2]'::text, '[ID3]'::text],
  ai_summary_claim_count = [COUNT],
  updated_at = NOW()
WHERE id = '[THESIS_ID]'
RETURNING id, title, ticker, ai_summary_generated_at, ai_summary_claim_count;
```

**Critical:** Escape single quotes in summary text by doubling them:
- Incorrect: `'It's a bullish thesis'`
- Correct: `'It''s a bullish thesis'`

**Execute via:**
```bash
npx tsx scripts/psql-query.ts "<UPDATE_QUERY>" --format json
```

**Provenance tracking:**
- `ai_summary_claim_ids` = Array of all claim IDs that contributed to summary
- `ai_summary_claim_count` = Total number of claims at generation time (for staleness detection)

### Step 5: Confirmation

Display to user:
```
✅ Summary generated for [TICKER/TITLE]

Detail Level: [paragraph/deep_dive]
Claims Used: [COUNT]
Generated: [TIMESTAMP]

Next Steps:
- View in UI at /asset-theses/[ID]
- Summary will show staleness warning if 3+ new claims are added
- Regenerate anytime with /generate-summary [TICKER] [detail-level]
```

## Validation

**Required inputs:**
- Ticker or Thesis ID must be provided
- Detail level must be one of: `paragraph`, `deep_dive` (default: paragraph)

**Pre-flight checks:**
1. Thesis exists in database
2. At least 1 claim is linked to the thesis
3. Database connection is available

**Error conditions:**
- No thesis found → Show error with available tickers
- No claims linked → Inform user to link claims first
- Network/DB error → Show error with retry instructions

## Error Handling

### No Thesis Found
```
❌ Thesis not found for "[INPUT]"

Available asset theses:
- NVDA: AI Infrastructure Buildout
- TSLA: EV Market Leadership
- AAPL: Services Transition

Usage: /generate-summary [TICKER or THESIS_ID] [paragraph|deep_dive]
```

### No Claims Linked
```
❌ No claims linked to this thesis

This thesis has no supporting claims yet. To generate a summary:
1. Process research artifacts with /process-transcript
2. Convert claims to thesis with /finalize-for-upload
3. Or manually link claims in the UI at /research/[id]

Then retry: /generate-summary [TICKER]
```

### Database Connection Error
```
❌ Database connection failed

Check that:
1. .env.local contains DATABASE_URL_POOLER
2. Supabase project is accessible
3. Network connection is stable

Retry: /generate-summary [TICKER] [detail-level]
```

## Notes

### Key Principles

1. **Preserve Provenance** - Always track which claims contributed
2. **Detect Staleness** - Store claim count for future comparison
3. **Respect Manual Descriptions** - AI summary is separate field, preserves user's manual description
4. **Full Toulmin Framework** - Deep-dive mode shows all 6 components (claim, evidence, reasoning, backing, qualifier, rebuttal)
5. **Source Attribution** - Always cite artifact/insight titles

### Staleness Detection Logic

Summary is considered stale if:
- **3+ new claims** added since last generation, OR
- **30+ days** since last generation

This logic is implemented in the UI and future triage triggers (Phase 3.0).

### Query Optimization

The single SQL query with CTEs is optimized for:
- Single database round-trip
- Proper JOIN strategy (LEFT JOIN for optional fields)
- JSON aggregation for claims array
- Ordered claims by mapping_type (foundation → supports → refutes)

### Future Extensions

- **Macro Theses**: Same pattern can be applied to macro_theses table
- **Automatic Regeneration**: Phase 3.0 will add triage triggers for stale summaries
- **Summary Diff**: Compare summary versions over time
- **Claim Contribution Scoring**: Weight claims by their contribution to final summary

## Examples

### Example 1: Paragraph Summary for NVDA
```bash
/generate-summary NVDA
```

Expected workflow:
1. Fetch NVDA thesis + linked claims
2. Generate 2-3 paragraph summary citing top 3-5 claims
3. Update database with summary + claim IDs
4. Show confirmation with timestamp

### Example 2: Deep-Dive Summary by Thesis ID
```bash
/generate-summary 123e4567-e89b-12d3-a456-426614174000 deep_dive
```

Expected workflow:
1. Fetch thesis by ID + all linked claims
2. Generate comprehensive Toulmin analysis (5-10 pages)
3. Update database with detailed summary
4. Show confirmation with claim count

### Example 3: No Claims Linked
```bash
/generate-summary AAPL
```

Expected result:
- Query returns thesis but claims array is empty
- Show error message instructing user to link claims first
- No database update

## Related Skills

- **`/process-transcript`** - Extract claims from research artifacts
- **`/synthesize-claims`** - Cross-reference claims against existing theses
- **`/deep-dive`** - Collaborative analysis to create new claims
- **`/finalize-for-upload`** - Upload research with claim-to-thesis linkage
- **`/read-views`** - Query existing asset theses from database

## Phase Context

This skill is part of **Phase 2.8: AI-Generated Thesis Summaries** in the active roadmap.

**Related Phases:**
- Phase 2.9: Claims-Aware Triage UI (will display these summaries)
- Phase 3.0: Thesis Review Triggers (will regenerate stale summaries automatically)
- Phase 3.2: Claim Invalidation Workflow (will trigger summary regeneration)

See `/docs/ACTIVE_ROADMAP.md` for full context.
