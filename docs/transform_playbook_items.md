# Transform Spec — Playbook Items
Version 0.1 — YYYY-MM-DD  
Author: Nick

See also: `docs/data_model_v1.md`, `docs/transform_triage.md`, `docs/transform_blotter.md`.

---

## 1. Purpose

Define the schema and semantics for the **strategy playbook**:

- Table: `playbook_items`
- Role: store reusable **checklists, rules, and decision templates** that:
  - Inform triage rules.
  - Guide the weekly review workflow.
  - Provide structured prompts for blotter entries (“Apply Rule X”).

This is **reference data** (Layer A), curated by you via seeds or an admin UI — *not* derived from IBKR.

---

## 2. Source Data

- Initially:
  - Seeded data in SQL or TypeScript (e.g. migration/seeder scripts).
  - Optionally edited via an internal “Playbook Admin” page.

- There is no ingestion from Flex/Excel.

---

## 3. Target Schema — `playbook_items`

Logical definition:

- `id` — `uuid`, PK, default `gen_random_uuid()`

Classification:

- `category` — `text`, NOT NULL  
  Examples:
  - `'entry'`
  - `'profit'`
  - `'defense'`
  - `'time'`
  - `'risk'`
  - `'meta'` (process reflections)

- `code` — `text`, NOT NULL, UNIQUE  
  Short machine name, e.g.:
  - `'OPT_PROFIT_50PCT'`
  - `'OPT_DEFENSE_ROLL_1SIGMA'`
  - `'PORTFOLIO_MAX_UNDERLYING_25PCT_NAV'`

- `label` — `text`, NOT NULL  
  Human-readable title.

- `description` — `text`, NULLABLE  
  More detailed explanation of the rule.

Relationships:

- `strategy_template_id` — `uuid`, FK → `strategy_templates.id`, NULLABLE  
  If this playbook item is specific to a given template; null means global.

- `applies_to_context` — `text`, NULLABLE  
  (or a JSON array) describing what this rule applies to, e.g.:
  - `'strategy'`
  - `'position'`
  - `'portfolio'`
  - `'underlying'`

Optional rule wiring (for future versions):

- `linked_triage_rule_set` — `text`, NULLABLE  
  E.g. `'options_v1'` to indicate that triage rule set uses this playbook item.

- `default_severity` — `text`, NULLABLE  
  E.g. `'info'`, `'attention'`, `'urgent'`.

- `checklist_items` — `jsonb`, NULLABLE  
  An array of simple checklist steps:
  ```json
  [
    { "order": 1, "text": "Check IV vs HV" },
    { "order": 2, "text": "Check P&L vs target" }
  ]

Metadata:
- is_active — boolean, NOT NULL, default true
- created_at — timestamptz, default now()
- updated_at — timestamptz, default now()

4. Row Semantics

Each row is:

“A named rule/checklist item in your options playbook, optionally tied to a strategy template, that can be referenced from triage and blotter.”

Example:
- code = 'OPT_DEFENSE_ROLL_1SIGMA'
- category = 'defense'
- applies_to_context = 'position'
- linked_triage_rule_set = 'options_v1'
- checklist_items describes steps to follow when rule is triggered.

5. Usage with Other Tables

- Triage → Playbook linkage:
  - A triage rule that fires (e.g. “short option within 0.5 sigma, DTE < 7”) can set:
    - triage_records.recommended_action = 'APPLY_PLAYBOOK_RULE'
    - and embed a playbook_code in triage_records.notes or a dedicated field (v0.2).
  - UI can then show the appropriate playbook_items entry.

- Blotter → Playbook linkage:
  - When user responds to triage, they can tag their blotter action with:
    - reason_code = playbook_items.code
  - This connects actual behaviour back to the planned playbook.
- Strategy_templates → Playbook_items:
  - When looking at a strategy template, the UI can show all relevant playbook rules (filtered by strategy_template_id or category).

6. Idempotency & Conflict Handling

Playbook is reference data. Natural keys:
- code (unique)
- Optionally, (strategy_template_id, code) if you want per-template overrides.

Seeding / migrations:
- Use INSERT ... ON CONFLICT (code) DO UPDATE to allow updating descriptions/checklists over time.

Deactivation:
- Use is_active = false rather than deleting rows, so historical references still make sense.

7. Implementation Notes (for Cursor)

- Add playbook_items table to db/schema.ts as per this spec.
- Create a small seeding module:
  - scripts/seed_playbook_items.ts or similar.
- For admin UI:
  - app/admin/playbook/page.tsx:
    - List playbook items.
    - Filter by category / strategy template.
    - Allow toggling is_active and editing description and checklist_items.
  - No ingestion API routes are needed beyond standard CRUD for admin.