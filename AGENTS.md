# AGENTS.md — Codex operating guide for Trade Journal

> **Codex shim, not a full manual.** Provider-neutral domain semantics and repository-critical safeguards are
> authoritative in **[CONTEXT.md](CONTEXT.md)**. The continuously-maintained detailed operating manual is
> **[CLAUDE.md](CLAUDE.md)** (same directory). Read it for the full architecture, schema, ingestion and
> automation cadence, entity state machines, and working conventions. **This file records only (a) what differs
> for Codex and (b) a fast-start for the operations you actually run** — so it can't drift out of sync the way a
> full copy does.
>
> Workspace-level cross-project context: `/Users/home-hub/projects/CLAUDE.md`. Product direction and the v2
> rebuild: `docs/v2/`.
>
> _History: this file was previously a verbatim copy of an older CLAUDE.md and went badly stale through the
> 2026-06-11 prune (−36K lines, 19 tables dropped) and the loose-agent rebuild. It now defers to CLAUDE.md by
> design. For headless/autonomous skill runs see `.agents/skills/` — see "Codex deltas" below._

## Read order

1. **[CONTEXT.md](CONTEXT.md)** — provider-neutral domain vocabulary, authority boundaries, and safeguards.
2. **[CLAUDE.md](CLAUDE.md)** — detailed architecture, schema, ingestion, state machines, and conventions.
3. **`docs/v2/`** — product direction + the loose-agent model. Most relevant: `03-v2-spec.md`,
   `07-belief-maintenance-loop.md`, `10` (decision/loose-agent model), `14` (thesis-observe), `15` (self-improving loop).
4. **Bridge skill** `~/.codex/skills/trade-journal-workflows/SKILL.md` + its `references/claude-inventory.md`
   (every current skill, grouped) and `references/workflow-map.md` (intent → skill routing).
5. **This file** — Codex deltas + fast-start.

## Codex deltas (the Claude → Codex translation)

- **No slash commands.** CLAUDE.md and the skill docs invoke skills as `/decisions`, `/thesis`,
  `/maintenance`, etc. In Codex, **read the skill body at `.claude/skills/<name>/SKILL.md` and execute its
  procedure.** Keep the workflow intent, not the invocation syntax.
- **Skill frontmatter is Claude-specific.** Ignore / map `allowed-tools`, `user_invocable`, and any
  Agent-tool/subagent assumptions to the tooling Codex actually exposes. Use multi-agent tooling only when it's
  genuinely available; otherwise keep source/context boundaries explicit.
- **The SessionStart "decisions pending" nudge is Claude-only.** It's a hook in `.claude/settings.json` that
  runs `npx tsx scripts/ops/list-decisions.ts --nudge`. On Codex it does **not** fire — run it yourself at the
  start of a session to see what needs judgment.
- **Tools:** prefer Codex-configured MCP for Tana and live market data; use repo scripts for portfolio /
  Supabase state. Database access goes through `scripts/psql-query.ts` (reads) and `scripts/ops/*` (writes),
  **not** Supabase MCP (unreliable for this repo).
- **`.agents/skills/` is the headless mirror, not your interactive source.** Each skill carries a
  `HEADLESS_PREAMBLE.md` (autonomous-mode wrapper) — it's for programmatic/cron runs. It's generated from
  `.claude/skills/` by `scripts/ops/generate-agents-mirror.ts` and kept honest by
  `scripts/ops/check-codex-parity.ts` (run after any skill change, then `git add .agents`). Current at all 33
  discovery paths; three obsolete non-candidates now live only under `docs/archive/provider-adapters/issue-75/`.
  For interactive work, read the canonical `.claude/skills/` source — the mirror is headless-only.
  - **NOTE — before relying on Codex for a headless CRON job:** 14 per-skill preambles are a *generic
    baseline*. Five executable workflows have bespoke contracts (`assess-validation-evidence`,
    `build-core-argument`, `finalize-for-upload`, `relate-research`, and `synthesize-claims`), while the ten
    contracted research-pipeline paths plus deferred `visser-scan` and unavailable `gateway`/`ibkr-quote` have bespoke refusal preambles. Give any
    other target skill a **bespoke `HEADLESS_PREAMBLE.md`** with a parameter list and concrete JSON output
    contract; the generator preserves bespoke preambles once written. `decisions`/`thesis` are
    interactive-only — not meant for unattended cron.

## The system today (post-2026-06 prune)

A Next.js 16 / React 19 / TypeScript / Drizzle / **Supabase (remote is the single source of truth — no local
DB)** app for a multi-exchange portfolio. Five things it does: data ingestion (IBKR Flex, HyperLiquid, Coinbase
Prime, Kraken, Deribit, Solana, Massive); portfolio/NAV monitoring; options scanner + vol-curve analyzer; the
**belief layer** (theses ↔ strategies ↔ positions with claims + signals); and UK accounting/tax (Section 104).

**Decision hierarchy (never conflate levels):** macro theses → asset theses → strategies → positions.
Strategies are tactical; theses are long-lived beliefs. **Compute during ingestion and store** (computed tables:
`strategy_metrics_snapshots`, `portfolio_snapshots`, `journal_entries`, …); don't compute on query. Everything
auditable lands in `journal_entries`. `src/db/schema.ts` is the authoritative schema (62 tables);
`src/db/types.ts` is stale (still lists dropped tables).

## The belief layer = loose-agent model (most likely new to you — docs/v2/10, 14, 15)

- **`monitoring` is a position flag, not an information gate.** It means the thesis has a *live expression* (an
  active strategy). Thesis status is **derived automatically during ingestion** by the expression cascade
  (`src/lib/derived/thesisCascade.ts`), **not** signal-gated. Lifecycle:
  `draft → developing → monitoring ⇄ closed → complete | rejected`. `closed` = was expressed, now flat
  (dormant-but-intact; re-expresses to `monitoring` automatically). **Never delete/reject theses as cleanup** —
  an unexpressed thesis goes dormant via the cascade. Kill-switch: `THESIS_CASCADE_ENABLED=0`.
- **Signals are the auto-derived resolution section** of a thesis's articulation, synthesized by
  `build-core-argument` from the linked claims' own counter-arguments. **`configure-signal` is RETIRED** — do
  not hand-configure signals or thresholds. Linkage lives in `signal_entity_links` (junction), not on `signals`.
  Threshold breaches write journal entries only (no triage inbox).
- **Research attaches by *bearing*, not by holdings.** `relate-research` links new claims to **any active
  thesis** (developing OR monitoring) — the old developing-only rule is gone.
- **Producers vs resolvers.** `maintenance` (+ `thesis-review`, `thesis-observe`, `relate-research`) *surface*
  judgment calls as **Decision Items**; `decisions` *resolves* them. `thesis` is the pull foreground over a
  single thesis. Never auto-resolve a judgment call silently.
- **Decisions are data:** `journal_entries` with `action_type='decision_required'`. Surface with
  `scripts/ops/list-decisions.ts` (`--json` / `--nudge` / `--count`); resolve through
  `scripts/ops/resolve-decision.ts` (records the resolution + does the mechanical write). Status changes go
  through `scripts/ops/update-entity-status.ts` (validates transitions). Never hand-edit the journal row.

## Removed in the 2026-06 prune — do not look for these

Position triage + thesis triage (entire subsystem: pages, queues, engines, `triage_records`/`thesis_triage_records`),
`/news` + intelligence-report storage (`intelligence_reports`/`intelligence_items`), AI prompts admin (`ai_prompts`),
the FRED subsystem (`fred_*`, `thesis_fred_indicators`, `fred_threshold_breaches`), analyst upgrade/downgrade +
price targets (`analyst_actions`/`analyst_price_targets` — **insider transactions survive**), the in-app research
upload/processing UI, `thesis_news_items`, and the `evaluate.ts` intel router. Old journal entries and stale skill
text may reference these — that's history, not a bug.

## Fast start — the operations Codex actually runs

```bash
cd /Users/home-hub/projects/trade-journal
source .env.local                                   # loads DATABASE_URL_POOLER etc. for shell/psql

# What needs my judgment? (run at session start — the Claude hook won't fire for you)
npx tsx scripts/ops/list-decisions.ts --json        # open Decision Items, ranked
npx tsx scripts/ops/maintenance-status.ts --json    # latent maintenance worklists

# Reads
npx tsx scripts/psql-query.ts "SELECT ..." --format json   # read-only (wraps in row_to_json; cannot mutate)
npx tsx scripts/pull-portfolio.ts                          # full portfolio snapshot

# Writes — always via ops scripts, never ad-hoc SQL
npx tsx scripts/ops/update-entity-status.ts --entity-type macro_thesis --id <uuid> --status developing --rationale "..."
npx tsx scripts/ops/resolve-decision.ts --id <id> --action <...> --by user
npx tsx scripts/ops/add-journal-note.ts --entity-type asset_thesis --id <uuid> --note "..."
#   other ops: create-macro-thesis, create-asset-thesis, create-claim, create-underlying, link-claim-to-thesis

# Build gate
npm run build && npm test && npm run lint
```

## Hard rules

- **Run scripts from the repo root.** Scripts use `.ts` (not `.mts`); wrap the body in `async function main()`
  (no top-level await); import DB via `scripts/lib/db.ts` (it loads dotenv before creating the client — importing
  `src/db/index.ts` breaks on import hoisting).
- **Migrations:** edit `src/db/schema.ts` first → write a SQL file in `migrations/` → **run it immediately
  yourself** with `/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL_POOLER" -f migrations/...` (never ask
  the user) → verify. Supabase MCP is unreliable here; use psql.
- **After any `package.json`/lock change:** verify `npx -y npm@10 ci --dry-run` exits 0 (GH runners use npm 10;
  a desync takes down every cron).
- **A persistent dev server already runs** (launchd `com.tradej`, port 3001, exposed via Tailscale) and picks up
  source changes itself — don't start a second copy to "show" something. Use `PORT=3111` for throwaway smoke
  tests. After `npm run build`, restart it (`launchctl kickstart -k gui/$UID/com.tradej`) — the build corrupts
  the live dev server's route cache.
- **IBKR beyond Flex goes through Radon** (`/Users/home-hub/projects/radon`): bulk option chains, contract
  qualification, live quotes via `scripts/clients/ib_client.py`. Trade-journal Python scripts use client_id
  range **20–49** (Radon reserves 0–19). IB Gateway is auto-managed by Radon's launchd (Mon 2FA).
- **No auth on API routes** — deliberate (personal tool on own hardware).
- **Claim provenance:** claims from research audits carry `source_insight_id`/`source_claim_id` — always link
  the **existing** claim, never duplicate.
- **Commits:** `<type>(<scope>): <subject>` + Problem/Solution/Impact/Files Changed
  (`docs/archive/commit_message_template.md`). Commit/push only when the user asks.

## Cross-repo

Research now starts in **Tana** (notes repo) — capture + Toulmin extraction there; investment claims promote into
`main_claims` and are linked by `relate-research`. See the `notes-tana-workflows` Codex skill and
`/Users/home-hub/projects/notes/AGENTS.md`. Trade Journal's Supabase DB is the single source of truth for
investment entities; Tana owns capture/thinking.
