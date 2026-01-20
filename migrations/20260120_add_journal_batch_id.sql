-- Migration: Add batch_id to journal_entries for grouping related operations
-- Purpose: Enable grouping of journal entries from the same operation (e.g., rejecting multiple signals)
-- Date: 2026-01-20

-- Add batch_id column
ALTER TABLE journal_entries
ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Add index for efficient batch lookups
CREATE INDEX IF NOT EXISTS idx_journal_batch ON journal_entries(batch_id);

-- Add comment
COMMENT ON COLUMN journal_entries.batch_id IS 'Groups related journal entries from the same operation (e.g., skill invocation creating multiple entries)';
