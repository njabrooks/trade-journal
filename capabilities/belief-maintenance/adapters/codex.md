## Codex Provider Adapter

Accept a request object with `mode` (`maintenance`, `thesis-review`, or `claim-backfill`), a required `bound` describing the maximum items or explicit identifiers, and `dryRun` (default `true`). Run from the Trade Journal repository root with the configured repository environment.

1. For `maintenance`, load `.agents/skills/maintenance/SKILL.md`; begin with `npx tsx scripts/ops/maintenance-status.ts --json` and drain only the declared bound.
2. For `thesis-review`, load `.agents/skills/thesis-review/SKILL.md` and execute only the requested bounded sub-mode.
3. For `claim-backfill`, load `.agents/skills/backfill-claims/SKILL.md` and process only the declared claim identifiers or item limit.
4. Use the repository command runner, `scripts/psql-query.ts` for reads, and only purpose-built operations named by the selected workflow for writes. Respect sandbox or approval refusal as an unavailable or failed result.
5. Auto-apply only clear mechanical outcomes authorized by the workflow. Surface ambiguity, refutation, weakening, re-underwriting, or any other genuine judgment as a Decision Item.
6. Return one JSON object with `success`, `mode`, `dryRun`, `bound`, `reads`, `writes`, `cursorBefore`, `cursorAfter`, `decisionsSurfaced`, `skipped`, and `errors`. Every write entry must name the repository operation and affected record.

This adapter is a producer. It must not invoke `scripts/ops/resolve-decision.ts`, `scripts/ops/update-entity-status.ts`, or silently re-underwrite a thesis. Missing credentials, Tana unavailability, sandbox denial, an exhausted bound, or partial failure must be reported honestly.
