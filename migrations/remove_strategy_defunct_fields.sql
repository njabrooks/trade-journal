-- Migration: Remove defunct strategy fields
-- These fields are replaced by inheritance from asset_theses
-- Date: 2026-01-08

-- Drop thesis context fields (now comes from asset_thesis.narrative)
ALTER TABLE strategies DROP COLUMN IF EXISTS thesis;

-- Drop rule fields (now derived from asset_thesis direction/targetPrice/timeHorizon)
ALTER TABLE strategies DROP COLUMN IF EXISTS profit_rules;
ALTER TABLE strategies DROP COLUMN IF EXISTS defense_rules;
ALTER TABLE strategies DROP COLUMN IF EXISTS time_rules;
ALTER TABLE strategies DROP COLUMN IF EXISTS exit_criteria;

-- Drop entry context (redundant with thesis context)
ALTER TABLE strategies DROP COLUMN IF EXISTS entry_context;
