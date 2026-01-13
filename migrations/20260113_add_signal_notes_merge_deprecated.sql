-- Migration: Add notes field and merge deprecated fields
-- Date: 2026-01-13
-- Purpose: Simplify signal model by consolidating rationale, judgmentDetails, responseProtocol into single notes field

-- Step 1: Add the notes column if it doesn't exist
ALTER TABLE signals ADD COLUMN IF NOT EXISTS notes TEXT;

-- Step 2: Merge existing data into notes field
-- Format: combines rationale, response protocol description, and judgment basis/context
UPDATE signals
SET notes = COALESCE(
  CONCAT_WS(
    E'\n\n',
    CASE WHEN rationale IS NOT NULL AND rationale != '' THEN 'Rationale: ' || rationale END,
    CASE WHEN response_protocol->>'description' IS NOT NULL AND response_protocol->>'description' != ''
         THEN 'Response: ' || (response_protocol->>'description') END,
    CASE WHEN judgment_details->>'basis' IS NOT NULL AND judgment_details->>'basis' != ''
         THEN 'Judgment Basis: ' || (judgment_details->>'basis') END,
    CASE WHEN judgment_details->>'context' IS NOT NULL AND judgment_details->>'context' != ''
         THEN 'Context: ' || (judgment_details->>'context') END
  ),
  ''
)
WHERE notes IS NULL
  AND (
    rationale IS NOT NULL
    OR response_protocol IS NOT NULL
    OR judgment_details IS NOT NULL
  );

-- Step 3: Clean up empty notes (set to NULL instead of empty string)
UPDATE signals SET notes = NULL WHERE notes = '';

-- Comment for documentation
COMMENT ON COLUMN signals.notes IS 'Free-form notes field consolidating rationale, judgmentDetails, and responseProtocol';
