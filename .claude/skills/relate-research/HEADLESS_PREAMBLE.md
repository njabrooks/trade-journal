# HEADLESS MODE — Relate Research (governed preparation only)

This is a bespoke unattended execution contract for the staged
`capability:scope:trade-journal/belief-research-relation`. The canonical interactive workflow remains in
`SKILL.md`; unattended execution does not inherit its write authority.

## Required parameters

- `mode`: exactly `prepare` or `validate_result`.
- `insightId`: one explicit Trade Journal research-insight UUID.
- `preparedContext`: required in `validate_result` mode; the complete result of the deterministic prepare command.
- `providerResult`: required in `validate_result` mode; a recommendation-only provider result for the exact context.

Do not infer a missing parameter, source, claim identity, thesis target, relationship, or authorization.

## Execution

Run from `/Users/home-hub/projects/trade-journal`.

- `prepare`: run `npx tsx scripts/belief-research-relation.ts --prepare --insight-id <insightId>`.
- `validate_result`: validate the supplied exact bytes with
  `npx tsx scripts/belief-research-relation.ts --validate-result <providerResult-file|-> --context <preparedContext-file>`.

The boundary reads only approved repository state. It accepts developing and monitoring theses. Holdings,
ticker overlap, keyword overlap, and provider recommendations are never semantic proof. Exact Notes provenance
must be reused; it must never be duplicated. Preserve Toulmin qualifiers and rebuttals and return explicit
`claim_identity` or `thesis_bearing` ambiguity rather than making a judgment. Preserve honest relationship
confidence: every refuting relation requires unresolved `review_refuting_claim`, while tentative supporting or
foundational relations require unresolved `confirm_claim_link` during interactive governed preparation.

## Forbidden unattended authority

Do not create a `belief_research_relation_authorization` token. Do not run
`scripts/ops/record-belief-research-relation.ts`, legacy `scripts/relate-research.ts --apply`, ad-hoc SQL,
Supabase MCP writes, direct APIs, or generic writers. Do not create claims, persist mappings or Decision Items,
change thesis or entity status, resolve decisions, mutate strategies or positions, trade, change credentials,
change provider discovery, or alter schedulers. Missing, stale, malformed, unavailable, sandbox-denied, or
ambiguous input is an explicit refused/unavailable result with no writes.

## Output contract

Return exactly one JSON object:

```json
{
  "success": true,
  "skill": "relate-research",
  "mode": "prepare|validate_result",
  "status": "ready|unavailable|refused",
  "contextDigest": "sha256:<hex>|null",
  "result": {},
  "ambiguities": [],
  "limitations": [],
  "writes": []
}
```

On failure, use `success: false`, an exact `error`, and `writes: []`. Unattended execution is conditionally
eligible only for these non-mutating preparation and validation modes; genuine judgment and every write remain
ineligible.
