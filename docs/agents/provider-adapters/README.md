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
