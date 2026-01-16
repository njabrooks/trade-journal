-- Migration: Standardize strategies status to universal lifecycle values
-- Part of #ENH-048 Entity Status Standardization
-- New standard values: draft, active, complete, rejected

-- Remap existing values:
-- open → active (has open positions)
-- closed → complete (all positions closed)
-- merged → complete (merged into another)
-- draft → draft (planning stage) - no change needed
-- planned → draft (also planning stage)

-- Step 1: Remap status values
UPDATE strategies SET status = 'active' WHERE status = 'open';
UPDATE strategies SET status = 'complete' WHERE status = 'closed';
UPDATE strategies SET status = 'complete' WHERE status = 'merged';
UPDATE strategies SET status = 'draft' WHERE status = 'planned';

-- Verify the migration
SELECT status, COUNT(*) FROM strategies GROUP BY status ORDER BY status;
