-- Add source tracking fields to main_claims table
-- This enables auto-promotion of audit claims to first-class main_claims

-- Add new columns
ALTER TABLE main_claims
ADD COLUMN IF NOT EXISTS source_insight_id UUID REFERENCES research_insights(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_claim_id TEXT;

-- Update status column to support 'unconfirmed' status
-- Note: Existing claims will remain with their current status
-- New claims will default to 'unconfirmed'
ALTER TABLE main_claims
ALTER COLUMN status SET DEFAULT 'unconfirmed';

-- Add index for source tracking
CREATE INDEX IF NOT EXISTS idx_main_claims_source_insight ON main_claims(source_insight_id);

-- Add comment for documentation
COMMENT ON COLUMN main_claims.source_insight_id IS 'Reference to the research insight (audit) where this claim originated';
COMMENT ON COLUMN main_claims.source_claim_id IS 'The claim ID from the audit JSONB (e.g., "claim-1")';
COMMENT ON COLUMN main_claims.status IS 'Claim lifecycle status: unconfirmed (from audit), confirmed (promoted), invalidated, merged';
