-- W4: per-strategy realized PnL columns on strategy_metrics_snapshots
-- Design: docs/v2/05-w4-realized-pnl-design.md
-- realized_pnl_to_date: cumulative realized PnL (USD) through snapshot_date,
--   from normalized trade cash flows via average-cost (src/lib/derived/realizedPnl.ts)
-- cumulative_pnl: realized_pnl_to_date + total_unrealized_pnl
-- realized_confidence: 'full' | 'partial_history' | 'no_trades' — quantity
--   reconciliation between linked trades and held positions

ALTER TABLE strategy_metrics_snapshots
  ADD COLUMN IF NOT EXISTS realized_pnl_to_date numeric,
  ADD COLUMN IF NOT EXISTS cumulative_pnl numeric,
  ADD COLUMN IF NOT EXISTS realized_confidence text;
