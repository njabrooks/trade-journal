-- Phase 2: connect scanner output into the existing vol_curve_reports table.
-- Scanner-triggered analyses use the same /vol-curve/[id] UI as user-driven
-- ones; they're differentiated by trigger_source and carry regime/use_case
-- metadata from the snapshot that surfaced them.

ALTER TABLE vol_curve_reports
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS regime TEXT,
  ADD COLUMN IF NOT EXISTS use_case TEXT,
  ADD COLUMN IF NOT EXISTS scanner_snapshot_id UUID
    REFERENCES vol_scan_ticker_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vol_curve_reports_trigger
  ON vol_curve_reports(trigger_source);
CREATE INDEX IF NOT EXISTS idx_vol_curve_reports_regime
  ON vol_curve_reports(regime) WHERE regime IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vol_curve_reports_scanner_snapshot
  ON vol_curve_reports(scanner_snapshot_id) WHERE scanner_snapshot_id IS NOT NULL;

COMMENT ON COLUMN vol_curve_reports.trigger_source IS
  'How this report was generated: user (form) | scanner (daily synthesis)';
COMMENT ON COLUMN vol_curve_reports.regime IS
  'Vol regime at snapshot time: cheap | rich | mixed (null for user-driven)';
COMMENT ON COLUMN vol_curve_reports.use_case IS
  'Strategy intent: hedge | accentuate | yield_harvest | accumulation | etc.';
COMMENT ON COLUMN vol_curve_reports.scanner_snapshot_id IS
  'Back-link to vol_scan_ticker_snapshots row that triggered this analysis';
