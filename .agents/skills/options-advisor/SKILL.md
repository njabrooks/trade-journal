# Options Advisor — portfolio-aware recommendations

## Purpose

Turn the scanner from "find cheap options" into **proactive, portfolio-aware
strategy recommendations** (decision D11 + docs/v2/21). Seven scenario
classes, all implemented: `hedge`, `income`, `put_entry`, `collar`,
`risk_reversal`, `leap_entry`, `opportunistic`. Run the scenario(s) the user
asked for; "run the advisor" with no qualifier = all except `leap_entry` (it
hits the live IB Gateway at ~1 min/ticker — run it when asked, on the
scheduled producer, or when the regime/vol context makes long-dated entries
topical).

**Regime context first:** read the latest `regime_snapshots` (CRI band + VCG)
before judging — an elevated crash-risk read promotes hedge/collar batches and
argues against fresh undefined-risk risk reversals; say so in rationales.

```bash
npx tsx scripts/psql-query.ts "SELECT DISTINCT ON (source) source, band, score, scan_time FROM regime_snapshots ORDER BY source, scan_time DESC" --format json
```

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
# scenarios: hedge | income | put_entry | leap_entry | opportunistic
```

(`--min-exposure <usd>` to change the default $50K floor for hedge/income;
`--max-tickers <n>` to change leap_entry's default 10-ticker universe cap.)

Before a `leap_entry` run, check the gateway is up (`nc -z localhost 4001`) —
the scanner needs live IB. Prefer US market hours (14:30–21:00 London);
pre-market chains return sparse quotes.

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

**collar** — per held long ≥ floor: buy put + sell call, same expiry (95/105,
90/110, 90/105 × ~30/90 DTE) with `netCostPct` (negative = **credit** collar),
`floorPct`/`capPct`, `maxLossPct`/`maxGainPct`, `callFundingRatio` (how much of
the put the call sale funds), `runUpPct`. The post-run-up shape: "stay long,
less bullish for a few weeks" — protection paid for by capping upside you
don't currently expect.

**risk_reversal** — per bullish-thesis ticker: sell ~25Δ put / buy ~25Δ call,
same expiry (~60/120 DTE) with `netCostPct` and `skewEdgeVolPts` (put IV −
call IV — the edge being harvested). **Undefined downside risk below the short
put.** Verify chosen structures live via `/ibkr-quote` before saving (EOD skew
drifts); radon's `risk_reversal.py` remains available for a deeper single-name
matrix during market hours.

**leap_entry** — per bullish-thesis equity/ETF (monitoring-first, capped
universe; crypto/perp/futures theses excluded): mispriced long-dated calls
(2027/2028 expiries, ~50/30/20/10Δ) where realized vol exceeds IV by ≥15 pts —
`iv`, `hv20Gap`/`hv60Gap`/`avgHvGap` (vol points), `mispricingScore`, `vega`,
`theta`, OI/volume, plus candidate-level `hv` (HV20/60/252) and `thesis`.
Structures come from radon's scanner over live IB, not the Massive chain
snapshots. `skipped` explains capped/unqualified/not-mispriced names.

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

Selection principles — collar:
- **The setup is run-up + tension, not run-up alone.** High `runUpPct` on a
  name where near-term conviction has cooled (check the thesis + recent
  journal) = the trade. Full-conviction names keep their upside — skip.
- **Standing hedge constraints apply** — a collar contains a protective put,
  so e.g. GLXY below the mid-$40s is excluded outright (no downside hedges;
  the user's standing call). Check memory/journal constraints per name.
- **Prefer credit or near-zero collars** (`netCostPct ≤ 0`, `callFundingRatio
  ≥ ~1`) — paying materially for a collar usually means the hedge scenario's
  put spread is better value.
- **The 30-DTE tenor is tactical** (2–3 week less-bullish window — say when
  it should come off); 90-DTE is a standing position collar. Name which.
- Collar a FRACTION unless conviction has genuinely dropped — capping 100% of
  a high-conviction hold is closing it in slow motion; say the coverage.

Selection principles — risk_reversal:
- **UNDEFINED RISK — always flagged, never a default recommendation.** Lead
  the rationale with the short-put obligation: strike × 100 × contracts
  collateral, and that assignment below the strike is real ownership.
- **Only on names you'd own at the put strike anyway** (same test as
  put_entry) with a genuine skew edge — `skewEdgeVolPts` meaningfully positive
  (rich puts funding cheap calls). Negative/flat skew = no edge, skip.
- **Near-zero net cost is the shape** — a big debit RR is just an expensive
  call; a big credit usually means the put is too near the money.
- Check `callDelta`: the fallback strike pick can land far from 25Δ — a
  >0.4Δ call leg changes the character (more directional, less convex); note
  or re-pick via `/analyze-vol-curve`.

Selection principles — leap_entry:
- **This is thesis expression, not vol arbitrage.** The gap makes the entry
  cheap; the thesis makes it worth entering. High-confidence monitoring theses
  with a live gap first; a big gap on a low-confidence thesis is a note, not a
  recommendation.
- **Prefer persistent-vol names.** A gap driven by HV20 alone (recent spike)
  is weaker than one confirmed by HV60/HV252 — check `avgHvGap`, not just
  `hv20Gap`.
- **Mind existing expression.** `exposureUsd` and `existingHedge` are included
  — a name already heavily expressed doesn't need a LEAP on top (that's
  concentration); flag as add-only-on-pullback or skip.
- **Delta choice:** ~50Δ for conviction expression, ~30Δ for convex
  asymmetry; below 20Δ needs an explicit lottery-ticket rationale.
- **Liquidity floor:** skip contracts with near-zero OI unless the rationale
  says how to work the order (`/ibkr-quote` the spread first).

Batch discipline (all scenarios):
- **Cap each batch at ~5.** Genuine recommendations only — this feeds a
  glanceable module, not an inbox.

**Live verification (required before saving any batch — EOD chain marks drift;
see docs/v2/22 data doctrine).** The live path is the **IBC/TWS gateway on port
4001** (always-on, `local.ibc-gateway`) — check `nc -z localhost 4001`. Do NOT
reach for the Client Portal gateway on 5001 (`src/lib/services/ibkr/`) — that's
a legacy livePrices fallback, usually down, and not part of this workflow; its
absence is normal, not a blocker. Two tools, both on 4001:

```bash
# batch, machine-readable (preferred for verification):
echo '[{"ticker":"AAPL","expiry":"20260814","strike":290,"right":"P"}, ...]' \
  | /Users/home-hub/projects/radon/.venv/bin/python3 scripts/ibkr-quote-contracts.py
# returns bid/ask/mid/iv/delta + marketDataType per contract

# multi-leg human-readable spot-check:
/ibkr-quote  (skill — TICKER + "BUY 290P 20260814, SELL ..." leg syntax)
```

Note in each rationale that legs were live-verified (and re-quote at execution).

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

## Scheduling (docs/v2/21 Phase 4 — LIVE since 2026-07-06)

Two launchd producers run this skill headlessly on weekdays:
- **08:05 `com.trade-journal.options-advisor` (batch)** — the six Massive-chain
  scenarios, regime-aware, before the 08:45 morning brief.
- **15:20 `com.trade-journal.options-advisor-leap`** — `leap_entry` via the live
  IB gateway (~25 min scan), after the 15:10 regime scan with the US market open.

Scheduled runs follow the same doctrine as interactive ones: regime first,
live-verify before saving, save only genuine recommendations, respect standing
constraints. Fresh batches surface via the dashboard ScannerSnapshot (protection
scenarios ordered first when the regime is elevated) and the SessionStart nudge
(`scripts/ops/advisor-nudge.ts`).
