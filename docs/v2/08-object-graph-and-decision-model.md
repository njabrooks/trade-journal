# Trade Journal v2 — Object Relationship Graph & Decision Model (handoff + design backbone)

**Date:** 2026-06-19
**Status:** handoff for the next design phase. Captures what v2 has shipped and the
design problem that remains: making the **object relationship graph** first-class and
replacing the thin `decision_required` strip with a real **Decision Item** model.
**Builds on:** [03-v2-spec.md](03-v2-spec.md), [07-belief-maintenance-loop.md](07-belief-maintenance-loop.md).

---

## 1. The core idea

Claims/signals propagation and the user↔agent maintenance loop can't be designed
cleanly unless the **object relationship graph is explicit and first-class**:

```
Position / Trade
  → Strategy
    → Asset Thesis
      → Macro Thesis(es)        (many-to-many)

Claim   → Asset Thesis | Macro Thesis
Signal  → Asset Thesis | Macro Thesis | (sometimes) Strategy   (via signal_entity_links)
```

The graph is **allowed to be incomplete, provisional, and repaired over time** — that
is the reality of investing:
- sometimes the **trade comes first** and the belief catches up (position→backfill);
- sometimes the **belief sits for months** before any expression;
- sometimes **research creates a thesis candidate** with no position.

The system should not panic about an incomplete graph; it should **notice the shape and
route the right work** — automate the mechanical/high-confidence edges, and turn genuine
ambiguity into decisions the user resolves *with an agent*.

---

## 2. What v2 has shipped (DONE)

**Foundation (W1–W7):** prune sweep; docs regen; vitest golden money-math; realized-PnL
engine + attribution; `/performance` UI; morning-screen dashboard + live-pricing overlay;
portfolio-aware options advisor. (See [03-v2-spec.md](03-v2-spec.md) roadmap table.)

**W8 belief-maintenance loop — B0–B7 complete & on `main`** (see [07](07-belief-maintenance-loop.md)):
- **Expression-driven status cascade** (`src/lib/derived/thesisCascade.ts`) — **LIVE** (default-on; kill-switch `THESIS_CASCADE_ENABLED=0`). Strategy status → asset status → macro status, every ingestion.
- **`closed` thesis status**; promotion decoupled from signals (`insert-thesis-articulation` no longer changes status).
- **`/thesis-review` skill, five modes**, each = pure rule (unit-tested) + deterministic detector/worklist + writer:
  - digest refresh (B4) · signal derivation (B5b) · health pass (B5c) · research-gap bridge (B6) · retrospective on close (B7).
- Worklists: `find-stale-digests`, `find-signalless-theses`, `find-theses-due-health`, `find-research-gaps`, `find-theses-needing-retrospective`.

**Strategy→thesis auto-link + hygiene (this session)** — `src/lib/derived/strategyThesisLink.ts`,
wired into the recompute before the cascade: every active strategy resolves its canonical
underlying (via `parent_underlying_id`, e.g. IBIT→BTC) and links to a thesis, creates a
placeholder (`developing`), or flags an unresolvable proxy. `flag-corrupted-strategies.ts`
rejects junk (homoglyph tickers, unresolved `@nnn` HL ids).

**relate-research (W8/D2, shipped)** — claim→thesis is agent-judged: high-confidence links
auto-applied; refuting/ambiguous become decisions.

**DecisionStrip (current, thin)** — `decision_required` journal entries surfaced at
`/api/dashboard/decisions` (hard-capped 5, newest first; PATCH to dismiss/resolve).

---

## 3. Current state of each graph edge

| Edge | Today | Creation method |
|---|---|---|
| Position/Trade → Strategy | automated (ingestion derives strategy keys; links by conid/symbol/expiry/account/key, merge chains; creates draft strategies) | **deterministic** |
| Strategy → Asset Thesis (same canonical underlying) | automated (sweep; parent-chain resolution) | **deterministic** |
| Strategy → placeholder Asset Thesis (live exposure, no thesis) | automated (placeholder `developing`, marked thin) | **deterministic** |
| Asset Thesis status (from active linked strategies) | automated (cascade) | **deterministic** |
| Macro Thesis status (from linked monitoring asset theses) | automated (cascade) | **deterministic** |
| Asset Thesis → Macro Thesis(es) | **manual/agent** (junction supports `related`/`gated_by`; framing is judgment) | **agent-suggested / user-confirmed** |
| Claim → Thesis | agent-judged relevance; clear links auto, else decision | **agent-suggested → auto on high confidence** |
| Signal → Thesis | auto-derived from articulation once enough claims (via `signal_entity_links`) | **automatic** |
| Gap detection (thin thesis, signalless, research gap) | automated | **automatic** |

---

## 4. The automation boundary

**Automate when the evidence is structural or mechanically obvious:**
- Position/trade → strategy (deterministic).
- Strategy → existing asset thesis for the same canonical underlying (deterministic).
- Strategy → placeholder asset thesis when live exposure exists and none does (deterministic; mark thin/developing).
- Asset thesis status from active linked strategies; macro status from linked monitoring asset theses (deterministic cascade).
- Claim → thesis link **after** agent relevance judgment at high confidence (auto-apply).
- Signal generation from a monitoring thesis's claims/articulation (automatic).
- Gap detection (automatic).

**Keep agent/user-mediated — these become *decision packets*, not silent automation:**
- Is this live strategy tactical, a hedge, or thesis-backed?
- Which economic underlying does this proxy/option/ETF really express? (e.g. PURR→HYPE)
- Should a placeholder thesis be developed, merged, or rejected?
- Which macro thesis genuinely frames an asset thesis?
- Is a macro link merely `related`, or is the asset thesis actually `gated_by` it?
- Does a cluster of unlinked claims deserve a new thesis?
- Should a research gap trigger source capture, a lightweight agent pass, or a full deep dive?
- Has refuting evidence changed the thesis or just complicated it?
- Should a weakening signal lead to thesis revision, strategy action, or no action?

**The boundary:** automate mechanics and high-confidence propagation; collaborate on meaning.

---

## 5. The missing primitive — a richer Decision Item model

Today `decision_required` is just a journal entry in the strip. Too thin. It should become
a **decision packet**:

```
decision_type          link_strategy_to_thesis | develop_thin_thesis |
                       resolve_proxy_underlying | review_refuting_claim |
                       run_deep_dive | frame_asset_under_macro | classify_macro_link |
                       cluster_claims_to_thesis | weakening_signal_action | ...
primary_object         strategy | thesis | claim | signal
related_objects        candidate links, claims, signals, positions
why_raised             concise rationale
recommended_actions    bounded options
agent_runbook          which skill/routine handles it (e.g. /thesis-review <mode>)
default_recommendation optional, with confidence
status                 active | resolved | dismissed | snoozed
resolution             what happened and why
```

**Interaction model:** the app stays simple — it shows the packet + reference data. The
*work* happens with an agent: "resolve this decision," "develop this thesis," "run deep
dive," "link these objects." The agent reads the packet, pulls DB/Tana context, proposes
the action, gets confirmation when needed, writes the changes, journals the outcome, and
resolves the item. This is the **recurring user↔agent decision/maintenance routine** that
turns the five `/thesis-review` modes + the auto-link flags into a steady cadence instead
of manual runs.

---

## 6. The three matrices to design (the deliverable)

A dedicated design pass should produce three matrices that form the formal contract for
*when the system acts, when the agent proposes, and how the user's decision is captured
back into the graph*.

**6a. Relationship Matrix** — for each edge:
source object · target object · allowed cardinality · creation method (deterministic /
agent-suggested / user-confirmed) · confidence threshold · what happens when missing ·
what happens when contradicted.

**6b. Workflow Matrix** — for each event:
trigger · automation response · agent response · user decision (if any) · resulting writes.
*Example:* `active strategy with no asset thesis` → resolve canonical underlying → link
existing thesis or create placeholder → if proxy ambiguous, raise decision → agent asks
user whether to map / link / create / reject.

**6c. Decision Taxonomy** — every `decision_type` and its expected action path:
relationship decisions · research-gap decisions · thesis-health decisions ·
claim/refutation decisions · strategy confirmation decisions · deep-dive escalation decisions.

---

## 7. Outstanding (the work queue)

1. **Decision Item model** — extend `decision_required` into the packet of §5 (schema +
   the `/api/dashboard/decisions` surface + a `resolve-decision` agent path). This is the
   product primitive everything else hangs off.
2. **The three matrices (§6)** — the formal contract. Write as the next v2 doc; several
   automations already exist, so this is mostly making the implicit explicit.
3. **Recurring decision/maintenance routine** — schedule the `/thesis-review` worklists to
   drain a few-per-run (token-aware; consider `sonnet` for derivation, Opus for judgment),
   emitting decision packets rather than silent writes. (Billed cloud routine — needs user go.)
4. **Asset→Macro framing automation** — agent-suggested `related` vs `gated_by` links, as
   decision packets (currently fully manual).
5. **Backlogs to drain** via the routine: ~30 signalless monitoring theses; ~16
   retrospectives; research-gap bridges (incl. the 6 new placeholders SOI/HLIT/NEAR/NBIS/VVV/MAX).
6. **B8** — notes-repo flip (relate-research becomes the live capture path).
7. **W9** — intel-router quality audit (routed-evidence `assessment` labels are inverted for
   invalidation signals; the health pass corrects them, but the source needs fixing).
8. **Thesis cull** — [02-thesis-cull-checklist.md](02-thesis-cull-checklist.md) still awaits markup; legacy `active`-status rows remain.

---

## 8. Why we're close

The database graph and several automations already exist (positions→strategies,
strategies→theses, the status cascade, claim→thesis judgment, signal derivation, gap
detection). What's missing is the **formal contract** (the matrices) and the **decision
packet** that captures the user's judgment back into the graph. Build those two and the
loop becomes a coherent, low-touch, self-repairing system rather than a set of scripts.
