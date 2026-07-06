# Trade Journal launchd jobs

On-device cron for the trade-journal repo, running on the always-on Mac Mini
home hub. The Mac Mini is the same machine that runs the notes/Tana cron jobs
(`com.notes.*`, `com.tana.*`) — all live in the same `~/Library/LaunchAgents/`
directory and follow the same conventions.

## Currently defined jobs (the `install.sh` registry)

| Job | Schedule (Europe/London) | Wrapper | What it does |
|---|---|---|---|
| `com.trade-journal.options-scanner` | 14:50 Mon–Fri | `options-scanner.sh` | Daily 50-ticker vol-curve scan (= 09:50 NYC) |
| `com.trade-journal.maintenance` | 08:00 + 20:00 | `maintenance.sh` | `/maintenance` belief loop — **spawns headless `claude`** |
| `com.trade-journal.collect-signal-data` | 06:30 | `collect-signal-data.sh` | Quantitative signal collectors (deterministic tsx, **no Claude**) — docs/v2/14 §8 |
| `com.trade-journal.thesis-observe` | 07:00 | `thesis-observe.sh` | `/thesis-observe` tracking-evidence producer (Tier-1) — **spawns headless `claude`** — docs/v2/14 |
| `com.trade-journal.morning-brief` | 08:45 | `morning-brief.sh` | `/morning-brief` daily synthesis surface (ONE upserted `morning_briefs` row for the dashboard) — **spawns headless `claude`** — docs/v2/20 Lane A |
| `com.trade-journal.regime-scan` | 07:40 + 15:10 + 21:10 Mon–Fri | `regime-scan.sh` | CRI + VCG regime sensing via radon's IB-only scanners (deterministic tsx, **no Claude**) — docs/v2/21 Phase 1 |
| `com.trade-journal.options-advisor` | 08:05 Mon–Fri | `options-advisor-run.sh batch` | `/options-advisor` six Massive-chain scenarios, regime-aware — **spawns headless `claude`** — docs/v2/21 Phase 4 |
| `com.trade-journal.options-advisor-leap` | 15:20 Mon–Fri | `options-advisor-run.sh leap` | `/options-advisor` leap_entry via live IB gateway (needs `local.ibc-gateway`) — **spawns headless `claude`** — docs/v2/21 Phase 4 |

The morning chain is ordered: **06:30 collectors → 07:00 observe → 07:40 regime scan → 08:00 maintenance consume → 08:05 advisor batch → 08:45 brief synthesize**, so the belief loop reads fresh same-day quantitative + qualitative evidence and the brief summarizes what came out of it (including the advisor's fresh batches). The `claude`-spawning jobs run `--model opus --dangerously-skip-permissions`; treat enabling them as a deliberate go-live (they incur token cost). Install/remove all of them with `./install.sh` / `./install.sh --remove`. The IB Gateway substrate is its own launchd job (`local.ibc-gateway`, IBC-managed, weekly Monday 2FA — docs/v2/21 Phase 0; `scripts/ops/gateway.sh` to pause/resume).

## When to put a job here vs in GitHub Actions

| Pick **GitHub Actions** when… | Pick **on-device launchd** when… |
|---|---|
| Job is short, runs on a forgiving schedule (hourly is fine, exact minute doesn't matter), and shared-runner cron throttling is acceptable | Job has a tight timing requirement (e.g. "20 min after NYC market open") and you've observed GH Actions cron pacing throttle this slot |
| Job needs cloud-only credentials (e.g. `secrets.*` set in GH only) | Job needs local-only resources (IB Gateway, Chrome with persistent profile, local files) |
| Default | The Mac Mini is always-on and pays for itself once you've moved one or two heavy crons here |

The options scanner is the canonical example of the second case: its GH Actions
cron was being delayed 1.5–3 h on every fire and skipped on busy days, while
the same workflow file ran reliably on the Mac Mini in ~8 min. See
[`docs/features/260420-options-scanner-status.md`](../docs/features/260420-options-scanner-status.md)
Resolved items / 2026-05-18 for the full diagnosis.

## File convention (READ THIS BEFORE ADDING A NEW JOB)

Every on-device launchd job in this ecosystem uses **two files**:

1. **A wrapper `.sh` script** under `scripts/cron/<job-name>.sh` (this repo)
   or the equivalent location in sibling repos (e.g. `notes/scripts/tana-content.sh`).
   The wrapper owns all the orchestration logic.
2. **A plist** under `launchd/com.trade-journal.<job-name>.plist` (this repo)
   that just calls the wrapper. The plist owns scheduling and the launchd
   contract, nothing more.

**Why this split?** The earlier-generation TJ plists (now archived under
`launchd/archive/`) tried to inline all the bash into the plist's
`ProgramArguments` — XML-escaped `&amp;&amp;`, no lockfile, no stage markers,
hard to edit. The wrapper-script pattern that the notes/Tana jobs adopted is
strictly better: real shell syntax, proper `set -euo pipefail`, lockfile to
prevent overlapping runs, and timestamped stage logging.

**Anti-pattern (do not do this):**

```xml
<key>ProgramArguments</key>
<array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd /path &amp;&amp; set -a &amp;&amp; source .env.local &amp;&amp; ./node_modules/.bin/tsx ...</string>
</array>
```

**Correct pattern:**

```xml
<key>ProgramArguments</key>
<array>
    <string>/bin/bash</string>
    <string>/Users/home-hub/projects/trade-journal/scripts/cron/<job-name>.sh</string>
</array>
```

Use `scripts/cron/options-scanner.sh` as the reference implementation —
copy its shape (lockfile + stale-lock window + `ts()` helper + per-stage
markers + appending to a single per-job log file).

## Adding a new job

1. Write the wrapper at `scripts/cron/<job-name>.sh`:
   - Start with the header from `scripts/cron/options-scanner.sh` (lockfile,
     `set -euo pipefail`, `ts()`, log + lock paths derived from `TJ_ROOT`).
   - Pick a stale-lock window appropriate for your job's typical runtime.
   - `chmod +x` it.
   - Sanity-check: `bash -n scripts/cron/<job-name>.sh`.
2. Write the plist at `launchd/com.trade-journal.<job-name>.plist`:
   - `ProgramArguments` is just `/bin/bash` + the absolute path to the wrapper.
   - Pick the schedule. `StartCalendarInterval` is **local time** — for jobs
     tied to NYC market hours, schedule in London local: 14:50 London =
     09:50 NYC year-round (both cities share DST), so no DST cron-pair needed.
   - Use `Weekday` 1–5 if you want Mon–Fri only (US options markets are
     closed Sat/Sun).
   - `RunAtLoad` should usually be `<false/>` (don't fire on `launchctl load`,
     wait for the schedule).
   - Sanity-check: `plutil -lint launchd/com.trade-journal.<job-name>.plist`.
3. Add the plist to the `PLISTS` array in `launchd/install.sh`.
4. Install:
   ```bash
   cp launchd/com.trade-journal.<job-name>.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.trade-journal.<job-name>.plist
   launchctl list | grep <job-name>           # confirm loaded
   ```
5. Smoke-test:
   ```bash
   launchctl start com.trade-journal.<job-name>
   tail -f logs/<job-name>.log
   ```

## Inspecting a running job

```bash
# What's loaded?
launchctl list | grep trade-journal

# Print full job spec (state, last exit code, next fire, etc.)
launchctl print "gui/$(id -u)/com.trade-journal.<job-name>"

# Tail the log
tail -f logs/<job-name>.log
```

## Reloading after editing the plist

```bash
launchctl unload ~/Library/LaunchAgents/com.trade-journal.<job-name>.plist
cp launchd/com.trade-journal.<job-name>.plist ~/Library/LaunchAgents/
launchctl load   ~/Library/LaunchAgents/com.trade-journal.<job-name>.plist
```

(Editing the file in `~/Library/LaunchAgents/` directly is fine for testing,
but always copy the canonical version from `launchd/` back into LaunchAgents
once you're done — the repo file is the source of truth.)

## archive/

`launchd/archive/` holds the previous generation of TJ launchd jobs
(`flex-ingestion`, `massive-ingestion`, `signal-monitoring`,
`push-to-remote`, `supabase-start`). They are kept for historical reference —
they still encode what the on-device cron schedule used to be — but they are
**not installable as-is**:

- All reference the old `/Users/twotrees/Projects/trade-journal` path (the Mac
  Mini used to live under that username); the current path is
  `/Users/home-hub/projects/trade-journal`.
- All use the deprecated inline-bash convention (see above).
- Most have been replaced by GitHub Actions workflows of the same name
  (`flex-ingestion.yml`, `massive-ingestion.yml`, `signal-day-synthesis.yml`).
- `push-to-remote` and `supabase-start` are obsolete entirely (remote Supabase
  is the single source of truth; there is no local DB mode).

If you ever revive one of them, rewrite as a wrapper + plist pair per the
convention above; don't just sed-fix the paths.
