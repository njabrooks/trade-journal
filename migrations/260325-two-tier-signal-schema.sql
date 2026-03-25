-- TWO-228 Phase 1: Two-Tier Signal Architecture — Data Model
-- Adds pipeline provenance, gating relationships, macro-to-macro links, and signal trigger actions

-- 1. Pipeline provenance on thesis tables
ALTER TABLE macro_theses
  ADD COLUMN pipeline_stage integer,
  ADD COLUMN pipeline_idea_ref text;

ALTER TABLE asset_theses
  ADD COLUMN pipeline_stage integer,
  ADD COLUMN pipeline_idea_ref text;

ALTER TABLE macro_theses
  ADD CONSTRAINT chk_macro_pipeline_stage CHECK (pipeline_stage IS NULL OR (pipeline_stage >= 1 AND pipeline_stage <= 5));

ALTER TABLE asset_theses
  ADD CONSTRAINT chk_asset_pipeline_stage CHECK (pipeline_stage IS NULL OR (pipeline_stage >= 1 AND pipeline_stage <= 5));

-- 2. Gating relationship type on asset↔macro junction
ALTER TABLE asset_thesis_related_macro_theses
  ADD COLUMN relationship_type text NOT NULL DEFAULT 'related';

ALTER TABLE asset_thesis_related_macro_theses
  ADD CONSTRAINT chk_at_mt_relationship_type CHECK (relationship_type IN ('related', 'gated_by'));

-- 3. Macro-to-macro linking table
CREATE TABLE macro_thesis_related_macro_theses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_macro_thesis_id uuid NOT NULL REFERENCES macro_theses(id) ON DELETE CASCADE,
  target_macro_thesis_id uuid NOT NULL REFERENCES macro_theses(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  relationship_note text,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  CONSTRAINT chk_mt_mt_no_self_link CHECK (source_macro_thesis_id != target_macro_thesis_id),
  CONSTRAINT chk_mt_mt_relationship_type CHECK (relationship_type IN ('parent_of', 'supports', 'contradicts', 'depends_on')),
  CONSTRAINT uq_macro_macro_pair UNIQUE (source_macro_thesis_id, target_macro_thesis_id)
);

CREATE INDEX idx_mt_related_mt_source ON macro_thesis_related_macro_theses(source_macro_thesis_id);
CREATE INDEX idx_mt_related_mt_target ON macro_thesis_related_macro_theses(target_macro_thesis_id);

-- 4. Trigger action on signals
ALTER TABLE signals
  ADD COLUMN trigger_action jsonb;
