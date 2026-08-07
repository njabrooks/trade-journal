#!/usr/bin/env bash
# Governed/legacy selector for the two options-advisor launchd consumers.
set -euo pipefail

TJ_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_BIN="${TJ_OPTIONS_ADVISOR_CLAUDE_BIN:-/opt/homebrew/bin/claude}"
DATE_BIN="${TJ_OPTIONS_ADVISOR_DATE_BIN:-/bin/date}"
NC_BIN="${TJ_OPTIONS_ADVISOR_NC_BIN:-/usr/bin/nc}"
LEAP_ENGINE_BIN="${TJ_OPTIONS_ADVISOR_LEAP_ENGINE_BIN:-$TJ_REPO_ROOT/node_modules/.bin/tsx}"
ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/portfolio-options-advice/adapters/claude.md"
EXPECTED_ADAPTER_DIGEST="4fe912e48492cf4fc3d65649a169cf380b831d4fb919039cd15a34351ab80e38"
MODE="${1:-batch}"
RUN_MODE="${2:-live}"
ROLLBACK_MARKER="${TJ_OPTIONS_ADVISOR_ROLLBACK_MARKER:-$TJ_REPO_ROOT/logs/.options-advisor-${MODE}-use-legacy}"

if [ -f "$TJ_REPO_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$TJ_REPO_ROOT/.env.local"
    set +a
fi

legacy_prompt() {
    case "$1" in
        batch) printf '%s' "Scheduled morning batch run. Scenarios: hedge, income, collar, put_entry, risk_reversal, opportunistic (NOT leap_entry — it has its own afternoon job). Read the latest regime_snapshots first and let the regime shape the judgment. Live-verify chosen structures via IB (delayed data is fine) before saving. Save a batch ONLY for scenarios with genuine recommendations — an empty scenario saves nothing rather than filler. Respect all standing constraints (e.g. GLXY no downside hedges below mid-\$40s)." ;;
        leap) printf '%s' "Scheduled leap_entry run. Run the leap_entry scenario (scripts/options-advisor.ts --scenario leap_entry), judge per the leap doctrine (thesis expression not vol arbitrage; avgHvGap persistence; existing-expression guard; liquidity floor), and save the batch only if there are genuine candidates. Check the gateway is up first (nc -z localhost 4001); if it is down, log and exit without saving." ;;
    esac
}

run_legacy() {
    exec "$CLAUDE_BIN" -p "/options-advisor $(legacy_prompt "$MODE")" --model opus --dangerously-skip-permissions
}

governed_prompt() {
    local request="$1"
    local guard="$2"
    printf '%s\n' \
        "Execute the governed Trade Journal Provider Adapter at capabilities/portfolio-options-advice/adapters/claude.md." \
        "Treat that adapter and its locked Capability contract as authoritative; do not enter through slash-command discovery." \
        "Request: $request" \
        "Honor every scenario/ticker filter and maxRecommendations as hard limits." \
        "Never call an order, trade, execution, preview, staging, or broker mutation operation. Persist only through scripts/ops/save-advisor-recommendations.ts --stdin." \
        "$guard" \
        "Return only the governed result object. Empty candidates or unavailable verification must produce writes:[] and no fabricated recommendation."
}

run_governed() {
    local request="$1" guard="$2" actual
    actual="$(/usr/bin/shasum -a 256 "$ADAPTER_PATH" | /usr/bin/awk '{print $1}')"
    if [ "$actual" != "$EXPECTED_ADAPTER_DIGEST" ]; then
        echo "governed portfolio-options-advice adapter digest mismatch" >&2
        return 65
    fi
    local schema='{"type":"object","additionalProperties":false,"properties":{"success":{"type":"boolean"},"mode":{"type":"string"},"regime":{},"candidates":{"type":"array"},"recommendations":{"type":"array"},"verification":{"type":"array"},"writes":{"type":"array"},"skipped":{"type":"array"},"unavailableInputs":{"type":"array"},"errors":{"type":"array"}},"required":["success","mode","regime","candidates","recommendations","verification","writes","skipped","unavailableInputs","errors"]}'
    "$CLAUDE_BIN" -p "$(governed_prompt "$request" "$guard")" --model opus \
        --dangerously-skip-permissions --no-session-persistence --output-format json --json-schema "$schema"
}

LEAP_SCAN_FILE=""
cleanup_leap_scan() {
    if [ -n "$LEAP_SCAN_FILE" ] && [ -f "$LEAP_SCAN_FILE" ]; then /bin/rm -f "$LEAP_SCAN_FILE"; fi
}

prepare_leap_scan() {
    local max_tickers="$1"
    LEAP_SCAN_FILE="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/trade-journal-leap.XXXXXX")"
    trap cleanup_leap_scan EXIT
    if ! "$LEAP_ENGINE_BIN" "$TJ_REPO_ROOT/scripts/options-advisor.ts" --scenario leap_entry --max-tickers "$max_tickers" > "$LEAP_SCAN_FILE"; then
        echo "LEAP failure: canonical candidate engine exited non-zero; no provider call or write." >&2
        return 1
    fi
    if [ ! -s "$LEAP_SCAN_FILE" ]; then
        echo "LEAP failure: canonical candidate engine returned no result; no provider call or write." >&2
        return 1
    fi
}

leap_preflight() {
    local weekday clock
    weekday="$(TZ=America/New_York "$DATE_BIN" +%u)"
    clock="$(TZ=America/New_York "$DATE_BIN" +%H%M)"
    if [ "$weekday" -gt 5 ] || [ "$clock" -lt 0930 ] || [ "$clock" -ge 1600 ]; then
        echo "LEAP refusal: US options market hours are not eligible (${clock} ET, weekday ${weekday}); no provider call or write." >&2
        return 1
    fi
    if ! "$NC_BIN" -z localhost 4001 >/dev/null 2>&1; then
        echo "LEAP refusal: Radon-managed IB Gateway is unavailable on localhost:4001; no provider call or write." >&2
        return 1
    fi
}

if [ "$MODE" = "leap" ]; then
    case "$RUN_MODE" in
        live)
            if [ -f "$ROLLBACK_MARKER" ]; then run_legacy; fi
            if ! leap_preflight; then exit 0; fi
            if ! prepare_leap_scan 10; then exit 70; fi
            run_governed "{\"mode\":\"leap\",\"scenarioFilters\":[\"leap_entry\"],\"maxRecommendations\":5,\"candidateUniverseMaxTickers\":10,\"candidateInputPath\":\"$LEAP_SCAN_FILE\"}" "The selector already ran the canonical LEAP engine synchronously. Read candidateInputPath; do not rerun or background the engine, and do not return before judging its complete result. Use the governed recommendation-only write boundary. Save only genuine LEAP recommendations that pass persistence, existing-expression, liquidity, and live/delayed quote verification."
            exit 0
            ;;
        shadow)
            if ! leap_preflight; then exit 0; fi
            if ! prepare_leap_scan 2; then exit 70; fi
            run_governed "{\"mode\":\"leap\",\"scenarioFilters\":[\"leap_entry\"],\"maxRecommendations\":1,\"candidateUniverseMaxTickers\":2,\"candidateInputPath\":\"$LEAP_SCAN_FILE\"}" "The selector already ran the canonical LEAP engine synchronously. Read candidateInputPath; do not rerun or background the engine, and do not return before judging its complete result. READ-ONLY SHADOW: cover genuine-candidate and no-candidate judgments, persistence, existing-expression, liquidity, and live/delayed verification, but do not invoke the save operation or make any mutation; writes must be empty."
            exit 0
            ;;
        canary)
            if ! leap_preflight; then exit 0; fi
            if ! prepare_leap_scan 1; then exit 70; fi
            run_governed "{\"mode\":\"leap\",\"scenarioFilters\":[\"leap_entry\"],\"maxRecommendations\":1,\"candidateUniverseMaxTickers\":1,\"candidateInputPath\":\"$LEAP_SCAN_FILE\"}" "The selector already ran the canonical LEAP engine synchronously. Read candidateInputPath; do not rerun or background the engine, and do not return before judging its complete result. CANARY: persist at most one genuine LEAP recommendation batch only after persistence, existing-expression, liquidity, and live/delayed quote verification; if none survives, write nothing."
            exit 0
            ;;
        legacy-shadow)
            if ! leap_preflight; then exit 0; fi
            exec "$CLAUDE_BIN" -p "/options-advisor $(legacy_prompt leap) Read-only shadow: compare genuine-candidate and no-candidate outcomes with at most one proposed recommendation, but do not save, trade, preview, stage, or mutate anything. Return the governed portfolio-options-advice result object." --model opus --dangerously-skip-permissions --no-session-persistence --output-format json
            ;;
        *) echo "usage: $0 leap [live|shadow|canary|legacy-shadow]" >&2; exit 64 ;;
    esac
fi

if [ "$MODE" != "batch" ]; then echo "usage: $0 batch|leap [live|shadow|canary]" >&2; exit 64; fi

case "$RUN_MODE" in
    live)
        if [ -f "$ROLLBACK_MARKER" ]; then run_legacy; fi
        run_governed '{"mode":"morning-batch","scenarioFilters":["hedge","income","collar","put_entry","risk_reversal","opportunistic"],"maxRecommendations":5}' "Use the governed recommendation-only write boundary."
        ;;
    shadow)
        run_governed '{"mode":"morning-batch","scenarioFilters":["hedge","income","collar","put_entry","risk_reversal","opportunistic"],"maxRecommendations":1}' "READ-ONLY SHADOW: compare all six scenario paths, regime, chains, portfolio, constraints, and verification, but do not invoke the save operation or make any mutation; writes must be empty."
        ;;
    canary)
        run_governed '{"mode":"morning-batch","scenarioFilters":["opportunistic"],"maxRecommendations":1}' "CANARY: persist at most one genuine, successfully verified recommendation batch; if none survives, write nothing."
        ;;
    legacy-shadow)
        exec "$CLAUDE_BIN" -p "/options-advisor $(legacy_prompt batch) Read-only shadow: compare all six scenarios with at most one proposed recommendation per scenario, but do not save, trade, preview, stage, or mutate anything. Return the governed portfolio-options-advice result object." --model opus --dangerously-skip-permissions --no-session-persistence --output-format json
        ;;
    *) echo "usage: $0 batch [live|shadow|canary|legacy-shadow]" >&2; exit 64 ;;
esac
