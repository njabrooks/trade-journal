-- Migration: Add claims_structure column to research_insights
-- Date: 2025-12-26
-- Purpose: Enable hierarchical Toulmin claim structure for local Claude workflow integration

-- Add new column for hierarchical claim structure
ALTER TABLE research_insights
ADD COLUMN IF NOT EXISTS claims_structure JSONB;

-- Add GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_research_insights_claims_structure
ON research_insights USING GIN (claims_structure);

-- Add comment explaining the structure
COMMENT ON COLUMN research_insights.claims_structure IS
'Hierarchical Toulmin claim structure with main claims and evidence claims.
Schema: { main_claims: MainClaim[], evidence_claims: EvidenceClaim[], metadata: {...} }
Populated by local Claude workflow (/process-transcript skill) or migration script.';

-- Validation function to check claims_structure format (optional, for data quality)
CREATE OR REPLACE FUNCTION validate_claims_structure(claims JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if it has required top-level keys
  IF NOT (claims ? 'main_claims' AND claims ? 'evidence_claims' AND claims ? 'metadata') THEN
    RETURN FALSE;
  END IF;

  -- Check if main_claims is an array
  IF jsonb_typeof(claims->'main_claims') != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Check if evidence_claims is an array
  IF jsonb_typeof(claims->'evidence_claims') != 'array' THEN
    RETURN FALSE;
  END IF;

  -- All checks passed
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Optional: Add check constraint (commented out for flexibility during migration)
-- ALTER TABLE research_insights
-- ADD CONSTRAINT valid_claims_structure
-- CHECK (claims_structure IS NULL OR validate_claims_structure(claims_structure));

-- Summary
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE 'Added: claims_structure column (JSONB)';
  RAISE NOTICE 'Added: GIN index on claims_structure';
  RAISE NOTICE 'Created: validate_claims_structure() function';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run migration script: npx tsx scripts/migrate-claims-structure.ts';
  RAISE NOTICE '2. Verify existing insights migrated successfully';
  RAISE NOTICE '3. Test upload workflow with new structure';
END $$;
