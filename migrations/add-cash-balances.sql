-- Add cash column to nav_snapshots
ALTER TABLE nav_snapshots ADD COLUMN IF NOT EXISTS cash NUMERIC;

-- Create cash_balances table
CREATE TABLE IF NOT EXISTS cash_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  currency TEXT NOT NULL,
  balance NUMERIC NOT NULL,
  balance_usd NUMERIC,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, snapshot_date, currency, source)
);

CREATE INDEX IF NOT EXISTS idx_cash_balances_account_snapshot
  ON cash_balances(account_id, snapshot_date);

-- Add cash and leverage columns to portfolio_snapshots
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS total_cash_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS leverage_ratio NUMERIC;
