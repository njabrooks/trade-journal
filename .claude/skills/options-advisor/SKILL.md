---
name: options-advisor
description: Portfolio-aware options advisor (D11). Generates scenario recommendations against the live book — currently the HEDGE scenario (cheap downside protection for large unhedged exposures). Use when the user asks to "hedge the book", "run the advisor", "find hedges", or wants options recommendations keyed to current positions and vol. Results are stored and surface on the dashboard advisor module.
allowed-tools: Bash, Read
user_invocable: true
---

# Options Advisor — portfolio-aware recommendations

## Purpose

Turn the scanner from "find cheap options" into **proactive, portfolio-aware
strategy recommendations** (decision D11). Scenario classes: hedge / income on
holds / put-entry on pullback / opportunistic. **Only `hedge` is implemented**
— the others arrive scenario by scenario; tell the user this if they ask for
one of them.

Division of labour:
- `scripts/options-advisor.ts` does the **math** — exposures, chains, candidate
  structures, cost metrics, vol context
- **You do the judgment** — which exposures actually need hedging, which
  structure, and why, in the context of theses and recent journal activity
- `scripts/ops/save-advisor-recommendations.ts` persists the batch; the
  dashboard advisor module displays it

## Step 1 — Run the engine

```bash
cd trade-journal && npx tsx scripts/options-advisor.ts --scenario hedge > /tmp/advisor-hedge.json
```

(`--min-exposure <usd>` to change the default $50K floor.)

Per candidate you get: net exposure (USD and % NAV), existing hedges (long
puts / short calls on the underlying), vol regime from the latest scan, and
priced structures — protective puts (~95/90/85% protection, ~90/180 DTE
tenors) and put spreads (long ~90% / short ~75%) — each with `costPct`,
`annualizedCostPct`, `protectionLevel`, `maxLossPct`, `contractsForFullHedge`.
`skipped` lists exposures with no usable chain (e.g. HYPE has no listed
options — flag large ones to the user; futures/perps are the only hedge
there).

## Step 2 — Judge

Gather thesis context for the candidate tickers before selecting:

```bash
npx tsx scripts/psql-query.ts "SELECT u.ticker, at.title, at.status, at.confidence_level, at.direction FROM asset_theses at JOIN underlyings u ON u.id = at.underlying_id WHERE u.ticker IN ('GLXY','TSLA') AND at.status IN ('developing','monitoring','active')" --format json
```

Selection principles:
- **Concentration first.** A position >10% NAV with no hedge is a finding in
  itself, almost regardless of cost.
- **Vol regime matters.** `cheap` regime / low IV percentile = protection is
  on sale — favour outright puts. `rich` = favour put spreads (selling the
  expensive lower strike finances the hedge) or flag that hedging is dear.
- **Respect existing hedges.** `existingHedge.longPuts > 0` means partially
  covered — only recommend topping up if exposure dwarfs the cover.
- **Thesis context.** A bullish monitoring thesis doesn't argue against
  hedging (hedge ≠ doubt), but note tension if the thesis is near completion
  or invalidation — closing might beat hedging; say so in the rationale.
- **Cap the batch at ~5.** Genuine recommendations only — this feeds a
  glanceable module, not an inbox.
- Pick **one structure per ticker**: default to the ~90-DTE put spread for
  carry; prefer the outright put when vol is genuinely cheap (IV percentile
  < ~40) or the position is a concentration risk where capped protection is
  inadequate.

Optionally sanity-check the chosen structure's pricing live via `/ibkr-quote`
(EOD chain marks can drift); note in the rationale if you did.

## Step 3 — Save the batch

Build the batch JSON and pipe it in (supersedes the previous active batch for
the scenario; default expiry 7 days):

```bash
cat <<'JSON' | npx tsx scripts/ops/save-advisor-recommendations.ts --stdin
{
  "scenario": "hedge",
  "recommendations": [
    {
      "ticker": "GLXY",
      "exposureUsd": 2633553,
      "pctNav": 0.221,
      "structure": { "type": "put_spread", "legs": [ ...engine legs verbatim... ] },
      "metrics": { ...engine metrics verbatim... },
      "volContext": { ...engine volContext... },
      "rationale": "22% of NAV unhedged; Dec 30/25 put spread caps a drawdown past -10% for 6.8% carry..."
    }
  ]
}
JSON
```

Copy `structure`, `metrics`, and `volContext` **verbatim from the engine
output** — only `rationale` (and the selection itself) is yours.

## Step 4 — Report

Tell the user: how many recommendations, the headline (largest unhedged
exposure), total cost of the recommended protection vs NAV, and that the batch
is live on the dashboard (Options Scanner module) with prior batches
superseded. Surface any large `skipped` exposures (no listed options).

## Scheduling note

Post-scan daily runs are a follow-up: the launchd options-scanner job
(Mon–Fri 14:50) can chain this skill after the scan once the advisor has
bedded in. On-demand only for now.
