---
name: options-advisor
description: Portfolio-aware options advisor (D11). Generates scenario recommendations against the live book — hedge (downside protection for unhedged exposures), income (covered calls on run-up holds), put_entry (cash-secured puts on bullish-thesis names), opportunistic (judgment over vol-regime extremes). Use when the user asks to "hedge the book", "run the advisor", "sell some calls", "income on holds", "put entries", or wants options recommendations keyed to current positions and vol. Results are stored and surface on the dashboard advisor module.
allowed-tools: Bash, Read
user_invocable: true
---

# Options Advisor — portfolio-aware recommendations

## Purpose

Turn the scanner from "find cheap options" into **proactive, portfolio-aware
strategy recommendations** (decision D11). Four scenario classes, all
implemented: `hedge`, `income`, `put_entry`, `opportunistic`. Run the
scenario(s) the user asked for; "run the advisor" with no qualifier = all four.

Division of labour:
- `scripts/options-advisor.ts` does the **math** — exposures, chains, candidate
  structures, cost/yield metrics, vol context
- **You do the judgment** — which candidates deserve a recommendation, which
  structure, and why, in the context of theses and recent journal activity
- `scripts/ops/save-advisor-recommendations.ts` persists per-scenario batches
  (a new batch supersedes the prior active one FOR THAT SCENARIO only); the
  dashboard advisor module displays them grouped by scenario

## Step 1 — Run the engine

```bash
cd trade-journal && npx tsx scripts/options-advisor.ts --scenario hedge > /tmp/advisor-hedge.json
# scenarios: hedge | income | put_entry | opportunistic
```

(`--min-exposure <usd>` to change the default $50K floor for hedge/income.)

**hedge** — per net-long exposure ≥ floor: existing hedges (long puts / short
calls), vol regime, and priced structures — protective puts (~95/90/85%
protection, ~90/180 DTE) and put spreads (long ~90% / short ~75%) — with
`costPct`, `annualizedCostPct`, `protectionLevel`, `maxLossPct`,
`contractsForFullHedge`. `skipped` lists exposures with no usable chain (e.g.
HYPE has no listed options — flag large ones; futures/perps are the only
hedge there).

**income** — per held exposure ≥ floor: short calls at ~105/110/115% strikes,
~30/60 DTE, with `premiumYieldPct`, `annualizedYieldPct`,
`strikeHeadroomPct`, `totalReturnIfAssignedPct`, `contractsForFullCover`,
plus `runUpPct` (unrealized as % of cost basis) and `existingHedge.shortCalls`
(already partially covered?).

**put_entry** — per bullish-thesis ticker (held or not; `thesis` and
`exposureUsd` included): short puts at ~95/90/85% strikes, ~30/60 DTE, with
`yieldOnCollateralPct`, `annualizedYieldOnCollateralPct`, `entryDiscountPct`,
`effectiveEntryDiscountPct`, `collateralPerContract`.

**opportunistic** — no structures; a context payload: `cheapEntries`
(cheap-vol scan hits with a bullish thesis or held position — long-vol
expression candidates; use `/analyze-vol-curve` for strike work) and
`richHolds` (rich-vol holds — premium-selling, overlaps income). Only save
opportunistic recommendations after doing real strike work.

## Step 2 — Judge

Gather thesis context for the candidate tickers before selecting:

```bash
npx tsx scripts/psql-query.ts "SELECT u.ticker, at.title, at.status, at.confidence_level, at.direction FROM asset_theses at JOIN underlyings u ON u.id = at.underlying_id WHERE u.ticker IN ('GLXY','TSLA') AND at.status IN ('developing','monitoring','active')" --format json
```

Selection principles — hedge:
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
- Pick **one structure per ticker**: default to the ~90-DTE put spread for
  carry; prefer the outright put when vol is genuinely cheap (IV percentile
  < ~40) or the position is a concentration risk where capped protection is
  inadequate.

Selection principles — income:
- **Run-up + rich vol is the setup.** High `runUpPct` and `rich`/high IV
  percentile = the trade. Cheap vol = weak premium; usually skip.
- **Never cap a conviction breakout cheaply.** Check the thesis and target
  price — if spot is far below target, selling 105% calls fights the thesis;
  prefer 110–115% strikes or skip. Say which in the rationale.
- **`existingHedge.shortCalls > 0`** means already partially covered.
- Favour the ~30-DTE tenor for decay; 60-DTE only when the extra premium is
  disproportionate.
- Cover a FRACTION (a third to a half) of the position unless the thesis is
  near target — note suggested coverage in the rationale.

Selection principles — put_entry:
- **Only names you'd genuinely own more of at the strike.** The thesis is
  attached — high-confidence developing/monitoring theses first.
- **Rich vol = better yield.** Prefer candidates where IV percentile is high;
  `effectiveEntryDiscountPct` is the real entry level if assigned.
- **Mind collateral.** `collateralPerContract` × contracts must be sane vs
  NAV; say the total in the rationale.
- Skip names already at heavy exposure (`exposureUsd` is included) — selling
  puts there adds concentration, not entry.

Batch discipline (all scenarios):
- **Cap each batch at ~5.** Genuine recommendations only — this feeds a
  glanceable module, not an inbox.

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
