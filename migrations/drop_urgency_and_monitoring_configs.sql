-- Pre-migration cleanup: Drop deprecated urgency field and thesis_monitoring_configs table
-- Date: 2026-02-18
-- Context: Preparing for TTC migration (TRADE_JOURNAL_MIGRATION_PLAN.md)

-- 1. Drop the deprecated 'urgency' column from thesis_triage_records
-- The severity + status fields already capture the same information.
-- urgency was: 'immediate' | 'today' | 'this_week' | 'when_convenient'
-- severity is: 'urgent' | 'attention' | 'monitor' | 'info'
ALTER TABLE thesis_triage_records DROP COLUMN IF EXISTS urgency;

-- 2. Recreate the severity index without the urgency column
DROP INDEX IF EXISTS idx_thesis_triage_severity;
CREATE INDEX idx_thesis_triage_severity ON thesis_triage_records (severity);

-- 3. Drop the deprecated thesis_monitoring_configs table
-- Replaced by signals.explicit_details (category='data_driven')
-- See: scripts/daily-signal-monitoring.ts
DROP INDEX IF EXISTS idx_thesis_monitoring_configs_thesis;
DROP INDEX IF EXISTS idx_thesis_monitoring_configs_ticker;
DROP INDEX IF EXISTS idx_thesis_monitoring_configs_next_check;
DROP INDEX IF EXISTS idx_thesis_monitoring_configs_enabled;
DROP TABLE IF EXISTS thesis_monitoring_configs;
