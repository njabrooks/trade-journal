-- docs/v2/21 Phase 1: regime sensing feed (radon CRI + VCG scanners → DB)
CREATE TABLE IF NOT EXISTS regime_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  scan_time timestamptz NOT NULL,
  market_open boolean,
  score numeric,
  band text NOT NULL,
  components jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regime_snapshots_source_time
  ON regime_snapshots (source, scan_time);
