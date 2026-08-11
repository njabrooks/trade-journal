## Claude Provider Adapter

1. Confirm the request is interactive and rooted in the Trade Journal checkout. Read `CONTEXT.md`, `CLAUDE.md`, and the applicable repository guidance before routing.
2. Use `docs/agents/provider-adapters/interactive-inventory.json` as the exhaustive workflow catalog. Match the request against each entry's ability, Capability identity, lifecycle, prerequisites, limitations, and authority/write scope. If materially different candidates remain, ask the user to choose; do not guess across authority or write boundaries.
3. For a selected entry with current evidence, resolve the Capability through `capability-registry-lock.json` and use its exact `claude` Provider Adapter. Do not substitute a Codex adapter, a legacy skill body, or prose copied into this discovery adapter.
4. For a selected entry with unavailable evidence, route only when it has an active repository-authored source or migration input and the interactive environment satisfies its prerequisites. Invoke or read the exact `.claude/skills/<name>/SKILL.md` source and state that the workflow is not governed or eligible for unattended execution.
5. If an explicitly named entry is a protective tombstone, return its refusal boundary. Never route historical evidence under `docs/archive/provider-adapters/` as an executable workflow.
6. Return the selected inventory id, Capability id or non-candidate state, exact source path, evidence state, limitations, and unmet prerequisites before any later workflow execution begins.

Discovery is read-only and must not execute the selected workflow, call a provider, query or mutate a database, alter investment state, resolve user judgment, update GitHub, change a scheduler, or write across a repository boundary. A later workflow invocation remains subject to its own user authority and safeguards.

Claude's repository-authored `CLAUDE.md`, `.claude/skills/`, and SessionStart hooks are provider packaging, not a transfer of semantic authority. The validated inventory and exact selected source remain authoritative for routing and execution boundaries.
