# Transform Spec — Blotter Actions
Version 0.1 — YYYY-MM-DD  
Author: Nick

See also: `docs/data_model_v1.md`, `docs/transform_strategies.md`, `docs/transform_triage.md`.

---

## 1. Purpose

Define the schema and semantics for **blotter actions**:

- Table: `blotter_actions`
- Role: capture **human decisions and notes** about strategies and positions:
  - “Rolled short calls out 2 weeks”
  - “Closed strategy early due to macro change”
  - “Ignored assignment risk this time because XYZ”

This table is **user-driven** (Layer B **facts captured in the app**), not derived from IBKR.

---

## 2. Source Data

Inputs are:

- UI forms in the app:
  - Strategy detail page (“Add blotter note / action”)
  - Triage view (“Take action” on a flagged item)
- Potentially automated actions:
  - When a strategy auto-transitions status (e.g. `open → closed`), we can create a system-generated blotter row.

There is **no direct ingestion from Flex/Excel** into `blotter_actions` in v0.1.

---

## 3. Target Schema — `blotter_actions`

Logical definition:

- `id` — `uuid`, PK, default `gen_random_uuid()`

Context:

- `strategy_id` — `uuid`, FK → `strategies.id`, NULLABLE
- `position_id` — `uuid`, FK → `positions.id`, NULLABLE
- `triage_id` — `uuid`, FK → `triage_records.id`, NULLABLE (if action originated from triage)
- `account_id` — `uuid`, FK → `accounts.id`, NULLABLE

- At least one of `strategy_id` or `position_id` should normally be non-null.

Action timing:

- `action_at` — `timestamptz`, NOT NULL (when the action actually happened in markets)
- `recorded_at` — `timestamptz`, NOT NULL, default `now()` (when the user saved it in the app)

Action details:

- `action_type` — `text`, NOT NULL  
  Examples:
  - `'OPEN'`
  - `'PARTIAL_EXIT'`
  - `'FULL_EXIT'`
  - `'ROLL_OUT'`
  - `'ROLL_UP'`
  - `'ROLL_DOWN'`
  - `'SIZE_UP'`
  - `'SIZE_DOWN'`
  - `'HOLD'`
  - `'NOTE_ONLY'` (pure comment, no action)

- `size_delta` — `numeric`, NULLABLE  
  Change in total quantity/notional, if applicable (e.g. `-2` contracts).

- `reason_code` — `text`, NULLABLE  
  Machine-readable reason («rule»):
  - `'PLAYBOOK_PROFIT_TARGET'`
  - `'PLAYBOOK_DEFENSE_RULE'`
  - `'MACRO_CHANGE'`
  - `'GUT_FEELING'`
  - `'UNKNOWN'`

Narrative:

- `title` — `text`, NULLABLE (short description)
- `notes` — `text`, NULLABLE (free-form journal text)

Meta:

- `source` — `text`, NOT NULL, default `'manual'`  
  Possible values:
  - `'manual'` — user typed it
  - `'system'` — auto-generated from app logic
  - `'import'` — future Excel/CSV import, if any

- `created_by` — `text`, NULLABLE (user identifier / email)
- `created_at` — `timestamptz`, default `now()`
- `updated_at` — `timestamptz`, default `now()`

---

## 4. Row Semantics

Each row is:

> “A human- or system-recorded action/decision related to a strategy/position at a particular time, with context and reasons.”

- We never mutate history; edits are just updates of the text fields, not deletion of rows.
- We do **not** recompute or backfill these from IBKR.

---

## 5. Transform & Validation Rules

Since this is user input, “transform” is mostly validation:

1. **Context validation**

   - At least one of `strategy_id`, `position_id` must be present.
   - If `triage_id` is present, verify that triage record exists and is for the same day/strategy/position.

2. **Action type validation**

   - `action_type` must be in a small allowed set (enum-like).
   - Some types may require `size_delta` to be non-null:
     - `'SIZE_UP'`, `'SIZE_DOWN'`, `'ROLL_OUT'`, etc.

3. **Timing**

   - `action_at` defaults to:
     - The current time, or
     - Optional user-specified time (e.g. actual trade execution time).
   - `recorded_at` always set to `now()` on insert.

4. **Reasoning fields**

   - `reason_code` can be free-form text initially, but ideally limited to known codes.
   - `title` is optional but encouraged.
   - `notes` is unstructured and can be long.

---

## 6. Idempotency & Conflict Handling

There is no natural “idempotency key” here; blotter actions are **append-only**.

Rules:

- Always `INSERT` new rows; we don’t deduplicate by design.
- If needed, edits are done via `UPDATE` on existing rows (e.g. editing notes).

No “on conflict” logic is required beyond standard PK uniqueness.

---

## 7. Implementation Notes (for Cursor)

- Create a service module:

  - `lib/blotter/createBlotterAction.ts`
  - `lib/blotter/updateBlotterAction.ts`

- API routes:

  - `app/api/blotter/route.ts`:
    - `POST` to create a new action.
    - `PATCH`/`PUT` for updating an existing action.
    - `GET` to list actions for a strategy/position.

- Do **not** mix blotter insertion into ingestion jobs. It should only be called from:
  - UI handlers, or
  - specific app logic (e.g. when status changes to `closed`, generate a `'FULL_EXIT'` action of `source = 'system'`).
