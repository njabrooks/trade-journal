#!/usr/bin/env bash
#
# collect-signal-data.sh
#
# Scheduled wrapper that RE-HOMES the quantitative signal collectors (docs/v2/14 §8).
# The entire collection layer went dark 2026-04-06 when its execution host (a Paperclip
# agent) lost execution — collect-signal-data.ts itself is intact. This restores it on
# on-device launchd.
#
# Deliberately NOT wrapped in `claude`: collect-signal-data.ts is fully deterministic
# (plain API calls — defillama/coingecko/fred/derived/tradingview_cdp/hormuz/…) and needs
# no LLM judgment. Running it through Opus would only add cost + an LLM failure mode to a
# pure-data job. On-device (not GH Actions) because the tradingview_cdp collector needs the
# local CDP Chrome session. Threshold triggers + milestones run as built (journal-only).
#
# Schedule: 06:30 Europe/London daily — before /thesis-observe (07:00) and /maintenance
# (08:00), and feeds the nightly synthesize-signal-day aggregate.
#
# Off-switch: ./launchd/install.sh --remove (or launchctl unload the plist).
#
set -euo pipefail

TJ_ROOT="$HOME/projects/trade-journal"
LOG_FILE="$TJ_ROOT/logs/collect-signal-data.log"
LOCK_FILE="$TJ_ROOT/logs/.collect-signal-data.lock"
RUN_TIMEOUT=1800   # 30 min hard cap (external APIs can hang)
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
    if [ "$LOCK_AGE" -lt 2400 ]; then
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
    echo "[$(ts)] collect-signal-data start"
    echo "============================================================"
} >> "$LOG_FILE"

set +e
run_with_timeout "$RUN_TIMEOUT" /opt/homebrew/bin/npx tsx scripts/collect-signal-data.ts >> "$LOG_FILE" 2>&1
RC=$?
set -e

if [ "$RC" -eq 124 ]; then
    echo "[$(ts)] collect-signal-data TIMED OUT after ${RUN_TIMEOUT}s (process group killed)" >> "$LOG_FILE"
elif [ "$RC" -ne 0 ]; then
    echo "[$(ts)] collect-signal-data exited non-zero (rc=$RC)" >> "$LOG_FILE"
else
    echo "[$(ts)] collect-signal-data complete" >> "$LOG_FILE"
fi

# Record outcome for check-cron-health.ts (SessionStart nudge surfaces failure streaks).
printf '%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "collect-signal-data" "$RC" >> "$TJ_ROOT/logs/cron-status.tsv"
if [ "$RC" -ne 0 ]; then
    /usr/bin/osascript -e "display notification \"collect-signal-data failed (rc=$RC) — see logs/collect-signal-data.log\" with title \"trade-journal cron\"" >/dev/null 2>&1 || true
fi
exit 0
