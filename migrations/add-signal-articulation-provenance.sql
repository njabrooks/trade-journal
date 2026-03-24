-- Add articulation provenance columns to signals table
-- Tracks which section/driver of the core argument generated each signal
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_section TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_driver_index INTEGER;

COMMENT ON COLUMN signals.source_section IS 'Which articulation section generated this signal: key_driver, key_assumption, timeframe, dependency';
COMMENT ON COLUMN signals.source_driver_index IS 'Zero-based index into the section array';
