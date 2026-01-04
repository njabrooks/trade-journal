# Active Development Roadmap

**Living Document**: Track ongoing and planned enhancements
**Phase Numbering**: Continues from completion log (starts at Phase 2.8)
**Priority Framework**: Tier 1 (Quick Wins) → Tier 2 (Strategic) → Tier 3 (Long-Term)
**Status Legend**: 🚧 In Progress | 🎯 Prioritized | 💡 Proposed | ⏸️ Deferred

**Related Documents**:
- [Implementation Completion Log](archive/implementation_completion_log.md) - Phases 1.0-2.7
- [PRD v1.1](PRD_v1.1.md) - Product vision
- [Future Enhancements](FUTURE_ENHANCEMENTS.md) - Full enhancement registry
- [System Architecture Transition Plan](system_architecture_transition_plan.md) - Technical architecture

---

## Development Principles

1. **Capture reasoning** - Document logic behind every action for learning
2. **Re-underwrite beliefs** - Systematic review of claims and theses
3. **Provenance tracking** - Always know where evidence came from
4. **Progressive disclosure** - Show context at decision point, not beforehand
5. **Evidence-driven conviction** - Link outcomes to beliefs for validation

---

## Phase 2.8: AI-Generated Thesis Summaries ✅

**Goal**: Generate AI summaries of asset theses from linked claims with provenance tracking

**PRD Alignment**: Section 5.5 (Thesis Evaluation & Re-Underwriting), Section 5.7 (Role of AI)

**Status**: ✅ Complete (2026-01-02)

**Deliverables**:
- ✅ Database schema (5 new fields on `asset_theses`)
- ✅ Claude Code skill: `/generate-summary` with rigorous 5-step synthesis process
- ✅ UI integration (Summary section with staleness indicator)
- ✅ Claims column in UnifiedAssetThesisBrowser (sortable)
- ✅ Fixed mappingType badges in UnifiedClaimsBrowser
- ⏸️ Future: Triage trigger for stale summaries (Phase 3.0)

**Why This Helps**:
- **Decision Quality**: Synthesized evidence at point of review
- **Provenance**: Track which claims support conclusions
- **Staleness Detection**: Know when thesis needs re-underwriting
- **Learning**: Compare AI synthesis vs manual description over time

**Implementation Details**:
- Separate `ai_summary` field preserves manual `description`
- `ai_summary_claim_ids` array tracks provenance
- `ai_summary_claim_count` enables staleness detection
- Two modes: paragraph (2-3 paragraphs) and deep-dive (full Toulmin)
- Manual trigger only (skill-based, no automation yet)

**Effort**: 3-4 days
**Dependencies**: None (builds on Phase 2.6 claims infrastructure)

**Enhancement ID**: #ENH-024

---

## Phase 2.9: Claims-Aware Triage UI 🎯

**Goal**: Show supporting claims and evidence summary inline in triage detail view

**PRD Alignment**: Section 6 (Workflow & Triage Engine), Section 7 (Decision Support)

**Status**: 🎯 Prioritized (Tier 1 - Quick Win)

**Deliverables**:
- Component: `<ClaimsContext>` shows linked claims in triage
- Evidence summary: "7 supports, 2 refutes, last updated 3 days ago"
- Expandable claim details with full Toulmin framework
- Integration: Triage detail page, strategy pages

**Why This Helps**:
- **Context at decision point**: See why strategy exists when reviewing triage
- **Informed decisions**: Full evidence available without navigation
- **Confidence**: Know recency and strength of supporting evidence
- **Reduces cognitive load**: No need to remember thesis rationale

**Implementation Approach**:
- Query claims linked to strategy's asset thesis
- Display in collapsible section above triage actions
- Color-coded evidence type indicators (supports/refutes/foundation)
- Link to full claim detail for deep dives

**Effort**: 2-3 days
**Dependencies**: Phase 2.8 (AI summaries useful but not required)

**Enhancement ID**: #ENH-003 (enhanced from original deferral)

---

## Phase 2.10: Strategy Provenance Chain Component 🎯

**Goal**: "Why am I holding this position?" component showing full hierarchy chain

**PRD Alignment**: Section 3 (Conceptual Model - Decision Hierarchy)

**Status**: 🎯 Prioritized (Tier 1 - Quick Win)

**Deliverables**:
- Component: `<ProvenanceChain>` - Position → Strategy → Asset Thesis → Macro Thesis → Claims
- Collapsible sections with expandable details
- Integration: Strategy detail, triage pages, position pages
- Visual flow diagram with hierarchy levels

**Why This Helps**:
- **Clarity**: Instant answer to "why this position?"
- **Prevents orphaned positions**: Forces explicit linkage
- **Learning**: Trace decision rationale over time
- **Risk management**: Identify positions relying on weak theses

**Implementation Approach**:
- Recursive query up hierarchy from position
- Visual breadcrumb-style component
- Click to expand each level
- Show evidence summary at thesis level

**Effort**: 2-3 days
**Dependencies**: None (uses existing hierarchy)

**Enhancement ID**: #ENH-025

---

## Phase 3: Thesis Synthesis & Monitoring System 🎯

**Goal**: Transform atomic research claims into articulated investment theses with explicit validation/invalidation criteria, then monitor those criteria over time to ensure accountability and enable learning.

**PRD Alignment**: Sections 5.5 (Thesis Evaluation), 5.7 (Role of AI), 6.1 (Triggers), 8 (Institutional Memory)

**Status**: 🎯 Requirements Complete (2026-01-03)

**Specification**: [docs/features/thesis-synthesis-monitoring.md](features/thesis-synthesis-monitoring.md)

**Note**: This phase consolidates and supersedes several previously planned items:
- #ENH-022 (AI Summary Generation) → absorbed into #ENH-035
- #ENH-031 (News/Narrative Monitoring) → absorbed into #ENH-038/039
- #ENH-033 (Thesis Evolution Timeline) → absorbed into #ENH-035 versioning
- #ENH-034 (AI Summary Version History) → absorbed into #ENH-035
- Phase 3.0-old (Thesis Review Triggers) → absorbed into #ENH-038
- Phase 4.0-old (Decision Journal) → partially absorbed into #ENH-037

---

### Phase 3.1: MVP - Synthesis & Manual Tracking 🚧

**Status**: 🚧 In Progress (Started 2026-01-04)

#### #ENH-035: Thesis Articulation Generation
**Effort**: 1 week

**Deliverables**:
- ✅ `/synthesize-thesis` Claude Code skill (`.claude/skills/synthesize-thesis/SKILL.md`)
- ✅ `thesis_articulations` table with versioning (`migrations/phase3_1_thesis_synthesis_monitoring.sql`)
- ✅ Drizzle schema types (`src/db/schema.ts`)
- ⏳ Interactive refinement workflow (pending end-to-end testing)
- ✅ Provenance tracking (which claims were synthesized)

**Why This Helps**:
- **Crystallizes beliefs**: Forces articulation of what you believe and why
- **Identifies assumptions**: Surfaces implicit assumptions that can be tested
- **Tracks evolution**: Versioned storage shows how beliefs change over time
- **Enables validation**: Articulated thesis → extractable validation criteria

#### #ENH-036: Validation/Invalidation Point Extraction
**Effort**: 1 week
**Dependencies**: #ENH-035

**Deliverables**:
- ✅ Extraction as part of `/synthesize-thesis` skill
- ✅ `validation_points` table with explicit/judgment classification
- ✅ Response protocol specification (in skill prompt)
- ✅ Push-for-specificity interaction pattern (in skill prompt)

**Why This Helps**:
- **Falsifiability**: Makes theses testable - what would prove you wrong?
- **Accountability**: Explicit criteria you commit to
- **Process discipline**: Forces thinking through success/failure conditions
- **Monitoring targets**: Creates concrete things to track

#### #ENH-037: Manual Status Tracking & Audit Trail
**Effort**: 1 week
**Dependencies**: #ENH-036

**Deliverables**:
- ✅ `validation_status_history` table
- ✅ `decision_audit_log` table
- ⏳ Validation point detail UI with status timeline
- ⏳ Divergence acknowledgment workflow

**Why This Helps**:
- **Commitment device**: You've stated your process, now system tracks adherence
- **Full audit trail**: See exactly what changed and when
- **Divergence capture**: When you don't follow process, record why
- **Learning data**: Foundation for post-outcome analysis

---

### Phase 3.2: Automated Monitoring 💡

**Status**: 💡 Proposed (Tier 2 - Strategic)

#### #ENH-038: Automated Monitoring System
**Effort**: 2 weeks
**Dependencies**: #ENH-037

**Deliverables**:
- `monitoring_specs` table
- `/monitor-theses` scheduled Claude Code skill
- GitHub Actions cron integration
- Relevance scoring and noise filtering
- In-app alert system

**Why This Helps**:
- **Proactive intelligence**: Claude watches for you
- **Reduces cognitive load**: Don't need to remember what to track
- **Timely alerts**: Know when validation points are affected
- **Systematic coverage**: No blind spots in monitoring

**Note**: Absorbs and extends the original Phase 3.0 "Thesis Review Triggers" (#ENH-026) concept.

---

### Phase 3.3: News & Narratives 💡

**Status**: 💡 Proposed (Tier 2 - Strategic)

#### #ENH-039: News & Narratives Integration
**Effort**: 2-3 weeks
**Dependencies**: #ENH-038

**Deliverables**:
- Narrative tracking system
- Cross-thesis intelligence ("affects 3 theses")
- Source management and credibility scoring
- Financial data provider API integrations

**Why This Helps**:
- **Beyond explicit monitoring**: Catch things you didn't know to watch for
- **Cross-thesis insights**: See how developments ripple across portfolio
- **Source quality**: Weight information by credibility
- **Emerging narratives**: Spot new themes before they're obvious

**Note**: Supersedes the original #ENH-031 (News/Narrative Monitoring) with a more comprehensive design.

---

### Phase 3.4: Learning & Feedback ⏸️

**Status**: ⏸️ Deferred (Tier 3 - Long-Term)

**Deliverables** (specified in detail doc, no ENH ID yet):
- Outcome recording when strategies close
- Validation point accuracy assessment
- Process adherence analysis
- Thesis quality scoring over time
- Feedback integration into future synthesis

**Why This Helps**:
- **Closes the loop**: Did following your process produce better results?
- **Identifies patterns**: Which thesis types work? Which validation points predict well?
- **Continuous improvement**: Learnings inform future theses

**Note**: Absorbs and extends the original Phase 4.0 (Decision Journal with Outcomes) and Phase 4.1 (Pattern Detection) concepts.

---

## Complementary Enhancements (Remain Distinct)

These items complement Phase 3 but remain separate:

### Phase 3.1-parallel: Performance Attribution by Thesis 💡

**Goal**: P&L rollup by hierarchy (macro thesis → asset thesis → strategy → position)

**PRD Alignment**: Section 7 (Decision Support & Analytics)

**Status**: 💡 Proposed (Tier 2 - Strategic)

**Deliverables**:
- Computation: Aggregate position P&L up hierarchy
- Dashboard: Thesis with total P&L + evidence ratio
- Insight: Highlight profitable thesis with weak evidence (luck?) vs vice versa
- Time-series: P&L evolution vs thesis confidence over time

**Why This Helps**:
- **Validates beliefs with outcomes**: Are theses actually profitable?
- **Identifies luck vs skill**: Profitable despite weak evidence?
- **Informs conviction**: High P&L + strong evidence = confidence boost
- **Portfolio management**: Allocate more capital to high-conviction, profitable theses

**Effort**: 1-2 weeks
**Dependencies**: Phase 3.1 (thesis articulations provide confidence data)

**Enhancement ID**: #ENH-027

---

### Phase 3.2-parallel: Claim Invalidation Workflow 💡

**Goal**: Systematic invalidation + impact analysis when claims proven wrong

**PRD Alignment**: Section 5.5 (Thesis Evaluation)

**Status**: 💡 Proposed (Tier 2 - Strategic)

**Relationship to Phase 3**: Claim invalidation is one specific type of validation point status change. The audit trail (#ENH-037) captures this, but the impact analysis workflow adds value.

**Deliverables**:
- UI: Invalidate claim from claims browser
- Impact analysis: "3 theses rely on this claim, 5 strategies ($XX notional)"
- Triage generation: Create review for affected theses
- Workflow: User confirms/updates theses
- Audit trail: Track why claim was invalidated (uses #ENH-037 infrastructure)

**Why This Helps**:
- **Data integrity**: Remove invalidated claims from consideration
- **Forced re-evaluation**: Triggers review when foundations change
- **Risk management**: Identify positions based on invalidated beliefs
- **Learning**: Understand what evidence was wrong and why

**Effort**: 1-2 weeks
**Dependencies**: Phase 3.1 (#ENH-037 audit trail)

**Enhancement ID**: #ENH-028

---

### #ENH-020-playbook: Strategy Playbook Tab 💡

**Goal**: Add playbook tab to strategy detail pages with reaction functions

**PRD Alignment**: Section 3 (Strategies), Section 6 (Decision Capture)

**Status**: 💡 Proposed (Tier 2 - Strategic)

**Relationship to Phase 3**: Strategy playbooks should define **reaction functions** that reference thesis-level validation points. When a validation point triggers, each linked strategy evaluates its reaction function.

**Deliverables**:
- Entry/exit rules documentation
- Position sizing guidelines
- Risk management checklist
- **Reaction functions**: Per-strategy responses to thesis validation point changes
- Integration with #ENH-036 validation points

**Effort**: 8-10 hours
**Dependencies**: #ENH-036 (validation points to reference)

---

## Backlog (Unprioritized)

### Tier 2 (Strategic)

**Pre-Investment Pipeline** (#ENH-032)
- Dedicated workflow for exploratory research
- Claims without thesis linkage = pipeline
- Track time from research → position (idea velocity)
- **Effort**: 1-2 weeks
- **PRD**: Section 5.6 (Pre-Investment Research)

### Tier 3 (Future)

**Automated Tests** (#ENH-020)
- Test coverage for reliability
- Unit, integration, UI tests
- Prevent regressions
- **Effort**: 2-3 weeks
- **Priority**: High for long-term maintainability

**Complete Manual Linking UI** (#ENH-014)
- Better UX for unlinking positions/trades
- Bulk-select unlinked items
- Filter by account, date, symbol
- **Effort**: 2-3 days
- **Priority**: Medium

**Triage Rules Persistence** (#ENH-005-triage)
- Dynamic rule configuration (no code changes)
- Database table for rules
- Multiple rule sets
- **Effort**: 3-4 days
- **Priority**: Medium

---

## Enhancement Request Process

**To propose a new enhancement**:
1. Document in [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md)
2. Assign next available ID (#ENH-XXX)
3. Specify: Goal, PRD alignment, deliverables, effort estimate
4. Link to "Why this helps overall purpose"
5. Prioritize as Tier 1/2/3

**To move enhancement to active roadmap**:
1. Assign to phase (2.8, 2.9, 3.0, etc.)
2. Update status (🚧 In Progress | 🎯 Prioritized | 💡 Proposed)
3. Add dependencies and detailed implementation notes

---

## Completion Criteria

**Phase is complete when**:
- All deliverables marked ✅
- Tests passing (manual or automated)
- Documentation updated
- User acceptance (if applicable)

**Phase progression**:
- Phases proceed in order within tiers
- Tier 1 before Tier 2 before Tier 3
- Cross-tier work allowed if dependencies satisfied

---

## Quick Reference: Next Steps

**Currently In Progress**: Phase 3.1 (Thesis Synthesis MVP) 🚧
- ✅ Database tables created
- ✅ `/synthesize-thesis` skill created
- ⏳ End-to-end testing
- ⏳ UI for viewing articulations and updating validation point status

**Recently Completed**: Phase 2.8 (AI-Generated Thesis Summaries) ✅

**Tier 1 Quick Wins** (can be done in parallel):
1. Phase 2.9: Claims-Aware Triage UI
2. Phase 2.10: Strategy Provenance Chain

**Strategic Horizon** (Tier 2 - Phase 3: Thesis Synthesis & Monitoring):
- **Phase 3.1 (MVP)**: 🚧 Thesis Articulation (#ENH-035) + Validation Points (#ENH-036) + Audit Trail (#ENH-037)
- **Phase 3.2**: Automated Monitoring (#ENH-038)
- **Phase 3.3**: News & Narratives (#ENH-039)
- **Parallel**: Performance Attribution (#ENH-027), Claim Invalidation (#ENH-028), Strategy Playbook (#ENH-020-playbook)

**Long-Term Vision** (Tier 3+):
- Phase 3.4: Learning & Feedback (outcomes, process adherence, thesis quality scoring)

**Full Specification**: [Thesis Synthesis & Monitoring System](features/thesis-synthesis-monitoring.md)

See [Implementation Completion Log](archive/implementation_completion_log.md) for Phases 1.0-2.7.
