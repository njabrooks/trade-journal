-- Migration: Set status='merged' for strategies that were merge sources
-- These strategies had their positions and trades reassigned to a target strategy,
-- leaving them with status='complete' but no positions and no trades.

-- Identify merged strategies: complete, no positions, no trades
-- (Genuinely closed strategies still have their trades even if positions are closed)
UPDATE strategies
SET status = 'merged', updated_at = NOW()
WHERE status = 'complete'
  AND closed_at IS NULL  -- force-closed strategies have closedAt set
  AND id NOT IN (SELECT DISTINCT strategy_id FROM positions WHERE strategy_id IS NOT NULL)
  AND id NOT IN (SELECT DISTINCT strategy_id FROM trades WHERE strategy_id IS NOT NULL);
