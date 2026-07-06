#!/usr/bin/env bash
#
# gateway.sh — pause / resume / status for the IBC-managed IB Gateway
# (local.ibc-gateway launchd job; docs/v2/21 Phase 0).
#
# WHY PAUSE EXISTS: IBKR allows one session per username. The gateway runs under
# the dedicated API username, and IBC's auto-relogin will fight (and win) any
# manual login with that same username — e.g. Client Portal to manage market-data
# subscriptions. `pause` stops the fight: it halts the launchd job and kills the
# Gateway JVM so the username is free; `resume` brings it back (Monday-style 2FA
# tap required if the weekly token has lapsed, otherwise instant).
#
# Your MAIN username is never touched by any of this — it lives on your phone and
# laptop only, and never conflicts with the gateway.
#
# PROFILES: credential profiles live in ~/ibc/profiles/<name>.ini (600 perms);
# ~/ibc/config.ini is the ACTIVE copy and ~/ibc/.active-profile names it.
# `use <name>` pauses, activates that profile, and resumes — so the gateway can
# run under a different username (each IBKR username = one concurrent session).
# Filling profiles/main.ini is the user's own call (it stores those credentials
# on disk); it ships with FILL_ME_IN placeholders and `use` refuses to activate
# an unfilled profile.
#
# Usage:
#   scripts/ops/gateway.sh status
#   scripts/ops/gateway.sh pause         # free the active username for a manual login
#   scripts/ops/gateway.sh resume        # restart the gateway (watch phone for 2FA)
#   scripts/ops/gateway.sh profiles      # list profiles (active marked)
#   scripts/ops/gateway.sh use <name>    # switch profile (pause → swap → resume)
#
set -euo pipefail

LABEL="local.ibc-gateway"
UID_N=$(id -u)
JVM_PATTERN="java.*config.ini"
IBC_DIR="$HOME/ibc"
PROFILES_DIR="$IBC_DIR/profiles"
ACTIVE_FILE="$IBC_DIR/.active-profile"

port_open() { nc -z -w 2 localhost 4001 >/dev/null 2>&1; }

active_profile() { cat "$ACTIVE_FILE" 2>/dev/null || echo "unknown"; }

case "${1:-status}" in
  status)
    echo "Active profile: $(active_profile)"
    if port_open; then echo "API port 4001: OPEN (gateway logged in)"; else echo "API port 4001: closed"; fi
    if pgrep -f "$JVM_PATTERN" >/dev/null; then echo "Gateway JVM: running"; else echo "Gateway JVM: not running"; fi
    launchctl print "gui/$UID_N/$LABEL" >/dev/null 2>&1 && echo "launchd job: loaded" || echo "launchd job: NOT loaded"
    LOG=$(ls -t "$HOME"/ibc/logs/ibc-*_GATEWAY-*.txt 2>/dev/null | head -1)
    [ -n "$LOG" ] && { echo "--- last IBC activity:"; grep -E "IBC: (Login|Second Factor|detected dialog)" "$LOG" | tail -3; }
    ;;
  pause)
    echo "Pausing gateway (freeing the API username for manual login)…"
    launchctl bootout "gui/$UID_N/$LABEL" 2>/dev/null && echo "launchd job unloaded" || echo "launchd job was not loaded"
    if pgrep -f "$JVM_PATTERN" >/dev/null; then
      pkill -f "$JVM_PATTERN"; sleep 5
      pgrep -f "$JVM_PATTERN" >/dev/null && { pkill -9 -f "$JVM_PATTERN"; sleep 2; }
    fi
    pgrep -f "$JVM_PATTERN" >/dev/null && echo "WARNING: JVM still alive" || echo "Gateway stopped — API username is free. Run 'scripts/ops/gateway.sh resume' when done."
    ;;
  resume)
    echo "Resuming gateway…"
    if ! launchctl print "gui/$UID_N/$LABEL" >/dev/null 2>&1; then
      launchctl bootstrap "gui/$UID_N" "$HOME/Library/LaunchAgents/$LABEL.plist"
      echo "launchd job loaded (RunAtLoad starts the gateway now)"
    else
      launchctl kickstart "gui/$UID_N/$LABEL"
      echo "launchd job kickstarted"
    fi
    echo "Watch your phone for the IBKR 2FA prompt if the weekly token has lapsed."
    for i in $(seq 1 24); do port_open && { echo "API port 4001 OPEN — gateway is back."; exit 0; }; sleep 10; done
    echo "Port 4001 not open yet after 4 min — check 2FA on your phone, then 'scripts/ops/gateway.sh status'."
    ;;
  profiles)
    ACTIVE=$(active_profile)
    echo "Profiles in $PROFILES_DIR (active: $ACTIVE):"
    for p in "$PROFILES_DIR"/*.ini; do
      [ -e "$p" ] || { echo "  (none)"; break; }
      name=$(basename "$p" .ini)
      if grep -q "FILL_ME_IN" "$p" 2>/dev/null; then state="template — credentials not filled"; else state="ready"; fi
      [ "$name" = "$ACTIVE" ] && marker="* " || marker="  "
      echo "  ${marker}${name} (${state})"
    done
    ;;
  use)
    NAME="${2:-}"
    [ -z "$NAME" ] && { echo "Usage: gateway.sh use <profile>" >&2; exit 1; }
    PROFILE="$PROFILES_DIR/$NAME.ini"
    [ -f "$PROFILE" ] || { echo "No such profile: $NAME (see 'gateway.sh profiles')" >&2; exit 1; }
    if grep -q "FILL_ME_IN" "$PROFILE"; then
      echo "Profile '$NAME' still has FILL_ME_IN placeholders — edit $PROFILE first (never paste credentials into chat)." >&2
      exit 1
    fi
    ACTIVE=$(active_profile)
    if [ "$NAME" = "$ACTIVE" ] && port_open; then
      echo "Profile '$NAME' is already active and logged in."; exit 0
    fi
    echo "Switching gateway profile: $ACTIVE → $NAME"
    # Persist any manual edits made to the live config back to its profile first
    [ -f "$PROFILES_DIR/$ACTIVE.ini" ] && cp -p "$IBC_DIR/config.ini" "$PROFILES_DIR/$ACTIVE.ini" 2>/dev/null || true
    "$0" pause
    cp -p "$PROFILE" "$IBC_DIR/config.ini" && chmod 600 "$IBC_DIR/config.ini"
    echo "$NAME" > "$ACTIVE_FILE"
    "$0" resume
    ;;
  *)
    echo "Usage: gateway.sh status|pause|resume|profiles|use <name>" >&2; exit 1
    ;;
esac
