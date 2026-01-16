-- Migration: Entity Status Standardization - Signals (#ENH-048 Part 2)
-- Date: 2026-01-16
-- Purpose: Standardize signals.status to universal lifecycle values
--
-- BACKGROUND:
-- As part of #ENH-048, we're standardizing all entity status fields to use
-- the same four values: draft, active, complete, rejected
--
-- Current values: recommended, not_triggered, triggered, superseded
-- New values: draft, active, complete, rejected
--
-- Mapping:
--   recommended → draft (AI proposed, awaiting user acceptance)
--   not_triggered → active (accepted and monitoring)
--   triggered → complete (fired and acted upon)
--   superseded → rejected (no longer relevant)

-- ============================================================================
-- PART 1: Drop old check constraint
-- ============================================================================

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_status_check;

-- ============================================================================
-- PART 2: Migrate status values
-- ============================================================================

UPDATE signals
SET status = CASE
  WHEN status = 'recommended' THEN 'draft'
  WHEN status = 'not_triggered' THEN 'active'
  WHEN status = 'monitoring' THEN 'active'  -- monitoring was removed, treat as active
  WHEN status = 'triggered' THEN 'complete'
  WHEN status = 'superseded' THEN 'rejected'
  ELSE status  -- Keep any other values as-is (shouldn't exist)
END
WHERE status IN ('recommended', 'not_triggered', 'triggered', 'superseded', 'monitoring');

-- ============================================================================
-- PART 3: Add new check constraint with standardized values
-- ============================================================================

ALTER TABLE signals ADD CONSTRAINT signals_status_check
  CHECK (status IN ('draft', 'active', 'complete', 'rejected'));

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to verify)
-- ============================================================================

-- Check signals status distribution
-- SELECT status, COUNT(*) FROM signals GROUP BY status ORDER BY status;

-- Should only see: draft, active, complete, rejected
