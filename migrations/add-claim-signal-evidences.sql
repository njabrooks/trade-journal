-- Add claim_signal_evidences junction table
-- Links claims to the signals they provide evidence for
-- TWO-119

CREATE TABLE IF NOT EXISTS claim_signal_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES main_claims(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  assessment TEXT NOT NULL, -- 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated'
  snapshot_id UUID REFERENCES signal_data_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claim_signal_evidences_unique UNIQUE (claim_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_signal_evidences_claim ON claim_signal_evidences(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_signal_evidences_signal ON claim_signal_evidences(signal_id);
