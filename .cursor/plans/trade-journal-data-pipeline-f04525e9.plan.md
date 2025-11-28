<!-- f04525e9-00cd-4273-b838-5d0b5e708fa6 d58caf8f-ce9b-4e97-aa99-80a0971d813f -->
# Trade Journal Data Pipeline: Updated Plan

## ✅ Completed

- Manual Flex ingestion UI + all four parsers (trades, positions, MTM, NAV)
- Core schema + derived tables (`portfolio_snapshots`, `strategy_metrics_snapshots`, `triage_records`)
- Derived computations + batch recompute API/UI
- Auto strategy derivation, confirm/merge/edit workflow, strategy CRUD + linking
- Recompute validated on 2025 YTD data; triage/portfolio insert issues resolved

## Phase 1: Data Ingestion Hardening

1. **Endpoint regression tests**: scripted TRNT/POST/MTMP/EQUT flows, richer CSV error logging
2. **Account & underlying tooling**: optional CLI and/or admin UI for underlyings

## Phase 2: Reference & Derived Data Expansion

1. **Automated Flex ingestion**

- Edge function/cron to call IBKR Flex APIs (FLEX token + query IDs)
- Reuse existing normalizers; trigger recompute on success
- Keep manual upload for backfills

2. **Underlyings IV history ingestion**

- `lib/ingestion/underlyingsIvHistory.ts`
- Scrape/ingest Option Strategist data (or Massive API) via scheduled job

3. **Playbook items**

- Add `playbook_items` table, seeding scripts, admin editor
- Reference playbook codes from triage/blotter

4. **Docs**: finalize `docs/transform_triage.md` to match implemented rules

## Phase 3: Strategy Workflow Enhancements

1. **Manual linking UI**: list unlinked positions/trades, bulk-assign to strategies
2. **Merged/archive view**: expose `status='merged'` strategies + history (optional undo)

## Phase 4: UI Dashboards & Workflows

1. Portfolio dashboard (NAV trend, exposure breakdown, underlying drilldowns)
2. Strategy detail view (metrics timeline, open positions, triage flags, blotter)
3. Triage queue UI with action buttons
4. Blotter UI per `transform_blotter.md`

## Phase 5: Automation & Monitoring

1. Post-ingestion triggers / notifications
2. Data quality reports (consistency checks, error dashboards)
3. Automated tests (unit + ingestion→recompute integration)

## Phase 6: Optional Excel Backfill

- Build `scripts/backfill_from_excel.ts` leveraging existing transforms if historical import is required later

## Next Steps

1. Implement automated Flex ingestion + IV history scraper
2. Add `playbook_items` table + admin UI
3. Build manual linking tools & merged-strategy archive view
4. Begin dashboard/triage UI work
5. (Optional) add post-upload recompute trigger + monitoring

### Task Tracking

- [x] Account seeding infrastructure
- [x] Verify Flex ingestion endpoints with real data
- [x] Add `portfolio_snapshots` table + migration
- [x] Add `strategy_metrics_snapshots` table + migration
- [x] Implement strategy metrics aggregation + API
- [x] Implement portfolio snapshots aggregation + API
- [x] Implement triage computation + API
- [x] Create strategy CRUD API + services
- [x] Implement strategy linking & auto-derivation
- [x] Create batch recompute endpoint/UI
- [x] End-to-end data test on historical dataset
- [ ] Build automated Flex ingestion (Edge function/cron) and hook into recompute
- [ ] Implement underlyings IV history ingestion
- [ ] Add `playbook_items` table + admin management
- [ ] Manual linking UI + merged strategy archive
- [ ] Portfolio/strategy/triage dashboards
- [ ] Add post-ingestion triggers, monitoring, and regression tests

### To-dos

- [ ] Create account seeding infrastructure (lib/ingestion/accounts.ts) and seed initial accounts
- [ ] Verify all 4 Flex ingestion endpoints work correctly with real data
- [ ] Add portfolio_snapshots table to schema and create migration
- [ ] Add strategy_metrics_snapshots table to schema and create migration
- [ ] Implement strategy metrics computation (lib/derived/strategyMetrics.ts) and API endpoint
- [ ] Implement portfolio snapshots computation (lib/derived/portfolio.ts) and API endpoint
- [ ] Complete transform_triage.md specification with rule definitions
- [ ] Implement triage computation (lib/derived/triage.ts) and API endpoint
- [ ] Create strategy CRUD API (/api/strategies) and service functions
- [ ] Implement strategy-to-position/trade linking logic
- [ ] Create batch recompute endpoint (/api/recompute/all) for all derived data
- [ ] Test end-to-end data flow from Flex CSV upload through all derived computations