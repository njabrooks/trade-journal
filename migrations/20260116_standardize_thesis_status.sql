-- Migration: Standardize thesis status values
-- Part of #ENH-048: Entity Status Standardization
--
-- Changes:
-- 1. Remap macro_theses.status and asset_theses.status to standardized values
-- 2. Drop workflowStatus and lifecycleStatus fields (triage system handles workflow)
--
-- Mapping:
--   draft → draft (no change)
--   active → active (no change)
--   under_review → active (still active, just flagged for review - triage handles this)
--   retired → complete (thesis played out)
--   superseded → rejected (replaced by better thesis)
--   invalidated → rejected (proven wrong)
--   inactive → complete (no longer actively monitored)

-- ============================================================================
-- STEP 1: Update macro_theses.status values
-- ============================================================================

-- Map 'under_review' → 'active'
UPDATE macro_theses
SET status = 'active', updated_at = NOW()
WHERE status = 'under_review';

-- Map 'retired' → 'complete'
UPDATE macro_theses
SET status = 'complete', updated_at = NOW()
WHERE status = 'retired';

-- Map 'superseded' → 'rejected'
UPDATE macro_theses
SET status = 'rejected', updated_at = NOW()
WHERE status = 'superseded';

-- Map 'invalidated' → 'rejected'
UPDATE macro_theses
SET status = 'rejected', updated_at = NOW()
WHERE status = 'invalidated';

-- Map 'inactive' → 'complete'
UPDATE macro_theses
SET status = 'complete', updated_at = NOW()
WHERE status = 'inactive';

-- ============================================================================
-- STEP 2: Update asset_theses.status values
-- ============================================================================

-- Map 'under_review' → 'active'
UPDATE asset_theses
SET status = 'active', updated_at = NOW()
WHERE status = 'under_review';

-- Map 'retired' → 'complete'
UPDATE asset_theses
SET status = 'complete', updated_at = NOW()
WHERE status = 'retired';

-- Map 'superseded' → 'rejected'
UPDATE asset_theses
SET status = 'rejected', updated_at = NOW()
WHERE status = 'superseded';

-- Map 'invalidated' → 'rejected'
UPDATE asset_theses
SET status = 'rejected', updated_at = NOW()
WHERE status = 'invalidated';

-- Map 'inactive' → 'complete'
UPDATE asset_theses
SET status = 'complete', updated_at = NOW()
WHERE status = 'inactive';

-- ============================================================================
-- STEP 3: Drop workflowStatus and lifecycleStatus columns
-- ============================================================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_macro_theses_workflow;
DROP INDEX IF EXISTS idx_asset_theses_workflow;

-- Drop columns from macro_theses
ALTER TABLE macro_theses DROP COLUMN IF EXISTS workflow_status;
ALTER TABLE macro_theses DROP COLUMN IF EXISTS lifecycle_status;

-- Drop columns from asset_theses
ALTER TABLE asset_theses DROP COLUMN IF EXISTS workflow_status;
ALTER TABLE asset_theses DROP COLUMN IF EXISTS lifecycle_status;

-- ============================================================================
-- STEP 4: Verification queries (run after migration)
-- ============================================================================

-- Verify only standard status values exist in macro_theses
-- SELECT DISTINCT status FROM macro_theses;
-- Expected: draft, active, complete, rejected

-- Verify only standard status values exist in asset_theses
-- SELECT DISTINCT status FROM asset_theses;
-- Expected: draft, active, complete, rejected

-- Verify columns were dropped
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'macro_theses' AND column_name IN ('workflow_status', 'lifecycle_status');
-- Expected: empty result
