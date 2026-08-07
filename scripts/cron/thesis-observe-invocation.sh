#!/usr/bin/env bash
# Governed provider invocation for the thesis-observe launchd job.
# Roll back to the exact former slash-command entry with:
#   touch logs/.thesis-observe-use-legacy
set -euo pipefail

TJ_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_BIN="${TJ_THESIS_OBSERVE_CLAUDE_BIN:-/opt/homebrew/bin/claude}"
ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/thesis-observation/adapters/claude.md"
ROLLBACK_MARKER="${TJ_THESIS_OBSERVE_ROLLBACK_MARKER:-$TJ_REPO_ROOT/logs/.thesis-observe-use-legacy}"
EXPECTED_ADAPTER_DIGEST="c6eb5237932881cd801aae3e55bd20fab541ff247e92e3b4a88c6faada2029ca"
RUN_MODE="${1:-live}"

if [ -f "$TJ_REPO_ROOT/.env.local" ]; then
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
    local read_only="$2"
    printf '%s\n' \
        "Execute the governed Trade Journal Provider Adapter at capabilities/thesis-observation/adapters/claude.md." \
        "Treat that adapter and its locked Capability contract as authoritative; do not enter through slash-command discovery." \
        "Request: $request" \
        "Honor maxTheses as a hard maximum. Never resolve or raise a Decision Item, invoke scripts/ops/update-entity-status.ts, or change thesis, strategy, claim, or signal status." \
        "For any live or canary ingestion, invoke scripts/ingest-world-monitor.ts with --thesis-observe-only; refuse a path that would write intel_items." \
        "$read_only" \
        "Do not commit to git. Return only the adapter result object and report unavailable current sources honestly."
}

run_governed() {
    local request="$1"
    local read_only="$2"
    local actual_digest
    actual_digest="$(adapter_digest)"
    if [ "$actual_digest" != "$EXPECTED_ADAPTER_DIGEST" ]; then
        echo "governed thesis-observation adapter digest mismatch: expected $EXPECTED_ADAPTER_DIGEST, got $actual_digest" >&2
        return 65
    fi

    local schema='{"type":"object","additionalProperties":false,"properties":{"success":{"type":"boolean"},"asOf":{},"thesesObserved":{"type":"array"},"signalsAssessed":{"type":"array"},"directives":{"type":"array"},"writes":{"type":"array"},"unavailableInputs":{"type":"array"},"errors":{"type":"array"}},"required":["success","asOf","thesesObserved","signalsAssessed","directives","writes","unavailableInputs","errors"]}'
    exec "$CLAUDE_BIN" -p "$(governed_prompt "$request" "$read_only")" \
        --model opus \
        --dangerously-skip-permissions \
        --no-session-persistence \
        --output-format json \
        --json-schema "$schema"
}

AS_OF="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
case "$RUN_MODE" in
    live)
        if [ -f "$ROLLBACK_MARKER" ]; then
            echo "thesis-observe rollback marker present; using legacy /thesis-observe invocation" >&2
            exec "$CLAUDE_BIN" -p "/thesis-observe" --model opus --dangerously-skip-permissions
        fi
        run_governed "{\"asOf\":\"$AS_OF\",\"maxTheses\":14}" "Use only the adapter's sensing-only write boundary."
        ;;
    shadow)
        run_governed "{\"asOf\":\"$AS_OF\",\"maxTheses\":1}" "READ-ONLY SHADOW: inspect and plan one due thesis but create no report, snapshot, journal row, file, or other mutation. Return proposed directives with writes empty."
        ;;
    canary)
        run_governed "{\"asOf\":\"$AS_OF\",\"maxTheses\":1}" "CANARY: observe at most one due thesis and use only the sensing-only report, signal_data_snapshots, and matching journal boundary."
        ;;
    legacy-shadow)
        exec "$CLAUDE_BIN" -p "/thesis-observe\n\nRead-only shadow validation. Inspect and plan at most one due thesis. Create no report, snapshot, journal row, file, status change, Decision Item, or git commit. Return the governed thesis-observation result object." \
            --model opus --dangerously-skip-permissions --no-session-persistence --output-format json
        ;;
    *)
        echo "usage: $0 [live|shadow|canary|legacy-shadow]" >&2
        exit 64
        ;;
esac
