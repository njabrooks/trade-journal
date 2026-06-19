# Trade Journal v2 — Thesis Underwriting & the Loose-Agent Model

**Date:** 2026-06-19
**Status:** design — for sign-off before build. Successor to [09](09-claim-signal-propagation-operating-model.md); **supersedes the stricter parts of 09's signal model** (§8).
**Builds on:** [07](07-belief-maintenance-loop.md) (belief loop), [08](08-object-graph-and-decision-model.md) (object graph), [09](09-claim-signal-propagation-operating-model.md) (propagation matrices + Decision Item).
**Governing principle:** **looseness lives in the agent, not the schema.** Keep the data model simple and strongly-connected; let the agent (with Claude inside) provide the flexible, conversational surface. The schema's only job is to durably capture *what conversations produce* — observations, conviction, underwriting versions — never to model the conversation itself.

---

## 1. Why this exists (the evolution from 09)

09 specified the propagation operating model and the Decision Item primitive — both stand. Two things surfaced while building and dogfooding it:

1. **The signal model was still too object-heavy.** Discrete signals + a `developing`-vs-`monitoring` gate on *how information attaches* + a separate derivation step created gaps (ENTG: monitoring, 6 claims, **0 signals**, stranded — it could receive neither claim-links nor signal-evidence) and echoed the **v1 failure mode**: signals as *configuration* → manual specification → cognitive load → abandonment.
2. **The real desire is loose, curious, agent-led oversight** — a thesis you can *talk to* ("where does this stand, what's the case, what's challenging it, what's thin?"), with the agent carrying the load and proposing next moves, rather than a rigid workflow the user must service.

10 finishes the move 07 §4b started (qualitative auto-signals): **signals stop being configured objects and become the resolution dimension of a living, synthesized underwriting** — and it fixes the backend principle that keeps the whole thing simple as sources multiply.

---

## 2. The core object: a living underwriting

Each thesis has **one living underwriting** — a synthesized, versioned articulation (`thesis_articulations`) with two faces plus a conviction read:

- **Basis for the investment** (the overview / bull-or-bear case) — *why I'm in it*: core argument, key drivers, key assumptions.
- **Basis for resolution** (the signals, as a *section* — not separate objects): what would **confirm** it, **complete** it (take profit / played out), or **invalidate** it.
- **Conviction** + rationale — the current strength of the view.

It is **synthesized from many sources, not extracted from one pipeline** (§5). It is **versioned** — every re-synthesis is a new version, so the version series *is* the conviction history.

**Signals are derived, not declared.** The ENTG worked example: its 6 supporting claims each carried a Toulmin `rebuttal`, so the invalidation criteria fell straight out of them with **zero manual input** — "AI capex turns cyclical and revenue falls regardless of content-per-wafer", "HBM yields mature and the insurance premium compresses", "the re-rating is already in the ATH price". The synthesis surfaces the falsification view from the case's own counter-arguments; the user never specifies a tripwire.

---

## 3. The interaction model: conversational, agent-led, loose

The **primary UX is conversation with an agent over a queryable thesis state** — deliberately *not* a prescribed workflow:

- **Query** — "where does X stand? what's the current case? what's challenging it? what's thin or unresolved? what's changed since I looked?" The agent answers from the synthesized underwriting + linked evidence.
- **Two synthesis verbs** — **re-underwrite** (full resynthesis from all current sources → new version, possibly new conviction) and **what's-changed** (delta: new info since last review and how it bears on the assumptions/resolution view).
- **Loose next moves, proposed not enforced** — the agent suggests *develop this (capture a source / run deep research / log an observation), reconsider sizing, revisit conviction, mark resolved* — and the user picks. The only things that harden into structure are **genuine decisions**, via the Decision Item packet (09 §8). Everything else stays conversational.

**The worklist-draining maintenance routine (C6) is demoted to a quiet background freshness-keeper** — it keeps underwritings current and attaches incoming evidence, but it is *not* the user-facing surface. The headline is the conversation, not the queue. (This is a flavour shift from 09's push/queue framing to a pull/curious one.)

Questions like *"do my allocations match my conviction?"* are **one of many queries** the agent answers on the fly over the quant layer + graph — **not a feature to build** (§6).

---

## 4. The four-layer backend

The flexible experience is an **agent-layer** property. Underneath, three durable layers — two of which already exist and are strong:

| Layer | Role | Status |
|---|---|---|
| **Quant / portfolio** — positions, `strategy_metrics_snapshots`, `portfolio_snapshots`, `nav_snapshots`, `mtm_snapshots`, `fx_rates` (+ W4 realized-PnL, W5 attribution) | allocation · market value · NAV · exposures | **Already strong** — this is what the app does best. Every portfolio question is a *query* over it; no new storage. |
| **Object graph** — positions→strategies→asset_theses→macro_theses (+ claims/signals→theses) | the coherent connective tissue | **Exists + self-maintaining** — the W8 cascade + strategy auto-link + C5 framing keep it coherent automatically. |
| **Research / content** — `research_artifacts`, `research_insights`, `main_claims`, `signals`, `thesis_articulations` | the inputs + the synthesized underwriting | **Evolves by *generalization*, not new tables** (§5). |
| **Agent** | reads across all of the above → synthesizes the underwriting, answers queries, proposes loose moves | the flexibility lives here |

---

## 5. Source → storage (the lean changes)

Many sources now feed the underwriting — Tana claims, deep-research passes, ad-hoc agent research, **and the user's own conversation insights**, plus **evolving conviction**. The move is to **generalize the two stores we already have**, not invent one per source:

| Source | Captured as | Change |
|---|---|---|
| Tana claims | `research_artifacts` → `research_insights` → `main_claims` + mapping | none (exists) |
| Deep-research pass | `research_artifacts` (`source_type='deep_research'`) → observations | new `source_type` value |
| Ad-hoc agent research | `research_artifacts` (`source_type='agent_research'`) → observations | new `source_type` value |
| **Conversation insights** | `research_artifacts` (`source_type='conversation'`, the excerpt) → a lightweight `main_claim` | new `source_type`; **relax `main_claims`** so a "claim" can be any assertion from any source (Toulmin fields optional) |
| New **signal / validation / invalidation** insights | folded into the underwriting's **resolution section** (new `thesis_articulations` version, or a targeted signal add) | the reframe (§7) |
| **Evolving conviction** | a new `thesis_articulations` version with updated `confidenceLevel` + `confidenceRationale` | **none** — re-underwriting *is* the conviction-update; the version series *is* its history |

So the heterogeneous stream lands as **artifacts (the source) + lightweight observations (the bearing) + a versioned underwriting (the synthesis)** — three concepts, all already present. The backend requirement is small: **two generalizations** (`research_artifacts.source_type`, relaxed `main_claims`) + the resolution-section reframe.

---

## 6. What we deliberately do NOT build (anti-overdesign)

- **No new "observations" taxonomy table.** Reuse `research_artifacts` + relaxed `main_claims`. A sprawling per-source schema is exactly the rigidity we're avoiding.
- **No allocation-calibration feature/table.** Conviction-vs-allocation is *one query* the agent runs over conviction (articulation `confidenceLevel`) × allocation (`strategy_metrics_snapshots` notional ÷ NAV) × the graph — works at asset level directly and macro level via W5 full-credit attribution. It's an *example* of the conversational surface, not a thing to construct.
- **No schema that prescribes conversation or decision shapes.** The Decision Item packet (09 §8) already captures the few moments that need to harden. The rest stays loose.
- **No manual signal configuration** ever (`/configure-signal`, `explicit_details`, metric thresholds) — that was the v1 cognitive-load sink; retire it.

---

## 7. Signals as synthesis — the reframe

| | v1 (abandoned) | 09 (interim) | 10 (this) |
|---|---|---|---|
| Origin | hand-specified by the user | auto-derived qualitative, stored as discrete rows | **synthesized as the resolution *section* of the underwriting** |
| Config burden | high (`configure-signal`, thresholds) | none | none |
| Evidence | metric feeds | ticker-gated signal route + health pass | any incoming source, evaluated against the resolution view at re-synthesis / what's-changed |
| Gate on info | — | `developing` (claims) vs `monitoring` (signals) | **none** — info attaches by *bearing*, regardless of position |

**`monitoring` becomes a position flag, not an information gate** — it means *you have live capital on it* (for P&L, attribution, and attention priority), nothing more. Information about a thesis is equally relevant whether or not you currently hold it, so it attaches the same way either way. This is what dissolves the ENTG-style stranding.

Whether the resolution criteria persist as `signals` rows (auto-derived, never configured) or purely as a section of the articulation JSON is the one storage call in §11.

---

## 8. Relationship to 09 — what stands, what's superseded

**Stands (unchanged):** the four matrices (Relationship / Propagation / Workflow / Decision Taxonomy), the **Decision Item packet** (C1–C4), order-independence, and the object graph. The decision primitive is the substrate for "agent proposes loose moves → user resolves genuine ones."

**Superseded by 10:** the discrete-signal *lifecycle* (signals as standalone configured/derived objects you monitor mechanically); the `developing`-vs-`monitoring` gate on how information attaches; the signal-route + health-pass as *separate* mechanisms. These collapse into: *one attachment by bearing → one synthesized underwriting (overview + resolution + conviction) → conversational query*.

---

## 9. Disposition of the C1–C6 build

| Built | Disposition under 10 |
|---|---|
| **C1–C4 Decision Item packet** (type, writer, surface, resolver, typed emitters) | **Stands** — model-agnostic; it's the "genuine decision" substrate the loose model needs. |
| **C5 detectors** (framing, classify_exposure) | **Stands** — they emit decisions; fit the loose model unchanged. |
| **digest / articulation infra** (`thesis_articulations`, `insert-thesis-articulation`, signal-derivation synthesis) | **Stands, reframed** — becomes the *living underwriting* synthesis; extended to multi-source + a resolution section. |
| **C6 maintenance routine** (`/maintenance`, cursor, status) | **Stands, demoted** — background freshness-keeper, not the headline UX. The conversational query surface becomes primary. |
| **metric signal machinery** (`/configure-signal`, `explicit_details`, quantitative path) | **Retired** — never the default; remove from the model. |

So 10 **builds on** C1–C6, doesn't discard it.

---

## 10. Implementation sketch (loose — to be detailed at build time)

Not a rigid plan (that would betray the principle). The shape:

- **D1 — schema generalizations:** add `source_type` values to `research_artifacts` (deep_research / agent_research / conversation); relax `main_claims` to accept non-Toulmin observations with provenance to any artifact. Small migration.
- **D2 — multi-source underwriting synthesis:** extend the articulation synthesis to read across all sources (claims + research + conversation observations), producing overview + resolution section + conviction. Drop the `developing`/`monitoring` info-gate; `monitoring` = position flag.
- **D3 — conversational thesis surface:** the agent verbs (query · re-underwrite · what's-changed) over a thesis's underwriting + linked evidence + quant/graph context, proposing loose next moves; genuine decisions go through the Decision packet.
- **D4 — capture conversation insights** as artifacts + lightweight observations so they feed the underwriting (not lost in chat).
- **D5 — example queries** (allocation-vs-conviction etc.) as agent capabilities over the quant layer + graph — *not* dedicated features.

Sequence and depth decided when we pick this up; D1–D2 are the enabling backend, D3 the headline.

---

## 11. Decisions for sign-off

1. **Resolution criteria storage** — keep auto-derived `signals` rows (never configured) for a queryable/diffable anchor, or fold them entirely into the articulation JSON? *Lean: keep thin rows (they give the "where each stands" view + the what's-changed delta something to compare), but never user-configured.*
2. **Conviction representation** — is the `confidence_level` enum enough, or add a finer numeric strength score (sharpens the allocation-vs-conviction query)? *Lean: start with the enum + articulation rationale; add a score only if the calibration query needs it.*
3. **Conversation capture** — reuse relaxed `main_claims` for conversation observations, or a tiny dedicated `thesis_notes`? *Lean: reuse `main_claims`; add a table only if it proves awkward.*
4. **Surface** — how much of the conversational query lives as in-app UI vs is just Claude Code over the data? *Lean: Claude Code first (zero build), add in-app affordances only where they earn it.*

---

*This is the model the next phase builds toward. The C1–C6 foundation (Decision Item primitive + detectors + articulation infra + the demoted routine) is exactly its substrate — which is why it ships to main now.*
