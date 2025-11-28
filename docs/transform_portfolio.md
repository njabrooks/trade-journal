# Transform Spec — Portfolio Snapshots
Version 0.1 — YYYY-MM-DD  
Author: Nick

See also: `docs/data_model_v1.md`, `docs/transform_positions.md`, `docs/transform_mtm.md`, `docs/transform_nav.md`.

---

## 1. Purpose

Define how to compute **portfolio-level aggregates** into `portfolio_snapshots`.

These snapshots:

- Provide **account-level** exposure & PnL per day.
- Optionally provide **per-underlying** aggregates for the latest view.
- Back the “Portfolio” sheet / UI: total exposure, top underlyings, PnL breakdown.

`portfolio_snapshots` is a derived facts table (Layer C), not a view.

---

## 2. Source Data

### 2.1 positions

From `positions`:

- `account_id`
- `strategy_id` (nullable)
- `underlying_id` (nullable)
- `snapshot_date`
- `asset_class`
- `abs_notional`
- `unrealized_pnl`

Optionally, we may also use:

- `symbol`, `expiry`, `option_right`, `side` (for debugging/filters).

### 2.2 nav_snapshots

From `nav_snapshots`:

- `account_id`
- `snapshot_date`
- `nav_base` (NAV in base currency)

---

## 3. Target Schema — `portfolio_snapshots`

**Proposed** schema (to be defined/checked in `db/schema.ts`):

- `id` — `uuid`, PK
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `snapshot_date` — `date`, NOT NULL

Aggregation level:

- `level` — `text`, NOT NULL, ENUM-like:  
  - `'account'` — one row per (account, date)  
  - `'underlying'` — one row per (account, date, underlying)

- `underlying_id` — `uuid`, FK → `underlyings.id`, NULLABLE  
  - `NULL` when `level = 'account'`.  
  - NON-NULL when `level = 'underlying'`.

Metrics:

- `total_abs_notional` — `numeric`, NULLABLE  
- `total_unrealized_pnl` — `numeric`, NULLABLE  
- `nav_at_snapshot` — `numeric`, NULLABLE  
- `pct_nav_abs_notional` — `numeric`, NULLABLE  

Optional breakdowns (v0.1):

- `abs_stock_notional` — `numeric`, NULLABLE  
- `abs_option_notional` — `numeric`, NULLABLE  

Timestamps:

- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

## 4. Row Semantics

- A row with `level = 'account'` and `underlying_id = NULL`:

  > “For account A, as of date D, this is the total exposure/PnL across *all* instruments.”

- A row with `level = 'underlying'` and non-null `underlying_id`:

  > “For account A, as of date D, this is the total exposure/PnL for underlying U only.”

UI views like “Portfolio” will typically:

- Load `level = 'account'` to show overall totals.
- Load `level = 'underlying'` rows (for the same date) to show a ranking of underlyings.

---

## 5. Aggregation Logic

### 5.1 Account-level rows (`level = 'account'`)

For each (`account_id`, `snapshot_date`):

1. Collect positions:

   - All `positions` rows with:
     - matching `account_id`
     - matching `snapshot_date`
     - `is_open = true` (or `quantity != 0`)

2. `total_abs_notional`

   - Sum `abs_notional` across all these positions.

3. `total_unrealized_pnl`

   - Sum `unrealized_pnl` across all positions.

4. `abs_stock_notional`

   - Sum `abs_notional` where `asset_class = 'STK'`.

5. `abs_option_notional`

   - Sum `abs_notional` where `asset_class = 'OPT'`.

6. `nav_at_snapshot`

   - From `nav_snapshots` with same `account_id` + `snapshot_date`.

7. `pct_nav_abs_notional`

   - If `nav_at_snapshot > 0`:
     - `pct_nav_abs_notional = total_abs_notional / nav_at_snapshot`
   - Else `NULL`.

### 5.2 Underlying-level rows (`level = 'underlying'`)

For each (`account_id`, `snapshot_date`, `underlying_id`) combination:

1. Collect positions:

   - Same filter as above but add `underlying_id` match.

2. Compute:

   - `total_abs_notional` = sum of `abs_notional` for these positions.
   - `total_unrealized_pnl` = sum of `unrealized_pnl`.
   - `abs_stock_notional` = sum where `asset_class = 'STK'`.
   - `abs_option_notional` = sum where `asset_class = 'OPT'`.
   - `nav_at_snapshot` from account NAV (same as account-level).
   - `pct_nav_abs_notional` as above.

We may only build `underlying` rows for the **latest** snapshot in v0.1 to keep storage small, or for all dates; spec supports both.

---

## 6. Idempotency & Conflict Handling

Natural keys:

- Account-level: (`account_id`, `snapshot_date`, `level = 'account'`)
- Underlying-level: (`account_id`, `snapshot_date`, `underlying_id`, `level = 'underlying'`)

Policy:

- Use `INSERT ... ON CONFLICT (...) DO UPDATE` to recompute safely.
- Overwrite all aggregates in an upsert (they are pure functions of underlying data).

---

## 7. Error Handling

If:

- No positions exist for a given (account, date), then:
  - We can either skip generating a row, or produce one with zeros and `nav_at_snapshot` only.
  - v0.1: simplest is to **skip** and derive presence from `nav_snapshots` if needed.

If NAV missing:

- still compute notional and PnL; NAV-derived fields become null.

---

## 8. Implementation Notes (for Cursor)

- Implement a pure aggregation module:

  - `lib/derived/portfolio.ts`  

  Example:

  ts
  export async function computePortfolioSnapshotsForDate(
    snapshotDate: string // 'YYYY-MM-DD'
  ): Promise<NewPortfolioSnapshot[]> { ... }

  
- Implement a batch recompute endpoint:
  - app/api/recompute/portfolio/route.ts

Do not add new columns to positions or nav_snapshots from here; this module only reads them.