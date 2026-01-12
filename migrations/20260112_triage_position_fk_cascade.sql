-- Migration: Change triage_records.position_id FK from SET NULL to CASCADE
--
-- Rationale: Positions are ephemeral (deleted and recreated each snapshot during ingestion).
-- Using SET NULL creates orphaned triage records with null position_id.
-- Since triage events are logged to the journal for historical record, there's no need
-- to preserve triage_records after their position is deleted.
-- Using CASCADE ensures triage records are automatically deleted when positions are deleted,
-- preventing orphan accumulation.

-- Drop the existing foreign key constraint
ALTER TABLE triage_records
DROP CONSTRAINT IF EXISTS triage_records_position_id_fkey;

-- Re-add the foreign key with ON DELETE CASCADE
ALTER TABLE triage_records
ADD CONSTRAINT triage_records_position_id_fkey
FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE;
