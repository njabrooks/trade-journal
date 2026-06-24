# 15 — Signal-quality diagnostics (P1 of the self-improving loop)

> **Status:** SPEC + **engine BUILT 2026-06-24** (build-order steps 1–4 of §11: pure rules + DB
> orchestrator + worklist CLI + backtest + observe `collectorTracked` hardening — all tested & validated
> on live data, §9; surfacing into `/maintenance` + `/decisions` and the P3 handoff are the next tranche).
> Specifies **P1** from
> [14 — thesis-observe §11](14-thesis-tracking-evidence.md#11-build-priority-value-orderedto-refine-at-spec-time):
> *"Signal-quality diagnostics (§10.1) — chronic-neutral + surprise detection over snapshot history →
> re-underwrite-due triggers"* plus the bundled `find-theses-due-observe` hardening. This is the
> **keystone** that turns observe from a *logger* into a *learning loop* (14 §10). Author: design
> conversation w/ Claude. Sibling docs: [14 thesis-observe](14-thesis-tracking-evidence.md),
> [10 loose-agent underwriting](10-thesis-underwriting-loose-agent-model.md),
> [09 claim-signal-propagation](09-claim-signal-propagation-operating-model.md),
> [07 belief-maintenance-loop](07-belief-maintenance-loop.md).

## 1. What P1 is (and is not)

P1 reads the per-signal **snapshot history** that thesis-observe now produces and computes two
diagnostics that say *where the signal set itself is weak*:

- **chronic-neutral** (per signal) — observed many times, never discriminated ⇒ the *statement* is
  untestable or irrelevant ⇒ flag it for rewrite-or-drop.
- **surprise / coverage-gap** (per thesis) — the thesis moved materially and *no* signal flagged it ⇒
  a hole in coverage ⇒ flag for a new signal.

Both converge on **one output: a `re_underwrite_due` trigger** carrying the specifics, so the existing
decision → `/thesis` re-underwrite → `build-core-argument` path can *act* on the diagnosis. The
diagnostics **augment** the claim-delta re-underwrite trigger that exists today
([`reunderwriteDue.ts`](../../src/lib/derived/reunderwriteDue.ts)); they replace pure time-based
staleness as the reason a *monitoring* thesis comes due.

**P1 is deterministic and cheap** — a SQL + arithmetic pass over existing tables, no LLM in the
detector itself (the judgment is downstream, in the re-underwrite the trigger invites). It adds **no
tables and no columns** (§5).

**Boundary with P2/P3** (do not build here):
- ❌ **Candidate-signal harvesting** from observe's *"THESIS-RELEVANT NEWS — matched no signal"* section
  → **P2**. P1's surprise detector is **price-based + snapshot-history-based**; the *news-based* coverage
  gap is P2's lane.
- ❌ **Observation-driven re-underwrite pass** (the rewrite that consumes these flags) + the clean
  `signal = statement + optional sensor` object-model refactor + sensor triage → **P3**. P1 *emits a
  diagnostic-aware re-underwrite context* (§6.3) so P3 has something to consume, but does not change
  `build-core-argument`'s synthesis behaviour.
- ❌ Quantitative-sensor "chronic-flat" detection (a collector whose number never moves) — out of scope;
  collector-tracked signals are **excluded** from chronic-neutral (§4.3) and triaged in P3.

## 2. Why now, and the one trap — the data gate

§11 marks P1 *"data-gated: needs a few weeks of observe history to chew on — build now, let it
accumulate."* The gate is real and there is **one trap that must be designed around**:

`thesis_observe` started **2026-06-24** (37 snapshots, 1 day). `thesis_monitor` (its identical-shape
predecessor) ran **2026-03-17 → 2026-04-06** then died (1,101 snapshots / 33 signals). In between, the
whole collection layer was **blind for ~2.5 months** (14 §8), during which the nightly
`daily_synthesis` aggregator wrote **neutral-by-default** rows for every active signal every day
(3,300+ neutral rows that mean *"nobody looked,"* not *"looked and saw nothing"*).

> **The trap:** a naïve "count neutral snapshots" chronic-neutral would flag *every signal* off those
> gap-fill neutrals — a producer outage misread as a thesis-layer weakness. **The diagnostic must count
> only real observation events**, never `daily_synthesis` gap-fill (§4.2). This is the central
> correctness requirement of P1.

Designed correctly, the gate is automatic: a signal is **`insufficient_data`** until it has accumulated
`MIN_TRACKING_OBSERVATIONS` *real* tracking snapshots in the window. So today the engine returns mostly
`insufficient_data` and starts flagging as observe history grows — exactly "build now, accumulate."
**It is still testable today** against the legacy `thesis_monitor` history and synthetic fixtures (§9).

## 3. The two diagnostics — definitions

### 3.1 Chronic-neutral (per signal)

Over a trailing window, among **tracking observations** of a signal, if it was observed enough times and
*never* scored non-neutral, its statement isn't earning its place. Per-signal verdict:

| Verdict | Condition |
|---|---|
| `insufficient_data` | `observedCount < MIN_TRACKING_OBSERVATIONS` — the data gate; not flagged |
| `chronic_neutral` | `observedCount ≥ MIN` **and** `nonNeutralCount == 0` — the hard flag |
| `low_information` | `observedCount ≥ MIN` **and** `neutralRate ≥ LOW_INFO_NEUTRAL_RATE` (≤1 stray flip) — soft flag |
| `discriminating` | otherwise — the signal is doing its job; no action |

- **Tracking observation** = a snapshot whose `data_source ∈ {thesis_observe, thesis_monitor}` (the
  daily eyes-&-ears producers — the only sources whose *neutral* means "looked and saw nothing"). See
  §4.2 for why `research_routing`, `daily_synthesis`, and the quant collectors are excluded.
- **Non-neutral** = `assessment ∈ {strengthening, weakening, confirmed, invalidated}`. `neutral`,
  `no_data`, and `NULL` are neutral-equivalent.
- `collector_tracked` signals are **skipped** (verdict `excluded_collector`) — their statement is
  measured by the sensor, not by observe's assessment (§4.3).

### 3.2 Surprise / coverage-gap (per thesis)

A material thesis-level move that **no signal flagged** is a hole. P1 detects the **price** form
(deterministic from price history); the **news** form is P2.

**Asset thesis.** Over `SURPRISE_WINDOW_DAYS`, the underlying's price move is *material* if it clears a
**vol-scaled** threshold (§5.2). It is a **gap** if material **and** no thesis signal had a non-neutral
tracking snapshot within `±FLAG_PROXIMITY_DAYS` of the move's extreme date.

**Macro thesis.** A macro's "move" is really a *news/basket* phenomenon (the §10.2 example is the $1.4T
AI-ROI selloff, not a single price), and its constituents are often unpriced. So **P1 ships chronic-neutral
for macros but DEFERS macro price-surprise to P2's news path** (resolving open decision #4 to its
alternative). The materiality-weighted exposure-roll-up remains the design if a price form is ever wanted,
but the news path is the more faithful detector and avoids vol-scaling a synthetic basket.

**Unpriced names are a clean no-op.** Underlyings absent from `underlyings_iv_history` (some crypto,
private names like SpaceX, futures like CL/GC) produce *no* price surprise — matching the **accepted
price gaps in 14 §4**. Those theses still get chronic-neutral; their move-coverage waits on P2.

> The **Bearish-Oil miss** (14 §1) is the canonical surprise: CL fell to ~$71, a defining move, and
> nothing flagged it. (CL is unpriced here, so it is also the canonical case for *why P2's news path and
> the §4 TradingView-CDP supplement matter* — P1 would catch the equivalent for any priced name, e.g. a
> −22% NVDA leg with silent signals.)

## 4. Data model — what it reads (no new tables)

### 4.1 Inputs (all existing)
| Source | Used for |
|---|---|
| `signal_data_snapshots` (`assessment`, `data_source`, `snapshot_date`, `signal_id`) | chronic-neutral counts; flag-proximity for surprise |
| `signals` (`statement`, `type`, `status`, `category`, `explicit_details`) | the signal set; `collector_tracked` derivation |
| `signal_entity_links` (`thesis_id`, `thesis_type`, `entity_type`) | signals → thesis |
| `macro_theses` / `asset_theses` (`status='monitoring'`) + `underlyings` (`id`, `ticker`, `rv20`) | the active set; vol-scaling |
| `underlyings_iv_history` (`underlying_id`, `as_of_date`, `spot`) | the per-underlying daily price **series** for surprise |
| `asset_thesis_related_macro_theses` + `strategies`/`positions.market_value_usd` | macro materiality weights (reuse `find-theses-due-observe`'s roll-up) |

**Price series decision:** use `underlyings_iv_history.spot` keyed by `(underlying_id, as_of_date)` — it
is dense and current (NVDA 1,212 rows → today; IBIT → today). *Not* `price_history` (keys on `assets.id`,
an accounting table with no clean underlying join) and *not* `underlyings.spot` (latest only, no
history). Read the **freshest** spot via the W6 `livePrices` overlay where the consumer wants live, but
the *history series* for move-detection is `underlyings_iv_history`.

### 4.2 The exclusion rule (the trap fix)
Chronic-neutral counts **only** `data_source ∈ {thesis_observe, thesis_monitor}`. Excluded and why:
- `daily_synthesis` — derived + **gap-filled neutral** ("No observations — neutral by default"); counting
  it is precisely the §2 trap.
- `research_routing` — *development* evidence (claim-driven, episodic), a different axis from daily
  *tracking*; a routed "strengthening" doesn't prove the statement is testable *by observation*. Surfaced
  as context in `--context` output, never in the denominator.
- `thesis_health` — the consumer's own verdicts (would be circular).
- Quant collectors (`fred:*`, `defillama_stablecoins`, `derived`, `hormuz_strait`, …) — `assessment` is
  `NULL`; they carry `observed_value`, not a qualitative score (handled by §4.3 / P3).

### 4.3 `collector_tracked` — derived, shared with the observe hardening
A signal is **collector-tracked** iff `explicit_details IS NOT NULL OR category = 'data_driven'`. Such
signals are excluded from chronic-neutral (measured by their sensor). This is the **same flag** the
bundled hardening surfaces in `find-theses-due-observe` (§8) so observe can *deterministically defer*
them — one derivation, two consumers. Centralise it:

```ts
// src/lib/derived/signalClassification.ts  (new, ~5 lines)
export const isCollectorTracked = (s: { explicitDetails: unknown; category: string | null }) =>
  s.explicitDetails != null || s.category === 'data_driven';
```

## 5. Algorithms + concrete thresholds

Split into a **pure rules** module **`src/lib/derived/signalQualityRules.ts`** (constants + classifiers,
snapshot arrays in → verdict out — unit-tested without a DB) and a **DB orchestrator**
**`src/lib/derived/signalQualityDiagnostics.ts`** (queries + roll-up). This mirrors the codebase's
`thesisHealthRules.ts` ⟂ `thesisHealth.ts` split and is required: vitest blanks the DB env and `@/db`
throws at import, so the tested logic must not transitively import it. All constants exported and tunable.

```ts
export const DIAG_WINDOW_DAYS          = 45;   // trailing window for chronic-neutral
export const MIN_TRACKING_OBSERVATIONS = 8;    // the data gate
export const LOW_INFO_NEUTRAL_RATE     = 0.90; // soft-flag threshold
export const SURPRISE_WINDOW_DAYS      = 30;
export const SURPRISE_MOVE_PCT_FLOOR   = 0.15; // 15% absolute floor (low-vol names)
export const SURPRISE_MOVE_SIGMA       = 2.0;  // × window-scaled rv20 (high-vol names)
export const FLAG_PROXIMITY_DAYS       = 7;    // a flag must sit within ±this of the move extreme
const TRACKING_SOURCES = ['thesis_observe', 'thesis_monitor'] as const;
const NON_NEUTRAL = new Set(['strengthening', 'weakening', 'confirmed', 'invalidated']);
```

### 5.1 Chronic-neutral (pure)
```ts
export function classifySignalChronicNeutral(
  snaps: { assessment: string | null; dataSource: string; snapshotDate: Date }[],
  now: Date,
): { observedCount: number; nonNeutralCount: number; neutralRate: number | null; verdict: ChronicVerdict } {
  const since = new Date(now.getTime() - DIAG_WINDOW_DAYS * 86_400_000);
  const obs = snaps.filter(s => TRACKING_SOURCES.includes(s.dataSource as any) && s.snapshotDate >= since);
  const observedCount = obs.length;
  const nonNeutralCount = obs.filter(s => s.assessment && NON_NEUTRAL.has(s.assessment)).length;
  if (observedCount < MIN_TRACKING_OBSERVATIONS) return { observedCount, nonNeutralCount, neutralRate: null, verdict: 'insufficient_data' };
  const neutralRate = (observedCount - nonNeutralCount) / observedCount;
  const verdict = nonNeutralCount === 0 ? 'chronic_neutral'
                : neutralRate >= LOW_INFO_NEUTRAL_RATE ? 'low_information'
                : 'discriminating';
  return { observedCount, nonNeutralCount, neutralRate, verdict };
}
```
Collector-tracked signals short-circuit to `excluded_collector` before this runs.

### 5.2 Material move (vol-scaled, pure)
`rv20` is annualised realised vol (fraction). Window σ = `rv20 × sqrt(N/252)`. The move is the **largest
in-window displacement from the window-start price** (the extreme), material if it clears the larger of
the absolute floor and the vol-scaled band. Everything reported — magnitude, sign, date, span — refers to
that one extreme point, so the detail string is internally consistent:
```ts
export function isMaterialMove(series: { date: Date; spot: number }[], now: Date, rv20: number | null) {
  const since = new Date(now.getTime() - SURPRISE_WINDOW_DAYS * 86_400_000);
  const win = series.filter(p => p.date >= since && p.date <= now && p.spot > 0).sort((a, b) => +a.date - +b.date);
  if (win.length < 2) return null;                                   // unpriced / too sparse → no surprise
  const first = win[0];
  const extreme = win.reduce((m, p) => Math.abs(p.spot / first.spot - 1) > Math.abs(m.spot / first.spot - 1) ? p : m, win[0]);
  const changePct = extreme.spot / first.spot - 1;
  const windowSigma = rv20 != null && rv20 > 0 ? rv20 * Math.sqrt(SURPRISE_WINDOW_DAYS / 252) : null;
  const threshold = Math.max(SURPRISE_MOVE_PCT_FLOOR, windowSigma != null ? SURPRISE_MOVE_SIGMA * windowSigma : 0);
  return Math.abs(changePct) >= threshold ? { magnitudePct: Math.abs(changePct), changePct, moveDate: extreme.date, threshold } : null;
}
```
*Worked sizing:* NVDA `rv20≈0.45` → windowσ≈0.155 → 2σ≈31% (floor 15% inert). A 0.18-vol name → 2σ≈12% →
**15% floor binds**. So the bar self-scales: big movers need a big move, quiet names a fixed 15%. **Why
the extreme, not net point-to-point** (revised at build time on the first live case): a silent 22%
drawdown that partially recovers is still a coverage gap the signal set missed — net point-to-point would
hide it AND pairs an inconsistent %/span in the detail. The extreme catches the swing and reads
consistently ("HLIT −22% over 9d"). Round-trip sensitivity is intentional for a *coverage* diagnostic;
`rv20` is often NULL (e.g. HLIT), so the floor frequently binds.

### 5.3 Surprise (per thesis)
A material move is a **gap** iff no thesis signal had a non-neutral tracking snapshot in
`[moveDate − FLAG_PROXIMITY_DAYS, moveDate + FLAG_PROXIMITY_DAYS]`. Macro: compute the
materiality-weighted return of linked-asset underlyings (Σ wᵢ·retᵢ, wᵢ = open MV share), same threshold
logic, check macro-linked signals only.

### 5.4 Roll-up to the thesis trigger
```ts
export interface ThesisSignalQuality {
  thesisId: string; thesisType: 'macro' | 'asset'; title: string;
  signals: SignalDiagnostic[];           // per-signal verdicts (incl. excluded_collector / insufficient_data)
  chronicNeutralSignals: SignalDiagnostic[];   // verdict ∈ {chronic_neutral, low_information}
  coverageGaps: CoverageGap[];
  reunderwriteTrigger: boolean;          // chronicNeutralSignals.length > 0 || coverageGaps.length > 0
  reason: string;                        // "2 chronic-neutral signals; NVDA −22%/18d unflagged"
}
export async function computeSignalQualityDiagnostics(): Promise<ThesisSignalQuality[]>;
```
Only **monitoring** theses with active signals are evaluated (mirror `find-theses-due-observe`'s set).

## 6. Output contract — augmenting `re_underwrite_due`

### 6.1 No new decision type
Reuse **`re_underwrite_due`** ([decisions.ts](../../src/lib/types/decisions.ts)) — the runbook is
identical (`/thesis <X> re-underwrite`). Distinguish the trigger in `evidence_context`:
```jsonc
{
  "decisionType": "re_underwrite_due",
  "objectType": "asset_thesis", "objectId": "<id>", "objectTitle": "NVDA — …",
  "title": "Re-underwrite NVDA — signal set weak (2 chronic-neutral, 1 coverage gap)",
  "whyRaised": "2 signals observed ≥8× over 45d and never discriminated; NVDA moved −22% over 18d with no signal flagged.",
  "evidenceContext": {
    "trigger": "signal_quality",
    "chronicNeutralSignals": [{ "signalId": "…", "statement": "…", "observedCount": 14, "nonNeutralCount": 0, "verdict": "chronic_neutral" }],
    "coverageGaps": [{ "kind": "price", "detail": "NVDA −22% over 18d", "magnitudePct": 0.22, "moveDate": "2026-06-11", "flaggedWithin": false }]
  },
  "recommendedActions": [
    { "action": "re_underwrite", "label": "Re-underwrite (sharpen/replace weak signals, cover the gap)" },
    { "action": "dismiss_tactical", "label": "Dismiss — move was noise / signals fine as-is" }
  ],
  "defaultRecommendation": { "action": "re_underwrite", "confidence": "medium" }
}
```
`raise-decision.ts` already dedupes against an active decision per object ⇒ re-runs heal, don't pile up.
When the claim-delta trigger *and* signal-quality trigger both fire, **merge into one** packet (one
`re_underwrite_due` per thesis) with both reasons in `evidence_context` — don't raise two.

### 6.2 Surfacing — same two paths as today's re-underwrite
- **`/decisions` + `list-decisions.ts`** already rank `re_underwrite_due` (priority 1) as a latent
  worklist — signal-quality triggers appear there for free once raised. Add the new
  `find-signal-quality-issues.ts` worklist to the latent set list-decisions reads, alongside
  `find-theses-due-reunderwrite.ts`.
- **`/maintenance`** gains a drain step (§7) that runs the deterministic detector and raises the packets.

### 6.3 Diagnostic-aware re-underwrite context (the P3 handoff)
So the re-underwrite the trigger invites can *act*, expose the diagnostics where `/thesis` re-underwrite
and `build-core-argument` already load context: add a `signalQuality` block to the re-underwrite/context
payload (`thesis-snapshot.ts` / the build-core-argument input) listing each signal's verdict +
`observedCount` + the coverage gaps. **P1 only attaches the data**; the synthesis change that *consumes*
it (rewrite chronic-neutral statements, author a gap-covering signal) is P3. Attaching now means the
context is ready and a human re-underwriting via `/thesis` sees it immediately.

## 7. Integration points (files)

Status key: ✅ = built + validated in this tranche (build-order steps 1–4); ⏳ = the surfacing/handoff
tranche (build-order steps 5–6), not yet wired.

| # | Change | File | Status |
|---|---|---|---|
| 1 | Pure rules — constants + classifiers (§5) | **new** `src/lib/derived/signalQualityRules.ts` | ✅ |
| 2 | DB orchestrator — `computeSignalQualityDiagnostics` + `gatherSignalQualityContext` | **new** `src/lib/derived/signalQualityDiagnostics.ts` | ✅ |
| 3 | Shared `isCollectorTracked` (§4.3) | **new** `src/lib/derived/signalClassification.ts` | ✅ |
| 4 | Worklist CLI: `--json` (triggers) / `--all` / `--context <thesisId> --type <t>` | **new** `scripts/ops/find-signal-quality-issues.ts` | ✅ |
| 5 | **Bundled hardening:** `collectorTracked` per signal in the observe bundle (§8) | `src/lib/derived/thesisHealth.ts`, `scripts/ops/find-theses-due-observe.ts`, `.claude/skills/thesis-observe/SKILL.md` | ✅ |
| 6 | Unit tests (pure classifiers, 24) | **new** `src/lib/derived/__tests__/signalQualityRules.test.ts` | ✅ |
| 7 | Backtest harness over legacy `thesis_monitor` (§9.2) | **new** `scripts/ops/backtest-signal-quality.ts` | ✅ |
| 8 | Maintenance drain step "signal-quality diagnostics" (deterministic; raises merged `re_underwrite_due`) | `.claude/skills/maintenance/SKILL.md` | ⏳ |
| 9 | Add to latent worklists ranked by `/decisions` | `scripts/ops/list-decisions.ts` | ⏳ |
| 10 | Attach `signalQuality` block to re-underwrite context (P3 handoff, §6.3) | `scripts/thesis-snapshot.ts` (+ build-core-argument input) | ⏳ |

The maintenance step is deterministic and idempotent ⇒ **not** subject to the ≤5-items/run cap; run the
full detector each pass (it's a couple of grouped queries + arithmetic). Only the *re-underwrite it
invites* costs Opus, and that's the user's decision, downstream.

## 8. The bundled hardening — `collectorTracked` in `find-theses-due-observe`

§11 folds in *"surface `explicit_details`/`collector_tracked` flag in `find-theses-due-observe` so
deferral (14 §3.3) is deterministic, not inferred."* Today the observe skill must **infer** which signals
are quantitative (read the statement, guess) to apply *"defer data-driven signals to
`collect-signal-data` — neutral per data-driven rules."* Make it explicit:

- In `gatherHealthContext` (which the observe bundle reuses), select `signals.explicit_details` and
  `signals.category`, and add `collectorTracked: isCollectorTracked(...)` to each signal in the bundle.
- The `/thesis-observe` skill then deterministically emits `neutral` (deferred-to-collector) for
  `collectorTracked` signals instead of inferring — closing a real correctness gap and removing wasted
  WebSearch on signals a collector already owns.

This is **one derivation feeding two consumers** (observe deferral + chronic-neutral exclusion), which is
why it belongs in P1 rather than as separate polish.

## 9. Testing — how P1 is validated *before* live history accumulates

The data gate (§2) means few live flags today, but the engine is fully testable now. **Results from the
build (2026-06-24):**

1. **Unit tests (pure, 24):** `classifySignalChronicNeutral` / `isMaterialMove` / `hasFlagWithin` /
   `detectPriceCoverageGap` over fabricated arrays — the gate (`< MIN` → `insufficient_data`), the hard
   flag, the stray-flip rescue, vol-scaling (floor binds vs σ binds), the proximity window, the
   source-exclusion trap, and the round-trip "silent drawdown still flags" case. **All green.**
2. **Backtest over legacy `thesis_monitor`** (`scripts/ops/backtest-signal-quality.ts`), two scenarios:
   - **ACTIVE (asOf 2026-04-06):** 33 signals → 21 `chronic_neutral` + 4 `low_information` + 8
     `discriminating`, **invariant violations: 0**. Detects, and spares the signals that discriminated.
   - **BLIND (asOf 2026-06-01):** real tracking → **0 flagged** (correctly silent through the outage);
     `daily_synthesis` gap-fill relabeled as tracking → **34/35 falsely flagged**. The exclusion (§4.2)
     is provably load-bearing — it suppresses 34 false chronic-neutrals an outage would otherwise mint.
3. **Live run** (`find-signal-quality-issues.ts`): 36 assessable theses / 163 signals → 148
   `insufficient_data` (gate working — no false chronic-neutral from the blind period), 15
   `excluded_collector`, and **1 real coverage gap** (HLIT −22% over 9d with 5 silent judgment signals).
4. **`npm run build` + `npm test`** green — 237 tests (21 files); money-math goldens untouched.

## 10. Open decisions (recommendation + call)

| # | Decision | Recommendation |
|---|---|---|
| 1 | New decision type vs reuse `re_underwrite_due` | **Reuse** (§6.1) — identical runbook; `evidence_context.trigger` distinguishes. *Call: reuse.* |
| 2 | Chronic-neutral denominator | **Tracking-only** (`thesis_observe`+`thesis_monitor`); exclude `research_routing`/`daily_synthesis`/quant (§4.2). *Call: tracking-only* — it is the only set whose `neutral` means "looked, saw nothing." |
| 3 | Persist diagnostics, or stateless? | **Stateless compute** + surface via the decision packet + the `--context` payload; no new table/column (matches "cheap, reads existing history"). Re-flagging is prevented by decision dedup, not a watermark. *Open if* `/thesis` later wants a "chronic-neutral since <date>" time-series — then write a `data_source='signal_diagnostic'` snapshot row (still no migration). |
| 4 | Macro surprise | **RESOLVED → defer macro price-surprise to P2** (chronic-neutral only for macros in P1). A macro's move is a news/basket phenomenon and constituents are often unpriced; the news path (§10.2) is the more faithful detector. (§3.2) |
| 5 | Window / gate constants (§5) | Start `45d / MIN 8 / 0.90 / 30d / 15% / 2σ / ±7d`; revisit once 4–6 weeks of observe history exist — the backtest (§9.2) is the calibration tool. |
| 6 | Move metric | **RESOLVED at build time → max in-window displacement (the extreme), not net point-to-point** (§5.2). Caught on the first live case (HLIT): net would hide a recovered drawdown and the detail string was inconsistent. Round-trip sensitivity is intentional for a coverage diagnostic. |

## 11. Build order within P1

1. ✅ **Engine + pure tests** (§5, §9.1) — `signalQualityRules.ts` (pure) + `signalClassification.ts` +
   24 unit tests. No DB, fully gated by fixtures.
2. ✅ **DB wiring + worklist CLI** — `signalQualityDiagnostics.ts` (`computeSignalQualityDiagnostics` +
   `gatherSignalQualityContext`) + `find-signal-quality-issues.ts`; live run = 36 theses, 1 real gap (HLIT).
3. ✅ **Backtest** (§9.2) over `thesis_monitor` — `backtest-signal-quality.ts`; detection + the
   blind-period exclusion both validated.
4. ✅ **The bundled hardening** (§8) — `collectorTracked` into `thesisHealth`/the observe bundle/skill.
5. ⏳ **Surfacing** (§6.2, §7 #8–9) — maintenance drain step + list-decisions latent worklist, raising
   merged `re_underwrite_due` packets. *(Next tranche.)*
6. ⏳ **P3 handoff** (§6.3) — attach the `signalQuality` block to the re-underwrite context. *(Next tranche.)*

> **Build status (2026-06-24):** steps 1–4 ✅ built, tested, validated on live data. Steps 5–6 (surfacing
> + P3 handoff) deferred to the next tranche — the engine + worklist CLI + observe hardening stand alone
> (the detector runs on demand via the CLI; wiring it into `/maintenance` and `/decisions` is the connect step).

Steps 1–4 carry the standalone value (a working, tested detector + the observe fix) and can land first;
5–6 connect it to the loop. Per §11's sequencing note, **P4 (price-watch/livePrices) can run in
parallel** — it shares the `underlyings_iv_history`/`livePrices` price plumbing this spec leans on.
