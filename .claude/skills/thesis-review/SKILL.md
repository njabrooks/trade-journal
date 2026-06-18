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

Future modes extend the same skill:
- **B7** — retrospective on close.

The modes are partitioned by thesis status / research state and never overlap:
digest mode acts on `developing`; signal mode on `monitoring` with no signals yet;
health mode on `monitoring` that already has signals; research-gap mode on
`monitoring` that is under-researched (gap/thin completeness). None change thesis
status — the expression-driven cascade owns status.

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
```bash
npx tsx scripts/ops/raise-decision.ts --object-type <asset_thesis|macro_thesis> --id <thesisId> \
  --title "Live position on <TICKER>, thin thesis — develop it" \
  --description "No/low research in Tana for <theme>. Proposed sources to capture via /tana-inbox: <specific list>. Optionally run deep-research on <question>."
```
The writer dedupes against an existing active decision for the thesis, so re-runs
won't pile up duplicate strip items.

**Step 5 — Report** per thesis: `title (ticker) — Tana: <found N / none>; <linked M claims | decision raised | already flagged>`.

### Rules
1. ❌ **Never fabricate claims/signals** to fill a gap — bridge with real sourced research only.
2. ✅ **Tana first**, always — link existing research before asking for new.
3. ✅ Proposed sources must be **specific** to the ticker/theme (named articles, feeds, search queries), not "do more research".
4. ❌ Don't change thesis status (the cascade owns it); a bridged thesis develops naturally once claims land.
5. ✅ One decision per thesis (the writer dedupes); keep the strip uncluttered.
