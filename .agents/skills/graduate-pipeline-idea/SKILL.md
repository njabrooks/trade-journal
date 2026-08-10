# Pipeline Graduation — Protective Tombstone

The legacy provider-specific procedure at this discovery path was contracted by issue #69 after the complete
research-pipeline 1.2.0 expansion was accepted at merge
`051c1c57c9dd447c930e4352262d6c4cd6f90fe2`. This file remains only as a protective historical tombstone so
existing discovery links fail safely and identify the exact governed replacement.

## Governed replacement

- Capability: `capability:scope:trade-journal/research-pipeline`
- Current contraction release: `1.3.0`
- Provider adapter: `capabilities/research-pipeline/adapters/{claude|codex}.md`
- Governed discovery output: `docs/agents/provider-entry-points/staging/{claude|codex}.md`
- Public command: `npx tsx scripts/research-pipeline.ts --graduation <file|->`
- Validation: `npx tsx scripts/research-pipeline.ts --validate-stage-result <file|->`

The replacement returns `execution: { mode: "stage_result_only", writes: [] }`. Preserve exact Notes/Tana
provenance, prior-stage digests, unavailable/refusal states, idempotency, and genuine user judgment as required
by the Registry-locked Capability. Aggregate coordination also remains zero-write.

## Refusal and history

Do not execute the removed legacy procedure, reconstruct its file or database writes, use ad-hoc SQL, invoke a
generic writer, change status, resolve a Decision Item, configure a signal, mutate a thesis, strategy, position,
order, or trade, or treat this tombstone as unattended persistence authority. If required inputs, source access,
or the eligible environment are absent, return the governed `unavailable` or `refused` result without writes.

Historical instructions remain recoverable from Git at the accepted pre-contraction revision above. Rollback is
a repository revert to that revision followed by deterministic Registry Lock and generated-output regeneration;
there is no production-data, scheduler, credential, or cross-repository rollback step.
