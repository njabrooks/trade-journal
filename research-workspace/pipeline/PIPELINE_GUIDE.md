# Research Pipeline Guide

A 5-stage process for converting raw claims into investment decisions. Each stage has a gate — ideas must earn the right to advance. Most ideas should die early. A no-trade decision is a valid success state.

**Pipeline location**: `research-workspace/pipeline/`
**Skills prefix**: `/stage-{N}-*` (invoked via Claude Code)

---

## Pipeline Overview

```
Source Material (transcript, article, audit)
    │
    ▼
┌─────────────────────────────────────────────┐
│  Stage 1: Signal Triage                     │
│  "Is this worth formalizing?"               │
│  Gate: novelty ≥ 0.6, mechanism plausible   │
│  Skill: /stage-1-init-idea                  │
│  Output: _meta.yaml, stage-1-triage.md      │
│  Time: ~15 min                              │
└──────────────────┬──────────────────────────┘
                   │ advance
                   ▼
┌─────────────────────────────────────────────┐
│  Stage 2: Theme Formalisation               │
│  "What exactly is the thesis?"              │
│  Gate: falsifiable, 5 failure modes         │
│  Skill: /stage-2-formalize-thesis           │
│  Output: stage-2-thesis.md                  │
│  Time: ~15 min                              │
└──────────────────┬──────────────────────────┘
                   │ advance
                   ▼
┌─────────────────────────────────────────────┐
│  Stage 3: Unknown Mapping                   │
│  "What would change my mind?"               │
│  Gate: ≥1 HIGH-impact resolvable unknown    │
│  Skill: /stage-3-map-unknowns              │
│  Output: stage-3-unknowns.md               │
│  Time: ~30 min                              │
│  *** MOST IMPORTANT GATE ***                │
└──────────────────┬──────────────────────────┘
                   │ advance
                   ▼
┌─────────────────────────────────────────────┐
│  Stage 4: Evidence Resolution               │
│  "What does the evidence say?"              │
│  Gate: confidence ≥ 0.65 to advance         │
│  Skills: /stage-4a-* (research)             │
│          /stage-4b-synthesize-evidence       │
│  Output: unknown-N-*.md, stage-4-evidence.md│
│  Time: 2-4 hours (bottleneck stage)         │
└──────────────────┬──────────────────────────┘
                   │ advance / modify / hold / kill
                   ▼
┌─────────────────────────────────────────────┐
│  Stage 5: Expression & Positioning          │
│  "How do I express this in a portfolio?"    │
│  Decision: act / watch / discard            │
│  Skill: /stage-5-express-thesis             │
│  Output: stage-5-expression.md              │
│  Time: ~30 min                              │
└──────────────────┬──────────────────────────┘
                   │ act → Trade Journal DB
                   │ watch → review schedule
                   │ discard → kill log
                   ▼
┌─────────────────────────────────────────────┐
│  Trade Journal Integration                  │
│  /finalize-for-upload → Supabase            │
│  Link claims → theses → strategies          │
└─────────────────────────────────────────────┘
```

---

## Stage Details

### Stage 1: Signal Triage

**Purpose**: Decide whether a claim is worth formalizing into a thesis.

**Skill**: `/stage-1-init-idea <audit-path> [claim-N]` or `/stage-1-init-idea <transcript-path>`

**Input**: An audit file (from `/process-transcript`) with extracted Toulmin claims, or a raw transcript.

**Process**:
1. If given a transcript, run forensic Toulmin extraction first
2. List all claims, let user select the most promising
3. Assess novelty (0-1 scale) and mechanism plausibility
4. Create idea directory with `_meta.yaml` and `stage-1-triage.md`

**Output directory**: `pipeline/idea-{NNN}-{slug}/`

**Gate criteria**:
- **Advance**: Novelty score ≥ 0.6, mechanism is plausible
- **Kill**: Consensus view, no clear mechanism, already well-known

**Key fields in `_meta.yaml`**:
```yaml
idea_id: "idea-NNN"
title: "..."
slug: "..."
current_stage: 1
status: active
source_claim_id: "claim-N"
source_audit: "path/to/audit.md"
confidence: 0.XX
```

---

### Stage 2: Theme Formalisation

**Purpose**: Transform an intuitive claim into a falsifiable thesis with explicit failure modes.

**Skill**: `/stage-2-formalize-thesis idea-NNN`

**Input**: `stage-1-triage.md` from the idea directory.

**Process**:
1. Distill core thesis (25 words max)
2. Identify primary economic driver
3. Map value chain impact (causal chain)
4. List beneficiaries and victims
5. Define exactly 5 failure modes (≥2 structural, ≥1 execution)

**Output**: `stage-2-thesis.md`

**Gate criteria**:
- **Advance**: Thesis is crisp, falsifiable; all 5 failure modes are specific and observable
- **Hold**: Failure modes are vague, needs refinement
- **Kill**: Cannot define what would prove it wrong (unfalsifiable)

**Failure mode structure**:
```markdown
### N. {Title} [{category}]
**Description**: What goes wrong
**Evidence Indicators**: What to look for
```

Categories: `structural`, `execution`, `timing`, `external`

---

### Stage 3: Unknown Mapping

**Purpose**: Identify which uncertainties actually matter and whether they're worth researching. This is the most important gate — ideas that pass here have earned research effort.

**Skill**: `/stage-3-map-unknowns idea-NNN`

**Input**: `stage-2-thesis.md` (thesis + failure modes).

**Process**:
1. List ALL unknowns derived from thesis and failure modes
2. Rank by decision impact (HIGH / MEDIUM / LOW)
3. For each: can it be researched externally? Is the answer already priced in?
4. Detail top 3 with kill conditions, conviction increase conditions, resolution approach
5. Design research plan with priority order and estimated effort

**Output**: `stage-3-unknowns.md`

**Gate criteria**:
- **Advance**: ≥1 HIGH-impact unknown that is externally resolvable with clear kill conditions
- **Kill**: No decisive unknowns (narrative-driven, not evidence-driven)
- **Archive**: Unknowns exist but aren't currently resolvable; revisit later

**For each top unknown**:
```markdown
**Kill Condition**: specific, observable evidence that invalidates the thesis
**Conviction Increase Condition**: specific evidence that strengthens it
**Resolution Type**: empirical | industry | regulatory | technological
**Externally Resolvable**: yes | no | partially
**Research Queries**: specific, actionable questions
**Estimated Effort**: hours
```

**Key principle**: An unknown matters only if resolving it would change conviction, it's potentially resolvable, and the answer isn't already priced in.

---

### Stage 4: Evidence Resolution

The pipeline's bottleneck stage. Two sub-stages and two research paths.

#### Stage 4A: Research

**Two options per unknown**:

| Path | Skill | Best For |
|------|-------|----------|
| Claude Desktop (Deep Research) | `/stage-4a-prep-desktop-research idea-NNN unknown-N track` | High-stakes unknowns needing deep web research |
| Claude Code (WebSearch) | `/stage-4a-research-unknown idea-NNN unknown-N track` | Quick questions, lower-priority unknowns |

**Three research tracks**:

| Track | Purpose | Most Valuable When |
|-------|---------|-------------------|
| `falsification` | Find disconfirming evidence | Always run first (sequential kill chain) |
| `validation` | Find confirming evidence with mechanism detail | Core economics need quantification |
| `analogues` | Find historical precedents | Novel thesis with no direct evidence |

**Desktop Research workflow**:
1. `/stage-4a-prep-desktop-research` generates a self-contained prompt
2. Copy-paste prompt into Claude Desktop
3. Claude Desktop runs Deep Research
4. Save output as `unknown-{N}-{track}-analysis.md` in the idea directory

**Output per track**: `unknown-{N}-{track}-analysis.md` with 5-10 findings, kill/conviction condition assessment, source references.

**Sequential kill chain**: Research unknowns in order of resolvability. If Unknown 3 triggers a kill condition, skip Unknowns 1-2 and save hours.

#### Stage 4B: Evidence Synthesis

**Skill**: `/stage-4b-synthesize-evidence idea-NNN`

**Input**: All `unknown-*-analysis.md` files plus thesis and unknowns from earlier stages.

**Process**:
1. Consolidate findings by theme (not by source)
2. Weight sources by credibility (company filings > academic > media)
3. Document contradictions (flag critical unresolved ones)
4. Evaluate each unknown's kill/conviction conditions
5. Calculate belief update: Prior confidence → Posterior confidence
6. Make gate recommendation

**Output**: `stage-4-evidence.md` (comprehensive synthesis)

**Gate criteria**:

| Decision | Condition |
|----------|-----------|
| **Advance** | Confidence ≥ 0.65, no kill conditions triggered |
| **Hold** | Confidence 0.50-0.65, no kill triggers, more research could help |
| **Kill** | Confidence < 0.50 OR kill condition triggered |
| **Modify** | Core insight valid but thesis framing wrong — refine Stage 2, re-evaluate |

**Confidence scale**:
- 0.80+: Very high (multiple confirming sources, no contradictions)
- 0.65-0.79: High (thesis supported, minor concerns)
- 0.50-0.64: Moderate (mixed evidence, meaningful uncertainty)
- 0.35-0.49: Low (significant concerns or contradictions)
- <0.35: Very low (thesis contradicted)

---

### Stage 5: Expression & Positioning

**Purpose**: Translate conviction into an actionable framework for portfolio positioning. The skill provides structure; the human decides allocation.

**Skill**: `/stage-5-express-thesis idea-NNN`

**Input**: Completed Stage 4 with confidence ≥ 0.65 (or modified thesis at any confidence for watch/discard).

**Process**:
1. Map the full value chain (upstream suppliers, direct players, downstream customers, enablers)
2. Classify order of effects (1st, 2nd, 3rd order + potential shorts)
3. Check existing portfolio for overlap (query Trade Journal DB)
4. Compile sizing inputs (conviction mapping, liquidity, volatility, correlation, max adverse)
5. Make final decision: act / watch / discard

**Output**: `stage-5-expression.md`

**Order of effects** (where alpha often hides):
- **1st-order**: Obvious, crowded, potentially already priced
- **2nd-order**: Less attention, may offer better entry
- **3rd-order**: Most indirect, longest duration, least crowded
- **Potential shorts**: Victims on 5-10yr horizons

**Final decision**:

| Decision | When | What Happens |
|----------|------|-------------|
| **Act** | Conviction ≥ 0.65, pure expression exists, acceptable sizing | Define entry criteria, position size, exit triggers |
| **Watch** | Direction validated but expression unclear, or conviction below threshold | Set review date, define act triggers and kill signals |
| **Discard** | No viable expression despite valid thesis | Log reasoning, close idea |

---

## Supporting Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `/advance-or-kill` | Gate evaluation at any stage | When an idea is stalled or needs a formal kill decision |
| `/pipeline-status` | Dashboard of all active ideas | Morning review, checking pipeline health |

**Kill categories**: `weak_mechanism`, `consensus`, `unfalsifiable`, `negative_evidence`, `unresolvable`, `poor_expression`

**Kill log**: Ideas killed via `/advance-or-kill` are moved to `pipeline/kill-log/` with category and lesson learned. Periodic review of kill patterns improves future triage.

---

## Trade Journal Integration

After Stage 5 with decision `act`:

```
Pipeline Idea (stage-5-expression.md)
    │ /finalize-for-upload
    ▼
Macro Thesis or Asset Thesis (Supabase)
    │ /link-claim-to-thesis
    ▼
Linked Claims (evidence chain)
    │ create strategy
    ▼
Strategy → Positions → Journal Entries
```

Full provenance: Transcript → Claim → Pipeline Idea → Thesis → Strategy → Position

After Stage 5 with decision `watch`:
- Set `next_review` date in `_meta.yaml`
- Define `review_triggers` (specific events that would change conviction)
- Existing portfolio positions may already capture the thesis (no new trade needed)

---

## Directory Structure

```
research-workspace/pipeline/
├── PIPELINE_GUIDE.md              ← this file
├── kill-log/                      ← killed ideas (created by /advance-or-kill)
│   └── idea-NNN-slug/
│       └── kill-record.md
└── idea-NNN-slug/                 ← one directory per idea
    ├── _meta.yaml                 ← central metadata (stage, confidence, history)
    ├── stage-1-triage.md          ← signal triage assessment
    ├── stage-2-thesis.md          ← formalized thesis + failure modes
    ├── stage-3-unknowns.md        ← ranked unknowns + research plan
    ├── unknown-1-falsification-analysis.md  ← Stage 4A research output
    ├── unknown-2-validation-analysis.md     ← Stage 4A research output
    ├── unknown-3-falsification-analysis.md  ← Stage 4A research output
    ├── stage-4-evidence.md        ← synthesis + belief update
    └── stage-5-expression.md      ← value chain + positioning
```

---

## Pipeline Track Record

| Idea | Title | Final Stage | Decision | Confidence | Key Lesson |
|------|-------|------------|----------|------------|------------|
| idea-001 | Advanced Packaging Growth | 5 | **ACT** (ASE, Besi) | 0.72 | 2nd-order plays beat crowded 1st-order |
| idea-002 | Copper AI Demand-Supply Gap | 5 | **WATCH** | 0.58 | Valid direction, timing uncertain |
| idea-003 | Natural Gas Trifecta Demand Shock | 5 | **WATCH** | 0.55 | Multiple drivers but each individually weak |
| idea-004 | Physical World AI 2026 | 3 | active | 0.70 | In progress — unknowns being mapped |
| idea-005 | Met Coal Asymmetric Upside | 4 | active | 0.25 | Evidence heading toward kill |
| idea-006 | SpaceX-xAI Orbital Compute Monopoly | 5 | **WATCH** | 0.55 | Timeline thesis failed; direction survived via modify |

**Pattern emerging**: `modify_and_advance` at Stage 4 is common (idea-001, idea-006). Pure advance without modification may be rare for complex theses.

---

## Lessons Learned

### From idea-001 (Advanced Packaging)

1. **Falsification tracks are the most valuable research investment.** The falsification track on TSMC dominance partially triggered a kill condition AND revealed the complement thesis (OSATs as overflow providers). Validation mostly confirmed priors.

2. **Confidence changes are usually small.** idea-001 journey: 0.75 → 0.75 → 0.70 → 0.72 → 0.72. Large swings suggest either poor prior calibration or dramatic contradicting evidence.

3. **Order of effects classification reveals alpha.** 1st-order plays (TSMC, NVIDIA) were crowded; 2nd-order plays (ASE, Besi) offered better risk/reward with less attention.

### From idea-006 (Space AI Compute)

4. **A high novelty score does not mean high probability.** Novelty 0.90 reflected that the claim was surprising and underexplored — not that it was likely. Confidence dropped from 0.90 to 0.35 when evidence showed the timeline was wrong.

5. **`modify` is the most interesting gate outcome.** The original thesis ("cheapest in 36 months") failed, but the underlying insight (vertical integration moat) survived on a longer timeline. The reframe from "timeline trade" to "monopoly position" changed the entire expression.

6. **Watch is a valid success state.** idea-006 produced no new trade but strengthened conviction behind two existing positions (Bullish TSLA Long Term, Bullish Space Exploration). The research prevented a misguided 36-month trade timing.

7. **Existing portfolio overlap matters.** Stage 5 should always check whether the thesis is already captured by existing positions. Adding a new position for narrative satisfaction when existing exposure already captures the thesis is a common mistake.

### General Principles

8. **Kill conditions must be specific and measurable.** "If it doesn't work out" is useless. "If CoWoS yields <75% at HVM" or "If Starship flight cadence <25/yr through 2028" are testable.

9. **Stage 4 is the bottleneck.** It takes 2-4 hours depending on number of unknowns and tracks. Reducing unknowns at Stage 3 (by being ruthless about what actually matters) reduces total pipeline time.

10. **Documentation compounds.** Each completed idea produces ~1,000-1,500 lines of structured markdown — an audit trail that can be revisited when conditions change, updated with new evidence, and used to calibrate future confidence.

---

## Confidence Calibration Guide

Based on pipeline experience, priors should be set conservatively:

| Prior Source | Suggested Starting Confidence |
|-------------|-------------------------------|
| High-novelty claim from credible source | 0.60-0.70 |
| Well-evidenced structural thesis | 0.65-0.75 |
| Single-source speculative claim | 0.40-0.55 |
| Celebrity/founder claim (e.g., Musk timeline) | 0.45-0.60 |

**Posterior adjustments** at Stage 4 should typically be ±0.05-0.15. Larger swings (like idea-006's -0.55) indicate the prior was miscalibrated — the novelty score was treated as a probability when it was really a measure of information surprise.

---

## Quick Start

```bash
# 1. Initialize from an audit
/stage-1-init-idea notes/research-workspace/transcripts-audits/YYYYMMDD-slug-AUDIT.md

# 2. Formalize thesis
/stage-2-formalize-thesis idea-NNN

# 3. Map unknowns
/stage-3-map-unknowns idea-NNN

# 4. Research (Desktop path — recommended)
/stage-4a-prep-desktop-research idea-NNN unknown-1 falsification
# → paste into Claude Desktop, save output, repeat per unknown/track

# 5. Synthesize
/stage-4b-synthesize-evidence idea-NNN

# 6. Express
/stage-5-express-thesis idea-NNN

# Check pipeline status anytime
/pipeline-status
```
