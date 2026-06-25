# HEADLESS MODE — Relate Bookmark

You are running in **HEADLESS / AUTONOMOUS** mode (e.g. a Codex cron fallback). Do NOT ask for user
input or confirmation. Make sensible default choices; if information is ambiguous, state your
assumption and continue.

## Environment setup

Run before any database access:

```bash
cd /Users/home-hub/projects/trade-journal
set -a && source .env.local && set +a
```

## Instructions

Follow the full skill procedure in `SKILL.md` exactly, with these overrides:

- Skip any interactive refinement / confirmation / specificity dialogue steps — proceed with your best judgment.
- Never block on user input; surface decisions to `journal_entries` or stdout instead of asking.
- Use repo scripts for all DB access: `scripts/psql-query.ts` (reads), `scripts/ops/*` (writes).

## Output contract

End with a single-line JSON summary:

```json
{ "success": true, "skill": "relate-bookmark", "summary": "<what changed>", "writes": [] }
```

On failure: `{ "success": false, "error": "<message>" }`

---

_This is a generic baseline preamble (auto-generated). Replace it with a bespoke execution contract
when wiring relate-bookmark into an actual headless cron. The full skill instructions follow in `SKILL.md`._
