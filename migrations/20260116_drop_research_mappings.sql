-- Migration: Drop research_mappings table
-- Date: 2026-01-16
-- Reason: Deprecated - claims now link directly to theses via claim_thesis_mappings
-- The insight-level mappings are redundant since claim-to-thesis relationships
-- provide more granular and accurate provenance tracking.

DROP TABLE IF EXISTS research_mappings CASCADE;
