-- Migration: Rename asset_views to asset_theses
-- Date: 2025-12-29
-- Enhancement: #ENH-005
-- Phase: 2.6.7
--
-- This migration renames the asset_views table and all related columns
-- to asset_theses to align with "Asset Thesis" terminology.

BEGIN;

-- Step 1: Rename the main table
ALTER TABLE asset_views RENAME TO asset_theses;

-- Step 2: Rename indexes on the asset_theses table
ALTER INDEX idx_asset_views_macro_thesis RENAME TO idx_asset_theses_macro_thesis;
ALTER INDEX idx_asset_views_underlying RENAME TO idx_asset_theses_underlying;
ALTER INDEX idx_asset_views_status RENAME TO idx_asset_theses_status;
ALTER INDEX idx_asset_views_next_review RENAME TO idx_asset_theses_next_review;
ALTER INDEX idx_asset_views_direction RENAME TO idx_asset_theses_direction;
ALTER INDEX idx_asset_views_position_dates RENAME TO idx_asset_theses_position_dates;

-- Step 3: Rename foreign key columns in referencing tables

-- 3a. claim_thesis_mappings.asset_view_id -> asset_thesis_id
ALTER TABLE claim_thesis_mappings RENAME COLUMN asset_view_id TO asset_thesis_id;
ALTER INDEX idx_claim_thesis_view RENAME TO idx_claim_thesis;

-- 3b. strategies.asset_view_id -> asset_thesis_id
ALTER TABLE strategies RENAME COLUMN asset_view_id TO asset_thesis_id;
ALTER INDEX idx_strategies_asset_view RENAME TO idx_strategies_asset_thesis;

-- 3c. research_mappings.asset_view_id -> asset_thesis_id
ALTER TABLE research_mappings RENAME COLUMN asset_view_id TO asset_thesis_id;
ALTER INDEX idx_research_mappings_asset_view RENAME TO idx_research_mappings_asset_thesis;

-- 3d. research_hierarchy_recommendations.existing_view_id -> existing_asset_thesis_id
ALTER TABLE research_hierarchy_recommendations RENAME COLUMN existing_view_id TO existing_asset_thesis_id;

-- Step 4: Update any check constraints or enum values if they reference the old name
-- (Checking if hierarchy_level in research_mappings needs updating)
-- Note: The values 'asset_view' in the hierarchy_level column should be updated to 'asset_thesis'

UPDATE research_mappings
SET hierarchy_level = 'asset_thesis'
WHERE hierarchy_level = 'asset_view';

COMMIT;

-- Verification queries (run these after migration to confirm success):
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'asset_theses';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'main_claims' AND column_name = 'asset_thesis_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'strategies' AND column_name = 'asset_thesis_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'research_mappings' AND column_name = 'asset_thesis_id';
-- SELECT DISTINCT hierarchy_level FROM research_mappings;
