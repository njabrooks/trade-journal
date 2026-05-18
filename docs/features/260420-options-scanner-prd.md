# Options Scanner & Strategy Synthesis — PRD

**Status:** Phase 1 ✓ | Phase 1.5 ✓ | Phase 2 in progress | Phase 3 future
**Owner:** sole-user system (no multi-user concerns)
**Last updated:** 2026-04-20

---

## 1. Problem & Objective

The trader (sole user) has a multi-asset portfolio across IBKR (equity options primary), HyperLiquid, Coinbase Prime, Kraken, Deribit, and Solana. Decisions are organised under a thesis hierarchy (macro_theses → asset_theses → strategies → positions) with claims-based research provenance.

What was missing: **a systematic way to identify when options are dislocated** (either historically cheap or historically rich) on the underlyings that already matter to the portfolio (current positions, active asset/macro theses, or maintained watchlist), and to surface concrete strategy ideas that *fit the portfolio context* rather than offering generic vol screens.

**Objective:** Daily, automated scanning of an IBKR-tradable watchlist that:
1. Detects cheap-vol (long-vol) and rich-vol (short-vol) opportunities using IV percentile, IV/RV ratio, term structure, and skew.
2. Generates concrete strategy candidates per ticker — hedges for existing positions, accentuators of theses, yield-harvest plays on rich names, cross-asset complements — with full Black-Scholes math, edge ratios, payoff diagrams.
3. Renders evaluation in the existing `/vol-curve` UI, integrated with the same per-ticker detail page used for ad-hoc analyses.
4. Maintains strict manual gating — scanner surfaces ideas, human evaluates, IBKR executes. No auto-trading.

---

## 2. Non-Goals

- **Auto-execution.** Scanner never places orders.
- **Generic vol screen.** Universe is bounded to IBKR-tradable tickers tied to the portfolio or watchlist; not a market-wide screen.
- **Real-time alerting.** Daily cadence is sufficient. Intra-day events are out of scope.
- **Multi-user / shared infrastructure.** Single-user system.
- **Replacing Radon's leap_iv_scanner.** LEAP coverage in this scanner is a horizon extension, not a replacement for Radon's standalone tool.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         WATCHLIST (50 tickers)                        │
│              IBKR-tradable: positions ∪ active theses ∪ strategies    │
│                seeded once + manually curated; deactivate anytime      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
   ┌───────────────────────┴───────────────────────┐
   ▼                                               ▼
┌─────────────────────┐                ┌──────────────────────┐
│  AUTOMATED INGEST   │                │  MANUAL IBKR INGEST  │
│   (daily, GH Actions)│                │   (when TWS up)      │
│                     │                │                      │
│ Massive /v3/snapshot│                │ Radon's IBClient     │
│ → 1M-9M monthly     │                │ → 1M-9M monthly      │
│ → ±25% strikes      │                │ → ±20% strikes       │
│ → source='massive'  │                │ → source='ibkr'      │
└──────────┬──────────┘                └──────────┬───────────┘
           │                                       │
           └───────────────┬───────────────────────┘
                           ▼
              ┌────────────────────────────┐
              │  options_chain_snapshots    │
              │  (multi-source, unique on   │
              │   ticker+date+strike+exp+   │
              │   contract_type+source)     │
              └────────────┬────────────────┘
                           │
              ┌────────────▼─────────────────┐
              │   underlyings_iv_history      │
              │  (spot, iv30, rv20, atr20)    │
              │   per ticker per date          │
              └────────────┬─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  DAILY SCANNER  │
                  │  (post-NYC open)│
                  │                 │
                  │ Computes:       │
                  │ • IV pct (252d) │
                  │ • IV/RV ratio   │
                  │ • Term slope    │
                  │ • 25Δ skew      │
                  │ • Cheap gates   │
                  │ • Rich gates    │
                  │ • Regime        │
                  └────────┬────────┘
                           │
              ┌────────────▼──────────────┐
              │ vol_scan_ticker_snapshots │
              │ (regime, scores, gates,   │
              │  portfolio context)       │
              └────────────┬──────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │  STRATEGY SYNTHESIS       │
              │  (Phase 2)                │
              │                           │
              │ For each non-neutral row: │
              │ • Infer direction         │
              │ • Derive targets          │
              │ • Call analyzeTicker()    │
              │ • Persist analysis        │
              └─────────┬─────────────────┘
                        │
              ┌─────────▼──────────────┐
              │  vol_curve_reports     │
              │  (trigger_source:      │
              │   'user'|'scanner')    │
              └─────────┬──────────────┘
                        │
                        ▼
              ┌────────────────────────┐
              │   /vol-curve UI        │
              │ • List page (filter by │
              │   trigger / regime)    │
              │ • Detail page          │
              │   (same component for  │
              │    both sources)       │
              └────────────────────────┘
```

---

## 4. Data Sources

| Source | Coverage | Auth | Cadence | Notes |
|---|---|---|---|---|
| **Massive.com `/v3/snapshot/options`** | Equity & ETF chains, greeks, IV, open interest | API key (Options Starter $29/mo) | Daily, automated (Mac Mini launchd, 14:50 London local) | All US options tickers; chain snapshot endpoint included in tier; 15-min delay on NBBO is irrelevant — scanner only reads daily greeks/IV |
| **Massive `/v2/aggs/ticker/.../range/1/day`** | Daily OHLC for ATR/RV computation | Same key | Daily | Underlies rv20 + atr20 backfill and updates |
| **Yahoo Finance** | EOD spot prices | None | Daily | Primary spot source; fallback to Massive Daily Grouped |
| **Radon's IBClient** (`/projects/radon/scripts/clients/ib_client.py`) | IBKR options chains via TWS | IB Gateway login | Manual when Gateway connected | Higher quality than Massive; covers futures (FOP) where Massive is sparse |
| **`underlyings_iv_history`** | Local time series of spot/iv30/rv20/atr20 | DB | Read-only | Canonical store; daily ingest writes; backfill populates history |

Source preference logic in scanner: when both massive and ibkr rows exist for a (ticker, date), the scanner reads from IBKR. Each `vol_scan_ticker_snapshots` row records its `data_source`.

---

## 5. Watchlist

**Definition:** the tickers the scanner runs against. **Not** all underlyings — restricted to those tradable through IBKR.

**Seed sources** (`scripts/seed-watchlist.ts`):
- Open positions in IBKR accounts (`broker_name = 'IBKR'`)
- Active strategies (`status IN ('draft','active')`) tied to IBKR accounts
- Active asset theses (`status IN ('developing','monitoring')`) whose underlying has *ever* appeared in an IBKR position

**Manual extension** via `scripts/ops/add-to-watchlist.ts`:
- Cross-asset hedges (VXX, UVXY, QQQ, TLT, etc.)
- Crypto IBKR proxies (IBIT for BTC, ETHA for ETH, SOLZ for SOL)
- Anything tradable that warrants vol monitoring

**Deactivation** via `scripts/ops/deactivate-watchlist-entry.ts` — soft-disable preserves audit trail.

Current watchlist: 50 tickers (51 seeded, BTC deactivated as it's a non-IBKR-tradable strategy artifact).

---

## 6. Cheapness & Richness Gates (Phase 1 + 1.5)

A ticker is classified into one of four regimes per scan run.

### Cheap gates (long-vol opportunity)

```
is_cheap = (IV_percentile_252d ≤ 30 OR IV30 / RV20 ≤ 1.10)
           AND
           (term_slope ≥ 0 OR back_month_IV < ATM_front_IV)
```

Captures distributional cheapness OR vol-risk-premium compression, with supportive term structure (calm regime OR explicit backwardation).

### Rich gates (short-vol opportunity)

```
is_rich = (IV_percentile_252d ≥ 70 OR IV30 / RV20 ≥ 1.30)
          AND
          (term_slope ≤ 0 OR front_month_IV > back_month_IV)
```

Mirror image: high level OR fat premium, with stress in front-month structure.

### Regime classification

| `is_cheap` | `is_rich` | `regime` | Interpretation |
|---|---|---|---|
| true | false | `cheap` | Long-vol candidate |
| false | true | `rich` | Short-vol / yield-harvest candidate |
| true | true | `mixed` | Conflict (e.g., high historical pct but low IV/RV) — manual judgment |
| false | false | `neutral` | No vol edge — skip |

Both `cheapness_score` and `richness_score` (0-100) are persisted regardless of regime — useful for borderline calls and ranking within regime.

### Why IV percentile, not IV rank

Standard IV rank `(current − min) / (max − min)` is heavily distorted by extremes. If a name's IV is normally 18-22 with a single 60-vol earnings spike, rank shows today's 20 as ~4 (rank ≈ ultra-cheap) when in reality it's a normal level. IV percentile is distribution-aware and reflects true cheapness vs the name's own history.

---

## 7. Strategy Synthesis (Phase 2)

**Manual gating model — the user is the gate between scanner and analysis.**

The daily scanner produces lightweight `vol_scan_ticker_snapshots` (regime + scores + raw metrics, ~50 rows/day). It does **not** auto-run vol-curve analysis. Why: 50 daily auto-analyses would generate noise, waste compute, and dilute the user's decision-making across borderline candidates.

Instead, candidates surface in the **Scanner Today** tab on `/vol-curve/`. Each row shows enough for triage at a glance (regime, scores, IV percentile, IV/RV, term slope, skew, has-position flag, linked thesis title). The user clicks **"Analyze"** on the candidates worth deeper evaluation.

**Per-click analysis flow** (`POST /api/vol-curve/analyze-snapshot/[id]`):
1. Read the snapshot row + portfolio context (`has_open_position`, `linked_asset_thesis_ids`)
2. **Infer direction:**
   - Linked asset_thesis present → use thesis direction + target_price
   - Else cheap + long position → bearish (hedge)
   - Else rich + long position → bullish (yield_harvest, enables covered_call)
   - Else rich + no position → bullish (accumulation, enables cash_secured_put)
   - Else default to bullish, ATR-derived targets
3. **Derive targets** from thesis (preferred) or ATR20:
   - `targetBase = spot × (1 ± 0.05)`
   - `targetHigh = spot × (1 ± 0.15)`
   - `downsideFloor = max(spot − 2 × ATR20, spot × 0.85)`
4. **Horizon by use_case:** yield_harvest/accumulation = 1.5M, hedge = 2M, accentuate/cheap_access = 4M.
5. Call **`analyzeTicker(opts)`** library — returns full `AnalysisOutput` with vol smile, edge ratios, term structure, IV/RV history, ranked strategies, narrative.
6. **Persist to `vol_curve_reports`** with `trigger_source='scanner'`, `regime`, `use_case`, `scanner_snapshot_id` FK back to the snapshot.
7. Redirect user to `/vol-curve/[reportId]` for review.

**Why no daily auto-synthesis:** Compute cost (50× analyzeTicker calls), DB clutter (50 reports/day = 350/week), signal-to-noise (most are borderline), and decision-making philosophy (manual gate forces deliberate review). User can revisit the scanner list, click new tickers as priorities shift, and re-trigger if a candidate's analysis goes stale.

**Override path:** Optional POST body to `/api/vol-curve/analyze-snapshot/[id]` accepts `direction`, `targetBase`, `targetHigh`, `horizonMonths`, etc. — for cases where inferred context is wrong.

### Strategy types covered

Vol-curve currently generates 4 (all bullish-biased). Phase 2 extends synthesis with:

| Strategy | Direction | Regime | Use case |
|---|---|---|---|
| naked_call (long call) | bullish | cheap | Existing |
| call_spread (bull debit) | bullish | cheap | Existing |
| risk_reversal (bull: +C −P) | bullish | cheap | Existing |
| butterfly (call fly) | bullish-neutral peak | cheap | Existing |
| **naked_put (long put)** | bearish | cheap | New — hedge longs |
| **put_spread (bear debit)** | bearish | cheap | New — directional hedge |
| **put_butterfly** | bearish-neutral peak | cheap | New |
| **seagull** (asymmetric +C −OTM_C −OTM_P) | bullish-collared | cheap | New — cap upside, fund put |
| **covered_call** (against existing long) | rich + held | rich | New — yield harvest |
| **cash_secured_put** (accumulation) | rich + no position | rich | New — paid to wait |
| **iron_condor** | neutral | rich | New — premium harvest |

LEAP coverage: any of the long-option strategies (naked_call, naked_put, call_spread, put_spread) at expiry 12-24M qualify. Not a separate strategy type — just a horizon extension.

### Use-case taxonomy

| `use_case` | When generated |
|---|---|
| `hedge` | Long position + cheap regime → protective put / put spread |
| `accentuate` | Active thesis + cheap regime → directional debit aligned to thesis |
| `cheap_access` | Watchlist (no position) + cheap regime + no clear thesis → long call/put on the regime |
| `yield_harvest` | Long position + rich regime → covered call |
| `accumulation` | Watchlist + rich regime + bullish disposition → cash-secured put |
| `contrarian_complement` | Cross-asset hedge tickers (VIX, gold, TLT) regardless of position |
| `catalyst_play` | Mixed regime with backwardation → calendar / diagonal |

`use_case` is stored on `vol_curve_reports` so the UI can group by intent.

---

## 8. User Interface

**One page, two trigger sources.** No separate scanner UI — extends the existing `/vol-curve/`.

### `/vol-curve/` (top-level page with two tabs)

**Tab 1 — Scanner Today** (default landing tab)
- Latest scanner run summary: date, universe, run status, count of cheap/rich/mixed/neutral
- Regime sub-filters: Actionable (cheap+rich+mixed) | Cheap | Rich | Mixed
- Per-row inline columns: ticker, regime badge, score, IV percentile, IV/RV, term Δ, 25Δ skew, position flag, linked thesis titles
- Per-row action: **"Analyze"** button (or **"View"** if a report has already been generated for this snapshot)
- Click → POST `/api/vol-curve/analyze-snapshot/[id]` → router pushes to `/vol-curve/[reportId]`

**Tab 2 — Run Analysis** (the existing user form, unchanged)
- Free-form ticker + direction + targets + horizon → on-demand analysis
- For tickers not in the watchlist or with custom thesis targets

### `/vol-curve/[id]` (detail page)

Pre-existing: full analysis report with smile chart, edge ratio chart, term structure, IV history, narrative panel, ranked strategy table, payoff diagram, leg detail, greeks.

Phase 2 additions (annotations only — no new components):
- Header subtitle showing regime + use_case for scanner-triggered reports
- "Why this was surfaced" callout showing scanner gates that triggered it
- Link back to the linked `vol_scan_ticker_snapshot` for raw metric inspection

### `/vol-curve/` (form, unchanged)

User-triggered ad-hoc analysis form — same as today. The user form path remains the canonical way to do bespoke analysis on a ticker not in the watchlist or with custom thesis targets.

---

## 9. Daily Workflow

1. **04:00–14:00 UTC** — IBKR Flex ingestion (positions, trades) keeps portfolio current.
2. **14:50 London local time** (= 09:50 NYC year-round, since London/NYC share DST transitions) — Mac Mini launchd job `com.trade-journal.options-scanner` runs:
   - `ingest-radar-back-months.ts` — Massive monthly chains 1M–9M for 50 watchlist tickers (Phase 2: extends to 24M for cheap-regime tickers)
   - `scan-cheap-options.ts` — compute regime classifications, write `vol_scan_ticker_snapshots`
   - `synthesize-strategy-candidates.ts` (Phase 2) — for non-neutral snapshots, run `analyzeTicker()` and write `vol_curve_reports` rows with `trigger_source='scanner'`
3. **21:30 UTC** — Daily Massive ingest writes today's iv30/spot to `underlyings_iv_history`, computes rv20/atr20 from prior 20 days, mirrors latest into denormalized `underlyings.*` cache.
4. **Manual, ad-hoc** — when IB Gateway is logged in (typically Mon–Fri after the morning 2FA), user can run `python3 scripts/ingest-ibkr-chains.py` to overlay higher-quality IBKR chains. Re-running `scan-cheap-options.ts` then picks `source='ibkr'` for those tickers.

---

## 10. Manual Decision Gates

The system never executes trades. The boundary between automated awareness and manual action sits at the `/vol-curve/[id]` page. Every chain in the workflow ends with a human in the loop:

| Stage | Automated | Human-driven |
|---|---|---|
| Ingest chains | ✓ | — |
| Compute metrics | ✓ | — |
| Classify regime | ✓ | — |
| Synthesise candidates | ✓ | — |
| Persist analyses | ✓ | — |
| **Evaluate & decide** | — | **/vol-curve/[id] review** |
| **Price-check combo** | — | `scripts/ibkr-option-quote.ts` (optional) |
| **Place order** | — | IBKR TWS / Client Portal |
| **Update thesis** | — | `scripts/ops/update-entity-status.ts` after entry |

Important: no `triage_records` integration in v1 — candidates surface in vol-curve UI only. Adding to triage queue is a Phase 2.5 option if review-load demands it.

---

## 11. Schema Reference

**Tables touched / created:**

| Table | Purpose | Phase introduced |
|---|---|---|
| `watchlist_entries` | IBKR-tradable radar universe | 1 |
| `vol_scan_runs` | Daily scan metadata | 1 |
| `vol_scan_ticker_snapshots` | Per-ticker per-day metrics + regime | 1 + 1.5 |
| `options_chain_snapshots` | Chain data, multi-source | (existing — extended with `source` differentiation) |
| `underlyings_iv_history` | Time series of spot/iv30/rv20/atr20 | (existing) |
| `vol_curve_reports` | Strategy analyses, single render target | (existing — extended with `trigger_source`, `regime`, `use_case`, `scanner_snapshot_id`) |
| `vol_scan_ticker_snapshots.data_source` | Track IBKR vs Massive per snapshot | 1.5 |

**Key new columns added in Phase 1 / 1.5:**
- `vol_scan_ticker_snapshots`: `is_cheap`, `is_rich`, `cheapness_score`, `richness_score`, `regime`, 8 gate booleans (4 cheap + 4 rich), `data_source`, `front_month_iv`, `back_month_iv`, `term_structure_slope`, `skew_25d`, `iv_rank_252`, `iv_percentile_252`, `iv_rv20_ratio`, `linked_asset_thesis_ids`, `has_open_position`

**Phase 2 additions to `vol_curve_reports`:**
- `trigger_source` text — 'user' | 'scanner'
- `regime` text — copied from snapshot when scanner-triggered
- `use_case` text — strategy intent label
- `scanner_snapshot_id` uuid FK → `vol_scan_ticker_snapshots(id)`

---

## 12. Roadmap

### Phase 1 — Foundation ✓
- Watchlist seed/management ops
- Massive back-month chain ingest (1M–9M)
- Snapshot-only scanner with cheap-regime classification
- Schema + GH Actions automation

### Phase 1.5 — Dual regime ✓
- Rich-regime gates and scoring
- 4 regimes: cheap | rich | mixed | neutral
- Mirror schema columns
- IBKR supplemental ingest path
- Daily rv20/atr20 + denormalized cache update
- Documentation & runbook

### Phase 2 — Strategy synthesis (in progress)
- Refactor `vol-curve-analyze.ts` → `src/lib/volCurveAnalyzer.ts` with exported `analyzeTicker()`
- Extend strategy synthesis with 7 new types (covered_call, cash_secured_put, naked_put, put_spread, iron_condor, put_butterfly, seagull)
- New `synthesize-strategy-candidates.ts` — bridges snapshot → analysis → vol_curve_reports
- LEAP horizon expansion in radar back-months ingest
- UI extensions to `/vol-curve/` (filters, regime badges, scanner subtitle)
- GH Actions adds synthesis step
- Manual-gating preserved end-to-end

### Phase 2.5 — Triage integration (deferred)
- `opportunity_triage_records` table or extension of existing triage system
- Auto-creation when scanner finds high-conviction candidates aligned with active thesis
- Dismissal workflow

### Phase 3 — Advanced extensions (future, not committed)
- Live IV regime alerts (intra-day) for high-conviction names
- Portfolio-level vol exposure dashboard (net delta/vega/theta)
- Calendar / diagonal strategy generation for catalyst plays
- Backtest harness for scanner-suggested strategies vs realised outcomes
- LEAP scanning integration with Radon's `leap_iv_scanner` — either ingest its output or call it as a sub-pipeline

---

## 13. Cross-References

- **Project memory:** `project_options_scanner.md` (design intent, decisions across phases)
- **IBKR access:** `reference_radon_ibkr.md` (Radon's IBClient is canonical)
- **LEAP scanning:** `reference_radon_leap_scan.md` (Radon's LEAP IV scanner — separate tool, future integration)
- **Operations runbook:** `docs/features/260420-options-scanner-runbook.md` (ops, troubleshooting, SQL)
- **Strategies overview:** `docs/options-structures` (Radon — 58 structure catalog with guard decisions)
- **Trade Journal CLAUDE.md:** root-level conventions, schema reference
