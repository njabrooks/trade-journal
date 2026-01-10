# Decision Point Inventory

**Purpose**: Comprehensive enumeration of all decision points across the trade-journal application, following the template from the UX Redesign Brief.

**Status**: Sections 1-5 refined with discussion insights; Sections 6-10 pending review
**Created**: 2026-01-09
**Last Updated**: 2026-01-10
**Related**: [triage-ux-redesign-brief.md](./triage-ux-redesign-brief.md)

### Revision History
- **2026-01-10**: Added refinements from detailed review session (Stages 1-5):
  - Stage 1: Added design philosophy, consolidation note
  - Stage 2: Archived DP-2.1-2.3, simplified statuses, added relationship types
  - Stage 3: Added architectural decisions, required linking rules, problematic fields
  - Stage 4: Added thresholds, design gaps, articulation history, status naming
  - Stage 5: Marked as untested/theoretical, added status lifecycle questions, design phase markers

---

## Table of Contents

1. [Research Ingestion](#1-research-ingestion)
2. [Claim Management](#2-claim-management)
3. [Thesis Management (Linking)](#3-thesis-management-linking)
4. [Thesis Lifecycle](#4-thesis-lifecycle)
5. [V&I Monitoring](#5-vi-monitoring)
6. [Strategy Management](#6-strategy-management)
7. [Position Management](#7-position-management)
8. [Trade Reconciliation](#8-trade-reconciliation)
9. [Pattern Analysis](#9-pattern-analysis)
10. [Proposed Triage Architecture](#10-proposed-triage-architecture)

---

## 1. Research Ingestion

> **Design Philosophy**: Quick capture, minimal friction. Don't bog users down in early stages. Deeper analysis (synthesis, linking) happens downstream when claims are processed into theses. Volume and speed matter more than precision at intake.

> **Consolidation Note**: DP-1.1 through DP-1.4 are all automated steps within a single `/process-transcript` invocation. They are documented separately for completeness but represent a single user action. The term "action points" may be more accurate than "decision points" for these automated steps.

### DP-1.1: Format Raw Transcript

| Field | Description |
|-------|-------------|
| **Decision Point** | Format Raw Transcript |
| **Stage** | Research Ingestion |
| **Trigger** | User invokes `/process-transcript` skill with raw YouTube transcript |
| **Context Needed** | File content, presence/absence of frontmatter metadata |
| **Available Actions** | Auto-format to markdown with metadata (title, source_url, date) OR skip if already formatted |
| **Downstream Effects** | Formatted markdown saved to `${OBSIDIAN_TRANSCRIPTS_DIR}`, ready for claim extraction |
| **Complexity** | Quick |
| **Current Location** | Claude Code skill (CLI only) |
| **Triage Suitable?** | No - automated decision, no user input needed |
| **Recommended UX** | Keep as automated skill behavior |

### DP-1.2: Claim Extraction Scope

| Field | Description |
|-------|-------------|
| **Decision Point** | Claim Extraction Scope |
| **Stage** | Research Ingestion |
| **Trigger** | During `/process-transcript` execution |
| **Context Needed** | Full transcript content, forensic extraction principle |
| **Available Actions** | Extract ALL claims (required - no summarization allowed) |
| **Downstream Effects** | Complete claims audit generated with full Toulmin framework |
| **Complexity** | Quick |
| **Current Location** | Claude Code skill (implicit behavior) |
| **Triage Suitable?** | No - design principle, not user decision |
| **Recommended UX** | Keep as automated; surface extraction stats after completion |

### DP-1.3: Claim Classification

| Field | Description |
|-------|-------------|
| **Decision Point** | Classify Each Claim |
| **Stage** | Research Ingestion |
| **Trigger** | Each claim identified during extraction |
| **Context Needed** | Claim text, evidence list, reasoning, backing, surrounding context |
| **Available Actions** | Set: Level (main/evidence), Type (thesis_candidate/view_candidate/supporting/rebutting), Category (macro/asset_specific), Time Horizon (long/medium/short_term), Qualifier (high/medium/low/exploratory), Tickers (array) |
| **Downstream Effects** | Claim structured per Toulmin framework, categorized for downstream processing |
| **Complexity** | Medium |
| **Current Location** | Claude Code skill (AI decision during extraction) |
| **Triage Suitable?** | Partial - user may want to review/override classifications |
| **Recommended UX** | Generate with AI defaults; provide bulk review UI for classification overrides |

### DP-1.4: Evidence Claim Relationship Mapping

| Field | Description |
|-------|-------------|
| **Decision Point** | Map Evidence Claims to Main Claims |
| **Stage** | Research Ingestion |
| **Trigger** | Each evidence claim during extraction |
| **Context Needed** | Evidence claim text, all main claims in same artifact |
| **Available Actions** | Link evidence to supporting/rebutting main claim(s) |
| **Downstream Effects** | Hierarchical claim structure with relationship references |
| **Complexity** | Medium |
| **Current Location** | Claude Code skill (AI decision) |
| **Triage Suitable?** | Partial - relationships could be reviewed |
| **Recommended UX** | Generate with AI; provide visual relationship editor if needed |

### DP-1.5: Post-Extraction Workflow Choice

| Field | Description |
|-------|-------------|
| **Decision Point** | Choose Next Steps After Extraction |
| **Stage** | Research Ingestion |
| **Trigger** | Audit generation complete ([N] claims extracted) |
| **Context Needed** | Claim counts (main vs evidence), audit file location |
| **Available Actions** | (1) Upload to database immediately, (2) Review audit first, upload later, (3) Run `/synthesize-claims` to map to existing hierarchy |
| **Downstream Effects** | Determines workflow path - immediate persistence vs cross-referencing |
| **Complexity** | Quick |
| **Current Location** | Claude Code skill output (text prompt) |
| **Triage Suitable?** | Yes - clear options, quick decision |
| **Recommended UX** | Surface as triage item: "New audit ready: [N] claims from [Source]" with action buttons |

---

## 2. Claim Management

> **Workflow Refinement**: DP-2.1, DP-2.2, and DP-2.3 (skill-based claim matching) have been **ARCHIVED**. These were replaced by UI-driven workflows in the ClaimsBrowser. The active workflow now focuses on: Link claims → Select relationship type → Create new entity if needed. The **Link action is the primary happy path**; Reject is for discarding unused claims.

> **Status Simplification**: Removed `invalidated` and `merged` as unused statuses. The active statuses are now: **Unconfirmed → Confirmed → Rejected**. Rejected claims are hidden by default in ClaimsBrowser, visible via filter toggle.

> **Relationship Types**: Each claim-to-thesis link has a relationship type: `supports`, `refutes`, or `foundation`. One claim can support Thesis A while refuting Thesis B - relationships are per-link, not per-claim.

### DP-2.1: Claim-to-Existing-Claim Matching [ARCHIVED]

| Field | Description |
|-------|-------------|
| **Decision Point** | Match New Claim Against Existing Claims |
| **Stage** | Claim Management |
| **Trigger** | `/synthesize-claims` skill execution |
| **Context Needed** | New claim text, category, tickers; existing main_claims in database with similarity scores |
| **Available Actions** | (1) DUPLICATE (>80% match): Link as evidence, (2) DISTINCT (<40% match): Promote as new main claim, (3) AMBIGUOUS (40-80%): User chooses |
| **Downstream Effects** | Either creates new main_claim record OR links as evidence to existing |
| **Complexity** | Medium - requires reviewing similar claims |
| **Current Location** | Claude Code skill (generates synthesis markdown) |
| **Triage Suitable?** | Partial - ambiguous cases need object page context |
| **Recommended UX** | Show similarity comparison UI; triage for clear matches, detail page for ambiguous |

### DP-2.2: Claim-to-Thesis Matching [ARCHIVED]

| Field | Description |
|-------|-------------|
| **Decision Point** | Match Thesis Candidate Claim to Existing Theses |
| **Stage** | Claim Management |
| **Trigger** | Claims marked as `thesis_candidate` during synthesis |
| **Context Needed** | Claim text, category; existing macro_theses with similarity assessment |
| **Available Actions** | (1) HIGH (>80%): Map as supporting evidence, (2) MEDIUM (40-80%): Enhance OR create new, (3) LOW (<40%): Create new thesis |
| **Downstream Effects** | Either creates claim_thesis_mapping OR creates new macro_thesis with provenance |
| **Complexity** | Medium to Deep - conceptual alignment assessment |
| **Current Location** | Claude Code skill (synthesis recommendations) |
| **Triage Suitable?** | Partial - clear matches yes, ambiguous need thesis context |
| **Recommended UX** | Synthesis dashboard with side-by-side comparison; triage for quick matches |

### DP-2.3: Claim-to-View Matching [ARCHIVED]

| Field | Description |
|-------|-------------|
| **Decision Point** | Match View Candidate Claim to Existing Asset Theses |
| **Stage** | Claim Management |
| **Trigger** | Claims marked as `view_candidate` with ticker |
| **Context Needed** | Claim text, ticker; existing asset_theses for same ticker |
| **Available Actions** | (1) DUPLICATE: Map as evidence, (2) COMPLEMENTARY: Enhance OR create, (3) DISTINCT: Create new, (4) CONFLICTING: Map as rebutting evidence, flag for review |
| **Downstream Effects** | Creates mapping or new asset_thesis; conflicting claims may trigger thesis review |
| **Complexity** | Medium |
| **Current Location** | Claude Code skill (synthesis recommendations) |
| **Triage Suitable?** | Partial - ticker match is clear signal, but direction conflicts need review |
| **Recommended UX** | Group by ticker; show existing views for same ticker; triage for clear, detail for conflicts |

### DP-2.4: Status Change Decision

| Field | Description |
|-------|-------------|
| **Decision Point** | Change Claim Status |
| **Stage** | Claim Management |
| **Trigger** | User clicks status dropdown in ClaimsBrowser |
| **Context Needed** | Current status, claim text, linked entities count |
| **Available Actions** | Set status: unconfirmed → confirmed → rejected *(invalidated/merged removed as unused)* |
| **Downstream Effects** | If "confirmed" without links: triggers ConvertClaimToEntityDialog. Otherwise: updates status directly |
| **Complexity** | Quick (if already linked) / Medium (if needs linking) |
| **Current Location** | `/claims` page, UnifiedClaimsBrowser component |
| **Triage Suitable?** | Yes - status badges are atomic actions |
| **Recommended UX** | Keep as-is; inline status dropdown works well |

### DP-2.5: Link Claim to Entities

| Field | Description |
|-------|-------------|
| **Decision Point** | Link Claim to Theses/Views |
| **Stage** | Claim Management |
| **Trigger** | User clicks Link button OR confirms claim without existing links |
| **Context Needed** | Claim details, available theses/views lists, currently linked entities |
| **Available Actions** | (1) Link to existing macro theses (multi-select), (2) Link to existing asset theses (multi-select), (3) Create new macro thesis, (4) Create new asset thesis |
| **Downstream Effects** | Creates claim_thesis_mappings with relationship type (supports/refutes/foundation) |
| **Complexity** | Medium - requires browsing available entities |
| **Current Location** | ConvertClaimToEntityDialog component |
| **Triage Suitable?** | Partial - mode selection is quick, entity browsing less so |
| **Recommended UX** | Triage could show "Link claim" with smart suggestions; full dialog for entity creation |

### DP-2.6: Relationship Type Selection

| Field | Description |
|-------|-------------|
| **Decision Point** | Select Relationship Type for Linking |
| **Stage** | Claim Management |
| **Trigger** | During claim linking (mode: link_existing) |
| **Context Needed** | Claim content, target entities |
| **Available Actions** | Select: supports / refutes / foundation |
| **Downstream Effects** | Relationship type stored in claim_thesis_mappings; affects thesis validity assessment |
| **Complexity** | Quick |
| **Current Location** | ConvertClaimToEntityDialog (link_existing mode) |
| **Triage Suitable?** | Yes - simple dropdown selection |
| **Recommended UX** | Default to "supports"; allow quick toggle |

### DP-2.7: Create New Entity from Claim

| Field | Description |
|-------|-------------|
| **Decision Point** | Create New Thesis/View from Claim |
| **Stage** | Claim Management |
| **Trigger** | User selects "Create New" in ConvertClaimToEntityDialog |
| **Context Needed** | Claim text (becomes description), category, tickers, qualifier |
| **Available Actions** | (1) Create macro thesis: set type, sectors, direction, horizon, confidence, (2) Create asset thesis: set ticker, direction, horizon, confidence |
| **Downstream Effects** | New entity created with provenance tracking; claim auto-linked; claim status → confirmed |
| **Complexity** | Medium - form completion required |
| **Current Location** | ConvertClaimToEntityDialog (create_new mode) |
| **Triage Suitable?** | No - requires form inputs and entity type decisions |
| **Recommended UX** | Keep as dedicated dialog/page; pre-fill from claim attributes |

### DP-2.8: Remove Claim Link

| Field | Description |
|-------|-------------|
| **Decision Point** | Remove Existing Claim-Entity Link |
| **Stage** | Claim Management |
| **Trigger** | User clicks X button on linked entity in dialog |
| **Context Needed** | Current linked entities list |
| **Available Actions** | Delete specific claim_thesis_mapping |
| **Downstream Effects** | Link removed; claim may return to "unconfirmed" if no links remain |
| **Complexity** | Quick |
| **Current Location** | ConvertClaimToEntityDialog (currently linked section) |
| **Triage Suitable?** | Yes - simple destructive action |
| **Recommended UX** | Keep as-is with confirmation |

---

## 3. Thesis Management (Linking)

> **Architectural Decision**: Target prices and exit strategies belong at **strategy level** (tactical), not thesis level (belief). Rationale: Multiple strategies can manifest one thesis (stock vs options vs spreads). Theses are long-lived beliefs; strategies are tactical implementations with specific entry/exit points.

> **Problematic Fields**: `horizon` and `confidence` fields feel like "checkbox completion rather than meaningful input." They appear across the app and may not earn their keep as manual user inputs. **Better approach**: Auto-calculate a "strength" indicator based on linked claims, evidence quality, and V&I states rather than requiring subjective user input.

> **Required Linking**: Asset theses **must** be linked to at least one macro thesis. An unlinked asset thesis should surface as a triage item.

### DP-3.1: Create Macro Thesis

| Field | Description |
|-------|-------------|
| **Decision Point** | Create New Macro Thesis |
| **Stage** | Thesis Management |
| **Trigger** | User action from thesis list, claim conversion, or synthesis recommendation |
| **Context Needed** | Optional: source claim content, related theses |
| **Available Actions** | Set: title, thesis_type (secular/cyclical/structural), direction, time_horizon, confidence, sectors, status |
| **Downstream Effects** | New macro_thesis record; optional claim linkage; triggers lifecycle triage |
| **Complexity** | Medium - multiple attribute selections |
| **Current Location** | CreateThesisDialog, `/api/theses/create` |
| **Triage Suitable?** | No - requires dedicated form |
| **Recommended UX** | Dedicated creation page/modal; pre-fill from claim if available |

### DP-3.2: Create Asset Thesis

| Field | Description |
|-------|-------------|
| **Decision Point** | Create New Asset Thesis |
| **Stage** | Thesis Management |
| **Trigger** | User action from asset list, claim conversion, or strategy linking |
| **Context Needed** | Ticker (required), optional: source claim, related macro theses |
| **Available Actions** | Set: ticker, title, direction, time_horizon, confidence, ~~target_price~~ *(move to strategy level)*, linked macro theses, status |
| **Downstream Effects** | New asset_thesis record; underlying auto-created if needed; claim linkage; lifecycle triage |
| **Complexity** | Medium |
| **Current Location** | CreateAssetThesisForm, `/api/asset-theses/create` |
| **Triage Suitable?** | No - requires ticker entry and form |
| **Recommended UX** | Dedicated creation; ticker autocomplete from underlyings |

### DP-3.3: Link Asset Thesis to Macro Thesis [REQUIRED]

| Field | Description |
|-------|-------------|
| **Decision Point** | Link Asset Thesis to Macro Thesis |
| **Stage** | Thesis Management |
| **Trigger** | User clicks link button on asset thesis page OR during creation; **unlinked asset theses surface as triage items** |
| **Context Needed** | Current asset thesis, available macro theses list, existing links |
| **Available Actions** | (1) Select macro theses to link (multi-select), (2) Add relationship note |
| **Downstream Effects** | Creates asset_thesis_related_macro_theses junction record |
| **Complexity** | Quick to Medium - depends on number of available theses |
| **Current Location** | LinkedMacroThesesSection, StandardLinkDialog |
| **Triage Suitable?** | Yes - if shown as "Link [Asset] to macro thesis?" with suggestions |
| **Recommended UX** | Triage item for unlinked assets; smart suggestions based on sector/ticker overlap |

### DP-3.4: Link Asset Thesis to Strategy

| Field | Description |
|-------|-------------|
| **Decision Point** | Link Asset Thesis to Strategy |
| **Stage** | Thesis Management |
| **Trigger** | User clicks link button OR during strategy confirmation |
| **Context Needed** | Asset thesis, available unlinked strategies for same ticker |
| **Available Actions** | Select strategy to link (single select - strategy can only have one asset thesis) |
| **Downstream Effects** | Updates strategy.assetThesisId; provides thesis context for position triage |
| **Complexity** | Quick |
| **Current Location** | StandardLinkDialog with targetType='strategy' |
| **Triage Suitable?** | Yes - often triggered by strategy confirmation flow |
| **Recommended UX** | Surface in strategy triage; quick-link from asset thesis page |

### DP-3.5: Update Thesis Status

| Field | Description |
|-------|-------------|
| **Decision Point** | Change Thesis Status |
| **Stage** | Thesis Management |
| **Trigger** | User action on thesis detail page OR lifecycle event |
| **Context Needed** | Current status, linked strategies/positions, V&I point states |
| **Available Actions** | Set status: active ↔ under_review → retired / superseded |
| **Downstream Effects** | May affect downstream strategies; should warn if active positions exist |
| **Complexity** | Quick (status only) / Medium (if downstream impact review) |
| **Current Location** | EditMacroThesisDialog, EditAssetThesisDialog |
| **Triage Suitable?** | Partial - simple status change yes, but impact review may need detail page |
| **Recommended UX** | Inline status toggle with impact warning modal |

### DP-3.6: Update Thesis Conviction/Direction

| Field | Description |
|-------|-------------|
| **Decision Point** | Update Thesis Direction or Confidence |
| **Stage** | Thesis Management |
| **Trigger** | User edit OR V&I point trigger response |
| **Context Needed** | Current values, recent evidence (claims, monitoring results) |
| **Available Actions** | Change: direction (bullish/bearish/neutral), confidence (high/medium/low/exploratory) |
| **Downstream Effects** | Signals conviction change; may trigger strategy review triage |
| **Complexity** | Quick |
| **Current Location** | Edit dialogs on thesis pages |
| **Triage Suitable?** | Yes - could surface as "Review conviction for [Thesis]" |
| **Recommended UX** | Triage item after V&I trigger; inline edit on detail page |

### DP-3.7: Delete Thesis

| Field | Description |
|-------|-------------|
| **Decision Point** | Delete Thesis |
| **Stage** | Thesis Management |
| **Trigger** | User action from edit dialog |
| **Context Needed** | Linked entities count, cascade warning |
| **Available Actions** | Confirm delete (two-step) OR cancel; **should block if linked strategies exist** |
| **Downstream Effects** | Cascades delete to claim mappings, asset thesis relations; blocked if active strategies linked |
| **Complexity** | Quick but irreversible |
| **Current Location** | Edit dialogs with delete confirmation modal |
| **Triage Suitable?** | No - destructive action requires deliberate navigation |
| **Recommended UX** | Keep as modal with cascade preview |

---

## 4. Thesis Lifecycle

> **Threshold**: **3 claims minimum** required before articulation can be triggered. This ensures sufficient evidence base before synthesis.

> **Design Gap**: Synthesis review workflow is currently terminal-based (Claude Code skill output). Need UI/UX in app for reviewing synthesis output without terminal friction. Constraint: Using Claude API from app introduces costs; ideal would be localhost interaction.

> **Status Naming**: "Mark actioned" renamed to "Monitor" for consistency with triage patterns across the app. Monitor = snooze/defer; Dismiss = permanent resolution.

### DP-4.1: Needs Research Triage

| Field | Description |
|-------|-------------|
| **Decision Point** | Thesis Needs More Claims |
| **Stage** | Thesis Lifecycle |
| **Trigger** | Automatic: thesis has < 3 claims linked, no articulation |
| **Context Needed** | Current claim count, required count (3), thesis title/description |
| **Available Actions** | (1) Dismiss *(rare)*, (2) Monitor *(snooze)*, (3) Run `/process-transcript` to link claims |
| **Downstream Effects** | Auto-resolves when ≥3 claims linked |
| **Complexity** | Quick (dismiss) / Deep (research processing) |
| **Current Location** | Thesis Triage queue (`/triage`), `NEEDS_RESEARCH` rule |
| **Triage Suitable?** | Yes - clear status with suggested action |
| **Recommended UX** | Triage card with claim count gauge, quick-link to research upload |

### DP-4.2: Produce Core Argument

| Field | Description |
|-------|-------------|
| **Decision Point** | Thesis Ready for Synthesis |
| **Stage** | Thesis Lifecycle |
| **Trigger** | Automatic: thesis has ≥3 claims, no articulation exists |
| **Context Needed** | Claim count, claim summaries, thesis title |
| **Available Actions** | (1) Dismiss, (2) Monitor, (3) Run `/synthesize-thesis` |
| **Downstream Effects** | Creates articulation with V&I points (core argument, key drivers, assumptions, gaps, dependencies); advances lifecycle stage |
| **Complexity** | Quick (dismiss) / Medium (synthesis review) |
| **Current Location** | Thesis Triage queue, `PRODUCE_CORE_ARGUMENT` rule |
| **Triage Suitable?** | Yes - actionable with clear next step |
| **Recommended UX** | Triage card with synthesis CTA; preview linked claims |

### DP-4.3: Update Core Argument

| Field | Description |
|-------|-------------|
| **Decision Point** | Thesis Articulation May Be Stale |
| **Stage** | Thesis Lifecycle |
| **Trigger** | Automatic: ≥3 new claims linked since last articulation |
| **Context Needed** | Claims at last articulation, new claims delta, articulation date |
| **Available Actions** | (1) Dismiss, (2) Monitor, (3) Re-run `/synthesize-thesis` |
| **Downstream Effects** | Updated articulation, potentially new V&I points; **should keep articulation history for reference** *(future: allow targeted tweaks vs full re-synthesis)* |
| **Complexity** | Quick (dismiss) / Medium (re-synthesis) |
| **Current Location** | Thesis Triage queue, `UPDATE_CORE_ARGUMENT` rule |
| **Triage Suitable?** | Yes - informational with optional action |
| **Recommended UX** | Lower priority triage card; show new claims preview |

### DP-4.4: Review Monitoring Content

| Field | Description |
|-------|-------------|
| **Decision Point** | Review News/Content Monitoring Results |
| **Stage** | Thesis Lifecycle |
| **Trigger** | Automatic: monitoring finds relevant results for thesis |
| **Context Needed** | AI analysis summary, validation points affected, matched results with snippets/URLs, content summary |
| **Available Actions** | (1) Dismiss, (2) Monitor, (3) Run `/assess-validation-evidence`, (4) Click through to sources |
| **Downstream Effects** | May trigger V&I status updates; informs thesis conviction |
| **Complexity** | Medium - requires reading matched content |
| **Current Location** | Thesis Triage queue, `REVIEW_CONTENT` rule |
| **Triage Suitable?** | Partial - summary in triage, full results may need detail view |
| **Recommended UX** | Triage card with expandable results; "Assess Evidence" CTA |

### DP-4.5: Review Data Monitoring Results

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Data Threshold Breach |
| **Stage** | Thesis Lifecycle |
| **Trigger** | Automatic: data feed monitoring detects threshold breach |
| **Context Needed** | Metric name, threshold, current value, V&I point affected |
| **Available Actions** | Same as REVIEW_CONTENT |
| **Downstream Effects** | Often triggers V&I status → "triggered" |
| **Complexity** | Quick - data is quantitative |
| **Current Location** | Thesis Triage queue, `REVIEW_DATA` rule |
| **Triage Suitable?** | Yes - clear signal with specific metric |
| **Recommended UX** | Urgent triage card with metric visualization |

---

## 5. V&I Monitoring

> ⚠️ **UNTESTED/THEORETICAL**: This entire workflow is in design phase only - not yet validated through user testing. Implementation details are theoretical and need validation.

> **Goal**: Evolve thesis/strategy conviction over time based on changing events. V&I points provide a structured framework for tracking what would validate or invalidate a thesis, and status changes must be **directly linked to the news flow or data flow** that led to the change.

> **Status Lifecycle Questions (Open)**:
> - Current states: `not_triggered` → `monitoring` → `triggered` / `superseded`
> - **What happens after trigger?** Does thesis status change? Does it prompt action?
> - **Is intermediate "monitoring" state needed?** Or just not_triggered → triggered?
> - **What does "superseded" mean?** When is it used vs archived/retired?

> **Underused Fields**: `importance` (critical/significant/supporting) - questionable value. May overlap with explicit vs judgment categorization. `response_protocol` field may also be redundant.

### DP-5.1: Create Validation Point

| Field | Description |
|-------|-------------|
| **Decision Point** | Create V&I Point |
| **Stage** | V&I Monitoring |
| **Trigger** | During `/synthesize-thesis` *(primary - not typically manual)* |
| **Context Needed** | Thesis context, existing V&I points |
| **Available Actions** | Set: statement, type (validation/invalidation), ~~importance~~ *(questionable value)*, category (explicit/judgment_required), timeframe, metrics/thresholds (if explicit), observable proxies (if judgment), ~~response_protocol~~ *(may be redundant)* |
| **Downstream Effects** | V&I point created; enables monitoring configuration |
| **Complexity** | Medium to Deep - requires careful formulation |
| **Current Location** | Via synthesis skill; ValidationPointsList on asset thesis page |
| **Triage Suitable?** | No - requires thoughtful input |
| **Recommended UX** | Dedicated form within thesis detail page; AI-assisted during synthesis |

### DP-5.2: Update V&I Point Status [STATUS LIFECYCLE TBD]

| Field | Description |
|-------|-------------|
| **Decision Point** | Change V&I Point Status |
| **Stage** | V&I Monitoring |
| **Trigger** | User clicks "Update Status" OR monitoring result suggests status change |
| **Context Needed** | Current status, V&I statement, recent monitoring events, thesis context |
| **Available Actions** | Set status: not_triggered → monitoring → triggered (or superseded) *(lifecycle needs validation - see open questions above)* |
| **Downstream Effects** | Records to validation_status_history; may trigger thesis review; journals the change; **status change must be linked to triggering news/data** |
| **Complexity** | Medium - requires evidence documentation |
| **Current Location** | UpdateValidationStatusModal |
| **Triage Suitable?** | Partial - status selection is quick, evidence entry less so |
| **Recommended UX** | Triage surfaces "V&I point may be triggered"; modal for evidence entry |

### DP-5.3: Provide V&I Status Evidence [REQUIRED]

| Field | Description |
|-------|-------------|
| **Decision Point** | Document Evidence for Status Change |
| **Stage** | V&I Monitoring |
| **Trigger** | During V&I status update *(mandatory step)* |
| **Context Needed** | V&I statement, monitoring results if available |
| **Available Actions** | Enter: source **(required)**, summary **(required)**, link **(should be required - mandatory link to triggering news/data)**, confidence level (low/medium/high), action taken (if triggered) |
| **Downstream Effects** | Evidence persisted to history; enables audit trail; **provides provenance for status change** |
| **Complexity** | Medium |
| **Current Location** | UpdateValidationStatusModal |
| **Triage Suitable?** | No - requires text input |
| **Recommended UX** | Pre-fill from monitoring results when available |

### DP-5.4: Create Monitoring Spec [DESIGN PHASE]

| Field | Description |
|-------|-------------|
| **Decision Point** | Configure Monitoring for V&I Point |
| **Stage** | V&I Monitoring |
| **Trigger** | User clicks "Create Spec" next to V&I point |
| **Context Needed** | V&I point statement, type, importance |
| **Available Actions** | Set: keywords, semantic description, sources (FRED/news/price_iv/SEC), exclusions, frequency (daily/weekly/monthly), alert threshold, enabled |
| **Downstream Effects** | MonitoringSpec created; scheduled for automated checks |
| **Complexity** | Medium - configuration form |
| **Current Location** | MonitoringSpecForm |
| **Triage Suitable?** | No - requires form completion |
| **Recommended UX** | AI-suggested defaults based on V&I statement; inline form on V&I detail |

### DP-5.5: Run Manual Monitoring Check [DESIGN PHASE]

| Field | Description |
|-------|-------------|
| **Decision Point** | Execute Manual Monitoring Check |
| **Stage** | V&I Monitoring |
| **Trigger** | User clicks "Run" on monitoring spec |
| **Context Needed** | Spec configuration, last check date |
| **Available Actions** | (1) Run check, (2) View results, (3) Rate relevance of each result (0-10), (4) Complete assessment |
| **Downstream Effects** | Creates monitoring_events; updates spec lastCheck; may inform V&I status decision |
| **Complexity** | Medium - requires result review |
| **Current Location** | ManualCheckDialog |
| **Triage Suitable?** | Partial - trigger is quick, result review less so |
| **Recommended UX** | "Run check" as triage action; results in expanded detail or modal |

### DP-5.6: Assess Monitoring Results [DESIGN PHASE]

| Field | Description |
|-------|-------------|
| **Decision Point** | Assess Monitoring Check Results |
| **Stage** | V&I Monitoring |
| **Trigger** | After monitoring check completes |
| **Context Needed** | Results per data source, relevance scores, V&I point context |
| **Available Actions** | (1) Enter overall assessment, (2) Optionally update V&I status with evidence |
| **Downstream Effects** | Assessment saved to monitoring_event; may cascade to V&I status update |
| **Complexity** | Medium |
| **Current Location** | ManualCheckDialog (results stage) |
| **Triage Suitable?** | No - requires text entry and judgment |
| **Recommended UX** | Structured assessment form with optional status update toggle |

### DP-5.7: View V&I Status History [DESIGN PHASE]

| Field | Description |
|-------|-------------|
| **Decision Point** | Review V&I Point History |
| **Stage** | V&I Monitoring |
| **Trigger** | User navigates to Status History tab |
| **Context Needed** | All status changes with evidence, confidence, timestamps |
| **Available Actions** | Read-only review; navigate to related monitoring events |
| **Downstream Effects** | None - informational |
| **Complexity** | Quick |
| **Current Location** | ValidationPointDetail → StatusTimeline |
| **Triage Suitable?** | No - exploration/audit activity |
| **Recommended UX** | Timeline visualization on V&I detail page |

---

## 6. Strategy Management

### DP-6.1: Confirm Auto-Derived Strategy

| Field | Description |
|-------|-------------|
| **Decision Point** | Confirm Auto-Derived Strategy |
| **Stage** | Strategy Management |
| **Trigger** | Automatic: strategy created from trade ingestion, unconfirmed |
| **Context Needed** | Strategy positions, underlying, net notional, unrealized PnL |
| **Available Actions** | (1) Dismiss triage, (2) UPDATE: open confirmation dialog, select strategy type, link to asset thesis |
| **Downstream Effects** | Strategy marked confirmed; linked to thesis; enables thesis-level context in position triage |
| **Complexity** | Quick to Medium - type selection and thesis linking |
| **Current Location** | Triage queue, `LINK_STRATEGY_TO_THESIS` rule |
| **Triage Suitable?** | Yes - urgent action with clear workflow |
| **Recommended UX** | Triage card with "Confirm Strategy" CTA; inline type/thesis selection |

### DP-6.2: Link Strategy to Asset Thesis

| Field | Description |
|-------|-------------|
| **Decision Point** | Link Strategy to Asset Thesis |
| **Stage** | Strategy Management |
| **Trigger** | During strategy confirmation OR user action on confirmed strategy |
| **Context Needed** | Strategy ticker, available asset theses for ticker |
| **Available Actions** | (1) Select existing asset thesis, (2) Create new asset thesis |
| **Downstream Effects** | Updates strategy.assetThesisId; provides conviction context for positions |
| **Complexity** | Quick |
| **Current Location** | StrategyConfirmationDialog, StandardLinkDialog |
| **Triage Suitable?** | Yes - dropdown/list selection |
| **Recommended UX** | Smart suggestions based on ticker match; quick-create option |

### DP-6.3: Set Strategy Type

| Field | Description |
|-------|-------------|
| **Decision Point** | Set Strategy Type |
| **Stage** | Strategy Management |
| **Trigger** | During strategy confirmation OR metadata update |
| **Context Needed** | Position structure (legs, deltas), template suggestions |
| **Available Actions** | Select type from strategy_templates (covered call, put spread, etc.) |
| **Downstream Effects** | Enables state code calculation; playbook rule matching |
| **Complexity** | Quick |
| **Current Location** | Strategy confirmation flow |
| **Triage Suitable?** | Yes - dropdown selection |
| **Recommended UX** | Auto-suggest based on position structure; confirm with dropdown |

### DP-6.4: Provide Strategy Entry Context

| Field | Description |
|-------|-------------|
| **Decision Point** | Document Strategy Entry Context |
| **Stage** | Strategy Management |
| **Trigger** | During confirmation OR via PROVIDE_STRATEGY_METADATA triage |
| **Context Needed** | Entry spot, IV30, premium, thesis |
| **Available Actions** | Enter: thesis narrative, profit rules, defense rules, time rules |
| **Downstream Effects** | Context stored for trade rationale; enables decision log analysis |
| **Complexity** | Medium - narrative entry |
| **Current Location** | Strategy detail page, triage action |
| **Triage Suitable?** | Partial - prompted by triage, requires form completion |
| **Recommended UX** | Triage surfaces prompt; expandable form in triage or link to page |

### DP-6.5: Review Size Concentration

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Strategy Size as % of NAV |
| **Stage** | Strategy Management |
| **Trigger** | Automatic: strategy exceeds size thresholds (10%/25%/50% NAV) |
| **Context Needed** | Net notional, pctNavAbsNotional, unrealized PnL, thesis context |
| **Available Actions** | (1) MONITOR (7 days), (2) DISMISS (permanent info) |
| **Downstream Effects** | Severity override applied; re-surfaces if threshold increases |
| **Complexity** | Quick |
| **Current Location** | Triage queue, `REVIEW_SIZE` rule |
| **Triage Suitable?** | Yes - clear metric with binary action |
| **Recommended UX** | Triage card with size visualization; quick MONITOR/DISMISS buttons |

### DP-6.6: Review Strategy Complexity

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Strategy Complexity |
| **Stage** | Strategy Management |
| **Trigger** | Automatic: strategy has > 10 open positions |
| **Context Needed** | Position count, position list |
| **Available Actions** | Info-only (no action required) |
| **Downstream Effects** | None - awareness signal |
| **Complexity** | Quick |
| **Current Location** | Triage queue, `REVIEW_COMPLEXITY` rule |
| **Triage Suitable?** | Yes - informational badge |
| **Recommended UX** | Low-priority triage item; complexity indicator on strategy cards |

### DP-6.7: State Code Change

| Field | Description |
|-------|-------------|
| **Decision Point** | Respond to State Code Change |
| **Stage** | Strategy Management |
| **Trigger** | Automatic: state code differs from previous day (e.g., LC1 → LC2) |
| **Context Needed** | Previous state, new state, playbook rules for new state |
| **Available Actions** | (1) MONITOR, (2) DISMISS, (3) Follow playbook (links to playbook item) |
| **Downstream Effects** | May indicate roll/close decision needed per playbook |
| **Complexity** | Quick to Medium - depends on playbook complexity |
| **Current Location** | Triage queue, `STATE_CODE_CHANGE` rule |
| **Triage Suitable?** | Yes - urgent signal with playbook reference |
| **Recommended UX** | Triage card with state transition badge; link to playbook rules |

---

## 7. Position Management

### DP-7.1: DTE Alert

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Position Approaching Expiration |
| **Stage** | Position Management |
| **Trigger** | Automatic: DTE ≤ 30 (attention if SHORT ≤7 or LONG ≤30) |
| **Context Needed** | DTE value, expiry date, position details, strike, underlying spot |
| **Available Actions** | (1) MONITOR (7 days), (2) DISMISS |
| **Downstream Effects** | Severity override; may prompt roll/close decision |
| **Complexity** | Quick |
| **Current Location** | Triage queue, `REVIEW_DTE` rule |
| **Triage Suitable?** | Yes - quantitative metric with standard response |
| **Recommended UX** | Triage card with DTE countdown; group by strategy |

### DP-7.2: ITM Position Alert

| Field | Description |
|-------|-------------|
| **Decision Point** | Review In-The-Money Position |
| **Stage** | Position Management |
| **Trigger** | Automatic: position is ITM based on spot vs strike |
| **Context Needed** | Strike, spot, position side (long/short), DTE |
| **Available Actions** | (1) MONITOR, (2) DISMISS |
| **Downstream Effects** | Awareness of assignment risk (if short) or exercise decision (if long) |
| **Complexity** | Quick |
| **Current Location** | Triage queue, `ITM_LONG` / `ITM_SHORT` rules |
| **Triage Suitable?** | Yes - binary status with clear context |
| **Recommended UX** | ITM badge on position; triage grouped with assignment risk |

### DP-7.3: Assignment Risk Alert

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Assignment Risk |
| **Stage** | Position Management |
| **Trigger** | Automatic: SHORT position, ITM, DTE ≤ 14 (urgent) or ≤ 30 (attention) |
| **Context Needed** | Underlying spot, strike, DTE, assignment probability estimate |
| **Available Actions** | (1) MONITOR, (2) DISMISS |
| **Downstream Effects** | Heightened awareness; may trigger roll/close decision |
| **Complexity** | Quick |
| **Current Location** | Triage queue, `ASSIGNMENT_RISK≤14_DTE` / `ASSIGNMENT_RISK≤30_DTE` rules |
| **Triage Suitable?** | Yes - urgent with clear metrics |
| **Recommended UX** | High-priority triage card; visual assignment probability |

### DP-7.4: Sigma Alert

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Position Sigma |
| **Stage** | Position Management |
| **Trigger** | Automatic: σ ≤ 0.5 (urgent/attention) or ≤ 1.0 (info) |
| **Context Needed** | Sigma value, IV30, underlying spot, DTE, position side |
| **Available Actions** | (1) MONITOR, (2) DISMISS |
| **Downstream Effects** | Indicates option is at risk of moving ITM; prompts defense consideration |
| **Complexity** | Quick |
| **Current Location** | Triage queue, `SIGMA_0.5_SHORT` / `SIGMA_0.5_LONG` / `SIGMA_1.0` rules |
| **Triage Suitable?** | Yes - quantitative with visual representation |
| **Recommended UX** | Triage card with sigma gauge; color-coded severity |

### DP-7.5: Roll Decision

| Field | Description |
|-------|-------------|
| **Decision Point** | Decide to Roll Position |
| **Stage** | Position Management |
| **Trigger** | User decides based on DTE/ITM/sigma alerts OR state code playbook |
| **Context Needed** | Current position, available roll targets, P&L impact |
| **Available Actions** | (1) Select roll target (strike, expiry), (2) Execute roll trade, (3) Document trade reason |
| **Downstream Effects** | Creates TRADE action; closes old position, opens new |
| **Complexity** | Medium to Deep - requires market analysis |
| **Current Location** | Not directly implemented - manual broker execution |
| **Triage Suitable?** | Partial - decision prompt yes, execution details no |
| **Recommended UX** | Triage suggests "Consider roll"; detail page shows roll candidates |

### DP-7.6: Close Decision

| Field | Description |
|-------|-------------|
| **Decision Point** | Decide to Close Position |
| **Stage** | Position Management |
| **Trigger** | User decides based on alerts, profit target, or defense rule |
| **Context Needed** | Position P&L, thesis context, exit criteria from strategy |
| **Available Actions** | (1) Execute close trade, (2) Document trade reason/stage |
| **Downstream Effects** | Creates TRADE action; position closed |
| **Complexity** | Quick to Medium |
| **Current Location** | Triage TRADE action |
| **Triage Suitable?** | Yes - action button with reason prompt |
| **Recommended UX** | "Close Position" CTA in triage; inline reason entry |

---

## 8. Trade Reconciliation

### DP-8.1: Quantity Change (Unmatched Trades)

| Field | Description |
|-------|-------------|
| **Decision Point** | Reconcile Unmatched Trades |
| **Stage** | Trade Reconciliation |
| **Trigger** | Automatic: trades ingested don't match existing TRADE actions |
| **Context Needed** | Unmatched trade executions (symbol, quantity, price, date), strategy context |
| **Available Actions** | (1) Select trades to acknowledge, (2) Set trade stage (open/close/roll/hedge/etc.), (3) Enter trade reason, (4) Optional: link to thesis, profit/defense/time rules |
| **Downstream Effects** | Creates blotter_action record; links trades to strategy; marks severity → complete |
| **Complexity** | Medium - requires context for each trade |
| **Current Location** | Triage queue, `QUANTITY_CHANGE` rule |
| **Triage Suitable?** | Partial - trade list in triage, detailed context may need page |
| **Recommended UX** | Triage card with trade list; expandable detail form |

### DP-8.2: Trade Stage Selection

| Field | Description |
|-------|-------------|
| **Decision Point** | Classify Trade Stage |
| **Stage** | Trade Reconciliation |
| **Trigger** | During trade reconciliation (QUANTITY_CHANGE) |
| **Context Needed** | Trade direction, quantity, existing position |
| **Available Actions** | Select: open, close, assignment, hedge, roll, reduce, add |
| **Downstream Effects** | Affects blotter categorization and analysis |
| **Complexity** | Quick |
| **Current Location** | Triage TRADE action form |
| **Triage Suitable?** | Yes - dropdown selection |
| **Recommended UX** | Auto-suggest based on quantity sign and position state |

### DP-8.3: Trade Reason Documentation

| Field | Description |
|-------|-------------|
| **Decision Point** | Document Trade Rationale |
| **Stage** | Trade Reconciliation |
| **Trigger** | During trade reconciliation (required field) |
| **Context Needed** | Trade details, strategy thesis, market context |
| **Available Actions** | Enter narrative trade reason |
| **Downstream Effects** | Enables journal analysis; supports retrospective review |
| **Complexity** | Medium - requires thoughtful narrative |
| **Current Location** | Triage TRADE action form |
| **Triage Suitable?** | Partial - prompted in triage, may want richer editing |
| **Recommended UX** | Textarea in triage expansion; templates for common reasons |

### DP-8.4: Trade Action Creation

| Field | Description |
|-------|-------------|
| **Decision Point** | Create Trade Action (Pre-Trade) |
| **Stage** | Trade Reconciliation |
| **Trigger** | User decides to trade based on triage alert |
| **Context Needed** | Position details, planned action |
| **Available Actions** | Create pending TRADE action with: positions, quantities, stage, reason |
| **Downstream Effects** | Severity → "pending"; awaits matching trade ingestion |
| **Complexity** | Medium |
| **Current Location** | Triage TRADE action button |
| **Triage Suitable?** | Yes - action workflow in triage |
| **Recommended UX** | "Plan Trade" button; form in triage expansion |

### DP-8.5: Trade Matching Verification

| Field | Description |
|-------|-------------|
| **Decision Point** | Verify Trade Action Matched |
| **Stage** | Trade Reconciliation |
| **Trigger** | Automatic: trade ingestion matches pending action |
| **Context Needed** | Planned action, actual execution details |
| **Available Actions** | Review match (usually auto-resolved) |
| **Downstream Effects** | Severity → "complete"; linkage established |
| **Complexity** | Quick |
| **Current Location** | Automated in blotter computation |
| **Triage Suitable?** | N/A - automated |
| **Recommended UX** | Toast notification of match; journal entry |

### DP-8.6: Post-Trade Reflection

| Field | Description |
|-------|-------------|
| **Decision Point** | Add Post-Trade Notes |
| **Stage** | Trade Reconciliation |
| **Trigger** | User action after trade completion |
| **Context Needed** | Trade details, original rationale, outcome |
| **Available Actions** | Enter reflection notes, update profit/defense/time rules effectiveness |
| **Downstream Effects** | Enriches journal for AI analysis |
| **Complexity** | Medium |
| **Current Location** | Not directly implemented (could be blotter detail) |
| **Triage Suitable?** | Partial - prompt in triage, editing on detail page |
| **Recommended UX** | Triage item: "Add reflection for [Trade]"; detail page form |

---

## 9. Pattern Analysis

### Decision Point Complexity Distribution

| Complexity | Count | Examples |
|------------|-------|----------|
| **Quick** | 28 | Status changes, MONITOR/DISMISS, dropdown selections |
| **Medium** | 22 | Form completion, entity linking, result review |
| **Deep** | 4 | Research extraction, synthesis matching, roll analysis |

### Triage Suitability Summary

| Rating | Count | Pattern |
|--------|-------|---------|
| **Yes** | 26 | Quantitative alerts, status toggles, simple actions |
| **Partial** | 16 | Decision prompt in triage, details elsewhere |
| **No** | 12 | Forms, creation workflows, exploration |

### Decision Point Groupings

**Group 1: Quantitative Risk Alerts** (Highly Triage-Suitable)
- DTE, ITM, Assignment Risk, Sigma, Size
- Pattern: Metric + threshold → severity badge → MONITOR/DISMISS

**Group 2: Lifecycle State Changes** (Triage-Suitable)
- State code change, thesis lifecycle stages
- Pattern: State transition → suggested action → quick resolution

**Group 3: Linking Operations** (Partially Triage-Suitable)
- Claim→thesis, asset→macro, strategy→thesis
- Pattern: Source entity needs link → suggestions → multi-select confirmation

**Group 4: Content Review** (Partially Triage-Suitable)
- Monitoring results, synthesis recommendations
- Pattern: Content summary in triage → full review in expanded view or page

**Group 5: Entity Creation** (Not Triage-Suitable)
- New thesis, new asset thesis, new V&I point
- Pattern: Multi-field forms requiring dedicated UX

**Group 6: Documentation** (Partially Triage-Suitable)
- Trade reasons, evidence entry, reflections
- Pattern: Prompted by triage → text entry → may need templates

---

## 10. Proposed Triage Architecture

### Unified Triage Model

Based on the inventory, triage items should follow a unified structure:

```typescript
interface UnifiedTriageItem {
  // Identity
  id: string;
  domain: 'thesis' | 'strategy' | 'position' | 'claim' | 'research';
  objectId: string;
  objectType: string;

  // Trigger
  rule: string;           // e.g., 'REVIEW_DTE', 'NEEDS_RESEARCH', 'QUANTITY_CHANGE'
  trigger: string;        // Human-readable trigger description

  // Severity & Urgency
  severity: 'urgent' | 'attention' | 'info' | 'monitor' | 'pending' | 'complete';
  urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient';

  // Context (domain-specific)
  context: {
    // Common
    title: string;
    subtitle?: string;
    metrics?: Record<string, number | string>;

    // Thesis-specific
    lifecycleStage?: string;
    claimCount?: number;
    monitoringResults?: MonitoringResult[];

    // Position-specific
    dte?: number;
    sigma?: number;
    itmStatus?: boolean;

    // Strategy-specific
    pctNav?: number;
    stateCode?: string;
    previousStateCode?: string;

    // Trade-specific
    unmatchedTrades?: TradeExecution[];
  };

  // Actions
  availableActions: TriageAction[];
  suggestedAction?: TriageAction;
  suggestedSkill?: string;

  // Resolution
  status: 'open' | 'actioned' | 'dismissed' | 'auto_resolved';
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

interface TriageAction {
  type: 'MONITOR' | 'DISMISS' | 'UPDATE' | 'TRADE' | 'LINK' | 'CREATE' | 'ASSESS';
  label: string;
  requiresForm: boolean;
  opensDialog?: string;
  navigatesTo?: string;
}
```

### Triage UX Recommendations

**1. Primary Triage View**
- Single unified inbox across all domains
- Filter by: domain, severity, urgency, rule type
- Sort by: urgency, severity, age, domain
- Group by: strategy (for positions), thesis (for V&I), domain

**2. Triage Card Design**
- Compact: Title, severity badge, key metric, primary action button
- Expanded: Full context, all actions, suggested skill, notes field
- One-click actions for MONITOR/DISMISS
- Inline forms for simple data entry (trade reason, relationship type)

**3. Handoff Patterns**
- Triage → Modal: Linking dialogs, confirmation flows
- Triage → Page: Entity creation, deep analysis, history review
- Triage → Skill: Claude Code invocation for processing tasks

**4. Smart Suggestions**
- Auto-suggest link targets based on context (ticker, category)
- Pre-fill trade stage based on quantity direction
- Recommend dismiss vs monitor based on prior patterns
- Surface related triage items (same strategy, same thesis)

**5. Batch Operations**
- Multi-select for bulk DISMISS/MONITOR
- Group actions for same-strategy positions
- Bulk claim status updates

### Integration Points

| From Triage | To | Data Flow |
|-------------|-----|-----------|
| Claim linking | ConvertClaimDialog | Claim ID, suggestions |
| Strategy confirm | StrategyConfirmDialog | Strategy ID, type suggestions |
| V&I status | UpdateStatusModal | V&I ID, monitoring evidence |
| Trade action | TradeForm | Positions, quantities |
| Monitoring | ManualCheckDialog | Spec ID, V&I context |
| Synthesis | Detail page | Thesis ID, claim mappings |

---

## Appendix: Decision Point Index by Current Location

### Triage Queue (`/triage`)
- DP-4.1: NEEDS_RESEARCH
- DP-4.2: PRODUCE_CORE_ARGUMENT
- DP-4.3: UPDATE_CORE_ARGUMENT
- DP-4.4: REVIEW_CONTENT
- DP-4.5: REVIEW_DATA
- DP-6.1: LINK_STRATEGY_TO_THESIS
- DP-6.5: REVIEW_SIZE
- DP-6.6: REVIEW_COMPLEXITY
- DP-6.7: STATE_CODE_CHANGE
- DP-7.1: REVIEW_DTE
- DP-7.2: ITM_LONG/ITM_SHORT
- DP-7.3: ASSIGNMENT_RISK
- DP-7.4: SIGMA alerts
- DP-8.1: QUANTITY_CHANGE

### Claims Browser (`/claims`)
- DP-2.4: Status Change
- DP-2.5: Link to Entities
- DP-2.6: Relationship Type
- DP-2.8: Remove Link

### Thesis Pages (`/theses/[id]`, `/asset-theses/[id]`)
- DP-3.1: Create Macro Thesis
- DP-3.2: Create Asset Thesis
- DP-3.3: Link Asset to Macro
- DP-3.4: Link Asset to Strategy
- DP-3.5: Update Status
- DP-3.6: Update Conviction
- DP-3.7: Delete Thesis
- DP-5.1: Create V&I Point
- DP-5.2: Update V&I Status
- DP-5.4: Create Monitoring Spec
- DP-5.7: View History

### Claude Code Skills
- DP-1.1 through DP-1.5: Research Ingestion
- DP-2.1 through DP-2.3: Synthesis Matching

### Not Yet Implemented
- DP-7.5: Roll Decision (market analysis)
- DP-8.6: Post-Trade Reflection

---

*This inventory serves as the foundation for UX/UI redesign work. Next steps: Pattern refinement, unified triage mockups, object page integration design.*
