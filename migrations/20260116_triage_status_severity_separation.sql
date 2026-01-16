-- Migration: Triage Status/Severity Separation (#ENH-047)
-- Date: 2026-01-16
-- Purpose: Separate workflow status from severity level in triage records
--
-- BACKGROUND:
-- The triage_records.severity field was conflating two concepts:
--   - Severity levels: info, monitor, attention, urgent (importance)
--   - Workflow states: pending, complete (progress)
--
-- This migration adds a proper `status` column for workflow state and
-- cleans up the severity column to only contain severity values.
--
-- New standardized values:
--   status: 'inbox' | 'in_progress' | 'done'
--   severity: 'urgent' | 'attention' | 'monitor' | 'info'

-- ============================================================================
-- PART 1: triage_records table
-- ============================================================================

-- Step 1: Add status column (if not exists)
ALTER TABLE triage_records
ADD COLUMN IF NOT EXISTS status text DEFAULT 'inbox';

-- Step 2: Migrate existing data
-- Map old severity workflow values to new status values
UPDATE triage_records
SET status = CASE
  WHEN severity = 'pending' THEN 'in_progress'
  WHEN severity = 'complete' THEN 'done'
  ELSE 'inbox'  -- Default: records with actual severity values are inbox items
END
WHERE status IS NULL OR status = 'inbox';

-- Step 3: Clean up severity column - remove workflow values
UPDATE triage_records
SET severity = CASE
  WHEN severity = 'pending' THEN 'attention'  -- Was pending action, treat as needs attention
  WHEN severity = 'complete' THEN NULL  -- Completed items don't need severity
  ELSE severity  -- Keep actual severity values
END
WHERE severity IN ('pending', 'complete');

-- Step 4: Add indexes for new status field
CREATE INDEX IF NOT EXISTS idx_triage_status ON triage_records (status);
CREATE INDEX IF NOT EXISTS idx_triage_severity ON triage_records (severity);

-- ============================================================================
-- PART 2: thesis_triage_records table
-- ============================================================================

-- Step 0: Drop old check constraints that block new values
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_status_check;
ALTER TABLE thesis_triage_records DROP CONSTRAINT IF EXISTS thesis_triage_records_severity_check;

-- Step 1: Migrate status values to new pattern
-- Current status values are: 'attention', 'complete', 'dismissed', 'info'
-- These are a mix of severity values used as status + workflow values
UPDATE thesis_triage_records
SET status = CASE
  -- Workflow completion states
  WHEN status = 'complete' THEN 'done'
  WHEN status = 'dismissed' THEN 'done'
  WHEN status = 'actioned' THEN 'done'
  -- Legacy states from older schema
  WHEN status = 'pending' THEN 'inbox'
  WHEN status = 'in_review' THEN 'in_progress'
  -- Severity values used as status (convert to inbox for active items)
  WHEN status = 'attention' THEN 'inbox'
  WHEN status = 'info' THEN 'inbox'
  WHEN status = 'monitor' THEN 'inbox'
  WHEN status = 'urgent' THEN 'inbox'
  ELSE 'inbox'  -- Default to inbox for any unknown values
END
WHERE status NOT IN ('inbox', 'in_progress', 'done');

-- Step 2: Migrate severity values to standardized set
UPDATE thesis_triage_records
SET severity = CASE
  WHEN severity = 'critical' THEN 'urgent'
  WHEN severity = 'high' THEN 'attention'
  WHEN severity = 'medium' THEN 'monitor'
  WHEN severity = 'low' THEN 'info'
  ELSE severity  -- Keep 'info' as-is
END
WHERE severity IN ('critical', 'high', 'medium', 'low');

-- Step 3: Add new check constraints with standardized values
ALTER TABLE thesis_triage_records ADD CONSTRAINT thesis_triage_records_status_check
  CHECK (status IN ('inbox', 'in_progress', 'done'));
ALTER TABLE thesis_triage_records ADD CONSTRAINT thesis_triage_records_severity_check
  CHECK (severity IN ('urgent', 'attention', 'monitor', 'info'));

-- Step 4: Make urgency column nullable (deprecated)
-- Note: We're keeping the column for now but it will be ignored
-- ALTER TABLE thesis_triage_records ALTER COLUMN urgency DROP NOT NULL;
-- (Already nullable in new schema definition)

-- ============================================================================
-- PART 3: blotter_actions table
-- ============================================================================

-- Migrate workflow status values in severity_override column
-- Note: This column stores both severity overrides ('info', 'monitor') and workflow status
-- Only convert the workflow status values, keep severity override values as-is
UPDATE blotter_actions
SET severity_override = CASE
  WHEN severity_override = 'pending' THEN 'in_progress'
  WHEN severity_override = 'complete' THEN 'done'
  ELSE severity_override  -- Keep 'info', 'monitor' as severity overrides
END
WHERE severity_override IN ('pending', 'complete');

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to verify)
-- ============================================================================

-- Check triage_records status distribution
-- SELECT status, COUNT(*) FROM triage_records GROUP BY status;

-- Check triage_records severity distribution (should not have pending/complete)
-- SELECT severity, COUNT(*) FROM triage_records GROUP BY severity;

-- Check thesis_triage_records status distribution
-- SELECT status, COUNT(*) FROM thesis_triage_records GROUP BY status;

-- Check thesis_triage_records severity distribution
-- SELECT severity, COUNT(*) FROM thesis_triage_records GROUP BY severity;

-- Check blotter_actions severity_override distribution
-- SELECT severity_override, COUNT(*) FROM blotter_actions WHERE severity_override IS NOT NULL GROUP BY severity_override;
