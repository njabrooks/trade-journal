-- Migration: Entity Status Standardization - Claims (#ENH-048 Part 1)
-- Date: 2026-01-16
-- Purpose: Standardize main_claims.status to universal lifecycle values
--
-- BACKGROUND:
-- As part of #ENH-048, we're standardizing all entity status fields to use
-- the same four values: draft, active, complete, rejected
--
-- Current values: unconfirmed, confirmed, rejected, invalidated, merged
-- New values: draft, active, complete, rejected
--
-- Mapping:
--   unconfirmed → draft (created, awaiting review)
--   confirmed → active (validated as credible)
--   rejected → rejected (explicitly declined)
--   invalidated → rejected (same as rejected)
--   merged → complete (absorbed into thesis - rare, may not exist)

-- ============================================================================
-- PART 1: Drop old check constraint
-- ============================================================================

ALTER TABLE main_claims DROP CONSTRAINT IF EXISTS main_claims_status_check;

-- ============================================================================
-- PART 2: Migrate status values
-- ============================================================================

-- Map old values to new values
UPDATE main_claims
SET status = CASE
  WHEN status = 'unconfirmed' THEN 'draft'
  WHEN status = 'confirmed' THEN 'active'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status = 'invalidated' THEN 'rejected'
  WHEN status = 'merged' THEN 'complete'
  ELSE status  -- Keep any other values as-is (shouldn't exist)
END
WHERE status IN ('unconfirmed', 'confirmed', 'rejected', 'invalidated', 'merged');

-- ============================================================================
-- PART 3: Add new check constraint with standardized values
-- ============================================================================

ALTER TABLE main_claims ADD CONSTRAINT main_claims_status_check
  CHECK (status IN ('draft', 'active', 'complete', 'rejected'));

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to verify)
-- ============================================================================

-- Check main_claims status distribution
-- SELECT status, COUNT(*) FROM main_claims GROUP BY status ORDER BY status;

-- Should only see: draft, active, complete, rejected
