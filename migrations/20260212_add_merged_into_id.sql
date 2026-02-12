-- Migration: Add merged_into_id to strategies table
-- Purpose: Track which strategy a merged strategy was absorbed into,
--          enabling cross-account merge target resolution during auto-linking.
-- Date: 2026-02-12

ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_strategies_merged_into ON strategies(merged_into_id);

COMMENT ON COLUMN strategies.merged_into_id IS 'For merged strategies, references the target strategy they were merged into. Enables cross-account merge resolution.';
