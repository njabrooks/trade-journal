---
name: thesis-review
description: Auto-maintain the belief layer (W8). Digest refresh (B4) — re-synthesize supporting digests for developing theses that have accumulated new claims.
---

# Thesis Review Skill (W8 belief-maintenance loop)

## Purpose

The automated job that keeps the belief layer current with no manual curation
(docs/v2/07 §4). It is triggered by the deterministic cascade and by claim
accumulation; the user is involved only at genuine decision points.

**This skill currently implements one mode — B4 digest refresh.** Future modes
extend the same skill:
- **B5** — qualitative signal derivation on promotion + the monitoring thesis-health pass.
- **B7** — retrospective on close.

Do **not** implement B5/B7 behaviour here yet (no signals, no status changes).

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

### Common mistakes
1. ❌ Generating signals (that's B5). `signals` must be `[]`.
2. ❌ Promoting/creating status changes (the cascade owns status).
3. ❌ Processing a `monitoring` thesis (worklist is developing-only; never override).
4. ❌ Plain strings for keyDrivers/keyAssumptions — they are objects.
5. ❌ Inventing evidence not in the claims, or dropping refuting claims instead of folding them into `evidenceGaps`.
