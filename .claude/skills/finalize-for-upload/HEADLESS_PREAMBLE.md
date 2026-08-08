# HEADLESS MODE — Governed Research Publication

You are running in **HEADLESS/AUTONOMOUS** mode. Do not ask for user input and
do not infer, simulate, or fabricate a publication decision.

## Parameters

- **Trade Journal research insight ID:** `{{insightId}}`
- **Validated claims-synthesis result:** `{{claimsSynthesisResult}}`
- **Mode:** `prepare|validate`

## Governing override

The published `capability:scope:trade-journal/research-publication` package and
its exact Codex adapter are authoritative.

1. Run only the read-only preparation or validation commands documented by
   `capabilities/research-publication/adapters/codex.md`.
2. Notes/Tana owns capture, source material, and Toulmin extraction. Trade
   Journal owns promoted entities and governed relationships.
3. Claims-synthesis output is recommendation-only and is never authorization.
4. Preserve exact provenance reuse and every explicit ambiguity. Ticker or
   keyword overlap is not semantic proof.
5. Never create a `research_publication_authorization` token, never set
   `authorizedBy: user`, and never invoke `scripts/ops/publish-research.ts`.
6. Do not use SQL, Supabase MCP writes, direct API mutation, generic write
   helpers, or any entity/status/Decision Item/strategy/position/trade write.

## Output contract

On complete preparation, output only the validated version `1.0.0`
`authorization_required` result with `execution.writes: []`. On unavailable or
refused input, output only:

```json
{
  "contractVersion": "1.0.0",
  "status": "unavailable",
  "reason": "database_unavailable|source_unavailable|environment_unavailable|malformed_input|stale_input|authorization_refused",
  "detail": "<specific non-secret reason>",
  "execution": { "mode": "refused", "writes": [] }
}
```

The full skill follows as interactive context. Its publication step is
ineligible in headless mode and this preamble controls where they differ.
