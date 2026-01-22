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

## Phase 2.9: Claims-Aware Triage UI ✅

**Goal**: Show supporting claims and evidence summary inline in triage detail view

**PRD Alignment**: Section 6 (Workflow & Triage Engine), Section 7 (Decision Support)

**Status**: ✅ Complete (2026-01-04)

**Deliverables**:
- ✅ Component: `<ClaimsContext>` shows linked claims in triage
- ✅ Evidence summary: "X supports, Y refutes, Z foundation" with last updated
- ✅ Expandable claim details with category, confidence, and claim text
- ✅ Integration: Triage detail page (expanded row view)
- ✅ API endpoint: `/api/strategies/[id]/claims-context`

**Implementation**:
- `src/components/triage/ClaimsContext.tsx` - Collapsible claims display component
- `src/app/api/strategies/[id]/claims-context/route.ts` - API for fetching claims via strategy → asset thesis → claims chain
- Integrated into `TriageTableRow.tsx` expanded section

**Files Changed**:
- New: `src/components/triage/ClaimsContext.tsx`
- New: `src/app/api/strategies/[id]/claims-context/route.ts`
- Modified: `src/components/triage/TriageTableRow.tsx`

**Enhancement ID**: #ENH-003 (enhanced from original deferral)

---

## Phase 2.10: Strategy Provenance Chain Component ❌

**Goal**: "Why am I holding this position?" component showing full hierarchy chain

**PRD Alignment**: Section 3 (Conceptual Model - Decision Hierarchy)

**Status**: ❌ ABANDONED (2026-01-04)

**Reason for Abandonment**:
This feature does not add sufficient value beyond the existing `HierarchyBreadcrumb` component, which already shows the full hierarchy chain (Macro Thesis → Asset Thesis → Strategy → Position) in a compact, effective format. The proposed dedicated provenance tab would duplicate this functionality without meaningful improvement.

**Code Preservation**:
- Implementation committed to git history (commit `9d8ba79`)
- Can be recovered if requirements change in the future
- See commit message for full implementation details

**Enhancement ID**: #ENH-025 (ABANDONED)

---

## Phase 3: Thesis Synthesis & Monitoring System 🎯

**Goal**: Transform atomic research claims into articulated investment theses with explicit validation/invalidation criteria, then monitor those criteria over time to ensure accountability and enable learning.

**PRD Alignment**: Sections 5.5 (Thesis Evaluation), 5.7 (Role of AI), 6.1 (Triggers), 8 (Institutional Memory)

**Status**: 🎯 Requirements Complete (2026-01-03)

**Specification**: [docs/features/thesis-synthesis-monitoring.md](260107-thesis-synthesis-monitoring.md)

**Note**: This phase consolidates and supersedes several previously planned items:
- #ENH-022 (AI Summary Generation) → absorbed into #ENH-035
- #ENH-031 (News/Narrative Monitoring) → absorbed into #ENH-038/039
- #ENH-033 (Thesis Evolution Timeline) → absorbed into #ENH-035 versioning
- #ENH-034 (AI Summary Version History) → absorbed into #ENH-035
- Phase 3.0-old (Thesis Review Triggers) → absorbed into #ENH-038
- Phase 4.0-old (Decision Journal) → partially absorbed into #ENH-037

---

### Phase 3.1: MVP - Synthesis & Manual Tracking ✅

**Status**: ✅ Complete (2026-01-04)

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

### Phase 3.2: Automated Monitoring 🚧

**Status**: 🚧 In Progress (Phase 3.2A-B Complete, 3.2C-E In Planning)

#### Phase 3.2A: Validation Assessment Workflow ✅
**Status**: ✅ Complete (2026-01-05)
**Enhancement ID**: #ENH-042

**Deliverables**:
- ✅ `/assess-validation-evidence` Claude Code skill
- ✅ Database script with ticker-based thesis lookup
- ✅ Structured markdown assessment reports
- ✅ Evidence categorization and confidence scoring
- ✅ Real-world testing (Galaxy Digital SEC presentation)
- ✅ Documentation: [validation-assessment-workflow.md](260105-validation-assessment-workflow.md)

**Why This Helps**:
- Top-down validation check complements bottom-up research discovery
- Structured assessment of SEC filings, presentations, transcripts
- Evidence-based validation tracking
- Foundation for automated monitoring

---

#### Phase 3.2B: Database Integration & Status History UI ✅
**Status**: ✅ Complete (2026-01-05)
**Enhancement IDs**: #ENH-042B, #ENH-042C
**Effort**: 1 day (actual)
**Dependencies**: #ENH-042 (Complete)

**Deliverables**:
- ✅ Assessment-to-database recording via `dualWrite()` in assess-validation-evidence.ts
- ✅ Validation point detail pages (`/macro-theses/[id]/validation/[pointId]`, `/asset-theses/[id]/validation/[pointId]`)
- ✅ StatusTimeline component (301 lines) - Chronological status history with evidence
- ✅ MonitoringEventsLog component (383 lines) - Audit trail of monitoring checks
- ✅ ValidationPointDetail component (431 lines) - Full validation point display with context
- ✅ Database dual-write support for validation status history
- ⏸️ Interactive review mode in skill (deferred - auto-record for now)
- ⏸️ Batch approval workflow (deferred - manual review via UI)

**Why This Helps**:
- ✅ Complete audit trail visualization implemented
- ✅ Enables trend analysis through status history
- ✅ User accountability via timeline and monitoring log
- ⏸️ Interactive approval workflow can be added later if needed

---

#### Phase 3.2C: Evidence Analysis & Visualization 💡
**Status**: 💡 Planned (Tier 2)
**Enhancement ID**: #ENH-042D
**Effort**: 1 week
**Dependencies**: #ENH-042C

**Deliverables**:
- Evidence strength scoring (0-100)
- Trend visualization with annotations
- Conflicting evidence detection
- Forecast trajectory analysis

---

#### Phase 3.2D: Multi-Source Data Integration ✅
**Status**: ✅ Complete (Analysis Pipeline Implemented)
**Enhancement IDs**: #ENH-042E, #ENH-042F, #ENH-042G
**Effort**: 2-3 weeks total
**Dependencies**: #ENH-042B (Complete)

**Implementation Complete**:
- ✅ `thesis_monitoring_configs` table (thesis-level config, not per-validation-point)
- ✅ `thesis_triage_records` table (schema migrated)
- ✅ `daily-thesis-monitoring.ts` full implementation
- ✅ Price/IV threshold checking from `underlyings_iv_history`
- ✅ FRED API threshold checking
- ✅ Perplexity Search API integration with dual-query approach
- ✅ Claude relevance scoring and validation point matching
- ✅ Triage record creation with severity/urgency classification
- ✅ Tested end-to-end with GLW thesis

**Phased Content Source Implementation** (see spec Section 3.4):

| Phase | Source | Status | Complexity |
|-------|--------|--------|------------|
| **A** | Price/IV + FRED thresholds | ✅ Complete | Low |
| **B** | Perplexity Search API + Analysis Pipeline | ✅ Complete | Low |
| **C** | SEC EDGAR RSS (contingency) | If needed | Medium |
| **D** | Finnhub (contingency) | If needed | Low |

**Architecture Decision**: Perplexity Search API replaces multiple free sources (Finnhub, Yahoo, Google, SEC EDGAR) with a single unified discovery layer at ~$1-3/month. See spec for coverage validation matrix and contingency plans.

**Implementation Details**:
- Dual-query approach: wide ("Company TICKER news") + narrow (with keywords) per thesis
- 20 results per query (10 wide + 10 narrow) for comprehensive coverage
- Claude analysis with structured JSON output (summary, key findings, VP matching)
- Severity/urgency classification based on VP importance + evidence type
- ~$0.60/month cost for 20 theses

**Why This Helps**:
- Automated monitoring across all data sources
- Zero manual effort for economic/market monitoring
- Proactive intelligence gathering
- Catches developments before user notices

---

#### Phase 3.2E: Master Orchestration 💡
**Status**: 💡 Planned (Tier 2)
**Enhancement ID**: #ENH-042H
**Effort**: 1 week
**Dependencies**: Phase 3.2D (Content Sources)

**Deliverables**:
- GitHub Actions daily workflow for `daily-thesis-monitoring.ts`
- Unified summary reporting
- Alert aggregation and notification
- `thesis_triage_records` table and UI

**Workflow**:
```
Daily 6 AM ET:
  → Load active thesis monitoring configs
  → For each thesis:
      → Check Price/IV thresholds (Phase A)
      → Check FRED thresholds (Phase A)
      → Fetch Finnhub news (Phase B)
      → Score relevance with Claude
      → Create triage records if relevant
  → Generate summary email/notification
```

**Why This Helps**:
- Single daily monitoring run
- Centralized error handling
- One summary instead of multiple alerts

---

**Note**: Phase 3.2 absorbs and extends the original Phase 3.0 "Thesis Review Triggers" (#ENH-026) concept. See [thesis-synthesis-monitoring.md](260107-thesis-synthesis-monitoring.md) Section 3.4 "Thesis Triage" and "Content Source Implementation Guide" for comprehensive specifications.

---

### Phase 3.3: News & Narratives 💡

**Status**: 💡 Proposed (Tier 2 - Strategic) - **Partially absorbed into Thesis Triage**

#### #ENH-039: News & Narratives Integration
**Effort**: 2-3 weeks
**Dependencies**: #ENH-038

**Note**: Core news monitoring functionality is now specified in Section 3.4 "Thesis Triage" of [thesis-synthesis-monitoring.md](260107-thesis-synthesis-monitoring.md). This phase focuses on **advanced narrative features** beyond basic monitoring:

**Remaining Deliverables** (not covered by Thesis Triage):
- **Narrative tracking system** - Track emerging themes across multiple sources over time
- **Cross-thesis intelligence** - "This development affects 3 theses" alerting
- **Emerging narrative detection** - Spot new themes before they're obvious (not just monitoring known validation points)

**Absorbed into Thesis Triage** (Section 3.4):
- ~~Source management and credibility scoring~~ → Thesis Triage source configuration
- ~~Financial data provider API integrations~~ → Thesis Triage multi-source pipeline

**Why This Helps**:
- **Beyond explicit monitoring**: Catch things you didn't know to watch for
- **Cross-thesis insights**: See how developments ripple across portfolio
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

### Tier 1 (Quick Wins)

#### **Local-First Database Architecture Migration** (#ENH-041) ✅
- **Goal**: Migrate to hybrid local-first architecture (SQLite primary + Supabase backup)
- **PRD Alignment**: Infrastructure optimization (not in PRD)
- **Status**: ✅ Complete (2026-01-05)
- **Actual Effort**: 1 week (completed in 5 git commits over 2 days)
- **Benefits Achieved**:
  - ✅ **Cost Savings**: $300/year → $0/year (immediate ROI)
  - ✅ **Performance**: Sub-millisecond local SQLite queries
  - ✅ **Data Ownership**: Full control, offline-first capability
  - ✅ **Dual-Write Architecture**: Maintains both SQLite and PostgreSQL
  - ✅ **Auto-Sync via Git**: Database file tracked in repo, `git pull` syncs data
  - ✅ **GitHub Actions**: Automated ingestion writes to both databases
  - ✅ **Claude Code Skills**: All skills use dual-write for consistency
- **Implementation Completed**:
  - ✅ Dual-mode database client (`DATABASE_MODE` env var)
  - ✅ SQLite schema generation and migration
  - ✅ PostgreSQL → SQLite data migration (2,916 rows)
  - ✅ Dual-write library (`scripts/lib/dual-write-db.ts`)
  - ✅ GitHub Actions dual-write workflows
  - ✅ Auto-pull before dev server (`npm run dev`)
- **Reference**: [docs/database-dual-write-architecture.md](database-dual-write-architecture.md), [docs/local-sqlite-setup.md](local-sqlite-setup.md)

#### **Data Visualization Enhancements** (#ENH-040)
- **Goal**: Leverage existing data sources to enhance detail pages with market context
- **PRD Alignment**: Section 7 (Decision Support & Analytics)
- **Opportunities Identified**:
  - **Asset Thesis Detail**: 90-day spot/IV history chart (data in `underlyings_iv_history`)
  - **Asset Thesis Detail**: Options chain IV surface visualization (data in `options_chain_snapshots`)
  - **Macro Thesis Detail**: Relevant FRED metrics display (via OpenBB integration)
  - **Strategy Performance**: Asset contribution waterfall
  - **Portfolio Dashboard**: Cross-asset correlation matrix
- **Data Sources**: IBKR, Massive.com (existing), FRED via OpenBB (configured)
- **Effort**: 1-2 days per enhancement
- **Dependencies**: None (data already flows into system)

#### **Claim Detail Page Linking Workflow** (#ENH-042)
- **Goal**: Add claim-to-thesis linking directly from claim detail page
- **PRD Alignment**: Section 5.4 (Contextual Mapping to Investment Hierarchy)
- **Status**: 💡 Proposed (Tier 1 Quick Win)
- **Current Gap**: Claim linking only available from claims browser, not from claim detail page
- **Solution**: Reuse existing `ConvertClaimToEntityDialog` component with pre-selected claim context
- **Why Quick Win**:
  - **Low Effort**: 2-4 hours (reuses existing component)
  - **High Value**: Completes workflow at point of review (no navigation back to browser)
  - **Zero Duplication**: Uses tested component as-is
- **Implementation**: Add "Link to Thesis" button in claim detail page (`/research/claims/[id]`)
- **Effort**: 2-4 hours
- **Dependencies**: None (component already exists)

### Tier 2 (Strategic)

#### **Multi-Account IBKR Support** (#ENH-044)
- **Goal**: Support multiple Interactive Brokers accounts within the same system
- **PRD Alignment**: Section 4 (Data Ingestion & Normalisation)
- **Status**: 💡 Proposed (Medium-High Priority)
- **Current State**: System assumes single IBKR account, but schema already multi-account ready
- **Why Strategic**:
  - **Account Segregation**: Personal, IRA, institutional accounts
  - **Tax Optimization**: Taxable vs tax-advantaged tracking
  - **Foundation for Multi-Exchange**: Establishes pattern for #ENH-043
- **Quick Win Potential**: Much infrastructure exists (account selector, schema FK, UI components)
- **Implementation**:
  - Multiple Flex query IDs (one per account)
  - Config via env vars or database-stored credentials
  - Ingestion loop per account
  - Account-specific triage rules
- **Effort**: 1-2 weeks
- **Dependencies**: None (schema ready, UI exists)

#### **Multi-Exchange Crypto Ingestion** (#ENH-043)
- **Goal**: Unified portfolio tracking across TradFi and crypto markets
- **PRD Alignment**: Section 4 (Data Ingestion & Normalisation)
- **Status**: 💡 Proposed (Medium Priority)
- **Supported Exchanges**:
  - Coinbase Prime (institutional)
  - Coinbase & Kraken (retail)
  - HyperLiquid (perpetuals)
  - Decentralized Exchanges (on-chain)
- **Why Strategic**:
  - **Cross-Asset Thesis Validation**: "Bullish BTC" across IBKR futures + Coinbase spot + HyperLiquid perps
  - **DeFi Integration**: Track LP tokens, staking, lending
  - **Institutional Crypto**: Coinbase Prime support
- **Technical Approach**:
  - Abstract `IExchangeAdapter` interface
  - Exchange-specific adapters (API + CSV imports)
  - Schema extensions: instrument types (crypto_spot, crypto_perp), exchange field
  - Multi-source reconciliation (cross-exchange transfers)
- **Effort**: 2-3 weeks
- **Dependencies**: #ENH-044 (multi-account pattern)

#### **Pre-Investment Pipeline** (#ENH-032)
- Dedicated workflow for exploratory research
- Claims without thesis linkage = pipeline
- Track time from research → position (idea velocity)
- **Effort**: 1-2 weeks
- **PRD**: Section 5.6 (Pre-Investment Research)

### Tier 3 (Future)

#### **Automated Tests** (#ENH-020)
- Test coverage for reliability
- Unit, integration, UI tests
- Prevent regressions
- **Effort**: 2-3 weeks
- **Priority**: High for long-term maintainability

#### **Complete Manual Linking UI** (#ENH-014)
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

**Recently Completed**:
- **Phase 3.2D (Multi-Source Data Integration)** ✅
  - Perplexity Search API integration (dual-query approach)
  - Claude relevance scoring and VP matching
  - Triage record creation with severity/urgency
  - `thesis_triage_records` table migrated
  - End-to-end tested with GLW thesis
- Phase 3.2D-A (Monitoring Infrastructure + Quantitative Sources) ✅
- Phase 3.1 (Thesis Synthesis MVP) ✅
- Phase 3.2A-B (Validation Assessment Workflow + Status UI) ✅

**Next Up**:
- **Phase 3.2E: Master Orchestration** 🎯
  - GitHub Actions daily workflow for `daily-thesis-monitoring.ts`
  - Unified summary reporting
  - Alert aggregation and notification
  - Thesis triage UI integration

**Strategic Horizon** (Tier 2 - Phase 3: Thesis Synthesis & Monitoring):
- **Phase 3.1 (MVP)**: ✅ Complete
- **Phase 3.2A-B**: ✅ Validation Assessment + Status UI
- **Phase 3.2D**: ✅ Content Sources (Perplexity + Analysis Pipeline)
- **Phase 3.2E**: 🎯 Master Orchestration (GitHub Actions)
- **Phase 3.3**: 💡 News & Narratives (advanced features)
- **Parallel**: Performance Attribution (#ENH-027), Claim Invalidation (#ENH-028)

**Simplified Content Source Architecture**:
| Layer | Source | Status | Cost |
|-------|--------|--------|------|
| **Discovery** | Perplexity Search API | ✅ Complete | ~$0.60/mo |
| **Analysis** | Claude Relevance Scoring | ✅ Complete | ~$1-2/mo |
| **Quantitative** | Price/IV + FRED | ✅ Complete | Free |
| **Contingency** | SEC EDGAR RSS | If needed | Free |
| **Contingency** | Finnhub | If needed | Free |

**Long-Term Vision** (Tier 3+):
- Phase 3.4: Learning & Feedback (outcomes, process adherence, thesis quality scoring)

**Full Specification**: [Thesis Synthesis & Monitoring System](260107-thesis-synthesis-monitoring.md)

See [Implementation Completion Log](archive/implementation_completion_log.md) for Phases 1.0-2.7.
