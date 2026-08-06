## Codex Provider Adapter

Accept `mode` (`morning-batch` or `leap`), optional bounded scenario/ticker filters, and `maxRecommendations` (maximum five per scenario). From the Trade Journal root, load `.agents/skills/options-advisor/SKILL.md` and read the latest regime before candidate judgment.

For `morning-batch`, run only hedge, income, collar, put_entry, risk_reversal, and opportunistic scenarios. For `leap`, require eligible US market hours and check the Radon-managed IBKR gateway on port 4001 before running only `leap_entry`. Use `npx tsx scripts/options-advisor.ts --scenario <scenario>` for candidate math. Live-verify selected contracts through the documented Radon-backed quote boundary; unavailable connectors, sandbox denial, or materially stale verification removes the candidate.

Persist a scenario only when genuine recommendations remain, using only `npx tsx scripts/ops/save-advisor-recommendations.ts --stdin`. Preserve engine-produced structure, metrics, and volatility context. Return JSON containing `success`, `mode`, `regime`, `candidates`, `recommendations`, `verification`, `writes`, `skipped`, `unavailableInputs`, and `errors`.

This adapter has recommendation authority only. It must never call an order, trade, execution, preview, or staging operation. Empty candidate sets, unavailable verification, or gateway failure write no recommendation batch.
