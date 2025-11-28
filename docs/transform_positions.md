# Transform Spec — Positions
Version 0.2 — YYYY-MM-DD  
Author: Nick

See docs/data_model_v1.md for taxonomy and relationships.

Source data:  
- `Flex_Raw_Positions` (raw IBKR Flex export; POST/EQUT/MTMP sections)  
- `Positions_DB` (historical positions snapshot, derived from POST)  
- `Positions_Current` (latest positions snapshot, with strategy & triage context)

Target table:  
- `positions` (Supabase Postgres, Drizzle schema)

---

## 1. Purpose

Define exactly how **position records** are ingested and normalized from:

- IBKR Flex **positions** exports (section `POST`), and  
- The Excel workbook (`Positions_DB`, `Positions_Current`)

into the `positions` table.

This document is the **single source of truth** for:

- Column mappings from Flex/Excel → `positions`
- Derivation rules (e.g. `side`, `position_type`, `is_open`)
- How we handle snapshot dates and mark-to-market fields
- What is intentionally **not** mapped in v1

For v1, each row in `positions` is a **snapshot of a position as of `snapshot_date`**, not a full lifecycle. Path-dependent metrics live primarily in `mtm_snapshots` and `nav_snapshots`.

---

## 2. Source Data

### 2.1 Flex_Raw_Positions (raw Flex export – POST section)

The Flex positions query is a **multi-section** CSV:

- Column 0: record type — `"HEADER"` or `"DATA"`
- Column 1: section code — e.g. `"POST"`, `"EQUT"`, `"MTMP"`

For **positions**, we only care about:

- `HEADER,POST,...` — defines the field list for POST
- `DATA,POST,...` — one row per position snapshot

For POST:

- `fieldsHeader = headerRow.slice(2)` (columns 2+ are field names)
- Each DATA row:

  - `fields = dataRow.slice(2)`  
  - `record[fieldName] = fields[i]`

Relevant POST header columns (subset):

- `ReportDate` (statement date; used as snapshot date)
- `ClientAccountID`
- `CurrencyPrimary`
- `FXRateToBase`
- `AssetClass`
- `SubCategory`
- `Symbol`
- `Description`
- `Conid`
- `ListingExchange`
- `UnderlyingSymbol`
- `Multiplier`
- `Strike`
- `Expiry`
- `Put/Call`
- `Quantity`
- `MarkPrice`
- `PositionValue`
- `OpenPrice`
- `CostBasisPrice`
- `CostBasisMoney`
- `PercentOfNAV`
- `FifoPnlUnrealized`
- `Side` (e.g. `"Long"`, `"Short"`)
- `OpenDateTime`
- `Code`
- (plus any trailing/unused fields)

> Note: in the old Sheets pipeline, `ReportDate` from POST became `SnapshotDate` in `Positions_DB`. In the new app, we skip the intermediate sheet and map **directly from POST → `positions`**, applying the same semantics.

---

### 2.2 Positions_DB (historical snapshots, Excel)

Header columns (relevant subset):

- `SnapshotDate`
- `ClientAccountID`
- `CurrencyPrimary`
- `FXRateToBase`
- `AssetClass`
- `SubCategory`
- `Symbol`
- `Description`
- `Conid`
- `ListingExchange`
- `UnderlyingSymbol`
- `Multiplier`
- `Strike`
- `Expiry`
- `Put/Call`
- `ReportDate`
- `Quantity`
- `MarkPrice`
- `PositionValue`
- `OpenPrice`
- `CostBasisPrice`
- `CostBasisMoney`
- `PercentOfNAV`
- `FifoPnlUnrealized`
- `Side`
- `OpenDateTime`
- `Code`

Each row = one position in one account as of `SnapshotDate`.

Logically, a `Positions_DB` row is just:

- `SnapshotDate` + POST fields, cleaned.

---

### 2.3 Positions_Current (latest snapshot + strategy context)

Header columns (relevant subset):

- `SnapshotDate`
- `ClientAccountID`
- `CurrencyPrimary`
- `FXRateToBase`
- `AssetClass`
- `SubCategory`
- `Symbol`
- `Description`
- `Conid`
- `ListingExchange`
- `UnderlyingSymbol`
- `Multiplier`
- `Strike`
- `Expiry`
- `Put/Call`
- `Quantity`
- `MarkPrice`
- `PositionValue`
- `CostBasisPrice`
- `FifoPnlUnrealized`
- `Side`
- `OpenDateTime`
- `StrategyKey`
- `StrategyLabel`
- (plus many triage/flag/sigma columns)

For `positions` we only care about:

- The shared fields above, plus
- `StrategyKey` / `StrategyLabel` for linking to `strategies`.

Triage fields will feed other tables later.

---

## 3. Target Schema — `positions`

Logical definition from `db_schema_v1.md`:

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE
- `underlying_id` — `uuid`, FK → `underlyings.id`, NULLABLE
- `asset_class` — `text`, NULLABLE
- `symbol` — `text`, NOT NULL
- `conid` — `bigint`, NULLABLE
- `expiry` — `date`, NULLABLE
- `strike` — `numeric`, NULLABLE
- `option_right` — `text`, NULLABLE (`'C' | 'P'`)
- `multiplier` — `numeric`, NULLABLE
- `side` — `text`, NULLABLE (`'LONG' | 'SHORT'`)
- `quantity` — `numeric`, NOT NULL
- `avg_price` — `numeric`, NULLABLE
- `open_date` — `timestamptz`, NULLABLE
- `close_date` — `timestamptz`, NULLABLE
- `position_type` — `text`, NULLABLE (e.g. `"stock"`, `"option_long"`, `"option_short"`)
- `is_open` — `boolean`, NOT NULL, default `true`
- **Mark-to-market snapshot fields**  
  - `spot` — `numeric`, NULLABLE
  - `intrinsic` — `numeric`, NULLABLE
  - `extrinsic` — `numeric`, NULLABLE
  - `abs_notional` — `numeric`, NULLABLE
  - `unrealized_pnl` — `numeric`, NULLABLE
- `snapshot_date` — `date`, NULLABLE
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

## 4. Row Semantics

For v1:

- Each `positions` row = **one instrument snapshot for one account at one `snapshot_date`**.
- We do **not** model the full lifecycle here (no explicit close events).
- Historical evolution is via:
  - multiple `positions` rows across dates, and/or
  - `mtm_snapshots` for PnL paths.

A future version may introduce lifecycle tables or more explicit open/close modelling.

---

## 5. Column Mapping — Flex POST / Positions_DB / Positions_Current → positions

Below, “Source” means:

- For **Flex ingestion**: `Flex_Raw_Positions` POST record
- For **Excel backfill**: rows from `Positions_DB` / `Positions_Current`

### 5.1 Identity & keys

#### `positions.account_id`

- **Flex POST source**: `ClientAccountID`
- **Excel source**: `ClientAccountID`
- **Logic**:
  - Look up `accounts.id` where `accounts.broker_account_id = ClientAccountID`.
  - If no match:
    - In production: treat as error / dead-letter.
    - For backfill/testing: may temporarily allow `NULL` but log.

#### `positions.snapshot_date`

- **Flex POST source**: `ReportDate` (POST)
- **Excel source**: `SnapshotDate`

- **Type**: `date`
- **Logic (Flex)**:
  - `ReportDate` is `YYYYMMDD` as a string (e.g. `"20251119"`).
  - Parse into Y-M-D and construct a date.
- **Logic (Excel)**:
  - `SnapshotDate` may be:
    - A numeric `YYYYMMDD` (e.g. `20251119`), or
    - An Excel date.
  - If numeric `YYYYMMDD`, parse similar to `ReportDate`.
  - If Excel date, convert directly to date.

If parsing fails → reject/skip row.

---

### 5.2 Instrument & classification

#### `positions.symbol`

- **Source**: `Symbol`
- **Type**: `text`, NOT NULL
- **Logic**: direct copy.

#### `positions.asset_class`

- **Source**: `AssetClass`
- **Type**: `text`
- **Logic**: direct copy (`"STK"`, `"OPT"`, `"FUT"`, …).

#### `positions.conid`

- **Source**: `Conid`
- **Type**: `bigint`
- **Logic**:
  - If numeric, convert to integer/bigint.
  - Else `NULL`.

#### `positions.underlying_id`

- **Primary source**: `UnderlyingSymbol`
- **Fallback**: `Symbol` if `UnderlyingSymbol` blank

- **Logic**:
  1. Derive `underlying_symbol`:
     - If `UnderlyingSymbol` non-empty → use that.
     - Else → use `Symbol`.
  2. Look up `underlyings.id` where `underlyings.ticker = underlying_symbol`.
  3. If not found → `underlying_id = NULL`.

Best-effort linkage only; ingestion should not fail if missing.

#### `positions.multiplier`

- **Source**: `Multiplier`
- **Type**: `numeric`
- **Logic**:
  - Numeric conversion if present; else `NULL`.

#### `positions.strike`

- **Source**: `Strike`
- **Type**: `numeric`
- **Logic**:
  - Numeric conversion if present; else `NULL`.

#### `positions.expiry`

- **Source**: `Expiry`
- **Type**: `date`
- **Logic**:
  - If `Expiry` is `YYYYMMDD` string/number → parse to date.
  - If Excel date → convert.
  - Else `NULL`.

#### `positions.option_right`

- **Source**: `Put/Call`
- **Type**: `text`
- **Logic**:
  - Uppercase the first character:
    - `"P"` → `"P"`
    - `"C"` → `"C"`
    - otherwise → `NULL` (e.g. stock).

---

### 5.3 Quantity, side, average price

#### `positions.quantity`

- **Source**: `Quantity`
- **Type**: `numeric`, NOT NULL
- **Logic**:
  - Numeric conversion.
  - For snapshots, this is the current open amount; may be negative for shorts.

#### `positions.side`

- **Primary source**: `Side` (`"Long"` / `"Short"`), if present.
- **Fallback**: sign of `Quantity`.

- **Logic**:
  - If `Side` case-insensitive `"Long"` → `"LONG"`.
  - If `Side` case-insensitive `"Short"` → `"SHORT"`.
  - Else:
    - If `Quantity > 0` → `"LONG"`.
    - If `Quantity < 0` → `"SHORT"`.
    - If `Quantity = 0` → `NULL`.

#### `positions.avg_price`

- **Preferred source**: `CostBasisPrice`
- **Fallback**: `OpenPrice`

- **Logic**:
  - If `CostBasisPrice` present & numeric: `avg_price = CostBasisPrice`.
  - Else if `OpenPrice` present & numeric: `avg_price = OpenPrice`.
  - Else: `avg_price = NULL`.

Rationale: cost basis is more meaningful than raw open price.

#### `positions.position_type`

- **Sources**: `AssetClass`, `Side`/`side`

- **Logic (v1)**:

  - If `AssetClass = "STK"`:
    - side `"LONG"` → `"stock_long"`
    - side `"SHORT"` → `"stock_short"`
    - else → `"stock"`

  - If `AssetClass = "OPT"`:
    - side `"LONG"` → `"option_long"`
    - side `"SHORT"` → `"option_short"`
    - else → `"option"`

  - Else:
    - `"other"` (futures/CFDs/etc., refine later).

---

### 5.4 Dates: open/close

#### `positions.open_date`

- **Source**: `OpenDateTime`
- **Type**: `timestamptz`
- **Logic**:
  - If `OpenDateTime` a proper datetime string → parse to UTC timestamptz.
  - If `OpenDateTime` in `YYYYMMDD` numeric form → parse date, time `00:00:00` UTC.
  - If missing → `NULL`.

For v1, we **don’t** try to infer open date from trades.

#### `positions.close_date`

- **Source**: none
- **Logic**:
  - Always `NULL` in v1.
  - Closed state is inferred from snapshots later (e.g. position disappears or quantity hits 0).

---

### 5.5 Open vs closed flag

#### `positions.is_open`

- **Source**: `Quantity`
- **Type**: `boolean`
- **Logic**:
  - If `Quantity != 0` → `true`
  - If `Quantity = 0` → `false`

In POST/Positions_DB/Positions_Current we expect most rows to be non-zero; but the rule is simple.

---

### 5.6 Mark-to-market snapshot fields

#### `positions.spot`

- **Source**: `MarkPrice`
- **Type**: `numeric`
- **Logic**:
  - Numeric conversion; else `NULL`.

#### `positions.abs_notional`

- **Source**: `PositionValue`
- **Type**: `numeric`
- **Logic**:
  - Numeric conversion; else `NULL`.
  - Typically `Quantity * MarkPrice * Multiplier` in instrument currency.

#### `positions.unrealized_pnl`

- **Source**: `FifoPnlUnrealized`
- **Type**: `numeric`
- **Logic**:
  - Numeric; else `NULL`.

#### `positions.intrinsic` / `positions.extrinsic`

- **Source**: none (v1)
- **Logic**:
  - Both `NULL` in v1.
  - May be derived later via options pricing or workbook logic.

---

### 5.7 Strategy linkage (Positions_Current)

For rows coming from `Positions_Current` (Excel) or an equivalent enriched POST source:

#### `positions.strategy_id`

- **Sources**: `StrategyKey`, `StrategyLabel`
- **Logic**:
  1. If `StrategyKey` non-empty:
     - Look up `strategies.id` where `strategies.strategy_key = StrategyKey`.
  2. If not found but `StrategyLabel` non-empty:
     - Optionally look up by `label`.
  3. If unresolved → `strategy_id = NULL`.

For plain POST/Positions_DB rows without strategy info → `strategy_id = NULL`.

---

## 6. Fields intentionally not mapped in v1

Not mapped into `positions`:

- `PercentOfNAV`
- All triage/IV/sigma flags in `Positions_Current` (e.g. `Flag_ITM`, `Sigma_to_Strike`, `Flag_Sigma_0_5`, `Flag_Sigma_1_0`, `Flag_Assignment`, etc.)
- Any fields that belong naturally in:
  - `mtm_snapshots`
  - `nav_snapshots`
  - `triage_records`
  - `blotter_actions`

They remain available in original data and/or `raw_row` (if we choose to keep it later).

---

## 7. Idempotency & conflict handling

Positions don’t have a unique immutable transaction ID. For v1, treat each ingestion as **“snapshot as of date D”**.

Two reasonable policies:

### Option A — Full replace per (account, snapshot_date)  **(simpler)**

- For a given `(account_id, snapshot_date)`:
  1. Delete existing `positions` rows.
  2. Insert the new snapshot rows.

This is easiest and avoids complicated compound upsert keys.

### Option B — Compound upsert key

- Define a natural key:
  - (`account_id`, `snapshot_date`, `symbol`, `expiry`, `strike`, `option_right`, `asset_class`)
- Use `INSERT ... ON CONFLICT (compound_key) DO UPDATE` to refresh `quantity`, prices, etc.

For early development, **Option A (full replace)** is recommended.

---

## 8. Backfill Strategy

### 8.1 Historical (Positions_DB)

- Read rows from `Positions_DB`.
- For each row:
  - Treat it as a “POST+SnapshotDate” record.
  - Map using the same rules above (with `source = "Positions_DB"`).
- For each `(account_id, snapshot_date)` present in the file:
  - Either:
    - Clear existing positions, then insert, **or**
    - Use compound upsert.

### 8.2 Latest snapshot (Positions_Current)

- Read from `Positions_Current`.
- Map as above, but:
  - Also populate `strategy_id` via `StrategyKey` / `StrategyLabel`.
- Use the same idempotency policy:
  - Typically full-replace `(account_id, snapshot_date)` for the “current” date.

This keeps historical and latest snapshots structurally consistent while preserving strategy linkage for the current book.

---

## 9. Implementation Notes (for Cursor)

- Implement a pure transform in:

  - `lib/ingestion/flex/positions.ts`
    - For Flex POST:
      ```ts
      export function normalizeFlexPositionRow(
        row: Record<string, string>,
        accountId: string
      ): NewPosition
      ```
    - It should:
      - Parse `ReportDate` → `snapshot_date`
      - Apply all mappings described above.
      - Not perform any DB I/O.

  - `lib/ingestion/excel/positions.ts` (optional)  
    - For Excel backfill (`Positions_DB`, `Positions_Current`), can reuse the same logic but with a small wrapper that:
      - Adapts column names (`SnapshotDate` vs `ReportDate`)
      - Handles any Excel date peculiarities.

- `app/api/ingest/flex/positions/route.ts` should:

  - Accept a **positions Flex CSV**.
  - Parse it with the multi-section logic from `docs/ingestion_v1.md`:
    - Find `HEADER,POST` + `DATA,POST` for positions.
    - Build `record` objects from `fieldsHeader` + `fields`.
  - Resolve `account_id` from `ClientAccountID`.
  - Call `normalizeFlexPositionRow`.
  - Apply the chosen idempotency policy (full-replace per `(account_id, snapshot_date)` is fine to start).

Any behavioural change later (e.g. different natural keys, extra fields) should be captured as a new version (e.g. `Version 0.3`).
