-- Migration: Convert main_claims evidence and rebuttal columns to TEXT[] arrays
-- Date: 2024-12-30
-- Purpose: Store evidence and rebuttal as arrays instead of comma-separated strings
--          to eliminate parsing ambiguity and align with parser output format

BEGIN;

-- First, check if there's any existing data that needs migration
-- If claims exist, we need to handle the conversion carefully

-- Add new array columns alongside existing text columns
ALTER TABLE main_claims
  ADD COLUMN IF NOT EXISTS evidence_array TEXT[],
  ADD COLUMN IF NOT EXISTS rebuttal_array TEXT[];

-- Migrate existing data from text to array
-- For now, we'll treat existing text as single-item arrays
-- (Most existing claims are likely empty or will need manual review)
UPDATE main_claims
SET
  evidence_array = CASE
    WHEN evidence IS NOT NULL AND evidence != '' THEN ARRAY[evidence]
    ELSE NULL
  END,
  rebuttal_array = CASE
    WHEN rebuttal IS NOT NULL AND rebuttal != '' THEN ARRAY[rebuttal]
    ELSE NULL
  END
WHERE evidence_array IS NULL OR rebuttal_array IS NULL;

-- Drop old text columns
ALTER TABLE main_claims
  DROP COLUMN IF EXISTS evidence,
  DROP COLUMN IF EXISTS rebuttal;

-- Rename new array columns to original names
ALTER TABLE main_claims
  RENAME COLUMN evidence_array TO evidence;

ALTER TABLE main_claims
  RENAME COLUMN rebuttal_array TO rebuttal;

COMMIT;

-- Verification query (run manually after migration):
-- SELECT
--   id,
--   title,
--   array_length(evidence, 1) as evidence_count,
--   array_length(rebuttal, 1) as rebuttal_count
-- FROM main_claims
-- WHERE evidence IS NOT NULL OR rebuttal IS NOT NULL;
