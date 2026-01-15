-- Migration: Rename validation_status_history to signal_status_history (remote sync)
-- Date: 2026-01-15
-- Purpose: Sync remote DB with code expectations for status history table
-- Note: The main signals table uses 'validation_points' name via Drizzle mapping

BEGIN;

-- 1. Rename the table
ALTER TABLE validation_status_history RENAME TO signal_status_history;

-- 2. Rename the column
ALTER TABLE signal_status_history RENAME COLUMN validation_point_id TO signal_id;

-- 3. Rename indexes
ALTER INDEX IF EXISTS idx_status_history_point RENAME TO idx_signal_status_history_signal;
ALTER INDEX IF EXISTS idx_status_history_timestamp RENAME TO idx_signal_status_history_timestamp;

-- 4. Rename constraints
ALTER TABLE signal_status_history RENAME CONSTRAINT validation_status_history_pkey TO signal_status_history_pkey;

-- Update FK constraint (may need to reference validation_points since that's still the main table name)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validation_status_history_validation_point_id_fkey') THEN
    ALTER TABLE signal_status_history DROP CONSTRAINT validation_status_history_validation_point_id_fkey;
    ALTER TABLE signal_status_history ADD CONSTRAINT signal_status_history_signal_id_fkey
      FOREIGN KEY (signal_id) REFERENCES validation_points(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Verification
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signal_status_history') THEN
    RAISE EXCEPTION 'Migration failed: signal_status_history table not created';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'validation_status_history') THEN
    RAISE EXCEPTION 'Migration failed: validation_status_history table still exists';
  END IF;

  RAISE NOTICE 'Migration successful: validation_status_history → signal_status_history';
END $$;

COMMIT;
