# Trade Journal Migration Plan

**Created**: February 15, 2026
**Status**: M1–M4 + M4.5a/M4.5b + M7 + M9a/M9b complete. Per-source price delivery monitoring live. Next: M7.1 (reconciliation resolution), then M5/M6/M8.
**Goal**: Consolidate the Two Trees Capital portfolio infrastructure (events, calculations, price pipeline, daily NAV) into the Trade Journal app, then sunset the twotreescap-app.

> **Note**: This file was moved from `twotreescap-app/docs/TRADE_JOURNAL_MIGRATION_PLAN.md` on 2026-02-19. The original location still has a copy that should be considered stale.

---

## Context

Two projects currently serve complementary purposes:

| Project | Purpose | Tech Stack |
|---------|---------|------------|
| **twotreescap-app** | Portfolio accounting: event-sourced transactions, FIFO/average cost calculations, daily balances, price pipeline, NAV | Next.js, Drizzle, Supabase |
| **trade-journal** | Investment operating system: decision hierarchy (theses → strategies → positions), research pipeline, signals, triage, journal | Next.js 16, Drizzle, Supabase |

The twotreescap-app has reached feature-completeness for its core mission (Phases 1-8 of [COMPLETION_PLAN.md](../../twotreescap-app/docs/COMPLETION_PLAN.md)). The remaining work (Phases 4-5: base currency, UK tax) plus ongoing maintenance (daily price crons, data freshness) would be better implemented in the Trade Journal, which is the actively-developed primary app.

### Why Merge

1. **Single source of truth**: Both apps query the same Supabase database. Having two Next.js apps with overlapping schemas creates drift risk.
2. **Shared entities**: `underlyings`, `accounts`, `owners` exist in both schemas with different shapes. Trade Journal's `trades` table and twotreescap-app's `events` table describe the same real-world data.
3. **Reduce operational overhead**: One app to deploy, one codebase to maintain, one set of cron jobs.
4. **Better UX**: Portfolio NAV, gain/loss reports, and price coverage naturally belong alongside position management, triage, and thesis monitoring.
5. **Clean codebase**: twotreescap-app accumulated V1 legacy code, defunct schemas, and feature flags that no longer serve a purpose.
6. **Drop unnecessary complexity**: TTC app uses Clerk authentication which is overkill for a domestic/single-user setup. Trade Journal's simpler auth is sufficient.

### Architecture Principles

1. **Portfolio accounting is a separate feature** within Trade Journal, not merged into existing ingestion pipelines. The `events` table and calculation engine operate independently from Trade Journal's `trades`/`positions`/`strategies` data.

2. **~~Two separate~~ Unified IBKR pathway**: Trade Journal's Flex Query ingestion feeds both the trading/strategy side (`trades`, `positions`) and — via `bridge-flex-to-events.ts` — the tax accounting side (`events`). Combined Report manual imports are retained for historical backfill only. See [IBKR Overlap Analysis](#ibkr-overlap-analysis) below.

3. **Koinly remains manual**: Koinly CSV imports happen intermittently (quarterly, per tax year). No API integration needed — just a file upload UI.

4. **Crypto prices via Polygon.io (Massive API)**: Trade Journal's existing Massive.com integration is for equity prices. The TTC-side Polygon.io integration is for crypto prices. These are different APIs serving different asset classes. Investigate whether Massive.com can also serve crypto prices to consolidate.

5. **Two portfolio views as a cross-check**: The snapshot-based view (Trade Journal's exchange API positions) and the event-sourced view (TTC's transaction history → daily balances) should produce the same portfolio value. Discrepancies surface data integrity issues — missing transactions, incorrect prices, or calculation bugs. This is the continuous equivalent of Phase 7B's one-time balance reconciliation.

---

## What Ports Over

### Database Tables (Core)

These tables from twotreescap-app contain the portfolio accounting engine's state and should be migrated to Trade Journal's schema:

| Table | Rows | Purpose | Migration Notes |
|-------|------|---------|-----------------|
| `events` | 29,965 | Immutable event store (BUY, SELL, RECEIVE, etc.) | Core table — all calculations derive from this |
| `import_batches` | ~50 | Batch tracking with state machine | Tracks calculation runs |
| `tax_lots` | ~13K | FIFO lot inventory | Output of cost_basis phase |
| `lot_consumptions` | ~24K | FIFO matching records | Links disposals to lots |
| `average_cost_positions` | ~1.2K | Running average cost per scope | Output of average_cost phase |
| `event_calculations` | ~30K | Per-event derived values (running qty, ACB, realized P&L) | 1:1 with events |
| `daily_balances` | 244K | End-of-day positions with market values | Output of daily_balances + enrichment |
| `price_history` | 234K | Multi-source price data | coingecko, tradingview, ibkr, massive, cmc, manual |
| `daily_portfolio_values` | 21.5K | Pre-computed NAV at 3 aggregation levels | Output of daily_nav phase |
| `assets` | ~500 | Asset master with ticker aliases | Referenced by events via asset_id |
| `asset_aliases` | ~200 | Ticker → asset_id mappings | Used during event import |

### Database Tables (Reference/Supporting)

| Table | Purpose | Migration Notes |
|-------|---------|-----------------|
| `best_daily_prices` (view) | Source-priority price resolution | Recreate as view in Trade Journal |
| `owners` | Owner records (Nick, Tiff, TTC, Maisy) | Trade Journal has `accounts` but not `owners` — may need to reconcile |
| `accounts` (ttc version) | Account records with currency, cost basis method | Trade Journal already has `accounts` — reconcile fields |

### Calculation Engine Code

| Directory/File | Purpose | Migration Notes |
|----------------|---------|-----------------|
| `calculations/v2/engine.ts` | Phase orchestrator (sort → running_qty → cost_basis → avg_cost → daily_balances → prices → enrichment → NAV) | Core engine — port to `src/lib/calculations/` |
| `calculations/v2/running-quantity.ts` | Running quantity computation | |
| `calculations/v2/cost-basis.ts` | FIFO lot creation + matching | |
| `calculations/v2/average-cost.ts` | Average cost basis (optimized batch mode) | |
| `calculations/v2/daily-balances.ts` | Daily position snapshots from events | |
| `calculations/v2/price-population.ts` | IBKR price extraction from positions | |
| `calculations/v2/market-value-enrichment.ts` | 4-pass market value assignment | |
| `calculations/v2/daily-portfolio-values.ts` | 3-level NAV aggregation | |
| `calculations/v2/types.ts` | Shared type definitions | |

### Event-Sourcing Adapters

These are **separate from Trade Journal's existing Flex Query ingestion** (see [IBKR Overlap Analysis](#ibkr-overlap-analysis)). The Flex pipeline feeds `trades`/`positions`; these adapters feed the `events` table for tax accounting.

| File | Purpose | Migration Notes |
|------|---------|-----------------|
| `services/event-sourcing/adapters/ibkr/` | IBKR combined report → events | Separate from TJ Flex ingestion — captures STFU (dividends, fees, etc.). Long-term: add STFU Flex Query to automate this via existing daily API |
| `services/event-sourcing/adapters/koinly-adapter.ts` | Koinly CSV → events | Manual/intermittent import — new to Trade Journal |
| `services/event-sourcing/asset-resolver.ts` | Ticker alias resolution during import | |
| `services/event-sourcing/event-store.ts` | Idempotent event persistence | |
| `services/event-sourcing/batch-state-machine.ts` | Import batch lifecycle | |

### UI Components

| Component | Purpose | Migration Notes |
|-----------|---------|-----------------|
| `app/dashboards/home/` | Portfolio dashboard (NAV chart, positions, P&L) | Integrate into Trade Journal's existing `/dashboard/portfolio/` |
| `app/dashboards/gains/` | Gain/loss reporting (avg cost + FIFO) | New page in Trade Journal |
| `app/calculate/` | Calculation trigger + price coverage | New page in Trade Journal |
| `components/charts/dashboard-home-*` | Line chart, cards, positions table | Port to Trade Journal components |

### Scripts

| Script | Purpose | Migration Notes |
|--------|---------|-----------------|
| `scripts/phase8/fetch-crypto-prices.ts` | Massive API bulk price fetching | → becomes Trade Journal cron job |
| `scripts/phase8/populate-prices.ts` | Price population orchestrator | |
| `scripts/shadow-mode/run-calculation-engine.ts` | CLI for running calc engine | Port as Trade Journal script |
| `utils/price-fetch-utils.ts` | Shared price API helpers | |

---

## What Gets Left Behind

These components from twotreescap-app do **not** need to be migrated:

| Component | Reason |
|-----------|--------|
| Clerk authentication | Overkill for single-user domestic use; Trade Journal's auth is sufficient |
| V1 `transactions` table | Superseded by `events` — archived as `transactions_v1_archive` |
| V1 calculation functions | Replaced by V2 engine |
| `lib/feature-flags.ts` | V2 is the only path — hardcode |
| `actions/upload/upload-dispatcher.ts` | V1/V2 routing no longer needed |
| V1 upload actions | Replaced by V2 upload actions |
| V1 `prices`, `coinmktcap_prices`, `tradingview_prices` | All migrated into `price_history` — originals are read-only archives |
| `scripts/reconciliation/` | One-time validation scripts, already ran successfully |
| `scripts/cutover/` | Cutover infrastructure, no longer needed |
| `daily_snapshots` table | Schema exists but never populated — replaced by `daily_balances` |
| Old migration files (0001-0034) | Applied — Trade Journal will have its own migration sequence |
| `userId` references (Clerk) | TTC uses Clerk `userId` in events, daily_balances, etc. Trade Journal is single-user — can hardcode or simplify |

---

## Pre-Migration: Trade Journal Schema Cleanup

Before porting TTC infrastructure, clean up defunct and deprecated elements in the Trade Journal codebase. This avoids inheriting legacy patterns and reduces confusion during integration.

### Dropped Tables (dead types in `src/db/types.ts`)

These tables were physically dropped via migrations (2026-01-16 blotter-to-journal migration) but their auto-generated type definitions still linger in `src/db/types.ts`:

| Table | Dropped In | Replaced By |
|-------|-----------|-------------|
| `playbook_items` | `20260116_drop_playbook_and_statecode.sql` | `signals` table |
| `blotter_actions` | `20260116_drop_blotter_actions.sql` | `triage_records` |
| `research_mappings` | `20260116_drop_research_mappings.sql` | `claim_thesis_mappings` |

**Status**: ~~Action needed~~ **Already clean** — `types.ts` is auto-generated from Supabase and the dropped tables no longer appear in it. No action required.

### ~~Deprecated Table~~ thesis_monitoring_configs — DONE (2026-02-18)

| Table | Location | Replacement |
|-------|----------|-------------|
| ~~`thesis_monitoring_configs`~~ | ~~schema.ts:1575-1624~~ | `signals.explicit_details` JSONB field |

**Completed**: Table dropped from database, schema definition removed from `schema.ts`, deprecated `daily-thesis-monitoring.ts` and `test-lifecycle-detection.ts` scripts deleted, references removed from `push-to-remote.ts` and `restore-from-remote.ts`. Migration: `migrations/drop_urgency_and_monitoring_configs.sql`. Commit: `ebe5a90`.

### Deprecated Fields in Active Tables

| Table | Deprecated Fields | Replacement | Codebase References | Status |
|-------|------------------|-------------|---------------------|--------|
| `positions` | `absNotional`, `absNotionalUsd` | `marketValueUsd` | ~111 refs / 26 files | Pending — gradual transition during M3 |
| `strategies` | `strategyType` (text) | `strategyTypeId` (FK to `strategy_types`) | 28 files (NOT trivial — touches strategy creation, queries, UI, triage) | Deferred — not blocking M1 |
| `signals` | `rationale`, `timeframe`, `judgmentDetails`, `responseProtocol` | `notes` field | ~123 refs / 29 files | Pending — during M2 |
| ~~`thesis_triage_records`~~ | ~~`urgency`~~ | ~~`severity` + `status`~~ | | **DONE** (2026-02-18) — removed from 17 files, column dropped |
| `research_insights` | `keyClaims`, `supportingEvidence`, `counterEvidence` | `claimsStructure` JSONB | ~36 refs / 8 files | Pending — during M2 |

### Legacy Terminology

The codebase exports `validationPoints` as a type alias for `signals` and `ValidationPoint` for `Signal`. This is widespread (~202 refs / 27 files) in UI components (asset/macro thesis pages). Renaming is low priority but high effort.

### Cleanup Recommendations

| Priority | Action | Effort | When | Status |
|----------|--------|--------|------|--------|
| ~~Do first~~ | ~~Remove dead types from `types.ts`~~ | — | — | **N/A** — already clean |
| ~~Do first~~ | ~~Remove `urgency` deprecated field~~ | Medium (19 files) | Before M1 | **DONE** `ebe5a90` |
| ~~During M1~~ | ~~Drop `thesis_monitoring_configs`~~ | Medium (4 files) | Before M1 | **DONE** `ebe5a90` |
| Deferred | Remove `strategyType` deprecated field | High (28 files) | After M1 | Not blocking migration |
| During M2 | Consolidate deprecated signal fields into `notes` | High (29 files) | During M2 | |
| During M2 | Remove deprecated `research_insights` fields | Medium (8 files) | During M2 | |
| Ongoing | Transition `absNotional` → `marketValueUsd` across UI | High (26 files) | Gradual, during M3 | |
| Defer | Rename `validationPoints` → `signals` terminology | High (27 files) | After M3 | |

The core trading tables (`accounts`, `positions`, `trades`, `strategies`) and belief layer (`macro_theses`, `asset_theses`, `signals`, `claims`) are stable and actively used. The remaining cleanup items don't block the TTC migration — they're housekeeping that reduces confusion.

---

## Migration Phases

### Phase M1: Schema Migration — DONE (2026-02-18)

**Goal**: Create the event-sourcing and portfolio accounting tables in Trade Journal's database.

**Status**: Complete (schema + data). All 13 tables created + 1 view. 594K rows migrated from TTC. Migration SQL: `migrations/20260218_m1_event_sourcing_schema.sql`. Data migration script: `scripts/migrate-ttc-to-tj.sh`.

**Key decisions made during implementation:**

- **Separate databases**: TTC and TJ use different Supabase projects (eu-west-2 vs eu-north-1). The plan assumed a shared DB — that was wrong. Schema was created in TJ's Supabase; data migration is a separate step.
- **`accounts` merge**: Added TTC's portfolio accounting columns (`owner_id`, `account_type`, `institution`, `account_number`, `cost_basis_method`, `is_active`) to TJ's existing `accounts` table. All nullable to preserve existing rows.
- **`underlyings` vs `assets`**: Kept both as separate tables (plan's recommendation confirmed). `assets` is the canonical registry for event sourcing; `underlyings` remains for options/IV data.
- **No `pgEnum`**: TTC used Postgres ENUMs for some fields. TJ uses `text` columns with TS const arrays for everything. Followed TJ's pattern for consistency.
- **`daily_balances` renamed**: TTC's `daily_balances` → `portfolio_daily_balances` in TJ to avoid confusion with existing cash_balances concept.
- **`user_id` kept**: All TTC tables had `user_id` (Clerk). Kept for data migration compatibility even though TJ is single-user.

**Tables created (13 + 1 view):**

| Table | Rows (TTC) | Notes |
|-------|------------|-------|
| `owners` | ~5 | Legal entities |
| `assets` | ~500 | Canonical instrument registry |
| `asset_aliases` | ~200 | Cross-source name mapping |
| `import_batches` | ~50 | Import state machine |
| `events` | ~30K | Immutable transaction log |
| `event_calculations` | ~30K | Mutable derived state per event |
| `tax_lots` | ~13K | FIFO lot tracking |
| `lot_consumptions` | ~24K | FIFO matching audit trail |
| `average_cost_positions` | ~1.2K | Alternative cost basis |
| `portfolio_daily_balances` | ~244K | End-of-day balances |
| `daily_snapshots` | TBD | Point-in-time portfolio state |
| `price_history` | ~234K | OHLCV with source priority |
| `daily_portfolio_values` | ~21.5K | Aggregated NAV |
| `best_daily_prices` (view) | — | Best price per asset/date |

#### M1 Data Migration — DONE (2026-02-19)

~594K rows transferred from TTC Supabase (eu-west-2) → TJ Supabase (eu-north-1) via `scripts/migrate-ttc-to-tj.sh`. Script uses `pg_dump --data-only` per table + `psql` restore, respecting FK ordering.

**Tables migrated (9 with data, 4 empty):**

| Table | Rows | Notes |
|-------|------|-------|
| assets | 1,068 | |
| import_batches | 35 | |
| owners | 1 | Enum→text cast (entity_type) |
| price_history | 267,023 | Enum→text cast (source) — CSV mode |
| portfolio_daily_balances | 244,160 | Renamed from TTC `daily_balances` via sed |
| daily_portfolio_values | 21,562 | |
| events | 29,965 | Dropped `linked_event_id` FK for load, re-added after |
| event_calculations | 29,965 | |
| average_cost_positions | 1,185 | Dropped positive-qty/cost CHECK constraints (TTC has edge cases) |
| asset_aliases | 0 | Empty in TTC |
| tax_lots | 0 | Empty in TTC |
| lot_consumptions | 0 | Empty in TTC |
| daily_snapshots | 0 | Empty in TTC |

**Key decisions during data migration:**
- Used `DELETE FROM` (not `TRUNCATE CASCADE`) to clear M1 tables before loading — avoids cascading into TJ's existing core tables (accounts, strategies, positions, trades, signals). The first attempt used `TRUNCATE CASCADE` on `owners` which cascaded via FK chain into all TJ core data and required a Supabase backup restore.
- Dropped `events_import_batch_id_fkey` permanently — TTC never had this FK and some events reference batch IDs not in the import_batches table.
- Dropped `events_quantity_check`, `avg_positive_qty`, `avg_positive_cost` constraints — TTC data has edge cases (negative avg cost positions from calculation). These can be re-evaluated after verifying the calculation engine.
- Safety check at end validates TJ core table row counts are > 0.

**Validation**: All row counts match TTC→TJ. 0 orphaned `linked_event_id` refs. All 6 price_history sources came through as text (coingecko, coinmarketcap, ibkr, manual, massive, tradingview).

### Phase M2: Calculation Engine + Import Pipeline Port — DONE (2026-02-18)

**Goal**: Port the V2 calculation engine and import pipeline into Trade Journal's codebase.

**Status**: Complete. Split into two sub-phases for manageability.

#### M2a: Calculation Engine — DONE

Commit: `ed1d56d`. 16 files, 6,204 lines.

1. Created `src/lib/calculations/` with all 8 calculation phases:
   - engine.ts, types.ts
   - running-quantity.ts, cost-basis.ts, average-cost.ts
   - daily-balances.ts, price-population.ts
   - market-value-enrichment.ts, daily-portfolio-values.ts
2. Ported batch state machine (`src/lib/event-sourcing/batch-state-machine.ts`)
3. Ported CLI script (`scripts/run-calculation-engine.ts`)
4. All imports rewritten: `@/db/db` → `@/db`, `eventsTable` → `events`, `@/services/` → `@/lib/`, etc.
5. Extended `src/types/event-sourcing.ts` with batch/calculation types
6. `tsc --noEmit` passes with zero errors

#### M2b: Import Pipeline — DONE

Commit: `447cecc`. 26 files, 9,192 lines.

1. Extended types (`src/types/event-sourcing.ts`) with adapter/service interfaces
2. Created DB query layers (`src/db/queries/assets.ts`, `src/db/queries/events.ts`)
3. Ported services:
   - Event store (`src/lib/event-sourcing/event-store.ts`) — batch persist with ON CONFLICT DO NOTHING
   - Asset resolver (`src/lib/event-sourcing/asset-resolver.ts`) — 5-step resolution with cache
   - Idempotency service (`src/lib/event-sourcing/idempotency-service.ts`) — file hash + record key dedup
4. Ported adapter framework:
   - Base adapter + specialized base (`src/lib/adapters/base-adapter.ts`, `base-specialized-adapter.ts`)
   - Types + helpers (`src/lib/adapters/types.ts`)
   - Registry + registration (`src/lib/adapters/unified-registry.ts`, `register-adapters.ts`)
5. Ported all adapters:
   - IBKR: 8 files in `src/lib/adapters/ibkr/` (utils, trade, sof, combined-parser, combined-adapter, mtmpnl, positions, index)
   - Koinly, Coinbase, Buxfer: `src/lib/adapters/`
6. Ported CLI import scripts: `scripts/import-ibkr-combined.ts`, `scripts/import-koinly.ts`
7. `tsc --noEmit` passes with zero errors

**End-to-end verification (completed during M3):**
- Calculation engine ran full recalculation (8 phases) against migrated TTC data — all phases pass
- `price_population` phase required a fix: TTC's `ibkr_open_positions` table → TJ's `positions` table, removed `::price_source` enum casts
- Results: 45,305 IBKR prices extracted, 12,166 stablecoin prices inserted, 244,299/244,796 positions enriched with market values (99.8%), 21,650 NAV rows at 3 aggregation levels
- Import scripts (`import-ibkr-combined.ts`, `import-koinly.ts`) verified — both run `--help` successfully

**Remaining M2 work**:
- Port `fetch-crypto-prices.ts` and `populate-prices.ts` (deferred to M4 — pricing infrastructure)

### Phase M3: Accounting Dashboard UI — DONE (2026-02-19)

**Goal**: Add portfolio accounting views to Trade Journal's UI.

**Status**: Complete. Accounting Dashboard live at `/dashboard/accounting`. Commit: `45bf5fb`.

**What was built:**

1. **Accounting Dashboard** (`/dashboard/accounting`) — new page with:
   - 5-card metrics row: NAV, Book Value, Unrealized P&L, Realized P&L, Position Count
   - NAV area chart with time range selector (1M, 3M, 6M, 1Y, YTD, ALL)
   - 3-column breakdowns: Owner pie chart, Asset Class pie chart, P&L summary card (with price coverage progress bar)
   - Sortable positions table (10 columns: Asset, Owner, Account, Class, Quantity, Price, Market Value, Book Value, Unrealized P&L, Unrealized %)
   - Green/red P&L coloring, table-fixed layout with column width constraints

2. **Query layer** (`src/db/queries/accounting.ts`) — reads from `daily_portfolio_values` (NAV time series, summary, owner breakdown) and `portfolio_daily_balances` (asset class breakdown, positions table), plus `event_calculations` (realized P&L sum)

3. **API routes** — `/api/dashboard/accounting` (dashboard data with range param) and `/api/dashboard/accounting/positions` (positions table data)

4. **Sidebar** — "Accounting" entry with Calculator icon added after Portfolio in MAIN_NAV

5. **Layout fix** — Added `min-w-0` to `DashboardShell`'s `SidebarInset` and `<main>` to prevent content overflow when sidebar is expanded (was causing horizontal scroll on all pages)

**Key design decisions:**
- Built as a **standalone page** (`/dashboard/accounting`) rather than adding to the existing `/dashboard/portfolio/` page. The two views serve different purposes: Portfolio shows live exchange positions; Accounting shows event-sourced cost basis, P&L, and historical NAV.
- Followed TJ's existing design language (rounded-2xl cards, oklch colors, Recharts via ChartContainer, PieChart conic-gradient, formatCurrency/formatPercent) rather than copying TTC's UI.
- Hardcoded `userId = "user_2mYzScugP7zfcqv8Ox21i7q9nyW"` in the query layer (single-user system).
- Owner "Kids" grouping (Alex, Lily, Leo → Kids) consistent with Portfolio page.

**Also included in commit:**
- `src/lib/calculations/price-population.ts` — fixed TTC→TJ table references (`ibkr_open_positions` → `positions`, removed `::price_source` enum casts)
- `scripts/migrate-ttc-to-tj.sh` — data migration script (safe `DELETE FROM`, no CASCADE)

**Deferred to later phases:**
- `/dashboard/gains` — Gain/loss reporting (avg cost + FIFO, by owner/period/asset)
- `/admin/price-coverage` — Price coverage report
- `/admin/calculations` — Calculation trigger page

### Phase M4: Pricing Infrastructure — DONE (2026-02-19)

**Goal**: Implement systematic price coverage with daily automation.

**Status**: Complete. All 4 sub-phases implemented and verified. Migration: `migrations/20260219_m4_pricing_tier.sql`.

**What was built:**

#### M4.1 pricing_tier Classification — DONE

Added `pricing_tier` and `proxy_asset_id` columns to `assets` table. Classified all 1,068 assets:

| Tier | Count | Description | Price Action |
|------|-------|-------------|--------------|
| `market` | 267 | API-fetchable prices | Massive (crypto) or IBKR (equity) daily |
| `proxy` | 14 | Priced via known equivalent (WBTC→BTC, STETH→ETH, etc.) | Copy proxy target price daily |
| `book_value` | 731 | No market price (options, LP tokens, yield tokens) | Use ACB in enrichment |
| `zero` | 56 | Dead/dust/worthless (NFTs, Solana addresses) | Price = 0 |

Seed script: `scripts/seed-pricing-tiers.ts` (with `--dry-run` flag). Classification ported from TTC `isPriceable()` + `apply-proxy-prices.ts`.

**ConID coverage note**: All equities (85/86) and bonds (8/8) in the `assets` table have `ibkr_conid` populated. All recent IBKR positions (365/365) have `conid`. Crypto assets don't have conids (expected — they don't come from IBKR). The one "missing" equity was CNH (Chinese Yuan), reclassified from EQUITY → FIAT.

#### M4.2 Daily Crypto Price Cron — DONE

- **Script**: `scripts/fetch-crypto-prices.ts` — fetches from Massive API (Polygon.io via `api.massive.com`), matches to market-tier crypto assets, upserts with source `massive`, then copies proxy prices with source `manual`
- **Workflow**: `.github/workflows/crypto-prices.yml` — runs twice daily (00:30 + 06:00 UTC) for resilience. Fully idempotent.
- **API**: Same `MASSIVE_API_KEY` as existing Massive.com equity ingestion (already in GitHub Actions secrets). Endpoint: `GET /v2/aggs/grouped/locale/global/market/crypto/{YYYY-MM-DD}`
- **Result**: 71 crypto prices matched per day, 14 proxy prices copied. No CoinGecko fallback (Polygon-only for simplicity — gap detection surfaces coverage issues).

#### M4.3 Daily Equity Price Extraction — DONE

- **Script**: `scripts/extract-ibkr-prices.ts` — `INSERT...SELECT` from `positions` table into `price_history` with source `ibkr`, plus stablecoin $1.00 insertion with source `manual`
- **Workflow**: Added as post-step in `.github/workflows/flex-ingestion.yml` (`continue-on-error: true`). Runs after each hourly Flex ingestion (11x/day, 4AM–2PM UTC). Idempotent via ON CONFLICT DO UPDATE.
- **Result**: 45,305 IBKR prices, 12,178 stablecoin/manual prices. Latest dates: 2026-02-19.
- **Matching**: Currently ticker-based (JOIN `assets.ticker` + `asset_aliases`). ConID-first matching is a future improvement but coverage is already excellent.

#### M4.4 Price Gap Detection & Alerting — DONE

- **Script**: `scripts/check-price-gaps.ts` — categorizes market-tier assets as current (0-1d), stale (2-5d), critical (>5d), never-priced. Exits code 1 on critical gaps.
- **Workflow**: `.github/workflows/price-gap-check.yml` — daily 06:30 UTC (after crypto retry)
- **API**: `src/app/api/dashboard/accounting/price-gaps/route.ts` — returns gap summary + top stale/critical assets
- **Dashboard**: `src/components/accounting/PriceFreshness.tsx` — stacked bar + freshness % on accounting page
- **Design decision**: Gaps surfaced via dashboard + GitHub Actions output, NOT forced into existing triage tables (which require accountId/thesisId FKs that don't apply to pricing gaps).
- **Initial state**: 91 current, 1 stale, 131 critical (historical assets no longer held), 44 never-priced (obscure DeFi). Expected for migrated data.

**Files created/modified:**

| File | Action |
|------|--------|
| `migrations/20260219_m4_pricing_tier.sql` | Created |
| `src/db/schema.ts` | Modified (pricingTier, proxyAssetId on assets) |
| `scripts/seed-pricing-tiers.ts` | Created |
| `scripts/fetch-crypto-prices.ts` | Created |
| `scripts/extract-ibkr-prices.ts` | Created |
| `scripts/check-price-gaps.ts` | Created |
| `.github/workflows/crypto-prices.yml` | Created |
| `.github/workflows/price-gap-check.yml` | Created |
| `.github/workflows/flex-ingestion.yml` | Modified (added price extraction step) |
| `src/app/api/dashboard/accounting/price-gaps/route.ts` | Created |
| `src/components/accounting/PriceFreshness.tsx` | Created |
| `src/app/dashboard/accounting/page.tsx` | Modified (added PriceFreshness) |

### Phase M4.5: Price Tier Hygiene + Price Freshness Resolution

**Goal**: Make the Price Gap Check action pass by reclassifying dead/historical assets and fixing the freshness metric to account for real-world price source cadences.

**Status**: M4.5a + M4.5b done.

#### M4.5a: Pricing Tier Reclassification — DONE (2026-02-20)

Reclassified 175 dead/historical assets from `market` to `zero`/`book_value`. Migration: `migrations/20260220_m4_5a_reclassify_price_tiers.sql`. Eliminated all critical (>5d) and never-priced assets from the monitored set.

**Current tier distribution** (post-reclassification):

| Tier | Count | Description |
|------|-------|-------------|
| `market` | 816 | API-fetchable (but only 62 ever had positions — see analysis below) |
| `zero` | 219 | Dead/disposed/dust |
| `book_value` | 26 | LP tokens, yield tokens |
| `proxy` | 15 | Wrapped/bridged (WBTC→BTC, STETH→ETH, etc.) |
| `null` | 2 | Unclassified (new derivatives — see below) |
| `manual` | 1 | HOUSE_UK |

#### M4.5b: Per-Source Price Delivery Monitoring — DONE (2026-03-01)

Replaced the blunt single-freshness-% approach with per-source delivery health checks. Each price source is now monitored independently against its known cadence and lag.

**Key changes:**

1. **Shared config** (`src/lib/price-source-config.ts`) — Defines 4 monitored sources with delivery cadence (business-day vs daily), expected lag (T+0 or T+1), and down thresholds. Includes `expectedLatestPriceDate()` and `assessSourceHealth()` helpers, plus the SQL CASE expression for asset→source mapping.

2. **"Currently held" detection** — Replaced 14-day lookback with latest-snapshot-per-account logic. If an asset disappears from the latest position snapshot, it's considered closed immediately (no 14-day trailing window).

3. **Per-source health statuses**: `healthy` (on schedule), `delayed` (behind but within tolerance), `down` (multiple missed cycles). GitHub Action exits 1 only when a source is `down`.

4. **Crypto fallback** — If Massive (primary for crypto) is delayed but exchange snapshots have current prices for an asset, the asset isn't flagged.

5. **Exclusions**: USD excluded from FX monitoring (base currency, no rate to itself). Stablecoins excluded entirely (hardcoded $1.00, no delivery pipeline to monitor).

**Monitored sources:**

| Source | Assets | Cadence | Lag | Down Threshold |
|--------|--------|---------|-----|----------------|
| `ibkr` | Equities, derivatives | Business days | T+1 | 2 missed cycles |
| `fx_rate` | Fiat (GBP, CAD, etc.) | Business days | T+1 | 2 missed cycles |
| `massive` | Crypto (Polygon.io) | Daily | T+1 | 2 missed cycles |
| `proxy` | Wrapped tokens | Daily | T+1 | 3 missed cycles |

**Files created/modified:**

| File | Action |
|------|--------|
| `src/lib/price-source-config.ts` | Created — shared config, helpers, types |
| `scripts/check-price-gaps.ts` | Rewritten — per-source health checks |
| `src/app/api/dashboard/accounting/price-gaps/route.ts` | Rewritten — fixed "currently held" bug, per-source response |
| `src/components/accounting/PriceFreshness.tsx` | Rewritten — per-source status rows |
| `src/db/schema.ts` | Added `snapshot`, `fx_rate`, `proxy` to `PRICE_SOURCES` |

**Deferred (M4.5c — low priority):**

Interactive UI features (reclassify from dashboard, manual price entry, mark-as-expected, refresh trigger). Can revisit after M5/M6.

---

### Phase M5: Base Currency Support (was TTC Phase 4)

**Goal**: Configurable reporting currency per owner with FX conversion.

Ported from [COMPLETION_PLAN.md § Phase 4](../../twotreescap-app/docs/COMPLETION_PLAN.md#phase-4-base-currency-support--deferred):

1. **FX Rate Infrastructure**: `getFxRate(from, to, date)` using IBKR FX rates (already in `fxRates` table in Trade Journal!) and `price_history` for daily pairs
2. **Configuration**: Per-owner currency setting (GB owners → GBP, US owners → USD)
3. **Engine Integration**: Convert event values to base currency at event-date FX rate
4. **Reporting**: Multi-currency gain/loss reports, FX gain/loss tracking

**Advantage of doing this in Trade Journal**: Trade Journal already has `fxRates` table populated from IBKR Flex queries. The infrastructure is partially there.

**Known issues to address (discovered 2026-02-20):**

- **GBP base currency reports**: Nick (U9896103), Tiff ISA (U21595594), and 4 other accounts now generate GBP-base IBKR reports. A temporary fix auto-detects the base currency from the RATE section and applies a USD correction divisor (`fx-rate-lookup.ts`). M5 should replace this with proper `getFxRate(from, to, date)` infrastructure rather than relying on the per-report RATE section hack.
- **GLXY conid/currency shift**: Between 2025-04 and 2025-05, Galaxy Digital (GLXY) changed IBKR conid from 328205007 to 785082287 (corporate restructuring/relisting). Both conids have `CurrencyPrimary: "CAD"` in IBKR data, but FXRateToBase semantics shifted from CAD→USD (~0.70) to CAD→GBP (~0.53) when Nick's account base currency changed. The 4 newer events were corrected by the `baseCurrencyCorrection` applied in the GBP fix. M5 needs to: (1) update `assets.ibkr_conid` for GLXY, (2) ensure `getFxRate` handles the CAD→GBP→USD chain correctly for all cross-currency assets, (3) investigate why FIFO lot consumptions are not matching for GLXY sells (36 open lots with 0 consumed despite 173,500 shares sold).
- **Positions/MTM adapter bugs** (latent — tables empty): `CostBasisMoney` and `FifoPnlUnrealized` not FX-converted in positions adapter; MTM adapter hardcodes USD. These only matter when position/MTM snapshots are enabled.

### Phase M6: UK Tax Method (was TTC Phase 5)

**Goal**: HMRC-compliant Section 104 pooling with same-day and 30-day bed & breakfast rules.

Ported from [COMPLETION_PLAN.md § Phase 5](../../twotreescap-app/docs/COMPLETION_PLAN.md#phase-5-uk-tax-method--deferred):

1. **New calculation engine**: `uk-section-104.ts` with 3-tier matching (same-day → B&B → pool)
2. **Schema**: `section_104_pools` table, `matchType` on consumptions
3. **Validation**: Against HMRC published worked examples
4. **Wiring**: `owners.taxJurisdiction` → available cost basis methods

### Phase M7: Portfolio Reconciliation Framework — DONE (2026-02-19)

**Goal**: Cross-reference the two portfolio views to surface data integrity issues.

**Status**: Complete. Reconciliation dashboard live at `/dashboard/accounting/reconciliation`.

Trade Journal now has two independent methods for computing portfolio state:

| View | Data Source | Updates | Produces |
|------|-------------|---------|----------|
| **Snapshot-based** (TJ existing) | Exchange API positions + MTM prices (Flex, HyperLiquid, Coinbase, etc.) | Daily/hourly via API | `positions`, `navSnapshots`, `cashBalances`, `portfolioSnapshots` |
| **Event-sourced** (TTC ported) | Historical transaction records → calculation engine | After each import + calc run | `portfolio_daily_balances`, `daily_portfolio_values` |

These should converge on the same answer. Any material delta is a data integrity flag.

**What was built:**

1. **Query layer** (`src/db/queries/reconciliation.ts`) — 5 exported functions:
   - `getLastCompleteEventDate()` — Detects the last date with complete event data across all sources (MAX of per-source last dates from `events` table). Returns per-source freshness details. All comparisons are anchored to this date.
   - `getNavComparison(daysBack)` — NAV time series: forward-fill per account from `portfolio_snapshots` vs `daily_portfolio_values` grand total. Handles different snapshot frequencies (IBKR weekdays, crypto daily).
   - `getOwnerAccountNavComparison(comparisonDate)` — Two-level hierarchy: per-owner aggregate with per-account drill-down. Maps snapshot accounts (by broker_name) to event-sourced accounts (by account_type). Anchored to comparison date.
   - `getPositionReconciliation(comparisonDate)` — Position-level matching with 3-tier asset resolution (conid → ticker → alias). Aggregates by (owner, ticker) before matching. Anchored to comparison date.
   - `getReconciliation()` — Orchestrator: calls `getLastCompleteEventDate()` first, then passes comparison date to all sub-queries. Returns summary + owner breakdown + positions.

2. **CLI script** (`scripts/run-reconciliation.ts`) — Standalone reconciliation from command line. Same matching logic as query layer. Outputs event source freshness, comparison date, and all comparison data. Exit code 0 if NAV delta < 5%, exit code 1 if >= 5%.

3. **API routes**:
   - `GET /api/dashboard/accounting/reconciliation` — Full reconciliation data (summary + owners + positions)
   - `GET /api/dashboard/accounting/reconciliation/nav?range=1Y` — NAV time series comparison with range selector

4. **UI** (`/dashboard/accounting/reconciliation`):
   - `ReconciliationSummary` — Info banner showing comparison date + per-source freshness. 5 metric cards (Snapshot NAV, ES NAV, NAV Delta with color-coded %, Position Match rate, Discrepancies count).
   - `ReconciliationNavChart` — Dual-line area chart (blue=snapshot, green=event-sourced) with time range selector (1M/3M/6M/1Y/YTD/ALL)
   - `ReconciliationOwnerTable` — Collapsible per-owner rows expand to show per-account detail with match status badges
   - `ReconciliationPositionTable` — Filterable (Discrepancies/All/Matches/Snap-only/ES-only) and sortable (ticker, owner, qty delta, mv delta, status) position delta table

5. **Navigation**: "Reconciliation" added to sidebar (RefreshCw icon). Link also added to bottom of accounting page.

**Key design decisions:**
- **Comparison date anchored to event freshness** — The "last complete event date" is detected automatically from `MAX(timestamp::date)` per source in the `events` table. After this date, the calculation engine carries forward quantities with updated prices, making position-level comparison meaningless. Both snapshot and event-sourced sides are queried at this anchor date.
- **MAX of per-source dates** — Uses MAX (not MIN) because each event source covers different accounts (ibkr_trade → IBKR accounts, koinly → crypto accounts). Using MIN would exclude crypto snapshots entirely (NAV data starts later than IBKR). The small staleness for cross-source accounts is negligible.
- **No new database tables** — reconciliation computed on demand from existing data. Single-user system doesn't need run history persistence.
- **Positions aggregated by (owner, ticker) before matching** — same ticker can exist across multiple exchange accounts (e.g., HYPE on HyperLiquid + CoinbasePrime + Solana). Aggregation avoids duplicate match entries.
- **Filters exclude noise** — FIAT asset class and zero-pricing-tier assets (NFTs, dust) excluded from event-sourced side. Snapshot positions filtered to latest date per account via CTE.
- **Account coverage asymmetry surfaced explicitly** — Event-sourced-only accounts (Tiff/IBKR, Tiff/Koinly, Tiff ISA, Nick ISA) and snapshot-only accounts (individual crypto exchanges) shown with clear match status indicators.

**Files created:**

| File | Purpose |
|------|---------|
| `src/db/queries/reconciliation.ts` | Query layer (5 functions + types) |
| `scripts/run-reconciliation.ts` | CLI reconciliation script |
| `src/app/api/dashboard/accounting/reconciliation/route.ts` | Full reconciliation API |
| `src/app/api/dashboard/accounting/reconciliation/nav/route.ts` | NAV time series API |
| `src/components/accounting/ReconciliationSummary.tsx` | Info banner + metric cards |
| `src/components/accounting/ReconciliationNavChart.tsx` | Dual-line area chart |
| `src/components/accounting/ReconciliationOwnerTable.tsx` | Collapsible owner/account table |
| `src/components/accounting/ReconciliationPositionTable.tsx` | Filterable position delta table |
| `src/app/dashboard/accounting/reconciliation/page.tsx` | Page component |

**Files modified:**

| File | Change |
|------|--------|
| `src/components/layout/DashboardShell.tsx` | Added `accounting-reconciliation` NavKey |
| `src/components/layout/AppSidebar.tsx` | Added Reconciliation nav link |
| `src/app/dashboard/accounting/page.tsx` | Added link to reconciliation page |

#### M7 Future Enhancement: Per-Exchange Crypto Matching

**Priority**: Medium — depends on M7 reconciliation insights revealing which crypto exchanges have meaningful discrepancies worth drilling into.

Currently, crypto exchange accounts in the snapshot view (CoinbasePrime, HyperLiquid, Kraken, Deribit, Solana) are aggregate-compared against the "Koinly" bucket in the event-sourced view. Individual per-exchange matching could be added by:

1. **Mapping snapshot accounts to Koinly sub-sources** — Koinly CSV exports include exchange names in transaction metadata. If events were tagged with their source exchange, we could split "Koinly" into per-exchange buckets.
2. **Adding exchange identifiers to events** — The `events.source` field already has values like `koinly` — could be extended to `koinly_coinbase`, `koinly_kraken`, etc.
3. **Position-level crypto matching** — Once per-exchange bucketing exists, individual crypto positions (BTC on HyperLiquid vs BTC in Koinly/HyperLiquid) could be matched.

#### M7 Future Enhancement: Account Mapping Refinement

Nick has 2 IBKR accounts (U9896103 + U21416380) that may map to "Nick" + "Nick ISA" on the event-sourced side. Currently aggregated together. Could add explicit `broker_account_id` → event-sourced scope mapping for precise matching.

#### M7 Future Enhancement: Snapshot Coverage Monitoring

Some dates have 7 accounts (IBKR only) vs 14 accounts (IBKR + crypto). The reconciliation should surface which dates have incomplete snapshot coverage to avoid false delta signals.

#### M7 Future Enhancement: Account-Level Drill-Down on Event-Sourced Side

The owner breakdown table shows event-sourced accounts at the aggregate level (IBKR, Koinly). Add per-account drill-down on the event-sourced side, breaking "Koinly" into sub-exchange balances and "IBKR" into individual account numbers, mirroring the snapshot side's per-broker-account detail.

#### M7 Prerequisite: Bring Event-Sourced Data to Current Date — DONE (2026-02-20)

**Status**: Complete. Event-sourced data now current through 2026-02-19 across all sources.

**What was done:**
1. Fixed GBP base currency bug in IBKR adapters (auto-detect non-USD base from RATE section, apply USD correction divisor via `fx-rate-lookup.ts`)
2. Corrected 309 existing events affected by GBP base currency issue (migration script `fix-gbp-base-events.ts`)
3. Fixed 4 bugs in import scripts: missing `assetTicker` field, Date serialization with postgres-js `prepare: false`, `rawData`/`sourceId` NOT NULL constraints
4. Fixed SOF idempotency key regression (reverted from 6-part to 5-part formula to match migrated data, deleted 5,549 duplicate events)
5. Imported 20260219 IBKR files (24 files, 5 new events) and Koinly files (18 files, 71 new events)
6. Full calculation engine recalculation: 30,089 events → 13,318 tax lots, 25,434 lot consumptions, 245,323 daily balances, 21,672 NAV rows

**Current event date ranges:**

| Source | Earliest | Latest | Count |
|--------|----------|--------|-------|
| ibkr_sof | 2018-11-05 | 2026-02-19 | 5,550 |
| ibkr_trade | 2018-11-08 | 2026-02-19 | 8,637 |
| koinly | 2020-07-08 | 2026-02-19 | 15,902 |

The underlying issue (no automated event ingestion) is addressed by M9 below.

### Phase M7.1: Reconciliation Resolution Workflows

**Goal**: Extend the reconciliation dashboard from read-only discrepancy surfacing to actionable resolution workflows.

**Status**: Pending.

**Context (discovered 2026-02-20):** The reconciliation page surfaces discrepancies between snapshot-based and event-sourced portfolio views, but provides no mechanism to address them. Users need to be able to investigate, classify, and resolve individual discrepancies.

**What needs to be built:**

#### M7.1a: Discrepancy Classification + Resolution

Add per-discrepancy actions to `ReconciliationPositionTable`:

1. **Acknowledge** — Mark a discrepancy as "known/expected" with a reason (e.g. "timing difference — trade executed after last event import", "asset migration in progress", "exchange reporting lag"). Acknowledged items remain visible but don't count toward the discrepancy total.
2. **Investigate** — Flag a discrepancy for deeper investigation. Links to relevant event history, tax lots, and raw IBKR data for the asset. Could create a triage record for tracking.
3. **Resolve** — Mark as resolved after the underlying cause has been fixed (e.g. missing events imported, price corrected, asset alias added). Records the resolution method and date.

#### M7.1b: Resolution Persistence

Currently reconciliation is computed on-demand with no persistence. Add:

1. **`reconciliation_items` table** — Stores per-discrepancy state (status: open/acknowledged/investigating/resolved), classification reason, resolution notes, timestamps
2. **Keyed by** (comparison_date, owner, ticker, discrepancy_type) — allows tracking resolution across reconciliation runs
3. **History** — Preserve resolution history so past reconciliation decisions are auditable

#### M7.1c: NAV Delta Investigation

Extend `ReconciliationSummary` and `ReconciliationNavChart`:

1. **Delta drill-down** — Click on a point in the NAV comparison chart to see which owner/account/asset is driving the delta at that date
2. **Delta trend** — Show whether the NAV delta is growing or shrinking over time (indicates whether discrepancies are accumulating or being resolved)
3. **Auto-flag** — If NAV delta exceeds a configurable threshold (e.g. 5%), automatically create a triage record

**Files to create/modify:**

| File | Action |
|------|--------|
| `src/db/schema.ts` | Add `reconciliation_items` table |
| `src/db/queries/reconciliation.ts` | Extend with resolution state joins |
| `src/components/accounting/ReconciliationPositionTable.tsx` | Add action buttons + resolution dialogs |
| `src/components/accounting/ReconciliationSummary.tsx` | Add delta trend indicator |
| `src/app/api/dashboard/accounting/reconciliation/route.ts` | Add PATCH for resolution actions |

---

#### ~~M7 Future Enhancement: Event-Sourced Data Ingestion Solution~~ — RESOLVED by M9a/M9b

**Status**: Resolved. IBKR event ingestion is now automated via `bridge-flex-to-events.ts` (commit `54de5ef`, 2026-02-26). See [Phase M9](#phase-m9-automated-event-ingestion) for details.

The "last complete event date" now advances automatically as Flex ingestion runs hourly. The remaining gap is that the **calculation engine** (`run-calculation-engine.ts`) is not triggered automatically after new events are inserted — this must still be run manually or added as a scheduled workflow step.

---

### Phase M8: Sunset twotreescap-app

**Goal**: Decommission the old app after successful migration.

1. **Verify parity**: All Trade Journal calculations match TTC output
2. **Redirect**: Point any bookmarks/links to Trade Journal equivalent pages
3. **Archive**: Move twotreescap-app to an archive branch or repo
4. **Clean up**: Remove TTC-specific env vars, Vercel deployment, etc.
5. **Database cleanup**: Drop legacy V1 tables (`transactions_v1_archive`, `prices`, `coinmktcap_prices`, `tradingview_prices`, `daily_snapshots`)

### Phase M9: Automated Event Ingestion

**Goal**: Eliminate manual CSV downloads by automating the event-sourced import pipeline, starting with IBKR.

**Status**: M9a + M9b complete. M9c deferred (Koinly remains manual).

#### M9a + M9b: IBKR Flex → Events Bridge — DONE (2026-02-26)

Commit: `54de5ef`. The existing hourly Flex ingestion workflow now bridges TRNT (trades) and STFU (statement of funds) data directly into the `events` table, eliminating the need for manual Combined Report CSV downloads.

**How it works:**

```
flex-ingestion.yml (hourly, 4AM–2PM UTC)
  Step 1: run-flex-ingestion.ts --save-csv /tmp/flex-csv   ← fetches Flex API, saves raw CSV
  Step 2: bridge-flex-to-events.ts --csv-dir /tmp/flex-csv  ← NEW: parses TRNT+STFU → events table
  Step 3: extract-ibkr-prices.ts                             ← extracts prices from positions
```

**Key implementation details:**
- **`scripts/bridge-flex-to-events.ts`** (627 lines) — Parses saved Flex CSVs, extracts TRNT and STFU sections, transforms via `IbkrTradeAdapter` and `IbkrSofAdapter`, inserts into `events` table with idempotency key deduplication.
- **TRNT → up to 3 events per trade**: main trade (BUY/SELL) + cash movement (RECEIVE/SEND) + fee (FEE)
- **STFU → 1 event per row**: maps activity codes DIV→DIVIDEND, INT→INTEREST, DEP→RECEIVE, WITH→SEND, FEE→FEE, ADJ→RECEIVE/SEND
- **Idempotency**: `ON CONFLICT DO NOTHING` on `idempotencyKey` — safe to run repeatedly
- **Two modes**: CSV mode (primary, used by GitHub Actions) and backfill mode (reads from `trades.rawRow` for historical data)
- Steps 2 and 3 use `continue-on-error: true` — bridge/price failures don't block the main Flex ingestion

**What's NOT automated — calculation engine**: Events populate automatically, but `run-calculation-engine.ts` (FIFO lots, cost basis, daily balances, NAV) must still be triggered manually. This is intentional — the engine is expensive and decoupled from event import. Adding it as a scheduled post-step (daily or weekly) is a future improvement.

#### M9c: Koinly Automation — Deferred

Koinly exports are infrequent (quarterly/per tax year) and require manual login to Koinly's web UI. Options remain:

1. **File-watch workflow** — GitHub Actions triggered when a Koinly CSV is committed to a specific repo path
2. **Admin upload UI** — Simple file upload form at `/admin/import` that triggers the Koinly adapter server-side
3. **Keep manual** — Given the low frequency, manual CLI import may remain acceptable indefinitely

**Recommended path**: Keep manual for now. Koinly imports happen a few times per year. The CLI scripts (`import-koinly.ts`) work correctly.

---

## Key Decisions

### 1. Same Database or Separate?

**Original assumption**: Same Supabase instance. **Corrected during M1**: They are **separate Supabase projects** (TTC: eu-west-2, TJ: eu-north-1).

**Revised approach**: Schema created in TJ's Supabase (M1). Data will be transferred from TTC → TJ via pg_dump/restore (remaining M1 work, ~600K rows). After transfer + verification, TTC's database connection is dropped.

### 2. Big Bang or Incremental?

**Decision: Incremental**. Phase M1-M2 (schema + engine) can happen while TTC app is still running. Phase M3 (UI) adds new pages without removing old ones. Phase M7 (sunset) only happens after full verification.

### 3. Event-Sourcing vs Trade Journal's Existing Trade Model

Trade Journal already has a `trades` table (individual executions with P&L per trade). The TTC `events` table is broader — it includes non-trade events (dividends, fees, staking rewards, transfers). **These are separate features that coexist independently**:

- **`trades`** = live trade execution records from IBKR Flex → powers strategy P&L, position management, triage
- **`events`** = comprehensive event stream for tax accounting → powers FIFO/average cost, daily balances, NAV

No attempt should be made to unify them. They serve different purposes and have different update cadences.

### 4. IBKR Overlap Analysis

<a id="ibkr-overlap-analysis"></a>

Trade Journal ingests IBKR via **Flex Queries** (CSV from Flex Web Service). TTC ingests IBKR via **Combined Reports** (CSV export from IBKR Client Portal). These capture different data:

| Data | TJ Flex Queries | TTC Combined Reports |
|------|----------------|---------------------|
| Individual trades (BUY/SELL) | Yes (TRNT) | Yes (TRNT) |
| EOD positions + MTM prices | Yes (POST/EQUT/MTMP) | Yes (POST) |
| FX rates | Yes (RATE) | Yes (RATE) |
| NAV / cash balances | Yes (aggregate) | Yes (aggregate) |
| **Dividends, interest, fees** | **Yes** (STFU in Flex CSV) | **Yes** (STFU section) |
| **Deposits/withdrawals** | **Yes** (STFU in Flex CSV) | **Yes** (STFU) |
| **Corporate actions** | **Yes** (STFU in Flex CSV) | **Yes** (STFU) |
| **Options exercises/assignments** | **Yes** (STFU in Flex CSV) | **Yes** (STFU) |

> **UPDATE (2026-02-26)**: The Flex Query CSVs already include TRNT and STFU sections. The `bridge-flex-to-events.ts` script (M9a/M9b) now parses these sections and feeds the `events` table automatically. Combined Report manual imports are no longer needed for ongoing data. They remain useful only for historical backfill of data not covered by Flex Query date ranges.

**Decision: ~~Keep both IBKR adapters as separate, parallel pipelines.~~ → UPDATED: Single Flex pipeline now feeds both sides.**
- Flex Query adapter → `trades`, `positions`, `portfolioSnapshots`, `navSnapshots`, `fxRates` (strategy/portfolio side)
- **Flex bridge** (`bridge-flex-to-events.ts`) → `events` (tax accounting side) — parses TRNT + STFU from the same Flex CSV
- Combined Report adapter → `events` (retained for historical backfill only)
- **Shared benefit**: Flex Query positions provide daily MTM prices that flow into `price_history` for the tax accounting side's market value enrichment

### 5. Koinly Import Model

Koinly CSV imports are manual and intermittent (quarterly per tax year, per owner). No API exists. The import path is:
1. Export CSV from Koinly web UI
2. Upload via Trade Journal admin page (or CLI script)
3. Koinly adapter parses CSV → events
4. Run calculation engine

This is a low-frequency operation and doesn't need automation.

### 6. Crypto Price Sources

Two different APIs named "Massive" are in play — avoid confusion:

| API | URL | Purpose | Asset Class | Currently Used For |
|-----|-----|---------|-------------|-------------------|
| **Massive.com** (TJ existing) | `massive.com/api/v1/` | Equity daily prices + options chains | Stocks, ETFs | `underlyingsIvHistory` |
| **Polygon.io** (TTC "Massive API") | `api.polygon.io/v2/aggs/grouped/` | Grouped crypto daily prices | Crypto | `price_history` (source: `massive`) |

Both should coexist in Trade Journal. The TTC `price_history` table with source `massive` refers to Polygon.io data. Trade Journal's `underlyingsIvHistory` with source `massive` refers to Massive.com equity data. These are stored in different tables and don't conflict.

**Potential consolidation**: Massive.com already runs daily in Trade Journal for equity prices. It may also offer crypto price data that could supplement or replace the Polygon.io endpoint. Worth investigating whether the existing Massive.com ingestion script (`ingest-underlyings-massive.ts`) can be extended for crypto, which would reduce the number of external API dependencies.

### 7. Authentication

TTC uses Clerk (multi-user auth with `userId` on every table). Trade Journal uses simpler auth sufficient for single-user domestic use. During migration:
- Port the `events` and derived tables with existing `userId` values intact (no schema change)
- The calculation engine already takes `userId` as a parameter — this continues to work
- No Clerk dependency in the ported code — just pass the user ID string

---

## Timeline Estimate

| Phase | Effort | Dependencies | Status |
|-------|--------|-------------|--------|
| M1: Schema Migration | 1-2 days | None | DONE (2026-02-18) |
| M2: Engine Port | 2-3 days | M1 | DONE (2026-02-18) |
| M3: UI Integration | 2-3 days | M2 | DONE (2026-02-19) |
| M4: Pricing Infrastructure | 2-3 days | M2 | DONE (2026-02-19) |
| M4.5a: Price Tier Reclassification | 0.5 day | M4 | DONE (2026-02-20) |
| M4.5b: Per-Source Delivery Monitoring | 1 day | M4.5a | DONE (2026-03-01) |
| M5: Base Currency | 3-5 days | M4 | Pending |
| M6: UK Tax Method | 5-8 days | M5 | Pending |
| M7: Portfolio Reconciliation | ~~2-3 days~~ | M2 + M3 | DONE (2026-02-19) |
| M7.1: Reconciliation Resolution | 2-3 days | M7 | Pending |
| M8: Sunset | 1 day | M7.1, M5 verified | Pending |
| M9a/b: IBKR Event Automation | ~~3-5 days~~ | M2 | DONE (2026-02-26) |
| M9c: Koinly Automation | Low priority | M9a | Deferred |

**Dependency chain**: M4.5b is complete. M7.1, M5, and M6 can proceed in any order. M8 (sunset) requires M7.1 + M5 verified at minimum. M9a/M9b are complete — IBKR event ingestion is automated. The remaining automation gap is scheduled calculation engine runs (not yet wired up).

---

## Files Reference

### twotreescap-app Files to Port

| Category | Key Files |
|----------|-----------|
| Calculation engine | `calculations/v2/*.ts` (8 files) |
| Event sourcing | `services/event-sourcing/adapters/ibkr/*.ts`, `services/event-sourcing/adapters/koinly-adapter.ts`, `services/event-sourcing/asset-resolver.ts`, `services/event-sourcing/event-store.ts`, `services/event-sourcing/batch-state-machine.ts` |
| Schema | `db/schema/events-schema.ts`, `db/schema/tax-lots-schema.ts`, `db/schema/price-history-schema.ts`, `db/schema/daily-portfolio-values-schema.ts`, `db/schema/import-batches-schema.ts`, `db/schema/assets-schema.ts` |
| Scripts | `scripts/phase8/fetch-crypto-prices.ts`, `scripts/phase8/populate-prices.ts`, `scripts/shadow-mode/run-calculation-engine.ts` |
| Utilities | `utils/price-fetch-utils.ts` |
| UI | `app/dashboards/home/*`, `app/dashboards/gains/*`, `app/calculate/*`, `components/charts/dashboard-home-*` |
| Server actions | `actions/dashboards/nav-actions.ts`, `actions/dashboards/gains-actions.ts`, `actions/dashboards/price-coverage-actions.ts`, `actions/dashboards/home-card-actions.ts`, `actions/dashboards/home-table-actions.ts` |

### Trade Journal Target Locations

| Category | Target Path |
|----------|-------------|
| Calculation engine | `src/lib/calculations/` |
| Event sourcing | `src/lib/event-sourcing/` |
| Schema (new tables) | `src/db/schema.ts` (append) or split to `src/db/schema/` |
| Scripts | `scripts/` |
| UI pages | `src/app/dashboard/portfolio/`, `src/app/dashboard/gains/`, `src/app/admin/price-coverage/` |
| Components | `src/components/portfolio/` (already exists with 10 components) |
| Server actions | `src/app/api/` or `src/lib/actions/` |
