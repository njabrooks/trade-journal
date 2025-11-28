# Transform Spec — Strategy Metrics Snapshots
Version 0.1 — YYYY-MM-DD  
Author: Nick

See also: `docs/data_model_v1.md`, `docs/transform_positions.md`, `docs/transform_trades.md`, `docs/transform_strategies.md`.

---

## 1. Purpose

Define how we compute **per-strategy, per-date aggregate metrics** into  
`strategy_metrics_snapshots`.

These rows are *derived facts* (Layer C):

- They aggregate from **positions**, **mtm_snapshots**, **nav_snapshots**, and (optionally) **trades**.
- They drive:
  - Strategy cards in the UI (“current exposure, PnL, %NAV”)
  - Historical charts per strategy
  - Triage logic and playbook suggestions

`strategies` holds *entry context* and journaling; it is **not** the place for rolling exposure/PnL. Those live here.

---

## 2. Source Data

### 2.1 positions

From `positions`:

- `account_id`
- `strategy_id` (nullable)
- `snapshot_date`
- `symbol`, `underlying_id`, `asset_class`
- `quantity`
- `abs_notional` (position value in base currency if available)
- `unrealized_pnl`
- `expiry`, `option_right`, `strike`, `side`, `multiplier`, `spot` (for DTE / option context if needed)

For v0.1 we assume:

- `positions.abs_notional` is present or can be approximated as `|quantity * spot * multiplier|` for equities/options.
- `positions.unrealized_pnl` is FIFO unrealized PnL in base.

### 2.2 nav_snapshots

From `nav_snapshots`:

- `account_id`
- `snapshot_date`
- `nav_base` (NAV in base currency)

Used to compute “% of NAV” metrics.

### 2.3 trades (optional)

From `trades`:

- `strategy_id`
- `trade_date`
- `net_amount`, `gross_amount`, `fees`

Used (optionally) to compute *realized PnL to date* per strategy.

---

## 3. Target Schema — `strategy_metrics_snapshots`

**Proposed** schema (Layer C; to be added/checked in `db/schema.ts`):

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `strategy_id` — `uuid`, FK → `strategies.id`, NOT NULL
- `snapshot_date` — `date`, NOT NULL

Aggregate metrics as-of that date:

- `total_abs_notional` — `numeric`, NULLABLE  
  Sum of `abs_notional` over all positions in that strategy.

- `total_unrealized_pnl` — `numeric`, NULLABLE  
  Sum of `unrealized_pnl` over all positions in that strategy.

- `nav_at_snapshot` — `numeric`, NULLABLE  
  Account NAV in base currency (`nav_snapshots.nav_base`).

- `pct_nav_abs_notional` — `numeric`, NULLABLE  
  `total_abs_notional / nav_at_snapshot` (if NAV present).

- `num_open_positions` — `integer`, NULLABLE  
  Count of distinct `positions.id` (or distinct instrument keys) with `quantity != 0`.

- `min_dte` — `integer`, NULLABLE  
  Minimum days-to-expiry among open option positions in strategy.

- `max_dte` — `integer`, NULLABLE  
  Maximum DTE among open options.

- `realized_pnl_to_date` — `numeric`, NULLABLE (optional v0.1)  
  Cumulative realized PnL for strategy up to `snapshot_date`.

Timestamps:

- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

We can extend this later (Greeks, margin usage, etc.) in v0.2+.

---

## 4. Row Semantics

Each row is:

> “For strategy S in account A, as of snapshot_date D, these are the key aggregates over all positions belonging to S.”

- We treat `snapshot_date` as **date-only** (daily close snapshot).
- If multiple `positions` snapshots exist for same day, we either:
  - Choose one convention (e.g. latest), or
  - Ensure the ETL only loads one snapshot per date.

---

## 5. Aggregation Logic

For a given (`account_id`, `strategy_id`, `snapshot_date`):

1. **Collect positions**:

   - All `positions` rows with:
     - `positions.account_id = account_id`
     - `positions.strategy_id = strategy_id`
     - `positions.snapshot_date = snapshot_date`
     - `positions.is_open = true` (or `quantity != 0`)

2. **total_abs_notional**

   - Sum `abs_notional` from those positions.
   - If `abs_notional` is null for some rows, best effort:
     - If `spot` and `multiplier` present:  
       `abs_notional ≈ |quantity * spot * multiplier|`
     - Else: ignore that row in the sum (or treat as 0).

3. **total_unrealized_pnl**

   - Sum `unrealized_pnl` across those positions.
   - Null-safe sum; if all null, set `NULL`.

4. **nav_at_snapshot**

   - Look up `nav_snapshots` row with:
     - `account_id`
     - `snapshot_date`
   - Use `nav_base`; if missing, `nav_at_snapshot = NULL`.

5. **pct_nav_abs_notional**

   - If `nav_at_snapshot` non-null and > 0:  
     `pct_nav_abs_notional = total_abs_notional / nav_at_snapshot`
   - Else `NULL`.

6. **num_open_positions**

   - Count of positions rows in step (1) with `quantity != 0`.
   - Optionally distinct by (`symbol`, `expiry`, `strike`, `option_right`).

7. **min_dte / max_dte**

   - For options only (`asset_class = 'OPT'` and `expiry` non-null):

     ```text
     DTE = (expiry - snapshot_date) in days (UTC, whole days)
     ```

   - `min_dte` = minimum DTE across those options.
   - `max_dte` = maximum DTE.
   - If no options, both = NULL.

8. **realized_pnl_to_date** (optional v0.1)

   - From `trades` where:
     - `strategy_id = strategy_id`
     - `trade_date <= snapshot_date`
   - Sum realized PnL measure:
     - For v0.1, a simple proxy: sum `net_amount` (with sign) for all trades tagged to the strategy that are *closing* legs.  
       (We may refine when we have explicit realized PnL fields.)

---

## 6. Idempotency & Conflict Handling

Natural key for a snapshot row:

- (`account_id`, `strategy_id`, `snapshot_date`)

Policy:

- Use `INSERT ... ON CONFLICT (account_id, strategy_id, snapshot_date) DO UPDATE`:
  - Overwrite aggregates (`total_abs_notional`, etc.) since they’re deterministic recalcs.
  - Maintain `created_at` on first insert; bump `updated_at` on update.

This allows recomputation for any date range without manual cleanup.

---

## 7. Error Handling

Skip or log a snapshot if:

- No positions found for that (account, strategy, date) **and** we are running a “rebuild from positions” job. (It might simply mean the strategy is flat that date.)

Be lenient with missing data:

- If NAV missing, just set NAV-related fields to null.
- If no DTE (no options), leave DTE metrics null.

---

## 8. Implementation Notes (for Cursor)

- Implement a pure aggregation module:

  - `lib/derived/strategyMetrics.ts`  

  Example API:

  ```ts
  export interface StrategyMetricsInput {
    accountId: string;
    strategyId: string;
    snapshotDate: string; // 'YYYY-MM-DD'
  }

  export async function computeStrategyMetrics(
    input: StrategyMetricsInput
  ): Promise<NewStrategyMetricsSnapshot>;

- Implement a batch recompute endpoint:
  - app/api/recompute/strategy-metrics/route.ts
  - Accepts query/body: date range, account, strategy filters.
  - For each combination, calls the pure functions and upserts into strategy_metrics_snapshots.