# morning-brief — the daily synthesis surface

## Purpose

Answer **"what deserves my attention today"** in one generated brief, delivered after the
07:00 thesis-observe and 08:00 maintenance runs. The deterministic layer
(`scripts/morning-brief-data.ts`) gathers; this skill judges; ONE row lands in
`morning_briefs` (upsert on `brief_date`) and renders at the top of the morning screen.

## Hard rules

- **Synthesis-only.** The ONLY database write is `scripts/ops/save-morning-brief.ts`.
  NEVER change a thesis/claim/signal/strategy status, never link claims, never write
  journal entries, never raise or resolve decisions. If something looks decision-worthy,
  *point at it* in the attention list — the user takes it to `/thesis` or `/decisions`.
- **Attention list ≤5, ranked.** Fewer is better. Every item carries a copyable
  deep-link command the user can paste into a session (`/thesis <title-or-ticker>`,
  `/decisions`, `/options-advisor`, `/maintenance`). No URLs.
- **Don't re-derive.** The bundle is the evidence; don't re-query the DB for more,
  don't WebSearch. A missing/empty section is itself information (say so briefly if
  it matters, e.g. an evidence outage).

## Step 1 — Gather the bundle

```bash
npx tsx scripts/morning-brief-data.ts --json > logs/morning-brief-data.json
```

Read `logs/morning-brief-data.json`. Sections: `navDelta`, `overnightEvidence` (last-24h
thesis_observe/price_watch signal evidence, thesis-centric polarity: strengthening = the
thesis got stronger), `openDecisions` (ranked, with ages), `advisor` (active
recommendations), `sizing` (A1 findings: under_expressed / over_expressed /
concentration), `executionPatterns` (A2 aggregates), `calendar` (next-48h economic events
+ earnings for held tickers).

## Step 2 — Judge

Rank what actually deserves attention **today**. Priority instincts (not mechanical):

1. **Risk first** — weakening/invalidated overnight evidence on expressed theses;
   high-impact calendar events on large held exposures in the next 48h.
2. **Decisions rotting** — open decisions >14 days old, or tier-0 (refuting evidence /
   weakening signal) items of any age.
3. **Sizing incoherence** — a new or persistent under/over-expression or the
   concentration line, when material. These are conversation-starters for `/thesis`,
   never auto-rebalance instructions.
4. **Advisor recommendations** about to expire unactioned.
5. **Execution-pattern nudge** — at most ONE line, and only when a live situation rhymes
   with a historical pattern (e.g. a large unrealized gain + the give-back history).
   Skip it entirely when nothing rhymes today.

Standing user calls still bind (e.g. no short-term downside hedge suggestions on GLXY
below the mid-$40s).

## Step 3 — Compose

- **headline** — one sentence, the single most important thing + the day's shape.
- **attention** — ranked `[{ title, why, deepLink }]`, ≤5. `why` is one concrete
  sentence citing the bundle (numbers, ages, assessments). `deepLink` is the command
  that opens the right working context.
- **bodyMd** — short markdown, sections in this order, each a few lines max
  (omit empty ones): `## Overnight` (NAV delta + evidence), `## Decisions`,
  `## Sizing`, `## Advisor`, `## Calendar`, `## Coach` (the optional single nudge).
  Plain numbers over adjectives; cite thesis titles verbatim.
- **metadata** — `{ generator: "morning-brief skill", bundleGeneratedAt, counts: { evidenceTheses, openDecisions, advisorRecs, sizingFindings } }`.

## Step 4 — Persist (the only write)

```bash
cat <<'EOF' | npx tsx scripts/ops/save-morning-brief.ts --stdin
{ "headline": "...", "attention": [...], "bodyMd": "...", "metadata": {...} }
EOF
```

Re-running the same day supersedes the row (upsert on `brief_date`). Confirm the JSON
result and finish by echoing the headline + attention titles to the user.
