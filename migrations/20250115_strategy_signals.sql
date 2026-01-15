-- Migration: Add strategy support to validation_points table (aka signals)
-- Date: 2025-01-15
-- Description: Extend signals to support strategies, enabling configurable triggers for positions
-- Also updates terminology: validation/invalidation → confirmation/warning

-- 1. Add new columns for strategy support
ALTER TABLE validation_points
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'thesis',
  ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Make thesis_id nullable (will be null for strategy signals)
ALTER TABLE validation_points ALTER COLUMN thesis_id DROP NOT NULL;

-- 3. Also make thesis_type nullable (will be null for strategy signals)
ALTER TABLE validation_points ALTER COLUMN thesis_type DROP NOT NULL;

-- 4. Make timeframe nullable with default (not relevant for strategy signals)
ALTER TABLE validation_points ALTER COLUMN timeframe DROP NOT NULL;
ALTER TABLE validation_points ALTER COLUMN timeframe SET DEFAULT 'medium_term';

-- 5. Make response_protocol nullable with default (not relevant for strategy signals)
ALTER TABLE validation_points ALTER COLUMN response_protocol DROP NOT NULL;
ALTER TABLE validation_points ALTER COLUMN response_protocol SET DEFAULT '{}';

-- 6. Update type check constraint to use new terminology
ALTER TABLE validation_points DROP CONSTRAINT IF EXISTS validation_points_type_check;
ALTER TABLE validation_points
  ADD CONSTRAINT validation_points_type_check
  CHECK (type = ANY (ARRAY['validation'::text, 'invalidation'::text, 'confirmation'::text, 'warning'::text]));

-- 7. Update category check constraint to use new terminology
ALTER TABLE validation_points DROP CONSTRAINT IF EXISTS validation_points_category_check;
ALTER TABLE validation_points
  ADD CONSTRAINT validation_points_category_check
  CHECK (category = ANY (ARRAY['explicit'::text, 'judgment_required'::text, 'judgment'::text, 'data_driven'::text]));

-- 8. Update thesis_type check constraint to allow NULL
ALTER TABLE validation_points DROP CONSTRAINT IF EXISTS validation_points_thesis_type_check;
ALTER TABLE validation_points
  ADD CONSTRAINT validation_points_thesis_type_check
  CHECK ((thesis_type = ANY (ARRAY['macro'::text, 'asset'::text])) OR thesis_type IS NULL);

-- 9. Add constraint: entity references must match entity_type
ALTER TABLE validation_points DROP CONSTRAINT IF EXISTS validation_points_entity_check;
ALTER TABLE validation_points
  ADD CONSTRAINT validation_points_entity_check CHECK (
    (entity_type = 'thesis' AND thesis_id IS NOT NULL AND strategy_id IS NULL) OR
    (entity_type = 'strategy' AND strategy_id IS NOT NULL AND thesis_id IS NULL)
  );

-- 10. Create index for strategy signals lookup
CREATE INDEX IF NOT EXISTS idx_validation_points_strategy ON validation_points(strategy_id) WHERE strategy_id IS NOT NULL;

-- 11. Create index for entity_type filtering
CREATE INDEX IF NOT EXISTS idx_validation_points_entity_type ON validation_points(entity_type);

-- 12. Update existing signals to have entity_type = 'thesis' (should already be default)
UPDATE validation_points SET entity_type = 'thesis' WHERE entity_type IS NULL;

-- Verification queries (run manually to confirm):
-- SELECT entity_type, COUNT(*) FROM validation_points GROUP BY entity_type;
-- \d validation_points
