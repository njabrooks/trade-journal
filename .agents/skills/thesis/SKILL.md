# /thesis — governed interactive foreground

This authored skill is a thin interactive migration shim. The semantic authority is
`capability:scope:trade-journal/thesis-foreground`; its exact provider adapter and the published Registry Lock
govern execution. Do not recover operations from older versions of this skill.

## Preflight before every read

Require the current user to be participating, one exact verb (`query`, `what-changed`, `observe`,
`assess-evidence`, or `re-underwrite`), and one exact macro or asset thesis. Refuse headless, autonomous,
scheduled, cron, background, batch, CI, webhook, timeout-default, or ambient execution before reading repository
or thesis state, loading the database, calling a provider, asking a follow-up question, or writing. Missing or
ambiguous verb or thesis also refuses before dependency invocation or writes.

Resolve the published Registry Lock and follow the exact Claude adapter at
`capabilities/thesis-foreground/adapters/claude.md`. Do not copy or widen dependency semantics here.

## Exact read surfaces

Resolve the thesis from the repository root with the read-only snapshot:

```bash
npx tsx scripts/ops/thesis-snapshot.ts --id <uuid> --type <asset|macro>
npx tsx scripts/ops/thesis-snapshot.ts --ticker <ticker>
npx tsx scripts/ops/thesis-snapshot.ts --title "<title>"
```

For `what-changed`, bind the result to the snapshot's latest articulation ID (or `none` when no articulation
exists) and use the purpose-built read-only delta surface:

```bash
npx tsx scripts/ops/thesis-delta.ts --id <uuid> --type <asset|macro> \
  --expected-articulation-id <articulation-uuid|none>
```

If the delta reports `stale`, re-resolve the snapshot and ask the user whether to continue against the changed
underwriting. A null baseline means current provenance-bearing claims and evidence are unbaselined, not newly
changed. Never substitute ad-hoc SQL.

## Governed dependency routing

- `query` and `what-changed` are read-only.
- `observe` delegates only to the Registry-resolved `thesis-observation` Claude adapter.
- `assess-evidence` delegates only to `belief-evidence-assessment`; it is read-only unless the current user
  explicitly requests its bounded recorder.
- `re-underwrite` requires the current user's explicit request, complete provenance and inputs, zero unlinked
  claims, resolved candidate-signal and signal-quality judgments, and delegates only to `thesis-underwriting`.

The foreground has no direct database authority. Its maximum writes are exactly those returned by the selected
dependency. It must not capture observations directly, create or resolve Decision Items, call legacy
`/build-core-argument` directly, create or link claims, configure signals, change status or confidence, drain
maintenance, propose or execute options/trades as a foreground verb, access credentials for convenience, or
create or modify a schedule or launchd definition. Route any separately chosen next move through governed
workflow discovery.
Research intake remains the separate governed `research-pipeline` Capability; this foreground neither invokes
its legacy routes nor treats research capture as a thesis verb.

Return the thesis ID and type, verb, baseline, dependency calls, provenance sources, result, limitations, current
user judgments, recording disposition, and exact writes. Never describe a refusal, unavailable dependency,
stale binding, incomplete input, non-zero command result, or partial write as success.
