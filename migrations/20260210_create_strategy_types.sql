-- Create strategy_types table for first-class strategy type management
CREATE TABLE IF NOT EXISTS strategy_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_direction TEXT,          -- 'bullish' | 'bearish' | 'neutral'
  category TEXT,                   -- 'directional' | 'income' | 'hedging' | 'volatility' | 'spread'
  leg_count INTEGER,
  min_dte INTEGER,
  max_dte INTEGER,
  risk_profile TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_strategy_types_active ON strategy_types (is_active);
CREATE INDEX IF NOT EXISTS idx_strategy_types_category ON strategy_types (category);
CREATE INDEX IF NOT EXISTS idx_strategy_types_sort ON strategy_types (sort_order);

COMMENT ON TABLE strategy_types IS 'First-class strategy type entities with rich metadata';
COMMENT ON COLUMN strategy_types.default_direction IS 'Default directional bias: bullish, bearish, or neutral';
COMMENT ON COLUMN strategy_types.category IS 'Strategy category: directional, income, hedging, volatility, or spread';

-- Seed strategy_types from existing distinct strategy_type values
INSERT INTO strategy_types (name)
SELECT DISTINCT strategy_type
FROM strategies
WHERE strategy_type IS NOT NULL
ORDER BY strategy_type
ON CONFLICT (name) DO NOTHING;

-- Add strategy_type_id FK column to strategies
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS strategy_type_id UUID REFERENCES strategy_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_strategies_type_id ON strategies (strategy_type_id);

COMMENT ON COLUMN strategies.strategy_type_id IS 'FK to strategy_types table (replaces strategy_type text column)';

-- Backfill strategy_type_id from existing strategy_type text
UPDATE strategies s
SET strategy_type_id = st.id
FROM strategy_types st
WHERE s.strategy_type = st.name
  AND s.strategy_type IS NOT NULL
  AND s.strategy_type_id IS NULL;

-- Verify: show count of strategies with/without backfilled type_id
SELECT
  count(*) FILTER (WHERE strategy_type IS NOT NULL AND strategy_type_id IS NOT NULL) AS backfilled,
  count(*) FILTER (WHERE strategy_type IS NOT NULL AND strategy_type_id IS NULL) AS missed,
  count(*) FILTER (WHERE strategy_type IS NULL) AS no_type
FROM strategies;
