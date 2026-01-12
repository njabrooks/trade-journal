# Decision Point Inventory

**Purpose**: Comprehensive enumeration of all decision points across the trade-journal application, following the template from the UX Redesign Brief.

**Status**: Sections 1-5 fully refined; Sections 6-10 pending review
**Created**: 2026-01-09
**Last Updated**: 2026-01-12
**Related**: [triage-ux-redesign-brief.md](260109-triage-ux-redesign-brief.md)

### Revision History
- **2026-01-12**: Complete redesign of Section 5 (Signals):
  - Restructured from 7 decision points to 5, focused on user workflows
  - DP-5.1: Review Recommended Signals (batch review post-synthesis)
  - DP-5.2: Configure Explicit Trigger (data source + criteria builder)
  - DP-5.3: Respond to Signal Trigger - now thesis-level, not per-signal
  - DP-5.4: AI-Assisted Judgment Update (Claude analyzes content, user confirms)
  - DP-5.5: Upgrade Judgment to Explicit (convert with data source)
  - Added wireframes for triage cards and configuration flows
  - Documented data source status (FRED ✅, IV ✅, TradingView ❌ future)
  - Clarified judgment vs explicit category distinction
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
5. [Signals](#5-signals)
6. [Strategy Management](#6-strategy-management)
7. [Position Management](#7-position-management)
8. [Trade Journaling](#8-trade-journaling)
9. [Pattern Analysis](#9-pattern-analysis)
10. [Proposed Triage Architecture](#10-proposed-triage-architecture)
11. [Journal Logging Requirements](#11-journal-logging-requirements)

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

> **Problematic Fields**: `horizon` and `confidence` fields feel like "checkbox completion rather than meaningful input." They appear across the app and may not earn their keep as manual user inputs. **Better approach**: Auto-calculate a "strength" indicator based on linked claims, evidence quality, and signal states rather than requiring subjective user input.

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
| **Context Needed** | Current status, linked strategies/positions, signal states |
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
| **Trigger** | User edit OR signal trigger response |
| **Context Needed** | Current values, recent evidence (claims, monitoring results) |
| **Available Actions** | Change: direction (bullish/bearish/neutral), confidence (high/medium/low/exploratory) |
| **Downstream Effects** | Signals conviction change; may trigger strategy review triage |
| **Complexity** | Quick |
| **Current Location** | Edit dialogs on thesis pages |
| **Triage Suitable?** | Yes - could surface as "Review conviction for [Thesis]" |
| **Recommended UX** | Triage item after signal trigger; inline edit on detail page |

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
| **Downstream Effects** | Creates articulation with signals (core argument, key drivers, assumptions, gaps, dependencies); advances lifecycle stage |
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
| **Downstream Effects** | Updated articulation, potentially new signals; **should keep articulation history for reference** *(future: allow targeted tweaks vs full re-synthesis)* |
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
| **Context Needed** | AI analysis summary, signals affected, matched results with snippets/URLs, content summary |
| **Available Actions** | (1) Dismiss, (2) Monitor, (3) Run `/assess-validation-evidence`, (4) Click through to sources |
| **Downstream Effects** | May trigger signal status updates; informs thesis conviction |
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
| **Context Needed** | Metric name, threshold, current value, signal affected |
| **Available Actions** | Same as REVIEW_CONTENT |
| **Downstream Effects** | Often triggers signal status → "triggered" |
| **Complexity** | Quick - data is quantitative |
| **Current Location** | Thesis Triage queue, `REVIEW_DATA` rule |
| **Triage Suitable?** | Yes - clear signal with specific metric |
| **Recommended UX** | Urgent triage card with metric visualization |

---

## 5. Signals

> ⚠️ **DESIGN PHASE**: This workflow has been significantly redesigned based on review. Implementation details need validation through user testing.

> **Terminology**: "Validation/Invalidation Points" have been renamed to **Signals** for clarity:
> - **Green Signals** = confirmation (thesis on track)
> - **Red Signals** = warning (thesis undermined)

> **Goal**: Evolve thesis conviction over time based on changing events. Signals provide a structured framework for tracking what would confirm or undermine a thesis.

> **Key Design Decisions (from review)**:
> - Signals are **AI-generated during synthesis** with status `recommended`
> - User **reviews and confirms** (not creates) signals
> - Two categories: **Judgment-based** (manual assessment) vs **Explicit** (data-triggered)
> - Explicit triggers require **data source + criteria configuration** (FRED, TradingView, IV data)
> - Triage operates at **thesis level**, not per-signal (prevents triage overload)
> - News/semantic monitoring supports **judgment-based** signals (not precise enough for explicit triggers)

> **Data Source Status**:
> - ✅ **FRED**: Integrated with historical data. Focus on common series (GDP, CPI, unemployment, fed funds)
> - ✅ **IV Data**: Integrated. IV30, IV Rank, IV Percentile thresholds
> - ⚠️ **Price Feeds**: Partial integration
> - ❌ **TradingView**: Future - webhooks for price targets + indicator triggers
> - ℹ️ **News/Semantic**: Supports judgment-based signals, not explicit triggers

> **Implementation Pattern**: Uses existing headless Claude CLI pattern via API endpoints (see `/api/skills/synthesize-thesis/route.ts`). Claude analyzes content, returns recommendations as JSON, user confirms in UI before changes persist.

### DP-5.1: Review Recommended Signals

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Recommended Signals |
| **Stage** | Signals |
| **Trigger** | Automatic: `/synthesize-thesis` completes, creates signals with status `recommended` |
| **Context Needed** | Thesis title/description, full list of recommended signals (statements, AI-suggested category), thesis conviction/direction |
| **Available Actions** | For each signal: (1) Reject, (2) Accept as judgment-based, (3) Accept as explicit → triggers inline data config (DP-5.2), (4) Edit statement before accepting |
| **Downstream Effects** | Rejected: marked rejected/hidden. Accepted: status → `confirmed`, category set (judgment/explicit). If explicit: requires DP-5.2 completion before confirmation. Thesis lifecycle advances. |
| **Complexity** | Medium - batch review with potential data configuration |
| **Current Location** | **DESIGN PHASE** - currently signals auto-created without review step |
| **Triage Suitable?** | Yes - surfaces as single triage item: "Review [N] recommended signals for [Thesis]" |
| **Recommended UX** | Triage card links to dedicated review screen or modal. Checklist-style interface with accept/reject per item. Inline expansion for editing or configuring explicit triggers. Bulk actions: "Accept all as judgment" for speed. |

**Signal Lifecycle:**

```
recommended (AI-generated)
    ├── Reject → (deleted or status: rejected)
    │
    ├── Accept as Judgment-based
    │   └── No data config needed
    │   └── User manually assesses over time
    │   └── Status: confirmed, category: judgment
    │
    └── Accept as Explicit/Data-based
        └── REQUIRES: data source selection + trigger criteria (DP-5.2)
        └── e.g., "FRED:GDP > 3% for 3 consecutive quarters"
        └── e.g., "TradingView:AAPL price < $150"
        └── Status: confirmed, category: explicit
```

**Design Considerations:**
- AI could pre-suggest which points are likely explicit vs judgment based on language
- Consider "Accept all as judgment" shortcut for users who trust AI recommendations
- Should show thesis context alongside signals

**Open Questions:**
- What happens if user only partially reviews? Can they save progress and return?
- Should rejected signals be soft-deleted (recoverable) or hard-deleted?

### DP-5.2: Configure Explicit Trigger

| Field | Description |
|-------|-------------|
| **Decision Point** | Configure Explicit Signal |
| **Stage** | Signals |
| **Trigger** | User selects "Accept as explicit" for a signal during DP-5.1 review |
| **Context Needed** | signal statement, available data sources, example trigger criteria patterns |
| **Available Actions** | (1) Select data source (FRED, TradingView, IV data), (2) Define trigger criteria (metric, operator, threshold, duration if applicable), (3) Set check frequency (daily/weekly/monthly), (4) Cancel → reverts to accept/reject choice |
| **Downstream Effects** | Creates monitoring configuration linked to signal. Enables automated checks. signal status → `confirmed`, category → `explicit`. |
| **Complexity** | Medium - requires understanding of data sources and threshold logic |
| **Current Location** | **DESIGN PHASE** - MonitoringSpecForm exists but not integrated into signal acceptance flow |
| **Triage Suitable?** | No - requires dedicated form with multiple inputs |
| **Recommended UX** | Inline expansion within DP-5.1 review screen. Guided form: Step 1 → Select source, Step 2 → Configure criteria, Step 3 → Confirm. Show preview of what will trigger. |

**Data Source Configuration Patterns:**

| Source | Status | Example Criteria |
|--------|--------|------------------|
| **FRED** | ✅ Integrated | `GDP growth > 3%` for `3 consecutive quarters` |
| **IV Data** | ✅ Integrated | `IV30 > 50` or `IV Rank > 80%` |
| **Price Feed** | ⚠️ Partial | `AAPL price < $150` |
| **TradingView** | ❌ Future | Webhook-based: `RSI(14) > 70`, price alerts, custom indicators |

**Criteria Builder Wireframe:**

```
┌─────────────────────────────────────────────────────────────┐
│ Data Source:  [FRED ▼]                                      │
├─────────────────────────────────────────────────────────────┤
│ Metric:       [GDP Growth Rate ▼]                           │
│ Condition:    [Greater than ▼]  [3] [% ▼]                   │
│ Duration:     [3] consecutive [quarters ▼]                  │
├─────────────────────────────────────────────────────────────┤
│ Check every:  [Weekly ▼]                                    │
├─────────────────────────────────────────────────────────────┤
│ Preview: "Triggers when GDP Growth Rate exceeds 3% for      │
│           3 consecutive quarters"                           │
└─────────────────────────────────────────────────────────────┘
```

**TradingView Integration Model (Future):**

```
┌─────────────────────┐         ┌─────────────────────┐
│    TradingView      │         │     Our App         │
├─────────────────────┤         ├─────────────────────┤
│ User creates alert  │         │                     │
│ with webhook URL    │ ──────► │ Webhook endpoint    │
│ (price, indicator)  │         │ receives trigger    │
│                     │         │                     │
│ Alert fires when    │         │ Matches to signal      │
│ condition met       │         │ point, creates      │
│                     │         │ triage item         │
└─────────────────────┘         └─────────────────────┘
```

**Design Considerations:**
- Different data sources need different criteria builders
- AI could suggest data source + criteria based on signal statement language
- For FRED, pre-populate common series (GDP, CPI, unemployment, fed funds rate)
- Need clear "I can't find a data source for this" escape hatch → convert to judgment-based

### DP-5.3: Respond to Signal Trigger (Thesis Level)

| Field | Description |
|-------|-------------|
| **Decision Point** | Review Thesis After Signal Trigger |
| **Stage** | Signals |
| **Trigger** | Automatic: Any explicit signal triggers for a thesis → creates **thesis-level** triage record (not per-signal) |
| **Context Needed** | Thesis overview, ALL signals (with triggered ones highlighted), current conviction, linked strategies |
| **Available Actions** | (1) Assess impact: strengthens/weakens/no change, (2) Add reasoning notes (free text), (3) Update thesis conviction, (4) Update thesis status (validated/invalidated/under_review), (5) Monitor (snooze for N days), (6) Navigate to strategies to consider changes, (7) Close thesis if invalidated |
| **Downstream Effects** | Assessment recorded in journal/history. Conviction/status changes cascade to linked strategies. May trigger strategy-level triage. Monitor action defers re-surfacing. |
| **Complexity** | Medium - holistic thesis review, not just single trigger |
| **Current Location** | **DESIGN PHASE** - no automated trigger → triage flow exists |
| **Triage Suitable?** | Yes - thesis-level triage card with drill-down to signal details |
| **Recommended UX** | Single triage card per thesis (not per trigger). Shows thesis + summary of what fired. Expands to full signal list with triggered items highlighted. Capture decision + reasoning inline. |

**Triage Card Wireframe:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 URGENT    Thesis Signal Activity                            │
├─────────────────────────────────────────────────────────────┤
│ "US enters prolonged stagflation"                           │
│ Conviction: High | Direction: Bearish | Status: Active      │
│                                                             │
│ Signal Summary: 2 of 5 signals triggered             │
│                                                             │
│ ▼ View Signals                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✅ TRIGGERED: CPI > 4% for 2 quarters (5.2%)           │ │
│ │ ✅ TRIGGERED: GDP < 1% for 2 quarters (0.8%)           │ │
│ │ ⬜ Watching: Fed holds rates above 4%                   │ │
│ │ ⬜ Watching: Unemployment rises above 5%                │ │
│ │ ⬜ Not triggered: Consumer sentiment < 60               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ How does this affect your thesis?                           │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│ │ Strengthens  │ │ Weakens      │ │ No Change    │         │
│ └──────────────┘ └──────────────┘ └──────────────┘         │
│                                                             │
│ [Add your reasoning...]                                     │
│                                                             │
│ ┌─────────┐ ┌─────────┐ ┌──────────────────────┐           │
│ │ Confirm │ │ Monitor │ │ Update Thesis Status │           │
│ └─────────┘ └─────────┘ └──────────────────────┘           │
│                                                             │
│ ▼ Linked Strategies (3)                                     │
└─────────────────────────────────────────────────────────────┘
```

**Key Architectural Points:**
- One triage record per thesis, regardless of how many signals trigger
- Triage consolidates multiple triggers into single review
- User sees full signal picture, not isolated data points
- Decision captured at thesis level with reasoning

**Trigger Consolidation Logic:**
- First trigger on thesis → create triage record
- Subsequent triggers on same thesis → update existing triage record (don't create new)
- After user resolves triage → new triggers create fresh triage record
- Monitor (snooze) action defers re-surfacing for N days

### DP-5.4: AI-Assisted Judgment Update

| Field | Description |
|-------|-------------|
| **Decision Point** | Update Thesis/Signal Based on New Content |
| **Stage** | Signals |
| **Trigger** | User-initiated: User has consumed content (transcript, article, research) and wants to assess its impact on a thesis |
| **Context Needed** | Content source (transcript/article/link), thesis with all signals, current conviction levels |
| **Available Actions** | (1) Provide content to Claude for analysis, (2) Review Claude's recommended impact, (3) Accept/modify recommendations, (4) Record judgment on thesis conviction + signal status changes |
| **Downstream Effects** | Updates thesis conviction. Updates signal statuses. Creates evidence record with source link. Journal entry with reasoning. |
| **Complexity** | Medium - AI does heavy lifting, user confirms |
| **Current Location** | **PARTIAL** - `/assess-validation-evidence` skill exists but not integrated into app UI |
| **Triage Suitable?** | No - user-initiated workflow from thesis page or via skill |
| **Recommended UX** | "Assess New Evidence" button on thesis page. User provides content → Claude analyzes → presents recommendations → user confirms/adjusts → records. |

**AI-Assisted Assessment Flow:**

```
User has content to assess
(transcript, article, link)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Assess Evidence Against Thesis                              │
├─────────────────────────────────────────────────────────────┤
│ Thesis: "US enters prolonged stagflation"                   │
│                                                             │
│ Provide content for analysis:                               │
│ ○ Paste transcript                                          │
│ ○ Enter article URL                                         │
│ ○ Upload document                                           │
│                                                             │
│ [Transcript text area or URL input...]                      │
│                                                             │
│ [Cancel]                           [Analyze with Claude]    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ Claude analyzes content against thesis + signals
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Claude's Assessment                                         │
├─────────────────────────────────────────────────────────────┤
│ Source: "Fed Chair Powell testimony - Jan 2026"             │
│                                                             │
│ THESIS IMPACT:                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Recommendation: STRENGTHENS thesis                      │ │
│ │                                                         │ │
│ │ "Powell's comments about persistent inflation despite   │ │
│ │ slowing growth align directly with the stagflation      │ │
│ │ thesis. His reluctance to cut rates suggests the Fed    │ │
│ │ sees this dynamic continuing."                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ SIGNAL IMPACT:                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ "Fed holds rates above 4%"                            │ │
│ │   Status: not_triggered → monitoring                    │ │
│ │   "Powell signaled no near-term cuts planned"           │ │
│ │                                                         │ │
│ │ ─ "CPI remains elevated" (no change)                    │ │
│ │ ─ "GDP growth stalls" (no change)                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Your Judgment:                                              │
│ Thesis conviction: [Strengthens ▼] [Accept recommendation]  │
│                                                             │
│ signal updates:       [Accept all ▼] or adjust individually    │
│                                                             │
│ Additional notes: [Optional reasoning...]                   │
│                                                             │
│ [Back]                                   [Record Judgment]  │
└─────────────────────────────────────────────────────────────┘
```

**Key Workflow Principles:**

| Step | Actor | Action |
|------|-------|--------|
| 1. Provide content | User | Paste transcript, URL, or upload |
| 2. Analyze | Claude | Review against thesis + all signals |
| 3. Recommend | Claude | Suggest thesis impact + signal status changes |
| 4. Review | User | Evaluate recommendations |
| 5. Decide | User | Accept, modify, or reject recommendations |
| 6. Record | System | Persist judgment with evidence link |

**Implementation Note:**
> Uses existing headless Claude CLI pattern via `/api/skills/assess-validation-evidence`. Claude analyzes content, returns recommendations as JSON. User confirms in UI before changes are persisted. No additional API cost concerns - uses CLI execution.

**Design Considerations:**
- Claude's recommendations are suggestions, not automatic updates
- User always has final say on conviction changes
- Evidence source (transcript/link) persisted for audit trail
- Could batch multiple signal updates in single assessment

### DP-5.5: Upgrade Judgment to Explicit

| Field | Description |
|-------|-------------|
| **Decision Point** | Convert Judgment-Based Signal to Explicit |
| **Stage** | Signals |
| **Trigger** | User-initiated: User realizes a judgment-based signal can now be measured with available data |
| **Context Needed** | Current signal statement, available data sources, whether statement needs rewording for measurability |
| **Available Actions** | (1) Keep statement as-is, add data trigger, (2) Edit statement to be more measurable, then add trigger, (3) Cancel (keep as judgment) |
| **Downstream Effects** | signal category changes: `judgment` → `explicit`. Data trigger configuration created. Enables automated monitoring. |
| **Complexity** | Medium - reuses DP-5.2 configuration flow |
| **Current Location** | **DESIGN PHASE** - no upgrade path exists currently |
| **Triage Suitable?** | No - user-initiated edit action from thesis detail page |
| **Recommended UX** | "Convert to Explicit" button on judgment-based signals. Opens DP-5.2 configuration flow. May prompt statement edit first if needed. |

**Upgrade Flow:**

```
User viewing thesis detail page
         │
         ▼
Sees judgment-based signal:
"Market shows signs of risk-off sentiment"
Category: judgment | Status: monitoring
         │
         ▼
User realizes VIX data could measure this
         │
         ▼
Clicks "Convert to Explicit"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Convert to Explicit Trigger                                 │
├─────────────────────────────────────────────────────────────┤
│ Current statement:                                          │
│ "Market shows signs of risk-off sentiment"                  │
│                                                             │
│ ⚠️  This statement may need adjustment for measurability    │
│                                                             │
│ Suggested revision:                                         │
│ "VIX rises above 25 indicating risk-off sentiment"          │
│                                                             │
│ ○ Keep original statement                                   │
│ ● Use suggested revision                                    │
│ ○ Write custom statement                                    │
│                                                             │
│ [Cancel]                                      [Continue →]  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
DP-5.2 Configuration Flow (data source + criteria)
```

**When to Suggest Upgrade:**

| Scenario | Prompt |
|----------|--------|
| User repeatedly manually updates a judgment signal | "You've updated this 3 times. Could this be measured automatically?" |
| AI detects measurable language in judgment statement | "This mentions 'GDP' - would you like to link to FRED data?" |
| New data source becomes available | "TradingView integration now available - review your judgment signals?" |

**Design Considerations:**
- AI can assist by suggesting statement rewording for measurability
- Preserve history: log that this was upgraded from judgment
- Original manual status updates should remain in history
- If upgrade fails (no suitable data source), gracefully cancel back to judgment

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

## 8. Trade Journaling

> **Architecture Note:** This section was simplified from 6 decision points to 2. The original "reconciliation" model (matching trades to pre-created actions) is replaced with a simpler "metadata capture" model where trades are ingested and the user adds context directly to the trade record.

### Design Philosophy

**Current State (Complex):**
```
Trade ingested → QUANTITY_CHANGE triage → Reconciliation form → blotter_action created
```

**Proposed State (Simple):**
```
Trade ingested → Journal entry auto-created → Add metadata to trade → Done
```

The key insight: **trade metadata capture is compulsory but should be lightweight**. Users cannot dismiss a trade triage without providing at least minimal context.

### DP-8.1: Trade Metadata Capture

| Field | Description |
|-------|-------------|
| **Decision Point** | Add Context to Ingested Trade |
| **Stage** | Trade Journaling |
| **Trigger** | Automatic: new trade ingested from IBKR Flex |
| **Context Needed** | Trade details (symbol, quantity, price, date), strategy, current thesis/signals |
| **Available Actions** | (1) Select trade stage, (2) Enter trade reason, (3) Optionally link to signal |
| **Downstream Effects** | Trade record enriched; journal entry complete; enables analysis |
| **Complexity** | Quick - minimal required fields |
| **Current Location** | Triage queue, `QUANTITY_CHANGE` rule (but overly complex) |
| **Triage Suitable?** | Yes - compulsory inline form |
| **Recommended UX** | Compact triage card with required fields; cannot dismiss without completing |

**Required Fields (Minimum):**
- **Trade Stage**: open / close / roll / hedge / add / reduce / assignment
- **Trade Reason**: Brief narrative (can be short)

**Optional Fields (Enrichment):**
- **Signal Link**: "Was this trade triggered by a signal?"
- **Additional Notes**: Extended context

**Compulsory Completion:**
> Unlike other triage items, trade metadata capture cannot be dismissed. The user must provide at least stage + reason before the triage item resolves.

**UX Wireframe:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔔 NEW TRADE                                    AAPL        │
├─────────────────────────────────────────────────────────────┤
│ Sold 5 AAPL 180P 2026-02-21 @ $3.45                        │
│ Strategy: AAPL Income                                       │
│                                                             │
│ Stage*: [Close ▼]  ○ Open  ○ Roll  ○ Hedge  ○ Add          │
│                                                             │
│ Reason*: [Took profits at 50% max gain_________]           │
│                                                             │
│ ┌─ Signal Link (optional) ─────────────────────────────┐   │
│ │ ○ Not signal-related                                 │   │
│ │ ● Triggered by signal:                               │   │
│ │   [AAPL: Price target $185 reached ▼]                │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│                                            [Save Context]   │
└─────────────────────────────────────────────────────────────┘
* Required fields
```

**Implementation Notes:**
- Auto-suggest stage based on trade direction and position state
- Provide reason templates for common scenarios (profit target, defense, roll for time, etc.)
- Signal dropdown shows only signals for the relevant thesis
- Journal entry created automatically on trade ingestion; this form enriches it

### DP-8.2: Post-Trade Reflection (Optional)

| Field | Description |
|-------|-------------|
| **Decision Point** | Add Retrospective Notes |
| **Stage** | Trade Journaling |
| **Trigger** | User-initiated OR time-based prompt (e.g., 7 days after closed trade) |
| **Context Needed** | Trade details, original rationale, actual outcome, P&L |
| **Available Actions** | (1) Add reflection notes, (2) Rate decision quality, (3) Skip |
| **Downstream Effects** | Enriches journal for AI pattern analysis |
| **Complexity** | Medium - thoughtful narrative |
| **Current Location** | **DESIGN PHASE** - not implemented |
| **Triage Suitable?** | Partial - prompt in triage, editing in journal detail |
| **Recommended UX** | Low-priority triage prompt; journal detail page for editing |

**When to Prompt:**
- Position fully closed (all legs exited)
- Sufficient time passed for outcome clarity (7-14 days)
- Significant P&L (positive or negative)

**Reflection Fields:**
- **What worked?** (optional)
- **What didn't work?** (optional)
- **Would you do this again?** Yes / No / Modified
- **Decision quality**: Good decision / Bad decision / Lucky / Unlucky

**Design Considerations:**
- This is optional enrichment, not compulsory
- AI can prompt for reflection on trades with notable outcomes
- Reflection data feeds into pattern analysis ("you tend to exit winners too early")
- Keep it lightweight - users won't write essays

### Removed/Consolidated Decision Points

| Original DP | Disposition |
|-------------|-------------|
| DP-8.1 (Quantity Change) | → Consolidated into DP-8.1 (Trade Metadata Capture) |
| DP-8.2 (Trade Stage Selection) | → Field within DP-8.1 |
| DP-8.3 (Trade Reason Documentation) | → Field within DP-8.1 |
| DP-8.4 (Pre-Trade Action Creation) | → **LOW PRIORITY** - rare use case, keep as optional feature |
| DP-8.5 (Trade Matching Verification) | → **REMOVED** - automated, not a user decision |
| DP-8.6 (Post-Trade Reflection) | → Renumbered to DP-8.2 |

### Pre-Trade Action (Low Priority)

For completeness, users *can* create a trade action before execution:

```
User planning a trade
         │
         ▼
"Plan Trade" button (from position or strategy page)
         │
         ▼
Enter: stage, reason, expected details
         │
         ▼
Pending action created
         │
         ▼
Trade ingested from IBKR
         │
         ▼
Auto-matched to pending action (fills in execution details)
```

This is a **low priority** feature. Most users find it easier to execute first, document after. The pre-trade flow exists for users who want to document intent before action.

---

## 9. Pattern Analysis

> **Note:** This analysis reflects the consolidated decision point inventory after review. Original counts reduced through consolidation of related decision points.

### Decision Point Complexity Distribution

| Complexity | Count | Examples |
|------------|-------|----------|
| **Quick** | ~18 | Status changes, MONITOR/DISMISS, dropdown selections, trade metadata |
| **Medium** | ~12 | Signal configuration, entity linking, result review, AI-assisted judgment |
| **Deep** | ~4 | Research extraction, synthesis matching |

### Triage Suitability Summary

| Rating | Count | Pattern |
|--------|-------|---------|
| **Yes** | ~16 | Quantitative alerts, status toggles, compulsory metadata capture |
| **Partial** | ~10 | Decision prompt in triage, details elsewhere |
| **No** | ~8 | Forms, creation workflows, exploration |

### Decision Point Groupings (Revised)

**Group 1: Position Risk Alerts** (Highly Triage-Suitable)
- Consolidated DTE, ITM, Assignment Risk, Sigma into single "Position Risk Alert"
- Pattern: Multiple risk metrics → single triage item → MONITOR/DISMISS
- Key insight: These are hygiene alerts, not bullish/bearish conviction signals

**Group 2: Signal Triggers** (Triage-Suitable)
- Thesis-level triage when explicit signals trigger
- Pattern: Data threshold crossed → thesis review prompt → assess impact
- Replaces per-signal triage with thesis-level consolidation

**Group 3: Linking Operations** (Partially Triage-Suitable)
- Claim→thesis, asset→macro, strategy→thesis
- Pattern: Source entity needs link → suggestions → multi-select confirmation
- Note: DP-3.4 and DP-6.2 are same action from opposite directions

**Group 4: AI-Assisted Review** (Partially Triage-Suitable)
- Signal batch review, judgment updates, synthesis recommendations
- Pattern: AI recommends → user reviews → confirms/rejects
- Key pattern: Claude analyzes, user decides

**Group 5: Entity Creation** (Not Triage-Suitable)
- New thesis, new asset thesis, new signal configuration
- Pattern: Multi-field forms requiring dedicated UX
- Note: Signal configuration (DP-5.2) is form-based, not triage

**Group 6: Compulsory Documentation** (Triage-Suitable)
- Trade metadata capture (cannot dismiss without completing)
- Pattern: Compulsory fields + optional enrichment (signal link)
- Key insight: Lightweight but non-dismissable

### Key Architectural Patterns Identified

**Pattern A: Signals Framework**
- "Validation/Invalidation Points" renamed to "Signals" for clarity
- Green Signals = confirmation (thesis on track)
- Red Signals = warning (thesis undermined)
- Two categories: Judgment-based (manual) vs Explicit (data-triggered)
- Thesis-level triage, not per-signal triage

**Pattern B: AI-Assisted Judgment**
- Claude analyzes content against thesis + signals
- Recommends impact and status changes
- User always has final say
- Uses existing headless CLI pattern

**Pattern C: Compulsory vs Optional Triage**
- Most triage items: MONITOR/DISMISS/ACTION options
- Trade metadata: Cannot dismiss, must complete minimal fields
- Signal review: Cannot dismiss, must accept/reject

**Pattern D: Consolidation Over Fragmentation**
- Multiple related alerts → single triage item with detail
- Multiple sub-steps → single decision point with fields
- Reduces triage noise, improves signal-to-noise ratio

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
    triggeredSignals?: Signal[];  // Signals that triggered this triage

    // Position-specific (consolidated risk alert)
    riskAlerts?: {
      dte?: number;
      sigma?: number;
      itmStatus?: boolean;
      assignmentRisk?: boolean;
    };

    // Strategy-specific
    pctNav?: number;

    // Trade-specific
    tradeDetails?: TradeExecution;
    suggestedStage?: string;
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
- Group by: strategy (for positions), thesis (for signals), domain

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
| Strategy confirm | StrategyConfirmDialog | Strategy ID, thesis link |
| Signal trigger | ThesisReviewModal | Thesis ID, triggered signals |
| Trade metadata | TradeContextForm | Trade details, signal options |
| AI judgment | AssessEvidenceModal | Content, thesis, signals |
| Signal config | SignalConfigForm | Signal ID, data sources |
| Synthesis | Detail page | Thesis ID, claim mappings |

---

## 11. Journal Logging Requirements

> **Cross-Cutting Requirement**: Every decision point action MUST create a journal entry. The journal provides institutional memory for retrospective analysis and AI-powered process improvement.

### Design Principle (from PRD)

> "All triggers, triage outcomes, decisions, and actions are logged in a chronological journal. This institutional memory supports retrospective analysis of decision quality over time."

### Journal Entry Interface

All journal entries use the unified `logToJournal()` function with this interface:

```typescript
interface JournalEntry {
  // What object was affected
  objectType: string;      // 'macro_thesis' | 'asset_thesis' | 'strategy' | 'position' | 'claim' | 'signal'
  objectId: string;        // UUID of the affected object
  objectTitle?: string;    // Human-readable title for display

  // What action occurred
  actionType: string;      // Standardized action type (see table below)
  actionDescription: string; // Human-readable description

  // Context and linkage
  triageRecordId?: string; // If action originated from triage
  skillInvoked?: string;   // If action invoked a Claude skill (e.g., '/synthesize-thesis')

  // State change tracking
  previousState?: Record<string, unknown>;  // State before action
  newState?: Record<string, unknown>;       // State after action

  // User reasoning (critical for divergence analysis)
  rationale?: string;      // User's explanation for the decision

  // Provenance
  source: 'user' | 'skill' | 'automation';  // Who/what initiated the action

  // Additional context
  metadata?: Record<string, unknown>;
}
```

### Standard Action Types

| actionType | Description | Triggered By |
|------------|-------------|--------------|
| **Triage Actions** | | |
| `triage_detected` | System detected new trigger condition | Automation |
| `triage_escalated` | Severity increased (info → attention → urgent) | Automation |
| `triage_actioned` | User took action on triage item | User |
| `triage_dismissed` | User dismissed triage item | User |
| `triage_resolved` | Triage auto-resolved by downstream action | Automation |
| `triage_created` | New triage record created | Automation/Skill |
| **Lifecycle Actions** | | |
| `lifecycle_stage_changed` | Thesis moved to new lifecycle stage | Automation |
| `articulation_created` | Thesis articulation generated | Skill |
| `signal_status_changed` | Signal status updated (not_triggered → monitoring → triggered) | User/Automation |
| `signal_auto_triggered` | Data threshold breach auto-triggered signal | Automation |
| **Claim Actions** | | |
| `claim_converted` | Claim promoted to new thesis | User |
| `claim_linked` | Claim linked to existing thesis | User |
| **Trade Actions** | | |
| `trade_ingested` | New trade imported from broker | Automation |
| `trade_reconciled` | Trade matched to triage action | User/Automation |
| `triage_trade_action` | Trade action created from triage | User |
| **Strategy Actions** | | |
| `strategy_confirmed` | Strategy confirmed and linked to thesis | User |
| `strategy_linked` | Strategy linked to asset thesis | User |

### Decision Point to Journal Mapping

Every decision point should log to journal. Here's the mapping:

| Section | Decision Points | actionType(s) |
|---------|-----------------|---------------|
| **1. Research Ingestion** | DP-1.1 to DP-1.5 | `claim_extracted`, `audit_uploaded` |
| **2. Claim Management** | DP-2.4 to DP-2.8 | `claim_linked`, `claim_converted`, `claim_status_changed` |
| **3. Thesis Management** | DP-3.1 to DP-3.7 | `thesis_created`, `thesis_linked`, `thesis_status_changed`, `thesis_deleted` |
| **4. Thesis Lifecycle** | DP-4.1 to DP-4.5 | `triage_actioned`, `lifecycle_stage_changed`, `articulation_created` |
| **5. Signals** | DP-5.1 to DP-5.5 | `signal_reviewed`, `signal_configured`, `signal_status_changed`, `signal_auto_triggered` |
| **6. Strategy Management** | DP-6.1, DP-6.5, DP-6.6 | `strategy_confirmed`, `strategy_linked`, `triage_actioned` |
| **7. Position Management** | DP-7.1 | `triage_actioned`, `triage_dismissed` |
| **8. Trade Journaling** | DP-8.1, DP-8.2 | `trade_metadata_captured`, `trade_reflection_added` |

### Implementation Status

| Component | Status | File |
|-----------|--------|------|
| Journal table | ✅ | `src/db/schema.ts` (`journal_entries`) |
| `logToJournal()` utility | ✅ | `src/lib/workflow/lifecycleDetection.ts` |
| Thesis triage logging | ✅ | `src/app/api/thesis-triage/[id]/route.ts` |
| Strategy/position triage logging | ✅ | `src/app/api/triage/action/route.ts` |
| Trade ingestion logging | ✅ | `src/lib/derived/blotter.ts` |
| Claim conversion logging | ✅ | `src/app/api/research/convert-claim/route.ts` |
| Signal status logging | ✅ | `src/app/api/validation-points/[id]/route.ts` |
| Signal batch review logging | ❌ | **DESIGN PHASE** |
| Trade metadata capture logging | ❌ | **DESIGN PHASE** |

### Key Logging Principles

1. **Every user decision creates a journal entry** - No exceptions for triage actions, status changes, or entity modifications.

2. **Capture state changes** - Use `previousState` and `newState` to enable before/after comparison and divergence analysis.

3. **Capture rationale** - The `rationale` field is critical for understanding why decisions were made. Prompt users to provide reasoning for significant actions.

4. **Link to triage** - If an action originated from a triage item, include `triageRecordId` to enable triage-to-outcome analysis.

5. **Track source** - Distinguish between `user`, `skill` (Claude), and `automation` (system-triggered) actions for process analysis.

6. **Include skill context** - When Claude skills are invoked, record `skillInvoked` to track AI-assisted decisions.

### Journal Analysis Use Cases

The journal enables:

| Use Case | How Journal Supports It |
|----------|------------------------|
| **Decision quality retrospective** | Compare `previousState`/`newState` with subsequent outcomes |
| **Process adherence tracking** | Identify when users skip steps or dismiss without action |
| **AI recommendation acceptance rate** | Track when skill recommendations are accepted vs modified |
| **Triage-to-trade correlation** | Link triage actions to eventual trade outcomes via `triageRecordId` |
| **Signal effectiveness** | Track which signals led to conviction changes and subsequent trades |
| **Divergence detection** | Identify patterns where user rationale diverges from system suggestions |

### Reference Documentation

- **Implementation details**: `docs/features/260108-thesis-triage-flows.md` (Journal Integration section)
- **PRD requirements**: `docs/PRD_v1.1.md` Section 8 (Logging, Journal & Institutional Memory)
- **Schema definition**: `src/db/schema.ts` (`journalEntries` table)

---

## Appendix: Decision Point Index by Current Location

> **Note:** This index reflects the consolidated decision point structure after review. Some DPs have been merged or removed.

### Triage Queue (`/triage`)

**Thesis Lifecycle:**
- DP-4.1: NEEDS_RESEARCH
- DP-4.2: PRODUCE_CORE_ARGUMENT
- DP-4.3: UPDATE_CORE_ARGUMENT
- DP-4.4: REVIEW_CONTENT
- DP-4.5: REVIEW_DATA

**Signals (formerly V&I):**
- DP-5.1: REVIEW_RECOMMENDED_SIGNALS (post-synthesis batch review)
- DP-5.3: SIGNAL_TRIGGER_THESIS_REVIEW (thesis-level, when explicit signals fire)

**Strategy:**
- DP-6.1: CONFIRM_STRATEGY (confirm + link to thesis in single flow)
- DP-6.5: REVIEW_SIZE (low priority/legacy)
- DP-6.6: REVIEW_COMPLEXITY (low priority/legacy)

**Position Risk (Consolidated):**
- DP-7.1: POSITION_RISK_ALERT (combines DTE, ITM, Sigma, Assignment Risk)

**Trade Journaling:**
- DP-8.1: TRADE_METADATA_CAPTURE (compulsory, replaces QUANTITY_CHANGE)

### Claims Browser (`/claims`)
- DP-2.4: Status Change
- DP-2.5: Link to Entities
- DP-2.6: Relationship Type
- DP-2.8: Remove Link

### Thesis Pages (`/theses/[id]`, `/asset-theses/[id]`)
- DP-3.1: Create Macro Thesis
- DP-3.2: Create Asset Thesis
- DP-3.3: Link Asset to Macro
- DP-3.4: Link Asset to Strategy (= DP-6.2, same action opposite direction)
- DP-3.5: Update Status
- DP-3.6: Update Conviction
- DP-3.7: Delete Thesis
- DP-5.2: Configure Explicit Signal (signal configuration form)
- DP-5.4: AI-Assisted Judgment Update (Assess Evidence button)
- DP-5.5: Upgrade Judgment to Explicit (Convert to Explicit button)

### Claude Code Skills
- DP-1.1 through DP-1.5: Research Ingestion
- DP-2.1 through DP-2.3: Synthesis Matching

### Not Yet Implemented / Design Phase
- DP-5.1: Review Recommended Signals (needs `recommended` status, batch review UI)
- DP-5.2: Configure Explicit Signal (needs criteria builder UI, data source integration)
- DP-5.3: Signal Trigger Thesis Review (needs thesis-level triage consolidation)
- DP-5.4: AI-Assisted Judgment Update (skill exists, needs app UI integration)
- DP-5.5: Upgrade Judgment to Explicit (needs conversion flow)
- DP-8.2: Post-Trade Reflection (optional reflection prompts)

### Removed Decision Points
- DP-6.2, DP-6.3: Consolidated into DP-6.1 (Strategy Confirmation)
- DP-6.4: Strategy Entry Context - integrated into Asset Thesis Signals
- DP-6.7: State Code Change - merged into Signals framework
- DP-7.2, DP-7.3, DP-7.4: Consolidated into DP-7.1 (Position Risk Alert)
- DP-7.5, DP-7.6: Roll/Close - trade action types, not separate DPs
- DP-8.2-8.5: Consolidated into DP-8.1 (Trade Metadata Capture)

---

## Revision History

| Date | Changes |
|------|---------|
| 2026-01-09 | Initial draft with 54 decision points across 8 sections |
| 2026-01-12 | Section 5 rewrite: V&I → Signals framework, thesis-level triage, AI-assisted judgment |
| 2026-01-12 | Section 6 review: Consolidated DP-6.1/6.2/6.3, integrated with Signals, marked legacy features |
| 2026-01-12 | Section 7 review: Consolidated position alerts into single DP-7.1, removed Roll/Close as DPs |
| 2026-01-12 | Section 8 rewrite: "Reconciliation" → "Journaling", 6 DPs → 2 DPs, compulsory metadata capture |
| 2026-01-12 | Pattern Analysis updated to reflect consolidations and Signals framework |
| 2026-01-12 | Added Section 11: Journal Logging Requirements as cross-cutting concern |

---

*This inventory serves as the foundation for UX/UI redesign work. Next steps: Apply "Signals" terminology throughout codebase, implement consolidated triage views, build signal configuration UI, ensure all DPs log to journal.*
