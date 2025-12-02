<!-- 98c0e756-99d4-4646-8e46-3c2cf64adcff 043734ba-dd34-45b4-aeaa-b650ee318404 -->
# Auto-Trigger Recompute After Data Changes

## Performance Analysis (Validated)

All recompute events are scoped to specific strategies (not all strategies), making them fast enough to automate:

- **Daily ingestion recompute**: Single date, all strategies (~2.5-10s for 50-100 strategies) - ✅ Fast enough
- **After manual linking**: 1-2 strategies, 1-10 dates (~150ms-1s) - ✅ Very fast
- **After strategy merge**: 1 strategy, 10-100+ dates (~2.5-5s) - ✅ Acceptable for user-initiated
- **After strategy confirmation**: 1 strategy, 1 date (~50-100ms) - ✅ Already optimal

## Implementation Tasks

### 1. Auto-trigger after manual linking

**Location**: `src/lib/services/strategyLinking.ts`

- Modify `linkPositionToStrategy()` and `linkTradeToStrategy()` to:

1. After linking, find all snapshot dates where the linked position/trade exists
2. Call `computeStrategyMetricsForDateRange()` for the affected strategy and dates
3. Optionally trigger triage recompute for those dates

**Scope**: Only affected strategies, only dates where linked items exist

### 2. Auto-trigger after strategy merge

**Location**: `src/lib/services/strategies.ts` - `mergeStrategies()` function

- After merge completes (line 350), find all snapshot dates where target strategy has positions
- Call `computeStrategyMetricsForDateRange()` for target strategy across all dates
- Optionally trigger triage recompute for affected dates

**Scope**: Target strategy only, all dates where it has positions

### 3. Auto-trigger after Flex ingestion

**Location**: `src/app/api/ingest/flex/positions/route.ts` and `src/app/api/ingest/flex/trades/route.ts`

- After successful ingestion, extract the snapshot date from ingested data
- Call `/api/recompute/all` with `snapshotDate` parameter
- Or directly call recompute functions for that date

**Scope**: Single date, all strategies (already fast enough)

## Notes

- Strategy confirmation already triggers recompute automatically via `recomputeStateCodeForStrategy()` which calls `computeStrategyMetrics()` (full metrics, not just state code)
- All recompute operations use upsert logic, so they're safe to run multiple times
- Consider adding error handling/logging for automated recompute failures

### To-dos

- [ ] Build automated Flex ingestion (edge function/cron) calling IBKR Flex API, reusing existing normalizers, triggering recompute on success
- [ ] Implement state code change detection in triage computation - compare current vs previous snapshot, create urgent triage item when state code changes
- [ ] Add auto-resolution to triage records - mark resolved when action taken or underlying condition no longer applies (DTE > threshold, size reduced)
- [ ] Display playbook items (primary/secondary actions, risk notes) in triage recommendations based on current state code
- [ ] Build admin UI for manual linking - list unlinked positions/trades, bulk-assign to strategies