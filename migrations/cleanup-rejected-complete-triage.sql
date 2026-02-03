-- Migration: cleanup-rejected-complete-triage.sql
-- Description: Delete stale QUANTITY_CHANGE and TRADE_INGESTION triage records
--              for strategies that are now rejected or complete
-- Date: 2026-02-03

-- First, let's see what we're about to delete (dry run preview)
-- SELECT tr.id, tr.symbol, tr.snapshot_date, tr.recommended_action, s.strategy_key, s.status
-- FROM triage_records tr
-- JOIN strategies s ON tr.strategy_id = s.id
-- WHERE tr.recommended_action IN ('QUANTITY_CHANGE', 'TRADE_INGESTION')
--   AND s.status IN ('rejected', 'complete')
--   AND tr.status = 'inbox';

-- Delete triage records for rejected/complete strategies that are still in inbox
-- These should never have been created (or should have been auto-resolved when strategy status changed)
DELETE FROM triage_records
WHERE id IN (
  SELECT tr.id
  FROM triage_records tr
  JOIN strategies s ON tr.strategy_id = s.id
  WHERE tr.recommended_action IN ('QUANTITY_CHANGE', 'TRADE_INGESTION', 'CONFIRM_STRATEGY')
    AND s.status IN ('rejected', 'complete')
    AND tr.status = 'inbox'
);
