# Thesis Triage: Implementation & End-to-End Flows

**Purpose**: Document the actual implementation of thesis triage, trace each triage type end-to-end, and identify gaps.

**Status**: Working document for completing triage integration
**Created**: 2026-01-08

---

## Design Principle

Each triage type has a **single, clear trigger** that creates or resolves triage records. Rather than background reconciliation, we ensure each trigger is robust and properly hooked into the system.

The complete flow for any triage record:

```
Trigger → Triage Record Created → UI Display → User Action → Resolution → Journal Entry
```

---

## Implemented Triage Types

### 1. NEEDS_RESEARCH

**Purpose**: Prompt user to gather more evidence for a thesis that lacks sufficient claims.

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | Thesis created with <3 claims |
| **Severity** | `info` |
| **Urgency** | `when_convenient` |
| **Lifecycle Stage** | `research` |
| **Suggested Skill** | `/process-transcript` |
| **Resolution** | Claim count reaches 3 (auto-transitions to PRODUCE_CORE_ARGUMENT) |

**End-to-End Flow:**

```
1. TRIGGER
   User converts claim to new thesis via ConvertClaimDialog
   └─► /api/research/convert-claim/route.ts (line 183)
       └─► computeThesisTriageForThesis()

2. TRIAGE RECORD CREATED
   └─► thesisTriage.ts creates record with:
       - triageRule: 'NEEDS_RESEARCH'
       - status: 'info'
       - actionRequired: "Thesis needs more research..."
       - suggestedSkill: '/process-transcript'

3. UI DISPLAY
   └─► /triage page → ThesisTriageSection.tsx
       - Shows in thesis triage inbox
       - Expandable detail with suggested skill
       - Copy button for skill command

4. USER ACTION
   └─► User has two paths:
       a) Run /process-transcript to add more claims
       b) Click "Dismiss" or "Actioned" button
   └─► /api/thesis-triage/[id] PATCH updates status

5. RESOLUTION
   └─► When user links 3rd claim:
       /api/research/link-claim-to-thesis
       └─► computeThesisTriageForThesis()
           └─► Resolves NEEDS_RESEARCH (sets completedAt, userNotes: 'Auto-resolved')
           └─► Creates PRODUCE_CORE_ARGUMENT

6. JOURNAL ENTRY ✅
   └─► logToJournal() called in:
       - createTriageRecord() - logs triage creation
       - resolveTriageRecord() - logs auto-resolution
       - /api/thesis-triage/[id] PATCH - logs user actions
```

**Gaps:** None - flow is complete

---

### 2. PRODUCE_CORE_ARGUMENT

**Purpose**: Prompt user to synthesize claims into a thesis articulation.

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | Thesis has ≥3 claims but no articulation |
| **Severity** | `attention` |
| **Urgency** | `this_week` |
| **Lifecycle Stage** | `synthesis` |
| **Suggested Skill** | `/synthesize-thesis` |
| **Resolution** | Articulation created via skill |

**End-to-End Flow:**

```
1. TRIGGER
   Either:
   a) Thesis created with ≥3 claims (from convert-claim)
   b) 3rd claim linked to existing thesis (from link-claim-to-thesis)
   └─► computeThesisTriageForThesis()

2. TRIAGE RECORD CREATED
   └─► thesisTriage.ts creates record with:
       - triageRule: 'PRODUCE_CORE_ARGUMENT'
       - status: 'attention'
       - actionRequired: "Thesis has X claims. Ready for synthesis."
       - suggestedSkill: '/synthesize-thesis'

3. UI DISPLAY
   └─► /triage page → ThesisTriageSection.tsx
       - Shows with amber/attention styling
       - Suggested skill: /synthesize-thesis

4. USER ACTION
   └─► User runs /synthesize-thesis skill
       └─► Skill creates thesis_articulations record
       └─► Skill calls onArticulationCreated()

5. RESOLUTION
   └─► onArticulationCreated() in thesisTriage.ts:
       - Resolves PRODUCE_CORE_ARGUMENT
       - Updates thesis.claimsCountAtLastArticulation
       - (Does NOT create next triage - V&I points created in same session)

6. JOURNAL ENTRY ✅
   └─► logToJournal() called in:
       - createTriageRecord() - logs triage creation
       - onArticulationCreated() - logs articulation event
       - resolveTriageRecord() - logs auto-resolution
```

**Gaps:** None - flow is complete

---

### 3. UPDATE_CORE_ARGUMENT

**Purpose**: Notify user that new claims are available since last articulation.

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | ≥3 new claims linked since last articulation |
| **Severity** | `info` |
| **Urgency** | `when_convenient` |
| **Lifecycle Stage** | `synthesis` |
| **Suggested Skill** | `/synthesize-thesis` |
| **Resolution** | New articulation created OR user dismisses |

**End-to-End Flow:**

```
1. TRIGGER
   User links claim to thesis that already has articulation
   └─► /api/research/link-claim-to-thesis
       └─► computeThesisTriageForThesis()
           └─► Checks: claimCount - claimsCountAtLastArticulation >= 3

2. TRIAGE RECORD CREATED
   └─► thesisTriage.ts creates record with:
       - triageRule: 'UPDATE_CORE_ARGUMENT'
       - status: 'info'
       - actionRequired: "X new claims since last synthesis..."

3. UI DISPLAY
   └─► Same as above

4. USER ACTION
   └─► User either:
       a) Runs /synthesize-thesis to regenerate
       b) Dismisses (decides current articulation is sufficient)

5. RESOLUTION
   └─► Either:
       a) onArticulationCreated() resolves record
       b) User clicks Dismiss → status = 'dismissed'

6. JOURNAL ENTRY ✅
   └─► Same integration as PRODUCE_CORE_ARGUMENT
```

**Gaps:** None - flow is complete

---

### 4. REVIEW_CONTENT (Monitoring)

**Purpose**: Surface news/content found by automated monitoring for user review.

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | Perplexity search finds relevant content |
| **Severity** | `attention` |
| **Urgency** | `this_week` |
| **Lifecycle Stage** | `monitoring` |
| **Suggested Skill** | `/assess-validation-evidence` |
| **Resolution** | User reviews and assesses content |

**End-to-End Flow:**

```
1. TRIGGER
   Cron job runs daily-thesis-monitoring.ts
   └─► Executes Perplexity searches for monitored theses
   └─► Filters for relevant results
   └─► Optionally runs Claude analysis (--analyze flag)

2. TRIAGE RECORD CREATED
   └─► Script directly inserts into thesis_triage_records:
       - triggerType: 'scheduled_monitoring'
       - triggerSource: 'daily_news_scan'
       - contentSummary: { searchQueries, resultCount, ... }
       - aiAnalysis: { summary, validationPointsAffected, ... }
       - matchedResults: [ { url, title, snippet, ... } ]

3. UI DISPLAY
   └─► ThesisTriageSection.tsx shows:
       - AI analysis summary (if --analyze was used)
       - Key findings
       - Matched results with links
       - Validation points affected

4. USER ACTION
   └─► User runs /assess-validation-evidence
       └─► Skill analyzes content against V&I points
       └─► Recommends status updates

5. RESOLUTION
   └─► User marks as actioned/dismissed
       └─► /api/thesis-triage/[id] PATCH

6. JOURNAL ENTRY
   └─► ⚠️ PARTIAL
       - User actions (actioned/dismissed) → ✅ logged via API route
       - Triage record creation by script → ❌ not logged (script bypasses thesisTriage.ts)
```

**Gaps:**
- [ ] Monitoring script creates records directly, bypassing journal logging
- [ ] No journal entry for V&I point status changes
- [ ] Monitoring script is not scheduled (manual runs only)
- [ ] /assess-validation-evidence skill needs V&I update integration

**Future Vision (User Note):** Perplexity search covers a lot of the use-cases for this Triage type but the vision is to add multiple additional sources that can be scheduled if they are identified as reliable and consistent sources of useful monitoring. For example, a recurring research report that should always be evaluated against live theses, or reliable transcripts like SEC filings.

---

### 5. REVIEW_DATA (Monitoring - Not Yet Implemented)

**Purpose**: Alert user when data thresholds are breached (FRED, price, IV).

| Aspect | Planned |
|--------|---------|
| **Trigger** | Threshold breach detected by monitoring script |
| **Severity** | `urgent` |
| **Suggested Skill** | `/assess-validation-evidence` |

**Status:** Threshold checking logic exists in daily-thesis-monitoring.ts but is not fully wired up.

User addition: this is also intended to be used multiple times for data sources that may be able to act as clear validation or invalidation points for different theses. Examples include market prices, FRED data, glass node, credit spreads, volatility measures etc. 

---

## Current State Summary

### Core Infrastructure (Complete ✅)

The unified journal system is fully operational. All decision events across all object types are captured for post-trade analysis.

| Component | Status | Notes |
|-----------|--------|-------|
| **Thesis Triage** | | |
| Triage record creation (lifecycle) | ✅ | Hooked into convert-claim, link-claim APIs |
| Triage record auto-resolution | ✅ | Works when conditions change |
| Triage UI display | ✅ | Filtering, expansion, suggested skills |
| User action buttons | ✅ | Actioned/Dismissed update status |
| **Strategy/Position Triage** | | |
| System triage detections | ✅ | ITM, SIGMA, DTE, SIZE, COMPLEXITY, STATE_CODE_CHANGE, QUANTITY_CHANGE |
| Triage escalation tracking | ✅ | Logs when severity increases (e.g., info → attention → urgent) |
| User triage actions | ✅ | Single and bulk actions logged |
| **Trade Flow** | | |
| Trade ingestion | ✅ | Broker executed trades logged |
| Trade-triage reconciliation | ✅ | Automatic matching of triage actions to ingested trades |
| **Research Provenance** | | |
| Claim conversion | ✅ | Logs when claim creates new thesis (2026-01-09) |
| Claim linkage | ✅ | Logs when claim linked to existing thesis (2026-01-09) |
| **Unified Journal** | | |
| All object types | ✅ | macro_thesis, asset_thesis, strategy, position all write to `journal_entries` |

### Feature Work Remaining

These are UI/UX enhancements (Phase 3+):

| Component | Status | Impact |
|-----------|--------|--------|
| ~~Monitoring cron schedule~~ | ✅ | Daily at 08:00 UTC with `--analyze` |
| ~~Monitoring script journal logging~~ | ✅ | All triage creation logged to journal |
| ~~V&I auto-triggering~~ | ✅ | Threshold breaches auto-update V&I status |
| ~~News Archive UI~~ | ✅ | Historical news visible on thesis detail page (Phase 3.1) |
| V&I status update UI | ❌ | Manual V&I updates from triage view (Phase 3.3) |
| `/assess-validation-evidence` integration | ❌ | Skill needs V&I update integration (Phase 4) |

---

## Integration Points

### Code Locations

| Component | File | Key Functions |
|-----------|------|---------------|
| **Thesis Triage** | | |
| Triage computation | `src/lib/derived/thesisTriage.ts` | `computeThesisTriageForThesis()`, `onArticulationCreated()`, calls `logToJournal()` |
| Thesis triage API | `src/app/api/thesis-triage/[id]/route.ts` | PATCH updates status + logs to journal |
| Convert claim | `src/app/api/research/convert-claim/route.ts` | Calls `computeThesisTriageForThesis()` |
| Link claim | `src/app/api/research/link-claim-to-thesis/route.ts` | Calls `computeThesisTriageForThesis()` |
| Monitoring script | `scripts/daily-thesis-monitoring.ts` | Creates monitoring triage records |
| **Strategy/Position Triage** | | |
| Strategy triage computation | `src/lib/derived/triage.ts` | `computePositionTriageForDate()`, `computeStrategyTriageForDate()`, `upsertTriageRecords()` logs new detections/escalations to journal |
| Strategy triage action API | `src/app/api/triage/action/route.ts` | Single action + logs to journal |
| Strategy triage bulk API | `src/app/api/triage/action/bulk/route.ts` | Bulk actions + logs to journal |
| **Research Provenance** | | |
| Claim conversion | `src/app/api/research/convert-claim/route.ts` | Creates thesis from claim + logs `claim_converted` to journal |
| Claim linking | `src/app/api/research/link-claim-to-thesis/route.ts` | Links claim to thesis + logs `claim_linked` to journal |
| **Trade Ingestion & Reconciliation** | | |
| Trade blotter creation | `src/lib/derived/blotter.ts` | `computeTradeBlotterEntriesForDate()` + logs to journal |
| Trade-triage matching | `src/lib/derived/blotter.ts` | `linkBlotterActions()` + logs reconciliation to journal |
| **Shared** | | |
| Journal logging utility | `src/lib/workflow/lifecycleDetection.ts` | `logToJournal()` shared utility |
| Triage UI (thesis) | `src/components/triage/ThesisTriageSection.tsx` | Display, filtering, actions |

### Database Tables

| Table | Purpose |
|-------|---------|
| `thesis_triage_records` | Stores thesis triage records (macro/asset theses) |
| `triage_records` | Stores strategy/position triage records |
| `journal_entries` | **Unified audit trail** for ALL triage actions across ALL object types |
| `blotter_actions` | Trade-level aggregations (strategy/position triage also writes here) |
| `thesis_articulations` | Triggers resolution of synthesis triage |
| `claim_thesis_mappings` | Triggers lifecycle triage on claim linking |
| `fred_series_metadata` | Reference data for FRED series (title, frequency, units, category) |
| `fred_observations` | Historical FRED time-series data with computed changes |
| `thesis_fred_indicators` | Links theses to FRED indicators with threshold configs |
| `fred_threshold_breaches` | Audit trail of FRED threshold breaches |

---

## Completed Work

### ~~Journal Integration~~ ✅ COMPLETE (2026-01-08)

Journal logging now integrated at all key points:
- ✅ **On thesis triage creation** - `createTriageRecord()` in thesisTriage.ts
- ✅ **On thesis triage user action** - PATCH handler in `/api/thesis-triage/[id]/route.ts`
- ✅ **On auto-resolution** - `resolveTriageRecord()` in thesisTriage.ts
- ✅ **On articulation creation** - `onArticulationCreated()` in thesisTriage.ts

### ~~Unified Journal~~ ✅ COMPLETE (2026-01-08)

Strategy/position triage now also logs to `journal_entries`:
- ✅ **Single triage action** - `/api/triage/action/route.ts` logs all action types
- ✅ **Bulk triage actions** - `/api/triage/action/bulk/route.ts` logs all bulk actions
- ✅ **Trade ingestion** - `src/lib/derived/blotter.ts` logs trade blotter creation (broker actions)
- ✅ **Trade reconciliation** - `linkBlotterActions()` logs when triage actions match ingested trades

All object types (macro_thesis, asset_thesis, strategy, position) now write to the same `journal_entries` table, enabling unified post-analysis across the entire decision hierarchy.

### ~~System Triage Detections~~ ✅ COMPLETE (2026-01-08)

System-detected triggers now logged to journal:
- ✅ **New detections** - `triage_detected` when system first identifies a trigger
- ✅ **Escalations** - `triage_escalated` when severity increases (e.g., info → attention → urgent)
- ✅ **All trigger types** - ITM, SIGMA, DTE, SIZE, COMPLEXITY, STATE_CODE_CHANGE, QUANTITY_CHANGE

### ~~Research Provenance~~ ✅ COMPLETE (2026-01-09)

Research-to-thesis linkages now logged:
- ✅ **Claim conversion** - `claim_converted` when claim creates new thesis
- ✅ **Claim linkage** - `claim_linked` when claim linked to existing thesis

---

## Journal Entry Types Reference

**Trade flow:**
- `trade_ingested` - Broker executed trade (from IBKR Flex ingestion)
- `triage_trade_action` - User TRADE action on triage (captures reason/stage metadata)
- `trade_reconciled` - Automatic matching of triage action to ingested trade

**System detections:**
- `triage_detected` - System detected a new trigger (ITM, SIGMA, DTE, SIZE, COMPLEXITY, STATE_CODE_CHANGE, QUANTITY_CHANGE)
- `triage_escalated` - Existing trigger escalated in severity (e.g., info → attention → urgent)

**Research provenance:**
- `claim_converted` - Claim converted to a new macro thesis or asset thesis
- `claim_linked` - Claim linked to an existing thesis (supports/refutes/foundation)

**Validation/Invalidation:**
- `vi_status_changed` - V&I point status changed (not_triggered → monitoring → triggered/superseded)
- `vi_auto_triggered` - V&I point auto-triggered by monitoring script threshold breach (Phase 2.4)

**Monitoring:**
- `monitoring_triage_created` - Automated monitoring created triage record (REVIEW_DATA or REVIEW_CONTENT)

---

## Next Steps (Feature Work)

### Design Principles for V&I Monitoring

**Explicit (Data-Driven) V&I Points:**
- Requirements must be strict enough for automated status updates
- Must specify: metric, threshold, operator, and data source
- Data source must be verified reliable (FRED, IBKR, Massive, etc.)
- Status auto-updates when threshold breached + journal logged
- Future: Can add more data sources (Glassnode, credit spreads, etc.)

**Judgment-Required V&I Points:**
- Less strict requirements (observable proxies helpful but not mandatory)
- Flow: Cron → Content scraped → Claude analyzes → Triage created with AI summary
- User reviews triage in app, sees AI analysis of impact on V&I points
- User confirms/changes V&I status based on evidence and judgment

---

### Implementation Phases

#### Phase 1: Core Infrastructure (Enables Everything Else)

**1.1 V&I Status Update API** ✅ COMPLETE (2026-01-09)
- [x] Create `PATCH /api/validation-points/[id]/route.ts`
- [x] Support status transitions: `not_triggered` → `monitoring` → `triggered` / `superseded`
- [x] Require `evidence` (source + summary) and `confidence` in request body
- [x] Call `logToJournal()` with `actionType: 'vi_status_changed'`
- [x] Return updated validation point + history record + journal entry ID
- [x] Support `source` param (`user` | `automation`) for Phase 2.4 auto-triggering

**1.2 Journal Integration for Monitoring Script** ✅ COMPLETE (2026-01-09)
- [x] Update `daily-thesis-monitoring.ts` to use `logToJournal()` when creating triage records
- [x] Log entry type: `monitoring_triage_created`
- [x] Include: thesis context, trigger source, matched results count
- [x] Added `logToJournal` helper to `scripts/lib/db.ts` for script-compatible journal logging

**1.3 Monitoring Cron Job** ✅ COMPLETE (2026-01-09)
- [x] Create `launchd/com.trade-journal.thesis-monitoring.plist`
- [x] Schedule: Daily at 22:00 UTC (after massive ingestion at 21:30)
- [x] Add to `launchd/install.sh`
- [x] Log output to `logs/thesis-monitoring.log`

---

#### Phase 2: Explicit Threshold Auto-Triggering

**2.1 Supported Data Sources Registry**

Define which sources support auto-triggering in `synthesize-thesis` skill:

| Source | Metric Types | Auto-Trigger | Notes |
|--------|--------------|--------------|-------|
| FRED | Fed funds, yields, CPI, unemployment, spreads | ✅ Yes | 34 series configured |
| IBKR/Massive | Spot price, IV30 | ✅ Yes | Daily via existing ingestion |
| Perplexity | News content | ❌ No | Judgment-required |
| Manual import | Any | ❌ No | Judgment-required |
| Glassnode | On-chain metrics | 🔜 Future | Add when needed |
| Custom APIs | Varies | 🔜 Future | Per-thesis configuration |

**2.2 Synthesize-Thesis Validation** ✅ COMPLETE (2026-01-09)
- [x] When user defines explicit V&I point, skill must ask for data source (Step 6.5)
- [x] Validate data source is in supported registry above (auto-trigger registry added)
- [x] If supported: Auto-create `thesis_monitoring_configs` entry with threshold + `linkedValidationPointId` (Step 7.5)
- [x] If not supported: Warn user "This metric requires manual monitoring until [source] is integrated"
- [x] Store data source in `validation_points.explicit_details.dataSource`

**2.3 Link Thresholds to V&I Points** ✅ COMPLETE (2026-01-09)
- [x] `thesis_monitoring_configs.explicit_thresholds[].linkedValidationPointId` already exists (in schema)
- [x] `synthesize-thesis` skill populates this when creating explicit V&I points (Step 7.5)
- [x] Query: When threshold breached, lookup linked V&I point → **implemented in 2.4**

**2.4 Auto-Update V&I Status on Breach** ✅ COMPLETE (2026-01-09)
- [x] In `daily-thesis-monitoring.ts` `createDataTriageRecord()`:
  - If `threshold.linkedValidationPointId` exists AND data source is reliable
  - Call `autoTriggerValidationPoint()` to change status to `triggered`
  - Log to journal: `vi_auto_triggered`
- [x] Still create triage record for user visibility

**2.5 Adding New Data Sources** 🔜 DEFERRED

When adding a new data source (e.g., Glassnode):
1. Implement data fetch in `daily-thesis-monitoring.ts`
2. Add to registry table in 2.1 above
3. Update `synthesize-thesis` skill to recognize new source
4. Existing V&I points using that source will auto-enable

*Deferred: Will add new data sources as thesis needs dictate.*

---

#### Phase 3: UI/UX Enhancements

**3.1 News Archive System** ✅
- [x] Create `thesis_news_items` table to store fetched news independently
  - Schema: `id`, `thesis_id`, `thesis_type`, `url` (unique per thesis), `title`, `snippet`, `source_domain`, `published_date`, `fetched_at`, `match_score`, `matched_keywords[]`, `query_type`, `triage_record_id` (nullable)
  - Migration: `migrations/create_thesis_news_items.sql`
  - Drizzle: `src/db/schema.ts` (thesisNewsItems table)
- [x] Update `daily-thesis-monitoring.ts` to persist news items
  - Added `persistNewsItems()` function with ON CONFLICT upsert
  - Links news items to triage records when analysis runs
- [x] Create `GET /api/theses/[id]/news` endpoint (macro theses)
- [x] Create `GET /api/asset-theses/[id]/news` endpoint (asset theses)
  - Query file: `src/db/queries/thesisNewsItems.ts`
  - Returns news items with optional triage record join
- [x] Build NewsArchive UI component for thesis detail page
  - Component: `src/components/asset-theses/NewsArchiveSection.tsx`
  - Shows news items with source, date, matched keywords
  - Displays triage severity/status badges when analysis exists
- [x] Add "News Archive" section to asset thesis detail page
  - Added to `AssetThesisDetailSections.tsx` as accordion section

**3.2 Enhance Triage Record Display** ✅
- [x] Thesis detail page: Section showing pending monitoring triage
  - Component: `src/components/asset-theses/TriageAlertSection.tsx`
  - Fetches via `/api/thesis-triage?thesisId=` with thesisId filter
  - Added to `AssetThesisDetailSections.tsx` as "Triage Alerts" accordion
- [x] Display `aiAnalysis.summary`, `keyFindings`, `validationPointsAffected`
  - Summary shown in expanded alert view
  - Key findings with bullet points and Lightbulb icon
  - Validation points affected with evidence type badges (strong/weak validation/invalidation)
  - Suggested next steps numbered list
- [x] Show matched articles with snippets and links
  - Up to 5 articles shown with external links
  - Snippet preview with line clamping
  - "N more articles" indicator when >5 results
- [x] Action buttons: "Confirm Read" / "Dismiss"
  - "Confirm Read" → PATCH status to `actioned`
  - "Dismiss" → PATCH status to `dismissed`
  - Loading state during action processing

**3.3 V&I Status Update UI** ✅
- [x] From triage view, allow user to select which V&I points to update
  - "Update V&I Status" button shown when `aiAnalysis.validationPointsAffected` exists
  - Opens `UpdateVIStatusDialog` modal
- [x] Pre-populate with Claude's recommendations from `aiAnalysis.validationPointsAffected`
  - Status pre-set based on evidence type (strong → triggered, weak → monitoring)
  - Confidence pre-populated from AI analysis
  - Notes pre-filled with recommended action
- [x] User provides reason/notes, confirms update
  - Can select/deselect individual points
  - Can modify status, confidence, notes per point
  - Evidence source auto-built from matched results
- [x] Calls V&I status update API (Phase 1.1)
  - PATCH `/api/validation-points/[id]` for each selected point
  - On success, triage record marked as 'actioned'
  - Journal entries created for each V&I status change

**3.4 Triage Resolution Flow** ✅
- [x] "Confirm Read" → Status changes to `actioned`, no V&I changes
  - Button in TriageAlertSection calls PATCH with status='actioned'
- [x] "Update V&I" → Opens V&I update dialog, then marks triage as `actioned`
  - Opens UpdateVIStatusDialog with pre-populated recommendations
  - On success, auto-marks triage as 'actioned' via handleVIUpdateSuccess
- [x] "Dismiss" → Status changes to `dismissed`, logs reason
  - Button in TriageAlertSection calls PATCH with status='dismissed'
  - User notes recorded for audit trail

---

#### Phase 4: Manual Content Assessment

**4.1 Implement `/assess-validation-evidence` Skill**
- [ ] Accept thesis identifier (ticker or ID) + content source (file/URL/text)
- [ ] Fetch all V&I points for thesis
- [ ] Analyze content against each V&I point using Claude
- [ ] Generate structured assessment with evidence categorization
- [ ] Output markdown report + create triage record

**4.2 Integration with Triage System**
- [ ] Skill creates `REVIEW_CONTENT` triage record with analysis
- [ ] Same UI flow as Phase 3 for user review and V&I updates

---

#### Phase 5: FRED Historical Data & Enhanced Thresholds

**5.1 FRED Historical Data Storage** ✅ (2026-01-10)
- [x] Create `fred_series_metadata` table for series reference data
  - Stores title, frequency, units, category, observation range
  - Auto-populated on first fetch, periodically updated
- [x] Create `fred_observations` table for historical time-series
  - Unique on (series_id, observation_date)
  - Computed change fields: 1d, 5d, 20d (absolute and percent)
  - Supports trend-based threshold calculations
- [x] Create `fred_threshold_breaches` audit table
  - Full audit trail of all threshold breaches
  - Snapshots threshold config at breach time
  - Links to triage records and V&I point changes

**5.2 Thesis-FRED Indicator Linkage** ✅ (2026-01-10)
- [x] Create `thesis_fred_indicators` table
  - Links theses to relevant FRED indicators with priority (1-5)
  - Stores relevance notes for context
  - Unique on (thesis_id, thesis_type, series_id)
- [x] Support multiple threshold types:
  - **Simple**: `operator` + `value` (existing pattern)
  - **Trend**: `trend_period_days` + `trend_change_threshold`
  - **Velocity**: `velocity_threshold`, `acceleration_threshold`
  - **Composite**: Multi-series conditions with AND/OR logic
- [x] Track breach state: `last_breach_at`, `consecutive_breach_days`
- [x] Link to V&I points: `linked_validation_point_id`, `auto_update_vi_status`

**5.3 Enhanced Threshold Logic**

New threshold types beyond simple comparisons:

| Type | Example | Configuration |
|------|---------|---------------|
| **Simple** | DGS10 > 5.0% | `operator: '>'`, `value: 5.0` |
| **Trend** | DGS10 up 50bps in 20 days | `trend_period_days: 20`, `trend_change_threshold: 0.5` |
| **Percent Trend** | DGS10 up 10% in 5 days | `trend_period_days: 5`, `trend_pct_change_threshold: 10` |
| **Velocity** | Rate of change accelerating | `velocity_threshold: 0.05` |
| **Composite** | T10Y2Y < 0 AND T10Y3M < 0 | `composite_config: { conditions: [...], logic: 'AND' }` |

**5.4 Auto-Discovery in Synthesize-Thesis** 🔜 IN PROGRESS
- [ ] Skill queries `fred_series_metadata` for available series
- [ ] When user defines V&I point with economic indicator, suggest matching FRED series
- [ ] Auto-populate `thesis_fred_indicators` based on thesis theme
- [ ] Reference: `docs/reference/fred-indicators-by-thesis.md`

**5.5 FRED Ingestion Script** 🔜 PENDING
- [ ] Create `scripts/ingest-fred-historical.ts`
- [ ] Backfill historical data for all configured series
- [ ] Compute change fields on insert
- [ ] Add to launchd schedule (weekly backfill, daily updates)

---

#### Phase 6: Future Data Source Expansion

**Potential additions (as thesis needs dictate):**
- [ ] Glassnode (Bitcoin on-chain metrics)
- [ ] Credit spread data (HY/IG spreads beyond FRED)
- [ ] Earnings transcript parsing
- [ ] SEC filing monitoring
- [ ] Custom API integrations per thesis

Each new source follows pattern:
1. Add to monitoring config schema
2. Implement data fetch in monitoring script
3. Add to "reliable sources" registry if appropriate for auto-triggering
4. Update `synthesize-thesis` to suggest as data source option

---

### Immediate Next Actions

#### Completed ✅

1. ~~**Phase 1.1**: Create V&I status update API with journal logging~~ ✅ (2026-01-09)
2. ~~**Phase 1.2**: Add journal logging to monitoring script~~ ✅ (2026-01-09)
3. ~~**Phase 1.3**: Create launchd cron job for monitoring~~ ✅ (2026-01-09)
4. ~~**Phase 2.2**: Synthesize-thesis skill asks for data source, validates, auto-creates monitoring config~~ ✅ (2026-01-09)
5. ~~**Phase 2.3**: Link thresholds to V&I points via `linkedValidationPointId`~~ ✅ (2026-01-09)
6. ~~**Phase 2.4**: Auto-update V&I status on breach (monitoring script auto-triggers V&I)~~ ✅ (2026-01-09)

**Phase 1-2 COMPLETE!** The core auto-triggering flow now works end-to-end:
- User creates explicit V&I points via `/synthesize-thesis` with supported data sources
- Monitoring config auto-created with thresholds linked to V&I points
- Daily monitoring script (08:00 UTC) checks thresholds + fetches news + runs Claude analysis
- On breach: triage record created + V&I status auto-updated to "triggered" + journal logged
- On relevant news: REVIEW_CONTENT triage created with AI analysis

#### ~~Phase 3 (UI/UX Enhancements)~~ ✅ COMPLETE

1. ~~**Phase 3.1**: News Archive System~~ ✅ - news items persisted, displayed on thesis detail page
2. ~~**Phase 3.2**: Enhance triage record display~~ ✅ - AI analysis, matched articles, action buttons on thesis detail page
3. ~~**Phase 3.3**: V&I status update UI~~ ✅ - UpdateVIStatusDialog with pre-populated recommendations from triage
4. ~~**Phase 3.4**: Triage resolution flow~~ ✅ - Confirm Read / Update V&I / Dismiss all functional

#### Up Next: Phase 5.4/5.5 (FRED Integration Completion)

1. **Phase 5.4**: Update `synthesize-thesis` skill for FRED auto-discovery
2. **Phase 5.5**: Implement FRED historical data ingestion script

#### Deferred

- **Phase 2.5**: Adding new data sources (Glassnode, etc.) - add as thesis needs dictate
- **Phase 4**: Manual content assessment via `/assess-validation-evidence` skill
- **Phase 6**: Future data source expansion

---

## Appendix: Triage Record Schema

```typescript
// From src/db/schema.ts
{
  id: uuid
  thesisId: uuid
  thesisType: 'macro' | 'asset'
  thesisTitle: string

  // Trigger context
  triggerType: 'lifecycle_transition' | 'scheduled_monitoring' | ...
  triggerSource: string
  triageRule: 'NEEDS_RESEARCH' | 'PRODUCE_CORE_ARGUMENT' | 'UPDATE_CORE_ARGUMENT' | ...

  // Classification
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  urgency: 'immediate' | 'today' | 'this_week' | 'when_convenient'
  status: 'pending' | 'in_review' | 'actioned' | 'dismissed'

  // Lifecycle context
  lifecycleStage: 'research' | 'synthesis' | 'monitoring' | ...
  suggestedSkill: string
  actionRequired: string

  // Monitoring content (JSONB)
  contentSummary: { searchQueries, resultCount, ... }
  aiAnalysis: { summary, validationPointsAffected, keyFindings, ... }
  matchedResults: [ { url, title, snippet, evidenceType, ... } ]

  // Resolution
  completedAt: timestamp
  completedBy: 'system' | 'user'
  userNotes: string
}
```
