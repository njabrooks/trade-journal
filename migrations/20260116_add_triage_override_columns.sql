-- Migration: Add override columns to triage_records
-- Purpose: Support blotter-to-journal migration by storing severity overrides directly on triage records
-- Date: 2026-01-16

-- Add override tracking columns
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS override_source TEXT;
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS override_expires_date DATE;
ALTER TABLE triage_records ADD COLUMN IF NOT EXISTS override_at TIMESTAMP WITH TIME ZONE;

-- Add index for override lookups
CREATE INDEX IF NOT EXISTS idx_triage_override_source ON triage_records (override_source);

-- Add comments for documentation
COMMENT ON COLUMN triage_records.override_source IS 'Source of override: user_dismiss | user_monitor | null (no override)';
COMMENT ON COLUMN triage_records.override_expires_date IS 'When override expires (null = permanent)';
COMMENT ON COLUMN triage_records.override_at IS 'When the override was set by user';
