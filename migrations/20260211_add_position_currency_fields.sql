-- Add currency and USD-converted notional to positions table
ALTER TABLE positions ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS abs_notional_usd NUMERIC;
