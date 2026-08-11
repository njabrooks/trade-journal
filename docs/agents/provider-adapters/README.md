# Provider Adapter inventories

These artifacts describe Trade Journal's provider-specific entry points and operational dependencies. They are
repository-owned supporting projections; exact Adapter Conformance comes only from the Capability Package and
evidence binding referenced by a `current` entry.

## Validation boundary

Workspace Standard v1 validates the Repository Manifest's adapter declarations as `id`, `capability`,
`provider`, and an existing safe repository-relative `path`. It validates adapter behaviour and evidence only
through a source Capability Authority's exact `capability-package.json`. It does not define the richer fields
needed for Trade Journal's operational inventory.

Run the supporting repository validator from the repository root:

```console
npx tsx scripts/ops/validate-provider-adapter-inventory.ts
npx tsx scripts/ops/validate-provider-adapter-inventory.ts --format json
npx tsx scripts/ops/validate-provider-adapter-inventory.ts docs/agents/provider-adapters/headless-inventory.json
npx tsx scripts/ops/validate-provider-adapter-inventory.ts docs/agents/provider-adapters/headless-inventory.json --format json
npx tsx scripts/ops/validate-provider-generation-eligibility.ts
npx tsx scripts/ops/validate-provider-generation-eligibility.ts --format json
```

The human and JSON reports are deterministic over repository content. A valid report proves that required
metadata is complete, repository sources resolve, interactive Claude source coverage is exhaustive, and the
declared session hooks match `.claude/settings.json`. It does not prove Workspace Repository Conformance or
Adapter Conformance. The accepted Workspace CLI remains authoritative for those separate contracts.

## Interactive inventory

`interactive-inventory.json` contains:

- all 36 repository-origin Claude records: 33 discovery paths and three issue #75 historical-only records;
- repository-owned governed Claude and Codex workflow-discovery adapters;
- the active legacy machine-local Codex router as an environmental surface with unavailable conformance evidence, not an adapter authority;
- repository and external discovery surfaces;
- all four Claude `SessionStart` hooks;
- concrete mappings from Claude shell, web, Supabase, Tana, Massive, IBKR, Skill, and Agent surfaces to
  Codex/repository equivalents and their authority boundaries;
- candidate Capability identity and authority, source ownership, provider packaging, invocation and lifecycle;
- read, write, and judgment scope; prerequisites, limitations, and operational consumers;
- W1-defined evidence state and exact evidence binding fields; and
- a proposed J2 migration disposition.

Lifecycle and evidence state are independent. For example, an adapter may be operationally `active` while its
Adapter Conformance evidence is `unavailable`. A generic or mirrored entry point may also be `ineligible` for
unattended judgment. File presence, parity, and historical execution never upgrade evidence to `current`.

Cross-repository candidate Capabilities keep their external authority. Notes owns content processing,
including generic Toulmin extraction, and Radon owns IBKR gateway/quote infrastructure; this inventory
references those authorities instead of copying their contracts into Trade Journal. Federated bindings are
checked through the authored Registry, immutable Lock, and exact source revision.

## Headless inventory

`headless-inventory.json` contains 33 repository-owned `.agents/skills/` projections plus three issue #75
historical-only records, preserving the exhaustive 36-entry provider history. The validator compares each live
generated body with its authored `.claude/skills/` authority, checks `skill.json` and preamble packaging, and
rejects missing, extra, duplicate, or stale mirrors.

The inventory deliberately distinguishes packaging from readiness:

- five executable workflows (`assess-validation-evidence`, `build-core-argument`, `finalize-for-upload`,
  `relate-research`, and `synthesize-claims`) have bespoke authored headless contracts;
- ten contracted research-pipeline paths have bespoke refusal preambles that name their exact governed CLI replacement;
- `gateway`, `ibkr-quote`, and `visser-scan` have bespoke zero-read/zero-write unavailable refusal preambles;
- `configure-signal` has a bespoke no-read/no-write protective retirement tombstone;
- the other 14 projections have generic generated preambles, which are packaging baselines only; and
- `decisions` and `thesis` are mirrored for parity but remain ineligible for unattended execution.

Issue #75 gives all eight non-candidate records their final disposition. The interactive and headless
`archived-deep-dive`, `archived-generate-summary`, and `paperclip-backlog` bytes are outside active discovery
under `docs/archive/provider-adapters/issue-75/` and have no consumer or write authority. The two
`configure-signal` records remain discoverable only as matching deterministic retirement tombstones, because
removing that boundary could revive forbidden manual signal configuration. All eight remain `not-candidate`,
`unavailable`, generation-ineligible, and unbound to any Capability, Registry release, or operational adapter.
Exact byte preservation, fixed point, unchanged governed-output digests, rollback, and scope are recorded in
`evidence/issue-75-non-candidate-dispositions.json`.

`visser-scan` is also explicitly ineligible for unattended execution. Issue #70 replaces its unsafe generic
headless baseline with a bespoke zero-write unavailable/refusal contract and retains only the existing
pull-only manual procedure as a non-governed migration input. Both projections remain `unavailable`; local
source files, mirror parity, and the presence of Notes-owned data do not establish Adapter Conformance. The
reviewed authority, source age, migration-input digests, consumer absence, and scope are recorded in
`evidence/issue-70-market-research-scan-disposition.json`.

`gateway` is likewise ineligible for unattended execution. Issue #73 retains its interactive controller as an
unchanged non-governed migration input, while the headless projection refuses every read, credential access,
and gateway operation because Radon publishes no accepted immutable gateway-control package or exact Adapter
Conformance evidence. The reviewed Radon revision, controller and preamble digests, client-id boundary,
unavailable operational state, rollback, and scope are recorded in
`evidence/issue-73-radon-gateway-reconciliation.json`.

`ibkr-quote` is also ineligible for unattended execution. Issue #74 retains the requested-structure and
requested-contract quote helpers as non-governed migration inputs while repairing their assigned client IDs,
structured unavailable outcomes, and separation from gateway lifecycle control. The headless projection
refuses gateway inspection or operation, contract qualification, and market-data requests because Radon
publishes no accepted immutable option-quote package or exact Adapter Conformance evidence. Bulk-chain
ingestion, requested-contract qualification, gateway control, and quote presentation remain explicit and
separate; missing gateway or market data is unavailable, never a current conformance result. Exact input
digests, Radon revision, limitations, rollback, and scope are recorded in
`evidence/issue-74-radon-option-quote-reconciliation.json`.

Five live provider-dependent launchd jobs are mapped with their current Claude provider, model, invocation,
schedule, read/write boundary, machine-local environment, timeout, locking, failure observability, downstream
consumer, and proposed J2 disposition. They correspond to four adapter families: maintenance, thesis-observe,
options-advisor (morning batch and afternoon LEAP jobs), and morning-brief. None invokes a Codex projection.
Each migrated job names its governed Claude adapter, while an unmigrated job names its authored Claude source;
both remain distinct from the separately gated Codex migration target. Migration priority follows operational
risk, starting with belief maintenance and its genuine-judgment boundary.

Deterministic on-device jobs and GitHub Actions are recorded separately as exclusions because they do not
invoke an agent model. Provider data dependencies such as Radon, IB Gateway, Massive, Supabase, browser/web
access, credentials, login state, and macOS notifications remain visible on the live workflows where they
affect execution.

The parity script gates the repository inventory and mirror only; it never reads or requires the optional
machine-local bridge. It remains supporting diagnostic tooling, not Adapter Conformance evidence. Likewise, a current
mirror and a valid rich inventory do not upgrade any W1 evidence state. J2 upgrades an inventory entry only
when an exact source Capability version, package digest, adapter digest, complete evidence, immutable lock,
and staged generated output bind it through W1. The remaining generic projections stay `unavailable`.

## Generation eligibility

`generation-eligibility.json` is the deterministic projection of both inventories into J1's governed
generation decision and the incremental J2 migration state. It covers all 74 inventoried entry points. The
seventeen locked Capabilities now record 54 generation-eligible inventory entries and two whole-file governed
staging outputs. Fourteen packages are Trade Journal-owned; the three Notes-owned content-processing dependency
packages remain external. The other 22 entries remain non-governed migration inputs or non-candidates with
explicit dispositions.

The portfolio-snapshot, belief-maintenance, belief-research-relation, claims-synthesis, research-publication,
thesis-observation, thesis-underwriting, belief-evidence-assessment, portfolio-options-advice,
options-vol-analysis, portfolio-analysis, and morning-attention-brief adapters are `current` because they bind to source-owned Capability version `1.0.0`, exact package and
adapter digests, complete current evidence, and the immutable published Registry Lock. The belief-maintenance
package covers the maintenance, thesis-review, and claim-backfill inventory entries through one provider-
neutral boundary. Governed outputs stay under the staging discovery surface until a separately approved live
or final discovery cutover. File presence, mirror parity, generic packaging, or historical execution cannot
upgrade any remaining adapter.

Workflow discovery adds current Claude and Codex interactive adapters. Each selects from this validated
inventory and delegates to the selected provider's exact locked adapter or an honestly unavailable repository-authored
migration input; it does not reproduce workflow procedures or execute the selected workflow. `AGENTS.md`
provides repository-native activation. The installed Home Hub bridge remains an active legacy competing router,
but its absence or drift cannot fail repository parity and its bytes have unavailable Adapter Conformance evidence. Exact release, artifact, observed
environmental-bootstrap digests, scope, and rollback are recorded in
`evidence/issue-71-workflow-discovery.json`.

The four `process-note` and `process-transcript` projections instead bind to Notes content-processing `0.2.0`
at one immutable Notes revision. Their legacy repository paths remain explicit migration inputs and active
discovery is unchanged. Exact conformance does not claim live Tana, provider, scheduler, credential, or
headless execution availability; existing interactive consumers remain explicit, and no Trade Journal
investment-write authority is granted.

CI requires the read-only `NOTES_REPOSITORY_DEPLOY_KEY` to materialize the exact private source revision. A
missing key is an unavailable source-acquisition state and fails before any conformance result is accepted.

The accepted W1 no-write boundary is exercised separately against a clean checkout at the pinned revision:

```console
npx tsx scripts/ops/prove-provider-entry-point-refusal.ts \
  --workspace-root /absolute/path/to/accepted-w1-checkout
npx tsx scripts/ops/prove-provider-entry-point-refusal.ts \
  --workspace-root /absolute/path/to/accepted-w1-checkout --format json
```

The harness constructs a temporary source-owned fixture with valid `unavailable` environmental evidence,
resolves an immutable published Registry Lock, and invokes W1 generation twice. A passing proof requires
`WS-ENTRY-005`, byte-identical refusal diagnostics, and an absent governed output after both attempts. The
temporary fixture is removed afterward; no Capability Package, Registry, lock, or governed entry point is
added to Trade Journal.

## J2 portfolio-snapshot tracer

The first J2 slice establishes the reusable governance spine without changing a live job:

- Trade Journal is the source Capability Authority for `capability:scope:trade-journal/portfolio-snapshot`;
- its exact Claude and Codex adapters are separately authored and digest-bound;
- the published Registry release points to the preserved source-release commit;
- the immutable lock and complete staging outputs reproduce through the accepted Workspace CLI; and
- the original Claude skill and Codex mirror remain visible as migration inputs until final discovery cutover.

CI validates the Capability, published lock, and clean regeneration in both human and JSON modes while
retaining the J1 unavailable-input refusal proof. The repository inventory validator also checks that each
`current` entry resolves to the exact package, adapter, evidence record, digest, staging output, and preserved
migration input it declares.

## J2 governed operational packages

Tickets #48, #50, #52, and #55 extend the same immutable spine to four operational Capability families. Their
exact adapters declare bounded inputs and machine-readable results and preserve the producer/resolver,
sensing-only, recommendation-only/no-trade, and synthesis-only write boundaries. Read-only environment probes
cover the maintenance worklist, Tier-1 observation bundle, both options modes, and deterministic morning
bundle. No scheduler, launchd definition, active root/provider discovery file, database state, or live provider
invocation changes in these governance slices.

Issue #64 governs the options-vol-analysis boundary separately from portfolio options advice. Both exact
adapters invoke the existing Trade Journal volatility analyzer, preserve its complete result, distinguish
Black–Scholes-at-listed-IV model values from executable quotes, and expose Radon quote verification as
`unavailable` without calling gateway or quote helpers. Persistence remains an explicit, post-analysis opt-in
through the existing single-report recorder. Deterministic fixture equivalence and a separately identified
read-only eligible live-data probe are recorded in `evidence/issue-64-options-vol-analysis.json`; no active
discovery, scheduler, gateway, quote, order, or trade scope is included.

Issue #65 replaces the portfolio-and-options connector assumptions with the source-owned portfolio-analysis
Capability. Its exact Claude and Codex adapters compose only the Registry-locked portfolio-snapshot and
options-vol-analysis dependencies, preserve complete dependency results, ground observations in exact returned
fields, force options persistence off, and expose snapshot or options unavailability explicitly. The legacy
Claude skill and Codex mirror remain rollback-capable migration inputs until final discovery cutover. No active
discovery, generic connector, scheduler, database write, gateway, executable quote, order sizing, or trade
authority is added.

## J2 thesis-underwriting package

Issue #57 governs the interactive and conditionally delegated headless thesis-underwriting boundary. Its adapters
preserve versioned articulations, linked-claim provenance, rebuttal-derived qualitative resolution signals, and
statement-to-sensor lineage while refusing manual signal configuration, thesis-status mutation, Decision Item
resolution, ad hoc SQL, and trade authority. The package is staged only: it does not change a scheduler, provider
entry point, database record, or live provider invocation.

## J2 belief-evidence-assessment package

Issue #58 governs interactive and conditionally delegated headless assessment against the latest governed
thesis articulation and its complete active resolution-signal set. Its exact adapters preserve source
provenance, thesis-centric polarity, neutral completeness, and direct semantic bearing. Recording is explicit
and passes through one serializable repository recorder whose maximum write set is qualitative snapshots,
existing-claim evidence links, and accepted journal audit. The package is staged only: no provider invocation,
database-writing canary, scheduler, credential, or discovery cutover was authorized.

## J2 claims-synthesis package

Issue #62 governs interactive and conditionally unattended synthesis over one Notes-owned research handoff.
Its deterministic repository boundary exposes approved reads only and keeps source evidence, existing main
claims, synthesized investment claims, and proposed thesis mappings distinct. Exact source provenance forces
reuse; semantic ambiguity prevents mappings; and both exact adapters are recommendation-only with an empty
write set. The package is staged only: no provider invocation, database mutation, scheduler, credential,
active discovery, or operational cutover was authorized.

The read-only environmental preflight returned a 1.9 MB context for four source claims, the complete current
2,146-claim identity catalog, and 73 eligible theses. That full catalog deliberately favors duplicate safety
over prompt compactness. No live provider invocation proves the practical latency or context cost; any future
retrieval optimization must remain governed and must not convert ticker or keyword overlap into semantic proof.
