-- Speed up latest-per-account position snapshot lookups used by the portfolio
-- page and other snapshot readers.
CREATE INDEX IF NOT EXISTS idx_positions_account_snapshot_date
  ON positions (account_id, snapshot_date DESC);
