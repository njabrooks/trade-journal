-- Journal deduplication: Add columns for tracking entry lifecycle
-- This enables updating existing entries instead of creating duplicates

SET search_path TO public;

-- Add lifecycle tracking columns
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS first_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS occurrence_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Backfill first_detected_at and last_seen_at from timestamp for existing entries
UPDATE journal_entries
SET first_detected_at = timestamp,
    last_seen_at = timestamp
WHERE first_detected_at IS NULL;

-- Add index for efficient lookups when checking for existing active entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_dedup_lookup
  ON journal_entries (object_id, action_type, status)
  WHERE status = 'active';

-- Add check constraint for status values
ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_status_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_status_check
  CHECK (status IN ('active', 'resolved', 'dismissed', 'superseded'));

COMMENT ON COLUMN journal_entries.first_detected_at IS 'When this condition was first detected (immutable)';
COMMENT ON COLUMN journal_entries.last_seen_at IS 'When this condition was last observed (updated on each occurrence)';
COMMENT ON COLUMN journal_entries.occurrence_count IS 'Number of times this condition has been detected';
COMMENT ON COLUMN journal_entries.status IS 'Lifecycle status: active (ongoing), resolved (addressed), dismissed (ignored), superseded (replaced by escalation)';
