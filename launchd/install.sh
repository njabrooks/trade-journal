#!/bin/bash
# Install launchd jobs for trade-journal scheduled tasks
#
# This script installs scheduled jobs to:
# - Run Flex ingestion hourly from 4 AM to 2 PM UTC (11 times daily)
# - Run Massive ingestion at 21:30 UTC (4:30 PM ET, after market close)
# - Run Signal monitoring at 08:00 UTC (morning triage before market open)
# - Run FRED ingestion at 06:00 UTC (before market open)
# - Push to remote backup at 7 AM UTC
#
# Usage:
#   ./launchd/install.sh           # Install all jobs
#   ./launchd/install.sh --status  # Check status
#   ./launchd/install.sh --remove  # Remove all jobs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

PLISTS=(
    "com.trade-journal.supabase-start.plist"
    "com.trade-journal.flex-ingestion.plist"
    "com.trade-journal.massive-ingestion.plist"
    "com.trade-journal.signal-monitoring.plist"
    "com.trade-journal.fred-ingestion.plist"
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
    echo "Log files (in trade-journal/logs/):"
    echo "  logs/supabase-start.log"
    echo "  logs/flex-ingestion.log"
    echo "  logs/massive-ingestion.log"
    echo "  logs/signal-monitoring.log"
    echo "  logs/fred-ingestion.log"
    echo "  logs/push-to-remote.log"
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

    # Create logs directory if it doesn't exist (in project directory)
    mkdir -p "$SCRIPT_DIR/../logs"

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
    echo "Schedule (UTC):"
    echo "  Supabase start:     On login (30s delay for Docker)"
    echo "  Flex ingestion:     Hourly 04:00-14:00 UTC (11 runs)"
    echo "  FRED ingestion:     06:00 UTC (before market open)"
    echo "  Massive ingestion:  21:30 UTC (4:30 PM ET)"
    echo "  Signal monitoring:  08:00 UTC (morning triage)"
    echo "  Push to remote:     07:00 UTC"
    echo ""
    echo "To check logs (in trade-journal/logs/):"
    echo "  tail -f logs/flex-ingestion.log"
    echo "  tail -f logs/massive-ingestion.log"
    echo "  tail -f logs/fred-ingestion.log"
    echo "  tail -f logs/signal-monitoring.log"
    echo "  tail -f logs/push-to-remote.log"
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
