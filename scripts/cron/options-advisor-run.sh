#!/usr/bin/env bash
#
# options-advisor-run.sh — scheduled advisor producer (docs/v2/21 Phase 4).
# Resolves W7's "post-scan scheduling deliberately on-demand pending user
# decision": the user's directive (2026-07-06) is a fresh, context-aware
# strategy surface at every login, so the advisor now runs itself.
#
# Two modes (one wrapper, two launchd jobs):
#   batch  — 08:05 wd: Massive-chain scenarios (hedge, income, collar, put_entry,
#            risk_reversal, opportunistic) + regime-aware judgment, before the
#            08:45 morning brief so it reads fresh batches.
#   leap   — 15:20 wd: leap_entry via radon's IB LEAP scanner (needs US market
#            hours + the gateway; ~25 min scan + judgment).
#
# Runs the governed portfolio-options-advice adapter headlessly (all-Opus). The
# adapter reads the latest regime_snapshots first (elevated CRI promotes
# hedge/collar), live-verifies chosen structures via IB before saving, and saves
# per-scenario batches
# (supersede-on-save, 7-day expiry) that the dashboard ScannerSnapshot renders.
#
# Off-switch: ./launchd/install.sh --remove (or launchctl unload the plists).
#
set -euo pipefail

MODE="${1:-batch}"
TJ_ROOT="$HOME/projects/trade-journal"
LOG_FILE="$TJ_ROOT/logs/options-advisor-${MODE}.log"
LOCK_FILE="$TJ_ROOT/logs/.options-advisor-${MODE}.lock"
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

case "$MODE" in
  batch)
    CLAUDE_TIMEOUT=2400  # 40 min: 6 scenarios + judgment + live verification
    ;;
  leap)
    CLAUDE_TIMEOUT=3600  # 60 min: ~25 min IB scan + judgment
    ;;
  *)
    echo "Usage: options-advisor-run.sh batch|leap" >&2; exit 1
    ;;
esac

mkdir -p "$TJ_ROOT/logs"

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

if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE") ))
    if [ "$LOCK_AGE" -lt $((CLAUDE_TIMEOUT + 600)) ]; then
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
    echo "[$(ts)] options-advisor-${MODE} start"
    echo "============================================================"
} >> "$LOG_FILE"

set +e
RUN_MODE="${TJ_OPTIONS_ADVISOR_RUN_MODE:-live}"
run_with_timeout "$CLAUDE_TIMEOUT" "$TJ_ROOT/scripts/cron/options-advisor-invocation.sh" "$MODE" "$RUN_MODE" >> "$LOG_FILE" 2>&1
RC=$?
set -e

if [ "$RC" -eq 124 ]; then
    echo "[$(ts)] options-advisor-${MODE} TIMED OUT after ${CLAUDE_TIMEOUT}s" >> "$LOG_FILE"
elif [ "$RC" -ne 0 ]; then
    echo "[$(ts)] options-advisor-${MODE} exited non-zero (rc=$RC)" >> "$LOG_FILE"
else
    echo "[$(ts)] options-advisor-${MODE} complete" >> "$LOG_FILE"
fi

STATUS_NAME="options-advisor-${MODE}"
if [ "$RUN_MODE" != "live" ]; then STATUS_NAME="${STATUS_NAME}-${RUN_MODE}"; fi
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$STATUS_NAME" "$RC" >> "$TJ_ROOT/logs/cron-status.tsv"
if [ "$RC" -ne 0 ]; then
    /usr/bin/osascript -e "display notification \"options-advisor-${MODE} failed (rc=$RC) — see logs/options-advisor-${MODE}.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
