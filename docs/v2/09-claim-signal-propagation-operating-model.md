# Trade Journal v2 — Claim/Signal Propagation Operating Model

**Date:** 2026-06-19
**Status:** design — for sign-off before build. This is the doc [08](08-object-graph-and-decision-model.md) §6.1 calls for.
**Builds on:** [03-v2-spec.md](03-v2-spec.md), [07-belief-maintenance-loop.md](07-belief-maintenance-loop.md), [08-object-graph-and-decision-model.md](08-object-graph-and-decision-model.md) (the seed), the shipped `relate-research` + `/thesis-review` skills.
**Governing principle:** the system (with Claude inside) does the relating, synthesizing, and reviewing; Nick only touches genuine decisions. No review queues, no curation UIs.

---

## 0. What this doc delivers

08 shipped the *backbone* and named the eight things to design. This doc crystallizes them into a **formal, implementable contract** so the loose set of W8 scripts becomes one coherent operating model:

1. **The object graph as first-class** (§2) — the canonical edges, cardinalities, and backing tables; every arrival order treated as a valid state, not an exception.
2. **The automation boundary** (§3) — one crisp restatement of automate-vs-escalate.
3. **The four matrices** (§4–§7) — the contract proper:
   - **Matrix 1 — Relationship** (per edge): creation method, confidence threshold, missing-handling, contradiction-handling.
   - **Matrix 2 — Propagation** (per claim/evidence item): routing by target thesis state.
   - **Matrix 3 — Workflow** (per event): trigger → automation → agent → user decision → writes.
   - **Matrix 4 — Decision Taxonomy** (per `decision_type`): the full set, each with its action path.
4. **The Decision Item schema** (§8) — the packet that `decision_required` becomes; the primitive everything hangs off.
5. **Order-independence playbook** (§9) — each content/thesis/strategy arrival order walked through the matrices.
6. **Routines + cursors** (§10) and the **implementation plan** (§11), **decisions for sign-off** (§12), and **deferred** (§13).

Everything below names **real tables, columns, scripts, and skill modes** that already exist (per [07](07-belief-maintenance-loop.md)). The only genuinely *new* primitive is the Decision Item packet (§8); the rest is wiring the shipped pieces into the contract.

---

## 1. The core design problem (restated from 08 §1)

Treat every arrival order as a **valid state the system routes work for**, never an exception to panic over:

- Content can arrive **before** a thesis exists.
- A thesis can exist **before** a strategy exists.
- A strategy/position can exist **before** a thesis is refined (position→backfill).
- A macro thesis can exist **without** asset expressions.
- An asset thesis can be **live but thin**.
- Signals can exist **before** new evidence arrives, or need to be **derived after** a thesis becomes live.

The graph is allowed to be **incomplete, provisional, and repaired over time**. The job is to *notice the shape and route the right work*: automate the mechanical/high-confidence edges; escalate genuine ambiguity into Decision Items the user resolves **with an agent**. §9 proves the matrices cover all six orderings.

---

## 2. The object graph (first-class)

```
   ┌─────────┐   N:1    ┌──────────┐   N:1    ┌──────────────┐   M:N    ┌──────────────┐
   │ Position │────────▶│ Strategy │────────▶│ Asset Thesis │◀───────▶│ Macro Thesis │
   └─────────┘          └──────────┘          └──────────────┘ related/ └──────────────┘
        ▲                    │                  ▲     ▲         gated_by    ▲     ▲
        │ daily snapshot     │ signals          │     │ claims             │     │ claims / macro↔macro
        │                    ▼ (strategy)       │     │ (M:N)              │     │
   (trades/ingestion)    ┌──────────┐           │  ┌─────────┐             │  ┌─────────┐
                         │  Signal  │───────────┴──│  Claim  │             └──│  Claim  │
                         └──────────┘  evidence    └─────────┘                └─────────┘
                              ▲        (M:N)            ▲
                              │ derived from            │ extracted in Tana → research_insights
                         ┌──────────────┐               │
                         │ Articulation │◀──────────────┘ (claim_ids_used)
                         │   (digest)   │
                         └──────────────┘
```

| Edge | Cardinality | Backing table · key column(s) |
|---|---|---|
| Position → Strategy | N:1 | `positions.strategy_id` |
| Strategy → Asset Thesis | N:1 | `strategies.asset_thesis_id` |
| Asset Thesis → Macro Thesis | **M:N** | `asset_thesis_related_macro_theses` (`relationship_type` ∈ `related` \| `gated_by`) |
| Macro Thesis → Macro Thesis | M:N | `macro_thesis_related_macro_theses` (`source`/`target`) |
| Claim → Thesis | M:N | `claim_thesis_mappings` (`mapping_type`, `confidence`, `mapped_by`) |
| Signal → Thesis/Strategy | M:N | `signal_entity_links` (`entity_type`, `thesis_id`+`thesis_type` \| `strategy_id`) |
| Signal → dependent Thesis (compositional) | N:1 | `signals.dependent_thesis_id` / `_type` / `_condition` |
| Claim → Signal (evidence) | M:N | `claim_signal_evidences` + `signal_data_snapshots` (`data_source='research_routing'`) |
| Thesis → Articulation (digest) | 1:N (versioned) | `thesis_articulations` (`claim_ids_used`, `version`) |

**Status state machines** (unchanged; owned by the cascade — see [07](07-belief-maintenance-loop.md)):
- Thesis: `draft → developing → monitoring ⇄ closed → complete | rejected`. `monitoring` = **live expression** (an active strategy: asset directly, macro via a linked asset). `closed` = was expressed, now flat (reopens to monitoring on re-expression). `complete`/`rejected` = resolved → retrospective.
- Strategy: `draft → active → complete | rejected | merged`. Claim/Signal: `draft → active → complete | rejected`.

---

## 3. The automation boundary (reference)

**Automate (structural / high-confidence) — no user touch:**
position/trade→strategy · strategy→existing asset thesis (canonical underlying via `parent_underlying_id`) · strategy→placeholder thesis on live exposure · asset/macro status cascade · claim→developing thesis when agent confidence ≥ 0.7 · signal derivation from a monitoring thesis's articulation · digest refresh on claim delta · gap detection · ticker-matched signal evidence routing · retrospective on resolve.

**Escalate (judgment → Decision Item):**
tactical/hedge vs thesis-backed exposure · which economic underlying a proxy/ETF/option expresses (PURR→HYPE) · develop vs merge vs reject a placeholder · which macro frames an asset thesis · `related` vs `gated_by` · whether a claim cluster deserves a new thesis · gap → capture-sources vs light pass vs deep dive · whether refuting evidence changes or merely complicates a thesis · weakening signal → revise / act / hold.

The matrices below assign **every edge and event** to one side of this line.

---

## 4. Matrix 1 — Relationship Matrix

Per edge: how it's created, the confidence bar, what happens when it's **missing**, and what happens when it's **contradicted**. "Det." = deterministic code; "Agent" = Claude judgment; "User" = confirmed via a Decision Item.

| Edge | Creation method | Confidence / threshold | When **missing** | When **contradicted** |
|---|---|---|---|---|
| **Position → Strategy** | Det. — `autoLinkPositionsToStrategies` (in recompute) | exact instrument match | null `strategy_id` → re-link sweep; persistent → coverage report | n/a (a position is a fact) |
| **Strategy → Asset Thesis** | Det.+Agent — `ensureAssetThesesForStrategies`: canonical underlying (`parent_underlying_id`, e.g. IBIT→BTC) → **link**; direct underlying → **create placeholder** `developing` (direction from net position); unresolvable proxy → **flag** | structural; placeholder is unconditional for a real underlying | active strategy w/ null thesis → placeholder created, **or** `resolve_proxy_underlying` decision (proxy) | strategy direction ≠ thesis direction → tolerated (a hedge is a strategy under the same belief); extreme case → `classify_exposure` |
| **Asset Thesis → Macro Thesis** | Agent-suggested → **User-confirmed** (`frame_asset_under_macro`, `classify_macro_link`) | `related` auto at high agent confidence; **`gated_by` always a decision** (it wires compositional invalidation) | asset thesis w/ no macro → coverage report; *optional* `frame_asset_under_macro` (an asset thesis may stand alone) | a `gated_by` macro flips invalid → compositional invalidation signal fires on the asset |
| **Macro → Macro** | Agent-suggested → User-confirmed | high confidence to auto-`related` | optional; no obligation | — |
| **Claim → Thesis** | Agent-judged — `relate-research` (`mapped_by='relate_research'`) | `supports`/`foundation` **≥0.7 auto-silent**; **0.4–0.7 link + decision**; `refutes` **≥0.4 link + decision**; **<0.4 drop** (stays in Tana) | claim relevant but **no active thesis** → stays in Tana; if a cluster → `cluster_claims_to_thesis` | `refutes` mapping → `review_refuting_claim` + folded into next digest's `evidence_gaps` / pre-stages invalidation |
| **Signal → Thesis/Strategy** | Derived — `/thesis-review` signal mode from the articulation | qualitative; ≤2 confirmation / ≤2 invalidation / ≤1 completion; only if grounded in a real claim | monitoring thesis w/ **0 signals** → `find-signalless-theses` → derive (or `thin` → research-gap) | signal `weakening`/`invalidated` via health pass → `weakening_signal_action` |
| **Signal → dependent (compositional)** | Derived — signal mode, for `gated_by`/`depends_on` parents | structural (one per qualifying parent) | `gated_by` parent w/ no compositional signal → signal mode adds it | parent invalidated → propagates to dependent with no data feed |
| **Claim → Signal (evidence)** | Det. ticker-match (`relate-research --apply-signals`) **or** Agent (health pass) | **exact-ticker monitoring asset thesis only**; sector/keyword deferred to v1.1 | monitoring evidence w/ no matching signal → noted in digest until signals exist | polarity mismatch (bearish claim ↔ bullish confirmation signal) → health pass reads the text and corrects; **don't blanket `--apply-signals`** |
| **Thesis → Articulation (digest)** | Derived — `/thesis-review` digest/signal mode | delta **K=3** claims since `claims_count_at_last_articulation` | developing thesis ≥K new claims → `find-stale-digests` | new refuting claims → fold into `evidence_gaps` on the next version (never destructive) |

---

## 5. Matrix 2 — Propagation Matrix

Per claim/evidence item: where it goes, keyed by the **state of the target thesis**. This is the routing `relate-research` and the signal route already implement; the table is the contract they satisfy. ("Decision?" = does a Decision Item surface.)

| Target thesis state | Routing action | DB write | Decision? |
|---|---|---|---|
| **No relevant active thesis** | Leave in Tana (the corpus). If several dropped claims share a theme → note as a cluster. | none | `cluster_claims_to_thesis` (optional, digest-noted) |
| **Developing — supports/foundation ≥0.7** | Auto-link claim (silent) | `claim_thesis_mappings` (`mapped_by='relate_research'`); advances digest delta | no |
| **Developing — supports/foundation 0.4–0.7** | Link claim, surface for a look | `claim_thesis_mappings` + decision | `confirm_claim_link` |
| **Developing — refutes ≥0.4** | Link claim; counter-evidence is never buried | `claim_thesis_mappings` (`refutes`) + decision; feeds `evidence_gaps` | `review_refuting_claim` |
| **Monitoring (has signals) — exact ticker match** | Route as signal evidence | `signal_data_snapshots` (`research_routing`) + `claim_signal_evidences` | only if health pass later reads weakening |
| **Monitoring (has signals) — sector/keyword only** | Note in digest; do **not** auto-route (polarity risk) | none | agent judgment (v1.1) |
| **Monitoring — NO signals yet** (promotion gap) | Fallback: accept claim-link until signals exist; worklist derives signals | `claim_thesis_mappings` (fallback) → later `signals` | no (signal derivation runs) |
| **Thin monitoring (0–2 claims)** | Research-gap bridge: Tana-first, then propose sources | link existing claims, **or** decision | `develop_thin_thesis` |
| **Closed / complete / rejected** | Excluded from the active catalog | none | no |

The active catalog `relate-research` judges against is exactly `developing` + `monitoring` (closed/resolved excluded) — see the skill's Step 1.

---

## 6. Matrix 3 — Workflow Matrix

Per event (08 §3.1, expanded): trigger → deterministic automation → agent response → user decision (if any) → resulting writes.

| Event | Trigger source | Automation (det.) | Agent response | User decision | Writes |
|---|---|---|---|---|---|
| **New Tana content** | `/tana-inbox` (notes repo) | claim extraction queued | — | — | `#content` node (Tana) |
| **New claim extracted** | `tana-content-ingest` cron | lands in `research_insights.claims_structure` | (queued for relate-research) | — | `research_insights` |
| **relate-research run** | scheduled / on-demand | engine loads catalog+claims, dedups, applies the §5 policy, owns writes | judges each claim→thesis relevance + mapping_type + confidence | `confirm_claim_link` · `review_refuting_claim` · `cluster_claims_to_thesis` | `main_claims`, `claim_thesis_mappings`, `decision_required` |
| **Claim linked → developing** | relate-research apply | digest delta counter advances | (digest mode later) | — | `claim_thesis_mappings`; if delta≥K → digest worklist |
| **Thesis created** | `create-asset-thesis` / placeholder | status `draft`/`developing` | — | placeholder from exposure → optional `classify_exposure` | `asset_theses` / `macro_theses` |
| **Strategy opened (new live exposure)** | ingestion recompute | autolink positions→strategy; `ensureAssetThesesForStrategies` links/creates/flags; **cascade promotes** | — | `resolve_proxy_underlying` (unresolvable proxy) · `classify_exposure` (tactical vs belief) | `strategies`, placeholder `asset_theses`, status change, journal |
| **Strategy linked → thesis** | `ensureAssetThesesForStrategies` | `strategies.asset_thesis_id` set | — | — | `strategies` update + journal |
| **Thesis promoted → monitoring** | cascade (active strategy attaches) | status `developing→monitoring` | signal mode derives signals (or `thin`→gap) | low-confidence signals → glance | status change; `signals` + `signal_entity_links`; or research-gap decision |
| **Signal evidence received** | relate-research signal route / intel router | `signal_data_snapshots` + `claim_signal_evidences` | health pass renders verdict | `weakening_signal_action` (only on weakening) | snapshots; later `thesis_health` |
| **Health pass due** | `find-theses-due-health` (on-evidence + 7d floor) | worklist | verdict per signal | `weakening_signal_action` | `thesis_health` snapshot (**change-only**); decision (**weakening-only**) |
| **Position closed (expression gone)** | cascade | strategy→`complete`; asset→`closed`; macro→`closed` (all assets closed) | retrospective mode | — | status changes; on resolve → `retrospective` journal + `outcome`/`actual_outcome_date` + supersede signals |
| **Thesis thin/gap detected** | `find-research-gaps` (monitoring, 0–2 claims) | worklist | Tana-first pull → relate-research; if still thin, propose specific sources | `develop_thin_thesis` | link existing claims **or** `decision_required` |
| **Refuting claim linked** | relate-research | — | (already judged) | `review_refuting_claim` | `claim_thesis_mappings` (`refutes`) + decision |
| **Asset↔macro framing detected** | coverage report / relate-research note | — | suggest macro(s) + `related`/`gated_by` | `frame_asset_under_macro` · `classify_macro_link` | `asset_thesis_related_macro_theses` on resolve |
| **Deep-dive graduates** | `graduate-pipeline-idea` (user-approved) | — | creates/updates thesis, claims, signals, expression | `run_deep_dive` (to launch) | thesis/claims/signals/strategy writes |

---

## 7. Matrix 4 — Decision Taxonomy

Every `decision_type`, with the agent runbook that resolves it and the **write that captures the judgment back into the graph**. Each is emitted as a Decision Item (§8). `default_recommendation` carries a confidence the strip can show.

| `decision_type` | Raised by | `primary_object` | `agent_runbook` | `recommended_actions` (bounded) | Resolve writes |
|---|---|---|---|---|---|
| `confirm_claim_link` | relate-research (0.4–0.7 supports/foundation) | claim | `/relate-research` | confirm link · sever · adjust mapping_type | keep/delete `claim_thesis_mappings` |
| `review_refuting_claim` | relate-research (refutes ≥0.4) | thesis | `/relate-research`; `/thesis-review` digest | acknowledge (fold to gaps) · downgrade confidence · reject thesis | `thesis_articulations` (evidence_gaps), status, journal |
| `cluster_claims_to_thesis` | relate-research (themed drops) | claim(s) | `create-*-thesis` then `/relate-research` | open new thesis · keep in Tana | `macro_theses`/`asset_theses` + links |
| `classify_exposure` | strategy auto-link (placeholder created) | strategy | `update-entity-status` / annotate | thesis-backed (keep) · tactical/hedge (mark, no thesis) | annotate or reject placeholder; journal |
| `resolve_proxy_underlying` | strategy auto-link (unresolvable proxy, e.g. PURR) | strategy | `create-underlying` + `parent_underlying_id` map | map to economic underlying · create new underlying · mark tactical | `underlyings.parent_underlying_id`; re-run link |
| `develop_thin_thesis` | `find-research-gaps` (monitoring, 0–2 claims) | thesis | `/thesis-review` research-gap | capture sources (`/tana-inbox`) · run deep-dive · accept thin | sources captured → claims → digest/signals |
| `frame_asset_under_macro` | coverage report / relate-research | asset thesis | link helper | link to macro(s) · stand alone | `asset_thesis_related_macro_theses` (`related`) |
| `classify_macro_link` | framing detection | asset↔macro edge | link helper | `related` · `gated_by` · none | `relationship_type`; if `gated_by` → compositional signal |
| `weakening_signal_action` | health pass (weakening/invalidated) | thesis | `/thesis-review` health; user | revise signal · act on position · hold/monitor | journal; optional status/position note |
| `run_deep_dive` | research-gap escalation (user-approved) | thesis | `stage-1…5` → `graduate-pipeline-idea` | launch deep-dive · light pass only | pipeline artifacts → thesis/claims/signals |
| `link_strategy_to_thesis` | auto-link miss (rare) | strategy | `link-strategies-to-theses` | link to thesis · create · mark tactical | `strategies.asset_thesis_id` |

These 11 are the complete set. New work introduces **no new decision *mechanism*** — only new `decision_type` values on the one packet.

---

## 8. The Decision Item schema (the packet)

Today `decision_required` is a bare `journal_entries` row: `objectType`, `objectId`, `objectTitle`, `actionDescription` (title), `rationale`, `source`, `status`. The strip (`/api/dashboard/decisions`, cap 5, dedup per object) and `raise-decision.ts` already exist. The packet (08 §3.6) needs a home for `decision_type`, `related_objects`, `recommended_actions`, `agent_runbook`, `default_recommendation`, and `resolution`.

### 8.1 Storage decision — `metadata` jsonb envelope ✅ (decided 2026-06-19)

**Store the packet in `journal_entries.metadata` (jsonb, already present, defaults `{}`), not a new table.** Rationale:
- Matches the v2 minimal-migration posture (the `closed` status precedent: "free-text column, no migration").
- Keeps a **unified audit trail** — the decision, its resolution, and every other belief-layer event live in one table the strip already reads.
- The strip's dedup index (`idx_journal_dedup_lookup` on `objectId, actionType, status`) and lifecycle fields (`firstDetectedAt`/`lastSeenAt`/`occurrenceCount`, `batchId`) work unchanged.
- A dedicated `decision_items` table is the alternative if decisions ever need their own relational queries/joins (see §12 #1) — but nothing today needs that, and a jsonb envelope is forward-compatible (a table can be back-filled from it later).

Top-level columns keep their meaning; the envelope adds the packet:

```jsonc
// journal_entries row
{
  objectType:        "asset_thesis",          // = primary_object.type
  objectId:          "<uuid>",                // = primary_object.id
  objectTitle:       "Bullish SOI Medium Term",
  actionType:        "decision_required",
  actionDescription: "Live position on SOI, thin thesis — develop it",  // headline
  rationale:         "0 linked claims; no digest. Tana has 1 stale note.",
  source:            "automation",            // 'automation' | 'skill' | 'user'
  status:            "active",                // active | resolved | dismissed | snoozed | superseded
  metadata: {
    decision: {
      schema_version: 1,
      decision_type: "develop_thin_thesis",   // §7 enum
      related_objects: [                       // candidate links, claims, signals, positions
        { type: "strategy",   id: "<uuid>", title: "SOI_LONG", role: "expression" },
        { type: "underlying", id: "<uuid>", title: "SOI",      role: "subject" }
      ],
      why_raised: "Expression opened before research exists (position→backfill).",
      evidence_context: {                      // provenance the agent/user needs
        source: "thesis-review research-gap",
        completeness_score: 0.1,
        tana_hits: 1,
        links: []
      },
      recommended_actions: [                   // bounded — each maps to a §7 resolve write
        { action: "capture_sources", label: "Capture 3 sources via /tana-inbox",
          payload: { queries: ["SOI datacenter contracts 2026", "SOI guidance"] } },
        { action: "run_deep_dive",   label: "Run a deep-research pass",
          payload: { question: "Is SOI's order book durable through 2027?" } },
        { action: "accept_thin",     label: "Accept thin for now" }
      ],
      agent_runbook: "/thesis-review research-gap",
      default_recommendation: { action: "capture_sources", confidence: "medium" },
      snoozed_until: null,                     // ISO date if status='snoozed'
      resolution: null                         // filled on resolve (§8.3)
    }
  }
}
```

### 8.2 Lifecycle & dedup

`active → resolved | dismissed | snoozed`. `superseded` is reserved for the writer when a newer packet replaces an older one for the same object.
- **Dedup** stays per-object (one active decision per `objectId`), exactly as `raise-decision.ts` does today — the strip never piles duplicates. Re-emitting bumps `lastSeenAt`/`occurrenceCount` rather than inserting.
- **Snooze**: `status='snoozed'` + `snoozed_until` (ISO date) stored at `metadata.decision.snoozed_until` for packet rows, or `metadata.snoozed_until` for legacy bare rows; the GET wake-up `COALESCE`s both. The GET self-heals: a snoozed row whose `snoozed_until ≤ now()` is flipped back to `active` on read, so a shown decision is always `active`. **One-line migration required** (`migrations/add-snoozed-decision-status.sql`): `journal_entries.status` carries a DB CHECK constraint (not in the Drizzle schema) that listed only `active/resolved/dismissed/superseded` — `snoozed` was added to it. (The packet *storage* still needs no migration; only this status-value did.)
- **Cap 5** on the strip is unchanged; the agent's chat digest remains the authoritative full list when a wide run emits more (per relate-research Step 5).

### 8.3 Resolution capture (the judgment → graph write)

When a decision is resolved, `resolution` records what happened **and the agent performs the corresponding §7 write**:

```jsonc
resolution: {
  action_taken: "capture_sources",
  chosen_by: "user",                 // 'user' | 'agent' (auto-resolved) 
  at: "2026-06-20T09:00:00Z",
  notes: "Captured FT + 10-K excerpt; relate-research linked 2 claims.",
  writes: [                          // pointer to the graph mutations made
    { table: "claim_thesis_mappings", op: "insert", ids: ["<uuid>","<uuid>"] }
  ]
}
```

### 8.4 API + UI + agent path

- **`GET /api/dashboard/decisions`** — return `metadata.decision` alongside the existing fields; exclude `snoozed` whose `snoozed_until` is future. (Add the column to the select; no schema change.)
- **`PATCH /api/dashboard/decisions`** — accept `status ∈ {dismissed, resolved, snoozed}`; for `snoozed`, accept `snoozed_until`; for `resolved`, accept a `resolution` object to merge into `metadata`.
- **DecisionStrip** — render a `decision_type` chip, the `recommended_actions` as buttons, and an **"Ask agent"** affordance that hands the packet to the runbook. Minimal buttons only (08 §3.8): dismiss · snooze · resolve · ask agent. No curation UI.
- **`scripts/ops/resolve-decision.ts`** (new) — the agent path: given a decision id + chosen action, read the packet, pull DB/Tana context, execute the `agent_runbook`'s write, write `resolution`, set `status`, journal it. One runbook branch per `decision_type` (they already exist as `/thesis-review` modes, `relate-research`, link/underlying ops).
- **`scripts/ops/raise-decision.ts`** (extend) — accept the full packet (`--decision-type`, `--related`, `--recommended`, `--runbook`, `--default`, or `--stdin` JSON) and write it into `metadata.decision`. Backward compatible: title+rationale still work, `decision_type` defaults to a generic value.

---

## 9. Order-independence playbook

Each of the six valid orderings (§1), walked through the matrices — proof the contract has no "exception" states.

**A. Content before thesis.** Claim extracted (M3: new claim) → relate-research finds no active thesis (M2 row 1) → **stays in Tana**. If a themed cluster → `cluster_claims_to_thesis` (M4). User opens a thesis → later claims link normally. *No loss, no queue.*

**B. Thesis before strategy.** Developing thesis accumulates claims (M2: developing) → digest refreshes on K-delta (M1: Thesis→Articulation) → **no signals** (correct — signals are a monitoring artifact). Waits for expression. A pure top-down **macro with no asset** (ordering D) sits in `developing` indefinitely — the cascade leaves it untouched (`deriveMacroThesisStatus` returns null when `hasLinkedAssets=false`).

**C. Strategy/position before thesis (position→backfill).** Exposure opens (M3: strategy opened) → `ensureAssetThesesForStrategies` links canonical or **creates a placeholder developing thesis** (or flags a proxy → `resolve_proxy_underlying`) → cascade promotes to `monitoring` → signal mode sees it's **thin** → research-gap bridge (M3: thin/gap) → Tana-first → `develop_thin_thesis` → captured sources → claims land → digest + signals derive. *The inversion is a first-class path, not a repair.*

**D. Macro without asset expressions.** Covered in B — stays developing; gets digests as claims accrue; never force-closed.

**E. Asset thesis live but thin.** Monitoring + 0–2 claims → `find-research-gaps` flags it; signal mode **skips** (never fabricates signals for a thin thesis) → `develop_thin_thesis`. Once claims land, signal mode derives on the next pass.

**F. Signals before evidence / derived after live.** On promotion, signal mode derives the invalidation/confirmation/completion set from the articulation (M1: Signal→Thesis). Evidence arrives later via the signal route (M2: monitoring + ticker) → health pass renders verdicts (M3: health) → surfaces `weakening_signal_action` only on deterioration.

---

## 10. Scheduled routines + cursors

| Routine | Cadence | Cursor | Notes |
|---|---|---|---|
| Tana claim extraction | cron (notes repo) | Tana node `Status` | already scheduled |
| `relate-research` | after new insights land (event) + weekly floor | **date window** on `research_insights.created_at` — **needs a stored cursor** (today: "you choose the window") | idempotent; re-running an overlapping window is safe |
| `/thesis-review` digest | incremental | **cursor-free** — `claims_count_at_last_articulation` delta self-clears | writing a digest clears the delta |
| `/thesis-review` signal | incremental | **cursor-free** — "monitoring with 0 active signals" self-clears | deriving signals drops it off |
| `/thesis-review` health | on-evidence + 7-day floor | **cursor-free** — `last_reviewed_at` on the thesis is the marker | change-only snapshots |
| `/thesis-review` research-gap | weekly / new-exposure event | **cursor-free** — decision dedup prevents re-raise | Tana-first |
| `/thesis-review` retrospective | on resolve | **cursor-free** — "resolved & not-yet-retrospected" self-clears | one-off per thesis |
| deep research | **user-approved**, never auto | n/a | escalation only |

**Cursor design.** The elegant result: **four of five `/thesis-review` modes are cursor-free** because their worklists are self-clearing (the state lives on the thesis/articulation/decision). The only routine needing an explicit cursor is `relate-research` (an insight-date high-water-mark). Recommendation (§12 #6): a minimal single-row store (a tiny `automation_cursors(key, cursor_value, updated_at)` table, or a `metadata` marker on a sentinel journal entry) — **not** `ingestion_cursors` (that's account-FK-bound to exchanges). The maintenance routine (§11 C6) advances this one cursor; everything else reads its self-clearing worklist.

The routine is **token-aware**: sonnet for mechanical derivation, Opus for judgment (08 §3.7); it processes a few items per run so per-run cost stays bounded, and it **emits Decision Items, never silent writes** at escalation points.

---

## 11. Implementation plan

Phase "C" (the operating-model *contract*, after W8's B0–B7). The matrices (§4–§7) are the spec; most work is wiring shipped pieces to the Decision Item primitive.

| # | Step | Size | Gate | New code | Status |
|---|---|---|---|---|---|
| **C0** | Adopt this doc as the contract (matrices = spec). | — | — | none (doc) | ✅ DONE |
| **C1** | **Decision Item packet** — extend `raise-decision.ts` to write the `metadata.decision` envelope (§8.1); shared type in `src/lib/types/decisions.ts`; dedup bumps `occurrenceCount`. | S/M | C0 | `raise-decision.ts`, `decisions.ts` | ✅ DONE |
| **C2** | **Surface** — `GET`/`PATCH /api/dashboard/decisions` return/accept the packet, snooze (+ self-heal wake), resolution; DecisionStrip renders `decision_type` chip + `recommended_actions` + runbook hint + snooze. | M | C1 | route + `DecisionStrip.tsx` + migration | ✅ DONE |
| **C3** | **`resolve-decision.ts`** agent path — generic close (status + resolution + audit) for any type; built-in mechanical writes for framing / strategy-link / proxy-underlying; status changes delegate to `update-entity-status`. | M | C1 | `scripts/ops/resolve-decision.ts` | ✅ DONE |
| **C4** | **Upgrade emitters** — relate-research (`confirm_claim_link`/`review_refuting_claim`), `record-thesis-health` (`weakening_signal_action`), strategy auto-link (`resolve_proxy_underlying`), `/thesis-review` research-gap (`develop_thin_thesis`) emit **typed packets** via `buildDecisionPacket`. | S/M | C1 | edits to existing emitters | ✅ DONE |
| **C5** | **New decision types** not yet emitted — `frame_asset_under_macro` + `classify_macro_link` (asset→macro framing automation, 08 outstanding #4) and `classify_exposure` (tactical-vs-belief on a placeholder). Agent-suggested → decision. (Resolver branches already built in C3.) | M | C4 | detector + emitter | pending |
| **C6** | **Maintenance routine** — scheduled, incremental, cursor-based (§10); wraps relate-research + thesis-review modes; token-aware; emits packets. Billed cloud routine — **user go**. | M/L | C4 | routine + `automation_cursors` | pending |
| **C7** | **Drain backlogs** via C6 — ~30 signalless monitoring theses, ~16 retrospectives, research-gaps (incl. the 6 placeholders SOI/HLIT/NEAR/NBIS/VVV/MAX). | ongoing | C6 | none | pending |
| **C8** | **B8 notes-repo flip** — relate-research becomes the live capture path. Independent — **user go**. | S | — | notes repo | pending |

**Recommended order:** C1 → C2 → C3 → C4 (the packet plumbing — the highest-leverage primitive), then C5 (new types), then C6 (routine) → C7 (drain); C8 anytime.

**The two things that make the loop coherent** (08 §7): the **matrices** (this doc) and the **Decision Item packet** (C1–C4). Build those, schedule C6 with the one cursor, and the scripts become a self-repairing operating model rather than a toolbox.

### C1–C4 build notes (2026-06-19)

The packet-plumbing increment shipped on branch `feat/v2-decision-item-packet`. **The Decision Item primitive is live end-to-end:** an emitter raises a typed packet → it surfaces on the DecisionStrip with its type chip + recommended actions → `resolve-decision.ts` (or snooze/dismiss) closes it and records the resolution.

- **C1.** `src/lib/types/decisions.ts` is the shared contract (11-type `DecisionType`, `DecisionPacket`, `DECISION_RUNBOOKS`/`_LABELS`, `buildDecisionPacket`, `getDecisionPacket`, `isDecisionType`). `raise-decision.ts` writes the envelope when `--decision-type`/`decisionType` is given (else bare/legacy, unchanged), gained `--dry-run`, and **bumps `lastSeenAt`/`occurrenceCount` on a dedup hit** instead of skipping. Verified: dry-runs (packet / bare / invalid-type guard), live insert→bump→jsonb read-back→cleanup.
- **C2.** GET returns `metadata.decision` and **self-heals expired snoozes** on read (`status snoozed→active` when `snoozed_until ≤ now()`, `COALESCE`ing the packet and legacy top-level paths). PATCH accepts `dismissed|resolved|snoozed` (+ `snoozedUntil`, + `resolution` merge) via read-modify-write of the jsonb. DecisionStrip renders the type chip, recommended-action chips, the runbook hint, and a 7-day snooze control; legacy bare rows still render. **One migration** (`migrations/add-snoozed-decision-status.sql`, applied): the doc's "no migration" was wrong — `journal_entries.status` has a DB CHECK constraint that needed `snoozed` added.
- **C3.** `resolve-decision.ts`: generic close for every type + three safe built-in mechanical writes (framing → `asset_thesis_related_macro_theses` upsert; `link_strategy_to_thesis` → `strategies.asset_thesis_id`; `resolve_proxy_underlying` → `underlyings.parent_underlying_id`). Status-changing resolutions **delegate to `update-entity-status`** (the validated transition path) — the resolver never bypasses it. Verified: dry-run wrote nothing, real `set_gated_by` created the junction + recorded resolution + audit entry, cleanup clean.
- **C4.** Four emitters now produce typed packets (`relateResearch.ts` keeps its flat dedup keys + adds the packet; `strategyThesisLink.ts`; `record-thesis-health.ts`; the research-gap SKILL command). `link-strategies-to-theses` delegates to `strategyThesisLink`, so it inherited the upgrade.
- **Hygiene:** `scripts/lib/db.ts` now loads dotenv with `quiet: true` so every ops script emits **clean JSON on stdout** (the C6 routine will parse it).
- **Gates:** `tsc --noEmit` 0 errors · eslint clean · `npm run build` ✅ (dev server kickstarted) · vitest 177/177.

---

## 12. Decisions for sign-off

**Resolved 2026-06-19** (user review). Four settled now (principled or near-term-build); three deferred to their build step with the lean as the *starting posture* (they need operational evidence and don't gate C1–C4).

| # | Decision | Status | Resolution |
|---|---|---|---|
| 1 | **Decision Item storage** | ✅ **DECIDED** | `metadata` jsonb envelope — no migration, unified trail (§8.1). Back-fill a `decision_items` table only if relational joins are ever needed. |
| 2 | **Snooze** | ✅ **DECIDED** | Add `snoozed` status + `metadata.decision.snoozed_until`. Free (free-text status + envelope field); keeps the strip uncluttered. Folds into C1/C2. |
| 4 | **`frame_asset_under_macro` automation** | ✅ **DECIDED** | `related` auto-links at high agent confidence; **`gated_by` is always a decision** (`classify_macro_link`) — it wires compositional invalidation that can cascade-invalidate an asset thesis. Behavioral asymmetry, not a tuning guess. Clarifies C5. |
| 6 | **Cursor home** | ✅ **DECIDED** | Minimal `automation_cursors(key, cursor_value, updated_at)` table for the one relate-research date high-water-mark; thesis-review stays cursor-free (self-clearing worklists). Do **not** overload account-bound `ingestion_cursors`. |
| 3 | **`classify_exposure` bar** (07 open #3) | ⏳ **defer → C5** | *Starting posture:* gate by a size/conviction bar (tactical hedges shouldn't each spawn a decision). Threshold tuned at C5 once placeholder volume is observed. |
| 5 | **Routine host/cadence** (C6) | ⏳ **defer → C6** | *Starting posture:* event-driven + weekly floor. Host (billed cloud vs local launchd) is a user-go cost call made when C6 is scheduled. |
| 7 | **Auto-resolve scope** | ⏳ **defer → C6** | *Starting posture (conservative):* auto-resolve only the ≥0.7 `related`/`supports` links that already auto-*link* silently; everything else surfaces. Loosen with operational trust. |

---

## 13. Deferred / out of scope

- **W9 intel-router quality audit** — routed `assessment` labels are inverted for *invalidation* signals (the health pass corrects on read; the source still needs fixing).
- **Sector/keyword signal routing** (v1.1) — the signal route is exact-ticker only today; routing sector/keyword matches to monitoring-thesis signals needs judgment.
- **Thesis cull** ([02](02-thesis-cull-checklist.md)) — legacy `active`-status rows and the ~84→handful catalog collapse; relate-research and the routine are at their best post-cull.
- **Quantitative signal wiring** (`/configure-signal`, `collect-signal-data`, `explicit_details`) — kept dormant-but-available for the rare hard threshold; never the default path.

---

*This doc is the formal contract 08 §6.1 called for. With the four matrices fixed and the Decision Item packet built (C1–C4), the belief layer's propagation is fully specified and low-touch by construction.*
