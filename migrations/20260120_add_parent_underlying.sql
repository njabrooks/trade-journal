-- Migration: Add parent_underlying_id to underlyings table
-- Purpose: Allow instruments (like IBIT) to reference their economic underlying (like BTC)
-- Date: 2026-01-20

-- Add parent_underlying_id column (self-referential FK)
ALTER TABLE underlyings
ADD COLUMN IF NOT EXISTS parent_underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_underlyings_parent ON underlyings(parent_underlying_id);

-- Add comment
COMMENT ON COLUMN underlyings.parent_underlying_id IS 'For ETFs/wrappers, references the economic underlying (e.g., IBIT -> BTC, GLD -> gold underlying)';
