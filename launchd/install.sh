#!/bin/bash
# Install / remove / inspect the trade-journal launchd jobs on this Mac.
#
# Currently active jobs:
#   - com.trade-journal.options-scanner  → 14:50 Europe/London, Mon-Fri
#     (= 09:50 NYC year-round; London/NYC share DST transitions)
#
# All older jobs have been moved to launchd/archive/ — see launchd/README.md
# for context and the convention this directory follows. Most TJ ingestion
# now runs on GH Actions; on-device launchd is reserved for jobs that need
# the resource isolation of the always-on home hub (e.g. the options
# scanner, which was being throttled by GH Actions cron pacing).
#
# Usage:
#   ./launchd/install.sh           # Install + start all active jobs
#   ./launchd/install.sh --status  # Check status
#   ./launchd/install.sh --remove  # Unload + remove all active jobs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

PLISTS=(
    "com.trade-journal.options-scanner.plist"
    "com.trade-journal.maintenance.plist"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_status() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  Trade Journal Scheduled Jobs Status"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    for plist in "${PLISTS[@]}"; do
        label="${plist%.plist}"
        if launchctl list | grep -q "$label"; then
            echo -e "  ${GREEN}✓${NC} $label (loaded)"
        else
            if [ -f "$LAUNCH_AGENTS_DIR/$plist" ]; then
                echo -e "  ${YELLOW}○${NC} $label (installed but not loaded)"
            else
                echo -e "  ${RED}✗${NC} $label (not installed)"
            fi
        fi
    done

    echo ""
    echo "Logs (in trade-journal/logs/):"
    for plist in "${PLISTS[@]}"; do
        echo "  logs/${plist#com.trade-journal.}"
    done | sed 's/\.plist$/\.log/'
    echo ""
}

install_jobs() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  Installing Trade Journal Scheduled Jobs"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    mkdir -p "$LAUNCH_AGENTS_DIR"
    mkdir -p "$SCRIPT_DIR/../logs"

    for plist in "${PLISTS[@]}"; do
        label="${plist%.plist}"

        echo "Installing $label..."

        launchctl unload "$LAUNCH_AGENTS_DIR/$plist" 2>/dev/null || true
        cp "$SCRIPT_DIR/$plist" "$LAUNCH_AGENTS_DIR/"
        launchctl load "$LAUNCH_AGENTS_DIR/$plist"

        echo -e "  ${GREEN}✓${NC} Installed"
    done

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo -e "  ${GREEN}Installation complete!${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "To manually trigger a job:"
    echo "  launchctl start com.trade-journal.options-scanner"
    echo ""
    echo "To tail logs:"
    echo "  tail -f logs/options-scanner.log"
    echo ""
}

remove_jobs() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  Removing Trade Journal Scheduled Jobs"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    for plist in "${PLISTS[@]}"; do
        label="${plist%.plist}"

        echo "Removing $label..."

        launchctl unload "$LAUNCH_AGENTS_DIR/$plist" 2>/dev/null || true
        rm -f "$LAUNCH_AGENTS_DIR/$plist"

        echo -e "  ${GREEN}✓${NC} Removed"
    done

    echo ""
    echo -e "${GREEN}All jobs removed.${NC}"
    echo ""
}

# Main
case "${1:-}" in
    --status)
        show_status
        ;;
    --remove)
        remove_jobs
        ;;
    *)
        install_jobs
        show_status
        ;;
esac
