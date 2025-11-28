# Database Schema v1
Version 0.1 — YYYY-MM-DD  
Author: Nick

---

## 1. Purpose

This document defines the initial relational schema for the Trade Journal / Weekly Options Review app.

It translates the logical structure of `WeeklyOptionsReview.xlsx` (sheets such as `Trades_DB`, `Positions_DB`, `Strategies`, `Strategies_Entry`, `Triage`, `Blotter`, etc.) into a normalized Postgres schema suitable for Supabase + Drizzle.

This is **v1**: the goal is to cover the core data model required for:

- Mapping trades and positions to **strategies**
- Tracking **P&L** and **exposure** over time
- Running a **triage + review workflow** with an auditable blotter

We can add more tables/columns in later revisions.

---

## 2. Design Principles

- Use **UUID primary keys** (`id uuid default gen_random_uuid()`) for all core tables.
- Use **snake_case** for table and column names.
- Keep a clear distinction between:
  - **Raw ingestion / broker IDs** (e.g. IBKR `TransactionID`, `ClientAccountID`)
  - **Internal IDs and relationships** (strategy, account, position, underlying)
- Prefer **append-only** history tables (snapshots, blotter actions) over “overwrite in place”, to preserve path dependence.
- Derived metrics (e.g. worst drawdown) can be added later; v1 focuses on the raw ingredients.

---

## 3. Entity Overview

| Table                    | Purpose                                                                   | Key Relationships                                  |
|--------------------------|---------------------------------------------------------------------------|---------------------------------------------------|
| `accounts`               | Brokerage accounts (IBKR, others)                                        | 1-to-many `trades`, `positions`, `nav_snapshots`  |
| `underlyings`           | Instruments being traded (GLXY, TSLA, IBIT, etc.)                        | 1-to-many `strategy_templates`, `positions`       |
| `underlyings_iv_history`| Daily IV/ATR/RV snapshots for underlyings                                | Many-to-1 `underlyings`                           |
| `strategy_templates`     | Canonical strategy definitions (from `Strategies` sheet)                 | 1-to-many `strategies`                            |
| `strategies`             | Live strategy instances with entry thesis & rules                        | Many-to-1 `strategy_templates`, many-to-1 `accounts` |
| `trades`                 | Normalized trade records (from `Trades_DB`)                              | Many-to-1 `accounts`, optional many-to-1 `strategies` |
| `positions`              | Open/closed positions (from `Positions_DB` / `Positions_Current`)        | Many-to-1 `accounts`, optional many-to-1 `strategies` |
| `mtm_snapshots`          | Daily MTM records for positions / symbols (from `MTM_DB`)                | Many-to-1 `accounts`, optional FK to `positions`  |
| `nav_snapshots`          | Daily account-level NAV (from `NAV_DB`)                                  | Many-to-1 `accounts`                              |
| `triage_records`         | Per-snapshot triage classification (from `Triage`)                       | Many-to-1 `strategies` and/or `positions`         |
| `blotter_actions`        | Journal of actions/decisions (from `Blotter`)                            | Many-to-1 `strategies`                            |

Optional / later:

- `exercises` (from `Exercises_DB`)
- `cash_flows` (from `Cash_DB`)
- Raw staging tables for Flex CSVs

---

## 4. Table Definitions

### 4.1 `accounts`

Represents a brokerage account (e.g. IBKR account), mapping from `ClientAccountID` in Flex.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `broker_name` — `text`, NOT NULL  
  e.g. `"IBKR"`
- `broker_account_id` — `text`, NOT NULL, UNIQUE  
  Maps to Flex `ClientAccountID`
- `base_currency` — `text`, 3-char currency code, e.g. `"USD"`, `"GBP"`
- `label` — `text`, NULLABLE  
  Friendly label for UI (“IBKR Main”, “Crypto Margin”)
- `created_at` — `timestamptz`, NOT NULL, default `now()`
- `updated_at` — `timestamptz`, NOT NULL, default `now()`

---

### 4.2 `underlyings`

Derived from `Underlyings` sheet.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `ticker` — `text`, NOT NULL, UNIQUE  
  e.g. `"GLXY"`, `"TSLA"`, `"IBIT"`
- `name` — `text`, NULLABLE  
  e.g. “Galaxy Digital Holdings”
- `asset_class` — `text`, NULLABLE  
  e.g. `"EQ"`, `"ETF"`, `"CRYPTO"`
- `base_currency` — `text`, NULLABLE
- **Spot / IV snapshot (optional, for most recent)**  
  - `spot` — `numeric`, NULLABLE  
  - `iv30` — `numeric`, NULLABLE  
  - `atr20` — `numeric`, NULLABLE  
  - `rv20` — `numeric`, NULLABLE  
- `next_earnings_date` — `date`, NULLABLE  
- `next_ex_div_date` — `date`, NULLABLE
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

### 4.3 `underlyings_iv_history`

Historical vol/liquidity context for the underlying (from `Underlyings_IVHist`).

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `underlying_id` — `uuid`, FK → `underlyings.id`, NOT NULL
- `as_of_date` — `date`, NOT NULL
- `spot` — `numeric`, NULLABLE
- `iv30` — `numeric`, NULLABLE
- `atr20` — `numeric`, NULLABLE
- `rv20` — `numeric`, NULLABLE
- `created_at` — `timestamptz`, default `now()`

**Constraints**

- UNIQUE (`underlying_id`, `as_of_date`)

---

### 4.4 `strategy_templates`

Maps to the “static” strategy definitions in `Strategies` + `Strategy_Keys`.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `strategy_key` — `text`, NOT NULL, UNIQUE  
  e.g. `"GLXY-STK"`, `"GLXY-40-60-BULLCALL"`
- `label` — `text`, NOT NULL  
  Human-readable, e.g. “GLXY Core Stock”, “GLXY 40/60 Bull Call”
- `underlying_id` — `uuid`, FK → `underlyings.id`, NOT NULL
- `min_dte` — `integer`, NULLABLE
- `max_dte` — `integer`, NULLABLE
- `default_time_horizon` — `text`, NULLABLE  
  e.g. `"3-6m"`, `"12m+"`
- `notes` — `text`, NULLABLE  
  Free-form description of intent/usage.
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

### 4.5 `strategies`

Represents a **live instantiation** of a strategy: one row per actual trade idea with an entry date, thesis, and rules. Combines content from `Strategies` and `Strategies_Entry`.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `strategy_template_id` — `uuid`, FK → `strategy_templates.id`, NOT NULL
- `strategy_key` — `text`, NOT NULL  
  Denormalized from `strategy_templates.strategy_key` for easy filtering
- `account_id` — `uuid`, FK → `accounts.id`, NULLABLE  
  If this strategy is specific to one account; nullable if cross-account
- `opened_at` — `timestamptz`, NOT NULL  
  Maps to `EntryDate`
- `closed_at` — `timestamptz`, NULLABLE
- `status` — `text`, NOT NULL, default `'open'`  
  Enum-like: `'draft' | 'planned' | 'open' | 'active' | 'close_candidate' | 'closed' | 'archived'` (enforced in code or later via enum)
- **Entry context** (from `Strategies_Entry`)  
  - `entry_spot` — `numeric`, NULLABLE
  - `entry_iv30` — `numeric`, NULLABLE
  - `net_premium` — `numeric`, NULLABLE
  - `entry_notional` — `numeric`, NULLABLE
  - `time_horizon` — `text`, NULLABLE
  - `thesis` — `text`, NULLABLE
  - `entry_context` — `text`, NULLABLE
  - `profit_rules` — `text`, NULLABLE
  - `defense_rules` — `text`, NULLABLE
  - `time_rules` — `text`, NULLABLE
  - `exit_criteria` — `text`, NULLABLE
- **Aggregated metrics (updated periodically)**  
  - `total_abs_notional` — `numeric`, NULLABLE  
    (from `Strategies.TotalAbsNotional`)
  - `total_unrealized_pnl` — `numeric`, NULLABLE  
    (from `Strategies.TotalUnrealizedPnL`)
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

### 4.6 `trades`

Normalized trade records based on `Trades_DB`.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL  
  (from `ClientAccountID`)
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE  
  May be NULL until mapped.
- `broker_transaction_id` — `text`, NULLABLE, UNIQUE where present  
  Maps to `TransactionID`
- `broker_exec_id` — `text`, NULLABLE  
  Maps to `IBExecID`
- `asset_class` — `text`, NULLABLE  
  Maps to `AssetClass`
- `symbol` — `text`, NOT NULL
- `conid` — `bigint`, NULLABLE  
  IBKR `Conid`
- `currency` — `text`, NULLABLE  
  Maps to `CurrencyPrimary`
- `fx_rate_to_base` — `numeric`, NULLABLE  
  `FXRateToBase`
- `trade_date` — `timestamptz`, NOT NULL  
  Combine `TradeDate` & `TradeTime` if needed
- `side` — `text`, NOT NULL  
  `'BUY' | 'SELL'` (from sign of quantity or explicit column)
- `quantity` — `numeric`, NOT NULL
- `price` — `numeric`, NOT NULL
- `gross_amount` — `numeric`, NULLABLE
- `net_amount` — `numeric`, NULLABLE
- `fees` — `numeric`, NULLABLE  
  Commissions + other fees
- `order_type` — `text`, NULLABLE  
  From `OrderType`
- `exchange` — `text`, NULLABLE  
  From `ListingExchange`
- `raw_row` — `jsonb`, NULLABLE  
  Optional; store untouched raw row for debugging.
- `created_at` — `timestamptz`, default `now()`

Indexes to consider:

- INDEX on (`account_id`, `trade_date`)
- INDEX on (`strategy_id`, `trade_date`)

---

### 4.7 `positions`

Represents open/closed positions as a normalized equivalent of `Positions_DB` / `Positions_Current`.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE
- `underlying_id` — `uuid`, FK → `underlyings.id`, NULLABLE
- `asset_class` — `text`, NULLABLE
- `symbol` — `text`, NOT NULL
- `conid` — `bigint`, NULLABLE
- `expiry` — `date`, NULLABLE  
  For options/futures
- `strike` — `numeric`, NULLABLE
- `option_right` — `text`, NULLABLE  
  `'C' | 'P'` for calls/puts
- `multiplier` — `numeric`, NULLABLE
- `side` — `text`, NULLABLE  
  `'LONG' | 'SHORT'`
- `quantity` — `numeric`, NOT NULL  
  Current open quantity
- `avg_price` — `numeric`, NULLABLE
- `open_date` — `timestamptz`, NULLABLE
- `close_date` — `timestamptz`, NULLABLE
- `position_type` — `text`, NULLABLE  
  e.g. `"stock"`, `"option_long"`, `"option_short"`
- `is_open` — `boolean`, NOT NULL, default `true`
- **Mark-to-market fields (current)**  
  - `spot` — `numeric`, NULLABLE
  - `intrinsic` — `numeric`, NULLABLE
  - `extrinsic` — `numeric`, NULLABLE
  - `abs_notional` — `numeric`, NULLABLE
  - `unrealized_pnl` — `numeric`, NULLABLE
- `snapshot_date` — `date`, NULLABLE  
  For mapping from `Positions_Current`
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

### 4.8 `mtm_snapshots`

Derived from `MTM_DB`: daily MTM/PnL per symbol/position.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `snapshot_date` — `date`, NOT NULL
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `position_id` — `uuid`, FK → `positions.id`, NULLABLE  
  If resolvable; else null + keyed by symbol/conid
- `symbol` — `text`, NOT NULL
- `asset_class` — `text`, NULLABLE
- `currency` — `text`, NULLABLE
- `quantity` — `numeric`, NULLABLE
- `mark_price` — `numeric`, NULLABLE
- `market_value` — `numeric`, NULLABLE
- `unrealized_pnl` — `numeric`, NULLABLE
- `realized_pnl` — `numeric`, NULLABLE
- `transaction_mtm_pnl` — `numeric`, NULLABLE
- `prior_open_mtm_pnl` — `numeric`, NULLABLE
- `commissions` — `numeric`, NULLABLE
- `total` — `numeric`, NULLABLE
- `raw_row` — `jsonb`, NULLABLE
- `created_at` — `timestamptz`, default `now()`

Indexes:

- INDEX (`account_id`, `snapshot_date`)
- INDEX (`position_id`, `snapshot_date`)

---

### 4.9 `nav_snapshots`

From `NAV_DB`: account-level equity curve.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `report_date` — `date`, NOT NULL
- `currency` — `text`, NOT NULL  
  From `CurrencyPrimary`
- `total` — `numeric`, NOT NULL
- `total_long` — `numeric`, NULLABLE
- `total_short` — `numeric`, NULLABLE
- `created_at` — `timestamptz`, default `now()`

Constraints:

- UNIQUE (`account_id`, `report_date`)

---

### 4.10 `triage_records`

Derived from `Triage` sheet; per snapshot and instrument/strategy, describes flags and recommended action.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `snapshot_date` — `date`, NOT NULL  
  From `SnapshotDate`
- `account_id` — `uuid`, FK → `accounts.id`, NULLABLE
- `position_id` — `uuid`, FK → `positions.id`, NULLABLE
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE
- `symbol` — `text`, NOT NULL
- `asset_class` — `text`, NULLABLE
- `dte_bucket` — `text`, NULLABLE  
  From `DTE_Bucket`, e.g. `"0-30"`, `"30-90"`, `">90"`
- `flag_dte_short` — `boolean`, NULLABLE
- `flag_dte_long` — `boolean`, NULLABLE
- `flag_itm` — `text`, NULLABLE  
  e.g. `"Call ITM"`, `"Put ITM"`, `"OTM"`
- `sigma_to_strike` — `numeric`, NULLABLE
- `flag_sigma_0_5` — `boolean`, NULLABLE
- `flag_sigma_1_0` — `boolean`, NULLABLE
- `flag_assignment` — `boolean`, NULLABLE
- `unrealized_pnl` — `numeric`, NULLABLE
- `abs_notional` — `numeric`, NULLABLE
- `triage_action` — `text`, NULLABLE  
  From `Action` column, e.g. `"Hold"`, `"Close"`, `"Manage"`
- `notes` — `text`, NULLABLE
- `created_at` — `timestamptz`, default `now()`

Indexes:

- INDEX (`snapshot_date`, `triage_action`)
- INDEX (`strategy_id`, `snapshot_date`)

---

### 4.11 `blotter_actions`

Directly reflects the `Blotter` sheet: an append-only log of decisions and actions, linked to strategies.

**Columns**

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `blotter_id` — `text`, NOT NULL, UNIQUE  
  From `BlotterID` (e.g. `"002_45984_GLXY 260918"`)
- `action_date` — `date`, NOT NULL  
  From `ActionDate`
- `snapshot_date` — `date`, NULLABLE  
  From `SnapshotDate`, state of world when decision was made
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE
- `strategy_key` — `text`, NULLABLE  
  From `StrategyKey`
- `strategy_label` — `text`, NULLABLE  
  From `StrategyLabel`
- `ticker` — `text`, NULLABLE
- `strategy_type_at_action` — `text`, NULLABLE
- `state_code_at_action` — `text`, NULLABLE  
  From `StateCode_at_Action`
- `triage_flag_at_action` — `text`, NULLABLE  
  From `TriageFlag_at_Action`
- `reason_code` — `text`, NULLABLE  
  From `ReasonCode` (categorical reason for action)
- `action_class` — `text`, NULLABLE  
  From `ActionClass` (e.g. `"ROLL"`, `"CLOSE"`, `"ADD"`)
- `action_detail` — `text`, NULLABLE  
  Free-form detail (e.g. which leg was rolled)
- `leg_scope` — `text`, NULLABLE  
  From `LegScope` (e.g. `"all legs"`, `"short calls"`)
- `execution_ref` — `text`, NULLABLE  
  From `ExecutionRef` (could map to trade IDs)
- `qty_change` — `numeric`, NULLABLE
- `premium_change` — `numeric`, NULLABLE
- `realized_pnl` — `numeric`, NULLABLE
- `size_before_notional` — `numeric`, NULLABLE
- `size_after_notional` — `numeric`, NULLABLE
- `risk_notes_at_action` — `text`, NULLABLE
- `notes` — `text`, NULLABLE
- `follow_up_required` — `boolean`, NULLABLE
- `follow_up_date` — `date`, NULLABLE
- `completed` — `boolean`, NULLABLE
- `created_at` — `timestamptz`, default `now()`

Indexes:

- INDEX (`strategy_id`, `action_date`)
- INDEX (`follow_up_required`, `follow_up_date`)

---

## 5. Optional / Later Tables

We may add these in v1.1+:

- `exercises` — from `Exercises_DB`
- `cash_flows` — from `Cash_DB`
- `raw_flex_trades` / `raw_flex_positions` — if we want persistent raw ingestion logs

These should be added as separate sections in a future schema version.

---

## 6. Mapping from Excel Sheets to Tables

- `Underlyings` → `underlyings`
- `Underlyings_IVHist` → `underlyings_iv_history`
- `Strategy_Keys` + `Strategies` → `strategy_templates`
- `Strategies_Entry` → `strategies` (entry fields)
- `Portfolio` → used to derive `accounts` (and possibly portfolio groupings later)
- `Trades_DB` → `trades`
- `Positions_DB` / `Positions_Current` → `positions`
- `MTM_DB` → `mtm_snapshots`
- `NAV_DB` → `nav_snapshots`
- `Triage` → `triage_records`
- `Blotter` → `blotter_actions`

---

## 7. Implementation Notes (for Cursor / MCP / Drizzle)

- In Supabase:
  - Create tables according to the definitions above (UUID PKs, FKs as stated).
  - Use `gen_random_uuid()` as default for `uuid` IDs.
- In Drizzle (`db/schema.ts`):
  - Mirror table names and columns exactly.
  - Use `uuid("id").defaultRandom().primaryKey()` for IDs.
  - Add TypeScript types via `export type Xxx = typeof xxx.$inferSelect;`.
- MCP Supabase:
  - Can be used to:
    - Apply migrations for these tables
    - Generate types that can be imported where needed

This schema should be enough for:

- Ingesting real Flex data → `trades`, `positions`, `mtm_snapshots`, `nav_snapshots`
- Linking everything to **strategies**
- Running a **triage queue** and **blotter** over that data
