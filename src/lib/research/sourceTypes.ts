/**
 * Canonical research_artifacts.source_type values (docs/v2/10 §5).
 *
 * Leaf module — ZERO imports — so both `src/` code and `scripts/` (which load the DB
 * via scripts/lib/db.ts) can import it without triggering the db-client import hoisting
 * problem (see CLAUDE.md: never import src/db/index.ts from a script).
 *
 * The DB CHECK constraint `check_research_source_type` mirrors this list — keep the two
 * in sync (see migrations/loose-agent-source-types-and-claim-provenance.sql).
 * `thread` is an input-only alias (normalized to `article` on write), not a DB value.
 */
export const RESEARCH_SOURCE_TYPES = [
  'article',
  'transcript',
  'note',
  'report',
  'video',
  'manual',
  'conversation', // user/agent conversation insight excerpt (D1)
  'deep_research', // deep-research pass (D1)
  'agent_research', // ad-hoc agent research (D1)
] as const;

export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];
