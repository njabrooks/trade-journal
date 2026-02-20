-- Migration: Create reconciliation_resolutions table
-- Purpose: M7.1 — Discrepancy classification and resolution tracking for portfolio reconciliation
-- Date: 2026-02-20

CREATE TABLE IF NOT EXISTS reconciliation_resolutions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner TEXT NOT NULL,
  ticker TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved',
  nature TEXT,
  notes TEXT,
  discrepancy_type TEXT,
  qty_delta_at_action NUMERIC,
  mv_delta_at_action NUMERIC,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- One resolution per (owner, ticker) pair — matches reconciliation aggregation model
CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_res_owner_ticker
  ON reconciliation_resolutions (owner, ticker);

-- Fast lookups by disposition status
CREATE INDEX IF NOT EXISTS idx_recon_res_status
  ON reconciliation_resolutions (status);

COMMENT ON TABLE reconciliation_resolutions IS 'Per-position discrepancy resolution state for portfolio reconciliation (M7.1)';
COMMENT ON COLUMN reconciliation_resolutions.status IS 'Disposition: unresolved | accepted | flagged | resolved';
COMMENT ON COLUMN reconciliation_resolutions.nature IS 'Root cause: mapping_error | missing_coverage | expected_gap | dust | price_drift | qty_drift | other';
COMMENT ON COLUMN reconciliation_resolutions.discrepancy_type IS 'Reconciliation status at time of action: qty_mismatch | mv_mismatch | snapshot_only | event_sourced_only';
COMMENT ON COLUMN reconciliation_resolutions.qty_delta_at_action IS 'Qty delta snapshot at time of disposition — for drift tracking';
COMMENT ON COLUMN reconciliation_resolutions.mv_delta_at_action IS 'MV delta snapshot at time of disposition — for drift tracking';
