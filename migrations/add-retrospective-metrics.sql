-- Execution-quality / excursion retrospective (docs/v2/07 §4d)
-- Frozen-at-close retrospective metrics for the two-axis retrospective:
--   { mfe, mfeDate, mae, maeDate, finalCumulative, captureRatio,
--     giveBackFromPeak, neverInProfit, neverUnderwater, confidence, executionQuality }
-- The numbers are recomputable live from the (frozen) strategy_metrics series;
-- this column is the cheap path for the /performance grid + stores the
-- executionQuality judgment. Nullable: existing closed theses live-compute.

ALTER TABLE macro_theses ADD COLUMN IF NOT EXISTS retrospective_metrics jsonb;
ALTER TABLE asset_theses ADD COLUMN IF NOT EXISTS retrospective_metrics jsonb;
