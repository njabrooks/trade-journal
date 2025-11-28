<!-- ef6d6acf-ecca-45ce-855f-8fa753b3e106 3f6b7880-5f71-4656-9ce4-2d98680576b1 -->
# Phase 4 UI Implementation Plan

## Scope

- Build the four UI workstreams listed in Phase 4, integrating with existing derived data APIs.
- Touch core Next.js pages/components under `src/app` plus shared hooks/utilities.

## Approach

1. **Portfolio Dashboard**

- Add a new route (likely `src/app/dashboard/portfolio/page.tsx`) to show NAV trend, exposure breakdown, and underlying drilldowns per the `docs/transform_portfolio.md` metrics.
- Create reusable chart components (e.g., `src/components/charts/LineChart.tsx`, `StackedBar.tsx`) wired to existing data fetching utilities (`src/lib/derived/portfolio.ts`).
- Fetch data via server actions or `/api/recompute/portfolio`, cache with SWR/react-query if appropriate.

2. **Strategy Detail View**

- Add dynamic route `src/app/strategies/[strategyId]/page.tsx` that composes metrics timeline, open positions, triage flags, and blotter slice.
- Extend `src/lib/derived/strategyMetrics.ts` hooks/services to expose per-strategy timelines; add table components for positions and trades referencing `docs/transform_strategy_metrics.md` and `docs/transform_trades.md`.

3. **Triage Queue UI**

- Implement `src/app/triage/page.tsx` with queue filtering, flag display, and action buttons hooked to existing triage APIs (`src/app/api/recompute/triage/route.ts`).
- Build components for triage cards and bulk actions referencing business rules captured in `docs/transform_triage.md`.

4. **Blotter UI**

- Create `src/app/blotter/page.tsx` showing trade log per `docs/transform_blotter.md`, with sorting/filtering and links into strategy detail view.
- Reuse table primitives; add CSV export button that calls existing ingestion outputs if available.

## Implementation Todos

- `portfolio-ui`: Scaffold portfolio dashboard page, charts, and data hooks.
- `strategy-detail`: Build strategy detail route, metrics timeline, tables.
- `triage-queue`: Implement triage queue UI with actions and API wiring.
- `blotter-ui`: Deliver blotter page with filters, exports, and strategy links.
- `docs-update`: Document UI coverage + plan progress in `.cursor/plans/plan.plan.md`.

### To-dos

- [ ] Build portfolio dashboard page + charts
- [ ] Implement strategy detail route + sections
- [ ] Implement triage queue UI + actions
- [ ] Build blotter page with filters/export
- [ ] Update plan/progress documentation