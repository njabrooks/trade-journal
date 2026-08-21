#!/usr/bin/env bash
# Governed/legacy selector for the morning-brief launchd consumer.
#
# Default: digest-bound Codex adapter (capabilities/morning-attention-brief/adapters/codex.md).
# Operator validation sequence (do not run from this script / launchd):
#   shadow → canary → live
#
# Rollback tonight without a launchd reload (marker files, checked at invocation):
#   touch logs/.morning-brief-use-claude   # current governed Claude adapter (digest-bound claude.md)
#   touch logs/.morning-brief-use-legacy   # former slash-command /morning-brief
# If both markers exist, the Claude governed marker wins (safer than slash-command).
# Env overrides: TJ_MORNING_BRIEF_CLAUDE_MARKER, TJ_MORNING_BRIEF_ROLLBACK_MARKER.
set -euo pipefail

TJ_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CODEX_BIN="${TJ_MORNING_BRIEF_CODEX_BIN:-/Users/home-hub/.local/bin/codex}"
CODEX_MODEL="${TJ_MORNING_BRIEF_CODEX_MODEL:-gpt-5.6-luna}"
CLAUDE_BIN="${TJ_MORNING_BRIEF_CLAUDE_BIN:-/opt/homebrew/bin/claude}"
DATE_BIN="${TJ_MORNING_BRIEF_DATE_BIN:-/bin/date}"
CODEX_ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/morning-attention-brief/adapters/codex.md"
CLAUDE_ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/morning-attention-brief/adapters/claude.md"
EXPECTED_CODEX_ADAPTER_DIGEST="392151b5da990f7f3f407ddd46c6100072c58d58632cfc0b605cbf30724ba934"
EXPECTED_CLAUDE_ADAPTER_DIGEST="d84d2c175160b79ee612bbce054a4ee0dd5702932bf18e8864b147bdd55c63d3"
RUN_MODE="${1:-live}"
CLAUDE_MARKER="${TJ_MORNING_BRIEF_CLAUDE_MARKER:-$TJ_REPO_ROOT/logs/.morning-brief-use-claude}"
ROLLBACK_MARKER="${TJ_MORNING_BRIEF_ROLLBACK_MARKER:-$TJ_REPO_ROOT/logs/.morning-brief-use-legacy}"
BRIEF_DATE="$(TZ=Europe/London "$DATE_BIN" +%F)"
# Codex 0.147 `exec --help` documents --output-schema FILE (JSON Schema for the
# model's final response). Proven from help text only; no live `codex exec` probe.
RESULT_SCHEMA='{"type":"object","additionalProperties":false,"properties":{"success":{"type":"boolean"},"briefDate":{"type":"string"},"freshness":{"type":"object","additionalProperties":true},"headline":{"type":"string"},"attention":{"type":"array","maxItems":5,"items":{"type":"object","additionalProperties":false,"properties":{"rank":{"type":"integer"},"title":{"type":"string"},"why":{"type":"string"},"deepLink":{"type":"string"}},"required":["rank","title","why","deepLink"]}},"persisted":{"type":"boolean"},"write":{"anyOf":[{"type":"object","additionalProperties":true},{"type":"null"}]},"unavailableInputs":{"type":"array","items":{"type":"string"}},"errors":{"type":"array","items":{"type":"string"}}},"required":["success","briefDate","freshness","headline","attention","persisted","write","unavailableInputs","errors"]}'

if [ "$RUN_MODE" = "fixture" ]; then
    case "${2:-}" in
        stale-required-inputs.json|missing-required-inputs.json)
            FIXTURE_PATH="$TJ_REPO_ROOT/capabilities/morning-attention-brief/evidence/scenarios/$2"
            exec /usr/bin/env node --import tsx \
                "$TJ_REPO_ROOT/capabilities/morning-attention-brief/evaluate-inputs.ts" < "$FIXTURE_PATH"
            ;;
        *)
            echo "usage: $0 fixture [stale-required-inputs.json|missing-required-inputs.json]" >&2
            exit 64
            ;;
    esac
fi

if [ "${TJ_MORNING_BRIEF_SKIP_ENV:-0}" != "1" ] && [ -f "$TJ_REPO_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$TJ_REPO_ROOT/.env.local"
    set +a
fi

run_legacy() {
    exec "$CLAUDE_BIN" -p "/morning-brief" --model opus --dangerously-skip-permissions
}

governed_prompt() {
    local adapter_rel="$1"
    local request="$2"
    local guard="$3"
    printf '%s\n' \
        "Execute the governed Trade Journal Provider Adapter at $adapter_rel." \
        "Treat that adapter and its locked Capability contract as authoritative; do not enter through slash-command discovery." \
        "Request: $request" \
        "Use only npx tsx scripts/morning-brief-data.ts --json as evidence. Honor its upstream timestamps and stale flags; do not browse, re-query, or fill gaps with assumptions." \
        "Never write journal_entries, raise or resolve a Decision Item, save advisor recommendations, or mutate a thesis, claim, signal, strategy, position, or status." \
        "When persistence is permitted, invoke only npx tsx scripts/ops/save-morning-brief.ts --stdin, exactly once, with briefDate=$BRIEF_DATE and at most five attention items." \
        "$guard" \
        "Return only the governed result object."
}

write_schema_file() {
    local schema_file
    schema_file="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/morning-brief-schema.XXXXXX")"
    printf '%s\n' "$RESULT_SCHEMA" > "$schema_file"
    printf '%s' "$schema_file"
}

run_governed_codex() {
    local request="$1"
    local guard="$2"
    local actual
    actual="$(/usr/bin/shasum -a 256 "$CODEX_ADAPTER_PATH" | /usr/bin/awk '{print $1}')"
    if [ "$actual" != "$EXPECTED_CODEX_ADAPTER_DIGEST" ]; then
        echo "governed morning-attention-brief Codex adapter digest mismatch" >&2
        return 65
    fi
    local schema_file
    schema_file="$(write_schema_file)"
    # Least-privilege unattended equivalent of the former Claude
    # --dangerously-skip-permissions: workspace-write + --approve-for-me (Codex 0.147
    # exec --help). Full --dangerously-bypass-approvals-and-sandbox is not required
    # for the sole save-morning-brief.ts --stdin write.
    exec "$CODEX_BIN" exec --ephemeral -C "$TJ_REPO_ROOT" \
        -m "$CODEX_MODEL" \
        --sandbox workspace-write \
        --approve-for-me \
        --output-schema "$schema_file" \
        "$(governed_prompt "capabilities/morning-attention-brief/adapters/codex.md" "$request" "$guard")"
}

run_governed_claude() {
    local request="$1"
    local guard="$2"
    local actual
    actual="$(/usr/bin/shasum -a 256 "$CLAUDE_ADAPTER_PATH" | /usr/bin/awk '{print $1}')"
    if [ "$actual" != "$EXPECTED_CLAUDE_ADAPTER_DIGEST" ]; then
        echo "governed morning-attention-brief Claude adapter digest mismatch" >&2
        return 65
    fi
    exec "$CLAUDE_BIN" -p "$(governed_prompt "capabilities/morning-attention-brief/adapters/claude.md" "$request" "$guard")" --model opus \
        --dangerously-skip-permissions --no-session-persistence --output-format json --json-schema "$RESULT_SCHEMA"
}

run_governed() {
    if [ -f "$CLAUDE_MARKER" ]; then
        run_governed_claude "$1" "$2"
    else
        run_governed_codex "$1" "$2"
    fi
}

case "$RUN_MODE" in
    live)
        if [ -f "$CLAUDE_MARKER" ]; then
            echo "morning-brief Claude marker present; using governed Claude adapter" >&2
            run_governed_claude "{\"briefDate\":\"$BRIEF_DATE\",\"dryRun\":false}" "LIVE: persist exactly one same-date upsert and report its returned id/date/superseded result."
        fi
        if [ -f "$ROLLBACK_MARKER" ]; then
            run_legacy
        fi
        run_governed_codex "{\"briefDate\":\"$BRIEF_DATE\",\"dryRun\":false}" "LIVE: persist exactly one same-date upsert and report its returned id/date/superseded result."
        ;;
    shadow)
        run_governed "{\"briefDate\":\"$BRIEF_DATE\",\"dryRun\":true}" "READ-ONLY SHADOW: synthesize the complete brief and freshness decision, but do not invoke the save operation or any mutation; persisted must be false and write must be null."
        ;;
    canary)
        run_governed "{\"briefDate\":\"$BRIEF_DATE\",\"dryRun\":false}" "CANARY: perform exactly one same-date morning_briefs upsert through the sole permitted save operation; make no other mutation."
        ;;
    legacy-shadow)
        exec "$CLAUDE_BIN" -p "/morning-brief Read-only shadow for $BRIEF_DATE: gather the normal deterministic bundle and synthesize the complete brief, but do not invoke save-morning-brief or any other write. Return the governed morning-attention-brief result object with persisted=false and write=null." --model opus --dangerously-skip-permissions --no-session-persistence --output-format json
        ;;
    *) echo "usage: $0 [live|shadow|canary|legacy-shadow|fixture]" >&2; exit 64 ;;
esac
