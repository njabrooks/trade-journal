# relate-bookmark — bookmarks as a human-attention sensor

A bookmark is **attention**, not an argument (too thin for a Toulmin claim) and not a judgment
(it carries no strengthening/weakening verdict). So it routes to the **monitoring lane**, never the
claim lane. You are the user's curated **eyes & ears** — the human counterpart to `/thesis-observe`'s
machine sweep.

**The laws (docs/v2/17):**
- **Auto-route the clear; leave the irrelevant majority in Tana.** No review queue. Most bookmarks are
  trivial or irrelevant — be sparing, like `/relate-research`.
- **Channel for Phase 1 = candidate_signal only.** A bookmark that bears on an active thesis with **no
  covering signal** becomes a `candidate_signal` (it surfaces on `thesis-snapshot → candidateSignals`
  for the next re-underwrite to promote or dismiss). Nothing else writes to the DB.
- **NEVER write a tracking signal_data_snapshot.** Attention has no verdict; keeping it out of the
  `thesis_observe`/`thesis_monitor` denominator protects the chronic-neutral diagnostic (docs/v2/15 §4).
- **Judgment-graded, not count-based.** Weight comes from your read of significance, never a tally.

## The significance rubric (judge each bookmark)

| Grade | Meaning | Routing |
|---|---|---|
| `trivial` | idle save, thematic adjacency, or duplicative of evidence already on the thesis | **leave in Tana** — no write |
| `notable` | a real data-point that bears on the thesis but isn't decision-moving | candidate_signal *if no covering signal* |
| `material` | plausibly bears on the thesis's **resolution** — an event/figure that could move a signal | candidate_signal *if no covering signal* |

A single `material` bookmark outweighs ten `trivial` ones. If a bookmark bears on a thesis but an
**existing active signal already covers it**, that's *not* a candidate — note it in the digest and leave
the bookmark in Tana (Phase 3 will attention-weight these; Phase 1 does not).

## Tana reference (workspace `5Iqof5q6KFJU` — Nick Brooks)

- `#bookmark` supertag: **`CKcv0SohYIYs`**
- **Category** field `pldNUHKkVotI` → investment option `acNRFtsYYWtg`
- **Status** field `2J2cAm36yfMW` → Backlog `PFqMIQc_KLER` · In progress `yj04X_-zQFkc` · Done `radl8GFO67zX` · Dropped `P-vZKWb8S56r`
- **Tickers** field `drnK4xgDIy6B` (Instance of `#ticker` `4eXaUEU8moy5`) · **URL** `2dTCFkelZIGs` · **Transcript** `HTtO9EDtjbkQ` · **Topics** `hs3ePncBmCWE` · **Themes** `ESIgSV635LhH`

## Workflow

### 1. Load the judgment catalog
```bash
cd trade-journal && npx tsx scripts/relate-bookmark.ts --out /tmp/bm-catalog.json
```
Read `/tmp/bm-catalog.json` → `{ catalog: [{ id, type, title, description, direction, status, ticker,
sectors, themes, signals: [{ id, statement, type }] }] }`. This is the **whole** active thesis set
(developing + monitoring) with each thesis's active signals — the context for "does this bear, and is it
already covered?"

### 2. Pull new bookmarks from Tana
Find investment bookmarks still in Backlog (the unprocessed set):
```
search_nodes({ query: { and: [
  { hasType: "CKcv0SohYIYs" },
  { field: { fieldId: "pldNUHKkVotI", nodeId: "acNRFtsYYWtg" } },   // Category = investment
  { field: { fieldId: "2J2cAm36yfMW", nodeId: "PFqMIQc_KLER" } }    // Status = Backlog
] }, limit: 50 })
```
For each hit, `read_node(nodeId, maxDepth: 2)` to get URL, Author, Tickers, Topics, Themes, Transcript.
**Note the node's `created` timestamp** (from the search result) for `observedAt`. If `Tickers` is empty
(pre-existing bookmarks predate the field), extract the ticker from the title/transcript (e.g. `$GLXY`)
for judgment — a dedicated backfill of the Tickers field is docs/v2/17 Phase 2.

### 3. Judge each bookmark (this is the point)
For each bookmark decide, thesis-centrically:
1. **Bearing** — which active thesis (if any) does it genuinely bear on? Resolve via ticker (Tickers /
   `$TICKER` in text), then sectors/Topics/Themes for macros. No active thesis → **leave in Tana**.
2. **Significance** — `trivial` / `notable` / `material` per the rubric.
3. **Covering signal?** — does any of that thesis's `signals[]` already track this? If yes → leave in
   Tana (note in digest). If no → it's a candidate.
4. **Proposed statement** — for a candidate, write the signal statement the bookmark implies (a testable,
   thesis-centric assertion — what you'd watch), not just the headline.

Be sparing. When unsure, leave it in Tana.

### 4. Build & apply the plan
Write the `notable`/`material`, no-covering-signal cases to a plan:
```json
{ "entries": [
  { "bookmarkNodeId": "SYXsY3Tz6oM7", "bookmarkTitle": "Galaxy Digital $GLXY …",
    "thesisId": "<uuid>", "thesisType": "asset", "thesisTitle": "<thesis>",
    "statement": "Galaxy Digital builds out merchant data-center capacity (McGregor TX) — watch for additional sites / contracted MW",
    "significance": "material", "sourceUrl": "https://x.com/…", "observedAt": "<iso>",
    "rationale": "McGregor city council approved a Galaxy data-center; signals diversification beyond trading into AI/compute infra" }
] }
```
Dry-run, then apply:
```bash
cat /tmp/bm-plan.json | npx tsx scripts/relate-bookmark.ts --apply - --dry-run
cat /tmp/bm-plan.json | npx tsx scripts/relate-bookmark.ts --apply -
```
The engine dedups per `(thesis, normalized statement)` — re-runs are safe (bumped, not duplicated).
The apply output lists each entry's `result` (`written`/`bumped`/`skipped`).

### 5. Finalise each judged bookmark in Tana

**a. Tickers** (Phase 2) — if the bookmark references a specific ticker and its `Tickers` field
(`drnK4xgDIy6B`, instance of `#ticker`) is empty, populate it:
1. Find an existing, non-trash `#ticker` node for the symbol:
   `search_nodes({ query: { and: [{ hasType: "4eXaUEU8moy5" }, { textContains: "<SYMBOL>" }] } })` —
   match the exact name; prefer one already in the Library.
2. If none exists, create a canonical one in the Library:
   `import_tana_paste({ parentNodeId: "5Iqof5q6KFJU_STASH", content: "- <SYMBOL> #[[^4eXaUEU8moy5]]" })`
   → use the returned node id.
3. Reference it (append, so multiple tickers accumulate):
   `set_field_content({ nodeId: "<bookmarkNodeId>", attributeId: "drnK4xgDIy6B", content: "<tickerNodeId>", mode: "append" })`

> `#ticker` nodes are currently **non-canonical** (per-occurrence dupes from `#content` extraction; some in
> trash). Always prefer an existing non-trash node; only create when none exists. Macro/thematic bookmarks
> with no single ticker get **no** Tickers — that's correct. Populating Tickers as bookmarks are processed
> IS the existing-corpus backfill (docs/v2/17 §7) — there is no separate mass script.

**b. Status** — flip every judged bookmark's Status so it doesn't re-process
(`set_field_option`, attributeId `2J2cAm36yfMW`):
- **Routed** (a candidate was written/bumped) → Done `radl8GFO67zX`
- **Left in Tana** (trivial / irrelevant / no thesis / already covered) → Dropped `P-vZKWb8S56r`

```
set_field_option({ nodeId: "<bookmarkNodeId>", attributeId: "2J2cAm36yfMW", optionId: "radl8GFO67zX" })
```
The bookmark and all its data stay in Tana — only its pipeline Status changes, so the next Backlog query
skips it.

### 6. Report the digest
- **Candidates written** (per thesis, with the proposed statement) — the genuine output.
- **Left in Tana**: counts by reason (trivial / no active thesis / already covered by signal `<id>`).
- **Attention worth flagging**: any ticker/theme the user is clearly bookmarking that has **no active
  thesis** — name it for the user (a thesis-emergence hint; routing it is `/thesis` or docs/v2/13
  macro-emergence, not this skill).

## Non-goals
- ❌ No tracking `signal_data_snapshot` from a bookmark (docs/v2/17 §4).
- ❌ No claims by default — bookmarks are attention, not argument. (A bookmark that genuinely *asserts*
  something can be promoted to a lightweight claim via `scripts/ops/capture-observation.ts` — manual,
  opt-in, surfaced as a suggestion only.)
- ❌ The skill never raises decisions or weights priority. Bookmark attention enriches an existing
  `re_underwrite_due` (boost to high confidence) inside the raiser (docs/v2/17 P3 — automatic, off the
  candidate_signals this skill writes), never here and never as a standalone raise. relate-bookmark senses + routes only.
- ❌ No review queue. Auto-route the clear; leave the rest in Tana.
- ❌ Don't re-tag bookmarks to #content or push them through Toulmin extraction.
