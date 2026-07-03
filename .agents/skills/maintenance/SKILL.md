# maintenance — the belief-maintenance routine (C6)

## Purpose

The single routine that keeps the belief layer current (docs/v2/09 §10). It wraps the
already-built pieces — `relate-research` (claim→thesis), `relate-bookmark` (bookmark→
candidate_signal, docs/v2/17) and the five `/thesis-review` modes (digest / signal /
health / research-gap / retrospective) plus the C5 decision detectors (framing /
classify_exposure) — into one **incremental, cursor-based, token-aware** pass. It **emits decision packets, never silent decisions**; the
mechanical maintenance writes (digests, signals, health snapshots) are not decisions
and run automatically.

This is the on-demand routine. Wiring it to a **billed cloud schedule** (a recurring
cron/cloud agent) is a separate **user-go** step — see "Scheduling" below; do not
activate a billed schedule yourself.

## Principles

- **Incremental, not a full sweep.** Process a bounded slice per run (default **≤5 items
  per mode**). The worklists are self-clearing/idempotent, so repeated runs converge;
  leftovers are picked up next run. Always report what remains.
- **Model & effort — Opus throughout, never Sonnet.** Every mode here is interpretive
  (even digest/signal synthesis is judging *how claims support a thesis*), so do NOT drop
  to Sonnet — its quality on this evaluative work isn't trusted. Control cost by tuning
  **effort** (lower/medium for the more mechanical synthesis — digest, signal; higher for
  relevance/framing/research-gap/retrospective judgment) and by keeping batches bounded
  (≤5/mode), not by downgrading the model. When fanning out to sub-agents, pass
  `model:'opus'` and set `effort` per the task.
- **Cursor-based.** Only relate-research has a cursor (`automation_cursors`); relate-bookmark's
  cursor is the Tana Status flip (Backlog→Done/Dropped) and the `/thesis-review` worklists are
  self-clearing, so they need none.
- **Decisions are packets.** Anything surfaced to the user goes through `raise-decision`
  as a typed packet (docs/v2/09 §8). Never write a status/strategy/link change that is a
  genuine judgment without a decision.

## Workflow

**Step 0 — Environment**
```bash
cd /Users/home-hub/projects/trade-journal
```

**Step 1 — Read the dashboard**
```bash
npx tsx scripts/ops/maintenance-status.ts --json
```
Returns `{ relateResearch: { cursor, newInsights }, worklists: {...}, actionable }`.
If `actionable === 0` and `newInsights === 0`, report "belief layer up to date" and stop.

**Step 2 — relate-research (claim→thesis), if new insights**
If `relateResearch.newInsights > 0`, run the relate-research front half over the new
window (Opus — relevance judgment):
```bash
# window = the cursor (or last 7 days if cursor is null)
npx tsx scripts/relate-research.ts --since <cursor-date|7d-ago> --limit 30 --out /tmp/relate-ws.json
```
Then follow `/relate-research` (judge → dry-run → apply). **After a successful apply,
advance the cursor** so the next run is incremental:
```bash
npx tsx scripts/ops/maintenance-status.ts --advance-relate-research <now-ISO>
```
(Use the ISO timestamp of when you started the window. Re-running an overlapping window
is safe — the engine dedups — so erring slightly early is fine.)

**Step 2b — relate-bookmark (bookmark→candidate_signal), if Backlog bookmarks**
New `#bookmark` saves are a human-attention sensor (docs/v2/17) — the monitoring-lane sibling of
relate-research. Query the investment-bookmark Backlog via the Tana MCP:
```
search_nodes({ and: [
  { hasType: "CKcv0SohYIYs" },                                  // #bookmark
  { field: { fieldId: "pldNUHKkVotI", nodeId: "acNRFtsYYWtg" } },  // Category = investment
  { field: { fieldId: "2J2cAm36yfMW", nodeId: "PFqMIQc_KLER" } }   // Status = Backlog
] }, limit: 25)
```
If any, follow `/relate-bookmark` over **≤20** of them (Opus — bearing + significance judgment):
judge → write `candidate_signal`s → flip Status (Backlog→Done/Dropped). **Self-clearing** (the
Status flip is the cursor; processed bookmarks drop out of the Backlog), so leftovers drain next
run — report how many Backlog remain. The candidate_signals surface on `/thesis` re-underwrite and
feed the re_underwrite_due attention-weighting (Step 4 #8). Skip if the Backlog is empty. (The large
existing backlog is cleared once via a dedicated drain, not this bounded step — see docs/v2/17.)

**Step 3 — Drain the `/thesis-review` worklists (≤5 each, in this order)**
Run each via its `/thesis-review` mode; stop each at the per-run cap and note leftovers:
1. **digest refresh** (developing) — `find-stale-digests.ts --json` → digest mode (Opus, medium effort).
2. **signal derivation** (monitoring, no signals) — `find-signalless-theses.ts --json` → signal mode (Opus, medium effort). Skip `thin` (research-gap).
3. **health pass** (monitoring, due) — `find-theses-due-health.ts --json` → health mode (Opus, high effort). Raises `weakening_signal_action` packets only on deterioration.
4. **research-gap bridge** (monitoring, thin) — `find-research-gaps.ts --json` → research-gap mode (Opus, high effort). Tana-first; raises `develop_thin_thesis` packets.
5. **retrospective** (resolved) — `find-theses-needing-retrospective.ts --json` → retrospective mode (Opus, high effort).

**Step 4 — Decision detectors (C5)**
6. **framing** — `find-theses-needing-framing.ts --json` → `/thesis-review` framing mode (Opus, high effort): auto-link clear `related`, raise `classify_macro_link` for `gated_by`/uncertain. ≤5 judged per run; be sparing.
7. **classify_exposure** — deterministic, no judgment to ASK:
```bash
npx tsx scripts/ops/find-unclassified-exposures.ts --apply
```
8. **re_underwrite_due** — deterministic raiser; merges both triggers (claim-delta +
   signal-quality) into one packet per thesis (docs/v2/15 §6). Not subject to the ≤5 cap
   (it's idempotent — dedups per thesis). Preview, then apply:
```bash
npx tsx scripts/ops/raise-reunderwrite-decisions.ts            # preview
npx tsx scripts/ops/raise-reunderwrite-decisions.ts --apply    # raise/bump
```
The packets surface in `/decisions`; the user resolves each via `/thesis <X>` (re-underwrite),
which — for signal-quality triggers — should sharpen/drop the chronic-neutral signals and add a
signal for the coverage gap (the diagnostics ride along in the thesis-snapshot context).

**Step 5 — Report.** One compact summary: insights related (+cursor advanced to X),
digests/signals/health/retrospectives processed, decisions raised by type, and what
remains on each worklist (so the next run's scope is clear).

## Scheduling (user-go — do not auto-activate)

Running this on a recurring **billed cloud schedule** is the user's call (docs/v2/09 §12
#5). When the user approves, wire it with the `schedule` skill (a cloud routine) or a
local launchd job that runs `/maintenance` — event-driven (after new insights land) with
a **weekly floor** is the recommended cadence (§10). Until then, run on demand.

## Common mistakes
1. ❌ Running a full sweep — cap each mode at ~5 per run; converge over runs.
2. ❌ Forgetting to advance the relate-research cursor after applying links (next run re-scans the whole window — wasteful, though safe).
3. ❌ Writing a judgment change silently — surface it as a decision packet.
4. ❌ Dropping to Sonnet for the "mechanical" digest/signal modes — it's all interpretive judgment; stay on Opus and control cost via effort + batch size.
5. ❌ Activating a billed schedule without the user's go.
