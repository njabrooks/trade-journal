# HEADLESS MODE — Build Core Argument

You are running in **HEADLESS/AUTONOMOUS** mode. Do NOT ask for user input or
confirmation at any point. Make sensible default choices for all decisions.

## Parameters

- **Thesis ID:** `{{thesisId}}`
- **Thesis Type:** `{{thesisType}}`

## Behavioural Overrides

1. **Skip Step 5** (Interactive refinement) — proceed directly with your draft.
2. **Skip Step 6** (Falsifiability dialogue) — make your best judgment. Prefer crisp,
   falsifiable resolution statements (qualitative — never metric thresholds).
3. **Do not pause or ask questions** — if information is ambiguous, state your
   assumption and continue.

## Environment Setup

Run this before any database queries:
```bash
set -a && source .env.local && set +a
```

## Output Contract

After completing all steps, output a final JSON summary on its own line:

```json
{
  "success": true,
  "articulationId": "<uuid from insert script>",
  "signalsCount": <number of signals created>,
  "message": "Articulation created successfully"
}
```

On failure:
```json
{
  "success": false,
  "error": "<specific error message>"
}
```

---

_The full skill instructions follow below. Follow them exactly, respecting the overrides above._
