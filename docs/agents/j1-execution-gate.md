# J1 execution gate and adoption baseline

This record is the stable implementation input for J1, [issue #30](https://github.com/njabrooks/trade-journal/issues/30).
It confirms that the W1 dependency has cleared and records the Trade Journal state observed before
adoption. It does **not** establish Repository Conformance or Adapter Conformance.

## Accepted W1 input

W1, [Workspace issue #13](https://github.com/njabrooks/projects/issues/13), closed as accepted on
2026-08-04. Its [acceptance record](https://github.com/njabrooks/projects/issues/13#issuecomment-5183531831)
identifies the completed sub-issues and the default-branch conformance run. The accepted source is:

| Input | Pinned value |
| --- | --- |
| Workspace Standard | `1.0.0` |
| Workspace repository | `github:njabrooks/projects` |
| Accepted source revision | `2b6ea3e02ff5ba114b0f91dd779c4afb26181358` |
| Accepted revision URL | <https://github.com/njabrooks/projects/commit/2b6ea3e02ff5ba114b0f91dd779c4afb26181358> |
| Default-branch acceptance run | <https://github.com/njabrooks/projects/actions/runs/30942357904> |
| Governed evidence date | `2026-08-04` |

The Workspace repository has no tag or GitHub Release for this delivery. The full commit id above is
therefore the immutable publication input. J1 must not substitute `main`, another branch, an abbreviated
commit, an uncommitted Workspace checkout, or a planning draft.

### Contract and schema sources

At the accepted revision, the following files are the exact sources J1 adopts:

- `docs/workspace-standard-v1.md` defines Workspace Standard v1, the Repository Manifest contract,
  canonical guidance and tracker meanings, relationships, explicit absence, extensions, deviations,
  outcomes, Registry Lock semantics, and Provider Entry Point projection.
- `docs/workspace-cli.md` defines the public commands and the machine-readable result contracts for
  repository, tracker, Capability, Registry Lock, and Provider Entry Point validation.
- `workspace` is the public Python CLI. It declares supported Standard, report schema, Registry,
  Provider Entry Point, and Capability contract versions as `1.0.0`. W1 provides no separate CLI
  release number or standalone JSON Schema files; the versioned prose contracts and their executable
  validation in this exact script are the accepted schemas.
- `tests/fixtures/repositories/complete-conformance/workspace-manifest.json` is W1's executable complete
  Repository Manifest example. It is an example, not Trade Journal's manifest.
- `evidence/issue-21-acceptance.md` records W1's black-box commands and evidence boundary.

Read these paths from a clean checkout at the accepted revision. Do not copy their content from a mutable
Workspace working tree.

### Public CLI seam

The CLI has no version flag; its identity is the accepted source revision. From that clean, full-history
Workspace checkout, the J1 verification seam is:

```console
./workspace validate repository /absolute/path/to/trade-journal --format json
GITHUB_TOKEN=<read-only-token> \
  ./workspace validate repository /absolute/path/to/trade-journal --validate-tracker --format json
```

Downstream tickets may add Registry and generated-entry-point commands only after Trade Journal has authored
their inputs:

```console
./workspace resolve registry /absolute/path/to/trade-journal/capability-registry.json \
  --lock /absolute/path/to/trade-journal/capability-registry-lock.json \
  --mode published \
  --evidence-time <governed-date>

./workspace validate registry-lock /absolute/path/to/trade-journal/capability-registry.json \
  --lock /absolute/path/to/trade-journal/capability-registry-lock.json \
  --mode published \
  --evidence-time <governed-date>

./workspace generate provider-entry-points /absolute/path/to/trade-journal \
  --registry /absolute/path/to/trade-journal/capability-registry.json \
  --lock /absolute/path/to/trade-journal/capability-registry-lock.json \
  --mode published \
  --evidence-time <governed-date>

./workspace validate provider-entry-points /absolute/path/to/trade-journal \
  --registry /absolute/path/to/trade-journal/capability-registry.json \
  --lock /absolute/path/to/trade-journal/capability-registry-lock.json \
  --mode published \
  --evidence-time <governed-date> \
  --format json
```

Published Registry resolution accepts only an existing tag or an exact 40-character commit id. Development
mode is an explicit, non-publication-eligible working-tree path and cannot support J1 acceptance evidence.

### Accepted Registry, generation, validation, and evidence rules

The accepted W1 self-conformance lock is a reproducible reference for the contract, not a Trade Journal
lock. Its authored `capability-registry.json` pins the CDP discovery package release to
`43e45775ea0246de25a8efdcc98aba6ba34f0d82`. Its generated lock records:

- Registry digest `sha256:9b4bee47f104e41ca19be7aa26ea2165b349c06d5ee718d65950c9827e62614d`;
- package digest `sha256:9c0a052b981b4b137098aa1e343d30e2ee886c4a9c596faa5aeffd75b61ad84f`;
- published, publication-eligible mode and evidence time `2026-08-04`; and
- independent Claude and Codex adapter sources, evidence locations, `current` states, and validation dates.

Trade Journal's future Registry Lock must be generated from its own authored Registry and exact source-owned
Capability packages. It must bind the exact immutable revision, package and adapter bytes, evidence state,
dependencies, and governed evidence time. Manual lock edits, mutable revisions, stale evidence, dependency
drift, or changed sources fail validation.

Provider Entry Points are complete generated files. Their permitted content sources are provider-neutral
repository guidance, locked Capability intent/contract/instructions, and separately authored locked Provider
Adapter constraints. Deterministic generation also binds the authored `provider-entry-points.json`
declaration, exact Registry bytes, generated lock, immutable package/adapter/evidence bytes, resolution mode,
and governed evidence time. Generated and handwritten sections cannot coexist in a governed output.
Generation first proves the Registry Lock clean, fails before writing on stale or unavailable support, and
must be byte-identical on clean regeneration. Provider-specific constraints may describe real runtime
differences but cannot reinterpret neutral semantics.

Repository Conformance and Adapter Conformance are separate. Live GitHub validation is authenticated and
read-only; missing credentials or inaccessible/transient metadata is `unavailable`, not a pass. Adapter
evidence is independent per adapter and must bind the exact Capability version, package digest, adapter digest,
requirements, validation date, and freshness window. Honest `stale`, `partial`, `experimental`, `deprecated`,
or environmentally `unavailable` states are not upgraded from file presence or historical runs.

## Fresh Trade Journal baseline

This read-only inventory was taken on 2026-08-04 from clean Trade Journal revision
`7104fc5569bc55917020ca1cd97eb3db5b654e5d`, after the bootstrap change merged. No W1-generated artifacts or
live automation were changed while taking it.

### Guidance and tracker

- `CLAUDE.md` remains the canonical, maintained repository operating manual. `AGENTS.md` is a Codex shim that
  defers to it and maps provider differences. `docs/v2/` contains product and loose-agent decisions.
- `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` are present.
  `CONTEXT.md` and `docs/adr/` are absent. The bootstrap convention allowed lazy absence, but Workspace
  Standard v1 requires the canonical paths to resolve; this is adoption work, not an accepted absence.
- `workspace-manifest.json`, `capability-registry.json`, `capability-registry-lock.json`,
  `provider-entry-points.json`, and repository-local Workspace acceptance evidence are not yet present.
- GitHub Issues in `njabrooks/trade-journal` is the declared repository Work Item authority. The tracker guide
  prefers native sub-issues and dependencies, with text fallback only where the provider lacks the primitive.
- Live GitHub metadata contains all five same-named canonical labels plus eight unrelated labels. Four live
  descriptions preserve the accepted meanings apart from terminal punctuation. `needs-triage` currently says
  “Maintainer needs to evaluate this issue”; W1 requires “Maintainer needs to evaluate this Work Item.” The
  repository triage guide contains the same pre-W1 wording. This is a semantic implementation gap to validate
  and correct in the tracker-adoption ticket, not a pass inferred from label presence.

### Provider Adapter surfaces and projections

| Surface | Fresh state | Authority and role |
| --- | --- | --- |
| `.claude/skills/*/SKILL.md` | 36 skill sources | Repository-owned authored Claude workflow entry points and migration inputs. They mix active, archived, deprecated, and retired lifecycles. |
| `.agents/skills/*` | 36 generated headless Codex packages | Repository-owned mirror generated by `scripts/ops/generate-agents-mirror.ts`; each contains `skill.json`, `SKILL.md`, and `HEADLESS_PREAMBLE.md`. It is not the interactive Codex source. |
| `~/.codex/skills/trade-journal-workflows` | machine-local external bridge | Interactive Codex routing and Claude-to-Codex translation. It references repository sources but is not owned by this repository. |
| `AGENTS.md` | handwritten Codex shim | Repository discovery and runtime-difference guidance; not currently a W1-generated Provider Entry Point. |
| `CLAUDE.md` | handwritten canonical manual | Shared operating semantics plus Claude packaging; not currently a W1-generated Provider Entry Point. |
| `.claude/settings.json` | four `SessionStart` command hooks | Claude-only nudges for decisions, parity, cron health, and advisor state. Codex must invoke equivalent checks deliberately. |

`npx tsx scripts/ops/check-codex-parity.ts --json` reported 36 sources, no missing or stale mirrors, a complete
external bridge inventory, and four active skills absent from both curated bridge routing surfaces:
`gateway`, `morning-brief`, `relate-bookmark`, and `visser-scan`. The diagnostic passed its repository-specific
gate; W1 explicitly says this does not establish either form of conformance.

Only `build-core-argument` and `assess-validation-evidence` have bespoke headless execution contracts. The
other 34 `HEADLESS_PREAMBLE.md` files are generic baselines. A generic wrapper is packaging coverage, not proof
that a workflow is safe or capable of unattended execution. In particular, `decisions` and `thesis` require
interactive judgment despite having mirrored packages. Retired `configure-signal`, archived
`archived-deep-dive` and `archived-generate-summary`, and deprecated `paperclip-backlog` remain discoverable
with their non-current lifecycles.

Provider/tool mappings are distributed rather than declared in one contract. Claude front matter names tools
such as Bash, WebSearch/WebFetch, Supabase MCP, and Tana MCP; some skills refer to Claude.ai Supabase, Massive,
or IBKR connectors. The Codex shim and external bridge redirect database work to repository scripts, live
market work to available Codex tools, Tana-origin work to the Notes bridge, and bulk IBKR work to Radon. There
is no repository MCP configuration file. These host- and provider-dependent assumptions need explicit
inventory evidence; they are not assumed available in CI or on another host.

The accepted CLI has no standalone rich-inventory command or schema. Repository validation checks each
`provider_adapters` manifest declaration for exactly `id`, `capability`, `provider`, and an existing safe
repository-relative `path`; it does not validate lifecycle, invocation, prerequisites, write scope,
limitations, consumers, evidence freshness, or J2 disposition in a separate inventory artifact. Capability
validation can validate those adapters only when a source Capability Authority has authored an exact
`capability-package.json` and evidence contract. Published Registry resolution separately requires an
immutable release reference. Downstream work must preserve this boundary: path resolution
through `validate repository` is not validation of richer inventory semantics.

### Provider-dependent operational consumers

Four workflow families invoke `/opt/homebrew/bin/claude` with Opus and
`--dangerously-skip-permissions`, across five installed launchd declarations:

| Workflow | Schedule and timeout | Writes and safety boundary |
| --- | --- | --- |
| `maintenance` | 08:00 and 20:00 daily; 40-minute timeout | Relates clear claim matches and raises Decision Items; never resolves genuine judgment or re-underwrites automatically. |
| `thesis-observe` | 07:00 daily; 50-minute timeout | Writes sensing evidence and journal records; never raises a decision or changes status. Requires WebSearch and local credentials. |
| `options-advisor` | batch at 08:05 weekdays, 40 minutes; LEAP at 15:20 weekdays, 60 minutes | Saves recommendation batches after judgment and live verification. LEAP mode requires the Radon-owned local IB Gateway. |
| `morning-brief` | 08:45 daily; 30-minute timeout | Upserts one `morning_briefs` row; never mutates the belief layer, raises decisions, or changes status. |

Every wrapper uses a per-job lock with stale-lock handling, kills the process group on timeout, writes a
timestamped log and `logs/cron-status.tsv`, and sends a macOS failure notification. The Claude CLI login and
local Home Hub environment are runtime prerequisites. These jobs are operationally live and remain unchanged
by J1.

The other three current launchd declarations (`collect-signal-data`, `regime-scan`, and `options-scanner`)
execute deterministic scripts rather than a provider adapter.
The GitHub Actions ingestion and calculation workflows are also deterministic jobs unless a future inventory
entry identifies a real provider Capability boundary. File presence, a model string in stored data, or an old
archived plist is insufficient to classify a job as a Provider Adapter.

### Comparison with the #30 planning baseline

| Observation in #30 | Fresh observation | Assessment |
| --- | --- | --- |
| 36 Claude skill sources | 36 | Unchanged. |
| 36 repository headless mirrors | 36 | Unchanged. |
| Four stale mirror bodies | Zero stale bodies | Changed because the clean implementation base excludes unrelated in-progress source edits. This is reviewed state, not a conformance result or an in-ticket repair. |
| Four active workflows absent from curated bridge routing | Same four | Unchanged evidence/routing gap. |
| Two bespoke and 34 generic headless contracts | Same split | Unchanged headless-readiness gap. |
| Four live Claude-dependent scheduled workflow families | Same four, implemented by five launchd jobs | Unchanged operational migration boundary; the two options-advisor modes share one workflow and wrapper. |

### Worktree boundary

Before J1 implementation, the main worktree contained 57 unrelated tracked and untracked paths spanning
accounting, adapters, belief-layer work, and automation. Those changes were preserved intact in the named Git
stash `pre-j1 dirty main preservation 2026-08-04` (stash commit
`01674a41c53aa3281b8d865ca4655c7004cea5d0`; untracked parent
`9b43600e37a0e0c3ea663c5df79411aaa1d0da53`). They are excluded from J1 branches and must not be dropped,
normalized, or used as adoption evidence.

J1's safe boundary is governance and discovery only: canonical guidance, tracker semantics, Workspace
manifest/registry/declarations, generated Provider Entry Points, inventory, validation integration, and
acceptance evidence. It excludes application code, database/schema and migrations, ingestion, calculations,
portfolio or tax behavior, live skill behavior, live automation configuration, external bridge content, and
the preserved stash. Each downstream ticket starts from the preceding accepted J1 merge on clean `main`.

## Safeguards generated guidance must preserve

Any later neutral-guidance extraction and whole-file generation must retain these established Trade Journal
rules without changing their domain meaning:

- Remote Supabase is the single source of truth. Reads use `scripts/psql-query.ts`; writes use purpose-built
  operations scripts rather than ad hoc SQL or Supabase MCP.
- Schema changes start in `src/db/schema.ts`, include a SQL migration, are applied immediately through the
  configured PostgreSQL client, and are verified. Package/lock changes require the npm 10 dry-run gate.
- Preserve the decision hierarchy **macro thesis → asset thesis → strategy → position**. Strategies are
  tactical expressions; theses are long-lived beliefs.
- `monitoring` means a live expression and is cascade-derived during ingestion. It is not an information gate.
  An unexpressed thesis becomes `closed`, not rejected as cleanup.
- Signals are the auto-derived resolution section of an articulation. `configure-signal` is retired; linkage
  lives in `signal_entity_links`.
- Producers surface genuine judgment as Decision Items; resolvers act on it. Headless execution must never
  fabricate or silently resolve genuine user judgment.
- Claims retain provenance and reuse existing source claims. Notes/Tana owns capture and thinking; Trade
  Journal owns investment entities. Cross-repository contracts remain references.
- Radon owns IBKR access beyond Flex, including bulk chains, contract qualification, gateway operation, and
  the Trade Journal client-id boundary of 20–49.
- The persistent development server, build/restart rule, automation lock/timeout/observability behavior,
  credential boundaries, and explicit off-switches remain intact.
- Everything auditable lands in `journal_entries`; derived values are computed during ingestion and stored,
  not recomputed on query.

## Gap classification and downstream use

| Class | Gate finding | Downstream disposition |
| --- | --- | --- |
| Implementation | Canonical `CONTEXT.md`, `docs/adr/`, manifest, Registry/declaration, generated outputs, validation integration, and acceptance evidence are absent. Live `needs-triage` wording is not W1-exact. W1 validates only shallow manifest adapter declarations and source-owned Capability packages, not J1's richer standalone inventory semantics. | Resolve repository surfaces only in the scoped J1 adoption tickets, using the accepted W1 CLI. Prefer canonical paths; do not create a deviation merely for convenience. Reconcile any downstream criterion that expects rich-inventory validation with this accepted public boundary rather than claiming unsupported CLI coverage. |
| Potential deviation | No deviation is justified by this baseline. Whole-file guidance generation or another canonical requirement may expose a temporary safe-migration constraint. | If a requirement genuinely cannot be met safely, declare only a W1-permitted path deviation with requirement, exact declaration, owner, rationale, compensating mapping, review date, and expiry. Never waive semantics. |
| Evidence | No Trade Journal adapter has evidence bound to an accepted source-owned Capability version, package digest, adapter digest, requirements, and freshness date. Parity, historical runs, and file presence are inventory evidence only. Host-only connectors, credentials, Claude login, Tana, WebSearch, Radon/IB Gateway, and live tracker access require eligible-environment results. | Inventory exact states honestly. Do not label an adapter `current` without W1-valid evidence; record `partial`, `stale`, `experimental`, `deprecated`, or `unavailable` as appropriate. |
| J2 migration | Four live Claude-dependent workflow families, 34 generic headless wrappers, curated bridge omissions, connector-era skills, lifecycle cleanup, and provider-specific tool translation remain. | Prioritize live automation by operational risk after J1 acceptance. Migrate, retain temporarily, replace, retire, or defer one boundary at a time; do not change runtime behavior in J1. |

Downstream tickets must cite this file for the W1 pin and execution-time baseline. They must also read their
own GitHub acceptance criteria and the accepted W1 sources directly. This record freezes the input boundary;
it is not permission to infer missing declarations, repair unrelated drift, or claim conformance early.
