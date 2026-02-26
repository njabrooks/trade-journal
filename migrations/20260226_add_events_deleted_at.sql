-- Add soft-delete support to events table
-- Enables reconciliation: events absent from newer Koinly exports get soft-deleted
ALTER TABLE events ADD COLUMN deleted_at timestamptz;

-- Partial index for downstream queries that filter active events
CREATE INDEX idx_events_not_deleted ON events (user_id, timestamp)
  WHERE deleted_at IS NULL;

-- Index for reconciliation: find koinly_raw events by owner
CREATE INDEX idx_events_koinly_raw_owner ON events (owner, source_id)
  WHERE source = 'koinly_raw';
