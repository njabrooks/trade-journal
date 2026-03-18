-- Signal Entity Links: junction table for many-to-many signal ↔ entity relationships
-- Replaces direct strategy_id/thesis_id/thesis_type on signals table

BEGIN;

CREATE TABLE signal_entity_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('thesis', 'strategy')),
  strategy_id uuid REFERENCES strategies(id) ON DELETE CASCADE,
  thesis_id uuid,
  thesis_type text CHECK (thesis_type IN ('macro', 'asset')),
  position_pct integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_entity_links_strategy_unique UNIQUE (signal_id, strategy_id),
  CONSTRAINT signal_entity_links_thesis_unique UNIQUE (signal_id, thesis_id, thesis_type)
);

CREATE INDEX idx_signal_entity_links_signal ON signal_entity_links(signal_id);
CREATE INDEX idx_signal_entity_links_strategy ON signal_entity_links(strategy_id);
CREATE INDEX idx_signal_entity_links_thesis ON signal_entity_links(thesis_id, thesis_type);

COMMIT;
