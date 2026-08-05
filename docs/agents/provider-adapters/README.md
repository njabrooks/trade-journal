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

Cross-repository candidate Capabilities keep their external authority. Notes owns Toulmin extraction and
Radon owns IBKR gateway/quote infrastructure; this inventory references those authorities instead of copying
their contracts into Trade Journal.

## Headless inventory

`headless-inventory.json` contains all 36 repository-owned `.agents/skills/` projections and links each one
back to its authored `.claude/skills/` authority. The validator compares each generated body with its authored
source, checks `skill.json` and preamble packaging, and rejects missing, extra, duplicate, or stale mirrors.

The inventory deliberately distinguishes packaging from readiness:

- `assess-validation-evidence` and `build-core-argument` have bespoke authored headless contracts;
- the other 34 projections have generic generated preambles, which are packaging baselines only; and
- `decisions` and `thesis` are mirrored for parity but remain ineligible for unattended execution.

Five live provider-dependent launchd jobs are mapped with their current Claude provider, model, invocation,
schedule, read/write boundary, machine-local environment, timeout, locking, failure observability, downstream
consumer, and proposed J2 disposition. They correspond to four adapter families: maintenance, thesis-observe,
options-advisor (morning batch and afternoon LEAP jobs), and morning-brief. None currently invokes a Codex
projection: each job names its currently invoked authored Claude source separately from its proposed Codex
migration target. Migration priority follows operational risk, starting with belief maintenance and its genuine-
judgment boundary.

Deterministic on-device jobs and GitHub Actions are recorded separately as exclusions because they do not
invoke an agent model. Provider data dependencies such as Radon, IB Gateway, Massive, Supabase, browser/web
access, credentials, login state, and macOS notifications remain visible on the live workflows where they
affect execution.

The parity script is supporting diagnostic tooling, not Adapter Conformance evidence. Likewise, a current
mirror and a valid rich inventory do not upgrade any W1 evidence state. All projections remain `unavailable`
until an exact source Capability version, package digest, and adapter digest can be bound by the W1 evidence
contract. J1 #35 will validate only the smaller Repository Manifest adapter declarations using the accepted
Workspace CLI.

## Generation eligibility

`generation-eligibility.json` is the deterministic projection of both inventories into J1's governed
generation decision. It covers all 73 inventoried entry points and records zero generation-eligible adapters,
no governed outputs, the current surfaces as non-governed migration inputs, and the required J2 sequence.

Every adapter remains `unavailable` because none is bound to an accepted source-owned Capability version,
package digest, adapter digest, and complete current evidence. This is an honest Adapter Conformance state,
not a repository failure. It must not be upgraded from file presence, mirror parity, generic packaging, or a
historical execution.

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
