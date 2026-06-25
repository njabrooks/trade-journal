-- Thesis expression episodes (docs/v2/13 §2 — episodic performance, E1)
-- Each contiguous `monitoring` span of a thesis is an episode. Performance and
-- retrospectives key on episodes (not the whole lifetime), so a thesis that closes
-- and re-expresses later gets a fresh retrospective per holding period.
-- Boundaries are derived from the status_change journal trail
-- (src/lib/derived/thesisEpisodeRules.ts) and synced after the lifecycle cascade.
-- thesis_type is 'macro' | 'asset' (matching signal_entity_links / the query layer).

CREATE TABLE IF NOT EXISTS thesis_expression_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL,
  thesis_type text NOT NULL,                 -- 'macro' | 'asset'
  episode_no integer NOT NULL,               -- 1-based, chronological
  opened_at timestamptz NOT NULL,            -- entered monitoring
  closed_at timestamptz,                     -- left monitoring into a closing status; null = open
  closing_status text,                       -- 'closed' | 'complete' | 'rejected' | null (open)

  -- Per-episode retrospective (frozen at close; written by record-retrospective, E2).
  -- retrospective_metrics mirrors the thesis-level shape so the UI consumes episodes unchanged:
  --   { mfe, mfeDate, mae, maeDate, finalCumulative, captureRatio, giveBackFromPeak,
  --     neverInProfit, neverUnderwater, confidence, executionQuality }
  retrospective_metrics jsonb,
  outcome text,
  outcome_notes text,
  execution_quality text,                    -- denormalized for querying; also inside metrics
  retrospective_at timestamptz,              -- recorded-at; null = closed episode still needs one

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tee_thesis ON thesis_expression_episodes (thesis_id, thesis_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tee_thesis_episode ON thesis_expression_episodes (thesis_id, thesis_type, episode_no);
-- Worklist (E2): closed episodes still awaiting a retrospective.
CREATE INDEX IF NOT EXISTS idx_tee_needs_retro ON thesis_expression_episodes (thesis_id)
  WHERE closed_at IS NOT NULL AND retrospective_at IS NULL;
