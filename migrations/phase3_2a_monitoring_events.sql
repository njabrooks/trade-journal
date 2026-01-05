-- Phase 3.2A: Monitoring Events Table
-- Created: 2026-01-05
-- Purpose: Log results from monitoring checks (manual or automated)
--
-- This table stores all monitoring check executions and their results.
-- Phase 3.2A: Manual checks only (user-initiated)
-- Phase 3.2B: Automated checks via scheduled jobs
--
-- Related tables:
--   - monitoring_specs: Configuration for what to monitor
--   - validation_points: The thesis validation criteria being monitored
--   - validation_status_history: Status changes triggered by monitoring

CREATE TABLE IF NOT EXISTS monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoring_spec_id UUID NOT NULL REFERENCES monitoring_specs(id) ON DELETE CASCADE,
  validation_point_id UUID NOT NULL REFERENCES validation_points(id) ON DELETE CASCADE,

  -- Check metadata
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by TEXT NOT NULL CHECK (checked_by IN ('user', 'scheduled', 'claude')),

  -- Data source results
  data_source TEXT NOT NULL, -- 'fred' | 'news' | 'price_iv' | 'sec_filings'
  query_params JSONB NOT NULL, -- What was searched: { keywords, dateRange, filters, etc. }

  -- Results
  results_count INTEGER NOT NULL DEFAULT 0,
  results_summary JSONB NOT NULL, -- Array of { title, date, source, snippet, link?, rawData? }

  -- Manual assessment (Phase 3.2A)
  user_relevance_score INTEGER CHECK (user_relevance_score >= 0 AND user_relevance_score <= 10),
  user_assessment_notes TEXT,

  -- Automated assessment (Phase 3.2B - future)
  claude_relevance_score NUMERIC(3, 2) CHECK (claude_relevance_score >= 0 AND claude_relevance_score <= 1),
  claude_assessment_notes TEXT,

  -- Status change trigger
  triggered_status_change BOOLEAN DEFAULT false,
  status_history_id UUID REFERENCES validation_status_history(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_monitoring_events_spec
  ON monitoring_events(monitoring_spec_id);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_validation_point
  ON monitoring_events(validation_point_id);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_checked_at
  ON monitoring_events(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_data_source
  ON monitoring_events(data_source);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_checked_by
  ON monitoring_events(checked_by);

-- Comments for documentation
COMMENT ON TABLE monitoring_events IS
  'Logs all monitoring check results. Phase 3.2A: manual checks only. Phase 3.2B: automated via scheduled jobs.';

COMMENT ON COLUMN monitoring_events.checked_by IS
  'Who triggered the check: user (manual), scheduled (automated cron), claude (AI-initiated)';

COMMENT ON COLUMN monitoring_events.user_relevance_score IS
  'Phase 3.2A: Manual 0-10 relevance score by user. Phase 3.2B: Optional manual override.';

COMMENT ON COLUMN monitoring_events.claude_relevance_score IS
  'Phase 3.2B: Automated 0-1 relevance score by Claude. Null in Phase 3.2A.';

COMMENT ON COLUMN monitoring_events.results_summary IS
  'Array of result objects: [{ title, date, source, snippet, link?, rawData? }]';

COMMENT ON COLUMN monitoring_events.query_params IS
  'JSONB snapshot of query parameters: { keywords: [...], dateRange: {...}, filters: {...} }';
