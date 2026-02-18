-- Add market_value_usd column to positions table
-- This provides a clearly-named, always-populated USD market value field
-- replacing the fragile abs_notional → abs_notional_usd → qty*spot*mult fallback chain

ALTER TABLE positions ADD COLUMN market_value_usd NUMERIC;

COMMENT ON COLUMN positions.market_value_usd IS
  'Market value in USD. Always populated when price data available. For STK/CRYPTO: |qty * spot * multiplier|. For OPT: |qty * option_mark * multiplier|. For PERP: |qty * mark_price| (notional exposure).';
COMMENT ON COLUMN positions.abs_notional IS
  'Legacy: market value in position currency. Prefer market_value_usd.';
COMMENT ON COLUMN positions.abs_notional_usd IS
  'Legacy: abs_notional converted to USD via FX rate (IBKR only). Prefer market_value_usd.';

-- Backfill from existing data:
-- 1. abs_notional_usd (already USD, IBKR positions with FX conversion)
-- 2. abs_notional (crypto is USD-denominated, so this is already USD)
-- 3. Computed from qty * spot * multiplier (last resort)
UPDATE positions
SET market_value_usd = COALESCE(
  abs_notional_usd,
  abs_notional,
  ABS(quantity::numeric * spot::numeric * COALESCE(multiplier::numeric, 1))
)
WHERE market_value_usd IS NULL;
