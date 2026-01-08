-- Rename thesis triage rules from snake_case to UPPER_SNAKE_CASE
-- Part of Trigger #1 refactoring to align with position/strategy triage patterns
--
-- Old names -> New names:
--   thesis_needs_articulation -> PRODUCE_CORE_ARGUMENT (split into NEEDS_RESEARCH + PRODUCE_CORE_ARGUMENT)
--   thesis_new_claims_available -> UPDATE_CORE_ARGUMENT
--   thesis_content_monitoring -> REVIEW_CONTENT
--   thesis_data_monitoring -> REVIEW_DATA
--
-- Status values now use position/strategy severity scale:
--   urgent, attention, monitor, info, pending, complete
--   (Old: pending, in_review, actioned, dismissed)

-- Update triage_rule values
UPDATE thesis_triage_records
SET triage_rule = 'PRODUCE_CORE_ARGUMENT'
WHERE triage_rule = 'thesis_needs_articulation';

UPDATE thesis_triage_records
SET triage_rule = 'UPDATE_CORE_ARGUMENT'
WHERE triage_rule = 'thesis_new_claims_available';

UPDATE thesis_triage_records
SET triage_rule = 'REVIEW_CONTENT'
WHERE triage_rule IN ('thesis_content_monitoring', 'thesis_monitoring_content');

UPDATE thesis_triage_records
SET triage_rule = 'REVIEW_DATA'
WHERE triage_rule IN ('thesis_data_monitoring', 'thesis_data_trigger');

-- Update status values from old to new (map actioned -> complete)
-- First, drop the existing check constraint
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_status_check;

-- Update status values
UPDATE thesis_triage_records
SET status = 'complete'
WHERE status = 'actioned';

-- Note: 'pending' and 'dismissed' remain the same
-- 'in_review' maps conceptually to 'pending' but we leave it for backwards compatibility

-- Add updated check constraint with new values (plus legacy values for transition)
ALTER TABLE thesis_triage_records
ADD CONSTRAINT thesis_triage_records_status_check
CHECK (status IN ('urgent', 'attention', 'monitor', 'info', 'pending', 'complete', 'dismissed', 'in_review', 'actioned'));

-- Note: lifecycle_stage column may need to be added if not present
-- The thesisTriage.ts code uses 'research' and 'synthesis' values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thesis_triage_records' AND column_name = 'lifecycle_stage'
  ) THEN
    ALTER TABLE thesis_triage_records ADD COLUMN lifecycle_stage TEXT;
  END IF;
END $$;

-- Add completed_by column if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thesis_triage_records' AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE thesis_triage_records ADD COLUMN completed_by TEXT;
  END IF;
END $$;

-- Add completed_at column if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thesis_triage_records' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE thesis_triage_records ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add suggested_skill column if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thesis_triage_records' AND column_name = 'suggested_skill'
  ) THEN
    ALTER TABLE thesis_triage_records ADD COLUMN suggested_skill TEXT;
  END IF;
END $$;

-- Add action_required column if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thesis_triage_records' AND column_name = 'action_required'
  ) THEN
    ALTER TABLE thesis_triage_records ADD COLUMN action_required TEXT;
  END IF;
END $$;

-- Update severity constraint to allow new status values
-- (severity field now uses the same values as status for consistency)
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_severity_check;
ALTER TABLE thesis_triage_records ADD CONSTRAINT thesis_triage_records_severity_check
  CHECK (severity IN ('urgent', 'attention', 'monitor', 'info', 'pending', 'complete', 'critical', 'high', 'medium', 'low'));
