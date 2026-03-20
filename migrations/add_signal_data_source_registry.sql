-- Signal Data Source Registry
-- Browsable library of all available data sources for signal configuration.
-- Used by the configure-signal skill (dynamic lookup) and future UI page.

CREATE TABLE IF NOT EXISTS signal_data_source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('price', 'fundamental', 'economic', 'sentiment', 'qualitative', 'derived', 'internal')),
  measure_type TEXT NOT NULL CHECK (measure_type IN ('quantitative', 'qualitative')),
  available_metrics JSONB NOT NULL DEFAULT '[]',
  asset_scope TEXT NOT NULL CHECK (asset_scope IN ('per_ticker', 'global', 'per_thesis')),
  supported_tickers TEXT[],
  ingestion_method TEXT NOT NULL CHECK (ingestion_method IN ('automated_cron', 'automated_derived', 'manual_skill', 'manual_cdp')),
  ingestion_script TEXT,
  ingestion_schedule TEXT,
  config_template JSONB NOT NULL,
  config_example JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed all current data sources

INSERT INTO signal_data_source_registry (key, name, description, category, measure_type, available_metrics, asset_scope, ingestion_method, ingestion_script, ingestion_schedule, config_template, config_example) VALUES

-- Price sources
('tradingview_cdp', 'TradingView (CDP)', 'Real-time and historical price/market cap data via Chrome DevTools Protocol', 'price', 'quantitative',
  '[{"metric": "spot", "unit": "USD", "description": "Current spot price"}, {"metric": "market_cap", "unit": "USD", "description": "Market capitalisation"}]'::jsonb,
  'per_ticker', 'automated_cron', 'scripts/collect-signal-data.ts', 'daily 06:00 UTC',
  '{"dataSource": "tradingview_cdp", "ticker": "{{TICKER}}", "metric": "{{METRIC}}", "threshold": "{{THRESHOLD}}", "thresholdUnit": "{{UNIT}}", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  '{"dataSource": "tradingview_cdp", "ticker": "BTCUSD", "metric": "spot", "threshold": 500000, "thresholdUnit": "USD", "operator": "gte", "checkFrequency": "daily"}'::jsonb),

('coingecko', 'CoinGecko', 'Crypto market data: prices, market caps, volumes via CoinGecko API', 'price', 'quantitative',
  '[{"metric": "market_data.market_cap.usd", "unit": "USD", "description": "Market cap"}, {"metric": "market_data.current_price.usd", "unit": "USD", "description": "Current price"}]'::jsonb,
  'per_ticker', 'automated_cron', 'scripts/collect-signal-data.ts', 'daily 06:00 UTC',
  '{"dataSource": "coingecko", "endpoint": "https://api.coingecko.com/api/v3/coins/{{COIN_ID}}", "metric": "{{METRIC}}", "threshold": "{{THRESHOLD}}", "thresholdUnit": "{{UNIT}}", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  '{"dataSource": "coingecko", "endpoint": "https://api.coingecko.com/api/v3/coins/hyperliquid", "metric": "market_data.market_cap.usd", "threshold": 40000000000, "thresholdUnit": "USD", "operator": "gte", "checkFrequency": "daily"}'::jsonb),

('strategy_price', 'Strategy Entry/Exit Prices', 'Price levels relative to strategy TP/SL targets, synced from TradingView drawings', 'price', 'quantitative',
  '[{"metric": "pct_to_stop", "unit": "percent", "description": "Distance to stop loss"}, {"metric": "pct_to_target", "unit": "percent", "description": "Distance to target"}]'::jsonb,
  'per_ticker', 'automated_derived', 'scripts/collect-signal-data.ts', 'on each price update',
  '{"dataSource": "strategy_price"}'::jsonb,
  NULL),

('price_history', 'Price History (Correlation)', 'Historical price series for BTC, SPX, NDX used in correlation calculations', 'price', 'quantitative',
  '[{"metric": "30d_rolling_correlation", "unit": "ratio", "description": "30-day rolling correlation coefficient"}, {"metric": "90d_rolling_correlation", "unit": "ratio", "description": "90-day rolling correlation coefficient"}]'::jsonb,
  'global', 'automated_cron', 'scripts/collect-signal-data.ts', 'daily 06:00 UTC',
  '{"dataSource": "derived", "calculation": "30d_rolling_correlation(BTC, NASDAQ)", "threshold": "{{THRESHOLD}}", "thresholdUnit": "ratio", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  NULL),

-- Fundamental sources
('defillama', 'DefiLlama', 'DeFi protocol metrics: TVL, fees, revenue via DefiLlama API', 'fundamental', 'quantitative',
  '[{"metric": "total30d", "unit": "USD", "description": "30-day total fees/revenue"}, {"metric": "total24h", "unit": "USD", "description": "24-hour fees/revenue"}, {"metric": "total7d", "unit": "USD", "description": "7-day fees/revenue"}]'::jsonb,
  'per_ticker', 'automated_cron', 'scripts/collect-signal-data.ts', 'daily 06:00 UTC',
  '{"dataSource": "defillama", "endpoint": "https://api.llama.fi/summary/fees/{{PROTOCOL}}?dataType=dailyRevenue", "metric": "{{METRIC}}", "calculation": "{{CALCULATION}}", "threshold": "{{THRESHOLD}}", "thresholdUnit": "{{UNIT}}", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  '{"dataSource": "defillama", "endpoint": "https://api.llama.fi/summary/fees/hyperliquid?dataType=dailyRevenue", "metric": "total30d", "calculation": "total30d * 12", "threshold": 1400000000, "thresholdUnit": "USD", "operator": "gte", "checkFrequency": "daily"}'::jsonb),

('hypeflows', 'HypeFlows', 'Hyperliquid-specific perp market share and volume data', 'fundamental', 'quantitative',
  '[{"metric": "market_share_pct", "unit": "percent", "description": "Global perp market share by volume"}]'::jsonb,
  'per_ticker', 'automated_cron', 'scripts/collect-signal-data.ts', 'daily 06:00 UTC',
  '{"dataSource": "hypeflows", "metric": "market_share_pct", "endpoint": "https://hypeflows.com/api/perp-data?metric=volume", "threshold": "{{THRESHOLD}}", "thresholdUnit": "%", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  NULL),

('derived', 'Derived/Composite Metrics', 'Calculated from multiple sources: P/E ratios, correlation coefficients, valuation per MW', 'derived', 'quantitative',
  '[{"metric": "custom_calculation", "unit": "varies", "description": "User-defined formula from multiple sources"}]'::jsonb,
  'per_ticker', 'automated_derived', 'scripts/collect-signal-data.ts', 'on dependency update',
  '{"dataSource": "derived", "calculation": "{{FORMULA}}", "threshold": "{{THRESHOLD}}", "thresholdUnit": "{{UNIT}}", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  '{"dataSource": "derived", "calculation": "market_cap / annualized_revenue", "threshold": 17.5, "thresholdUnit": "ratio", "operator": "between", "checkFrequency": "daily"}'::jsonb),

-- Economic sources
('economic_calendar', 'Economic Calendar (Finnhub)', 'Scheduled macro economic data releases: CPI, NFP, FOMC, GDP, etc.', 'economic', 'quantitative',
  '[{"metric": "days_until_event", "unit": "days", "description": "Countdown to next occurrence"}, {"metric": "event_actual_vs_forecast", "unit": "varies", "description": "Release surprise: actual minus forecast"}]'::jsonb,
  'global', 'automated_cron', 'scripts/ingest-economic-calendar.ts', 'daily 05:00 UTC',
  '{"dataSource": "economic_calendar", "calculation": "{{CALCULATION}}", "eventType": "{{EVENT_TYPE}}", "country": "{{COUNTRY}}", "threshold": "{{THRESHOLD}}", "thresholdUnit": "{{UNIT}}", "operator": "{{OPERATOR}}", "checkFrequency": "daily"}'::jsonb,
  '{"dataSource": "economic_calendar", "calculation": "event_actual_vs_forecast", "eventType": "CPI_MM", "country": "US", "direction": "below_forecast", "threshold": 0.1, "thresholdUnit": "percentage_points", "checkFrequency": "daily"}'::jsonb),

-- Qualitative sources
('qualitative', 'Manual Qualitative Assessment', 'Human or LLM-assessed qualitative evidence against signal statements via assess-validation-evidence skill', 'qualitative', 'qualitative',
  '[{"metric": "assessment", "unit": "enum", "description": "neutral/strengthening/weakening/confirmed/invalidated"}]'::jsonb,
  'per_thesis', 'manual_skill', NULL, NULL,
  '{"dataSource": "news_qualitative", "monitorKeywords": ["{{KEYWORDS}}"], "monitorContext": "{{CONTEXT}}", "checkFrequency": "weekly"}'::jsonb,
  '{"dataSource": "news_qualitative", "monitorKeywords": ["Galaxy Digital", "Helios", "200MW"], "monitorContext": "Track Galaxy Digital press releases for Helios Phase 1 going operational.", "deadline": "2026-06-30", "checkFrequency": "weekly"}'::jsonb),

('thesis_monitor', 'Thesis Monitor (Automated)', 'Automated qualitative assessment from world monitor intelligence reports via generateQualitativeSnapshots()', 'qualitative', 'qualitative',
  '[{"metric": "assessment", "unit": "enum", "description": "neutral/strengthening (automated can only produce these two)"}]'::jsonb,
  'per_thesis', 'automated_cron', 'scripts/ingest-world-monitor.ts', 'twice daily via Paperclip agent',
  '{"dataSource": "thesis_monitor"}'::jsonb,
  NULL),

('daily_synthesis', 'Daily Synthesis', 'Automated daily signal synthesis aggregating all sources for a rollup assessment', 'qualitative', 'qualitative',
  '[{"metric": "assessment", "unit": "enum", "description": "Daily rollup assessment"}]'::jsonb,
  'per_thesis', 'automated_cron', 'scripts/collect-signal-data.ts', 'daily 06:00 UTC',
  '{"dataSource": "daily_synthesis"}'::jsonb,
  NULL),

-- Internal sources
('internal_db', 'Internal DB State', 'Monitors internal database state: parent thesis status, confidence level changes', 'internal', 'qualitative',
  '[{"metric": "parent_thesis_status", "unit": "enum", "description": "Status of parent thesis (active/rejected/complete)"}]'::jsonb,
  'per_thesis', 'automated_derived', 'scripts/collect-signal-data.ts', 'on thesis status change',
  '{"dataSource": "internal_db", "parentThesisId": "{{THESIS_ID}}", "parentThesisTitle": "{{THESIS_TITLE}}", "metric": "status_or_confidence", "logic": "any", "conditions": [{"field": "status", "label": "Parent thesis rejected", "operator": "eq", "threshold": "rejected"}, {"field": "confidence_level", "label": "Parent thesis confidence downgraded to low", "operator": "eq", "threshold": "low"}], "checkFrequency": "daily"}'::jsonb,
  NULL);
