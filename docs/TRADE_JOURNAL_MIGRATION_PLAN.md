# Trade Journal Migration Plan

**Created**: February 15, 2026
**Status**: M1 + M2 + M3 + M4 + M7 complete. Next: M5 (base currency), M6 (UK tax), or M8 (sunset).
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

2. **Two separate IBKR pathways**: Trade Journal's existing Flex Query ingestion feeds the trading/strategy side. The TTC Combined Report adapter feeds the tax accounting side. These are complementary, not redundant (see [IBKR Overlap Analysis](#ibkr-overlap-analysis) below).

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

### Phase M5: Base Currency Support (was TTC Phase 4)

**Goal**: Configurable reporting currency per owner with FX conversion.

Ported from [COMPLETION_PLAN.md § Phase 4](../../twotreescap-app/docs/COMPLETION_PLAN.md#phase-4-base-currency-support--deferred):

1. **FX Rate Infrastructure**: `getFxRate(from, to, date)` using IBKR FX rates (already in `fxRates` table in Trade Journal!) and `price_history` for daily pairs
2. **Configuration**: Per-owner currency setting (GB owners → GBP, US owners → USD)
3. **Engine Integration**: Convert event values to base currency at event-date FX rate
4. **Reporting**: Multi-currency gain/loss reports, FX gain/loss tracking

**Advantage of doing this in Trade Journal**: Trade Journal already has `fxRates` table populated from IBKR Flex queries. The infrastructure is partially there.

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

#### M7 Prerequisite: Bring Event-Sourced Data to Current Date

**Priority**: High — required for meaningful reconciliation.

The comparison date is currently anchored to Feb 12, 2026 (last Koinly event date). Snapshot data extends to Feb 19+. This means reconciliation can only compare at a 9+ day-old date, and any trades executed since Feb 12 appear as false discrepancies. To get a same-day comparison:

1. Import latest IBKR Combined Report (covers trades + STFU since Feb 10)
2. Import latest Koinly exports per owner (covers crypto events since Feb 12)
3. Run the calculation engine to regenerate daily balances and NAV through today
4. The comparison date will automatically advance to the new last event date

This is a one-time catch-up, but the underlying issue (no automated event ingestion) is addressed by the ingestion solution below.

#### M7 Future Enhancement: Event-Sourced Data Ingestion Solution

**Priority**: High — without this, the "last complete event date" never advances and reconciliation stays stale.

**Current state of the import pipeline:**

The M2b import pipeline is fully ported but only as CLI tools — there's no automated trigger or UI for it:

| Component | Status | Details |
|-----------|--------|---------|
| IBKR adapter (8 files) | Ported ✓ | `src/lib/adapters/ibkr/` — parses Combined Report CSV (trades + STFU) |
| Koinly adapter | Ported ✓ | `src/lib/adapters/koinly-adapter.ts` |
| Coinbase, Buxfer adapters | Ported ✓ | Lower priority |
| CLI import scripts | Ported ✓ | `scripts/import-ibkr-combined.ts`, `scripts/import-koinly.ts` |
| Event store + asset resolver | Ported ✓ | Idempotent persistence, 5-step ticker resolution |
| Calculation engine | Ported ✓ | `scripts/run-calculation-engine.ts` (8 phases) |

**What IS automated (snapshot side only):**

| Pipeline | Trigger | What it feeds |
|----------|---------|---------------|
| IBKR Flex ingestion | `.github/workflows/flex-ingestion.yml` — hourly | `positions`, `trades`, `portfolioSnapshots`, `navSnapshots` |
| IBKR price extraction | Post-step after Flex ingestion | `price_history` (source: `ibkr`) |
| Crypto prices | `.github/workflows/crypto-prices.yml` — twice daily | `price_history` (source: `massive`) |

**What is NOT wired up (event-sourced side):**

- **Event-sourced imports** — CLI scripts exist but no automated trigger. Manual process:
  ```bash
  npx tsx scripts/import-ibkr-combined.ts --file path/to/combined-report.csv
  npx tsx scripts/import-koinly.ts --file path/to/koinly-export.csv
  npx tsx scripts/run-calculation-engine.ts
  ```
- **No UI upload flow** — TTC had Phase 6 cutover infrastructure (upload actions, dispatcher, feature flags) but that was explicitly left behind in the migration plan.
- **No automated calc engine trigger** — after importing new events, the calculation engine needs to run manually to update daily balances, enrichment, and NAV.

**Options for closing the gap:**

| Option | Approach | Effort | When |
|--------|----------|--------|------|
| **A. Keep manual (short-term)** | Run CLI scripts when new IBKR/Koinly exports are available. Reconciliation framework flags when event-sourced data falls behind. | None | Now |
| **B. GitHub Actions workflow** | Trigger on file upload (to a specific repo path or S3 bucket) or on schedule. Run import + calc engine as CI job. | Medium | After catch-up |
| **C. API route + admin UI** | Build `/admin/import` page (the migration plan deferred `/admin/calculations`). Upload file → trigger adapter + calc engine server-side. | High | Future |
| **D. Automate IBKR via Flex API** | Add a STFU (Statement of Funds) Flex Query to the existing daily IBKR API pipeline. Captures dividends, fees, deposits, withdrawals, corporate actions as events — eliminating manual Combined Report downloads entirely. | High | Future |

**Recommended path**: Option A now (manual catch-up to bring data current), then Option B or D for ongoing automation. IBKR imports happen ~weekly and Koinly maybe monthly, so manual is viable short-term. Option D is the long-term ideal since it eliminates the manual file download step entirely.

---

### Phase M8: Sunset twotreescap-app

**Goal**: Decommission the old app after successful migration.

1. **Verify parity**: All Trade Journal calculations match TTC output
2. **Redirect**: Point any bookmarks/links to Trade Journal equivalent pages
3. **Archive**: Move twotreescap-app to an archive branch or repo
4. **Clean up**: Remove TTC-specific env vars, Vercel deployment, etc.
5. **Database cleanup**: Drop legacy V1 tables (`transactions_v1_archive`, `prices`, `coinmktcap_prices`, `tradingview_prices`, `daily_snapshots`)

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
| **Dividends, interest, fees** | **No** | **Yes** (STFU section) |
| **Deposits/withdrawals** | **No** | **Yes** (STFU) |
| **Corporate actions** | **No** | **Yes** (STFU) |
| **Options exercises/assignments** | **No** | **Yes** (STFU) |

**The Flex Query ingestion is NOT sufficient for tax accounting.** The Statement of Funds (STFU) section in Combined Reports provides individual cash flow events (dividends, interest, fees, deposits, withdrawals, corporate actions) that the tax lot engine needs. These only appear as aggregate cash movements in Flex Query data.

**Decision: Keep both IBKR adapters as separate, parallel pipelines.**
- Flex Query adapter → `trades`, `positions`, `portfolioSnapshots`, `navSnapshots`, `fxRates` (strategy/portfolio side)
- Combined Report adapter → `events` (tax accounting side)
- **Shared benefit**: Flex Query positions provide daily MTM prices that flow into `price_history` for the tax accounting side's market value enrichment

**Near-term improvement**: The daily IBKR Flex API is already running. Adding a new Flex Query for "Cash Transactions" or "Activity Statement" to capture STFU-equivalent data (dividends, fees, deposits, corporate actions) is straightforward — just another query configuration. This would automate the event-sourcing side too, eliminating manual Combined Report downloads. Should be done as part of M2 or M4.

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

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| M1: Schema Migration | 1-2 days | None |
| M2: Engine Port | 2-3 days | M1 |
| M3: UI Integration | 2-3 days | M2 |
| M4: Pricing Infrastructure | 2-3 days | M2 |
| M5: Base Currency | 3-5 days | M4 |
| M6: UK Tax Method | 5-8 days | M5 |
| M7: Portfolio Reconciliation | ~~2-3 days~~ DONE | M2 + M3 |
| M8: Sunset | 1 day | M1-M4, M7 verified |

M5 depends on M4. M6 depends on M5. M7 (reconciliation) is complete and validates parity between snapshot and event-sourced views. M8 (sunset) only happens once M7 reconciliation confirms both views converge and remaining discrepancies are explained.

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
