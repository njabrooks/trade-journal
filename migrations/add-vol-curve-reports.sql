-- Vol Curve Reports table
-- Stores saved vol curve analysis reports for browsing in the Trade Journal UI

CREATE TABLE IF NOT EXISTS vol_curve_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,
  target_base NUMERIC NOT NULL,
  target_high NUMERIC NOT NULL,
  horizon_months NUMERIC NOT NULL,
  downside_floor NUMERIC NOT NULL,
  spot NUMERIC NOT NULL,
  iv30 NUMERIC,
  rv20 NUMERIC,
  iv_rv_ratio NUMERIC,
  iv_rank NUMERIC,
  strategy_count INTEGER NOT NULL DEFAULT 0,
  top_strategy_label TEXT,
  top_strategy_type TEXT,
  report_data JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vol_curve_reports_ticker ON vol_curve_reports(ticker);
CREATE INDEX IF NOT EXISTS idx_vol_curve_reports_created ON vol_curve_reports(created_at);
