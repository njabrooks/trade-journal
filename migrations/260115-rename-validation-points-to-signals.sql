-- Migration: Rename validation_points to signals
-- Date: 2026-01-15
-- Purpose: Align remote DB with local DB table naming

BEGIN;

-- 1. Rename the table
ALTER TABLE validation_points RENAME TO signals;

-- 2. Rename primary key constraint
ALTER TABLE signals RENAME CONSTRAINT validation_points_pkey TO signals_pkey;

-- 3. Rename indexes
ALTER INDEX idx_validation_points_entity_type RENAME TO idx_signals_entity_type;
ALTER INDEX idx_validation_points_importance RENAME TO idx_signals_importance;
ALTER INDEX idx_validation_points_status RENAME TO idx_signals_status;
ALTER INDEX idx_validation_points_strategy RENAME TO idx_signals_strategy;
ALTER INDEX idx_validation_points_thesis RENAME TO idx_signals_thesis;
ALTER INDEX idx_validation_points_type RENAME TO idx_signals_type;

-- 4. Rename check constraints
ALTER TABLE signals RENAME CONSTRAINT validation_points_category_check TO signals_category_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_dependent_thesis_condition_check TO signals_dependent_thesis_condition_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_dependent_thesis_type_check TO signals_dependent_thesis_type_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_entity_check TO signals_entity_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_importance_check TO signals_importance_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_status_check TO signals_status_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_thesis_type_check TO signals_thesis_type_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_timeframe_check TO signals_timeframe_check;
ALTER TABLE signals RENAME CONSTRAINT validation_points_type_check TO signals_type_check;

-- 5. Rename foreign key constraints on signals table
ALTER TABLE signals RENAME CONSTRAINT validation_points_articulation_id_fkey TO signals_articulation_id_fkey;
ALTER TABLE signals RENAME CONSTRAINT validation_points_strategy_id_fkey TO signals_strategy_id_fkey;

-- 6. Update foreign key constraints from other tables
-- decision_audit_log has two FKs pointing to this table
ALTER TABLE decision_audit_log DROP CONSTRAINT IF EXISTS decision_audit_log_validation_point_id_fkey;
ALTER TABLE decision_audit_log DROP CONSTRAINT IF EXISTS decision_audit_log_signal_id_fkey;
ALTER TABLE decision_audit_log ADD CONSTRAINT decision_audit_log_signal_id_fkey
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE SET NULL;
-- Note: validation_point_id column may still exist, keeping for backwards compat

-- monitoring_events
ALTER TABLE monitoring_events DROP CONSTRAINT IF EXISTS monitoring_events_validation_point_id_fkey;
ALTER TABLE monitoring_events ADD CONSTRAINT monitoring_events_signal_id_fkey
  FOREIGN KEY (validation_point_id) REFERENCES signals(id) ON DELETE CASCADE;

-- monitoring_specs
ALTER TABLE monitoring_specs DROP CONSTRAINT IF EXISTS monitoring_specs_validation_point_id_fkey;
ALTER TABLE monitoring_specs ADD CONSTRAINT monitoring_specs_signal_id_fkey
  FOREIGN KEY (validation_point_id) REFERENCES signals(id) ON DELETE CASCADE;

-- signal_data_tracking (already named correctly)
ALTER TABLE signal_data_tracking DROP CONSTRAINT IF EXISTS signal_data_tracking_signal_id_fkey;
ALTER TABLE signal_data_tracking ADD CONSTRAINT signal_data_tracking_signal_id_fkey
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE;

-- signal_status_history (already named correctly)
ALTER TABLE signal_status_history DROP CONSTRAINT IF EXISTS signal_status_history_signal_id_fkey;
ALTER TABLE signal_status_history ADD CONSTRAINT signal_status_history_signal_id_fkey
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE;

-- 7. Verification
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signals') THEN
    RAISE EXCEPTION 'Migration failed: signals table not created';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'validation_points') THEN
    RAISE EXCEPTION 'Migration failed: validation_points table still exists';
  END IF;

  RAISE NOTICE 'Migration successful: validation_points renamed to signals';
END $$;

COMMIT;
