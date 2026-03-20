-- Migration: Add Finnhub analyst data tables
-- Tables: analyst_actions, analyst_price_targets, insider_transactions

-- 1. Analyst Actions (upgrade/downgrade rating changes)
CREATE TABLE IF NOT EXISTS analyst_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,          -- 'up' | 'down' | 'main' | 'init' | 'reit'
  analyst_firm TEXT NOT NULL,
  from_grade TEXT,
  to_grade TEXT,
  action_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'finnhub',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ticker, analyst_firm, action_date, source)
);

CREATE INDEX IF NOT EXISTS idx_analyst_actions_ticker ON analyst_actions(ticker);
CREATE INDEX IF NOT EXISTS idx_analyst_actions_date ON analyst_actions(action_date);
CREATE INDEX IF NOT EXISTS idx_analyst_actions_underlying ON analyst_actions(underlying_id);

-- 2. Analyst Price Targets (consensus price target snapshots)
CREATE TABLE IF NOT EXISTS analyst_price_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  target_high NUMERIC,
  target_low NUMERIC,
  target_mean NUMERIC,
  target_median NUMERIC,
  number_analysts INTEGER,
  snapshot_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'finnhub',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ticker, snapshot_date, source)
);

CREATE INDEX IF NOT EXISTS idx_analyst_price_targets_ticker ON analyst_price_targets(ticker);
CREATE INDEX IF NOT EXISTS idx_analyst_price_targets_date ON analyst_price_targets(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_analyst_price_targets_underlying ON analyst_price_targets(underlying_id);

-- 3. Insider Transactions (insider buying/selling)
CREATE TABLE IF NOT EXISTS insider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  insider_name TEXT NOT NULL,
  shares NUMERIC,
  change NUMERIC,
  transaction_date DATE NOT NULL,
  filing_date DATE,
  transaction_code TEXT,         -- 'P' (purchase), 'S' (sale), etc.
  transaction_price NUMERIC,
  source TEXT NOT NULL DEFAULT 'finnhub',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ticker, insider_name, transaction_date, change, source)
);

CREATE INDEX IF NOT EXISTS idx_insider_transactions_ticker ON insider_transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_insider_transactions_date ON insider_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_insider_transactions_underlying ON insider_transactions(underlying_id);
