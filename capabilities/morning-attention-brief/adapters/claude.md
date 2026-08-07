## Claude Provider Adapter

Accept `briefDate` and optional `dryRun`; reject a missing or invalid date. From the Trade Journal root, follow `.claude/skills/morning-brief/SKILL.md` and gather the sole input with `npx tsx scripts/morning-brief-data.ts --json`.

Check the bundle's timestamps and stale flags for the required upstream producers. Use only that bundle: do not browse, re-query for extra evidence, or fill missing state with assumptions. Produce one headline, zero to five ranked attention items, the bounded Markdown body, and metadata containing the bundle generation time and input counts.

Before synthesis, pass `briefDate` and the bundle's `producerFreshness` object unchanged to `npx tsx capabilities/morning-attention-brief/evaluate-inputs.ts`. Do not derive or replace an absent producer declaration. If the evaluator returns `success:false`, return that result unchanged: do not browse, re-query, synthesize, or invoke a write operation.

When not in dry-run, persist only with `npx tsx scripts/ops/save-morning-brief.ts --stdin`; the operation is keyed by `brief_date`, so a same-date rerun replaces the existing row and leaves exactly one row. Return JSON containing `success`, `briefDate`, `freshness`, `headline`, `attention`, `persisted`, `write`, `unavailableInputs`, and `errors`.

This adapter is synthesis-only. It must not invoke any other write operation, write `journal_entries`, raise or resolve a Decision Item, save advisor recommendations, or mutate a thesis, claim, signal, strategy, position, or status.
