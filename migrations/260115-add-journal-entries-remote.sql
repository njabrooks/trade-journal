-- Add journal_entries table to remote database
-- This table tracks all journal/audit log entries for the decision log

SET search_path TO public;

-- Create the journal_entries table (evolved from blotter_entries)
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  object_title text,
  action_type text NOT NULL,
  action_description text NOT NULL,
  triage_record_id uuid,
  skill_invoked text,
  previous_state jsonb,
  new_state jsonb,
  rationale text,
  source text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Deduplication / lifecycle tracking columns
  first_detected_at timestamptz,
  last_seen_at timestamptz,
  occurrence_count integer DEFAULT 1,
  status text DEFAULT 'active'
);

-- Add check constraints
ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_object_type_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_object_type_check
  CHECK (object_type = ANY (ARRAY['macro_thesis', 'asset_thesis', 'strategy', 'position', 'claim', 'validation_point']));

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source = ANY (ARRAY['user', 'skill', 'automation']));

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_status_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_status_check
  CHECK (status = ANY (ARRAY['active', 'resolved', 'dismissed', 'superseded']));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_journal_object ON journal_entries (object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_journal_action_type ON journal_entries (action_type);
CREATE INDEX IF NOT EXISTS idx_journal_source ON journal_entries (source);
CREATE INDEX IF NOT EXISTS idx_journal_entries_dedup_lookup
  ON journal_entries (object_id, action_type, status)
  WHERE status = 'active';

-- Add comments
COMMENT ON TABLE journal_entries IS 'Decision log / audit trail for all system objects';
COMMENT ON COLUMN journal_entries.first_detected_at IS 'When this condition was first detected (immutable)';
COMMENT ON COLUMN journal_entries.last_seen_at IS 'When this condition was last observed (updated on each occurrence)';
COMMENT ON COLUMN journal_entries.occurrence_count IS 'Number of times this condition has been detected';
COMMENT ON COLUMN journal_entries.status IS 'Lifecycle status: active (ongoing), resolved (addressed), dismissed (ignored), superseded (replaced by escalation)';
