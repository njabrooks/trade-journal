-- Migration: Rename lifecycle_status to workflow_status with updated values
-- Purpose: Separate "evolution state" (computed) from "workflow status" (user intent)
-- Date: 2026-01-07

-- ============================================================================
-- MACRO THESES
-- ============================================================================

-- 1. Add new workflow_status column
ALTER TABLE macro_theses
ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'developing';

-- 2. Migrate existing lifecycle_status values to new workflow_status values
UPDATE macro_theses SET workflow_status = CASE
  WHEN lifecycle_status = 'created' THEN 'developing'
  WHEN lifecycle_status = 'claims_linked' THEN 'developing'
  WHEN lifecycle_status = 'synthesized' THEN 'developing'
  WHEN lifecycle_status = 'validated' THEN 'developing'  -- Has V&I points, but not yet monitoring
  WHEN lifecycle_status = 'monitoring' THEN 'monitoring'
  WHEN lifecycle_status = 'closed' THEN 'validated'  -- Assume validated; user can change
  ELSE 'developing'
END;

-- 3. Add constraint for allowed values
ALTER TABLE macro_theses
ADD CONSTRAINT macro_theses_workflow_status_check
CHECK (workflow_status IN ('developing', 'monitoring', 'paused', 'validated', 'invalidated', 'abandoned'));

-- 4. Add claims_count_at_last_articulation for tracking rule #2
ALTER TABLE macro_theses
ADD COLUMN IF NOT EXISTS claims_count_at_last_articulation INTEGER DEFAULT 0;

-- 5. Drop old lifecycle_status column (keep index name same, just point to new column)
DROP INDEX IF EXISTS idx_macro_theses_lifecycle;
CREATE INDEX idx_macro_theses_workflow ON macro_theses(workflow_status);

-- Note: We keep lifecycle_status temporarily for safety, drop in future migration
-- ALTER TABLE macro_theses DROP COLUMN lifecycle_status;

-- ============================================================================
-- ASSET THESES
-- ============================================================================

-- 1. Add new workflow_status column
ALTER TABLE asset_theses
ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'developing';

-- 2. Migrate existing lifecycle_status values to new workflow_status values
UPDATE asset_theses SET workflow_status = CASE
  WHEN lifecycle_status = 'created' THEN 'developing'
  WHEN lifecycle_status = 'claims_linked' THEN 'developing'
  WHEN lifecycle_status = 'synthesized' THEN 'developing'
  WHEN lifecycle_status = 'validated' THEN 'developing'  -- Has V&I points, but not yet monitoring
  WHEN lifecycle_status = 'monitoring' THEN 'monitoring'
  WHEN lifecycle_status = 'closed' THEN 'validated'  -- Assume validated; user can change
  ELSE 'developing'
END;

-- 3. Add constraint for allowed values
ALTER TABLE asset_theses
ADD CONSTRAINT asset_theses_workflow_status_check
CHECK (workflow_status IN ('developing', 'monitoring', 'paused', 'validated', 'invalidated', 'abandoned'));

-- 4. Add claims_count_at_last_articulation for tracking rule #2
ALTER TABLE asset_theses
ADD COLUMN IF NOT EXISTS claims_count_at_last_articulation INTEGER DEFAULT 0;

-- 5. Drop old lifecycle_status index and create new one
DROP INDEX IF EXISTS idx_asset_theses_lifecycle;
CREATE INDEX idx_asset_theses_workflow ON asset_theses(workflow_status);

-- Note: We keep lifecycle_status temporarily for safety, drop in future migration
-- ALTER TABLE asset_theses DROP COLUMN lifecycle_status;

-- ============================================================================
-- UPDATE thesis_triage_records to add new triage types
-- ============================================================================

-- Add column for triage rule type (to distinguish lifecycle triage from monitoring triage)
ALTER TABLE thesis_triage_records
ADD COLUMN IF NOT EXISTS triage_rule TEXT;

-- Update existing records to have triage_rule based on trigger_type
UPDATE thesis_triage_records
SET triage_rule = CASE
  WHEN trigger_type = 'scheduled_monitoring' THEN 'thesis_monitoring_content'
  WHEN trigger_type = 'filing_alert' THEN 'thesis_data_trigger'
  WHEN trigger_type = 'data_release' THEN 'thesis_data_trigger'
  WHEN trigger_type = 'manual' THEN 'thesis_manual_assessment'
  ELSE 'thesis_monitoring_content'
END
WHERE triage_rule IS NULL;

-- Comment on new triage_rule values:
-- 'thesis_needs_articulation' - Rule #1: Thesis exists, no articulation
-- 'thesis_new_claims_available' - Rule #2: ≥3 claims since last articulation
-- 'thesis_monitoring_content' - Rule #4: Monitoring run found content
-- 'thesis_data_trigger' - Rule #5: Explicit data threshold breached
-- 'thesis_manual_assessment' - Rule #6: User-discovered content (journal only, no triage)
