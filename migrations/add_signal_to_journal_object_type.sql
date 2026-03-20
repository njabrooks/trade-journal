-- Add 'signal' to journal_entries object_type check constraint
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_object_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_object_type_check
  CHECK (object_type = ANY (ARRAY['macro_thesis','asset_thesis','strategy','position','claim','signal','validation_point','reconciliation']));
