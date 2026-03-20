-- Add pending/accepted/rejected lifecycle to signal_data_snapshots
-- and optional claim provenance for research_routing rows.

ALTER TABLE signal_data_snapshots
  ADD COLUMN status text NOT NULL DEFAULT 'accepted';
  -- 'pending' | 'accepted' | 'rejected'
  -- DEFAULT 'accepted': all existing rows are unaffected

ALTER TABLE signal_data_snapshots
  ADD COLUMN claim_id uuid REFERENCES main_claims(id) ON DELETE SET NULL;
  -- nullable; populated only for data_source = 'research_routing' rows

-- Index for efficient pending-row lookups (EOD pre-pass, UI filtering)
CREATE INDEX idx_signal_data_snapshots_status
  ON signal_data_snapshots (status)
  WHERE status = 'pending';
