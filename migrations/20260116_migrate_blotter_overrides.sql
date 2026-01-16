-- Migration: Migrate severity overrides from blotter_actions to triage_records
-- Purpose: Transfer override data so we can deprecate blotter_actions table
-- Date: 2026-01-16

-- First, backup blotter_actions for safety
CREATE TABLE IF NOT EXISTS blotter_actions_backup AS SELECT * FROM blotter_actions;

-- Migrate overrides to triage_records
-- This updates triage records that match the blotter override by:
-- - strategy_id (all existing overrides are strategy-level)
-- - recommended_action = triage_flag_at_action
-- We update the most recent triage record for each strategy+action combination

-- For each blotter override, update matching triage records
-- Using a CTE to get the latest triage record per strategy+recommended_action
WITH blotter_overrides AS (
  SELECT
    strategy_id,
    triage_flag_at_action,
    severity_override,
    override_expires_date,
    created_at,
    action_detail
  FROM blotter_actions
  WHERE action_detail IN ('DISMISS', 'MONITOR')
    AND severity_override IS NOT NULL
    AND strategy_id IS NOT NULL
),
latest_triage AS (
  SELECT DISTINCT ON (tr.strategy_id, tr.recommended_action)
    tr.id,
    tr.strategy_id,
    tr.recommended_action,
    bo.severity_override,
    bo.override_expires_date,
    bo.created_at as override_at,
    bo.action_detail
  FROM triage_records tr
  INNER JOIN blotter_overrides bo
    ON tr.strategy_id = bo.strategy_id
    AND tr.recommended_action = bo.triage_flag_at_action
  ORDER BY tr.strategy_id, tr.recommended_action, tr.snapshot_date DESC
)
UPDATE triage_records tr
SET
  override_source = CASE
    WHEN lt.action_detail = 'DISMISS' THEN 'user_dismiss'
    WHEN lt.action_detail = 'MONITOR' THEN 'user_monitor'
  END,
  override_expires_date = lt.override_expires_date,
  override_at = lt.override_at,
  -- Also ensure the severity matches the override
  severity = lt.severity_override,
  -- And status reflects the action
  status = CASE
    WHEN lt.action_detail = 'DISMISS' THEN 'done'
    WHEN lt.action_detail = 'MONITOR' THEN 'in_progress'
  END,
  updated_at = NOW()
FROM latest_triage lt
WHERE tr.id = lt.id;

-- Report what was migrated
SELECT
  'Migrated overrides' as status,
  COUNT(*) as count
FROM triage_records
WHERE override_source IS NOT NULL;
