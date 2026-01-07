-- Migration: Rename blotter_entries to journal_entries
-- Purpose: Align with PRD terminology (Journal/Decision Log instead of Blotter)
-- Date: 2026-01-07

-- Rename the table
ALTER TABLE blotter_entries RENAME TO journal_entries;

-- Rename indexes to match new table name
ALTER INDEX IF EXISTS idx_blotter_object RENAME TO idx_journal_object;
ALTER INDEX IF EXISTS idx_blotter_timestamp RENAME TO idx_journal_timestamp;
ALTER INDEX IF EXISTS idx_blotter_action_type RENAME TO idx_journal_action_type;
ALTER INDEX IF EXISTS idx_blotter_source RENAME TO idx_journal_source;

-- Update table comment
COMMENT ON TABLE journal_entries IS
'Comprehensive audit trail of all actions across all object types. Renamed from blotter_entries to align with PRD terminology (Journal/Decision Log). Enables full reconstruction of decision process and supports divergence tracking.';
