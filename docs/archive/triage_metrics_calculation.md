# Triage Metrics Calculation - Data Flow Analysis

## Summary

Both `abs_notional` and `unrealized_pnl` come **directly from Flex query fields** - they are not computed during ingestion.

---

## 1. Abs Notional (`abs_notional`)

### Source: Flex Query Field
- **Flex Field**: `PositionValue` (also accepts `Position Value` or `positionValue`)
- **Location**: `src/lib/ingestion/flex/positions.ts:182-183, 223`

```typescript
const positionValue = parseNumeric(getValue(row, FIELD_VARIANTS.positionValue));
// ...
absNotional: positionValue,  // Stored directly from Flex
```

### Important Notes:
1. **Direct mapping**: The value is stored as-is from the Flex query (no calculation)
2. **Can be negative**: For short positions, `PositionValue` from Flex can be negative
3. **Aggregation policy**: When aggregating (strategy/portfolio level), we take the **absolute value**:
   ```typescript
   // From strategyMetrics.ts and portfolio.ts
   const val = parseFloat(pos.absNotional);
   if (!isNaN(val)) {
     return sum + Math.abs(val);  // Always positive when aggregating
   }
   ```

### Fallback Calculation:
If `absNotional` is missing/null, we compute it as:
```typescript
notional = Math.abs(quantity * spot * multiplier)
```
This fallback is used in:
- Strategy metrics computation (`src/lib/derived/strategyMetrics.ts:62-68`)
- Portfolio snapshot computation (`src/lib/derived/portfolio.ts:67-73`)

---

## 2. Unrealized PnL (`unrealized_pnl`)

### Source: Flex Query Field
- **Flex Field**: `FifoPnlUnrealized` (also accepts `FifoPnLUnrealized` or `fifoPnlUnrealized`)
- **Location**: `src/lib/ingestion/flex/positions.ts:183, 224`

```typescript
const unrealized = parseNumeric(getValue(row, FIELD_VARIANTS.fifoUnrealized));
// ...
unrealizedPnl: unrealized,  // Stored directly from Flex
```

### Important Notes:
1. **Direct mapping**: The value is stored as-is from the Flex query (no calculation)
2. **Can be positive or negative**: Represents unrealized profit/loss
3. **No fallback**: If missing, it remains `null` (not computed)

### Aggregation:
When aggregating (strategy/portfolio level), we simply sum:
```typescript
const pnlSum = strategyPositions.reduce((sum, pos) => {
  if (pos.unrealizedPnl) {
    return sum + parseFloat(pos.unrealizedPnl);  // Direct sum, can be negative
  }
  return sum;
}, 0);
```

---

## 3. % NAV (`pct_nav_abs_notional`)

### Calculation: Derived, Not from Flex
- **Formula**: `(total_abs_notional / nav_at_snapshot) * 100`
- **Location**: `src/lib/derived/strategyMetrics.ts:87-91` and `src/lib/derived/portfolio.ts:92-96`

```typescript
if (navAtSnapshot && parseFloat(navAtSnapshot) > 0 && totalAbsNotional) {
  const pct = (parseFloat(totalAbsNotional) / parseFloat(navAtSnapshot)) * 100;
  pctNavAbsNotional = pct.toString();
}
```

### Data Sources:
- `totalAbsNotional`: Sum of `abs_notional` from positions (absolute values)
- `navAtSnapshot`: From `nav_snapshots` table (account-level NAV for the snapshot date)

---

## Data Flow Summary

```
Flex Query
  ├─ PositionValue → positions.abs_notional (stored as-is, can be negative)
  └─ FifoPnlUnrealized → positions.unrealized_pnl (stored as-is, can be negative)
         │
         ├─ For Position-Level Triage:
         │  └─ Used directly from position record
         │
         └─ For Strategy-Level Triage:
            ├─ Aggregate positions.abs_notional → strategy_metrics_snapshots.total_abs_notional
            │  └─ Uses Math.abs() when aggregating (always positive)
            ├─ Aggregate positions.unrealized_pnl → strategy_metrics_snapshots.total_unrealized_pnl
            │  └─ Direct sum (can be negative)
            └─ Calculate: (total_abs_notional / nav) * 100 → pct_nav_abs_notional
```

---

## Implications for UI Display

### Position-Level Records:
- `absNotional`: Direct from position (can be negative, but we display absolute value)
- `unrealizedPnl`: Direct from position (can be positive or negative)
- `pctNavAbsNotional`: Not available at position level (only strategy/account level)

### Strategy-Level Records:
- `absNotional`: Sum of all positions in strategy (always positive after aggregation)
- `unrealizedPnl`: Sum of all positions in strategy (can be positive or negative)
- `pctNavAbsNotional`: Calculated as % of NAV (available)

### Display Considerations:
1. **Position list**: Can show individual position `abs_notional` and `unrealized_pnl`
2. **Metrics grid**: Shows aggregated values (strategy total or single position)
3. **Combining metrics with positions**: Since positions have their own `abs_notional` and `unrealized_pnl`, we can display them together in a unified view

---

## Questions Answered

**Q: Is abs_notional simply the PositionValue field from Flex?**
- **A: Yes**, it's stored directly from Flex `PositionValue` field. However, note that:
  - It can be negative (for short positions)
  - When aggregating, we take absolute value
  - There's a fallback calculation if missing: `quantity * spot * multiplier`

**Q: Where does unrealized_pnl come from?**
- **A: Directly from Flex** `FifoPnlUnrealized` field. It's stored as-is (no calculation). Can be positive or negative.

---

## References

- **Ingestion**: `src/lib/ingestion/flex/positions.ts:150-227`
- **Strategy Metrics**: `src/lib/derived/strategyMetrics.ts:51-84`
- **Portfolio Snapshots**: `src/lib/derived/portfolio.ts:57-97`
- **Schema**: `src/db/schema.ts:197-231` (positions table)

