-- Create claim_thesis_links table for tracking claim-to-thesis relationships
-- Generated: 2026-02-10

CREATE TABLE IF NOT EXISTS claim_thesis_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    main_claim_id UUID NOT NULL REFERENCES main_claims(id) ON DELETE CASCADE,
    macro_thesis_id UUID REFERENCES macro_theses(id) ON DELETE CASCADE,
    asset_thesis_id UUID REFERENCES asset_theses(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('supports', 'refutes', 'foundation')),
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Must link to exactly one thesis type
    CONSTRAINT exactly_one_thesis CHECK (
        (macro_thesis_id IS NOT NULL AND asset_thesis_id IS NULL) OR
        (macro_thesis_id IS NULL AND asset_thesis_id IS NOT NULL)
    ),
    
    -- Prevent duplicate linkages
    CONSTRAINT unique_claim_macro_thesis UNIQUE (main_claim_id, macro_thesis_id),
    CONSTRAINT unique_claim_asset_thesis UNIQUE (main_claim_id, asset_thesis_id)
);

-- Indexes for common queries
CREATE INDEX idx_claim_thesis_links_claim ON claim_thesis_links(main_claim_id);
CREATE INDEX idx_claim_thesis_links_macro ON claim_thesis_links(macro_thesis_id) WHERE macro_thesis_id IS NOT NULL;
CREATE INDEX idx_claim_thesis_links_asset ON claim_thesis_links(asset_thesis_id) WHERE asset_thesis_id IS NOT NULL;
CREATE INDEX idx_claim_thesis_links_type ON claim_thesis_links(link_type);

-- RLS policies (match existing pattern)
ALTER TABLE claim_thesis_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read claim_thesis_links" ON claim_thesis_links
    FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert claim_thesis_links" ON claim_thesis_links
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update claim_thesis_links" ON claim_thesis_links
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete claim_thesis_links" ON claim_thesis_links
    FOR DELETE TO anon USING (true);

COMMENT ON TABLE claim_thesis_links IS 'Links between main_claims and macro/asset theses with semantic relationship type';
COMMENT ON COLUMN claim_thesis_links.link_type IS 'supports = evidence for thesis, refutes = evidence against, foundation = provides context';
COMMENT ON COLUMN claim_thesis_links.confidence IS 'LLM confidence in the linkage (0.0-1.0)';
COMMENT ON COLUMN claim_thesis_links.reasoning IS 'Explanation of why claim relates to thesis';
