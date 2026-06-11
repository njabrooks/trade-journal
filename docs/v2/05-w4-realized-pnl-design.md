# W4 — Realized PnL Engine: Design

**Date:** 2026-06-12 (session 1) · **Status:** investigation complete, engine in build
**Goal:** per-strategy realized + cumulative P&L, daily, all sources — the prerequisite for thesis-level performance attribution (D8).

## Investigated semantics (ground truth, 2026-06-11)

| Fact | Evidence |
|---|---|
| `trades.net_amount` (IBKR: OPT/STK/FUT/FOP/FSFOP) is **signed cash flow, fee-net, multiplier-inclusive** | BUY 2 LLY calls @ 54.615 → net −10,923.71 ≈ −(54.615×2×100)−0.71; SELL qty −2 → positive net |
| `trades.net_amount` (crypto: CRYPTO/PERP) is **always positive, gross − fees regardless of side** | PERP BUY 0.1 @ 453.95 → net +45.386 = 45.395 − 0.009 → a BUY's true cash-out is gross + fees, so net understates by 2×fees |
| `fx_rate_to_base` = currency→USD rate (USD=1, GBP≈1.33); **NULL for USDC** (13.7K rows) → treat USDC as 1 | currency × fx survey |
| Strategy linkage coverage: OPT/STK/FUT 100%, PERP 87%, **CRYPTO spot 11%** | trades GROUP BY asset_class |
| Trade-vs-position quantity reconciliation exposes real history gaps (e.g. DOGE strat: net traded −96,458 vs position 0.0164; CAT 500 vs 100) | coverage query |
| Broker `positions.unrealized_pnl` is not populated for all crypto spot (no cost basis at Coinbase/Kraken/Solana) | CLAUDE.md + ingestion notes |
| `strategy_metrics_snapshots` grain = (account_id, strategy_id, snapshot_date), maintained daily by flex pipeline | schema + W1 forensics |

## Method (chosen over per-source mtm+FIFO)

**Average-cost engine over normalized trade flows, per (account, strategy, symbol):**

1. **Flow normalization** (`normalizeTradeFlow`): per trade → `{signedQty, cashFlowUsd, feesUsd}`.
   - IBKR classes: `cashFlowUsd = net_amount × (fx ?? 1)` (authoritative, multiplier baked in); signedQty = quantity (already signed).
   - Crypto classes: reconstruct — `gross = price × qty`; `cashFlowUsd = side=SELL ? gross − fees : −(gross + fees)` (×fx if non-USD); signedQty = side=SELL ? −qty : +qty.
2. **Realized series**: feed flows chronologically through the W3-tested pure average-cost machinery (`computeAcquisitionPure` / `computeDisposalPure` from `src/lib/calculations/average-cost.ts`) per (account, strategy, symbol); realized gains accumulate per date. Handles shorts, flips, partial closes — already golden-tested.
3. **Aggregation**: sum symbol-level realized to (account, strategy, date); `realized_pnl_to_date` = running cumulative; `cumulative_pnl = realized_pnl_to_date + total_unrealized_pnl` (existing snapshot field).
4. **Confidence flag** (`realized_confidence`): reconcile Σ signedQty per (strategy, symbol) vs latest position quantity. Within tolerance → `full`; mismatch → `partial_history` (early/unlinked trades missing — realized is a lower-bound view, surfaced as such in UI).

Why not mtm_snapshots: no strategy linkage (needs position join), IBKR-only, and mixed conventions; the flow method is one code path for every source. Why not strategy-level FIFO: average-cost is sufficient at strategy granularity (tax-grade lot matching stays in the accounting engine) and reuses tested code.

## Schema (migration `20260612_w4_realized_pnl.sql`)

`strategy_metrics_snapshots` + 3 columns: `realized_pnl_to_date numeric`, `cumulative_pnl numeric`, `realized_confidence text` ('full' | 'partial_history' | 'no_trades').

## Components

- `src/lib/derived/realizedPnl.ts` — pure: `normalizeTradeFlow()`, `computeRealizedSeries(trades[])` (per-strategy, returns date→realized map + final coverage); DB wrapper `computeStrategyRealizedToDate(accountId, strategyId, throughDate)`.
- Integration: `computeStrategyMetrics()` calls the wrapper → daily maintenance for free via the existing flex-pipeline recompute.
- `scripts/ops/recompute-realized-pnl.ts` — idempotent backfill/recompute tool (all strategies × all snapshot dates, or `--strategy-id`/`--since`).
- Golden tests: `src/lib/derived/__tests__/realizedPnl.test.ts` — flow normalization per class/side (incl. crypto fee asymmetry), option round-trip with multiplier, short cycle, partial close, fx conversion, coverage flag.
- Attribution queries (feeds W5): `getAssetThesisPerformance(thesisId)` per-strategy + combined series; macro = full-credit union of linked asset theses (D8).

## Known limits (accepted, surfaced)

- CRYPTO spot linkage is 11% — most spot crypto strategies will read `partial_history` until trade-linking improves (separate, later task).
- Strategies whose trades predate ingestion windows: same flag.
- `cumulative_pnl` inherits broker unrealized where positions lack cost basis (crypto spot): unrealized there reflects flow-derived basis from the avg-cost state when broker value is absent.
