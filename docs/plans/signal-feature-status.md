# Signal Feature: State of Play
_Last updated: 2026-03-18_

## Vision

A fully automated signal monitoring system that tracks both quantitative data (price levels, on-chain metrics, economic data) and qualitative evidence (news, thesis monitoring, inbox research) against defined signal criteria. Each signal accumulates evidence over time and is visualised as a conviction trend — giving a real-time, auditable picture of whether a thesis is being confirmed or invalidated.

---

## What's Built

### Schema & Data Model

| Table | Purpose | Status |
|-------|---------|--------|
| `signals` | Core signal definitions with type, importance, status, explicit_details config | ✅ |
| `signal_entity_links` | Junction table linking signals to theses/strategies (replaces direct FK columns) | ✅ |
| `signal_data_snapshots` | Unified time-series for both quantitative and qualitative signal data | ✅ |
| `claim_signal_evidences` | Junction table linking claims to the signals they evidence, with assessment | ✅ |
| `economic_events` | Scheduled macro releases (FOMC, CPI, NFP, PCE, GDP) | ✅ |

Assessment scale is directional: `neutral | strengthening | weakening | confirmed | invalidated`

---

### Signal Creation

| Path | Where | Status |
|------|-------|--------|
| Via `build-core-argument` skill → `insert-thesis-articulation.ts` | When articulating a thesis, signals are extracted and inserted | ✅ |
| Via `sync-tv-drawings.ts` | TradingView drawings synced as signals (chart-based) | ✅ |
| Journal entry on creation | Both paths write `signal/created` to journal | ✅ |

---

### Signal Configuration (Quantitative)

The `configure-signal` skill wires a signal to a quantitative data source, writing `explicit_details` JSON to the signal record.

| Data source | Description | Status |
|-------------|-------------|--------|
| `defillama` | Protocol fees, revenue, TVL | ✅ |
| `coinbase_prime` | Portfolio/custody positions | ✅ |
| `deribit` | Options market data | ✅ |
| `price_history` | Asset price levels | ✅ |
| `hyperliquid` | Perp position data | ✅ |
| `economic_calendar` | Scheduled release data — `days_until_event` + `event_actual_vs_forecast` | ✅ TWO-136 |

---

### Quantitative Monitoring

`scripts/collect-signal-data.ts` runs on schedule, reads `explicit_details` for each active signal, calls the relevant collector, and writes `signal_data_snapshots` rows with `pct_to_threshold`.

| Feature | Status |
|---------|--------|
| Collectors for all above data sources | ✅ |
| `signal/threshold_reached` journal entry when pct ≥ 100% | ✅ |
| `signal/quantitative_milestone` journal entry at 25/50/75/90% crossings | ✅ TWO-129 |
| **`economic_calendar` collector in `collect-signal-data.ts`** | ⚠️ **Needs verification** — configure-signal now produces valid `explicit_details` for `economic_calendar`, but the collector dispatch may not yet handle it. Check before wiring any signal to a calendar source or it will silently fail. |

---

### Qualitative Monitoring

| Source | What it does | Status |
|--------|-------------|--------|
| `ingest-world-monitor.ts` | Processes world/thesis monitor reports → qualitative `signal_data_snapshots` | ✅ |
| `assess-validation-evidence` skill | Explicit signal evidence assessment → `signal_data_snapshots` + `claim_signal_evidences` + journal | ✅ |
| `process-inbox` skill (notes repo) | Routes inbox content → signal assessment inline → `signal_data_snapshots` + `claim_signal_evidences` + journal | ✅ |
| **Nightly synthesis** (`synthesize-signal-day.ts`) | 01:00 UTC — rolls up all that day's observations into one `daily_synthesis` row per signal | ✅ TWO-137 |

---

### Journal Coverage

All signal lifecycle events write to `journal_entries` with `object_type = 'signal'`:

| Event | Trigger | Status |
|-------|---------|--------|
| `signal/created` | Signal inserted via any creation path | ✅ |
| `signal/monitoring_configured` | configure-signal skill completes | ✅ |
| `signal/qualitative_assessed` | World/thesis monitor or assess-validation-evidence runs | ✅ |
| `signal/quantitative_milestone` | 25/50/75/90% threshold crossings | ✅ |
| `signal/threshold_reached` | pct ≥ 100% | ✅ |
| `signal/status_changed` | `update-entity-status.ts` for any signal status transition | ✅ |
| `signal/claim_evidenced` | `claim_signal_evidences` row written (non-neutral assessments) | ✅ |

---

### UI

| Component | What it shows | Status |
|-----------|--------------|--------|
| `SignalsBrowser` | All signals with type, status, assessment, evidence count | ✅ |
| `SignalProgressCard` | Per-signal card: assessment badge, evidence count, pct to threshold | ✅ |
| `AssessmentTimeline` | Individual snapshot history for a signal | ✅ |
| `UnifiedClaimsBrowser` | Claims with linked signals in expanded row ("Evidences Signals") | ✅ |
| `EconomicCalendar` | Upcoming macro events table | ✅ |

---

## What's Not Built Yet

### High priority — directly enables the vision

| Issue | What's missing | Dependency |
|-------|---------------|------------|
| **TWO-138** | **Cumulative conviction chart** — the +1/0/-1 time-series visualization on signal detail page. The data (`daily_synthesis` rows from TWO-137) now exists; the chart does not. | TWO-137 must run for a few days to have data worth displaying |
| **TWO-134** | Phase 4 process-inbox active signal matching — review spec; may cover automatic signal candidate matching for content not explicitly routed | None |

### Medium priority

| Issue | What's missing |
|-------|---------------|
| **TWO-135** | Economic calendar context on news page — upcoming events surfaced alongside news items |
| **TWO-120** | News page redesign — proper news hub with calendar, signal links, filtering |

### Potential gap (needs investigation before activating TWO-136)

- **`economic_calendar` in `collect-signal-data.ts`** — The configure-signal skill now produces valid `explicit_details` for `economic_calendar` sources, but the collector dispatch in `collect-signal-data.ts` may not yet handle it. This should be confirmed before any signal is configured with a calendar data source.

### Not yet scoped

- **Signal detail page** — a dedicated `/signals/[id]` page showing: conviction chart (TWO-138), individual observations feed, linked claims list (reverse of `claim_signal_evidences`), journal timeline
- **Signal archive/completion flow** — UI for marking a signal confirmed/invalidated with a rationale, triggering the terminal state

---

## End-to-End Flow (When Fully Complete)

```
Thesis articulated
  └─ build-core-argument extracts signals → inserted to DB, journal: signal/created

Signal configured
  └─ configure-signal skill writes explicit_details → journal: signal/monitoring_configured

Daily (automated):
  ├─ collect-signal-data.ts    → quantitative snapshots, milestone journals
  ├─ ingest-world-monitor.ts   → qualitative snapshots (world + thesis monitor)
  └─ synthesize-signal-day.ts  → one daily_synthesis row per signal (01:00 UTC)

On demand (research):
  ├─ process-inbox (notes)          → claim extracted, signal assessed, evidence linked, journals written
  └─ assess-validation-evidence     → same, for direct skill invocation

Signal detail page (TWO-138):
  ├─ Cumulative conviction chart (daily_synthesis rows → +1/0/-1 running total)
  ├─ Individual observations feed (all non-synthesis snapshot rows)
  └─ Contributing claims list (claim_signal_evidences reverse lookup)

Signal resolved:
  └─ update-entity-status → confirmed/invalidated → journal: signal/status_changed
```

---

## Active Backlog (signal-related)

| Issue | Title | Ready? |
|-------|-------|--------|
| TWO-134 | Phase 4: Process-inbox active signal matching | Review spec first |
| TWO-135 | Economic calendar: signal context on news page | After TWO-136 confirmed |
| TWO-137 | Nightly signal day synthesis | ✅ Done — running tonight |
| TWO-138 | Signal cumulative score chart | After TWO-137 has data |
