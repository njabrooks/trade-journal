# Triage Table Expanded Section - UX Analysis & Optimization Recommendations

## Current State Analysis

### What's Currently Displayed

1. **Metrics Grid** (3 columns, always shown)
   - Abs Notional
   - Unrealized PnL (color-coded: green/red)
   - % NAV

2. **Position List** (async loaded)
   - Shows positions for position-level or strategy-level records
   - Simple monospace text list
   - Loading/error states

3. **Notes** (conditional)
   - Plain text display of trigger explanation

4. **Action Buttons** (always shown)
   - TRADE, MONITOR, DISMISS, UPDATE buttons
   - Complex forms appear on click
   - Bottom of expanded section

### Available Data (Not Currently Displayed)

From `triage_records` schema:
- `sigmaToStrike` - Critical for option risk assessment
- `flagAssignment` - Assignment risk indicator
- `flagDteShort` / `flagDteLong` - DTE flags
- `flagSigma05` / `flagSigma10` - Sigma proximity flags
- `isItm` - In-the-money status
- `assetClass` - STK vs OPT
- `dteBucket` - DTE categorization
- `ruleSet` - Which rule set triggered this

### UX Issues Identified

1. **Information Hierarchy**: Financial metrics shown first, but trigger context (why this flag exists) is buried in notes
2. **Action Prominence**: Actions are at bottom - user has to scroll past all info to act
3. **Contextual Relevance**: Same layout for position vs strategy records (different info needs)
4. **Visual Scanning**: Everything is text-heavy, hard to quickly assess risk
5. **Progressive Disclosure**: All info shown at once - no way to focus on what matters
6. **Missing Context**: Key risk indicators (sigma, assignment risk, ITM) not visible
7. **Position Display**: Basic list - no quantities, strikes, expiries, or PnL breakdown

---

## Creative UX Improvements

### Option 1: **Contextual Card Layout** (Recommended)

**Structure**: Different layouts based on `contextLevel` and `recommendedAction`

#### For Position-Level Records:
```
┌─────────────────────────────────────────────────┐
│ 🚨 TRIGGER CONTEXT (Top Priority)               │
│ ─────────────────────────────────────────────── │
│ [Badge: ASSIGNMENT_RISK] [Badge: ITM] [Badge: DTE≤7] │
│ Sigma to Strike: 0.3σ | ITM: Yes | DTE: 5 days │
├─────────────────────────────────────────────────┤
│ 💰 FINANCIAL IMPACT                             │
│ ─────────────────────────────────────────────── │
│ Abs Notional | Unrealized PnL | % NAV          │
├─────────────────────────────────────────────────┤
│ 📊 POSITIONS                                    │
│ ─────────────────────────────────────────────── │
│ [Expandable position cards with details]       │
├─────────────────────────────────────────────────┤
│ ⚡ QUICK ACTIONS (Prominent)                    │
│ ─────────────────────────────────────────────── │
│ [TRADE] [MONITOR] [DISMISS]                     │
├─────────────────────────────────────────────────┤
│ 📝 NOTES (Collapsible)                          │
│ ─────────────────────────────────────────────── │
│ [Expand to see full explanation]               │
└─────────────────────────────────────────────────┘
```

#### For Strategy-Level Records:
```
┌─────────────────────────────────────────────────┐
│ 🎯 STRATEGY CONTEXT                             │
│ ─────────────────────────────────────────────── │
│ Strategy: TSLA 260618C00350000                  │
│ [View Strategy →]                                │
│ Trigger: REVIEW_SIZE (50.2% of NAV)             │
├─────────────────────────────────────────────────┤
│ 💰 FINANCIAL IMPACT                             │
│ ─────────────────────────────────────────────── │
│ Abs Notional | Unrealized PnL | % NAV          │
│ Complexity: 12 positions | Min DTE: 5 days    │
├─────────────────────────────────────────────────┤
│ 📊 POSITIONS SUMMARY                            │
│ ─────────────────────────────────────────────── │
│ [Collapsible list with position details]       │
├─────────────────────────────────────────────────┤
│ ⚡ QUICK ACTIONS                                │
│ ─────────────────────────────────────────────── │
│ [TRADE] [MONITOR] [DISMISS] [UPDATE]           │
├─────────────────────────────────────────────────┤
│ 📝 NOTES                                        │
└─────────────────────────────────────────────────┘
```

**Key Improvements**:
- Trigger context at top (most important - why is this here?)
- Visual badges for risk indicators
- Actions more prominent (moved up)
- Progressive disclosure (notes collapsible)
- Context-aware layout

---

### Option 2: **Tabbed Interface**

```
┌─────────────────────────────────────────────────┐
│ [Overview] [Positions] [Actions] [Details]      │
├─────────────────────────────────────────────────┤
│                                                  │
│ Overview Tab:                                    │
│ - Trigger badges + key metrics                   │
│ - Financial summary                              │
│ - Quick action buttons                           │
│                                                  │
│ Positions Tab:                                   │
│ - Detailed position breakdown                    │
│ - Greeks, strikes, expiries                     │
│                                                  │
│ Actions Tab:                                     │
│ - Full action forms                              │
│ - History of previous actions                   │
│                                                  │
│ Details Tab:                                     │
│ - Full notes                                     │
│ - Rule set info                                  │
│ - Metadata                                       │
└─────────────────────────────────────────────────┘
```

**Pros**: Clean separation, less overwhelming
**Cons**: Extra clicks, might hide important info

---

### Option 3: **Smart Progressive Disclosure**

**Top Section** (Always Visible):
- Trigger context with visual indicators
- Key financial metrics (3-column grid)
- Primary action button (most likely action based on trigger)

**Expandable Sections** (Collapsible):
- 📊 Position Details (expand to see full list)
- ⚡ All Actions (expand to see all action options)
- 📝 Full Context (expand to see notes + metadata)
- 🔍 Risk Analysis (expand to see sigma, ITM, assignment risk details)

**Benefits**:
- Most important info always visible
- User controls depth of detail
- Faster scanning
- Less cognitive load

---

## Specific Enhancement Recommendations

### 1. **Trigger Context Section** (NEW - High Priority)

Display at the top of expanded section:

```tsx
<div className="border-b pb-3 mb-3">
  <div className="flex items-center gap-2 mb-2">
    <span className="text-xs font-semibold text-slate-700">Trigger:</span>
    <Badge>{recommendedAction}</Badge>
    {flagAssignment && <Badge variant="destructive">Assignment Risk</Badge>}
    {isItm && <Badge variant="warning">ITM</Badge>}
    {flagDteShort && <Badge variant="warning">DTE ≤7</Badge>}
  </div>
  {sigmaToStrike && (
    <div className="text-xs text-slate-600">
      Sigma to Strike: {sigmaToStrike}σ
    </div>
  )}
</div>
```

### 2. **Enhanced Position Display** (Medium Priority)

Instead of simple list, show:
- Position cards with: quantity, strike, expiry, PnL
- Group by underlying or expiry
- Visual indicators for ITM, short DTE, etc.
- Click to see full position details

### 3. **Action Prominence** (High Priority)

- Move actions above notes
- Show primary action as prominent button
- Secondary actions as smaller buttons or dropdown
- Show action history (if any previous actions taken)

### 4. **Risk Indicators Dashboard** (Medium Priority)

For position-level records, show:
```
┌─────────────────────────────────────┐
│ Risk Indicators                     │
├─────────────────────────────────────┤
│ Assignment Risk: ⚠️ High           │
│ DTE: 5 days (Short)                 │
│ Sigma: 0.3σ (Very Close)            │
│ ITM: Yes                            │
└─────────────────────────────────────┘
```

### 5. **Contextual Help/Explanation** (Low Priority)

- "Why is this flagged?" tooltip/expandable
- Link to rule documentation
- Show which rule set triggered this

### 6. **Quick Stats Bar** (Low Priority)

For strategy-level records:
- Number of positions
- Min/max DTE
- Complexity score
- Days since opened

---

## Implementation Priority

### Phase 1 (Quick Wins - High Impact)
1. ✅ Move actions above notes
2. ✅ Add trigger context section at top
3. ✅ Show risk indicator badges
4. ✅ Make notes collapsible

### Phase 2 (Medium Effort - Good UX)
1. Enhanced position display (cards instead of list)
2. Context-aware layouts (position vs strategy)
3. Primary action button prominence
4. Add missing data fields (sigma, ITM, assignment flags)

### Phase 3 (More Complex - Polish)
1. Tabbed interface option
2. Action history display
3. Risk indicators dashboard
4. Contextual help/explanation

---

## Data Requirements

To implement these improvements, we need to:

1. **Update Query** (`src/db/queries/triage.ts`):
   - Add `sigmaToStrike`, `flagAssignment`, `isItm`, `flagDteShort`, `flagSigma05`, `flagSigma10` to select
   - Add `assetClass`, `dteBucket` for better context

2. **Update Interface** (`TriageQueueRecord`):
   - Add new fields to interface
   - Pass through to component

3. **Component Updates**:
   - Restructure `TriageTableRow` expanded section
   - Create new sub-components (TriggerContext, RiskIndicators, etc.)
   - Update `PositionList` to show more detail

---

## Visual Design Principles

1. **Scannability**: Use badges, icons, color coding
2. **Hierarchy**: Most important info first (trigger context)
3. **Actionability**: Make actions easy to find and use
4. **Context**: Show why this matters, not just what it is
5. **Progressive Disclosure**: Let users dive deeper if needed
6. **Consistency**: Match patterns from rest of app (DashboardShell, etc.)

---

## Questions to Consider

1. **Action Frequency**: Which actions are most common? Make those most prominent
2. **User Workflow**: Do users typically act immediately or review first?
3. **Information Density**: How much detail is needed at first glance vs. on demand?
4. **Mobile**: How should this work on smaller screens?
5. **Accessibility**: Ensure keyboard navigation, screen reader support

---

## Next Steps

1. Review and prioritize recommendations
2. Start with Phase 1 quick wins
3. Test with real triage records
4. Iterate based on usage patterns
5. Consider A/B testing different layouts

