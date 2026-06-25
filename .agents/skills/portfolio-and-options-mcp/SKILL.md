# Trade Journal Portfolio Skill (MCP / Connectors)

## Intended runtime

This skill is designed for the **Claude.ai app environment** (web/desktop/projects) where the **Supabase MCP** and **Massive Market Data MCP** connectors are available. It uses `execute_sql` against Supabase and Massive's options-chain endpoints — not local repo scripts.

For Claude Code in the terminal, use the sibling `pull-portfolio` skill instead, which runs `scripts/pull-portfolio.ts` with local `.env.local` credentials.

## What this is

The Two Trees Capital trade journal is a Next.js + Supabase application that tracks live positions, trades, NAV, cash, and option strategies across multiple broker and crypto accounts. This skill documents how to query it safely and how to combine portfolio data with options market data for trade design.

## Connection details

- **Supabase project**: `trade-journal` 
- **Project ID**: `wvukkvsrmgumzhvemjfb`
- **Region**: eu-north-1
- **Postgres version**: 17

Use the Supabase MCP `execute_sql` tool. The MCP connection should be configured with **read-only credentials**; this skill never uses `apply_migration` or any DDL operations against this database. If a query fails with a permissions error, do not request elevated access — surface the error to the user.

## Schema reference

### `positions` (core table)

| Column | Notes |
|---|---|
| `id` (uuid) | PK |
| `account_id` → `accounts.id` | which broker/wallet |
| `strategy_id` → `strategies.id` | nullable; trade thesis grouping |
| `underlying_id` → `underlyings.id` | join to get `ticker` |
| `asset_class` | text — `STK`, `OPT`, `FUT`, `CRYPTO`, `REAL_ESTATE` |
| `symbol` | broker symbol (e.g. `TSLA  261218C00370000` for the OCC option) |
| `expiry`, `strike`, `option_right`, `multiplier` | populated for `OPT`/`FUT` |
| `side` | `LONG` / `SHORT` |
| `quantity`, `avg_price`, `spot` | numeric |
| **`market_value_usd`** | **canonical USD value — use this, not `abs_notional`** |
| `unrealized_pnl` | USD |
| `is_open` | boolean |
| `snapshot_date` | date — positions are snapshotted, not live-streamed |
| `cost_basis_money`, `currency` | accounting |

`abs_notional` and `abs_notional_usd` are legacy — ignore them.

### `accounts`

Columns include `id`, `label`, `broker_name`, `institution`, `account_type`, `owner`, `base_currency`, `is_active`. The `label` is the human-readable account name (e.g. `TTC_IBKR`, `Maisy_IBKR`, `Nick_DERIBIT`).

### `underlyings`

`id`, `ticker`, plus reference info. Always join through this to filter by ticker — the `positions.symbol` field contains the OCC contract string for options, not the bare ticker.

### `strategies`

Trade-level grouping with thesis text and exit rules. Columns include `strategy_key`, `strategy_type`, `direction`, `thesis`, `entry_context`, `profit_rules`, `defense_rules`, `time_rules`, `exit_criteria`, `entry_iv30`, `net_premium`. Useful for understanding *why* a position exists, not just what it is.

### Other tables

- `trades` — raw executions feeding position formation
- `mtm_snapshots` — daily mark-to-market roll-ups
- `nav_snapshots` — per-account NAV (margin accounts: authoritative from broker; non-margin: derived)
- `cash_balances` — per-currency cash/stablecoin balances per account per date
- `portfolio_snapshots` — account/underlying-level aggregates

## Critical query pattern: latest-snapshot-per-account

**Position snapshot dates vary per account.** IBKR accounts typically snapshot one to two days behind crypto/wallet accounts. A naive `WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM positions)` will miss IBKR positions if any crypto account has a more recent snapshot. **Always select the latest snapshot per account:**

```sql
WITH latest_per_account AS (
  SELECT account_id, MAX(snapshot_date) AS latest_date
  FROM positions
  GROUP BY account_id
)
SELECT
  u.ticker, p.symbol, p.asset_class, p.side, p.quantity,
  p.avg_price, p.spot, p.market_value_usd, p.unrealized_pnl,
  p.expiry, p.strike, p.option_right, p.multiplier,
  a.label AS account, s.strategy_key
FROM positions p
JOIN latest_per_account lpa
  ON lpa.account_id = p.account_id AND lpa.latest_date = p.snapshot_date
JOIN accounts a ON a.id = p.account_id
LEFT JOIN underlyings u ON u.id = p.underlying_id
LEFT JOIN strategies s ON s.id = p.strategy_id
WHERE p.is_open = TRUE
  AND u.ticker IN ('...');
```

## Common query recipes

### NAV / cash snapshot
```sql
SELECT SUM(market_value_usd) AS nav
FROM positions p
JOIN (SELECT account_id, MAX(snapshot_date) d FROM positions GROUP BY account_id) l
  ON l.account_id = p.account_id AND l.d = p.snapshot_date
WHERE p.is_open = TRUE;
```

### Exposure by ticker
```sql
WITH latest AS (SELECT account_id, MAX(snapshot_date) d FROM positions GROUP BY account_id)
SELECT u.ticker, COUNT(*) AS positions, SUM(p.market_value_usd) AS mv_usd
FROM positions p
JOIN latest l ON l.account_id = p.account_id AND l.d = p.snapshot_date
JOIN underlyings u ON u.id = p.underlying_id
WHERE p.is_open = TRUE
GROUP BY u.ticker
ORDER BY ABS(SUM(p.market_value_usd)) DESC;
```

### Detect stock + short put combos (potential covered-write setups)
```sql
-- Find tickers where the user has both long stock and short puts, useful for assignment risk and covered call sizing
SELECT u.ticker,
  SUM(CASE WHEN p.asset_class='STK' AND p.side='LONG' THEN p.quantity ELSE 0 END) AS long_shares,
  SUM(CASE WHEN p.asset_class='OPT' AND p.option_right='P' AND p.side='SHORT' THEN p.quantity*p.multiplier ELSE 0 END) AS short_put_share_equiv,
  COUNT(*) FILTER (WHERE p.asset_class='OPT') AS option_legs
FROM positions p
JOIN (SELECT account_id, MAX(snapshot_date) d FROM positions GROUP BY account_id) l
  ON l.account_id = p.account_id AND l.d = p.snapshot_date
JOIN underlyings u ON u.id = p.underlying_id
WHERE p.is_open = TRUE
GROUP BY u.ticker
HAVING SUM(CASE WHEN p.asset_class='STK' AND p.side='LONG' THEN 1 ELSE 0 END) > 0
   AND SUM(CASE WHEN p.asset_class='OPT' AND p.option_right='P' AND p.side='SHORT' THEN 1 ELSE 0 END) > 0;
```

### Option expiry calendar (next 30 days)
```sql
SELECT u.ticker, p.expiry, p.strike, p.option_right, p.side, p.quantity, p.market_value_usd
FROM positions p
JOIN (SELECT account_id, MAX(snapshot_date) d FROM positions GROUP BY account_id) l
  ON l.account_id = p.account_id AND l.d = p.snapshot_date
JOIN underlyings u ON u.id = p.underlying_id
WHERE p.is_open = TRUE AND p.asset_class = 'OPT'
  AND p.expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
ORDER BY p.expiry, u.ticker;
```

## Combining with Massive Market Data

Once positions are loaded, use Massive for live market context:

### Spot/previous-close anchor for an underlying
```
GET /v2/aggs/ticker/{TICKER}/prev
```
Use `c` field as the close price. Note: free tier does not support multi-ticker snapshots — query each ticker separately.

### Options chain snapshot (for strategy design)
```
GET /v3/snapshot/options/{TICKER}
params: contract_type (call|put), expiration_date.gte, expiration_date.lte, 
        strike_price.gte, strike_price.lte, limit (max 250)
```

Returns per-contract: strike, expiry, mid (`day_close`), Greeks (`greeks_delta/gamma/theta/vega`), `implied_volatility`, `open_interest`. **Always store the result as a SQL table via `store_as=`** then query with `query_data` for strike selection.

### Strike-selection patterns

**~30-delta short put for entry-targeting cash-secured puts:**
```sql
SELECT details_strike_price AS strike, day_close AS mid, greeks_delta AS delta,
  implied_volatility AS iv, open_interest AS oi
FROM <chain_table>
WHERE details_contract_type='put' AND details_expiration_date='YYYY-MM-DD'
  AND ABS(greeks_delta) BETWEEN 0.25 AND 0.35
ORDER BY ABS(greeks_delta - 0.30);
```

**~25-delta short call for covered calls / diagonals:**
```sql
SELECT details_strike_price, day_close, greeks_delta, implied_volatility, open_interest
FROM <chain_table>
WHERE details_contract_type='call' AND details_expiration_date='YYYY-MM-DD'
  AND greeks_delta BETWEEN 0.20 AND 0.30
ORDER BY greeks_delta;
```

## Decision framework — entry structure by IV regime

When the user wants to enter a position via option structure, the right structure depends on the IV regime, not the directional view:

| IV regime | Preferred structure | Why |
|---|---|---|
| **Low (sub-30%)** | Long stock + covered call, or simple call spread | Short put premium too thin to be interesting |
| **Moderate (30-45%)** | Seagull (short put + bull call spread) | Net-zero-cost structure, captures directional upside |
| **High (45%+)** | Naked short put | Premium does the work; call legs are expensive on the other side, so seagull dilutes the edge |

Always pull the current IV from the chain before recommending — IV regime estimates from training data are unreliable and IV can change materially over weeks.

## Style and safety rules

- **Read-only by default.** Never run DDL or write SQL against this database. If a task seems to require it, surface the request to the user rather than executing.
- **Quote nominal sizes carefully.** When discussing position sizes, distinguish notional commitment (e.g., short put strike × multiplier × contracts) from current market value. Get this wrong and recommended sizes are off by 50-100x for options.
- **The IBKR snapshot lag matters.** When telling the user about "current" positions, note the snapshot date if the IBKR latest date is more than 24 hours old — important when discussing positions that may have changed.
- **Cross-account aggregation.** Same underlying may appear across `Nick_IBKR`, `TTC_IBKR`, `Maisy_IBKR`, and ISAs. Aggregate by `underlyings.ticker` when calculating total exposure, but preserve per-account detail when discussing specific trades (different accounts have different tax treatment and margin rules).
- **Margin awareness.** Short put writing requires margin; this isn't visible in the positions table directly. When suggesting new short puts, remind the user to check available margin against existing short put exposure.
- **Currency.** `market_value_usd` is normalised; native amounts and currencies are in `cost_basis_money`/`currency`. Use the USD field for portfolio-level math.
