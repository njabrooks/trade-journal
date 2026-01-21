# Research Playbook Adaptations

This document captures the adaptations made from `research-playbook-v1.1.md` based on testing with idea-001 (Advanced Packaging Growth).

**Test completed**: 2026-01-21
**Pipeline duration**: ~5 hours (single session)
**Outcome**: Stage 5 complete, decision: ACT (ASE, Besi as expressions)

---

## Quick Reference: Key Differences

| Aspect | Original Playbook | Our Implementation |
|--------|-------------------|-------------------|
| Stage 1 extraction | 7 claims max, lean | All claims, full Toulmin |
| Prompt discipline | One task per prompt | Combined related tasks per skill |
| Output format | JSON state objects | Markdown files + YAML frontmatter |
| Deep Research | Claude API (assumed) | Claude desktop (manual workflow) |
| Stage 4 gate | advance/hold/kill | advance/hold/kill/**modify_and_advance** |
| Stage 5 Part B | Deep Research | TradingView/broker (optional) |

---

## Stage-by-Stage Adaptations

### Stage 1: Signal Triage

**Playbook**: Lean extraction with novelty scoring
**Our approach**: Forensic Toulmin extraction via `/process-transcript`, filtering at `/init-idea`

**Why**: Our existing audit system captures rich evidence structure. Rather than lose information, we extract everything and filter when entering the pipeline.

**Benefit realized (idea-001)**: The audit's detailed evidence (AMD 41% cost savings, TSMC CapEx figures) made Stages 2-3 much easier.

---

### Stage 2: Theme Formalisation

**Playbook**: Two prompts (2A skeleton, 2B failure modes)
**Our approach**: Single `/formalize-thesis` skill

**Why**: Failure modes naturally flow from thesis formulation. Separating creates artificial friction.

**Benefit realized (idea-001)**: The 5 failure modes directly informed Stage 3 unknowns. "TSMC value capture" execution risk became the most critical unknown.

---

### Stage 3: Unknown Mapping

**Playbook**: Two prompts (3A unknowns, 3B research scope)
**Our approach**: Single `/map-unknowns` skill with research plan

**Key adaptation**: Kill conditions must be SPECIFIC and MEASURABLE.

| Bad | Good |
|-----|------|
| "If TSMC dominates" | "If TSMC CoWoS >80% AND vertical integration into substrates/equipment" |

**Benefit realized (idea-001)**: Specific kill conditions enabled clear evidence assessment in Stage 4.

---

### Stage 4: Evidence Resolution

**Major adaptation: Claude Desktop Workflow**

The playbook assumes Claude Deep Research as API. Our workflow:

1. `/research-unknown-desktop` generates prompts for Claude desktop
2. User runs Deep Research in Claude desktop
3. User saves output as `Unknown {N} - {title} - {Track} Analysis.md`
4. `/synthesize-evidence` consolidates files + synthesizes

**Key insight (idea-001)**: Falsification tracks were most valuable. The falsification track on Unknown 3 (TSMC dominance) partially triggered a kill condition (85% share) AND revealed the complement thesis. Validation mostly confirmed priors.

---

### Stage 4 Gate: modify_and_advance

**New gate option not explicit in playbook**

When evidence requires thesis refinement but core insight remains valid:

```yaml
decision: modify_and_advance
note: "Core economics validated. Thesis modified to reflect TSMC dominance at high-end
      and differentiated OSAT positioning."
```

**Example from idea-001**:

Original thesis:
> "...shifting CapEx and margins toward packaging infrastructure"

Modified thesis:
> "...TSMC dominates high-end packaging (~85%), but independent ecosystem players (ASE, Besi, substrate suppliers) capture meaningful value as complementary overflow providers"

This modification sharpened the investable expression rather than weakening it.

---

### Stage 5: Expression & Positioning

**Playbook**: Part A (value chain), Part B (decision support), Part C (sizing)
**Our approach**: Same structure, Part B explicitly optional

**Key adaptation**: Part B (sentiment, technicals, catalysts) uses TradingView/broker data rather than Deep Research. Marked as "TBD" placeholders when not needed.

**Key insight (idea-001)**: Order of effects classification was the most valuable output. Revealed 1st-order plays (TSMC, NVIDIA) are crowded; 2nd-order plays (ASE, Besi) offer better risk/reward.

---

## Skills Implemented

| Skill | Stage | Playbook Equivalent |
|-------|-------|---------------------|
| `/init-idea` | 1 | Stage 1 gate |
| `/formalize-thesis` | 2 | Prompts 2A + 2B |
| `/map-unknowns` | 3 | Prompts 3A + 3B |
| `/research-unknown` | 4A | Prompts 4A-4C (for Claude Code) |
| `/research-unknown-desktop` | 4A | Prompts 4A-4C (for Claude desktop) |
| `/synthesize-evidence` | 4B | Prompt 4D + consolidation |
| `/express-thesis` | 5 | Prompts 5A-5F |
| `/advance-or-kill` | Any | Gate evaluation |
| `/pipeline-status` | N/A | Status dashboard |

---

## Lessons Learned

### 1. Falsification tracks are most valuable

They either:
- **Validate** (by not finding contradicting evidence)
- **Modify** (by finding partial contradictions that refine the thesis)

Validation tracks mostly confirm priors.

### 2. Kill conditions must be specific

| Vague (useless) | Specific (testable) |
|-----------------|---------------------|
| "If it doesn't work out" | "If CoWoS yields <75% at HVM" |
| "If competition intensifies" | "If TSMC vertical integrates into substrates" |

### 3. modify_and_advance is common

Pure "advance" without modification may be rare for ideas with complex evidence. Most ideas that survive will have some refinement.

### 4. Order of effects reveals alpha

- 1st-order: Obvious, crowded, potentially already priced
- 2nd-order: Less attention, may offer better entry
- 3rd-order: Most indirect, longest duration

### 5. Confidence changes are small

idea-001 journey: 0.75 → 0.75 → 0.70 → 0.72 → 0.72

Large swings suggest either:
- Poor prior calibration, or
- Dramatic contradicting evidence

### 6. Time investment scales with unknowns

| Stage | Time |
|-------|------|
| Stage 1 (init) | 15 min |
| Stage 2 (thesis) | 15 min |
| Stage 3 (unknowns) | 30 min |
| Stage 4 (research) | 2-2.5 hours |
| Stage 5 (expression) | 30 min |
| **Total** | **~5 hours** |

Stage 4 is the bottleneck. Reducing unknowns reduces time.

### 7. Documentation compounds

idea-001 produced ~1,300 lines of structured Markdown across 5 stage files. This creates an audit trail that can be:
- Revisited when market conditions change
- Updated with new evidence
- Used to learn from outcomes

---

## What We Preserved Exactly

These elements are implemented as specified in the playbook:

- Gate criteria (novelty ≥ 0.6, confidence ≥ 0.65)
- Stage progression (1 → 2 → 3 → 4 → 5)
- Kill log with categories and lessons learned
- Failure modes structure (5 modes, 2+ structural, 1+ execution)
- Unknown mapping framework (kill condition, conviction increase condition)
- Three research tracks (falsification, validation, analogues)
- Evidence synthesis structure (source weighting, contradiction log, belief update)
- Value chain mapping (upstream, direct, downstream, enablers)
- Order of effects classification
- **"No-trade is a valid success state"** principle

---

## Integration with Trade Journal

After Stage 5 completes with decision `act`:

```
Pipeline Idea
    ↓ /finalize-for-upload
Macro Thesis (Supabase)
    ↓ link
Asset Theses (ASE, Besi)
    ↓ create
Strategies
    ↓ execute
Positions
    ↓ track
Journal Entries
```

Full provenance: Transcript → Claim → Pipeline Idea → Macro Thesis → Asset Thesis → Strategy → Position

---

## Future Enhancements

1. **Kill log analysis**: Add periodic review prompts (monthly/quarterly) per playbook Section 4
2. **Database integration**: Add `ideas` table with stage tracking
3. **Confidence calibration**: Track prediction accuracy over time
4. **Deep Research API**: Simplify Stage 4 if Claude Deep Research becomes API-accessible
