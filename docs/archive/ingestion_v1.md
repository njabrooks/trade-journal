# Ingestion v1 — Design  
Version 0.2 — YYYY-MM-DD  
Author: Nick

---

## 1. Purpose

Define how external data (primarily IBKR Flex reports) flows into the Trade Journal app’s database, using logic from `WeeklyOptionsReview.xlsx` as the reference specification.

We want:

- A repeatable pipeline from raw Flex exports → normalized tables.  
- A one-off backfill path from the existing Excel workbook.  
- A clear separation between:  
  - Raw ingestion (parsing, staging)  
  - Normalization (mapping to core tables)  
  - Aggregation (strategy/triage/blotter)

This document assumes we upload raw Flex CSVs directly from IBKR, not the intermediate Google Sheets / Excel tables.

---

## 2. Ingestion Sources

### 2.1 IBKR Flex Exports (Manual v0)

We use two Flex Queries in IBKR:

1. **Positions Query** (e.g. `OptionsDash_positions`)
   - Sections:
     - `POST` — Open Positions (per-conid snapshot)  
     - `EQUT` — NAV / account equity in base currency  
     - `MTMP` — Mark-to-Market Performance Summary in base  

2. **Trades Query** (e.g. `OptionsDash_trades`)
   - Sections:
     - `TRNT` — Trades (executions)  
     - `OPTT` — Option exercises / assignments / expirations  
     - `CTRN` — Cash transactions  

For each query:

- User runs the query in Client Portal / Flex Web Service.  
- Downloads the resulting CSV locally.  
- Uploads it via an admin page in the app.

These CSVs are multi-section files with the following structure:

- Column 0: record type — `"HEADER"` or `"DATA"`  
- Column 1: section code — one of `POST`, `EQUT`, `MTMP`, `TRNT`, `OPTT`, `CTRN`  
- Columns 2..N:
  - If `HEADER`: field names for that section  
  - If `DATA`: values for that section  

This is the primary ongoing ingestion method in v0.

### 2.2 Excel Workbook Backfill (One-Off)

- `WeeklyOptionsReview.xlsx` contains:
  - Parsed Flex raw data (`Flex_Raw_*` sheets)  
  - Normalized tables (`Trades_DB`, `Positions_DB`, `MTM_DB`, `NAV_DB`, `Triage`, `Blotter`)  
  - Additional derived fields and logic  

- A one-off script will read the workbook and insert rows into:
  - `trades`  
  - `positions`  
  - `mtm_snapshots`  
  - `nav_snapshots`  
  - `triage_records`  
  - `blotter_actions`  

Once history is backfilled, future updates should come from raw Flex CSVs, not Excel.

---

## 3. Ingestion Architecture

### 3.1 Layers

1. **Raw Stage (optional in v1)**  
   - Optional tables like `raw_flex_positions`, `raw_flex_trades` to store original Flex CSV rows.  
   - Useful for debugging and idempotency, but not required for v1.

2. **Normalization Layer (core)**  
   Pure TypeScript functions that map:

   - Flex `TRNT` row → `trades` insert  
   - Flex `POST` row → `positions` insert  
   - Flex `MTMP` row → `mtm_snapshots` insert  
   - Flex `EQUT` row → `nav_snapshots` insert  
   - Flex `OPTT` row → `exercises`-related table (future)  
   - Flex `CTRN` row → `cash_flows` table (future)  

   Logic mirrors formulas/transformations in:

   - `Trades_DB`  
   - `Positions_DB`  
   - `MTM_DB`  
   - `NAV_DB`  

3. **Aggregation Layer**  

   - Builds strategy-level and triage-level views from normalized tables:
     - Strategy P&L, exposure, state  
     - Triage flags and action recommendations  

   - Logic mirrors `Portfolio`, `Triage`, `Blotter`, `Strategies`, etc.

### 3.2 Implementation Locations

**UI upload page:**  

- `app/admin/ingestion/flex/page.tsx`

**API routes (v1):**

- Positions Flex CSV (POST/EQUT/MTMP):
  - `app/api/ingest/flex/positions/route.ts`
    - Section `POST` → `lib/ingestion/flex/positions.ts`
    - Section `EQUT` → `lib/ingestion/flex/nav.ts`
    - Section `MTMP` → `lib/ingestion/flex/mtm.ts`

- Trades Flex CSV (TRNT/OPTT/CTRN):
  - `app/api/ingest/flex/trades/route.ts`
    - Section `TRNT` → `lib/ingestion/flex/trades.ts`
    - Section `OPTT` → `lib/ingestion/flex/exercises.ts` (future)
    - Section `CTRN` → `lib/ingestion/flex/cash.ts` (future)

**Normalization functions (pure):**

- `lib/ingestion/flex/trades.ts`  
- `lib/ingestion/flex/positions.ts`  
- `lib/ingestion/flex/mtm.ts`  
- `lib/ingestion/flex/nav.ts`  
- `lib/ingestion/flex/exercises.ts` (later)  
- `lib/ingestion/flex/cash.ts` (later)  

All normalization functions should be pure and accept:

- A “raw section row” object → return a typed insert for the corresponding table.

---

## 4. v0 Flow — Manual Flex Upload

### 4.1 User Flow

1. User navigates to `/admin/ingestion/flex`.  
2. Chooses which Flex CSV to upload:
   - Positions Flex CSV (POST/EQUT/MTMP)  
   - Trades Flex CSV (TRNT/OPTT/CTRN)  

3. The form POSTs to the appropriate endpoint:
   - `POST /api/ingest/flex/positions`  
   - `POST /api/ingest/flex/trades`  

4. The API route:
   - Parses the raw CSV (multi-section).  
   - Filters the relevant `HEADER,<SECTION>` / `DATA,<SECTION>` rows.  
   - Builds per-section objects.  
   - Calls the correct normalization function(s).  
   - Uses Drizzle to insert / upsert into core tables.  

5. UI shows ingestion summary:
   - Total rows per section  
   - Rows inserted / updated per table  
   - Errors per table  

---

### 4.2 Raw Flex CSV Parsing (common pattern)

This pattern is used by all ingestion endpoints.

1. Parse CSV with `columns: false`:

       const rows: string[][] = parse(csvText, {
         columns: false,
         skip_empty_lines: true,
       });

2. For a given section code `SECTION` (e.g. `"TRNT"`, `"POST"`):

   - Header row:

         const headerRow = rows.find(
           (r) => r[0] === "HEADER" && r[1] === SECTION,
         );
         const fieldNames = headerRow.slice(2);

   - Data rows:

         const dataRows = rows.filter(
           (r) => r[0] === "DATA" && r[1] === SECTION,
         );

   - For each data row:

         const values = row.slice(2);
         const record: Record<string, string> = {};
         fieldNames.forEach((name, i) => {
           record[name] = values[i] ?? "";
         });

3. The resulting `record` is then passed to the appropriate normalizer:

- Trades (TRNT): `normalizeFlexTradeRow(record, accountId)`  
- Positions (POST): `normalizeFlexPositionRow(record, accountId, snapshotDate)`  
- MTM (MTMP): `normalizeFlexMtmRow(record, accountId, snapshotDate)`  
- NAV (EQUT): `normalizeFlexNavRow(record, accountId, snapshotDate)`  
- Exercises (OPTT): `normalizeFlexExerciseRow(record, accountId)` (future)  
- Cash (CTRN): `normalizeFlexCashRow(record, accountId)` (future)  

---

### 4.3 Trades Flex CSV (TRNT / OPTT / CTRN)

**Endpoint:** `POST /api/ingest/flex/trades`  
**Source file:** Flex “Trades” query CSV (multi-section)

**Sections:**

1. **Trades** — section code `TRNT` → `trades` table

   - Use the generic parsing pattern with `SECTION = "TRNT"`.  
   - Build objects with keys like:
     - `ClientAccountID`, `CurrencyPrimary`, `AssetClass`, `Symbol`, `Conid`,
       `DateTime`, `TradeDate`, `Quantity`, `TradePrice`, `Proceeds`,
       `NetCash`, `IBCommission`, `TransactionID`, `IBExecID`, etc.  
   - Resolve `account_id` via `ClientAccountID`.  
   - Pass to `normalizeFlexTradeRow(record, accountId)` (see `transform_trades.md`).  
   - Insert into `trades` with `ON CONFLICT (broker_transaction_id) DO NOTHING`.

2. **Exercises / Assignments / Expirations** — section code `OPTT` → (future) `exercises` table

   - Use parsing pattern with `SECTION = "OPTT"`.  
   - Build objects with headers such as:
     - `Date`, `Conid`, `Transaction Type`, `Quantity`, `Strike`, `Expiry`, etc.  
   - v1: may parse and stage into a `raw_exercises` table or JSONB column.  
   - v1.x: introduce `exercises` table and a `normalizeFlexExerciseRow` that mirrors `Exercises_DB`.

3. **Cash Transactions** — section code `CTRN` → (future) `cash_flows` table

   - Use parsing pattern with `SECTION = "CTRN"`.  
   - Headers typically include:
     - `ReportDate`, `Date/Time`, `Symbol`, `Amount`, `Type`, `Code`, etc.  
   - v1: may parse and stage into `raw_cash_transactions`.  
   - v1.x: introduce `cash_flows` table and normalize based on `Cash_DB`.

In v0 of the app, it is acceptable to only fully implement `TRNT` → `trades` and simply log or ignore `OPTT` and `CTRN`, as long as the parsing scaffold is in place.

---

### 4.4 Positions Flex CSV (POST / EQUT / MTMP)

**Endpoint:** `POST /api/ingest/flex/positions`  
**Source file:** Flex “Positions” query CSV (multi-section)

**Sections:**

1. **Open Positions** — section code `POST` → `positions` table

   - Use parsing pattern with `SECTION = "POST"`.  
   - Headers include:
     - `ReportDate`, `ClientAccountID`, `AssetClass`, `SubCategory`, `Symbol`, `Conid`, `CurrencyPrimary`, `FXRateToBase`, `MarkPrice`, `PositionValue`, `OpenPrice`, `CostBasisPrice`, `CostBasisMoney`, `FifoPnlUnrealized`, `Side`, `OpenDateTime`, `Strike`, `Expiry`, `Put/Call`, `Multiplier`, etc.  
   - `ReportDate` is the snapshot date.  
   - For each row:
     - Resolve `account_id` via `ClientAccountID`.  
     - Derive `snapshot_date` from `ReportDate` (e.g. `YYYYMMDD` → `date`).  
     - Pass to `normalizeFlexPositionRow(record, accountId, snapshotDate)` (see `transform_positions.md`).  

   - Idempotency strategy:
     - Either:
       - Delete all positions for (`account_id`, `snapshot_date`) then insert fresh rows.  
     - Or:
       - `ON CONFLICT` on a compound key (`account_id`, `snapshot_date`, `symbol`, `expiry`, `strike`, `option_right`, `asset_class`).  

2. **NAV in Base** — section code `EQUT` → `nav_snapshots` table

   - Use parsing pattern with `SECTION = "EQUT"`.  
   - Headers typically include:
     - `ReportDate`, `BaseCurrency`, `NetLiquidation`, `Cash`, `StockMarketValue`, etc.  
   - For each row:
     - `snapshot_date` from `ReportDate`.  
     - Resolve `account_id` (if `ClientAccountID` present, or inferred by account / file).  
     - Pass to `normalizeFlexNavRow(record, accountId, snapshotDate)`.  
     - Insert/upsert into `nav_snapshots` using (`account_id`, `snapshot_date`) as natural key.

3. **Mark-to-Market Performance Summary in Base** — section code `MTMP` → `mtm_snapshots` table

   - Use parsing pattern with `SECTION = "MTMP"`.  
   - Headers include:
     - `ReportDate`, `AssetClass`, `Symbol`, `Conid`, `RealizedPnl`, `UnrealizedPnl`, `MTMPnl`, etc.  
   - Each row is a per-symbol snapshot of MTM performance as of `ReportDate`.  
   - For each row:
     - `snapshot_date` from `ReportDate`.  
     - `account_id` from `ClientAccountID` if present; otherwise map by account-level convention (v1 may assume one account per file).  
     - Pass to `normalizeFlexMtmRow(record, accountId, snapshotDate)`.  
     - Insert/upsert into `mtm_snapshots` on (`account_id`, `snapshot_date`, `asset_class`, `symbol`, `conid`).  

In v0 of the app, it is acceptable to focus initially on `POST` → `positions` and `EQUT` → `nav_snapshots`, and add `MTMP` → `mtm_snapshots` once schema and queries are stabilised.

---

## 5. v0.5 Flow — Excel Backfill

One-off script (not part of the app):

1. Reads `WeeklyOptionsReview.xlsx` with a script (`/scripts/backfill_from_excel.ts`).  
2. For each relevant sheet:
   - Reads rows  
   - Maps columns to the core tables:
     - `Trades_DB` → `trades`  
     - `Positions_DB` → `positions`  
     - `MTM_DB` → `mtm_snapshots`  
     - `NAV_DB` → `nav_snapshots`  
     - `Triage` → `triage_records`  
     - `Blotter` → `blotter_actions`  

3. Uses Drizzle ORM (or Supabase client) to insert data into Supabase.

This script should be safe to run multiple times (idempotent on primary keys / unique keys).

The per-table transform specs are defined in:

- `docs/transform_trades.md`  
- `docs/transform_positions.md`  
- `docs/transform_mtm.md` (future)  
- `docs/transform_nav.md` (future)  
- `docs/transform_triage.md` (future)  
- `docs/transform_blotter.md` (future)  

---

## 6. v1 Flow — Automated Flex API (Future)

A scheduled worker (Supabase Edge Function or external cron) will:

1. Call IBKR Flex Web Service with a saved query ID (positions + trades).  
2. Download CSV for each query.  
3. Optionally write raw files to storage.  
4. Call the same parsing and normalization functions as the manual upload (no new business logic).

This worker lives outside the Next.js app (ops concern), but reuses:

- The section parsing logic (HEADER/DATA + section codes).  
- The same `normalizeFlex*Row()` functions.

---

## 7. Next Implementation Steps

1. Ensure `/admin/ingestion/flex` UI lets you select which Flex CSV you’re uploading (positions vs trades).  
2. Implement `POST /api/ingest/flex/trades`:
   - Parse raw Flex CSV.  
   - Extract `TRNT` section.  
   - Map rows to objects.  
   - Use `normalizeFlexTradeRow` and insert into `trades`.  
   - Optionally: stage `OPTT` and `CTRN` sections for future use.  

3. Implement `POST /api/ingest/flex/positions`:
   - Parse raw Flex CSV.  
   - Extract `POST`, `EQUT`, `MTMP` sections.  
   - Use `normalizeFlexPositionRow`, `normalizeFlexNavRow`, `normalizeFlexMtmRow` to populate `positions`, `nav_snapshots`, `mtm_snapshots`.  

4. Implement / refine per-table transform specs:
   - `docs/transform_trades.md` (done)  
   - `docs/transform_positions.md` (done)  
   - `docs/transform_mtm.md`, `docs/transform_nav.md` (next).  

5. Implement the Excel backfill script using the same normalization functions, treating the Excel DB sheets as “golden outputs” for regression testing.
