-- Migration: Rename validation_points to signals
-- Date: 2026-01-12
-- Purpose: Implement Decision Point Inventory terminology changes
--   - validation_points → signals
--   - validation_status_history → signal_status_history
--   - type values: validation → confirmation, invalidation → warning
--   - Add 'recommended' status

BEGIN;

-- ============================================================================
-- 1. Drop check constraints that need to be modified
-- ============================================================================

-- Drop type check constraint (will recreate with new values)
ALTER TABLE validation_points DROP CONSTRAINT validation_points_type_check;

-- Drop status check constraint (will recreate with 'recommended' added)
ALTER TABLE validation_points DROP CONSTRAINT validation_points_status_check;

-- ============================================================================
-- 2. Rename validation_points table to signals
-- ============================================================================

ALTER TABLE validation_points RENAME TO signals;

-- Update type column values: validation → confirmation, invalidation → warning
UPDATE signals SET type = 'confirmation' WHERE type = 'validation';
UPDATE signals SET type = 'warning' WHERE type = 'invalidation';

-- Recreate check constraints with new values and new table name
ALTER TABLE signals ADD CONSTRAINT signals_type_check
  CHECK (type = ANY (ARRAY['confirmation'::text, 'warning'::text]));

ALTER TABLE signals ADD CONSTRAINT signals_status_check
  CHECK (status = ANY (ARRAY['not_triggered'::text, 'monitoring'::text, 'triggered'::text, 'superseded'::text, 'recommended'::text]));

-- Rename other check constraints to use 'signals' prefix
ALTER TABLE signals RENAME CONSTRAINT validation_points_category_check TO signals_category_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_dependent_thesis_condition_check TO signals_dependent_thesis_condition_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_dependent_thesis_type_check TO signals_dependent_thesis_type_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_importance_check TO signals_importance_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_thesis_type_check TO signals_thesis_type_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_timeframe_check TO signals_timeframe_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_pkey TO signals_pkey;
ALTER TABLE signals RENAME CONSTRAINT validation_points_articulation_id_fkey TO signals_articulation_id_fkey;

-- Rename indexes on signals table
ALTER INDEX idx_validation_points_thesis RENAME TO idx_signals_thesis;
ALTER INDEX idx_validation_points_status RENAME TO idx_signals_status;
ALTER INDEX idx_validation_points_type RENAME TO idx_signals_type;
ALTER INDEX idx_validation_points_importance RENAME TO idx_signals_importance;

-- ============================================================================
-- 3. Rename validation_status_history table to signal_status_history
-- ============================================================================

ALTER TABLE validation_status_history RENAME TO signal_status_history;

-- Rename column validation_point_id → signal_id
ALTER TABLE signal_status_history RENAME COLUMN validation_point_id TO signal_id;

-- Rename indexes on signal_status_history
ALTER INDEX idx_status_history_point RENAME TO idx_signal_status_history_signal;
ALTER INDEX idx_status_history_timestamp RENAME TO idx_signal_status_history_timestamp;

-- Rename constraint
ALTER TABLE signal_status_history RENAME CONSTRAINT validation_status_history_pkey TO signal_status_history_pkey;
ALTER TABLE signal_status_history RENAME CONSTRAINT validation_status_history_validation_point_id_fkey TO signal_status_history_signal_id_fkey;

-- ============================================================================
-- 4. Update foreign key columns in related tables
-- ============================================================================

-- decision_audit_log: validation_point_id → signal_id
ALTER TABLE decision_audit_log RENAME COLUMN validation_point_id TO signal_id;
-- Note: FK constraint name will need to be updated if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_audit_log_validation_point_id_fkey') THEN
    ALTER TABLE decision_audit_log RENAME CONSTRAINT decision_audit_log_validation_point_id_fkey TO decision_audit_log_signal_id_fkey;
  END IF;
END $$;

-- monitoring_specs: validation_point_id → signal_id
ALTER TABLE monitoring_specs RENAME COLUMN validation_point_id TO signal_id;
ALTER INDEX idx_monitoring_specs_point RENAME TO idx_monitoring_specs_signal;
ALTER TABLE monitoring_specs RENAME CONSTRAINT monitoring_specs_validation_point_id_fkey TO monitoring_specs_signal_id_fkey;

-- monitoring_events: validation_point_id → signal_id
ALTER TABLE monitoring_events RENAME COLUMN validation_point_id TO signal_id;
ALTER INDEX idx_monitoring_events_validation_point RENAME TO idx_monitoring_events_signal;
ALTER TABLE monitoring_events RENAME CONSTRAINT monitoring_events_validation_point_id_fkey TO monitoring_events_signal_id_fkey;
-- Also update the status_history FK reference (now pointing to signal_status_history)
ALTER TABLE monitoring_events RENAME CONSTRAINT monitoring_events_status_history_id_fkey TO monitoring_events_signal_status_history_id_fkey;

-- thesis_fred_indicators: linked_validation_point_id → linked_signal_id
ALTER TABLE thesis_fred_indicators RENAME COLUMN linked_validation_point_id TO linked_signal_id;
ALTER TABLE thesis_fred_indicators RENAME COLUMN linked_validation_point_type TO linked_signal_type;

-- ============================================================================
-- 5. Verification
-- ============================================================================

DO $$
BEGIN
  -- Check signals table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signals') THEN
    RAISE EXCEPTION 'Migration failed: signals table not created';
  END IF;

  -- Check signal_status_history table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signal_status_history') THEN
    RAISE EXCEPTION 'Migration failed: signal_status_history table not created';
  END IF;

  -- Check old tables don't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'validation_points') THEN
    RAISE EXCEPTION 'Migration failed: validation_points table still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'validation_status_history') THEN
    RAISE EXCEPTION 'Migration failed: validation_status_history table still exists';
  END IF;

  -- Check type values were updated
  IF EXISTS (SELECT 1 FROM signals WHERE type IN ('validation', 'invalidation')) THEN
    RAISE EXCEPTION 'Migration failed: old type values still exist';
  END IF;

  RAISE NOTICE 'Migration successful: validation_points → signals';
END $$;

COMMIT;
