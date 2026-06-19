---
name: relate-research
description: Anticipatory claim→thesis relating (W8/D2). Reads newly-extracted research claims, judges genuine relevance against the active thesis set, auto-links the clear matches, surfaces genuine decisions (refuting/ambiguous), and leaves the irrelevant majority in Tana. Replaces the old unconditional Tana auto-promotion + manual curation. Use when the user asks to "relate research", "process new claims", "link new research to theses", "run relate-research", or wants newly-extracted research evidence related to the live thesis set.
allowed-tools: Bash, Read
user_invocable: true
---

# relate-research — anticipatory claim→thesis relating

## Purpose

Replace promote-everything-then-curate (D2) with an **anticipatory** pass: read
the claims that were just extracted from research, decide which genuinely bear on
the **active thesis set**, link only those, and surface a short digest of genuine
decisions. The irrelevant majority is **not** promoted — it stays in Tana (the
corpus). No queue, no review inbox.

**Division of labour** (mirrors the W7 advisor):
- `scripts/relate-research.ts` is **deterministic** — it loads candidate claims,
  emits the active thesis catalog, owns every DB write, the dedup, and the
  auto-link-vs-decision **policy**, and applies the precise ticker-matched signal route.
- **You do the relevance judgment** — which thesis (if any) each claim genuinely
  supports / refutes / is a foundation for, and with what confidence. This is the
  part keyword matching cannot do; it is why a Claude skill owns it.
- The engine persists your judged plan: promotes only linked claims to `main_claims`,
  writes `claim_thesis_mappings` (`mapped_by='relate_research'`), and emits
  `decision_required` journal entries that surface in the dashboard **DecisionStrip**.

## Step 1 — Get the worksheet (catalog + claims)

Select the newly-extracted insights to relate. **There is no stored cursor** — you
choose the window. `--since <YYYY-MM-DD>` filters on the insight's *creation date*;
`--limit` caps how many (newest first). Heuristic: use the date of the last
relate-research run if you know it, else the last 7 days; widen if you suspect a
gap. Re-running over an overlapping window is **safe** — the engine dedups, so
already-related claims are no-ops.

```bash
cd trade-journal
# by date window (--worksheet is the default mode):
npx tsx scripts/relate-research.ts --since <YYYY-MM-DD> --limit 30 --out /tmp/relate-ws.json
# or explicit insights:
npx tsx scripts/relate-research.ts --insight-ids <id,id,...> --out /tmp/relate-ws.json
```

If the window selects nothing, the engine still writes `{catalog, claims: []}` and
warns on stderr — report "no new claims to relate" and stop.

Then `Read /tmp/relate-ws.json`. Shape:
- `catalog`: every **active** thesis (`developing` + `monitoring`) — `{id, type, title, description, direction, status, ticker, sectors, themes}`. **This is the full set you judge against** — not a pre-filtered shortlist.
- `claims[]`: `{claim: {insightId, sourceClaimId, title, category, claim, qualifier, relevantTickers, …}, monitoringSignalMatches[]}`.

## Step 2 — Judge relevance (your job)

For **each claim**, scan the whole `catalog` and decide which theses it genuinely
relates to. Output a link only when the relation is real.

**What counts as genuine relevance — not topical overlap.** A claim links to a
thesis only if it bears on that thesis's *argument*. Example: a claim that
"Entegris is a structural beneficiary of AI manufacturing complexity" relates to
*Bullish Semiconductors* / *Bullish AI Infrastructure* — **not** to *Monetary
Debasement* just because both mention "growth" or "infrastructure." Shared
vocabulary is not relevance.

**mapping_type** (direction-aware — check the thesis `direction`):
- `supports` — the claim is evidence **for** the thesis as stated.
- `refutes` — the claim is evidence **against** it (a bearish claim refutes a bullish thesis; a risk materialising refutes the bull case). **Always surface refuting evidence** — it is the highest-value signal.
- `foundation` — the claim is a load-bearing assumption the thesis rests on.

**confidence** (0–1) — your honest read of how strong the relation is:
- `≥ 0.7` — **unambiguous**; you'd link it without hesitation.
- `0.5 – 0.7` — **clearly related**, but you wouldn't stake the thesis on this one claim.
- `0.4 – 0.5` — a **real but minor** connection.
- `< 0.4` — too speculative; **do not include it.**

What the engine does with it (so your number drives the right outcome):
- `supports`/`foundation` at **≥ 0.7** → auto-linked **silently** (no decision).
- `supports`/`foundation` **below 0.7** → linked **and** a `decision_required` surfaces (you weren't fully sure, so the user gets a look).
- **`refutes` at ANY confidence ≥ 0.4** → linked **and** a decision surfaces — counter-evidence is never buried. So only mark `refutes` when the claim genuinely cuts against the thesis, not for mild tension.

Worked example — "Q3 datacenter capex guidance cut 10%" vs *Bullish AI
Infrastructure*: related and negative, but one quarter isn't decisive →
`refutes`, ~0.5. It links and raises a decision.

**Link any active thesis — developing OR monitoring.** Judge *bearing*, not
lifecycle. `monitoring` means you have live capital on the thesis; it is a position
flag, **not** an information gate (docs/v2/10 §7). A claim that confirms or
challenges a monitoring thesis is exactly as relevant as one bearing on a
developing thesis, so link it the same way — this is what feeds the thesis's living
underwriting and dissolves the old stranding (a monitoring thesis with claims but
nowhere for new evidence to attach). The engine accepts links to any active thesis
and rejects only **non-active** ones (draft / closed / complete / rejected) — a
killed or archived thesis can't accrue new evidence.

**Be conservative.** Most claims relate to **0 or 1** active theses. A claim linked
to 3+ theses is usually topical overlap, not genuine relevance — tighten it. Claims
that relate to **no** active thesis are correct to drop: they stay in Tana. Never
force a link to "use" a claim.

**New-thesis clusters.** If several dropped claims share a clear theme/ticker with
no active thesis, **note it in the digest** for the user to consider opening a
thesis — do **not** create theses here.

## Step 3 — Build the plan, dry-run, then apply

Write the judged links to `/tmp/relate-plan.json`:

```json
{ "links": [
  { "insightId": "…", "sourceClaimId": "claim-1", "thesisId": "…", "thesisType": "macro",
    "thesisTitle": "Bullish AI Infrastructure", "mappingType": "supports",
    "confidence": 0.82, "reasoning": "one-sentence why this claim bears on this thesis" }
] }
```

`thesisType` is `"macro"` or `"asset"`; `thesisId`/`thesisTitle`/`thesisType` come
straight from the catalog entry you matched. **Always dry-run first and read the
counts back before writing:**

```bash
cat /tmp/relate-plan.json | npx tsx scripts/relate-research.ts --apply - --dry-run
# review {linksCreated, decisionsEmitted, belowFloor}; then commit:
cat /tmp/relate-plan.json | npx tsx scripts/relate-research.ts --apply -
```

## Step 4 — Deterministic signal route (optional)

This is **additive** to Step 2, not a substitute: a claim bearing on a monitoring
thesis should be linked in Step 2 (that feeds the thesis's underwriting). The signal
route is a separate, deterministic evidence path that also records the claim against
the thesis's auto-derived resolution signals for the signal-evaluation machinery.
For claims whose ticker matches a **monitoring** asset thesis, the engine can
record that signal evidence with no judgment needed (high-precision ticker match only):

```bash
npx tsx scripts/relate-research.ts --since 2026-06-10 --limit 30 --apply-signals --dry-run
npx tsx scripts/relate-research.ts --since 2026-06-10 --limit 30 --apply-signals
```

(Sector/keyword-only signal hits are intentionally **not** auto-applied — routing
those to monitoring-thesis signals needs judgment and is a deferred v1.1 extension.)

**Caveat — `--apply-signals` infers direction from the signal *type*, not the claim's
stance.** A bearish claim that ticker-matches a *bullish* thesis's confirmation signal
is recorded as `strengthening` (wrong polarity). Before running it, scan each claim's
`monitoringSignalMatches`: if the claim's stance opposes the thesis direction, don't
blanket-apply — handle those by judgment (note them in the digest) instead.

## Step 5 — Report the digest

Summarise, decision-first (this is the whole point — a digest, not a queue):
- **Decisions surfaced** (now in the DecisionStrip): refuting evidence against a
  thesis; ambiguous links to confirm/sever. List each with the claim + thesis.
- **Auto-linked silently**: count, grouped by thesis.
- **Left in Tana** (related to nothing active): count.
- **New-thesis clusters** worth the user's attention, if any.
- **Dropped links** the engine rejected (`droppedLinks` in the summary): surface any
  `non-active` drops — they mean the link targeted a draft/closed/complete/rejected
  thesis (e.g. a thesis was closed out from under a link).

The dashboard **DecisionStrip shows at most 5** decisions (newest first). A wide
pre-cull run can emit more — so **your chat digest is the authoritative full list**,
and be **sparing with ambiguous links** so genuinely important refuting evidence
isn't pushed off the strip.

## v1 scope / notes

- Claims are read from `research_insights` (the notes-repo extraction hand-off),
  not Tana MCP directly. The corpus stays in Tana; only thesis-linked claims land
  in `main_claims`.
- On-demand only; scheduling is deferred (same posture as the W7 advisor).
- Idempotent: links are deduped on `(claim, thesis)`, signal evidence on
  `(signal, claim, source)`, decisions on `(thesis, claim)` — safe to re-run.
- Pre-cull the catalog is large (~84 theses); it collapses to a handful after the
  thesis cull, which is when this job is at its best. Judge carefully until then.
