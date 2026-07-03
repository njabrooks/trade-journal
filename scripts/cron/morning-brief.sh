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
# Runs the `/morning-brief` Claude skill headlessly: it gathers the deterministic
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
#
set -euo pipefail

TJ_ROOT="$HOME/projects/trade-journal"
LOG_FILE="$TJ_ROOT/logs/morning-brief.log"
LOCK_FILE="$TJ_ROOT/logs/.morning-brief.lock"
CLAUDE="/opt/homebrew/bin/claude"
CLAUDE_TIMEOUT=1800   # 30 min hard cap (deterministic bundle + synthesis; no WebSearch)
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

mkdir -p "$TJ_ROOT/logs"

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

# Run the /morning-brief skill headlessly (all-Opus for the judgment synthesis).
# --dangerously-skip-permissions: required for unattended Bash/tsx.
set +e
run_with_timeout "$CLAUDE_TIMEOUT" "$CLAUDE" -p "/morning-brief" \
    --model opus \
    --dangerously-skip-permissions >> "$LOG_FILE" 2>&1
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
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "morning-brief" "$RC" >> "$TJ_ROOT/logs/cron-status.tsv"
if [ "$RC" -ne 0 ]; then
    /usr/bin/osascript -e "display notification \"morning-brief failed (rc=$RC) — see logs/morning-brief.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
