-- Add separate notional columns for crypto spot and perpetual positions
-- Previously CRYPTO and PERP were lumped into abs_stock_notional
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS abs_crypto_spot_notional NUMERIC,
  ADD COLUMN IF NOT EXISTS abs_perp_notional NUMERIC;
