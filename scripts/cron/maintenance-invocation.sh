#!/usr/bin/env bash
# Select and execute the belief-maintenance provider invocation.
#
# The live path is pinned to the exact governed Claude adapter. A marker file
# restores the previous `/maintenance` invocation without changing launchd:
#
#   touch logs/.maintenance-use-legacy
#   rm logs/.maintenance-use-legacy  # return to the governed adapter
#
# Shadow and canary modes are operator-only validation paths; launchd invokes
# the default live mode.
set -euo pipefail

TJ_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_BIN="${TJ_MAINTENANCE_CLAUDE_BIN:-/opt/homebrew/bin/claude}"
ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/belief-maintenance/adapters/claude.md"
ROLLBACK_MARKER="${TJ_MAINTENANCE_ROLLBACK_MARKER:-$TJ_REPO_ROOT/logs/.maintenance-use-legacy}"
EXPECTED_ADAPTER_DIGEST="994acd5860b1e78d952d26c1e69dc46f05a9bb9b2cbce013ca8b073599fc2641"
RUN_MODE="${1:-live}"

# The governed adapter requires the configured repository environment. Export
# the existing machine-local values to the provider process and its child
# scripts; do not print or modify them.
if [ "${TJ_MAINTENANCE_SKIP_ENV:-0}" != "1" ] && [ -f "$TJ_REPO_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$TJ_REPO_ROOT/.env.local"
    set +a
fi

adapter_digest() {
    /usr/bin/shasum -a 256 "$ADAPTER_PATH" | /usr/bin/awk '{print $1}'
}

governed_prompt() {
    local request="$1"
    printf '%s\n' \
        "Execute the governed Trade Journal Provider Adapter at capabilities/belief-maintenance/adapters/claude.md." \
        "Treat that adapter and the locked Capability contract as authoritative; do not enter through slash-command discovery." \
        "Request: $request" \
        "Honor the declared bound as a hard maximum. Never invoke scripts/ops/resolve-decision.ts or scripts/ops/update-entity-status.ts." \
        "When dryRun is true, perform reads only: do not invoke any write-capable operation, advance a cursor, change Tana status, or raise/resolve a Decision Item." \
        "Return only the adapter result object required by the governed contract. Report partial or refused work honestly."
}

run_governed() {
    local request="$1"
    local actual_digest
    actual_digest="$(adapter_digest)"
    if [ "$actual_digest" != "$EXPECTED_ADAPTER_DIGEST" ]; then
        echo "governed maintenance adapter digest mismatch: expected $EXPECTED_ADAPTER_DIGEST, got $actual_digest" >&2
        return 65
    fi

    local schema='{"type":"object","additionalProperties":false,"properties":{"success":{"type":"boolean"},"mode":{"const":"maintenance"},"dryRun":{"type":"boolean"},"bound":{"type":"object"},"reads":{"type":"array"},"writes":{"type":"array"},"cursorBefore":{},"cursorAfter":{},"decisionsSurfaced":{"type":"array"},"skipped":{"type":"array"},"errors":{"type":"array"}},"required":["success","mode","dryRun","bound","reads","writes","cursorBefore","cursorAfter","decisionsSurfaced","skipped","errors"]}'

    exec "$CLAUDE_BIN" -p "$(governed_prompt "$request")" \
        --model opus \
        --dangerously-skip-permissions \
        --no-session-persistence \
        --output-format json \
        --json-schema "$schema"
}

case "$RUN_MODE" in
    live)
        if [ -f "$ROLLBACK_MARKER" ]; then
            echo "maintenance rollback marker present; using legacy /maintenance invocation" >&2
            exec "$CLAUDE_BIN" -p "/maintenance" \
                --model opus \
                --dangerously-skip-permissions
        fi
        run_governed '{"mode":"maintenance","bound":{"relateResearch":30,"relateBookmark":20,"digest":5,"signal":5,"health":5,"researchGap":5,"retrospective":5,"framing":5,"classifyExposure":5,"reUnderwriteDue":5},"dryRun":false}'
        ;;
    shadow)
        run_governed '{"mode":"maintenance","bound":{"maxItemsTotal":1,"relateResearch":1,"relateBookmark":1,"digest":1,"signal":1,"health":1,"researchGap":1,"retrospective":1,"framing":1,"classifyExposure":1,"reUnderwriteDue":1},"dryRun":true}'
        ;;
    canary)
        run_governed '{"mode":"maintenance","bound":{"maxItemsTotal":1,"relateResearch":1,"relateBookmark":1,"digest":1,"signal":1,"health":1,"researchGap":1,"retrospective":1,"framing":1,"classifyExposure":1,"reUnderwriteDue":1},"dryRun":false}'
        ;;
    legacy-shadow)
        # The previous entry point, constrained to the same read-only shadow
        # envelope for comparison. This is never selected by launchd.
        exec "$CLAUDE_BIN" -p "/maintenance\n\nShadow validation only. Read the maintenance dashboard, process no more than one candidate in planning only, perform no writes or cursor advance, and return the governed maintenance result object." \
            --model opus \
            --dangerously-skip-permissions \
            --no-session-persistence \
            --output-format json
        ;;
    *)
        echo "usage: $0 [live|shadow|canary|legacy-shadow]" >&2
        exit 64
        ;;
esac
