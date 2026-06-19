-- D1 (docs/v2/10 §5) — Loose-agent thesis-underwriting model: schema generalizations.
--
-- Two generalizations of stores we already have (no new tables, per §6):
--   1. research_artifacts.source_type widened so any source can feed the underwriting.
--   2. main_claims gets direct artifact provenance so a lightweight observation
--      (conversation / deep-research / agent-research) can cite its source artifact
--      WITHOUT a synthetic research_insight row.
--
-- main_claims is already relaxed at the DDL level: only id/title/category/claim/status
-- and timestamps are NOT NULL; the Toulmin fields (evidence/reasoning/backing/qualifier/
-- rebuttal/time_horizon) are nullable — so a bare observation is already legal. This
-- migration only adds the missing artifact provenance.
--
-- NOTE: the canonical list of source_type values is mirrored in code at
-- src/lib/ingestion/research.ts (RESEARCH_SOURCE_TYPES). Keep the two in sync.

-- 1. Widen research_artifacts.source_type. The live CHECK is named
--    check_research_source_type (not the Drizzle default). Drop + recreate.
ALTER TABLE research_artifacts DROP CONSTRAINT check_research_source_type;
ALTER TABLE research_artifacts ADD CONSTRAINT check_research_source_type
  CHECK (source_type = ANY (ARRAY[
    'article'::text,
    'transcript'::text,
    'note'::text,
    'report'::text,
    'video'::text,
    'manual'::text,
    'conversation'::text,    -- D1: user/agent conversation insight excerpt
    'deep_research'::text,   -- D1: deep-research pass
    'agent_research'::text   -- D1: ad-hoc agent research
  ]));

-- 2. Direct artifact provenance on main_claims (observation -> its source artifact).
--    Nullable; existing claims keep their source_insight_id provenance untouched.
--    ON DELETE SET NULL mirrors the existing source_insight_id FK semantics.
ALTER TABLE main_claims
  ADD COLUMN source_artifact_id uuid REFERENCES research_artifacts(id) ON DELETE SET NULL;

CREATE INDEX idx_main_claims_source_artifact ON main_claims(source_artifact_id);
