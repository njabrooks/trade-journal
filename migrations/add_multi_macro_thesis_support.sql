-- Migration: Add Multi Macro Thesis Support
-- Date: 2025-01-01
-- Sprint 1: Schema & Backend
--
-- Changes:
-- 1. Rename asset_theses.macro_thesis_id to primary_macro_thesis_id
-- 2. Create junction table for related macro theses
-- 3. Remove strategies.macro_thesis_id (strategies inherit via asset thesis)
--
-- Rationale:
-- - Asset theses can have 1 primary + N related macro theses
-- - Primary thesis is required (FK constraint)
-- - Related theses are optional (junction table)
-- - Strategies no longer need direct macro thesis link

-- =============================================================================
-- STEP 1: Rename asset_theses.macro_thesis_id to primary_macro_thesis_id
-- =============================================================================

ALTER TABLE asset_theses 
  RENAME COLUMN macro_thesis_id TO primary_macro_thesis_id;

-- Update index name for clarity
DROP INDEX IF EXISTS idx_asset_theses_macro_thesis;
CREATE INDEX idx_asset_theses_primary_macro_thesis ON asset_theses(primary_macro_thesis_id);

-- =============================================================================
-- STEP 2: Create junction table for related macro theses
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_thesis_related_macro_theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_thesis_id uuid NOT NULL REFERENCES asset_theses(id) ON DELETE CASCADE,
  macro_thesis_id uuid NOT NULL REFERENCES macro_theses(id) ON DELETE CASCADE,
  
  -- Optional metadata
  relationship_note text, -- e.g. "provides sector context", "supports timing"
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text, -- Future: user tracking
  
  -- Constraints
  UNIQUE(asset_thesis_id, macro_thesis_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_at_related_mt_asset ON asset_thesis_related_macro_theses(asset_thesis_id);
CREATE INDEX idx_at_related_mt_macro ON asset_thesis_related_macro_theses(macro_thesis_id);

-- Add comment
COMMENT ON TABLE asset_thesis_related_macro_theses IS 
  'Junction table for related (non-primary) macro theses linked to asset theses';

-- =============================================================================
-- STEP 3: Migrate existing strategy.macro_thesis_id to related theses (if different)
-- =============================================================================

-- This handles cases where strategy had a different macro thesis than its asset thesis
-- Those divergent links are preserved as "related" macro theses
INSERT INTO asset_thesis_related_macro_theses (asset_thesis_id, macro_thesis_id, relationship_note)
SELECT DISTINCT 
  s.asset_thesis_id, 
  s.macro_thesis_id,
  'Migrated from strategy link'
FROM strategies s
JOIN asset_theses at ON at.id = s.asset_thesis_id
WHERE s.macro_thesis_id IS NOT NULL
  AND s.asset_thesis_id IS NOT NULL
  AND s.macro_thesis_id != at.primary_macro_thesis_id
  -- Avoid duplicates if already exists
  AND NOT EXISTS (
    SELECT 1 FROM asset_thesis_related_macro_theses rt
    WHERE rt.asset_thesis_id = s.asset_thesis_id
      AND rt.macro_thesis_id = s.macro_thesis_id
  );

-- =============================================================================
-- STEP 4: Remove strategies.macro_thesis_id (strategies inherit via asset thesis)
-- =============================================================================

-- Drop index first
DROP INDEX IF EXISTS idx_strategies_macro_thesis;

-- Drop column
ALTER TABLE strategies DROP COLUMN IF EXISTS macro_thesis_id;

-- =============================================================================
-- VERIFICATION QUERIES (Run these manually to verify migration)
-- =============================================================================

-- Count asset theses with related macro theses
-- SELECT COUNT(*) as asset_theses_with_related 
-- FROM (
--   SELECT DISTINCT asset_thesis_id 
--   FROM asset_thesis_related_macro_theses
-- ) sub;

-- Show asset theses with multiple macro theses
-- SELECT 
--   at.id,
--   at.title,
--   mt_primary.title as primary_thesis,
--   COUNT(rt.macro_thesis_id) as related_count
-- FROM asset_theses at
-- LEFT JOIN macro_theses mt_primary ON mt_primary.id = at.primary_macro_thesis_id
-- LEFT JOIN asset_thesis_related_macro_theses rt ON rt.asset_thesis_id = at.id
-- GROUP BY at.id, at.title, mt_primary.title
-- HAVING COUNT(rt.macro_thesis_id) > 0
-- ORDER BY related_count DESC;

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================

-- To rollback this migration:
-- 
-- 1. Restore strategies.macro_thesis_id
-- ALTER TABLE strategies ADD COLUMN macro_thesis_id uuid REFERENCES macro_theses(id) ON DELETE SET NULL;
-- CREATE INDEX idx_strategies_macro_thesis ON strategies(macro_thesis_id);
-- 
-- UPDATE strategies s
-- SET macro_thesis_id = at.primary_macro_thesis_id
-- FROM asset_theses at
-- WHERE s.asset_thesis_id = at.id;
-- 
-- 2. Rename back
-- DROP INDEX idx_asset_theses_primary_macro_thesis;
-- ALTER TABLE asset_theses RENAME COLUMN primary_macro_thesis_id TO macro_thesis_id;
-- CREATE INDEX idx_asset_theses_macro_thesis ON asset_theses(macro_thesis_id);
-- 
-- 3. Drop junction table
-- DROP TABLE asset_thesis_related_macro_theses;

