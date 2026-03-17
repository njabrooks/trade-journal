# Thesis Signal & Monitoring System Redesign

> Created: 2026-03-16
> Status: In Progress

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

## Completed

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

## Phase 2b: Signal Data Sources & Automated Monitoring

**Status**: In progress (2026-03-17)

### What
For each active signal, identify and configure a specific data source that can be programmatically queried to track progress toward the signal threshold. The thesis monitor report queries these sources during generation.

### Data source tiers

| Tier | Source | Auth | Examples |
|------|--------|------|----------|
| **Free APIs** | HypeFlows, DefiLlama, CoinGecko, Hyperliquid API, FRED | No | Volume, revenue, market cap, economic data |
| **CDP authenticated** | TradingView scanner, economic calendar, chart drawings, alerts | Persistent Chrome session | Price targets, S/R levels, economic events |
| **Existing integrations** | Massive API, IBKR, exchange APIs | API keys (configured) | Real-time pricing, IV, options |
| **News/manual** | RSS feeds, `/cdp-discover` for new sites | Varies | Regulatory actions, judgment calls |

### Process for each signal
1. **Identify metric** — what specific data point indicates progress?
2. **Find data source** — free API first, then CDP authenticated, then manual
3. **Verify access** — test the endpoint, confirm data structure
4. **Configure** — store in signal's `explicit_details` JSONB field
5. **Wire into monitor** — thesis monitor queries during report generation

### Confirmed data sources (HYPE thesis)

| Signal | Source | Endpoint | Metric | Current | Threshold |
|--------|--------|----------|--------|---------|-----------|
| Revenue $1.4B ARR | DefiLlama | `api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue` | `total30d * 12` | $638M | $1.4B |
| 10% perp share | HypeFlows | `hypeflows.com/api/perp-data?metric=volume` | HL / total | 4.8% | 10% |
| $40B market cap | CoinGecko | `api.coingecko.com/api/v3/coins/hyperliquid` | `market_data.market_cap.usd` | $9.4B | $40B |
| Regulatory action | News/manual | — | — | Manual | — |
| Parent thesis | Internal DB | SQL query | `macro_theses.status` | Active | — |

### Built
- [x] `scripts/lib/hypeflows.ts` — HypeFlows client (market share, volume, OI)
- [x] CDP infrastructure (`cdp-discover`, `cdp-fetch`, Chrome Debug on port 9222)
- [x] TradingView API discovery (scanner, calendar, drawings, alerts)

### Remaining
- [ ] Populate `explicit_details` on all 15 active signals (HYPE, BTC, GLXY)
- [ ] Add data fetching to thesis monitor skill (query `explicit_details` during report)
- [ ] TradingView price target extraction via CDP for strategy signals
- [ ] TradingView economic calendar integration for macro signals
- [ ] BTC and GLXY signal data source mapping

---

## Phase 3: Strategy profit-taking targets

**Status**: Not started

### What
Extend strategy signals to support up to 3 scaled exit levels (e.g., 50% at target 1, 25% at target 2, 25% at target 3).

### Why
Profit-taking is a strategy-level action. Scaled exits are standard practice for managing positions.

### Design
Leverage existing strategy signal system (`StrategySignalConfig` with `price_above`/`price_below` conditions). Each profit target is a separate strategy signal with:
- Price trigger condition
- Recommended action (e.g., "Close 50% of position")
- Action notes with scaling context

### Key files
- `src/components/signals/StrategySignalConfigForm.tsx` — UI
- Possibly add convenience wrapper for creating scaled exit plans

### Verification
- [ ] Can create 3 scaled exit signals on a strategy
- [ ] Each triggers independently at different price levels

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
