# Trade Journal v2 — Claim/Signal Propagation Operating Model (handoff + design backbone)

**Date:** 2026-06-19
**Status:** handoff — **delivered.** The design doc + implementation plan this seed calls for is now [09-claim-signal-propagation-operating-model.md](09-claim-signal-propagation-operating-model.md): the four matrices, the Decision Item schema, the order-independence playbook, and the C0–C8 build plan. This doc remains the backbone/rationale; **09 is the contract to build against.**
**Builds on:** [03-v2-spec.md](03-v2-spec.md), [07-belief-maintenance-loop.md](07-belief-maintenance-loop.md).

---

## 1. The core design problem: order independence

The system must treat the object relationship graph as **first-class**, and treat every
arrival order as a **valid state, not an exception**:

```
Position / Trade → Strategy → Asset Thesis → Macro Thesis(es)   (many-to-many)
Claim  → Asset Thesis | Macro Thesis
Signal → Asset Thesis | Macro Thesis | (sometimes) Strategy      (via signal_entity_links)
```

Valid, expected states the system must route work for (never panic over):
- Content can arrive **before** a thesis exists.
- A thesis can exist **before** a strategy exists.
- A strategy/position can exist **before** a thesis is refined (position→backfill).
- A macro thesis can exist **without** asset expressions.
- An asset thesis can be **live but thin**.
- Signals can exist **before** new evidence arrives, or need to be **derived after** a thesis becomes live.

The graph is allowed to be **incomplete, provisional, and repaired over time**. The job
is to **notice the shape and route the right work**: automate the mechanical/high-confidence
edges, escalate genuine ambiguity into decisions the user resolves *with an agent*.

---

## 2. What v2 has shipped (DONE, on `origin/main`)

**W1–W7:** prune; docs; vitest money-math; realized-PnL engine + attribution; `/performance`
UI; morning-screen dashboard + live-pricing overlay; portfolio-aware options advisor.

**W8 belief-maintenance loop B0–B7** (see [07](07-belief-maintenance-loop.md)):
- **Expression-driven status cascade** (`thesisCascade.ts`) — **LIVE** (kill-switch `THESIS_CASCADE_ENABLED=0`): strategy→asset→macro status, every ingestion.
- `closed` status; promotion decoupled from signals.
- **`/thesis-review` skill, five modes** (pure rule + detector/worklist + writer each): digest (B4), signal derivation (B5b), health pass (B5c), research-gap bridge (B6), retrospective (B7). Worklists: `find-stale-digests`, `find-signalless-theses`, `find-theses-due-health`, `find-research-gaps`, `find-theses-needing-retrospective`.

**Strategy→thesis auto-link + hygiene** (`strategyThesisLink.ts`, in the recompute before the
cascade): canonical-underlying resolution (IBIT→BTC), placeholder creation, proxy flag;
`flag-corrupted-strategies.ts` rejects junk. **relate-research** (claim→thesis, agent-judged).
**DecisionStrip** (current, thin): `decision_required` journal entries at `/api/dashboard/decisions`.

---

## 3. The eight things to design (the operating model)

### 3.1 Event taxonomy
The events that should trigger propagation:
`new Tana content` · `new claim extracted` · `claim linked` · `thesis created` ·
`strategy opened` · `strategy linked` · `thesis promoted to monitoring` ·
`signal evidence received` · `position closed` · `thesis thin/gap detected`.

### 3.2 Lifecycle rules (what each state means + allowed automation)
- `developing` → gets claims + digest refreshes (B4).
- `monitoring` → gets signal evidence + health checks (B5b/B5c).
- `closed` → gets a retrospective (B7).
- **no thesis but live position** → a **decision**: tactical exposure or thesis-backed belief?
  (Today: strategy auto-link creates a placeholder `developing` thesis by default; the
  tactical/hedge classification is the open decision.)

### 3.3 Propagation matrix (route each claim/evidence item by thesis state)
- **No relevant thesis** → leave in Tana; maybe cluster as a candidate.
- **Developing thesis** → promote/link the claim.
- **Monitoring thesis** → route as signal evidence.
- **Thin monitoring thesis** → trigger the research-gap bridge.
- **No thesis but live strategy** → raise "create thesis or mark tactical" decision.

### 3.4 Research-gap workflow (first-class)
Detect thin/gap live theses → **search Tana first** → if Tana has material, run claim/link
propagation → if Tana lacks material, propose sources or trigger deep research → after new
research lands, run digest + signal derivation. (B6 builds detection + the Tana-first bridge;
this formalizes the full cycle.)

### 3.5 Deep-dive integration (escalation, not default)
The governed research-pipeline CLI is an **escalation path**, not a replacement
for the lightweight propagation loop:
- use it when a gap is **important, ambiguous, or position-relevant**;
- let it **graduate** into thesis updates, claims, signals, or strategy expression;
- **do not** auto-launch deep research for every thin thesis.

### 3.6 Agent collaboration contract — the Decision Item model
Today `decision_required` is just a journal entry — too thin. It must become a **decision
packet**:
```
decision_type          link_strategy_to_thesis | develop_thin_thesis |
                       resolve_proxy_underlying | review_refuting_claim | run_deep_dive |
                       frame_asset_under_macro | classify_macro_link (related vs gated_by) |
                       cluster_claims_to_thesis | weakening_signal_action | ...
primary_object         strategy | thesis | claim | signal
related_objects        candidate links, claims, signals, positions
why_raised             concise rationale
evidence_context       source/provenance
recommended_actions    bounded options — one of: ask agent · run deep dive · capture sources ·
                       create thesis · dismiss as tactical · change/close position · link objects
agent_runbook          which skill/routine handles it (e.g. /thesis-review <mode>)
default_recommendation optional, with confidence
status                 active | resolved | dismissed | snoozed
resolution             what happened and why
```
The app shows the packet + reference data; the **work happens with an agent** (reads packet,
pulls DB/Tana context, proposes, confirms when needed, writes, journals, resolves).

### 3.7 Scheduled routines (cadence + cursors)
- Tana claim extraction — already scheduled.
- `relate-research` — run routinely after new insights land.
- `thesis-review` — run **incrementally** across digests / signals / health / gaps / retrospectives (token-aware: sonnet for derivation, Opus for judgment).
- research-gap bridge — weekly, or event-triggered from new live exposure.
- deep research — **user-approved**, not fully automatic.
Each needs a real **cursor** (what's been processed) so runs are incremental, not full sweeps.

### 3.8 UI role
Show **state, provenance, and outcomes** — never force manual curation:
- thesis/strategy pages as reference views;
- decision-detail context when an item is clicked;
- clear lifecycle/provenance panels;
- minimal buttons: dismiss · resolve · ask agent / run workflow.

---

## 4. The three (four) matrices — the formal contract to produce

The design doc should crystallize §3 into matrices specifying *when the system acts, when
the agent proposes, and how the user's decision is captured back into the graph*:

1. **Relationship Matrix** — per edge: source · target · cardinality · creation method
   (deterministic / agent-suggested / user-confirmed) · confidence threshold · what happens
   when missing · what happens when contradicted.
2. **Propagation Matrix** — per claim/evidence item: routing by thesis state (§3.3).
3. **Workflow Matrix** — per event (§3.1): trigger · automation response · agent response ·
   user decision (if any) · resulting writes.
4. **Decision Taxonomy** — every `decision_type` and its action path (relationship,
   research-gap, thesis-health, claim/refutation, strategy-confirmation, deep-dive escalation).

---

## 5. The automation boundary (reference)

**Automate (structural / high-confidence):** position/trade→strategy; strategy→existing
asset thesis (canonical underlying); strategy→placeholder thesis on live exposure;
asset/macro status cascade; claim→thesis after agent judgment at high confidence; signal
generation from a monitoring thesis's articulation; gap detection.

**Agent/user-mediated (judgment → decision packets):** tactical vs hedge vs thesis-backed;
which economic underlying a proxy/ETF/option expresses (PURR→HYPE); develop vs merge vs
reject a placeholder; which macro frames an asset thesis; `related` vs `gated_by`; whether a
claim cluster deserves a new thesis; gap → source-capture vs light pass vs deep dive; whether
refuting evidence changes or just complicates a thesis; weakening signal → revise / act / hold.

---

## 6. Outstanding work queue

1. ~~**Write the operating-model design doc + implementation plan**~~ — **DONE 2026-06-19** → [09](09-claim-signal-propagation-operating-model.md): the four matrices (§4–§7), event taxonomy, lifecycle rules, decision types, the order-independence playbook, and the C0–C8 plan.
2. **Decision Item model** (§3.6) — extend `decision_required` into the packet; schema + `/api/dashboard/decisions` surface + a `resolve-decision` agent path. The primitive everything hangs off.
3. **Recurring agent↔user maintenance routine** (§3.7) — scheduled, incremental, cursor-based; emits decision packets, not silent writes. (Billed cloud routine — user go.)
4. **Asset→Macro framing automation** — agent-suggested `related` vs `gated_by` as decisions.
5. **Drain backlogs** via the routine: ~30 signalless monitoring theses; ~16 retrospectives; research-gap bridges (incl. the 6 new placeholders SOI/HLIT/NEAR/NBIS/VVV/MAX).
6. **B8** notes-repo flip (relate-research becomes the live capture path).
7. **W9** intel-router quality audit (routed `assessment` labels inverted for invalidation signals — health pass corrects, source needs fixing).
8. **Thesis cull** ([02](02-thesis-cull-checklist.md)) — still awaiting markup; legacy `active`-status rows remain.

---

## 7. Why we're close

The database graph and most propagation automations already exist
(positions→strategies, strategies→theses, the status cascade, claim→thesis judgment, signal
derivation, gap detection). What's missing is the **formal contract** (the matrices) and the
**decision packet** that captures the user's judgment back into the graph. Build those two,
schedule the routines with cursors, and the loop becomes a coherent, low-touch, self-repairing
operating model rather than a set of scripts.
