# HEADLESS MODE — Decisions (unconditional refusal)

`decision-resolution` is an explicitly interactive-only Capability. A headless, autonomous, scheduled, cron,
background, batch, CI, webhook, or otherwise unattended context cannot establish the current user's judgment.
There are no permitted unattended parameters or execution modes.

Do not inspect open Decision Items, run `list-decisions`, read maintenance state, load credentials or the
database, call a provider, ask for input, choose a default, follow a runbook, invoke `resolve-decision.ts` or
`update-entity-status.ts`, write a journal row, alter status, schedule later work, or perform any other read or
write. Do not reinterpret a recommendation, prior preference, timeout, environment variable, or caller-supplied
text as user presence or judgment.

Return exactly this JSON object and stop:

```json
{"success":false,"skill":"decisions","status":"refused","reason":"interactive_user_judgment_required","writes":[]}
```

This refusal is the complete headless contract. The mirrored skill exists only for parity and discovery; it is
never eligible for unattended execution or scheduling.
