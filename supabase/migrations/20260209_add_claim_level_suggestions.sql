-- Add claim-level suggestion support to research_hierarchy_recommendations
-- Allows AI-generated thesis linkage suggestions to be associated with specific claims
-- (in addition to the existing insight-level recommendations)

ALTER TABLE research_hierarchy_recommendations
  ADD COLUMN main_claim_id UUID REFERENCES main_claims(id) ON DELETE CASCADE;

CREATE INDEX idx_recommendations_claim
  ON research_hierarchy_recommendations(main_claim_id);
