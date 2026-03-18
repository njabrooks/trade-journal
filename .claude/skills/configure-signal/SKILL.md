---
name: configure-signal
description: Interactive workflow to wire up data-source monitoring on a signal that has explicit_details: null. Guides through classification → source identification → live endpoint test → threshold setting → DB write → verification.
allowed-tools: Bash, Read, Write
---

# Configure Signal Skill

## Purpose

Wire up `explicit_details` on a signal that came out of `/build-core-argument` with `explicit_details: null`. Every signal needs a monitoring configuration before `collect-signal-data.ts` can track it. This skill guides you through that configuration interactively — asking questions, proposing sources, testing endpoints live, and only writing to the DB once you confirm.

This is **not a fully automated skill**. You are in the loop at every decision point. You can push back, suggest alternatives, and amend proposals before anything is committed.

---

## Workflow Overview

```
1. LOAD     — pick the signal, show its context
2. CLASSIFY — determine monitoring type (quantitative / qualitative / both / derived / internal)
3. IDENTIFY — propose a data source per dimension, confirm or amend
4. TEST     — hit the proposed endpoint live, show the current value
5. THRESHOLD — agree on the threshold value
6. POPULATE — write explicit_details to the DB (psql UPDATE) + log journal entry
7. VERIFY   — dry-run collect-signal-data.ts to confirm end-to-end
```

---

## Step 1 — LOAD

### If a signal ID was provided as an argument

Query by ID:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "
SELECT
  s.id,
  s.type,
  s.status,
  s.statement,
  s.entity_type,
  s.thesis_type,
  s.explicit_details,
  COALESCE(mt.title, at.title) AS thesis_title,
  COALESCE(mt.description, at.description) AS thesis_description
FROM signals s
LEFT JOIN signal_entity_links sel ON sel.signal_id = s.id AND sel.entity_type = 'thesis'
LEFT JOIN macro_theses mt ON sel.thesis_id = mt.id AND sel.thesis_type = 'macro'
LEFT JOIN asset_theses at ON sel.thesis_id = at.id AND sel.thesis_type = 'asset'
WHERE s.id = '<SIGNAL_ID>'
LIMIT 1
" --format json
```

### If no signal ID was provided

Show all active signals with `explicit_details IS NULL`:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "
SELECT
  s.id,
  s.type,
  s.statement,
  COALESCE(mt.title, at.title) AS thesis_title
FROM signals s
LEFT JOIN signal_entity_links sel ON sel.signal_id = s.id AND sel.entity_type = 'thesis'
LEFT JOIN macro_theses mt ON sel.thesis_id = mt.id AND sel.thesis_type = 'macro'
LEFT JOIN asset_theses at ON sel.thesis_id = at.id AND sel.thesis_type = 'asset'
WHERE s.status = 'active'
  AND s.explicit_details IS NULL
ORDER BY s.created_at DESC
" --format json
```

Present the list and ask the user which signal to configure.

### Load claims for context

Once the signal is identified, load linked claims for the thesis to understand what evidence the signal is grounded in:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "
SELECT mc.title, mc.claim, mc.qualifier, ctm.mapping_type
FROM main_claims mc
JOIN claim_thesis_mappings ctm ON ctm.main_claim_id = mc.id
LEFT JOIN signal_entity_links sel ON sel.entity_type = 'thesis'
LEFT JOIN signals s ON s.id = sel.signal_id
WHERE s.id = '<SIGNAL_ID>'
  AND (ctm.macro_thesis_id = sel.thesis_id OR ctm.asset_thesis_id = sel.thesis_id)
ORDER BY ctm.mapped_at DESC
LIMIT 10
" --format json
```

### Display a clear summary

Present:

```
Signal: <type> — <statement>
Thesis: <thesis_title>
Current explicit_details: null (unmonitored)

Linked claims for context:
- [claim title] (<qualifier>) — [claim text excerpt]
...
```

---

## Step 2 — CLASSIFY

Reason about what kind of monitoring this signal requires. Consider the signal statement carefully:

| Category | When to use |
|----------|-------------|
| **Quantitative only** | Price/market cap threshold, metric threshold (revenue, market share), numeric ratio |
| **Qualitative only** | Event-based (milestone, decision, regulatory action), no reliable numeric proxy |
| **Both** | Compound condition (e.g. revenue milestone PLUS qualitative confirmation) |
| **Derived** | Requires computation from multiple data sources (correlation, P/E ratio, valuation per MW) |
| **Internal DB** | Depends on state of another thesis in the database (parent thesis invalidation) |

Present your classification reasoning, then ask:

> "I'd classify this as **[category]** because [reasoning]. Does that sound right, or would you frame it differently?"

Wait for confirmation before proceeding.

---

## Step 3 — IDENTIFY SOURCE

For each monitoring dimension, propose a specific data source and configuration.

### Reference: Available collectors

#### `defillama` — Protocol fees / revenue
- **When**: Protocol revenue, fees, TVL metrics for DeFi/crypto protocols
- **Endpoint pattern**: `https://api.llama.fi/summary/fees/<protocol-slug>?dataType=dailyRevenue`
- **Useful metrics**: `total30d`, `total24h`, `total7d`
- **Useful calculations**: `total30d * 12` (annualise from 30d)
- **Threshold unit**: `USD`
- **Example** (HYPE annualised revenue > $1.4B):
  ```json
  {
    "dataSource": "defillama",
    "endpoint": "https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue",
    "metric": "total30d",
    "calculation": "total30d * 12",
    "threshold": 1400000000,
    "thresholdUnit": "USD",
    "operator": "gte",
    "checkFrequency": "daily"
  }
  ```

#### `coingecko` — Crypto token market data
- **When**: Market cap, price, volume for crypto tokens
- **Endpoint pattern**: `https://api.coingecko.com/api/v3/coins/<coin-id>`
- **Useful metrics**: `market_data.market_cap.usd`, `market_data.current_price.usd`
- **Threshold unit**: `USD`
- **Example** (HYPE market cap > $40B):
  ```json
  {
    "dataSource": "coingecko",
    "endpoint": "https://api.coingecko.com/api/v3/coins/hyperliquid",
    "metric": "market_data.market_cap.usd",
    "threshold": 40000000000,
    "thresholdUnit": "USD",
    "operator": "gte",
    "checkFrequency": "daily"
  }
  ```

#### `hypeflows` — Hyperliquid market share
- **When**: Hyperliquid perp market share by volume
- **Metric**: `market_share_pct`
- **Threshold unit**: `%`
- **Example** (HYPE global market share > 10%):
  ```json
  {
    "dataSource": "hypeflows",
    "metric": "market_share_pct",
    "endpoint": "https://hypeflows.com/api/perp-data?metric=volume",
    "threshold": 10,
    "thresholdUnit": "%",
    "operator": "gte",
    "checkFrequency": "daily"
  }
  ```

#### `tradingview_cdp` — Price / market cap for stocks and crypto
- **When**: Stock price, crypto price, or market cap via TradingView scanner
- **Supported tickers** (hardcoded in `tradingview.ts`): `GLXY`, `SPX`, `NDX`, `BTCUSD`, `BTC`
- **Metrics**: `spot` / `price` / `close` (price), `market_cap` (market cap)
- **Note**: If you need a ticker not in the TICKER_MAP, flag it — the collector will warn. You can add it to `scripts/lib/collectors/tradingview.ts` if needed.
- **Example** (BTC spot > $500K):
  ```json
  {
    "dataSource": "tradingview_cdp",
    "ticker": "BTCUSD",
    "metric": "spot",
    "threshold": 500000,
    "thresholdUnit": "USD",
    "operator": "gte",
    "checkFrequency": "daily"
  }
  ```
- **Example** (GLXY market cap > $40B):
  ```json
  {
    "dataSource": "tradingview_cdp",
    "ticker": "GLXY",
    "metric": "market_cap",
    "threshold": 40000000000,
    "thresholdUnit": "USD",
    "operator": "gte",
    "checkFrequency": "daily"
  }
  ```

#### `derived` — Computed metrics requiring multiple sources
- **When**: Ratio, correlation, or other calculation from ≥2 sources
- **Supported calculations** (as of current codebase):
  - `market_cap / annualized_revenue` → P/E ratio (CoinGecko + DefiLlama)
  - `30d_rolling_correlation(BTC, NASDAQ) AND spx_drawdown` → decorrelation signal
  - `90d_rolling_correlation(BTC, NASDAQ)` → correlation persistence
  - `market_cap / helios_capacity_mw` → valuation per MW (GLXY)
- **Example** (HYPE P/E 15-20x):
  ```json
  {
    "dataSource": "derived",
    "calculation": "market_cap / annualized_revenue",
    "threshold": 17.5,
    "thresholdUnit": "ratio",
    "operator": "between",
    "checkFrequency": "daily"
  }
  ```
- **Note**: If the signal requires a new derived calculation not in the list above, flag this to the user — a new collector function would be needed (out of scope for this skill).

#### `internal_db` — Check parent thesis state
- **When**: Signal triggers when a parent macro thesis is invalidated or downgraded
- **Example** (parent macro thesis rejected or downgraded to low):
  ```json
  {
    "dataSource": "internal_db",
    "parentThesisId": "<uuid>",
    "parentThesisTitle": "Bullish AI Infrastructure",
    "metric": "status_or_confidence",
    "logic": "any",
    "conditions": [
      { "field": "status", "label": "Parent thesis rejected", "operator": "eq", "threshold": "rejected" },
      { "field": "confidence_level", "label": "Parent thesis confidence downgraded to low", "operator": "eq", "threshold": "low" }
    ],
    "checkFrequency": "daily"
  }
  ```
  To find the parent thesis ID, query:
  ```bash
  cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT id, title FROM macro_theses WHERE title ILIKE '%<keyword>%'" --format json
  ```

#### `news_qualitative` — Qualitative / event-based monitoring (no numeric collection)
- **When**: Event, milestone, regulatory decision, or any criterion that cannot be numerically polled
- **Not collected** by `collect-signal-data.ts` — handled by the thesis monitor / manual review
- **Required fields**: `monitorKeywords` (array), `monitorContext` (string explaining what to look for)
- **Optional**: `deadline` (ISO date), `checkFrequency`
- **Example** (Helios Phase 1 comes online):
  ```json
  {
    "dataSource": "news_qualitative",
    "monitorKeywords": ["Galaxy Digital", "Helios", "200MW", "phase 1", "online", "operational"],
    "monitorContext": "Track Galaxy Digital press releases and earnings calls for Helios Phase 1 (200MW) going operational.",
    "deadline": "2026-06-30",
    "checkFrequency": "weekly"
  }
  ```

#### Multi-condition signals (compound)
Use a top-level `conditions` array when the signal has multiple independent checks:

```json
{
  "checkFrequency": "daily",
  "conditions": [
    {
      "label": "BTC spot exceeds $500K",
      "dataSource": "tradingview_cdp",
      "ticker": "BTCUSD",
      "metric": "spot",
      "operator": "gte",
      "threshold": 500000,
      "thresholdUnit": "USD"
    },
    {
      "label": "3+ G20 central banks hold BTC reserves",
      "dataSource": "news_qualitative",
      "threshold": 3,
      "thresholdUnit": "nations",
      "monitorContext": "...",
      "monitorKeywords": ["central bank", "bitcoin reserve"]
    }
  ]
}
```

### Present the proposal

After reasoning through the signal, present your proposed `explicit_details` structure:

> "Here's what I'm proposing for this signal's `explicit_details`:
> ```json
> { ... }
> ```
> The [data source] will [what it measures]. The threshold is [value] because [reasoning from the signal statement].
>
> Does this look right? Any changes before I test the endpoint?"

**Wait for confirmation or amendments before proceeding.**

---

## Step 4 — TEST

For quantitative sources, test the proposed endpoint live and show the current value.

### DefiLlama test
```bash
curl -s "<endpoint>" | npx -y jq '{total24h, total7d, total30d}'
```
Then calculate the metric: e.g. `total30d * 12 = <annualised value>`.
Show: "Current annualised revenue: $X (threshold: $Y → Z% of threshold)."

### CoinGecko test
```bash
curl -s "<endpoint>" | npx -y jq '.market_data.market_cap.usd, .market_data.current_price.usd'
```
Show: "Current market cap: $X (threshold: $Y → Z% of threshold)."

### TradingView test
```bash
curl -s -X POST "https://scanner.tradingview.com/<exchange>/scan" \
  -H "Content-Type: application/json" \
  -d '{"symbols":{"tickers":["<EXCHANGE>:<TICKER>"]},"columns":["close","market_cap_calc"]}' \
  | npx -y jq '.data[0].d'
```
Where `<exchange>` is `america` (stocks/indices) or `crypto` (crypto pairs).

### HypeFlows test
```bash
curl -s "https://hypeflows.com/api/perp-data?metric=volume" | npx -y jq '{market_share_pct}'
```

### internal_db / news_qualitative
No endpoint test needed. For `internal_db`, query the parent thesis directly to confirm the ID is correct:
```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT id, title, status, confidence_level FROM macro_theses WHERE id = '<parentThesisId>'" --format json
```

### After testing

Show the result clearly:
```
Endpoint tested successfully.
  Current value:    <value> <unit>
  Threshold:        <threshold> <unit>
  % of threshold:   <pct>%
  Response plausible: yes / NO — [flag any concern]
```

Ask: "Does this look right? Any concern with the current value or how it maps to the threshold?"

**Wait for confirmation before proceeding to threshold step.**

---

## Step 5 — SET THRESHOLD

Propose a threshold value derived directly from the signal statement.

Rules for deriving the threshold:
- If the signal says "exceeds $1.4B", threshold = `1400000000`
- If the signal says "reaches 10%+ market share", threshold = `10`
- If the signal says "drops below 0.3 correlation", threshold = `0.3` with `operator: "lte"`
- If the signal has a range ("15-20x P/E"), threshold = midpoint `17.5` with `operator: "between"`
- If qualitative (event-based), no threshold needed — skip this step

Present: "Based on the signal statement, I propose threshold = `<value>` <unit> (operator: `<gte/lte/eq/between>`). Does that match your intent?"

**Wait for confirmation before writing.**

---

## Step 6 — POPULATE

Once all decisions are confirmed, write the `explicit_details` JSON to the signal record.

### Prepare the JSON

Build the final `explicit_details` object incorporating all confirmed decisions from steps 3-5. Escape it properly for a SQL literal.

### Execute the UPDATE

Use `psql-query.ts` — it supports mutations via `sql.unsafe()`:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "
UPDATE signals
SET explicit_details = '<json>'::jsonb,
    updated_at = NOW()
WHERE id = '<signal_id>'
RETURNING id, statement, explicit_details
" --format json
```

**Important:** The JSON must be valid. Escape any single quotes in string values by doubling them (`''`). Alternatively, use a here-doc approach if the JSON is complex — write the JSON to a temp file and reference it via the `psql` binary if needed.

If the UPDATE returns the signal with the correct `explicit_details`, confirm to the user:

```
Updated signal <id>:
  Statement: <statement>
  explicit_details: <json>
```

If the update fails, diagnose and retry.

### Log a journal entry

After the `explicit_details` UPDATE succeeds, log a journal entry capturing the configuration rationale. Summarise: which data source was chosen, what threshold was set, and any caveats or notes from the conversation.

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/ops/add-journal-note.ts \
  --entity-type signal \
  --id '<signal_id>' \
  --note 'Configured explicit_details: <dataSource> monitoring, threshold <threshold> <unit> (<operator>). <any relevant caveats or reasoning from the conversation>.'
```

This ensures the signal's Journal tab records **how and why** the monitoring was set up.

---

## Step 7 — VERIFY

Run a dry-run of `collect-signal-data.ts` for this specific signal to confirm end-to-end:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/collect-signal-data.ts --dry-run 2>&1
```

The script will show all active signals. Look for the one just configured and confirm it:
- Is picked up (not skipped)
- Shows the data source and current value
- Shows `% of threshold`
- Does NOT show an error

Show the relevant output lines to the user.

If the signal is not appearing or shows an error, diagnose the issue — likely a malformed `explicit_details` field. Go back to Step 6 and fix.

---

## Conversation Principles

1. **Always pause for confirmation** at the end of Steps 2, 3, 4, and 5. Never proceed to the next step until the user has explicitly agreed or amended.

2. **Present proposals, not just actions.** Before writing anything, show the full `explicit_details` JSON and explain each field. The user should be able to read and understand it.

3. **Respect pushback.** If the user disagrees with a proposed source or threshold, explore alternatives together. Don't retry the same proposal.

4. **Flag uncertainty.** If the signal statement is ambiguous about the threshold, say so. Ask the user to clarify rather than guessing.

5. **One signal at a time.** This skill is designed for a single signal per session. If the user wants to configure multiple signals, suggest running the skill again.

6. **Don't create new infrastructure.** This skill writes to `explicit_details` only. If the signal genuinely requires a new collector that doesn't exist (a new API, a new derived calculation), flag this to the user rather than attempting to create scripts.

---

## Quick-Reference: explicit_details field shapes

All shapes must include `checkFrequency` (`"daily"` or `"weekly"`).

### Single-source quantitative (defillama / coingecko / tradingview_cdp / hypeflows)
```json
{
  "dataSource": "<source>",
  "endpoint": "<url>",           // defillama, coingecko only
  "ticker": "<TICKER>",          // tradingview_cdp only
  "metric": "<field-path>",
  "calculation": "<formula>",    // optional
  "operator": "gte",
  "threshold": 1400000000,
  "thresholdUnit": "USD",
  "metricName": "Human-readable name",
  "checkFrequency": "daily"
}
```

### Internal DB (parent thesis check)
```json
{
  "dataSource": "internal_db",
  "parentThesisId": "<uuid>",
  "parentThesisTitle": "<string>",
  "metric": "status_or_confidence",
  "logic": "any",
  "conditions": [
    { "field": "status", "label": "...", "operator": "eq", "threshold": "rejected" },
    { "field": "confidence_level", "label": "...", "operator": "eq", "threshold": "low" }
  ],
  "checkFrequency": "daily"
}
```

### Qualitative only (no numeric polling)
```json
{
  "dataSource": "news_qualitative",
  "monitorKeywords": ["keyword1", "keyword2"],
  "monitorContext": "What to look for and how to assess ambiguous evidence.",
  "deadline": "YYYY-MM-DD",
  "checkFrequency": "weekly"
}
```

### Derived (multi-source calculation)
```json
{
  "dataSource": "derived",
  "calculation": "<formula-string>",
  "threshold": 17.5,
  "thresholdUnit": "ratio",
  "operator": "between",
  "components": [
    { "metric": "market_cap", "source": "coingecko" },
    { "metric": "annualized_revenue", "source": "defillama" }
  ],
  "checkFrequency": "daily"
}
```

### Multi-condition compound signal
```json
{
  "checkFrequency": "daily",
  "conditions": [
    {
      "label": "Condition A label",
      "dataSource": "tradingview_cdp",
      "ticker": "BTCUSD",
      "metric": "spot",
      "operator": "gte",
      "threshold": 500000,
      "thresholdUnit": "USD"
    },
    {
      "label": "Condition B label",
      "dataSource": "news_qualitative",
      "monitorKeywords": ["..."],
      "monitorContext": "...",
      "threshold": 3,
      "thresholdUnit": "nations"
    }
  ]
}
```

---

## Environment Setup

All bash commands must be run from the trade-journal directory. The DB connection is loaded automatically by `psql-query.ts` from `.env.local`.

```bash
cd /Users/home-hub/projects/trade-journal
```

Do not manually source `.env.local` — `psql-query.ts` handles it internally.
