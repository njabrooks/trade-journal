-- Migration: Add signal_data_snapshots table and report_type to intelligence_reports
-- Date: 2026-03-17
-- Phase: 2c of thesis-signal-monitoring-redesign

-- 1. Add report_type to intelligence_reports so we can distinguish thesis-monitor from world-monitor
ALTER TABLE intelligence_reports ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'world-monitor';

-- Backfill existing thesis-monitor reports by checking fullMarkdown frontmatter
UPDATE intelligence_reports
SET report_type = 'thesis-monitor'
WHERE full_markdown LIKE '%type: thesis-monitor%';

-- 2. Create signal_data_snapshots table — unified time-series for quantitative AND qualitative signal tracking
CREATE TABLE IF NOT EXISTS signal_data_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id            uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  snapshot_date        timestamptz NOT NULL DEFAULT now(),

  -- Quantitative data (for data-driven signals)
  observed_value       numeric(18,6),
  threshold_value      numeric(18,6),
  pct_to_threshold     numeric(8,4),
  unit                 text,

  -- Qualitative data (for thesis monitor assessments)
  assessment           text,
  evidence_summary     text,
  intelligence_item_id uuid REFERENCES intelligence_items(id) ON DELETE SET NULL,

  -- Source tracking
  data_source          text NOT NULL,
  report_id            uuid REFERENCES intelligence_reports(id) ON DELETE SET NULL,

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signal_data_snapshots_signal ON signal_data_snapshots(signal_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_signal_data_snapshots_report ON signal_data_snapshots(report_id) WHERE report_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_data_snapshots_unique ON signal_data_snapshots(signal_id, snapshot_date, data_source);
