---
name: gateway
description: Control the IBC-managed IB Gateway connection (docs/v2/21 Phase 0). Pause it to free the active username for a manual login (e.g. Client Portal to manage market-data subscriptions), resume it, check status, list credential profiles, or switch the gateway between login profiles (e.g. api ↔ main). Use when the user says "pause the gateway", "I need to log into the API account", "free up the IBKR login", "resume/restart the gateway", "is the gateway up", "switch the gateway login/profile", "which profile is the gateway on", or reports being kicked out of an IBKR login by the auto-reconnect.
allowed-tools: Bash, Read
user_invocable: true
---

# Gateway — pause / resume / status

The IB Gateway runs 24/5 under the **dedicated API username** via IBC + launchd
(`local.ibc-gateway`). IBKR allows one session per username, and IBC auto-relogins
aggressively — so any manual login with the API username (Client Portal, mobile)
gets kicked unless the gateway is paused first. The user's MAIN username never
conflicts — it is not stored or used by the gateway.

## Commands

```bash
cd /Users/home-hub/projects/trade-journal
scripts/ops/gateway.sh status        # active profile, port, JVM, launchd, last IBC activity
scripts/ops/gateway.sh pause         # stop job + JVM; active username freed
scripts/ops/gateway.sh resume        # reload/kickstart; may need a 2FA phone tap
scripts/ops/gateway.sh profiles      # list credential profiles (~/ibc/profiles/*.ini)
scripts/ops/gateway.sh use <name>    # switch profile: pause → swap config → resume
```

## Profiles

Credential profiles live in `~/ibc/profiles/<name>.ini` (600 perms); `config.ini`
is the active copy. `api` is the default (dedicated API username, market-data
duty). `main` ships as a placeholder template — filling it is the USER'S call
(it stores those credentials on disk; the api-only setup avoids that). `use`
refuses profiles with FILL_ME_IN placeholders, persists any live-config edits
back to the outgoing profile before swapping, and triggers a fresh login (2FA
tap for the incoming username). Remember: one IBKR session per username — while
the gateway runs `main`, the user cannot trade under `main` elsewhere, which is
the very conflict the api profile exists to avoid. Prefer `pause` for short
manual tasks; `use` is for deliberate, longer switches.

## Flow for "I need to log in manually" (e.g. market-data subscriptions)

1. `pause` — confirm "Gateway stopped" output.
2. Tell the user the API username is free; they do their Client Portal work.
3. When they say they're done: `resume` — remind them a 2FA tap may be needed
   (always needed after the weekly Sunday-01:00-ET token reset; usually not
   needed intra-week since the session token is fresh).
4. Confirm port 4001 open (the script polls for 4 min).

## Notes

- While paused, regime scans and any advisor scenario needing live IB degrade
  to keyless fallbacks or fail visibly — the cron-health nudge will flag it if
  left paused past a scheduled scan. Don't leave it paused longer than needed.
- Never print or read `~/ibc/config.ini` — it contains credentials.
- If resume hangs at 2FA repeatedly, check for a pending IBKR account
  confirmation task (that blocked pushes once before, 2026-07-06).
