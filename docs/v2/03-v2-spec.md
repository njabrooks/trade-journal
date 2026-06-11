# Trade Journal v2 — Product Spec & Build Plan

**Date:** 2026-06-11
**Inputs:** [00-feature-inventory.md](00-feature-inventory.md) (evidence) · [01-interview-decisions.md](01-interview-decisions.md) (decisions D1–D13)
**Governing principle:** the system — with Claude inside — does the curating, relating, and reviewing; Nick only touches genuine decisions. Every feature must answer *"who does the recurring work?"* with *"the system."* The product bar: **enabling action** (D13).

---

## 1. What v2 is

A focused daily decision-support system with three jobs:

1. **Know where you stand** — portfolio NAV/exposure through multiple lenses, and historical performance attributed up the belief hierarchy (position → strategy → asset thesis → macro thesis).
2. **Find the next action** — the options scanner, grown into a portfolio-aware advisor that proposes hedges, income structures, pullback entries, and opportunistic trades against the live book (D11).
3. **Keep beliefs honest, automatically** — a lean thesis layer maintained by Claude jobs: anticipatory research relating (Tana-aware), periodic thesis reviews producing decision-only digests, few hand-picked signals evaluated on change, and automated retrospectives when strategies/theses close.

Explicitly not v2: review queues, curation inboxes, scheduled briefing pages, manual journaling habits, in-app research processing.

## 2. Architecture: split by job (D1)

| Layer | Owns | Notes |
|---|---|---|
| **Web app** | Glanceable monitoring: morning screen, performance, scanner+advisor results, thesis/strategy reference pages, tax (seasonal), admin | Server components + existing recharts patterns; pages that exist to *do work in* are removed |
| **Claude layer** | Everything that writes or thinks: research relating, thesis review, advisor generation, briefings on demand, retrospectives, deep dives | Skills + scheduled jobs; outputs land as journal entries / DB rows the web app displays |
| **Data & automation** | Ingestion (unchanged, all healthy), derived computation, realized-PnL engine (new) | GH Actions + launchd as today |

## 3. Web app v2 — information architecture

### Morning screen (new home, replaces `/dashboard/portfolio` as `/`)
- NAV + exposure metric row; **lens switcher**: account / owner / strategy / underlying / unrealized P&L (D12). Most lenses exist in the current portfolio page — this is a reorganisation, not a rebuild.
- Scanner today: top hits + advisor recommendations (D11).
- Performance snapshot (links into the performance section).
- **"Needs decision" strip** — the only inbox-like element in v2: items emitted by Claude review jobs, hard-capped, each one a genuine decision (replaces both triage systems).

### Performance (new section — the anchor feature, D8)
- Per-asset-thesis: stacked per-strategy P&L over time (realized + unrealized once W4 lands; unrealized-only clearly labelled until then).
- Per-macro-thesis: full-credit exposure rollup of linked asset theses (double-counting disclosed).
- Drill-down: macro → asset → strategy → position. Retrospective cards for completed/rejected theses ("was I right, did it pay").

### Kept pages (mostly as-is)
`/strategies` + detail · `/asset-theses`, `/macro-theses` + details (Overview/Journal tabs; Triage tab removed; signals shown compactly; Intel panel pending audit) · `/journal` · `/claims` (read-only browse; absorbs anything worth keeping from `/research`) · `/vol-curve` + scanner pages · `/dashboard/accounting*` (NAV tracker, reconciliation minus checkpoints, transactions) · `/admin`: ingestion, accounts, strategy-types, recompute, processes.

### Killed pages
`/news` + subpages · `/triage` · per-entity Triage tabs · `/research/upload` (+ `/research` if `/claims` absorbs browse) · `/admin/prompts` · `/admin/triage` (rules; half-built) · `/signals/data-sources` (page; registry table stays for the configure-signal path while signals exist).

## 4. Claude layer — the jobs

| Job | Cadence | Replaces | Sketch |
|---|---|---|---|
| **relate-research** | Scheduled (e.g. daily) | Unconditional claim auto-promotion + manual curation (D2) | Reads new Tana content against active theses; links genuinely relevant evidence; emits digest. Trade Journal stores only thesis-linked evidence references; Tana keeps the corpus. Requires coordinated change in notes repo (`tana-content-ingest.py` stops blanket promotion). |
| **thesis-review** | Periodic (monthly per thesis, configurable) + on-demand | thesis_triage (D5) | Reviews thesis vs new evidence, price action, signal states; evaluates the few signals (writes snapshot only on change, D3); flags stale theses; performs strategy-confirmation hygiene (D6 residue); outputs decision-only digest → "needs decision" strip + journal. **Provisional — build smallest version, validate.** |
| **options-advisor** | Post-scan daily + on-demand | (new, D11) | Portfolio + watchlist + vol profiles → scenario recommendations: hedge / income-on-holds / put-entry-on-pullback / opportunistic. Reuses chains+greeks, analyze-vol-curve, ibkr-quote for live pricing. Results stored, displayed on scanner page + morning screen. |
| **briefing** | On-demand only | World/Thesis Monitor (D4) | "What's happening vs my theses" from live data + web. No scheduled generation (token policy). |
| **retrospective** | Event-driven (strategy/thesis close) | (new, D10) | Final P&L, duration, what the journal trail shows, lessons → journal entry + performance section card. |
| Kept as-is | — | — | pull-portfolio, ibkr-quote, analyze-vol-curve, portfolio-and-options-mcp, deep-dive pipeline skills (D7), tax/accounting ops. |

## 5. Data layer changes

1. **Realized PnL engine (prerequisite for attribution):** per-strategy realized P&L — IBKR from `mtm_snapshots.realizedPnl` rollup; crypto via trade-pair matching (reuse accounting-engine lot logic). Add `realized_pnl` + `cumulative_pnl` to `strategy_metrics_snapshots`; backfill; maintain in the existing daily flex-pipeline recompute.
2. **Status enum cleanup:** re-status the 13 legacy-`active` theses during cull application; document `merged` as a legitimate terminal strategy status (data + `merged_into` already exist).
3. **Claims disposition:** one-off Claude pass over 1,153 draft claims — link the thesis-relevant minority, bulk-archive the rest (D2).
4. **Signals:** thin to the hand-picked set per monitoring thesis during cull application; change-only snapshot policy enforced by thesis-review job. Existing 45K snapshots kept (history), no compaction for now.
5. **Live-pricing overlay (D14):** portfolio valuation = authoritative quantity (latest Flex/exchange snapshot) × freshest available price. For equities: live spot via the existing priority chain (`data-priority.ts`: Yahoo → IBKR Gateway → Massive), fetched at view time or short-TTL cache (e.g. 15 min during market hours); options keep EOD marks with as-of labels (live option marks = refinement decision at build). Overlay computed at API/display time — never written back into `positions` snapshots (history stays clean). Freshness indicator on every valuation (extend the existing PriceFreshness pattern).
6. **Schema drops:** see manifest §6.

## 6. Deletion manifest (Phase 3, ultracode session — gated on explicit GO)

**Safety policy:** CSV-dump every dropped table to `archive/db-dumps/2026-06/` first; code deletion is plain git (recoverable); build + page-smoke after each tranche.

| Tranche | Items |
|---|---|
| **Tables — empty (16)** | fred_observations, fred_series_metadata, fred_threshold_breaches, thesis_fred_indicators, analyst_actions, analyst_price_targets, monitoring_specs, monitoring_events, decision_audit_log, daily_snapshots, asset_aliases, average_cost_positions, raw_flex_positions, raw_flex_trades, reconciliation_checkpoints, signal_data_tracking |
| **Tables — feature-killed (7)** | triage_records, thesis_triage_records, intelligence_reports, intelligence_items, research_hierarchy_recommendations, research_processing_runs, ai_prompts (dump first) |
| **Pages** | as §3 "Killed pages" |
| **API routes (~55–60)** | All `/api/triage/*`, `/api/thesis-triage/*`, `/api/recompute/triage`; ~18 dead `/api/research/*` (keep: claims/with-sources, claims/update-status, claims/link-to-entities, artifacts list/read); `/api/prompts/*`, `/api/ai-models`; `/api/intelligence/*`; `/api/news/feed`, `/api/calendar/*` (feed routes only — calendar *ingestion* stays as advisor/review context), `/api/filings`; verified no-caller strays (`/api/signals/strategy`, `/api/strategies/debug-status`, `/api/theses/[id]/news` (broken — references nonexistent table), etc.). Each re-verified for callers at delete time. |
| **Components** | `src/components/research/archive/*` (11); triage suite incl. TriageActionButtons (1,963 lines) + UnifiedTriageBrowser; news/intel-feed components; prompts admin UI |
| **Derived/lib** | `src/lib/derived/triage.ts` (1,259), `thesisTriage.ts` (550); world-monitor parser/ingest path |
| **Scripts (~47)** | 22 one-off backfill/fix/migrate; 12 test-debug/validate; 9 upload-*-audit one-offs; ingest-world-monitor.ts, ingest-fred-historical.ts; triage ops (cleanup-triage-bugs, generate-lifecycle-triage, recalculate-thesis-triage, run-thesis-triage-computation) |
| **Workflows** | None deleted (all 17 are live ingestion). evaluate-intel-items continues pending audit. |
| **Cross-repo flag** | notes repo: `tana-content-ingest.py` stops unconditional investment-claim promotion (coordinate with W8). |
| **Confirm-kill** | TradingView drawings sync (`sync-tv-drawings.ts`, strategy_price snapshots dead since Apr) — confirm before including. |

Thesis cull application (kills/merges/re-statusing from [02-thesis-cull-checklist.md](02-thesis-cull-checklist.md)) runs as its own tranche whenever the checklist comes back — not a blocker for the code prune.

## 7. Build sequence

| # | Workstream | Size | Depends on |
|---|---|---|---|
| W0 | Ops: fix Solana ingestion; accounting catch-up Mar→Jun + reconcile | S + M | — (immediately, separate sessions) |
| W1 | **Prune sweep** (manifest §6) | L (ultracode session) | GO from Nick |
| W2 | Regenerate CLAUDE.md + docs from post-prune reality | S | W1 |
| W3 | Test harness: vitest + golden tests on money-math (S104, lot matching, average cost) — protects W4 | M | W1 |
| W4 | **Realized PnL engine** + attribution rollups (backend) | L | W3 ideally |
| W5 | **Performance section** UI + thesis-page performance, retrospective cards | M | W4 (partial earlier, unrealized-only) |
| W6 | **Morning screen** (lens switcher, decisions strip, scanner/advisor module) + **live-pricing overlay (D14)** — overlay is pull-forward-able as a standalone early win | M | W1 |
| W7 | **Options advisor** (D11) — skill first, then scanner-page surfacing; iterate scenario by scenario starting with hedges | L | — (parallel-friendly) |
| W8 | **Claude maintenance loop**: relate-research + thesis-review + retrospective jobs; notes-repo promotion change; claims disposition | M/L | W1 |
| W9 | Intel router quality audit → keep/kill | S | anytime |

Sizes: S = part-session, M = a session, L = multi-session. Recommended order: W0 → W1 → W2/W3 → W4 → W5/W6 → W7/W8 → W9, with W7 startable anytime appetite strikes.

## 8. Non-goals / deliberate deferrals

- No rebuild, no framework migration.
- No auth work (personal tool on own hardware — documented choice, revisit only if deployed off-box).
- No broad test-coverage targets beyond money-math + new attribution logic.
- No signal-snapshot history compaction; no `abs_notional` legacy-field removal until a natural schema migration moment.
- Effort policy per memory: default high; xhigh for W4; ultracode rented for W1 only; `/code-review ultra` after W4.
