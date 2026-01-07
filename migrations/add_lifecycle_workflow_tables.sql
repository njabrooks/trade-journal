-- Migration: Add Lifecycle Workflow Orchestration Tables
-- Purpose: Enable triage as the universal workflow management layer
-- See: docs/features/triage-workflow-orchestration.md
-- Date: 2026-01-07

-- ============================================================================
-- 1. Add lifecycle_status to thesis tables
-- ============================================================================

-- Macro Theses
ALTER TABLE macro_theses
ADD COLUMN IF NOT EXISTS lifecycle_status TEXT
DEFAULT 'created'
CHECK (lifecycle_status IN (
  'created',           -- Just created, needs claims
  'claims_linked',     -- Has sufficient claims, needs synthesis
  'synthesized',       -- Has articulation, needs V&I points
  'validated',         -- Has V&I points, ready for monitoring
  'monitoring',        -- Active monitoring
  'closed'             -- Thesis complete (validated or invalidated)
));

-- Asset Theses
ALTER TABLE asset_theses
ADD COLUMN IF NOT EXISTS lifecycle_status TEXT
DEFAULT 'created'
CHECK (lifecycle_status IN (
  'created',
  'claims_linked',
  'synthesized',
  'validated',
  'monitoring',
  'closed'
));

-- Add indexes for lifecycle filtering
CREATE INDEX IF NOT EXISTS idx_macro_theses_lifecycle ON macro_theses(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_asset_theses_lifecycle ON asset_theses(lifecycle_status);

-- ============================================================================
-- 2. Extend thesis_triage_records with lifecycle orchestration fields
-- ============================================================================

-- Add lifecycle stage for workflow context
ALTER TABLE thesis_triage_records
ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;

-- Add suggested skill for workflow guidance
ALTER TABLE thesis_triage_records
ADD COLUMN IF NOT EXISTS suggested_skill TEXT;

-- Add human-readable action description
ALTER TABLE thesis_triage_records
ADD COLUMN IF NOT EXISTS action_required TEXT;

-- Add completed tracking
ALTER TABLE thesis_triage_records
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE thesis_triage_records
ADD COLUMN IF NOT EXISTS completed_by TEXT;

-- Add index for lifecycle stage filtering
CREATE INDEX IF NOT EXISTS idx_thesis_triage_lifecycle ON thesis_triage_records(lifecycle_stage);

-- ============================================================================
-- 3. Create blotter_entries table for comprehensive audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS blotter_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Object context (polymorphic)
  object_type TEXT NOT NULL CHECK (object_type IN (
    'macro_thesis',
    'asset_thesis',
    'strategy',
    'position',
    'claim',
    'validation_point'
  )),
  object_id UUID NOT NULL,
  object_title TEXT,

  -- Action details
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,

  -- Linkage to other entities
  triage_record_id UUID,  -- References thesis_triage_records or triage_records
  skill_invoked TEXT,

  -- State change tracking
  previous_state JSONB,
  new_state JSONB,

  -- User rationale (for divergence tracking)
  rationale TEXT,

  -- Provenance
  source TEXT NOT NULL CHECK (source IN ('user', 'skill', 'automation')),

  -- Additional metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_blotter_object ON blotter_entries(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_blotter_timestamp ON blotter_entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blotter_action_type ON blotter_entries(action_type);
CREATE INDEX IF NOT EXISTS idx_blotter_source ON blotter_entries(source);

-- ============================================================================
-- 4. Backfill existing theses with appropriate lifecycle status
-- ============================================================================

-- Set theses with articulations to 'synthesized' or later
UPDATE macro_theses mt
SET lifecycle_status = 'validated'
WHERE EXISTS (
  SELECT 1 FROM thesis_articulations ta
  WHERE ta.thesis_id = mt.id AND ta.thesis_type = 'macro'
)
AND EXISTS (
  SELECT 1 FROM validation_points vp
  WHERE vp.thesis_id = mt.id AND vp.thesis_type = 'macro'
);

UPDATE macro_theses mt
SET lifecycle_status = 'synthesized'
WHERE EXISTS (
  SELECT 1 FROM thesis_articulations ta
  WHERE ta.thesis_id = mt.id AND ta.thesis_type = 'macro'
)
AND NOT EXISTS (
  SELECT 1 FROM validation_points vp
  WHERE vp.thesis_id = mt.id AND vp.thesis_type = 'macro'
)
AND lifecycle_status = 'created';

-- Set theses with linked claims to 'claims_linked'
UPDATE macro_theses mt
SET lifecycle_status = 'claims_linked'
WHERE EXISTS (
  SELECT 1 FROM main_claims mc
  WHERE mt.id = ANY(mc.linked_macro_theses)
)
AND lifecycle_status = 'created';

-- Same for asset theses
UPDATE asset_theses at2
SET lifecycle_status = 'validated'
WHERE EXISTS (
  SELECT 1 FROM thesis_articulations ta
  WHERE ta.thesis_id = at2.id AND ta.thesis_type = 'asset'
)
AND EXISTS (
  SELECT 1 FROM validation_points vp
  WHERE vp.thesis_id = at2.id AND vp.thesis_type = 'asset'
);

UPDATE asset_theses at2
SET lifecycle_status = 'synthesized'
WHERE EXISTS (
  SELECT 1 FROM thesis_articulations ta
  WHERE ta.thesis_id = at2.id AND ta.thesis_type = 'asset'
)
AND NOT EXISTS (
  SELECT 1 FROM validation_points vp
  WHERE vp.thesis_id = at2.id AND vp.thesis_type = 'asset'
)
AND lifecycle_status = 'created';

UPDATE asset_theses at2
SET lifecycle_status = 'claims_linked'
WHERE EXISTS (
  SELECT 1 FROM main_claims mc
  WHERE at2.id = ANY(mc.linked_asset_theses)
)
AND lifecycle_status = 'created';

-- Set theses with monitoring config to 'monitoring'
UPDATE macro_theses mt
SET lifecycle_status = 'monitoring'
WHERE EXISTS (
  SELECT 1 FROM thesis_monitoring_configs tmc
  WHERE tmc.thesis_id = mt.id AND tmc.thesis_type = 'macro' AND tmc.enabled = true
)
AND lifecycle_status = 'validated';

UPDATE asset_theses at2
SET lifecycle_status = 'monitoring'
WHERE EXISTS (
  SELECT 1 FROM thesis_monitoring_configs tmc
  WHERE tmc.thesis_id = at2.id AND tmc.thesis_type = 'asset' AND tmc.enabled = true
)
AND lifecycle_status = 'validated';

-- ============================================================================
-- 5. Comment on design decisions
-- ============================================================================

COMMENT ON COLUMN macro_theses.lifecycle_status IS
'Workflow orchestration status tracking where the thesis is in the synthesis/monitoring lifecycle. Distinct from "status" which tracks validity (active/retired/etc).';

COMMENT ON COLUMN asset_theses.lifecycle_status IS
'Workflow orchestration status tracking where the thesis is in the synthesis/monitoring lifecycle. Distinct from "status" which tracks validity (active/retired/etc).';

COMMENT ON TABLE blotter_entries IS
'Comprehensive audit trail of all actions across all object types. Enables full reconstruction of decision process and supports divergence tracking (stated process vs actual action).';

COMMENT ON COLUMN thesis_triage_records.lifecycle_stage IS
'The lifecycle stage this triage record relates to (e.g., synthesis, monitoring). Used for workflow context.';

COMMENT ON COLUMN thesis_triage_records.suggested_skill IS
'Claude Code skill suggested for completing this triage item (e.g., /synthesize-thesis, /assess-validation-evidence).';
