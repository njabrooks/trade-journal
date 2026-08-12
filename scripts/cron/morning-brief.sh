#!/usr/bin/env bash
#
# morning-brief.sh
#
# Scheduled wrapper for the morning-brief synthesis producer (docs/v2/20 Lane A —
# the daily "what deserves my attention today" surface). Called by launchd
# (com.trade-journal.morning-brief) once daily at 08:45 Europe/London — AFTER the
# 07:00 thesis-observe and 08:00 /maintenance runs, so the brief synthesizes the
# morning's fresh evidence and newly-raised decisions.
#
# Runs the governed morning-attention-brief adapter headlessly: it gathers the deterministic
# bundle (scripts/morning-brief-data.ts --json), judges what deserves attention,
# and upserts ONE row into morning_briefs (keyed on brief_date) that the dashboard
# MorningBrief module renders.
#
# Safety: morning-brief is SYNTHESIS ONLY — its only DB write is the morning_briefs
# upsert (scripts/ops/save-morning-brief.ts). It NEVER mutates the belief layer,
# never raises a decision, never changes a status.
#
# Off-switch:
#   launchctl unload ~/Library/LaunchAgents/com.trade-journal.morning-brief.plist
# (or ./launchd/install.sh --remove). Judgment is all-Opus (--model opus).
# A scheduled process can also be made a logged no-op with TJ_MORNING_BRIEF_DISABLED=1.
#
set -euo pipefail

TJ_ROOT="${TJ_ROOT:-$HOME/projects/trade-journal}"
LOG_DIR="${TJ_CRON_LOG_DIR:-$TJ_ROOT/logs}"
LOG_FILE="$LOG_DIR/morning-brief.log"
LOCK_FILE="$LOG_DIR/.morning-brief.lock"
STATUS_FILE="$LOG_DIR/cron-status.tsv"
INVOCATION_BIN="${TJ_MORNING_BRIEF_INVOCATION_BIN:-$TJ_ROOT/scripts/cron/morning-brief-invocation.sh}"
NOTIFICATION_BIN="${TJ_CRON_NOTIFICATION_BIN:-/usr/bin/osascript}"
CLAUDE_TIMEOUT=1800   # 30 min hard cap (deterministic bundle + synthesis; no WebSearch)
CLAUDE_TIMEOUT="${TJ_MORNING_BRIEF_TIMEOUT_SECONDS:-$CLAUDE_TIMEOUT}"
RUN_MODE="${TJ_MORNING_BRIEF_RUN_MODE:-live}"
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

mkdir -p "$LOG_DIR"

if [ "${TJ_MORNING_BRIEF_DISABLED:-0}" = "1" ]; then
    echo "[$(ts)] morning-brief disabled by wrapper off-switch; skipping" >> "$LOG_FILE"
    printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "morning-brief" "0" >> "$STATUS_FILE"
    exit 0
fi

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
    echo "[$(ts)] morning-brief start"
    echo "============================================================"
} >> "$LOG_FILE"

# Run the governed selector headlessly (all-Opus for the judgment synthesis).
set +e
run_with_timeout "$CLAUDE_TIMEOUT" "$INVOCATION_BIN" "$RUN_MODE" >> "$LOG_FILE" 2>&1
RC=$?
set -e

if [ "$RC" -eq 124 ]; then
    echo "[$(ts)] morning-brief TIMED OUT after ${CLAUDE_TIMEOUT}s (process group killed)" >> "$LOG_FILE"
elif [ "$RC" -ne 0 ]; then
    echo "[$(ts)] morning-brief exited non-zero (rc=$RC)" >> "$LOG_FILE"
else
    echo "[$(ts)] morning-brief complete" >> "$LOG_FILE"
fi

# Record outcome for check-cron-health.ts (SessionStart nudge surfaces failure streaks).
STATUS_NAME="morning-brief"
if [ "$RUN_MODE" != "live" ]; then STATUS_NAME="${STATUS_NAME}-${RUN_MODE}"; fi
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$STATUS_NAME" "$RC" >> "$STATUS_FILE"
if [ "$RC" -ne 0 ]; then
    "$NOTIFICATION_BIN" -e "display notification \"morning-brief failed (rc=$RC) — see logs/morning-brief.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
