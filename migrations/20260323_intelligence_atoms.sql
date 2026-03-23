-- Intelligence Atoms: normalized cross-source intelligence with processing state
-- Enables lifecycle-aware intelligence routing (Phase A of intelligence-to-belief architecture)

CREATE TABLE IF NOT EXISTS intel_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  headline TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  tickers TEXT[] DEFAULT '{}',
  resolved_underlying_ids UUID[] DEFAULT '{}',
  processing_status TEXT NOT NULL DEFAULT 'pending',
  processing_result TEXT,
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_table, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_intel_items_processing ON intel_items (processing_status);
CREATE INDEX IF NOT EXISTS idx_intel_items_occurred ON intel_items (occurred_at);
CREATE INDEX IF NOT EXISTS idx_intel_items_tickers ON intel_items USING GIN (tickers);
CREATE INDEX IF NOT EXISTS idx_intel_items_source ON intel_items (source_key);

-- Backfill from existing source tables

-- Analyst actions
INSERT INTO intel_items (source_key, source_table, source_record_id, occurred_at, headline, body, severity, tickers, metadata, processing_status)
SELECT
  'finnhub_analyst',
  'analyst_actions',
  id::text,
  action_date,
  COALESCE(analyst_firm, 'Unknown') || ' ' || COALESCE(action, '') || ' ' || ticker || COALESCE(' from ' || from_grade || ' to ' || to_grade, ''),
  NULL,
  'medium',
  ARRAY[ticker],
  jsonb_build_object('action', action, 'from_grade', from_grade, 'to_grade', to_grade, 'analyst_firm', analyst_firm),
  'pending'
FROM analyst_actions
ON CONFLICT (source_table, source_record_id) DO NOTHING;

-- SEC filings
INSERT INTO intel_items (source_key, source_table, source_record_id, occurred_at, headline, body, severity, tickers, metadata, processing_status)
SELECT
  'sec_edgar',
  'sec_filings',
  id::text,
  filed_at,
  COALESCE(ticker, 'N/A') || ' ' || COALESCE(form_type, '') || ': ' || COALESCE(title, 'SEC Filing'),
  description,
  CASE WHEN form_type IN ('8-K', '4', 'SC 13D', 'SC 13G') THEN 'high' ELSE 'medium' END,
  CASE WHEN ticker IS NOT NULL THEN ARRAY[ticker] ELSE '{}' END,
  jsonb_build_object('form_type', form_type, 'accession_number', accession_number),
  'pending'
FROM sec_filings
ON CONFLICT (source_table, source_record_id) DO NOTHING;

-- Economic events
INSERT INTO intel_items (source_key, source_table, source_record_id, occurred_at, headline, body, severity, tickers, metadata, processing_status)
SELECT
  'economic_calendar',
  'economic_events',
  id::text,
  event_date,
  COALESCE(country, '') || ' ' || COALESCE(title, indicator),
  NULL,
  COALESCE(impact_level, 'info'),
  '{}',
  jsonb_build_object('indicator', indicator, 'actual', actual, 'forecast', forecast, 'previous', previous, 'country', country, 'category', category),
  'pending'
FROM economic_events
WHERE event_date >= now() - interval '30 days'
ON CONFLICT (source_table, source_record_id) DO NOTHING;

-- Earnings events
INSERT INTO intel_items (source_key, source_table, source_record_id, occurred_at, headline, body, severity, tickers, metadata, processing_status)
SELECT
  'earnings_calendar',
  'earnings_events',
  id::text,
  event_date,
  ticker || ' ' || COALESCE(quarter, '') || ' Earnings' || CASE WHEN eps_actual IS NOT NULL THEN ': EPS $' || eps_actual::text ELSE '' END,
  NULL,
  CASE
    WHEN eps_actual IS NOT NULL AND eps_estimate IS NOT NULL AND ABS(eps_actual - eps_estimate) / GREATEST(ABS(eps_estimate), 0.01) > 0.1 THEN 'high'
    ELSE 'medium'
  END,
  ARRAY[ticker],
  jsonb_build_object('eps_actual', eps_actual, 'eps_estimate', eps_estimate, 'revenue_actual', revenue_actual, 'revenue_estimate', revenue_estimate, 'quarter', quarter),
  'pending'
FROM earnings_events
WHERE event_date >= now() - interval '30 days'
ON CONFLICT (source_table, source_record_id) DO NOTHING;

-- Insider transactions
INSERT INTO intel_items (source_key, source_table, source_record_id, occurred_at, headline, body, severity, tickers, metadata, processing_status)
SELECT
  'insider_transaction',
  'insider_transactions',
  id::text,
  transaction_date,
  ticker || ' insider ' || CASE WHEN transaction_code = 'P' THEN 'purchase' WHEN transaction_code = 'S' THEN 'sale' ELSE transaction_code END || ' by ' || COALESCE(insider_name, 'Unknown'),
  NULL,
  CASE WHEN ABS(COALESCE(shares, 0) * COALESCE(transaction_price, 0)) > 1000000 THEN 'high' ELSE 'medium' END,
  ARRAY[ticker],
  jsonb_build_object('insider_name', insider_name, 'shares', shares, 'transaction_price', transaction_price, 'transaction_code', transaction_code),
  'pending'
FROM insider_transactions
WHERE transaction_date >= now() - interval '30 days'
ON CONFLICT (source_table, source_record_id) DO NOTHING;

-- Intelligence items (from world monitor / thesis monitor reports)
INSERT INTO intel_items (source_key, source_table, source_record_id, occurred_at, headline, body, severity, tickers, metadata, processing_status)
SELECT
  CASE WHEN ir.report_type = 'thesis-monitor' THEN 'thesis_monitor' ELSE 'world_monitor' END,
  'intelligence_items',
  ii.id::text,
  ir.generated_at,
  ii.headline,
  ii.body,
  COALESCE(ii.severity, 'info'),
  COALESCE(ii.relevant_tickers, '{}'),
  jsonb_build_object('report_id', ii.report_id, 'report_type', ir.report_type, 'sector', ii.sector),
  CASE WHEN ir.report_type = 'thesis-monitor' THEN 'processed' ELSE 'pending' END
FROM intelligence_items ii
JOIN intelligence_reports ir ON ir.id = ii.report_id
WHERE ir.generated_at >= now() - interval '30 days'
ON CONFLICT (source_table, source_record_id) DO NOTHING;
