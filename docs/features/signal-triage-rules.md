 # Signal & Triage Rules Reference

**Created:** 2026-01-16
**Purpose:** Centralized documentation of all signal evaluation rules, triage triggers, and auto-promotion flows.
**Source files:** `src/lib/derived/signalEvaluation.ts`, `src/lib/derived/triage.ts`, `src/lib/derived/thesisTriage.ts`

---

## Table of Contents

1. [Overview](#overview)
2. [Signal Evaluation System](#signal-evaluation-system)
3. [Position Triage Rules](#position-triage-rules)
4. [Strategy Triage Rules](#strategy-triage-rules)
5. [Thesis Triage Rules](#thesis-triage-rules)
6. [Severity Override System](#severity-override-system)
7. [Claims Auto-Promotion Flow](#claims-auto-promotion-flow)
8. [Cross-System Interactions](#cross-system-interactions)

---

## Overview

The system implements three interconnected triage/evaluation systems:

| System | Scope | Source File | Evaluation Trigger |
|--------|-------|-------------|-------------------|
| **Signal Evaluation** | Strategy signals | `signalEvaluation.ts` | Data ingestion |
| **Position Triage** | Individual positions | `triage.ts` | Data ingestion |
| **Strategy Triage** | Strategy-level | `triage.ts` | Data ingestion |
| **Thesis Triage** | Macro/Asset theses | `thesisTriage.ts` | Claim linkage, articulation |

**Common Flow:**
```
Trigger Event → Evaluation → Triage Record Created → UI Display → User Action → Resolution → Journal Entry
```

---

## Signal Evaluation System

**Source:** `src/lib/derived/signalEvaluation.ts` (365 lines)

Signals are user-configurable triggers that evaluate position metrics during data ingestion.

### Condition Types (8 Total)

| Type | Description | Data Source |
|------|-------------|-------------|
| `dte_lte` | Days to expiry ≤ threshold | `minDte` from strategy metrics |
| `dte_gte` | Days to expiry ≥ threshold | `maxDte` from strategy metrics |
| `sigma_to_strike_lte` | Sigma-to-strike ≤ threshold | Triage computation |
| `sigma_to_strike_gte` | Sigma-to-strike ≥ threshold | Triage computation |
| `iv_rank_gte` | IV Rank ≥ threshold | Requires `computeIvMetrics()` |
| `iv_rank_lte` | IV Rank ≤ threshold | Requires `computeIvMetrics()` |
| `pnl_pct_gte` | Unrealized PnL% ≥ threshold | Strategy metrics |
| `pnl_pct_lte` | Unrealized PnL% ≤ threshold | Strategy metrics |

**Price-based signals** (`price_above`, `price_below`) are handled separately by TradingView webhooks, not during ingestion.

### Signal Configuration Structure

```typescript
interface SignalConfig {
  logic: 'all' | 'any';              // AND vs OR for conditions
  conditions: SignalCondition[];
  recommendedAction: string;          // Action description
  actionNotes?: string;               // Guidance for action
  tvAlertName?: string;               // TradingView webhook matching
}

interface SignalCondition {
  type: string;                       // One of 8 condition types
  value: number;                      // Threshold value
  ticker?: string;                    // Optional ticker filter
}
```

### Signal Lifecycle

**Status Transitions:**
- `draft` → `active` (user activation)
- `active` → `complete` (triggered during ingestion or by webhook)
- `active` → `rejected` (user rejection)

**When Signal Triggers:**
1. Signal status → `complete`
2. Triage record created with severity mapped from `signal.importance`:
   - `critical` → `urgent`
   - `significant` → `attention`
   - `supporting` → `info`
3. Journal entry logged (`actionType: 'signal_triggered'`)

### Entry Point

```typescript
evaluateStrategySignalsForDate(accountId, snapshotDate)
```

Called after triage computation during ingestion. Only evaluates `status = 'active'` signals with position-metric conditions.

### TradingView Webhook Integration

**Webhook Payload:**
```json
{
  "ticker": "{{ticker}}",
  "alertName": "{{alertname}}",
  "price": {{close}},
  "time": "{{timenow}}"
}
```

**Matching Logic:**
- Matches by `tvAlertName` (case-insensitive) + strategy's `underlying_ticker`
- Edge Function: `supabase/functions/tv-webhook/index.ts`

---

## Position Triage Rules

**Source:** `src/lib/derived/triage.ts` (1259 lines)

### Configuration Constants

```typescript
const TRIAGE_RULES_V1 = {
  ruleSet: 'options_v1',
  dteThreshold: 30,                    // Create triage if DTE ≤ 30 days
  assignmentDteThreshold: 10,          // Assignment risk urgency threshold
  sizeAttentionThreshold: 0.15,        // 15% of NAV
  sizeUrgentThreshold: 0.25,           // 25% of NAV
  complexityThreshold: 10,             // Number of open positions
}
```

### Position-Level Triggers (7 Types)

#### 1. Assignment Risk (Highest Priority)

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `ASSIGNMENT_RISK≤14_DTE` | Short, ITM, DTE ≤ 14 | `urgent` |
| `ASSIGNMENT_RISK≤30_DTE` | Short, ITM, 14 < DTE ≤ 30 | `attention` |

**Requirement:** Underlying spot data (not option mark price)

#### 2. In-the-Money (ITM) Flags

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `ITM_SHORT` | Short position ITM (not in assignment range) | `info` |
| `ITM_LONG` | Long position ITM | `info` |

**Requirement:** Underlying spot data

#### 3. Sigma-to-Strike Distance

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `SIGMA_0.5_SHORT` | Short position within 0.5σ of strike | `urgent` |
| `SIGMA_0.5_LONG` | Long position within 0.5σ of strike | `attention` |
| `SIGMA_1.0` | Position within 1.0σ of strike | `info` |

#### 4. Days to Expiry (Time Decay)

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `REVIEW_DTE` (shorts) | Short position DTE ≤ 21 days | `attention` |
| `REVIEW_DTE` (longs) | Long position DTE ≤ 7 days | `attention` |
| `REVIEW_DTE` (general) | DTE ≤ 30 days | `info` |

---

## Strategy Triage Rules

### Strategy-Level Triggers (6 Types)

#### 1. Trade Ingestion & Quantity Change

| Trigger | Rule Set | Condition | Severity |
|---------|----------|-----------|----------|
| `TRADE_INGESTION` | `trade_ingestion_v1` | Trades ingested for strategy | `attention` |
| `QUANTITY_CHANGE` | `quantity_change_v1` | Position quantity changed (no trade ingestion) | `attention` |

**Trade Ingestion Flow:**
```
Flex CSV Ingestion → trades table → createTradeIngestionRecords()
    ↓
Triage record with unmatchedTradeExecutions JSONB
    ↓
User captures metadata (stage, reason, notes) via TradeMetadataForm
    ↓
Journal entry logged, triage marked done
```

**Historical Data Flow (No Ingested Trades):**
```
Position snapshot imported → QUANTITY_CHANGE detected (no matching trades)
    ↓
Triage record created (unmatchedTradeExecutions empty)
    ↓
TradeMetadataForm shows "No trade executions found" message
    ↓
User captures metadata (stage, reason) without selecting trades
    ↓
Journal entry logged with noLinkedTrades: true, triage marked done
```

This flow handles strategies with back data that wasn't ingested (e.g., positions from before integration started). The user can still capture trade context for the journal even without matching trade executions.

**Key Points:**
- `TRADE_INGESTION` created during Flex CSV ingestion (in `processCsv.ts`)
- `QUANTITY_CHANGE` created during triage computation (in `triage.ts`) - skipped if `TRADE_INGESTION` already exists
- Both use `unmatchedTradeExecutions` JSONB to store: `{conid, ticker, qtyChange, tradeIds[]}`
- `isTradeMetadataTrigger()` helper identifies both triggers for special UI handling
- When no trades exist, form allows submission with just stage and reason (no trade selection required)

**Source Files:**
- `src/lib/ingestion/flex/processCsv.ts` → `createTradeIngestionRecords()`
- `src/lib/derived/triage.ts` → `computeQuantityChangeTriageForDate()`

#### 2. Workflow Triggers

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `CONFIRM_STRATEGY` | Auto-derived strategy not confirmed | `urgent` |
| `LINK_STRATEGY_TO_THESIS` | Confirmed strategy missing asset thesis link | `info` |

**Notes:**
- `CONFIRM_STRATEGY` requires setting label, strategyType, direction; assetThesisId is optional
- `LINK_STRATEGY_TO_THESIS` is a soft reminder for confirmed strategies that haven't been linked to an asset thesis yet
- Confirmation workflow includes optional strategy merging for calendar spreads and multi-leg strategies

#### 3. Size/Risk Management

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `REVIEW_SIZE` | Strategy size ≥ 50% NAV | `urgent` |
| `REVIEW_SIZE` | Strategy size 25-50% NAV | `attention` |
| `REVIEW_SIZE` | Strategy size 10-25% NAV | `info` |

#### 4. Complexity

| Trigger | Condition | Severity |
|---------|-----------|----------|
| `REVIEW_COMPLEXITY` | > 10 open positions | `info` |

---

## Thesis Triage Rules

**Source:** `src/lib/derived/thesisTriage.ts` (550 lines)

### Triage Types (5 Total)

#### 1. NEEDS_RESEARCH

| Aspect | Value |
|--------|-------|
| **Trigger** | Thesis created with < 3 claims |
| **Severity** | `info` |
| **Urgency** | `when_convenient` |
| **Lifecycle Stage** | `research` |
| **Suggested Skill** | `/process-transcript` |
| **Resolution** | Claim count reaches 3 (auto-transitions to PRODUCE_CORE_ARGUMENT) |

#### 2. PRODUCE_CORE_ARGUMENT

| Aspect | Value |
|--------|-------|
| **Trigger** | Thesis has ≥ 3 claims but no articulation |
| **Severity** | `attention` |
| **Urgency** | `this_week` |
| **Lifecycle Stage** | `synthesis` |
| **Suggested Skill** | `/synthesize-thesis` |
| **Resolution** | Articulation created |

#### 3. UPDATE_CORE_ARGUMENT

| Aspect | Value |
|--------|-------|
| **Trigger** | ≥ 3 new claims linked since last articulation |
| **Severity** | `info` |
| **Urgency** | `when_convenient` |
| **Lifecycle Stage** | `synthesis` |
| **Suggested Skill** | `/synthesize-thesis` |
| **Resolution** | New articulation created OR user dismisses |

**Calculation:** `claimCount - claimsCountAtLastArticulation >= 3`

#### 4. REVIEW_DRAFT_SIGNALS

| Aspect | Value |
|--------|-------|
| **Trigger** | ≥ 1 draft signals need review |
| **Severity** | `attention` |
| **Urgency** | `this_week` |
| **Resolution** | All signals reviewed (status = `active` OR `rejected`) |

#### 5. SIGNAL_TRIGGERED

| Aspect | Value |
|--------|-------|
| **Trigger** | ≥ 1 signals with status = `complete` |
| **Severity** | `urgent` if critical signal, else `attention` |
| **Urgency** | `immediate` if critical, else `this_week` |
| **Resolution** | User addresses triggered signals |

**Severity Logic:**
- Any `critical` signal triggered → `urgent`, `immediate`
- Any `significant` signal triggered → `attention`, `this_week`
- Otherwise → `attention`, `this_week`

### Auto-Resolution Rules

| Condition | Resolves |
|-----------|----------|
| Articulation created | `NEEDS_RESEARCH`, `PRODUCE_CORE_ARGUMENT`, `UPDATE_CORE_ARGUMENT` |
| Claim count reaches 3 | `NEEDS_RESEARCH` (transitions to `PRODUCE_CORE_ARGUMENT`) |
| All draft signals reviewed | `REVIEW_DRAFT_SIGNALS` |

---

## Severity Override System

**Storage:** Directly on `triage_records` table (migrated from `blotter_actions` on 2026-01-16)

### Override Fields

| Column | Type | Description |
|--------|------|-------------|
| `overrideSource` | text | Source of override (e.g., 'user', 'bulk_action') |
| `overrideExpiresDate` | date | When override expires (null = never) |
| `overrideAt` | timestamp | When override was applied |

### Override Lookup

```typescript
// Pre-fetched in batch to avoid N+1
prefetchSeverityOverrides()

// Matched by: recommendedAction + (positionId OR strategyId)
// Returns: Override severity + expiry date
// Applied: If found and not expired, use override instead of computed
```

---

## Claims Auto-Promotion Flow

**Source:** `src/db/queries/research.ts` → `autoPromoteAuditClaims()`

### Flow

```
research_insights.claims_structure (JSONB)
    ↓
Extract main_claims with type = 'thesis_candidate' | 'view_candidate'
    ↓
Create main_claims records with provenance
    ↓
Ready for user review and conversion to macro/asset thesis
```

### Source Structure

```typescript
interface ClaimsStructure {
  main_claims: MainClaim[];
  evidence_claims: EvidenceClaim[];
  metadata: {
    extraction_date: string;
    source_skill: string;
    toulmin_version: string;
  }
}
```

### Promotion Rules

| Field | Promotion Logic |
|-------|-----------------|
| `type` | `thesis_candidate` or `view_candidate` |
| `category` | `macro` or `asset_specific` |
| `status` | Created as `draft` (unconfirmed) |
| `sourceInsightId` | UUID of research insight |
| `sourceClaimId` | Original claim ID (e.g., "claim-1") |

### Provenance Tracking

Full Toulmin structure preserved:
- `claim` - The assertion
- `evidence[]` - Supporting evidence
- `reasoning` - Logical connection
- `backing` - Authority/context
- `qualifier` - Certainty level
- `rebuttal[]` - Counter-arguments

---

## Cross-System Interactions

### Signal → Triage Flow

```
Strategy Signal Triggers (during ingestion)
    ↓
evaluateStrategySignalsForDate()
    ↓
Signal status → 'complete'
    ↓
Create Triage Record
  - severity: from signal.importance
  - recommendedAction: from signal.statement
  - contextLevel: 'strategy'
    ↓
Log to Journal (actionType: 'signal_triggered')
```

### Thesis Triage → Journal Flow

```
computeThesisTriageForThesis()
    ↓
Determine evolution state (claims, articulation, signals)
    ↓
Match against triage rules
    ↓
Create/Update/Resolve Triage Record
    ↓
Log to Journal (actionType: 'triage_created' or 'triage_resolved')
```

### Claims → Thesis Linkage

```
research_insights.claims_structure
    ↓ auto-promote
main_claims (draft)
    ↓ user converts via ConvertClaimDialog
claim_thesis_mappings
    ↓ creates mapping
macro_theses or asset_theses
    ↓ triggers
computeThesisTriageForThesis()
    ↓
PRODUCE_CORE_ARGUMENT or UPDATE_CORE_ARGUMENT triage
```

---

## Configuration Summary

| Component | Constant | Value | Purpose |
|-----------|----------|-------|---------|
| **Position Triage** | `dteThreshold` | 30 | Days to create position triage |
| **Position Triage** | `assignmentDteThreshold` | 10 | Days for urgent assignment risk |
| **Position Triage** | `sizeAttentionThreshold` | 0.15 | 15% NAV for attention |
| **Position Triage** | `sizeUrgentThreshold` | 0.25 | 25% NAV for urgent |
| **Position Triage** | `complexityThreshold` | 10 | Open positions for complexity |
| **Signal Evaluation** | Condition types | 8 | Evaluable signal conditions |
| **Thesis Triage** | Claims threshold | 3 | Claims needed for PRODUCE_CORE_ARGUMENT |
| **Thesis Triage** | New claims threshold | 3 | Claims since articulation for UPDATE |

---

## Severity Levels Reference

| Level | Priority | Position/Strategy Use Cases | Thesis Use Cases |
|-------|----------|----------------------------|------------------|
| `urgent` | Immediate | Assignment risk ≤14 DTE, Sigma ≤0.5 short, size ≥50% | Critical signal triggered |
| `attention` | This week | Assignment risk ≤30 DTE, Sigma ≤0.5 long, size 25-50% | Synthesis needed, draft signals |
| `info` | Monitor | ITM, Sigma ≤1.0, DTE ≤30, size 10-25% | Research needed, new claims |
| `monitor` | Override | User overrode severity | - |

---

## Journal Entry Types

### Trade Ingestion

| Type | Description |
|------|-------------|
| `trade_ingested` | Trades ingested for strategy (during Flex CSV ingestion) |
| `triage_trade_action` | User captured trade metadata (stage, reason, notes) |

### Position/Strategy Triage

| Type | Description |
|------|-------------|
| `triage_detected` | System detected new trigger (ITM, SIGMA, DTE, SIZE, etc.) |
| `triage_escalated` | Severity increased (e.g., info → attention → urgent) |
| `signal_triggered` | Strategy signal triggered |

### Thesis Triage

| Type | Description |
|------|-------------|
| `triage_created` | New thesis triage record created |
| `triage_resolved` | Thesis triage auto-resolved |
| `claim_converted` | Claim converted to new thesis |
| `claim_linked` | Claim linked to existing thesis |

---

## Related Documentation

- [Thesis Triage Flows](260108-thesis-triage-flows.md) - End-to-end flow documentation
- [Strategy Signals Design](../design/260115-strategy-signals.md) - Signal system design
- [Terminology](terminology.md) - Term definitions
- [Entity Status Standardization](entity-status-standardization.md) - Lifecycle status model
