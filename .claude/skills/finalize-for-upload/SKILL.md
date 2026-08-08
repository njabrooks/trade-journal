---
name: finalize-for-upload
description: Prepare and explicitly authorize governed publication of Notes-owned research claims into Trade Journal without duplicating provenance or expanding publication into investment-state authority.
allowed-tools: Read, Bash
---

# Governed Research Publication

## Purpose

Publish accepted investment claims and claim-to-thesis relationships from a
validated claims-synthesis recommendation. The governed Capability at
`capabilities/research-publication/capability-package.json` and the active
provider adapter are authoritative for execution.

This workflow modernizes the useful intent formerly called “finalize for
upload.” It does not accept Obsidian directories, generic uploads, legacy
intelligence reports, triage records, or “views” as authority.

## Authority boundary

- Notes/Tana owns capture, source material, and Toulmin extraction.
- Trade Journal owns promoted investment entities, publication state, and
  governed relationships.
- Exact `(sourceInsightId, sourceClaimId)` provenance identifies a promoted
  source claim. Reuse it; never duplicate it.
- `capability:scope:trade-journal/claims-synthesis` produces recommendations
  only. It cannot authorize or perform publication.
- Only the current user can accept exact claim candidates and exact governed
  relationships for publication.
- Provider adapters have no direct database authority. The sole mutation
  boundary is `scripts/ops/publish-research.ts --stdin`.

## Inputs

Require:

1. one explicit Trade Journal research insight UUID;
2. one validated `claims-synthesis` version 1.x recommendation-only result;
3. for persistence, the current user's explicit acceptance of exact prepared
   `mainClaimRef` and `relationshipId` values.

Missing, unavailable, stale, incomplete, malformed, or ambiguous input is a
refusal. Do not infer it.

## Workflow

### 1. Resolve and prepare

Resolve `capability:scope:trade-journal/claims-synthesis` through the published
Registry Lock. From the repository root, run:

```bash
npx tsx scripts/research-publication.ts --prepare \
  --insight-id <uuid> \
  --synthesis-result <file|->
```

Continue only for `status: authorization_required`. The command is read-only
and binds the complete current source, existing-claim catalog, and developing
or monitoring thesis catalog to `publicationDigest`.

Keep these concepts distinct:

- `sourceEvidence`: Notes-owned Toulmin assertions;
- `synthesizedRecommendations`: advisory claims-synthesis actions;
- `claimCandidates`: existing exact-provenance claims or proposed new draft
  investment claims;
- `relationshipCandidates`: unambiguous proposed claim-to-thesis bearings;
- `authorization`: the user's separate exact publication decision.

Excluded or ambiguous material is not eligible. Ticker and keyword overlap is
never semantic proof.

### 2. Obtain exact user authorization

Show the user the bounded candidate set, exclusions, exact permitted write
surface, and limitations. The user must explicitly accept exact claim refs and
relationship IDs. Every accepted claim must be used by at least one accepted
relationship, and no relationship may refer to an unaccepted claim.

Only after explicit acceptance may the interactive adapter serialize that
decision into a `research_publication_authorization` version `1.0.0` token. It
must:

- use a fresh UUID `authorizationId`;
- set `authorizedBy` exactly to `user`;
- use canonical ISO `authorizedAt` and `expiresAt` instants no more than 24
  hours apart;
- bind the exact `publicationDigest`;
- name unique `acceptedClaimRefs` and `acceptedRelationshipIds`;
- use the exact statement emitted by the governed contract.

Never infer, fabricate, broaden, self-authorize, or silently reuse a token for
different canonical JSON content.

Validate without writes:

```bash
npx tsx scripts/research-publication.ts \
  --validate-authorization <file|-> \
  --publication <prepared-file>
```

### 3. Publish through the sole recorder

When and only when the exact validated token encodes the current user's
explicit decision, send this exact envelope once:

```json
{
  "prepared": "<exact prepared result object>",
  "authorization": "<exact authorization token object>"
}
```

```bash
<publication-envelope.json npx tsx scripts/ops/publish-research.ts --stdin
```

The serializable recorder re-reads current repository state and may only:

1. reuse an exact provenance-bearing `main_claims` row or insert one accepted
   new claim with `status=draft` and preserved Toulmin/provenance fields;
2. reuse or insert accepted `claim_thesis_mappings` rows;
3. insert one complete `research_publication_recorded` `journal_entries` audit.

It uses the authorization UUID as the batch/idempotency key. A canonically
identical JSON retry returns the recorded result. Changed canonical authorization content, stale source or
catalog state, conflicting provenance, conflicting relationship semantics, or
any partial failure is refused and rolled back.

## Prohibited authority

Do not use ad-hoc SQL, Supabase MCP writes, direct API mutation, generic write
helpers, temporary write scripts, or legacy upload paths. Do not create or
change research artifacts or insights, evidence links, theses, signals,
Decision Items, strategies, positions, orders, or trades. Do not change entity
or thesis status, resolve Decision Items, configure signals, operate schedulers
or credentials, change provider discovery, or alter live operational state.

## Unattended boundary

Unattended execution cannot authorize or publish. Claim selection and
thesis-bearing acceptance are genuine user judgment. Headless execution may
only prepare or validate and must return `authorization_required`, `unavailable`,
or `refused` with `writes: []`.

## Output

For preparation, return the exact bounded repository result. For publication,
return the exact recorder result with created/reused dispositions, table-level
write counts, authorization/batch ID, source digest, and journal entry ID.
Never report readiness as completed publication.
