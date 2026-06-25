# IBKR Option Quote Skill

## Purpose

Fetch live (or delayed) bid/ask/IV for any multi-leg options structure via IB Gateway. Used to:
- Verify theoretical BS prices from `/analyze-vol-curve` against actual IBKR quotes
- Price-check a combo before executing in TWS
- Compare a proposed structure's cost at different expiries or strike combinations

## Prerequisites

- **IB Gateway** installed at `/Applications/IB Gateway 10.37/` (one-time install)
- **Python venv with ib_insync** at `/Users/home-hub/projects/radon/.venv/bin/python3` (shared with Radon)
- **Market data subscription** (live data) OR accept delayed data (~15 min lag)

## Step 1: Check Gateway Status

Run this first to see if the gateway is already up:

```bash
lsof -i :4001 2>/dev/null | head -3
```

If you see a `JavaAppli` process listening on port 4001 → Gateway is running, skip to Step 3.

If nothing is listening → Gateway needs to be started (Step 2).

## Step 2: Start IB Gateway (if needed)

```bash
open -a "IB Gateway 10.37"
```

Then tell the user:
> IB Gateway is launching. Log in with your IBKR credentials and complete 2FA.
> If you have multiple accounts, use the one with US Options market data subscription
> for live quotes (otherwise delayed data will be used).
> Let me know when you see "Client login succeeds" or the main gateway window.

Wait for user confirmation before proceeding.

## Step 3: Parse the User's Request

Collect from the conversation:

| Input | Required | Example |
|-------|----------|---------|
| **Ticker** | Yes | IBIT |
| **Legs** | Yes | "BUY 49C 20260821, SELL 60C 20260821 x2, SELL 36P 20260821" |

### Leg format

```
ACTION STRIKE[C|P] YYYYMMDD [xQTY]
```

- **ACTION**: `BUY` or `SELL`
- **STRIKE**: number + `C` (call) or `P` (put)
- **YYYYMMDD**: expiry as 8-digit date (e.g., `20260821` for Aug 21, 2026)
- **xQTY**: optional multiplier (default 1)

Multiple legs separated by commas. Ratios use `x2`, `x3` etc.

### Examples

- Simple call spread: `"BUY 49C 20260821, SELL 60C 20260821"`
- Risk reversal: `"BUY 49C 20260821, SELL 60C 20260821, SELL 36P 20260821"`
- Butterfly: `"BUY 55C 20260821, SELL 60C 20260821 x2, BUY 65C 20260821"`
- Risk reversal + fly overlay: `"BUY 49C 20260821, BUY 55C 20260821, SELL 60C 20260821 x2, SELL 36P 20260821"`

## Step 4: Run the Quote Script

```bash
cd /Users/home-hub/projects/trade-journal && /Users/home-hub/projects/radon/.venv/bin/python3 scripts/ibkr-option-quote.py <TICKER> "<LEGS>"
```

The script will:
1. Connect to IB Gateway on port 4001 (falls back to TWS on 7496)
2. Qualify each option contract (resolve conId)
3. Fetch market data (live if subscribed, delayed otherwise)
4. Display per-leg bid/ask/mid/last/IV
5. Compute combo net price using proper cross-fields (ask on buys, bid on sells)

## Step 5: Present Results

Format the output as:

1. **Per-leg table** — shows each strike's bid/ask/mid/IV
2. **Combo net** — total cost to buy the combo (debit) or credit received
3. **Comparison vs analysis** (if user recently ran `/analyze-vol-curve`) — note any price differences from BS estimates
4. **Execution notes** — if bid-ask spread is wide, suggest working the order at mid

### Example output framing

> **IBIT Aug 49/55/60x2C -36P — Live Quote**
>
> - Each leg with bid/ask/IV
> - Combo mid: $X.XX debit/credit
> - Spread: $X.XX (tight/wide)
> - Per contract: $N, N contracts: $N,NNN
> - Comparison: [actual vs estimated if applicable]
> - Note: [anything unusual — wide spreads, stale data, etc.]

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Connection refused` | Gateway not running → Step 2 |
| `API interface is in Read-Only mode` | Normal for quotes; ignore |
| `market data is not subscribed` | No live sub → script auto-falls-back to delayed |
| All quotes show `—` | Market closed OR contracts don't exist at those strikes |
| `Contract not qualified` | Check expiry is a valid IBKR expiry for the ticker |

## When NOT to Use This Skill

- For running the Campbell vol curve analysis itself → use `/analyze-vol-curve`
- For historical or analytical pricing (no IBKR connection needed) → use Massive API via `/analyze-vol-curve`
- For placing actual orders → use TWS/Gateway manually (this skill is read-only)

## Integration with Vol Curve Workflow

Typical sequence:

1. `/analyze-vol-curve` — theoretical analysis, ranks structures by edge ratio
2. Pick top candidates
3. `/ibkr-quote` — verify live prices on the winners
4. Execute in TWS/IBKR with the live prices as reference
