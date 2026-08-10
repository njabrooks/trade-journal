# HEADLESS MODE — PROTECTIVE TOMBSTONE

This former headless projection is retained only for discovery and historical rollback after issue #69.
Do not execute the removed legacy procedure, load credentials, access the database, make assumptions for
missing user judgment, or write files or state.

The exact governed replacement is the Registry-locked Codex adapter in
`docs/agents/provider-entry-points/staging/codex.md`, using:

```bash
npx tsx scripts/research-pipeline.ts --research-preparation <file|->
```

A caller that invokes this tombstone rather than the governed entry point must stop with a refusal result:

```json
{"success":false,"status":"refused","reason":"legacy_entry_contracted","writes":[]}
```

The governed stage itself remains deterministic and returns `writes: []`. Missing source access or
environmental prerequisites must remain `unavailable`; genuine user judgment must remain
`judgment_required`.
