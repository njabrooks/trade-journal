-- W7 / D11: portfolio-aware options advisor — recommendation storage.
-- One advisor run shares a batch_id; surfacing reads status='active'.

CREATE TABLE IF NOT EXISTS advisor_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  scenario text NOT NULL,

  ticker text NOT NULL,
  underlying_id uuid REFERENCES underlyings(id) ON DELETE SET NULL,

  exposure_usd numeric,
  pct_nav numeric,

  structure jsonb NOT NULL,
  metrics jsonb NOT NULL,
  vol_context jsonb,

  rationale text NOT NULL,

  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'skill',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_advisor_recs_status ON advisor_recommendations (status, created_at);
CREATE INDEX IF NOT EXISTS idx_advisor_recs_batch ON advisor_recommendations (batch_id);
CREATE INDEX IF NOT EXISTS idx_advisor_recs_ticker ON advisor_recommendations (ticker);
