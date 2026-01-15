# Strategy Signals Design

**Date:** 2025-01-15
**Status:** In Progress

## Overview

Extend the signals framework to support strategies, replacing the underutilized playbook/state-codes system. Strategy signals provide configurable trigger conditions that create triage records when met.

## User Flow

```
1. Strategy Created
   └── DEFINE_SIGNALS triage record created (pending)

2. User defines signals via configuration UI
   ├── Signal: "Take Profit"
   │   Conditions: price >= $520 OR pnl_pct >= 50%
   │   Action: "Close position for profit"
   │
   ├── Signal: "Stop Loss"
   │   Conditions: price <= $480 AND dte <= 30
   │   Action: "Cut losses, roll or close"
   │
   └── Signal: "Time Decay Warning"
       Conditions: dte <= 21 AND sigma_to_strike <= 1.0
       Action: "Consider rolling to next expiry"

3. Signals monitored via two paths:
   ├── Price conditions → TradingView webhook → Edge Function
   └── DTE/Sigma/PnL → Triage computation (on ingestion)

4. Signal triggered → Triage record created with recommendedAction

5. User sees in unified Triage inbox, takes action
```

## Schema Changes

### Extend `signals` table

```sql
-- Add strategy support to existing signals table
ALTER TABLE signals
  ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'thesis',
  ADD COLUMN strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE;

-- Make thesis_id nullable (null when entity_type='strategy')
ALTER TABLE signals ALTER COLUMN thesis_id DROP NOT NULL;

-- Add constraint: entity references must match entity_type
ALTER TABLE signals
  ADD CONSTRAINT signals_entity_check CHECK (
    (entity_type = 'thesis' AND thesis_id IS NOT NULL AND strategy_id IS NULL) OR
    (entity_type = 'strategy' AND strategy_id IS NOT NULL AND thesis_id IS NULL)
  );

-- Index for strategy signals
CREATE INDEX idx_signals_strategy ON signals(strategy_id) WHERE strategy_id IS NOT NULL;
```

### Strategy Signal Configuration

For strategy signals, `explicit_details` JSONB stores:

```typescript
interface StrategySignalConfig {
  // Compound conditions
  logic: 'all' | 'any';  // AND vs OR
  conditions: StrategyCondition[];

  // What to do when triggered
  recommendedAction: string;
  actionNotes?: string;
}

interface StrategyCondition {
  type: ConditionType;
  value: number;
  ticker?: string;  // For price conditions

  // For TradingView integration
  tvAlertName?: string;  // Matches webhook payload
}

type ConditionType =
  // Price levels (via TradingView webhook)
  | 'price_above'
  | 'price_below'
  // Position metrics (computed during triage)
  | 'dte_lte'
  | 'dte_gte'
  | 'sigma_to_strike_lte'
  | 'sigma_to_strike_gte'
  | 'pnl_pct_gte'
  | 'pnl_pct_lte'
  // Underlying metrics
  | 'iv_rank_gte'
  | 'iv_rank_lte';
```

### Example Signals

**Take Profit Signal:**
```json
{
  "logic": "any",
  "conditions": [
    { "type": "price_above", "value": 520, "ticker": "SPY", "tvAlertName": "SPY-520-resistance" },
    { "type": "pnl_pct_gte", "value": 50 }
  ],
  "recommendedAction": "Close position for profit",
  "actionNotes": "Target reached. Consider closing full position or scaling out 50%."
}
```

**Stop Loss Signal:**
```json
{
  "logic": "all",
  "conditions": [
    { "type": "price_below", "value": 480, "ticker": "SPY", "tvAlertName": "SPY-480-support" },
    { "type": "dte_lte", "value": 30 }
  ],
  "recommendedAction": "Cut losses, roll or close",
  "actionNotes": "Support broken with limited time. Exit or roll to later expiry."
}
```

## TradingView Webhook Integration

### Webhook Payload (from TradingView)
```json
{
  "ticker": "SPY",
  "alertName": "SPY-520-resistance",
  "price": 520.45,
  "timestamp": "2025-01-15T14:30:00Z",
  "message": "SPY crossed above $520"
}
```

### Edge Function Flow
```
POST /functions/v1/tv-webhook
  │
  ├── Validate payload signature (shared secret)
  ├── Find signals with matching tvAlertName
  │   SELECT * FROM signals
  │   WHERE entity_type = 'strategy'
  │     AND status = 'not_triggered'
  │     AND explicit_details->'conditions' @> '[{"tvAlertName": "SPY-520-resistance"}]'
  │
  ├── For each matching signal:
  │   ├── Check if all conditions met (for 'all' logic)
  │   │   - Price condition: MET (from webhook)
  │   │   - Other conditions: query current position data
  │   │
  │   ├── If triggered:
  │   │   ├── Update signal status → 'triggered'
  │   │   ├── Insert signal_status_history record
  │   │   └── Create triage_records row
  │   │
  │   └── If not fully triggered (waiting for other conditions):
  │       └── Store partial trigger state for later evaluation
  │
  └── Return 200 OK
```

## Triage Integration

### DEFINE_SIGNALS Trigger

When a strategy is created, add a triage record:

```sql
INSERT INTO triage_records (
  snapshot_date,
  account_id,
  context_level,
  strategy_id,
  symbol,
  severity,
  recommended_action
) VALUES (
  CURRENT_DATE,
  (strategy's account_id),
  'strategy',
  (new strategy id),
  (strategy ticker),
  'attention',
  'DEFINE_SIGNALS'
);
```

### Signal Evaluation in Triage Computation

During `computeTriage()`:

```typescript
// For each active strategy with signals
const strategySignals = await db.select()
  .from(signals)
  .where(and(
    eq(signals.entityType, 'strategy'),
    eq(signals.status, 'not_triggered')
  ));

for (const signal of strategySignals) {
  const config = signal.explicitDetails as StrategySignalConfig;
  const strategy = await getStrategy(signal.strategyId);
  const position = await getStrategyPosition(signal.strategyId);

  const conditionResults = await evaluateConditions(config.conditions, {
    position,
    underlying: strategy.underlying
  });

  const triggered = config.logic === 'all'
    ? conditionResults.every(r => r.met)
    : conditionResults.some(r => r.met);

  if (triggered) {
    // Update signal status
    await db.update(signals)
      .set({ status: 'triggered', updatedAt: new Date() })
      .where(eq(signals.id, signal.id));

    // Create triage record
    await db.insert(triageRecords).values({
      snapshotDate: today,
      accountId: strategy.accountId,
      contextLevel: 'strategy',
      strategyId: signal.strategyId,
      symbol: strategy.ticker,
      severity: signal.importance === 'critical' ? 'urgent' : 'attention',
      recommendedAction: config.recommendedAction,
      notes: config.actionNotes
    });
  }
}
```

## UI Components

### Strategy Signals Configuration

New component: `StrategySignalConfigForm.tsx`

Features:
- Add/remove conditions with AND/OR logic
- Condition types:
  - Price levels (with TradingView alert name)
  - DTE thresholds
  - Sigma to strike
  - PnL percentage
  - IV rank
- Recommended action text
- Preview of trigger logic

### Signal List on Strategy Page

Show configured signals with:
- Type indicator (confirmation/warning)
- Condition summary
- Current status (not_triggered/triggered/superseded)
- Recommended action preview

## Implementation Order

1. **Schema migration** - Add entity_type, strategy_id to signals
2. **DEFINE_SIGNALS trigger** - Create on strategy insert
3. **StrategySignalConfigForm** - UI for defining signals
4. **Signal evaluation** - Integrate into triage computation
5. **TradingView Edge Function** - Webhook handler
6. **End-to-end testing**

## Future Enhancements

- **Signal templates** - Pre-built signal sets for common strategy types
- **Backtesting** - Evaluate how signals would have performed historically
- **Alert notifications** - Push notifications when signals trigger
- **Cross-strategy signals** - Portfolio-level triggers
