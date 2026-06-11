-- v2 prune sweep (T6): drop 19 dead tables
-- Date: 2026-06-11
-- CSV dumps of all dropped tables archived in archive/db-dumps/2026-06/ before this migration.
--
-- KEPT: signal_data_snapshots retains its intelligence_item_id / report_id columns
-- (provenance on ~45K rows) — only the FK constraints to the dropped intelligence
-- tables are removed.
--
-- Drop order is FK-safe:
--   fred_threshold_breaches -> thesis_fred_indicators
--   intelligence_items      -> intelligence_reports
--   monitoring_events       -> monitoring_specs
-- All other FKs point at kept tables (underlyings, assets, signals, accounts,
-- positions, strategies, signal_status_history) and drop with the referencing table.

BEGIN;

-- 1. Detach kept table signal_data_snapshots from the dying intelligence tables
ALTER TABLE signal_data_snapshots
  DROP CONSTRAINT IF EXISTS signal_data_snapshots_intelligence_item_id_fkey;
ALTER TABLE signal_data_snapshots
  DROP CONSTRAINT IF EXISTS signal_data_snapshots_report_id_fkey;

-- 2. Drop the 19 dead tables (children before parents)
DROP TABLE IF EXISTS fred_threshold_breaches;
DROP TABLE IF EXISTS thesis_fred_indicators;
DROP TABLE IF EXISTS fred_observations;
DROP TABLE IF EXISTS fred_series_metadata;

DROP TABLE IF EXISTS intelligence_items;
DROP TABLE IF EXISTS intelligence_reports;

DROP TABLE IF EXISTS monitoring_events;
DROP TABLE IF EXISTS monitoring_specs;

DROP TABLE IF EXISTS triage_records;
DROP TABLE IF EXISTS thesis_triage_records;
DROP TABLE IF EXISTS ai_prompts;
DROP TABLE IF EXISTS analyst_actions;
DROP TABLE IF EXISTS analyst_price_targets;
DROP TABLE IF EXISTS decision_audit_log;
DROP TABLE IF EXISTS daily_snapshots;
DROP TABLE IF EXISTS raw_flex_positions;
DROP TABLE IF EXISTS raw_flex_trades;
DROP TABLE IF EXISTS reconciliation_checkpoints;
DROP TABLE IF EXISTS signal_data_tracking;

COMMIT;
