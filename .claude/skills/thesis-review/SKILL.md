---
name: thesis-review
description: Auto-maintain the belief layer (W8). Digest refresh (B4) — re-synthesize supporting digests for developing theses that have accumulated new claims.
---

# Thesis Review Skill (W8 belief-maintenance loop)

## Purpose

The automated job that keeps the belief layer current with no manual curation
(docs/v2/07 §4). It is triggered by the deterministic cascade and by claim
accumulation; the user is involved only at genuine decision points.

**Modes implemented:**
- **Digest refresh (B4, §4a)** — re-synthesize the supporting digest for *developing*
  theses that have accumulated new claims. Digest only, no signals.
- **Signal derivation (B5b, §4b)** — derive a *monitoring* thesis's qualitative
  signals (the invalidation/confirmation/completion digest) from its claims.
- **Health pass (B5c, §4c)** — re-assess a *monitoring* thesis's existing signals
  against the latest routed evidence + price context; surface a decision only on
  weakening/invalidation.
- **Research-gap bridge (B6, §4e)** — for a *monitoring* thesis that is under-researched
  (live position opened before the belief exists), pull Tana first and, if still thin,
  surface a DecisionStrip item proposing sources to develop it.
- **Retrospective (B7, §4d)** — when a thesis *resolves* (closed/complete/rejected),
  write a one-off "was I right, did it pay" retrospective from the final P&L + trail.
- **Framing (C5a, docs/v2/09 §7)** — for a live *asset* thesis with no macro link,
  judge which macro (if any) frames it: a high-confidence `related` auto-links silently;
  `gated_by` or an uncertain match raises a `classify_macro_link` decision.

The modes are partitioned by thesis status / research state and never overlap:
digest mode acts on `developing`; signal mode on `monitoring` with no signals yet;
health mode on `monitoring` that already has signals; research-gap mode on
`monitoring` that is under-researched; retrospective mode on resolved
(closed/complete/rejected) theses; framing mode on `developing`/`monitoring` asset
theses with no macro link. None change thesis status — the expression-driven cascade
owns status.

## Mode: Digest refresh (B4, §4a)

When a **developing** thesis accumulates new linked claims, re-synthesize its
**supporting digest** — a new `thesis_articulations` version answering *"how do
these claims support the thesis?"* This is low-stakes, versioned (never a
destructive overwrite), and runs **auto, no confirmation**.

### Scope rules (read before doing anything)

1. **Developing theses only.** The worklist is already filtered to `developing`.
   Never synthesize a digest for a `monitoring` thesis here — `insert-thesis-articulation`
   supersedes that thesis's active signals on re-articulation, which would destroy
   the monitoring picture. Monitoring digest+signal refresh is B5.
2. **Digest only — `signals: []`.** Do not generate signals. With no signals and a
   developing thesis, `insert-thesis-articulation` will not promote the thesis
   (promotion is the cascade's job in v2). Leave promotion alone.
3. **Versioned.** The writer auto-increments the version; never edit prior versions.
4. **Auto, no confirm.** Process the whole worklist without pausing for approval —
   this is maintenance, not a decision point.

### Workflow

**Step 0 — Environment**
```bash
cd /Users/home-hub/projects/trade-journal
```

**Step 1 — Get the worklist** (delta-triggered; default K=3)
```bash
npx tsx scripts/ops/find-stale-digests.ts --json
```
Each item: `{ thesisId, thesisType, title, currentClaimCount, claimsCountAtLastArticulation, delta, hasArticulation, latestVersion }`.
If the worklist is empty, report "no digests need refreshing" and stop.

**Step 2 — For each thesis, load the synthesis bundle**
```bash
npx tsx scripts/ops/find-stale-digests.ts --context <thesisId> --type <asset|macro>
```
Returns `{ thesis, supportingClaims[], refutingClaims[], latestArticulation }`.
Each claim carries its full Toulmin structure: `claim`, `evidence[]`, `reasoning`,
`backing`, `qualifier`, `rebuttal[]`, plus `mappingType` and `confidence`.

**Step 3 — Synthesize the digest** from the bundle:

- **coreArgument** (2–4 sentences): the synthesized thesis — *why it holds*, grounded
  in the supporting claims. Not a list; a tight argument.
- **keyDrivers** (3–5): the factors driving the thesis. Each `{ driver, detail,
  supporting_claims: [claimId, …] }` — cite the actual claim UUIDs from the bundle
  that ground each driver.
- **keyAssumptions** (3–5): what must hold for the thesis to be right. Each
  `{ assumption, detail }`. Invert the most load-bearing claims and the refuting
  claims' concerns into the assumptions that, if broken, break the thesis.
- **timeframe**: `{ horizon, expectedResolution?, keyMilestones? }`. Use the thesis's
  `timeHorizon` for `horizon`.
- **confidenceLevel** (`low|medium|high|very_high`) + **confidenceRationale**: judge
  from the weight/qualifiers of supporting claims, their coverage of the argument,
  and the strength of any refuting claims. Be honest — thin evidence → `low`.
- **evidenceGaps** (`string[]`): what's missing or unresolved. **Fold every refuting
  claim** (`refutingClaims[]`) in here as a gap/counter-point — §4a: refuting claims
  feed evidence_gaps and pre-stage invalidation. Add genuine thin spots.
- **claimIdsUsed** (`string[]`): every supporting claim UUID you incorporated.
- **referencedTheses**: `[]` for B4 unless the bundle makes a dependency obvious; keep minimal.

Quality bar: the digest must be **faithful to the claims** (no invented evidence),
specific (names, mechanisms, numbers where the claims provide them), and falsifiable
in spirit (the assumptions/gaps point at what would change the view).

**Step 4 — Write it** (digest only). Create a temp JSON and pipe to the writer:
```json
{
  "thesisId": "<id>",
  "thesisType": "<macro|asset>",
  "articulation": {
    "coreArgument": "...",
    "keyDrivers": [{ "driver": "...", "detail": "...", "supporting_claims": ["<claimId>"] }],
    "keyAssumptions": [{ "assumption": "...", "detail": "..." }],
    "timeframe": { "horizon": "...", "expectedResolution": "..." },
    "confidenceLevel": "medium",
    "confidenceRationale": "...",
    "evidenceGaps": ["..."],
    "claimIdsUsed": ["<claimId>", "..."],
    "referencedTheses": []
  },
  "signals": []
}
```
```bash
echo '<json>' | npx tsx scripts/insert-thesis-articulation.ts --stdin
```
The writer versions the articulation, updates `claims_count_at_last_articulation`
(which clears the delta so the thesis drops off the worklist), and journals it.
Because `signals: []`, no signals are superseded and the thesis is **not** promoted.

**Step 5 — Report** a one-line summary per thesis: `title — v{n} written ({claimCount} claims)`.

### Common mistakes (digest mode)
1. ❌ Generating signals (that's signal mode). In digest mode `signals` must be `[]`.
2. ❌ Promoting/creating status changes (the cascade owns status).
3. ❌ Processing a `monitoring` thesis (the digest worklist is developing-only; never override).
4. ❌ Plain strings for keyDrivers/keyAssumptions — they are objects.
5. ❌ Inventing evidence not in the claims, or dropping refuting claims instead of folding them into `evidenceGaps`.

---

## Mode: Signal derivation (B5, §4b)

A `monitoring` thesis has a live position, so it needs its **signals** — the
qualitative criteria the agent judges incoming evidence against. Expression-driven
promotion means a thesis can reach `monitoring` (via the cascade) before it has any
signals; this mode fills that gap. Signals are **qualitative and agent-operable**:
plain-language, falsifiable criteria — `category` defaults to judgment and
`explicit_details` stays null (quantitative wiring is a rare opt-in via
`/configure-signal`, never the default). Qualitative ≠ vague: each signal must be
specific enough to render `strengthening / weakening / invalidated` against evidence.

### Scope rules

1. **Monitoring theses only**, and only those with **no active signals** — the
   worklist already enforces this. Do not re-derive signals for a thesis that has
   them (refresh is the health pass, B5c).
2. **Never fabricate signals for a thin thesis.** If the worklist marks a thesis
   `thin` (no claims), do NOT invent signals — it's a research gap (B6/§4e). Skip it.
3. **Status is the cascade's** — the writer no longer promotes; derivation is purely additive.
4. **Auto, no confirm** — maintenance. (Surface only genuinely low-confidence signals to the user, if any.)

### Workflow

**Step 1 — Worklist**
```bash
npx tsx scripts/ops/find-signalless-theses.ts --json
```
Process the `ready` array; ignore `thin` (report it as a research-gap count).

**Step 2 — Bundle** (digest context + parent macros for compositional invalidation)
```bash
npx tsx scripts/ops/find-signalless-theses.ts --context <thesisId> --type <asset|macro> --compact
```
Returns `{ thesis, parentMacros[], supportingClaims[], refutingClaims[], latestArticulation }`.

**Step 3 — Synthesize the full articulation: digest + signals.** Produce the same
digest fields as digest mode (coreArgument, keyDrivers, keyAssumptions, timeframe,
confidenceLevel, confidenceRationale, evidenceGaps, claimIdsUsed) AND a small,
high-quality `signals` array:

- **confirmation** (≤2) — the single most important thing you'd see in the world if
  the thesis is right. Derive from `keyDrivers` / foundation claims.
- **invalidation** (≤2) — what would make you abandon the thesis. Derive from
  inverted `keyAssumptions`, refuting claims and their rebuttals.
- **completion** (≤1) — the end-state where the thesis has fully played out (take
  profits). Derive from `timeframe`.
- **Compositional invalidation** — for each `parentMacros` entry with
  `relationshipType` `gated_by`/`depends_on`, add an invalidation signal:
  `{ type:'invalidation', statement:'"<macro title>" macro thesis is invalidated or downgraded', dependentThesisId:<macroThesisId>, dependentThesisType:'macro', dependentThesisCondition:'invalidated', sourceSection:'dependency', sourceDriverIndex:0 }`.

Each signal needs: `type`, `statement` (specific, testable), `notes` (why it matters
+ what action to take when triggered), `linkedClaimIds` (REQUIRED — the claim UUIDs
grounding it), and provenance `sourceSection` (`key_driver|key_assumption|timeframe|dependency`)
+ `sourceDriverIndex` (0-based index into that section). Omit `category`/`explicit_details`
(the writer defaults them to judgment/null). **Quality over quantity** — only emit a
signal grounded in real claim evidence; 1 strong invalidation beats 3 weak slots.

**Step 4 — Write** the full articulation (digest + signals) via the writer:
```json
{ "thesisId":"<id>", "thesisType":"<type>",
  "articulation": { coreArgument, keyDrivers, keyAssumptions, timeframe, confidenceLevel, confidenceRationale, evidenceGaps, claimIdsUsed, referencedTheses:[] },
  "signals": [ { "type":"invalidation", "statement":"...", "notes":"...", "linkedClaimIds":["<id>"], "sourceSection":"key_assumption", "sourceDriverIndex":0 } ]
}
```
```bash
echo '<json>' | npx tsx scripts/insert-thesis-articulation.ts --stdin
```
The writer versions the digest, inserts the signals (status active, category judgment,
linked via `signal_entity_links`), supersedes any stale signals, and leaves status alone.

**Step 5 — Report** per thesis: `title — v{n}, {N} signals ({c} confirmation / {i} invalidation / {x} completion)`.

### Common mistakes (signal mode)
1. ❌ Quantitative signals — do NOT set `explicit_details`; signals are qualitative judgment criteria.
2. ❌ Vague signals ("competition increases") — must be specific enough to judge strengthening/weakening/invalidated.
3. ❌ Fabricating signals for a `thin` thesis — skip it; that's a research gap.
4. ❌ Missing `linkedClaimIds` or provenance (`sourceSection`/`sourceDriverIndex`) on a signal.
5. ❌ Forgetting the compositional invalidation signal when the thesis has a `gated_by`/`depends_on` parent macro.
6. ❌ Changing thesis status, or processing a developing/closed thesis (signal mode is monitoring-only).

---

## Mode: Health pass (B5c, §4c)

Re-assess a monitoring thesis's **existing** signals against the latest routed
evidence and price context, render a current verdict per signal, and surface a
decision **only when the thesis is weakening**. This is the loop that keeps live
beliefs honest. Two hard policies (do not violate):

- **Change-only:** a `thesis_health` snapshot is written only for a signal whose
  verdict *changed* since its last health verdict. The writer enforces this via the
  `materialChange` flag — set it truthfully.
- **Decision-only-on-weakening:** raise a DecisionStrip item *only* when ≥1 signal
  is `weakening` or `invalidated`. Never raise a "still fine" decision — a healthy
  pass produces snapshots (maybe) and an updated review clock, nothing the user sees.

### Workflow

**Step 1 — Worklist** (due = new evidence since last review, or weekly floor)
```bash
npx tsx scripts/ops/find-theses-due-health.ts --json
```

**Step 2 — Bundle** per thesis
```bash
npx tsx scripts/ops/find-theses-due-health.ts --context <thesisId> --type <asset|macro>
```
Returns `{ thesis (incl. ticker/spot for assets), signals[] }`. Each signal carries
its `statement`, `notes`, `linkedClaimIds`, `lastHealthAssessment` (the prior verdict,
for change detection), and `recentEvidence[]` (routed `signal_data_snapshots`, newest
first, with `assessment` + `evidenceSummary` + `dataSource`).

**Step 3 — Render a verdict per signal.** For each signal, judge its `statement`
against `recentEvidence` + the thesis/price context:
- `confirmed` / `strengthening` — evidence supports the signal (confirmation playing
  out, or invalidation criterion looking less likely).
- `neutral` — no material evidence either way.
- `weakening` — evidence is moving against the thesis (a confirmation faltering, or
  an invalidation criterion getting closer).
- `invalidated` — an invalidation criterion has essentially triggered.
Set `materialChange: true` iff the verdict differs from `lastHealthAssessment`
(treat a first-ever verdict that is anything other than `neutral` as material; a
first `neutral` is not worth a snapshot). Write a one-line `evidenceSummary` citing
what drove the verdict (the evidence item / price move). **Do not invent evidence** —
if there's nothing new, the honest verdict is usually `neutral`/unchanged.

**Step 4 — Roll up + decide.** The thesis is weakening if any signal is
`weakening`/`invalidated`. Only then build a `decision` (concise title + a
description naming which signal(s) weakened, the evidence, and a suggested action).

**Step 5 — Record** (the writer enforces change-only, stamps `last_reviewed_at`,
and dedupes the decision against an existing active one):
```json
{ "thesisId":"<id>", "thesisType":"<type>",
  "verdicts":[ { "signalId":"<id>", "assessment":"neutral", "evidenceSummary":"...", "materialChange":false } ],
  "decision": { "title":"<thesis> weakening — <signal>", "description":"..." } }
```
```bash
echo '<json>' | npx tsx scripts/record-thesis-health.ts --stdin
```
Omit `decision` entirely for a healthy/neutral pass.

**Step 6 — Report** per thesis: `title — {n} signals assessed, {m} changed, decision: yes/no`.

### Common mistakes (health mode)
1. ❌ Raising a decision when nothing is weakening (the strip is for deterioration only).
2. ❌ `materialChange: true` on an unchanged verdict — floods the snapshot history.
3. ❌ Inventing evidence — with nothing new, the verdict is `neutral`, not a guess.
4. ❌ Changing thesis status or signal records (health mode only reads signals + writes snapshots/decisions).
5. ❌ Re-deriving or editing the signals themselves (that's signal mode); health mode assesses them as-is.

---

## Mode: Research-gap bridge (B6, §4e)

Expression-driven monitoring means a position can open **before** the research
exists, leaving a live thesis that can't ground a digest or signals. This mode
detects those gaps and **bridges them by sourcing real research — never by
fabricating belief.** It is the position→backfill inversion of the normal
capture→thesis→position flow, and it is a **genuine decision point**: the agent
proposes, the user decides what to capture / research.

### Workflow

**Step 1 — Worklist**
```bash
npx tsx scripts/ops/find-research-gaps.ts --json
```
`gaps[]` are monitoring theses with band `gap` (0 claims) or `thin` (1–2 claims),
each with `ticker`, `reasons`, and a completeness `score`. Prioritise `gap`.

**Step 2 — Context**
```bash
npx tsx scripts/ops/find-research-gaps.ts --context <thesisId> --type <asset|macro>
```
Returns the thesis (title, ticker, direction, description, sectors/themes) +
`existingClaimTitles` (what little is already linked) + the completeness reasons.

**Step 3 — Tana FIRST.** Tana is the source of truth for everything read. Before
declaring a gap, search Tana for the underlying/theme:
```
mcp__tana-local__search_nodes  (query: the ticker, company/theme name, sectors)
```
- If relevant `#content`/`#claim` material already exists in Tana → it should flow
  through the normal claim-gen → **relate-research** path (run `/relate-research`,
  or capture/queue the nodes). Linking that existing research may itself close the
  gap — prefer this over asking the user for new sources.
- Only if Tana genuinely lacks material do you proceed to Step 4.

**Step 4 — Bridge (the decision).** If the thesis is still thin after the Tana
pull, surface ONE DecisionStrip item proposing how to develop it — specific
candidate sources/searches to capture via `/tana-inbox` (which flow back through
claim-gen → relate-research → digest → signals), and optionally a `deep-research`
pass. Be concrete (named articles/feeds/queries for that ticker/theme), not generic.
Emit it as a **typed `develop_thin_thesis` packet** (docs/v2/09 §8) so the strip shows
the decision_type chip + your proposed sources as actions, and `resolve-decision.ts`
can close it:
```bash
echo '{
  "objectType": "<asset_thesis|macro_thesis>", "objectId": "<thesisId>", "objectTitle": "<thesis title>",
  "title": "Live position on <TICKER>, thin thesis — develop it",
  "decisionType": "develop_thin_thesis",
  "whyRaised": "Expression opened before the research exists; Tana has <none|N stale> for <theme>.",
  "recommendedActions": [
    {"action": "capture_sources", "label": "Capture via /tana-inbox", "payload": {"sources": ["<named article/feed/query>", "..."]}},
    {"action": "run_deep_dive", "label": "Run a deep-research pass", "payload": {"question": "<the decision-critical question>"}},
    {"action": "accept_thin", "label": "Accept thin for now"}
  ],
  "defaultRecommendation": {"action": "capture_sources", "confidence": "medium"}
}' | npx tsx scripts/ops/raise-decision.ts --stdin
```
The writer dedupes against an existing active decision for the thesis, so re-runs
won't pile up duplicate strip items. (Bare `--title/--description` flags still work
for a quick untyped decision, but prefer the typed packet.)

**Step 5 — Report** per thesis: `title (ticker) — Tana: <found N / none>; <linked M claims | decision raised | already flagged>`.

### Rules
1. ❌ **Never fabricate claims/signals** to fill a gap — bridge with real sourced research only.
2. ✅ **Tana first**, always — link existing research before asking for new.
3. ✅ Proposed sources must be **specific** to the ticker/theme (named articles, feeds, search queries), not "do more research".
4. ❌ Don't change thesis status (the cascade owns it); a bridged thesis develops naturally once claims land.
5. ✅ One decision per thesis (the writer dedupes); keep the strip uncluttered.

---

## Mode: Retrospective (B7, §4d)

When a thesis resolves — `closed` (was expressed, now flat), `complete`, or
`rejected` — write a one-off retrospective on **two distinct axes** (docs/v2/07 §4d):
1. **Belief** — *was I right?* (did the core argument play out)
2. **Execution** — *did I capture the P&L that was available?* (final vs the peak/trough of the hold)
This closes the loop: it records what the belief was, what happened, what it
earned/cost, **and how well it was traded**, and it ends the thesis's monitoring.
Auto, no confirm.

### Workflow

**Step 1 — Worklist**
```bash
npx tsx scripts/ops/find-theses-needing-retrospective.ts --json
```
Each item is a **closed expression episode** — `episodeNo` plus the `openedAt`/`closedAt`
window. A thesis that held, closed, and later re-expressed surfaces once **per holding
period**, so write each episode's retrospective on its own.

**Step 2 — Inputs**
```bash
npx tsx scripts/ops/find-theses-needing-retrospective.ts --context <thesisId> --type <asset|macro> --episode <episodeNo>
```
Returns the thesis (direction, status, outcome, the episode's opened/closed window, durationDays), the
final `performance` (latestCumulative / realized / unrealized P&L + confidence),
the **`excursion`** (execution axis: `mfe`/`mfeDate` = peak, `mae`/`maeDate` = trough,
`captureRatio` = final/peak, `giveBackFromPeak`, `neverInProfit`, `neverUnderwater`,
`confidence`), the **`events`** (the process timeline aligned to the curve — signal
verdict flips, advisor recs + whether taken, re-underwrites/conviction, decisions),
the `coreArgument` (the belief at the end), the final `signalsByStatus` tally, and
the `journalEntryCount`. **All P&L — `performance`, `excursion`, and the chart anchors in
`events` — is windowed and rebased to this episode**, so a re-expressed thesis is judged on
the holding period at hand, not its glued lifetime.

**Step 3 — Write the retrospective.** A tight narrative on the **two axes** — keep
them separate; a right call can be poorly executed and vice versa:
- **Belief — was I right?** Did the core argument play out? Set `outcome` ∈
  `validated | invalidated | partial` (for a `rejected` thesis usually `invalidated`;
  for `closed` after a held run, judge from final P&L + what happened).
- **Execution — did I capture it?** Read `excursion`: cite the peak (`mfe`), the
  capture ratio (`captureRatio` → "captured X% of the peak"), the drawdown (`mae`),
  and the give-back (`giveBackFromPeak`). Then cross-reference the `events` timeline —
  *did a signal flag weakening near the peak? was a hedge/covered-call (advisor rec)
  offered and not taken? did conviction (a re-underwrite) peak with the price?* Set
  `executionQuality` ∈ `excellent | good | fair | poor`: excellent = captured most of
  the peak / exited near MFE / heeded the turn; poor = gave back most of a real gain or
  ignored a flagged turn. If `neverInProfit`, execution is moot — say so (the lesson is
  entry/sizing, not exit timing).
- **What the trail shows** — duration, how the signals ended, the key turns from `events`.
- **Lesson** — one line on what to repeat or avoid (often an execution lesson).
Honour the W4/W5 realized-confidence caveat for BOTH axes: when `excursion.confidence
!== 'full'`, hedge the peak/capture/MAE figures the same way you hedge final P&L —
they are a view, not truth.

**Step 4 — Record:** pass `executionQuality` plus the `excursion` object verbatim from
the Step 2 context (the writer freezes it into `retrospective_metrics`):
```bash
echo '{"thesisId":"<id>","thesisType":"<type>","episodeNo":<episodeNo>,"outcome":"validated|invalidated|partial",
  "executionQuality":"excellent|good|fair|poor",
  "excursion": <the excursion object from --context>,
  "headline":"<one-line: belief verdict + execution verdict + P&L>","narrative":"<the writeup>"}' \
  | npx tsx scripts/record-retrospective.ts --stdin
```
The writer records the retrospective on the **expression episode** (`episodeNo`) — its own
`retrospective_metrics`/`outcome`/`executionQuality` + `retrospective_at` — appends the
`retrospective` journal entry, mirrors `outcome`/`outcome_notes`/`actual_outcome_date` +
`retrospective_metrics` to the thesis (badged on the `/performance` RetrospectiveCard + the
per-thesis RetrospectivePanel), and supersedes any still-active signals → `complete`.

**Step 5 — Report:** `title — belief <outcome> / execution <executionQuality>, <P&L> (captured X% of peak) over <Nd>; N signals closed`.

### Common mistakes (retrospective mode)
1. ❌ Asserting exact P&L / peak / capture when `confidence !== 'full'` — hedge it.
2. ❌ Re-writing a retrospective that already exists (the worklist already excludes those).
3. ❌ Changing thesis status (it's already resolved; leave it).
4. ❌ A generic writeup — ground it in this thesis's actual core argument, P&L, and trail.
5. ❌ Collapsing the two axes — a validated belief with a 14% capture ratio is *right + poorly executed*, not "partial". Score belief and execution independently.
6. ❌ Omitting `executionQuality` / not passing the `excursion` object through to the writer (the card + panel badge them).
7. ❌ Reading execution off a `neverInProfit` trade — there was no gain to capture; the lesson is entry/sizing, not exit timing.

---

## Mode: Framing (C5a, docs/v2/09 §7)

A live **asset** thesis with no macro link is a coverage gap (Matrix 1: "asset thesis
w/ no macro"). This mode judges which macro thesis (if any) genuinely frames it, and
**captures the user's framing decision back into the graph** via the asset↔macro
junction. The §12 #4 + #7 sign-off governs the auto-vs-decision split:

- **`related`, high confidence (≥0.7)** → **auto-link silently** (no decision). `related`
  is contextual; it's safe to create automatically when the match is clear.
- **`gated_by` (ANY confidence)** → **always a decision**. `gated_by` wires compositional
  invalidation (the macro flipping invalid cascades to the asset), so the user confirms it.
- **`related`, 0.4–0.7** → a decision (you weren't sure).
- **no genuine macro / <0.4** → **skip**. An asset thesis may legitimately stand alone —
  never force a framing.

### Scope rules
1. **Asset theses only**, developing/monitoring, with **zero** macro links — the worklist enforces this.
2. **Be sparing** — most assets relate to 0–1 macros; the strip caps at 5. Quality over coverage.
3. **Never change thesis status** (the cascade owns it). Framing only writes the junction.

### Workflow

**Step 1 — Worklist**
```bash
npx tsx scripts/ops/find-theses-needing-framing.ts --json
```

**Step 2 — Context** (the asset thesis + the macro catalog to judge against)
```bash
npx tsx scripts/ops/find-theses-needing-framing.ts --context <assetThesisId>
```
Returns `{ thesis (title/description/narrative/direction/ticker), existingClaimTitles[], macroCatalog[] }`.

**Step 3 — Judge.** For the asset thesis, scan `macroCatalog` and decide which macro
(if any) it sits under, the relationship (`related` | `gated_by`), and a confidence
(0–1). Genuine framing, not topical overlap: a single-name bull thesis on an AI
hyperscaler sits **under** "Bullish AI Infrastructure" (`related`), and is `gated_by`
it only if the asset case *depends on* the macro holding. Most are `related`; reserve
`gated_by` for true dependency.

**Step 4 — Apply** (per the disposition above):
```bash
# high-confidence related → auto-link (silent):
npx tsx scripts/ops/link-asset-macro.ts --asset-id <id> --macro-id <id> --type related

# gated_by, or related at 0.4–0.7 → raise a decision:
echo '{
  "objectType": "asset_thesis", "objectId": "<assetThesisId>", "objectTitle": "<asset title>",
  "title": "Frame <ASSET> under \"<macro title>\" — related or gated_by?",
  "decisionType": "classify_macro_link",
  "whyRaised": "<why this macro frames the asset, and why gated_by/uncertain>",
  "relatedObjects": [{"type": "macro_thesis", "id": "<macroThesisId>", "title": "<macro title>", "role": "parent_macro"}],
  "recommendedActions": [
    {"action": "set_related", "label": "Link as related"},
    {"action": "set_gated_by", "label": "Link as gated_by (compositional invalidation)"},
    {"action": "stand_alone", "label": "Leave unframed"}
  ],
  "defaultRecommendation": {"action": "set_related", "confidence": "medium"}
}' | npx tsx scripts/ops/raise-decision.ts --stdin
```
The decision is resolved later by `resolve-decision.ts` (`--action set_related|set_gated_by`,
`--macro-id <id>`), which writes the junction. Skip (no command) when nothing frames it.

**Step 5 — Report** per thesis: `title (ticker) — auto-linked related to "<macro>" | decision raised (gated_by) | stood alone`.

### Common mistakes (framing mode)
1. ❌ Auto-linking `gated_by` — it must ALWAYS be a decision (compositional invalidation).
2. ❌ Forcing a framing for topical overlap — an asset thesis may stand alone; skip it.
3. ❌ Raising a decision for a clear high-confidence `related` — just auto-link it.
4. ❌ Changing thesis status or touching claims/signals (framing only writes the asset↔macro junction).

---

## Mode: Macro emergence (docs/v2/13 §1)

The complement to framing. Framing links an asset to an **existing** macro; emergence proposes
a **new** macro when SEVERAL unframed assets share a genuine macro-level theme and no active
macro covers it — exactly where framing's "nothing fits" tail leaves off. **Creating a belief
is always a decision** (§4 lean ③): this mode NEVER auto-creates a macro — it raises a
`cluster_claims_to_thesis` packet and the user accepts.

### Scope rules
1. **Dedup against the catalog first** — if an active macro already fits the cluster, that's
   *framing's* job (link the assets to it), NOT a new macro. Only propose NEW when nothing fits.
2. **A cluster is ≥2 unframed assets** sharing a coherent macro driver — not topical overlap.
   A lone unframed asset stands alone.
3. **Be sparing** — cap at ~5 proposals; most assets belong to 0–1 existing macros or stand
   alone. Quality over coverage (same discipline as framing).
4. **Never auto-create / never change status** — raise the decision; the cascade promotes
   status once the macro exists and the assets link.

### Workflow

**Step 1 — Pool**
```bash
npx tsx scripts/ops/find-emergent-macros.ts --json
```
Returns `{ unframedAssets[] (title/description/direction/ticker/claimTitles), macroCatalog[] }`.

**Step 2 — Judge clusters.** Group the unframed assets by genuine shared macro theme (read
titles/descriptions/claimTitles/direction). For each candidate, **check `macroCatalog`**: if an
active macro already covers the theme → SKIP (those assets are a *framing* job). Keep only
clusters where nothing fits. Name the would-be macro, its `thesis_type` (secular | cyclical |
structural), and direction.

**Step 3 — Raise one decision per genuine cluster** (anchor it on one member asset):
```bash
echo '{
  "objectType": "asset_thesis", "objectId": "<anchor member asset id>", "objectTitle": "<anchor title>",
  "title": "Emergent macro: \"<proposed title>\" — <N> assets (<TICKERS>)",
  "decisionType": "cluster_claims_to_thesis",
  "whyRaised": "<N> active assets (<tickers>) share <theme>; no active macro covers it",
  "relatedObjects": [
    {"type": "asset_thesis", "id": "<memberId>", "title": "<title>", "role": "member"}
  ],
  "evidenceContext": {
    "thesisKind": "macro",
    "proposed": {"title": "<...>", "description": "<the umbrella argument>", "direction": "bullish|bearish|neutral", "thesisType": "secular|cyclical|structural", "confidence": "low|medium|high"},
    "memberAssetThesisIds": ["<id>", "<id>"],
    "whyNoExistingMacro": "<which catalog macros are closest and why none fits>"
  },
  "recommendedActions": [
    {"action": "create_macro", "label": "Create macro & frame these assets"},
    {"action": "dismiss", "label": "No shared macro"}
  ],
  "defaultRecommendation": {"action": "create_macro", "confidence": "medium"}
}' | npx tsx scripts/ops/raise-decision.ts --stdin
```
(One `relatedObjects` entry **per member**; list every member id in `memberAssetThesisIds`.)

**Step 4 — On accept (resolve).** Create the macro, then resolve — the resolver links every
member from the packet to the new macro (`related`), and the cascade promotes status:
```bash
npx tsx scripts/ops/create-macro-thesis.ts --title "<proposed title>" --description "<...>" \
  --thesis-type <secular|cyclical|structural> --direction <dir> --confidence <c>
# → { id: <macroId> }
npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action create_macro --macro-id <macroId> \
  --notes "created macro, framed <N> assets as related"
```
Dismiss → `resolve-decision --id <decisionId> --action dismiss` (no-op; assets stay unframed).

**Step 5 — Report** per cluster: `proposed "<title>" (<N> assets) — decision raised | created macro <id> + framed N | dismissed`.

### Common mistakes (macro-emergence mode)
1. ❌ Proposing a macro for a theme an existing macro already covers — dedup against `macroCatalog`; that's framing, not emergence.
2. ❌ Proposing from a single asset — a cluster is ≥2; a lone unframed asset stands alone.
3. ❌ Auto-creating the macro — creating a belief is ALWAYS the user's decision; raise the packet.
4. ❌ Topical clusters ("both are tech") — require a genuine shared driver (a secular/cyclical/structural force).
5. ❌ Changing thesis status — the cascade promotes once the macro exists and assets link.
