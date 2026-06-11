# W1 Prune Sweep — Execution Report

**Date:** 2026-06-11 · **Branch:** `v2/prune-sweep` (9 commits) · **Net:** 203 files, −36,399 lines (+200)
**Verification:** all four post-prune verifiers passed (dangling refs, automation integrity, DB sanity, tree/build).

## Commits

| Commit | Tranche | Scope |
|---|---|---|
| 3e0ed3d | docs | v2 planning artifacts |
| f1fc0c6 | pre-fix | vol-curve Suspense (pre-existing red build) |
| 058bc6b | T1 | 9 page dirs deleted, nav surgery (−2,127) |
| 1660b46 | T2 | 35 components deleted incl. triage suite + news + checkpoint UI; SortableHeader → ui/ (−11,776) |
| 3118063 | T3a | Position-triage hooks removed from flex/crypto ingestion + strategy services; analyst sections stripped from finnhub script; signal evaluation preserved (+39/−605) |
| ba362da | T3b | Thesis-triage hooks removed from 10 kept routes/scripts; triage engines deleted (triage.ts 1,259 lines, thesisTriage partial, queries, types) (−5,062) |
| 986994a | T4 | 35 dead API route handlers + 4 orphaned modules (−4,225) |
| 05e53a5 | T5 | 48 dead scripts + archived fred plist (−9,327) |
| 566b527 | T6 | 19 tables dropped (migration run against Supabase), schema definitions removed, FK provenance columns preserved on signal_data_snapshots |

## Tables dropped (19) — CSV dumps in `archive/db-dumps/2026-06/` (local)

triage_records (3,411 rows), thesis_triage_records (10,620), intelligence_reports (114), intelligence_items (3,439), ai_prompts (3), research_hierarchy_recommendations → **NOT dropped (deferred W8)**, fred_observations, fred_series_metadata, fred_threshold_breaches, thesis_fred_indicators, analyst_actions, analyst_price_targets, monitoring_specs, monitoring_events, decision_audit_log, daily_snapshots, raw_flex_positions, raw_flex_trades, reconciliation_checkpoints, signal_data_tracking.

**Kept deliberately:** `asset_aliases`, `average_cost_positions` (empty but load-bearing in the kept accounting engine), `research_hierarchy_recommendations`, `research_processing_runs` (live claim-suggestion pipeline — W8).

## Judgment calls made during execution

1. **`ingest-world-monitor.ts` survived in redesigned form** (T5 deferred deletion — hard blocker: notes-repo skills execute it; T6 rewired it to emit `intel_items` + snapshots with deterministic report-keyed dedup ids, no report-table storage). D4's "delete ingestion" is therefore half-done by design; full removal happens in W8 with notes-repo coordination. Its next scheduled invocation is the live test.
2. **Signal triggers are now journal-only** — with triage gone, a threshold breach writes journal entries, no inbox item. If urgent invalidation triggers need a push path, that's a W6/W8 design item (the "needs decision" strip).
3. **Trade-ingestion dedup note:** re-ingesting additional trades for the same strategy+date now logs a fresh `trade_ingested` journal entry instead of updating a triage record — possible journal noise; monitor.

## Carried cleanup (small, non-blocking)

- Newly orphaned query modules: `secFilings.ts`, `economicEvents.ts`, `earningsEvents.ts` (their API routes died; ingestion still writes the tables — modules may be wanted again for W6 morning screen / W7 advisor; decide then)
- `createCheckpoint`/`getCheckpoints` orphaned in `queries/reconciliation.ts`
- `src/db/types.ts` still lists dropped tables (auto-generated; regenerate)
- Skill docs referencing deleted/changed scripts (synthesize-claims → link-evidence/promote-claim routes kept for it; assess-validation-evidence + notes-repo monitor skills mention old world-monitor behavior) — all W8
- Historical `intel_items` rows with `source_table='intelligence_items'`/`'analyst_actions'` dangle (soft refs, accepted)
- Two stale schema comments mentioning triage_records

## Incident note

GitHub Actions crons run from `origin/main`, which still had pre-prune code after the DB drop: **Flex (16:54, 17:35 UTC), Deribit (16:39), Solana (16:40) failed** inserting into dropped tables. Resolution: merge `v2/prune-sweep` → main and push (post-prune code removes those inserts — T3a was built for exactly this). Failures are transient/no data loss: ingestion re-runs idempotently on next cron.

## Restore path

Any dropped table: recreate DDL from `src/db/schema.ts` at commit `05e53a5` (pre-T6), then `\copy <table> FROM 'archive/db-dumps/2026-06/<table>.csv' WITH CSV HEADER`.
