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

The accepted J1 manifest declared no owned Capability Packages. J2 now declares eleven Trade Journal-owned
packages: portfolio snapshot, belief maintenance, belief-research relation, claims synthesis, thesis observation, thesis underwriting, belief evidence assessment,
research publication, research pipeline, portfolio options advice, and morning attention brief. Archived, retired, and deprecated non-candidates plus the external machine-local Codex bridge
remain visible in a namespaced extension. Rich inventory validity, mirror parity, and file presence do not
establish Adapter Conformance; only exact W1-bound evidence upgrades an inventory entry.

## Generation eligibility and refusal

`docs/agents/provider-adapters/generation-eligibility.json` deterministically projects all 73 interactive and
headless inventory entries. The accepted J1 state at governed evidence date `2026-08-04` recorded zero
generation-eligible adapters and no governed outputs. At the current J2 evidence date `2026-08-10`, eleven locked
Capabilities make 44 inventory entries generation eligible while the whole-file Claude and Codex outputs
remain staged. Existing `CLAUDE.md`, `AGENTS.md`, `.claude/skills/`, `.agents/skills/`, and the machine-local
bridge remain migration inputs until their separately governed cutovers, except for the twenty research-pipeline
paths contracted by #69 to protective tombstones with exact governed replacements.

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

Issue #58 adds the source-owned belief-evidence-assessment Capability at immutable revision
`81475f476d0705bd7e502e2244b2fc2ce41e8c5d`. It resolves thesis-underwriting through the Registry, binds each
assessment to the latest articulation and complete active linked signal set, and routes an explicitly requested
recording through one deterministic serializable recorder. Exact adapters preserve provenance, direct semantic
bearing, thesis-centric invalidation polarity, and neutral completeness while refusing broader database,
status, Decision Item, claim creation, signal configuration, strategy, position, trade, scheduler, or cutover
authority. Its environmental evidence is a non-mutating recorder preflight; no provider or live database write
was invoked.

Issue #62 adds the source-owned claims-synthesis Capability at immutable revision
`df1a2e3ed5860a0495f4461d747a06ea26d09aca`. It prepares one Notes-owned provenance-bearing research handoff
through deterministic repository reads and makes source evidence, exact existing claims, distinct synthesized
investment claims, and proposed thesis mappings structurally explicit. Exact provenance forces reuse across
claim lifecycle states; developing and monitoring theses remain eligible by direct semantic bearing; ambiguity
prevents mappings; and exact Claude/Codex adapters expose no promotion, linkage, status, Decision Item,
strategy, position, trade, SQL, Supabase MCP, or API mutation authority. Its semantic evidence uses an exact-
adapter-bound representative fixture; no live provider invocation, database mutation, scheduler, credential,
active discovery, or cutover occurred. A read-only environmental preflight returned a 1.9 MB context covering
four source claims, the complete current 2,146-claim identity catalog, and 73 eligible theses; this proves the
boundary but not live-provider latency or context efficiency.

Issue #63 adds the source-owned research-publication Capability. It resolves the immutable claims-synthesis
release as recommendation-only input, re-reads the complete current Notes-owned source and Trade Journal
claim/thesis context, excludes claim-identity and thesis-bearing ambiguity, and requires a short-lived
digest-bound user token naming every and only accepted claim and governed relationship. Its sole serializable
recorder reuses exact provenance claims, creates accepted new claims only at draft status, creates or reuses
accepted claim-thesis mappings, and records one complete journal audit in the same transaction. Exact retry is
idempotent; stale input, conflicting provenance or relationships, malformed or expanded authority, expired
authorization, and injected partial failure are refused without committed writes. Headless execution may
prepare or validate but is ineligible to authorize or publish because candidate acceptance is genuine user
judgment. Representative provider fixtures are bound to exact adapter bytes; no live provider invocation,
production mutation, scheduler, credential, active discovery, or operational cutover occurred.

Issue #59 adds the source-owned belief-research-relation Capability at immutable revision
`56855ac2fbbd0908f4f4d4196654190a23ed1eb4`. Its deterministic repository boundary preserves complete
Notes-owned Toulmin evidence, the complete promoted-claim identity catalog, developing and monitoring thesis
arguments, and existing relationships. Exact provenance is reused regardless of lifecycle state; an unpromoted
claim is deferred to the Registry-resolved research-publication Capability. Holdings, tickers, keywords, and
provider recommendations are explicitly rejected as semantic proof. Exact Claude/Codex adapters require direct
claim-to-argument bearing and preserve explicit claim-identity or thesis-bearing ambiguity. Persistence requires
a short-lived exact user token and one serializable recorder limited to `claim_thesis_mappings`, unresolved
`decision_required` journal rows, and one complete digest-bound audit; it cannot create claims, change status,
resolve decisions, mutate strategies or positions, or trade. The Codex preamble is bespoke and conditionally
eligible only for non-mutating preparation or validation. Representative output is cryptographically bound to
exact adapter bytes; no live provider invocation, production write, scheduler, credential, active discovery, or
operational cutover occurred.

Issue #66 adds the source-owned research-pipeline aggregate Capability at immutable revision
`54f7ddec11e8c6018b7f47f8b7d05bfaf186d6b1`. It composes the Registry-locked
claims-synthesis, research-publication, and belief-research-relation contracts through their existing validators;
it neither reimplements stage semantics nor acquires their mutation authority. The complete provider-neutral
lifecycle reports bounded `incomplete`, `unavailable`, `stale`, `refused`, `failed`, `judgment_required`, and
`ready` stage outcomes with deterministic digest-bound retries and aggregate `writes: []`. Exact Claude and
Codex aggregate adapters are staged through the existing pipeline-status inventory slots while all ten legacy
entry points remain active and explicitly unmigrated pending #67 and #68. The aggregate may name only the
stage-owned publication or relation recorder behind that stage's exact user-authorization boundary; it cannot
invoke either recorder, create or publish claims, persist relations, change status, resolve Decision Items, or
mutate schedulers, credentials, provider discovery, production data, theses, strategies, positions, or trades.
No live provider invocation, production mutation, scheduler, credential, discovery, or operational cutover
occurred.

Issue #67 advances the research-pipeline Capability to `1.1.0` at immutable source revision
`c0d8a0c41f9fdb7a814e550ca48a6ec4b4a1d161`. It adds independently invocable, deterministic, zero-write
results for pipeline status, user-selected idea intake, audited thesis formalization, and audited unknown
mapping, then composes those exact results into the accepted #66 aggregate. Notes/Tana remains authoritative
for capture, source material, and Toulmin extraction. Exact source digests, qualifier, rebuttals, ambiguities,
prior-stage identity, and user decision identity/time are preserved. Stage 3 follows only an explicit Stage 2
advance and enforces ranked decision impact, resolvability, priced-in state, clear kill conditions, asymmetric
research payoff, and the exact advance/kill/archive decision. The four legacy persistence entry points and
active discovery remain unchanged and rollback-capable. Research preparation, unknown research, evidence
synthesis, thesis expression, gate decision, and graduation remain explicitly unmigrated for #68. Neither a
stage result nor the aggregate can write, change status, create or resolve a Decision Item, use scheduler or
credential authority, touch production data, or mutate a strategy, position, order, or trade.

Issue #68 advances the research-pipeline Capability to `1.2.0` at immutable source revision
`c65315b3faed66f3adc1b917df61b8e9122b4f0d`. It adds independently invocable zero-write results for portable
research preparation, multi-track unknown research with explicit unavailable outcomes, all-unknown evidence
synthesis, thesis expression without sizing or trade authority, the audited advance-or-kill gate, and
provenance-bound graduation. Graduation binds exact claim identity and reuse to a validated claims-synthesis
context and result, then remains `judgment_required` until the user accepts the exact handoff digest; a decline
is preserved as `refused`. All ten legacy persistence entry points, mirrors, and active discovery remain
unchanged and rollback-capable. Notes/Tana retains capture, source-material, and Toulmin authority. No stage or
aggregate acquires scheduler, credential, production-data, status, Decision Item resolution, signal, strategy,
position, order, trade, generic-write, or database authority. Issue #69 contraction is not started.

Issue #69 contracts the superseded research-pipeline surface and publishes Capability `1.3.0` from immutable
source revision `6216690f163fdc1dc30d15d3b369ea65f72eee8c`. The ten former Claude procedures and ten
headless projections retain their existing discovery paths as non-executable protective tombstones; each names
one exact governed CLI stage, returns or requires zero writes, and preserves unavailable, refusal, provenance,
idempotency, and genuine-judgment semantics. Active repository consumers now route to the governed CLI, while
the machine-local Codex bridge continues to resolve safely through the retained paths. Historical instructions
remain recoverable from accepted pre-contraction merge `051c1c57c9dd447c930e4352262d6c4cd6f90fe2` and
rollback requires only a repository revert followed by deterministic publication regeneration. The published
Registry Lock digest is `sha256:58babef231b541dc839a4ece1459baffc2d47c417931c6c02c21e96bd97c6177`;
staged Claude and Codex outputs are respectively
`sha256:b7a10894ba9dd414af6c8e74b0cf893ffb105a3b8cf3df7d05d42f76875dc1da` and
`sha256:73834444be7332fcd1f06c02bf1a9abdfcfdc14921759ab53fbcb8113275371e`. No scheduler,
credential, production-data, status, Decision Item resolution, signal, strategy, position, order, trade,
generic database-write, Notes/Tana-write, Radon, #70 disposition, or final #76 discovery-cutover authority was
used or acquired.

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
of `2026-08-10`; CI resolves a temporary present-day lock before clean-regeneration validation so current
freshness is enforced without rewriting or making the published lock nondeterministic. A controlled public-CLI
proof also evaluates evidence on `2026-09-06`, after its `2026-09-05` expiry, and requires the adapter to become
`stale`, existing governed output validation to fail, regeneration to fail, and the absent target to remain
unwritten. The existing `WS-ENTRY-005` unavailable-support refusal remains a separate regression.
