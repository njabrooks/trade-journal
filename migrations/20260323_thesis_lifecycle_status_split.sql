-- Migration: Split thesis 'active' status into 'developing' and 'monitoring'
-- Date: 2026-03-23
--
-- Logic:
--   active + has articulation record → monitoring
--   active + no articulation record → developing

-- Update macro_theses
UPDATE macro_theses
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM thesis_articulations ta
    WHERE ta.thesis_id = macro_theses.id
      AND ta.thesis_type = 'macro'
  ) THEN 'monitoring'
  ELSE 'developing'
END,
updated_at = NOW()
WHERE status = 'active';

-- Update asset_theses
UPDATE asset_theses
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM thesis_articulations ta
    WHERE ta.thesis_id = asset_theses.id
      AND ta.thesis_type = 'asset'
  ) THEN 'monitoring'
  ELSE 'developing'
END,
updated_at = NOW()
WHERE status = 'active';

-- Update default value for macro_theses.status
ALTER TABLE macro_theses ALTER COLUMN status SET DEFAULT 'developing';

-- Update default value for asset_theses.status
ALTER TABLE asset_theses ALTER COLUMN status SET DEFAULT 'developing';
