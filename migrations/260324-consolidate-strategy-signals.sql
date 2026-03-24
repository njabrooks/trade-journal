-- 260324: Consolidate strategy price signals
--
-- Previously: one signal per price target (TP1, TP2, TP3 each get their own signal row).
-- After: one signal per underlying with a targets array in explicit_details.
--
-- The legacy entity_type/thesis_id/strategy_id direct FK columns on the signals table
-- are no longer used (entity linkage moved to signal_entity_links junction table).
-- Drop the check constraint so new signals can be inserted without populating them.

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_entity_check;
ALTER TABLE signals ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE signals ALTER COLUMN entity_type SET DEFAULT NULL;

-- Data migration: run scripts/consolidate-strategy-signals.ts
-- This creates consolidated ladder signals and retires the individual ones.
