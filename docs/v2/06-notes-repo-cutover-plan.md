# W8 — Notes-repo promotion cutover plan (task 4)

**Status:** PREPPED, gated on explicit user go + a successful supervised relate-research run first.
**Target file:** `/Users/home-hub/projects/notes/scripts/tana-content-ingest.py` (notes repo).
**Goal:** Stop the unconditional `main_claims` dump, but KEEP creating the `research_insight`
(with `claims_structure`) — that insight is the hand-off artifact `relate-research` consumes.

> Line numbers are approximate (from the 2026-06-18 review); re-confirm against the file before editing.

## The single surgical edit

Inside `promote_claims()` (~lines 1917–2175), delete **Step 4** (the batch-create-claims block,
~lines 2137–2174) and return an empty `promoted_map`. Keep Steps 1–3 (Claude metadata, the
`claims_structure` builder, and the artifact+insight inline insert) untouched.

**Before** (~2135–2175): the block that builds `batch_claims`, calls
`tj_script("scripts/ops/batch-create-claims.ts", ...)`, builds `promoted_map`, and returns it.

**After:**
```python
    log.info("  Created artifact %s, insight %s", artifact_id[:8], insight_id[:8])

    # Step 4 (W8/D2): main_claims are NO LONGER created here. The research_insight's
    # claims_structure.main_claims[] is the hand-off; the Trade-Journal-side relate-research
    # job links only thesis-relevant claims. Empty promoted_map no-ops the legacy
    # promote-then-link/signal-backfill steps.
    promoted_map: dict[str, str] = {}
    return promoted_map, artifact_id, insight_id
```
Optional: update the `promote_claims` docstring and the Step 11 log line to match.

## Why downstream is safe (no dangling refs, no crashes)

- Step 12 `backfill_and_journal` and Step 13 `generate_linkage` are already guarded by
  `if promoted_map and …` and both early-return on empty `promoted_map` → **skipped**.
- Step 14 `write_audit_log` receives `{}` → logs `claims_promoted: 0`. No crash.
- Final report `if promoted_map:` → falsy → the "N promoted" line is skipped.
- Steps 9–10 (`route_signals` / `assess_signals`) do **not** depend on `promoted_map` and
  **stay** — they still write `signal_data_snapshots` with `claimId=NULL`. (Thinning the
  notes-repo signal routing is separate D3/thesis-review/W9 work, NOT this cutover.)

## claims_structure is preserved byte-for-byte

The builder + artifact/insight insert run BEFORE the deleted Step 4 and are untouched. The
relate-research engine reads `claims_structure.main_claims[]` fields (`id`="claim-{i+1}",
`title`, `category`, `claim`, `evidence`, `reasoning`, `backing`, `qualifier`, `rebuttal`,
`time_horizon`, `relevant_tickers`) — all still produced. `sourceClaimId` dedup key unchanged.

## Safe cutover sequence

Job: launchd `com.tana.content` (plist `~/Library/LaunchAgents/com.tana.content.plist`,
`StartInterval` 900s) → wrapper `notes/scripts/tana-content.sh` Stage 2 runs
`tana-content-ingest.py --limit 3`. Lock at `notes/logs/.tana-content.lock`.

```bash
# 0. Baseline
cd /Users/home-hub/projects/trade-journal && source .env.local
psql "$DATABASE_URL_POOLER" -c "SELECT count(*) FROM main_claims WHERE created_at >= now() - interval '1 hour';"

# 1. Pause the cron
launchctl bootout gui/$UID/com.tana.content 2>/dev/null || launchctl unload ~/Library/LaunchAgents/com.tana.content.plist
launchctl list | grep com.tana.content   # expect no output
# (if a run is in flight, wait or rm -f notes/logs/.tana-content.lock once no python proc is running)

# 2. Apply the edit (above)

# 3. Syntax check + ONE manual ingest
/opt/homebrew/bin/python3 -m py_compile /Users/home-hub/projects/notes/scripts/tana-content-ingest.py
cd /Users/home-hub/projects/notes && /opt/homebrew/bin/python3 scripts/tana-content-ingest.py --limit 1
#   watch log for: "Created artifact … insight …"  AND the ABSENCE of "Promoted N claims"

# 4. Verify: insight created, NO new main_claims
cd /Users/home-hub/projects/trade-journal && source .env.local
psql "$DATABASE_URL_POOLER" -c "SELECT id, jsonb_array_length(claims_structure->'main_claims') AS n_main FROM research_insights WHERE created_at >= now() - interval '15 minutes' ORDER BY created_at DESC LIMIT 3;"   # expect >=1 row, n_main > 0
psql "$DATABASE_URL_POOLER" -c "SELECT count(*) FROM main_claims WHERE created_at >= now() - interval '15 minutes';"   # expect 0

# 5. Resume the cron
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.tana.content.plist 2>/dev/null || launchctl load ~/Library/LaunchAgents/com.tana.content.plist
launchctl list | grep com.tana.content   # expect it listed again
```

## Rollback

One file, no schema/DB change:
```bash
cd /Users/home-hub/projects/notes
git checkout -- scripts/tana-content-ingest.py
/opt/homebrew/bin/python3 -m py_compile scripts/tana-content-ingest.py
# then ensure the cron is loaded (step 5)
```
No DB rollback needed — the change only *stops* writing main_claims. Any insights created
during the window remain valid hand-off artifacts; any links relate-research already made are
legitimate and kept.
