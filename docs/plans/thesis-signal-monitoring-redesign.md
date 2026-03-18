# Thesis Signal & Monitoring System Redesign

> Created: 2026-03-16
> Last updated: 2026-03-18
> Status: Phases 1–3 complete (incl. signal dedup via junction table). Phase 5 complete. Phase 2d documented. Phase 4 not started. All quick wins (tasks 1, 2, 5, 6/7, 8, 9) complete as of 2026-03-18.

## Context

The original signal system generated 15+ signals per thesis, creating an unmanageable monitoring burden (136 active signals across 13 theses, 320 draft signals never reviewed, 28 triage records stuck in inbox). This plan redesigns the system around focused, evidence-grounded signals and a clear thesis lifecycle with two phases: **building** and **monitoring**.

### Thesis lifecycle

```
BUILDING PHASE                          MONITORING PHASE
─────────────────────────────────────   ──────────────────────────────────────

Claims accumulate                       Signals are set (transition point)
    ↓                                       ↓
PRODUCE_CORE_ARGUMENT                   New claims → EVALUATE_NEW_EVIDENCE
    ↓                                       ↓
Articulation + signals generated        "Does this confirm/invalidate a signal?"
    ↓                                       ↓
User accepts or rejects signals         Thesis Monitor Report (scheduled)
    ↓                                       ↓
If rejected → stays in building         Scans news, data, prices against signals
If accepted → transitions to monitoring     ↓
                                        Signal triggered → triage action
                                            ↓
                                        Completion → exit strategies
```

**Transition point**: Once a thesis has active signals, it's in monitoring mode. User can reject signals during `/build-core-argument` to keep the thesis in building phase. Explicitly re-running `/build-core-argument` is the manual override to re-enter building phase.

---

## Completed (2026-03-16 to 2026-03-17)

- [x] **Bulk cleanup**: Rejected 320 draft + 135 active thesis signals. Dismissed 28 REVIEW_RECOMMENDED_SIGNALS triage records.
- [x] **Signal generation redesign** (`/build-core-argument` SKILL.md + `insert-thesis-articulation.ts`):
  - Max 5 focused signals per thesis: up to 2 confirmation, 2 invalidation, 1 completion
  - All evidence-grounded (`linkedClaimIds` required), quality over quantity
  - Generated as `active` (no draft/review workflow)
  - `completion` signal type added: "thesis has fully played out, no remaining catalysts"
  - Removed REVIEW_RECOMMENDED_SIGNALS triage creation from insert script
- [x] **Signal UI cleanup** (`src/components/signals/UnifiedSignalsTable.tsx`):
  - Added `completion` type with blue badge and target icon
  - Display "Confirmation / Invalidation / Completion" (not "warning")
  - Removed category and importance columns (always "judgment" and "critical")
  - DB migration: added `completion` to `signals_type_check` constraint
  - Fixed `getActiveSignals` query to exclude rejected signals
- [x] **Generated focused signals** on 3 key theses via `/build-core-argument`: HYPE (5 signals), BTC (5 signals), GLXY (5 signals) — 15 active signals total
- [x] **CDP data discovery** (`docs/cdp-data-discovery.md`, `.claude/skills/cdp-discover/`):
  - Chrome Debug instance on Mac Mini port 9222 with persistent profile
  - Discovered HypeFlows API (public, no auth) and TradingView APIs (authenticated)
  - Reference: `docs/cdp-data-discovery.md` for all discovered endpoints and integration patterns
- [x] **Signal data source configuration** (Phase 2b): `explicit_details` populated on all 15 signals with verified data sources
- [x] **Signal data tracking infrastructure** (Phase 2c): `signal_data_snapshots` table, 6 collectors, post-ingestion hook, scheduling, frontend progress cards — 239 snapshots across 10 sources
- [x] **First real thesis monitor run**: report ingested, 15 qualitative snapshots generated automatically
- [x] **Price history backfill**: 60 days BTC/NDX/SPX daily closes, 30d correlation = 0.676, 60d = 0.582
- [x] **GLXY-STK orphaned signal fix** (2026-03-17): The $41.21 take-profit signal was assigned to a merged/inactive strategy. Moved to the active GLXY-STK strategy (`strategy_id = 13d03c32-...`). Root cause: no unified signal view existed to surface this. Fixed by Phase 5.
- [x] **Phase 5: Unified Signals Browser page** (2026-03-17): `/signals` entity page built and added to sidebar under Activity. Filterable by status/type/entity, sortable by % to threshold. Expanded rows reuse `SignalProgressCard`. New files: `src/db/queries/signals.ts`, `src/components/signals/SignalsBrowser.tsx`, `src/components/signals/SignalTrendIndicator.tsx`, `src/app/signals/page.tsx`.
- [x] **Phase 3: Strategy price signal system** (2026-03-17): `sync-tv-drawings.ts` CDP job reads TP/SL drawings from both BTC indicator panel (`/layout/{uid}/sources`) and USD main-series panel (`/user/sources?symbol=`) in a single CDP session. Idempotent upsert by `tvDrawingId`. 35 signals created (10 BTC-ratio, 25 USD) across GLXY, HYPE, BTC strategies. `collect-signal-data.ts` extended to batch-collect spot prices and compute BTC ratios, writing `strategy_price` snapshots. Progress bars visible in Signals Browser for all strategy signals.

## Key Learnings & Insights

### Architecture insights

1. **Two-channel monitoring is the right model.** Every signal gets both quantitative tracking (API data) and qualitative assessment (thesis monitor). The `signal_data_snapshots` table unifies both in one time-series, with `data_source` distinguishing the channel. This means no signal falls through the cracks.

2. **TradingView scanner API is public.** Prices, market cap, and performance data for stocks, indices, and crypto are available via `POST scanner.tradingview.com/{exchange}/scan` with no authentication. CDP is only needed for account-specific features (watchlists, chart drawings, alerts, economic calendar). This significantly simplifies the quantitative collection pipeline.

3. **The post-ingestion hook pattern works well.** Rather than a separate qualitative collection step, generating snapshots immediately after thesis monitor ingestion ensures qualitative data is always in sync with the report. The hook matches intelligence items to signals by ticker and `monitorKeywords` from `explicit_details`.

4. **Correlation requires historical prices, not just current values.** The Yahoo Finance v8 API provides 3 months of daily closes with no auth, which enables immediate correlation computation. The `backfill-price-history.ts` script handles this.

### Data source reference

| Source | Auth | Collector | Endpoint |
|--------|------|-----------|----------|
| TradingView Scanner | None | `tradingview.ts` | `POST scanner.tradingview.com/{exchange}/scan` |
| CoinGecko | None (free tier, ~30 req/min) | `coingecko.ts` | `api.coingecko.com/api/v3/coins/{id}` |
| DefiLlama | None | `defillama.ts` | `api.llama.fi/summary/fees/{protocol}` |
| HypeFlows | None | `hypeflows.ts` (wraps existing client) | `hypeflows.com/api/perp-data` |
| Yahoo Finance | None | `derived.ts` | `query1.finance.yahoo.com/v8/finance/chart/{ticker}` |
| Internal DB | Direct | `internal-db.ts` | SQL query on `macro_theses` |
| Thesis Monitor | N/A | Post-ingestion hook in `ingest-world-monitor.ts` | Matches `intelligence_items` to signals |

### TradingView CDP vs public access

| Endpoint | Public? | Method |
|----------|---------|--------|
| Scanner (prices, market cap, 52w, performance) | Yes | Direct curl/fetch |
| News (symbol-specific) | Yes | Direct curl/fetch |
| Economic calendar | No (403) | CDP needed |
| Watchlists | No (login required) | CDP needed |
| Chart drawings / text notes | No (JWT required) | CDP needed |
| Price alerts | No (unauthorized) | CDP needed |

### Scheduling cadence

```
6:07 AM/PM  →  World Monitor (RSS scan, general intelligence)
7:07 AM/PM  →  Thesis Monitor (signal-focused evaluation → qualitative snapshots)
7:37 AM/PM  →  Signal Collection (quantitative data from APIs → numeric snapshots)
8:15 AM/PM  →  Morning Review (triage + inbox processing)
```

All via launchd on Mac Mini. Install script: `paperclip/launchd/install.sh`

### Current signal coverage (as of 2026-03-17)

| Signal | Thesis | Type | Quantitative Source | Current | Threshold | % |
|--------|--------|------|-------------------|---------|-----------|---|
| Revenue ARR | HYPE | confirmation | DefiLlama | $659M | $1.4B | 47% |
| Perp market share | HYPE | confirmation | HypeFlows | 5.0% | 10% | 48% |
| Market cap $40B | HYPE | completion | CoinGecko | $9.9B | $40B | 25% |
| Regulatory action | HYPE | invalidation | Thesis Monitor | — | — | qualitative |
| Parent thesis | HYPE | invalidation | Internal DB | active | rejected | healthy |
| BTC decorrelation | BTC | confirmation | Derived (Yahoo) | corr 0.68 | <0.3 | needs decorrelation |
| Sovereign adoption | BTC | confirmation | Thesis Monitor | — | — | qualitative |
| 90d correlation >0.7 | BTC | invalidation | Derived (Yahoo) | corr 0.58 | >0.7 | 83% (not triggered) |
| Parent thesis | BTC | invalidation | Internal DB | active | rejected | healthy |
| Central banks + $500K | BTC | completion | TradingView + TM | $73.8K | $500K | 15% |
| Helios 200MW H1 2026 | GLXY | confirmation | Thesis Monitor | on track | operational | qualitative |
| Valuation $15MM/MW | GLXY | confirmation | Derived (TV) | $0/MW | $15MM | 0% (0 MW) |
| CoreWeave default | GLXY | invalidation | Thesis Monitor | no concern | default | qualitative |
| Parent thesis | GLXY | invalidation | Internal DB | active | rejected | healthy |
| 800MW + $40B + REIT | GLXY | completion | TradingView + TM | $9B mcap | $40B | 23% |

---

## Phase 1: EVALUATE_NEW_EVIDENCE triage rule

**Status**: Complete (2026-03-16)

### What
Change `thesisTriage.ts` so that when new claims arrive for a thesis that **already has active signals**, it creates an `EVALUATE_NEW_EVIDENCE` triage record instead of `UPDATE_CORE_ARGUMENT`.

### Why
Once signals are set, the thesis is in monitoring mode. New claims should be evaluated against existing signals, not trigger a full re-articulation.

### Logic change

```
IF thesis has articulation AND ≥3 new claims since last articulation:
  IF thesis has active signals → EVALUATE_NEW_EVIDENCE
  ELSE → UPDATE_CORE_ARGUMENT (existing behavior)
```

### Key files
- `src/lib/derived/thesisTriage.ts` — add signal-existence check, route to new triage rule
- `docs/features/signal-triage-rules.md` — document new rule

### EVALUATE_NEW_EVIDENCE triage record
- `triageRule`: `'EVALUATE_NEW_EVIDENCE'`
- `severity`: `'info'`
- `lifecycleStage`: `'monitoring'`
- `actionRequired`: lists new claim count and existing signal summary
- `contentSummary`: new claim IDs, signal IDs, signal statements

### Evaluation workflow (when user acts on triage)
For each new claim, assess against each active signal:
1. Does this claim provide evidence **for** a confirmation signal?
2. Does this claim provide evidence **against** (supporting an invalidation signal)?
3. Does this claim suggest the thesis is approaching **completion**?
4. No bearing on any signal (most common — just enriches the thesis)

Only recommend re-articulation if new evidence fundamentally challenges the thesis structure.

### Verification
- [x] Thesis with active signals + 3 new claims → creates EVALUATE_NEW_EVIDENCE
- [x] Thesis without signals + 3 new claims → creates UPDATE_CORE_ARGUMENT (unchanged)

---

## Phase 2: Thesis Monitor Report

**Status**: Complete (2026-03-16)

### What
A new scheduled skill that leverages the World Monitor infrastructure but narrows the search to active theses, their signals, and strategy price targets.

### Why
Signals need a monitoring mechanism. Rather than manual checking, the system should proactively scan for evidence that confirms, invalidates, or completes thesis signals.

### Architecture

**Reuse from World Monitor** (`notes/.claude/skills/world-monitor/SKILL.md`):
- `fetch-feeds` CLI (440+ RSS feeds + GDELT, UCDP, Polymarket APIs)
- Report structure (severity-tagged items, structured markdown)
- Parsing + ingestion pipeline (`parseWorldMonitor.ts`, `ingest-world-monitor.ts`)
- Paperclip agent scheduling infrastructure

**Additional data sources for thesis-specific monitoring:**

| Source | Data type | Status |
|--------|-----------|--------|
| FRED | Economic indicators | Already integrated (34 series, daily script) |
| Massive API | Spot prices, IV30 | Already integrated (daily ingestion) |
| IBKR | Real-time pricing, options | Already integrated (hourly ingestion) |
| SEC EDGAR | Company filings | New — needs integration |
| CoinGecko | Crypto pricing | New — needs integration |
| Google Finance / Yahoo Finance | Financial news, earnings | Partially integrated |

### Skill design

**Input**: Load from database:
1. All active theses (macro + asset) with their active signals
2. All active strategies with price targets
3. Relevant tickers and sectors

**Search strategy**: Derive search terms from thesis titles, signal statements, tickers, strategy targets.

**Output**: Thesis-oriented report:

```markdown
## Signal Watch

### Confirmation signals — evidence found
- [Thesis: Bullish Copper] "China infrastructure spending exceeds $X"
  — Evidence: [news item]

### Invalidation signals — no evidence this period
- [Thesis: Bullish NVDA] "CUDA-compatible alternative ships"

### Completion signals — approaching
- [Thesis: Bullish Gold] "Gold reaches $3,500/oz"
  — Current: $3,200 (91% of target)

### Strategy price targets
- NVDA LONG_CALL: Target 1 ($180) — Current: $165 (92%)
```

**Schedule**: Twice daily, offset from World Monitor (e.g., 7:00 AM / 7:00 PM)

### Files created/modified
- `notes/.claude/skills/thesis-monitor/SKILL.md` — new skill definition
- `paperclip/agents/research-analyst/HEARTBEAT.md` — added Section 6 for thesis monitor tasks
- `paperclip/scripts/schedule-thesis-monitor.sh` — scheduling script (7:07 AM/PM, offset from World Monitor)
- `trade-journal/scripts/ingest-world-monitor.ts` — extended to handle thesis-monitor report type
- `CLAUDE.md` — added `/thesis-monitor` skill reference
- Uses existing `parseWorldMonitor.ts` parser (handles both report types via frontmatter `type` field)
- Uses existing `intelligence_reports` + `intelligence_items` tables (thesis-monitor is a report type, not a separate schema)

### Verification
- [ ] Skill loads active theses + signals from database
- [ ] Produces structured report with signal assessments
- [ ] Report ingests to database via existing pipeline
- [ ] Scheduled runs produce reports on cadence
- [ ] Research analyst agent picks up "Thesis Monitor Report" tasks

---

## Phase 2b: Signal Data Source Configuration

**Status**: Complete (2026-03-17)

### What
For each active signal, identify a specific data source, verify it works, and store the configuration in `explicit_details` so the monitoring system knows exactly how to evaluate each signal.

### Data source tiers

| Tier | Source | Auth | Examples |
|------|--------|------|----------|
| **Free APIs** | HypeFlows, DefiLlama, CoinGecko, Hyperliquid API, FRED | No | Volume, revenue, market cap, economic data |
| **CDP authenticated** | TradingView scanner, economic calendar, chart drawings, alerts | Persistent Chrome session | Price targets, S/R levels, economic events |
| **Existing integrations** | Massive API, IBKR, exchange APIs | API keys (configured) | Real-time pricing, IV, options |
| **Thesis Monitor (qualitative)** | RSS feeds (440+), news, WebSearch | N/A | Regulatory actions, milestones, events |
| **Internal DB** | SQL queries against `macro_theses` | Direct | Parent thesis status/confidence checks |

### Two monitoring channels

Every signal is monitored through one or both channels:

1. **Explicit data collection** — scheduled scripts query APIs and store numeric snapshots (price, %, ratio, count). Runs on cron.
2. **Thesis Monitor qualitative assessment** — the `/thesis-monitor` skill (Paperclip research analyst, 7:07 AM/PM via launchd) scans 440+ RSS feeds and news sources, evaluates each signal against current information flow, and produces a qualitative assessment. The report is ingested to `intelligence_reports` + `intelligence_items`.

Together these cover all signal types — quantitative signals get precise data points, qualitative signals get evidence-based assessments, and many signals benefit from both.

### Signal configuration workflow
1. **Identify metric** — what specific data point(s) indicate progress?
2. **Find data source** — free API first, then CDP authenticated, then qualitative-only
3. **Verify access** — test the endpoint, confirm data structure and values
4. **Configure** — store in signal's `explicit_details` JSONB field
5. **Test collection** — run the collector once, verify snapshot lands in DB

### Verified data sources (all 15 thesis signals)

**HYPE (Bullish HYPE Medium Term)**

| Signal | Type | Source | Endpoint | Metric | Verified Value | Threshold |
|--------|------|--------|----------|--------|---------------|-----------|
| Revenue $1.4B ARR | confirmation | DefiLlama | `api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue` | `total30d * 12` | $659M | $1.4B |
| 10% perp share | confirmation | HypeFlows | `hypeflows.com/api/perp-data?metric=volume` | HL / total | 5.0% | 10% |
| $40B market cap + P/E 15-20x | completion | CoinGecko + DefiLlama | `api.coingecko.com/api/v3/coins/hyperliquid` | `market_data.market_cap.usd` | $9.9B | $40B |
| Regulatory action | invalidation | Thesis Monitor | RSS + news scanning | qualitative | — | — |
| Parent thesis invalidated | invalidation | Internal DB | SQL query | `macro_theses.status` | active | rejected/low |

**BTC (Bullish BTC Long Term)**

| Signal | Type | Source | Metric | Threshold |
|--------|------|--------|--------|-----------|
| Decorrelation from NASDAQ | confirmation | Derived (TradingView CDP) | 30d rolling corr(BTC, NDX) during SPX drawdown | corr < 0.3 + SPX down >5% |
| Sovereign BTC allocation | confirmation | Thesis Monitor | qualitative | G20 nation or SWF >$100B |
| 90d correlation stays >0.7 | invalidation | Derived (TradingView CDP) | 90d rolling corr(BTC, NDX) | >0.7 through 2027 |
| Parent thesis invalidated | invalidation | Internal DB | `macro_theses.status` | rejected/low |
| Central bank reserves + $500K | completion | CoinGecko + Thesis Monitor | spot price + qualitative (nations count) | $500K + 3 nations |

**GLXY (Bullish GLXY Medium Term)**

| Signal | Type | Source | Metric | Threshold |
|--------|------|--------|--------|-----------|
| Helios 200MW online H1 2026 | confirmation | Thesis Monitor | qualitative (press releases, earnings) | operational + revenue |
| Valuation >$15MM/MW | confirmation | Derived (TradingView CDP) | market cap / capacity MW | >$15MM/MW |
| CoreWeave default/restructure | invalidation | Thesis Monitor | qualitative (credit, filings) | default or covenant breach |
| Parent thesis invalidated | invalidation | Internal DB | `macro_theses.status` | rejected/low |
| 800MW + $40B + REIT comps | completion | TradingView CDP + Thesis Monitor | market cap + qualitative | $40B + 800MW |

### Data gaps identified
- **No equity index data** (SPX, NASDAQ) in database — needed for BTC correlation signals. TradingView CDP is the source.
- **GLXY spot is null** in `underlyings` table — IV history from Massive has it (~$23). TradingView CDP or IBKR sync needed.
- **FRED tables exist but are empty** — daily FRED ingestion script exists but hasn't populated data yet.

### Built
- [x] `scripts/lib/hypeflows.ts` — HypeFlows client (market share, volume, OI)
- [x] CDP infrastructure (`cdp-discover`, `cdp-fetch`, Chrome Debug on port 9222)
- [x] TradingView API discovery (scanner, calendar, drawings, alerts)
- [x] `explicit_details` populated on all 15 thesis signals with data source configs
- [x] All free API endpoints verified (DefiLlama, HypeFlows, CoinGecko) — correct values returned

---

## Phase 2c: Signal Data Tracking Infrastructure

**Status**: Complete (2026-03-17)

### What
Wire the existing monitoring infrastructure (thesis monitor skill + data source APIs) into a unified time-series storage layer, then surface it in the frontend.

### Why
The monitoring is already happening — the thesis monitor skill runs twice daily and evaluates every signal qualitatively, and the data source APIs are verified and configured. But nothing is persisted as trackable data. We need to close the loop: monitoring → storage → visualization.

### What already exists

| Component | Status | Where |
|-----------|--------|-------|
| Thesis monitor skill (qualitative) | Running 2x daily | `paperclip/.claude/skills/thesis-monitor/SKILL.md` |
| Paperclip research analyst agent | Running | `paperclip/agents/research-analyst/HEARTBEAT.md` (Section 6) |
| launchd scheduling | Installed | `paperclip/launchd/com.paperclip.thesis-monitor.plist` (7:07 AM/PM) |
| Report ingestion pipeline | Working | `scripts/ingest-world-monitor.ts` → `intelligence_reports` + `intelligence_items` |
| Signal configs (`explicit_details`) | All 15 populated | Each signal has data source, thresholds, keywords |
| Data source API clients | Verified | DefiLlama, HypeFlows, CoinGecko (free, no auth), TradingView CDP |
| `signal_data_tracking` table | Exists (empty) | Single last-value per signal (not time-series) |
| `LineChart.tsx` component | Built | Reusable chart component for frontend |

### What needs building

```
EXISTING (already runs)                    NEW                            NEW
──────────────────────                     ───                            ───

Thesis Monitor skill (2x daily)                                          Signal progress cards
├── Loads signals (Step 1)                                               ├── Current value/assessment
├── Fetches RSS + APIs (Steps 3-4)                                       ├── Sparkline trend
├── Evaluates each signal (Step 5-6)       signal_data_snapshots         ├── % to threshold
├── Produces report (Step 7)          ◄──  (unified time-series)    ──►  ├── Evidence timeline
└── Ingests to Supabase (Step 10)                                        └── Data source badge
         │                                       ▲
         │ post-ingestion hook [NEW]              │
         └───────────────────────────────────────┘
                                                  ▲
Quantitative collectors [NEW]                     │
├── DefiLlama → revenue               ───────────┘
├── HypeFlows → market share
├── CoinGecko → market cap, price
├── TradingView CDP → prices (BTC, GLXY, SPX)
├── Internal DB → parent thesis status
└── Derived → correlation, valuation/MW
```

### Step 1: `signal_data_snapshots` table

Unified time-series storage for ALL signal types — quantitative and qualitative in one table.

```sql
CREATE TABLE signal_data_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id           uuid NOT NULL REFERENCES signals(id),
  snapshot_date       timestamptz NOT NULL DEFAULT now(),

  -- Quantitative data (for data-driven signals)
  observed_value      numeric(18,6),          -- the raw metric value
  threshold_value     numeric(18,6),          -- threshold at time of observation
  pct_to_threshold    numeric(8,4),           -- (observed / threshold) * 100
  unit                text,                    -- 'USD', '%', 'ratio', 'count', 'MW'

  -- Qualitative data (for thesis monitor assessments)
  assessment          text,                    -- 'no_evidence' | 'emerging' | 'partial' | 'strong' | 'confirmed'
  evidence_summary    text,                    -- human-readable summary of what was found
  intelligence_item_id uuid REFERENCES intelligence_items(id),  -- link to specific news item

  -- Source tracking
  data_source         text NOT NULL,           -- 'defillama' | 'hypeflows' | 'coingecko' | 'tradingview_cdp' | 'internal_db' | 'thesis_monitor' | 'derived'
  report_id           uuid REFERENCES intelligence_reports(id),  -- for thesis monitor snapshots

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT idx_signal_snapshots_unique UNIQUE (signal_id, snapshot_date, data_source)
);

CREATE INDEX idx_signal_snapshots_signal ON signal_data_snapshots(signal_id, snapshot_date DESC);
CREATE INDEX idx_signal_snapshots_report ON signal_data_snapshots(report_id) WHERE report_id IS NOT NULL;
```

Key design decisions:
- **One table for both types**: quantitative signals populate `observed_value`/`threshold_value`/`pct_to_threshold`; qualitative signals populate `assessment`/`evidence_summary`/`intelligence_item_id`. Some signals populate both.
- **Unique constraint on (signal_id, snapshot_date, data_source)**: prevents duplicate snapshots from the same collection run
- **`report_id` links to `intelligence_reports`**: for qualitative snapshots generated from thesis monitor reports
- **`intelligence_item_id` links to `intelligence_items`**: pinpoints the specific news item that triggered the assessment

### Step 2: Enhance thesis monitor skill to read `explicit_details`

The thesis monitor skill (Step 1 queries) currently loads `id`, `type`, `statement`, `notes` per signal. Add `explicit_details` so the skill gets:
- `monitorKeywords` — more targeted RSS/news search terms
- `threshold` / `thresholdUnit` — for including progress context in assessments
- `dataSource` — to know which signals are purely qualitative vs also data-driven
- `monitorContext` — background context for better assessments

**Change**: Update Step 1a/1b SQL queries in `paperclip/.claude/skills/thesis-monitor/SKILL.md` to include `s.explicit_details` in the `json_agg`.

### Step 3: Post-ingestion hook for qualitative snapshots

After `ingest-world-monitor.ts` ingests a thesis-monitor report, generate qualitative snapshots.

**Change to `ingest-world-monitor.ts`**:
```
After INSERT intelligence_reports + intelligence_items:
  IF report.type == 'thesis-monitor':
    generateQualitativeSnapshots(reportId)
```

**`generateQualitativeSnapshots(reportId)`**:
1. Load the report's `intelligence_items`
2. Load all active thesis signals
3. Match items to signals:
   - By `relevantTickers` → asset thesis signals for that ticker
   - By `monitorKeywords` from `explicit_details` → keyword matching against headline + body
4. For each signal, determine assessment level from the matched items:
   - `no_evidence` — no items matched this signal
   - `emerging` — weak/indirect match
   - `partial` — relevant item found but doesn't fully confirm/deny
   - `strong` — clear evidence for/against the signal
   - `confirmed` — signal criterion is met
5. Insert to `signal_data_snapshots` with `data_source = 'thesis_monitor'`, `report_id`, `intelligence_item_id`

This means every thesis monitor run generates a qualitative snapshot for every active signal — even "no_evidence" snapshots, so the timeline is complete.

### Step 4: Quantitative data collectors

Small, testable functions — one per data source type.

```
scripts/lib/collectors/
├── defillama.ts       — fetch fees/revenue, calculate ARR
├── hypeflows.ts       — fetch volume, calculate market share (uses existing client)
├── coingecko.ts       — fetch market cap, price
├── tradingview-cdp.ts — fetch prices via CDP (BTC, GLXY, SPX, NDX)
├── internal-db.ts     — query parent thesis status/confidence
└── derived.ts         — computed metrics (correlation, valuation/MW)
```

Each collector:
1. Reads signal's `explicit_details` to know what to fetch
2. Calls the data source
3. Returns `{ observedValue, thresholdValue, pctToThreshold, unit }`

### Step 5: Collection orchestrator

```bash
# Quantitative collection (daily cron)
npx tsx scripts/collect-signal-data.ts

# Qualitative snapshots (auto-called after thesis monitor ingestion)
# No manual invocation needed — runs as post-ingestion hook
```

**Quantitative flow**:
1. Load all active signals with `explicit_details` where `dataSource` is not `news_qualitative`
2. Group by `dataSource`
3. For each group, call the appropriate collector
4. Insert snapshots to `signal_data_snapshots`

### Step 6: Frontend — signal progress visualization

Add signal tracking to the thesis detail page (Claims & Signals tab).

**Signal progress card** (per signal):
- Signal statement + type badge (confirmation/invalidation/completion)
- Current value vs threshold (for quantitative) or latest assessment (for qualitative)
- % to threshold progress bar (quantitative)
- Sparkline showing trend over time (reuse `LineChart.tsx`)
- Evidence timeline: last N qualitative assessments with evidence summaries
- Data source badge showing where the data comes from
- Link to intelligence report items

**API endpoint**:
```
GET /api/signals/[id]/snapshots?days=90
→ { snapshots: [{ date, value, threshold, pctToThreshold, assessment, evidenceSummary, dataSource }] }
```

### Scheduling

| Job | Frequency | Mechanism | What it does |
|-----|-----------|-----------|-------------|
| Thesis monitor (existing) | 7:07 AM/PM | launchd `com.paperclip.thesis-monitor` | Produces report → ingestion → qualitative snapshots (via post-ingestion hook) |
| Quantitative collection | Daily (after market close) | GitHub Actions or launchd | Queries data-driven signal sources, stores numeric snapshots |
| TradingView CDP collection | Daily | launchd (Mac Mini, Chrome Debug) | Fetches prices/chart data for signals needing CDP |

### Build order

1. ~~**Table migration**~~ — `signal_data_snapshots` table + `report_type` column on `intelligence_reports` ✅
2. ~~**Post-ingestion hook**~~ — `ingest-world-monitor.ts` generates qualitative snapshots after thesis-monitor ingestion ✅
3. ~~**Update thesis monitor skill**~~ — Step 1 queries include `s.explicit_details` ✅
4. ~~**Quantitative collectors**~~ — DefiLlama, HypeFlows, CoinGecko, internal DB ✅
5. ~~**Collection orchestrator**~~ — `scripts/collect-signal-data.ts` with `--dry-run` support ✅
6. ~~**Test end-to-end**~~ — 6 quantitative snapshots collected and stored successfully ✅
7. ~~**API endpoint**~~ — `GET /api/signals/[id]/snapshots?days=90` ✅
8. ~~**Frontend**~~ — `SignalProgressCard` component integrated into `UnifiedSignalsTable` expanded rows ✅
9. ~~**TradingView collector**~~ — uses public scanner API (no CDP auth needed for prices/market cap) ✅
10. ~~**Derived collector**~~ — correlation proxy (accumulates price data), valuation/MW ✅
11. ~~**Scheduling**~~ — launchd jobs installed: thesis-monitor 7:07 AM/PM, signal-collection 7:37 AM/PM ✅
12. ~~**Parser update**~~ — `parseWorldMonitor.ts` now handles thesis-monitor report format (signal assessment emojis, subsections) ✅
13. ~~**End-to-end test**~~ — test thesis-monitor report ingested → 15 intelligence items parsed → 15 qualitative snapshots generated ✅
14. ~~**Price history backfill**~~ — 60 days of BTC/NDX/SPX daily closes via Yahoo Finance, 30d correlation = 0.676, 60d = 0.582 ✅

### Files created/modified
- `migrations/add-signal-data-snapshots.sql` — table migration
- `src/db/schema.ts` — `signalDataSnapshots` table + `reportType` on `intelligenceReports`
- `src/lib/intelligence/parseWorldMonitor.ts` — extracts `reportType` from frontmatter
- `scripts/ingest-world-monitor.ts` — stores `reportType`, post-ingestion hook for qualitative snapshots
- `scripts/collect-signal-data.ts` — collection orchestrator
- `scripts/lib/collectors/defillama.ts` — DefiLlama revenue collector
- `scripts/lib/collectors/coingecko.ts` — CoinGecko market cap/price collector
- `scripts/lib/collectors/hypeflows.ts` — HypeFlows market share collector
- `scripts/lib/collectors/internal-db.ts` — parent thesis status checker
- `scripts/lib/collectors/tradingview.ts` — TradingView scanner API (prices, market cap — no auth needed)
- `scripts/lib/collectors/derived.ts` — computed metrics (correlation proxy, valuation/MW)
- `src/app/api/signals/[id]/snapshots/route.ts` — snapshot history API
- `src/components/signals/SignalProgressCard.tsx` — progress visualization component
- `src/components/signals/UnifiedSignalsTable.tsx` — integrated progress card into expanded rows
- `paperclip/.claude/skills/thesis-monitor/SKILL.md` — signal queries include `explicit_details`
- `paperclip/scripts/collect-signal-data.sh` — shell wrapper for quantitative collection
- `paperclip/launchd/com.paperclip.signal-collection.plist` — launchd job (7:37 AM/PM)
- `paperclip/launchd/install.sh` — updated to include thesis-monitor + signal-collection jobs
- `scripts/backfill-price-history.ts` — Yahoo Finance backfill + correlation computation

### Verification
- [x] `signal_data_snapshots` table created with correct schema
- [x] Thesis monitor skill loads `explicit_details` for each signal
- [x] Post-ingestion hook generates qualitative snapshots after thesis monitor report (wired, awaiting first report)
- [ ] Every active signal gets a qualitative snapshot per report (including `no_evidence`) — awaiting first thesis monitor run
- [x] DefiLlama collector fetches HYPE revenue and stores quantitative snapshot ($659M, 47.1%)
- [x] HypeFlows collector fetches market share and stores snapshot (4.8%, 47.6%)
- [x] CoinGecko collector fetches market cap and stores snapshot ($9.9B, 24.7%)
- [x] Internal DB collector checks parent thesis status (3 checks, all active)
- [x] API endpoint returns snapshot history for a signal
- [x] Frontend shows signal progress cards in expanded signal rows
- [x] TradingView collector fetches BTC ($73.8K), GLXY market cap ($9.0B), SPX (6699), NDX (24655) via public scanner API
- [x] Derived collector: correlation proxy captures prices (accumulating for 30d calc), GLXY valuation/MW ($0 — awaiting Helios Phase 1)
- [x] All 11 quantitative signals collecting (0 errors); 4 qualitative signals handled by thesis monitor
- [x] Quantitative collection scheduled via launchd (7:37 AM/PM, 30 min after thesis monitor)
- [x] Thesis monitor scheduled via launchd (7:07 AM/PM)
- [x] Post-ingestion hook generates 15 qualitative snapshots from thesis-monitor report (tested end-to-end)
- [x] Parser handles thesis-monitor report format (signal assessment emojis, thesis subsections)
- [x] Price history backfill: 60 days BTC/NDX/SPX, 30d correlation = 0.676, 60d = 0.582
- [x] Multi-condition signals: each collectible sub-condition stored with unique data_source label

---

## Phase 2d: Signal Monitoring Configuration Workflow

**Status**: Not started

### What
A structured, repeatable workflow for configuring monitoring on new signals. Each signal is bespoke — tied to a specific thesis, with specific data sources, thresholds, and qualitative search criteria. This workflow standardises the investigative process of taking a signal statement and turning it into a fully monitored signal with both quantitative data sources and qualitative monitoring context.

### Why
As the system scales to more theses and signals, the ad-hoc process of "investigate → test → populate `explicit_details`" needs to be systematic. Without this, every new signal requires deep institutional knowledge of what APIs exist, what the thesis monitor skill looks for, and how `explicit_details` is structured. The workflow should be executable by Claude Code (via a skill) or manually, producing a consistent output every time.

### The workflow

When a new signal is created (typically via `/build-core-argument`), it starts with `explicit_details: null`. The configuration workflow fills that gap.

```
Signal created (statement + type + linkedClaimIds)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Step 1: CLASSIFY                                   │
│  What kind of monitoring does this signal need?     │
│                                                     │
│  → Quantitative only (price target, metric)         │
│  → Qualitative only (event, regulatory, milestone)  │
│  → Both (milestone + price threshold)               │
│  → Parent thesis check (internal DB)                │
│  → Derived calculation (correlation, ratio)         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 2: IDENTIFY DATA SOURCES                      │
│  For each monitoring dimension, find the source:    │
│                                                     │
│  Quantitative:                                      │
│  ├─ Price/market cap → TradingView scanner (free)   │
│  ├─ Crypto metrics → CoinGecko, DefiLlama, etc.    │
│  ├─ Economic data → FRED                            │
│  ├─ Protocol data → native APIs (HypeFlows, etc.)   │
│  ├─ Derived → Yahoo Finance + calculation           │
│  └─ Parent thesis → internal DB query               │
│                                                     │
│  Qualitative:                                       │
│  ├─ What keywords should the thesis monitor scan?   │
│  ├─ What news sources are most relevant?            │
│  └─ What context helps assess ambiguous evidence?   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 3: TEST & VERIFY                              │
│  For each data source:                              │
│                                                     │
│  ├─ Hit the endpoint, verify response structure     │
│  ├─ Extract the metric, confirm plausible value     │
│  ├─ Note any auth requirements or rate limits       │
│  └─ Document the exact field path and calculation   │
│                                                     │
│  Output: verified current value + data shape        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 4: CONFIGURE explicit_details                 │
│  Populate the signal's explicit_details JSON:       │
│                                                     │
│  Single-source signals:                             │
│  { dataSource, endpoint, metric, operator,          │
│    threshold, thresholdUnit, checkFrequency,        │
│    monitorKeywords, monitorContext }                 │
│                                                     │
│  Multi-condition signals (completion):              │
│  { conditions: [                                    │
│    { label, dataSource, metric, threshold, ... },   │
│    { label, dataSource: "news_qualitative",         │
│      monitorKeywords, monitorContext }               │
│  ]}                                                 │
│                                                     │
│  Parent thesis signals:                             │
│  { dataSource: "internal_db", parentThesisId,       │
│    conditions: [status check, confidence check] }   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 5: VERIFY END-TO-END                          │
│                                                     │
│  ├─ Run: npx tsx scripts/collect-signal-data.ts     │
│  │   → Confirm snapshot stored with correct value   │
│  ├─ Check progress card on thesis detail page       │
│  │   → Confirm value, threshold, progress bar       │
│  └─ If qualitative: verify monitorKeywords match    │
│       thesis monitor report items correctly         │
└─────────────────────────────────────────────────────┘
```

### `explicit_details` schema reference

**Single quantitative source:**
```json
{
  "dataSource": "defillama",
  "endpoint": "https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue",
  "metric": "total30d",
  "calculation": "total30d * 12",
  "metricName": "Annualized Revenue Run-Rate",
  "operator": "gte",
  "threshold": 1400000000,
  "thresholdUnit": "USD",
  "checkFrequency": "daily"
}
```

**Qualitative only:**
```json
{
  "dataSource": "news_qualitative",
  "monitorKeywords": ["CoreWeave", "default", "restructure", "debt", "lease", "Helios"],
  "monitorContext": "CoreWeave is the anchor tenant for Helios. Track their financial health — default or restructuring removes the key revenue anchor.",
  "checkFrequency": "daily"
}
```

**Multi-condition (completion signal):**
```json
{
  "conditions": [
    {
      "label": "BTC spot exceeds $500,000",
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
      "monitorKeywords": ["central bank", "bitcoin reserve", "strategic reserve"],
      "monitorContext": "US Strategic Bitcoin Reserve announced March 2025. Track additional G20 nations.",
      "threshold": 3,
      "thresholdUnit": "nations"
    }
  ],
  "checkFrequency": "daily"
}
```

**Parent thesis check:**
```json
{
  "dataSource": "internal_db",
  "parentThesisId": "fe1c801a-b7d4-450c-98a2-99f561d0a7e3",
  "parentThesisTitle": "Bullish AI Infrastructure",
  "conditions": [
    { "label": "Parent thesis rejected", "field": "status", "operator": "eq", "threshold": "rejected" },
    { "label": "Confidence downgraded to low", "field": "confidence_level", "operator": "eq", "threshold": "low" }
  ],
  "logic": "any",
  "checkFrequency": "daily"
}
```

**Derived calculation:**
```json
{
  "dataSource": "derived",
  "calculation": "30d_rolling_correlation(BTC, NASDAQ)",
  "components": [
    { "ticker": "BTCUSD", "source": "tradingview_cdp" },
    { "ticker": "IXIC", "source": "tradingview_cdp" }
  ],
  "conditions": [
    { "label": "30d BTC-NASDAQ correlation < 0.3", "metric": "correlation_30d", "operator": "lte", "threshold": 0.3 },
    { "label": "SPX drawdown > 5%", "metric": "spx_drawdown_pct", "operator": "gte", "threshold": 5 }
  ],
  "checkFrequency": "daily"
}
```

### Available data sources

| Source | Type | Auth | Collector | Best for |
|--------|------|------|-----------|----------|
| TradingView Scanner | Quantitative | None (public) | `tradingview.ts` | Stock/index/crypto prices, market cap |
| CoinGecko | Quantitative | None (free tier) | `coingecko.ts` | Crypto market cap, token price |
| DefiLlama | Quantitative | None | `defillama.ts` | DeFi protocol revenue, TVL, fees |
| HypeFlows | Quantitative | None | `hypeflows.ts` | Perp exchange volume, OI, market share |
| Yahoo Finance | Quantitative | None | `derived.ts` | Historical daily prices for correlation |
| FRED | Quantitative | API key | `daily-signal-monitoring.ts` | Economic indicators (rates, employment) |
| Internal DB | Quantitative | Direct | `internal-db.ts` | Parent thesis status/confidence |
| Thesis Monitor | Qualitative | N/A | Post-ingestion hook | News, events, milestones, regulatory |
| TradingView CDP | Quantitative | Chrome Debug | Not yet built | Economic calendar, chart drawings, alerts |

### Adding a new data source

When a signal requires a source not yet in the collector registry:

1. **Test the API** — verify endpoint, auth, response structure
2. **Create collector** — new file in `scripts/lib/collectors/`, following the pattern:
   - Input: `explicit_details` record
   - Output: `{ observedValue, thresholdValue, pctToThreshold, unit, evidenceSummary? }`
3. **Register in orchestrator** — add `case` in `collect-signal-data.ts`
4. **Add to this reference table** — document the source for future signal configuration

### Future: `/configure-signal` skill

Once the pattern stabilises, this workflow could be packaged as a Claude Code skill that:
1. Takes a signal ID
2. Reads the signal statement and thesis context
3. Proposes data sources and keywords
4. Tests endpoints automatically
5. Populates `explicit_details`
6. Runs the collector once to verify

This would allow rapid signal configuration for new theses without manual investigation each time.

---

## Phase 3: Strategy price signal system (TradingView CDP ingestion)

**Status**: Substantially complete (2026-03-17) — sync and price collection live. Cleanup (webhook removal) deferred.

### What

Replace the existing manual strategy signal form and TradingView webhook approach with a fully automated pipeline that reads chart drawings from a dedicated TradingView watchlist via CDP and ingests them as strategy price signals (TP/SL). Price is then monitored on a schedule using the existing TradingView scanner API, producing snapshots that feed the Signals Browser.

### Why

The previous approach (manual form + TradingView webhook alerts) created friction that discouraged use. Traders already draw TP/SL levels on charts — if Trade Journal can read those drawings automatically, signal configuration becomes a zero-friction side effect of normal charting workflow.

The strategy signal form (`StrategySignalConfigForm`) and all webhook infrastructure are being replaced entirely. The only in-app action required is setting position % per exit level after drawings are imported.

### Architecture

```
TradingView "Trade Journal" watchlist (user-maintained)
    │
    ▼ CDP job (scheduled, Mac Mini)
    Symbols in watchlist + chart drawings per symbol
    (horizontal lines with labels: TP1, TP2, TP3, SL)
    │
    ▼ Matching + upsert
    Strategy signals in DB (entity_type='strategy')
    Optimistic match: watchlist symbol → strategy via underlying.ticker
    Override: tvChartSymbol field on strategy (e.g. GLXY:NASDAQ)
    Multiple strategies can reference same TP/SL levels
    │
    ▼ User edits in app (optional)
    Set positionPct per exit level
    Override chart symbol mapping if needed
    │
    ▼ Price monitoring (TradingView scanner API — existing collector)
    Current price → signal_data_snapshots
    observed_value=currentPrice, threshold_value=targetPrice, pct_to_threshold
    │
    ▼ Signals Browser (/signals)
    Progress bars, proximity indicators, alerts when approaching/crossing
```

### Signal data model

Each TP/SL drawing becomes one row in `signals` with `entity_type='strategy'`.

`explicit_details` shape for price signals (simplified from old `StrategySignalConfig`):

```typescript
interface PriceSignalDetails {
  conditionType: 'price_above' | 'price_below'; // TP = price_above, SL = price_below
  price: number;                                  // The drawn level
  positionPct?: number;                           // % of position to exit (user-set in app)
  tvLabel: string;                                // Raw label from drawing: 'TP1', 'TP2', 'SL', etc.
  tvDrawingId: string;                            // TradingView internal drawing ID (upsert key)
  tvSymbol: string;                               // e.g. 'GLXY:NASDAQ' — which chart this came from
}
```

Signal type mapping from label:
- `TP*` → `type: 'confirmation'`, `conditionType: 'price_above'`
- `SL` → `type: 'warning'`, `conditionType: 'price_below'`

### Strategy → chart mapping

- **Default**: `underlying.ticker` matched against watchlist symbols (optimistic)
- **Override**: `tvChartSymbol` field on `strategies` table (e.g., `GLXY:NASDAQ` for a strategy on an underlying that trades on multiple exchanges)
- **Universe**: Only symbols present in the dedicated "Trade Journal" watchlist are candidates
- **Many strategies, one chart**: Multiple strategies on the same underlying all reference the same watchlist symbol's drawings — each gets its own signal row, same source drawing

### Watchlist config

- Watchlist name stored as env var: `TV_TRADE_JOURNAL_WATCHLIST=Trade Journal`
- CDP job enumerates the watchlist to get the symbol list, then reads drawings for each symbol
- Only drawings with recognised labels (TP1, TP2, TP3, SL, or user-defined variants) are ingested

### Upsert / sync logic

- `tvDrawingId` is the idempotency key — re-running the sync won't duplicate signals
- If a drawing's price changes → update `explicit_details.price` + reset `pctToThreshold`
- If a drawing is deleted → mark signal `rejected` (or `complete` if price already crossed)
- New drawings → create new signal (status: `active`)

### Price monitoring (collector extension)

Extend existing `tradingview.ts` collector in `scripts/lib/collectors/` to handle strategy price signals:

1. For each `active` strategy signal with `explicit_details.conditionType` in `['price_above', 'price_below']`:
   - Fetch current price for `tvSymbol` via TradingView scanner API (already working)
   - Compute `pct_to_threshold = (currentPrice / targetPrice) * 100` for price_above, inverse for price_below
   - Insert `signal_data_snapshots` row with `data_source: 'tradingview_cdp'`
2. Wire into `collect-signal-data.ts` orchestrator alongside existing thesis signal collectors

### What gets removed

| Component | Fate |
|-----------|------|
| `StrategySignalConfigForm.tsx` | ✅ Deleted (2026-03-18) — replaced by CDP ingestion |
| `StrategySignalsSection` | ✅ Simplified (2026-03-18) — read-only display, no form/edit UI |
| TradingView webhook infrastructure | ✅ Deleted (2026-03-18) — `tvAlertName`, webhook URL, Edge Function all removed |
| `tv-webhook` Supabase Edge Function | ✅ Deleted (2026-03-18) |
| `NEXT_PUBLIC_TV_WEBHOOK_URL` env var | ✅ Removed from CLAUDE.md (2026-03-18) |

### New components / scripts

| File | Status | Purpose |
|------|--------|---------|
| `scripts/sync-tv-drawings.ts` | ✅ Built | CDP job: reads BTC indicator + USD main-series drawings → upserts as deduplicated signals with junction links |
| `scripts/collect-signal-data.ts` | ✅ Extended | Strategy price signals + checkFrequency enforcement for weekly signals |
| `scripts/backfill-correlation.ts` | ✅ Built | Backfills historical BTC-NASDAQ correlation from Yahoo Finance (882 daily snapshots) |
| `scripts/migrate-signal-entity-links.ts` | ✅ Built | Data migration: populates junction table + deduplicates strategy signals |
| `migrations/add-signal-entity-links.sql` | ✅ Applied | Junction table for many-to-many signal ↔ entity relationships |
| `src/components/signals/StrategySignalsSection.tsx` | ✅ Simplified | Read-only display of synced signals (no form/edit UI) |
| `src/components/signals/TradingViewMiniChart.tsx` | ✅ Built | TradingView Symbol Overview widget embed for strategy signal charts |
| `src/components/signals/SignalSnapshotChart.tsx` | ✅ Built | Recharts sparkline with threshold reference line for thesis quantitative signals |
| `src/components/signals/AssessmentTimeline.tsx` | ✅ Built | Qualitative assessment dot timeline with trend label |

### CDP discovery

Completed. Two drawing namespaces identified:
- `/charts-storage/get/layout/{uid}/sources` — indicator panel drawings (BTC-ratio prices). Accessed via `Runtime.evaluate` with session cookies. JWT obtained from `GET /chart-token/?image_url={layoutId}&user_id={userId}`.
- `/charts-storage/get/user/sources?layout_id={uid}&symbol={TV_SYMBOL}` — main-series drawings (USD prices). Must be fetched per symbol, also requires JWT.

### Implementation order

1. ~~**CDP discovery**~~ ✅
2. ~~**`sync-tv-drawings.ts`**~~ ✅ — reads both BTC indicator panel + USD main-series drawings per symbol. Creates one signal per drawing, links to all matching strategies via `signal_entity_links` junction table.
3. ~~**Extend price collector**~~ ✅ — `collect-signal-data.ts` processes strategy signals with checkFrequency enforcement.
4. ~~**Signal deduplication**~~ ✅ — `signal_entity_links` junction table. 35 duplicate signals merged to 13 unique + 35 links. `position_pct` moved to link. Statements no longer include "X% of position".
5. ~~**Simplify `StrategySignalsSection`**~~ ✅ — read-only display, form/edit/delete UI removed.
6. ~~**Remove webhook infrastructure**~~ ✅ — `StrategySignalConfigForm`, `tv-webhook` Edge Function, `NEXT_PUBLIC_TV_WEBHOOK_URL` all deleted.

### Verification
- [x] CDP discovery confirms drawings API endpoint and drawing ID format
- [x] `sync-tv-drawings.ts` runs and upserts TP1/TP2/SL signals from watchlist drawings
- [ ] Moving a drawing in TradingView → price updates on next sync
- [ ] Deleting a drawing → signal marked rejected on next sync
- [x] Price collector generates snapshots for strategy signals (pct_to_threshold visible in Signals Browser)
- [x] Multiple strategies on same underlying receive signals via junction links (not duplicate signals)
- [x] `StrategySignalConfigForm` and webhook infrastructure removed (2026-03-18)
- [x] Signal deduplication via `signal_entity_links` junction table (2026-03-18)
- [x] checkFrequency enforcement — weekly signals skip collection within 6 days (2026-03-18)

---

## Phase 4: Process-inbox signal integration

**Status**: Not started

### What
When `/process-inbox` links claims to a thesis, automatically check if the new claim relates to any of the thesis's active signals.

### Why
Reactive evaluation — signals get checked naturally as research flows in, without manual effort.

### Design
After claim linkage in `/process-inbox`:
1. Load the target thesis's active signals (max 5)
2. Compare new claim content against each signal statement
3. If match found, note it in the linkage suggestions output
4. If strong match, create a triage record or journal entry

### Key files
- `notes/.claude/skills/process-inbox/SKILL.md` — add signal-checking step
- Possibly `trade-journal/scripts/ops/link-claim-to-thesis.ts` — add signal check on linkage

### Verification
- [ ] Process inbox item related to a thesis signal
- [ ] Signal match noted in output
- [ ] Triage/journal created for strong matches

---

## Phase 5: Unified Signals Browser Page

**Status**: Complete (2026-03-17)

### What
A dedicated `/signals` page — a first-class entity page like `/strategies`, `/asset-theses`, `/macro-theses`, `/research`, and `/triage` — that provides a unified view of all signals across the entire system (thesis signals and strategy signals) with filtering, time-series tracking, and entity context.

### Why
Signals are currently fragmented: thesis signals appear on individual thesis detail pages (Claims & Signals tab), strategy signals appear on strategy overview pages, and there is no way to see the full signal landscape in one place. This directly caused the orphaned GLXY-STK $41.21 signal — it was invisible because it was a strategy-level signal on a merged strategy, and there was no unified view to surface it.

The system already has scheduled monitoring (thesis monitor reports, quantitative collectors) and a time-series storage layer (`signal_data_snapshots`). What's missing is a single pane of glass that shows:
- All signals, regardless of entity type, with their current status and trajectory
- How each signal is trending over time toward or away from its trigger
- Which entity (macro thesis, asset thesis, or strategy) each signal belongs to

This is the monitoring equivalent of what triage is for position management and what the portfolio page is for exposure — a dedicated operational view.

### Design

**Page route**: `/signals` (top-level nav, alongside Strategies, Theses, Triage, Journal)

**Core views**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Signals                                                    [Filters ▾] │
│                                                                         │
│  ┌─────────┐ ┌──────────────┐ ┌──────────┐ ┌───────────┐              │
│  │ All (22) │ │ Active (18)  │ │ Open (18)│ │ By Entity │              │
│  └─────────┘ └──────────────┘ └──────────┘ └───────────┘              │
│                                                                         │
│  Filters: Type (confirmation/invalidation/completion) │ Entity type    │
│           (thesis/strategy) │ Ticker │ Data source │ Assessment trend  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TYPE        STATEMENT                ENTITY        STATUS  TREND │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ✓ Confirm   Revenue ARR > $1.4B      HYPE thesis   active  ↗ 47%│  │
│  │ ▷ (expanded)                                                     │  │
│  │   ┌──────────────────────────────────────────────────────────┐   │  │
│  │   │ [Sparkline: $659M → $900M → $1B]  Target: $1.4B         │   │  │
│  │   │ Latest: $1.0B ARR (71%)  |  Source: DefiLlama           │   │  │
│  │   │ Qualitative: "Progressing" — revenue diversification...  │   │  │
│  │   │ [View on thesis →]  [View snapshots →]                   │   │  │
│  │   └──────────────────────────────────────────────────────────┘   │  │
│  │ ⚠ Invalid   CFTC/SEC action          HYPE thesis   active  — n/a│  │
│  │ ✓ Confirm   Helios 200MW online       GLXY thesis   active  ↗   │  │
│  │ ✓ Confirm   Take profit GLXY > $41.21 GLXY-STK strat active → 56%│ │
│  │ ◎ Complete  800MW + $40B + REIT       GLXY thesis   active  ↗ 23%│  │
│  │ ...                                                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Expanded signal row** (reuses `SignalProgressCard` from Phase 2c):
- Time-series chart showing trajectory toward threshold (sparkline or full chart)
- Current value, threshold, % to threshold, unit
- Latest qualitative assessment from thesis monitor
- Evidence timeline (last N snapshots with summaries)
- Data source badge
- Link to parent entity (thesis or strategy detail page)

**Filtering & grouping**:
- Filter by: signal type, entity type (thesis/strategy), ticker, status, data source
- Group by: entity (all signals for a thesis/strategy together), ticker, type
- Sort by: % to threshold (closest to trigger first), last updated, entity

**Entity context column**:
- Shows the linked object: "Bullish HYPE Medium Term" (asset thesis), "GLXY-STK" (strategy), "Bullish AI Infrastructure" (macro thesis)
- Clickable → navigates to entity detail page
- Badge for entity type (macro / asset / strategy)

### Key components

| Component | Purpose |
|-----------|---------|
| `/src/app/signals/page.tsx` | Server component — loads all signals with entity joins |
| `/src/components/signals/SignalsBrowser.tsx` | Client component — filterable/sortable table with expandable rows |
| `/src/components/signals/SignalTrendIndicator.tsx` | Compact trend indicator (↗ ↘ → with %) for table column |
| `/src/components/signals/SignalProgressCard.tsx` | Already exists (Phase 2c) — reuse in expanded rows |
| `/src/app/api/signals/route.ts` | API endpoint — all signals with entity context + latest snapshot |

### Data requirements

**Query pattern** — join signals with their parent entity and latest snapshot:

```sql
SELECT
  s.id, s.type, s.statement, s.status, s.entity_type,
  s.thesis_id, s.thesis_type, s.strategy_id,
  -- Entity context
  COALESCE(mt.title, at.title) as thesis_title,
  u.ticker,
  str.strategy_key,
  -- Latest quantitative snapshot
  latest_q.observed_value, latest_q.threshold_value,
  latest_q.pct_to_threshold, latest_q.unit,
  -- Latest qualitative snapshot
  latest_qual.assessment, latest_qual.evidence_summary,
  latest_qual.snapshot_date as last_assessed
FROM signals s
LEFT JOIN macro_theses mt ON s.thesis_type = 'macro' AND s.thesis_id = mt.id
LEFT JOIN asset_theses at ON s.thesis_type = 'asset' AND s.thesis_id = at.id
LEFT JOIN underlyings u ON at.underlying_id = u.id
LEFT JOIN strategies str ON s.strategy_id = str.id
LEFT JOIN LATERAL (
  SELECT observed_value, threshold_value, pct_to_threshold, unit
  FROM signal_data_snapshots
  WHERE signal_id = s.id AND observed_value IS NOT NULL
  ORDER BY snapshot_date DESC LIMIT 1
) latest_q ON true
LEFT JOIN LATERAL (
  SELECT assessment, evidence_summary, snapshot_date
  FROM signal_data_snapshots
  WHERE signal_id = s.id AND assessment IS NOT NULL
  ORDER BY snapshot_date DESC LIMIT 1
) latest_qual ON true
WHERE s.status IN ('active', 'complete')
ORDER BY s.status, s.type, latest_q.pct_to_threshold DESC NULLS LAST
```

### Relationship to existing pages

The signals browser is additive — it does **not** replace the signal sections on thesis or strategy detail pages. Those remain as entity-scoped views. The signals browser is the cross-entity operational view.

| Page | Signals shown | Purpose |
|------|--------------|---------|
| `/signals` (new) | All signals across all entities | Operational monitoring — "what's approaching trigger?" |
| Thesis detail → Claims & Signals tab | Signals for that thesis only | Thesis-scoped signal tracking |
| Strategy detail → Overview | Signals for that strategy only | Strategy-scoped trigger tracking |

### Verification
- [x] `/signals` page renders all active signals (thesis + strategy)
- [x] Signals show parent entity name and type with clickable link
- [x] Expanded rows reuse `SignalProgressCard` from Phase 2c (snapshot data loaded on demand)
- [x] Quantitative signals show current value, threshold, % to threshold
- [x] Qualitative signals show latest assessment and evidence summary
- [x] Filters work: by type, entity type, ticker, status
- [x] Strategy signals (like GLXY-STK $41.21 target) are visible alongside thesis signals
- [x] Sort by "closest to trigger" surfaces most actionable signals first
- [x] Sparkline trend chart in expanded row (2026-03-18) — TradingView embed for strategy, Recharts for thesis quant, assessment timeline for thesis qual

---

## Next Steps (for new context)

### Completed (2026-03-18)

- ~~**Signal tracking trajectory views**~~ ✅ — Three chart types in signal expanded rows: TradingView Symbol Overview for strategy price, Recharts sparkline for thesis quant, assessment timeline for thesis qual.
- ~~**checkFrequency enforcement**~~ ✅ — Weekly signals skip collection within 6 days.
- ~~**Phase 3 cleanup**~~ ✅ — `StrategySignalConfigForm`, `tv-webhook` Edge Function, `NEXT_PUBLIC_TV_WEBHOOK_URL` all deleted. `StrategySignalsSection` simplified to read-only.
- ~~**Signals Browser: group by underlying**~~ ✅ — Signals grouped by underlying ticker (BTC, GLXY, HYPE). Macro thesis signals appear under each linked underlying. Collapsible group headers. Toggle between grouped/flat views.
- ~~**Signal deduplication**~~ ✅ — `signal_entity_links` junction table. One signal per TradingView drawing, linked to multiple strategies. 35 → 13 signals + 35 links. `position_pct` per-link. Query layer returns `entities[]` per signal.
- ~~**Correlation backfill**~~ ✅ — 882 daily BTC-NASDAQ correlation snapshots from mid-2024 via Yahoo Finance.
- ~~**Clean up test data**~~ ✅ — Test thesis-monitor report removed.
- ~~**Quick wins batch**~~ ✅ — All 6 quick-win tasks completed (see "Completed quick wins" section below).

### Completed quick wins (2026-03-18)

- ~~**1. Qualitative snapshot assessment accuracy**~~ ✅ — Added `NO_EVIDENCE_PATTERNS` array (`⚪`, `no evidence`, `no change`, etc.) in `ingest-world-monitor.ts`. Neutral/status-quo text now forced to `no_evidence` instead of a spurious positive/negative assessment.

- ~~**2. Drop old columns from signals table**~~ ✅ — Removed `entity_type`, `strategy_id`, `thesis_id`, `thesis_type` from `signals` schema, all insert sites, and query layer. All signal ↔ entity relationships now exclusively via `signal_entity_links` junction table. Signals Browser split entity filter into macro/asset thesis sections. (`a1810ef`)

- ~~**5. Centralise price data in `price_history` table**~~ ✅ — Added `^IXIC` (NASDAQ) and `^GSPC` (S&P 500) as INDEX assets. `scripts/ingest-index-prices.ts` backfills 2yr daily OHLCV from Yahoo Finance (502 data points each). `derived.ts` correlation collector now reads from `price_history` first, Yahoo Finance only as fallback. (`7aef4bf`)

- ~~**6/7. Signal trigger automation**~~ ✅ — `collect-signal-data.ts` calls `checkAndTriggerSignal()` after each snapshot. When `pct_to_threshold >= 100` and `status = 'active'`: signal moved to `complete`, `thesis_triage_record` created, `journal_entries` logged. `--skip-triggers` flag available for dry runs. (`5ff3d6e`)

- ~~**8. Dedup logic for qualitative snapshots**~~ ✅ — `generateQualitativeSnapshots()` restructured to two-pass dedup: score all signals against all items first, then assign each item to its highest-scoring signal only (no double-counting). (`67c7693`)

- ~~**9. HYPE P/E re-rating condition**~~ ✅ — `collectPERatio()` added to `derived.ts`. Fetches market cap from CoinGecko (`/coins/hyperliquid`) and annualised revenue from DefiLlama (`total30d * 12`) in parallel. Computes P/E ratio, default threshold 17.5x. Routed via `calculation === 'market_cap / annualized_revenue'` in the collector switch.

### Immediate priorities

**1. Phase 2d: `/configure-signal` skill**
The signal configuration workflow is documented but not yet packaged as a skill. Would speed up adding monitoring to new signals. The skill would: read signal statement → propose data sources → test endpoints → populate `explicit_details` → verify snapshot.

### Medium-term

**2. Phase 4: Process-inbox signal integration**
See Phase 4 section above. Would close the loop between research ingestion and signal tracking — new claims automatically checked against active signals.

**3. TradingView CDP collector for economic calendar**
Build a collector that uses CDP to access the TradingView economic calendar. Would feed macro thesis signals that depend on economic events (FOMC decisions, CPI releases, employment data).

### Key files for orientation

| File | Purpose |
|------|---------|
| `trade-journal/docs/plans/thesis-signal-monitoring-redesign.md` | This plan (single source of truth) |
| `trade-journal/scripts/sync-tv-drawings.ts` | CDP: reads TradingView drawings → upserts signals + junction links |
| `trade-journal/scripts/collect-signal-data.ts` | Quantitative collection orchestrator (thesis + strategy signals) |
| `trade-journal/scripts/backfill-correlation.ts` | Historical BTC-NASDAQ correlation backfill from Yahoo Finance |
| `trade-journal/scripts/migrate-signal-entity-links.ts` | Data migration for signal deduplication |
| `trade-journal/scripts/ingest-world-monitor.ts` | Ingestion + qualitative snapshot generation |
| `trade-journal/scripts/lib/collectors/` | Per-source data collectors |
| `trade-journal/src/db/schema.ts` | `signalEntityLinks` junction table definition |
| `trade-journal/src/db/queries/signals.ts` | Query: signals + entities[] via junction table + latest snapshots |
| `trade-journal/src/components/signals/SignalProgressCard.tsx` | Expanded row: progress bar + chart (TV embed / sparkline / timeline) |
| `trade-journal/src/components/signals/SignalsBrowser.tsx` | Unified signals browser (grouped by underlying, multi-entity display) |
| `trade-journal/src/components/signals/TradingViewMiniChart.tsx` | TradingView Symbol Overview widget embed |
| `trade-journal/src/components/signals/SignalSnapshotChart.tsx` | Recharts sparkline with threshold reference line |
| `trade-journal/src/components/signals/AssessmentTimeline.tsx` | Qualitative assessment dot timeline |
| `trade-journal/src/components/signals/StrategySignalsSection.tsx` | Read-only signal display on strategy detail pages |
| `trade-journal/src/app/signals/page.tsx` | `/signals` entity page (Phase 5) |
| `trade-journal/migrations/add-signal-entity-links.sql` | Junction table migration |
| `trade-journal/migrations/add-signal-data-snapshots.sql` | Snapshots table migration |
| `paperclip/.claude/skills/thesis-monitor/SKILL.md` | Thesis monitor skill definition |
| `paperclip/scripts/collect-signal-data.sh` | Shell wrapper for quantitative collection |

---

## Backlog — Follow-up work identified

Items identified but not yet scheduled. Add to FUTURE_ENHANCEMENTS.md when prioritising.

### Signal monitoring

**`claim_signal_evidences` junction table**
When a piece of research is assessed as evidence for a signal (via the process-inbox routing), there is currently no DB-level link between the claim and the signal. The connection exists only via the `journal_entries` narrative. A `claim_signal_evidences` table would allow:
- The Claims browser to show "this claim validated Signal X"
- The signal expanded row to show "supported by N research claims"
- Bidirectional navigation: claim → signals it evidences, signal → claims that evidence it
Schema: `(id, claim_id FK → main_claims, signal_id FK → signals, assessment text, snapshot_id FK → signal_data_snapshots nullable, created_at)`

**Schedule `ingest-economic-calendar.ts` in launchd**
The economic calendar ingestion script exists but is not yet scheduled. Add a launchd job (alongside the existing thesis-monitor and signal-collection jobs) to run daily — e.g. 6:00 AM, before the thesis monitor runs. This ensures the calendar is fresh when thesis monitor evaluates FOMC/CPI-related signals.

### Configure-signal workflow

**How it works today (confirmed)**
`/configure-signal` is a Claude Code skill — the investigative workflow (trying endpoints, evaluating data quality, reasoning about threshold values) happens as a back-and-forth dialogue in VS Code / Claude Code. Once the config is agreed, the skill writes `explicit_details` to the DB and the signal immediately appears with a working progress bar in the front end. This is the right model for now: the investigative work requires AI reasoning that a form UI cannot replicate.

**What the app should surface (to do)**
When the skill writes `explicit_details`, it should also create a `journal_entry` capturing the rationale (which source, why that threshold, any caveats). Currently it does not. This would make the Journal tab on thesis/signal pages show the full configuration history.

### In-app LLM chat interface (future vision)

The longer-term goal is to embed Claude directly into the app so that investigative workflows (configure-signal, thesis exploration, signal assessment) can happen inside the UI with full DB access and tool use. This would:
- Allow signal configuration without switching to the IDE
- Keep a persistent conversation log attached to the relevant entity (thesis/signal)
- Enable the user to interrogate "why is this signal at 67%?" and get a reasoned answer using live data

This is a significant build (streaming Claude API responses, in-app tool use, conversation persistence) — treat as a Phase N feature. Worth designing thoughtfully before starting.

### News hub redesign

The current `/news` page is functional but not well-organised UX-wise. The different data streams (World Monitor report, Thesis Monitor report, Economic Calendar, Earnings, SEC filings) are all present but lack a clear layout hierarchy. The redesign should:
- Treat `/news` as a proper "news hub" with distinct, well-sized panels for each stream
- Economic Calendar: full date-grouped view with actual/forecast/previous values and impact badges, not a compressed list
- World Monitor: headline + key intelligence items from the latest report, with link to full report
- Thesis Monitor: summary of signal assessments from the latest run — which signals moved, which confirmed/contradicted
- Earnings: upcoming earnings for tickers in active theses/strategies, highlighted
- SEC filings: relevant filings for tracked tickers
- Consider a "today's relevance" section at the top that surfaces the 3-5 most actionable items across all streams for the user's active positions and theses
