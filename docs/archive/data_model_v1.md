# Data Model v1 — Taxonomy & Relationships
Version 0.1 — YYYY-MM-DD  
Author: Nick

---

## 1. Layers

We classify everything into 4 layers:

- **Reference (A):** slow-changing master data.
- **Core facts (B):** trades & daily snapshots, imported from IBKR / Option Strategist.
- **Derived facts (C):** materialized aggregates & flags.
- **Views (D):** SQL/API views for UX.

---

## 2. Tables by Layer

### A. Reference

- `accounts`
- `underlyings`
- `strategy_templates`
- `strategies`
- (future) `playbook_items`, `playbook_steps`

### B. Core Facts

- `trades`
- `positions`
- `mtm_snapshots`
- `nav_snapshots`
- `underlyings_iv_history`
- `blotter_actions`
- (future) `cash_flows`

### C. Derived Facts

- `strategy_metrics_snapshots`
- `portfolio_snapshots`
- `triage_records`

### D. Views (not physical tables)

- `positions_current`
- `strategies_current`
- `portfolio_current`
- `triage_current`

---

## 3. High-Level Relationships

(…brief bullets / diagram showing how trades → positions → strategy_metrics/triage, etc.)

