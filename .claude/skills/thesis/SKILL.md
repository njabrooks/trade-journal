---
name: thesis
description: Talk to a thesis (docs/v2/10 §3). Query its living underwriting — where it stands, the current case, what's challenging it, what's thin, what's changed — then re-underwrite it or propose loose next moves. The pull/curious foreground surface over a single thesis; genuine decisions harden via the Decision packet. Use when the user asks "where does <thesis/ticker> stand", "what's the case for X", "what's challenging X", "re-underwrite X", "what's changed on X", or wants to think about one thesis.
allowed-tools: Bash, Read
user_invocable: true
---

# /thesis — talk to a thesis

## Purpose

The **conversational, agent-led surface over one thesis's living underwriting** (docs/v2/10 §3) — the
headline of the loose-agent model. The user asks; you answer from the synthesized underwriting + linked
evidence + quant/graph context, and propose loose next moves. Looseness lives here, in the agent — the
schema just stores what conversations produce.

A thesis's **living underwriting** has three faces (docs/v2/10 §2):
- **Basis for the investment** — the core argument, key drivers, key assumptions (why I'm in it).
- **Basis for resolution** — the signals: what would confirm / complete / invalidate it (derived from the
  case's own counter-arguments, never configured).
- **Conviction** — current strength + rationale; the version series *is* its history.

## Boundary — what this is NOT

- **`/thesis` (this)** = *pull / curious / foreground / one thesis.* The user is thinking about a thesis
  right now. No worklist, no queue, no batch.
- **`/maintenance`** = the background freshness-keeper: drains worklists (digest refresh, signal
  derivation, health, research-gap, retrospective, framing, classify_exposure), advances the
  relate-research cursor, emits decisions. **Push / batch.** Do **not** run those loops here.
- **`/thesis-review`** = the individual background maintenance modes. `/thesis` may *invoke the synthesis
  path* (`/build-core-argument`) on demand, but it does not run review modes.
- **`/relate-research`** = relate newly-extracted claims to the active thesis set. `/thesis` consumes the
  result (a thesis's linked claims); it doesn't run the relating pass.

One-line rule: *asking about a thesis now → `/thesis`; draining a backlog → `/maintenance`.*

## Step 0 — Environment

```bash
set -a && source .env.local && set +a
```

## Step 1 — Resolve the thesis and load its state

Get the whole underwriting state in one read-only blob (deterministic gather; you do the judgment):

```bash
npx tsx scripts/ops/thesis-snapshot.ts --ticker ENTG     # asset by ticker
npx tsx scripts/ops/thesis-snapshot.ts --id <uuid> --type asset
npx tsx scripts/ops/thesis-snapshot.ts --title "AI Infrastructure"   # ILIKE, both layers
```

Then `Read` the JSON it prints. Shape (the surface you answer from):
- `thesis` — id, type, title, ticker, status, direction, confidenceLevel.
- `underwriting` — the latest articulation (the three faces), or **null** if never underwritten.
- `conviction` — current level + rationale. `versionHistory` — `[{version, confidenceLevel, createdAt}]`
  (the conviction trail).
- `resolution` — signals grouped `{confirmation, invalidation, completion}` (the resolution section).
- `claims` — linked claims/observations with `mappingType`, `qualifier`, `rebuttal[]`, `sourceType`
  (article / transcript / deep_research / conversation / …), `hasReasoning`/`hasBacking` (sparse-Toulmin
  flag).
- `strategies`, `performance` (realized + attribution; macro = full-credit exposure view), `allocation`
  (per-strategy pct-of-NAV + `sumPctNav`), `thin` (deterministic gap flags).
- `unlinkedByTicker` — **the completeness backstop**: claims tagged with the thesis's ticker that are
  **not yet linked** to it (count mirrored in `thin.unlinkedTickerClaims`). Non-zero = un-incorporated
  evidence. Ticker-only (asset theses) — does not catch no-ticker/macro claims or un-promoted Tana
  content, so it's a backstop, not a guarantee.

If `thesis-snapshot` returns `{error, candidates}`, show the candidates and ask which one (or take an
`--id`).

## Step 2 — Query verbs (read-only — answer from the snapshot)

- **"where does X stand?" / "what's the current case?"** → present the **three faces**: the basis for the
  investment (core argument + drivers + assumptions), the basis for resolution (the confirmation /
  invalidation / completion signals), and conviction (level + rationale). Add the live read: status,
  performance totals, allocation. If `underwriting` is null, say so plainly and offer to underwrite
  (Step 3).
- **"what's challenging it?"** → the falsification view: `resolution.invalidation` signals **+** claims
  with `mappingType: "refutes"` **+** the `rebuttal[]` arrays on the supporting claims (the counter-case
  the thesis's own evidence carries). For ENTG these rebuttals are the live challenges even before any
  signals exist.
- **"what's thin / unresolved?"** → read the `thin` block: missing articulation
  (`monitoringWithoutArticulation` = a live position with no underwriting — the stranding case),
  `evidenceGaps`, sparse-Toulmin observations (`hasReasoning`/`hasBacking` false), low claim count, refuting
  evidence accumulating, and **`unlinkedTickerClaims` > 0 = un-incorporated evidence not yet on the
  thesis**. Name the specific gaps and offer a move.
- **"what's changed since I looked?"** → Step 3's delta.

Present conversationally and decision-first — a digest, not a form dump.

## Step 3 — Synthesis verbs (writes, via existing scripts)

**Re-underwrite ("re-underwrite X", "underwrite X", "rebuild the case"):**

> **Completeness pre-check (do this FIRST — standardized, not optional).** Synthesis reads only *linked*
> claims, so before building, check the snapshot's **`thin.unlinkedTickerClaims`**. If it's **> 0**, there
> is un-incorporated evidence tagged with this ticker — **relate it first** (`/relate-research` over those
> claims, or `link-claim-to-thesis` for clearly-on-thesis ones) so the underwriting isn't built on a
> silently-incomplete (and possibly lopsided) set. Surface the count + a bull/bear read and let the user
> choose scope before synthesizing. (Caveat: ticker-only — no-ticker/macro claims and un-promoted Tana
> content still rely on relate-research having run; mention that the check is a backstop.)

Then invoke **`/build-core-argument`**
for `{thesisId, thesisType}`. It reads all linked claims (including conversation/research observations),
derives the resolution section from the claims' rebuttals + inverted assumptions with zero manual input,
and writes a **new articulation version** (superseding the prior version's signals). The version series is
the conviction history. For a stranded monitoring thesis (ENTG: 0 versions, 6 rebuttal-carrying claims),
this builds v1 and its invalidation signals fall straight out of the rebuttals. Note: re-underwriting a
thesis that *already* has signals supersedes them (marked rejected, recoverable) and writes a fresh
resolution section on the new version — that's intended (the version series is the history), but say so
before re-underwriting a thesis with a curated signal set. (This is distinct from the `/thesis-review`
background **digest mode**, which stays developing-only precisely because it refreshes the overview
*without* regenerating signals; `build-core-argument` always regenerates them, so it's safe on monitoring.)

**What's-changed (the delta):** compute new evidence since the last underwriting.
1. `ts = underwriting.createdAt` (if null, *everything* is new → offer to underwrite).
2. New/newly-linked claims since `ts` (claim created after, **or** linked after):

```bash
npx tsx scripts/psql-query.ts "
SELECT mc.id, mc.title, mc.qualifier, ctm.mapping_type, ctm.mapped_at, mc.created_at,
       coalesce(ra.source_type, ra2.source_type) AS source_type,
       (mc.rebuttal IS NOT NULL AND array_length(mc.rebuttal,1) > 0) AS has_rebuttal
FROM claim_thesis_mappings ctm
JOIN main_claims mc ON mc.id = ctm.main_claim_id
LEFT JOIN research_artifacts ra  ON ra.id  = mc.source_artifact_id
LEFT JOIN research_insights ri   ON ri.id  = mc.source_insight_id
LEFT JOIN research_artifacts ra2 ON ra2.id = ri.research_artifact_id
WHERE ctm.<asset|macro>_thesis_id = '<THESIS_ID>'
  AND (mc.created_at > '<TS>' OR ctm.mapped_at > '<TS>')
ORDER BY ctm.mapped_at DESC" --format json
```

3. Read the delta against the assumptions/resolution view: **refuting** evidence (or new rebuttals) bears
   on the *resolution* view → revisit invalidation; **supporting** evidence bears on *conviction/drivers*.
4. Report: "N new observations since v{version} ({date}); {k} refuting → revisit invalidation, {m}
   supporting → conviction may firm." Then offer to re-underwrite.

## Step 4 — Propose loose next moves (don't auto-execute the soft ones)

Suggest, the user picks — **develop** (capture a source / run deep research / log an observation),
**reconsider sizing**, **revisit conviction**, **mark resolved**. Soft moves stay conversational. Two
moves have concrete tools:

- **Log an observation** (an insight from this conversation) → capture it so it feeds the underwriting:
  ```bash
  npx tsx scripts/ops/capture-observation.ts --text "<the insight>" --category asset_specific \
    --source-type conversation --tickers "<TICKER>" \
    --link-to-thesis-id <uuid> --link-to-thesis-type asset --mapping-type supports
  ```
  (Add `--dry-run` to preview. Use `--mapping-type refutes` for counter-evidence.)
- **A genuine decision** (the few moments that must harden — develop a thin live thesis, commission deep
  research, act on refuting evidence) → raise a typed Decision packet for the DecisionStrip:
  ```bash
  npx tsx scripts/ops/raise-decision.ts --object-type asset_thesis --id <uuid> \
    --title "<headline>" --decision-type <develop_thin_thesis|run_deep_dive|review_refuting_claim> \
    --why "<one line>"
  ```
  It dedupes per object (won't double-post). Use this **only** for genuine decisions — everything else
  stays in chat. Valid `decision-type` values: see `src/lib/types/decisions.ts`.

Pointers (don't run): deep research = the `stage-1…5` pipeline skills; new source capture = `/tana-inbox`.

## Step 5 — Worked query recipes (D5 — capabilities, not features)

These are queries you run on the fly over the snapshot + quant/graph (docs/v2/10 §6) — **not** dashboard
modules to build.

**"Do my allocations match my conviction?"** For one thesis it's in the snapshot: `conviction.current`
(map `low=1, medium=2, high=3, very_high=4`) vs `allocation.sumPctNav` (Σ pct-of-NAV across linked
strategies). Flag mismatch: high/very_high conviction + low % = **under-allocated**; low/exploratory +
high % = **over-allocated**. Across many theses, loop snapshots (or query `thesis_articulations`
`confidence_level` × `strategy_metrics_snapshots` `pct_nav_abs_notional` via the thesis→strategy graph).
**Macro level:** use the snapshot's `performance` (W5 full-credit attribution) — don't naively sum child
allocations (docs/v2/10 §6).

**"Which live theses have no underwriting?"** (the stranding scan — ENTG was one):
```bash
npx tsx scripts/psql-query.ts "
SELECT 'asset' AS type, at.id, at.title FROM asset_theses at
WHERE at.status='monitoring' AND NOT EXISTS (SELECT 1 FROM thesis_articulations ta WHERE ta.thesis_id=at.id)
UNION ALL
SELECT 'macro', mt.id, mt.title FROM macro_theses mt
WHERE mt.status='monitoring' AND NOT EXISTS (SELECT 1 FROM thesis_articulations ta WHERE ta.thesis_id=mt.id)" --format json
```

**"Which theses are accumulating refuting evidence?"** count `claim_thesis_mappings` with
`mapping_type='refutes'` per thesis (high counts = the case is being challenged).

## Notes

- Read-only by default; the only writes are the explicit Step 3 (re-underwrite) and Step 4
  (capture-observation / raise-decision) actions the user chose.
- `monitoring` is a **position flag**, not an info-gate — information attaches to a thesis by *bearing*
  whether or not you hold it (docs/v2/10 §7). So query/underwrite a developing thesis exactly as you would
  a monitoring one.
- On-demand only; no schedule (the background cadence is `/maintenance`'s job).
