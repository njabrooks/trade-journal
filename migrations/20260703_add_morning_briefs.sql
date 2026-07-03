-- Morning briefs (docs/v2/20 Lane A — the daily synthesis surface).
-- ONE row per day, upserted on brief_date by scripts/ops/save-morning-brief.ts
-- (the /morning-brief skill's writer). Synthesis-only: the brief never mutates
-- the belief layer and never raises decisions.

CREATE TABLE IF NOT EXISTS morning_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date date NOT NULL UNIQUE,
  headline text NOT NULL,
  -- Ranked attention list (<=5): [{ title, why, deepLink }] — deepLink is a copyable
  -- agent command ('/thesis GLXY', '/decisions'), not a URL.
  attention jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_md text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_morning_briefs_date ON morning_briefs (brief_date);
