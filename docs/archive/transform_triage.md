# Transform Spec — Triage Records
Version 0.1 — YYYY-MM-DD  
Author: Nick

See also: `docs/data_model_v1.md`, `docs/transform_positions.md`, `docs/transform_strategy_metrics.md`.

---

## 1. Purpose

Define how we compute **rule-based triage flags and recommendations** into `triage_records`.

Triage is the layer that says:

- “This option is short DTE and near-the-money – pay attention.”
- “This strategy has large exposure vs NAV – consider reducing.”
- “This position has high assignment risk.”

These are *derived facts* (Layer C) fed into UI views like `Triage`, `Strategies_State`, and the weekly review.

---

## 2. Source Data

### 2.1 positions (snapshot)

From `positions`:

- `id` (position_id)
- `account_id`
- `strategy_id` (nullable)
- `underlying_id` (nullable)
- `snapshot_date`
- `asset_class`
- `symbol`
- `expiry`, `strike`, `option_right`, `multiplier`
- `quantity`
- `side` (`LONG` / `SHORT`)
- `abs_notional`
- `unrealized_pnl`
- `spot`

### 2.2 strategy_metrics_snapshots (optional)

From `strategy_metrics_snapshots`:

- `strategy_id`
- `snapshot_date`
- `total_abs_notional`
- `pct_nav_abs_notional`
- `num_open_positions`
- `min_dte`, `max_dte`

Used for strategy-level triage.

### 2.3 underlyings_iv_history (optional, for sigma-to-strike)

From `underlyings_iv_history`:

- `underlying_id`
- `date`
- `spot`
- `iv30` (annualised implied vol)

Used to compute “sigma-to-strike”.

---

## 3. Target Schema — `triage_records`

**Proposed** schema (to be confirmed/added in `db/schema.ts`):

- `id` — `uuid`, PK
- `account_id` — `uuid`, FK → `accounts.id`, NOT NULL
- `snapshot_date` — `date`, NOT NULL

Context:

- `context_level` — `text`, NOT NULL, ENUM-like:
  - `'position'`
  - `'strategy'`
  - `'underlying'`
  - `'account'`

- `position_id` — `uuid`, FK → `positions.id`, NULLABLE  
- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE  
- `underlying_id` — `uuid`, FK → `underlyings.id`, NULLABLE  

At least one of these should be non-null, depending on `context_level`.

Flags & metrics (v0.1, mostly option-related):

- `dte` — `integer`, NULLABLE  
- `dte_bucket` — `text`, NULLABLE (e.g. `"0-7"`, `"8-30"`, `">30"`)

- `is_itm` — `boolean`, NULLABLE  
- `sigma_to_strike` — `numeric`, NULLABLE  
- `flag_sigma_0_5` — `boolean`, NULLABLE  
- `flag_sigma_1_0` — `boolean`, NULLABLE  
- `flag_assignment_risk` — `boolean`, NULLABLE  

- `abs_notional` — `numeric`, NULLABLE  
- `pct_nav_abs_notional` — `numeric`, NULLABLE (for strategy / account context)

Recommendation:

- `severity` — `text`, NULLABLE (e.g. `'info' | 'watch' | 'attention' | 'urgent'`)  
- `recommended_action` — `text`, NULLABLE (short machine-readable code, e.g. `'ROLL_OUT'`, `'CLOSE'`, `'REDUCE_SIZE'`)  
- `notes` — `text`, NULLABLE (human-readable explanation)  

Meta:

- `rule_set` — `text`, NULLABLE (e.g. `'options_v1'`)  
- `created_at` — `timestamptz`, default `now()`  
- `updated_at` — `timestamptz`, default `now()`  

---

## 4. Row Semantics

- A **position-level** record (`context_level = 'position'`) describes triage for a specific option/stock leg.
- A **strategy-level** record summarises triage for a strategy (e.g. “strategy > 20% NAV with short DTE shorts”).
- An **account-level** record flags extreme overall risk (e.g. leverage, concentration).

We can start with **position-level** triage in v0.1 and add higher levels later.

---

## 5. Core Rules (v0.1)

The exact thresholds can be tuned, but we’ll start by mirroring the workbook logic conceptually:

### 5.1 DTE & buckets

For options (`asset_class = 'OPT'` and `expiry` ≠ NULL):

DTE = (expiry - snapshot_date) in days, integer

Then:
- dte_bucket:
  - 0-7 if DTE <= 7
  - 8-30 if 7 < DTE <= 30
  - >30 if DTE > 30

(You can align with your existing DTE_Bucket logic.)

We may choose to create a triage record only when:

DTE <= 45 (i.e. near- to medium-dated positions).

### 5.2 ITM / OTM

For options:

- If call (option_right = 'C'):
  - is_itm = spot > strike
- If put (option_right = 'P'):
  - is_itm = spot < strike
- Else (stock): is_itm = NULL.

### 5.3 Sigma to strike

Requires iv30 for the underlying and a convention:

Let:

- S = spot
- K = strike
- σ = iv30 (annual volatility, decimal)
- T = DTE / 365

Then define a simple distance:
sigma_to_strike = |ln(S / K)| / (σ * sqrt(T))

If iv30 or T missing/zero, set sigma_to_strike = NULL.

Flags:

- flag_sigma_0_5 = true if sigma_to_strike <= 0.5 (very close to the money)
- flag_sigma_1_0 = true if sigma_to_strike <= 1.0 (within 1 sigma)

### 5.4 Assignment risk

Heuristic:
- Option is short (side = 'SHORT')
- is_itm = true
- DTE <= assignment_dte_threshold (e.g. 10 days)
- Asset type is equity/ETF: asset_class = 'OPT' and underlying is stock/ETF.

Then:

- flag_assignment_risk = true
- severity at least 'attention'.

### 5.5 Size vs NAV (strategy-level)

Using strategy_metrics_snapshots:

- For a (strategy, date), if:
  - pct_nav_abs_notional >= size_attention_threshold (e.g. 0.15 or 15%)

then create a strategy-level triage record with:
- context_level = 'strategy'
- severity = 'attention' or 'urgent' depending on threshold.
- recommended_action like 'REVIEW_SIZE'.

## 6. Record Generation Policy

In v0.1, we can keep it simple:

- Position-level triage:

Create one record per position where at least one of:
- DTE <= 30
- flag_sigma_1_0 = true
- flag_assignment_risk = true
is true.

- Strategy-level triage:

Create one record per strategy where:
- pct_nav_abs_notional >= 0.15 (configurable)
- Or num_open_positions > N (e.g. N=10) if you care about complexity.

- No underlying/account-level triage in v0.1 (but schema supports it).

## 7. Idempotency & Conflict Handling

Natural keys:

- Position-level: (context_level = 'position', position_id, snapshot_date, rule_set)
- Strategy-level: (context_level = 'strategy', strategy_id, snapshot_date, rule_set)

Policy:

- For a given run and rule_set (e.g. 'options_v1'), use:

INSERT ... ON CONFLICT (context_level, position_id, strategy_id, snapshot_date, rule_set)
DO UPDATE SET ...

- Overwrite flags/metrics; they are deterministic from positions/metrics.

## 8. Error Handling

If:

- position_id can’t be resolved or underlying IV missing — we just have fewer metrics (sigma null) but can still triage on DTE/ITM/notional.

The triage pipeline should be tolerant:

- Missing IV → no sigma flags, but DTE + notional rules still run.
- Missing NAV → position-level triage unaffected; strategy-level size-vs-NAV disabled.

## 9. Implementation Notes (for Cursor)

Implement:

- Pure rules engine:
  - lib/derived/triage.ts

Example:

export async function computePositionTriageForDate(
  snapshotDate: string
): Promise<NewTriageRecord[]>;

export async function computeStrategyTriageForDate(
  snapshotDate: string
): Promise<NewTriageRecord[]>;

- API endpoint:
  - app/api/recompute/triage/route.ts

The rules (thresholds, buckets) should be declared as constants or config in one place (triageRulesOptionsV1) so we can version them later.

Any changes to thresholds or rule logic should bump rule_set (e.g. 'options_v2')