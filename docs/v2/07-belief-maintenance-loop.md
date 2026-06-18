# Trade Journal v2 — Belief-Maintenance Loop (W8 thesis-review, full design)

**Date:** 2026-06-18
**Status:** design — for sign-off before build (effort: xhigh)
**Builds on:** [03-v2-spec.md](03-v2-spec.md) (W8 row), the shipped relate-research engine, [06-notes-repo-cutover-plan.md](06-notes-repo-cutover-plan.md)
**Governing principle:** the system (with Claude inside) does the relating, synthesizing, and reviewing; Nick only touches genuine decisions.

---

## 1. What this is

A single automated loop that keeps the belief layer honest with almost no manual work:

```
research read ─▶ claims linked to theses ─▶ supporting DIGEST (developing)
                                              │
                          position opened ────▶ promote to MONITORING (expression-driven)
                                              │
                                              ▼
                                  INVALIDATION digest = SIGNALS derived from the
                                  same claims (+ inherited from parent macros)
                                              │
                          new research read ──▶ routed to signals as evidence
                                              │
                          position closed ────▶ thesis CLOSED ─▶ retrospective
```

Two halves:
- **Deterministic spine** — a status cascade computed every ingestion run. No judgment. (§3)
- **Claude synthesis** — claims→digest→signals→retrospective, triggered by the spine. Judgment, but auto by default; user only at genuine decision points. (§4–§5)

relate-research (shipped) is the claim→thesis front half. This doc adds the lifecycle cascade, the auto-synthesis of digests and signals, and the expression-driven monitoring switch.

---

## 2. The core switch: expression-driven monitoring

**Old (v1, being replaced):** `developing → monitoring` was *signal-gated* — `insert-thesis-articulation.ts` promotes to monitoring only if `signalsCreatedCount > 0`. Signals were the gate.

**New (v2):** monitoring is *expression-driven* — a thesis is `monitoring` iff it has live expression (an active strategy). Signals are no longer the gate; they are an **artifact of being in monitoring**, auto-derived from the thesis's claims at promotion.

| Status | Meaning | Entry condition |
|---|---|---|
| `developing` | belief in formation; no live position | thesis created; or re-opened without a position |
| `monitoring` | live position on; actively watched | first active strategy attaches (asset directly; macro via a linked asset) |
| `closed` | was expressed, now flat; retained for journal/analysis | expression fully gone (cascade); reopenable |
| `rejected` | belief abandoned (judgment) | user/agent decision — unchanged |

`closed` is **new** (free-text column, no migration; needs UI badge + transitions — §6). It is distinct from `complete`: `complete`/`rejected` mean *resolved* and fire a retrospective; `closed` means *dormant but intact* and reopens on re-expression.

**Ripple (must be handled, §7):** ~30 currently-held theses sitting in `developing` re-status to `monitoring` once the cascade runs (after the §6 hygiene fix). relate-research then routes their evidence to **signals not claim-links** — so a freshly-promoted monitoring thesis must get signals generated *before/at* promotion, else evidence has nowhere to land.

---

## 3. The deterministic status cascade

Runs inside the existing post-ingestion recompute (`recomputeAccountStrategyStatuses`, `src/lib/derived/strategyAuto.ts:1077`), extended upward from strategies to theses. Pure state derivation; logs each transition to `journal_entries` (`source='automation'`).

```
STRATEGY     open positions = 0                      → complete   (reopen→active if positions reappear)
                                                        [requires the §6 hygiene fix to be accurate]

ASSET THESIS active/draft strategies ≥ 1             → monitoring (promote from developing)
             active/draft strategies = 0
               AND has ≥1 strategy ever              → closed
             never had a strategy                    → stays developing (building)
             re-expression                           → closed → monitoring

MACRO THESIS any linked asset thesis is monitoring   → monitoring (promote from developing)
             all linked assets closed/developing
               AND macro was monitoring              → closed
             never reached monitoring                → stays developing
             re-expression of a linked asset         → closed → monitoring
```

Notes:
- "Current holding" is judged from **strategy status**, never raw `positions.is_open` — `is_open` freezes `true` on the last snapshot of an exited position (NVDA's froze on 2026-02-24). The §6 fix makes strategy status the reliable signal.
- A macro with no asset theses (pure top-down belief) can sit in `developing` indefinitely — correct.
- Cascade is idempotent and order-independent within a run: recompute strategies → recompute asset theses → recompute macro theses.

---

## 4. The belief-maintenance synthesis (where Claude runs)

The cascade emits triggers; a Claude job (the W8 `thesis-review` skill) acts on them. Synthesis reuses the **existing** `thesis_articulations` (the digest) and `signals` tables and the `scripts/insert-thesis-articulation.ts` writer — what changes is that synthesis becomes automatic and continuous instead of a manual `/build-core-argument` invocation.

### 4a. DEVELOPING → supporting digest (auto)
When a developing thesis has accumulated new linked claims (trigger: `current claim count − claimsCountAtLastArticulation ≥ K`, a field the schema already tracks), synthesize/refresh the **digest** = a new `thesis_articulations` version:
- `core_argument`, `key_drivers` (with `supporting_claims`), `key_assumptions`, `timeframe`, `confidence_level` + `confidence_rationale`, `evidence_gaps`, `claim_ids_used`.
- This is the "how do these claims support the thesis" synthesis, done from `claim_thesis_mappings` (`mapping_type='supports'|'foundation'`) plus the Toulmin structure of each `main_claim` (evidence/reasoning/backing/qualifier/**rebuttal**).
- **Refuting claims** (`mapping_type='refutes'`) feed `evidence_gaps` and pre-stage invalidation signals.
- Versioned (no destructive overwrite); `generated_by='claude'`. Low-stakes → **auto, no confirm**.

### 4b. PROMOTION to MONITORING → qualitative invalidation digest = signals (auto-draft)

**Signals are qualitative and agent-operable, not metric-tracked.** The v1 model (precise metrics + `explicit_details` wiring + `/configure-signal` + data feeds) was too manual to survive and too specific to automate. v2 signals are **falsifiable plain-language criteria the agent judges against incoming evidence** — `category='judgment'`, `explicit_details=null` by default. Quantitative wiring (`explicit_details` via `/configure-signal`, `collect-signal-data`) is retained but becomes a **rare opt-in** for the few signals where a hard threshold genuinely matters and a feed exists — never the default path. Qualitative ≠ vague: each signal must still be specific enough that the agent can render `strengthening / weakening / invalidated` on it.

When the cascade promotes a thesis to `monitoring`, derive signals from the current digest + claims (the build-core-argument signal logic, automated and qualitative):
- **invalidation** = inverted `key_assumptions` + the thesis's `refutes` claims/rebuttals (the "what would change my mind" digest).
- **confirmation** = from `key_drivers`; **completion** = from `timeframe`.
- Inherit **compositional** invalidation from parent macros via `gated_by` / `referenced_theses` (`dependent_thesis_id` + `dependent_thesis_condition` already in schema) — a macro flipping invalid cascades to its dependent asset theses, no data feed needed.
- Each signal carries `linked_claim_ids` + `source_section` provenance.
- **If the thesis is too thin to ground signals** (see §4e — few/no claims, no/low-confidence digest), do **not** fabricate them. Generate what the evidence supports, mark the rest as gaps, and raise the research-gap flag instead.
- Default **auto-active** (reversible); surface only low-confidence signals on the DecisionStrip.

### 4c. MONITORING → qualitative evidence assessment (auto)
- relate-research's **signal route** records new research as `signal_data_snapshots` (`data_source='research_routing'`) + `claim_signal_evidences` with a qualitative `assessment` (strengthening/weakening/invalidated). Already shipped; idempotent.
- **Periodic thesis-health pass** (the thesis-review job): the agent re-reads each monitoring thesis's signals against the latest routed evidence + price/portfolio context, renders a current verdict per signal, and rolls up to a thesis-health view. Writes a `signal_data_snapshot` only on a **material change** (D3 change-only policy) and raises a **DecisionStrip item only on weakening/invalidation** — never a "still fine" notification.
- Digest continues to refresh (4a still runs) so the supporting picture stays current alongside the invalidation picture.
- v1.1: extend the signal route beyond exact-ticker to the judged macro/sector matches (currently deferred).

### 4d. CLOSE → retrospective (auto)
- On `→ closed` (or `complete`/`rejected`), supersede live signals (existing supersession path) and fire the **retrospective** job (W8): final P&L (W4 engine), duration, what the journal trail shows, was-I-right → `journal_entries` + performance card. `closed` retains everything for analysis; `complete`/`rejected` are the resolved variants.

### 4e. Research-gap bridging (the position→thesis backfill arc)
Expression-driven monitoring means a position can open **before** the research exists, leaving a thin thesis that can't ground a digest or signals. The loop detects and bridges this rather than fabricating belief:
- **Detect** (deterministic, in the cascade): a `monitoring` thesis (live position) with a low **thesis-completeness** score — few/no linked claims, no current digest, or low-confidence digest. Flag it.
- **Tana first:** the agent pulls what already exists in Tana for the underlying/theme (the source of truth for everything read) and runs it through the claim-gen → relate-research path before declaring a gap.
- **Bridge** (agent — the genuine decision point): surface a DecisionStrip item — *"live position on X, thin thesis — here are sources to develop it"* — proposing specific articles/sources to capture into Tana (`/tana-inbox`), which flow back through claim-gen → relate-research → digest → signals. Optionally, on request, run a deeper `deep-research` pass and feed the result in.
- This inverts the normal capture→thesis→position flow into **position→backfill**, the mechanism that makes "every live position eventually has a reasoned, monitored belief" automatic without inventing one.

---

## 5. Deterministic vs agent — the decision points

| Step | Who | Confirm? |
|---|---|---|
| strategy/asset/macro status cascade | deterministic | no |
| supporting digest synthesis (4a) | Claude | no (auto, versioned) |
| signal generation on promotion (4b) | Claude | DecisionStrip glance (default auto) |
| evidence assessment + thesis-health pass (4c) | Claude judgment (relate-research + thesis-review) | weakening/invalidation → DecisionStrip; "still fine" → silent |
| **auto-draft a thesis for a newly-held underlying with none** | Claude | **yes — genuine "is this a belief or a tactical hedge?" call** |
| **research-gap bridge for a thin live thesis (4e)** | Claude | **yes — propose Tana sources / deep-research to develop it** |
| quantitative signal wiring (`/configure-signal`) | user/Claude, rare opt-in | on demand only |
| retrospective (4d) | Claude | no |

Real human/agent decision points are few: *should this new exposure get a thesis*, *bridge a thin live thesis with research*, and *(optionally) confirm low-confidence signals*. Everything else is automatic. Note the agent's job is to **operate** the qualitative signals (render verdicts, surface material changes) — not to make the user maintain metric thresholds.

---

## 6. Foundation (build FIRST): strategy-status hygiene

The cascade is only as accurate as strategy status, and that is currently broken:
- Held-right-now names (LLY, CVX, EWZ, SNDK, SBN6, DOGE, ETH, MRVL — snapshotted 2026-06-17/18) have **no active/draft strategy**: their strategy is stale-`complete` or their positions are among the **1,927 open positions with `strategy_id = NULL`**.
- If the cascade ran today it would wrongly `close` these.

Work:
1. Root-cause why `recomputeStrategyStatus` / `autoLinkPositionsToStrategies` leaves currently-held positions unstratified or their strategies stale-complete (candidates: recompute only iterating accounts that re-ingested; auto-link asset-class gaps; stale `is_open` rows confusing the open-position check — the recompute must use *latest-snapshot-per-holding*, not any `is_open`).
2. Re-link the 1,927 null-`strategy_id` open positions (filter to genuinely-current via latest snapshot) and re-activate the wrongly-`complete` strategies for held names.
3. Add a standing **coverage report** (held underlying with no active strategy; active strategy with no thesis; asset thesis with no macro) — the linker's permanent self-check.

Only once strategy status reliably reflects the current book do we switch the asset/macro cascade on.

---

## 7. Interplay & migrations

- **relate-research lifecycle rule:** today claims link to `developing` only; `monitoring` gets signal evidence. Keep — but ensure promotion (4b) generates signals *before* evidence routing kicks in. Fallback: a monitoring thesis with zero signals still accepts claim-links until its signals exist (prevents evidence loss in the promotion gap).
- **`insert-thesis-articulation.ts` change:** decouple promotion from `signalsCreatedCount` (cascade owns promotion now). Keep versioning, supersession, provenance.
- **One-time re-status:** after §6, run the cascade once to re-status the ~30 held `developing`→`monitoring` and generate their initial signals (supervised batch, dry-run first — same discipline as the cull).
- **`closed` support:** add to UI status badges + filters; add `developing↔closed`, `monitoring↔closed` to `update-entity-status.ts` `VALID_TRANSITIONS`; ensure relate-research catalog stays `developing`+`monitoring` only (closed correctly excluded — already true).
- **Trigger cadence / token cost:** digest re-synthesis is gated by the `claimsCountAtLastArticulation` delta (don't re-run every ingestion). thesis-review runs periodic + on cascade events, not per-tick.

---

## 8. Open decisions

1. **Qualitative-signal scope:** keep the quantitative path (`explicit_details`/`configure-signal`/`collect-signal-data`) dormant-but-available for rare hard thresholds, or rip it out entirely? (Lean: keep dormant — working infra, no cost to leave; just stop defaulting to it. Existing wired signals on BTC/GLXY/HYPE stay.)
2. **Thesis-health cadence:** how often does the thesis-review pass re-assess monitoring theses — daily, weekly, or only on new routed evidence + price moves past a band? (Lean: on-evidence + a weekly floor.)
3. **Auto-draft-thesis bar:** every newly-held underlying without a thesis → draft, or only above a size/conviction bar? (Tactical hedges shouldn't spawn theses.)
4. **Research-gap mode:** default to *suggesting* Tana sources (cheap, keeps your curation loop) vs *auto-running* `deep-research`? (Lean: suggest by default, deep-research on request.)
5. **Digest re-synthesis threshold K** (claims added since last version) — start at e.g. 3, tune.
6. **macro promotion:** does a single live linked asset flip a macro to monitoring, or a threshold of linked exposure?

---

## 9. Build sequence

| # | Step | Size | Gate | Status |
|---|---|---|---|---|
| B0 | Strategy-status hygiene fix + coverage report (§6) | M | — (foundation) | **DONE** 2026-06-18 (`7e040c2`) |
| B1 | `closed` status: UI badge + transitions + docs | S | B0 | **DONE** 2026-06-18 |
| B2 | Deterministic asset/macro cascade in the recompute (§3) | M | B0 | **DONE** 2026-06-18 (gated off — see below) |
| B3 | One-time supervised re-status of held `developing`→`monitoring` (dry-run) | S | B2 | **DONE** 2026-06-18 (43 applied) |
| B4 | Auto digest synthesis (4a) — automate build-core-argument, delta-triggered | M | B2 | pending |
| B5 | Auto **qualitative** signal derivation on promotion (4b); decouple promotion from signals in insert-thesis-articulation; thesis-health pass (4c) | M | B4 | pending |
| B6 | Research-gap detection + bridge (4e): thesis-completeness score, Tana-first pull, DecisionStrip source suggestions | M | B2, B4 | pending |
| B7 | Retrospective on close (4d) | S/M | B2, W4 | pending |
| B8 | Notes-repo flip (relate-research becomes the live path) | S | — (independent; user go) | pending |

Recommended: B0 → B1 → B2 → B3, validate, then B4/B5, then B6/B7; B8 anytime after user go.

### B1 + B2 build notes (2026-06-18)

**B1 — `closed` status.** Free-text column (no migration). UI support added to `LifecycleBadge`, `EntityBadge`, `Badge`/`EntityStatusBadge`, `MacroThesisSidebar`, `StatusTimeline`, and both thesis browsers (filter + sort order: draft→developing→monitoring→closed→complete→rejected). Transitions added to `update-entity-status.ts` `VALID_TRANSITIONS`: `developing↔closed`, `monitoring↔closed`, and `closed → {monitoring, developing, complete, rejected}` (re-express or resolve). relate-research catalog already excludes `closed` (`ACTIVE = ['developing','monitoring']`). Note: **16 asset theses already carried `status='closed'`** in the live DB and were rendering via the badge fallback — B1 gives them proper styling.

**B2 — deterministic cascade.** Pure rules in `src/lib/derived/thesisCascadeRules.ts` (DB-free, 16 unit tests); DB orchestration `cascadeThesisStatuses({ dryRun, source })` in `src/lib/derived/thesisCascade.ts`. Wired into `recomputeAccountStrategyStatuses` (`strategyAuto.ts`) — the single chokepoint all 8 ingestion paths (flex + 5 crypto) funnel through. Idempotent + flap-safe (reads the global picture, writes only genuine transitions), so firing from the per-account hook is correct despite the cascade being global.

- **Gated default-OFF** behind `THESIS_CASCADE_ENABLED` (set to `1`/`true` to enable). This honours the B2→B3 sequence: B2 ships the engine wired-but-dormant so the next cron ingestion can't auto-fire the ~30 held re-statuses before B3's supervised run. Flip the flag on **after** B3 validates, for ongoing maintenance.
- **Monitoring requires an *active* strategy, not active/draft** (a deviation from the literal §3 wording, aligning with §2 "live position on" — draft strategies have no positions, so promoting on draft would start the signal machinery for a non-existent position). See `deriveAssetThesisStatus` doc comment.
- **"Was expressed" is read from current status** (`monitoring`|`closed`), not historical strategy counts — so the cascade never mass-closes legacy `developing` theses that were held under v1's signal gate; those go through B3/the cull. A `developing` thesis with no active strategy stays developing.
- **Open decision #6 resolved:** a single live linked asset flips a macro to monitoring (no linked-exposure threshold).
- **Validated dry-run (2026-06-18):** 61 eligible asset theses + 39 macro; **44 transitions** initially — refined to **43** during B3 (see below).

**B3 — supervised first re-status (applied 2026-06-18).** Ops script `scripts/ops/cascade-thesis-status.ts` (dry-run by default, `--apply` to write, `--json` for machine output; invokes `cascadeThesisStatuses` directly, bypassing the env gate). Reviewing the dry-run surfaced two edges that were validated before applying:
- **Dust positions:** DOGE/ETH carry sub-dollar dust on the latest snapshot but their crypto strategies have `closed_at` set (deliberate close 2026-03-05), so `recomputeStrategyStatus` keeps them `complete` — their theses correctly do **not** promote. SNDK is flat. None are the B0 stale-cadence bug.
- **Pure top-down macro fix:** the initial rule would have closed "Bullish National Resilience Investment" (currently `monitoring`, **zero linked asset theses**). A macro with no expression pathway is judgment-driven (§3: "can sit in developing indefinitely"), so `deriveMacroThesisStatus` now returns null when `hasLinkedAssets` is false — the cascade leaves pure top-down macros untouched. This dropped the plan 44→43.

Applied **43 transitions** (31 asset `developing→monitoring`, 1 asset `closed→monitoring` [ZEC], 10 macro `developing→monitoring`, 1 macro `monitoring→closed` [Bearish US Equities — 3 linked shorts all closed]), each logged to `journal_entries` (`source=automation`). Post-apply: asset monitoring 3→35, macro monitoring 8→17.

**Flag remains OFF after B3.** `THESIS_CASCADE_ENABLED` stays unset until **B5** (auto qualitative-signal derivation on promotion) lands — otherwise ongoing ingestion would keep promoting theses to `monitoring` with no signals to receive evidence. The ~41 now-monitoring theses sit signal-less in the interim (expected; the §7 fallback keeps claim-links working and relate-research is not yet the live path).
