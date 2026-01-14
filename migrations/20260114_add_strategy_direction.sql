-- Add direction column to strategies table
-- Stores directional bias: 'bullish' | 'bearish' | 'neutral'

ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS direction TEXT;

-- Add comment for documentation
COMMENT ON COLUMN strategies.direction IS 'Strategy directional bias: bullish, bearish, or neutral';
