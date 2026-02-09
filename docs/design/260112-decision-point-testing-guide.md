# Decision Point Inventory - Implementation Summary & Testing Guide

**Created**: 2026-01-12
**Source Implementation**: `docs/design/260112-decision-point-implementation-tracker.md`

---

## Part 1: What Changed (Technical Summary)

### Phase 0: UX Component Cleanup
| Change | Files Affected |
|--------|----------------|
| Deleted dead code `ConvertClaimDialog.tsx` | `src/components/research/` |
| Added DELETE capability to asset thesis editing | `EditAssetThesisDialog.tsx` |
| Created `SynthesizeButton` component | `src/components/thesis/SynthesizeButton.tsx` |
| Added synthesize button to thesis detail pages | `macro-theses/[id]/page.tsx`, `AssetThesisDetailSections.tsx` |

### Phase 1: Terminology & Schema Foundation
| Change | Files Affected |
|--------|----------------|
| Database table rename: `validation_points` → `signals` | Migration SQL, `schema.ts` |
| Database table rename: `validation_status_history` → `signal_status_history` | Migration SQL, `schema.ts` |
| Type enum change: `validation/invalidation` → `confirmation/warning` | Database, all signal-related code |
| New status: `recommended` added to signals | Database, `schema.ts` |
| URL routes: `/validation/[pointId]` → `/signals/[signalId]` | `macro-theses/[id]/signals/`, `asset-theses/[id]/signals/` |
| ~25 component files updated for new terminology | Components, queries, API routes |

### Phase 2: Signal Framework Core
| Change | Files Affected |
|--------|----------------|
| New triage rule: `REVIEW_RECOMMENDED_SIGNALS` | `thesisTriage.ts` |
| New triage rule: `SIGNAL_TRIGGERED` | `thesisTriage.ts` |
| New API: `/api/signals/batch-review` (GET + POST) | New route file |
| New API: `/api/signals/assess-impact` (POST) | New route file |
| New component: `SignalBatchReview.tsx` | `src/components/signals/` |
| New component: `SignalConfigForm.tsx` | `src/components/signals/` |
| New component: `ThesisSignalTriageCard.tsx` | `src/components/triage/` |
| Updated: `ExpandedTriageDetail.tsx` for signal triage | Integration with new card |

### Phase 3: AI Integration
| Change | Files Affected |
|--------|----------------|
| New API: `/api/skills/assess-validation-evidence` | New route file (Anthropic API) |
| New component: `AssessEvidenceModal.tsx` | `src/components/signals/` |
| New component: `SignalsSection.tsx` wrapper | `src/components/signals/` |
| "Make Explicit" button on judgment signals | `ValidationPointsList.tsx` |
| "Assess Evidence" button on thesis pages | Via `SignalsSection` wrapper |

### Phase 4: Triage Consolidation
| Change | Files Affected |
|--------|----------------|
| New component: `TradeMetadataForm.tsx` | `src/components/triage/` |
| Compulsory trade metadata capture | Integrated with `TriageActionButtons.tsx` |
| QUANTITY_CHANGE now requires stage + reason | `TriageActionButtons.tsx` |

### Phase 5: Journal Logging Completion
| Change | Files Affected |
|--------|----------------|
| Thesis CRUD logging | `/api/theses/route.ts`, `/api/theses/[id]/route.ts` |
| Asset thesis CRUD logging | `/api/asset-theses/route.ts`, `/api/asset-theses/[id]/route.ts` |
| Claim status change logging | `/api/research/claims/update-status/route.ts` |

---

## Part 2: User Experience Changes

### 2.1 Terminology Changes (Visible Throughout)
- **Old**: "Validation Points", "V&I Points", "Validation/Invalidation"
- **New**: "Signals", "Confirmation/Warning"
- Users will see "Signals" section on thesis detail pages
- Signal types now display as "Confirmation" (green) or "Warning" (red)

### 2.2 Thesis Detail Pages (New Features)

**Synthesize Button** (appears when thesis has ≥3 claims):
- Shows "Synthesize Articulation" button in thesis header area
- Copies the `/build-core-argument` skill command for execution
- Available on both macro thesis and asset thesis detail pages

**Signals Section Enhancements**:
- "Assess Evidence" button - opens AI-assisted evidence assessment modal
- "Make Explicit" button (⚡) on judgment-based signals - configure automatic triggers
- Signal status now includes "recommended" for AI-suggested signals

**Asset Thesis Edit Dialog**:
- Now has DELETE button (previously missing, matching macro thesis behavior)

### 2.3 Triage Queue (New Behaviors)

**New Triage Types**:
1. **REVIEW_RECOMMENDED_SIGNALS** - Appears after `/build-core-argument` creates recommended signals
2. **SIGNAL_TRIGGERED** - Appears when configured signals fire (thesis-level consolidation)

**Signal Batch Review** (for REVIEW_RECOMMENDED_SIGNALS):
- Expandable triage card shows all recommended signals
- Per-signal actions: Accept, Accept as Explicit (⚡), Reject
- Bulk actions: Accept All, Reject All
- "Accept as Explicit" opens configuration form for data triggers

**Signal Triggered Assessment** (for SIGNAL_TRIGGERED):
- Shows all triggered signals for a thesis in one card
- Assessment buttons: "Strengthens Thesis", "Weakens Thesis", "No Material Change"
- Optional conviction adjustment (increase/decrease)
- Resolves triage and resets signals to monitoring

**Trade Metadata Capture** (for QUANTITY_CHANGE):
- Compulsory form with no cancel button
- Required fields: Trade Stage, Trade Reason
- Must complete to resolve the triage item

### 2.4 Signal Configuration Form (New UI)

When accepting a signal as "explicit" or upgrading judgment to explicit:
- **Data Source Selection**: FRED Economic Data, IV Data, Price Feed
- **Metric Selection**: Dynamic based on data source
- **Criteria Builder**: Operator (>, <, crosses above/below) + Threshold
- **Duration**: Optional sustained period requirement
- **Check Frequency**: Daily, Weekly, Monthly

### 2.5 AI Evidence Assessment (New Workflow)

From thesis detail page "Assess Evidence" button:
1. Modal opens for content input (paste text, describe content)
2. AI analyzes content against thesis signals
3. Returns recommendations with evidence summaries
4. User can select/deselect recommendations
5. "Apply Selected" updates signal statuses

---

## Part 3: Exhaustive Test Scenarios

### 3.1 Phase 0 Tests: UX Cleanup

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 0.1 | Asset thesis DELETE | 1. Go to asset thesis detail page 2. Click Edit 3. Look for Delete button | Delete button visible and functional |
| 0.2 | Synthesize button visibility | 1. Find thesis with ≥3 linked claims 2. View detail page | "Synthesize" button visible |
| 0.3 | Synthesize button hidden | 1. Find thesis with <3 claims 2. View detail page | No synthesize button |
| 0.4 | Dead code removal | 1. Search codebase for ConvertClaimDialog imports | No imports found (file deleted) |

### 3.2 Phase 1 Tests: Terminology & Schema

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1.1 | Signals table exists | Run: `SELECT * FROM signals LIMIT 1;` | Returns data (table renamed) |
| 1.2 | Signal types correct | Run: `SELECT DISTINCT type FROM signals;` | Returns 'confirmation' and 'warning' |
| 1.3 | Signal URL routing | Navigate to `/macro-theses/[id]/signals/[signalId]` | Page loads correctly |
| 1.4 | Old validation URL | Navigate to `/macro-theses/[id]/validation/[pointId]` | 404 or redirect |
| 1.5 | UI terminology | View any thesis with signals | Shows "Signals" not "Validation Points" |
| 1.6 | Signal type display | View signal list on thesis | Shows "Confirmation"/"Warning" labels |

### 3.3 Phase 2 Tests: Signal Framework Core

#### 2.1 Batch Review Workflow

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 2.1.1 | Recommended signals triage | 1. Run `/build-core-argument` on a thesis 2. Check triage queue | REVIEW_RECOMMENDED_SIGNALS item appears |
| 2.1.2 | Expand batch review | Click expand on REVIEW_RECOMMENDED_SIGNALS triage | Shows SignalBatchReview component with signals |
| 2.1.3 | Accept single signal | Click "Accept" on one signal | Signal status → not_triggered, removed from list |
| 2.1.4 | Reject single signal | Click "Reject" on one signal | Signal deleted, removed from list |
| 2.1.5 | Accept as Explicit | Click ⚡ button on signal | Opens SignalConfigForm |
| 2.1.6 | Accept All | Click "Accept All" button | All signals → not_triggered, triage resolved |
| 2.1.7 | Reject All | Click "Reject All" button | All signals deleted, triage resolved |
| 2.1.8 | Triage auto-resolve | Process all recommended signals | Triage record status → complete |

#### 2.2 Signal Configuration

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 2.2.1 | FRED data source | Select "FRED Economic Data" | Shows FRED-specific metrics |
| 2.2.2 | IV data source | Select "IV Data" | Shows IV metrics, ticker field appears |
| 2.2.3 | Price data source | Select "Price Feed" | Shows price metrics, ticker field appears |
| 2.2.4 | Criteria builder | Set operator and threshold | Form validates correctly |
| 2.2.5 | Save explicit config | Complete form and save | Signal updated with explicitDetails JSON |
| 2.2.6 | Config persists | Reload page, view signal | Configuration displayed correctly |

#### 2.3 Signal Triggered Triage

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 2.3.1 | Manual trigger test | Update signal status to 'triggered' via API | SIGNAL_TRIGGERED triage appears |
| 2.3.2 | Thesis consolidation | Trigger multiple signals on same thesis | Single triage record (not per-signal) |
| 2.3.3 | ThesisSignalTriageCard | Expand SIGNAL_TRIGGERED triage | Shows all triggered signals for thesis |
| 2.3.4 | Strengthens assessment | Click "Strengthens Thesis" | Assessment recorded, signals → monitoring |
| 2.3.5 | Weakens assessment | Click "Weakens Thesis" | Assessment recorded, signals → monitoring |
| 2.3.6 | No change assessment | Click "No Material Change" | Assessment recorded, signals → monitoring |
| 2.3.7 | Conviction increase | Select "Increase" conviction option | Thesis confidence level increases |
| 2.3.8 | Conviction decrease | Select "Decrease" conviction option | Thesis confidence level decreases |
| 2.3.9 | Triage resolution | Complete assessment | Triage status → complete |

### 3.4 Phase 3 Tests: AI Integration

#### 3.1 Evidence Assessment

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 3.1.1 | Assess Evidence button | View thesis detail page with signals | "Assess Evidence" button visible |
| 3.1.2 | Open modal | Click "Assess Evidence" | AssessEvidenceModal opens |
| 3.1.3 | Submit content | Enter content, click Assess | Loading state, then recommendations appear |
| 3.1.4 | Recommendations display | After AI response | Shows signal updates with evidence summaries |
| 3.1.5 | Select/deselect | Click on recommendations | Checkboxes toggle |
| 3.1.6 | Apply selected | Click "Apply Selected" | Selected signals updated, modal closes |
| 3.1.7 | Cancel | Click Cancel or X | Modal closes, no changes |

#### 3.2 Upgrade to Explicit

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 3.2.1 | Make Explicit button | View judgment-based signal | ⚡ "Make Explicit" button visible |
| 3.2.2 | Opens config form | Click "Make Explicit" | SignalConfigForm dialog opens |
| 3.2.3 | Upgrade mode | Complete and save form | Signal category → explicit, config saved |
| 3.2.4 | Button hidden after | Reload, view same signal | "Make Explicit" button no longer visible |

### 3.5 Phase 4 Tests: Triage Consolidation

#### 4.1 Trade Metadata Capture

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 4.1.1 | QUANTITY_CHANGE form | Expand QUANTITY_CHANGE triage | TradeMetadataForm displayed |
| 4.1.2 | No cancel button | Look at form | Only "Complete" button, no cancel |
| 4.1.3 | Required fields | Try to submit empty | Validation errors for stage + reason |
| 4.1.4 | Trade stage options | Click stage dropdown | Shows: open, close, roll, hedge, add, reduce, assignment |
| 4.1.5 | Complete with data | Fill stage + reason, submit | Triage resolved, blotter action created |
| 4.1.6 | Blotter record | Check blotter_actions | Contains tradeStage and tradeReason |

### 3.6 Phase 5 Tests: Journal Logging

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 5.1.1 | Thesis created log | Create new macro thesis | Journal entry with THESIS_CREATED |
| 5.1.2 | Thesis updated log | Edit macro thesis | Journal entry with THESIS_UPDATED |
| 5.1.3 | Thesis deleted log | Delete macro thesis | Journal entry with THESIS_DELETED |
| 5.1.4 | Asset thesis created | Create new asset thesis | Journal entry with THESIS_CREATED |
| 5.1.5 | Asset thesis updated | Edit asset thesis | Journal entry with THESIS_UPDATED |
| 5.1.6 | Asset thesis deleted | Delete asset thesis | Journal entry with THESIS_DELETED |
| 5.1.7 | Claim status log | Change claim status in browser | Journal entry with CLAIM_STATUS_CHANGED |
| 5.1.8 | Verify all types | Query: `SELECT action_type, COUNT(*) FROM journal_entries GROUP BY action_type` | All expected types present |

### 3.7 Integration Tests (End-to-End Workflows)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| E2E-1 | Full synthesis workflow | 1. Create thesis with 3+ claims 2. Click Synthesize 3. Run skill 4. Review recommended signals in triage 5. Accept some, reject others | Thesis has new articulation + signals |
| E2E-2 | Signal trigger → assessment | 1. Configure explicit signal 2. Manually trigger it 3. Assess impact in triage 4. Adjust conviction | Full audit trail in journal |
| E2E-3 | AI evidence assessment | 1. Have thesis with signals 2. Click Assess Evidence 3. Paste relevant content 4. Apply recommendations | Signal statuses updated with evidence |
| E2E-4 | Trade journaling | 1. Ingest trade that causes QUANTITY_CHANGE 2. Complete metadata form 3. Check blotter | Trade has stage + reason metadata |
| E2E-5 | Asset thesis lifecycle | 1. Create asset thesis 2. Edit it 3. Delete it 4. Check journal | All 3 operations logged |

---

## Part 4: Database Verification Queries

```sql
-- Verify signals table renamed
SELECT COUNT(*) FROM signals;

-- Verify signal types migrated
SELECT type, COUNT(*) FROM signals GROUP BY type;
-- Expected: 'confirmation' and 'warning'

-- Verify new status exists
SELECT status, COUNT(*) FROM signals GROUP BY status;
-- Should include 'recommended' if any exist

-- Verify signal_status_history table
SELECT COUNT(*) FROM signal_status_history;

-- Verify journal action types
SELECT action_type, COUNT(*)
FROM journal_entries
GROUP BY action_type
ORDER BY count DESC;

-- Check for recommended signals (after synthesis)
SELECT id, statement, status FROM signals WHERE status = 'recommended';

-- Check thesis triage records
SELECT thesis_id, thesis_type, triage_rule, status
FROM thesis_triage_records
WHERE triage_rule IN ('REVIEW_RECOMMENDED_SIGNALS', 'SIGNAL_TRIGGERED');
```

---

## Part 5: Quick Smoke Test Checklist

For rapid verification that nothing is broken:

- [ ] App loads without errors (`npm run dev`)
- [ ] Build succeeds (`npm run build`)
- [ ] Macro thesis list page loads
- [ ] Asset thesis list page loads
- [ ] Triage queue loads
- [ ] Can view a thesis detail page
- [ ] Signals section displays on thesis page
- [ ] Can expand a triage item
- [ ] Can click MONITOR on a triage item
- [ ] Can create a new thesis
- [ ] Can edit a thesis
- [ ] Journal entries page loads

---

## Notes

- Some UI component files retain legacy names (e.g., `ValidationPointsList.tsx`) but use new terminology internally
- The old `/validation/` URL routes no longer exist - all signal URLs use `/signals/`
- Phase 4.1 position risk consolidation UI enhancements were deferred (DB-level consolidation complete)
- Documentation updates for "validation points" → "signals" were deferred
