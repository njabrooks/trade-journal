-- Add option greeks columns to options_chain_snapshots
-- Greeks are provided by the Massive API in the response and were previously
-- only stored in the raw_data JSONB. Extracting to dedicated columns enables
-- efficient joins for portfolio delta % computation.

ALTER TABLE options_chain_snapshots
  ADD COLUMN IF NOT EXISTS delta numeric,
  ADD COLUMN IF NOT EXISTS gamma numeric,
  ADD COLUMN IF NOT EXISTS theta numeric,
  ADD COLUMN IF NOT EXISTS vega numeric;

-- Backfill greeks from existing raw_data JSONB where available
UPDATE options_chain_snapshots
SET
  delta = (raw_data->'greeks'->>'delta')::numeric,
  gamma = (raw_data->'greeks'->>'gamma')::numeric,
  theta = (raw_data->'greeks'->>'theta')::numeric,
  vega  = (raw_data->'greeks'->>'vega')::numeric
WHERE raw_data->'greeks' IS NOT NULL
  AND raw_data->'greeks' != '{}'::jsonb
  AND raw_data->'greeks' != 'null'::jsonb
  AND delta IS NULL;
