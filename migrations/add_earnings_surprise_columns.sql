-- Add surprise and surprise_percent columns to earnings_events
-- These are populated from Finnhub /stock/earnings endpoint
ALTER TABLE earnings_events
  ADD COLUMN IF NOT EXISTS surprise numeric,
  ADD COLUMN IF NOT EXISTS surprise_percent numeric;
