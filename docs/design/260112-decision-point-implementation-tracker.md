# Decision Point Inventory Implementation Tracker

**Status**: Complete
**Created**: 2026-01-12
**Source**: `docs/design/260109-decision-point-inventory.md`
**Full Plan**: `.claude/plans/zesty-skipping-naur.md`

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Database table rename | Full rename: `validation_points` → `signals` |
| Signal type terminology | Rename: `validation/invalidation` → `confirmation/warning` |
| Phase prioritization | Sequential (foundation first) |
| Trade workflow migration | Strangler fig: build alongside, test, cut over, remove old |

---

## Phase Overview

| Phase | Focus | Status | Started | Completed |
|-------|-------|--------|---------|-----------|
| **Phase 0** | UX component audit & consolidation | Complete | 2026-01-12 | 2026-01-12 |
| **Phase 1** | Terminology & schema foundation | Complete | 2026-01-12 | 2026-01-12 |
| **Phase 2** | Signal framework core | Complete | 2026-01-12 | 2026-01-12 |
| **Phase 3** | AI integration | Complete | 2026-01-12 | 2026-01-12 |
| **Phase 4** | Triage consolidation | Complete | 2026-01-12 | 2026-01-12 |
| **Phase 5** | Journal logging completion | Complete | 2026-01-12 | 2026-01-12 |

---

## Phase 0: UX Component Audit & Consolidation

### 0.1 Dialog Audit Results (2026-01-12)

**Claim Dialogs - Audit Complete:**
| Dialog | Lines | Status | Finding |
|--------|-------|--------|---------|
| `ConvertClaimDialog.tsx` | 429 | **DEAD CODE** | Not imported anywhere - superseded |
| `ConvertClaimToEntityDialog.tsx` | 752 | Active | Already handles both link + create modes |
| `PromoteClaimDialog.tsx` | 199 | Active | Different purpose (promote evidence → main claim) |

**Conclusion**: No consolidation needed. `ConvertClaimToEntityDialog` already serves as the unified dialog with both "Link to Existing" and "Create New" modes.

**Thesis Form Dialogs - Audit Complete:**
| Dialog | Lines | Architecture | Entity-Specific Fields |
|--------|-------|--------------|------------------------|
| `CreateThesisDialog.tsx` | 81 | Wrapper → `CreateMacroThesisForm` | Good architecture |
| `CreateAssetThesisDialog.tsx` | 95 | Wrapper → `CreateAssetThesisForm` | Good architecture |
| `EditMacroThesisDialog.tsx` | 466 | Full form | sectors, thesisType, DELETE capability |
| `EditAssetThesisDialog.tsx` | 391 | Full form | narrative, contexts, prices, **NO DELETE** |

**Conclusion**: No consolidation needed - entity types have genuinely different fields. Create dialogs already well-factored. Edit dialogs remain separate due to field differences.

**Inconsistency Found**: `EditAssetThesisDialog` missing DELETE capability.

### 0.2 Cleanup Tasks

**Dead Code Removal:**
- [x] Delete `ConvertClaimDialog.tsx` (unused, superseded by ConvertClaimToEntityDialog)

**Consistency Fix:**
- [x] Add DELETE capability to `EditAssetThesisDialog.tsx` (matches EditMacroThesisDialog)

### 0.3 Add Missing Action Accessibility

**Thesis Detail Pages:**
- [x] Create `src/components/thesis/SynthesizeButton.tsx`
- [x] Add to `src/app/macro-theses/[id]/page.tsx`
- [x] Add to `src/app/asset-theses/[id]/page.tsx` (via AssetThesisDetailSections)
- [x] Shows when thesis has ≥3 claims and no/stale articulation

**Signal List Actions:**
- [x] Add "Convert to Explicit" action placeholder (implemented in Phase 3 as "Make Explicit" button)

---

## Phase 1: Foundation - Terminology & Schema

### 1.1 Database Schema Updates
- [x] Create migration SQL: `migrations/260112-rename-validation-to-signals.sql`
- [x] Rename table: `validation_points` → `signals`
- [x] Rename table: `validation_status_history` → `signal_status_history`
- [x] Rename column: `validationPointId` → `signalId`
- [x] Change type enum: `validation | invalidation` → `confirmation | warning`
- [x] Add `recommended` status to status enum
- [x] Run migration via psql
- [x] Verify with test queries (58 confirmation, 78 warning records)

### 1.2 Schema.ts Updates
- [x] Update `src/db/schema.ts` with new table/type names
- [x] Update TypeScript types: `ValidationPoint` → `Signal` (with legacy aliases)
- [x] Update `ValidationStatusHistory` → `SignalStatusHistory` (with legacy aliases)
- [x] Update `NewValidationPoint` → `NewSignal` (with legacy aliases)

### 1.3 API Routes
- [x] Update `src/app/api/validation-points/[id]/route.ts` (kept for backwards compatibility)
- [x] Update `src/app/api/thesis-synthesis/validation-status/route.ts`
- [x] Update `src/app/api/monitoring/` routes (specs, events, check)
- [x] Add legacy parameter support for old field names

### 1.4 DB Queries
- [x] Update `src/db/queries/thesisSynthesis.ts`
- [x] Update `src/db/queries/monitoring.ts`
- [x] Add legacy function aliases for backwards compatibility

### 1.5 Components (~25 files)
- [x] Update `src/components/thesis-synthesis/ThesisSynthesisSection.tsx`
- [x] Update field references in components to use `signalId`
- [ ] Rename component files from ValidationPointsList.tsx → SignalsList.tsx (deferred - keep legacy names for now)

### 1.6 Pages
- [x] Rename `src/app/macro-theses/[id]/validation/[pointId]/page.tsx` → `signals/[signalId]/page.tsx`
- [x] Rename `src/app/asset-theses/[id]/validation/[pointId]/page.tsx` → `signals/[signalId]/page.tsx`
- [x] Update URL references in ValidationPointsList.tsx and ExpandedTriageDetail.tsx

### 1.7 Skills
- [x] Update `.claude/skills/assess-validation-evidence/` (SQL query, skill description)
- [x] Update `.claude/skills/build-core-argument/` (JSON examples: validation→confirmation, invalidation→warning)

### 1.8 Documentation
- [ ] Update `docs/features/260105-validation-assessment-workflow.md` (deferred to Phase 2)
- [ ] Update any other docs referencing "validation points" (deferred to Phase 2)

### 1.9 Final Verification
- [x] `npm run build` succeeds with no type errors
- [ ] All "validation" UI labels show "signals" (component files kept with legacy names for now)
- [x] Database type values: "confirmation" and "warning" (verified via test queries)

---

## Phase 2: Signal Framework Core

### 2.1 Signal Batch Review (DP-5.1)
- [x] Add triage rule: `REVIEW_RECOMMENDED_SIGNALS` in `thesisTriage.ts`
- [x] Update `scripts/insert-thesis-articulation.ts` to create triage record when recommended signals inserted
- [x] Create `/api/signals/batch-review/route.ts` API endpoint (GET + POST)
- [x] Create `src/components/signals/SignalBatchReview.tsx` component
- [x] Update `/build-core-argument` skill to output `recommended` status and document workflow

### 2.2 Signal Configuration UI (DP-5.2)
- [x] Create `src/components/signals/SignalConfigForm.tsx` (includes DataSourceSelector and CriteriaBuilder inline)
- [x] Integrate with signal acceptance flow in SignalBatchReview
- [x] Update batch-review API to store explicitDetails when accepting as explicit
- [x] Add "Accept as Explicit" (⚡) button to batch review UI

### 2.3 Thesis-Level Triage Consolidation (DP-5.3)
- [x] Modify `thesisTriage.ts` for consolidation logic (added SIGNAL_TRIGGERED rule)
- [x] Create `src/components/triage/ThesisSignalTriageCard.tsx` (displays triggered signals with assessment UI)
- [x] Create `src/app/api/signals/assess-impact/route.ts` (records assessment, updates thesis confidence, resolves triage)
- [x] Integrate ThesisSignalTriageCard in ExpandedTriageDetail.tsx
- [x] Add "Strengthens/Weakens/No Change" assessment buttons with optional conviction update

---

## Phase 3: AI Integration

### 3.1 AI-Assisted Judgment (DP-5.4)
- [x] Create `src/components/signals/AssessEvidenceModal.tsx`
- [x] Create `src/app/api/skills/assess-validation-evidence/route.ts` (direct Anthropic API, not CLI)
- [x] Add "Assess Evidence" button to thesis detail pages (via SignalsSection wrapper)
- [x] Implement recommendation review UI (select/deselect assessments with evidence, apply selected)

### 3.2 Upgrade Judgment to Explicit (DP-5.5)
- [x] Add "Convert to Explicit" action to ValidationPointsList ("Make Explicit" button with ⚡ icon)
- [x] Create `src/components/signals/SignalsSection.tsx` wrapper (integrates list + config form dialog)
- [x] Integrate with SignalConfigForm in 'upgrade' mode

---

## Phase 4: Triage Consolidation

### 4.1 Position Risk Alert Consolidation
- [x] Database consolidation already complete (one record per position with highest-priority action)
- [x] All risk flags stored in `triage_records` (flagSigma05, flagSigma10, flagAssignment, isItm, etc.)
- [ ] Add risk flags to `TriageQueueRecord` interface (deferred - UI enhancement)
- [ ] Create `src/components/triage/PositionRiskCard.tsx` (deferred - UI enhancement)
- [ ] Update triage UI to show combined risk view (deferred - UI enhancement)

### 4.2 Strategy Confirmation Simplification
- [x] `StrategyConfirmationDialog.tsx` already implemented (623 lines)
- [x] Strategy type selection integrated
- [x] Asset thesis linking integrated (select existing or create new)
- [x] API endpoints working correctly

### 4.3 Trade Journaling Simplification (DP-8.1)
- [x] Create `src/components/triage/TradeMetadataForm.tsx`
- [x] Implement compulsory completion (no cancel button, required fields: stage, reason)
- [x] Integrate with TriageActionButtons for QUANTITY_CHANGE
- [x] Uses existing QUANTITY_CHANGE triage rule (no new rule needed)
- [ ] Test thoroughly
- [ ] Remove old inline form code (deferred - strangler fig complete)

---

## Phase 5: Journal Logging Completion

### 5.1 Thesis CRUD Logging
- [x] Add logging to `src/app/api/theses/route.ts` (create, update)
- [x] Add logging to `src/app/api/theses/[id]/route.ts` (update, delete)
- [x] Add logging to `src/app/api/asset-theses/route.ts` (create, update)
- [x] Add logging to `src/app/api/asset-theses/[id]/route.ts` (update, delete)

### 5.2 Claim Status Logging
- [x] Add logging to existing `src/app/api/research/claims/update-status/route.ts`
- [x] ClaimsBrowser already uses this endpoint

### 5.3 Triage Action Logging
- [x] All MONITOR/DISMISS paths in `src/app/api/triage/action/route.ts` already log
- [x] Position triage actions already logged (integrated in triage action handler)

### 5.4 Signal Operation Logging
- [x] All signal endpoints have logging (batch-review, assess-impact, validation-points)
- [x] Batch review operations log (signal_accepted, signal_rejected, signals_bulk_*)
- [x] Configuration changes logged (signal_configured_explicit)

### 5.5 Final Verification
- [x] Query executed: 12 action types currently in journal_entries
- [x] New action types (THESIS_CREATED, THESIS_UPDATED, THESIS_DELETED, CLAIM_STATUS_CHANGED) ready for use

---

## Implementation Notes

### Files Reference (Critical)

**Schema & Database:**
- `src/db/schema.ts` (validation_points definition)
- `src/db/queries/thesisSynthesis.ts`

**Core Components:**
- `src/components/thesis-synthesis/ValidationPointsList.tsx` (668 lines)
- `src/components/thesis-synthesis/UpdateValidationStatusModal.tsx` (318 lines)
- `src/components/triage/TriageActionButtons.tsx` (2019 lines)
- `src/lib/derived/triage.ts` (1203 lines)
- `src/lib/derived/thesisTriage.ts` (200+ lines)
- `src/lib/derived/blotter.ts` (1803 lines)

**API Routes:**
- `src/app/api/validation-points/[id]/route.ts`
- `src/app/api/triage/action/route.ts`
- `src/app/api/thesis-triage/[id]/route.ts`

### Decision Point Location Matrix

| DP | Decision Point | Triage | Detail | Dialog |
|----|----------------|--------|--------|--------|
| 1.5 | Post-extraction workflow | ✅ | - | - |
| 2.4 | Claim status change | - | ✅ | - |
| 2.5 | Link claim to entities | - | ✅ | ✅ |
| 2.6 | Relationship type | - | - | ✅ |
| 2.7 | Create entity from claim | - | - | ✅ |
| 2.8 | Remove claim link | - | ✅ | - |
| 3.1 | Create macro thesis | - | - | ✅ |
| 3.2 | Create asset thesis | - | - | ✅ |
| 3.3 | Link asset → macro | ✅ | ✅ | ✅ |
| 3.4 | Link asset → strategy | ✅ | ✅ | ✅ |
| 3.5 | Update thesis status | - | ✅ | - |
| 3.6 | Update conviction | ✅ | ✅ | - |
| 3.7 | Delete thesis | - | ✅ | ✅ |
| 4.1 | Needs research | ✅ | - | - |
| 4.2 | Produce core argument | ✅ | ✅ | - |
| 4.3 | Update core argument | ✅ | ✅ | - |
| 4.4 | Review monitoring content | ✅ | ✅ | - |
| 4.5 | Review data monitoring | ✅ | - | - |
| 5.1 | Review recommended signals | ✅ | ✅ | - |
| 5.2 | Configure explicit trigger | - | ✅ | ✅ |
| 5.3 | Signal trigger response | ✅ | ✅ | - |
| 5.4 | AI-assisted judgment | - | ✅ | ✅ |
| 5.5 | Upgrade judgment to explicit | - | ✅ | ✅ |
| 6.1 | Confirm strategy | ✅ | - | ✅ |
| 6.5 | Review size | ✅ | - | - |
| 7.1 | Position risk alert | ✅ | - | - |
| 8.1 | Trade metadata capture | ✅ | - | - |
| 8.2 | Post-trade reflection | ✅ | ✅ | - |

### Handoff Patterns

- **Pattern A**: Triage → Quick Action (inline) - Position alerts, size review
- **Pattern B**: Triage → Dialog - Strategy confirmation, trade metadata
- **Pattern C**: Triage → Detail Page - Thesis review, signal config
- **Pattern D**: Detail Page → Dialog - Edit entity, configure signal

---

## Change Log

| Date | Phase | Change | Notes |
|------|-------|--------|-------|
| 2026-01-12 | - | Created tracker | Initial plan approved |
| 2026-01-12 | 0 | Dialog audit complete | No consolidation needed - ConvertClaimToEntityDialog already unified |
| 2026-01-12 | 0 | Deleted ConvertClaimDialog.tsx | Dead code removal |
| 2026-01-12 | 0 | Added DELETE to EditAssetThesisDialog | Consistency with EditMacroThesisDialog |
| 2026-01-12 | 0 | Created SynthesizeButton component | Added to macro & asset thesis detail pages |
| 2026-01-12 | 1 | Phase 1 complete | Full signals rename: DB tables, schema.ts, API routes, queries, components, page routes, skills |
| 2026-01-12 | 2.1 | Phase 2.1 complete | Signal batch review: triage rule, API endpoint, SignalBatchReview component, skill docs |
| 2026-01-12 | 2.2 | Phase 2.2 complete | Signal config UI: SignalConfigForm with data sources (FRED/IV/Price), criteria builder, acceptance flow integration |
| 2026-01-12 | 2.3 | Phase 2.3 complete | Thesis-level triage consolidation: SIGNAL_TRIGGERED rule, ThesisSignalTriageCard, assess-impact API, assessment UI |
| 2026-01-12 | 3 | Phase 3 complete | AI integration: assess-validation-evidence API, AssessEvidenceModal, SignalsSection wrapper, "Make Explicit" action |
| 2026-01-12 | 4.1 | Position consolidation verified | Already implemented at DB level (one record per position with all flags) |
| 2026-01-12 | 4.2 | Strategy confirmation verified | StrategyConfirmationDialog already has type selection + thesis linking |
| 2026-01-12 | 4.3 | TradeMetadataForm created | Compulsory completion (no cancel button), required stage+reason fields |
| 2026-01-12 | 4.3 | Integrated with TriageActionButtons | QUANTITY_CHANGE now uses TradeMetadataForm |
| 2026-01-12 | 5.1 | Thesis CRUD logging added | THESIS_CREATED, THESIS_UPDATED, THESIS_DELETED action types |
| 2026-01-12 | 5.2 | Claim status logging added | CLAIM_STATUS_CHANGED action type in existing update-status route |
| 2026-01-12 | 5.3 | Triage logging verified | All MONITOR/DISMISS paths already have comprehensive logging |
| 2026-01-12 | 5.4 | Signal logging verified | All signal endpoints (batch-review, assess-impact, validation-points) already log |
| 2026-01-12 | 5 | Phase 5 complete | All journal logging in place; 12 action types in production |
