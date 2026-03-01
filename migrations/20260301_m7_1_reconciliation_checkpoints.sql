-- M7.1: Reconciliation checkpoint tracking
-- Stores point-in-time snapshots of reconciliation state as deliberate milestones

CREATE TABLE reconciliation_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_date DATE NOT NULL,
  snapshot_nav NUMERIC NOT NULL,
  event_sourced_nav NUMERIC NOT NULL,
  nav_delta NUMERIC NOT NULL,
  nav_delta_pct NUMERIC NOT NULL,
  total_positions INTEGER NOT NULL,
  matched_positions INTEGER NOT NULL,
  discrepancy_count INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL,
  flagged_count INTEGER NOT NULL,
  resolved_count INTEGER NOT NULL,
  unresolved_count INTEGER NOT NULL,
  event_source_freshness JSONB NOT NULL,
  position_snapshot JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_checkpoint_date ON reconciliation_checkpoints(comparison_date);
CREATE INDEX idx_recon_checkpoint_created ON reconciliation_checkpoints(created_at);
