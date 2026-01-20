-- Migration: Create view joining journal_entries to underlyings
-- Purpose: Enable filtering journal entries by underlying ticker
-- Date: 2026-01-20

-- Drop existing view if it exists
DROP VIEW IF EXISTS journal_entries_with_underlying;

-- Create view that derives underlying_ticker based on object_type
-- Uses parent_underlying when present (e.g., IBIT -> BTC)
-- For macro_thesis: creates one row per linked asset thesis (for proper filtering)
CREATE VIEW journal_entries_with_underlying AS
-- Non-macro_thesis entries (single row per journal entry)
SELECT
  j.*,
  COALESCE(
    -- For strategies: resolve to parent underlying if exists
    COALESCE(u_strategy_parent.ticker, u_strategy.ticker),
    -- For positions: resolve to parent underlying if exists
    COALESCE(u_position_parent.ticker, u_position.ticker),
    -- For asset_thesis: resolve to parent underlying if exists
    COALESCE(u_asset_thesis_parent.ticker, u_asset_thesis.ticker)
  ) AS underlying_ticker
FROM journal_entries j
-- Join path for strategies (with parent resolution)
LEFT JOIN strategies s ON j.object_type = 'strategy' AND j.object_id = s.id
LEFT JOIN strategy_templates st_s ON s.strategy_template_id = st_s.id
LEFT JOIN underlyings u_strategy ON st_s.underlying_id = u_strategy.id
LEFT JOIN underlyings u_strategy_parent ON u_strategy.parent_underlying_id = u_strategy_parent.id
-- Join path for positions (with parent resolution)
LEFT JOIN positions p ON j.object_type = 'position' AND j.object_id = p.id
LEFT JOIN strategies s_p ON p.strategy_id = s_p.id
LEFT JOIN strategy_templates st_p ON s_p.strategy_template_id = st_p.id
LEFT JOIN underlyings u_position ON st_p.underlying_id = u_position.id
LEFT JOIN underlyings u_position_parent ON u_position.parent_underlying_id = u_position_parent.id
-- Join path for asset_thesis (with parent resolution)
LEFT JOIN asset_theses at ON j.object_type = 'asset_thesis' AND j.object_id = at.id
LEFT JOIN underlyings u_asset_thesis ON at.underlying_id = u_asset_thesis.id
LEFT JOIN underlyings u_asset_thesis_parent ON u_asset_thesis.parent_underlying_id = u_asset_thesis_parent.id
WHERE j.object_type != 'macro_thesis'

UNION ALL

-- Macro thesis entries: one row per linked asset thesis underlying
SELECT
  j.*,
  COALESCE(u_parent.ticker, u.ticker) AS underlying_ticker
FROM journal_entries j
JOIN asset_thesis_related_macro_theses rel ON j.object_type = 'macro_thesis' AND rel.macro_thesis_id = j.object_id
JOIN asset_theses at2 ON rel.asset_thesis_id = at2.id
JOIN underlyings u ON at2.underlying_id = u.id
LEFT JOIN underlyings u_parent ON u.parent_underlying_id = u_parent.id

UNION ALL

-- Macro thesis entries with NO linked asset theses (show with NULL underlying)
SELECT
  j.*,
  NULL AS underlying_ticker
FROM journal_entries j
WHERE j.object_type = 'macro_thesis'
AND NOT EXISTS (
  SELECT 1 FROM asset_thesis_related_macro_theses rel
  WHERE rel.macro_thesis_id = j.object_id
);

-- Add comment
COMMENT ON VIEW journal_entries_with_underlying IS 'Journal entries with underlying_ticker resolved to economic underlying (uses parent_underlying when present, e.g., IBIT -> BTC)';

-- Create index on underlying columns to speed up the view joins
-- (These may already exist, using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_strategies_template_id ON strategies(strategy_template_id);
CREATE INDEX IF NOT EXISTS idx_strategy_templates_underlying_id ON strategy_templates(underlying_id);
CREATE INDEX IF NOT EXISTS idx_positions_strategy_id ON positions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_asset_theses_underlying_id ON asset_theses(underlying_id);
