# Build Core Argument — the living underwriting synthesis

## Purpose

Synthesize everything known about a thesis into **one living underwriting** (docs/v2/10 §2):
a versioned `thesis_articulations` record with **three faces**.

- **Basis for the investment** — *why I'm in it*: the core argument, key drivers, key assumptions.
- **Basis for resolution** — *what would settle it*: the signals — what would **confirm**,
  **complete** (played out / take profit), or **invalidate** the thesis. These are a *section* of the
  underwriting, **derived** from the case's own material — not separate objects you configure.
- **Conviction** — the current strength of the view + its rationale.

Every run writes a **new version**. The version series *is* the conviction history — re-underwriting
is how conviction updates.

**Multi-source by construction.** A thesis accumulates evidence from many places — Tana research
claims, deep-research passes, ad-hoc agent research, and the user's own conversation insights. All of
these land as `main_claims` linked to the thesis (some richly Toulmin-structured, some a one-line
observation). This skill reads them all; you don't need a separate path per source.

**Runs at any lifecycle stage.** Synthesis is purely additive — it never changes thesis status (the
expression-driven cascade owns that). A `monitoring` thesis with claims but no articulation yet (the
ENTG case) gets its first underwriting here exactly like a `developing` one.

## What this is NOT — retired machinery (docs/v2/10 §6, §9)

The v1 metric-signal model is **gone**. Do **not**:
- specify metric thresholds, FRED series, price/IV triggers, or any `explicit_details`;
- wire data sources or reach for `/configure-signal` / a data-source registry;
- create triage records.

Signals here are **qualitative confirmation / invalidation / completion statements**. If you find
yourself writing a number to monitor or a data feed to watch, stop — that is the abandoned v1 model and
its cognitive-load sink. The whole point of 10 is that the resolution view falls out of the argument
itself.

**One distinction (docs/v2/14 §9):** *carrying an existing decision-grade sensor forward* across a
re-underwrite (via `supersedesSignalId`, Step 4.1) is **not** authoring one — you never write
`explicit_details` by hand; you only preserve a sensor a prior signal already had (a price ladder, a hard
floor) so statement iteration doesn't orphan it. Authoring a new sensor is still retired; preserving one is
the clean object model.

## Workflow

```
INPUT: thesis (ticker / title / id)
  → STEP 1   Load the thesis + all linked claims/observations (+ compositional context
             + the P3 observation inputs: signalQuality + candidateSignals)
  → STEP 2   Basis for the investment  (core argument · drivers · assumptions · confidence · timeframe)
  → STEP 3   Compositional dependencies (does this thesis depend on another?)
  → STEP 4   Basis for resolution      (confirmation / invalidation / completion — DERIVED from rebuttals)
  → STEP 4.1 Observation-driven refinement (sharpen/drop chronic-neutral · cover gaps · promote
             candidates · carry sensors forward)
  → STEP 5   Light refinement with the user (skipped in headless mode)
  → STEP 6   Push for falsifiability (a crisp statement, not a metric)
  → STEP 7   Store a new version via scripts/insert-thesis-articulation.ts
  → STEP 7b  Close out consumed candidate signals (resolve/dismiss)
OUTPUT: versioned articulation + derived resolution signals (chronic-neutral sharpened, gaps covered,
        decision-grade sensors preserved)
```

---

### Step 0 — Environment

```bash
set -a && source .env.local && set +a
```

### Step 1 — Load context

> **Completeness pre-check FIRST (standardized).** Synthesis reads only *linked* claims, so before
> loading, confirm the linked set is complete: run `npx tsx scripts/ops/thesis-snapshot.ts --ticker
> <T>` (or `--id`) and check **`thin.unlinkedClaimCount`**. If **> 0**, there are claims that bear on the
> thesis but aren't linked (asset = tagged with the ticker; macro = on a child asset thesis but not the
> macro) — **relate them first** (`/relate-research` or `link-claim-to-thesis`) so you don't underwrite a
> silently-incomplete/lopsided set. (Backstop only: won't catch no-ticker claims unrelated to a child
> asset, or un-promoted Tana content — relate-research stays primary.) When invoked from `/thesis`
> re-underwrite this is already handled upstream.

> **Observation-driven inputs (the P3 loop — load these too).** A re-underwrite isn't only
> claim-driven; it also acts on *what the tracking revealed* (docs/v2/14 §10.3). Pull both before
> synthesizing the resolution section (Step 4):
>
> ```bash
> # Signal-quality diagnostics (chronic-neutral statements + price coverage-gaps).
> npx tsx scripts/ops/thesis-snapshot.ts --id <THESIS_ID> --type <asset|macro>   # read .signalQuality
> # Candidate signals harvested by observe (coverage-hole news that matched no signal).
> npx tsx scripts/ops/resolve-candidate-signal.ts --list --thesis-id <THESIS_ID> --type <asset|macro>
> ```
>
> `signalQuality` is null until a thesis has enough observe history (expect quiet early on);
> `candidateSignals` is empty until observe harvests coverage holes. When either is non-empty,
> Step 4 **must act on it** (sharpen/drop chronic-neutral, cover the gap, promote/dismiss
> candidates) rather than regenerating the prior resolution verbatim. These are *inputs to your
> judgment*, not auto-applied.

**Prefer the query helpers** — they resolve multi-source provenance (including the new
`conversation` / `deep_research` / `agent_research` artifacts) automatically:

- Asset thesis: `getMainClaimsWithSourcesForAssetThesis(assetThesisId)`, plus `getAssetThesisById`,
  parent macros via `asset_thesis_related_macro_theses`, and prior articulation via
  `getLatestArticulation(id, 'asset')` (`src/db/queries/thesisSynthesis.ts`).
- Macro thesis: `getMainClaimsWithSourcesForThesis(thesisId)`, plus `getMacroThesisById`,
  `getLinkedAssetThesesForThesis`, and `getLatestArticulation(id, 'macro')`.

If you query SQL directly instead, use the templates in the Appendix — but the helpers are preferred
because they coalesce the direct-artifact provenance.

**Two things to internalize about the claims you load:**

1. **They may be sparse-Toulmin.** A conversation insight or agent-research observation may carry only
   `title` + `claim` + `category` — with `evidence` / `reasoning` / `backing` / `rebuttal` null. That is
   legal and expected. Treat such a claim as a *bearing/observation*: fold it into the relevant driver or
   assumption; do not demand a full Toulmin structure or discard it for lacking one.
2. **Source matters for weight.** Each claim's source artifact has a `source_type`
   (`article` / `transcript` / `report` / `deep_research` / `agent_research` / `conversation` / …). A
   deep-research pass or a structured transcript carries more evidential weight than a one-line
   conversation note. Let that inform confidence, not which claims you read.

Check for a prior articulation — you are producing the **next version** (re-underwriting), so note what
changed since it (new claims, new refuting evidence) and let that move conviction.

### Step 2 — Basis for the investment (the overview)

Synthesize the linked claims/observations into the bull-or-bear case.

#### 2.1 Core argument (2–4 sentences)

Distill all the material into one coherent, **falsifiable** assertion. Include the causal "because", be
specific about direction / magnitude / timeframe, and acknowledge the strongest counter-evidence.

❌ "NVDA is well-positioned to benefit from AI growth." — vague, unfalsifiable.
✅ "NVIDIA holds 80%+ datacenter GPU share through 2026 because CUDA's 15-year ecosystem creates
switching costs custom hyperscaler chips can't overcome in a 2–3 year cycle — despite Google moving 60%
of internal workloads to TPUs." — specific, causal, acknowledges the counter, measurable.

#### 2.2 Key drivers (3–5)

The factors that make the thesis play out. State each as a **condition** (not a prediction), and link it
to the claims that support it. These generate the **confirmation** view in Step 4.

#### 2.3 Key assumptions (3–5)

The implicit beliefs that must hold. Be ruthlessly honest — these, **inverted**, plus the claims'
rebuttals, generate the **invalidation** view in Step 4. Cover market / execution / macro / technical
assumptions as relevant.

#### 2.4 Confidence

`low | medium | high | very_high` + a 2–3 sentence rationale + the **evidence gaps** (what additional
research would move confidence). Confidence reflects quality of support, strength of counter-evidence,
testability of assumptions, and horizon — not claim count.

#### 2.5 Timeframe

`{ horizon, expectedResolution, keyMilestones }` — when you expect the thesis to resolve, and the
catalysts that will test it. This generates the **completion** view in Step 4.

### Step 3 — Compositional dependencies

Does this thesis logically depend on another? The Step 1 context returns parent macro theses for an
asset thesis — a parent macro is **almost always** a `depends_on` relationship. For each genuine
dependency, record it in `referencedTheses` and auto-create a **dependent invalidation signal** (Step 4):
if the parent thesis is invalidated/downgraded, this thesis must be re-evaluated.

Relationship types: `depends_on` (requires the other to be true), `supports` (provides evidence for the
other), `contradicts` (in tension with the other).

### Step 4 — Basis for resolution (signals — DERIVED, never configured)

This is the reframe (docs/v2/10 §2, §7). The resolution criteria are a **section of the underwriting**,
synthesized from the case's own material with **zero manual input** — you surface the view that already
lives in the claims, you don't author tripwires.

- **Invalidation** ← the linked claims' `rebuttal[]` arrays + the key assumptions **inverted** + any
  depended-on thesis failing. *Worked example (ENTG):* its 6 supporting claims each carried a Toulmin
  rebuttal, so the invalidation criteria fall straight out with no extra input —
  *"AI capex turns cyclical and revenue falls regardless of content-per-wafer"*,
  *"HBM yields mature and the insurance premium compresses"*,
  *"the re-rating is already in the ATH price."* Each is a falsification view the case itself contains.
- **Confirmation** ← the key drivers (Step 2.2) playing out — the most important things you'd observe in
  the world if the thesis is right.
- **Completion** ← the timeframe / target (Step 2.5) reached: the thesis won, remaining upside is priced
  in, consider taking profit. (Completion = *right and played out*; invalidation = *wrong*.)

**Quality over quantity.** Generate only signals genuinely grounded in the material — roughly up to **2
confirmation, 2 invalidation, 1 completion**. One well-grounded invalidation beats three weak ones. Each
signal is a **qualitative, specific, falsifiable statement** — no metrics, thresholds, or data sources.

#### Step 4.1 — Observation-driven refinement (the P3 loop — when the inputs are non-empty)

This is what makes a re-underwrite act on *what the tracking revealed*, not just on claims (docs/v2/14
§10.3). Because every run **regenerates the whole resolution section**, "acting on" each input is concrete:

- **`signalQuality.chronicNeutralSignals`** — statements observed repeatedly that **never discriminated**
  (always `neutral`). Do **not** regenerate them verbatim. Either **sharpen** the statement so it *could*
  flip (more specific, observable, time-boxed) — and when you do, set `supersedesSignalId` to that
  chronic-neutral signal's id (continuity + sensor carry-forward, below) — or **drop** it (omit it from
  the new set) if it was untestable/irrelevant. Say which you did, per signal.
- **`signalQuality.coverageGaps`** — a material price move **no signal flagged**. **Author a covering
  signal**: a confirmation/invalidation whose statement would catch that kind of move next time (grounded
  in a driver/assumption — name the gap in its `notes`).
- **`candidateSignals`** (from `resolve-candidate-signal.ts --list`) — coverage-hole news observe harvested
  that matched no signal. For each: judge if it is **genuinely load-bearing** on the thesis. If yes →
  include it as a new signal (its `statement` is the candidate's, refined; record the journal-row id to
  resolve in Step 7b). If no → leave it for Step 7b to **dismiss**. Promote sparingly — a candidate must
  bear on the *case*, not just be topical.

**Sensor carry-forward (statement↔sensor continuity, docs/v2/14 §9).** A prior signal may carry a
decision-grade **sensor** (`explicit_details` — a price ladder or a real metric threshold). Re-underwriting
supersedes prior signals, which would **orphan** the sensor. So when a new statement is the *continuation*
of a prior one (a sharpened chronic-neutral, or simply the same resolution leg re-expressed), set
`supersedesSignalId` to the prior signal's id — `insert-thesis-articulation.ts` then carries its real
sensor onto the new statement automatically (vestigial/qualitative `explicit_details` is intentionally
dropped). Check the prior resolution set (`resolution` in the snapshot, or the active signals) for sensors
worth preserving; the `scripts/ops/triage-sensors.ts` report tells you which sensors exist and are worth keeping.

Signal shape (consumed by `insert-thesis-articulation.ts`):

```typescript
{
  type: 'confirmation' | 'invalidation' | 'completion',
  statement: string,        // a clear, testable criterion you'd know when you saw it
  notes: string,            // why it matters + the action to take when it fires
  importance: 'critical',   // focused signals are all critical
  linkedClaimIds: string[], // which claims/observations this is grounded in
  sourceSection: 'key_driver' | 'key_assumption' | 'timeframe' | 'dependency',
  sourceDriverIndex: number,// zero-based index into that section's array
  // Statement↔sensor lineage — set when this statement CONTINUES a prior signal, so its
  // real sensor (explicit_details) is carried forward instead of orphaned (docs/v2/14 §9):
  supersedesSignalId?: string,
  // For a dependency-derived invalidation:
  dependentThesisId?: string, dependentThesisType?: 'macro' | 'asset',
  dependentThesisCondition?: 'invalidated' | 'confidence_drops' | 'status_changes',
}
```

### Step 5 — Light refinement (interactive)

Present the three faces and iterate if the user wants to adjust the argument, drivers/assumptions, or
resolution view. Don't block — accept the user's framing. **(Headless mode: skip this step.)**

```
## Underwriting: [THESIS TITLE]   (v[N])

Basis for the investment
  Core argument: …
  Key drivers: …
  Key assumptions: …
Basis for resolution
  Confirmation: …   Invalidation (from rebuttals): …   Completion: …
Conviction: [level] — [rationale]   ·   Evidence gaps: …
```

### Step 6 — Push for falsifiability (not precision)

For any vague resolution statement, push for a **crisp, falsifiable** version — one you'd recognise when
it happened. "Specificity" here means clarity, **not** a numeric threshold or a data feed. Accept
qualitative criteria; the goal is accountability, not false precision.

### Step 7 — Store a new version

Write the JSON and run the permanent script (it auto-versions, supersedes the prior version's signals,
inserts the new thin signals tied to this version, and logs the journal — it does **not** change thesis
status):

```bash
npx tsx scripts/insert-thesis-articulation.ts --input articulation-data.json
# or: cat articulation-data.json | npx tsx scripts/insert-thesis-articulation.ts --stdin
```

JSON shape (note: **no** hand-written `explicitDetails` / metric fields — sensors are never authored,
only *carried forward* via `supersedesSignalId`):

```json
{
  "thesisId": "[UUID]",
  "thesisType": "asset",
  "articulation": {
    "coreArgument": "…",
    "keyDrivers": [{ "driver": "…", "detail": "…", "supporting_claims": ["claim-uuid"] }],
    "keyAssumptions": [{ "assumption": "…", "detail": "…" }],
    "timeframe": { "horizon": "medium_term", "expectedResolution": "Q4 2026", "keyMilestones": ["…"] },
    "confidenceLevel": "high",
    "confidenceRationale": "…",
    "evidenceGaps": ["…"],
    "claimIdsUsed": ["claim-uuid-1", "claim-uuid-2"],
    "referencedTheses": []
  },
  "signals": [
    { "type": "confirmation", "statement": "…", "notes": "… Action: …",
      "linkedClaimIds": ["claim-uuid-1"], "sourceSection": "key_driver", "sourceDriverIndex": 0 },
    { "type": "invalidation", "statement": "… (sharpened from a chronic-neutral statement)", "notes": "…",
      "supersedesSignalId": "prior-signal-uuid", "sourceSection": "key_assumption", "sourceDriverIndex": 1 },
    { "type": "invalidation", "statement": "… (covers the price coverage-gap)", "notes": "… Action: re-evaluate.",
      "linkedClaimIds": ["claim-uuid-2"], "sourceSection": "key_assumption", "sourceDriverIndex": 0 }
  ]
}
```

Then `rm articulation-data.json`. Preview first with `--dry-run` to confirm which sensors carry forward:
`npx tsx scripts/insert-thesis-articulation.ts --input articulation-data.json --dry-run`.

**JSONB field reference:** `keyDrivers` `[{driver, detail?, supporting_claims?}]` · `keyAssumptions`
`[{assumption, detail?}]` · `timeframe` `{horizon, expectedResolution?, keyMilestones?}` · `evidenceGaps`
`string[]` · `claimIdsUsed` `string[]` (UUIDs — includes observation-claims) · `referencedTheses`
`[{thesisId, thesisType, title, relationship, notes?}]` · `linkedClaimIds` `string[]` (per signal) ·
`supersedesSignalId` `string?` (per signal — the prior signal whose statement this continues; carries its sensor).

### Step 7b — Close out consumed candidate signals (P3)

If Step 4.1 acted on any `candidateSignals`, mark each consumed row so it stops resurfacing (the script
re-read its own list, so use the journal-row `id` from Step 1's `--list`):

```bash
# Promoted a candidate into a real signal — record which signal it became:
npx tsx scripts/ops/resolve-candidate-signal.ts --resolve <candidateJournalId> --signal-id <newSignalId>
# Rejected a candidate as not load-bearing:
npx tsx scripts/ops/resolve-candidate-signal.ts --dismiss <candidateJournalId> --reason "<why>"
```

(`--signal-id` is optional but preferred — it links the candidate to the signal it became. Find the new
signal id by re-reading the thesis's active signals, or by `resolution` on a fresh `thesis-snapshot`.)

### Step 8 — Confirm

```
✅ Underwriting v[N] for [THESIS TITLE]
   Sources synthesized: [N claims/observations]
   Resolution: [X confirmation, Y invalidation, Z completion]   ·   Conviction: [level]
   Dependencies: [N referenced theses]
   → /thesis [TICKER] to query, or re-underwrite when new evidence lands.
```

---

## Error handling

- **No linked claims:** nothing to synthesize. Suggest capturing a source (`/tana-inbox`, deep research,
  or `capture-observation`) and relating it (`/relate-research`), then retry. A thesis can also be
  underwritten from a single rich source if the user insists — note the articulation will be thin.
- **Only 1–2 claims:** the articulation will be thin; proceed but flag it in `evidenceGaps`, or link more
  first.
- **Prior articulation exists:** you're producing the next version. Note what changed (new/refuting
  evidence) and whether conviction should move.

---

## Appendix — load SQL (if not using the query helpers)

**Macro — thesis + linked claims:**

```sql
SELECT mc.id, mc.title AS claim_title, mc.claim, mc.evidence, mc.reasoning, mc.backing,
       mc.qualifier, mc.rebuttal, mc.category, mc.relevant_tickers, ctm.mapping_type
FROM claim_thesis_mappings ctm
JOIN main_claims mc ON ctm.main_claim_id = mc.id
WHERE ctm.macro_thesis_id = '[MACRO_THESIS_ID]'
ORDER BY CASE ctm.mapping_type WHEN 'foundation' THEN 1 WHEN 'supports' THEN 2 WHEN 'refutes' THEN 3 END,
         mc.created_at DESC;
```

**Asset — parent macros (many-to-many via the join table) + linked claims:**

```sql
-- Parent macros:
SELECT mt.id, mt.title, mt.description, mt.confidence_level, mt.status
FROM asset_thesis_related_macro_theses atrm
JOIN macro_theses mt ON atrm.macro_thesis_id = mt.id
WHERE atrm.asset_thesis_id = '[ASSET_THESIS_ID]';

-- Linked claims (same SELECT as macro, with ctm.asset_thesis_id = '[ASSET_THESIS_ID]').
```

Asset theses link to macros via `asset_thesis_related_macro_theses` (a junction — one asset thesis can
have multiple parent macros), **not** a direct FK. Run via `npx tsx scripts/psql-query.ts "<QUERY>"
--format json`. To weight by source, also pull each claim's `source_type` (the helpers do this for you):
`main_claims → coalesce(source_artifact_id, source_insight_id → research_artifact_id) → research_artifacts.source_type`.

## Related skills

- `/thesis` — talk to a thesis (query · re-underwrite [calls this skill] · what's-changed).
- `/relate-research` — relate newly-extracted claims to the active thesis set (feeds this skill's inputs).
- `capture-observation` — log a conversation/agent insight as an observation-claim on a thesis.
