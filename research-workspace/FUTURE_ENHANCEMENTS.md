# Research Workflow Future Enhancements

**Last Updated**: 2025-12-23
**Status**: Tracking future improvements

---

## 🎯 Option B: Dedicated Claims Table (Planned)

**Current State**: Using enhanced JSONB structure in `research_insights.key_claims`

**Future Enhancement**: Migrate to dedicated `claims` and `claim_mappings` tables for:
- Proper many-to-many relationships
- Better query performance
- Atomic claim-level tracking
- Richer claim graph navigation

### Proposed Schema

```sql
-- Claims table: Individual Toulmin-structured claims
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_insight_id UUID REFERENCES research_insights(id),
  research_artifact_id UUID REFERENCES research_artifacts(id),

  -- Claim hierarchy
  level TEXT NOT NULL,  -- 'main' | 'evidence'
  type TEXT NOT NULL,   -- 'thesis_candidate' | 'view_candidate' | 'supporting' | 'rebutting'

  -- Toulmin framework components
  claim TEXT NOT NULL,
  grounds TEXT NOT NULL,
  warrant TEXT,
  backing TEXT,
  qualifier TEXT,  -- 'high' | 'medium' | 'low' | 'exploratory'
  rebuttal TEXT,

  -- Categorization
  category TEXT,  -- 'macro' | 'asset_specific'
  relevant_tickers TEXT[],
  time_horizon TEXT,  -- 'long_term' | 'medium_term' | 'short_term'

  -- Metadata
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (level IN ('main', 'evidence')),
  CHECK (type IN ('thesis_candidate', 'view_candidate', 'supporting', 'rebutting')),
  CHECK (category IN ('macro', 'asset_specific') OR category IS NULL),
  CHECK (qualifier IN ('high', 'medium', 'low', 'exploratory') OR qualifier IS NULL)
);

-- Claim relationships: How claims relate to each other
CREATE TABLE claim_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_claim_id UUID REFERENCES claims(id),
  target_claim_id UUID REFERENCES claims(id),

  relationship_type TEXT NOT NULL,  -- 'supports' | 'refutes' | 'elaborates'
  strength TEXT,  -- 'strong' | 'moderate' | 'weak'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (relationship_type IN ('supports', 'refutes', 'elaborates')),
  CHECK (strength IN ('strong', 'moderate', 'weak') OR strength IS NULL)
);

-- Claim mappings: How claims map to hierarchy (theses, views, strategies, positions)
CREATE TABLE claim_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id),

  -- Target in hierarchy (one of these must be set)
  macro_thesis_id UUID REFERENCES macro_theses(id),
  asset_thesis_id UUID REFERENCES asset_views(id),
  strategy_id UUID REFERENCES strategies(id),
  position_id UUID REFERENCES positions(id),

  -- Relationship type
  mapping_type TEXT NOT NULL,  -- 'supports' | 'refutes' | 'neutral' | 'exploratory'
  confidence TEXT,  -- 'high' | 'medium' | 'low'

  -- Context
  notes TEXT,
  mapped_by TEXT,  -- 'ai' | 'manual' | 'hybrid'
  mapped_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (mapping_type IN ('supports', 'refutes', 'neutral', 'exploratory')),
  CHECK (confidence IN ('high', 'medium', 'low') OR confidence IS NULL),

  -- Ensure at least one target is set
  CHECK (
    (macro_thesis_id IS NOT NULL)::int +
    (asset_thesis_id IS NOT NULL)::int +
    (strategy_id IS NOT NULL)::int +
    (position_id IS NOT NULL)::int = 1
  )
);

-- Indexes for performance
CREATE INDEX idx_claims_insight ON claims(research_insight_id);
CREATE INDEX idx_claims_artifact ON claims(research_artifact_id);
CREATE INDEX idx_claims_level ON claims(level);
CREATE INDEX idx_claims_type ON claims(type);
CREATE INDEX idx_claims_category ON claims(category);
CREATE INDEX idx_claims_tickers ON claims USING GIN(relevant_tickers);

CREATE INDEX idx_claim_rels_source ON claim_relationships(source_claim_id);
CREATE INDEX idx_claim_rels_target ON claim_relationships(target_claim_id);

CREATE INDEX idx_claim_mappings_claim ON claim_mappings(claim_id);
CREATE INDEX idx_claim_mappings_thesis ON claim_mappings(macro_thesis_id);
CREATE INDEX idx_claim_mappings_view ON claim_mappings(asset_thesis_id);
```

### Benefits of Migration

1. **Query Performance**
   - Index individual claims for fast lookup
   - Query claim graphs efficiently
   - Filter claims by category, qualifier, tickers

2. **Many-to-Many Relationships**
   - One claim can support multiple theses/views
   - One thesis can be supported by many claims
   - Navigate claim graph in both directions

3. **Claim Graph Visualization**
   - Show evidence hierarchy: thesis → main claims → supporting claims
   - Identify weak claims (low qualifier, few supporting claims)
   - Find contradictions (claims that support and refute same thesis)

4. **Richer Analytics**
   - Count claims by category, confidence
   - Track which theses have strongest evidence base
   - Identify claims that support multiple theses (cross-cutting insights)

5. **Audit Trail**
   - Track when claims extracted
   - Who mapped claims to theses/views
   - Version history of claim relationships

### Migration Path

When ready to implement:

1. **Create new tables** (schema above)

2. **Migrate existing JSONB data**:
   ```sql
   -- Extract claims from research_insights.key_claims JSONB
   INSERT INTO claims (
     research_insight_id,
     level,
     type,
     claim,
     grounds,
     warrant,
     qualifier,
     ...
   )
   SELECT
     ri.id,
     (claim->>'level')::TEXT,
     (claim->>'type')::TEXT,
     claim->>'claim',
     claim->>'grounds',
     ...
   FROM research_insights ri,
   jsonb_array_elements(ri.key_claims->'claims') AS claim;
   ```

3. **Update skills** to use new tables instead of JSONB

4. **Deprecate JSONB structure** (keep for backward compatibility initially)

### Use Cases Enabled by Option B

**Claim Graph Navigation**:
```sql
-- Find all evidence supporting a thesis
SELECT c.*
FROM claims c
JOIN claim_mappings cm ON c.id = cm.claim_id
WHERE cm.macro_thesis_id = $1
  AND cm.mapping_type = 'supports'
ORDER BY c.qualifier DESC;

-- Find contradictory claims (supporting AND refuting same thesis)
SELECT mt.title, COUNT(*) as contradictions
FROM macro_theses mt
JOIN claim_mappings cm1 ON mt.id = cm1.macro_thesis_id
JOIN claim_mappings cm2 ON mt.id = cm2.macro_thesis_id
WHERE cm1.mapping_type = 'supports'
  AND cm2.mapping_type = 'refutes'
GROUP BY mt.id, mt.title
HAVING COUNT(*) > 0;
```

**Claim Reuse**:
```sql
-- Find claims that could support a new thesis
SELECT c.*, COUNT(DISTINCT cm.macro_thesis_id) as thesis_count
FROM claims c
LEFT JOIN claim_mappings cm ON c.id = cm.claim_id
WHERE c.category = 'macro'
  AND c.qualifier IN ('high', 'medium')
  AND 'AI' = ANY(c.relevant_tickers)
GROUP BY c.id
ORDER BY thesis_count DESC;
```

**Evidence Strength Analysis**:
```sql
-- Theses with strongest evidence base
SELECT
  mt.title,
  COUNT(DISTINCT cm.claim_id) FILTER (WHERE cm.mapping_type = 'supports') as supporting_claims,
  COUNT(DISTINCT cm.claim_id) FILTER (WHERE cm.mapping_type = 'refutes') as rebutting_claims,
  AVG(CASE c.qualifier
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
  END) as avg_claim_strength
FROM macro_theses mt
LEFT JOIN claim_mappings cm ON mt.id = cm.macro_thesis_id
LEFT JOIN claims c ON cm.claim_id = c.id
WHERE mt.status = 'active'
GROUP BY mt.id, mt.title
ORDER BY supporting_claims DESC, avg_claim_strength DESC;
```

---

## Other Future Enhancements

### 1. Advanced Claim Analysis

- **Claim clustering**: Group similar claims across transcripts
- **Temporal analysis**: Track how claims evolve over time
- **Source credibility**: Weight claims by source reliability

### 2. AI-Assisted Claim Extraction

- Use LLM to auto-extract Toulmin components
- Auto-suggest claim relationships
- Auto-map claims to existing theses/views

### 3. Claim Visualization

- Interactive claim graph UI
- Evidence hierarchy visualization
- Contradiction detection and highlighting

### 4. Integration with Blotter/Triage

- Link claims to trading decisions
- Track which claims influenced which trades
- Retrospective: Which claims were right/wrong?

---

## Implementation Priority

**Phase 1** (Current): Enhanced JSONB structure
- ✅ Prove workflow with flexible JSONB
- ✅ Iterate on claim structure
- ✅ Build muscle memory with Toulmin framework

**Phase 2** (3-6 months): Migrate to Option B
- When JSONB becomes unwieldy
- When need to query claim graphs
- When have substantial claim corpus (>100 claims)

**Phase 3** (6-12 months): Advanced features
- AI-assisted extraction
- Visualization
- Integration with decision tracking

---

## Notes

- Keep JSONB structure migration-friendly (use same field names)
- Document claim extraction patterns as we discover them
- Track pain points with JSONB approach to inform Option B design
- Consider Supabase Edge Functions for claim graph queries

**Status**: Documented 2025-12-23, ready to implement when needed
