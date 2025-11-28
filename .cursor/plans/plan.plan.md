<!-- f04525e9-00cd-4273-b838-5d0b5e708fa6 81d02f89-8ade-4b0d-90b3-770d6b29cdae -->
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

3. ✅ **Playbook items**

- ✅ Added `playbook_items` table with schema (code, label, category, strategy_type, criteria, checklist_items)
- ✅ Created migrations for playbook_items table and strategy_type field on strategies
- ✅ Seeded 17 playbook items from WeeklyOptionsReview data (LC1-LC4, RR1-RR3, BC1-BC3, SD1-SD3, STK0-STK3)
- ✅ Added StrategyType selection to strategy confirmation workflow (single & bulk)
- ✅ Created query helpers in `src/db/queries/playbook.ts`
- ✅ Admin editor UI (`/admin/playbook`) with bulk creation workflow:
- ✅ Create new strategy type with multiple state codes in one form
- ✅ Specify number of state codes, then configure each with full metadata
- ✅ Edit/delete individual playbook items
- ✅ Filter by strategy type and category
- ✅ State code computation and storage in `strategy_metrics_snapshots.state_code`
- ✅ Strategy detail view displays current state code and playbook items (primary/secondary actions, risk notes)
- ✅ Strategy list view displays current state code
- ✅ Strategy metadata editing UI in `/admin/strategies` (strategyType, thesis, profitRules, defenseRules, timeRules)
- ✅ Automatic state code recomputation when strategyType is set/changed
- ⏳ Reference playbook codes from triage/blotter UI (state code computed but not yet displayed in triage/blotter pages)

4. ⏳ **Docs**: finalize `docs/transform_triage.md` to match implemented rules

- Implementation in `src/lib/derived/triage.ts` matches most of the spec
- Should verify all rules and thresholds are documented accurately
- Current implementation includes position-level and strategy-level triage with updated severity logic

## Phase 3: Strategy Workflow Enhancements

1. **Manual linking UI**: list unlinked positions/trades, bulk-assign to strategies
2. **Merged/archive view**: expose `status='merged'` strategies + history (optional undo)

## Phase 4: UI Dashboards & Workflows

1. ✅ Portfolio dashboard (`/dashboard/portfolio`) with NAV sparkline, exposure mix, top underlyings, and recent snapshots backed by `portfolio_snapshots`.
2. ✅ Strategy list + detail views (`/strategies`, `/strategies/[id]`) showing metrics timeline, open positions, triage flags, trades, and blotter slice.
3. ✅ Triage queue UI (`/triage`) including severity/context filters and recompute action hitting `/api/recompute/triage`.
4. ✅ Blotter UI (`/blotter`) with filtering, follow-up indicators, strategy deep links, and CSV export per `transform_blotter.md`.
5. ✅ **Notification & Task Workflow**:

- ✅ Enhanced triage page as universal notifications/tasks inbox (position + strategy contexts)
- ✅ Inline action buttons on triage items (Roll/Close/Mark Reviewed for positions, Confirm/Update for strategies)
- ✅ Action buttons create blotter entries automatically
- ✅ Severity-based filtering with counts (urgent/attention/watch/info)
- ✅ Strategy-level triage tasks: opening strategies (metadata confirmation), size/complexity checks
- ✅ Admin UI for managing triage trigger criteria (`/admin/triage`)
- ✅ State code computation logic (framework created, full integration pending)

## Phase 5: Automation & Monitoring

1. Post-ingestion triggers / notifications
2. Data quality reports (consistency checks, error dashboards)
3. Automated tests (unit + ingestion→recompute integration)

## Phase 6: Optional Excel Backfill

- Build `scripts/backfill_from_excel.ts` leveraging existing transforms if historical import is required later

## Next Steps

1. Implement automated Flex ingestion + IV history scraper
2. Build manual linking tools & merged-strategy archive view
3. Hook dashboards into auto refresh/notifications post ingestion (trigger recompute + monitoring)
4. Complete state code change detection integration (currently framework exists but disabled in triage computation)
5. Add state code change threshold editing to admin/playbook page
6. Reference playbook codes from triage/blotter (integrate playbook items into triage recommendations and blotter actions)
7. (Optional) expand strategy detail with blotter write actions + follow-up workflows

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
- [x] Add `playbook_items` table + admin management
- [ ] Manual linking UI + merged strategy archive
- [x] Portfolio/strategy/triage dashboards (Phase 4 UI, includes blotter export & triage actions)
- [ ] Add post-ingestion triggers, monitoring, and regression tests