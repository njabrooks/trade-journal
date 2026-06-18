-- W8 relate-research: dedup indexes surfaced by the code review (findings M3 / L3).
--
-- 1. Atomic upsert key for promoteClaim — prevents duplicate main_claims when
--    relate-research runs overlap (the SELECT-then-INSERT dedup was racy). NULLS
--    DISTINCT (Postgres default) leaves manually-created claims (null provenance)
--    completely unaffected — uniqueness is only enforced when both columns are set.
CREATE UNIQUE INDEX IF NOT EXISTS main_claims_source_provenance_unique
  ON main_claims (source_insight_id, source_claim_id);

-- 2. One research_routing snapshot per (signal, claim) — backs the recordSignalEvidence
--    dedup so a re-run heals a missing claim_signal_evidences row instead of
--    duplicating snapshots. Partial: only research_routing rows set claim_id, so this
--    never touches the daily/quantitative snapshot rows (claim_id IS NULL there).
CREATE UNIQUE INDEX IF NOT EXISTS signal_data_snapshots_research_routing_unique
  ON signal_data_snapshots (signal_id, claim_id)
  WHERE data_source = 'research_routing';
