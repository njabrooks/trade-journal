# 16 — Parallel lane briefs: P2 / P3 / P4 of the self-improving loop

> **Status:** HANDOFF — 2026-06-24. Splits the post-P1 work ([docs/v2/14 §11](14-thesis-tracking-evidence.md#11-build-priority-value-orderedto-refine-at-spec-time))
> into **two parallel lanes** that share one pinned contract (§1) and otherwise touch disjoint files.
> P1 is fully built ([docs/v2/15](15-signal-quality-diagnostics.md), commits `9366ede`/`42b3f31`/`7c3d02c`).
> Each lane brief below (§2, §3) is self-contained — drop it into its own context.
>
> **Producer is live.** `thesis-observe`@07:00 + `collect-signal-data`@06:30 + `maintenance`@08:00/20:00
> are activated (launchd, installed 2026-06-24 20:53); first scheduled runs **2026-06-25**. So the data
> gate is *closing* — both lanes can be **built now** (the code doesn't need data); P2/P3's *value* ramps
> as observe history accrues over ~1–2 weeks. P4 is ungated (immediate value).

## 0. The split (why two lanes, not three)
- **Lane A = P4 + P2** — everything on the **observe-report surface** (price-watch, escalation, cadence,
  candidate-signal harvesting). One owner, because P4 and P2 both edit `ingest-world-monitor.ts` and the
  `thesis-observe` skill template — splitting them would collide.
- **Lane B = P3** — the **synthesis surface** (observation-driven re-underwrite, the signal=statement+sensor
  object model, sensor triage). Disjoint from Lane A; its only dependency (P1 diagnostics) is done.
- They meet at exactly **one contract** (§1): where *re-underwrite inputs* live. Pin it first; then the
  lanes never touch.

## 1. THE SHARED CONTRACT (both lanes build against this — do not change it unilaterally)

The seam is **"re-underwrite inputs"** — what a re-underwrite reads to know *what the tracking revealed*.
Two parts, surfaced together on the `/thesis` data surface:

**1a. `signalQuality`** — already built (P1). Present on `thesis-snapshot.ts` output: `{ chronicNeutralSignals[], coverageGaps[], signalVerdicts[], reunderwriteTrigger, reason }`. **Lane B consumes it; neither lane edits it.**

**1b. `candidateSignals`** — NEW (Lane A produces, Lane B consumes). The contract:
- **Store:** `journal_entries`, **no migration** (mirrors how decisions live in the journal):
  - `action_type = 'candidate_signal'`
  - `object_type ∈ {asset_thesis, macro_thesis}`, `object_id = thesisId`, `object_title = thesis title`
  - `action_description = the proposed signal statement`
  - `source = 'automation'`, `status = 'active'` (→ `'resolved'` when promoted to a real signal, `'dismissed'` when rejected)
  - `metadata.candidateSignal = { statement, sourceUrl, observedAt (ISO), fromReport (path), rationale }`
  - **Dedup:** one active candidate per `(object_id, normalized statement)` — Lane A enforces (bump, don't duplicate), mirroring `raise-decision.ts` §8.2.
- **Surface:** `thesis-snapshot.ts` gains a sibling field to `signalQuality`:
  ```ts
  candidateSignals: [{ id, statement, sourceUrl, observedAt }]   // active 'candidate_signal' rows for this thesis
  ```
  **Lane A adds this read** (it owns `thesis-snapshot.ts` for this change). Lane B treats the snapshot
  output as a **read-only contract**.
- **Consumption:** Lane B's re-underwrite reads `signalQuality` + `candidateSignals`, promotes the
  genuinely load-bearing candidates into real signals (via the articulation it writes) and **marks the
  promoted/rejected candidate rows `resolved`/`dismissed`** so they stop resurfacing. (Lane B writes a
  one-line helper `scripts/ops/resolve-candidate-signal.ts` or reuses the journal update — its call.)

**1c. File ownership (prevents parallel edits to the same file):**
| File | Owner | The other lane |
|---|---|---|
| `scripts/ingest-world-monitor.ts`, `.claude/skills/thesis-observe/SKILL.md`, `scripts/ops/find-theses-due-observe.ts` | **Lane A** | — |
| `scripts/ops/thesis-snapshot.ts` (adds `candidateSignals`) | **Lane A** | Lane B reads its JSON only |
| `.claude/skills/build-core-argument/`, `scripts/insert-thesis-articulation.ts`, the signals **object model** | **Lane B** | — |
| `src/db/schema.ts` signals table | **Lane B** (sensor/object-model) | **MUST stay additive** — do not rename/drop `statement`, `explicit_details`, `category`, `status` (Lane A's observe + P1 diagnostics read them) |

**1d. Escalation hook (P4) — check before building.** The health due-logic
(`findMonitoringThesesDueForHealthCheck`, `thesisHealthRules.thesisHealthDue`) already triggers on *new
evidence since last review*. A `confirmed`/`invalidated` observe snapshot **is** new evidence — so
severity-escalation may already be ~free. Lane A: verify, and only add an explicit "hard score → force
due" if the existing due-logic doesn't surface it within one cycle.

---

## 2. LANE A BRIEF — observe-report surface (P4 + P2)

**Goal:** make the producer *accurate from day one* (P4) and *grow the signal set from what it sees* (P2).
Read first: [docs/v2/14 §§3.4–3.6, §4, §10.2, §11 (P4, P2)](14-thesis-tracking-evidence.md), [docs/v2/15 §1 (this is the data the loop runs on)](15-signal-quality-diagnostics.md), the `thesis-observe` skill, `scripts/ingest-world-monitor.ts`, `src/lib/services/livePrices.ts`, `scripts/ops/find-theses-due-observe.ts`. **Honor the §1 contract.**

### P4 — ambient + escalation (ungated, immediate value — do this first)
1. **PRICE & DATA WATCH section** in the observe report + its ingest parse. Per Tier underlying: freshest
   spot + Δ-vs-prior, strategy price-targets proximity, macro data-point thresholds. **Read price via the
   W6 `livePrices.ts` overlay, NOT stale `underlyings.spot`** — this is the direct fix for the
   stale-price / Bearish-Oil miss (the canonical motivation, docs/v2/14 §1, §4). Accept the known unpriced
   gaps (futures/private/bonds) gracefully.
2. **Severity-escalation hook** (§1d) — a `confirmed`/`invalidated` observe score flags the thesis for an
   immediate health look without raising a decision. Verify the existing health due-logic first.
3. **Tier-2/3 cadence due-logic** in `find-theses-due-observe.ts` — currently Tier-1 only; add the
   per-tier floor interval (Tier-2 every ~2–3d, Tier-3 weekly) so a scheduled run picks the right slice.

### P2 — candidate-signal harvesting (gated on observe history; build now, ramps in days)
4. **Harvest** the observe report's existing **"THESIS-RELEVANT NEWS — bears on the thesis but matched no
   signal"** items (the system pointing at its own coverage holes — docs/v2/14 §10.2; today's run flagged
   the $1.4T AI-ROI selloff as exactly one) and **write them as `candidate_signal` journal rows** per the
   §1b contract (with dedup). Likely in `ingest-world-monitor.ts` (it already parses the report) or a thin
   `scripts/ops/harvest-candidate-signals.ts`.
5. **Surface** them: add the `candidateSignals` read to `thesis-snapshot.ts` (§1b). That's the whole
   producer side of the contract — Lane B consumes from there.

**Boundaries:** do NOT touch `build-core-argument` / `insert-thesis-articulation` / the signals object
model (Lane B). Do NOT promote candidates into real signals — that's the re-underwrite's judgment (Lane B).
You only *propose* (write candidate rows) and *surface* them.

**Acceptance:** observe report carries PRICE & DATA WATCH off live prices; a scheduled-equivalent run
writes `candidate_signal` rows for no-signal news; `thesis-snapshot --ticker <X>` shows `candidateSignals`;
`npm run build` + `npm test` + lint green; restart `com.tradej` after build.

---

## 3. LANE B BRIEF — synthesis surface (P3)

**Goal:** close the loop — make re-underwriting act on *what the tracking revealed*, and make the quant
layer self-selecting. Read first: [docs/v2/14 §9 (signal = statement + optional sensor), §10.3, §11 (P3)](14-thesis-tracking-evidence.md), [docs/v2/15 §6.3 (the handoff you consume)](15-signal-quality-diagnostics.md), [docs/v2/10 (the loose-agent re-underwrite model)](10-thesis-underwriting-loose-agent-model.md), the `build-core-argument` skill, `scripts/insert-thesis-articulation.ts`, `scripts/ops/thesis-snapshot.ts` (read-only — your input contract). **Honor the §1 contract.**

1. **Observation-driven re-underwrite** (docs/v2/14 §10.3) — a pass *distinct* from the claim-driven one:
   after a thesis accumulates a window of observations, "given what actually moved this thesis vs what our
   signals tracked, rewrite the resolution section." Concretely: teach `build-core-argument` (and/or the
   `/thesis` re-underwrite step) to **consume the §1 inputs** — `signalQuality.chronicNeutralSignals`
   (sharpen or drop, don't regenerate verbatim), `signalQuality.coverageGaps` (author a covering signal),
   and `candidateSignals` (promote the load-bearing ones into real signals; mark the rest dismissed).
2. **Clean signal = statement + optional sensor object model** (docs/v2/14 §9) — make the linkage
   explicit: one signal = one iteratively-improved **statement** + an *optional* attached **sensor**
   (`explicit_details`). Today the statement (`build-core-argument`) and the sensor (the retired
   `/configure-signal` path) are bolted on separately. **Schema changes MUST be additive** (§1c) — do not
   rename/drop `statement`/`explicit_details`/`category`/`status`.
3. **Sensor triage** (docs/v2/14 §9) — prune laggy-proxy sensors; keep only the decision-grade ones (the
   four criteria: decision-grade · faithful-not-proxy · cheap/reliable · easily-missed-qualitatively). Let
   the chronic-neutral diagnostics inform which proxies are low-information. A `scripts/ops/` triage report
   + the keep/drop writes.

**Boundaries:** do NOT edit the observe skill, `ingest-world-monitor.ts`, `find-theses-due-observe.ts`, or
`thesis-snapshot.ts` (Lane A). Consume `thesis-snapshot`'s JSON as a fixed contract; if you need a new
field on it, note it as a contract change for Lane A rather than editing in parallel.

**Acceptance:** a re-underwrite on a thesis with `signalQuality`/`candidateSignals` visibly acts on them
(drops a chronic-neutral statement, promotes a candidate, covers a gap) and marks consumed candidates
resolved/dismissed; the signal object model has an explicit statement↔sensor link; sensor-triage report
runs; `npm run build` + `npm test` + lint green.

---

## 4. Kickoff (per context)
- **Lane A:** *"Read docs/v2/16 §1 + §2 and execute Lane A (P4 then P2). Start with a touch-point audit of the files in §1c/§2 to confirm the collision map, then P4's PRICE & DATA WATCH off livePrices."*
- **Lane B:** *"Read docs/v2/16 §1 + §3 and execute Lane B (P3). Start with a touch-point audit, confirm the §1 input contract on thesis-snapshot, then the observation-driven re-underwrite consuming signalQuality + candidateSignals."*

Each lane: branch off `main`, build incrementally, `npm run build`/`npm test`/lint green before commit,
restart `com.tradej` after any build, and stage **only** that lane's files (the working tree has unrelated
pre-existing changes — never `git add -A`).
