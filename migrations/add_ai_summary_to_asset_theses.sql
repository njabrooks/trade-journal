-- Add AI summary fields to asset_theses table
-- Migration: add_ai_summary_to_asset_theses
-- Date: 2026-01-02
-- Phase: 2.8 - AI-Generated Thesis Summaries

-- Add columns for AI-generated summaries with provenance tracking
ALTER TABLE asset_theses
  ADD COLUMN ai_summary TEXT,
  ADD COLUMN ai_summary_detail_level TEXT CHECK (ai_summary_detail_level IN ('paragraph', 'deep_dive')),
  ADD COLUMN ai_summary_generated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN ai_summary_claim_ids TEXT[] DEFAULT '{}',
  ADD COLUMN ai_summary_claim_count INTEGER DEFAULT 0;

-- Create index for staleness detection queries
CREATE INDEX idx_asset_theses_summary_generated ON asset_theses(ai_summary_generated_at);

-- Add column comments for documentation
COMMENT ON COLUMN asset_theses.ai_summary IS 'AI-generated summary synthesized from linked claims (Toulmin framework)';
COMMENT ON COLUMN asset_theses.ai_summary_detail_level IS 'Summary detail level: paragraph (2-3 paragraphs) or deep_dive (full Toulmin analysis)';
COMMENT ON COLUMN asset_theses.ai_summary_claim_ids IS 'Array of main_claim IDs that contributed to this summary (provenance tracking)';
COMMENT ON COLUMN asset_theses.ai_summary_claim_count IS 'Number of claims when summary was generated (for staleness detection)';
COMMENT ON COLUMN asset_theses.ai_summary_generated_at IS 'Timestamp when summary was generated (for staleness detection)';
