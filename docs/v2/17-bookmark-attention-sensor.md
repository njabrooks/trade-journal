# 17 — Bookmarks as a human-attention sensor (`relate-bookmark` + attention-weighting)

> **Status:** SPEC + **Phases 1–3 BUILT + VALIDATED 2026-06-25** (§10; only the §8 #8/#9 deferrals remain). Design
> conversation w/ Claude. Folds the dead-ended Tana `#bookmark`
> stream into the **monitoring lane** (not the claim lane) as a distinct *human-attention* evidence
> source. Builds on the self-improving loop: [14 thesis-observe](14-thesis-tracking-evidence.md),
> [15 signal-quality diagnostics](15-signal-quality-diagnostics.md),
> [16 P2/P3/P4 lane briefs](16-p2-p3-p4-lane-briefs.md). Routes through the §1b `candidate_signal`
> contract (16) and the unified `re_underwrite_due` raiser (15 §6); honours the tracking-only
> denominator (15 §4.2). Siblings: [10 loose-agent model](10-thesis-underwriting-loose-agent-model.md),
> [13 macro-emergence](13-macro-emergence-and-episodic-performance.md). **Next: implementation.**

## 1. Problem — half the curated stream is dead-ended

The Tana capture pipeline produces **two** node types and only routes one of them:

- **`#content`** → full Toulmin extraction (`tana-content-ingest.py`) → `/relate-research` → `main_claims`
  + `claim_thesis_mappings`. This is the **belief-formation** path: it builds the *argument*.
- **`#bookmark`** → created (X/Twitter saves, lighter web saves), classified for free by Haiku at ingest
  (Category ∈ investment/general/policy, Topics, Themes), Status=Backlog … and then **nothing**.
  `tana-content-ingest.py` searches only `CONTENT_TAG` (`notes/scripts/tana-content-ingest.py:509`), so
  bookmarks are never picked up. They sit inert until a human manually re-tags one to `#content`.

A bookmark is genuinely **too thin for a Toulmin claim** — a URL + title + author + tweet text, no
warrant/backing/evidence structure. Forcing it down the claim path would mint junk claims and clutter the
case browser. So the dead-end was a *correct* call for the formation lane.

But it's the wrong call overall, because a bookmark carries information the formation lane can't use yet
the **monitoring** lane can: the user looked at this, judged it worth saving, and (often) it bears on a
*live* thesis. The motivating example — a GLXY bookmark
(`https://app.tana.inc?nodeid=SYXsY3Tz6oM7`) — is not an argument about Galaxy Digital; it's a curated
data-point that may bear on a GLXY thesis's signals, and/or a sign the user is paying attention to
something the formal signal set isn't tracking. That belongs in the eyes-&-ears loop ([14](14-thesis-tracking-evidence.md)),
not the claim browser.

## 2. The reframe — attention, not argument (and not judgment)

The belief layer already distinguishes two evidence kinds. Bookmarks force a useful **third**:

| Kind | Example producer | What it asserts | Lives in |
|---|---|---|---|
| **Argument** | `#content` → relate-research | "Here is a warranted claim that supports/refutes a thesis" | `main_claims` (formation) |
| **Judgment** | thesis-observe | "I looked at the world and scored this signal strengthening/weakening" | `signal_data_snapshots` (`thesis_observe`) |
| **Attention** | `#bookmark` (this doc) | "A human thought this was worth saving against this name" | journal `candidate_signal` + attention-weight (monitoring) |

The distinction is load-bearing for routing:

- A bookmark is **not an argument** ⇒ never a claim by default (escape hatch: §5.4).
- A bookmark is **not even a judgment** ⇒ it carries no `strengthening/weakening` verdict. It is the raw
  fact *that the user attended to it*. This is exactly why it must **never** enter the chronic-neutral
  denominator (§4) — a bookmark with no verdict is not "observed and saw nothing."

What a bookmark *does* carry that the machine producers don't: **curation**. thesis-observe sweeps via
blind WebSearch; it finds what's searchable and weights by recency. A bookmark reflects the user's
judgment about what matters, often from sources (X threads, niche substacks) the WebSearch underweights —
and, in aggregate, *what the user is paying attention to*, which is orthogonal to anything observe knows.

## 3. The symmetry — bookmarks are the *human* eyes & ears

thesis-observe is the system's **machine** eyes & ears (14). Bookmarks are the user's **human** eyes &
ears. They produce the same *shape* of output (observations keyed to theses/signals), so they ride the
**same monitoring rails** — with one new front-door relate step that mirrors `/relate-research`:

```
  BELIEF FORMATION (the case)            BELIEF MONITORING (sensing the world)
  ─────────────────────────             ─────────────────────────────────────
  #content → Toulmin claims              thesis-observe ─ machine eyes (blind WebSearch, scored)
    → /relate-research                   #bookmark      ─ human eyes  (curated saves)      ← NEW
    → claim_thesis_mappings                   │
                                              ▼
                                       /relate-bookmark  ── judges significance & bearing
                                              │
                  ┌───────────────────────────┼───────────────────────────┐
                  ▼                            ▼                           ▼
        candidate_signal             attention-weight on            (stretch) thesis-
        journal rows (16 §1b)        re_underwrite_due (15 §6)       emergence nudge (13)
                  │                            │
                  ▼                            ▼
        thesis-snapshot.candidateSignals   raiser ranking + evidence_context.attention
                  │                            │
                  └──────────► /thesis re-underwrite consumes both ◄────────┘
```

**The governing law (`relate-research : claims :: relate-bookmark : observations`):** like relate-research,
relate-bookmark **auto-routes the clear, surfaces only genuine decisions, and leaves the irrelevant
majority in Tana.** It never produces a review queue (the docs/v2 principle — *the system curates; the
user only touches genuine decisions*). The genuine decisions it feeds are the ones that already exist
(promote a candidate signal? act on a re-underwrite?), not a new "triage your bookmarks" surface.

## 4. The hard constraint — the tracking-only denominator (do not break this)

P1's chronic-neutral diagnostic ([15 §3.1, §4.2](15-signal-quality-diagnostics.md)) counts a signal as
`chronic_neutral` when it was *observed enough times and never discriminated*. That is only meaningful
because a tracking `neutral` means **"a producer looked and saw nothing."** The diagnostic therefore
counts **only** `data_source ∈ {thesis_observe, thesis_monitor}`
(`src/lib/derived/signalQualityRules.ts` — `TRACKING_SOURCES`), excluding `daily_synthesis` gap-fill,
`research_routing`, quant collectors, and `thesis_health`.

> **The trap:** bookmarks are *attention*, not *judgment*. A bookmark has **no verdict**. If a bookmark
> ever lands in `signal_data_snapshots` with `assessment='neutral'` under a tracking `data_source`, it
> would be miscounted as "observed and saw nothing" and could falsely tip a signal into `chronic_neutral`
> — corrupting the exact diagnostic this fold-in is meant to *strengthen*.

**Rule:** bookmarks **never** write a tracking `signal_data_snapshot`. They live on a separate axis
(journal `candidate_signal` rows + an `attention` block in the re-underwrite evidence context). If we ever
do want them in `signal_data_snapshots` for provenance, it must be a **non-tracking** `data_source`
(`'human_bookmark'`) that is explicitly absent from `TRACKING_SOURCES` — and `signalQualityRules` already
re-filters in JS as belt-and-braces (15 §2). Default plan: **don't put them there at all.**

## 5. Design — `/relate-bookmark`

A new producer/relate step, sibling to `/relate-research`, owning the bookmark→monitoring routing.

### 5.1 Inputs
1. **New investment `#bookmark` nodes** from Tana — Status=Backlog, `Category='investment'` (the free
   Haiku classification already filters ~all the noise at the door; general/policy bookmarks are skipped).
   Cursor-based like relate-research (process new, advance a cursor).
2. **Ticker(s)** — from the new **Tickers** field on the `#bookmark` supertag (added 2026-06-25). New
   bookmarks populate it at processing time; existing bookmarks need a one-time **backfill** (§7).
3. **The active thesis set** — *active* monitoring + developing theses with their tickers/sectors/signals
   (reuse relate-research's active-set loader; under the loose-agent model attention attaches by *bearing*
   regardless of `monitoring` vs `developing`).

### 5.2 The judgment (this is the point — §fork-b)
For each bookmark, Claude (not a heuristic) resolves bearing and **grades significance/importance** — the
explicit ask from the design conversation: *we want Claude to exercise judgment on the significance and
importance of the bookmark*, not a count threshold. Per bookmark:

1. **Resolve bearing** — which active thesis (and, if applicable, which of its signals) does this bear on?
   Asset thesis via ticker; macro via sector/topic/theme. No match → **leave in Tana**, advance cursor.
2. **Grade significance** — a graded judgment, *not* a binary and *not* a tally:

   | Grade | Meaning | Routing |
   |---|---|---|
   | `trivial` | idle save, thematic adjacency, duplicative of known evidence | leave in Tana; no DB write |
   | `notable` | a real data-point bearing on the thesis, but not decision-moving | → `candidate_signal` (if no matching signal) **or** attention-weight |
   | `material` | plausibly bears on the thesis's *resolution* — an event/figure that could move a signal | → `candidate_signal` **and** attention-weight; optionally tee into the observe context bundle |

   A single `material` bookmark outweighs ten `trivial` ones — weight is **judged**, never `count(*)`.

### 5.3 Outputs (two channels, both existing rails)

**A. Candidate signals** (the [16 §1b](16-p2-p3-p4-lane-briefs.md) contract, reused verbatim). For a
`notable`/`material` bookmark that bears on a thesis but matches **no active signal** — "the user is
watching something we don't formally track":
- `journal_entries`: `action_type='candidate_signal'`, `object_type ∈ {asset,macro}_thesis`,
  `object_id=thesisId`, `action_description=` proposed signal statement, `source='automation'`,
  `status='active'`.
- `metadata.candidateSignal = { statement, sourceUrl, observedAt, fromReport: 'relate-bookmark',
  rationale, origin: 'bookmark', significance }`. The `origin`/`significance` keys discriminate
  bookmark-sourced candidates from observe-sourced ones.
- **Dedup:** one active candidate per `(object_id, normalized statement)` — bump, don't duplicate
  (mirrors Lane A).
- **Surfaces for free** on `thesis-snapshot.ts → candidateSignals` (Lane A already added this read), so
  `/thesis` re-underwrite already consumes it. **No new surface to build.**

**B. Attention-weight on `re_underwrite_due`** (the [15 §6](15-signal-quality-diagnostics.md) raiser).
Per **fork (b): boost priority, do not raise standalone.** Accumulated judged-significant attention on a
thesis is a **ranking modifier and evidence enrichment on triggers that already fired** (claim-delta or
signal-quality), never an independent raise:
- Add an optional `attention` block to the packet's `evidence_context`:
  ```ts
  attention?: {
    score: number;                 // Σ significance-weighted recent bookmarks, time-decayed
    materialCount: number;
    recent: [{ title, sourceUrl, significance, observedAt }];  // top few, for the packet
    detail: string;                // "5 investment bookmarks on GLXY in 18d (2 material) — user attention rising"
  }
  ```
- The raiser's `gatherMerged()` reads attention **only to enrich/rank** an existing `re_underwrite_due`
  for that thesis. If neither claim-delta nor signal-quality fired, attention **does not** create a
  decision — the significant bookmarks already surfaced via channel A (candidate_signal) and wait for the
  next re-underwrite. This is the conservative posture the user chose.

### 5.4 Escape hatch — promotion to a lightweight claim (rare, explicit)
A bookmark Claude judges to *assert* something thesis-relevant (not just point at it) can be promoted to a
**lightweight claim** via the existing `scripts/ops/capture-observation.ts` path (sparse Toulmin:
title+claim+category+qualifier, `source_artifact_id` provenance, optional direct thesis link). This is a
**manual/opt-in** escalation surfaced as a suggestion in the relate-bookmark run output — **never** the
default, to keep the claim browser clean.

## 6. How it folds into the auto-improvement loop

The self-improving loop (15) today triggers re-underwrite from **two** detectors — claim-delta
(`reunderwriteDue.ts`) and signal-quality (`signalQualityDiagnostics.ts`) — merged into one packet by
`raise-reunderwrite-decisions.ts`. This adds a **third, judgment-weighted input** that is deliberately
*not* a third independent trigger:

- **Coverage gaps gain a leading-indicator sensor.** Today coverage-gap detection is **price-based**
  (a material move no signal flagged, 15 §3.2). Human attention is a *second* coverage sensor — and a
  **leading** one (attention usually precedes the price move). "The user is bookmarking GLXY but the
  thesis's signals are chronic-neutral / there's no signal for what they're reading" is precisely the
  divergence the loop wants — surfaced as ranking weight + candidate signals, so the *next* re-underwrite
  acts on it.
- **It respects the denominator (§4)** and the decision boundary: attention enriches, the existing
  detectors decide *whether* to raise, the re-underwrite decides *what to do*. No new auto-decisions.
- **The virtuous cycle extends:** weak/absent signals get flagged (15) → re-underwrite sharpens them →
  *and now* the user's own attention nominates the gaps to cover first.

## 7. Tana-side mechanics

- **Tickers field** — added to the `#bookmark` supertag 2026-06-25. **New** bookmarks: populate during
  processing (extend `notes/scripts/tana-bookmarks-ingest.py` or set it in the relate-bookmark pass).
  **Existing** bookmarks: a **one-time backfill** resolving ticker(s) from Title/Topics/Transcript
  (cheap Haiku pass; the same classifier already runs at ingest). Adding the field does **not**
  retroactively populate it — the backfill is a required migration step, not optional.
- **Reuse the free classification** — Category/Topics/Themes are already set at ingest and currently
  unread. relate-bookmark consumes them (Category filter, Topic/Theme as matching hints) at zero new cost.
- **Don't re-tag to `#content`** — bookmarks stay `#bookmark`. The fold-in reads them in place; it does
  not push them into the claim extractor (that remains the manual promote path for the rare rich save).
- **Volume control** — `Category='investment'` + judged-`trivial`-dropped keeps the DB writes to the few
  bookmarks that actually bear. X bookmark volume never reaches the belief layer as noise.

## 8. Open decisions

| # | Decision | Resolution |
|---|---|---|
| 1 | **Routing lane** — claims vs monitoring | ✅ **Monitoring only.** Bookmarks = attention, never claims by default (§2, §5.4). |
| 2 | **fork (a): ticker resolution** | ✅ **Structured Tickers field** on the supertag (done 2026-06-25); populate new at processing, **backfill existing** (§7). |
| 3 | **fork (b): standalone decision vs boost** | ✅ **Boost/enrich only**, never an independent raise; weight is **judgment-graded, not count-based** (§5.2, §5.3B). |
| 4 | **Denominator safety** | ✅ Bookmarks **never** write a tracking `signal_data_snapshot`; separate axis (§4). |
| 5 | Execution substrate / Tana access for relate-bookmark | **Mirror `/relate-research`** (cursor + active-set loader + Tana read). Confirm its exact Tana-access pattern at build time. |
| 6 | Cadence | Default: **piggyback the relate-research run** (same trigger, one more pass). Revisit a dedicated schedule only if volume warrants. |
| 7 | Backfill resolver | Haiku pass over existing investment `#bookmark` Title/Topics/Transcript → Tickers. One-shot script. |
| 8 | Observe context-feed (tee `material` bookmarks into the observe bundle) | **Defer to phase 2** — nice-to-have; the candidate_signal + attention channels deliver the core value without it. |
| 9 | Thesis-emergence from bookmark clusters (no thesis exists) | **Defer** — route through [13 macro-emergence](13-macro-emergence-and-episodic-performance.md), not here. |

## 9. Non-goals

- ❌ **Per-bookmark tracking snapshots.** No `signal_data_snapshot` per bookmark — the value is at the
  thesis/attention level, and per-item snapshots would risk the denominator and over-route noise (§4).
- ❌ **Bookmarks as claims by default.** Only the explicit §5.4 escape hatch, opt-in.
- ❌ **Count-threshold mechanics** ("5 bookmarks ⇒ decision"). Significance is **judged** (§5.2).
- ❌ **A standalone attention decision type.** Attention enriches existing triggers; it never raises
  (fork b).
- ❌ **A bookmark review queue / triage surface.** Auto-route the clear; leave the rest in Tana.
- ❌ **Re-tagging bookmarks to `#content`** or pushing them through Toulmin extraction.

## 10. Phased build (value-ordered)

1. **`/relate-bookmark` + candidate-signal harvest** *(keystone)* — ✅ **BUILT + VALIDATED 2026-06-25.**
   The relate step (§5.1–5.2) writing channel A (§5.3A) on the existing 16 §1b contract. Highest value,
   smallest new infra (the surface already exists on `thesis-snapshot`).
   Shipped: `src/lib/intelligence/candidateSignals.ts` (the single shared candidate-signal writer — pure
   `normalizeStatement`/`findDuplicateCandidate` + `upsertCandidateSignal`; `ingest-world-monitor.ts`
   `harvestCandidateSignals` refactored onto it so observe + bookmarks write identical rows),
   `src/lib/intelligence/relateBookmark.ts` (catalog-with-signals loader + `applyBookmarkPlan`),
   `scripts/relate-bookmark.ts` (CLI: default emits catalog; `--apply <file|->` boundary-validates then
   writes; `--dry-run`), `.claude/skills/relate-bookmark/SKILL.md` (Claude reads `#bookmark` via the
   `tana-local` MCP, judges, applies, flips Status Backlog→Done/Dropped), + a vitest on the dedup logic.
   Validated end-to-end on the real GLXY bookmark (`SYXsY3Tz6oM7`): judged `material`, uncovered by the 5
   Helios-specific signals → wrote a `candidate_signal` on *Bullish GLXY Medium Term* (origin=bookmark)
   that surfaces on `thesis-snapshot --ticker GLXY`; bookmark flipped to Done. `npm run build` + `npm test`
   (301) + targeted lint green.
2. **Tickers population** (§7) — ✅ **BUILT 2026-06-25.** Reframed on contact with the data: there is **no
   mass backfill script**. (a) Most investment bookmarks have **no** ticker (macro/thematic/tooling) — N/A.
   (b) `#ticker` nodes are **non-canonical** — per-occurrence dupes minted by `#content` extraction (multiple
   `CIEN`/`SNPS`/`GLW`/`LLY`, many trashed; no `GLXY`), so the field has no clean registry to point at. So
   relate-bookmark **populates Tickers during processing** (skill §5a: find existing non-trash `#ticker` →
   else create a canonical one in the Library → `set_field_content` reference). The Backlog *is* the existing
   corpus, so processing it *is* the backfill. Validated on the GLXY bookmark (`Tickers → GLXY #ticker`).
   **Follow-up:** a `#ticker` canonicalisation pass is the prerequisite for reliable ticker-based clustering.
3. **Attention-weight on `re_underwrite_due`** (§5.3B) — ✅ **BUILT + VALIDATED 2026-06-25.** `src/lib/derived/
   bookmarkAttentionRules.ts` (pure: significance-weighted, linearly time-decayed score over a 60d window;
   `strong` at ≥1.5 ≈ one recent material or two fresh notables) + `bookmarkAttention.ts` (DB: rolls up
   bookmark-origin `candidate_signal`s per thesis). The raiser (`raise-reunderwrite-decisions.ts`) attaches
   `attention` to `evidence_context` and boosts confidence to `high` — but **only on theses already due**
   from claim-delta / signal-quality (fork b: never a standalone raise). Also surfaced on `thesis-snapshot`.
   Validated: GLXY shows `strong` attention on the snapshot yet is correctly absent from the raiser (not due).
4. **(later) Observe context-feed** (§8 #8) and **thesis-emergence** (§8 #9) — deferred.

**Acceptance:** `/relate-bookmark` routes a real investment bookmark to the correct active thesis, grades
significance, writes a deduped `candidate_signal` that shows up under `thesis-snapshot --ticker <X>`
→ `candidateSignals`; trivial/irrelevant bookmarks are left in Tana; **no** bookmark writes a tracking
`signal_data_snapshot`; the attention block enriches (never raises) a `re_underwrite_due`; backfill
populates Tickers on existing investment bookmarks; `npm run build` + `npm test` + lint green.
