#!/usr/bin/env bash
#
# options-scanner.sh
#
# Daily wrapper for the options scanner pipeline (dual-regime: cheap + rich).
# Called by launchd (com.trade-journal.options-scanner) at 14:50 Europe/London
# Mon-Fri (= 09:50 NYC year-round, since London and NYC share DST transitions).
#
# Stages (sequential, fail-fast):
#   1. git pull --ff-only           — pick up latest scanner config from main
#   2. ingest-radar-back-months.ts  — Massive monthly chains 1M-9M for the
#                                     50-ticker watchlist (~7 min)
#   3. scan-cheap-options.ts        — compute regime metrics (cheap/rich/
#                                     neutral/mixed) + write
#                                     vol_scan_ticker_snapshots (~30 sec)
#
# (The TS script retains the legacy `scan-cheap-options.ts` filename even
# though it screens both cheap and rich regimes; rename was scoped out of
# the 2026-05-18 cleanup to limit blast radius.)
#
# Lockfile prevents overlapping runs (e.g. manual `launchctl start` while
# the scheduled fire is still in flight). Stale-lock window = 30 min (typical
# run is ~8 min; anything past 30 min is assumed dead).
#
set -euo pipefail

TJ_ROOT="$HOME/projects/trade-journal"
LOG_FILE="$TJ_ROOT/logs/options-scanner.log"
LOCK_FILE="$TJ_ROOT/logs/.options-scanner.lock"
ts() { TZ='Europe/London' date +'%Y-%m-%d %H:%M:%S %Z'; }

mkdir -p "$TJ_ROOT/logs"

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE") ))
    if [ "$LOCK_AGE" -lt 1800 ]; then
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
    echo "[$(ts)] options-scanner start"
    echo "============================================================"
} >> "$LOG_FILE"

# Pick up any pending main changes (scanner config, watchlist, thresholds)
echo "[$(ts)] Stage 1/3: git pull --ff-only" >> "$LOG_FILE"
git pull --ff-only >> "$LOG_FILE" 2>&1

# Load env (DATABASE_URL_POOLER, MASSIVE_API_KEY, etc.)
set -a
# shellcheck disable=SC1091
source .env.local
set +a

echo "[$(ts)] Stage 2/3: ingest-radar-back-months.ts (Massive chains 1M-9M)" >> "$LOG_FILE"
./node_modules/.bin/tsx scripts/ingest-radar-back-months.ts >> "$LOG_FILE" 2>&1

echo "[$(ts)] Stage 3/3: scan-cheap-options.ts (regime metrics + snapshots)" >> "$LOG_FILE"
./node_modules/.bin/tsx scripts/scan-cheap-options.ts >> "$LOG_FILE" 2>&1

echo "[$(ts)] options-scanner complete" >> "$LOG_FILE"
