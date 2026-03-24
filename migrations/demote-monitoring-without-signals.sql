-- Demote monitoring theses back to developing if they have no active/draft signals.
-- These were incorrectly promoted when articulations were created without signals.
-- Going forward, insert-thesis-articulation.ts only promotes when signals are created.

-- Macro theses
UPDATE macro_theses
SET status = 'developing', updated_at = NOW()
WHERE status = 'monitoring'
  AND id NOT IN (
    SELECT DISTINCT sel.thesis_id
    FROM signal_entity_links sel
    JOIN signals s ON s.id = sel.signal_id
    WHERE sel.thesis_type = 'macro'
      AND s.status IN ('active', 'draft')
  );

-- Asset theses
UPDATE asset_theses
SET status = 'developing', updated_at = NOW()
WHERE status = 'monitoring'
  AND id NOT IN (
    SELECT DISTINCT sel.thesis_id
    FROM signal_entity_links sel
    JOIN signals s ON s.id = sel.signal_id
    WHERE sel.thesis_type = 'asset'
      AND s.status IN ('active', 'draft')
  );
