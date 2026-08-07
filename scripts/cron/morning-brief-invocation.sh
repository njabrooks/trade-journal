#!/usr/bin/env bash
# Governed/legacy selector for the morning-brief launchd consumer.
set -euo pipefail

TJ_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_BIN="${TJ_MORNING_BRIEF_CLAUDE_BIN:-/opt/homebrew/bin/claude}"
DATE_BIN="${TJ_MORNING_BRIEF_DATE_BIN:-/bin/date}"
ADAPTER_PATH="$TJ_REPO_ROOT/capabilities/morning-attention-brief/adapters/claude.md"
EXPECTED_ADAPTER_DIGEST="386b1b3673b3056cc0112bc880baa77ea2d39d6acc61b9ad1fa3461472cd694f"
RUN_MODE="${1:-live}"
ROLLBACK_MARKER="${TJ_MORNING_BRIEF_ROLLBACK_MARKER:-$TJ_REPO_ROOT/logs/.morning-brief-use-legacy}"
BRIEF_DATE="$(TZ=Europe/London "$DATE_BIN" +%F)"

if [ -f "$TJ_REPO_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$TJ_REPO_ROOT/.env.local"
    set +a
fi

run_legacy() {
    exec "$CLAUDE_BIN" -p "/morning-brief" --model opus --dangerously-skip-permissions
}

governed_prompt() {
    local request="$1" guard="$2"
    printf '%s\n' \
        "Execute the governed Trade Journal Provider Adapter at capabilities/morning-attention-brief/adapters/claude.md." \
        "Treat that adapter and its locked Capability contract as authoritative; do not enter through slash-command discovery." \
        "Request: $request" \
        "Use only npx tsx scripts/morning-brief-data.ts --json as evidence. Honor its upstream timestamps and stale flags; do not browse, re-query, or fill gaps with assumptions." \
        "Never write journal_entries, raise or resolve a Decision Item, save advisor recommendations, or mutate a thesis, claim, signal, strategy, position, or status." \
        "When persistence is permitted, invoke only npx tsx scripts/ops/save-morning-brief.ts --stdin, exactly once, with briefDate=$BRIEF_DATE and at most five attention items." \
        "$guard" \
        "Return only the governed result object."
}

run_governed() {
    local request="$1" guard="$2" actual
    actual="$(/usr/bin/shasum -a 256 "$ADAPTER_PATH" | /usr/bin/awk '{print $1}')"
    if [ "$actual" != "$EXPECTED_ADAPTER_DIGEST" ]; then
        echo "governed morning-attention-brief adapter digest mismatch" >&2
        return 65
    fi
    local schema='{"type":"object","additionalProperties":false,"properties":{"success":{"type":"boolean"},"briefDate":{"type":"string"},"freshness":{"type":"object","additionalProperties":true},"headline":{"type":"string"},"attention":{"type":"array","maxItems":5,"items":{"type":"object","additionalProperties":false,"properties":{"rank":{"type":"integer"},"title":{"type":"string"},"why":{"type":"string"},"deepLink":{"type":"string"}},"required":["rank","title","why","deepLink"]}},"persisted":{"type":"boolean"},"write":{"anyOf":[{"type":"object","additionalProperties":true},{"type":"null"}]},"unavailableInputs":{"type":"array","items":{"type":"string"}},"errors":{"type":"array","items":{"type":"string"}}},"required":["success","briefDate","freshness","headline","attention","persisted","write","unavailableInputs","errors"]}'
    exec "$CLAUDE_BIN" -p "$(governed_prompt "$request" "$guard")" --model opus \
        --dangerously-skip-permissions --no-session-persistence --output-format json --json-schema "$schema"
}

case "$RUN_MODE" in
    live)
        if [ -f "$ROLLBACK_MARKER" ]; then run_legacy; fi
        run_governed "{\"briefDate\":\"$BRIEF_DATE\",\"dryRun\":false}" "LIVE: persist exactly one same-date upsert and report its returned id/date/superseded result."
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
    *) echo "usage: $0 [live|shadow|canary|legacy-shadow]" >&2; exit 64 ;;
esac
