# Provider Adapter inventories

These artifacts describe Trade Journal's provider-specific entry points and operational dependencies for J1.
They are repository-owned migration evidence, not Capability Packages and not Adapter Conformance evidence.

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

- all 36 repository-authored Claude skill entry points;
- the external machine-local interactive Codex bridge as a separate adapter;
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

`headless-inventory.json` contains all 36 repository-owned `.agents/skills/` projections and links each one
back to its authored `.claude/skills/` authority. The validator compares each generated body with its authored
source, checks `skill.json` and preamble packaging, and rejects missing, extra, duplicate, or stale mirrors.

The inventory deliberately distinguishes packaging from readiness:

- five executable workflows (`assess-validation-evidence`, `build-core-argument`, `finalize-for-upload`,
  `relate-research`, and `synthesize-claims`) have bespoke authored headless contracts;
- ten contracted research-pipeline paths have bespoke refusal preambles that name their exact governed CLI replacement;
- deferred `visser-scan` has a bespoke zero-write unavailable/refusal preamble;
- the other 20 projections have generic generated preambles, which are packaging baselines only; and
- `decisions` and `thesis` are mirrored for parity but remain ineligible for unattended execution.

`visser-scan` is also explicitly ineligible for unattended execution. Issue #70 replaces its unsafe generic
headless baseline with a bespoke zero-write unavailable/refusal contract and retains only the existing
pull-only manual procedure as a non-governed migration input. Both projections remain `unavailable`; local
source files, mirror parity, and the presence of Notes-owned data do not establish Adapter Conformance. The
reviewed authority, source age, migration-input digests, consumer absence, and scope are recorded in
`evidence/issue-70-market-research-scan-disposition.json`.

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

The parity script is supporting diagnostic tooling, not Adapter Conformance evidence. Likewise, a current
mirror and a valid rich inventory do not upgrade any W1 evidence state. J2 upgrades an inventory entry only
when an exact source Capability version, package digest, adapter digest, complete evidence, immutable lock,
and staged generated output bind it through W1. The remaining generic projections stay `unavailable`.

## Generation eligibility

`generation-eligibility.json` is the deterministic projection of both inventories into J1's governed
generation decision and the incremental J2 migration state. It covers all 73 inventoried entry points. The
fourteen locked Capabilities now record 48 generation-eligible inventory entries and two whole-file governed
staging outputs. Eleven packages are Trade Journal-owned; the three Notes-owned content-processing dependency
packages remain external. The other 25 entries remain non-governed migration inputs or non-candidates with
explicit dispositions.

The portfolio-snapshot, belief-maintenance, belief-research-relation, claims-synthesis, research-publication,
thesis-observation, thesis-underwriting, belief-evidence-assessment, portfolio-options-advice, and
morning-attention-brief adapters are `current` because they bind to source-owned Capability version `1.0.0`, exact package and
adapter digests, complete current evidence, and the immutable published Registry Lock. The belief-maintenance
package covers the maintenance, thesis-review, and claim-backfill inventory entries through one provider-
neutral boundary. Governed outputs stay under the staging discovery surface until a separately approved live
or final discovery cutover. File presence, mirror parity, generic packaging, or historical execution cannot
upgrade any remaining adapter.

The four `process-note` and `process-transcript` projections instead bind to Notes content-processing `0.2.0`
at one immutable Notes revision. Their legacy repository paths remain explicit migration inputs and active
discovery is unchanged. Exact conformance does not claim live Tana, provider, scheduler, credential, or
headless execution availability; existing interactive consumers remain explicit, and no Trade Journal
investment-write authority is granted.

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
