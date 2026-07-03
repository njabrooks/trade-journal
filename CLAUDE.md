# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **V2 REVIEW IN PROGRESS (since 2026-06-11).** This codebase was heavily pruned on 2026-06-11 (−36K lines, 19 DB tables dropped — see [docs/v2/04-prune-report.md](docs/v2/04-prune-report.md)). The product direction, feature decisions, and build sequence live in [docs/v2/](docs/v2/) — read [03-v2-spec.md](docs/v2/03-v2-spec.md) before designing anything new. Governing principle: **the system (with Claude inside) does the curating, relating, and reviewing; the user only touches genuine decisions.** Never build review queues or curation UIs.

## Project Overview

A **Next.js full-stack application** for managing a multi-exchange investment portfolio. What it does today:

1. **Data ingestion** — live portfolio data from IBKR (Flex API), HyperLiquid, Coinbase Prime, Kraken, Deribit, Solana, plus market data from Massive.com (options chains + IV), Yahoo, calendars (economic/earnings), SEC filings, insider transactions
2. **Portfolio monitoring** — NAV, cash, leverage, exposure by account/owner/underlying/strategy (`/dashboard/portfolio`, `/dashboard/accounting`)
3. **Options scanner + vol-curve analyzer** — daily 50-ticker scan (launchd), strike-selection optimization, IBKR live quotes via Radon (`/vol-curve`)
4. **Belief layer** — macro theses ↔ asset theses ↔ strategies ↔ positions, with claims provenance, articulations, and falsification signals
5. **Accounting/tax** — UK Section 104 pooling, tax lots, Koinly import, reconciliation (seasonal use; episodic by design)

### Removed in the 2026-06 prune — do not look for these
Position triage + thesis triage (entire subsystem: pages, queues, engines, tables), `/news` page + intelligence report storage (`intelligence_reports`/`intelligence_items`), AI prompts admin (`ai_prompts`), FRED table subsystem, analyst upgrade/downgrade + price targets (insider transactions survive), in-app research upload/processing UI, reconciliation checkpoints, `thesis_news_items`. Dropped-table CSV dumps: `archive/db-dumps/2026-06/` (local). Old journal entries may reference these — that's history, not a bug.

### Research redesign (W8) — landed as the loose-agent model
W8 shipped incrementally as docs/v2/10–17 (relate-research, `/thesis`, `/maintenance`, thesis-observe, relate-bookmark). The claim-suggestion subsystem was cut over 2026-06-25 (docs/v2/11): the suggestion API routes, `InlineClaimSuggestions`, and the insert/backfill suggestion scripts are **gone** — don't look for them. The `research_hierarchy_recommendations` + `research_processing_runs` tables still exist but are dead; dropping them is deferred housekeeping. `scripts/ingest-world-monitor.ts` remains live (emits `intel_items` directly, no report storage).

## Technology Stack

- **Frontend:** Next.js 16 (React 19), TypeScript 5, Tailwind CSS 4, Radix UI, recharts
- **Backend:** Next.js API Routes, Drizzle ORM, PostgreSQL (Supabase — remote is the single source of truth, no local DB)
- **Tools:** tsx (scripts), ESLint 9

## Common Commands

```bash
npm run dev        # Dev server. A PERSISTENT instance (launchd: com.tradej, PORT=3001 pinned in its plist) serves localhost:3001, exposed via Tailscale serve at https://njb-m2-mac-mini.tailcfacb3.ts.net:3000 — don't start a second copy to "show" the user something; it picks up source changes itself. For throwaway smoke tests use PORT=3111. After `npm run build`, restart it (`launchctl kickstart -k gui/$UID/com.tradej`) — the build rewrites .next under the live dev server and corrupts its route cache (incident 2026-06-12: 500s with ENOENT app-paths-manifest).
npm run build      # Production build (the gate for any structural change)
npm run lint
npm test           # vitest — golden tests on the money-math (src/lib/calculations etc.); run before touching accounting code

npx tsx scripts/<script>.ts                     # Run any script (from repo root)
npx tsx scripts/psql-query.ts "SELECT ..." --format json   # Read-only SQL helper (wraps in row_to_json; cannot mutate)
```

## Architecture

### Decision hierarchy (CRITICAL — don't confuse levels)
1. **Macro theses** — cross-asset beliefs (secular/cyclical/structural)
2. **Asset theses** — beliefs about specific underlyings (FK to `underlyings`; junction `asset_thesis_related_macro_theses` to macros — one asset thesis can link to MULTIPLE macros; P&L attribution rule: full credit to each, labelled as exposure views)
3. **Strategies** — tactical execution constructs (`strategies.asset_thesis_id`)
4. **Positions** — live exposures (daily snapshot rows per `snapshot_date`)

Strategies are tactical; theses are long-lived beliefs. Never conflate.

### Data flow
```
Exchanges/APIs → src/lib/ingestion/* → raw tables (trades, positions, …)
              → derived computation during ingestion (src/lib/derived/*)
              → computed tables (strategy_metrics_snapshots, portfolio_snapshots, journal_entries)
              → src/db/queries/* → server components (pages) / API routes → React
```
Compute during ingestion and store; don't compute on query. Crypto/manual-snapshot ingestion logs to `ingestion_runs`; the IBKR flex pipeline currently does NOT write there — check `positions.snapshot_date` freshness instead (known observability gap).

**Research flow (Tana-centric):** capture + Toulmin extraction happen in Tana (notes repo); investment claims auto-promote into `main_claims`; linkage to theses via `claim_thesis_mappings`. The in-app research UI is browse-only (`/research`, `/claims`). The whole interface is being redesigned in W8.

### Entity state machines
- **Theses:** `draft → developing → monitoring ⇄ closed → complete | rejected`. `developing` = accumulating claims; `monitoring` = **live expression** (W8: an active strategy — directly for an asset, via a linked asset for a macro); `closed` = was expressed, now flat (dormant-but-intact, re-expresses to monitoring automatically). The W8 **expression-driven cascade** (`src/lib/derived/thesisCascade.ts`, rules in `thesisCascadeRules.ts`) derives asset/macro status from strategy status inside the post-ingestion recompute. It is **LIVE BY DEFAULT** as of B5 (B3 validated the supervised re-status; B5a decoupled promotion from signals) — every ingestion maintains thesis status automatically. Kill-switch: set `THESIS_CASCADE_ENABLED=0`. Promotion to monitoring is now cascade-driven (live expression = an active strategy), NOT signal-gated; `scripts/insert-thesis-articulation.ts` no longer changes status. Signals/digests are maintained by the `/thesis-review` skill (worklists: `find-signalless-theses`, `find-stale-digests`, `find-theses-due-health`). See [docs/v2/07-belief-maintenance-loop.md](docs/v2/07-belief-maintenance-loop.md). **Thesis cull ([docs/v2/02](docs/v2/02-thesis-cull-checklist.md)): CLOSED 2026-06-23 — superseded by this status-change logic.** Theses are never deleted/rejected as cleanup; an unexpressed thesis goes dormant (`closed`) via the cascade and re-expresses automatically. The only residual cull action is merging genuine duplicates (e.g. KWEB). **Loose-agent model (docs/v2/10, D1–D5):** `monitoring` is a **position flag, not an information gate** — research evidence attaches to a thesis by *bearing* whether or not you hold it (so `/relate-research` links claims to any *active* thesis, developing OR monitoring — the old developing-only law is gone). The foreground surface is **`/thesis`** (talk to a thesis: query · re-underwrite · what's-changed); `/maintenance` stays the background freshness-keeper.
- **Claims / signals:** `draft → active → complete | rejected`
- **Strategies:** `draft → active → complete | rejected | merged` (`merged` = terminal, merged into another strategy via `merged_into_id`; status auto-computed from positions). W8: every **active** strategy is auto-linked to an asset thesis inside the post-ingestion recompute (`src/lib/derived/strategyThesisLink.ts`) — canonical underlying resolved via `parent_underlying_id` (IBIT→BTC), else a placeholder thesis is created, else an unresolvable proxy (PURR) raises a DecisionStrip flag. Corrupted/junk strategies (non-ASCII homoglyph tickers, unresolved `@nnn` HL ids) are marked `rejected` via `scripts/ops/flag-corrupted-strategies.ts`.
- **Positions:** `is_open` boolean (closed when quantity = 0)

### Signals (post-prune shape)
Signals = confirmation/invalidation/completion criteria per thesis or strategy. **Under the loose-agent model (docs/v2/10) they are the synthesized _resolution section_ of a thesis's living underwriting — auto-derived by `/build-core-argument` from the linked claims' own rebuttals + inverted assumptions, never user-configured.** The v1 metric path (`/configure-signal`, `explicit_details`, FRED/price-IV thresholds, auto-trigger) is **retired** from the synthesis path; signals are qualitative statements. Linkage lives in **`signal_entity_links`** (junction), not on `signals`. Time series in `signal_data_snapshots` (quantitative from `scripts/collect-signal-data.ts`; qualitative from intelligence routing). **Threshold breaches now write journal entries only — there is no triage inbox.** A push/decision-strip notification path is a W6 design item.

## Key Directories

### `/src/app` — pages (all reachable from AppSidebar)
`/dashboard/portfolio` (client; fetches `/api/dashboard/portfolio*`) · `/dashboard/accounting` + `/reconciliation` + `/transactions` (tax ledger) · `/strategies[/id/{overview,journal}]` · `/asset-theses[/id/{overview,journal}]` · `/macro-theses[/id/{overview,journal}]` · `/claims[/id]` · `/research[/id]` · `/journal` · `/signals[/id]` · `/vol-curve[/id]` · `/admin/{strategies,accounts,ingestion/*,recompute,processes}`

Entity detail pages use route-based tabs via `createEntityTabs()` (`src/lib/types/entity-tabs.ts`): **Overview | Journal** (claims & signals render inside Overview). Pattern: server components call `src/db/queries/*` directly; the portfolio/accounting pages are client components fetching API routes. Dynamic `[id]` pages must guard non-UUID params with `isUuid()` from `src/lib/utils.ts` (404, not 500).

### `/src/db`
- **`schema.ts`** — authoritative Drizzle schema (64 tables)
- **`queries/`** — accounting, accounts, assetTheses, assets, cached, earningsEvents, economicEvents, entityRelationships, events, importBatches, intelItems, macroTheses, portfolio, reconciliation, relatedMacroTheses, research, secFilings, signals, strategies, tax-transactions, thesisSynthesis
  - `earningsEvents`/`economicEvents`/`secFilings` are currently orphaned (their feed routes died in the prune); data still ingests — modules may be re-used by W6/W7
- **`types.ts`** — auto-generated Supabase types (regenerated 2026-07-03 via Supabase MCP `generate_typescript_types`; reference only — query via Drizzle)

### `/src/lib`
- **`derived/`** — ivMetrics, portfolio, signalEvaluation, strategyAuto, strategyMetrics (per-strategy daily snapshots — **unrealized PnL only**; realized PnL is the W4 build)
- **`ingestion/`** — flex/ (IBKR CSV pipeline incl. `processCsv.ts`), crypto/ (shared types + cursors), per-exchange dirs (hyperliquid, coinbase-prime, kraken, deribit, solana), massive/
- **`services/`** — strategies.ts, strategyLinking.ts, ibkr/ (Client Portal Gateway: single-contract quotes/spot ONLY — bulk chains go through Radon), claim-thesis-suggestions.ts (W8-deferred), processTracking.ts
- **`intelligence/`** — scoring, resolver, evaluate (routes `intel_items` → signal evidence / claim candidates; claim candidates now land as journal entries), emitIntelItems, parseWorldMonitor
- **`calculations/` + `event-sourcing/`** — the accounting/tax engine (Section 104, lot matching, average cost; tables: `events`, `tax_lots`, `lot_consumptions`, `section_104_*`, `average_cost_positions`, `asset_aliases` — the latter two are empty but load-bearing; do NOT drop)
- **`volCurveAnalyzer.ts`** — options strike-selection engine

### `/scripts` (56 root + ops/ + lib/ + cron/)
- **Cron-driven:** run-flex-ingestion, ingest-{hyperliquid,coinbase-prime,kraken,deribit,solana,underlyings-massive,economic-calendar,earnings-calendar,finnhub-analyst-data (insider-only),sec-filings,manual-snapshots,radar-back-months}, fetch-crypto-prices, scan-cheap-options, evaluate-intel-items, synthesize-signal-day, check-price-gaps, extract-ibkr-prices
- **Skill-driven:** insert-thesis-articulation (build-core-argument), thesis-snapshot (/thesis data surface, read-only), capture-observation (/thesis + D4 — conversation/research observation → artifact+lightweight claim), collect-signal-data, assess-validation-evidence, pull-portfolio, vol-curve-analyze/save-report, ibkr-option-quote, auto-promote-claims, upload-gromen-insight (canonical audit-upload pattern)
- **Ops (manual):** `scripts/ops/*` (create/link/status/journal helpers), psql-query, push/restore-from-remote, reconcile-koinly, import-koinly, run-calculation-engine, s104-tax-summary, backfill-cik (SEC CIK populator — keep), sync-tv-drawings (fate undecided)
- **`scripts/lib/db.ts`** — ALWAYS use for DB access in scripts (loads dotenv before client creation; importing `src/db/index.ts` breaks on import hoisting)

## Database Schema (64 tables — `src/db/schema.ts` is authoritative)

**Core:** accounts, owners, underlyings (ticker reference + spot/IV30/conid), trades, positions (`market_value_usd` is canonical USD value; `abs_notional*` are deprecated legacy), strategies, macro_theses, asset_theses, main_claims (+ main_claim_evidence, claim_thesis_mappings, claim_signal_evidences)

**Derived:** strategy_metrics_snapshots (daily per-strategy, maintained by flex pipeline; unrealized-only until W4), portfolio_snapshots, mtm_snapshots (has per-position realized PnL, IBKR only), nav_snapshots, cash_balances, journal_entries (the audit trail — everything logs here)

**Signals:** signals, signal_entity_links (junction — entity linkage lives HERE), signal_data_snapshots (45K rows; `intelligence_item_id`/`report_id` are bare provenance uuids, FKs dropped), signal_status_history, signal_data_source_registry, thesis_articulations, thesis_monitoring_configs

**Market data:** underlyings_iv_history, options_chain_snapshots (1.5M rows, greeks included), price_history, fx_rates, economic_events, earnings_events, sec_filings, insider_transactions, intel_items (normalized cross-source intelligence; `processing_status`/`processing_result`)

**Scanner:** vol_scan_runs, vol_scan_ticker_snapshots, vol_curve_reports, watchlist_entries (scanner universe)

**Accounting/tax:** events, event_calculations, tax_lots, lot_consumptions, section_104_pools, section_104_matches, portfolio_daily_balances, daily_portfolio_values, average_cost_positions, asset_aliases, assets, import_batches, reconciliation_resolutions

**Research:** research_artifacts, research_insights (`claims_structure` JSONB, hierarchical Toulmin), research_hierarchy_recommendations + research_processing_runs (W8-deferred)

**Infra:** ingestion_runs, ingestion_cursors, flex_query_configs, strategy_templates, strategy_types

## Ingestion & Automation

GitHub Actions (UTC): flex hourly 04–14 · massive 21:30 · hyperliquid/coinbase/kraken/deribit/solana every 4h (offsets :00/:15/:30/:45/:50) · crypto-prices 00:30+06:00 · economic calendar 06:00+14:00 · earnings 05:00 wd · finnhub 07:00 · SEC 07:00 · signal-day-synthesis 01:00 · evaluate-intel-items every 4h @ :10 · price-gap-check 08:00 · manual-snapshots 06:00. All have `workflow_dispatch`.

On-device launchd (wrappers in `scripts/cron/`; read [launchd/README.md](launchd/README.md) before adding jobs): `options-scanner` Mon–Fri 14:50 Europe/London · `collect-signal-data` daily 06:30 · `thesis-observe` daily 07:00 · `maintenance` twice daily 08:00/20:00. The observe/maintenance jobs run the Claude CLI headlessly — **an expired CLI login (`claude /login`) fails them silently with rc=1**. Every wrapper appends its outcome to `logs/cron-status.tsv`; `scripts/ops/check-cron-health.ts --nudge` (wired to SessionStart) surfaces failure streaks and stale jobs, and failures also fire a macOS notification.

**Known issues:** IBKR Flex API refuses statement generation mid-US-market-day (`ErrorCode 1001`) — failures outside the 04–14 UTC window are usually IBKR-side, not code. (Solana flakiness was the triage engine erroring on crypto positions; resolved by the prune, verified 2026-06-11.)

**IBKR access beyond Flex goes through Radon** (`/Users/home-hub/projects/radon`): bulk options chains, contract qualification, live quotes via `scripts/clients/ib_client.py` (TWS API, IB Gateway auto-managed by Radon's launchd; Mon 2FA). Trade-journal Python scripts use client_id range **20–49**.

## Working Conventions

- **Scripts:** `.ts` not `.mts`; wrap body in `async function main()` (no top-level await); import DB from `scripts/lib/db.ts`
- **Dependencies:** after ANY package.json/package-lock change, verify `npx -y npm@10 ci --dry-run` exits 0 — GH runners use npm 10, whose lock validation is stricter than local npm 11 (a desync here takes down every cron; incident 2026-06-12)
- **Migrations:** update `src/db/schema.ts` first → SQL file in `/migrations/` → **run immediately yourself** via `/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL_POOLER" -f migrations/...` (never ask the user to run it) → verify. Supabase MCP is unreliable for this; use psql.
- **Shell DB access:** `source .env.local && psql "$DATABASE_URL_POOLER" -c "..."`
- **Commits:** template at [docs/archive/commit_message_template.md](docs/archive/commit_message_template.md) — `<type>(<scope>): <subject>` + Problem/Solution/Impact/Files Changed sections
- **Claim provenance:** claims from research audits carry `source_insight_id`/`source_claim_id` — always link the EXISTING claim, never duplicate
- **No auth on API routes** — deliberate (personal tool on own hardware); revisit only if deployed off-box
- **Env:** `.env.local` (DATABASE_URL_POOLER/DIRECT, IBKR_FLEX_*, MASSIVE_*, COINBASE_PRIME_*, HYPERLIQUID_WALLET_ADDRESS, KRAKEN_*, DERIBIT_*, HELIUS_API_KEY + SOLANA_WALLETS, FINNHUB_*)

## Skills (`.claude/skills/`)

Active: pull-portfolio, portfolio-and-options-mcp, ibkr-quote, analyze-vol-curve, options-advisor, build-core-argument, **thesis** (talk-to-your-thesis, docs/v2/10 D3), **decisions** (pull resolver), relate-research, relate-bookmark, maintenance, thesis-review, thesis-observe, assess-validation-evidence, synthesize-claims, finalize-for-upload, backfill-claims, process-transcript, process-note, graduate-pipeline-idea + the stage-1…5 deep-dive pipeline skills, advance-or-kill, pipeline-status. (paperclip-backlog and archived-* are deprecated; **configure-signal is retired** — signals are now auto-derived by build-core-argument, never configured, per docs/v2/10 §6/§9.)

## V2 Roadmap Snapshot (details in [docs/v2/03-v2-spec.md](docs/v2/03-v2-spec.md))

| Workstream | Status |
|---|---|
| W1 prune sweep | **DONE** 2026-06-11 ([report](docs/v2/04-prune-report.md)) |
| W2 docs regen | DONE (this file) |
| W0 ops: Solana fix (DONE — was triage-engine errors, resolved by prune); accounting catch-up Mar→Jun + reconcile | partial |
| W3 vitest + golden tests on money-math | **DONE** 2026-06-11 — 79 tests; found+fixed Kraken XTZ bug; two S104 findings await user decision (same-day rule diverges from TCGA92 s105 aggregation; overselling silently swallowed — see test NOTEs in uk-section-104.test.ts) |
| W4 realized PnL engine + attribution rollups | **DONE** 2026-06-12 — engine (`src/lib/derived/realizedPnl.ts`), schema cols, daily maintenance, backfill executed (8,259 rows; design: docs/v2/05); thesis attribution queries (`src/db/queries/thesisPerformance.ts`) |
| W5 performance section UI | **DONE** 2026-06-12 — `/performance` page (asset/macro attribution tables + retrospective cards, empty until the cull closes theses); Performance sections on thesis overview pages (asset: stacked per-strategy chart, macro: full-credit exposure view + per-asset breakdown); `ConfidenceBadge` (`src/components/performance/`) enforces the non-'full' realized_confidence badging rule everywhere realized figures render |
| W6 morning screen + live-pricing overlay (D14) | **DONE** 2026-06-12 — live overlay: `src/lib/services/livePrices.ts` (Yahoo live → IBKR gateway fallback, 15-min TTL, stale-quote + deviation + currency guards) applied client-side as a price RATIO (`src/lib/livePricingOverlay.ts`, tested); dashboard = morning screen: needs-decision strip (journal `action_type='decision_required'` + `status='active'`, W8 produces items), D12 lens tabs (underlying/strategy/account-NAV/P&L), performance + scanner modules. Advisor slot in ScannerSnapshot awaits W7 |
| W7 portfolio-aware options advisor (D11) | **DONE** 2026-06-12 — all four scenarios: hedge (puts/put-spreads), income (covered calls + run-up context), put_entry (cash-secured puts on bullish-thesis names), opportunistic (judgment payload, no mechanical structures). Engine `scripts/options-advisor.ts` (math only; NOTE: scripts/lib/db pools max 1 connection — loaders must stay sequential), judgment in `/options-advisor` skill, storage `advisor_recommendations` (per-scenario batch supersede, 7-day expiry), dashboard ScannerSnapshot groups by scenario. Live batches: hedge 3 + income 3 + put_entry 2. Post-scan scheduling deliberately on-demand pending user decision |
| W8 research redesign (Tana-aware, anticipatory) | **DONE** — landed incrementally as the loose-agent model (docs/v2/10–17: relate-research, /thesis, /maintenance, thesis-observe, relate-bookmark); claim-suggestion cutover 2026-06-25 (docs/v2/11) |
| W9 intel router quality audit | **KILLED** — evaluate.ts engine + cron removed instead of audited; signal evidence now comes from thesis-observe + ingest-world-monitor |
| docs/v2/13 macro emergence + episodic performance | **DONE** 2026-06-25 @64f5981 |
| docs/v2/19 post-sweep decision plan | **DONE** 2026-06-29 — all 260 claim decisions resolved, 10 theses re-underwritten with owner calls (ETH flipped bearish), 2 new draft macros |
| Thesis cull | **CLOSED 2026-06-23** — superseded by the status-change logic (keep all; unexpressed theses go dormant=`closed` via the cascade, re-express automatically; never delete/reject as cleanup). Only residual action = merge genuine duplicates (KWEB). |
