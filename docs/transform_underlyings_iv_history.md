# Transform Spec — Underlyings IV History
Version 0.1 — YYYY-MM-DD  
Author: Nick

See also: `docs/data_model_v1.md`, `docs/transform_positions.md`, `docs/transform_triage.md`.

---

## 1. Purpose

Define how we populate and maintain the **underlyings implied volatility history** table:

- Table: `underlyings_iv_history`
- Role: store **daily/weekly snapshots** of `spot` and `iv30` for each underlying.
- Consumers:
  - Triage rules (sigma-to-strike, assignment risk)
  - Strategy entry context (recording IV regime at entry)
  - Portfolio/analytics views (IV over time per underlying)

This table is **reference-like market data** (Layer A/B), sourced externally (e.g. Option Strategist scrape, IBKR, or another vendor).

---

## 2. Source Data

### 2.1 Upstream Inputs

For the initial implementation we mirror the Google Sheets `Underlyings_IVHist` logic:

- A list of tickers to scrape:
  - Historically from `Underlyings` sheet (unique tickers from `Positions_Current`).
  - In the app: from `underlyings` table (`underlyings.ticker`).

- For each ticker on a given run date:
  - `date` — snapshot date (UTC)
  - `ticker` — underlying ticker (string)
  - `spot` — spot price at snapshot
  - `iv30` — 30-day implied volatility (annualised)

### 2.2 underlyings table

From `underlyings`:

- `id` — underlying PK
- `ticker` — symbol matching the scrape feed
- Possibly other metadata (name, asset class, etc.)

We link `iv_history` rows to `underlyings.id` whenever possible.

---

## 3. Target Schema — `underlyings_iv_history`

Logical definition:

- `id` — `uuid`, PK, default `gen_random_uuid()`
- `underlying_id` — `uuid`, FK → `underlyings.id`, NULLABLE (if ticker can’t be resolved)
- `date` — `date`, NOT NULL (snapshot date, UTC)
- `ticker` — `text`, NOT NULL
- `spot` — `numeric`, NULLABLE
- `iv30` — `numeric`, NULLABLE (annualised, e.g. `0.45` for 45%)
- `source` — `text`, NULLABLE (e.g. `'opt_strat'`, `'ibkr'`, `'manual'`)
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

We keep `ticker` as a denormalised column even when `underlying_id` is present, to:
- make debugging easier, and
- allow historical rows to survive even if the `underlyings` table is changed.

---

## 4. Row Semantics

Each row is:

> “For ticker T / underlying U on date D, this is the best estimate of spot and 30-day IV.”

- One row per (`date`, `ticker`, `source`) combination.
- Typically only one source per date/ticker; if multiple, we define a precedence.

---

## 5. Transform & Load Logic

### 5.1 Ticker selection

1. Build a set of tickers to update:

   - From `underlyings` table:
     - `SELECT DISTINCT ticker FROM underlyings WHERE active = true` (if we add an `active` flag).
   - Optionally filter to those that appear in recent `positions` (e.g. last 90 days) for efficiency.

2. Use these tickers as inputs to the external IV/spot data provider.

### 5.2 Fetch / scrape

External job (Edge function / cron worker):

- For each ticker:
  - Query provider (e.g. Option Strategist) for current `spot` and `iv30`.
  - Standardise:
    - `date` = today in UTC (or provider’s snapshot date if available).
    - `spot` = numeric.
    - `iv30` = numeric (0.x, not %).

---

## 6. Mapping Rules

For each fetched row `{date_raw, ticker_raw, spot_raw, iv30_raw, source}`:

1. Normalise date:

   - Convert `date_raw` to `date` (YYYY-MM-DD, UTC).
   - If provider gives a DateTime, truncate to date.

2. Normalise ticker:

   - `ticker = trim(ticker_raw.toUpperCase())`.
   - Optionally strip common suffixes if your `underlyings` tickers differ (e.g. `.UN`, `.US`) — but keep these rules in a helper, not hardcoded in the ETL.

3. Parse numerics:

   - `spot`:
     - `spot = parseFloat(spot_raw)`, else `NULL`.
   - `iv30`:
     - If provider gives % (e.g. 45): `iv30 = 45 / 100`.
     - If provider gives decimal already (0.45): pass through.
     - If non-numeric → `NULL`.

4. Resolve `underlying_id`:

   - `SELECT id FROM underlyings WHERE ticker = ticker LIMIT 1`.
   - If multiple matches, pick first (or enforce uniqueness in `underlyings`).
   - If no match, leave `underlying_id = NULL`.

5. Set `source`:

   - E.g. `'opt_strat'`, `'ibkr'`, etc.  
   - This should be a stable, low-cardinality string.

---

## 7. Idempotency & Conflict Handling

Natural key (per provider):

- (`date`, `ticker`, `source`)

Policy:

- Use `INSERT ... ON CONFLICT (date, ticker, source) DO UPDATE`:
  - Update `spot`, `iv30`, `updated_at`.
  - Do **not** change `created_at`.

This allows re-running the job for a given date without duplicates.

---

## 8. Error Handling

- If both `spot` and `iv30` are null for a ticker, skip the insert and log an error.
- If `ticker` comes back empty or unparseable, skip and log.
- If `underlying_id` can’t be resolved, still insert the row but with `underlying_id = NULL` — triage can still use `ticker` if needed.

---

## 9. Implementation Notes (for Cursor)

- Implement the core upsert as a pure helper:

  - `lib/ingestion/underlyingsIvHistory.ts`  

  Example:

  ```ts
  export interface RawIvSnapshot {
    date: string;       // 'YYYY-MM-DD'
    ticker: string;
    spot?: number | null;
    iv30?: number | null;  // decimal
    source: string;
  }

  export async function upsertIvSnapshots(
    snapshots: RawIvSnapshot[]
  ): Promise<void>;```

The external fetcher (Edge function / cron) calls the provider API, builds an array of RawIvSnapshot, and then calls upsertIvSnapshots.

Do not add IBKR ingestion here; this module is vendor-agnostic. Each vendor is adapted into the RawIvSnapshot shape.
