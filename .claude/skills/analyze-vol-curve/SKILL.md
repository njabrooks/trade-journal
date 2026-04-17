---
name: analyze-vol-curve
description: Analyze the options vol surface to find optimal strike selection for call spreads and risk reversals. Based on Campbell's strike optimization framework — compares thesis-implied expected value vs market price across strikes to find the best position on the vol curve.
allowed-tools: Bash, Read
user_invocable: true
---

# Vol Curve Position Optimizer

## Purpose

Given a directional thesis on any optionable underlying, analyze the vol surface to identify
the most capital-efficient way to express that view. Evaluates naked calls, call spreads, and
risk reversals (call spread + short OTM put), ranking by expected return per dollar at risk.

Works for any US-listed ticker with options — fetches live data from the Massive API regardless
of whether the ticker is in the Trade Journal database.

## Collecting Inputs

Collect these from the user. If they provide some in their message, ask for the rest conversationally.

| Input | Required | Example | Notes |
|-------|----------|---------|-------|
| **Ticker** | Yes | NVDA | Any US-listed optionable ticker |
| **Direction** | Yes | bullish | bullish or bearish |
| **Target price (base case)** | Yes | $250 | Where you expect the price to go |
| **Target price (high case)** | Yes | $300 | Upside scenario (defines thesis uncertainty) |
| **Time horizon** | Yes | 6 months | Approximate, in months |
| **Horizon flexibility** | No | +/- 2 months | Default: ±2 months. Explores multiple expiries in range |
| **Downside floor** | Yes | $160 | Below this = accept assignment. Sets short put strike ceiling |

### Guiding the conversation

- If the user gives a vague horizon like "long term", ask to narrow to months (3-18 typical)
- If they don't specify a high case, suggest base case × 1.2-1.3 as a starting point
- If they don't specify a downside floor, suggest spot × 0.75-0.80 as a starting point
- The floor should be a level the user is genuinely willing to own the stock at

## Running the Analysis

```bash
cd trade-journal && npx tsx scripts/vol-curve-analyze.ts \
  --ticker NVDA \
  --direction bullish \
  --target-base 250 \
  --target-high 300 \
  --horizon-months 6 \
  --horizon-range 2 \
  --downside-floor 160
```

The script outputs JSON to stdout and progress/diagnostics to stderr.

## Saving the Report

After running the analysis, **always save the report** to the database so it appears on the Vol Curve page:

```bash
# Capture the analysis output
cd trade-journal && npx tsx scripts/vol-curve-analyze.ts \
  --ticker NVDA --direction bullish \
  --target-base 250 --target-high 300 \
  --horizon-months 6 --horizon-range 2 \
  --downside-floor 160 2>/dev/null | grep -v '^\[dotenv' > /tmp/vol-report.json

# Save to database via API (dev server must be running, or use the save script)
curl -s -X POST http://localhost:3000/api/vol-curve/reports \
  -H "Content-Type: application/json" \
  -d "$(jq -n --slurpfile data /tmp/vol-report.json '{reportData: $data[0]}')"
```

Alternatively, save via psql directly:

```bash
cd trade-journal && npx tsx scripts/vol-curve-save-report.ts /tmp/vol-report.json
```

After saving, tell the user: "Report saved — view it at /vol-curve"

## Presenting Results

Read the JSON output and present a structured analysis with these sections:

### 1. Vol Surface Context

From `context` in the JSON output:

- **Spot price** and data source (live API or database snapshot)
- **IV30/RV20 ratio** with the assessment text — tells the user whether vol is cheap or expensive
- **Call skew** description — how the smile shape affects structure choice
- **Put skew richness** — whether short puts collect premium above fair value
- **Thesis sigma** — the implied uncertainty derived from their base/high spread

Frame this as: "Given the vol surface, here's what the market is pricing and where your thesis disagrees."

### 2. Strategy Rankings

Present the top 8-10 strategies in a table:

| Rank | Structure | DTE | Net Cost | Payoff @Base | Payoff @High | RoR @Base | Ann. RoR | Edge |
|------|-----------|-----|----------|-------------|-------------|-----------|----------|------|
| 1 | Oct 220/260C -165P | 185 | $2.50 | $27.50 | $37.50 | 11.0x | 21.7x | 2.3 |

- All prices are per-share (multiply by 100 for per-contract)
- Group by structure type (naked calls, call spreads, risk reversals) if helpful
- Highlight any net-credit structures

### 3. Deep Dive: Top 3 Strategies

For the top 3, provide a paragraph each covering:

- **Why it scores well** — which of Campbell's criteria does it optimize?
  - Edge ratio: thesis value vs market price at the long strike
  - Vol differential: how much premium the short call recaptures
  - Put funding: whether the short put sells expensive vol
- **Scenario analysis**:
  - Bull case (high target): payoff and return
  - Base case: payoff and return
  - Muddle-through (spot unchanged): loss
  - Bear case (at downside floor): loss including potential put assignment
- **Key risks**:
  - Assignment risk on short put if stock drops
  - Vega exposure — how much a vol crush costs
  - Theta decay profile (positive or negative net theta?)
  - Liquidity concerns (open interest at each strike)
- **Campbell framework note**: where on the vol curve the edge ratio peaks and whether the thesis supports the chosen structure type

### 4. Structure Decision Guide

Summarize the trade-offs between the top strategies as a decision matrix:

- **If you want maximum return per dollar**: → [strategy]
- **If you want lowest net cost / self-financing**: → [strategy]
- **If you want simplest execution / best liquidity**: → [strategy]
- **If you want maximum convexity (open tail)**: → [strategy]

### 5. Campbell Framework Notes

- Is the entire right tail underpriced (favors naked calls) or is edge localized (favors spreads)?
- Is put skew rich enough to justify the short put leg?
- Does the IV/RV ratio suggest vol is expensive (favor selling) or cheap (favor buying)?
- How does the expiry selection balance catalyst coverage vs vega exposure?

## Important Notes

- All analysis is based on Black-Scholes pricing with the listed implied volatility at each strike
- Actual execution prices will differ due to bid-ask spread, especially for illiquid strikes
- The "edge ratio" measures thesis-implied value vs market price — it's a relative metric, not an absolute prediction
- Short put legs introduce assignment risk and margin requirements beyond the net debit
- This is analysis tooling, not trading advice — the user makes all execution decisions
