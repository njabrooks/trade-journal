#!/usr/bin/env bash
#
# thesis-observe.sh
#
# Scheduled wrapper for the thesis-observe tracking-evidence producer (docs/v2/14 —
# the belief layer's "eyes & ears"). Called by launchd (com.trade-journal.thesis-observe)
# once daily at 07:00 Europe/London — AFTER overnight ingestion settles and BEFORE the
# 08:00 /maintenance consume, so the morning belief loop reads fresh evidence.
#
# Runs the governed thesis-observation Claude adapter headlessly: it loads the Tier-1 observation
# bundle (find-theses-due-observe.ts), WebSearches per thesis, judges each signal's
# STATEMENT against current news + price (thesis-centric polarity, events-judged),
# writes a directive report to notes/intelligence/, and ingests it into
# signal_data_snapshots(data_source='thesis_observe').
#
# Safety: thesis-observe is SENSING ONLY — it writes evidence + journals, NEVER raises a
# decision or changes a status. Phase 1 observes TIER-1 ONLY (the token-cost lever).
#
# Off-switch:
#   launchctl unload ~/Library/LaunchAgents/com.trade-journal.thesis-observe.plist
# (or ./launchd/install.sh --remove). Judgment is all-Opus (--model opus).
#
set -euo pipefail

TJ_ROOT="${TJ_ROOT:-$HOME/projects/trade-journal}"
LOG_DIR="${TJ_CRON_LOG_DIR:-$TJ_ROOT/logs}"
LOG_FILE="$LOG_DIR/thesis-observe.log"
LOCK_FILE="$LOG_DIR/.thesis-observe.lock"
STATUS_FILE="$LOG_DIR/cron-status.tsv"
INVOCATION_BIN="${TJ_THESIS_OBSERVE_INVOCATION_BIN:-$TJ_ROOT/scripts/cron/thesis-observe-invocation.sh}"
NOTIFICATION_BIN="${TJ_CRON_NOTIFICATION_BIN:-/usr/bin/osascript}"
CLAUDE_TIMEOUT=3000   # 50 min hard cap (WebSearch-heavy; Tier-1 bounded)
CLAUDE_TIMEOUT="${TJ_THESIS_OBSERVE_TIMEOUT_SECONDS:-$CLAUDE_TIMEOUT}"
RUN_MODE="${TJ_THESIS_OBSERVE_RUN_MODE:-live}"
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

mkdir -p "$LOG_DIR"

# Run a command with a wall-clock timeout, killing the whole process group on expiry so
# claude's MCP/subprocess children don't survive. Exits 124 on timeout.
run_with_timeout() {
    local secs="$1"; shift
    /opt/homebrew/bin/python3 - "$secs" "$@" <<'PY'
import os, signal, subprocess, sys
secs = int(sys.argv[1]); cmd = sys.argv[2:]
p = subprocess.Popen(cmd, preexec_fn=os.setsid)
try:
    sys.exit(p.wait(timeout=secs))
except subprocess.TimeoutExpired:
    os.killpg(os.getpgid(p.pid), signal.SIGTERM)
    try: p.wait(10)
    except subprocess.TimeoutExpired: os.killpg(os.getpgid(p.pid), signal.SIGKILL)
    sys.exit(124)
PY
}

# Prevent overlapping runs.
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE") ))
    if [ "$LOCK_AGE" -lt 3600 ]; then
        echo "[$(ts)] Previous run still in progress (lock age: ${LOCK_AGE}s). Skipping." >> "$LOG_FILE"
        exit 0
    fi
    echo "[$(ts)] Stale lock found (${LOCK_AGE}s old). Removing." >> "$LOG_FILE"
fi
trap 'rm -f "$LOCK_FILE"' EXIT
touch "$LOCK_FILE"

cd "$TJ_ROOT"

{
    echo ""
    echo "============================================================"
    echo "[$(ts)] thesis-observe start"
    echo "============================================================"
} >> "$LOG_FILE"

# Run the governed adapter headlessly (all-Opus for signal judgment).
# --dangerously-skip-permissions: required for unattended Bash/tsx/WebSearch + git.
set +e
run_with_timeout "$CLAUDE_TIMEOUT" "$INVOCATION_BIN" "$RUN_MODE" >> "$LOG_FILE" 2>&1
RC=$?
set -e

if [ "$RC" -eq 124 ]; then
    echo "[$(ts)] thesis-observe TIMED OUT after ${CLAUDE_TIMEOUT}s (process group killed)" >> "$LOG_FILE"
elif [ "$RC" -ne 0 ]; then
    echo "[$(ts)] thesis-observe exited non-zero (rc=$RC)" >> "$LOG_FILE"
else
    echo "[$(ts)] thesis-observe complete" >> "$LOG_FILE"
fi

# Record outcome for check-cron-health.ts (SessionStart nudge surfaces failure streaks).
STATUS_NAME="thesis-observe"
if [ "$RUN_MODE" != "live" ]; then STATUS_NAME="thesis-observe-$RUN_MODE"; fi
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$STATUS_NAME" "$RC" >> "$STATUS_FILE"
if [ "$RC" -ne 0 ]; then
    "$NOTIFICATION_BIN" -e "display notification \"thesis-observe failed (rc=$RC) — see logs/thesis-observe.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
