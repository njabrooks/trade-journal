-- Create fx_rates table for persisting daily exchange rates from IBKR Flex
CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL, -- Always 'USD'
  rate NUMERIC NOT NULL,
  source TEXT NOT NULL, -- 'ibkr_flex'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one rate per currency pair per date
ALTER TABLE fx_rates
  ADD CONSTRAINT fx_rates_unique_date_currency_pair
  UNIQUE (snapshot_date, from_currency, to_currency);

-- Indexes for lookup
CREATE INDEX IF NOT EXISTS idx_fx_rates_snapshot_date ON fx_rates (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_fx_rates_from_currency ON fx_rates (from_currency);
