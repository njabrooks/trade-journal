-- Allows one daily_synthesis row per signal per date, supports safe re-runs
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_data_snapshots_daily_synthesis
  ON signal_data_snapshots (signal_id, snapshot_date)
  WHERE data_source = 'daily_synthesis';
