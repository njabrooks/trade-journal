# Triage Expanded Section - Positions Table Implementation Plan

## Data Mapping

### Available in Positions Table:
| Display Field | Database Field | Notes |
|--------------|---------------|-------|
| AssetClass | `assetClass` | Direct |
| Symbol | `symbol` | Direct |
| UnderlyingSymbol | `underlyings.ticker` | Via join |
| Expiry | `expiry` | Direct |
| Put/Call | `optionRight` | Direct ('C' or 'P') |
| Strike | `strike` | Direct |
| Quantity | `quantity` | Direct |
| MarkPrice | `spot` | Stored as `spot` in DB |
| PositionValue | `absNotional` | Stored as `abs_notional` in DB |
| CostBasisPrice | `avgPrice` | Stored as `avg_price` in DB |
| FifoPnlUnrealized | `unrealizedPnl` | Stored as `unrealized_pnl` in DB |

### Need to Calculate:
| Display Field | Calculation | Notes |
|--------------|-------------|-------|
| CostBasisMoney | `quantity * avgPrice * multiplier` | Not stored, calculate on-the-fly |
| PercentOfNAV | `(absNotional / NAV) * 100` | Need NAV from `nav_snapshots` table |

---

## Table Structure

### Columns (in order):
1. **AssetClass** - STK, OPT, etc.
2. **Symbol** - Formatted as:
   - For options: `{underlyingSymbol} {expiry} {C/P} {strike}`
   - For stocks: `{symbol}`
3. **Quantity** - Number (can be negative for shorts)
4. **MarkPrice** - Currency format
5. **PositionValue** - Currency format (absolute value)
6. **CostBasisPrice** - Currency format
7. **CostBasisMoney** - Currency format (calculated)
8. **PercentOfNAV** - Percentage format (calculated)
9. **FifoPnlUnrealized** - Currency format (color-coded: green/red)

### Aggregation Row:
When multiple positions (strategy-level records), show totals for:
- **Quantity**: Sum (can be negative)
- **PositionValue**: Sum of absolute values
- **CostBasisMoney**: Sum
- **FifoPnlUnrealized**: Sum (can be negative)
- **PercentOfNAV**: Recalculate from total PositionValue / NAV

**Note**: Don't aggregate:
- AssetClass, Symbol (show "Total" or "—")
- MarkPrice, CostBasisPrice (weighted average could be shown, but simpler to show "—")

---

## API Updates Needed

### Update `/api/positions` route:
Currently returns limited fields. Need to add:
- `spot` (markPrice)
- `absNotional` (positionValue)
- `avgPrice` (costBasisPrice)
- `multiplier` (for CostBasisMoney calculation)
- `underlyingTicker` (already available via join)

Also need to:
- Fetch NAV for the snapshot date (for PercentOfNAV calculation)
- Return accountId (to fetch NAV)

---

## Component Structure

### New Component: `TriagePositionsTable`

```tsx
interface TriagePositionsTableProps {
  positionId?: string | null;
  strategyId?: string | null;
  accountId: string;
  snapshotDate: string;
}

// Fetches positions with all required fields
// Calculates CostBasisMoney and PercentOfNAV
// Displays table with aggregation row if multiple positions
```

### Updated: `TriageTableRow` expanded section

```tsx
{isOpen && (
  <tr>
    <td colSpan={columnCount} className="px-4 py-4 bg-slate-50">
      <div className="space-y-4">
        {/* Positions Table - CENTERPIECE */}
        <TriagePositionsTable
          positionId={record.positionId}
          strategyId={record.strategyId}
          accountId={accountId} // Need to pass this
          snapshotDate={record.snapshotDate}
        />

        {/* Notes */}
        {record.notes && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
            <p className="text-sm text-slate-600">{record.notes}</p>
          </div>
        )}

        {/* Actions */}
        <TriageActionButtons ... />
      </div>
    </td>
  </tr>
)}
```

---

## Action Placement Options

### Option A: Actions in Main Row (Recommended for Quick Access)
**Pros:**
- Faster access - no need to expand
- More visible
- Better for power users who act quickly

**Cons:**
- Main row gets wider
- Action forms still need space (could use modal/dropdown)
- Less space for other columns

**Implementation:**
- Add "Actions" column to main table
- Button/dropdown in main row
- Action forms in modal or dropdown panel

### Option B: Actions in Expanded Section (Current)
**Pros:**
- Keeps main row compact
- More space for action forms
- Cleaner table view

**Cons:**
- Requires expansion to act
- Actions less discoverable

### Option C: Hybrid (Best of Both)
**Pros:**
- Quick action button in main row (e.g., "Quick Actions" dropdown)
- Full action forms in expanded section
- Best UX for both quick and detailed actions

**Implementation:**
- Small action button in main row (icon + dropdown with common actions)
- Full `TriageActionButtons` component in expanded section

---

## Recommendation: Option C (Hybrid)

1. **Main Row**: Add compact "Actions" column with dropdown button
   - Shows most common action for this trigger type
   - Dropdown shows all available actions
   - Clicking opens action form in modal or expanded section

2. **Expanded Section**: Keep full `TriageActionButtons` component
   - For users who want to review details before acting
   - More space for complex forms

This gives:
- Quick access for power users
- Full context for careful review
- Progressive disclosure (quick → detailed)

---

## Implementation Steps

### Phase 1: Positions Table
1. Update `/api/positions` to return all required fields
2. Add NAV fetching logic (for PercentOfNAV)
3. Create `TriagePositionsTable` component
4. Update `TriageTableRow` to use new table
5. Remove old metrics grid and position list

### Phase 2: Action Placement
1. Add "Actions" column to main table
2. Create compact action button component
3. Implement dropdown/modal for quick actions
4. Keep full actions in expanded section

### Phase 3: Enhancements (Future)
1. Trigger indicators on position rows
2. Sortable columns
3. Export functionality
4. Position-level actions

---

## Data Requirements Summary

### Need to Update API Response:
```typescript
{
  id: string;
  assetClass: string | null;
  symbol: string;
  underlyingTicker: string | null; // From join
  expiry: string | null;
  strike: number | null;
  optionRight: string | null;
  quantity: number;
  spot: number | null; // MarkPrice
  absNotional: number | null; // PositionValue
  avgPrice: number | null; // CostBasisPrice
  multiplier: number | null; // For CostBasisMoney calc
  unrealizedPnl: number | null; // FifoPnlUnrealized
  snapshotDate: string;
}
```

### Need to Fetch Separately:
- NAV for snapshot date (from `nav_snapshots` table)
- Account ID (to fetch NAV)

---

## Questions to Resolve

1. **Action Placement**: Confirm Option C (hybrid) approach?
2. **CostBasisMoney**: Calculate on-the-fly or add to schema?
3. **PercentOfNAV**: Calculate per-position or only show in aggregation row?
4. **Symbol Formatting**: Preferred format for options? (e.g., "TSLA 260618C350" vs "TSLA Jun 18 2026 $350 Call")
5. **Aggregation Row**: Show for all strategy records or only when >1 position?

