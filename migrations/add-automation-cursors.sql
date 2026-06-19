-- C6 (docs/v2/09 §10): cursors for the belief-maintenance routine.
--
-- A minimal key-value high-water-mark store, distinct from ingestion_cursors (which is
-- account+exchange bound, FK to accounts). Only relate-research needs a cursor (an
-- insight-date high-water-mark); the /thesis-review worklists are self-clearing.
CREATE TABLE IF NOT EXISTS automation_cursors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text UNIQUE NOT NULL,
  cursor_value text NOT NULL,
  metadata     jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
