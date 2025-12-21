# Transform Spec — Trades
Version 0.1 — YYYY-MM-DD  
Author: Nick

See docs/data_model_v1.md for taxonomy and relationships.

Source sheets:  
- `Flex_Raw_Trades` (raw IBKR Flex export)  
- `Trades_DB` (normalized / cleaned trades in Excel)

Target table:  
- `trades` (Supabase Postgres, Drizzle schema)

---

## 1. Purpose

Define exactly how **trade records** are ingested and normalized from IBKR Flex exports (and the Excel workbook) into the `trades` table.

This document is the **single source of truth** for:

- Column mappings from Flex/Excel → `trades`
- Derivation rules (e.g. `side`, `trade_date`)
- Idempotency keys
- What is **intentionally ignored** in v1

The goal is that, for any historical period covered by `WeeklyOptionsReview.xlsx`, running the ingestion pipeline on the raw trades should reproduce the `Trades_DB` view (for the fields we care about) to within acceptable tolerance.

---

## 2. Source Data

### 2.1 Flex_Raw_Trades (raw Flex export)

Header columns (relevant subset):

- `ClientAccountID`
- `CurrencyPrimary`
- `FXRateToBase`
- `AssetClass`
- `SubCategory`
- `Symbol`
- `Description`
- `Conid`
- `UnderlyingConid`
- `UnderlyingSymbol`
- `Multiplier`
- `Strike`
- `ReportDate`
- `Expiry`
- `DateTime`
- `Put/Call`
- `TradeDate`
- `Quantity`
- `TradePrice`
- `TradeMoney`
- `Proceeds`
- `Taxes`
- `IBCommission`
- `IBCommissionCurrency`
- `NetCash`
- `NetCashInBase`
- `ClosePrice`
- `Open/CloseIndicator`
- `Notes/Codes`
- `CostBasis`
- `FifoPnlRealized`
- `CapitalGainsPnl`
- `FxPnl`
- `MtmPnl`
- `Buy/Sell`
- `IBOrderID`
- `OpenDateTime`
- `ListingExchange`
- `TradeID`
- `Exchange`
- `TransactionID`
- `IBExecID`
- `OrderType`

### 2.2 Trades_DB (Excel normalized view)

Header columns:

- `ClientAccountID`
- `CurrencyPrimary`
- `FXRateToBase`
- `AssetClass`
- `SubCategory`
- `Symbol`
- `Description`
- `Conid`
- `UnderlyingConid`
- `UnderlyingSymbol`
- `Multiplier`
- `Strike`
- `ReportDate`
- `Expiry`
- `DateTime` (often cleaned string)
- `Put/Call`
- `TradeDate`
- `Quantity`
- `TradePrice`
- `TradeMoney`
- `Proceeds`
- `Taxes`
- `IBCommission`
- `IBCommissionCurrency`
- `NetCash`
- `ClosePrice`
- `Open/CloseIndicator`
- `Notes/Codes`
- `CostBasis`
- `FifoPnlRealized`
- `MtmPnl`
- `Buy/Sell`
- `IBOrderID`
- `OpenDateTime`
- `ListingExchange`
- `TradeID`
- `Exchange`
- `TransactionID`
- `IBExecID`
- `OrderType`

For **backfill**, the script may read directly from `Trades_DB` (which is already cleaned), but the **logical mapping** is the same either way.

---

## 3. Target Schema — `trades`

Logical definition from `db_schema_v1.md`:

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE
- `broker_transaction_id` — `text`, NULLABLE, UNIQUE where present
- `broker_exec_id` — `text`, NULLABLE
- `asset_class` — `text`, NULLABLE
- `symbol` — `text`, NOT NULL
- `conid` — `bigint`, NULLABLE
- `currency` — `text`, NULLABLE
- `fx_rate_to_base` — `numeric`, NULLABLE
- `trade_date` — `timestamptz`, NOT NULL
- `side` — `text`, NOT NULL (`'BUY' | 'SELL'`)
- `quantity` — `numeric`, NOT NULL
- `price` — `numeric`, NOT NULL
- `gross_amount` — `numeric`, NULLABLE
- `net_amount` — `numeric`, NULLABLE
- `fees` — `numeric`, NULLABLE
- `order_type` — `text`, NULLABLE
- `exchange` — `text`, NULLABLE
- `raw_row` — `jsonb`, NULLABLE
- `created_at` — `timestamptz`, default `now()`

---

## 4. Column Mapping — Flex / Trades_DB → trades

Below, “Source” refers to either `Flex_Raw_Trades` or `Trades_DB`. For backfill, prefer `Trades_DB` where present; for ongoing ingestion, use `Flex_Raw_Trades`.

### 4.1 Identity & Keys

#### `trades.account_id`

- **Source**: `ClientAccountID`
- **Logic**:
  - Look up `accounts.id` where `accounts.broker_account_id = ClientAccountID`.
  - If no matching account exists, **fail ingestion** for that row or route to a dead-letter log; do **not** insert `null` account_id in production.
  - For testing/backfill, you may temporarily allow `account_id = NULL` but should log it.

#### `trades.broker_transaction_id`

- **Source**: `TransactionID`
- **Type**: `text`
- **Logic**:
  - Convert to string (even if Flex supplies numeric).
  - Used as the **idempotency key** for upserts.
- **Constraint**:
  - Unique where not NULL.

#### `trades.broker_exec_id`

- **Source**: `IBExecID`
- **Type**: `text`
- **Logic**:
  - Preserve exactly as provided by Flex.

---

### 4.2 Instrument & classification

#### `trades.asset_class`

- **Source**: `AssetClass`
- **Type**: `text`
- **Logic**:
  - Direct copy.
  - Expected values: `"STK"`, `"OPT"`, `"FUT"`, `"CASH"`, etc.
- **Special rule**:
  - For v1, **ignore `AssetClass = 'CASH'` rows** in this transform. Those will eventually be handled in a separate `cash_flows` pipeline.

#### `trades.symbol`

- **Source**: `Symbol`
- **Type**: `text`, NOT NULL
- **Logic**:
  - Direct copy.
  - Any symbol normalization (e.g. crypto tickers, local exchange suffixes) should happen in a separate helper; v1 simply copies.

#### `trades.conid`

- **Source**: `Conid`
- **Type**: `bigint`
- **Logic**:
  - If present, convert numeric → integer / bigint.
  - If blank or non-numeric, set `NULL`.

#### `trades.currency`

- **Source**: `CurrencyPrimary`
- **Type**: `text`
- **Logic**:
  - Direct copy (e.g. `"USD"`, `"GBP"`).

#### `trades.fx_rate_to_base`

- **Source**: `FXRateToBase`
- **Type**: `numeric`
- **Logic**:
  - If present and numeric, copy.
  - Else `NULL`.

---

### 4.3 Trade timing

#### `trades.trade_date`

- **Primary Source**: `DateTime` (Flex / Trades_DB)
- **Fallback**: `TradeDate` if `DateTime` is missing

- **Flex raw format**:
  - Typically `'YYYYMMDD;HHMMSS'` (e.g. `'20251119;124242'`)
- **Logic**:
  1. If `DateTime` present:
     - Split on `';'` into `date_str`, `time_str`.
     - Parse:
       - `date_str`: `YYYYMMDD` → `YYYY-MM-DD`
       - `time_str`: `HHMMSS` → `HH:MM:SS`
     - Construct `timestamptz` in UTC.
  2. Else if only `TradeDate` present:
     - Parse `TradeDate` as `YYYYMMDD` and set time to `00:00:00` UTC.
  3. If neither is present or parseable, **reject row**.

- **Example**:
  - `DateTime = '20251119;124242'` → `trade_date = 2025-11-19T12:42:42Z`

---

### 4.4 Quantity, side, price, amounts

#### `trades.quantity`

- **Source**: `Quantity`
- **Type**: `numeric`, NOT NULL
- **Logic**:
  - Direct numeric conversion.
  - Preserve sign from Flex:
    - Positive → net buy
    - Negative → net sell

#### `trades.side`

- **Primary Source**: Derived from `Quantity`
- **Secondary Source (consistency check)**: `Buy/Sell`

- **Logic**:
  - If `Quantity > 0` → `'BUY'`
  - If `Quantity < 0` → `'SELL'`
  - If `Quantity = 0` → **invalid**, reject or skip row.

- **Consistency check (optional, recommended)**:
  - If `Buy/Sell` is present:
    - Normalize to upper-case.
    - If `Buy/Sell = 'BUY'` but `Quantity < 0` (or vice versa), log a warning and prefer `Quantity` as the source of truth.

#### `trades.price`

- **Source**: `TradePrice`
- **Type**: `numeric`, NOT NULL
- **Logic**:
  - Direct numeric conversion.
  - If missing or non-numeric, **reject row**.

#### `trades.gross_amount`

- **Source**: `Proceeds`
- **Type**: `numeric`, NULLABLE
- **Logic**:
  - Direct numeric conversion if present.
  - Match Excel semantics:
    - Typically negative for buys, positive for sells (IBKR convention).
  - Keep sign as-is; do **not** re-derive.

#### `trades.net_amount`

- **Source**: `NetCash`
- **Type**: `numeric`, NULLABLE
- **Logic**:
  - Direct numeric conversion if present.
  - Represents cash impact in trade currency, including commissions, taxes, etc.

#### `trades.fees`

- **Source**: `IBCommission` (optionally + `Taxes`)
- **Type**: `numeric`, NULLABLE
- **Logic** (v1, simple):
  - Set `fees = IBCommission` (preserve sign; IB typically negative).
- **Optional enhancement (v1.1)**:
  - `fees = IBCommission + Taxes`
  - Document change clearly if/when implemented.

---

### 4.5 Order & venue metadata

#### `trades.order_type`

- **Source**: `OrderType`
- **Type**: `text`, NULLABLE
- **Logic**:
  - Direct copy (e.g. `"LMT"`, `"MKT"`).

#### `trades.exchange`

- **Source**: `Exchange`
- **Secondary**: `ListingExchange` if `Exchange` is blank
- **Type**: `text`, NULLABLE
- **Logic**:
  - Prefer `Exchange` if present.
  - Else fall back to `ListingExchange`.
  - Else `NULL`.

---

### 4.6 Raw row

#### `trades.raw_row`

- **Source**: Entire source row object (key/value pairs)
- **Type**: `jsonb`
- **Logic**:
  - Store **original raw values** from Flex (or from `Trades_DB` on backfill).
  - Do not mutate or strip fields (beyond basic type-safe serialization).

Purpose:

- Debugging ingestion
- Future enrichment without reloading raw files

---

### 4.7 Fields intentionally not mapped in v1

The following source fields are present in `Flex_Raw_Trades` / `Trades_DB` but are **not** mapped into columns in `trades` in v1:

- `SubCategory`
- `Description`
- `UnderlyingConid`
- `UnderlyingSymbol`
- `Multiplier`
- `Strike`
- `ReportDate`
- `Expiry`
- `Put/Call`
- `TradeMoney`
- `Taxes`
- `IBCommissionCurrency`
- `NetCashInBase`
- `ClosePrice`
- `Open/CloseIndicator`
- `Notes/Codes`
- `CostBasis`
- `FifoPnlRealized`
- `CapitalGainsPnl`
- `FxPnl`
- `MtmPnl`
- `IBOrderID`
- `OpenDateTime`
- `TradeID`
- `ListingExchange`

Rationale:

- Many of these fields are:
  - Redundant with other tables (`positions`, `mtm_snapshots`, `nav_snapshots`)
  - Useful primarily for analytics that will be implemented later
- All of them remain accessible via `raw_row` if needed.

Future versions (`db_schema_v1.1+`) may add explicit columns for some of these fields once the core app is stable.

---

## 5. Idempotency & Conflict Handling

### 5.1 Natural key

- `broker_transaction_id` (from `TransactionID`) is the primary natural key.

### 5.2 Policy

When inserting into `trades`:

- Use `INSERT ... ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE` with:
  - Conflict target: `broker_transaction_id`
- For v1:
  - **On conflict do nothing**:
    - Skip inserting a duplicate.
    - Optional: log if core fields differ from existing row (to catch corrections).

This ensures ingestion can be re-run on overlapping date ranges without duplicating trades.

---

## 6. Error Handling & Validation Rules

- Reject / skip row if:
  - `ClientAccountID` missing or account not resolvable (in production).
  - `Symbol` missing.
  - `Quantity` missing or zero.
  - `TradePrice` missing or non-numeric.
  - `DateTime` and `TradeDate` both missing or unparseable.

- Log (but do not reject) if:
  - `Buy/Sell` disagrees with the sign of `Quantity` (we trust `Quantity`).
  - `AssetClass = 'CASH'` and row is skipped.

In v1, logging may be minimal (console / simple table). Later we can build a structured ingestion log.

---

## 7. Backfill from Trades_DB

For backfilling historical data from `WeeklyOptionsReview.xlsx`:

- Treat each row of `Trades_DB` as equivalent to a normalized Flex row:
  - Column names match (`ClientAccountID`, `Symbol`, `Quantity`, `TradePrice`, etc.).
  - Formatting of `DateTime` may already be cleaned.
- Apply the **same mapping rules** as above, but reading from `Trades_DB` instead of `Flex_Raw_Trades`.

This ensures:

- Historical data loaded from Excel is consistent with future Flex ingestion.
- We can compare Drizzle/Supabase `trades` against `Trades_DB` exports as a regression test.

---

## 8. Implementation Notes (for Cursor)

- Normalize logic should be implemented in:

  - `lib/ingestion/flex/trades.ts`  
    - `normalizeFlexTradeRow(row: Record<string, string | number>): NewTrade | null`

- This function must:

  - Implement the column mappings and rules defined above.
  - Be **pure** (no DB access; purely maps input row → `NewTrade`).
  - Be reused by:
    - `app/api/ingest/flex/trades/route.ts` (file uploads)
    - Backfill scripts that read from `WeeklyOptionsReview.xlsx`.

- Any deviations from this spec should be captured in future versions of this document.
