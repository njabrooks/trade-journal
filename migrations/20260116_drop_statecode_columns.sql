-- Migration: Drop deprecated stateCode columns
-- Date: 2026-01-16
-- Reason: StateCode system replaced by signals system
-- See: docs/CLEANUP_PLAN.md

-- Drop stateCode column from strategy_metrics_snapshots
-- This column stored computed state codes (LC1, RR2, etc.) but signals now handle this
ALTER TABLE strategy_metrics_snapshots DROP COLUMN IF EXISTS state_code;

-- Also drop realizedPnlToDate which was never implemented
ALTER TABLE strategy_metrics_snapshots DROP COLUMN IF EXISTS realized_pnl_to_date;
