# 21 — Radon Integration: Regime Sensing + Context-Aware Options Strategy Surface

**Status:** IN BUILD (2026-07-06) · **Phase 0 DONE** (IBC 3.24.1 + `local.ibc-gateway` live, read-only API verified, weekly-2FA rhythm active, gateway probe in check-cron-health) · **Phase 1 DONE** (regime_snapshots + ingest-regime-scan.ts + com.trade-journal.regime-scan launchd 07:40/15:10/21:10 + morning-brief regime section + dashboard RegimeStrip; smoke-tested live: CRI LOW 2.0, VCG NORMAL) · scanner smoke tests: CRI ✅ VCG ✅ LEAP ✅ (flagged GLXY Jan27 $30C, IV 94 vs HV20 113) · risk_reversal needs a market-hours retest (pre-market gave 0 quotes + read-only 321s on aux requests)
**Depends on:** W7 options-advisor (done), docs/v2/20 Lane A morning brief (done), IB Gateway revival (Phase 0 below)

## 1. Goal (user's words)

> "Whenever I log in, I want to be able to see a range of context-aware option strategies that could be applied to monitoring or developing theses or assets, including hedges, LEAPs, risk reversals and collars etc."

Two things fall out of this:

1. **New advisor scenarios** — the W7 advisor covers hedge / income / put_entry / opportunistic. Add **leap_entry**, **risk_reversal**, and **collar**, powered by radon's scanners, keyed to the active thesis set (monitoring AND developing — consistent with the loose-agent model, docs/v2/10).
2. **Always-fresh at login** — this resolves the W7 "post-scan scheduling deliberately on-demand pending user decision" item: the advisor becomes scheduled. Recommendations surface where they already surface (dashboard ScannerSnapshot by scenario, morning brief attention list) plus a SessionStart nudge when a fresh batch exists.

Plus a supporting layer: **regime sensing** (radon's CRI + VCG) that makes the hedge/collar scenarios *timely* — elevated crash-risk promotes protection scenarios instead of running them on a calendar.

## 2. What we verified about radon (2026-07-06 investigation)

Radon (`/Users/home-hub/projects/radon`) has been dormant since ~May 25. Key code-level findings (agent-verified, not from docs):

| Capability | IB-only? | Notes |
|---|---|---|
| `scripts/cri_scan.py` (crash-risk index) | **Yes (degraded is cosmetic)** | Core model fully parametric off VIX/VVIX/COR1M/SPY via IB + keyless Cboe COR1M endpoint. MenthorQ CTA data is a try/except HTML-report overlay only. UW is a fallback for SPY bars only. |
| `scripts/vcg_scan.py` (vol/credit gap) | **Yes** | IB primary, Yahoo keyless last resort. No MenthorQ dependency. |
| `scripts/leap_iv_scanner.py` | **Yes (IB-only by design)** | The UW twin `leap_scanner_uw.py` hard-requires UW_TOKEN — ignore it. |
| `scripts/risk_reversal.py` | **Yes** | Skew analysis via IBClient; flow enrichment degrades gracefully. |
| `scripts/scenario_analysis.py` | **Yes (no live data at all)** | Parametric stress/Monte-Carlo. Later candidate. |
| Dark-pool subsystem (`scanner.py`, `discover.py`, `fetch_flow.py`) | **No** | Hard-gated on Unusual Whales API. |

**Bitrot found:** all radon `config/*.plist` files reference the upstream author's paths (`/Users/joemccann/...`) — none were ever installed on this machine. We schedule everything from trade-journal's own launchd instead. Gateway plist also expects TWS 10.44; installed Gateway is 10.37 (fine, but note on upgrade).

## 3. Subscription verdicts (researched 2026-07-06)

- **MenthorQ ($129/mo): SKIP.** Dashboard-only (radon scrapes it with Playwright), CTA numbers are modelled trigger estimates not reported positioning, and — decisive — CRI doesn't need it (§2). If CTA positioning ever matters, Tier1Alpha via Hedgeye is the better read-only source.
- **Unusual Whales: DEFER.** The $48/mo web tier excludes the API; API Basic is ~$125–150/mo (REST, 120 req/min, dark pool prints + tagged flow + OI-change; has an MCP server). Only gates the dark-pool subsystem. Revisit via the ~$40–50 API trial only if `/thesis` grows an appetite for institutional-positioning evidence.
- **Check first:** we already pay Massive (Polygon rebrand) for chains — their stock **trades** feed includes raw TRF/dark-pool prints (`exchange: 4` + `trf_id`). If our tier includes trades, we have raw dark-pool data today; UW would only add the pre-tagged analytics.

## 4. Architecture

```
IB Gateway (weekly login, IBC-managed)          keyless: Cboe COR1M, Yahoo
        │                                                │
        ├── radon scanners (Python, subprocess --json, client_id 20-49)
        │     cri_scan · vcg_scan · leap_iv_scanner · risk_reversal
        │                                                │
        ▼                                                ▼
  trade-journal launchd wrappers (scripts/cron/*, log to cron-status.tsv)
        │
        ▼
  regime_snapshots table (new)          advisor_recommendations (existing)
        │                                     │
        ▼                                     ▼
  morning-brief bundle · dashboard regime strip · ScannerSnapshot scenarios
                                              │
                                              ▼
                            SessionStart nudge: "N fresh advisor recs"
```

Integration pattern: **subprocess, not port.** Radon scripts run as-is via radon's venv with `--json`, parsed by TS ingest wrappers (same pattern as `ibkr-option-quote.py`). Port to TS later only if a scanner earns it. Radon stays the owner of the scanner math; trade-journal owns scheduling, storage, thesis context, and judgment.

Storage: **DB, not radon's JSON files** — new `regime_snapshots` table (source: 'cri' | 'vcg', score, band, components JSONB, snapshot timestamp) per the compute-during-ingestion-and-store rule. Advisor outputs go through the existing `advisor_recommendations` batch/supersede path.

## 5. Phases

### Phase 0 — Gateway revival + weekly-login ops (blocks everything)
- IB Gateway 10.37 installed (`~/Applications/IB Gateway 10.37`, settings in `~/Jts`), last run May 8. No IBC installed; no launchd job has ever existed here (CLAUDE.md's `local.ibc-gateway` line described radon's upstream design — fix that doc line).
- Target UX: **log in once on Monday (2FA phone tap), connected all week.** Two options:
  - **A (no stored credentials):** launch Gateway manually Monday, enable Configuration → Lock and Exit → *Auto restart*. Gateway restarts itself daily without re-auth; IBKR's weekly auth reset means one manual username+password+2FA on Mondays. Zero new software.
  - **B (IBC, radon-style):** install IbcAlpha/IBC + our own launchd plist (Mon–Fri 00:00 + RunAtLoad). Monday becomes just the 2FA tap. **Trade-off: credentials sit in plaintext in `~/ibc/config.ini`** (file perms 600 on an always-on home box). — user call.
- Either way: health check (`nc localhost 4001`) added to `check-cron-health.ts` surface so a dead gateway is loud, not silent (lesson: thesis-observe auth outage 6/27–7/3).

**Security posture (user directive 2026-07-06: read-only, as safe as possible).** This gateway session exists to *fetch market data*, never to trade or move money. Layers:

1. **`ReadOnlyApi=yes`** (IBC config) — the TWS API rejects all order-routing calls for every client connecting through this gateway. Costs nothing: quotes, chains, greeks, historical bars, account/position reads all work. Radon's execution scripts (`ib_execute.py` etc.) simply won't function here — deliberate; we don't use them.
2. **Funds cannot move via the TWS API at all** — withdrawals/transfers only exist in Client Portal, which requires a fresh 2FA phone tap per login. Stored credentials alone cannot open a new session anywhere.
3. **File hardening** — `~/ibc` 700 / `config.ini` 600, outside all repo/sync/backup paths.
4. **Optional strongest layer (user action, Client Portal):** create a secondary username under Users & Access Rights with market-data/monitoring rights only and NO trading permission, and put *that* in `config.ini`. Then leaked credentials can't trade even through a misconfigured gateway. Caveat: market-data subscriptions are assigned per-username — the second user needs the relevant subscriptions enabled (possible small extra cost), and its own 2FA enrollment. Documented as available; not blocking Phase 0.

### Phase 1 — Regime feed (CRI + VCG)
- `scripts/cron/run-regime-scan.sh` → runs `cri_scan.py --json` + `vcg_scan.py --json` via radon venv; TS ingest script writes `regime_snapshots`.
- Cadence: CRI every 30 min sounds nice but 2–3×/day is enough for our use (pre-open London morning, US midday, post-close). Not a day-trading system.
- Consumers: morning-brief bundle gets a regime line (headline-eligible when band elevated); dashboard gets a small regime strip; hedge/collar advisor scenarios read latest snapshot for ranking/gating.

### Phase 2 — `leap_entry` advisor scenario (highest value) — **CODE COMPLETE 2026-07-06, market-hours validation pending**
- Ticker universe: **thesis-derived, not radon presets** — bullish monitoring + developing asset theses (and macro-linked underlyings where sensible), from the same loaders the advisor already uses.
- `leap_iv_scanner.py` on that list → candidates where HV20/HV60 ≥ IV + structural-vol persistence → engine filters (existing exposure? already expressed via a strategy? position sizing sanity) → `/options-advisor` judgment pass → `advisor_recommendations` scenario `leap_entry`.
- **Built:** `runLeapEntryScenario()` in `scripts/options-advisor.ts` (`--scenario leap_entry [--max-tickers 10]`): universe = bullish developing/monitoring asset theses with `underlyings.asset_class` STK/NULL (crypto/perp/futures excluded), ranked monitoring→confidence→held-exposure, capped (~1 min/ticker on IB, client_id 31); radon scanner subprocess writes `logs/advisor-leap-scan.{html,json}`; mispriced options → `long_leap_call` structures (top 4/name) with iv/hv-gaps/mispricingScore/vega/theta metrics + candidate-level HV + thesis. Skill doctrine added (thesis-expression-not-vol-arb, avgHvGap persistence check, existing-expression guard, delta guidance, liquidity floor); ScannerSnapshot labels + vol-gap headline. Plumbing validated end-to-end pre-market (TSLA/GLXY/RKLB scanned, 0 quotes pre-market as expected — the 09:15 smoke test's GLXY Jan27 $30C hit proves detection). **Remaining: first market-hours run (14:30+ London) + judged batch saved.**

### Phase 3 — `risk_reversal` + `collar` scenarios — **BUILT 2026-07-06 (TS engine, validated on live book data)**
- **Decision taken during build: both scenarios live in the TS engine off Massive chain snapshots** (screen-on-Massive / verify-on-IBKR architecture, §5b below); radon's `risk_reversal.py` kept as an on-demand single-name deep-dive; `/ibkr-quote` verifies chosen structures live before saving.
- `collar` — held longs ≥ floor: buy put + sell call same expiry (95/105, 90/110, 90/105 × 30/90 DTE); netCostPct (negative = credit), floor/cap, maxLoss/maxGain, callFundingRatio, runUpPct. Validated: 16 candidates incl. GLXY credit collar (which the skill doctrine excludes below mid-$40s per the standing constraint — engine emits math, judgment filters).
- `risk_reversal` — bullish-thesis names: sell ~25Δ put / buy ~25Δ call (60/120 DTE), delta-picked with strike fallback; netCostPct + skewEdgeVolPts (put IV − call IV). Validated: 22 candidates, e.g. SNDK +18.6 vol-pt skew. Undefined-risk doctrine: always flagged, collateral-led rationale, only names you'd own at the put strike.
- Fixed a latent engine bug found during validation: `process.exit(0)` truncated large piped JSON output (collar's 16 candidates); now exits in the stdout-drain callback.

### Phase 5b — data-source doctrine: screen on Massive, verify on IBKR
User question (2026-07-06): IBKR live data vs Massive EOD chains — which should the options skills use? Empirical harness built: `scripts/ops/compare-chain-sources.ts` (picks liquid ATM contracts from the latest Massive snapshot, quotes them live via `scripts/ibkr-quote-contracts.py` on client_id 32, reports mid-drift %, IV-drift vol-pts, and IB marketDataType). **First finding: IB serves marketDataType=1 — the account has real-time US options data, not 15-min delayed.** Pre-market probe saw 1.8 vol-pts weekend IV drift on GLXY. Full market-hours comparison pending (14:30+ London); doctrine stays screen-on-Massive (breadth + IV history) / verify-on-IBKR (point-in-time truth) unless the numbers say otherwise. Note: Massive snapshots dated on market holidays (e.g. 2026-07-03) carry no bid/ask — `mid()` falls back to `last`, and anything consuming snapshots must do the same.

### Phase 4 — Scheduling + login surface — **BUILT + LIVE 2026-07-06**
- Advisor scheduled (resolves the W7 pending decision): `scripts/cron/options-advisor-run.sh` (headless `/options-advisor`, all-Opus) under two launchd jobs — **08:05 wd batch** (six Massive scenarios, before the 08:45 brief) and **15:20 wd leap** (IB LEAP scan, market open, after the 15:10 regime scan). Cron-health cadences registered; morning chain README updated.
- Regime-aware ranking: ScannerSnapshot fetches `/api/dashboard/regime` and orders protection scenarios (hedge, collar) first when any non-stale band is above LOW/NORMAL.
- SessionStart nudge: `scripts/ops/advisor-nudge.ts` (one line, last-24h active recs, silent when nothing fresh) wired into `.claude/settings.json` hooks. Verified live: "🟢 4 fresh advisor recs (collar 2 · risk_reversal 2) → dashboard".
- `/gateway` skill + `scripts/ops/gateway.sh` (pause/resume/status) — frees the API username for manual Client Portal logins without credential-profile juggling (user request 2026-07-06; main-username credentials deliberately never stored).

### Phase 5 — Expression dialogue (stitch advisor into /thesis and /decisions) — **BUILT 2026-07-06**

Built: engine targeted mode `--underlying <ticker>` (all applicable scenarios + exposure/runUp/thesis/volContext/regime context in one JSON, ephemeral, leap excluded; validated on HOOD — 5 scenarios, 28 structures); `/thesis` Step 3b express/protect move (belief-leads-structure-follows discipline, live-verify, act→save-one-rec-batch→PATCH-acted for Lane C scoring); `/decisions` Step 3b expression follow-on (offered only when a resolution changes a belief, never for mechanical link/classify types). Doctrine stays solely in `/options-advisor`; both skills invoke, never re-derive.

Original design:

**The missing piece (user, 2026-07-06):** the decisions flow and the options advisor live apart. Whenever the user is *in dialogue about a thesis or a decision*, the agent should be able to present ways to **express or protect that specific belief, right there** — e.g. low-IV LEAPs to express a bullish developing thesis; or after a big run-up, "stay long but less bullish for 2–3 weeks" → sell an upside call to finance downside protection (tactical covered call / collar; see memory `tactical-covered-call-pattern` for the shape — illustrative, never auto-applied).

Build:
- **Engine: targeted single-name mode.** `scripts/options-advisor.ts --underlying <ticker>` runs all applicable scenarios for one name on demand (vs the nightly batch). Output shape identical; nothing stored unless the batch path stores it — dialogue runs are ephemeral until the user acts.
- **`/thesis <X>` gains an "express/protect" move** alongside query · re-underwrite · what's-changed: reads current expression state (strategy? unhedged? recent run-up from price_history), vol context (IV30 percentile, skew), fresh advisor recs for the underlying, regime snapshot — and discusses structures conversationally, sized against the book.
- **`/decisions` offers expression as a resolution follow-on:** when a decision packet touches a thesis (re-underwrite, direction flip, confidence change), the runbook's closing step asks whether to explore expression/protection for it, then hands off to the same engine call. A decision that *changes* a belief is exactly the moment its expression should be revisited.
- **Shared judgment doctrine** stays in the `/options-advisor` skill (one place for scenario philosophy + standing constraints like `glxy-no-hedge-below-mid40s`); `/thesis` and `/decisions` invoke it rather than duplicating rules.
- Record-action (Lane C, docs/v2/20) captures what the user actually did, so dialogue-served recommendations get outcome-scored like dashboard ones.

### Later / on demand
- `scenario_analysis.py` portfolio stress module; UW API trial + dark-pool evidence in `/thesis`; Massive trades-feed dark-pool check (§3); secondary read-only IBKR username (Phase 0 security layer 4).

## 6. Decisions

1. **Phase 0: Option B (IBC) — DECIDED 2026-07-06.** User accepts locally-stored credentials on the always-on home box, with maximum local hardening: `~/ibc/config.ini` owned by user, `chmod 600`, parent dir `700`, file excluded from any repo/backup sync paths. Monday = one 2FA phone tap.
2. Regime scan cadence: proposed 2–3×/day — pending user confirmation (default applied unless objected).
3. Risk-reversal recs (undefined risk) by default vs on-request — **open**, decide in Phase 3.

## 7. Surfacing contract (UX/UI)

User's requirement (2026-07-06): every feature built here must surface properly, through agent dialogue or the app — no insight may exist only as a table row or a JSON file. A phase is not DONE until its surfacing row below works end-to-end.

| Insight | App (trade-journal UI) | Agent dialogue | Push/ambient |
|---|---|---|---|
| Regime state (CRI/VCG band + delta) | Dashboard regime strip (compact, morning-screen top area) | `/morning-brief` regime line; `/thesis` + `/options-advisor` read latest snapshot as context | Morning brief headline eligibility when band elevated or band-change |
| Elevated crash-risk event (band change) | Regime strip highlights; hedge/collar scenario batches promoted in ScannerSnapshot ordering | Morning brief attention list (ranked ≤5) | SessionStart nudge line |
| leap_entry recommendations | Dashboard ScannerSnapshot scenario group (existing pattern) | `/options-advisor` full judgment dialogue; `/thesis <X>` mentions open recs for that thesis's underlying | Morning brief attention list when fresh batch lands |
| risk_reversal / collar recommendations | Same ScannerSnapshot groups, undefined-risk visibly flagged | Same as above | Same as above |
| Fresh-batch existence | Dashboard (already) | — | SessionStart nudge: "N fresh advisor recs across M scenarios" |
| Expression/protection for the thesis-in-dialogue (Phase 5) | — | `/thesis <X>` express/protect move; `/decisions` resolution follow-on; both via targeted `--underlying` engine runs | — |
| Gateway/scanner health | — | `check-cron-health.ts --nudge` failure streaks | SessionStart nudge + macOS notification (existing cron-health path) |

Design rule carried over from docs/v2/10: these are all *pull/ambient* surfaces — nothing here raises Decision packets; recommendations are advisory until the user acts (Lane C record-action captures what they did).
