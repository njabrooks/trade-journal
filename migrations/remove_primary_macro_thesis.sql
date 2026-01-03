-- Migration: Remove primaryMacroThesisId from asset_theses
-- Consolidate all macro thesis links into the junction table
--
-- This migration:
-- 1. Copies any primary links to the junction table (if not already there)
-- 2. Drops the primary_macro_thesis_id column and index

-- Step 1: Insert primary links into junction table (skip if already exists)
INSERT INTO asset_thesis_related_macro_theses (asset_thesis_id, macro_thesis_id, added_at)
SELECT
  id as asset_thesis_id,
  primary_macro_thesis_id as macro_thesis_id,
  COALESCE(updated_at, created_at) as added_at
FROM asset_theses
WHERE primary_macro_thesis_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_thesis_related_macro_theses r
    WHERE r.asset_thesis_id = asset_theses.id
      AND r.macro_thesis_id = asset_theses.primary_macro_thesis_id
  );

-- Step 2: Drop the index first
DROP INDEX IF EXISTS idx_asset_theses_primary_macro_thesis;

-- Step 3: Drop the column
ALTER TABLE asset_theses DROP COLUMN IF EXISTS primary_macro_thesis_id;
