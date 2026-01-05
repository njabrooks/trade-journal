-- Phase 3.2A: Enhance Monitoring Specs Table
-- Created: 2026-01-05
-- Purpose: Add enabled flag for disabling specs without deletion
--
-- Enhancement to existing monitoring_specs table from Phase 3.1
-- Allows users to temporarily disable monitoring without losing configuration

ALTER TABLE monitoring_specs
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- Index for efficient queries of active specs
CREATE INDEX IF NOT EXISTS idx_monitoring_specs_enabled
  ON monitoring_specs(enabled)
  WHERE enabled = true;

-- Comment for documentation
COMMENT ON COLUMN monitoring_specs.enabled IS
  'Toggle for enabling/disabling monitoring without deletion. Default true.';
