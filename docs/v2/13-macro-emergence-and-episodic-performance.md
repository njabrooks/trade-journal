# Trade Journal v2 — Macro emergence & episodic performance (two lifecycle bridges)

**Date:** 2026-06-24
**Status:** scoping + design sketch — for sign-off before build (non-urgent, foreseeable)
**Builds on:** [07 §4d](07-belief-maintenance-loop.md) (retrospective + execution axis), [09](09-claim-signal-propagation-operating-model.md) (`cluster_claims_to_thesis`, framing, the decision catalog), the shipped relate-research + `/thesis-review` framing machinery.
**Governing principle (unchanged):** the system relates/synthesizes/reviews; the user only touches genuine decisions — and *creating a belief* (a new macro) is a genuine decision.

---

## 0. Why now

Two delivery pathways surfaced while reviewing the execution-quality retrospective (07 §4d). Neither is urgent, both are foreseeable, and they're a **complementary pair**:

1. **Macro emergence** — a macro-level view arises in research (or a closed macro needs reopening) and there's **no mechanism to propose a new macro thesis**. Macros are hand-authored today (`scripts/ops/create-macro-thesis.ts`, the convert-claim-to-entity dialog); `/thesis-review` framing only *links* an asset to an **existing** macro; the strategy auto-linker creates placeholder *asset* theses, never macros.
2. **Episodic performance** — `closed` is reversible (`closed ⇄ monitoring`), but the retrospective is **one-per-thesis** and the excursion spans the *entire* P&L series. A thesis that closes and re-expresses later conflates two holding periods and never re-assesses the second.

**The dependency runs one way:** macro emergence is the *supply* side (it makes macros come, go, and re-express); episodic performance is the *measurement* side (it keeps the performance layer honest across that churn). While macros stay long-lived and hand-authored, episodic tracking is a nice-to-have; the moment emergence lands and macros cycle, episodic tracking is what stops the retrospective from lying.

---

## 1. Pathway A — Macro emergence (fold into W8)

### 1a. What already exists (don't rebuild)
- **Manual creation:** `create-macro-thesis.ts`; the in-app convert-claim-to-entity dialog (`ConvertClaimToEntityDialog.tsx`) + `/api/theses/create`.
- **Framing (existing macros only):** `/thesis-review` framing mode → `find-theses-needing-framing.ts` scans the **macroCatalog of existing macros** and `link-asset-macro.ts` writes `related`/`gated_by`. Its tail case is "no genuine macro / <0.4 → **skip** (an asset may stand alone)" — that skip is precisely where emergence should pick up.
- **The decision is already specified in 09 — just unbuilt.** 09's catalog names **`cluster_claims_to_thesis`** ("relate-research themed drops → `create-*-thesis` → open new thesis · keep in Tana", target `macro_theses`/`asset_theses`) and lists *"whether a claim cluster deserves a new thesis"* as an escalate item, plus a `Macro → Macro` agent-suggested link. So the **decision primitive and disposition exist**; the gap is the **detector** and the **resolution wiring**.

### 1b. The gap to build
A **detector** + a **macro-specific propose-and-create path**, mirroring framing but for *new* macros. Two entry points feed the same decision:

- **Research-driven (primary):** relate-research already buckets claims that relate to **no active thesis** ("<0.4 drop → stays in Tana"). When such claims **cluster thematically at a macro level**, that cluster is a `cluster_claims_to_thesis` candidate (target = macro). This is the natural extension of relate-research's existing clustering note (09 row "Claim → Thesis … if a cluster → `cluster_claims_to_thesis`").
- **Structure-driven (secondary):** the coverage report already flags "asset thesis with no macro". When **several** assets share a theme and none maps to an existing macro, that's an emergent-macro candidate (cluster of *asset theses*, not claims).

### 1c. Mechanism (mirrors framing; never auto-creates)
1. **Dedup first (the framing boundary):** before proposing, check the macroCatalog exactly as framing does. If an existing macro fits → that's `frame_asset_under_macro`/`classify_macro_link` (existing path), **not** creation. Only propose **new** when the framing tail ("nothing fits") is genuinely empty.
2. **Always a decision — never auto.** Creating a belief is judgment (consistent with 09: framing is "Agent-suggested → User-confirmed"; `gated_by` always a decision). Emit a typed **`cluster_claims_to_thesis`** packet (reuse the 09 primitive; add a `thesisKind: 'macro' | 'asset'` field rather than minting a parallel `propose_macro_thesis`) via `raise-decision.ts`. Payload: proposed `title`/`description`/`direction`/`thesis_type`, the supporting `claimIds` / `assetThesisIds`, *why no existing macro fits*, and a confidence.
3. **Resolution on accept:** `resolve-decision.ts` gains the action → `create-macro-thesis.ts` (or the API) → link the supporting asset theses (`link-asset-macro`) and/or claims (`link-claim-to-thesis`) → the cascade promotes status from there (B2). Reject → no-op, claims stay in Tana.
4. **Runs as a new `/thesis-review` mode** ("macro-emergence"), structured like framing: worklist (cluster candidates) → context (the cluster + macroCatalog for dedup) → judge → raise one decision per cluster (deduped). **Be sparing** — quality over coverage, same discipline as framing's "most assets relate to 0–1 macros; cap at 5".

### 1d. Footprint
Small. **No new schema** (reuse the decision-packet/journal path + existing create/link ops). New: a detector query (claim-cluster + asset-cluster with no macro match), a `/thesis-review` mode, and one `resolve-decision.ts` action. It's an extension of the relate-research/framing family → **belongs in W8** (the research redesign), where the anticipatory-relevance + dedup machinery already lives.

---

## 2. Pathway B — Episodic performance (independent follow-on to 07)

### 2a. Problem
`findThesesNeedingRetrospective` excludes any thesis with an existing retrospective entry, and `computeExcursion` runs over the whole `perf.combined`. So a held → closed → re-expressed thesis (1) keeps only its first retrospective and (2) measures MFE/MAE/capture across both holding periods glued together.

### 2b. Design — expression episodes
Treat each contiguous monitoring span as an **episode**; performance becomes a short series keyed by date range, not a lifetime record.

- **Boundary detection is nearly free.** The cascade journals **every** status transition (`status_change`, `source='automation'`, in `thesisCascade.ts`). An episode = a `→ monitoring` entry to the next `monitoring → closed` (or "still live"). Reconstructable from the journal trail with **no new bookkeeping** — verify at build time that both directions are journaled (07 §3 says they are).
- **Window everything to the episode.** `computeExcursion(combined.slice(to episode window))`; `assembleRetrospectiveEvents` **already takes a `window`** param — pass the episode's `[open, close]`. Contributors window the same way. The only genuinely new logic is boundary derivation.
- **Storage — two options:**
  - *(a) reconstruct-on-read* — derive episodes from the journal each render; cheap to start, but frozen per-episode metrics + narrative need a home.
  - *(b) `thesis_expression_episodes` table* (recommended) — `thesis_id`, `thesis_type`, `episode_no`, `opened_at`, `closed_at`, `retrospective_metrics` jsonb, `outcome`, `execution_quality`, `narrative`/journal ref. Clean, queryable, frozen-at-close per episode. Migrate the current thesis-level `retrospective_metrics`/`outcome` into "episode 1".
- **Worklist change:** key on "a **closed episode** without a retrospective" rather than "thesis has any retrospective". This is the precise fix for the one-and-done caveat (07 §4d) — the prior episode's frozen metrics persist; the new episode tracks live from its reopen.
- **`record-retrospective.ts`:** write per-episode (episode_no / date range), not overwrite thesis-level.
- **UI:** card shows the **latest** episode; the `RetrospectivePanel` shows latest + a collapsible **"prior episodes"** history, each its own two-axis verdict + mini excursion.
- **`complete`/`rejected` = terminal final episode** (no reopen); `closed` = a closeable episode that may be followed by another.

### 2c. Footprint
Contained, mostly reuse (`computeExcursion`, `assembleRetrospectiveEvents` windowing, the panel). One migration (the episodes table), a worklist-key change, a `record-retrospective` change, and a panel history section. **Independent of W8** — can ship before or after Pathway A.

---

## 3. Sequencing & build sketch

| Phase | Pathway | Size | Gate |
|---|---|---|---|
| E1 | **B** — `thesis_expression_episodes` table + boundary derivation from the status-change journal (+ unit tests on boundary logic) | S/M | — (foundation; do this first so reopened macros get episodic tracking for free once A lands) |
| E2 | **B** — windowed excursion/events/contributors per episode; worklist keys on un-retrospected closed episode; `record-retrospective` per-episode; migrate current metrics → episode 1 | M | E1 |
| E3 | **B** — UI: latest-episode default + prior-episodes history on card/panel | S | E2 |
| A1 | **A** — detector: claim-cluster (relate-research "no active thesis" bucket) + asset-cluster (coverage report) with **no existing-macro match** | M | — (W8) |
| A2 | **A** — `/thesis-review` macro-emergence mode → `cluster_claims_to_thesis` (`thesisKind:'macro'`) decision, deduped vs macroCatalog | M | A1 |
| A3 | **A** — `resolve-decision.ts` action → `create-macro-thesis` + link assets/claims → cascade | S | A2 |

**Recommended order:** E1 first (cheap, foundational, makes the measurement side correct *before* the supply side increases churn) → E2/E3 as a self-contained 07 follow-on → A1–A3 **inside the W8 build** (it's the `cluster_claims_to_thesis` implementation; building it standalone would duplicate the relate-research/framing wiring). They can also proceed fully in parallel — the only coupling is that B should exist before A's churn makes it matter.

---

## 4. Open decisions

**A — macro emergence**
1. Reuse `cluster_claims_to_thesis` with a `thesisKind` field (recommended, keeps the catalog tight) vs a dedicated `propose_macro_thesis`?
2. Entry points: research-driven only (claim clusters), or also structure-driven (asset clusters with no macro)? (Lean: both, research-driven first.)
3. Auto-create bar: confirmed **never auto** (creating a belief is always a decision)? (Lean: yes — never auto.)
4. Macro→Macro emergence (a macro that frames *other* macros) — in scope or defer? (Lean: defer; rare.)

**B — episodic performance**
5. Reconstruct-on-read vs `thesis_expression_episodes` table? (Lean: table.)
6. Migrate existing thesis-level `retrospective_metrics`/`outcome` into "episode 1", or leave legacy retrospectives thesis-level and start episodes fresh? (Lean: migrate to episode 1.)
7. Does a `developing → monitoring → developing` blip (expression that opened and closed *without* ever resolving to `closed`) count as an episode? (Lean: only count spans that reach `closed`/`complete`/`rejected`; ignore sub-threshold flicker — tie to the same dust/flap guards the cascade already uses.)

---

## 5. Non-goals (this sketch)
- Not building either now — this is the scoping artifact.
- No change to the cascade's status rules (07 §3) — episodes are *read* from the transitions it already journals.
- No auto-creation of macros, ever — emergence always escalates to a Decision Item.
