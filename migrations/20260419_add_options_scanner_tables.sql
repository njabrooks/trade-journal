-- =============================================================================
-- Options Scanner — Phase 1 schema
-- Adds: watchlist_entries, vol_scan_runs, vol_scan_ticker_snapshots
-- =============================================================================

-- Radar watchlist — a manually curated universe of underlyings the daily
-- cheap-options scanner evaluates. Seeded from (open positions ∪ active
-- asset_theses ∪ active strategies); extended manually over time.
CREATE TABLE IF NOT EXISTS watchlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  underlying_id UUID NOT NULL REFERENCES underlyings(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_reason TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT watchlist_entries_underlying_id_unique UNIQUE (underlying_id),
  CONSTRAINT watchlist_entries_priority_check CHECK (priority IN ('high', 'normal', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_active
  ON watchlist_entries(is_active) WHERE is_active = true;

COMMENT ON TABLE watchlist_entries IS
  'Radar universe for the daily options scanner. Unique per underlying.';

-- =============================================================================
-- vol_scan_runs — one row per daily scan execution.
-- Audits the thresholds used and the radar size at run time.
-- =============================================================================
CREATE TABLE IF NOT EXISTS vol_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  universe_source TEXT NOT NULL,
  universe_size INTEGER NOT NULL DEFAULT 0,
  iv_percentile_threshold NUMERIC,
  iv_rv20_ratio_threshold NUMERIC,
  lookback_days INTEGER NOT NULL DEFAULT 252,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vol_scan_runs_run_date_universe_unique UNIQUE (run_date, universe_source),
  CONSTRAINT vol_scan_runs_status_check
    CHECK (status IN ('running', 'complete', 'error')),
  CONSTRAINT vol_scan_runs_universe_check
    CHECK (universe_source IN ('watchlist', 'positions', 'thesis', 'manual', 'all'))
);

CREATE INDEX IF NOT EXISTS idx_vol_scan_runs_run_date
  ON vol_scan_runs(run_date DESC);

COMMENT ON TABLE vol_scan_runs IS
  'Per-day audit of options scanner executions. Unique on (run_date, universe_source).';

-- =============================================================================
-- vol_scan_ticker_snapshots — one row per ticker per scan run with cheapness
-- metrics. Phase 1 writes snapshotting data only; Phase 2 will reference these
-- rows from option_strategy_candidates.
-- =============================================================================
CREATE TABLE IF NOT EXISTS vol_scan_ticker_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES vol_scan_runs(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL,

  -- Spot / volatility inputs
  spot NUMERIC,
  iv30 NUMERIC,
  rv20 NUMERIC,
  rv60 NUMERIC,
  iv_rv20_ratio NUMERIC,
  iv_rank_252 NUMERIC,
  iv_percentile_252 NUMERIC,

  -- Term structure
  term_structure_slope NUMERIC,   -- IV_back − IV_front, decimals; positive = normal contango
  front_month_iv NUMERIC,          -- ~30 DTE ATM
  back_month_iv NUMERIC,           -- ~180 DTE ATM (or furthest available up to 270)

  -- Skew (front expiry): 25Δ put IV − 25Δ call IV
  skew_25d NUMERIC,

  -- Scoring
  is_cheap BOOLEAN NOT NULL DEFAULT false,
  cheapness_score NUMERIC,
  gate_iv_percentile BOOLEAN,
  gate_iv_rv_ratio BOOLEAN,
  gate_term_normal BOOLEAN,
  gate_back_below_front BOOLEAN,

  -- Portfolio context
  has_open_position BOOLEAN NOT NULL DEFAULT false,
  linked_asset_thesis_ids UUID[] DEFAULT ARRAY[]::UUID[],

  -- History depth (how many days of IV history were available for percentile)
  history_days INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT vol_scan_snap_run_ticker_unique UNIQUE (run_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_vol_scan_snap_run_cheap
  ON vol_scan_ticker_snapshots(run_id, is_cheap) WHERE is_cheap = true;
CREATE INDEX IF NOT EXISTS idx_vol_scan_snap_ticker_date
  ON vol_scan_ticker_snapshots(ticker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vol_scan_snap_underlying
  ON vol_scan_ticker_snapshots(underlying_id) WHERE underlying_id IS NOT NULL;

COMMENT ON TABLE vol_scan_ticker_snapshots IS
  'Per-ticker cheapness metrics for a given scan run. Phase 1 output.';
