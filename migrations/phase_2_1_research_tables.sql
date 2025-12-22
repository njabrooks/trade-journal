-- Phase 2.1: Research & Intelligence Layer - Database Schema
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Table: research_artifacts
-- Primary storage for raw research content
-- ============================================================================

CREATE TABLE research_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source metadata
  source_type text NOT NULL,
  source_url text,
  title text NOT NULL,
  author text,
  published_date date,

  -- Content
  raw_content text NOT NULL,
  content_format text DEFAULT 'text',

  -- File storage (for future uploads)
  file_storage_path text,
  file_name text,
  file_size_bytes bigint,

  -- Processing status
  status text NOT NULL DEFAULT 'raw',
  processing_error text,

  -- Metadata
  metadata jsonb,
  tags text[],

  -- Tracking
  ingested_at timestamptz NOT NULL DEFAULT now(),
  ingested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_research_source_type CHECK (source_type IN ('article', 'transcript', 'note', 'report', 'video', 'manual')),
  CONSTRAINT check_research_status CHECK (status IN ('raw', 'processing', 'structured', 'error'))
);

CREATE INDEX idx_research_artifacts_source_type ON research_artifacts(source_type);
CREATE INDEX idx_research_artifacts_status ON research_artifacts(status);
CREATE INDEX idx_research_artifacts_ingested_at ON research_artifacts(ingested_at);
CREATE INDEX idx_research_artifacts_published_date ON research_artifacts(published_date);
CREATE INDEX idx_research_artifacts_tags ON research_artifacts USING GIN (tags);

COMMENT ON TABLE research_artifacts IS 'Raw research content from various sources';
COMMENT ON COLUMN research_artifacts.source_type IS 'Type of research source';
COMMENT ON COLUMN research_artifacts.status IS 'Processing pipeline status';
COMMENT ON COLUMN research_artifacts.tags IS 'User-defined tags for filtering';

-- ============================================================================
-- Table: research_insights
-- Structured knowledge extracted from research artifacts (typically via AI)
-- ============================================================================

CREATE TABLE research_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,

  -- AI-generated structured content
  summary text NOT NULL,
  key_themes text[],
  key_claims jsonb,
  supporting_evidence jsonb,
  counter_evidence jsonb,

  -- Extracted metadata
  time_horizon text,
  confidence_level text,
  relevant_tickers text[],

  -- Processing metadata
  structured_at timestamptz NOT NULL DEFAULT now(),
  structured_by text NOT NULL,
  ai_model text,
  ai_processing_cost_usd numeric(10, 6),

  -- Human review
  human_reviewed boolean DEFAULT false,
  human_review_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_insight_time_horizon CHECK (time_horizon IN ('long_term', 'medium_term', 'short_term', 'unknown')),
  CONSTRAINT check_insight_confidence CHECK (confidence_level IN ('high', 'medium', 'low', 'exploratory')),
  CONSTRAINT check_insight_structured_by CHECK (structured_by IN ('ai', 'manual', 'hybrid'))
);

CREATE INDEX idx_research_insights_artifact ON research_insights(research_artifact_id);
CREATE INDEX idx_research_insights_time_horizon ON research_insights(time_horizon);
CREATE INDEX idx_research_insights_structured_by ON research_insights(structured_by);
CREATE INDEX idx_research_insights_tickers ON research_insights USING GIN (relevant_tickers);

COMMENT ON TABLE research_insights IS 'Structured knowledge extracted from research artifacts';
COMMENT ON COLUMN research_insights.key_claims IS 'JSONB array of structured claims with evidence';
COMMENT ON COLUMN research_insights.structured_by IS 'Whether structured by AI, manual, or hybrid';
COMMENT ON COLUMN research_insights.ai_processing_cost_usd IS 'Track AI processing costs';

-- ============================================================================
-- Table: research_mappings
-- Links research insights to hierarchy (theses, views, strategies, positions)
-- ============================================================================

CREATE TABLE research_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_insight_id uuid NOT NULL REFERENCES research_insights(id) ON DELETE CASCADE,

  -- Hierarchy target (exactly one must be set)
  hierarchy_level text NOT NULL,
  macro_thesis_id uuid REFERENCES macro_theses(id) ON DELETE CASCADE,
  asset_view_id uuid REFERENCES asset_views(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES strategies(id) ON DELETE CASCADE,
  position_id uuid REFERENCES positions(id) ON DELETE CASCADE,

  -- Evidence relationship
  mapping_type text NOT NULL,
  confidence text,

  -- Context
  mapped_at timestamptz NOT NULL DEFAULT now(),
  mapped_by text NOT NULL,
  notes text,

  -- AI suggestion tracking
  suggested_by_ai boolean DEFAULT false,
  ai_suggestion_score numeric(3, 2),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_mapping_hierarchy_level CHECK (hierarchy_level IN ('macro_thesis', 'asset_view', 'strategy', 'position')),
  CONSTRAINT check_mapping_type CHECK (mapping_type IN ('supports', 'refutes', 'neutral', 'exploratory')),
  CONSTRAINT check_mapping_confidence CHECK (confidence IN ('high', 'medium', 'low')),
  CONSTRAINT check_mapping_one_target CHECK (
    (CASE WHEN macro_thesis_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN asset_view_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN strategy_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN position_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX idx_research_mappings_insight ON research_mappings(research_insight_id);
CREATE INDEX idx_research_mappings_macro_thesis ON research_mappings(macro_thesis_id);
CREATE INDEX idx_research_mappings_asset_view ON research_mappings(asset_view_id);
CREATE INDEX idx_research_mappings_strategy ON research_mappings(strategy_id);
CREATE INDEX idx_research_mappings_position ON research_mappings(position_id);
CREATE INDEX idx_research_mappings_type ON research_mappings(mapping_type);
CREATE INDEX idx_research_mappings_hierarchy_level ON research_mappings(hierarchy_level);

COMMENT ON TABLE research_mappings IS 'Links research insights to hierarchy elements as evidence';
COMMENT ON COLUMN research_mappings.mapping_type IS 'Whether research supports, refutes, or is neutral/exploratory';
COMMENT ON COLUMN research_mappings.ai_suggestion_score IS 'AI confidence score 0.00-1.00 for suggested mappings';
COMMENT ON CONSTRAINT check_mapping_one_target ON research_mappings IS 'Ensures exactly one hierarchy target is set';

-- ============================================================================
-- Table: research_processing_runs
-- Track AI processing jobs for cost and error monitoring
-- ============================================================================

CREATE TABLE research_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,

  -- Processing metadata
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',

  -- Timing
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- Results
  result jsonb,
  error_message text,

  -- Cost tracking
  ai_model text,
  tokens_used integer,
  processing_cost_usd numeric(10, 6),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_processing_job_type CHECK (job_type IN ('summarize', 'extract_claims', 'suggest_mappings', 'full_process')),
  CONSTRAINT check_processing_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX idx_research_processing_artifact ON research_processing_runs(research_artifact_id);
CREATE INDEX idx_research_processing_status ON research_processing_runs(status);
CREATE INDEX idx_research_processing_started_at ON research_processing_runs(started_at);

COMMENT ON TABLE research_processing_runs IS 'Track AI processing jobs similar to ingestion_runs pattern';
COMMENT ON COLUMN research_processing_runs.job_type IS 'Type of AI processing job';
COMMENT ON COLUMN research_processing_runs.tokens_used IS 'Total tokens consumed by AI';
COMMENT ON COLUMN research_processing_runs.processing_cost_usd IS 'Estimated USD cost for this job';

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Phase 2.1 research tables created successfully!';
  RAISE NOTICE 'Tables created: research_artifacts, research_insights, research_mappings, research_processing_runs';
  RAISE NOTICE 'Next step: Update Drizzle schema in /src/db/schema.ts';
END $$;
