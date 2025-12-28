---
name: process-transcript
description: Process research transcripts with forensic claim extraction using Toulmin framework. Auto-formats YouTube transcripts, extracts all claims without information loss, structures with Evidence/Reasoning/Backing, categorizes as thesis/view candidates. Use for rigorous research ingestion.
allowed-tools: Read, Write, mcp__supabase__execute_sql, Bash
---

# Process Research Transcript (Forensic Extraction)

## Purpose

Process raw research transcripts with **forensic-level detail preservation**:
1. **Auto-format** YouTube transcripts → proper markdown with metadata
2. **Extract ALL claims** using Toulmin framework (no summarization)
3. **Categorize claims** as main (thesis/view candidates) or evidence (supporting/rebutting)
4. **Structure arguments** with Claim, Evidence, Reasoning, Backing, Qualifier, Rebuttal
5. **Preserve context** for iterative refinement and synthesis

This is **Stage 1** of the research workflow: forensic extraction before synthesis.

## Workflow

```
Input: Raw YouTube transcript OR formatted markdown
  ↓
1. Auto-format (if needed): Extract title, URL, date → markdown frontmatter
2. Forensic claim extraction: ALL claims with full Toulmin structure
3. Categorize claims: Main (thesis/view candidates) vs Evidence (supporting/rebutting)
4. Identify relationships: Which evidence claims support which main claims
5. Generate audit document with all claims, relationships, statistics
6. Update transcript with populated tags (tickers + themes from claims)
  ↓
Output:
  - research-workspace/audits/[file]-audit.md (preserves ALL information)
  - Updated transcript with metadata tags for organization
```

## Instructions

When the user asks to process a transcript:
- "Process the transcript in transcripts/youtube-video.md"
- "Audit this research file"
- "Extract all claims from this transcript"

Follow these steps:

### Step 0: Read Environment Variables and Construct Paths

Before processing, read the Obsidian directory configuration from `.env.local`:

```bash
# Read environment variables
cat /Users/njb/Desktop/trade-journal/.env.local | grep OBSIDIAN
```

Construct the full paths:
- **Transcripts directory**: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_TRANSCRIPTS_DIR}`
- **Audits directory**: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_AUDITS_DIR}`

For example, with defaults:
- Transcripts: `/Users/njb/Desktop/nick/investing/research/transcripts`
- Audits: `/Users/njb/Desktop/nick/investing/research/audits`

Use these paths throughout the skill execution. If env vars are not set, fall back to project-local `research-workspace/` directories.

### Step 1: Read and Format Transcript

**If input is raw YouTube format**:
```
From Apps to Agents: Why 2026 Is the Real AI Inflection Point - YouTube
https://www.youtube.com/watch?v=0Hcw9toVRNg

Transcript:
(00:00) This may be the last video of the year...
(02:15) The key insight is that agents will replace apps...
```

**Auto-format to**:
```markdown
---
title: "From Apps to Agents: Why 2026 Is the Real AI Inflection Point"
source_type: transcript
source_url: "https://www.youtube.com/watch?v=0Hcw9toVRNg"
author: "YouTube"
published_date: "2025-01-20"  # Extract from title or use today's date
tags: []  # Will be populated during extraction
---

# From Apps to Agents: Why 2026 Is the Real AI Inflection Point

**Source**: [YouTube](https://www.youtube.com/watch?v=0Hcw9toVRNg)

## Transcript

(00:00) This may be the last video of the year...
(02:15) The key insight is that agents will replace apps...
```

**Save formatted version** back to the Obsidian transcripts directory with proper filename:
- Input: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_TRANSCRIPTS_DIR}/raw-youtube-paste.md`
- Output: `${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_TRANSCRIPTS_DIR}/2025-01-20-apps-to-agents.md`

**If already formatted**: Skip to Step 2

### Step 2: Forensic Claim Extraction (Toulmin Framework)

**Extract ALL claims** - do not summarize or filter. Each claim gets full Toulmin structure.

#### Toulmin Framework Components

**1. Claim** (The assertion)
- What is being asserted?
- Example: "AI agents will replace traditional applications by 2026"

**2. Evidence** (Data supporting the claim)
- What evidence supports this claim?
- Direct quotes, statistics, examples from transcript
- Example: "GPT-4 can now execute multi-step tasks autonomously; agent market growing 300% YoY"

**3. Reasoning** (Why evidence supports claim)
- Logical connection between evidence and claim
- Example: "When AI can autonomously handle tasks, users won't need application wrappers"

**4. Backing** (Support for reasoning)
- Additional theoretical or empirical support
- Example: "Historical precedent: mobile apps replaced desktop software when mobile hardware enabled standalone functionality"

**5. Qualifier** (Degree of confidence)
- high, medium, low, exploratory
- Based on strength of evidence + reasoning
- Example: "medium" (directionally correct but timing uncertain)

**6. Rebuttal** (Counter-arguments)
- What could invalidate this claim?
- Counter-evidence mentioned in transcript
- Example: "Current AI reliability issues (15% hallucination rate) may delay adoption beyond 2026"

#### Claim Categorization

**Level** (hierarchical position):
- **main**: Could be a thesis/view (stands alone)
- **evidence**: Supports/refutes another claim (nested)

**Type** (function):
- **thesis_candidate**: Macro-level, cross-asset
- **view_candidate**: Asset-specific, ticker-focused
- **supporting**: Evidence supporting a main claim
- **rebutting**: Evidence against a main claim

**Category** (scope):
- **macro**: Cross-asset themes (AI, rates, geopolitics)
- **asset_specific**: Ticker-focused (NVDA, TSMC)

**Tickers** (if mentioned):
- Extract all ticker symbols: NVDA, GOOGL, MSFT
- Validate: 1-5 uppercase letters

**Time Horizon** (if discernible):
- long_term (>1 year)
- medium_term (3 months - 1 year)
- short_term (≤3 months)

### Step 3: Identify Claim Relationships

For each **evidence-level claim**, identify which **main claims** it supports or refutes:

```json
{
  "id": "claim-2",
  "level": "evidence",
  "type": "supporting",
  "claim": "GPT-4 achieves 85% accuracy on complex reasoning benchmarks",
  "supports_claims": ["claim-1"],  // References main claim ID
  ...
}
```

This creates a **claim hierarchy**:
- Main Claim 1: "AI agents will replace apps by 2026"
  - Evidence Claim 2: "GPT-4 achieves 85% on reasoning" (supports)
  - Evidence Claim 3: "Current hallucination rate is 15%" (rebuts)

### Step 4: Generate Audit Document

Create a forensic audit document in the Obsidian audits directory (constructed from env vars in Step 0) with this structure:

```markdown
---
source_transcript: "${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_TRANSCRIPTS_DIR}/2025-01-20-apps-to-agents.md"
audit_date: "2025-01-20"
total_claims: 23
main_claims: 8
evidence_claims: 15
---

# Forensic Audit: From Apps to Agents

**Source**: [YouTube](https://www.youtube.com/watch?v=0Hcw9toVRNg)
**Processed**: 2025-01-20
**Total Claims**: 23 (8 main, 15 evidence)

---

## Main Claims (Thesis/View Candidates)

### Claim 1: AI Agents Will Replace Traditional Applications by 2026

**Level**: main
**Type**: thesis_candidate
**Category**: macro
**Tickers**: GOOGL, MSFT, META
**Time Horizon**: medium_term
**Qualifier**: medium

**Claim**:
AI agents will replace traditional application interfaces by 2026, shifting value from application wrappers to underlying AI capabilities.

**Evidence**:
- GPT-4 demonstrates autonomous multi-step reasoning (Transcript 02:15)
- Agent framework market growing 300% YoY (Transcript 05:30)
- Early adopters (Salesforce, ServiceNow) deploying agent-first products (Transcript 08:45)

**Reasoning**:
When AI can autonomously handle complex tasks end-to-end, users will prefer direct interaction with AI agents over traditional application UIs that require manual navigation and configuration.

**Backing**:
Historical precedent: Mobile apps disrupted desktop software when mobile hardware became capable enough for standalone functionality (2010-2015). Similar capability threshold being crossed for AI agents.

**Rebuttal**:
- Current AI reliability remains inconsistent (15% hallucination rate mentioned at 12:00)
- Enterprise workflows require deterministic outcomes; agents still probabilistic
- Regulatory concerns around autonomous decision-making may slow adoption
- 2026 timeline may be optimistic; 2027-2028 more realistic

**Supporting Evidence Claims**: claim-2, claim-3, claim-5
**Rebutting Evidence Claims**: claim-4, claim-6

---

### Claim 2: NVIDIA Will Face Margin Pressure from Custom AI Chips

**Level**: main
**Type**: view_candidate
**Category**: asset_specific
**Tickers**: NVDA
**Time Horizon**: medium_term
**Qualifier**: low

**Claim**:
NVIDIA's GPU margins will compress as hyperscalers deploy custom AI accelerators (Google TPU, Amazon Trainium, Microsoft Maia).

**Evidence**:
- Google has publicly stated 60% of workloads now run on TPUs (Transcript 18:30)
- Amazon's Trainium chips cost 50% less than comparable NVIDIA GPUs (Transcript 19:15)
- Microsoft designing custom Maia chips for internal workloads (Transcript 20:00)

**Reasoning**:
As hyperscalers' AI workloads scale, the economic incentive to design custom silicon increases. Custom chips optimized for specific workloads can achieve better price/performance than general-purpose GPUs.

**Backing**:
Historical pattern: Hyperscalers vertically integrated when scale justified custom hardware (AWS Graviton for CPU workloads in 2018). AI workloads now at similar scale inflection point.

**Rebuttal**:
- NVIDIA's CUDA ecosystem creates massive switching costs (mentioned at 21:30)
- Custom chips lag NVIDIA's roadmap by 18-24 months (Transcript 22:00)
- Training workloads still heavily favor NVIDIA's architecture
- Total Addressable Market growing fast enough that NVIDIA can grow despite share loss

**Supporting Evidence Claims**: claim-7, claim-8
**Rebutting Evidence Claims**: claim-9, claim-10

---

## Evidence Claims (Supporting/Rebutting)

### Claim 2: GPT-4 Achieves 85% Accuracy on Complex Reasoning Tasks

**Level**: evidence
**Type**: supporting
**Supports**: claim-1 (AI agents replacing apps)

**Claim**:
GPT-4 demonstrates 85% accuracy on multi-step reasoning benchmarks, indicating maturity for autonomous agent workflows.

**Evidence**:
Transcript timestamp 02:45: "Recent benchmarks show GPT-4 hitting 85% on tasks that require planning across multiple steps."

**Reasoning**:
85% accuracy approaches the threshold where AI becomes reliable enough for production deployment in agent scenarios. Users will tolerate occasional errors if overall success rate is >80%.

**Qualifier**: high (benchmark data is verifiable)

**Rebuttal**:
Benchmarks may not reflect real-world complexity. Production deployment requires 95%+ reliability in enterprise contexts.

---

### Claim 3: Agent Framework Market Growing 300% YoY

**Level**: evidence
**Type**: supporting
**Supports**: claim-1 (AI agents replacing apps)

**Claim**:
The market for agent frameworks and orchestration tools is growing 300% year-over-year.

**Evidence**:
Transcript 05:30: "Looking at GitHub stars and npm downloads for agent frameworks, we're seeing 3x growth year-over-year."

**Reasoning**:
Rapid adoption of developer tools signals imminent production deployment. Frameworks mature before applications built on them reach scale.

**Qualifier**: medium (growth metric is directional but not audited)

---

### Claim 4: Current AI Hallucination Rate Remains at 15%

**Level**: evidence
**Type**: rebutting
**Refutes**: claim-1 (AI agents replacing apps)

**Claim**:
Current AI models hallucinate (generate false information) approximately 15% of the time, limiting autonomous agent reliability.

**Evidence**:
Transcript 12:00: "Even the best models still hallucinate about 15% of the time in production use cases."

**Reasoning**:
15% error rate is unacceptable for mission-critical workflows. Enterprise adoption requires <1% error rates for autonomous agents.

**Qualifier**: high (well-documented limitation)

---

[Continue for all 23 claims...]

---

## Claim Relationships

```
Main Claim 1 (Agents replacing apps)
  ├─ SUPPORTED BY
  │   ├─ Claim 2 (GPT-4 85% accuracy)
  │   ├─ Claim 3 (Framework growth 300% YoY)
  │   └─ Claim 5 (Enterprise deployments)
  └─ REBUTTED BY
      ├─ Claim 4 (15% hallucination rate)
      └─ Claim 6 (Regulatory concerns)

Main Claim 2 (NVIDIA margin pressure)
  ├─ SUPPORTED BY
  │   ├─ Claim 7 (Google 60% on TPUs)
  │   └─ Claim 8 (Amazon Trainium cost advantage)
  └─ REBUTTED BY
      ├─ Claim 9 (CUDA switching costs)
      └─ Claim 10 (TAM growth offsets share loss)
```

---

## Summary Statistics

**Main Claims**:
- Thesis Candidates: 5 (macro-level)
- View Candidates: 3 (asset-specific)

**Evidence Claims**:
- Supporting: 9
- Rebutting: 6

**Confidence Distribution**:
- High: 7 claims
- Medium: 12 claims
- Low: 4 claims

**Tickers Mentioned**: GOOGL, MSFT, META, NVDA, AMZN

**Time Horizons**:
- Long-term (5+ years): 2 claims
- Medium-term (1-5 years): 6 claims
- Short-term (<1 year): 0 claims

---

## Next Steps

This audit preserves ALL claims from the transcript. Next:

1. **Synthesize** (`/synthesize-claims`):
   - Cross-reference claims against existing theses/views
   - Generate recommendations for what to create/enhance
   - Map claims to hierarchy

2. **Deep Dive** (`/deep-dive`):
   - Select promising claims to develop further
   - Strengthen Toulmin structure with additional research
   - Develop into full theses/views

3. **Upload** (`/finalize-for-upload`):
   - Commit finalized theses/views to database
   - Link claims as evidence
```

### Step 5: Update Transcript with Metadata Tags

After completing the forensic audit, update the original transcript file with populated metadata tags for organization.

**Extract metadata from audit**:
- Collect all unique tickers mentioned across claims
- Identify major themes/categories from main claims
- Note the published date (from filename or transcript)

**Update transcript frontmatter**:
Add or update the YAML frontmatter at the top of the transcript file:

```yaml
---
title: "From Apps to Agents: Why 2026 Is the Real AI Inflection Point"
author: "YouTube" # Or extract from source if available
source_type: "transcript"
published_date: "2025-01-20"
source_url: "https://www.youtube.com/watch?v=0Hcw9toVRNg"
tags: ["AI agents", "enterprise adoption", "GOOGL", "MSFT", "META", "NVDA", "infrastructure"]
---
```

**Tag population strategy**:
- Include major themes from thesis candidates (e.g., "AI agents", "labor deflation", "multimodality")
- Include all ticker symbols mentioned (e.g., "GOOGL", "NVDA", "TSLA", "BTC")
- Include key topics from view candidates (e.g., "autonomous driving", "infrastructure", "semiconductors")
- Limit to 5-10 most relevant tags for organization
- Use consistent tag naming (lowercase for themes, UPPERCASE for tickers)

**Write updated transcript**:
Use the Edit or Write tool to update the transcript file with the new frontmatter while preserving all transcript content.

## Output Format

Save audit to the Obsidian audits directory (from env vars):
```
${OBSIDIAN_VAULT_PATH}/${OBSIDIAN_AUDITS_DIR}/[date]-[slug]-audit.md
```

For example (with default env vars):
- Input: `/Users/njb/Desktop/nick/investing/research/transcripts/2025-01-20-apps-to-agents.md`
- Output: `/Users/njb/Desktop/nick/investing/research/audits/2025-01-20-apps-to-agents-audit.md`

## Key Principles

**Forensic Detail**:
- Extract EVERY claim, even minor ones
- Preserve exact quotes and timestamps
- Don't editorialize or interpret beyond what's stated
- If uncertain, note as "unclear from transcript"

**Toulmin Rigor**:
- Every claim must have Evidence (data/quotes supporting it)
- Reasoning explains WHY Evidence supports Claim
- Qualifier reflects strength of Evidence + Reasoning
- Rebuttal captures counter-arguments

**Hierarchical Structure**:
- Main claims can stand alone (thesis/view candidates)
- Evidence claims are nested (support/refute main claims)
- Clear relationships between levels

**Migration-Friendly**:
- Use consistent field names with FUTURE_ENHANCEMENTS.md Option B schema
- Structure data for easy migration to dedicated claims table
- Preserve claim IDs for referencing

## Notes

- This skill does NOT cross-reference against existing hierarchy (that's `/synthesize-claims`)
- This skill does NOT upload to database (that's `/finalize-for-upload`)
- Output is a forensic audit for review and iteration
- User can refine claims before moving to synthesis stage
- Focus on COMPLETENESS over conciseness
- When in doubt, extract more claims rather than fewer
- Preserve exact quotes with timestamps for traceability
- ALWAYS update the original transcript file with populated tags after completing the audit (Step 5)
