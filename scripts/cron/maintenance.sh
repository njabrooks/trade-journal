#!/usr/bin/env bash
#
# maintenance.sh
#
# Scheduled wrapper for the belief-maintenance loop (docs/v2/09 §10, docs/v2/10).
# Called by launchd (com.trade-journal.maintenance) twice daily — 08:00 + 20:00
# Europe/London. Runs the governed belief-maintenance Claude adapter headlessly:
# it reads the
# status dashboard, relates new research (relate-research over [cursor, now)),
# drains a bounded slice of each worklist (digest / signal / health / research-gap /
# retrospective / framing / classify_exposure / re-underwrite-due), and raises
# DecisionStrip items.
#
# Safety: belief maintenance is decision-ONLY for genuine judgments — it auto-links only
# clear (>=0.7) claim matches and SURFACES everything else as decisions for the user;
# it never auto-resolves a genuine decision or auto-re-underwrites. It is token-aware
# and bounded per run, so the catch-up backlog drains over many runs.
#
# Cursor note (2026-06-22): the relate-research cursor is set to "now" so this job
# cleanly handles NEW content going forward (small windows). The historical ~290-insight
# backlog is drained SEPARATELY (manual oldest-first chunks) — see docs/v2/07 / memory.
#
# Off-switch:
#   launchctl unload ~/Library/LaunchAgents/com.trade-journal.maintenance.plist
# (or ./launchd/install.sh --remove). Belief-loop judgment is all-Opus (--model opus).
# A scheduled process can also be made a logged no-op with TJ_MAINTENANCE_DISABLED=1.
#
set -euo pipefail

TJ_ROOT="${TJ_ROOT:-$HOME/projects/trade-journal}"
LOG_DIR="${TJ_CRON_LOG_DIR:-$TJ_ROOT/logs}"
LOG_FILE="$LOG_DIR/maintenance.log"
LOCK_FILE="$LOG_DIR/.maintenance.lock"
STATUS_FILE="$LOG_DIR/cron-status.tsv"
INVOCATION_BIN="${TJ_MAINTENANCE_INVOCATION_BIN:-$TJ_ROOT/scripts/cron/maintenance-invocation.sh}"
NOTIFICATION_BIN="${TJ_CRON_NOTIFICATION_BIN:-/usr/bin/osascript}"
CLAUDE_TIMEOUT=2400   # 40 min hard cap on the agent run
CLAUDE_TIMEOUT="${TJ_MAINTENANCE_TIMEOUT_SECONDS:-$CLAUDE_TIMEOUT}"
RUN_MODE="${TJ_MAINTENANCE_RUN_MODE:-live}"
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

mkdir -p "$LOG_DIR"

if [ "${TJ_MAINTENANCE_DISABLED:-0}" = "1" ]; then
    echo "[$(ts)] maintenance disabled by wrapper off-switch; skipping" >> "$LOG_FILE"
    printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "maintenance" "0" >> "$STATUS_FILE"
    exit 0
fi

# Run a command with a wall-clock timeout, killing the whole process group on
# expiry so claude's MCP/subprocess children don't survive. Exits 124 on timeout.
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

# Prevent overlapping runs (a long run must not collide with the next fire).
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE") ))
    if [ "$LOCK_AGE" -lt 3000 ]; then
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
    echo "[$(ts)] maintenance start"
    echo "============================================================"
} >> "$LOG_FILE"

# Run the governed adapter headlessly (all-Opus for belief judgment). The
# operator-only TJ_MAINTENANCE_RUN_MODE supports bounded shadow/canary evidence;
# launchd leaves it unset and therefore uses the live bounded request.
# --dangerously-skip-permissions: required for unattended Bash/psql/tsx writes.
set +e
run_with_timeout "$CLAUDE_TIMEOUT" "$INVOCATION_BIN" "$RUN_MODE" >> "$LOG_FILE" 2>&1
RC=$?
set -e

if [ "$RC" -eq 124 ]; then
    echo "[$(ts)] maintenance TIMED OUT after ${CLAUDE_TIMEOUT}s (process group killed)" >> "$LOG_FILE"
elif [ "$RC" -ne 0 ]; then
    echo "[$(ts)] maintenance exited non-zero (rc=$RC)" >> "$LOG_FILE"
else
    echo "[$(ts)] maintenance complete" >> "$LOG_FILE"
fi

# Record outcome for check-cron-health.ts (SessionStart nudge surfaces failure streaks).
STATUS_NAME="maintenance"
if [ "$RUN_MODE" != "live" ]; then
    STATUS_NAME="maintenance-$RUN_MODE"
fi
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$STATUS_NAME" "$RC" >> "$STATUS_FILE"
if [ "$RC" -ne 0 ]; then
    "$NOTIFICATION_BIN" -e "display notification \"maintenance failed (rc=$RC) — see logs/maintenance.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
