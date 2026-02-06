# ENH-050: Thesis-Bounded Execution System

**Priority:** High | **Effort:** 2-3 weeks | **Phase:** 4.0
**PRD:** Section 7 (Decision Support), Section 3 (Strategies)
**Dependencies:** Massive API integration (COMPLETE), Strategy entity (COMPLETE)
**Status:** PROPOSED

---

## Summary

A system that generates options-based execution strategies bounded by pre-defined risk parameters, and includes pre-populated management rules for different path-dependent scenarios. Enforces pre-commitment to risk limits and exit criteria before position entry.

---

## Motivation

From the Trade-Journal Genesis Document:

> "The system's job is to make you remember at $17M what you knew at $10M."

This feature applies that principle to individual trades:
- Define risk parameters when clear-headed (before entry)
- Let options structure enforce boundaries (not willpower)
- Pre-populate management playbook for path-dependent scenarios
- Hard rules that execute regardless of emotional state

---

## Core Concept

### Confidence Level = Portfolio Risk Budget

| Confidence | Portfolio % at Risk | Example ($7.8M liquid) |
|------------|--------------------|-----------------------|
| Low (speculative) | 0.5-1% | $39K-78K max loss |
| Medium | 1-2% | $78K-156K max loss |
| High (conviction) | 2-5% | $156K-390K max loss |
| Maximum | 5-10% | $390K-780K max loss |

The confidence level declared on the thesis/strategy directly maps to acceptable loss.

---

## Input Parameters

When creating a strategy or proposing execution:

### Required
- **Underlying:** Ticker
- **Direction:** Bullish / Bearish / Neutral
- **Time Horizon:** Target date or duration
- **Confidence Level:** Low / Medium / High / Maximum
- **Max Acceptable Loss:** Auto-calculated from confidence, or override

### Optional
- **Target Price:** Expected price at horizon
- **IV View:** Is current IV cheap/fair/expensive vs historical?
- **Entry Price Range:** Acceptable fill levels

---

## Output: Execution Proposals

System queries Massive API for live options chains and proposes 3-5 structures:

### Example Output

**Thesis:** Bullish NVDA, 6-month horizon, High confidence
**Max Loss:** $200K

| Strategy | Structure | Max Loss | Breakeven | Max Gain | IV Regime Fit |
|----------|-----------|----------|-----------|----------|---------------|
| Bull Call Spread | Buy 800C / Sell 900C Jun | $180K | $818 | $820K | Neutral IV |
| Call Calendar | Buy Jun 850C / Sell Mar 850C | $95K | N/A | Unlimited | Low IV (cheap vol) |
| Risk Reversal | Sell 750P / Buy 850C Jun | $200K* | $780 | Unlimited | High IV (sell premium) |
| Collar (if long stock) | Buy 750P / Sell 900C | $150K | N/A | Capped | Protect gains |

*Denotes assignment risk requiring additional capital

---

## Path-Dependent Management Rules

This is the critical addition. Each execution proposal includes **pre-populated playbook** for scenarios:

### Scenario Matrix

| Scenario | Trigger | Pre-Committed Action |
|----------|---------|---------------------|
| **Quick Win** | Position +50% in <30 days | Roll up protective puts; lock in 50% of gains |
| **Thesis Playing Out** | Price approaching target | Begin scaling out 25% at each 10% move toward target |
| **Vol Crush** | IV drops >20% from entry | Add cheap puts to maintain downside protection |
| **Vol Spike** | IV rises >30% from entry | Consider selling calls against to monetize vol |
| **Time Decay** | <60 DTE remaining | Roll to next expiry or close if <20% of max gain remaining |
| **Thesis Invalidation** | Price breaks [level] | Exit 100% immediately - no exceptions |
| **Max Loss Approaching** | Position at -80% of max loss | Close position; do not add or "average down" |

### Hard Rules (Non-Overridable)

These rules **cannot be modified once position is open** without explicit confirmation flow:

1. **Max Loss Exit:** If position reaches defined max loss, system flags for immediate exit
2. **Thesis Invalidation:** If invalidation trigger hit, system flags for exit
3. **Time Stop:** If horizon expires without thesis playing out, close position

---

## Data Flow

```
Strategy Creation UI
        │
        ▼
┌─────────────────────────────────────┐
│  Execution Proposal Request         │
│  - Underlying, direction, horizon   │
│  - Confidence level → max loss      │
│  - IV view                          │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Massive API Query                  │
│  - Live options chain               │
│  - Current IV surface               │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  LLM Analysis                       │
│  - Compare IV to historical (DB)    │
│  - Generate candidate structures    │
│  - Calculate Greeks, P&L profiles   │
│  - Score fit to parameters          │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Execution Proposals (3-5)          │
│  + Path-dependent playbook          │
│  + Hard rules pre-populated         │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  User Confirms Selection            │
│  - Selects structure                │
│  - Confirms/edits playbook rules    │
│  - Commits hard rules (locked)      │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Strategy Created                   │
│  - execution_plan JSON stored       │
│  - management_rules JSON stored     │
│  - hard_rules JSON stored (locked)  │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Triage Integration                 │
│  - Monitor triggers from playbook   │
│  - Generate alerts when hit         │
│  - Hard rule violations = URGENT    │
└─────────────────────────────────────┘
```

---

## Schema Changes

### strategies table additions

```sql
ALTER TABLE strategies ADD COLUMN execution_plan JSONB;
-- Stores: proposed structures, selected structure, entry criteria

ALTER TABLE strategies ADD COLUMN management_rules JSONB;
-- Stores: path-dependent playbook (editable)

ALTER TABLE strategies ADD COLUMN hard_rules JSONB;
-- Stores: non-overridable rules (locked after confirmation)

ALTER TABLE strategies ADD COLUMN hard_rules_locked_at TIMESTAMP;
-- When hard rules were committed (prevents modification)

ALTER TABLE strategies ADD COLUMN confidence_level TEXT;
-- 'low' | 'medium' | 'high' | 'maximum'

ALTER TABLE strategies ADD COLUMN max_acceptable_loss DECIMAL;
-- Dollar amount

ALTER TABLE strategies ADD COLUMN thesis_invalidation_trigger TEXT;
-- Price level or condition that invalidates thesis
```

### New table: strategy_rule_events

```sql
CREATE TABLE strategy_rule_events (
  id UUID PRIMARY KEY,
  strategy_id UUID REFERENCES strategies(id),
  rule_type TEXT NOT NULL, -- 'management' | 'hard'
  rule_key TEXT NOT NULL, -- e.g., 'quick_win', 'max_loss_exit'
  triggered_at TIMESTAMP NOT NULL,
  trigger_value JSONB, -- What triggered it (price, IV, etc.)
  action_taken TEXT, -- What was done
  action_taken_at TIMESTAMP,
  ignored BOOLEAN DEFAULT FALSE,
  ignore_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## UI Components

### 1. Execution Proposal Dialog

Accessed from Strategy detail page → "Propose Execution" button

- Input form for parameters
- Loading state while querying Massive + LLM
- Card grid of proposed structures
- Each card shows: structure, max loss, breakeven, Greeks, P&L chart
- Select to expand and see full playbook

### 2. Management Playbook Editor

- Table of scenarios with triggers and actions
- Editable actions (user can customize)
- Toggle individual rules on/off
- "Add Custom Rule" option

### 3. Hard Rules Confirmation

- Modal requiring explicit confirmation
- Shows rules that will be LOCKED
- Checkbox: "I understand these rules cannot be changed after position is opened"
- Confirm button commits and timestamps

### 4. Active Monitoring Dashboard

- List of strategies with active rules
- Visual indicators for rules approaching triggers
- URGENT alerts for hard rule violations

---

## Triage Integration

New triage rule category: `STRATEGY_RULE`

| Rule | Severity | Trigger |
|------|----------|---------|
| Hard rule triggered | URGENT | Any hard rule condition met |
| Management rule triggered | ATTENTION | Playbook scenario condition met |
| Approaching hard rule | MONITOR | Within 20% of hard rule trigger |

---

## LLM Prompt Template

```
You are an options strategist. Given the following parameters, propose 3-5 execution strategies using the provided options chain data.

THESIS:
- Underlying: {ticker}
- Direction: {direction}
- Time Horizon: {horizon}
- Target Price: {target_price}
- Confidence Level: {confidence} ({max_loss} max acceptable loss)
- IV Assessment: Current IV rank {iv_rank}%, historical 30-day IV {iv_30}

CONSTRAINTS:
- Max loss must not exceed {max_loss}
- Structure must align with {horizon} timeframe
- Consider current IV regime when selecting strategy

OPTIONS CHAIN DATA:
{options_chain_json}

HISTORICAL IV DATA:
{iv_history_json}

For each proposed strategy, provide:
1. Structure (legs, strikes, expirations)
2. Max loss calculation
3. Breakeven price(s)
4. Max gain potential
5. Greeks summary (delta, theta, vega)
6. IV regime fit explanation
7. Path-dependent management rules:
   - Quick win scenario
   - Thesis playing out scenario
   - Vol crush scenario
   - Vol spike scenario
   - Time decay scenario
   - Thesis invalidation scenario

Format as JSON.
```

---

## Implementation Phases

### Phase 1: Core Proposal Engine (1 week)
- Schema changes
- Massive API query for specific underlying
- LLM integration for strategy generation
- Basic UI for proposal display

### Phase 2: Playbook & Hard Rules (1 week)
- Management rules editor
- Hard rules confirmation flow
- Strategy storage with rules
- Rule event logging

### Phase 3: Triage Integration (3-4 days)
- New triage rule category
- Monitoring for rule triggers
- Alert generation
- Dashboard updates

---

## Success Criteria

1. User can generate execution proposals from strategy page
2. Proposals include path-dependent management playbook
3. Hard rules are locked after confirmation
4. Triage system monitors and alerts on rule triggers
5. Rule events are logged for retrospective analysis

---

## Connection to Psychological Framework

This feature enforces the core insight from the genesis document:

> "You can't willpower your way out of a cognitive bias. You need structural rules."

By pre-defining:
- Max loss (confidence → % of portfolio)
- Exit triggers (thesis invalidation)
- Management responses (path-dependent playbook)
- Hard rules (cannot be overridden)

The system protects against in-the-moment rationalization. The rules are written when clear-headed and enforced when emotional.

---

## Open Questions

1. Should hard rules be **enforced** (auto-execute) or **alerted** (require manual action)?
   - Recommendation: Start with alerts, add auto-execute as future enhancement

2. How to handle positions that don't match proposed structure exactly?
   - Recommendation: Allow partial matching with manual override

3. Should confidence level be strategy-level or position-level?
   - Recommendation: Strategy-level, inherited by positions

---

*Created: 2026-02-03*
*Author: Assistant (from conversation with Nick)*
