# Entity Status Standardization

> Reference document for #ENH-048: Standardize entity lifecycle status values across the codebase.

## Overview

This document captures the design decisions from our discussion about unifying the `status` field across all key entities in the system. The goal is to have a consistent, predictable lifecycle model that applies uniformly across domain objects.

## Key Insight

**Triage records are a separate object** that can be associated with any domain entity. The entity has its own lifecycle; the triage record has its own workflow state.

```
Signal (triggered) ──creates──► Triage Record (inbox, urgent)
   │                                  │
   │ lifecycle: triggered             │ workflow: inbox → in_progress → done
   │                                  │ severity: urgent
```

This separation was implemented in #ENH-047. The entity standardization (#ENH-048) builds on this foundation.

---

## Universal Lifecycle Status Model

### Standard Values

| Status | Meaning | Can transition to |
|--------|---------|-------------------|
| `draft` | Created but not yet validated/armed | `active`, `rejected` |
| `active` | Validated and in use | `complete`, `rejected` |
| `complete` | Successfully concluded | (terminal) |
| `rejected` | Cancelled/invalidated at any stage | (terminal) |

### State Machine

```
draft ──────► active ──────► complete
  │             │
  └──► rejected ◄┘
```

### Entity Fit Assessment

| Entity | `draft` | `active` | `complete` | `rejected` | Fit? |
|--------|---------|----------|------------|------------|------|
| **Signals** | Configured but not armed | Armed and monitoring | Triggered and acted upon | Cancelled/superseded | ✅ |
| **Claims** | Extracted, unreviewed | Confirmed as valid | Converted to thesis | Rejected as invalid | ✅ |
| **Macro Theses** | Being developed | Current belief | Thesis played out | Invalidated | ✅ |
| **Asset Theses** | Being developed | Current belief | Thesis played out | Invalidated | ✅ |
| **Strategies** | Planning stage | Open with positions | Closed out | Abandoned | ✅ |
| **Positions** | N/A (created open) | Open | Closed | N/A | ⚠️ Keep `isOpen` |

**Positions** are an exception - they don't have a draft state and aren't "rejected". They're either `open` or `closed`. The existing `isOpen` boolean is appropriate.

---

## Entity-Specific Mappings

### Claims (`main_claims`)

| Current Value | New Value | Notes |
|---------------|-----------|-------|
| `unconfirmed` | `draft` | Created by research, awaiting review |
| `confirmed` | `active` | Validated as credible |
| `rejected` | `rejected` | Explicitly declined |
| `invalidated` | `rejected` | Same as rejected |
| `merged` | Remove | No longer used |

**Lifecycle:** Created (`draft`) → Confirmed (`active`) → Linked to thesis and thesis completes (`complete`) or explicitly declined (`rejected`)

### Signals (`signals`)

| Current Value | New Value | Notes |
|---------------|-----------|-------|
| `recommended` | `draft` | AI suggested, awaiting user acceptance |
| `not_triggered` | `active` | Accepted and monitoring |
| `triggered` | `complete` | Fired and acted upon |
| `superseded` | Remove | No longer needed |

**Lifecycle:** Recommended (`draft`) → Accepted (`active`) → Triggered (`complete`) or Cancelled (`rejected`)

### Macro Theses & Asset Theses

| Current Value | New Value | Notes |
|---------------|-----------|-------|
| `draft` | `draft` | Being developed, no core argument yet |
| `active` | `active` | Has core argument and signals, being monitored |
| `under_review` | `active` | Still active, just flagged (triage handles this) |
| `retired` | `complete` | Thesis played out, no active strategies |
| `superseded` | `rejected` | Replaced by better thesis |
| `invalidated` | `rejected` | Proven wrong |
| `inactive` | `complete` | No longer actively monitored |

**Remove:** `workflowStatus` and `lifecycleStatus` fields (the triage system handles workflow)

**Lifecycle:** Developing (`draft`) → Synthesized with signals (`active`) → No active strategies (`complete`) or Invalidated (`rejected`)

### Strategies

| Current State | New Value | Notes |
|---------------|-----------|-------|
| No positions yet | `draft` | Planning stage |
| Has open positions | `active` | Live strategy |
| All positions closed | `complete` | Strategy concluded |
| `merged` | `complete` | Merged into another (successful conclusion) |
| Abandoned | `rejected` | Cancelled before completion |

**Note:** Strategies currently derive status implicitly. This would add an explicit `status` field.

**Lifecycle:** Planning (`draft`) → Positions opened (`active`) → Positions closed (`complete`) or Abandoned (`rejected`)

### Positions

**Keep as-is:** `isOpen` boolean. Positions are simple - they're either open or closed. No draft state, no rejection concept.

---

## Triage Records (Separate System)

Triage records use a different set of values because they represent workflow state, not entity lifecycle.

### Fields

| Field | Values | Purpose |
|-------|--------|---------|
| `status` | `inbox`, `in_progress`, `done` | Workflow state |
| `severity` | `urgent`, `attention`, `monitor`, `info` | Priority |

**Note:** This was implemented in #ENH-047.

---

## Current State vs Target

| Entity | Current Field(s) | Current Values | Target |
|--------|-----------------|----------------|--------|
| `signals` | `status` | recommended, not_triggered, triggered, superseded | draft, active, complete, rejected |
| `main_claims` | `status` | unconfirmed, confirmed, rejected, invalidated, merged | draft, active, complete, rejected |
| `macro_theses` | `status` + `workflowStatus` + `lifecycleStatus` | Complex mix | `status`: draft, active, complete, rejected |
| `asset_theses` | `status` + `workflowStatus` + `lifecycleStatus` | Complex mix | `status`: draft, active, complete, rejected |
| `strategies` | Implicit (derived) | N/A | Add `status`: draft, active, complete, rejected |
| `positions` | `isOpen` | true/false | Keep as-is |

---

## Migration Complexity Estimates

| Entity | Schema Change | Files Affected | Complexity |
|--------|--------------|----------------|------------|
| `main_claims` | Remap values, drop `merged` | ~8 files | Low |
| `signals` | Remap values, drop `superseded` | ~6 files | Low |
| `macro_theses` | Remap values, drop `workflowStatus`/`lifecycleStatus` | ~10 files | Medium |
| `asset_theses` | Same as macro | ~10 files | Medium |
| `strategies` | Add explicit `status` field | ~8 files | Medium |

---

## Implementation Notes

### Order of Operations

1. **Claims** - Simplest migration, self-contained
2. **Signals** - Also relatively simple
3. **Theses** - More complex due to multiple fields to consolidate
4. **Strategies** - New field, need to determine derived logic

### Backward Compatibility

- Database migration should map old values to new values
- API routes may need to accept both old and new values during transition
- UI components should be updated to use new values

### Testing

- Each entity migration should include:
  - Database migration script
  - API route updates
  - UI component updates
  - Verification that existing data is preserved

---

## Related Documentation

- [CURRENT_STATE.md](../CURRENT_STATE.md) - Current state machines for all entities
- [FUTURE_ENHANCEMENTS.md](../FUTURE_ENHANCEMENTS.md) - #ENH-048 tracking
- [terminology.md](terminology.md) - Authoritative term definitions

---

## Decision History

This design was established in conversation prior to implementing #ENH-047 (Triage Severity/Status Separation). The separation of triage workflow state from domain entity lifecycle was a key insight that informed both enhancements.

Key decisions:
1. **Four universal lifecycle states** - draft, active, complete, rejected
2. **Positions are an exception** - Keep `isOpen` boolean
3. **Triage records are separate** - Workflow state (inbox/in_progress/done) + severity (urgent/attention/monitor/info)
4. **Retire redundant fields** - Remove `workflowStatus`, `lifecycleStatus`, `merged`, `superseded`
