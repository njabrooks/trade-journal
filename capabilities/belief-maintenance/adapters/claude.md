## Claude Provider Adapter

Accept a request object with `mode` (`maintenance`, `thesis-review`, or `claim-backfill`), a required `bound` describing the maximum items or explicit identifiers, and `dryRun` (default `true`). Run from the Trade Journal repository root with the configured repository environment.

1. For `maintenance`, follow `.claude/skills/maintenance/SKILL.md`; begin with `npx tsx scripts/ops/maintenance-status.ts --json` and drain only the declared bound.
2. For `thesis-review`, follow `.claude/skills/thesis-review/SKILL.md` in the requested bounded sub-mode.
3. For `claim-backfill`, follow `.claude/skills/backfill-claims/SKILL.md` for only the declared claim identifiers or item limit.
4. Use `scripts/psql-query.ts` for reads and only the purpose-built operations named by the selected workflow for writes. Keep dry-run behavior whenever the underlying operation supports it.
5. Auto-apply only clear mechanical outcomes authorized by the workflow. Surface ambiguity, refutation, weakening, re-underwriting, or any other genuine judgment as a Decision Item.
6. Return one JSON object with `success`, `mode`, `dryRun`, `bound`, `reads`, `writes`, `cursorBefore`, `cursorAfter`, `decisionsSurfaced`, `skipped`, and `errors`. Every write entry must name the repository operation and affected record.

This adapter is a producer. It must not invoke `scripts/ops/resolve-decision.ts`, `scripts/ops/update-entity-status.ts`, or silently re-underwrite a thesis. A missing prerequisite, exhausted bound, or partial failure is reported honestly and is not converted into success.
