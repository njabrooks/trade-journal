> Canonical method: Nick's Notion Skills database (Brooks Fam > Agents HQ > Skills, 'Pull portfolio' / SKL-9). These files are derived copies kept in sync with it. Notion URL: https://app.notion.com/p/4158bf497fcb8140b0ebdd56aae0f26d

# Pull Portfolio Skill

## Purpose

Pull the latest stored portfolio snapshot from the Trade Journal database. Returns open positions grouped by underlying and active strategy, with NAV, cash, leverage, owner breakdown, cash breakdown, recent strategy closes with realized P&L, and closed-strategy health. This reads stored data; it does not refresh exchange data.

## Usage

```
/pull-portfolio                                      # Human-readable summary, all accounts
/pull-portfolio --json                               # Skill shorthand for --format json
/pull-portfolio --account-ids <id1,id2>                # Comma-separated account UUIDs
/pull-portfolio --json --since 2026-10-15             # Override the closed-strategy start date
```

These are Claude skill invocations. In Codex, follow Execution below using the repository command runner.

## Execution

### Step 1: Determine output format and filters

Parse the user's arguments:

- `--json` or `json` → pass `--format json` to the script. The script does not parse a bare `--json` flag.
- `--account-ids <id1,id2>` → pass the comma-separated account UUIDs through to the script. This is the supported account filter and also scopes the closed-strategy reports.
- `--since YYYY-MM-DD` → override the start date for `closedSinceLastPull`.
- `--account <name>` is not yet implemented and is not parsed by the script. Use account UUIDs with `--account-ids`; do not treat an account name as an applied filter.
- No args → human-readable output for all accounts with the default closed-strategy window.

### Step 2: Run the portfolio extraction script

Run from the Trade Journal repository root (or the worktree being used):

```bash
npx tsx scripts/pull-portfolio.ts [FLAGS]
```

Available flags:

- `--format json` — JSON output. Without this exact flag/value pair, output is human-readable.
- `--account-ids <id1,id2>` — filter to comma-separated account UUIDs. Omit for all accounts.
- `--since YYYY-MM-DD` — inclusive start date for closed strategies. A missing value, invalid calendar date, or date later than today in Europe/London errors.

The default window is the previous weekday through today in Europe/London, both bounds inclusive. The start-date calculation skips weekends but has no exchange or bank-holiday calendar. `through` is always today in Europe/London; it is not a flag. Despite the name `closedSinceLastPull`, the window is date-based, not tracked from an earlier invocation.

### Step 3: Present results

- For human-readable output, display the formatted output. Sections include portfolio snapshot, owner breakdown, underlying breakdown, active strategies, unlinked positions when present, closed since last pull, closed strategy health, and cash breakdown. Unknown P&L is shown as `—`; a known subtotal and unknown scope count appear when needed.
- For JSON output, parse and present key metrics, or pass the complete object to the next workflow step.
- Always report `snapshotDate` (the human-readable `Date` line). Compare it with today in Europe/London to say whether IBKR / snapshot figures are dated today or an earlier date, typically the previous close or older. Never present stale figures as fresh. If the date is null, report freshness as unknown.
- The script has no separate `freshness`, `isStale`, or `previousClose` field. `snapshotDate` is the maximum of the selected accounts' latest portfolio snapshot dates; accounts can have different dates, so it does not establish that every account is equally fresh.
- Before calling a vanished position missing, check `closedSinceLastPull` and `closedStrategyHealth`. A close in the window is not a missing open position.
- If the user asked for analysis or comparison, use the data to perform the requested work.

## Output Structure (JSON mode)

Illustrative values only. The top-level keys and populated row shapes match the script:

```json
{
  "snapshotDate": "2026-10-16",
  "nav": 100000,
  "totalCashUsd": 90000,
  "totalAbsNotional": 10000,
  "leverageRatio": 0.1,
  "ownerBreakdown": [{ "owner": "Example owner", "nav": 100000 }],
  "underlyingBreakdown": [{
    "ticker": "XYZ",
    "positionCount": 1,
    "totalMarketValueUsd": 10000,
    "totalAbsNotionalUsd": 10000,
    "pctNav": 0.1,
    "positions": [{
      "symbol": "XYZ",
      "assetClass": "STK",
      "quantity": 100,
      "avgPrice": 90,
      "spot": 100,
      "marketValueUsd": 10000,
      "unrealizedPnl": 1000,
      "expiry": null,
      "strike": null,
      "optionRight": null,
      "side": "LONG",
      "account": "Example account",
      "owner": "Example owner",
      "strategyId": "11111111-1111-4111-8111-111111111111"
    }]
  }],
  "strategies": [{
    "id": "11111111-1111-4111-8111-111111111111",
    "strategyKey": "XYZ_LONG",
    "label": "XYZ Stock",
    "direction": "bullish",
    "strategyType": "stock",
    "assetThesisTitle": "Example asset thesis",
    "positions": [{ "symbol": "XYZ", "quantity": 100, "marketValueUsd": 10000, "unrealizedPnl": 1000 }],
    "totalMarketValueUsd": 10000
  }],
  "unlinkedPositions": [],
  "cashBreakdown": [{
    "currency": "USD",
    "source": "ibkr_flex",
    "balance": 90000,
    "balanceUsd": 90000,
    "account": "Example account"
  }],
  "closedSinceLastPull": {
    "since": "2026-10-15",
    "through": "2026-10-16",
    "strategies": [{
      "strategyId": "22222222-2222-4222-8222-222222222222",
      "strategyKey": "ABC_LONG",
      "strategyName": "ABC Stock",
      "accountId": "33333333-3333-4333-8333-333333333333",
      "accountLabel": "Example account",
      "underlying": "ABC",
      "symbols": ["ABC"],
      "closeDate": "2026-10-16",
      "previousSnapshotDate": "2026-10-15",
      "periodBaselineDate": "2026-10-14",
      "realizedPnlClosingDayUsd": 300,
      "realizedPnlToDateUsd": 700,
      "realizedPnlPeriodUsd": 500,
      "realizedConfidence": "full"
    }],
    "realizedPnlPeriodUsd": 500,
    "knownRealizedPnlPeriodUsd": 500,
    "unknownPeriodPnlCount": 0
  },
  "closedStrategyHealth": []
}
```

`unlinkedPositions[]` rows have `symbol`, `assetClass`, `quantity`, `marketValueUsd`, `account`, and `owner`. This includes open positions without a linked active, non-closed strategy. `cashBreakdown.balance` is in the row's currency; `balanceUsd` is USD. Human-readable cash output skips balances with an absolute USD value below 1; JSON retains them.

### closedSinceLastPull

The object contains exactly `since`, `through`, `strategies`, `realizedPnlPeriodUsd`, `knownRealizedPnlPeriodUsd`, and `unknownPeriodPnlCount`.

Each `strategies[]` row represents one account/strategy's latest metrics snapshot when it is terminal and dated within the inclusive window. A terminal snapshot has zero notional and unrealized P&L, zero or null open-position count, and no open-position date at or after it. Merged and rejected strategy records are excluded. The row fields are:

| Fields | Meaning |
| --- | --- |
| `strategyId`, `strategyKey`, `strategyName` | Strategy identity; name falls back to the key. |
| `accountId`, `accountLabel`, `underlying`, `symbols` | Account and instrument identity; symbols come from linked positions and trades. |
| `closeDate` | Terminal metrics snapshot date. |
| `previousSnapshotDate` | Previous stored metrics snapshot date, or null. |
| `periodBaselineDate` | Last metrics snapshot date strictly before `since`, or null. |
| `realizedPnlClosingDayUsd` | Change in cumulative realized P&L since the previous stored snapshot; null if intervening trades make a snapshot gap ambiguous. |
| `realizedPnlToDateUsd` | Cumulative realized P&L at the closing snapshot, or null. |
| `realizedPnlPeriodUsd` | Change in cumulative realized P&L since the period baseline; null if a gap between that baseline and `since` contains pre-window trades. |
| `realizedConfidence` | Stored confidence flag, retained even for partial-history values. |

All new P&L fields are USD. Missing baseline values or ending values remain null. When no baseline snapshot exists, the code can infer a zero baseline only if the first linked trade is on or after the relevant boundary (`closeDate` for closing-day P&L, `since` for period P&L).

Period totals cover **only these closed strategies**, including any partial reductions within the window. They do not change existing unrealised totals. `closedSinceLastPull.realizedPnlPeriodUsd` is null whenever `unknownPeriodPnlCount > 0`. `knownRealizedPnlPeriodUsd` sums the known period values; `unknownPeriodPnlCount` counts rows with unknown period P&L. With no closed rows, both totals and the count are zero.

### closedStrategyHealth

An array of account/strategy scopes whose strategy status is `complete` and which have issues. It uses the account filter but is not restricted to closes within the `since` window. Each item has:

- Identity: `strategyId`, `strategyKey`, `strategyName`, `accountId`, `accountLabel`, `underlying`, `symbols`.
- Diagnostics: `issues`, `latestSnapshotDate`, `lastOpenPositionDate`, `lastClosingTradeDate`.

`issues` contains `no_closing_snapshot`, `no_closing_trade`, or both. The first means the latest metrics snapshot fails the terminal-snapshot checks above. A closing trade is inferred from a linked fill reducing running inventory per symbol (a fill with the opposite sign to prior inventory). The latest inferred closing trade through today must be at/after the last open snapshot and by the terminal date when present. Trade-day comparisons use UTC dates. Missing history and expiries without fills can legitimately flag this; a reducing fill is evidence, not proof of a complete round trip. An empty array means no issues found.

## Common Follow-up Workflows

After pulling portfolio data, common next steps include:
- **Portfolio comparison**: Compare against another portfolio or benchmark
- **Thesis alignment check**: Verify positions map to active theses
- **Sizing analysis**: Check position sizes relative to NAV
- **Risk assessment**: Review leverage, concentration, and hedging gaps
