## Claude Provider Adapter

Accept `asOf`, an optional explicit `thesisIds` subset, and `maxTheses`; reject an unbounded request. From the Trade Journal root, follow `.claude/skills/thesis-observe/SKILL.md` and load the due bundle with `npx tsx scripts/ops/find-theses-due-observe.ts --json`.

Use Claude's current web research tools for attributable, recent sources and the repository's supplied price context. Do not infer a pass from missing news, stale price data, login failure, or an unavailable source. For collector-tracked signals, preserve the deterministic deferral in the bundle.

Produce the workflow's directive report with signal identifier, score, evidence, assessment, and change from prior, then use only the documented thesis-observe ingestion boundary. Return JSON containing `success`, `asOf`, `thesesObserved`, `signalsAssessed`, `directives`, `writes`, `unavailableInputs`, and `errors`.

This adapter is sensing-only. Its writes are limited to the observation artifact, `signal_data_snapshots`, and corresponding journal history. It must not invoke `scripts/ops/resolve-decision.ts`, `scripts/ops/update-entity-status.ts`, raise a Decision Item, or change thesis, strategy, claim, or signal status.
