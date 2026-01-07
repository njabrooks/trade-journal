#!/bin/bash
# Install launchd jobs for trade-journal scheduled tasks
#
# This script installs scheduled jobs to:
# - Run Flex ingestion at 4 AM, 6 AM, 12 PM
# - Run Massive ingestion at 4:30 PM
# - Push to remote backup at 11 PM
#
# Usage:
#   ./launchd/install.sh           # Install all jobs
#   ./launchd/install.sh --status  # Check status
#   ./launchd/install.sh --remove  # Remove all jobs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

PLISTS=(
    "com.trade-journal.flex-ingestion.plist"
    "com.trade-journal.massive-ingestion.plist"
    "com.trade-journal.push-to-remote.plist"
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
            echo -e "  ${GREEN}✓${NC} $label (running)"
        else
            if [ -f "$LAUNCH_AGENTS_DIR/$plist" ]; then
                echo -e "  ${YELLOW}○${NC} $label (installed but not running)"
            else
                echo -e "  ${RED}✗${NC} $label (not installed)"
            fi
        fi
    done

    echo ""
    echo "Log files:"
    echo "  /tmp/flex-ingestion.log"
    echo "  /tmp/massive-ingestion.log"
    echo "  /tmp/push-to-remote.log"
    echo ""
}

install_jobs() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  Installing Trade Journal Scheduled Jobs"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    # Create LaunchAgents directory if it doesn't exist
    mkdir -p "$LAUNCH_AGENTS_DIR"

    for plist in "${PLISTS[@]}"; do
        label="${plist%.plist}"

        echo "Installing $label..."

        # Unload if already loaded
        launchctl unload "$LAUNCH_AGENTS_DIR/$plist" 2>/dev/null || true

        # Copy plist
        cp "$SCRIPT_DIR/$plist" "$LAUNCH_AGENTS_DIR/"

        # Load the job
        launchctl load "$LAUNCH_AGENTS_DIR/$plist"

        echo -e "  ${GREEN}✓${NC} Installed"
    done

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo -e "  ${GREEN}Installation complete!${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Schedule:"
    echo "  Flex ingestion:    4:00 AM, 6:00 AM, 12:00 PM"
    echo "  Massive ingestion: 4:30 PM"
    echo "  Push to remote:    11:00 PM"
    echo ""
    echo "To check logs:"
    echo "  tail -f /tmp/flex-ingestion.log"
    echo "  tail -f /tmp/massive-ingestion.log"
    echo "  tail -f /tmp/push-to-remote.log"
    echo ""
    echo "To manually trigger a job:"
    echo "  launchctl start com.trade-journal.flex-ingestion"
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

        # Unload if loaded
        launchctl unload "$LAUNCH_AGENTS_DIR/$plist" 2>/dev/null || true

        # Remove plist
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
