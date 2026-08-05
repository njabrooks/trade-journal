# Workspace Standard v1 repository adoption

This record accompanies `workspace-manifest.json` for Trade Journal issue #35. It records the deterministic
validation seam and remaining J1 boundary; it does not establish Adapter Conformance or final J1 acceptance.

## Pinned validator

- Workspace Standard: `1.0.0`
- Workspace repository: `github:njabrooks/projects`
- Accepted revision: `2b6ea3e02ff5ba114b0f91dd779c4afb26181358`
- Governed evidence date: `2026-08-04`

Validation is run from a clean detached checkout at that exact revision:

```console
./workspace validate repository /absolute/path/to/trade-journal
./workspace validate repository /absolute/path/to/trade-journal --format json
GITHUB_TOKEN=<read-only-token> \
  ./workspace validate repository /absolute/path/to/trade-journal --validate-tracker --format json
```

The repository-root `./workspace` command is a small fail-closed launcher, not a vendored Workspace CLI. It
requires `WORKSPACE_REPOSITORY_ROOT` (or the local parent Workspace checkout) to be clean and at the exact
accepted revision and verifies the accepted CLI Git blob before execution. CI acquires that checkout with a
Trade-Journal-specific read-only deploy key; the key cannot write to the Workspace repository. The normal
job-scoped `GITHUB_TOKEN` remains responsible only for authenticated read access to Trade Journal's own live
tracker metadata.

This acquisition mechanism is an explicit first-wave interim choice. Workspace issue
`njabrooks/projects#31` owns the future specification for a canonical CLI distribution and downstream
acquisition model, including migration of the different interim approaches used by Notes, Threadline, and
Trade Journal.

The unauthenticated human and JSON reports are conformant with zero diagnostics and zero active deviations.
Repeated JSON runs are byte-identical. The authenticated live GitHub check passes both the repository-manifest
and `github-tracker` checks. When credentials are deliberately absent, the tracker check is `unavailable` with
reason `credentials-unavailable`, the outcome is nonconformant, and the CLI does not report success.

## Declared boundary

The manifest declares GitHub Issues in `njabrooks/trade-journal` as the repository Work Item authority and
uses the accepted native-first hierarchy/dependency policy. The five canonical labels map to their same-named
live labels; unrelated labels remain a namespaced extension. The live `needs-triage` description was aligned to
the exact canonical Work Item meaning during adoption.

The manifest declares no owned Capability Packages because Trade Journal has not authored any. It declares
only repository-owned interactive and headless sources that #33/#34 classified as Capability candidates.
Archived, retired, and deprecated non-candidates plus the external machine-local Codex bridge remain visible
in a namespaced extension. Rich inventory validity, mirror parity, and file presence do not establish Adapter
Conformance; every inventory evidence state remains `unavailable`.

## Generation eligibility and refusal

`docs/agents/provider-adapters/generation-eligibility.json` deterministically projects all 73 interactive and
headless inventory entries. At governed evidence date `2026-08-04`, it records zero generation-eligible
adapters and no governed outputs. Existing `CLAUDE.md`, `AGENTS.md`, `.claude/skills/`, `.agents/skills/`, and
the machine-local bridge remain non-governed migration inputs.

The controlled refusal harness was executed in human and JSON modes against a clean detached Workspace
checkout at accepted revision `2b6ea3e02ff5ba114b0f91dd779c4afb26181358`:

```console
npx tsx scripts/ops/prove-provider-entry-point-refusal.ts \
  --workspace-root /private/tmp/workspace-w1-accepted
npx tsx scripts/ops/prove-provider-entry-point-refusal.ts \
  --workspace-root /private/tmp/workspace-w1-accepted --format json
```

The temporary controlled fixture resolved a publication-eligible immutable Registry Lock containing one
environmentally `unavailable` adapter. W1 generation exited `1` with `WS-ENTRY-005` on both attempts, returned
byte-identical diagnostics, and left the governed output absent. The harness removed the temporary fixture.
It did not add a Capability Package, evidence record, Registry, lock, or Provider Entry Point to Trade Journal.

## J1 acceptance boundary

- #37 publishes the final evidence in `evidence/j1-acceptance.md`. Its completion claim is repository
  conformance, exhaustive inventory, zero generation eligibility, and deterministic W1 no-write refusal—not
  clean generation. The tracker records the evidence-publication revision after merge so this file does not
  claim to validate its own commit.
- J2 or the accountable source authority owns Capability authoring, exact adapter evaluation, immutable
  Registry locking, and Provider Entry Point generation one Capability boundary at a time.

No product code, Provider Adapter implementation, scheduled job, model, prompt, permission, or runtime
behaviour changes in this adoption slice.
