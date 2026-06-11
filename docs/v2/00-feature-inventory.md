# Feature Inventory & Usage Audit — Phase 0 of the v2 Review

**Date:** 2026-06-11
**Method:** Code-derived inventory (every page, API route, script, cron, skill) cross-referenced with usage forensics from the production database (row counts, last-write timestamps, activity patterns in `journal_entries`, `triage_records`, `ingestion_runs`, `intel_items`, `signal_data_snapshots`) and git history (commit cadence, per-area last-touched dates). Documentation (CLAUDE.md) was deliberately NOT used as a source — it has drifted from reality in several places (noted at the end).

**How to read:** Each feature gets a verdict hypothesis — **KEEP** (core, invest), **IMPROVE** (keep but fix named problems), **SIMPLIFY** (keep the job, shrink the machinery), **INVESTIGATE** (evidence ambiguous — interview question), **KILL** (no evidence of value; delete). These are hypotheses for you to confirm or overturn in the Phase 1 interview. Questions for the interview are marked **Q:**.

**Caveat on "no caller found":** API-route caller analysis is grep-based; routes fetched via template literals can be missed. Where the page-level audit found a UI caller that the route-level grep missed, the page audit wins. Routes marked dead below survived both checks.

---

## 0. The headline: three eras, one cliff

The data tells a clean story that should frame every decision in this review:

| Era | Period | Evidence |
|-----|--------|----------|
| **Heavy build** | Dec 2025 – Mar 2026 | 154 / 228 / 83 / 150 commits per month. Belief layer, research pipeline, signals, triage, accounting all built here. |
| **Active curation** | Jan – mid-Apr 2026 | 200–579 user-sourced journal actions/month: claim linking, annotations, triage dismissals, status changes. |
| **The cliff** | mid-Apr 2026 → today | Commits drop to 10 (Apr), 8 (May). **User-sourced journal actions: 167 in April → 0 in May → 0 in June.** Last user claim-link Apr 15, last annotation Apr 13, last thesis update Apr 2. |

What survived the cliff — still used and actively developed:

- **Trading-data ingestion** — all 7 exchange pipelines green, running daily (only blemish: Solana, 17 failures in 30 days)
- **Options scanner + vol-curve analyzer** — every commit since mid-April is this (scanner launchd job, manual re-run, Juneteenth fix, greeks capture)
- **Portfolio dashboard** — uncommitted work in progress right now (`AccountNavTable.tsx`)
- **Claude-as-interface** — June commits added `pull-portfolio`, `portfolio-and-options-mcp`, `ibkr-quote` skills; the direction of travel is querying the system through Claude, not clicking through the web UI

What stopped at or before the cliff:

- Research/claims curation (1,153 claims now sitting in `draft`)
- World Monitor / Thesis Monitor ingestion (last report Apr 6)
- Thesis triage (10,424 items in inbox, generation itself stopped May 13)
- Signal creation (no new signals since Mar 25; the snapshot machinery still runs daily against the aging set)
- The stage-gated research pipeline (`research-workspace/`, last touched Mar 25)

**Q (the central question of the whole review):** Was the cliff (a) deliberate — you decided the curation layer wasn't paying for its effort; (b) friction — you wanted to keep doing it but the workflows were too heavy; or (c) circumstance — life/work pulled you away and you intend to return? The right v2 is different in each case. Everything below feeds this.

---

## 1. Portfolio & Accounting

### 1.1 Portfolio dashboard (`/dashboard/portfolio`)
What it is: NAV/cash/leverage metrics, positions by underlying/strategy/owner, filters, charts.
Evidence: data fresh daily (`portfolio_snapshots`, `cash_balances`, `nav_snapshots` written this morning); uncommitted improvements in working tree right now.
**Verdict: KEEP** — clearly part of the daily loop. Candidate anchor page for v2.

### 1.2 NAV tracker (`/dashboard/accounting`)
What it is: NAV evolution, drawdown, breakdowns, price freshness.
Evidence: `mtm_snapshots` (201K rows) and `nav_snapshots` written daily; UI last touched Mar 20.
**Verdict: KEEP.** **Q:** does this and 1.1 deserve to stay two pages, or merge into one portfolio home?

### 1.3 Tax ledger (`/dashboard/accounting/transactions`) + UK Section 104 engine
What it is: tax-year bucketed disposals, S104 pooling, Koinly import/reconcile. Big hidden subsystem: `events` (31K), `tax_lots` (14K), `lot_consumptions` (26K), `section_104_matches` (5.6K), `portfolio_daily_balances` (285K) — none of it documented in CLAUDE.md.
Evidence: one large batch run Mar 4 (UK tax year end) — classic seasonal use. Untouched since.
**Verdict: KEEP (seasonal).** Works once a year, leave alone. **Q:** confirm Koinly remains the upstream and this stays import-based; any pain from March worth fixing before next April?

### 1.4 Reconciliation (`/dashboard/accounting/reconciliation`)
Evidence: 77 resolutions through Mar 1; **`reconciliation_checkpoints` table: 0 rows ever** — the checkpoint feature was built and never used once.
**Verdict: SIMPLIFY** — keep resolution flow if you reconcile annually; delete checkpoints. **Q:** confirm.

---

## 2. Ingestion & Market Data

### 2.1 Exchange pipelines (IBKR Flex, HyperLiquid, Coinbase Prime, Kraken, Deribit, Solana)
Evidence: all completing daily for 30 days straight. Solana: 17 failures/30d (only unhealthy one).
**Verdict: KEEP — this is the bedrock.** Fix Solana. Code note for later phases: 5 near-identical retry/HTTP stacks to dedupe.

### 2.2 Market data: Massive chains (1.5M rows), `price_history` (247K), `underlyings_iv_history` (33K), fx_rates
Evidence: all written within the last day; feed scanner, portfolio, IV metrics.
**Verdict: KEEP.**

### 2.3 Calendars & filings: economic calendar, earnings calendar, SEC filings, insider transactions
Evidence: all ingesting daily and being routed through `intel_items` (insider: 1,660 contextual + 261 signal-evidence matches).
**Verdict: KEEP**, pending §5 questions about whether routed output gets read.

### 2.4 Finnhub analyst data
Evidence: `insider_transactions` 4.5K rows, alive. **`analyst_actions`: 0 rows. `analyst_price_targets`: 0 rows** (premium-gated endpoints, never returned data).
**Verdict: TRIM** — keep insider, delete the two dead endpoints + empty tables.

### 2.5 FRED integration
Evidence: **all four tables empty** (`fred_observations`, `fred_series_metadata`, `thesis_fred_indicators`, `fred_threshold_breaches`). Ingest script exists (`ingest-fred-historical.ts`), unreferenced by any cron. Some signals do reference `fred:*` data sources via the collector path — those wrote snapshots through Apr, so FRED data flows through `collect-signal-data`, not through these tables.
**Verdict: KILL the table-based FRED subsystem** (schema + breach detection + scripts). Keep the collector-based path if signals stay.

---

## 3. Options Scanner & Vol-Curve (the post-cliff center of gravity)

What it is: daily launchd scan (50-ticker universe from `watchlist_entries`), Scanner Today UI, historical reports, vol-surface analyzer, IBKR live quotes via Radon.
Evidence: runs complete daily; 26 runs; 7 saved vol-curve reports (last May 1); ALL recent commits are here; three Claude skills wrap it.
**Verdict: KEEP & INVEST.** This is what the app has organically become — decision-support for options entry.
**Q:** What's missing here? (e.g., scanner→strategy pipeline: a scanner hit currently has no path into a draft strategy/thesis; alerts when a watchlist name crosses an IV threshold?)
**Q:** Vol-curve reports: only 7 saved, last in May — is the report-saving flow useful or is the live analyzer enough?

---

## 4. Belief Layer (macro theses, asset theses, claims, articulations)

### 4.1 Theses (38 macro, 64 asset)
Evidence: last asset-thesis update May 13, last macro update Mar 30. Status data has drifted from the documented lifecycle: 8 asset + 5 macro theses carry status `active`, which isn't in the draft→developing→monitoring model; 40 strategies have status `merged`, also undocumented.
**Verdict: KEEP the hierarchy** — it's the app's distinctive idea and the planned performance-attribution feature hangs off it. But the population needs a cull: **Q:** of 38 macro / 64 asset theses, how many do you still believe in / want to carry into v2? (A thesis-by-thesis cull list is a Phase 1 exercise — likely the single highest-value pruning action, since most downstream noise (triage, signals, snapshots) scales with thesis count.)

### 4.2 Claims (1,760 total: 1,153 draft / 502 active / 73 rejected / 32 complete)
Evidence: still being created (145 in June — Tana auto-promotion runs), but human curation stopped Apr 15. Draft pile grows ~300+/month, unreviewed.
**Verdict: SIMPLIFY radically.** The capture→extraction pipeline works; the human review step is the bottleneck that broke. Options to discuss: auto-link with confidence thresholds and no review queue; periodic Claude-run batch curation; or stop promoting un-linked claims entirely (only claims that match an existing thesis enter the DB).
**Q:** When you read a thesis page today, do the linked claims actually inform anything? Be honest — this decides a lot of machinery.

### 4.3 Articulations (`build-core-argument`)
Evidence: 58 articulations, last Mar 25 — used during the active era, abandoned with the rest.
**Verdict: KEEP the concept** (a versioned core argument per thesis is good); revisit the signal-generation step (see §5).

---

## 5. Signals & Monitoring

Evidence, bluntly:
- 572 signals created → **534 rejected (93%)**, 35 active, 3 complete. You built a batch-review tool specifically to mass-reject signal over-generation.
- No new signal since Mar 25.
- The monitoring machinery still writes daily against the 35 actives: 45K total snapshots; one signal (stablecoin supply) has 1,983 snapshots. `intelligence_routing` wrote **32,152 snapshots in March alone**.
- `signal_status_history`: 14 rows ever (audit trail nobody audits). `signal_data_tracking`: 0 rows.

**Verdict: SIMPLIFY hard.** The idea (explicit falsification criteria per thesis) is the best part of the system's design. The implementation generates noise at ~15x the rate a human ever consumed it. v2 shape to discuss: few signals per thesis (3–5, hand-picked), snapshot only on **change** (threshold crossing / assessment flip) rather than daily-no-change rows, alerts (push) instead of dashboards.
**Q:** Did any signal ever actually change your mind or trigger an action? Which one(s)? That's the spec for v2 signals.
**Q:** `/signals/data-sources` registry page, daily-scores charts, batch-review — which of these did you ever open twice?

---

## 6. Intelligence & News

### 6.1 World Monitor / Thesis Monitor reports
Evidence: ingestion stopped Apr 6 (114 reports, 3.4K items). These came from Arbor via `/api/intelligence/upload`.
**Q:** Did Arbor stop producing, or did you stop caring? Keep, revive, or delete the whole reports+items subsystem?

### 6.2 `intel_items` routing (calendar/insider/SEC/earnings → thesis matching)
Evidence: alive — `evaluate-intel-items` runs every 4h, routing items as signal-evidence/contextual daily.
**Verdict: INVESTIGATE** — machinery healthy, but its output lands on thesis pages and in snapshots you may not read. **Q:** does the Intel panel on thesis pages earn its place?

### 6.3 News page (`/news` unified feed)
Evidence: built Mar–Apr; feeds from live tables so it stays fresh; no way to measure reads.
**Q:** Is `/news` in your daily rotation, or do you get this from elsewhere?

---

## 7. Triage

### 7.1 Position triage (`/triage`)
Evidence: generated daily; inbox currently 533 (195 urgent, oldest Apr 8); urgents *are* still being marked done as recently as Jun 9 — the only UI workflow with post-cliff signs of life. But escalations stopped Apr 20 and user dismissals stopped Mar 30, so the inbox net-grows.
**Verdict: IMPROVE.** Likely too chatty (info-severity = 279 of the inbox). v2 question is volume/precision, not existence. **Q:** which triage reasons (DTE, size, IV, complexity…) have ever made you act?

### 7.2 Thesis triage
Evidence: **10,424 items in inbox**, zero ever appear to have been worked at that scale (137 done, all pre-March), and generation itself stopped May 13.
**Verdict: KILL as implemented.** Whatever "this thesis needs attention" should be in v2, this isn't it. Replace with at most a handful of high-precision nudges (e.g., "monitoring thesis with an invalidation signal breached").

---

## 8. Journal

Evidence: healthy as an automated audit trail (quantity changes, trades, triage events still logged daily); as a *user* journal it stopped (last user annotation Apr 13). UI last touched Feb.
**Verdict: KEEP** — cheap, and the audit trail is exactly what powers retrospectives in v2. **Q:** would you actually write trade/thesis reflections if friction were near-zero (e.g., via a Claude skill at end of day), or is manual journaling a fantasy to design out?

---

## 9. Research Workflow UI (`/research`, `/claims`, upload, detail pages)

Evidence: pages still render live data; human flow stopped mid-April. The API surface beneath is the deadest zone in the codebase: ~18 of 22 `/api/research/*` routes have no caller — remnants of the pre-Tana in-app AI workflow (process, promote, suggestions, analyze-hierarchy, cleanup-duplicates…), consistent with the 11 archived components in `src/components/research/archive/`.
**Verdict: SIMPLIFY** — keep a read/browse surface for claims-on-theses; delete the in-app processing workflow remnants wholesale (routes, archived components, `ai_prompts` table (3 rows, last write Dec 25) + `/admin/prompts` page, `research_processing_runs`, `research_hierarchy_recommendations` (stale since Apr 14)).
**Q:** confirm Tana is permanently the capture/extraction layer (CLAUDE.md says so; the data agrees).

---

## 10. Stage-Gated Research Pipeline (`research-workspace/`, stage-1…5 skills)

Evidence: 7 idea directories; last touched Mar 25 (idea-007). Skills all still installed.
**Q:** Still believe in the stage-gate model? Options: keep as-is (it's file-based, zero runtime cost), or fold its best part (advance-or-kill discipline) into the thesis lifecycle and drop the parallel structure.

---

## 11. Admin & Config

| Page | Evidence | Hypothesis |
|------|----------|------------|
| `/admin/ingestion/*` (flex upload, flex-configs, IBKR sync, IV backfill) | flex_query_configs touched yesterday | KEEP (ops surface) |
| `/admin/recompute`, `/admin/processes` | recompute_all last ran Jan 7; processes = ingestion_runs viewer | KEEP minimal |
| `/admin/accounts`, `/admin/strategies` (types) | strategy_types touched May 12 | KEEP |
| `/admin/triage` (rules) | triage_rules table doesn't exist in DB; route has TODO "store in database" | INVESTIGATE — likely half-built |
| `/admin/prompts` | dead with §9 | KILL with §9 |

---

## 12. Skills & Automation Surface

- **17 GitHub Actions workflows** — all green except Solana. KEEP.
- **1 launchd job** (options-scanner) — KEEP; recent investment.
- **23 Claude skills** — the post-cliff growth area (pull-portfolio, portfolio-and-options-mcp, ibkr-quote, analyze-vol-curve all recent). KEEP & INVEST — **Q:** is "Claude as the primary interface, web UI as dashboard" the explicit v2 architecture? The evidence says you're already living that way.
- **120 scripts, of which ~83 are referenced by nothing** — 22 one-off fixes/backfills, 12 test/debug harnesses, 9 `upload-*-audit` one-offs, plus genuinely-manual ops tools. Action: archive/delete the first three groups (~43 files) wholesale; document the keepers.

---

## 13. Dead tables (empty, candidates to drop with their code)

`fred_observations`, `fred_series_metadata`, `fred_threshold_breaches`, `thesis_fred_indicators`, `analyst_actions`, `analyst_price_targets`, `monitoring_specs`, `monitoring_events`, `decision_audit_log`, `daily_snapshots`, `asset_aliases`, `average_cost_positions`, `raw_flex_positions`, `raw_flex_trades`, `reconciliation_checkpoints`, `signal_data_tracking` — **16 tables, zero rows each.**

Near-dead (stale, decide with their feature): `signal_status_history` (14 rows, Jan), `thesis_monitoring_configs` (2 rows, Jan), `ai_prompts` (3 rows, Dec), `research_hierarchy_recommendations`, `intelligence_reports/items` (if §6.1 dies), `thesis_triage_records` (§7.2), `vol_curve_reports` (only 7 — or keep, cheap).

---

## 14. Documentation drift (why CLAUDE.md can't be trusted today)

- Describes a 4-tab thesis page (Overview / Claims & Signals / Triage / Journal); reality is 3 route-tabs with Claims & Signals merged into Overview.
- References `thesis_news_items` — table doesn't exist.
- Status enums in the wild include `active` (theses) and `merged` (strategies) — not in the documented state machines.
- Says nothing about the entire accounting/tax subsystem (§1.3) or `price_history`, `events`, `assets`, `watchlist_entries`, scanner tables.
- Claims FRED/analyst features that have never held data.

**Action (Phase 2):** regenerate CLAUDE.md from the post-prune codebase; keep it half its current size.

---

## 15. Verdict summary

| Verdict | Features |
|---------|----------|
| **KEEP / INVEST** | Exchange + market-data ingestion; portfolio dashboard; NAV tracker; options scanner + vol-curve; thesis hierarchy (culled); journal (as audit trail); skills/Claude-interface; tax engine (seasonal) |
| **IMPROVE** | Position triage (volume/precision); Solana ingestion reliability |
| **SIMPLIFY** | Signals (few, change-triggered, alerting); claims curation (remove human bottleneck); research UI (browse-only); reconciliation (drop checkpoints) |
| **INVESTIGATE (interview)** | News page; intel routing panels; world/thesis monitor revival; research-workspace pipeline; TradingView drawings sync; `/admin/triage` rules |
| **KILL** | Thesis triage as implemented; FRED table subsystem; analyst actions/price targets; in-app research AI workflow remnants (~18 routes + archive components + ai_prompts); 16 empty tables; ~43 dead scripts; reconciliation checkpoints |

**Not in scope to cut:** the new feature work agreed earlier — per-thesis strategy performance & all-levels retrospective attribution (needs realized PnL plumbing; `strategy_metrics_snapshots` is maintained daily by the flex pipeline, 8.2K rows, but carries unrealized-only — see memory/earlier session notes).

---

## 16. Phase 1 interview agenda

1. **The cliff** — deliberate, friction, or circumstance? (frames everything)
2. **Daily loop** — walk me through yesterday: what did you open, in app or via Claude? Is "Claude as interface, app as dashboard" the v2 architecture?
3. **Thesis cull** — go/no-go list over the 38 macro + 64 asset theses (can be done async as a checklist I generate)
4. **Claims** — did linked claims ever change a decision? Pick the v2 curation model (full-auto / batch-Claude / match-only)
5. **Signals** — which signal ever earned its keep? Target count per thesis; alerts vs dashboards
6. **Triage** — which alert reasons have made you act; define "urgent" you'd actually want pushed to you
7. **Monitors** — World/Thesis Monitor: revive or delete? News page: read or skip?
8. **Pipeline** — stage-gates: keep, fold into thesis lifecycle, or drop?
9. **Attribution rule** — multi-macro-linked asset theses: split, full-credit, or primary-link for P&L rollup?
10. **Tax/reconciliation** — March pain points; checkpoints confirm-kill
11. **Journaling** — would a zero-friction (Claude skill) reflection habit get used?
12. **Anything you miss** that the data can't show — features you *want* that never existed (beyond performance attribution)
