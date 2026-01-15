-- Sync remote schema to match local (2026-01-15)
-- Run against DATABASE_URL_REMOTE

SET search_path TO public;

-- macro_theses: Add missing columns
ALTER TABLE macro_theses
ADD COLUMN IF NOT EXISTS lifecycle_status text DEFAULT 'created',
ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'developing',
ADD COLUMN IF NOT EXISTS claims_count_at_last_articulation integer DEFAULT 0;

-- asset_theses: Add missing columns
ALTER TABLE asset_theses
ADD COLUMN IF NOT EXISTS lifecycle_status text DEFAULT 'created',
ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'developing',
ADD COLUMN IF NOT EXISTS claims_count_at_last_articulation integer DEFAULT 0;

-- strategies: Add missing direction column
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS direction text;

-- triage_records: Add missing direction column
ALTER TABLE triage_records
ADD COLUMN IF NOT EXISTS direction text;

-- thesis_triage_records: Add missing columns and fix types
ALTER TABLE thesis_triage_records
  ADD COLUMN IF NOT EXISTS lifecycle_stage text,
  ADD COLUMN IF NOT EXISTS suggested_skill text,
  ADD COLUMN IF NOT EXISTS action_required text,  -- text, not boolean
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS triage_rule text;

-- thesis_triage_records: Update check constraints to match local
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_severity_check;
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_status_check;
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_trigger_type_check;

ALTER TABLE thesis_triage_records ADD CONSTRAINT thesis_triage_records_severity_check
  CHECK (severity = ANY (ARRAY['urgent', 'attention', 'monitor', 'info', 'pending', 'complete', 'critical', 'high', 'medium', 'low']));

ALTER TABLE thesis_triage_records ADD CONSTRAINT thesis_triage_records_status_check
  CHECK (status = ANY (ARRAY['urgent', 'attention', 'monitor', 'info', 'pending', 'complete', 'dismissed', 'in_review', 'actioned']));

ALTER TABLE thesis_triage_records ADD CONSTRAINT thesis_triage_records_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY['scheduled_monitoring', 'filing_alert', 'data_release', 'manual', 'lifecycle_transition', 'signal_recommendation']));
