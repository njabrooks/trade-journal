-- C2 (docs/v2/09 §8.2): the Decision Item snooze lifecycle needs status='snoozed'.
--
-- journal_entries.status carries a DB CHECK constraint (journal_entries_status_check)
-- that is NOT reflected in the Drizzle schema (which types status as free-text). It
-- previously allowed only active/resolved/dismissed/superseded — so the snooze PATCH
-- failed at the DB. Add 'snoozed' to the allowed set. (The doc's "no migration"
-- assumption for snooze was wrong; this is the one-line correction.)
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'resolved'::text, 'dismissed'::text, 'snoozed'::text, 'superseded'::text]));
