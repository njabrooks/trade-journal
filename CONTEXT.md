# Trade Journal domain and operating context

Trade Journal is a single-context personal investment system. This file is the provider-neutral canonical
entry point for its domain vocabulary and repository-critical operating rules. `CLAUDE.md` and `AGENTS.md`
package these rules for particular agent runtimes; they do not override this shared context.

## Domain model

The decision hierarchy is **macro thesis → asset thesis → strategy → position**.

- A macro thesis is a long-lived belief about a broad economic or market regime.
- An asset thesis is a long-lived belief about one asset or underlying.
- A strategy is a tactical expression of one or more theses.
- A position is the live or historical implementation of a strategy.
- A claim is a provenance-bearing unit of research evidence that can support or challenge a thesis.
- A signal is the auto-derived resolution section of a thesis articulation. Signal linkage lives in
  `signal_entity_links`; the retired `configure-signal` workflow is not a current configuration path.
- A Decision Item is an auditable request for genuine human judgment. Producers surface Decision Items;
  resolvers act on them. Unattended workflows must not fabricate or silently resolve user judgment.

`monitoring` is a position-expression flag, not an information gate. Thesis status is derived during
ingestion by the expression cascade. An expressed thesis is `monitoring`; a previously expressed but flat
thesis becomes `closed` and may return to `monitoring`. Do not reject or delete an intact thesis as cleanup.

## Record and data authority

Remote Supabase is the single source of truth for Trade Journal investment entities. Database reads use
`scripts/psql-query.ts`; writes use purpose-built scripts under `scripts/ops/`, never ad hoc SQL or a generic
provider connector. Everything auditable lands in `journal_entries`. Derived values are computed during
ingestion and stored rather than recomputed on query.

Schema changes begin in `src/db/schema.ts`, include a migration under `migrations/`, are applied immediately
through the configured PostgreSQL client, and are verified. A package or lockfile change also requires the
npm 10 clean-install dry-run gate.

GitHub Issues in `njabrooks/trade-journal` are the Record Authority for repository-owned Work Items. Native
GitHub sub-issues and dependencies are preferred; issue-body text is only a fallback when a Record Authority
lacks the native primitive. Cross-repository coordination links to Trade Journal Work Items and does not
duplicate their authority.

## Federated boundaries

- The Notes/Tana system owns capture and thinking. Promoted investment claims retain provenance and reuse
  existing source claims; Trade Journal owns the resulting investment entities.
- Radon owns IBKR access beyond Flex, including bulk option chains, contract qualification, gateway
  operation, and the Trade Journal client-id range 20–49.
- Workspace owns Workspace Standard and shared Capability contracts. Trade Journal references those
  authorities rather than copying or redefining them.
- Machine-local credentials, browser sessions, Claude/Codex login state, notifications, and IB Gateway
  availability are environmental prerequisites, not repository-owned guarantees.

## Runtime safeguards

The persistent development server is machine managed. Do not start a competing server on its port. A
production build is followed by restarting the existing service because the build can invalidate its route
cache. Scheduled automation retains its explicit off-switches, per-job locking, stale-lock handling, process-
group timeouts, logs, status records, and failure notifications.

Provider-specific tools, prompts, permissions, and packaging remain separately authored. A generated mirror
or generic headless wrapper proves packaging coverage only; it does not prove safe unattended execution or
Adapter Conformance. Live provider-dependent automation must preserve its declared read/write and judgment
boundaries until a separately accepted migration changes them.

## Further context

- `docs/v2/` records product direction and the loose-agent model.
- `docs/adr/` is the canonical location for durable architecture decisions.
- `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` explain discovery
  and tracker use.
- `docs/agents/provider-adapters/` records supporting interactive and headless adapter inventories.

