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

## Remaining J1 work

- #36 owns any authored Registry/declaration and deterministic generated Provider Entry Point work. It must
  not project unavailable adapters or manufacture source-owned Capability Packages.
- #37 owns final acceptance evidence and the parent J1 close decision after all required generated surfaces
  and checks exist.

No product code, Provider Adapter implementation, scheduled job, model, prompt, permission, or runtime
behaviour changes in this adoption slice.

