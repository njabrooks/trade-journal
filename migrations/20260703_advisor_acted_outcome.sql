-- Lane C (docs/v2/20) — advisor execution loop.
-- advisor_recommendations.status already includes 'acted'; give it substance:
--   acted_at         — when the user recorded acting on the recommendation
--   acted_journal_id — the trade_action journal entry created at record time
--   outcome          — filled later by the retrospective scoring pass
--                      (entry edge vs realized at expiry; src/lib/derived/advisorOutcome.ts)

ALTER TABLE advisor_recommendations
  ADD COLUMN IF NOT EXISTS acted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acted_journal_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome jsonb;

-- The trade_action journal entry attaches to the ticker's asset thesis when one
-- exists; 'advisor_recommendation' is the fallback object type when it doesn't
-- (e.g. an opportunistic rec on an un-thesised name).
ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_object_type_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_object_type_check CHECK (
    object_type = ANY (ARRAY[
      'macro_thesis'::text, 'asset_thesis'::text, 'strategy'::text, 'position'::text,
      'claim'::text, 'signal'::text, 'validation_point'::text, 'reconciliation'::text,
      'advisor_recommendation'::text
    ])
  );
