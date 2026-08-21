#!/usr/bin/env bash
# Governed provider invocation for the thesis-observe launchd job.
#
# Default: digest-bound Codex adapter (capabilities/thesis-observation/adapters/codex.md).
# Operator validation sequence (do not run from this script / launchd):
#   shadow → canary → live
#
# Rollback tonight without a launchd reload (marker files, checked at invocation):
#   touch logs/.thesis-observe-use-claude   # current governed Claude adapter (digest-bound claude.md)
#   touch logs/.thesis-observe-use-legacy   # former slash-command /thesis-observe
# If both markers exist, the Claude governed marker wins (safer than slash-command).
# Env overrides: TJ_THESIS_OBSERVE_CLAUDE_MARKER, TJ_THESIS_OBSERVE_ROLLBACK_MARKER.
set -euo pipefail

TJ_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CODEX_BIN="${TJ_THESIS_OBSERVE_CODEX_BIN:-/Users/home-hub/.local/bin/codex}"
CODEX_MODEL="${TJ_THESIS_OBSERVE_CODEX_MODEL:-gpt-5.6-terra}"
CLAUDE_BIN="${TJ_THESIS_OBSERVE_CLAUDE_BIN:-/opt/homebrew/bin/claude}"
CODEX_ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/thesis-observation/adapters/codex.md"
CLAUDE_ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/thesis-observation/adapters/claude.md"
CLAUDE_MARKER="${TJ_THESIS_OBSERVE_CLAUDE_MARKER:-$TJ_REPO_ROOT/logs/.thesis-observe-use-claude}"
ROLLBACK_MARKER="${TJ_THESIS_OBSERVE_ROLLBACK_MARKER:-$TJ_REPO_ROOT/logs/.thesis-observe-use-legacy}"
EXPECTED_CODEX_ADAPTER_DIGEST="20e4586623451c88c16deee0bc6add22bcf7281a4a8e908972705a8ff5f2938a"
EXPECTED_CLAUDE_ADAPTER_DIGEST="c6eb5237932881cd801aae3e55bd20fab541ff247e92e3b4a88c6faada2029ca"
RUN_MODE="${1:-live}"
# Codex 0.147 `exec --help` documents --output-schema FILE (JSON Schema for the
# model's final response). Proven from help text only; no live `codex exec` probe.
RESULT_SCHEMA='{"type":"object","additionalProperties":false,"properties":{"success":{"type":"boolean"},"asOf":{"type":"string"},"thesesObserved":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"thesisId":{"type":"string"},"title":{"type":"string"}},"required":["thesisId","title"]}},"signalsAssessed":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"signalId":{"type":"string"},"thesisId":{"type":"string"}},"required":["signalId","thesisId"]}},"directives":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"kind":{"type":"string"},"path":{"type":"string"}},"required":["kind","path"]}},"writes":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"kind":{"type":"string"},"target":{"type":"string"}},"required":["kind","target"]}},"unavailableInputs":{"type":"array","items":{"type":"string"}},"errors":{"type":"array","items":{"type":"string"}}},"required":["success","asOf","thesesObserved","signalsAssessed","directives","writes","unavailableInputs","errors"]}'

if [ "${TJ_THESIS_OBSERVE_SKIP_ENV:-0}" != "1" ] && [ -f "$TJ_REPO_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$TJ_REPO_ROOT/.env.local"
    set +a
fi

adapter_digest() {
    /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

governed_prompt() {
    local adapter_rel="$1"
    local request="$2"
    local read_only="$3"
    printf '%s\n' \
        "Execute the governed Trade Journal Provider Adapter at $adapter_rel." \
        "Treat that adapter and its locked Capability contract as authoritative; do not enter through slash-command discovery." \
        "Request: $request" \
        "Honor maxTheses as a hard maximum. Never resolve or raise a Decision Item, invoke scripts/ops/update-entity-status.ts, or change thesis, strategy, claim, or signal status." \
        "For any live or canary ingestion, invoke scripts/ingest-world-monitor.ts with --thesis-observe-only; refuse a path that would write intel_items." \
        "$read_only" \
        "Do not commit to git. Return only the adapter result object and report unavailable current sources honestly."
}

write_schema_file() {
    local schema_file
    schema_file="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/thesis-observe-schema.XXXXXX")"
    printf '%s\n' "$RESULT_SCHEMA" > "$schema_file"
    printf '%s' "$schema_file"
}

run_governed_codex() {
    local request="$1"
    local read_only="$2"
    local actual_digest
    actual_digest="$(adapter_digest "$CODEX_ADAPTER_PATH")"
    if [ "$actual_digest" != "$EXPECTED_CODEX_ADAPTER_DIGEST" ]; then
        echo "governed thesis-observation Codex adapter digest mismatch: expected $EXPECTED_CODEX_ADAPTER_DIGEST, got $actual_digest" >&2
        return 65
    fi

    local schema_file
    schema_file="$(write_schema_file)"
    # Least-privilege unattended equivalent of the former Claude
    # --dangerously-skip-permissions: --approve-for-me (implies workspace-write; Codex 0.147 rejects combining it
    # with --sandbox). Full --dangerously-bypass-approvals-and-sandbox is not required
    # for the sensing-only --thesis-observe-only write boundary.
    exec "$CODEX_BIN" exec --ephemeral -C "$TJ_REPO_ROOT" \
        -m "$CODEX_MODEL" \
        --approve-for-me \
        --output-schema "$schema_file" \
        "$(governed_prompt "capabilities/thesis-observation/adapters/codex.md" "$request" "$read_only")"
}

run_governed_claude() {
    local request="$1"
    local read_only="$2"
    local actual_digest
    actual_digest="$(adapter_digest "$CLAUDE_ADAPTER_PATH")"
    if [ "$actual_digest" != "$EXPECTED_CLAUDE_ADAPTER_DIGEST" ]; then
        echo "governed thesis-observation Claude adapter digest mismatch: expected $EXPECTED_CLAUDE_ADAPTER_DIGEST, got $actual_digest" >&2
        return 65
    fi

    exec "$CLAUDE_BIN" -p "$(governed_prompt "capabilities/thesis-observation/adapters/claude.md" "$request" "$read_only")" \
        --model opus \
        --dangerously-skip-permissions \
        --no-session-persistence \
        --output-format json \
        --json-schema "$RESULT_SCHEMA"
}

run_governed() {
    if [ -f "$CLAUDE_MARKER" ]; then
        run_governed_claude "$1" "$2"
    else
        run_governed_codex "$1" "$2"
    fi
}

AS_OF="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
case "$RUN_MODE" in
    live)
        if [ -f "$CLAUDE_MARKER" ]; then
            echo "thesis-observe Claude marker present; using governed Claude adapter" >&2
            run_governed_claude "{\"asOf\":\"$AS_OF\",\"maxTheses\":14}" "Use only the adapter's sensing-only write boundary."
        fi
        if [ -f "$ROLLBACK_MARKER" ]; then
            echo "thesis-observe rollback marker present; using legacy /thesis-observe invocation" >&2
            exec "$CLAUDE_BIN" -p "/thesis-observe" --model opus --dangerously-skip-permissions
        fi
        run_governed_codex "{\"asOf\":\"$AS_OF\",\"maxTheses\":14}" "Use only the adapter's sensing-only write boundary."
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
