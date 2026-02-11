-- Add USD-normalized columns to portfolio_snapshots
ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS total_abs_notional_usd NUMERIC;
ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS nav_at_snapshot_usd NUMERIC;
