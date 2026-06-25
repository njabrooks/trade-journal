# thesis-observe — the tracking-evidence producer ("eyes & ears")

## Purpose

Turn the outside world into **scored, sourced, per-signal evidence** for the live belief
layer. For each active monitoring thesis (tiered by portfolio materiality), sweep current
news + fresh price and judge, **per signal**, whether the world's developments bear on that
signal's specific criterion — emitting a directive report the existing ingest already knows
how to consume.

This revives the dead `thesis_monitor` producer (docs/v2/14): the entire signal-evidence
collection layer went dark **2026-04-06**, so `daily_synthesis` has been aggregating ~nothing
and the health pass rubber-stamps "neutral." Observe is the fix — it re-feeds the stream.

## The one hard boundary — SENSING, NOT DECIDING

**This skill writes evidence and journals it. It NEVER raises a decision, changes a thesis/
signal status, or re-underwrites anything.** Turning accumulated weakening into a decision is
the consumer's job (`/thesis-review` health pass + `/maintenance`). Do not call `raise-decision`,
`update-entity-status`, or `build-core-argument` from here. The observer *enriches the evidence
stream*; the health loop *decides*. (This is the v2 law: no unreviewed queues, decisions are
deliberate — docs/v2/14 §3.1.)

## What makes this good (and not the killed W9 router)

W9 killed a heuristic keyword router that was 82% noise — it scored an *insider sale* and a
*scheduled earnings date* as "strengthening." This skill is the opposite: **Claude judges each
item's actual bearing on each signal.** The capability that matters is **discriminating
relevance** — the same news story should score *differently across signals by how it actually
bears on each one* (e.g. on 2026-04-06 an IRGC threat to a Gulf data center was irrelevant to a
West-Texas-sited thesis, an indirect customer-concentration risk to another, and "geopolitical
not demand" to a third). If you find yourself scoring by keyword overlap, stop — read the
**statement** and judge.

## Pipeline

```
1. Load the Tier-1 observation bundle   (find-theses-due-observe.ts → signals + prior evidence)
2. Load the previous observe report      (for genuine change-from-prior)
3. Per thesis: WebSearch news bearing on the thesis + its signal themes
4. Per signal: judge the evidence against the STATEMENT → Score/Evidence/Assessment/Δ
5. Compile the directive report           (type: thesis-observe; Signal ID required)
6. Save to notes/intelligence/
7. Ingest → signal_data_snapshots(data_source='thesis_observe') + journal non-neutral
8. (optional) git commit the report
9. Report a summary
```

---

## Step 1 — Load the Tier-1 observation bundle

Run from the trade-journal directory. This is the **exact bundle to observe** — the
tiered thesis set, each thesis's active signals, and the recent prior evidence per signal
(for the change-from-prior delta).

```bash
cd /Users/home-hub/projects/trade-journal
npx tsx scripts/ops/find-theses-due-observe.ts --due    # scheduled: cadence-aware slice (P4 #3)
```

Output is JSON: `{ generatedAt, selection, tiers, thesisCount, signalCount, bundles: [...] }`. Each bundle:
`{ tier, thesisId, thesisType, title, direction, confidence, ticker|sectors, spot, materialityUsd,
priceWatch: [{ ticker, assetClass, direction, live, liveSource, asOf, storedSpot, deltaVsStoredPct, targetPrice, toTargetPct, unpriced, note }],
signals: [{ id, type, statement, notes, collectorTracked, recentEvidence: [{assessment, evidenceSummary, dataSource, snapshotDate}] }] }`.

**`--due` is the scheduled cadence (P4 #3 — docs/v2/14 §3.6):** Tier-1 daily, Tier-2 every ~2–3d,
Tier-3 weekly, keyed on each thesis's last `thesis_observe` snapshot. Tiering is the token-cost
lever that killed v1 — `--due` honors it by only pulling a tier when its floor has elapsed.
**Note:** the *first* `--due` run after a gap is a full baseline (every never-observed thesis is
due at once); it settles to the per-tier cadence on subsequent days. If cost bites on a given run,
fall back to `npx tsx scripts/ops/find-theses-due-observe.ts` (bare = **Tier-1 only**) or `--tier 1`.
(`--summary` shows the full ranking + tier bands; `--all` forces every tier.)

The signal **`statement`** is the thing you judge against. Most signals have no configured
metric; read the statement. The bundle now carries **`collectorTracked`** per signal — a
deterministic flag (true when a quantitative sensor owns the signal) — so you no longer infer
quant-vs-qual from the statement: **defer the `collectorTracked: true` ones** per the rule in
Step 5 (docs/v2/15 §8).

## Step 2 — Load the previous observe report (for change-from-prior)

```bash
ls -t /Users/home-hub/projects/notes/intelligence/*thesis-observe*.md 2>/dev/null | head -1
```

Read it if present. Use it to populate **Change from prior** honestly (what moved since the last
observation), to avoid repeating identical analysis, and to track stories flagged "approaching."
Also use each signal's `recentEvidence` from Step 1. If there is no prior observe evidence (the
stream was dead until now), say so: "First observation this cycle — establishing baseline."

## Step 3 — Gather news, per thesis (WebSearch)

For each thesis in the bundle, run targeted **WebSearch** for developments bearing on the thesis
and its signal themes (no feed infra to maintain). Build queries from the thesis title/ticker/
sectors and the **specific signal statements** — search the *conditions*, not just the ticker.

- **Recency:** restrict to the last ~24–48h of developments (this is a daily tracking sweep, not
  a literature review). Prefer primary/reputable sources; capture **source URLs** — every
  non-neutral score needs one.
- **Depth by signal type:** research **invalidation** signals most thoroughly (they threaten the
  position); moderate for confirmation; for completion, note proximity/catalysts.
- **`WebFetch`** a key article when a headline alone can't tell you whether the *specific*
  condition advanced.
- One thesis's fetched news often bears on several theses' signals (a BTC story touches Bullish
  BTC, Tokenisation, Monetary Debasement) — reuse it, scoring each signal by its own bearing.

## Step 4 — PRICE & DATA WATCH (off live prices)

Each bundle now carries a **`priceWatch`** array — the freshest spot per constituent underlying
from the **W6 `livePrices.ts` overlay** (Yahoo → IBKR), computed deterministically by the worklist
script. **Use this, not the stale `spot`/`storedSpot`** — `livePrices` is the direct fix for the
stale-price / Bearish-Oil miss (a live thesis's defining price move that the stored daily spot
never caught). Per entry:

- **`live`** — the freshest price (use this everywhere you reason about price). **`liveSource`/`asOf`**
  tell you its provenance/freshness.
- **`deltaVsStoredPct`** — how far `live` has drifted from `storedSpot` (the last daily-ingest close).
  A large drift means the stored figure is stale — flag it; it is often itself the news.
- **`toTargetPct`** — signed proximity to the thesis target (`targetPrice`), when one is set.
- **`unpriced: true`** (with a `note`) — an accepted gap (futures CL/HG, private SPACEX, bonds). Render
  it as "—"; fall back to whatever level WebSearch surfaces, and never fabricate a number.
- A `live: null` with `note: "no live quote (source miss)"` (e.g. HYPE/SUI not on Yahoo) — same: use
  the WebSearch level if you find one, else say so.

Render the table in the **PRICE & DATA WATCH** report section (Step 6) directly from this array, and
carry the `live` figure + its `deltaVsStoredPct` into the per-signal price reasoning (Step 5) and the
**Change from prior** line. For liquid names WebSearch will corroborate; if it diverges materially from
`live`, prefer the more recent and say which.

## Step 5 — Per-signal judgment (the core loop)

For **every** signal in the bundle, read its **statement** and decide whether the gathered
evidence *directly bears on that specific condition*, then emit Score / Evidence / Assessment /
Change-from-prior. Apply ALL of the rules below.

### Scores are THESIS-CENTRIC (critical)

`strengthening`/`confirmed` always mean the **thesis** got **stronger**; `weakening`/
`invalidated` mean it got **weaker** — regardless of signal type. This is the value the DB
stores and the health pass reads, so polarity must track the **thesis**, not the signal's own
criterion. **Invalidation signals encode a *risk*, so their score moves OPPOSITE to the risk:**
a *receding* invalidation risk is `strengthening` (good for the thesis); a *growing* one is
`weakening`. (Get this wrong and you invert the belief layer — see the `signal-assessment-polarity`
rule.)

### Score only on DIRECT evidence (specificity rule)

A score of `strengthening`/`weakening` requires **direct evidence toward the specific condition
in the statement**. Thematically adjacent / indirectly supportive developments do **not**
qualify — they are `neutral`, with the inferential reasoning in the Assessment prose only.

**Test:** re-read the statement. Does the evidence directly advance or set back *that specific
condition*? If the link needs a 2+-step inferential chain ("gold weak → sovereigns reconsider
reserves → might choose BTC → supports sovereign BTC allocation"), the Score is `neutral`.

### Price-level signals — judge against the LIVE price (the stale-price fix)

For a signal whose condition is a price/level ("Brent < $80", "BTC reclaims $100k") and which is
**not** `collectorTracked`, judge it against the bundle's `priceWatch.live` (and `deltaVsStoredPct`),
**never** the stored `spot`. A stale stored figure on the wrong side of the level is exactly the
Bearish-Oil miss. If the underlying is `unpriced`/source-miss, use the WebSearch level or score
`neutral` with an honest "no fresh price this period" — do not infer from the stale spot.

### Event-type items are JUDGED, never auto-scored (the W9 lesson — docs/v2/14 §2.1)

Calendar dates, SEC filings, and insider transactions are **context, neutral until there's a
directional result**:
- A *scheduled* earnings/data date (e.g. "TSLA Q2 earnings on Jul 23", "Initial Jobless Claims
  Thursday") is `neutral` — nothing has happened yet.
- An SEC **Form 4 / Form 144** filing is `neutral` provenance. An insider **sale** is **not**
  bullish — at most it's mild qualitative context, judged on its specifics, never auto-`strengthening`.
- Score these non-neutral **only** if the *content* of the event directly moves the signal's
  condition (e.g. an 8-K disclosing a guidance cut that matches an invalidation statement).

### Defer quantitative signals to their collector (no double-count)

Signals with **`collectorTracked: true`** in the bundle are tracked numerically by
`collect-signal-data.ts` (defillama/coingecko/fred/derived/tradingview_cdp/…). This is the
**deterministic flag** — do not re-infer it from the statement. For these:
- Score **`neutral`** if your only evidence is the metric itself ("ARR ~$700M, ~50% of target").
  The collector already records the number — restating it adds nothing.
- Score **non-neutral only** for genuinely *qualitative* evidence the collector cannot capture:
  a product launch, regulatory change, competitive threat, management commentary, a catalyst
  that could accelerate/derail the metric. Put the narrative "why" in the Assessment, not the number.

### Signal-type-aware score tables

**Confirmation** — relative to direct evidence the condition is triggering:
| Score | Meaning | Emoji |
|-------|---------|-------|
| `confirmed` | Definitive evidence the condition has been met | 🟢 |
| `strengthening` | Direct, material evidence the condition is forming | 🟡 |
| `neutral` | No direct evidence either way (thematic adjacency is neutral) | ⚪ |
| `weakening` | Direct evidence contradicting the condition | 🟠 |
| `invalidated` | Definitive evidence the condition will not be met | 🔴 |

**Invalidation** — encodes a *risk*; score tracks the **inverse** of the risk (thesis-centric):
| Score | Meaning | Emoji |
|-------|---------|-------|
| `confirmed` | Invalidation risk definitively passed — falsification test cleared (thesis safe on this axis) | 🟢 |
| `strengthening` | Direct evidence the risk is **receding** (good for thesis) | 🟡 |
| `neutral` | No material change to this risk | ⚪ |
| `weakening` | Direct evidence the risk is **growing** (bad for thesis) | 🟠 |
| `invalidated` | The invalidation condition has triggered — thesis invalidated | 🔴 |

**Completion** — relative to proximity to the completion threshold:
| Score | Meaning | Emoji |
|-------|---------|-------|
| `confirmed` | Completion condition met | 🟢 |
| `strengthening` | Measurable progress toward the threshold | 🟡 |
| `neutral` | No material progress | ⚪ |
| `weakening` | Moving away from the threshold | 🟠 |
| `invalidated` | Completion can't be met (thesis concluded differently) | 🔴 |

**Be sparing with non-neutral.** Most signals on most days are `neutral` — that is the correct,
honest answer when nothing directly bore on the condition. A report that is mostly neutral with a
few well-evidenced non-neutral calls is the quality bar (see `notes/intelligence/20260406-1811-thesis-monitor.md`).

## Step 6 — Compile the directive report

Write to a file with this exact structure. **The `#### {emoji} {statement}` + `- **Signal ID:**`
+ `- **Score:**` shape is the machine contract** — `ingest-world-monitor.ts` keys snapshots off
the Signal ID and parses the Score. Include every signal from the bundle, even neutral ones.

### Frontmatter

```yaml
---
date: YYYY-MM-DDTHH:MM:SSZ
time_window: 24h
type: thesis-observe
generated_by: thesis-observe
tiers: [1]            # the tiers actually in this run's slice (from the bundle's `tiers`)
theses_monitored: N
signals_monitored: N
tickers_monitored: [GLXY, TSLA, BTC, HYPE]
---
```

### Body template

```markdown
# Thesis Observe — YYYY-MM-DD HH:MM UTC (Tiers [from the run])

**Context:** [2–4 sentences on the day's developments most relevant to the observed theses.]

## PRICE & DATA WATCH

Freshest spot per observed underlying (live overlay), drift vs the last stored daily close, and
proximity to the thesis target. **One row per (thesis, underlying)** from each bundle's `priceWatch`.
Unpriced gaps (futures/private/bonds) and source misses show `—`. **Column order is the machine
contract** — `ingest-world-monitor.ts` reads these columns positionally; keep them exactly:

| Thesis | Ticker | Live | Δ vs stored | Target | To target | As of (src) |
|--------|--------|------|-------------|--------|-----------|-------------|
| [thesis title] | [TICKER] | [$live or —] | [+/−X.X% or —] | [$target or —] | [+/−X.X% or —] | [HH:MM (yahoo\|ibkr) or —] |

## SIGNAL ASSESSMENT

### [Thesis Title] ([macro|asset] — [direction] — [confidence] — [ticker ~spot if asset])

**Confirmation signals:**

#### {emoji} [Signal statement, verbatim from the bundle]
- **Signal ID:** [signal uuid from the bundle]
- **Score:** [neutral|strengthening|confirmed|weakening|invalidated]
- **Evidence:** [specific items + source URLs, or "No direct evidence this period"]
- **Assessment:** [reasoning — incl. WHY an event does/doesn't bear on THIS signal]
- **Change from prior:** [what moved vs last observe, or "No change" / "First observation this cycle"]

**Invalidation signals:**

#### {emoji} [Signal statement]
- **Signal ID:** [uuid]
- **Score:** ...
- **Evidence:** ...
- **Assessment:** ...
- **Change from prior:** ...

**Completion signals:**

#### {emoji} [Signal statement]
- **Signal ID:** [uuid]
- **Score:** ...
- **Evidence:** ...
- **Assessment:** ...
- **Change from prior:** ...

(repeat per thesis)

## THESIS-RELEVANT NEWS

Items that bear on a thesis but match no specific signal (ambient awareness / candidate new signals).

- {severity emoji} **[Headline]** — Thesis: [title]
  [1–2 sentences + source URL]

## SIGNAL WATCH SUMMARY

### Signals with new evidence this period
- [list non-neutral signals + one-line why]

### Signals approaching trigger
- [signals materially closer to a threshold, or "None"]

### No change
- [count of neutral / no-new-evidence signals]

## SOURCE INDEX

| Source | URL |
|--------|-----|
```

**Section-heading rules (the parser depends on them):** use exactly `## SIGNAL ASSESSMENT`, and
the type sub-headings exactly `**Confirmation signals:**`, `**Invalidation signals:**`,
`**Completion signals:**`. Never "Warning signals" or any variant.

## Step 7 — Save the report

```bash
# Filename: YYYYMMDD-HHMM-thesis-observe.md  (HHMM = UTC)
/Users/home-hub/projects/notes/intelligence/YYYYMMDD-HHMM-thesis-observe.md
```

## Step 8 — Ingest to Supabase

```bash
cd /Users/home-hub/projects/trade-journal
npx tsx scripts/ingest-world-monitor.ts --file /Users/home-hub/projects/notes/intelligence/YYYYMMDD-HHMM-thesis-observe.md
```

This parses the report, writes one `signal_data_snapshots` row per reported signal with
`data_source='thesis_observe'` (keyed off Signal ID — only the signals you reported), journals each
non-neutral score as a thesis-level `signal_evidence_received` entry, parses **PRICE & DATA WATCH**
(observability only — logged, not persisted), and **harvests THESIS-RELEVANT NEWS into
`candidate_signal` rows** (P2 — the no-signal-matched forces become re-underwrite input). The nightly
`synthesize-signal-day.ts` then aggregates the snapshots into `daily_synthesis` and the
`/thesis-review` health pass consumes them — no further wiring needed. Confirm the console shows
`Signal snapshots (thesis_observe): N generated`.

**Escalation is automatic — you do nothing (P4 #2, §1d).** A `confirmed`/`invalidated` score writes a
non-health snapshot, which makes its thesis register `hasNewEvidenceSince` → the next `/thesis-review`
health pass picks it up within one cycle (`thesisHealth.ts` counts any non-`thesis_health` snapshot).
The hard score thus *flags the thesis for an immediate health look* without you raising anything — the
sensing/deciding boundary holds. No separate force-due hook is needed (verified, not built).

## Step 9 — (optional) commit the report

```bash
cd /Users/home-hub/projects/notes
git add intelligence/YYYYMMDD-HHMM-thesis-observe.md && git commit -m "intelligence: thesis observe YYYYMMDD-HHMM (Tier 1)" && git push
```

Non-fatal — if git push fails, the evidence is already in the DB; note it and continue.

## Step 10 — Report a summary

```
Thesis Observe (Tier 1) — YYYYMMDD-HHMM
Theses: N (X asset, Y macro) · Signals assessed: N
Scores: A strengthening · B weakening · C confirmed/invalidated · D neutral
Non-neutral (with one-line why):
  - [Thesis] signal — score — why
Ingested: N snapshots (thesis_observe), M journal entries
```

## Quality standards

1. **Every signal in the bundle is assessed** — even if "No direct evidence this period" → neutral.
2. **Every non-neutral score cites a source URL** — no fabricated sources, never invent.
3. **Discriminate relevance** — score the same story differently across signals by actual bearing.
4. **Thesis-centric polarity** — invalidation signals invert; double-check every non-neutral one.
5. **Events are judged, not auto-scored** — calendars/filings/insider are neutral context by default.
6. **Defer quantitative signals** — don't restate a number the collector already tracks.
7. **Be sparing with non-neutral** — mostly-neutral with a few well-evidenced calls is correct.
8. **Sensing only** — no decisions, no status changes, no re-underwriting. Ever.

## Error handling

- `find-theses-due-observe.ts` fails → report the error and stop (no thesis context = nothing to do).
- A WebSearch yields nothing for a thesis → score its signals `neutral` with "No direct evidence
  this period" (this is a valid, honest outcome — not a failure).
- Ingest fails → the report is saved; report the error so it can be re-ingested (`--file`).
