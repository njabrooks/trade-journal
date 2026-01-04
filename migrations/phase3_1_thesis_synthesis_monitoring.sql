-- Phase 3.1: Thesis Synthesis & Monitoring System - MVP Tables
-- Created: 2026-01-04
-- Spec: docs/features/thesis-synthesis-monitoring.md

-- ============================================================================
-- 1. THESIS ARTICULATIONS (Versioned)
-- ============================================================================
-- Stores synthesized thesis articulations with full provenance tracking.
-- Each thesis can have multiple versions as beliefs evolve.

CREATE TABLE IF NOT EXISTS thesis_articulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),
  version INTEGER NOT NULL DEFAULT 1,

  -- Core synthesis
  core_argument TEXT NOT NULL,
  key_drivers JSONB NOT NULL DEFAULT '[]',
  key_assumptions JSONB NOT NULL DEFAULT '[]',

  -- Context
  timeframe JSONB NOT NULL,  -- { horizon, expectedResolution }
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low', 'medium', 'high', 'very_high')),
  confidence_rationale TEXT,
  evidence_gaps JSONB DEFAULT '[]',

  -- Provenance
  claim_ids_used JSONB NOT NULL DEFAULT '[]',
  generated_by TEXT NOT NULL CHECK (generated_by IN ('claude', 'user')),
  user_edits TEXT,

  -- Compositional dependencies (discovered during synthesis)
  referenced_theses JSONB DEFAULT '[]',
  -- Array of: { thesis_id, thesis_type, thesis_title, relationship, notes }

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (thesis_id, thesis_type, version)
);

-- Index for quick lookup by thesis
CREATE INDEX IF NOT EXISTS idx_articulations_thesis ON thesis_articulations(thesis_id, thesis_type);
CREATE INDEX IF NOT EXISTS idx_articulations_created ON thesis_articulations(created_at DESC);

COMMENT ON TABLE thesis_articulations IS 'Versioned thesis articulations synthesized from linked claims. Each version captures the state of belief at a point in time.';
COMMENT ON COLUMN thesis_articulations.core_argument IS '1-2 paragraph synthesis: what we believe and why';
COMMENT ON COLUMN thesis_articulations.key_drivers IS '3-5 main factors that would make this thesis play out';
COMMENT ON COLUMN thesis_articulations.key_assumptions IS '3-5 things that must be true for thesis to hold';
COMMENT ON COLUMN thesis_articulations.referenced_theses IS 'Other theses this depends on, discovered during synthesis';

-- ============================================================================
-- 2. VALIDATION POINTS
-- ============================================================================
-- Explicit validation/invalidation criteria for each thesis.
-- These are the commitment device - what would prove the thesis right/wrong.

CREATE TABLE IF NOT EXISTS validation_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),
  articulation_id UUID REFERENCES thesis_articulations(id) ON DELETE SET NULL,

  -- Core definition
  type TEXT NOT NULL CHECK (type IN ('validation', 'invalidation')),
  statement TEXT NOT NULL,
  rationale TEXT,

  -- Classification
  category TEXT NOT NULL CHECK (category IN ('explicit', 'judgment_required')),
  importance TEXT NOT NULL CHECK (importance IN ('critical', 'significant', 'supporting')),
  timeframe TEXT NOT NULL CHECK (timeframe IN ('immediate', 'medium_term', 'secular')),

  -- Category-specific details (one should be populated based on category)
  explicit_details JSONB,      -- { metric, threshold, dataSources, monitoringFrequency }
  judgment_details JSONB,      -- { observableProxies, judgmentCriteria, reviewFrequency }

  -- Response protocol
  response_protocol JSONB NOT NULL,  -- { description, linkedStrategies?, escalation? }

  -- Status
  status TEXT NOT NULL DEFAULT 'not_triggered'
    CHECK (status IN ('not_triggered', 'monitoring', 'triggered', 'superseded')),

  -- Dependent thesis reference (for compositional validation)
  dependent_thesis_id UUID,
  dependent_thesis_type TEXT CHECK (dependent_thesis_type IN ('macro', 'asset') OR dependent_thesis_type IS NULL),
  dependent_thesis_condition TEXT CHECK (dependent_thesis_condition IN ('invalidated', 'confidence_drops', 'status_changes') OR dependent_thesis_condition IS NULL),
  dependent_thesis_condition_detail TEXT,

  -- Provenance
  linked_claim_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validation_points_thesis ON validation_points(thesis_id, thesis_type);
CREATE INDEX IF NOT EXISTS idx_validation_points_status ON validation_points(status);
CREATE INDEX IF NOT EXISTS idx_validation_points_type ON validation_points(type);
CREATE INDEX IF NOT EXISTS idx_validation_points_importance ON validation_points(importance);

COMMENT ON TABLE validation_points IS 'Explicit validation/invalidation criteria for theses. The commitment device.';
COMMENT ON COLUMN validation_points.category IS 'explicit = measurable metric, judgment_required = needs interpretation';
COMMENT ON COLUMN validation_points.response_protocol IS 'What to do when this point triggers - the pre-committed action';
COMMENT ON COLUMN validation_points.dependent_thesis_id IS 'For compositional validation: triggers when this thesis changes state';

-- ============================================================================
-- 3. VALIDATION STATUS HISTORY
-- ============================================================================
-- Full audit trail of all validation point status changes.
-- Every check is logged, even "no change" checks.

CREATE TABLE IF NOT EXISTS validation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_point_id UUID NOT NULL REFERENCES validation_points(id) ON DELETE CASCADE,

  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_status TEXT,
  new_status TEXT NOT NULL,

  -- Evidence that triggered the change
  evidence JSONB NOT NULL,  -- { source, summary, link?, rawContent? }

  -- Assessment
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  assessed_by TEXT NOT NULL CHECK (assessed_by IN ('claude', 'user')),

  -- Action tracking
  user_action_required BOOLEAN DEFAULT false,
  user_action_taken TEXT,
  user_action_timestamp TIMESTAMPTZ
);

-- Index for quick lookup by validation point
CREATE INDEX IF NOT EXISTS idx_status_history_point ON validation_status_history(validation_point_id);
CREATE INDEX IF NOT EXISTS idx_status_history_timestamp ON validation_status_history(timestamp DESC);

COMMENT ON TABLE validation_status_history IS 'Full audit trail of validation point status changes. Everything is logged.';
COMMENT ON COLUMN validation_status_history.evidence IS 'The evidence that prompted this status assessment';
COMMENT ON COLUMN validation_status_history.user_action_required IS 'Whether the response protocol requires user action';

-- ============================================================================
-- 4. DECISION AUDIT LOG
-- ============================================================================
-- Tracks what the user actually did vs what their stated process said to do.
-- The accountability mechanism.

CREATE TABLE IF NOT EXISTS decision_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Context (at least one should be populated)
  thesis_id UUID,
  thesis_type TEXT CHECK (thesis_type IN ('macro', 'asset') OR thesis_type IS NULL),
  strategy_id UUID,
  validation_point_id UUID REFERENCES validation_points(id) ON DELETE SET NULL,

  -- Trigger
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('validation_point', 'playbook', 'user_discretion', 'other')),
  trigger_description TEXT NOT NULL,

  -- Process vs. actual (the accountability)
  stated_process_response TEXT NOT NULL,  -- What rules said to do
  actual_action_taken TEXT NOT NULL,       -- What was actually done
  rationale TEXT,                          -- User explanation if diverged
  divergence_acknowledged BOOLEAN DEFAULT false,  -- Did user explicitly acknowledge?

  -- Outcome (updated later when strategy closes)
  outcome JSONB  -- { timestamp, result, retrospectiveNotes? }
);

-- Indexes for analysis queries
CREATE INDEX IF NOT EXISTS idx_decision_audit_thesis ON decision_audit_log(thesis_id, thesis_type);
CREATE INDEX IF NOT EXISTS idx_decision_audit_strategy ON decision_audit_log(strategy_id);
CREATE INDEX IF NOT EXISTS idx_decision_audit_timestamp ON decision_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decision_audit_divergence ON decision_audit_log(divergence_acknowledged) WHERE divergence_acknowledged = true;

COMMENT ON TABLE decision_audit_log IS 'Tracks process adherence: what user said they would do vs what they did';
COMMENT ON COLUMN decision_audit_log.stated_process_response IS 'What the response protocol said to do';
COMMENT ON COLUMN decision_audit_log.actual_action_taken IS 'What the user actually did';
COMMENT ON COLUMN decision_audit_log.divergence_acknowledged IS 'Whether user explicitly acknowledged deviating from stated process';

-- ============================================================================
-- 5. MONITORING SPECS (Phase 3.2 - created now for schema completeness)
-- ============================================================================
-- Defines what to watch and how for each validation point.
-- Not used in MVP but schema included for forward compatibility.

CREATE TABLE IF NOT EXISTS monitoring_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_point_id UUID NOT NULL REFERENCES validation_points(id) ON DELETE CASCADE,

  -- Search strategy
  keywords JSONB NOT NULL DEFAULT '[]',
  semantic_description TEXT,
  sources JSONB DEFAULT '[]',
  exclusions JSONB DEFAULT '[]',

  -- Timing
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'on_demand')),
  last_checked TIMESTAMPTZ,
  next_check TIMESTAMPTZ,

  -- Alert configuration
  alert_threshold JSONB NOT NULL,  -- { type, condition?, scoreThreshold? }

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_specs_next_check ON monitoring_specs(next_check);
CREATE INDEX IF NOT EXISTS idx_monitoring_specs_point ON monitoring_specs(validation_point_id);

COMMENT ON TABLE monitoring_specs IS 'Phase 3.2: Automated monitoring configuration for validation points';

-- ============================================================================
-- 6. HELPER FUNCTION: Get Latest Articulation
-- ============================================================================
-- Returns the most recent articulation for a thesis.

CREATE OR REPLACE FUNCTION get_latest_articulation(
  p_thesis_id UUID,
  p_thesis_type TEXT
)
RETURNS thesis_articulations AS $$
  SELECT *
  FROM thesis_articulations
  WHERE thesis_id = p_thesis_id
    AND thesis_type = p_thesis_type
  ORDER BY version DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_latest_articulation IS 'Returns the most recent articulation version for a thesis';

-- ============================================================================
-- 7. HELPER FUNCTION: Get Active Validation Points
-- ============================================================================
-- Returns non-superseded validation points for a thesis.

CREATE OR REPLACE FUNCTION get_active_validation_points(
  p_thesis_id UUID,
  p_thesis_type TEXT
)
RETURNS SETOF validation_points AS $$
  SELECT *
  FROM validation_points
  WHERE thesis_id = p_thesis_id
    AND thesis_type = p_thesis_type
    AND status != 'superseded'
  ORDER BY
    CASE importance
      WHEN 'critical' THEN 1
      WHEN 'significant' THEN 2
      WHEN 'supporting' THEN 3
    END,
    created_at DESC;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_active_validation_points IS 'Returns active (non-superseded) validation points for a thesis, ordered by importance';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify tables were created

DO $$
BEGIN
  RAISE NOTICE 'Phase 3.1 tables created successfully:';
  RAISE NOTICE '  - thesis_articulations';
  RAISE NOTICE '  - validation_points';
  RAISE NOTICE '  - validation_status_history';
  RAISE NOTICE '  - decision_audit_log';
  RAISE NOTICE '  - monitoring_specs (Phase 3.2, created for schema completeness)';
  RAISE NOTICE '';
  RAISE NOTICE 'Helper functions:';
  RAISE NOTICE '  - get_latest_articulation(thesis_id, thesis_type)';
  RAISE NOTICE '  - get_active_validation_points(thesis_id, thesis_type)';
END $$;
