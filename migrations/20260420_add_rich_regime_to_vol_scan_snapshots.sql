-- Phase 1.5: Dual-regime detection.
-- Current scanner only flags cheap-vol (long-vol) candidates. Add mirror
-- fields to also detect rich-vol (short-vol / yield-harvest) candidates.
-- 'mixed' regime is set when both cheap and rich gates trigger — rare but
-- possible when current IV/RV is in one direction while historical percentile
-- is in the other (e.g., META: high iv_pct but low iv/rv).

ALTER TABLE vol_scan_ticker_snapshots
  ADD COLUMN IF NOT EXISTS is_rich BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS richness_score NUMERIC,
  ADD COLUMN IF NOT EXISTS regime TEXT,
  ADD COLUMN IF NOT EXISTS gate_iv_percentile_high BOOLEAN,
  ADD COLUMN IF NOT EXISTS gate_iv_rv_ratio_high BOOLEAN,
  ADD COLUMN IF NOT EXISTS gate_term_stressed BOOLEAN,
  ADD COLUMN IF NOT EXISTS gate_front_above_back BOOLEAN;

COMMENT ON COLUMN vol_scan_ticker_snapshots.regime IS
  'cheap | rich | neutral | mixed — regime used for strategy routing';
COMMENT ON COLUMN vol_scan_ticker_snapshots.is_rich IS
  'True when IV is rich (short-vol opportunity)';
COMMENT ON COLUMN vol_scan_ticker_snapshots.richness_score IS
  'Mirror of cheapness_score for rich regime; 0-100 where 100 = most rich';

CREATE INDEX IF NOT EXISTS idx_vol_scan_snap_run_rich
  ON vol_scan_ticker_snapshots(run_id, is_rich) WHERE is_rich = true;
CREATE INDEX IF NOT EXISTS idx_vol_scan_snap_regime
  ON vol_scan_ticker_snapshots(regime);
