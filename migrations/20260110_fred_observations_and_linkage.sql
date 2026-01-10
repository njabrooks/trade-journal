-- FRED Historical Data Storage and Thesis Linkage
-- Migration: 20260110_fred_observations_and_linkage.sql
--
-- This migration adds:
-- 1. fred_series_metadata - Reference table for FRED series information
-- 2. fred_observations - Historical time-series data from FRED API
-- 3. thesis_fred_indicators - Links theses to relevant FRED indicators with threshold config
--
-- Part of the FRED Data Ingestion Pipeline feature
-- See: docs/reference/fred-indicators-by-thesis.md

-- ============================================================================
-- 1. FRED Series Metadata (Reference Table)
-- ============================================================================
-- Stores metadata about FRED series for display and validation
-- Auto-populated during first fetch, updated periodically

CREATE TABLE IF NOT EXISTS fred_series_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id TEXT NOT NULL UNIQUE,           -- FRED series ID (e.g., 'DGS10', 'UNRATE')
    title TEXT NOT NULL,                       -- Full series title from FRED
    frequency TEXT,                            -- 'daily' | 'weekly' | 'monthly' | 'quarterly'
    units TEXT,                                -- 'percent', 'billions_of_dollars', etc.
    seasonal_adjustment TEXT,                  -- 'sa' | 'nsa' | 'saar'
    last_updated TIMESTAMPTZ,                  -- Last update from FRED
    observation_start DATE,                    -- Earliest available observation
    observation_end DATE,                      -- Latest available observation
    notes TEXT,                                -- FRED series notes/description

    -- Category for grouping in UI
    category TEXT,                             -- 'interest_rates' | 'inflation' | 'labor' | 'output' | 'credit' | 'money' | 'currency' | 'housing' | 'fiscal' | 'sentiment'

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for category-based queries
CREATE INDEX IF NOT EXISTS idx_fred_series_category ON fred_series_metadata(category);

-- ============================================================================
-- 2. FRED Observations (Historical Data)
-- ============================================================================
-- Stores historical observations from FRED API
-- Unique on (series_id, observation_date) to prevent duplicates

CREATE TABLE IF NOT EXISTS fred_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id TEXT NOT NULL,                   -- FRED series ID (e.g., 'DGS10')
    observation_date DATE NOT NULL,            -- Date of observation
    value NUMERIC,                             -- Observation value (NULL for missing data marked as '.')

    -- Computed fields for threshold logic
    value_1d_change NUMERIC,                   -- 1-day change (value - previous value)
    value_1d_pct_change NUMERIC,               -- 1-day percent change
    value_5d_change NUMERIC,                   -- 5-day change (for weekly trend)
    value_20d_change NUMERIC,                  -- 20-day change (for monthly trend)

    -- Data quality
    is_preliminary BOOLEAN DEFAULT FALSE,      -- FRED sometimes marks data as preliminary

    -- Fetch metadata
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure no duplicates
    CONSTRAINT unique_series_date UNIQUE (series_id, observation_date)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_fred_obs_series ON fred_observations(series_id);
CREATE INDEX IF NOT EXISTS idx_fred_obs_date ON fred_observations(observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_fred_obs_series_date ON fred_observations(series_id, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_fred_obs_fetched ON fred_observations(fetched_at);

-- ============================================================================
-- 3. Thesis FRED Indicators (Linkage Table)
-- ============================================================================
-- Links theses to relevant FRED indicators with priority and threshold config
-- Supports enhanced threshold logic: simple, trend-based, velocity, composite

CREATE TABLE IF NOT EXISTS thesis_fred_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Thesis linkage (polymorphic - can link to macro_theses or asset_theses)
    thesis_id UUID NOT NULL,
    thesis_type TEXT NOT NULL,                 -- 'macro' | 'asset'

    -- FRED series linkage
    series_id TEXT NOT NULL,                   -- FRED series ID

    -- Indicator configuration
    priority INTEGER NOT NULL DEFAULT 5,        -- 1-5, lower = more important
    relevance_notes TEXT,                       -- Why this indicator matters for this thesis

    -- Simple threshold config (existing pattern from explicit_thresholds)
    threshold_operator TEXT,                    -- '>' | '>=' | '<' | '<=' | '=' | 'between' | 'outside'
    threshold_value NUMERIC,                    -- For single-value thresholds
    threshold_value_upper NUMERIC,              -- For 'between' or 'outside' operators

    -- Enhanced threshold: Trend-based
    -- Example: "DGS10 has risen more than 50bps in the last 20 days"
    trend_period_days INTEGER,                  -- Number of days for trend calculation
    trend_change_threshold NUMERIC,             -- Absolute change threshold
    trend_pct_change_threshold NUMERIC,         -- Percent change threshold

    -- Enhanced threshold: Velocity/acceleration
    -- Example: "Rate of change of DGS10 is accelerating"
    velocity_threshold NUMERIC,                 -- First derivative threshold
    acceleration_threshold NUMERIC,             -- Second derivative threshold (rate of change of rate of change)

    -- Enhanced threshold: Cross-series (composite)
    -- Example: "10Y-2Y spread < 0 AND 3M-10Y spread < 0"
    composite_config JSONB,                     -- Complex multi-series conditions
    -- Format: { "conditions": [{ "series_id": "T10Y2Y", "operator": "<", "value": 0 }], "logic": "AND" }

    -- Threshold breach behavior
    breach_severity TEXT DEFAULT 'medium',      -- 'critical' | 'high' | 'medium' | 'low'
    breach_message_template TEXT,               -- Template with {value}, {series}, {threshold} placeholders

    -- Link to validation point (optional)
    linked_validation_point_id UUID,            -- FK to macro_thesis_validation_points or asset_thesis_validation_points
    linked_validation_point_type TEXT,          -- 'macro' | 'asset'
    auto_update_vi_status BOOLEAN DEFAULT FALSE, -- Auto-update V&I point status on breach

    -- Status
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_checked_at TIMESTAMPTZ,
    last_breach_at TIMESTAMPTZ,
    last_breach_value NUMERIC,
    consecutive_breach_days INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_thesis_series UNIQUE (thesis_id, thesis_type, series_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_thesis_fred_thesis ON thesis_fred_indicators(thesis_id, thesis_type);
CREATE INDEX IF NOT EXISTS idx_thesis_fred_series ON thesis_fred_indicators(series_id);
CREATE INDEX IF NOT EXISTS idx_thesis_fred_enabled ON thesis_fred_indicators(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_thesis_fred_priority ON thesis_fred_indicators(thesis_id, thesis_type, priority);
CREATE INDEX IF NOT EXISTS idx_thesis_fred_vp ON thesis_fred_indicators(linked_validation_point_id) WHERE linked_validation_point_id IS NOT NULL;

-- ============================================================================
-- 4. Ingestion Run Tracking
-- ============================================================================
-- Add FRED ingestion to the existing ingestion_runs table pattern
-- (Uses existing ingestion_runs table, no new table needed)
-- run_type will be 'fred' with metadata containing series info

-- ============================================================================
-- 5. Threshold Breach History (Audit Trail)
-- ============================================================================
-- Records all threshold breaches for audit and pattern analysis

CREATE TABLE IF NOT EXISTS fred_threshold_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to indicator config
    indicator_id UUID NOT NULL REFERENCES thesis_fred_indicators(id) ON DELETE CASCADE,

    -- Thesis context (denormalized for query efficiency)
    thesis_id UUID NOT NULL,
    thesis_type TEXT NOT NULL,
    series_id TEXT NOT NULL,

    -- Breach details
    breach_date DATE NOT NULL,
    breach_value NUMERIC NOT NULL,
    threshold_config JSONB NOT NULL,            -- Snapshot of threshold config at breach time
    breach_type TEXT NOT NULL,                  -- 'simple' | 'trend' | 'velocity' | 'composite'

    -- Impact
    severity TEXT NOT NULL,
    breach_message TEXT,                        -- Rendered message from template

    -- Action taken
    auto_updated_vi_status BOOLEAN DEFAULT FALSE,
    vi_point_id UUID,
    vi_status_before TEXT,
    vi_status_after TEXT,

    -- Linkage to triage
    triage_record_id UUID,                      -- FK to thesis_triage_records if triage was created

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fred_breach_indicator ON fred_threshold_breaches(indicator_id);
CREATE INDEX IF NOT EXISTS idx_fred_breach_thesis ON fred_threshold_breaches(thesis_id, thesis_type);
CREATE INDEX IF NOT EXISTS idx_fred_breach_date ON fred_threshold_breaches(breach_date DESC);
CREATE INDEX IF NOT EXISTS idx_fred_breach_series ON fred_threshold_breaches(series_id);

-- ============================================================================
-- 6. Update Trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to new tables
DROP TRIGGER IF EXISTS update_fred_series_metadata_updated_at ON fred_series_metadata;
CREATE TRIGGER update_fred_series_metadata_updated_at
    BEFORE UPDATE ON fred_series_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_thesis_fred_indicators_updated_at ON thesis_fred_indicators;
CREATE TRIGGER update_thesis_fred_indicators_updated_at
    BEFORE UPDATE ON thesis_fred_indicators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE fred_series_metadata IS 'Reference table for FRED series metadata - titles, frequencies, units';
COMMENT ON TABLE fred_observations IS 'Historical time-series data from FRED API with computed changes';
COMMENT ON TABLE thesis_fred_indicators IS 'Links theses to FRED indicators with threshold configurations';
COMMENT ON TABLE fred_threshold_breaches IS 'Audit trail of all FRED threshold breaches';

COMMENT ON COLUMN thesis_fred_indicators.composite_config IS 'JSON config for multi-series composite thresholds. Format: { "conditions": [...], "logic": "AND|OR" }';
COMMENT ON COLUMN thesis_fred_indicators.breach_message_template IS 'Template with placeholders: {value}, {series}, {threshold}, {change}, {period}';
COMMENT ON COLUMN fred_observations.value_1d_change IS 'Computed: current value minus previous observation value';
COMMENT ON COLUMN fred_observations.value_20d_change IS 'Computed: current value minus value 20 observations ago (approx 1 month for daily data)';
