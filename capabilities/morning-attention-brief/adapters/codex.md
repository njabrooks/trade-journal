## Codex Provider Adapter

Accept `briefDate` and optional `dryRun`; reject a missing or invalid date. From the Trade Journal root, load `.agents/skills/morning-brief/SKILL.md` and gather the sole input with `npx tsx scripts/morning-brief-data.ts --json`.

Check the bundle's timestamps and stale flags for the required upstream producers. Use only that bundle: do not browse, re-query for extra evidence, or fill missing state with assumptions. Produce one headline, zero to five ranked attention items, the bounded Markdown body, and metadata containing the bundle generation time and input counts.

When not in dry-run, persist only with `npx tsx scripts/ops/save-morning-brief.ts --stdin`; the operation is keyed by `brief_date`, so a same-date rerun replaces the existing row and leaves exactly one row. Return JSON containing `success`, `briefDate`, `freshness`, `headline`, `attention`, `persisted`, `write`, `unavailableInputs`, and `errors`.

This adapter is synthesis-only. It must not invoke any other write operation, write `journal_entries`, raise or resolve a Decision Item, save advisor recommendations, or mutate a thesis, claim, signal, strategy, position, or status. Missing credentials or sandbox denial is an explicit unavailable or failed result.
