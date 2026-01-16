-- Migration: Drop blotter_actions table
-- Purpose: Complete the blotter-to-journal migration by removing the deprecated blotter_actions table
-- Date: 2026-01-16
--
-- Prerequisites:
-- 1. Override data has been migrated to triage_records (20260116_migrate_blotter_overrides.sql)
-- 2. All code paths have been updated to use journal_entries and triage_records instead
-- 3. A backup has been created (blotter_actions_backup)

-- Verify backup exists before proceeding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blotter_actions_backup') THEN
    RAISE EXCEPTION 'Backup table blotter_actions_backup does not exist. Run migration 20260116_migrate_blotter_overrides.sql first.';
  END IF;
END $$;

-- Drop indexes first
DROP INDEX IF EXISTS idx_blotter_strategy_action_date;
DROP INDEX IF EXISTS idx_blotter_follow_up;
DROP INDEX IF EXISTS idx_blotter_override;
DROP INDEX IF EXISTS idx_blotter_trade_source;
DROP INDEX IF EXISTS idx_blotter_conid;
DROP INDEX IF EXISTS idx_blotter_linked;
DROP INDEX IF EXISTS idx_blotter_decision_type;

-- Drop the blotter_actions table
DROP TABLE IF EXISTS blotter_actions;

-- Report completion
SELECT 'blotter_actions table dropped successfully' as status;
