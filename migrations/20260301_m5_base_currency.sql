-- M5: Base Currency Support
-- Adds GBP conversion columns to event_calculations, portfolio_daily_balances,
-- and daily_portfolio_values. Adds base_currency to owners.

-- 1. owners.base_currency
ALTER TABLE owners ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'USD';
UPDATE owners SET base_currency = 'GBP' WHERE name = 'Nick';

-- 2. event_calculations — GBP per-event values
ALTER TABLE event_calculations ADD COLUMN IF NOT EXISTS fx_rate_to_gbp NUMERIC;
ALTER TABLE event_calculations ADD COLUMN IF NOT EXISTS total_value_gbp NUMERIC;
ALTER TABLE event_calculations ADD COLUMN IF NOT EXISTS cost_basis_gbp NUMERIC;
ALTER TABLE event_calculations ADD COLUMN IF NOT EXISTS realized_gain_gbp NUMERIC;
ALTER TABLE event_calculations ADD COLUMN IF NOT EXISTS new_average_cost_gbp NUMERIC;

-- 3. portfolio_daily_balances — GBP daily values
ALTER TABLE portfolio_daily_balances ADD COLUMN IF NOT EXISTS book_value_gbp NUMERIC;
ALTER TABLE portfolio_daily_balances ADD COLUMN IF NOT EXISTS market_value_gbp NUMERIC;
ALTER TABLE portfolio_daily_balances ADD COLUMN IF NOT EXISTS fx_rate_usd_gbp NUMERIC;

-- 4. daily_portfolio_values — GBP aggregates
ALTER TABLE daily_portfolio_values ADD COLUMN IF NOT EXISTS total_market_value_gbp NUMERIC;
ALTER TABLE daily_portfolio_values ADD COLUMN IF NOT EXISTS total_book_value_gbp NUMERIC;
ALTER TABLE daily_portfolio_values ADD COLUMN IF NOT EXISTS unrealized_gain_gbp NUMERIC;
