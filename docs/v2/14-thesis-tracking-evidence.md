# 14 — Thesis-Observe: the tracking-evidence producer ("eyes & ears")

> **Status:** Phase 1 **BUILT + validated 2026-06-24** (§7); launchd activated. §§9–11 capture the
> **forward vision** agreed in the 2026-06-24 design conversation — the *self-improving loop* that is
> the real point of this whole subsystem. §§1–8 are the original design (still accurate). Author: design
> conversation w/ Claude. Anchored on the real `/thesis-monitor` report
> `notes/intelligence/20260406-1811-thesis-monitor.md` (11 theses / 30 signals) and the current pipeline
> map. Sibling docs: [07 belief-maintenance-loop](07-belief-maintenance-loop.md),
> [09 claim-signal-propagation](09-claim-signal-propagation-operating-model.md),
> [10 loose-agent underwriting model](10-thesis-underwriting-loose-agent-model.md),
> [12 W9 intel-router audit](12-w9-intel-router-audit.md).

## 1. Problem — the belief layer has no eyes and ears

The system has **two evidence pipelines**, and we only kept one running:

- **Thesis *development*** (Tana claims → `/relate-research` → `signal_data_snapshots` `data_source='research_routing'`) — **LIVE**. Builds/refines the *argument*. Episodic, deep, human-seeded.
- **Thesis *tracking*** (daily news + price swept and judged against the *active signal set*) — **DEAD**. Watches the *live* theses for what the world is doing to them. Continuous, current.

Modelled as **producer → aggregator → consumer**:

| Role | Component | Status |
|---|---|---|
| Producer — capture daily observations per signal | `thesis_monitor` (this doc revives it as **thesis-observe**) | **dead** (execution orphaned) |
| Producer — claims → signal evidence | relate-research | live, but *development*-shaped |
| Aggregator — roll the day's obs into one verdict/signal | `synthesize-signal-day.ts` (`daily_synthesis`) | live nightly — but garbage-in |
| Consumer — verdict + raise decisions | `/thesis-review` health + `/maintenance` | live |

The hole is the **daily-tracking producer**. With it dead, `daily_synthesis` aggregates almost nothing ("No observations — neutral by default"), and the health pass consumes near-empty evidence and rubber-stamps "neutral." **The 2026-06-24 health pass — 26 theses, ~all neutral — was the symptom.** (In fact the *entire* collection layer — the qualitative monitor **and** every quantitative collector — went dark together on **2026-04-06**; the belief layer has been ~blind for ~2.5 months. See §8.) The Bearish-Oil miss (oil fell to ~$71 on the US-Iran MOU / Hormuz reopening; our read said $88.67/offside) is the canonical example: a live thesis's defining event happened and nothing saw it.

**What this delivers:** the model's *eyes and ears* on the outside world's bearing on the thesis operating model — turning external events into scored, sourced, per-signal evidence the belief loop already knows how to consume.

## 2. What we already had (the quality bar)

`/thesis-monitor` did exactly this and did it well. It pulled the active thesis/signal set from the DB, swept news + price + FRED, and per signal wrote a `Score` + evidence + assessment + **change-from-prior**, which `ingest-world-monitor.ts` parsed into `signal_data_snapshots` (`data_source='thesis_monitor'`) and journaled the non-neutral ones as `signal_evidence_received`.

**The capability that matters — discriminating relevance.** On 2026-04-06 the IRGC "annihilate Gulf AI data centers" story hit, and the monitor scored it *differently across six signals by actual bearing*: irrelevant to GLXY-Helios (West Texas), an *indirect* scenario-risk to GLXY-CoreWeave (via OpenAI concentration), "geopolitical not demand" for TSMC, capex-redistributive-not-reductive for hyperscalers. That judgment — **does this event move *this* signal?** — is the whole point, and the opposite of keyword routing.

It also: handled **thesis-centric polarity** correctly (Hormuz invalidation → "weakening = invalidation risk receding, *good for the bearish thesis*"); **deferred quantitative signals** to their collectors ("neutral per data-driven signal rules"); cited **source URLs**; and surfaced each signal's **`Signal ID`** in the directive (so ingest can key off the ID, not fuzzy text).

**Why it died:** not the v2 prune (the ingest was rewired to `intel_items` and still works) — it ran as a **Paperclip "Research Analyst" scheduled task, and that agent has no execution anymore.** The skill is intact on disk; it lost its host.

**Relation to W9:** W9 killed `evaluate.ts` — the *heuristic, keyword-scored auto-router* that produced 82% noise. thesis-observe is the **opposite**: Claude-judged, directive, reviewed-by-construction. It is compatible with — indeed embodies — the W9 lesson ("Claude judgment, not heuristics; no unreviewed queues").

### 2.1 What the orphaned `intelligence_routing` data confirms (inspected 2026-06-24)
The 36,805 legacy snapshots from the killed router are a clean **negative control**: **34,233 neutral / 2,572 "strengthening" / 0 weakening / 0 invalidated** across 550 signals. A monitoring engine that **structurally cannot detect a thesis weakening** is worthless — and the 7% "strengthening" is mostly **event-type mislabels**: it scored `US Initial Jobless Claims` (a scheduled date, no result), `TSLA Q2 2026 Earnings` (a future date), `GLXY Form 4 / 144`, and an explicit **`GLXY insider sell`** as *strengthening* for the bullish theses. Same era, same inputs as the good thesis-monitor reports — which correctly judged the IRGC story's differential bearing — yet wildly worse, because it **heuristically routed** instead of **judging**. Two design laws fall out:
- **Event-type items (calendars, filings, insider txns) get judgment, not auto-scoring.** "An earnings date is scheduled" / "an insider sold" is *context*, neutral until there's a directional result — an insider *sale* is certainly not bullish.
- **Keep the source channels distinct.** Part of the failure was merging everything (research claims + world-monitor + calendars + filings) into one firehose. Research claims already have their judged path (relate-research); observe owns news/events; do not re-merge them.

The data is **pure noise and safe to archive** (§8).

## 3. The design — the thesis-observe producer

### 3.1 Role & boundaries — *sensing, not deciding*
thesis-observe **captures and scores** the day's external evidence per active signal, writes snapshots, and journals evidence. It **does not raise decisions** — that stays with the consumer (`/thesis-review` health + `/maintenance`). This preserves the v2 law: decisions are deliberate, no unreviewed queues. The observer *enriches the evidence stream*; the health loop *turns accumulated weakening into a decision*. (Optional severity-escalation hook — §3.5.)

### 3.2 Inputs
1. **The active set** — monitoring theses + their `active` signals, with tickers/sectors. Reuse the health context loader (`find-theses-due-health.ts --context`) which already returns `{thesis, signals[], recentEvidence[]}`. Scoped/paced by tier (§3.6).
2. **News** — targeted external research. Default: **Claude WebSearch per thesis/signal theme** (no feed infra to maintain). Optional upstream: a general feed sweep (`fetch-feeds`, if revived) or `/world-monitor` for ambient context.
3. **Price** — freshest available spot per underlying (the W6 `livePrices.ts` overlay) + strategy price-targets + macro data points. Existing ingestion is the baseline (§4).
4. **Prior state** — the latest snapshot per signal (`recentEvidence`) to compute **change-from-prior** (the time-series delta).

### 3.3 Per-signal judgment (the core loop)
For each active signal: read its **statement** (not configured keywords — ~67% now have `NULL explicit_details`), judge whether the gathered evidence *actually bears on it*, and emit:
- **Score** — `neutral | strengthening | weakening | confirmed | invalidated`, **thesis-centric** (strengthening = thesis stronger; for invalidation signals, "weakening" = invalidation risk growing). See [09](09-claim-signal-propagation-operating-model.md) + the `signal-assessment-polarity` rule.
- **Evidence** — the specific items + source URLs (or honest "No direct evidence this period").
- **Assessment** — the reasoning, incl. *why* an event does/doesn't bear (the discrimination).
- **Change from prior** — delta vs the last snapshot.

**Quality rules (from the old skill, keep them):** non-neutral **requires direct evidence** (thematic adjacency → neutral with a note); **event-type items judged, never auto-scored** (§2.1); **defer quantitative signals** to `collect-signal-data.ts`; **never invent**; be sparing with non-neutral.

### 3.4 Output (directive) + ingest contract
Emit the same **directive report** shape `ingest-world-monitor.ts` already parses — per signal: `Signal ID`, `Score`, `Evidence`, `Assessment`, `Change from prior` — plus the ambient layers: **PRICE & DATA WATCH** (spot/Δ, strategy targets, macro thresholds), **THESIS-RELEVANT NEWS** (items that bear on a thesis but no specific signal — ambient awareness / candidate new signals), **SIGNAL WATCH SUMMARY**. Ingest → `signal_data_snapshots` (`data_source='thesis_observe'`, §5) + journal non-neutral as `signal_evidence_received`. Ingest keys off `Signal ID`.

### 3.5 How it slots into the loop
```
thesis-observe (tiered)  ──writes──▶  signal_data_snapshots (data_source='thesis_observe')
        │                                   │
        │                                   ▼
        │                          synthesize-signal-day (nightly aggregate → 'daily_synthesis')
        │                                   │
        ▼                                   ▼
  journal: signal_evidence_received   /thesis-review health + /maintenance (verdict + RAISE DECISION)
```
The observer is **sensing**; the health/maintenance loop is **deciding**. Optional **severity-escalation hook**: a `confirmed`/`invalidated` (hard) score may flag the thesis for an *immediate* health look rather than waiting for the next scheduled consume — without itself raising the decision.

### 3.6 Tiered cadence (cost control)
Not every thesis deserves the same attention; observation frequency should track **materiality**. Classify the active set into **tiers (1/2/3)** and observe at tiered cadence:
- **Tier driver:** derive from **portfolio materiality** — the notional / NAV-weight of the thesis's active strategies (roll `positions.market_value_usd` to the thesis), with a manual override. Conviction/confidence is a secondary input.
- **Frequency:** e.g. **Tier 1** (largest / highest-conviction) **daily**; **Tier 2** every **2–3 days**; **Tier 3 weekly**. Tunable.
- This sets a per-thesis **floor interval** that meshes with the health pass's existing due-logic, and bounds total daily cost to ≈ (Tier-1 set × full pass) rather than (all ~26 × full pass) every day. It is the primary lever on the recurring token cost of the whole producer.

## 4. Price-evidence — existing ingestion is the baseline; TradingView+CDP is the supplement
Decision (2026-06-24): **current ingestion is sufficient as the baseline** (IBKR Flex, Massive/Yahoo, crypto, exchange snapshots cover equities/ETFs/options/crypto/FX). We will **not** pre-build a new collector. Known residual gaps — **futures (CL/GC), private names (SpaceX), bonds** — are accepted for now (the CL/oil case is deferred and handled per-thesis when it matters).

**If/when a gap needs filling, the chosen path is TradingView via CDP**, reusing the existing CDP infra (`sync-tv-drawings.ts` already drives a TradingView chart over CDP; `lib/collectors/tradingview.ts` is a public-scanner starting point). Accepted tradeoff: CDP needs a persistent debug-Chrome session and is more fragile than an API — fine as an **on-demand supplement, not the baseline**. (The IBKR-gateway option is shelved.)

Either way, the observe producer + health context should read the **freshest** available price (the W6 `livePrices.ts` overlay) rather than the stored `underlyings.spot`.

## 5. Open design decisions (recommendations + 2026-06-24 calls)
| # | Decision | Resolution |
|---|---|---|
| 1 | Execution substrate | **launchd → `claude` → skill** (proven by `/maintenance`); not Paperclip. |
| 2 | Distinct producer vs folded into `/maintenance` | **Distinct scheduled producer** (maintenance is the consumer/resolver; don't mix cadences). Shares the snapshot store. |
| 3 | Cadence | ✅ **Tiered** (§3.6) — Tier-1 daily, Tier-2 ~2–3d, Tier-3 weekly, driven by portfolio materiality. The cost lever. |
| 4 | Scope | **Active monitoring set + their signals**; tiered. Expand to developing later if useful. |
| 5 | News inputs | ✅ **WebSearch per thesis** (targeted, no feed infra). Verify `fetch-feeds` before relying on it. |
| 6 | Price | ✅ **Existing ingestion = baseline; TradingView+CDP = supplement-if-needed** (§4). No new collector now. |
| 7 | Quantitative integration | Keep observe **qualitative**; revive `collect-signal-data.ts` collectors **separately** (don't double-count). |
| 8 | `data_source` label | **New `'thesis_observe'`** (distinct from legacy `thesis_monitor`/`intelligence_routing`) for clean provenance. |
| 9 | Decision boundary | Observer **never raises decisions**; optional severity-escalation flag only. |

## 6. Non-goals
- ❌ Resurrect the heuristic/keyword auto-router (W9) — Claude-judged + directive only.
- ❌ Auto-score event-type items (calendars/filings/insider) — judgment only (§2.1).
- ❌ Any unreviewed queue / auto-status-change — observer writes evidence, not decisions.
- ❌ Reinstate Paperclip execution.
- ❌ A general news digest as an end in itself — `/world-monitor` stays optional/separate context.

## 7. Phased build
- **Phase 1 — observe MVP. ✅ DONE 2026-06-24.** WebSearch-per-active-thesis → directive output → reuse `ingest-world-monitor.ts` → `signal_data_snapshots` (`thesis_observe`) → **tiered** launchd schedule (§3.6; Tier-1 only). Shipped: `scripts/ops/find-theses-due-observe.ts` (materiality→tier→bundle), `.claude/skills/thesis-observe/`, `ingest-world-monitor.ts` (Signal-ID-keyed, scoped to reported signals, `data_source='thesis_observe'`), launchd `thesis-observe`@07:00 + `collect-signal-data`@06:30 (collectors re-homed, deterministic). Validated one real Tier-1 run vs the 2026-04-06 bar (37 snapshots, 11 journals, polarity correct). Fixed two latent bugs (`emitIntelItems` rowCount→`.returning()`; `parseScoreLabels`→`parseSignalScores`). Commit `7d3a8b1`.
- **Phase 2 — ambient + escalation.** PRICE & DATA WATCH (off existing ingestion / `livePrices.ts`), THESIS-RELEVANT NEWS, severity-escalation hook.
- **Phase 3 — as-needed supplements.** TradingView-CDP price collector *iff* a gap bites (§4); optional `/world-monitor` general-context upstream.
- **Prereq.** ✅ archived the legacy `intelligence_routing` snapshots (§8) so the stream was clean before observe started writing.

> **The forward roadmap is reframed in §§9–11.** The original Phase 2/3 above are now *tactical polish*; the strategic next thrust is the **self-improving loop** (§10), which is where the compounding value lives. §11 sequences everything by value.

## 8. Archive + verify (actioned 2026-06-24)
- ✅ **Archived + deleted the 36,805 legacy `intelligence_routing` snapshots** — dumped to `archive/db-dumps/2026-06/intelligence_routing_snapshots.csv` (9.2 MB, local, recoverable) then deleted; confirmed pure noise (§2.1). The evidence stream is now clean before observe starts writing.
- ✅ **`fetch-feeds` (440-feed) CLI exists** at `~/.local/bin/fetch-feeds` (in PATH; referenced by both monitor skills) — the feed-sweep input option is viable (not yet smoke-tested).
- ⚠️ **The whole collection layer died on 2026-04-06 — not just the monitor.** The post-archive `signal_data_snapshots` census shows `thesis_monitor` (qualitative) **and** every quantitative collector (`defillama_stablecoins`, `derived`, `fred:*`, `coingecko`, `hypeflows`, `tradingview_cdp`, `hormuz_strait`, `tsmc_revenue`, `sec_edgar_capex`, …) all frozen at `max(snapshot_date)=2026-04-06`. Only `daily_synthesis` (nightly aggregator, nothing to aggregate), `research_routing` (relate-research, trickle → 06-21), and `thesis_health` (this session) still write. The belief layer has been **~blind for ~2.5 months**, and `hormuz_strait` dying on 04-06 is *exactly* the other half of the oil miss. → Reframes decision #7: **reviving the quantitative collectors is co-equal urgency, not a Phase-2 nicety** (likely the same lost execution host as the monitors — Paperclip RA).
- ⬜ **(still open)** Token cost of WebSearch at the §2 depth under the tiered cadence (§3.6) — confirm the Tier-1 set size keeps daily cost acceptable; decide per-thesis vs per-signal granularity.

---

# Forward vision (2026-06-24 design conversation)

> §§9–11 record the direction we agreed *after* Phase 1 shipped. The north star: **observe exists so
> the user can act quickly and judiciously — stay, double down, take profit, or invalidate — with a
> clear understanding of *why* they're invested and *on what basis* to act.** Everything below serves
> that. Built incrementally, value-first (§11). Nothing here weakens the **sensing-not-deciding** law
> (§3.1): the loop improves the *signal set*; it never auto-decides a position.

## 9. The signal model — a *statement* (understanding) + an optional *sensor* (measurement)

The recurring "should we drop the quantitative layer and go all-qualitative?" question dissolves once
two things that were conflated are separated:

- **The statement** — the natural-language articulation of *what we're watching and why it matters to
  the thesis*. This is the **understanding**, and it is what the improvement loop (§10) sharpens.
  **Every signal has one — including the quantitative ones.**
- **The sensor** — an *optional* precise measurement (`explicit_details` → a `collect-signal-data`
  collector) bolted onto a statement that happens to have a clean, decision-grade number.

These are **orthogonal.** Keeping a collector does **not** lock a signal out of the improvement loop —
the loop runs on the *statement*; the collector just reads a number underneath. So the quant-vs-qual
choice shrinks to a narrow, almost mechanical question — *"is a precise sensor worth its maintenance
here?"* — fully decoupled from *"do I want this signal to keep getting sharper?"* (always yes).

**Keep a sensor only when the metric is all four of:**
1. **Decision-grade** — a threshold crossing would actually change the action (take profit / invalidate). A price target; a hard macro floor.
2. **Faithful, not a proxy** — the number measures the *actual* thesis condition, not a loosely-correlated stand-in. *Precision on a proxy is worse than judgment on the real thing.*
3. **Cheap & reliable** — a stable API, not a scraper that silently dies. (The whole layer dying for ~2.5 months is the real cost of a fragile collector.)
4. **Easily missed by judgment** — a crossing WebSearch wouldn't reliably surface on the exact day.

**Drop the sensor (go statement-only)** when the metric is a laggy proxy, when the *interpretation*
matters more than the number, or when the collector is fragile/high-maintenance.

**Do not go *all*-qualitative.** That would surrender the **unmissable trigger** — and threshold-crossing
detection is exactly the *take-profit / invalidate timing* use case that is the whole point. The move is
**shrink the sensor layer to the decision-grade triggers**, not delete it. Of the ~15 legacy sensors, the
expectation is a handful stay (price ladders; maybe M2 / supply floors) and the laggy proxies
(construction-spending, some SEC-derived series) become statement-only.

**The clean object model (a small tidy worth doing):** today the statement (`build-core-argument`) and
the sensor (`explicit_details`, the retired `/configure-signal` path) are bolted on *separately* and not
cleanly linked — re-underwriting regenerates statements while legacy collectors sit alongside. The
coherent model is **one signal = one iteratively-improved statement + an optional attached sensor.**
Make that linkage explicit and the rest of this doc becomes consistent.

**Don't decide the quant layer's fate by fiat — let the loop select it (§10).** As the loop converges the
signal set onto load-bearing assumptions, the surviving sensors will be exactly the ones it keeps
re-confirming as decision-grade; the proxies fall away because the loop flags them low-information
(chronic-neutral / surprise-prone).

## 10. From logger to learning loop — the self-improving cycle (the prize)

**Current status: observe is a *logger*, not a *learning loop*.** It produces evidence, but nothing yet
feeds *observation quality* back into *signal quality*. Re-underwriting (`build-core-argument`) today
triggers on **time/staleness**, not on what the observations are teaching us.

**The vision:** a reinforcing cycle where observations reveal where the signal *statements* are weak or
incomplete → re-underwriting sharpens them → better statements → better observations → … converging the
signal set onto the genuinely **load-bearing assumptions** of the thesis. Three mechanisms close the loop:

1. **Signal-quality diagnostics (the keystone).** Per signal, over its snapshot history:
   - **chronic-neutral rate** — observed N times, always `neutral` ⇒ the statement is untestable or
     irrelevant ⇒ flag for re-underwriting.
   - **surprise rate** — the thesis moved materially (price / news) and *no* signal flagged it ⇒ a
     **coverage gap** ⇒ flag for a new signal.
   These become re-underwrite triggers, *augmenting/replacing* pure time-based staleness. Cheap — it
   reads the snapshot history observe now produces (the engine of "learning from its own misses").
2. **Candidate-signal harvesting.** Observe already emits a *"THESIS-RELEVANT NEWS — bears on the thesis
   but matched no signal"* section. Those items are the system pointing at its own coverage holes. Today
   they sit in the report; route them into re-underwriting so the signal set **grows to cover what
   actually moves the thesis.** (Today's run flagged the $1.4T AI-ROI selloff as exactly such an
   un-signalled force on the hyperscaler thesis.)
3. **Observation-driven re-underwrite.** A pass *distinct* from the claim-driven one (docs/v2/10): after a
   thesis accumulates a window of observations, ask *"given what actually moved this thesis vs what our
   signals tracked, rewrite the resolution section."* **This is the loop made real** — observations, not
   just claims, sharpening the underwriting.

**Why this is the point — the decision tie-in.** Converging on load-bearing assumptions means that when
observe says **"weakening,"** it is weakening on something that *should* change conviction. That is what
makes [`/thesis`](10-thesis-underwriting-loose-agent-model.md) and `/decisions` genuinely useful: opening
a thesis would surface not just current scores but *"here's where our understanding has been thin (chronic
neutrals), here's what's been moving it that we never had a signal for, here's the case as it stands."*
That is "evolve a better understanding of the fundamental underpinnings" made operational — and it is the
basis on which the user **stays, doubles down, takes profit, or invalidates.**

**Guardrail.** The loop improves the **signal set** — mechanical statement/coverage maintenance runs
automatically; anything that is a genuine judgment (re-underwriting a live thesis, a status change) still
goes through the **decision packet** (docs/v2/09 §8, docs/v2/10). Sensing-not-deciding holds: observe and
its diagnostics never auto-act on a position.

## 11. Build priority (value-ordered — to refine at spec time)

| # | Work item | Why / value | Notes |
|---|---|---|---|
| **P0** | Phase 1 observe MVP + collector re-home | ✅ DONE 2026-06-24 — the stream is alive again | §7 |
| **P1** | **Signal-quality diagnostics** (§10.1) — chronic-neutral + surprise detection over snapshot history → re-underwrite-due triggers | **Keystone of the loop.** Cheap (reads existing history); turns the logger into a learning loop | Data-gated: needs a few weeks of observe history to chew on — *build now, let it accumulate*. Bundle the small "surface `explicit_details`/`collector_tracked` flag in `find-theses-due-observe`" hardening so deferral (§3.3) is deterministic, not inferred |
| **P2** | **Candidate-signal harvesting** (§10.2) — route observe's no-signal-matched items into re-underwrite input | Grows the signal set to cover what actually moves the thesis | Builds on the observe report's existing THESIS-RELEVANT NEWS section |
| **P3** | **Observation-driven re-underwrite** (§10.3) + clean **signal = statement + optional sensor** object model (§9) + **sensor triage** (prune laggy proxies) | Closes the loop; makes the quant layer self-selecting | Depends on P1 diagnostics existing |
| **P4** | Phase 2 ambient — **PRICE & DATA WATCH + `livePrices` overlay** (the stale-price/oil-miss fix), severity-escalation hook, Tier-2/3 cadence due-logic | Immediate accuracy from day one (not data-gated); fixes the canonical miss | Tactical polish vs the loop, but high standalone value — could run in parallel with P1 |
| **P5** | As-needed supplements — TradingView-CDP price collector iff a gap bites; optional `/world-monitor` upstream | Only when a specific gap actually bites (§4) | — |

**Sequencing nuance:** P1 is the strategic keystone but its *value* is data-gated (needs observe history).
P4 (price-watch) has immediate, ungated value. A sensible real order is **build P1 now so it starts
accumulating, do P4 in parallel for immediate accuracy, then P2 → P3 as the history matures.** Refine when
we spec each.
