#!/usr/bin/env bash
#
# regime-scan.sh
#
# Scheduled wrapper for the regime sensing feed (docs/v2/21 Phase 1): runs radon's
# IB-only CRI (crash-risk) + VCG (vol/credit gap) scanners via scripts/ingest-regime-scan.ts
# and stores one regime_snapshots row per scanner.
#
# Deliberately NOT wrapped in `claude`: pure data collection (IB Gateway + keyless
# Cboe/Yahoo fallbacks), no LLM judgment. Needs the local IB Gateway (local.ibc-gateway
# launchd job, weekly Monday 2FA) — a dead gateway degrades the scanners to fallback
# data rather than failing them.
#
# Schedule: 3x weekdays Europe/London — 07:40 (pre-brief, before /morning-brief 08:45),
# 15:10 (post-US-open read), 21:10 (post-US-close). Consumers: morning-brief bundle,
# dashboard regime strip, options-advisor scenario ranking.
#
# Off-switch: ./launchd/install.sh --remove (or launchctl unload the plist).
#
set -euo pipefail

TJ_ROOT="$HOME/projects/trade-journal"
LOG_FILE="$TJ_ROOT/logs/regime-scan.log"
LOCK_FILE="$TJ_ROOT/logs/.regime-scan.lock"
RUN_TIMEOUT=1200   # 20 min hard cap (IB pacing can be slow)
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

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
    if [ "$LOCK_AGE" -lt 1500 ]; then
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
    echo "[$(ts)] regime-scan start"
    echo "============================================================"
} >> "$LOG_FILE"

set +e
run_with_timeout "$RUN_TIMEOUT" /opt/homebrew/bin/npx tsx scripts/ingest-regime-scan.ts >> "$LOG_FILE" 2>&1
RC=$?
set -e

if [ "$RC" -eq 124 ]; then
    echo "[$(ts)] regime-scan TIMED OUT after ${RUN_TIMEOUT}s (process group killed)" >> "$LOG_FILE"
elif [ "$RC" -ne 0 ]; then
    echo "[$(ts)] regime-scan exited non-zero (rc=$RC)" >> "$LOG_FILE"
else
    echo "[$(ts)] regime-scan complete" >> "$LOG_FILE"
fi

# Record outcome for check-cron-health.ts (SessionStart nudge surfaces failure streaks).
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "regime-scan" "$RC" >> "$TJ_ROOT/logs/cron-status.tsv"
if [ "$RC" -ne 0 ]; then
    /usr/bin/osascript -e "display notification \"regime-scan failed (rc=$RC) — see logs/regime-scan.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
