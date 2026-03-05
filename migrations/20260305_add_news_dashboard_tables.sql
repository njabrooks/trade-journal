-- News Dashboard Tables
-- intelligence_reports, intelligence_items, economic_events, earnings_events, sec_filings
-- Plus CIK column on underlyings

-- Add CIK (SEC identifier) to underlyings
ALTER TABLE underlyings ADD COLUMN IF NOT EXISTS cik TEXT;

-- Intelligence Reports (World Monitor metadata + full markdown)
CREATE TABLE IF NOT EXISTS intelligence_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    time_window TEXT,                          -- e.g. '6h'
    version INTEGER DEFAULT 1,
    executive_summary TEXT,
    key_themes TEXT,                            -- Key themes section markdown
    full_markdown TEXT NOT NULL,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,
    sectors TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_report_date_generated UNIQUE (report_date, generated_at)
);

CREATE INDEX IF NOT EXISTS idx_intelligence_reports_date ON intelligence_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_reports_created ON intelligence_reports (created_at DESC);

-- Intelligence Items (individual stories from reports)
CREATE TABLE IF NOT EXISTS intelligence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES intelligence_reports(id) ON DELETE CASCADE,
    severity TEXT NOT NULL,                     -- 'critical' | 'high' | 'medium' | 'info'
    sector TEXT,                                -- 'geopolitics' | 'tech' | 'finance'
    headline TEXT NOT NULL,
    body TEXT,
    source_urls TEXT[] DEFAULT '{}',
    relevant_tickers TEXT[] DEFAULT '{}',
    section TEXT,                               -- 'executive_summary' | 'deep_dive' | 'opportunities'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_report_headline UNIQUE (report_id, headline)
);

CREATE INDEX IF NOT EXISTS idx_intelligence_items_report ON intelligence_items (report_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_items_severity ON intelligence_items (severity);
CREATE INDEX IF NOT EXISTS idx_intelligence_items_sector ON intelligence_items (sector);

-- Economic Events (FRED + Finnhub calendar)
CREATE TABLE IF NOT EXISTS economic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_time TEXT,                            -- e.g. '08:30' ET
    category TEXT,                              -- 'interest_rates' | 'inflation' | 'labor' | 'output' | 'housing' | 'other'
    impact TEXT,                                -- 'high' | 'medium' | 'low'
    country TEXT DEFAULT 'US',
    actual_value TEXT,
    forecast_value TEXT,
    previous_value TEXT,
    unit TEXT,
    source TEXT NOT NULL,                       -- 'fred' | 'finnhub'
    source_id TEXT,                             -- FRED release ID or Finnhub event ID
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_economic_event UNIQUE (event_name, event_date, source)
);

CREATE INDEX IF NOT EXISTS idx_economic_events_date ON economic_events (event_date);
CREATE INDEX IF NOT EXISTS idx_economic_events_category ON economic_events (category);
CREATE INDEX IF NOT EXISTS idx_economic_events_impact ON economic_events (impact);

-- Earnings Events (portfolio holdings earnings calendar)
CREATE TABLE IF NOT EXISTS earnings_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL,
    ticker TEXT NOT NULL,
    report_date DATE NOT NULL,
    report_time TEXT,                           -- 'bmo' (before market open) | 'amc' (after market close) | 'dmh' (during market hours)
    eps_estimate NUMERIC,
    eps_actual NUMERIC,
    revenue_estimate NUMERIC,
    revenue_actual NUMERIC,
    quarter TEXT,                               -- e.g. 'Q1 2026'
    year INTEGER,
    source TEXT NOT NULL DEFAULT 'finnhub',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_earnings_event UNIQUE (ticker, report_date, source)
);

CREATE INDEX IF NOT EXISTS idx_earnings_events_date ON earnings_events (report_date);
CREATE INDEX IF NOT EXISTS idx_earnings_events_ticker ON earnings_events (ticker);
CREATE INDEX IF NOT EXISTS idx_earnings_events_underlying ON earnings_events (underlying_id);

-- SEC Filings (filing notifications for portfolio holdings)
CREATE TABLE IF NOT EXISTS sec_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    underlying_id UUID REFERENCES underlyings(id) ON DELETE SET NULL,
    ticker TEXT NOT NULL,
    cik TEXT NOT NULL,
    accession_number TEXT NOT NULL UNIQUE,
    filing_type TEXT NOT NULL,                  -- '10-K' | '10-Q' | '8-K' | 'DEF 14A' | 'Form 4' | etc.
    filing_category TEXT,                       -- 'annual' | 'quarterly' | 'current' | 'proxy' | 'insider' | 'other'
    filed_date DATE NOT NULL,
    filing_url TEXT NOT NULL,
    description TEXT,
    is_material BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_filings_ticker ON sec_filings (ticker);
CREATE INDEX IF NOT EXISTS idx_sec_filings_date ON sec_filings (filed_date DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filings_type ON sec_filings (filing_type);
CREATE INDEX IF NOT EXISTS idx_sec_filings_material ON sec_filings (is_material) WHERE is_material = TRUE;
CREATE INDEX IF NOT EXISTS idx_sec_filings_underlying ON sec_filings (underlying_id);
