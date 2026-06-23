---
name: configure-signal
description: "[RETIRED 2026-06-19 — do not invoke] Manual signal/threshold configuration is retired under the loose-agent model (docs/v2/10 §6/§9). Signals are now the synthesized resolution section of a thesis's living underwriting, auto-derived by /build-core-argument from the linked claims' own rebuttals — never hand-wired. Kept only as a tombstone; the dormant explicit_details + collect-signal-data wiring survives for rare hard thresholds."
allowed-tools: Bash, Read, Write
---

# Configure Signal Skill

> **⚠️ RETIRED (docs/v2/10 §6/§9, 2026-06-19).** The loose-agent model removes manual
> signal configuration: signals are now the **synthesized resolution section** of a thesis's
> living underwriting, auto-derived by `/build-core-argument` from the linked claims' own
> rebuttals — never hand-wired to a metric/threshold. Do **not** invoke this skill for new
> work; `explicit_details` is no longer populated. Kept only as historical reference for the
> handful of legacy signals that still carry a metric config.

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

**Economic calendar signals**: If the signal statement depends on a specific scheduled economic release (e.g. "FOMC holds rates", "CPI comes in below forecast", "NFP exceeds 200K"), classify as **Quantitative** and note `economic_calendar` as the data source. Do not classify these as `news_qualitative` — the release data is numeric and collected automatically.

Present your classification reasoning, then ask:

> "I'd classify this as **[category]** because [reasoning]. Does that sound right, or would you frame it differently?"

Wait for confirmation before proceeding.

---

## Step 3 — IDENTIFY SOURCE

Query the signal data source registry to see all available sources:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "
SELECT key, name, description, category, measure_type, asset_scope,
       available_metrics, ingestion_method, ingestion_schedule,
       config_template, config_example
FROM signal_data_source_registry
WHERE is_active = true
ORDER BY category, name
" --format json
```

Present the relevant sources to the user based on their signal's classification (Step 2):
- For **quantitative** signals: show sources where `measure_type = 'quantitative'`
- For **qualitative** signals: show sources where `measure_type = 'qualitative'`
- For **per_ticker** sources: verify the signal's ticker is in `supported_tickers` (or `supported_tickers IS NULL` meaning all tickers)
- For **economic** signals: show sources where `category = 'economic'`

Use the `config_template` from the registry to build the `explicit_details` JSON. Replace `{{PLACEHOLDERS}}` with actual values determined from the signal statement and user input.

If `config_example` is available, show it to the user as a reference.

### Special handling for specific source types

#### `tradingview_cdp` — Ticker support
- **Supported tickers** (hardcoded in `tradingview.ts`): `GLXY`, `SPX`, `NDX`, `BTCUSD`, `BTC`
- If you need a ticker not in the TICKER_MAP, flag it — the collector will warn. You can add it to `scripts/lib/collectors/tradingview.ts` if needed.

#### `economic_calendar` — Discovery step

Always run before proposing a config:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT event_type, COUNT(*) as occurrences, MAX(event_date::date) as latest FROM economic_events GROUP BY event_type ORDER BY occurrences DESC" --format json
```

Then check upcoming events for the chosen type:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT event_type, title, event_date, forecast, previous, impact_level FROM economic_events WHERE event_type = '<EVENT_TYPE>' AND event_date > NOW() ORDER BY event_date ASC LIMIT 5" --format json
```

Always confirm at least one upcoming event exists before proceeding.

#### `internal_db` — Find parent thesis

To find the parent thesis ID:
```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT id, title FROM macro_theses WHERE title ILIKE '%<keyword>%'" --format json
```

### When no registry source fits

If the signal requires a data source not in the registry, flag this to the user:
> "No existing data source in the registry matches this signal. Options:
> 1. Use `news_qualitative` for manual monitoring until a data source is built
> 2. File a backlog issue to add a new data source"

Do not attempt to create new collector infrastructure within this skill.

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

### economic_calendar test

**For `days_until_event`** — confirm the next event exists and calculate days remaining:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT event_type, title, event_date, EXTRACT(DAY FROM event_date - NOW())::int AS days_until FROM economic_events WHERE event_type = 'FOMC_RATE_DECISION' AND country = 'US' AND event_date > NOW() ORDER BY event_date ASC LIMIT 1" --format json
```

Show: "Next [eventType]: [date] — [N] days away (lookAheadDays: [N] → [pct]% of threshold)."

**For `event_actual_vs_forecast`** — confirm recent releases have both actual and forecast populated:

```bash
cd /Users/home-hub/projects/trade-journal && npx tsx scripts/psql-query.ts "SELECT event_type, title, event_date, actual, forecast, (actual - forecast) AS surprise FROM economic_events WHERE event_type = 'CPI_MM' AND country = 'US' AND actual IS NOT NULL ORDER BY event_date DESC LIMIT 5" --format json
```

Show recent surprises: "Last 3 releases: surprises were +X, -Y, +Z pp. Threshold: ±[N] pp [direction]."

If no rows return with `actual IS NOT NULL`, the event type has no historical data yet — flag this to the user before proceeding.

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
- If `economic_calendar / days_until_event`: threshold is always `0` with `operator: lte`. The key setting is `lookAheadDays` — ask: "How far ahead should the countdown start? Default is 30 days. Use 14 for urgent short-fuse signals, 60 for slow-build preparation signals."
- If `economic_calendar / event_actual_vs_forecast`: threshold is the minimum surprise magnitude. Ask: "How large a miss/beat should trigger this signal — 0.1pp? 0.2pp?" Direction should already be established from the signal statement.

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

### Economic calendar — countdown to release
```json
{
  "dataSource": "economic_calendar",
  "calculation": "days_until_event",
  "eventType": "FOMC_RATE_DECISION",
  "country": "US",
  "lookAheadDays": 30,
  "threshold": 0,
  "thresholdUnit": "days",
  "operator": "lte",
  "checkFrequency": "daily"
}
```

### Economic calendar — release surprise
```json
{
  "dataSource": "economic_calendar",
  "calculation": "event_actual_vs_forecast",
  "eventType": "CPI_MM",
  "country": "US",
  "direction": "below_forecast",
  "threshold": 0.1,
  "thresholdUnit": "percentage points",
  "checkFrequency": "daily"
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
