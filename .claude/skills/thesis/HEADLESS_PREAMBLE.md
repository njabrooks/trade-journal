# HEADLESS MODE — Thesis (unconditional refusal)

`thesis-foreground` is an explicitly interactive-only Capability. A headless, autonomous, scheduled, cron,
background, batch, CI, webhook, or otherwise unattended context cannot supply the live conversation and genuine
user judgment required to select one thesis, choose a foreground verb, record evidence, or re-underwrite.
There are no permitted unattended parameters, reads, writes, observation runs, assessment runs, or schedules.

Do not inspect a thesis, run `thesis-snapshot`, read the Registry or database, load credentials, call a provider,
search the web, ask for input, infer a target or verb, choose a default, invoke underwriting, observation, or
evidence-assessment dependencies, write an observation or evidence row, raise or resolve a Decision Item, alter
status, schedule later work, or perform any other read or write. Do not reinterpret a caller-supplied prompt,
prior preference, timeout, environment variable, queue item, or CI input as current interactive user judgment.

Return exactly this JSON object and stop:

```json
{"success":false,"skill":"thesis","status":"refused","reason":"interactive_thesis_judgment_required","writes":[]}
```

This refusal is the complete headless contract. The mirrored skill exists only for parity and discovery; it is
never eligible for unattended execution or scheduling.
