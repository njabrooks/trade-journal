-- Add 'reconciliation' to journal_entries object_type check constraint
-- Required for M7.1 reconciliation resolution journal logging

ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_object_type_check;

ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_object_type_check
  CHECK (object_type = ANY (ARRAY[
    'macro_thesis',
    'asset_thesis',
    'strategy',
    'position',
    'claim',
    'validation_point',
    'reconciliation'
  ]));
