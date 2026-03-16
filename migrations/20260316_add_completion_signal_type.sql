-- Add 'completion' to signals type check constraint
-- Part of thesis signal redesign: focused signals with confirmation/invalidation/completion types

ALTER TABLE signals DROP CONSTRAINT signals_type_check;
ALTER TABLE signals ADD CONSTRAINT signals_type_check
  CHECK (type = ANY (ARRAY['validation', 'invalidation', 'confirmation', 'warning', 'completion']));
