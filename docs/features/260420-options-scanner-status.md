# Options Scanner — Status & Pickup Notes (2026-04-20)

**Where we are:** Phase 1 + 1.5 + 2 functionally shipped. Scanner runs daily,
classifies regime, UI tab on `/vol-curve/` lists candidates with manual
"Analyze" gate to vol-curve detail. Strategy synthesis extended to cover the
short-vol / yield-harvest side.

**Pickup priority for next session:** see "Open items" below. Most pressing
is options data quality on futures + minor UI polish.

---

## What's done

### Phase 1 — Foundation
- ✅ `watchlist_entries`, `vol_scan_runs`, `vol_scan_ticker_snapshots` schema
- ✅ Watchlist seeded with 50 IBKR-tradable tickers (open positions + active strategies + theses); BTC deactivated
- ✅ `seed-watchlist.ts` (idempotent re-seed), `add-to-watchlist.ts`, `deactivate-watchlist-entry.ts`
- ✅ `ingest-radar-back-months.ts` — Massive monthly chains 1M-9M, `--leap` for 12-24M
- ✅ `scan-cheap-options.ts` — IV percentile, IV/RV, term slope, 25Δ skew, cheap gates
- ✅ GitHub Actions `.github/workflows/cheap-options-scanner.yml` (13:45/14:45 UTC DST pair)

### Phase 1.5 — Dual regime
- ✅ Rich gates mirror cheap gates (high IV pct / fat IV/RV / stressed term / front > back)
- ✅ `is_rich`, `richness_score`, `regime`, 4 rich-gate boolean columns
- ✅ `data_source` column on snapshots to track IBKR vs Massive
- ✅ `scan-cheap-options.ts` writes regime classification; permissive structural gate when no term data

### Massive ingestion refactor
- ✅ Extracted `scripts/ingest-underlyings-massive.ts` into `src/lib/ingestion/massive/`
  modules: `client.ts`, `spot.ts`, `optionsChain.ts`, `iv30.ts`, `aggs.ts`
- ✅ Daily ingest now computes rv20 + atr20 from Massive daily aggregates
- ✅ One-shot `backfill-rv20-atr20.ts` populated 24,915 history rows across 53 tickers
- ✅ Denormalized `underlyings.spot/iv30/rv20/atr20` cache mirrors latest values

### IBKR supplemental ingest
- ✅ `scripts/ingest-ibkr-chains.py` — uses Radon's `IBClient` (sys.path injection)
- ✅ ContFuture detection for futures roots (ES, CL, ZC, etc.)
- ✅ Preflight check confirms Gateway port before connecting
- ✅ Upserts with `source='ibkr'` alongside Massive data
- ⚠️ NOT VALIDATED LIVE — Gateway was down during build; needs manual trigger when TWS up

### Phase 2 — Strategy synthesis
- ✅ Refactored `vol-curve-analyze.ts` → `src/lib/volCurveAnalyzer.ts` exporting `analyzeTicker(opts)`
- ✅ CLI script reduced to thin wrapper; output structure preserved (validated against baseline)
- ✅ Added 6 new strategy types: `naked_put`, `put_spread`, `seagull`, `covered_call`, `cash_secured_put`, `iron_condor`
- ✅ `AnalyzeOptions` accepts `regime`, `useCase`, `hasOpenPosition` for context-aware generation
- ✅ `POST /api/vol-curve/analyze-snapshot/[id]` — manual-gate per-ticker analyzer
  - Infers direction from thesis or regime+position context
  - Derives targets from thesis.target_price or ATR20
  - Falls back to live spot lookup if snapshot missing
  - Writes `vol_curve_reports` with `trigger_source='scanner'`, regime, use_case, scanner_snapshot_id FK
- ✅ `GET /api/vol-curve/scanner-today` — lists today's snapshots with live position check (latest-snapshot-per-account semantic)
- ✅ `src/app/vol-curve/ScannerTodayClient.tsx` — sortable table with regime filter, "Analyze" / "View" action
- ✅ Tabs wrapper on `/vol-curve/page.tsx` — Scanner Today + Run Analysis
- ✅ Tooltips on Term Δ and 25Δ Skew headers (HelpCircle icon + Tooltip component)
- ✅ Sort uses existing `SortableHeader` from triage (3-state: desc → asc → off)

### Documentation
- ✅ `docs/features/260420-options-scanner-prd.md` — full PRD
- ✅ `docs/features/260420-options-scanner-runbook.md` — operational runbook
- ✅ Trade-journal CLAUDE.md updated with Radon IBKR integration notes
- ✅ Cross-project CLAUDE.md adds Radon as 4th repo
- ✅ Memory: `project_options_scanner.md`, `reference_radon_ibkr.md`, `reference_radon_leap_scan.md`

---

## Open items (pick up here)

### Data quality
- **Futures coverage** (CLM6, CLQ6, ES, MNQ, SBN6, SO3U6, SOFR3, SOI, ZC, ZCZ6, ZW, ZWN6) shows `n/a` for most metrics. Massive's `/v3/snapshot/options/{ticker}` endpoint doesn't cover futures options. Resolution path: run `python3 scripts/ingest-ibkr-chains.py` when IB Gateway is up — Radon's IBClient handles ContFuture/Future contracts. Once IBKR data exists for these tickers, the scanner will prefer it automatically (already wired via `getPreferredSource`).
- **Pathological skew/term values on illiquid names** — BRR showed Term Δ = −187pp and Skew = +62pp, indicating chain data quality issues on thin small-caps. Future safeguard: sanity-clip extreme values (|slope| > 30pp = ignore) before they hit gates.
- **NEUTRAL regime score display** — Scanner Today shows `Math.max(cheapnessScore, richnessScore)` in the Score column even for NEUTRAL rows. Could display "—" instead to avoid confusion. One-line change in `ScannerTodayClient.tsx`.

### IBKR ingest — needs live validation
- `scripts/ingest-ibkr-chains.py` has been built and preflighted but never run with Gateway live. First time Gateway is up:
  1. `python3 scripts/ingest-ibkr-chains.py --dry-run` — confirms connection + watchlist
  2. `python3 scripts/ingest-ibkr-chains.py NVDA TSLA` — small subset first
  3. Full run if subset works
- Once IBKR data is in `options_chain_snapshots` with `source='ibkr'`, re-run `scan-cheap-options.ts` and verify scanner tags `data_source='ibkr'` for those tickers.

### LEAP workflow
- `--leap` flag added to `ingest-radar-back-months.ts` (pulls 12M/15M/18M/24M expiries)
- **NOT wired into the daily GH Action** (`cheap-options-scanner.yml`) — currently only pulls 1M-9M
- Decision needed: always pull LEAPs (more API calls), or only on weekly cadence, or only for cheap-regime tickers
- When wired, the synthesis layer (`analyzeTicker`) already generates long-call/long-put with extended `horizonMonths` → produces LEAP candidates organically

### Strategy synthesis polish
- **`put_butterfly`** was deferred in v1 to keep scope bounded. Add when needed; pattern mirrors existing `butterfly` (call fly).
- **`covered_call` payoff math** is approximated — modelled as a short call only with `+1` added to net delta for the implicit stock. True payoff requires modelling the stock leg explicitly. Acceptable for now; refine when first used in anger.
- **`iron_condor` ranking** uses `avgEdgeRatio=1.0` placeholder. Premium-capture has no directional edge concept; ranks by ROR + liquidity only. Could improve by computing premium-to-max-loss ratio explicitly.

### Phase 2.5 — deferred
- **Triage integration** — Scanner candidates currently only surface in `/vol-curve/`. Could add an `opportunity_triage_records` table or extend existing `triage_records` so high-conviction scanner picks auto-create triage items. Deferred until day-to-day usage tells us if review-load demands it.
- **Detail page polish** — `/vol-curve/[id]` doesn't yet show a scanner-context header subtitle when `trigger_source='scanner'`. Small annotation pass needed.
- **Re-analyze button** — currently clicking "Analyze" on a snapshot that already has a report shows "View" instead. If the user wants to re-run with different params, they have to use the form tab. Could add a "Re-analyze with different params" CTA on the detail page.

### Phase 3 — future
- LEAP scanning integration with Radon's `leap_iv_scanner` — either ingest its output or call it from a TJ cron
- Live IV regime alerts (intra-day) for high-conviction names
- Backtest harness for scanner-suggested strategies vs realised outcomes
- Portfolio-level vol exposure dashboard (net delta/vega/theta across the book)

---

## How to verify things still work after time away

```bash
cd ~/projects/trade-journal

# 1. Scanner runs against current data — should produce ~20-30 cheap/rich candidates
npx tsx scripts/scan-cheap-options.ts

# 2. Visit the UI
npm run dev
# → http://localhost:3000/vol-curve/
# → "Scanner Today" tab — should list today's candidates with metrics, regime badges, sort
# → Click "Analyze" on any non-NEUTRAL row → /vol-curve/[id] full report

# 3. If Gateway is up, supplement with IBKR data
python3 scripts/ingest-ibkr-chains.py --dry-run  # preflight
python3 scripts/ingest-ibkr-chains.py             # full pull
npx tsx scripts/scan-cheap-options.ts             # re-scan; tickers with IBKR data will show src=ibkr

# 4. Backfill rv20/atr20 if any holes (one-off)
npx tsx scripts/backfill-rv20-atr20.ts --years 2
```

---

## Key file map

| Concern | File |
|---|---|
| PRD (architecture, decisions) | `docs/features/260420-options-scanner-prd.md` |
| Runbook (ops, troubleshooting, SQL) | `docs/features/260420-options-scanner-runbook.md` |
| Status (this file) | `docs/features/260420-options-scanner-status.md` |
| Scanner | `scripts/scan-cheap-options.ts` |
| Radar chain ingest (Massive) | `scripts/ingest-radar-back-months.ts` |
| Radar chain ingest (IBKR, manual) | `scripts/ingest-ibkr-chains.py` |
| RV20/ATR20 backfill | `scripts/backfill-rv20-atr20.ts` |
| Daily Massive ingest (refactored) | `scripts/ingest-underlyings-massive.ts` |
| Massive lib | `src/lib/ingestion/massive/` |
| Vol-curve analyzer lib | `src/lib/volCurveAnalyzer.ts` |
| Vol-curve CLI wrapper | `scripts/vol-curve-analyze.ts` |
| Scanner-triggered analyze API | `src/app/api/vol-curve/analyze-snapshot/[id]/route.ts` |
| Scanner Today list API | `src/app/api/vol-curve/scanner-today/route.ts` |
| Scanner Today UI | `src/app/vol-curve/ScannerTodayClient.tsx` |
| Vol curve page (tabs) | `src/app/vol-curve/page.tsx` |
| Ops scripts | `scripts/seed-watchlist.ts`, `scripts/ops/add-to-watchlist.ts`, `scripts/ops/deactivate-watchlist-entry.ts` |
| GH Actions | `.github/workflows/cheap-options-scanner.yml` |
| Migrations | `migrations/20260419_add_options_scanner_tables.sql`, `migrations/20260420_*.sql` |

---

## What's in auto-memory (cross-session continuity)

- `project_options_scanner.md` — design intent + decisions stack
- `reference_radon_ibkr.md` — Radon IBKR integration (canonical IBKR access path)
- `reference_radon_leap_scan.md` — Radon LEAP IV scanner (future integration)
