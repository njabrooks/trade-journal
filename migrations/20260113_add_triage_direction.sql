-- Add direction column to triage_records table
-- Stores net direction of position(s): 'bullish' | 'bearish' | 'neutral'

ALTER TABLE triage_records
ADD COLUMN IF NOT EXISTS direction TEXT;

-- Add comment for documentation
COMMENT ON COLUMN triage_records.direction IS 'Net direction of position(s): bullish, bearish, or neutral';
