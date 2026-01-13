-- Migration: Drop deprecated monitoring tables
-- Date: 2026-01-13
-- Reason: Part of Signals UX Redesign Phase 5 cleanup
-- These tables were used for keyword-based news monitoring which has been deprecated
-- in favor of explicit_details on signals for data-driven triggers.
-- Data: 5 specs and 27 events (minimal, not migrated)

-- Drop tables in correct order (events first due to foreign key)
DROP TABLE IF EXISTS monitoring_events CASCADE;
DROP TABLE IF EXISTS monitoring_specs CASCADE;
