-- Add themes array to macro_theses for freeform keyword matching
-- Complements the structured sectors[] array for intelligence routing
ALTER TABLE macro_theses ADD COLUMN IF NOT EXISTS themes TEXT[] DEFAULT '{}';

COMMENT ON COLUMN macro_theses.themes IS 'Freeform keywords beyond sectors, e.g. rate sensitivity, AI capex cycle';
