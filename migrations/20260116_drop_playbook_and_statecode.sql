-- Migration: Drop playbook system and remaining stateCode references
-- Date: 2026-01-16
-- Reason: Playbook and StateCode systems replaced by Signals system
-- See: docs/CLEANUP_PLAN.md

-- Drop stateCodeAtAction column from blotter_actions
-- This column stored the state code at time of action, now deprecated
ALTER TABLE blotter_actions DROP COLUMN IF EXISTS state_code_at_action;

-- Drop playbook_items table entirely
-- Playbook was used for state code configuration, now replaced by signals
DROP TABLE IF EXISTS playbook_items CASCADE;
