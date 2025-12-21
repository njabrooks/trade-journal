# Compute Operations Overview

Complete breakdown of all computation instances across the Trade Journal app.

## Compute Pipeline Architecture

**Data Flow**: Raw Data (Flex) → Positions/Trades → Derived Data (Portfolio, Strategy Metrics, Triage)

All compute operations use **upsert logic** (delete + insert) for idempotency - safe to run multiple times.

---

## 1. Portfolio Snapshots

**Location**: `src/lib/derived/portfolio.ts`

### What It Computes
- **Account-level**: Total abs notional, unrealized PnL, % NAV, stock/option breakdown
- **Underlying-level**: Same metrics filtered by underlying

### Process
1. Query all positions for account/date (or account/date/underlying)
2. Query NAV snapshot for account/date
3. Aggregate: sum abs notional, sum PnL, compute % NAV
4. Upsert to `portfolio_snapshots` table

### When It Runs
- ✅ **Auto**: After Flex positions ingestion (single date)
- ✅ **Manual**: `/api/recompute/portfolio` (single date or range)
- ✅ **Manual**: `/api/recompute/all` (single date or range)

### Performance
- **Single date**: ~50-200ms (depends on position count)
- **Date range**: Linear scaling (~50-200ms per date)
- **Robustness**: ✅ Simple aggregation, very reliable

### Consistency
- ✅ Consistent process across all triggers
- ✅ Uses same upsert pattern
- ✅ Error handling: failures logged, don't block main operation

---

## 2. Strategy Metrics

**Location**: `src/lib/derived/strategyMetrics.ts`

### What It Computes
- Total abs notional, unrealized PnL, % NAV
- Number of open positions
- Min/max DTE (for options)
- **State code** (via `computeStateCode()` - includes playbook evaluation)
- Realized PnL to date (placeholder - not yet implemented)

### Process
1. Query positions for strategy/account/date
2. Query NAV snapshot
3. Aggregate position metrics
4. Compute DTE ranges (for options)
5. **Compute state code** (if strategy has `strategyType`):
   - Load playbook items for strategy type
   - Evaluate criteria (MaxDTE, PnlPctOfCost, WorstShortSigma, AssignmentRisk, ITM)
   - Return first matching state code (or catch-all if no criteria)
6. Upsert to `strategy_metrics_snapshots` table

### When It Runs
- ✅ **Auto**: After Flex positions ingestion (single date, all strategies)
- ✅ **Auto**: After manual linking (affected strategy, affected dates)
- ✅ **Auto**: After strategy merge (target strategy, all dates)
- ✅ **Auto**: After strategy confirmation (backfills all historical dates)
- ✅ **Manual**: `/api/recompute/strategy-metrics` (single date or range)
- ✅ **Manual**: `/api/recompute/all` (single date or range)

### Performance
- **Single date, single strategy**: ~50-150ms (includes state code computation)
- **Single date, all strategies**: ~2.5-10s (50-100 strategies)
- **Date range, single strategy**: Linear scaling
- **State code computation**: ~20-50ms per strategy (reads stored values for change detection)
- **Robustness**: ✅ Good - state code computation has error handling (logs but doesn't fail metrics)

### Consistency
- ✅ Consistent process across all triggers
- ✅ State code computation is optional (doesn't fail if missing)
- ✅ Error handling: state code failures logged but don't fail metrics computation

---

## 3. Triage Records

**Location**: `src/lib/derived/triage.ts`

### What It Computes
- **Position-level triggers**: DTE flags, Sigma flags, Assignment risk, ITM flags
- **Strategy-level triggers**: CONFIRM_STRATEGIES, PROVIDE_STRATEGY_METADATA, REVIEW_SIZE, REVIEW_COMPLEXITY, STATE_CODE_CHANGE, QUANTITY_CHANGE
- Severity computation with override checking (Monitor/Dismiss persistence)

### Process
1. **Position-level triage** (`computePositionTriageForDate`):
   - Query all option positions for date
   - For each position: compute DTE, sigma-to-strike, ITM, assignment risk
   - Query IV history for sigma calculations (falls back gracefully if missing)
   - Determine severity based on priority (assignment > sigma > DTE)
   - Check severity override from `blotter_actions`
   - Create triage records
2. **Strategy-level triage** (`computeStrategyTriageForDate`):
   - Query strategy metrics for date
   - Check unconfirmed strategies, missing metadata, size, complexity
   - **State code change detection** (reads stored state codes - fast)
   - Check severity overrides
   - Create triage records
3. **Quantity change detection** (`computeQuantityChangeTriageForDate`):
   - Compare positions between consecutive snapshot dates
   - Detect quantity changes (open, close, add, reduce)
   - Reconcile pending TRADE actions (mark complete if quantity changed)
   - Create triage records only if no pending action was reconciled
4. Upsert all records (delete by ruleSet + context, then insert)

### When It Runs
- ✅ **Auto**: After Flex positions ingestion (single date)
- ✅ **Auto**: After manual linking (affected dates)
- ✅ **Auto**: After strategy merge (affected dates)
- ✅ **Auto**: After Flex trades ingestion (uses trade dates)
- ✅ **Manual**: `/api/recompute/triage` (single date or range)
- ✅ **Manual**: `/api/recompute/all` (single date or range)

### Performance
- **Single date**: ~500ms-2s (depends on position/strategy count)
- **Date range**: Linear scaling
- **Position-level**: ~10-50ms per position (includes IV lookup)
- **Strategy-level**: ~5-20ms per strategy
- **Quantity change**: ~100-500ms (depends on position count)
- **Robustness**: ✅ Good - IV missing handled gracefully, override checks are fast

### Consistency
- ✅ Consistent process across all triggers
- ✅ Severity override mechanism works consistently
- ✅ Quantity change reconciliation prevents duplicates
- ⚠️ **IV dependency**: Sigma calculations need IV history (falls back gracefully but may miss some flags)

---

## 4. State Code Computation

**Location**: `src/lib/derived/stateCode.ts`

### What It Computes
- Current state code for a strategy based on playbook criteria
- State code change detection (reads stored values - fast)

### Process
1. Get strategy `strategyType`
2. Load playbook items for strategy type (ordered by code)
3. Query strategy metrics for MaxDTE
4. Compute: PnlPctOfCost, WorstShortSigma, AssignmentRisk, ITM legs
5. Evaluate playbook criteria in order (first match wins)
6. **Catch-all**: Empty criteria = always matches (ensures every strategy has a state code)
7. Return state code or null (with warning log)

### When It Runs
- ✅ **Auto**: During strategy metrics computation (if strategy has `strategyType`)
- ✅ **Auto**: After strategy confirmation (backfills all historical dates)
- ✅ **Auto**: During triage computation (state code change detection - reads stored values)
- ✅ **Manual**: Via `recomputeStateCodeForStrategy()` service

### Performance
- **Computation**: ~20-50ms per strategy (includes multiple DB queries)
- **Change detection**: ~5-10ms (reads stored values - very fast)
- **Robustness**: ✅ Good - catch-all ensures no nulls, error handling in place

### Consistency
- ✅ Consistent evaluation logic
- ✅ Catch-all mechanism ensures completeness
- ✅ Historical backfill on confirmation ensures timeline completeness
- ✅ Fast change detection (reads stored, doesn't recompute)

---

## 5. Strategy Auto-Linking

**Location**: `src/lib/derived/strategyAuto.ts`

### What It Computes
- Auto-derives strategies from positions/trades
- Links positions/trades to strategies based on heuristics

### Process
1. Query unlinked positions/trades
2. Group by derived strategy key (symbol + expiry pattern)
3. Find or create strategy for each group
4. Link positions/trades to strategies
5. Returns: strategies created, positions/trades linked

### When It Runs
- ✅ **Auto**: During `/api/recompute/all` (before other computations)
- ✅ **Manual**: Via auto-link functions (can be called independently)

### Performance
- **Single date**: ~100-500ms (depends on unlinked item count)
- **Date range**: Linear scaling
- **Robustness**: ✅ Good - heuristic-based, safe to run multiple times

### Consistency
- ✅ Consistent heuristics
- ✅ Idempotent (safe to run multiple times)

---

## 6. Auto-Trigger Recompute (New - #21)

**Location**: Multiple files (see implementation)

### What It Triggers
- Strategy metrics recompute
- Triage recompute
- Portfolio snapshots (only for positions ingestion, not for linking/merge)

### When It Runs
- ✅ **After manual linking**: `linkPositionToStrategy()`, `linkTradeToStrategy()`
- ✅ **After strategy merge**: `mergeStrategies()`
- ✅ **After Flex ingestion**: Positions and trades routes

### Performance
- **Manual linking**: ~150ms-1s (1-2 strategies, 1-10 dates) ✅ Very fast
- **Strategy merge**: ~2.5-5s (1 strategy, 10-100+ dates) ✅ Acceptable
- **Flex ingestion**: ~2.5-10s (single date, all strategies) ✅ Fast enough

### Robustness
- ✅ Error handling: Recompute failures logged but don't fail main operation
- ✅ Scoped: Only recomputes affected strategies/dates
- ✅ Non-blocking: Runs synchronously but errors don't propagate

### Consistency
- ✅ Consistent pattern: Find affected dates → recompute metrics → recompute triage
- ✅ All auto-triggers use same helper functions
- ✅ Error handling pattern is consistent

---

## Summary: Robustness & Performance

### ✅ Robust
- **Portfolio snapshots**: Simple aggregation, very reliable
- **Strategy metrics**: Good error handling, state code failures don't break metrics
- **Triage**: Graceful fallbacks (IV missing), override mechanism works
- **State codes**: Catch-all ensures completeness, error handling in place
- **Auto-triggers**: Errors logged but don't fail main operations

### ✅ Performance
- **All operations validated**: Fast enough to automate (see plan document)
- **Scoped recomputes**: Only affected strategies/dates (not all data)
- **Optimized state code change**: Reads stored values instead of recomputing
- **Linear scaling**: Date ranges scale predictably

### ✅ Consistency
- **Upsert pattern**: All computations use delete + insert (idempotent)
- **Error handling**: Consistent pattern across all operations
- **Auto-trigger pattern**: Consistent find dates → recompute → triage flow
- **API structure**: Consistent single date vs date range pattern

### ⚠️ Areas for Improvement
1. **IV dependency**: Triage sigma calculations need IV history (currently falls back gracefully)
2. **State code on confirmation**: Backfills all historical dates after confirmation - ✅ Implemented
3. **Trades ingestion recompute**: Uses trade dates as snapshot dates (may not align perfectly)
4. **Error visibility**: Recompute errors logged but not surfaced to user in UI

---

## Compute Operation Matrix

| Operation | Auto-Trigger | Manual API | Performance | Robustness |
|-----------|--------------|------------|-------------|------------|
| Portfolio Snapshots | ✅ Ingestion | ✅ `/api/recompute/portfolio` | ✅ Fast | ✅ Very robust |
| Strategy Metrics | ✅ Ingestion, Linking, Merge, Confirmation | ✅ `/api/recompute/strategy-metrics` | ✅ Fast | ✅ Good |
| Triage | ✅ Ingestion, Linking, Merge | ✅ `/api/recompute/triage` | ✅ Fast | ✅ Good |
| State Codes | ✅ Metrics computation, Confirmation | ✅ Via strategy metrics | ✅ Fast | ✅ Good |
| Auto-Linking | ✅ During `/api/recompute/all` | ✅ Via auto-link functions | ✅ Fast | ✅ Good |

---

## Recommendations

1. ✅ **Auto-triggers implemented** - No manual recompute needed for most workflows
2. ⚠️ **IV History ingestion** - Still needed for complete triage coverage
3. ✅ **Error visibility** - Consider surfacing recompute errors in UI (currently just logged)
4. ✅ **Performance monitoring** - All operations validated, but could add timing logs for monitoring

