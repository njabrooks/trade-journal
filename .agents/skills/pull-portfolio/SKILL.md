# Pull Portfolio Skill

## Purpose

Pull a comprehensive portfolio snapshot from the Trade Journal database. Returns all active positions grouped by underlying and strategy, with NAV, cash, leverage, owner breakdown, and cash breakdown.

## Usage

```
/pull-portfolio                    # Human-readable summary
/pull-portfolio --json             # JSON output for programmatic use
/pull-portfolio --account TTC      # Filter by owner name (partial match)
```

## Execution

### Step 1: Determine output format and filters

Parse the user's arguments:
- `--json` or `json` → pass `--format json` to the script
- `--account <name>` → will need to look up account IDs (future enhancement)
- No args → human-readable output

### Step 2: Run the portfolio extraction script

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/pull-portfolio.ts [FLAGS]
```

Available flags:
- `--format json` — JSON output (useful for piping to analysis)
- `--account-ids id1,id2` — Filter to specific account UUIDs

### Step 3: Present results

- For human-readable output: display the formatted output directly
- For JSON output: parse and present key metrics, or pass to the next step in a workflow
- If the user asked for analysis or comparison, use the data to perform the requested work

## Output Structure (JSON mode)

```json
{
  "snapshotDate": "2026-04-13",
  "nav": 9990000,
  "totalCashUsd": 2140000,
  "totalAbsNotional": 10930000,
  "leverageRatio": 1.09,
  "ownerBreakdown": [{ "owner": "TTC", "nav": 4010000 }, ...],
  "underlyingBreakdown": [{
    "ticker": "BTC",
    "positionCount": 10,
    "totalMarketValueUsd": 920600,
    "totalAbsNotionalUsd": 990000,
    "pctNav": 0.099,
    "positions": [{ "symbol": "IBIT", "quantity": 7000, "marketValueUsd": 290900, ... }]
  }, ...],
  "strategies": [{
    "id": "...",
    "strategyKey": "BTC_LONG_CALL",
    "label": "IBIT Stock",
    "direction": "bullish",
    "totalMarketValueUsd": 290900,
    "positions": [...]
  }, ...],
  "unlinkedPositions": [...],
  "cashBreakdown": [{ "currency": "USD", "source": "ibkr_flex", "balanceUsd": 574800, ... }]
}
```

## Common Follow-up Workflows

After pulling portfolio data, common next steps include:
- **Portfolio comparison**: Compare against another portfolio or benchmark
- **Thesis alignment check**: Verify positions map to active theses
- **Sizing analysis**: Check position sizes relative to NAV
- **Risk assessment**: Review leverage, concentration, and hedging gaps
