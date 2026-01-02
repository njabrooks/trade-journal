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

## Phase 3.0: Thesis Review Triggers 💡

**Goal**: Time-based triggers create triage when thesis review is due

**PRD Alignment**: Section 6.1 (Triggers), Section 5.5 (Thesis Re-Underwriting)

**Status**: 💡 Proposed (Tier 2 - Strategic)

**Deliverables**:
- Cron job: Check `next_review_due_at` daily
- Create triage record type `THESIS_REVIEW`
- UI: Show claims added since last review
- AI assistance: Suggest confidence updates based on new evidence
- Action: User confirms/updates thesis or defers

**Why This Helps**:
- **Systematic belief maintenance**: No theses forgotten
- **Evidence-driven review**: See new claims since last review
- **Confidence calibration**: Update conviction based on new evidence
- **Closes decision loop**: Ensures beliefs evolve with information

**Implementation Approach**:
- GitHub Action cron job (like Flex/Massive ingestion)
- Query theses with `next_review_due_at <= NOW()`
- Create triage with context: new claims, P&L since last review
- Optionally regenerate AI summary as part of review

**Effort**: 3-4 days
**Dependencies**: Phase 2.8 (AI summaries enhance review workflow)

**Enhancement ID**: #ENH-026

---

## Phase 3.1: Performance Attribution by Thesis 💡

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

**Implementation Approach**:
- Extend `strategy_metrics_snapshots` with thesis linkage
- Compute P&L aggregations in nightly cron
- Dashboard UI showing thesis performance
- Filter by time period, thesis type, confidence level

**Effort**: 1-2 weeks
**Dependencies**: Phase 3 analytics infrastructure

**Enhancement ID**: #ENH-027

---

## Phase 3.2: Claim Invalidation Workflow 💡

**Goal**: Systematic invalidation + impact analysis when claims proven wrong

**PRD Alignment**: Section 5.5 (Thesis Evaluation)

**Status**: 💡 Proposed (Tier 2 - Strategic)

**Deliverables**:
- UI: Invalidate claim from claims browser
- Impact analysis: "3 theses rely on this claim, 5 strategies ($XX notional)"
- Triage generation: Create review for affected theses
- Workflow: User confirms/updates theses
- Audit trail: Track why claim was invalidated

**Why This Helps**:
- **Data integrity**: Remove invalidated claims from consideration
- **Forced re-evaluation**: Triggers review when foundations change
- **Risk management**: Identify positions based on invalidated beliefs
- **Learning**: Understand what evidence was wrong and why

**Implementation Approach**:
- Query `claim_thesis_mappings` for impact
- Calculate notional at risk (sum of strategy exposures)
- Create triage for each affected thesis
- Optionally regenerate AI summaries without invalidated claim

**Effort**: 1-2 weeks
**Dependencies**: Phase 2.8 (summary regeneration useful after invalidation)

**Enhancement ID**: #ENH-028

---

## Phase 4.0: Decision Journal with Outcomes ⏸️

**Goal**: Track expected vs actual outcomes, periodic review workflow

**PRD Alignment**: Section 8 (Logging, Journal & Institutional Memory)

**Status**: ⏸️ Deferred to Phase 4 (Long-Term Vision)

**Deliverables**:
- Schema: `expected_outcome`, `actual_outcome` fields (already exist in `blotter_actions`)
- UI: Mark outcomes when reviewing past decisions
- Periodic review: Weekly/monthly "review last week's decisions"
- Metrics: Decision accuracy by context (time pressure, volatility, etc.)
- Dashboard: Decision quality over time

**Why This Helps**:
- **Learning substrate**: Basis for pattern detection
- **Bias identification**: "Decisions under time pressure underperform"
- **Process improvement**: Validate which decision contexts work
- **Accountability**: Forces reflection on decision quality

**Implementation Approach**:
- Add outcome review UI to blotter
- Time-triggered review (weekly/monthly triage)
- AI assistance: Compare expected vs actual, calculate accuracy
- Pattern detection queries

**Effort**: 2-3 weeks
**Dependencies**: Decision rationale capture (Phase 2.9)

**Enhancement ID**: #ENH-029

---

## Phase 4.1: Pattern Detection (AI-Powered) ⏸️

**Goal**: AI analyzes decision journal for patterns in decision quality

**PRD Alignment**: Section 8.1 (Pattern Recognition)

**Status**: ⏸️ Deferred to Phase 4 (Long-Term Vision)

**Deliverables**:
- Batch job: Monthly analysis of blotter actions + outcomes
- AI prompt: "Find patterns in decision quality"
- Insights: "Trades during high volatility underperform by 15%"
- Dashboard: Pattern insights with evidence
- Recommendations: "Avoid X, double-down on Y"

**Why This Helps**:
- **Identifies biases**: Systematic patterns in mistakes
- **Validates processes**: Which workflows lead to better outcomes
- **Continuous improvement**: Learn from history
- **Competitive advantage**: Turn experience into systematic edge

**Implementation Approach**:
- Extend AI processing to decision journal
- Statistical analysis + AI interpretation
- Pattern library (common biases)
- Actionable recommendations

**Effort**: 2-3 weeks
**Dependencies**: Phase 4.0 (outcome tracking)

**Enhancement ID**: #ENH-030

---

## Backlog (Unprioritized)

Items from enhancement analysis not yet assigned to phases:

### Tier 2 (Strategic)

**News/Narrative Monitoring** (#ENH-031)
- Automated news ingestion → claim validation
- Real-time thesis confidence updates
- Early warning system for contradictory evidence
- **Effort**: 1-2 weeks
- **PRD**: Section 5.5 (Thesis Evaluation)

**Pre-Investment Pipeline** (#ENH-032)
- Dedicated workflow for exploratory research
- Claims without thesis linkage = pipeline
- Track time from research → position (idea velocity)
- **Effort**: 1-2 weeks
- **PRD**: Section 5.6 (Pre-Investment Research)

**Thesis Evolution Timeline** (#ENH-033)
- Version history for belief changes
- Diff view: what changed between versions
- Compare thesis confidence over time
- **Effort**: 1 week
- **PRD**: Section 5.5 (Thesis Evaluation)

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

**Recently Completed**: Phase 2.8 (AI-Generated Thesis Summaries) ✅

**Up Next** (Tier 1 Quick Wins):
1. Phase 2.9: Claims-Aware Triage UI
2. Phase 2.10: Strategy Provenance Chain

**Strategic Horizon** (Tier 2):
- Phase 3.0: Thesis Review Triggers
- Phase 3.1: Performance Attribution
- Phase 3.2: Claim Invalidation Workflow

**Long-Term Vision** (Tier 3+):
- Phase 4.0: Decision Journal with Outcomes
- Phase 4.1: Pattern Detection (AI-Powered)

See [Implementation Completion Log](archive/implementation_completion_log.md) for Phases 1.0-2.7.
