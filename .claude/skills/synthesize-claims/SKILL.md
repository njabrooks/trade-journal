---
name: synthesize-claims
description: Cross-reference audit claims against existing theses/views in database. Maps claims to hierarchy, identifies new thesis/view opportunities vs evidence for existing beliefs. Generates synthesis with recommendations. Use after forensic claim extraction.
allowed-tools: Read, Write, mcp__supabase__execute_sql, Bash
---

# Synthesize Claims to Hierarchy

## Purpose

Take forensic audit output and synthesize it against your existing decision hierarchy:
1. **Read audit** with all extracted claims
2. **Query existing hierarchy** (theses, views) from database
3. **Cross-reference claims** against existing beliefs
4. **Classify relationships**:
   - New thesis/view candidate
   - Evidence supporting existing thesis/view
   - Evidence rebutting existing thesis/view
   - Ambiguous (could be either)
5. **Generate recommendations** for what to create/enhance

This is **Stage 2** of the research workflow: mapping claims to hierarchy.

## Workflow

```
Input: ${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_AUDITS_DIR}/[file]-audit.md
  ↓
1. Read audit document (all claims)
2. Query existing macro theses from database
3. Query existing asset views from database
4. For each main claim:
   - Match against existing theses/views (keyword + concept)
   - Classify: NEW vs EVIDENCE
5. For each evidence claim:
   - Map to main claims (already done in audit)
   - Map to existing theses/views (if applicable)
6. Generate synthesis document with recommendations
  ↓
Output: ${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_SYNTHESES_DIR}/[file]-synthesis.md
  (Recommendations for what to build next)
```

## Instructions

When the user asks to synthesize claims:
- "Synthesize the claims from audits/apps-to-agents-audit.md"
- "Map these claims to my hierarchy"
- "What should I create from this audit?"

Follow these steps:

### Step 0: Read Environment Variables and Construct Paths

Before processing, read the Obsidian directory configuration from `.env.local`:

```bash
# Read environment variables
cat /Users/njb/Desktop/trade-journal/.env.local | grep OBSIDIAN
```

Construct the full paths:
- **Audits directory**: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_AUDITS_DIR}`
- **Syntheses directory**: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_SYNTHESES_DIR}`

For example, with defaults:
- Audits: `/Users/njb/Desktop/nick/investing/research/audits`
- Syntheses: `/Users/njb/Desktop/nick/investing/research/syntheses`

Use these paths throughout the skill execution. If env vars are not set, fall back to project-local `research-workspace/` directories.

### Step 1: Read Audit Document

Load the audit file and extract:
- **Main claims** (thesis/view candidates)
- **Evidence claims** (supporting/rebutting)
- **Claim relationships** (which evidence supports which main claims)
- **Tickers mentioned**
- **Categories** (macro vs asset_specific)

### Step 2: Query Existing Hierarchy

**Get all active main claims** (first-class claim entities):
```sql
SELECT
  id,
  title,
  category,
  claim,
  evidence,
  qualifier,
  time_horizon,
  relevant_tickers,
  status,
  created_at,
  last_evidence_added_at
FROM main_claims
WHERE status = 'active'
ORDER BY created_at DESC;
```

**Get all non-terminal macro theses (developing or monitoring)**:
```sql
SELECT
  id,
  title,
  description,
  thesis_type,
  confidence_level,
  time_horizon,
  direction,
  sectors,
  notes,
  created_at
FROM macro_theses
WHERE status IN ('developing', 'monitoring')
ORDER BY created_at DESC;
```

**Get all non-terminal asset views (developing or monitoring)**:
```sql
SELECT
  av.id,
  av.title,
  av.description,
  av.narrative,
  av.confidence_level,
  av.time_horizon,
  av.direction,
  av.target_price,
  u.ticker,
  mt.title as parent_thesis_title,
  mt.id as parent_thesis_id,
  av.created_at
FROM asset_theses av
LEFT JOIN underlyings u ON av.underlying_id = u.id
LEFT JOIN macro_theses mt ON av.macro_thesis_id = mt.id
WHERE av.status IN ('developing', 'monitoring')
ORDER BY av.created_at DESC;
```

### Step 3: Cross-Reference Against Existing Main Claims

Before checking theses/views, first check if audit claims should become first-class main claims or link to existing ones.

For each **main claim** in the audit:

#### Match Against Existing Main Claims

**Text similarity**:
- Compare claim text with existing main_claims.claim field
- Look for: exact matches, high semantic similarity, conceptual overlap

**Category + Ticker matching**:
- Same category (macro vs asset_specific)
- Overlapping tickers in relevant_tickers array

**Classification**:
1. **DUPLICATE/SIMILAR**: Audit claim is very similar to existing main claim
   → Action: Link as evidence via `main_claim_evidence` table
   → Call `/api/research/link-evidence` endpoint
   → Update: `last_evidence_added_at` timestamp

2. **DISTINCT**: Audit claim is sufficiently different from all main claims
   → Action: Recommend promotion via `/api/research/promote-claim`
   → Creates: New row in `main_claims` table
   → Benefits: Can accumulate evidence over time, link to multiple theses/views

3. **AMBIGUOUS**: Could go either way
   → Action: Present to user with recommendation
   → Consider: Confidence level, specificity, reusability potential

**Promotion Criteria** (when to create new main claim):
- High confidence (medium/high qualifier)
- Reusable across multiple audits
- Could support multiple theses/views
- Represents a key insight worth tracking independently
- Has robust Toulmin structure (evidence, reasoning, backing)

**Evidence Linking Criteria** (when to link to existing):
- Very similar to existing claim (>80% semantic similarity)
- Same category and overlapping tickers
- Adds incremental evidence but not a new perspective
- Updates or reinforces existing claim

### Step 4: Cross-Reference Against Theses/Views

For audit claims that are **not promoted to main claims**, check against theses/views:

#### A. Match Against Existing Theses (if thesis_candidate)

**Keyword matching**:
- Compare claim text with thesis titles and descriptions
- Look for: exact matches, partial matches, conceptual overlap

**Similarity assessment**:
- **High similarity** (>80%): Likely the same thesis
- **Medium similarity** (40-80%): Related but potentially distinct
- **Low similarity** (<40%): Different thesis

**Classification**:
1. **DUPLICATE**: Claim essentially restates existing thesis
   → Action: Map as supporting evidence, don't create new thesis

2. **ENHANCEMENT**: Claim adds new dimension to existing thesis
   → Action: Could enhance existing thesis OR create related thesis
   → User decides

3. **DISTINCT**: Claim is sufficiently different from all existing theses
   → Action: Strong candidate for new thesis

4. **AMBIGUOUS**: Could go either way
   → Action: Present to user with recommendation

#### B. Match Against Existing Views (if view_candidate)

**Ticker matching**:
- If claim mentions NVDA, check for existing NVDA views
- Exact ticker match is primary signal

**Conceptual matching** (if same ticker):
- Compare claim with view description/narrative
- Check if claiming something different about same ticker

**Classification**:
1. **DUPLICATE**: Claim restates existing view on ticker
   → Action: Map as supporting evidence

2. **COMPLEMENTARY**: Claim adds new angle on same ticker
   → Action: Could enhance existing view OR create separate view
   → (e.g., fundamental view vs. technical view on NVDA)

3. **DISTINCT**: No view exists for this ticker OR claim is about different aspect
   → Action: Strong candidate for new view

4. **CONFLICTING**: Claim contradicts existing view
   → Action: Map as rebutting evidence, flag for review

### Step 4: Cross-Reference Evidence Claims

For each **evidence claim** in the audit:

1. **Already mapped** to main claims in audit
2. **Check if supports/refutes existing theses/views**:
   - If main claim maps to existing thesis, evidence claim also maps
   - Evidence claim might support thesis even if main claim doesn't

**Example**:
- Main Claim: "AI agents will replace apps" → NEW THESIS
- Evidence Claim: "GPT-4 achieves 85% accuracy" → ALSO supports existing "AI Infrastructure Build-Out" thesis

### Step 5: Generate Synthesis Document

Create synthesis in the Obsidian syntheses directory (constructed from env vars in Step 0) with this structure:

**IMPORTANT**: The synthesis should have three main sections:
1. **Promotion Recommendations** - Which audit claims should become first-class main claims
2. **Evidence Linking Recommendations** - Which claims should link to existing main claims
3. **Thesis/View Recommendations** - Which claims should create/enhance theses/views

```markdown
---
source_audit: "audits/2025-01-20-apps-to-agents-audit.md"
synthesis_date: "2025-01-20"
total_claims_analyzed: 23
claims_to_promote: 4
claims_to_link: 3
new_thesis_candidates: 2
new_view_candidates: 1
---

# Claim Synthesis: From Apps to Agents

**Source Audit**: [2025-01-20-apps-to-agents-audit.md](../audits/2025-01-20-apps-to-agents-audit.md)
**Synthesized**: 2025-01-20

---

## Executive Summary

**Main Claims Analyzed**: 8 total

**First-Class Main Claims**:
- Promote to main_claims table: 4
- Link to existing main claims: 3

**Thesis/View Creation**:
- New Macro Thesis Candidates: 2
- New Asset View Candidates: 1

**Evidence Claims**: 15 total
- Supporting Existing Theses: 8
- Rebutting Existing Theses: 2
- Supporting Main Claims Only: 5

**Recommendation Priority**:
1. **PROMOTE**: Claims 1, 3, 5, 7 to main_claims table (reusable insights)
2. **LINK EVIDENCE**: Claims 2, 4 to existing main claims (incremental support)
3. **CREATE THESIS**: "Application to Agent Shift" (Claim 1)
4. **CREATE VIEW**: NVDA margin pressure (Claim 2)

---

## 1. Promotion Recommendations (Create First-Class Main Claims)

These audit claims should be promoted to the `main_claims` table because they represent reusable insights that:
- Could support multiple theses/views over time
- Have strong Toulmin structure (evidence, reasoning, backing)
- Are likely to accumulate additional evidence from future audits
- Represent key insights worth tracking independently

### ⭐ PROMOTE: Claim 1 - AI Agents Replacing Applications

**Claim**: AI agents will replace traditional application interfaces by 2026

**Why Promote?**:
- HIGH reusability (applies to many tech theses)
- Robust Toulmin structure (strong evidence, reasoning, backing)
- Medium-high confidence
- Will accumulate evidence over time as agent market evolves
- Could support: App monetization thesis, Enterprise SaaS thesis, AI infrastructure thesis

**Action**: Call `/api/research/promote-claim` with:
```json
{
  "insightId": "<insight-uuid>",
  "claimId": "claim-1"
}
```

**Next Steps**:
1. Promote to main_claims
2. Link existing evidence claims (claim-2, claim-3, claim-5)
3. Create macro thesis "Application to Agent Shift" that references this main claim
4. Watch for evidence in future audits (automatically link via main_claim_evidence)

---

### PROMOTE: Claim 3 - Agent Framework Market Growth

**Claim**: Agent framework adoption growing 300% YoY signals imminent production deployment

**Why Promote?**:
- MEDIUM reusability (developer adoption metrics useful for multiple theses)
- Medium confidence
- Likely to update with new data quarterly/annually
- Could support: Developer tools thesis, AI infrastructure thesis, Platform shift thesis

**Action**: Promote via `/api/research/promote-claim`

---

### PROMOTE: Claim 5 - Enterprise Agent Deployments Starting

**Claim**: Early enterprise adopters deploying agent-first products validates commercial viability

**Why Promote?**:
- HIGH reusability (enterprise adoption is key metric for many theses)
- Medium confidence
- Will track over time (quarterly earnings, case studies)
- Could support: Enterprise SaaS thesis, AI adoption thesis, Workflow automation thesis

**Action**: Promote via `/api/research/promote-claim`

---

### PROMOTE: Claim 7 - Energy Infrastructure Bottleneck

**Claim**: Power and cooling constraints will limit AI datacenter buildout 2026-2028

**Why Promote?**:
- VERY HIGH reusability (affects AI, crypto, cloud infrastructure theses)
- Structural constraint worth tracking long-term
- Medium-high confidence
- Evidence will accumulate from utility earnings, datacenter announcements, policy changes
- Could support: AI infrastructure thesis, Utilities thesis, Nuclear renaissance thesis, Real estate thesis

**Action**: Promote via `/api/research/promote-claim`

---

## 2. Evidence Linking Recommendations

These audit claims are very similar to existing main claims and should be linked as supporting/rebutting evidence instead of promoted:

### LINK AS EVIDENCE: Claim 2 → Existing Main Claim "LLM Reasoning Capabilities"

**Audit Claim**: GPT-4 achieves 85% accuracy on complex reasoning benchmarks

**Existing Main Claim** (ID: `abc-123`):
- Title: "Large Language Models Approaching Human-Level Reasoning"
- Claim: "LLMs demonstrate near-human reasoning capabilities on complex benchmarks"
- Status: active
- Evidence count: 3 supporting, 1 rebutting
- Created: 2025-11-15

**Similarity**: VERY HIGH (95%)
- Same topic (LLM reasoning)
- Same category (macro)
- Essentially provides updated datapoint for existing claim

**Action**: Link as supporting evidence via `/api/research/link-evidence`:
```json
{
  "mainClaimId": "abc-123",
  "insightId": "<current-insight-uuid>",
  "evidenceClaimId": "claim-2",
  "relationshipType": "supports"
}
```

**Impact**: Updates `last_evidence_added_at` on main claim, adds to evidence count

---

### LINK AS EVIDENCE: Claim 4 → Existing Main Claim "AI Reliability Limitations"

**Audit Claim**: Current AI hallucination rate remains at 15%

**Existing Main Claim** (ID: `def-456`):
- Title: "LLM Reliability Remains Insufficient for Mission-Critical Applications"
- Status: active
- Evidence count: 2 supporting, 0 rebutting

**Similarity**: HIGH (85%)
- Provides updated metric for existing reliability claim
- Same category and theme

**Action**: Link as supporting evidence via `/api/research/link-evidence`

---

## 3. New Thesis Candidates

### ⭐ HIGH PRIORITY: Claim 1 - Application to Agent Shift

**Claim**: AI agents will replace traditional application interfaces by 2026

**Similarity to Existing Theses**: LOW (25%)
- Existing "AI Infrastructure Build-Out" is about datacenter capacity
- This claim is about application layer disruption
- Different layer of the stack → **DISTINCT THESIS**

**Recommendation**: **CREATE NEW THESIS**
- Type: secular
- Time Horizon: medium_term
- Confidence: medium
- Parent/Related: Could link to "AI Infrastructure Build-Out" as enabling thesis

**Supporting Evidence from Audit**:
- Claim 2: GPT-4 85% accuracy (high confidence)
- Claim 3: Agent frameworks growing 300% YoY (medium confidence)
- Claim 5: Enterprise deployments starting (medium confidence)

**Rebutting Evidence from Audit**:
- Claim 4: 15% hallucination rate (high confidence)
- Claim 6: Regulatory concerns (medium confidence)

**Next Steps**:
1. Use `/deep-dive "Application to Agent Shift"` to develop full thesis
2. Strengthen Toulmin structure with additional research
3. Link to existing "AI Infrastructure Build-Out" as enabling condition
4. Upload with `/finalize-for-upload`

---

### MEDIUM PRIORITY: Claim 7 - Energy Infrastructure Bottleneck

**Claim**: Power and cooling constraints will limit AI datacenter buildout 2026-2028

**Similarity to Existing Theses**: MEDIUM (55%)
- Existing "AI Infrastructure Build-Out" mentions power constraints in notes
- But power is treated as detail, not main thesis
- Could be ENHANCEMENT or NEW THESIS

**Recommendation**: **ENHANCE EXISTING or CREATE NEW**

**Option A**: Enhance "AI Infrastructure Build-Out"
- Add power constraints as key driver
- Update description to emphasize infrastructure bottleneck
- Add evidence claims from audit

**Option B**: Create new "Energy Infrastructure Bottleneck" thesis
- Structural thesis about power grid limitations
- Broader than just AI (crypto, EVs also affected)
- "AI Infrastructure Build-Out" becomes child/related thesis

**User Decision Required**: Is power constraint:
- A detail within AI infrastructure thesis? → Option A
- A separate structural thesis about energy? → Option B

**Supporting Evidence from Audit**:
- Claim 8: Grid capacity limits in CA/TX
- Claim 9: Microsoft nuclear restart deal

---

## New Asset View Candidates

### HIGH PRIORITY: Claim 2 - NVDA Margin Pressure

**Claim**: NVIDIA will face margin pressure from hyperscaler custom chips

**Existing Views on NVDA**: 1 found
- **"AI Accelerator Dominance"** (created 2025-12-23)
  - Focus: NVIDIA's monopoly position, CUDA moat
  - Confidence: high
  - Time Horizon: long_term

**Similarity to Existing View**: CONFLICTING (Bear vs Bull)
- Existing view is BULLISH (dominance, moat)
- This claim is BEARISH (margin pressure, competition)
- **COMPLEMENTARY** - different perspectives on same ticker

**Recommendation**: **CREATE SEPARATE VIEW or MAP AS REBUTTING EVIDENCE**

**Option A**: Create "NVDA: Custom Chip Competition Risk" view
- Bear case view on NVDA
- Link to existing bullish view as alternative perspective
- Users can maintain both bull and bear views

**Option B**: Map to existing view as rebutting evidence
- Add claims 7, 8 as counter-arguments to bull case
- Strengthen existing view by incorporating bear case

**Preference**: **Option B** (single view with both sides)
- Investment views should include bull AND bear cases
- Stronger conviction when counter-arguments addressed
- Avoid duplicate views on same ticker

**Action**: Map as rebutting evidence to existing "AI Accelerator Dominance" view

---

## Evidence for Existing Hierarchy

### Supports: "AI Infrastructure Build-Out" Thesis

**Existing Thesis**:
- Title: "AI Infrastructure Build-Out"
- Type: secular
- Confidence: high
- Created: 2025-12-21

**Supporting Evidence from Audit**:

1. **Claim 2**: GPT-4 85% accuracy on reasoning tasks
   - **Mapping**: Demonstrates AI capability maturity driving infrastructure demand
   - **Confidence**: high
   - **Action**: Add as supporting evidence

2. **Claim 3**: Agent framework market growing 300% YoY
   - **Mapping**: Developer tooling adoption signals production readiness
   - **Confidence**: medium
   - **Action**: Add as supporting evidence

3. **Claim 5**: Enterprise AI deployments accelerating
   - **Mapping**: Confirms enterprise adoption driving infrastructure spend
   - **Confidence**: medium
   - **Action**: Add as supporting evidence

**Recommendation**: Upload these evidence claims to database, link via research_mappings

---

### Refutes: "AI Infrastructure Build-Out" Thesis (Minor)

**Rebutting Evidence from Audit**:

1. **Claim 4**: 15% hallucination rate limits autonomous deployment
   - **Mapping**: Could slow enterprise AI adoption, reducing infrastructure demand
   - **Severity**: Medium (doesn't invalidate thesis, but adds risk)
   - **Action**: Add as counter-evidence for balanced view

**Recommendation**: Include as rebuttal to strengthen thesis (shows counter-arguments considered)

---

### Supports: "NVDA: AI Accelerator Dominance" View

**Existing View**:
- Ticker: NVDA
- Title: "AI Accelerator Dominance"
- Confidence: high
- Created: 2025-12-23

**Rebutting Evidence from Audit** (Bear Case):

1. **Claim 7**: Google 60% workloads on TPUs
   - **Mapping**: Demonstrates hyperscaler custom chip adoption
   - **Confidence**: high
   - **Action**: Add as counter-evidence

2. **Claim 8**: Amazon Trainium 50% cheaper
   - **Mapping**: Price competition from custom chips
   - **Confidence**: medium
   - **Action**: Add as counter-evidence

**Recommendation**: Strengthen existing NVDA view by incorporating bear case

---

## Synthesis Statistics

**Total Claims Analyzed**: 23

**Main Claims (8)**:
- New Thesis Candidates: 3
  - High Priority: 1 (Application to Agent Shift)
  - Medium Priority: 2 (Energy Bottleneck, etc.)
- New View Candidates: 2
  - High Priority: 1 (NVDA margin pressure)
- Evidence for Existing: 3 claims map to existing hierarchy

**Evidence Claims (15)**:
- Supporting Existing Theses: 8
- Rebutting Existing Theses: 2
- Supporting Main Claims Only: 5

**Cross-Reference Results**:
- Existing Theses: 1 matched ("AI Infrastructure Build-Out")
- Existing Views: 1 matched ("NVDA: AI Accelerator Dominance")

---

## Recommended Action Plan

### Immediate Actions

1. **Create New Thesis**: "Application to Agent Shift"
   ```
   /deep-dive "Application to Agent Shift"
   ```
   - Use Claim 1 as foundation
   - Include evidence claims 2, 3, 4, 5, 6
   - Develop full Toulmin structure
   - Link to "AI Infrastructure Build-Out" as enabling thesis

2. **Enhance Existing Thesis**: "AI Infrastructure Build-Out"
   ```
   Upload evidence claims 2, 3, 5 as supporting
   Upload evidence claim 4 as rebutting
   ```
   - Strengthens evidence base
   - Balances view with counter-arguments

3. **Enhance Existing View**: "NVDA: AI Accelerator Dominance"
   ```
   Upload evidence claims 7, 8 as rebutting
   ```
   - Incorporates bear case
   - More balanced view

### Follow-Up Actions

4. **User Decision Required**: Energy Infrastructure Bottleneck
   - Is this enhancement to "AI Infrastructure Build-Out"?
   - Or separate structural thesis?
   - Decision determines whether to create new or enhance existing

5. **Deep Dive Candidates** (if time permits):
   - Claim 10: Hyperscaler vertical integration patterns
   - Claim 15: Regulatory landscape for autonomous AI

---

## Next Steps

Choose your path:

**Path A: Create New (Recommended)**
1. `/deep-dive "Application to Agent Shift"` using Claim 1
2. Develop into full thesis with additional research
3. `/finalize-for-upload` the new thesis
4. Link supporting evidence from audit

**Path B: Enhance Existing First**
1. Upload evidence claims to existing "AI Infrastructure Build-Out" thesis
2. Upload rebutting evidence to existing "NVDA" view
3. Then pursue new thesis creation

**Path C: Mixed Approach**
1. Quick upload of evidence to existing hierarchy (low effort)
2. Deep dive on most promising new thesis (high value)
3. Iterate on remaining claims later

---

## Claim Mapping Reference

**For database upload**, here's the mapping:

```json
{
  "claims": [
    {
      "id": "claim-1",
      "action": "create_new_thesis",
      "priority": "high",
      "next_step": "deep_dive"
    },
    {
      "id": "claim-2",
      "action": "map_to_existing",
      "target_type": "macro_thesis",
      "target_id": "0c2d9fd5-1e9c-4e73-8d2b-1b63fc6dbe1f",
      "target_title": "AI Infrastructure Build-Out",
      "mapping_type": "supports",
      "confidence": "high"
    },
    {
      "id": "claim-7",
      "action": "map_to_existing",
      "target_type": "asset_view",
      "target_id": "47e8ffde-4ef8-48b1-9d39-461dd589d910",
      "target_title": "NVDA: AI Accelerator Dominance",
      "mapping_type": "refutes",
      "confidence": "high"
    }
  ]
}
```

Use this mapping when uploading with `/finalize-for-upload`.
```

## Output Format

Save synthesis to the Obsidian syntheses directory (from env vars):
```
${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_SYNTHESES_DIR}/[date]-[slug]-synthesis.md
```

For example (with default env vars):
- Input: `/Users/njb/Desktop/nick/investing/research/audits/2025-01-20-apps-to-agents-audit.md`
- Output: `/Users/njb/Desktop/nick/investing/research/syntheses/2025-01-20-apps-to-agents-synthesis.md`

For example:
- Input: `audits/2025-01-20-apps-to-agents-audit.md`
- Output: `syntheses/2025-01-20-apps-to-agents-synthesis.md`

## Matching Algorithms

### Keyword Matching for Theses

```javascript
function calculateSimilarity(claim, thesis) {
  // Extract keywords from claim and thesis
  const claimKeywords = extractKeywords(claim.claim + " " + claim.evidence);
  const thesisKeywords = extractKeywords(thesis.title + " " + thesis.description);

  // Calculate overlap
  const overlap = intersection(claimKeywords, thesisKeywords);
  const similarity = overlap.length / union(claimKeywords, thesisKeywords).length;

  return similarity;
}

// Similarity thresholds:
// > 0.80 = HIGH (likely same thesis)
// 0.40 - 0.80 = MEDIUM (related, needs human judgment)
// < 0.40 = LOW (distinct thesis)
```

### Conceptual Matching

Beyond keywords, look for conceptual overlap:
- **Same phenomenon, different words**: "AI replacing apps" vs "Agent disruption of software"
- **Parent-child relationships**: "Energy constraints" vs "AI infrastructure buildout"
- **Complementary aspects**: "NVDA bull case" vs "NVDA bear case"

Use LLM reasoning to assess conceptual similarity when keywords are ambiguous.

## Key Principles

**Conservative on NEW**:
- Prefer mapping to existing over creating duplicates
- Only create NEW thesis/view if clearly distinct
- When ambiguous, present options to user

**Comprehensive on EVIDENCE**:
- Map ALL relevant evidence claims to existing hierarchy
- One evidence claim can support multiple theses (many-to-many)
- Include both supporting AND rebutting evidence

**Actionable Recommendations**:
- Clear priority ranking (high/medium/low)
- Specific next steps for each recommendation
- Include IDs for database operations

**User Choice on Ambiguity**:
- When similarity is 40-80%, present both options
- Explain trade-offs (new vs enhance existing)
- Let user decide based on their framework

## Notes

- This skill does NOT upload to database (that's `/finalize-for-upload`)
- This skill does NOT develop claims further (that's `/deep-dive`)
- Output is a synthesis for decision-making
- User reviews synthesis before taking action
- Synthesis includes database IDs for easy upload
- Focus on MAPPING claims to existing hierarchy
- Surface NEW opportunities but don't over-create
