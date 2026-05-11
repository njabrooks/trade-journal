-- Track which options-chain source produced each scan-snapshot's metrics.
-- Values: 'ibkr' (preferred when available), 'massive', or 'mixed'
-- when both sources contributed and were merged.
ALTER TABLE vol_scan_ticker_snapshots
  ADD COLUMN IF NOT EXISTS data_source TEXT;

COMMENT ON COLUMN vol_scan_ticker_snapshots.data_source IS
  'Source of the chain data used to compute metrics: ibkr | massive | mixed';
