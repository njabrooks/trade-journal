# Phase 1 Interview — Decision Record

**Date:** 2026-06-11
**Inputs:** [00-feature-inventory.md](00-feature-inventory.md) (evidence) + structured interview (12 questions, 3 rounds).
**Status:** Complete except: thesis cull (async via [02-thesis-cull-checklist.md](02-thesis-cull-checklist.md)), scanner wishlist, "morning screen" composition (asked in chat).

---

## The governing design principle for v2

> **The system generated work for the human. v2 inverts that: the system — with Claude inside it — does the curating, relating, and reviewing; the human only touches genuine decisions.**

Root-cause finding (Q1): the mid-April cliff was **friction**, with two distinct components:
1. **Too much being curated** — many curation surfaces (claims, signals, triage queues) existed because they could, not because each earned its upkeep.
2. **UX too heavy** — the web-UI click-through model demanded more effort than it returned. The organic shift to Claude skills + options scanner was the workaround: lower-friction ways of reading and updating the same database.

Secondary finding: the most-used features (portfolio tracking, options scanning) were *complete*, so commit volume falling is partly maturity, not just abandonment.

Every v2 feature must pass: **"who does the recurring work — the system or Nick?"** If the answer is Nick, the feature needs a rethink or a kill.

---

## Decisions by area

### D1. Interface architecture — SPLIT BY JOB
- **Web app** = glanceable monitoring surfaces: portfolio, scanner, performance/attribution, admin.
- **Claude** = everything that writes or thinks: research relation, curation, journaling, analysis, reviews, deep dives.
- Implication: web UI pages that exist to *do work in* (review queues, linking dialogs, upload forms) are candidates to delete even where the underlying capability survives via Claude.

### D2. Research → thesis interface — REDESIGN (own workstream)
- Tana/notes repo is **the** primary store of everything read. Trade Journal duplicating claim storage is a design flaw to remove.
- Replace the promote-everything-then-review model with an **anticipatory process**: a Claude-driven job that knows the current thesis set and what's being read, relates new material to theses/strategies itself, and surfaces a digest — not a queue.
- The 1,153-draft claim pile: disposition during cleanup (Claude pass: link the thesis-relevant minority, archive the rest). Stop unconditional auto-promotion.
- **Open design question for Phase 2:** exactly what lives in Trade Journal vs Tana (likely: Trade Journal stores only thesis-linked evidence references; Tana keeps the corpus).

### D3. Signals — CONCEPT KEPT, MACHINERY KILLED
- The logic ("what would change my beliefs") is sound and stays in v2's design.
- The implementation (572 generated, 93% rejected, 45K snapshots, daily no-change rows) is unmaintainable and dies.
- v2 shape: few hand-picked falsification criteria per monitoring thesis; evaluated automatically (or inside the periodic Claude review, see D5); recorded **on change only**; surfaced as alerts/digest items, with no expectation of dashboard browsing.

### D4. Intelligence briefings — ON-DEMAND ONLY
- Delete World/Thesis Monitor report ingestion + report pages (data already stopped Apr 6). Token-cost-conscious: no scheduled generation.
- "What's happening vs my theses" becomes an on-demand Claude request against live data + web.
- **/news page: KILL. Intel router (calendars/insider/SEC → thesis matching): KEEP PROVISIONALLY** — contingent on a quality audit (sample recent matches, judge usefulness, then keep or kill). Schedule the audit in Phase 3.

### D5. Thesis attention — KILL QUEUE, PROTOTYPE LEAN REVIEW
- thesis_triage as implemented: dead (10,424 unworked items; "decision paralysis... far too many decisions").
- The original *intent* stands: each prompt should be a genuine decision point.
- Replacement (explicitly provisional — "maybe... not 100% sure"): a **periodic Claude thesis review** that does the review work itself and outputs a short digest containing only items needing a decision. Build the smallest version, validate against real use before investing.

### D6. Position triage — KILL; SCANNER IS THE ALERT SYSTEM
- Honest verdict: position triage "doesn't produce anything that actually makes me act."
- What does drive action: **scanner insights** — IV characteristics on watched names that merit entering, closing, or hedging.
- Implications: retire the triage queue/page/records machinery (1,259-line rules engine included). Redirect alerting investment into the scanner (see open wishlist Q).
- Residue to preserve somewhere: strategy-confirmation hygiene (new auto-derived strategies need labelling or attribution breaks) — fold into the periodic review or a lightweight Claude prompt, not a queue.

### D7. Deep-dive pipeline — KEEP, STANDALONE & LOW-FRICTION
- The stage-gated playbook is "part of a legitimate workflow that would be really useful" for deep dives on a specific idea/asset class.
- Keep it as a standalone Claude-invoked workflow, decoupled from the heavier machinery. No runtime cost at rest.

### D8. Performance attribution — FULL CREDIT TO EACH MACRO
- Multi-macro-linked asset theses roll up at full P&L to every linked macro thesis.
- Macro-level numbers are **exposure views**, clearly labelled as such (double-counting accepted and disclosed).
- Unblocks the anchor feature; realized-PnL plumbing remains the prerequisite (see inventory §15).

### D9. Tax/accounting — KEEP; EPISODIC BY DESIGN; CATCH-UP OVERDUE
- Valued as the personal single source of truth for every accounting transaction across entities, feeding the tax accountant.
- Its rhythm is inherently episodic: update + reconcile + validate balances every so often. Not a defect.
- **Action item (near-term, independent of v2):** bring in all transactions Mar 4 → today and reconcile balances to the present.
- reconciliation_checkpoints feature (0 rows ever): delete.

### D10. Journal — AUTOMATED TRAIL + RESURFACING; NO MANUAL HABIT
- Manual reflection lost to friction; don't design around it returning.
- The automated trail "generates incredibly rich data" — the v2 job is **harvesting and resurfacing** it (retrospectives, periodic review digests, performance write-ups), all Claude-produced.

---

### D11. Scanner → portfolio-aware options advisor (the growth feature)
The scanner is the proven action-driver; v2 extends it from "find cheap options" to **proactive, portfolio- and watchlist-aware strategy recommendations** keyed to the current vol profile of held/watched instruments. Scenario classes:
1. **Hedge** — cheap downside protection for open positions
2. **Income on holds** — long-term holds that have run up: covered calls / call-selling structures to collect yield while staying in the trade
3. **Entry on pullback** — bullish names already up a lot: sell puts to collect yield or get assigned at favourable levels
4. **Opportunistic structures** — other smart entries/exits/income trades favourable relative to the existing book

Builds on what exists: options chains + greeks (Massive), `analyze-vol-curve` (strike optimization), `ibkr-quote` (live pricing), watchlist, positions. Delivery fits the split-by-job model: Claude generates recommendations (on-demand + post-scan), web scanner page displays them.

### D12. Morning screen (v2 web home)
- **Anchor:** NAV + exposure with switchable lenses — by account, by owner, by strategy, by underlying, by unrealized P&L.
- Scanner results / top options ideas (per D11).
- Strategy/thesis drill-down entry points.
- **Historical performance view** — the attribution feature (D8) surfaces here; explicitly noted as the thing v1 never built.
- Plus (design proposal): a small "needs decision" strip fed by the periodic Claude reviews (D5) — the only inbox-like element that survives, capped at genuinely decisional items.

### D13. North star
No other missing features identified. The bar for everything: **"enabling action that can be taken more easily by utilising the app."** Insight without an action path is out of scope.

### D14. Live pricing for IBKR positions (added post-interview, 2026-06-11)
Problem: IBKR ingestion is morning-only EOD, so intraday the portfolio shows yesterday's close for IBKR positions while crypto sources stay fresh. Decision: **split quantity from price**. Quantities remain authoritative from the morning Flex sync (intraday quantity changes explicitly not needed); valuation prices come from live sources at view time (existing priority chain: Yahoo → IBKR Gateway → Massive; TradingView/Google acceptable additions). Live underlying spot for equities first; option positions keep EOD marks with an explicit as-of label (live option marks = build-time refinement). Every portfolio value displays price freshness. Overlay at display/API time — never written back into position snapshots.

## Confirmed kill list additions (beyond inventory §15)

- /news page; World/Thesis Monitor ingestion + report pages (D4)
- Position triage queue + thesis triage entirely (D5, D6)
- Unconditional claim auto-promotion (D2)
- Signal snapshot machinery in current form (D3)
- reconciliation_checkpoints (D9)

## Carried open items

| Item | Owner / when |
|------|--------------|
| Thesis cull markup | Nick, async — [02-thesis-cull-checklist.md](02-thesis-cull-checklist.md) |
| ~~Scanner wishlist~~ | Answered → D11 |
| ~~Morning-screen composition~~ | Answered → D12 |
| ~~Missing features~~ | Answered → D13 (none beyond attribution) |
| Intel router quality audit | Phase 3 |
| TradingView drawings sync (strategy_price snapshots stopped Apr) | Confirm kill in Phase 2 |
| Accounting catch-up Mar→Jun + reconciliation | Near-term task, schedule independent of v2 |
| Solana ingestion flakiness (17 fails/30d) | Near-term fix |
