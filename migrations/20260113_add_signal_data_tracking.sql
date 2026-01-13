-- Migration: Add signal_data_tracking table for on_release trigger detection
-- Date: 2026-01-13
-- Purpose: Track last observed data points per signal to detect new data releases

CREATE TABLE IF NOT EXISTS signal_data_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL UNIQUE REFERENCES signals(id) ON DELETE CASCADE,

  -- Last observed data point
  last_observed_date TEXT,  -- Date string from data source (e.g., '2025-01-01')
  last_observed_value NUMERIC(18, 6),
  last_checked_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  data_source TEXT NOT NULL,  -- 'fred' | 'iv_data' | 'price_feed'
  metric TEXT NOT NULL,  -- Series ID or metric name

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_signal_data_tracking_signal ON signal_data_tracking(signal_id);

-- Comment for documentation
COMMENT ON TABLE signal_data_tracking IS 'Tracks last observed data for on_release trigger detection';
COMMENT ON COLUMN signal_data_tracking.last_observed_date IS 'Date string from source API (FRED observation date, etc.)';
