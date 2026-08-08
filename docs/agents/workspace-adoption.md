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

The accepted J1 manifest declared no owned Capability Packages. J2 now declares six Trade Journal-owned
packages: portfolio snapshot, belief maintenance, thesis observation, thesis underwriting, portfolio options advice,
and morning attention brief. Archived, retired, and deprecated non-candidates plus the external machine-local Codex bridge
remain visible in a namespaced extension. Rich inventory validity, mirror parity, and file presence do not
establish Adapter Conformance; only exact W1-bound evidence upgrades an inventory entry.

## Generation eligibility and refusal

`docs/agents/provider-adapters/generation-eligibility.json` deterministically projects all 73 interactive and
headless inventory entries. The accepted J1 state at governed evidence date `2026-08-04` recorded zero
generation-eligible adapters and no governed outputs. At the J2 evidence date `2026-08-07`, six locked
Capabilities make 16 inventory entries generation eligible while the whole-file Claude and Codex outputs
remain staged. Existing `CLAUDE.md`, `AGENTS.md`, `.claude/skills/`, `.agents/skills/`, and the machine-local
bridge remain migration inputs until their separately governed cutovers.

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

## J2 incremental migration

Issue #47 adds the first source-owned Capability without changing J1's historical acceptance claim. The
portfolio-snapshot Capability is released from an immutable Trade Journal commit, resolved through a
published Registry Lock, and projected to governed Claude and Codex staging outputs. Both exact adapters have
current digest-bound evidence dated 2026-08-06. Existing provider discovery remains active until J2's final
cutover, and no scheduled job or database write path changes in this tracer slice.

Tickets #48, #50, #52, and #55 add belief-maintenance, thesis-observation, portfolio-options-advice, and
morning-attention-brief packages at one preserved publication revision. Their exact Claude and Codex adapters
have current evidence from structural boundary tests and bounded read-only environment probes. The immutable
Registry Lock and generated staging outputs include all five Capabilities. Live scheduler and provider
invocations remain unchanged pending the explicit approvals required by #49, #51, #53, #54, and #56.

Issue #57 adds the source-owned thesis-underwriting Capability at immutable revision
`d139934716d654b8608a1d591f96de572aefa467`. Its exact Claude and Codex adapters preserve the living-underwriting
contract—versioned articulation, provenance-bearing linked claims, rebuttal-derived qualitative signals, and no
thesis-status mutation—while remaining a staged discovery surface. Its eligible-environment evidence is limited
to a non-mutating articulation-command preflight; no provider invocation, database write, scheduler, or discovery
cutover occurred.

Issue #55's fixed-point review repair republishes the morning-attention-brief evidence at immutable revision
`be091a981fcac066102005e1512d845de362b7a0`. The real deterministic bundle emits timestamped freshness from
the thesis-observation, maintenance, and options-advice cron outcomes plus portfolio, decision, and calendar
observations. Both exact adapters must run the pure stdin/stdout freshness gate before synthesis; fresh bundles
remain eligible, while stale, failed, missing, or timestamp-less state is reported through `freshness`,
`unavailableInputs`, and `errors` and refuses synthesis and persistence without browsing, re-querying,
assumptions, provider invocation, or database access.

The accepted W1 CLI remains pinned through the existing exact-revision acquisition mechanism. Workspace
issue `njabrooks/projects#31` continues to own any future replacement for that interim acquisition design.

CI evaluates Capability and Provider Entry Point freshness against the runner's current UTC date. The
checked-in immutable Registry Lock remains independently reproducible at its recorded governed evidence date
of `2026-08-07`; CI resolves a temporary present-day lock before clean-regeneration validation so current
freshness is enforced without rewriting or making the published lock nondeterministic. A controlled public-CLI
proof also evaluates evidence on `2026-09-06`, after its `2026-09-05` expiry, and requires the adapter to become
`stale`, existing governed output validation to fail, regeneration to fail, and the absent target to remain
unwritten. The existing `WS-ENTRY-005` unavailable-support refusal remains a separate regression.
