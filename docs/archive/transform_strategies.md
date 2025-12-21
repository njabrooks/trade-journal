# Transform Spec — Strategies
Version 0.1 — YYYY-MM-DD  
Author: Nick

---

See docs/data_model_v1.md for taxonomy and relationships.

## 1. Purpose

Define how **strategy instances** (rows in `strategies`) are created, updated, and backfilled.

This doc covers:

- How `strategy_templates` and `strategies` relate.
- How we populate entry fields (spot, IV, net premium, notional).
- How we set `status`, `opened_at`, `closed_at`.
- How we link strategies to accounts / underlyings / positions.

**Out of scope (separate specs):**

- `strategy_metrics_snapshots` — per-strategy/per-date aggregates.
- `triage_records` — rule-driven flags and recommendations.
- UI views (`Strategies_Current`, `Strategies_State`) — SQL/API-level joins.

---

## 2. Source Data

### 2.1 Excel (v0 backfill)

From `WeeklyOptionsReview.xlsx` we have three relevant sheets:

1. **`Strategies` / `Strategies_Entry`**  
   Manually-maintained information about each strategy instance:
   - `StrategyKey`
   - `StrategyLabel`
   - `Ticker` / `UnderlyingSymbol`
   - `Account` / `ClientAccountID`
   - `OpenedAt` (or entry date)
   - `ClosedAt` (optional)
   - `Status` (e.g. Open / Closed / Rolled)
   - Entry notes / thesis / rules (text fields)
   - Sometimes: entry IV, net premium, entry notional.

2. **`Positions_Current`**  
   Latest snapshot of positions, including:
   - `StrategyKey`
   - `StrategyLabel`
   - `SnapshotDate`
   - Per-leg quantities / expiries / DTE.

3. **`Trades_DB` / `Flex_Raw_Trades`**  
   Complete executions tagged by:
   - `ClientAccountID`
   - `Symbol` / `UnderlyingSymbol`
   - `TradeDate`, `DateTime`
   - Buy / Sell, Quantity, TradePrice
   - These are already normalized into the `trades` table.

In v0.1 we primarily:

- **Backfill strategies** from the Excel `Strategies` sheet.
- Derive some entry metrics from `trades` as a best-effort enhancement.

---

## 3. Target Schemas

### 3.1 `strategy_templates`

From `db/schema.ts`:

- `id` — `uuid`, PK
- `strategy_key` — `text`, unique (canonical key, e.g. `GLXY_CS_2025Q1`)
- `label` — `text`, human-readable name
- `underlying_id` — FK → `underlyings.id`
- `min_dte`, `max_dte` — integer (optional)
- `default_time_horizon` — text
- `notes` — text
- Timestamps (`created_at`, `updated_at`)

Template rows represent **canonical patterns** (“90d short put ladder”), not specific trades.

### 3.2 `strategies`

From `db/schema.ts`:

- `id` — `uuid`, PK
- `strategy_template_id` — FK → `strategy_templates.id`, NOT NULL
- `strategy_key` — `text`, NOT NULL (matches Excel `StrategyKey`)
- `account_id` — FK → `accounts.id`, nullable (in practice almost always set)
- `opened_at` — `timestamptz`, NOT NULL
- `closed_at` — `timestamptz`, NULLABLE
- `status` — `text`, NOT NULL, default `'open'`
- **Entry context:**
  - `entry_spot` — `numeric`
  - `entry_iv30` — `numeric`
  - `net_premium` — `numeric`
  - `entry_notional` — `numeric`
  - `time_horizon` — `text`
  - `thesis` — `text`
  - `entry_context` — `text`
  - `profit_rules` — `text`
  - `defense_rules` — `text`
  - `time_rules` — `text`
  - `exit_criteria` — `text`
- Aggregated metrics (populated via separate pipeline, not here):
  - `total_abs_notional`
  - `total_unrealized_pnl`
- Timestamps (`created_at`, `updated_at`)

Each row is a **live strategy instance** with:

- A stable `strategy_key` used to associate positions/trades/triage.
- Entry metadata you care about for journaling.

---

## 4. Column Mapping & Creation Logic

### 4.1 Keys & Identity

#### `strategies.strategy_key`

- **Source:** Excel `StrategyKey`.
- **Logic:**
  - Direct copy as text.
  - Must be **unique** per live strategy instance.
  - Used as a join key in:
    - `positions_current` (via `StrategyKey` column)
    - `triage_records`
    - `strategy_metrics_snapshots`

#### `strategy_templates.strategy_key` vs `strategies.strategy_key`

- `strategy_templates.strategy_key` is **canonical**, e.g. `"CC_GLXY_90D"`.
- `strategies.strategy_key` is **instance-level**, but can:
  - Either reuse the template key and distinguish via `id` and `account_id`, or
  - Encode underlying / vintage, e.g. `"GLXY_CC_2025Q1"`.

For v0.1:

- We assume Excel `StrategyKey` has already encoded both template and instance identity.
- We create:
  - A `strategy_templates` row if none exists with that key.
  - A `strategies` row per Excel `StrategyKey` row, referencing that template.

#### `strategies.account_id`

- **Source:** Excel `ClientAccountID` (or similar) on the strategies sheet.
- **Logic:**
  - Resolve via `accounts.broker_account_id`.
  - If no match, set `NULL` but log; in production we’d rather fail.

---

### 4.2 Template linkage

#### `strategies.strategy_template_id`

- **Source:** `strategy_templates` table
- **Logic:**
  1. Determine **template key**:
     - In v0.1 we simply use `StrategyKey` as the template key as well.
     - Later we can split into template vs instance naming if desired.
  2. If `strategy_templates.strategy_key = StrategyKey` exists:
     - Use its `id`.
  3. Else:
     - Create a new `strategy_templates` row:
       - `strategy_key = StrategyKey`
       - `label = StrategyLabel` (if present)
       - `underlying_id` from `Ticker` / `UnderlyingSymbol` lookup in `underlyings`.
       - Optional `min_dte`, `max_dte`, `default_time_horizon` from simple heuristics or left null.
     - Use the new template `id`.

---

### 4.3 Temporal fields & status

#### `strategies.opened_at`

- **Preferred source:** Excel `OpenedAt` / `EntryDate` column.
- **Fallback:** earliest trade date for this strategy from `trades`.

**Logic:**

1. If Excel `OpenedAt` present:
   - Parse as date → `timestamptz` at `00:00:00` UTC (or local midnight).
2. Else:
   - Query `trades` where:
     - `account_id = resolved account`
     - `strategy_key = StrategyKey` (once you start tagging trades with strategies)
   - Use `min(trade_date)`.
3. If neither available, reject or set to earliest `snapshot_date` where positions for this `StrategyKey` appear.

#### `strategies.closed_at` & `status`

- **Source:** Excel `Status`, `ClosedAt` columns.
- **Logic:**
  - If `Status` equals `"Closed"` / `"Rolled"` / `"Expired"` (case-insensitive):
    - `status = lower(Status)` (or map to canonical enum).
    - `closed_at` = parsed `ClosedAt` if present, else `NULL`.
  - If `Status` missing or `"Open"`:
    - `status = 'open'`
    - `closed_at = NULL`.

Later we can auto-close strategies when:

- Positions for a given `StrategyKey` are zero across all underlyings, and
- No new trades are seen after a configurable grace period.

---

### 4.4 Entry context fields

For v0.1 we take a pragmatic approach:

#### `strategies.entry_spot`

- **Primary source:** Excel `EntrySpot` (if you recorded it).
- **Fallback:**  
  - Spot from `underlyings_iv_history` at `opened_at` date, or  
  - First `mtm_snapshots` or `positions` snapshot for this strategy.

#### `strategies.entry_iv30`

- **Primary source:** Excel `EntryIV30` (if present).
- **Fallback:**  
  - `iv30` from `underlyings_iv_history` at `opened_at` date for the underlying.

#### `strategies.net_premium`

- **Source (v0.1):**  
  - If Excel has a field (e.g. `NetPremium` or `EntryCreditDebit`), use it.
  - Else derive from `trades`:
    - Sum `net_amount` (or `gross_amount` minus fees) across all trades on `opened_at` date for instruments in this strategy.

#### `strategies.entry_notional`

- **Source:**  
  - Either Excel field if present, or
  - Sum `abs_notional` from `positions` at the earliest snapshot date for this `StrategyKey`.

#### `strategies.time_horizon`

- **Source:** Excel `TimeHorizon` / free text.
- **Logic:** Direct copy; optional normalization later.

#### `strategies.thesis`, `entry_context`, `profit_rules`, `defense_rules`, `time_rules`, `exit_criteria`

- **Source:** Corresponding free text columns in Excel (if present).
- **Logic:** Direct copy into the appropriate text fields.
- If absent, leave `NULL` and populate manually via the app going forward.

---

## 5. Idempotency & Conflict Handling

Natural keys:

- Unique **strategy instance** is identified by `strategy_key`.  
- Templates are identified by `strategy_templates.strategy_key`.

When backfilling:

- For each Excel `StrategyKey`:
  - `INSERT ... ON CONFLICT (strategy_key) DO UPDATE` in `strategies`.
  - For templates: `INSERT ... ON CONFLICT (strategy_key) DO UPDATE` in `strategy_templates`.

Rules:

- On conflict for `strategies`, we may:
  - Preserve manual text fields (thesis, rules) from DB.
  - Overwrite “derived” fields (entry_notional, entry_spot) if we trust the new calculation more.
- v0.1: simplest is “upsert with Excel as source of truth” for backfill run.

---

## 6. Error Handling & Validation

Reject / skip a strategy row if:

- `StrategyKey` missing or blank.
- `OpenedAt` cannot be parsed and no fallback trade/snapshot date can be found.
- `ClientAccountID` cannot be resolved to an `accounts` row (in production; for historical import you may allow null and log).

Log (but do not reject) if:

- Underlying symbol cannot be mapped to an `underlyings` row (template still created, underlying_id null).
- Derived metrics (entry_iv30, net_premium, entry_notional) can’t be computed; they remain null.

---

## 7. Implementation Notes (for Cursor)

Implementation should be split as:

1. **Backfill script:**  
   - `scripts/backfill_strategies_from_excel.ts`
   - Reads the Excel `Strategies` sheet.
   - For each row, constructs a `NewStrategy` object according to this spec.
   - Resolves account / underlying / template IDs.
   - Upserts into `strategy_templates` and `strategies`.

2. **App-level creation:**  
   - App UI: `app/(app)/strategies/new` to create strategies **without Excel** going forward.
   - `POST /api/strategies`:
     - Accepts a payload aligned with `strategies` schema.
     - Applies the same rules for linking to templates and accounts.

3. **No metrics or triage here:**  
   - `strategies.total_abs_notional` and `strategies.total_unrealized_pnl` should be updated only by:
     - `strategy_metrics_snapshots` pipeline (separate `transform_strategy_metrics.md`).
   - Triage flags live in `triage_records`, not in `strategies`.

Any deviations from this doc should be captured in a new version, e.g. `Version 0.2`.

