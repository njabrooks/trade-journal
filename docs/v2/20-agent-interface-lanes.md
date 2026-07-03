# docs/v2/20 — Agent/User Interface Lanes (morning brief · decision cards · advisor loop)

> Status: **DESIGNED 2026-07-03, approved by owner** — build order A → B → C, one lane per session.
> Follow-on to the v2 completion: the data model is done; the bottleneck is now how the user meets it.
> Governing principle unchanged: the system curates/relates/reviews; the user only touches genuine
> decisions. Nothing here builds a review queue.

## The structural problem these lanes fix

Two half-interfaces today: the web app renders the data but is read-mostly; the terminal holds the
actions (/thesis, /decisions, /options-advisor) but has no ambient awareness. Every workflow crosses
that seam by hand. Lanes A–C close the seam pragmatically (deep links + one-click actions); Lane D
(embedded agent) is the ambitious version, designed here but **built dormant / decided later**.

---

## Lane A — Morning Brief (+ sizing-coherence engine, + execution-pattern coach)

The daily synthesis surface: one generated brief, delivered after the 07:00 thesis-observe and 08:00
maintenance runs, answering "what deserves my attention today". Synthesis-only — **never mutates the
belief layer**.

### A1. Sizing-coherence engine (deterministic, `src/lib/derived/sizingCoherence.ts`)
The owner's explicit pain: conviction↔allocation mismatch (historically crypto-heavy on long-term
conviction, leaving other theses under-expressed).

- Per **active asset thesis** (developing/monitoring): aggregate expression = Σ `market_value_usd`
  of open positions via strategies (`strategies.asset_thesis_id`); express as % of NAV
  (latest `nav_snapshots` total). Options are included at market value — a delta-dollar refinement
  (greeks live in `options_chain_snapshots`) is a later iteration; label the number "market value %"
  honestly.
- Per **macro thesis**: full-credit exposure view over linked asset theses (same labelling rule as
  the W5 performance pages — it's an exposure view, not additive attribution).
- Conviction ladder: `confidence_level` high=3 / medium=2 / low=1 / exploratory=0.5, direction-aware.
- **Findings, not scores.** Emit only material mismatches, two types:
  `under_expressed` (high conviction, expression < UNDER_PCT of NAV) and
  `over_expressed` (low/exploratory conviction, expression > OVER_PCT of NAV) — plus a
  **concentration line**: top thesis-cluster % of NAV vs the conviction-weighted share it "deserves"
  (the crypto case). Thresholds as exported constants (start UNDER_PCT=2%, OVER_PCT=8%; tune by use).
- Output: `SizingFinding[]` (thesisId, kind, convictionLevel, expressionPct, navUsd, note). Consumed
  by the brief; also unit-tested (money-math adjacent → vitest).
- **Not a decision-raiser.** Findings appear in the brief; if one hardens into a real rebalance
  question the user takes it to `/thesis`. (Revisit auto-raising only after the brief proves signal.)

### A2. Execution-pattern coach (small, piggybacks the retrospective data)
- Reader over episode retrospectives (`thesis_expression_episodes` + retrospectiveMetrics +
  execution-quality fields from 07§4d): extract recurring behavioural findings (e.g. "peak give-back
  with no de-risking in N of M closed episodes; median give-back $X").
- V1 is a **deterministic aggregation** (`scripts/ops/execution-patterns.ts --json`): counts, medians,
  worst instances, per pattern type (give-back, early-exit, expression-before-conviction). The brief's
  judgment layer turns it into one nudge line when relevant. No new tables — computed on read.
- Later (not now): surface the relevant pattern at decision time inside advisor recommendations.

### A3. Brief producer
- **Assembly (deterministic):** `scripts/morning-brief-data.ts --json` gathers: NAV/exposure delta
  day-over-day (nav_snapshots, portfolio_snapshots); overnight signal evidence (signal_data_snapshots
  last 24h, data_source IN thesis_observe/price_watch, grouped by thesis, thesis-centric polarity);
  open decisions with ages (reuse list-decisions --json); active advisor recommendations; A1 findings;
  A2 patterns; upcoming calendar (economic_events/earnings_events next 48h for held tickers — the
  orphaned query modules finally get their consumer).
- **Judgment (skill):** `/morning-brief` (Opus) reads the bundle → writes ONE row to a new
  `morning_briefs` table: `(id, brief_date date UNIQUE, headline text, attention jsonb — ranked list
  of {title, why, deepLink}, body_md text, metadata jsonb, created_at)`. Attention list ≤5 items,
  each with a copyable deep-link command (`/thesis X`, `/decisions`). Re-running the same day
  supersedes (upsert on brief_date).
- **Schedule:** launchd 08:45 Europe/London (after maintenance), same wrapper pattern as
  thesis-observe **including the cron-status.tsv ledger line**.
- **Delivery:** dashboard module `MorningBrief` at the top of the morning screen rendering the latest
  row (headline + attention list + collapsible body). Push notification = still the W6 open design
  item; the brief is its natural first payload when built.

---

## Lane B — Decision Cards v2 (web)

The queue mechanics already exist (`/api/dashboard/decisions` GET + PATCH resolve/snooze/dismiss;
self-healing snoozes). This lane is presentation + granularity:

1. **Group by object (thesis), not by packet.** One card per thesis showing its bundled packets.
   (Doc-19 lesson: ~25 thesis-level judgments beat 260 micro-decisions. The raiser already dedups
   per-thesis; keep the UI at that altitude.)
2. **Split by resolution type.** Mechanical types (`confirm_claim_link`, `classify_exposure`,
   `classify_macro_link` where the packet carries a clear proposal) get one-click
   resolve/dismiss/snooze buttons on the card (existing PATCH). Judgment types (`re_underwrite_due`,
   `weakening_signal_action`, `develop_thin_thesis`, `cluster_claims_to_thesis`) get a **copy-command
   deep link** (`/thesis <title>` etc. from the packet's runbook) — v1 is clipboard-copy, not a
   custom URL scheme.
3. **Aging.** Show packet age; visually escalate >14 days (nothing rots silently). `created_at`
   already exists on the journal row.
4. Keep the DecisionStrip summary count; the cards live on a `/decisions` page (web twin of the
   `/decisions` skill) linked from the strip.

No schema changes. Components under `src/components/decisions/`.

---

## Lane C — Advisor execution loop

`advisor_recommendations.status` already includes `'acted'` — the enum anticipated this; nothing sets
it and nothing links to what happened. Close the loop:

1. **Schema (small migration):** add `acted_at timestamptz`, `acted_journal_id uuid`,
   `outcome jsonb` (filled later by retrospective scoring).
2. **Record-action flow:** button on each ScannerSnapshot recommendation card → PATCH
   `/api/advisor/recommendations/[id]` → sets status='acted', creates a journal entry
   (`action_type='trade_action'`, metadata: recommendationId, structure, expected premium/edge at
   entry, thesis linkage via ticker→asset thesis) and stores its id. Also a `dismissed` button
   (already in the enum) so expiry stops being the only exit.
3. **Fill linkage (stretch, later):** post-ingestion recompute matches new option positions to acted
   recommendations (underlying+strike+expiry within 5 trading days) and stamps the strategy id into
   `outcome`. V1 is manual record; don't block on this.
4. **Scoring:** extend the execution-quality retrospective (07§4d) to score acted recommendations
   (entry edge vs realized at expiry/close) and emit a hit-rate summary (acted vs expired vs
   dismissed, per scenario). Surfaces in the brief (A) and on the advisor module.

The point: today recommendations expire into silence; acted/expired/ignored is exactly the data that
tells us whether the advisor has edge.

---

## Lane D — Embedded agent (design only; build-dormant, decide after A–C)

- **Auth model — subscription-viable, checked against official docs 2026-07-03** (owner constraint:
  no pay-per-use API):
  - The **Agent SDK requires `ANTHROPIC_API_KEY`** — it does NOT accept subscription OAuth. Ruled out.
  - **Headless CLI is the pattern**: the Next.js server (same Mac mini, single user) shells out to
    `claude -p "<prompt>" --output-format json` under subscription auth — exactly the belief-cron
    pattern that already runs on this box. For a server process, generate a long-lived token once via
    `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` (officially documented for scripts/CI; also
    sidesteps the login-expiry failure mode behind the 2026-06-27 cron outage — consider migrating
    the cron wrappers to it too).
  - Constraints: usage shares the SAME 5-hour rolling window as interactive Claude Code + claude.ai
    (Max 5x ≈ 225 prompts/5h) — a handful of embedded turns/day is comfortable, but a chatty UI eats
    the interactive budget. The docs' "no third-party claude.ai login" restriction targets products
    serving OTHER users; a single-owner personal tool on the owner's own subscription is the
    documented setup-token use case.
- **Shape:** conversation pane on entity pages, pre-loaded via `thesis-snapshot` (already built as a
  data surface). A decision card's "discuss" = `/thesis <X>` with the packet in context.
- **Trigger to build:** if Lane B's copy-command deep links see heavy use (they're the manual version
  of the same act), that's the evidence the pane earns its complexity.

## Build order & session discipline
A → B → C, **one lane per session/worktree** (two-sessions-one-tree burned us in docs/v2/16).
Each lane ends: tests green, `npm run build`, restart com.tradej, commit per template.
