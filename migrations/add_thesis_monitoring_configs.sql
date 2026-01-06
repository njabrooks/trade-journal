-- Migration: Add thesis_monitoring_configs table for thesis-level monitoring
-- Date: 2026-01-07
-- Spec: docs/features/thesis-synthesis-monitoring.md Section 3.1

-- Thesis-Level Monitoring Configuration
-- One config per thesis (vs. the old per-validation-point monitoring_specs)
CREATE TABLE thesis_monitoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),

  -- Identity (for asset theses)
  ticker TEXT,                          -- Auto-populated from underlying
  company_name TEXT,                    -- For news search accuracy

  -- Search configuration (JSONB)
  search_config JSONB NOT NULL DEFAULT '{
    "derivedKeywords": [],
    "additionalKeywords": [],
    "exclusions": []
  }'::jsonb,

  -- Data sources to monitor (JSONB)
  sources JSONB NOT NULL DEFAULT '{
    "fred": { "enabled": false, "series": [] },
    "priceIv": { "enabled": false },
    "news": { "enabled": false, "providers": [] },
    "secFilings": { "enabled": false, "filingTypes": [] }
  }'::jsonb,

  -- Frequency
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly')),
  last_checked TIMESTAMPTZ,
  next_check TIMESTAMPTZ,

  -- Auto-derived threshold checks from explicit validation points (JSONB array)
  explicit_thresholds JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Enable/disable toggle
  enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (thesis_id, thesis_type)
);

-- Indexes
CREATE INDEX idx_thesis_monitoring_configs_thesis
  ON thesis_monitoring_configs(thesis_id, thesis_type);
CREATE INDEX idx_thesis_monitoring_configs_ticker
  ON thesis_monitoring_configs(ticker) WHERE ticker IS NOT NULL;
CREATE INDEX idx_thesis_monitoring_configs_next_check
  ON thesis_monitoring_configs(next_check) WHERE enabled = true;
CREATE INDEX idx_thesis_monitoring_configs_enabled
  ON thesis_monitoring_configs(enabled);

-- Add comment explaining relationship to old table
COMMENT ON TABLE thesis_monitoring_configs IS
  'Thesis-level monitoring configuration. Replaces per-point monitoring_specs approach for reduced configuration burden. See docs/features/thesis-synthesis-monitoring.md Section 3.1';
