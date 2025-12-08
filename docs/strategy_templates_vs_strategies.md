# Strategy Templates vs Strategies

## Overview

The Trade Journal uses two related but distinct schemas for managing strategies:

1. **`strategy_templates`** - Reusable strategy patterns/templates
2. **`strategies`** - Live strategy instances tied to accounts, dates, and positions

---

## Strategy Templates (`strategy_templates`)

**Purpose**: Canonical, reusable strategy patterns that define a strategy type.

**Example**: `"CC_GLXY_90D"` - A covered call pattern for GLXY with 90-day time horizon.

**Schema**:
- `id` - UUID primary key
- `strategy_key` - Unique canonical key (e.g., `"CC_GLXY_90D"`)
- `label` - Human-readable name
- `underlying_id` - FK to `underlyings` table
- `min_dte`, `max_dte` - Optional DTE ranges
- `default_time_horizon` - Optional default time horizon
- `notes` - Free-form notes

**Data Population**:
- Created manually via admin UI or during strategy creation
- One template can be referenced by multiple strategy instances
- Templates are reference data - rarely change

**Calculation Perspective**:
- Templates are **not** used in calculations
- They serve as metadata/reference only
- Used for grouping and organizing strategies

---

## Strategies (`strategies`)

**Purpose**: Live, active strategy instances with entry dates, positions, and performance metrics.

**Example**: A specific covered call trade opened on 2024-09-15 for GLXY.

**Schema**:
- `id` - UUID primary key
- `strategy_template_id` - **REQUIRED** FK to `strategy_templates.id`
- `strategy_key` - Denormalized key (matches template or custom)
- `account_id` - FK to `accounts` table
- `opened_at` - Entry date (NOT NULL)
- `closed_at` - Exit date (nullable)
- `status` - Current status: `'draft' | 'planned' | 'open' | 'closed' | 'archived'`
- Entry context fields: `entry_spot`, `entry_iv30`, `net_premium`, `entry_notional`, `thesis`, `profit_rules`, `defense_rules`, `time_rules`
- Aggregated metrics: `total_abs_notional`, `total_unrealized_pnl`
- Auto-derivation: `is_auto`, `confirmed_at`, `strategy_type`
- Playbook linkage: `strategy_type` (links to `playbook_items.strategy_type`)

**Data Population**:
- **Auto-derived**: Created automatically from positions/trades via `autoLinkPositionsToStrategies()`
- **Manual**: Created via admin UI (`/admin/strategies`)
- Each strategy **must** reference a template (via `strategy_template_id`)

**Calculation Perspective**:
- Strategies are **actively used** in all calculations:
  - **Portfolio snapshots**: Aggregates positions by strategy
  - **Strategy metrics**: Computes per-strategy metrics (PnL, % NAV, DTE, state codes)
  - **Triage records**: Generates flags based on strategy state
  - **State codes**: Evaluates playbook criteria against strategy metrics

---

## Key Differences

| Aspect | Strategy Templates | Strategies |
|--------|-------------------|------------|
| **Purpose** | Reusable patterns | Live instances |
| **Cardinality** | 1 template → many strategies | 1 strategy → 1 template |
| **Account-specific** | No | Yes (via `account_id`) |
| **Time-bound** | No | Yes (via `opened_at`, `closed_at`) |
| **Used in calculations** | No | Yes (all derived data) |
| **Auto-created** | No (manual only) | Yes (from positions/trades) |
| **Status** | N/A | `draft`, `open`, `closed`, etc. |
| **Positions linked** | No | Yes (via `positions.strategy_id`) |

---

## Relationship

```
strategy_templates (1) ──< (many) strategies
                              │
                              ├──> positions (via strategy_id)
                              ├──> trades (via strategy_id)
                              ├──> strategy_metrics_snapshots
                              └──> triage_records
```

**Important**: Every strategy **must** have a `strategy_template_id`. When auto-deriving strategies, the system:
1. Creates or finds a template for the strategy pattern
2. Creates a strategy instance referencing that template
3. Links positions/trades to the strategy

---

## Data Flow Example

1. **Position ingested**: `GLXY 2025-01-17 200 C` (covered call leg)
2. **Auto-derivation**: System creates:
   - Template: `"GLXY_CC_2025Q1"` (if doesn't exist)
   - Strategy: Instance with `strategy_template_id` pointing to template
3. **Position linked**: Position's `strategy_id` set to strategy instance
4. **Metrics computed**: Strategy metrics calculated for each snapshot date
5. **Triage generated**: Flags created if strategy needs confirmation

---

## When to Use Each

**Use Strategy Templates**:
- Defining reusable strategy patterns
- Organizing strategies by type
- Setting default parameters (DTE ranges, time horizons)

**Use Strategies**:
- Tracking live trades/positions
- Computing performance metrics
- Generating triage flags
- Managing strategy lifecycle (open → closed)

